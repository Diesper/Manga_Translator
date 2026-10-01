# Bíblia técnica — tests/unit/content-gemini/helpers-and-regressions-real.test.js

> **Estado documental:** 🟡 CORRIGIDA após ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** 65c66f1a756d127909ed6661386e72c19e3a3a2c  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de helpers e regressões reais do content Gemini  
> **Linhas textuais:** 683  
> **Posições documentais:** 684, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é um conjunto heterogêneo de regressões do content Gemini real: conversão data URL→File, espera de elementos, delays, visibilidade/seletores, wrappers de exclusão, guards de processGeminiJob e estratégias de preenchimento do prompt.

O loader executa content_gemini.js e os módulos Gemini associados. Isso dá força real aos helpers/exportações exercitados, mas não significa que todo arquivo externo citado pela arquitetura esteja presente no JSDOM — especialmente inject.js, que é a ponte MAIN-world de MANGA_TRANSLATOR_SET_PROMPT.

## 2. dataURLtoFile

CG-01/CG-02 provam a conversão nominal de Data URL para `File` com MIME correto em PNG/JPEG. CG-03/CG-04 provam a rejeição de Data URL sem vírgula ou sem MIME. A ausência das APIs File/atob já possui cobertura em job-runner.test.js e não é duplicada como gap nesta Bíblia.

## 3. waitForElement / sleep / helpers DOM

CG-05/06/07 cobrem elemento já existente, inserção tardia no DOM observado e timeout null. Os cenários seguintes congelam sleep e helpers de localização/visibilidade usados pelo runner.

O ponto não coberto é uma raiz Shadow DOM criada **depois** do MutationObserver começar: o helper consulta profundamente a cada mutation, mas o teste tardio atual usa DOM comum.

## 4. Guard de deleting_urls e wrappers de exclusão

A suíte prova que processGeminiJob encerra cedo quando a URL corrente está em deleting_urls, evitando reprocessar conversa em remoção. Também exercita wrappers de deleteCurrentConversation e o estado deletionInProgress; a semântica detalhada do controller é coberta em deletion.test.js (#176), portanto não é duplicada aqui.

## 5. Injeção de prompt: arquitetura atual

O job-runner atual primeiro dispara CustomEvent MANGA_TRANSLATOR_SET_PROMPT para a página e, depois, usa setPromptInEditor como fallback DOM/Quill no isolated world. Não existe document.execCommand no job-runner atual.

Alguns títulos históricos desta suíte ainda mencionam 'paste/execCommand'. Eles devem ser lidos como regressões antigas, não como prova de que execCommand continua no caminho de produção.

## 6. Limite do teste CG-23

CG-23 instala um listener de teste para MANGA_TRANSLATOR_SET_PROMPT, confirma o detail.prompt e observa que o fallback DOM altera o editor. Porém loadContentGeminiModule não carrega extension/content/inject.js. Assim, o teste prova **emissão do evento + fallback DOM**, mas não prova que a ponte MAIN-world real de inject.js recebeu o evento, encontrou rich-textarea/Quill e despachou beforeinput/input/change.

Não foi localizada outra suíte focal para inject.js nessa ponte.

## 7. Quill e fallback

Os cenários seguintes provam que o runner consegue preencher editor em ausência de Quill por setPromptInEditor e que os helpers continuam funcionando em fixtures simplificadas. O branch de Quill real no MAIN-world pertence a inject.js e fica separado da prova local do runner.

## 8. Evidência CI exata

O run 36521561968 no commit e720890cf34dc9437ee91f3b8172953497d69870 contém exatamente o blob 65c66f1a756d127909ed6661386e72c19e3a3a2c. Os 15 casos aparecem com ✓ em Node 20.x (109255348388) e Node 22.x (109255348406); global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 9. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| dataURL válida vira File | CG-01 | ✅ PROVADO DIRETAMENTE |
| dataURL sem vírgula/MIME falha | CG-03/CG-04 | ✅ PROVADO DIRETAMENTE |
| waitForElement imediato/tardio/timeout | CG-05/06/07 | ✅ PROVADO DIRETAMENTE |
| processGeminiJob respeita deleting_urls | regressão real | ✅ PROVADO DIRETAMENTE |
| wrappers de delete/export respondem | cenários reais | ✅ PROVADO DIRETAMENTE |
| CustomEvent MANGA_TRANSLATOR_SET_PROMPT é emitido | CG-23 | ✅ PROVADO DIRETAMENTE |
| fallback DOM do job-runner preenche editor | CG-23/24 | ✅ PROVADO DIRETAMENTE |
| inject.js MAIN-world reage ao evento | inject.js não é carregado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| document.execCommand participa do caminho atual | não existe no job-runner atual | ⚠️ CONTRATO HISTÓRICO/OBSOLETO |
| waitForElement encontra elemento em Shadow DOM criado após observer iniciar | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Solicitações ao auditor

### 179-001 — INTEGRATION_TEST_REQUIRED — SUPERSEDED → 050-001 — HIGH

Encontrado: CG-23 observa o CustomEvent MANGA_TRANSLATOR_SET_PROMPT com listener criado pelo próprio teste; loadContentGeminiModule não carrega extension/content/inject.js, que é a ponte MAIN-world real.

Evidência ausente: carregar inject.js em um contexto apropriado, disparar o evento real e verificar rich-textarea/Quill ou fallback paste + beforeinput/input/change no target, sem depender do setPromptInEditor posterior do job-runner.

Risco: a ponte MAIN-world pode quebrar enquanto CG-23 continua verde porque só comprova emissão do evento.

### 179-002 — TEST_MAINTENANCE — ACCEPTED — NORMAL

Encontrado: títulos/comentários REG-03/CG-22 e CG-24 ainda descrevem fallback paste/execCommand, mas o job-runner atual não contém document.execCommand. O fluxo atual é CustomEvent + setPromptInEditor DOM/Quill.

Ação pedida: atualizar nomenclatura e assertions para a arquitetura atual; se execCommand tiver sido intencionalmente removido, não mantê-lo como requisito implícito.

Risco: documentação de teste obsoleta pode induzir manutenção regressiva ou falsa leitura de cobertura.

### 179-003 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: waitForElement usa queryFirstDeep em cada mutation e pode alcançar Shadow DOM aberto, porém CG-06 adiciona elemento tardiamente apenas no DOM comum.

Evidência ausente: iniciar waitForElement, depois anexar host + shadowRoot + elemento alvo dentro do shadow; exigir resolução antes do timeout e cleanup do MutationObserver/timer.

Risco: regressão na travessia profunda durante DOM dinâmico do Gemini pode não ser detectada.

## 11. Fonte integral auditada

```javascript
const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');
const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');

function setWindowLocation(pathname = '/app/chat-1') {
    Object.defineProperty(window, 'location', {
        value: {
            pathname,
            href: `https://gemini.test${pathname}`,
            origin: 'https://gemini.test',
        },
        configurable: true,
        writable: true,
    });
}

function installDomApis() {
    if (typeof window.HTMLElement !== 'undefined' && typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {
        Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
            value: jest.fn(),
            configurable: true,
            writable: true,
        });
    }

    if (typeof window.PointerEvent !== 'function') window.PointerEvent = window.MouseEvent;
    if (typeof global.PointerEvent !== 'function') global.PointerEvent = window.PointerEvent;
    if (typeof global.File !== 'function') global.File = window.File;
    if (typeof global.Blob !== 'function') global.Blob = window.Blob;
    if (typeof global.FileReader !== 'function') global.FileReader = window.FileReader;

    if (typeof window.DataTransfer !== 'function') {
        class MockDataTransfer {
            constructor() {
                const items = [];
                items.add = (item) => items.push(item);
                this.items = items;
                this._data = new Map();
            }

            setData(type, value) {
                this._data.set(type, value);
            }

            getData(type) {
                return this._data.get(type) || '';
            }
        }

        window.DataTransfer = MockDataTransfer;
    }
    if (typeof global.DataTransfer !== 'function') global.DataTransfer = window.DataTransfer;

    if (typeof window.ClipboardEvent !== 'function') {
        class MockClipboardEvent extends window.Event {
            constructor(type, init = {}) {
                super(type, init);
                this.clipboardData = init.clipboardData || null;
            }
        }

        window.ClipboardEvent = MockClipboardEvent;
    }
    if (typeof global.ClipboardEvent !== 'function') global.ClipboardEvent = window.ClipboardEvent;

    if (typeof window.InputEvent !== 'function') window.InputEvent = window.Event;
    if (typeof global.InputEvent !== 'function') global.InputEvent = window.InputEvent;
    if (typeof global.atob !== 'function') {
        global.atob = (value) => Buffer.from(value, 'base64').toString('binary');
    }
}

function delay(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeout = 5000, step = 25 } = {}) {
    let elapsed = 0;
    while (elapsed <= timeout) {
        const result = await predicate();
        if (result) return result;
        await delay(step);
        elapsed += step;
    }
    throw new Error('Timeout aguardando condicao');
}

function mountGeminiEditor({
    sendMode = 'exact',
    promptPasteBehavior = 'insert',
    onSubmit = () => {},
} = {}) {
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"><p></p></div><div class="momentary-indicator">conversa momentânea</div>';

    const editor = document.querySelector('.ql-editor');
    editor.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 120,
        width: 640, height: 120, toJSON() { return this; },
    });
    editor.focus = jest.fn();
    editor.scrollIntoView = jest.fn();

    editor.addEventListener('paste', (event) => {
        const clipboardData = event.clipboardData;
        const pastedText = clipboardData && typeof clipboardData.getData === 'function'
            ? clipboardData.getData('text/plain')
            : '';

        if (pastedText) {
            if (promptPasteBehavior === 'insert') {
                const pTag = editor.querySelector('p') || editor;
                pTag.textContent = pastedText;
            }
            return;
        }

        if (clipboardData && clipboardData.items && clipboardData.items.length > 0) {
            let preview = document.querySelector('file-preview');
            if (!preview) {
                preview = document.createElement('file-preview');
                const thumbImg = document.createElement('img');
                thumbImg.src = 'blob:https://gemini.test/mock-attachment';
                Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });
                Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });
                Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });
                preview.getBoundingClientRect = () => ({
                    x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,
                    width: 120, height: 90, toJSON() { return this; },
                });
                preview.appendChild(thumbImg);
                document.body.appendChild(preview);
            }
        }
    });
    editor.addEventListener('drop', (event) => {
        const transfer = event.dataTransfer;
        if (!transfer?.items?.length || document.querySelector('file-preview')) return;
        const preview = document.createElement('file-preview');
        const thumbImg = document.createElement('img');
        thumbImg.src = 'blob:https://gemini.test/mock-attachment';
        Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });
        Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });
        Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });
        preview.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,
            width: 120, height: 90, toJSON() { return this; },
        });
        preview.appendChild(thumbImg);
        document.body.appendChild(preview);
    });

    editor.addEventListener('keydown', (event) => {
        if (sendMode === 'enter' && event.key === 'Enter') onSubmit();
    });

    let sendButton = null;
    if (sendMode !== 'enter') {
        sendButton = document.createElement('button');
        sendButton.setAttribute('aria-label', sendMode === 'fuzzy' ? 'enviar agora' : 'send message');
        sendButton.click = jest.fn(() => {
            editor.textContent = '';
            onSubmit();
        });
        sendButton.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: 40, bottom: 40,
            width: 40, height: 40, toJSON() { return this; },
        });
        document.body.appendChild(sendButton);
    }

    return { editor, sendButton };
}

function appendGeneratedImage(src, { width = 1024, height = 1536 } = {}) {
    const img = document.createElement('img');
    img.src = src;
    img.scrollIntoView = jest.fn();
    Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
    Object.defineProperty(img, 'complete', { value: true, configurable: true });
    const response = document.createElement('model-response');
    response.setAttribute('data-message-author', 'model');
    response.appendChild(img);
    document.body.appendChild(response);
    return img;
}

describe('content_gemini.js - helpers, delecao e regressao real', () => {
    let runtimeMock;
    let storageMock;
    let sentMessages;
    let originalSendMessage;
    let originalFetch;
    let processPromises;

    beforeEach(async () => {
        jest.resetModules();
        installDomApis();
        jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
            x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,
            width: 160, height: 48, toJSON() { return this; },
        }));
        setWindowLocation('/app/chat-1');

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        originalSendMessage = runtimeMock.sendMessage;
        originalFetch = global.fetch;
        sentMessages = [];
        processPromises = [];

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;

        document.documentElement.innerHTML = '<head></head><body></body>';
        if (typeof document.execCommand !== 'function') {
            document.execCommand = () => false;
        }
        await storageMock.clear();
    });

    afterEach(async () => {
        const activeObserver = window.__mangaTranslatorActiveGeminiObserver;
        if (activeObserver && typeof activeObserver.stop === 'function') {
            try { activeObserver.stop(); } catch (_error) {}
        }
        delete window.__mangaTranslatorActiveGeminiObserver;

        const observerRegistry = window.__mtGeminiObservers;
        if (observerRegistry && typeof observerRegistry === 'object') {
            for (const observer of Object.values(observerRegistry)) {
                if (observer && typeof observer.stop === 'function') {
                    try { observer.stop(); } catch (_error) {}
                }
            }
        }
        delete window.__mtGeminiObservers;

        if (processPromises.length) {
            await Promise.allSettled(processPromises);
        }

        runtimeMock.sendMessage = originalSendMessage;
        global.fetch = originalFetch;
        jest.restoreAllMocks();
        document.documentElement.innerHTML = '<head></head><body></body>';
        await storageMock.clear();
    });

    function installResponder(responders = {}) {
        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);
            const responder = responders[message.action];
            if (typeof callback === 'function') {
                setTimeout(() => callback(responder ? responder(message) : undefined), 0);
            }
        });
    }

    test('CG-01/CG-02: dataURLtoFile cria File com MIME correto para PNG e JPEG', () => {
        const mod = loadContentGeminiModule();

        const png = mod.dataURLtoFile('data:image/png;base64,QUJDRA==', 'page.png');
        const jpg = mod.dataURLtoFile('data:image/jpeg;base64,QUJDRA==', 'page.jpg');

        expect(png).toBeInstanceOf(File);
        expect(png.type).toBe('image/png');
        expect(png.size).toBeGreaterThan(0);
        expect(jpg.type).toBe('image/jpeg');
    });

    test('CG-03/CG-04: dataURLtoFile rejeita dataURL sem virgula ou sem MIME', () => {
        const mod = loadContentGeminiModule();

        expect(() => mod.dataURLtoFile('data:image/png;base64QUJDRA==', 'broken.png')).toThrow('dataURL malformada: sem vírgula');
        expect(() => mod.dataURLtoFile('data:;base64,QUJDRA==', 'broken.png')).toThrow('dataURL malformada: MIME não encontrado');
    });

    test('CG-05/CG-06/CG-07: waitForElement resolve imediato, resolve tardio e retorna null no timeout', async () => {
        const mod = loadContentGeminiModule();

        document.body.innerHTML = '<div class="already-here"></div>';
        await expect(mod.waitForElement('.already-here', 50)).resolves.toBe(document.querySelector('.already-here'));

        setTimeout(() => {
            const late = document.createElement('span');
            late.className = 'late-node';
            document.body.appendChild(late);
        }, 120);

        const lateEl = await mod.waitForElement('.late-node', 600);
        expect(lateEl).toBe(document.querySelector('.late-node'));
        await expect(mod.waitForElement('.never-here', 120)).resolves.toBeNull();
    });

    test('CG-08: sleep resolve apenas depois do tempo solicitado', async () => {
        jest.useFakeTimers();
        const mod = loadContentGeminiModule();
        const marker = jest.fn();

        const pending = mod.sleep(100).then(marker);
        await jest.advanceTimersByTimeAsync(99);
        expect(marker).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1);
        await pending;

        expect(marker).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    test('REG-03/CG-22: paste valido nao chama execCommand em duplicidade', async () => {
        mountGeminiEditor({
            sendMode: 'exact',
            promptPasteBehavior: 'insert',
            onSubmit: () => {
                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-reg-03.png'), 1300);
            },
        });

        await storageMock.set({
            gemini_job_321: {
                jobId: 'job-321',
                batchId: 'batch-test',
                mangaTabId: 77,
                index: 4,
                prompt: 'Traduzir sem duplicar texto',
            },
        });

        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),
        });

        const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);
        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        await waitFor(() => (
            document.querySelector('.ql-editor')
            && document.querySelector('.ql-editor').textContent.includes('Traduzir sem duplicar texto')
        ));

        expect(execCommandSpy).not.toHaveBeenCalled();
    });

    test('CG-23: usa evento MAIN world e fallback DOM quando o paste nao injeta o prompt', async () => {
        const { editor } = mountGeminiEditor({
            sendMode: 'exact',
            promptPasteBehavior: 'ignore',
            onSubmit: () => {
                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-exec-command.png'), 1300);
            },
        });

        await storageMock.set({
            gemini_job_321: {
                jobId: 'job-321',
                batchId: 'batch-test',
                mangaTabId: 77,
                index: 9,
                prompt: 'Traduzir usando fallback DOM',
            },
        });

        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),
        });

        let customEventDetail = null;
        const setPromptListener = (e) => { customEventDetail = e.detail; };
        window.addEventListener('MANGA_TRANSLATOR_SET_PROMPT', setPromptListener);

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const promptWasInserted = await waitFor(() => (
            document.querySelector('.ql-editor')
            && document.querySelector('.ql-editor').textContent.includes('Traduzir usando fallback DOM')
        ));
        await waitFor(() => !editor.textContent.includes('Traduzir usando fallback DOM'));
        window.removeEventListener('MANGA_TRANSLATOR_SET_PROMPT', setPromptListener);

        expect(promptWasInserted).toBeTruthy();
        expect(customEventDetail).toEqual({ prompt: 'Traduzir usando fallback DOM' });
        // Após o envio bem-sucedido, o Gemini consome/limpa o conteúdo do editor.
        expect(editor.textContent).not.toContain('Traduzir usando fallback DOM');
    });

    test('CG-24: usa fallback DOM direto quando paste e execCommand falham', async () => {
        mountGeminiEditor({
            sendMode: 'exact',
            promptPasteBehavior: 'ignore',
            onSubmit: () => {
                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-dom-direct.png'), 1300);
            },
        });

        await storageMock.set({
            gemini_job_321: {
                jobId: 'job-321',
                batchId: 'batch-test',
                mangaTabId: 77,
                index: 11,
                prompt: 'Traduzir via fallback DOM',
            },
        });

        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),
        });

        jest.spyOn(document, 'execCommand').mockReturnValue(false);

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        await waitFor(() => (
            document.querySelector('.ql-editor')
            && document.querySelector('.ql-editor').textContent.includes('Traduzir via fallback DOM')
        ));

        expect(document.querySelector('.ql-editor').textContent).toContain('Traduzir via fallback DOM');
    });

    test('CG-14: nao processa job quando a URL atual esta em deleting_urls', async () => {
        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';
        await storageMock.set({
            gemini_job_321: {
                jobId: 'job-321',
                batchId: 'batch-test',
                mangaTabId: 77,
                index: 2,
                prompt: 'Nao deve rodar',
            },
            deleting_urls: ['https://gemini.test/app/chat-1'],
        });

        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());
        await delay(100);

        expect(sentMessages.some((message) => message.action === 'REQUEST_IMAGE_DATA')).toBe(false);
        expect(sentMessages.some((message) => message.action === 'GEMINI_ERROR')).toBe(false);
    });

    test('CG-45: deleteCurrentConversation recusa apagar item selecionado sem link do chat atual', async () => {
        document.body.innerHTML = `
            <div aria-selected="true" id="selected-row">
                <button id="selected-options" aria-haspopup="menu">...</button>
            </div>
            <div id="delete-item" role="menuitem">Excluir conversa</div>
            <button id="confirm-delete">Excluir</button>
        `;

        const optionsBtn = document.getElementById('selected-options');
        const deleteItem = document.getElementById('delete-item');
        const confirmBtn = document.getElementById('confirm-delete');

        optionsBtn.scrollIntoView = jest.fn();
        optionsBtn.click = jest.fn();
        deleteItem.click = jest.fn();
        confirmBtn.click = jest.fn();

        await storageMock.set({ debugMode: false });
        installResponder();

        const mod = loadContentGeminiModule();
        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);

        expect(optionsBtn.click).not.toHaveBeenCalled();
        expect(deleteItem.click).not.toHaveBeenCalled();
        expect(confirmBtn.click).not.toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({ action: 'LOG_ENTRY', action_name: 'DELETE_ERROR' }));
    });

    test('CG-46: deleteCurrentConversation recusa heuristica generica da sidebar sem link do chat atual', async () => {
        document.body.innerHTML = `
            <nav>
                <button id="sidebar-menu">
                    <svg><path></path><path></path><circle></circle></svg>
                </button>
            </nav>
            <div id="delete-item" role="menuitem">Delete conversation</div>
            <button id="confirm-delete">Confirm delete</button>
        `;

        const optionsBtn = document.getElementById('sidebar-menu');
        const deleteItem = document.getElementById('delete-item');
        const confirmBtn = document.getElementById('confirm-delete');

        optionsBtn.scrollIntoView = jest.fn();
        optionsBtn.click = jest.fn();
        deleteItem.click = jest.fn();
        confirmBtn.click = jest.fn();

        await storageMock.set({ debugMode: false });
        installResponder();

        const mod = loadContentGeminiModule();
        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);

        // Um botão genérico sem data-test-id/aria-label não é evidência suficiente
        // de que seja o toggle da sidebar. A deleção não pode clicar por heurística.
        expect(optionsBtn.click).not.toHaveBeenCalled();
        expect(deleteItem.click).not.toHaveBeenCalled();
        expect(confirmBtn.click).not.toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({ action: 'LOG_ENTRY', action_name: 'DELETE_ERROR' }));
    });

    test('CG-50: deleteCurrentConversation falha sem confirmação e não clica fora do modal', async () => {
        document.body.innerHTML = `
            <div id="conversation-row">
                <a href="/app/chat-1">Conversa atual</a>
                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>
            </div>
            <div id="delete-item" role="menuitem">Excluir</div>
        `;

        const optionsBtn = document.getElementById('options-btn');
        const deleteItem = document.getElementById('delete-item');
        const bodyClickSpy = jest.spyOn(document.body, 'click');

        optionsBtn.scrollIntoView = jest.fn();
        optionsBtn.click = jest.fn();
        deleteItem.click = jest.fn();

        await storageMock.set({ debugMode: false });
        installResponder();

        const mod = loadContentGeminiModule();
        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);

        expect(deleteItem.click).toHaveBeenCalled();
        expect(bodyClickSpy).not.toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'DELETE_ERROR',
        }));
    });

    test('deleteCurrentConversation aguarda menu e confirmacao renderizados com atraso no Gemini', async () => {
        document.body.innerHTML = `
            <div id="conversation-row">
                <a href="/app/chat-1">Conversa atual</a>
                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>
            </div>
        `;

        const optionsBtn = document.getElementById('options-btn');
        optionsBtn.scrollIntoView = jest.fn();
        optionsBtn.click = jest.fn(() => {
            setTimeout(() => {
                const deleteItem = document.createElement('button');
                deleteItem.id = 'delete-item';
                deleteItem.setAttribute('role', 'menuitem');
                deleteItem.textContent = 'Excluir';
                deleteItem.click = jest.fn(() => {
                    setTimeout(() => {
                        const dialog = document.createElement('div');
                        dialog.setAttribute('role', 'dialog');
                        const confirm = document.createElement('button');
                        confirm.id = 'confirm-delete';
                        confirm.textContent = 'Excluir';
                        confirm.click = jest.fn(() => {
                            document.getElementById('conversation-row')?.remove();
                            window.location.pathname = '/app';
                        });
                        dialog.appendChild(confirm);
                        document.body.appendChild(dialog);
                    }, 350);
                });
                document.body.appendChild(deleteItem);
            }, 350);
        });

        await storageMock.set({ debugMode: false });
        installResponder();

        const mod = loadContentGeminiModule();
        await mod.deleteCurrentConversation();

        expect(optionsBtn.click).toHaveBeenCalled();
        expect(document.getElementById('delete-item').click).toHaveBeenCalled();
        expect(document.getElementById('confirm-delete').click).toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'DELETE_OK',
        }));
    });

    test('deleteCurrentConversation falha sem item exato de exclusão e não clica fora do menu', async () => {
        document.body.innerHTML = `
            <div id="conversation-row">
                <a href="/app/chat-1">Conversa atual</a>
                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>
            </div>
            <div role="menuitem">Compartilhar</div>
        `;

        const optionsBtn = document.getElementById('options-btn');
        const bodyClickSpy = jest.spyOn(document.body, 'click');

        optionsBtn.scrollIntoView = jest.fn();
        optionsBtn.click = jest.fn();

        await storageMock.set({ debugMode: false });
        installResponder();

        const mod = loadContentGeminiModule();
        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);

        expect(optionsBtn.click).toHaveBeenCalled();
        expect(bodyClickSpy).not.toHaveBeenCalled();
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'DELETE_ERROR',
        }));
    });

    test('CG-47: deleteCurrentConversation falha quando o chat exato não tem botão de opções', async () => {
        document.body.innerHTML = '<div><a href="/app/chat-1">Conversa atual</a></div>';
        await storageMock.set({ debugMode: false });
        installResponder();

        const mod = loadContentGeminiModule();
        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);

        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'DELETE_ERROR',
        }));
    });

    test('CG-42/CG-51: deleteCurrentConversation protege contra reentrada concorrente e reseta o guard', async () => {
        document.body.innerHTML = `
            <div id="conversation-row">
                <a href="/app/chat-1">Conversa atual</a>
                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>
            </div>
            <div id="delete-item" role="menuitem">Excluir</div>
            <button id="confirm-delete">Excluir</button>
        `;

        const optionsBtn = document.getElementById('options-btn');
        const deleteItem = document.getElementById('delete-item');
        const confirmBtn = document.getElementById('confirm-delete');

        optionsBtn.scrollIntoView = jest.fn();
        optionsBtn.click = jest.fn();
        deleteItem.click = jest.fn();
        confirmBtn.click = jest.fn(() => {
            document.getElementById('conversation-row')?.remove();
            window.location.pathname = '/app';
        });

        await storageMock.set({ debugMode: false });
        installResponder();

        const mod = loadContentGeminiModule();
        const p1 = mod.deleteCurrentConversation();
        const p2 = mod.deleteCurrentConversation();

        await Promise.all([p1, p2]);

        expect(optionsBtn.click).toHaveBeenCalledTimes(1);
        expect(deleteItem.click).toHaveBeenCalledTimes(1);
        expect(confirmBtn.click).toHaveBeenCalledTimes(1);
        expect(mod.__getDeletionInProgress()).toBe(false);
    });
});

```

## 12. Auditoria linha a linha

### Linha 001

- **Código:** `const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');`
- **Função:** Ativa strict mode.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** `const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 003

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** `function setWindowLocation(pathname = '/app/chat-1') {`
- **Função:** Controla pathname/search/href do Gemini.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `    Object.defineProperty(window, 'location', {`
- **Função:** Importa mocks/helpers compartilhados do harness Gemini.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 006

- **Código:** `        value: {`
- **Função:** Importa mocks/helpers compartilhados do harness Gemini.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 007

- **Código:** `            pathname,`
- **Função:** Importa mocks/helpers compartilhados do harness Gemini.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 008

- **Código:** `            href: &#96;https://gemini.test${pathname}&#96;,`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 009

- **Código:** `            origin: 'https://gemini.test',`
- **Função:** Resolve o caminho do content_gemini real e define loader completo dos módulos Gemini.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `        },`
- **Função:** Resolve o caminho do content_gemini real e define loader completo dos módulos Gemini.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `        configurable: true,`
- **Função:** Resolve o caminho do content_gemini real e define loader completo dos módulos Gemini.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `        writable: true,`
- **Função:** Resolve o caminho do content_gemini real e define loader completo dos módulos Gemini.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `function installDomApis() {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `    if (typeof window.HTMLElement !== 'undefined' && typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `        Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `            value: jest.fn(),`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `            configurable: true,`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `            writable: true,`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `    if (typeof window.PointerEvent !== 'function') window.PointerEvent = window.MouseEvent;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `    if (typeof global.PointerEvent !== 'function') global.PointerEvent = window.PointerEvent;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `    if (typeof global.File !== 'function') global.File = window.File;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `    if (typeof global.Blob !== 'function') global.Blob = window.Blob;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    if (typeof global.FileReader !== 'function') global.FileReader = window.FileReader;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `    if (typeof window.DataTransfer !== 'function') {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `        class MockDataTransfer {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `            constructor() {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `                const items = [];`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `                items.add = (item) => items.push(item);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `                this.items = items;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `                this._data = new Map();`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `            setData(type, value) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `                this._data.set(type, value);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `            getData(type) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `                return this._data.get(type) || '';`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `        window.DataTransfer = MockDataTransfer;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `    if (typeof global.DataTransfer !== 'function') global.DataTransfer = window.DataTransfer;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `    if (typeof window.ClipboardEvent !== 'function') {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `        class MockClipboardEvent extends window.Event {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `            constructor(type, init = {}) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `                super(type, init);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `                this.clipboardData = init.clipboardData || null;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `        window.ClipboardEvent = MockClipboardEvent;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `    if (typeof global.ClipboardEvent !== 'function') global.ClipboardEvent = window.ClipboardEvent;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `    if (typeof window.InputEvent !== 'function') window.InputEvent = window.Event;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `    if (typeof global.InputEvent !== 'function') global.InputEvent = window.InputEvent;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `    if (typeof global.atob !== 'function') {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `        global.atob = (value) => Buffer.from(value, 'base64').toString('binary');`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `function delay(ms = 0) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `    return new Promise((resolve) => setTimeout(resolve, ms));`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `async function waitFor(predicate, { timeout = 5000, step = 25 } = {}) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `    let elapsed = 0;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `    while (elapsed <= timeout) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `        const result = await predicate();`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `        if (result) return result;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `        await delay(step);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** `        elapsed += step;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `    throw new Error('Timeout aguardando condicao');`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `function mountGeminiEditor({`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `    sendMode = 'exact',`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `    promptPasteBehavior = 'insert',`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `    onSubmit = () => {},`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `} = {}) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"><p></p></div><div class="momentary-indicator">conversa momentânea</div>';`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `    const editor = document.querySelector('.ql-editor');`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `    editor.getBoundingClientRect = () => ({`
- **Função:** Fornece geometria determinística para visibilidade.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `        x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 120,`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `        width: 640, height: 120, toJSON() { return this; },`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `    editor.focus = jest.fn();`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `    editor.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** `    editor.addEventListener('paste', (event) => {`
- **Função:** Referência a fallback de paste/ponte; no teste, inject.js não é carregado, então a ponte MAIN-world não é exercitada.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `        const clipboardData = event.clipboardData;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `        const pastedText = clipboardData && typeof clipboardData.getData === 'function'`
- **Função:** Referência a fallback de paste/ponte; no teste, inject.js não é carregado, então a ponte MAIN-world não é exercitada.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `            ? clipboardData.getData('text/plain')`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `            : '';`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `        if (pastedText) {`
- **Função:** Referência a fallback de paste/ponte; no teste, inject.js não é carregado, então a ponte MAIN-world não é exercitada.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** `            if (promptPasteBehavior === 'insert') {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `                const pTag = editor.querySelector('p') || editor;`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `                pTag.textContent = pastedText;`
- **Função:** Referência a fallback de paste/ponte; no teste, inject.js não é carregado, então a ponte MAIN-world não é exercitada.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `            return;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `        if (clipboardData && clipboardData.items && clipboardData.items.length > 0) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `            let preview = document.querySelector('file-preview');`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `            if (!preview) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `                preview = document.createElement('file-preview');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `                const thumbImg = document.createElement('img');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `                thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `                Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `                Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `                Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** `                preview.getBoundingClientRect = () => ({`
- **Função:** Fornece geometria determinística para visibilidade.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 126

- **Código:** `                    x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** `                    width: 120, height: 90, toJSON() { return this; },`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `                });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `                preview.appendChild(thumbImg);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** `                document.body.appendChild(preview);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** `    editor.addEventListener('drop', (event) => {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `        const transfer = event.dataTransfer;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** `        if (!transfer?.items?.length || document.querySelector('file-preview')) return;`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `        const preview = document.createElement('file-preview');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `        const thumbImg = document.createElement('img');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `        thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `        Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `        Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `        Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `        preview.getBoundingClientRect = () => ({`
- **Função:** Fornece geometria determinística para visibilidade.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `            width: 120, height: 90, toJSON() { return this; },`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** `        preview.appendChild(thumbImg);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `        document.body.appendChild(preview);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 149

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 150

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** `    editor.addEventListener('keydown', (event) => {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `        if (sendMode === 'enter' && event.key === 'Enter') onSubmit();`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `    let sendButton = null;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `    if (sendMode !== 'enter') {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `        sendButton = document.createElement('button');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `        sendButton.setAttribute('aria-label', sendMode === 'fuzzy' ? 'enviar agora' : 'send message');`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `        sendButton.click = jest.fn(() => {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `            editor.textContent = '';`
- **Função:** Observa estado final do editor após tentativa de injeção.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `            onSubmit();`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `        sendButton.getBoundingClientRect = () => ({`
- **Função:** Fornece geometria determinística para visibilidade.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 40, bottom: 40,`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `            width: 40, height: 40, toJSON() { return this; },`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `        document.body.appendChild(sendButton);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `    return { editor, sendButton };`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `function appendGeneratedImage(src, { width = 1024, height = 1536 } = {}) {`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** `    const img = document.createElement('img');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 175

- **Código:** `    img.src = src;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** `    img.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 177

- **Código:** `    Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** `    Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 179

- **Código:** `    Object.defineProperty(img, 'complete', { value: true, configurable: true });`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** `    const response = document.createElement('model-response');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** `    response.setAttribute('data-message-author', 'model');`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `    response.appendChild(img);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `    document.body.appendChild(response);`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `    return img;`
- **Função:** Compõe o cenário helpers, fixtures e setup pré-suite, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers, fixtures e setup pré-suite.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `describe('content_gemini.js - helpers, delecao e regressao real', () => {`
- **Função:** Abre suíte de helpers e regressões reais do content Gemini.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 188

- **Código:** `    let runtimeMock;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `    let storageMock;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 190

- **Código:** `    let sentMessages;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 191

- **Código:** `    let originalSendMessage;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** `    let originalFetch;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `    let processPromises;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `    beforeEach(async () => {`
- **Função:** Reseta módulos, DOM, runtime, storage e sentinelas.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 196

- **Código:** `        jest.resetModules();`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `        installDomApis();`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 198

- **Código:** `        jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({`
- **Função:** Fornece geometria determinística para visibilidade.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 199

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 200

- **Código:** `            width: 160, height: 48, toJSON() { return this; },`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 201

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 202

- **Código:** `        setWindowLocation('/app/chat-1');`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 203

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 204

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:** Obtém runtime mock usado para mensagens e lastError.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 205

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Obtém storage mock usado por delete/recovery/configuração.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `        originalSendMessage = runtimeMock.sendMessage;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 207

- **Código:** `        originalFetch = global.fetch;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 208

- **Código:** `        sentMessages = [];`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 209

- **Código:** `        processPromises = [];`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 211

- **Código:** `        runtimeMock._messageListeners = [];`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 212

- **Código:** `        runtimeMock._connectListeners = [];`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 213

- **Código:** `        runtimeMock.lastError = null;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 214

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 215

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 216

- **Código:** `        if (typeof document.execCommand !== 'function') {`
- **Função:** Referência histórica no título/comentário; o job-runner atual não usa document.execCommand.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nomenclatura histórica; não existe chamada document.execCommand no job-runner atual.

### Linha 217

- **Código:** `            document.execCommand = () => false;`
- **Função:** Referência histórica no título/comentário; o job-runner atual não usa document.execCommand.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nomenclatura histórica; não existe chamada document.execCommand no job-runner atual.

### Linha 218

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 219

- **Código:** `        await storageMock.clear();`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 220

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 222

- **Código:** `    afterEach(async () => {`
- **Função:** Restaura mocks/timers/DOM e limpa storage.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 223

- **Código:** `        const activeObserver = window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 224

- **Código:** `        if (activeObserver && typeof activeObserver.stop === 'function') {`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 225

- **Código:** `            try { activeObserver.stop(); } catch (_error) {}`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 226

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `        delete window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 228

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 229

- **Código:** `        const observerRegistry = window.__mtGeminiObservers;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 230

- **Código:** `        if (observerRegistry && typeof observerRegistry === 'object') {`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 231

- **Código:** `            for (const observer of Object.values(observerRegistry)) {`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 232

- **Código:** `                if (observer && typeof observer.stop === 'function') {`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 233

- **Código:** `                    try { observer.stop(); } catch (_error) {}`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 234

- **Código:** `                }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 235

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 236

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 237

- **Código:** `        delete window.__mtGeminiObservers;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 239

- **Código:** `        if (processPromises.length) {`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 240

- **Código:** `            await Promise.allSettled(processPromises);`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 241

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 242

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 243

- **Código:** `        runtimeMock.sendMessage = originalSendMessage;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 244

- **Código:** `        global.fetch = originalFetch;`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 246

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** `        await storageMock.clear();`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 248

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 250

- **Código:** `    function installResponder(responders = {}) {`
- **Função:** Instala responder assíncrono de chrome.runtime.sendMessage e coleta requests.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 251

- **Código:** `        runtimeMock.sendMessage = jest.fn((message, callback) => {`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 252

- **Código:** `            sentMessages.push(message);`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** `            const responder = responders[message.action];`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 254

- **Código:** `            if (typeof callback === 'function') {`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 255

- **Código:** `                setTimeout(() => callback(responder ? responder(message) : undefined), 0);`
- **Função:** Compõe o cenário describe/setup da suíte antes dos casos focais, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 256

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 257

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 258

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 259

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** describe/setup da suíte antes dos casos focais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 260

- **Código:** `    test('CG-01/CG-02: dataURLtoFile cria File com MIME correto para PNG e JPEG', () => {`
- **Função:** Declara o cenário real `CG-01/CG-02: dataURLtoFile cria File com MIME correto para PNG e JPEG`.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 261

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 262

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 263

- **Código:** `        const png = mod.dataURLtoFile('data:image/png;base64,QUJDRA==', 'page.png');`
- **Função:** Executa/congela conversão real data URL → File e valida entradas malformadas.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 264

- **Código:** `        const jpg = mod.dataURLtoFile('data:image/jpeg;base64,QUJDRA==', 'page.jpg');`
- **Função:** Executa/congela conversão real data URL → File e valida entradas malformadas.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 265

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 266

- **Código:** `        expect(png).toBeInstanceOf(File);`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 267

- **Código:** `        expect(png.type).toBe('image/png');`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 268

- **Código:** `        expect(png.size).toBeGreaterThan(0);`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 269

- **Código:** `        expect(jpg.type).toBe('image/jpeg');`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 270

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 271

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 272

- **Código:** `    test('CG-03/CG-04: dataURLtoFile rejeita dataURL sem virgula ou sem MIME', () => {`
- **Função:** Declara o cenário real `CG-03/CG-04: dataURLtoFile rejeita dataURL sem virgula ou sem MIME`.
- **Contexto:** CG-03/CG-04 — dataURL inválida sem vírgula/MIME.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 273

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-03/CG-04 — dataURL inválida sem vírgula/MIME.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 274

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-03/CG-04 — dataURL inválida sem vírgula/MIME.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 275

- **Código:** `        expect(() => mod.dataURLtoFile('data:image/png;base64QUJDRA==', 'broken.png')).toThrow('dataURL malformada: sem vírgula');`
- **Função:** Executa/congela conversão real data URL → File e valida entradas malformadas.
- **Contexto:** CG-03/CG-04 — dataURL inválida sem vírgula/MIME.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 276

- **Código:** `        expect(() => mod.dataURLtoFile('data:;base64,QUJDRA==', 'broken.png')).toThrow('dataURL malformada: MIME não encontrado');`
- **Função:** Executa/congela conversão real data URL → File e valida entradas malformadas.
- **Contexto:** CG-03/CG-04 — dataURL inválida sem vírgula/MIME.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 277

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-03/CG-04 — dataURL inválida sem vírgula/MIME.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 278

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-03/CG-04 — dataURL inválida sem vírgula/MIME.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 279

- **Código:** `    test('CG-05/CG-06/CG-07: waitForElement resolve imediato, resolve tardio e retorna null no timeout', async () => {`
- **Função:** Declara o cenário real `CG-05/CG-06/CG-07: waitForElement resolve imediato, resolve tardio e retorna null no timeout`.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 280

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 281

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 282

- **Código:** `        document.body.innerHTML = '<div class="already-here"></div>';`
- **Função:** Compõe o cenário CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 283

- **Código:** `        await expect(mod.waitForElement('.already-here', 50)).resolves.toBe(document.querySelector('.already-here'));`
- **Função:** Executa helper real que consulta DOM profundamente e aguarda MutationObserver/timeout.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 284

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 285

- **Código:** `        setTimeout(() => {`
- **Função:** Compõe o cenário CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 286

- **Código:** `            const late = document.createElement('span');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 287

- **Código:** `            late.className = 'late-node';`
- **Função:** Compõe o cenário CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 288

- **Código:** `            document.body.appendChild(late);`
- **Função:** Compõe o cenário CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 289

- **Código:** `        }, 120);`
- **Função:** Compõe o cenário CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 290

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 291

- **Código:** `        const lateEl = await mod.waitForElement('.late-node', 600);`
- **Função:** Executa helper real que consulta DOM profundamente e aguarda MutationObserver/timeout.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 292

- **Código:** `        expect(lateEl).toBe(document.querySelector('.late-node'));`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 293

- **Código:** `        await expect(mod.waitForElement('.never-here', 120)).resolves.toBeNull();`
- **Função:** Executa helper real que consulta DOM profundamente e aguarda MutationObserver/timeout.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 294

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 295

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 296

- **Código:** `    test('CG-08: sleep resolve apenas depois do tempo solicitado', async () => {`
- **Função:** Declara o cenário real `CG-08: sleep resolve apenas depois do tempo solicitado`.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 297

- **Código:** `        jest.useFakeTimers();`
- **Função:** Compõe o cenário CG-08 — sleep com fake timers, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 298

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 299

- **Código:** `        const marker = jest.fn();`
- **Função:** Compõe o cenário CG-08 — sleep com fake timers, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 300

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 301

- **Código:** `        const pending = mod.sleep(100).then(marker);`
- **Função:** Exercita helper de atraso assíncrono.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 302

- **Código:** `        await jest.advanceTimersByTimeAsync(99);`
- **Função:** Compõe o cenário CG-08 — sleep com fake timers, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 303

- **Código:** `        expect(marker).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 304

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 305

- **Código:** `        await jest.advanceTimersByTimeAsync(1);`
- **Função:** Compõe o cenário CG-08 — sleep com fake timers, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 306

- **Código:** `        await pending;`
- **Função:** Compõe o cenário CG-08 — sleep com fake timers, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 307

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 308

- **Código:** `        expect(marker).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 309

- **Código:** `        jest.useRealTimers();`
- **Função:** Compõe o cenário CG-08 — sleep com fake timers, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 310

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 311

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-08 — sleep com fake timers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 312

- **Código:** `    test('REG-03/CG-22: paste valido nao chama execCommand em duplicidade', async () => {`
- **Função:** Declara o cenário real `REG-03/CG-22: paste valido nao chama execCommand em duplicidade`.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nomenclatura histórica; não existe chamada document.execCommand no job-runner atual.

### Linha 313

- **Código:** `        mountGeminiEditor({`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 314

- **Código:** `            sendMode: 'exact',`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 315

- **Código:** `            promptPasteBehavior: 'insert',`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 316

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 317

- **Código:** `                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-reg-03.png'), 1300);`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 318

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 319

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 320

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 321

- **Código:** `        await storageMock.set({`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 322

- **Código:** `            gemini_job_321: {`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 323

- **Código:** `                jobId: 'job-321',`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 324

- **Código:** `                batchId: 'batch-test',`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 325

- **Código:** `                mangaTabId: 77,`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 326

- **Código:** `                index: 4,`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 327

- **Código:** `                prompt: 'Traduzir sem duplicar texto',`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 328

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 329

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 330

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 331

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 332

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 333

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 334

- **Código:** `            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 335

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 336

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 337

- **Código:** `        const execCommandSpy = jest.spyOn(document, 'execCommand').mockReturnValue(true);`
- **Função:** Referência histórica no título/comentário; o job-runner atual não usa document.execCommand.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nomenclatura histórica; não existe chamada document.execCommand no job-runner atual.

### Linha 338

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 339

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Executa pipeline real de job Gemini até o guard/caminho focal.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 340

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 341

- **Código:** `        await waitFor(() => (`
- **Função:** Compõe o cenário REG-03/CG-22 — regressão de prompt/paste sem duplicidade, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 342

- **Código:** `            document.querySelector('.ql-editor')`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 343

- **Código:** `            && document.querySelector('.ql-editor').textContent.includes('Traduzir sem duplicar texto')`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 344

- **Código:** `        ));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 345

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 346

- **Código:** `        expect(execCommandSpy).not.toHaveBeenCalled();`
- **Função:** Referência histórica no título/comentário; o job-runner atual não usa document.execCommand.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 347

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 348

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** REG-03/CG-22 — regressão de prompt/paste sem duplicidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 349

- **Código:** `    test('CG-23: usa evento MAIN world e fallback DOM quando o paste nao injeta o prompt', async () => {`
- **Função:** Declara o cenário real `CG-23: usa evento MAIN world e fallback DOM quando o paste nao injeta o prompt`.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 350

- **Código:** `        const { editor } = mountGeminiEditor({`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 351

- **Código:** `            sendMode: 'exact',`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 352

- **Código:** `            promptPasteBehavior: 'ignore',`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 353

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 354

- **Código:** `                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-exec-command.png'), 1300);`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 355

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 356

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 357

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 358

- **Código:** `        await storageMock.set({`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 359

- **Código:** `            gemini_job_321: {`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 360

- **Código:** `                jobId: 'job-321',`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 361

- **Código:** `                batchId: 'batch-test',`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 362

- **Código:** `                mangaTabId: 77,`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 363

- **Código:** `                index: 9,`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 364

- **Código:** `                prompt: 'Traduzir usando fallback DOM',`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 365

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 366

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 367

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 368

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 369

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 370

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 371

- **Código:** `            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 372

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 373

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 374

- **Código:** `        let customEventDetail = null;`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 375

- **Código:** `        const setPromptListener = (e) => { customEventDetail = e.detail; };`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 376

- **Código:** `        window.addEventListener('MANGA_TRANSLATOR_SET_PROMPT', setPromptListener);`
- **Função:** Emite/observa o CustomEvent usado como ponte para o MAIN world.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 377

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 378

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 379

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Executa pipeline real de job Gemini até o guard/caminho focal.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 380

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 381

- **Código:** `        const promptWasInserted = await waitFor(() => (`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 382

- **Código:** `            document.querySelector('.ql-editor')`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 383

- **Código:** `            && document.querySelector('.ql-editor').textContent.includes('Traduzir usando fallback DOM')`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 384

- **Código:** `        ));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 385

- **Código:** `        await waitFor(() => !editor.textContent.includes('Traduzir usando fallback DOM'));`
- **Função:** Observa estado final do editor após tentativa de injeção.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 386

- **Código:** `        window.removeEventListener('MANGA_TRANSLATOR_SET_PROMPT', setPromptListener);`
- **Função:** Emite/observa o CustomEvent usado como ponte para o MAIN world.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 387

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 388

- **Código:** `        expect(promptWasInserted).toBeTruthy();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 389

- **Código:** `        expect(customEventDetail).toEqual({ prompt: 'Traduzir usando fallback DOM' });`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 390

- **Código:** `        // Após o envio bem-sucedido, o Gemini consome/limpa o conteúdo do editor.`
- **Função:** Compõe o cenário CG-23 — CustomEvent MAIN world + fallback DOM, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 391

- **Código:** `        expect(editor.textContent).not.toContain('Traduzir usando fallback DOM');`
- **Função:** Observa estado final do editor após tentativa de injeção.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 392

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 393

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-23 — CustomEvent MAIN world + fallback DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 394

- **Código:** `    test('CG-24: usa fallback DOM direto quando paste e execCommand falham', async () => {`
- **Função:** Declara o cenário real `CG-24: usa fallback DOM direto quando paste e execCommand falham`.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nomenclatura histórica; não existe chamada document.execCommand no job-runner atual.

### Linha 395

- **Código:** `        mountGeminiEditor({`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 396

- **Código:** `            sendMode: 'exact',`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 397

- **Código:** `            promptPasteBehavior: 'ignore',`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 398

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 399

- **Código:** `                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-dom-direct.png'), 1300);`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 400

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 401

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 402

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 403

- **Código:** `        await storageMock.set({`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 404

- **Código:** `            gemini_job_321: {`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 405

- **Código:** `                jobId: 'job-321',`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 406

- **Código:** `                batchId: 'batch-test',`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 407

- **Código:** `                mangaTabId: 77,`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 408

- **Código:** `                index: 11,`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 409

- **Código:** `                prompt: 'Traduzir via fallback DOM',`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 410

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 411

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 412

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 413

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 414

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 415

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 416

- **Código:** `            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 417

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 418

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 419

- **Código:** `        jest.spyOn(document, 'execCommand').mockReturnValue(false);`
- **Função:** Referência histórica no título/comentário; o job-runner atual não usa document.execCommand.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nomenclatura histórica; não existe chamada document.execCommand no job-runner atual.

### Linha 420

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 421

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 422

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Executa pipeline real de job Gemini até o guard/caminho focal.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 423

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 424

- **Código:** `        await waitFor(() => (`
- **Função:** Compõe o cenário CG-24 — fallback DOM quando paste/evento não resolve, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 425

- **Código:** `            document.querySelector('.ql-editor')`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 426

- **Código:** `            && document.querySelector('.ql-editor').textContent.includes('Traduzir via fallback DOM')`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 427

- **Código:** `        ));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 428

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 429

- **Código:** `        expect(document.querySelector('.ql-editor').textContent).toContain('Traduzir via fallback DOM');`
- **Função:** Configura ou verifica um elemento DOM usado por helper/runner.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 430

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 431

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-24 — fallback DOM quando paste/evento não resolve.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 432

- **Código:** `    test('CG-14: nao processa job quando a URL atual esta em deleting_urls', async () => {`
- **Função:** Declara o cenário real `CG-14: nao processa job quando a URL atual esta em deleting_urls`.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 433

- **Código:** `        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 434

- **Código:** `        await storageMock.set({`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 435

- **Código:** `            gemini_job_321: {`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 436

- **Código:** `                jobId: 'job-321',`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 437

- **Código:** `                batchId: 'batch-test',`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 438

- **Código:** `                mangaTabId: 77,`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 439

- **Código:** `                index: 2,`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 440

- **Código:** `                prompt: 'Nao deve rodar',`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 441

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 442

- **Código:** `            deleting_urls: ['https://gemini.test/app/chat-1'],`
- **Função:** Configura flag durável que deve encerrar job antes de processar conversa em exclusão.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 443

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 444

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 445

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 446

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 447

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 448

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 449

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 450

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 451

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Executa pipeline real de job Gemini até o guard/caminho focal.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 452

- **Código:** `        await delay(100);`
- **Função:** Compõe o cenário CG-14 — deleting_urls bloqueia reprocessamento, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 453

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 454

- **Código:** `        expect(sentMessages.some((message) => message.action === 'REQUEST_IMAGE_DATA')).toBe(false);`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 455

- **Código:** `        expect(sentMessages.some((message) => message.action === 'GEMINI_ERROR')).toBe(false);`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 456

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 457

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-14 — deleting_urls bloqueia reprocessamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 458

- **Código:** `    test('CG-45: deleteCurrentConversation recusa apagar item selecionado sem link do chat atual', async () => {`
- **Função:** Declara o cenário real `CG-45: deleteCurrentConversation recusa apagar item selecionado sem link do chat atual`.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 459

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 460

- **Código:** `            <div aria-selected="true" id="selected-row">`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 461

- **Código:** `                <button id="selected-options" aria-haspopup="menu">...</button>`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 462

- **Código:** `            </div>`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 463

- **Código:** `            <div id="delete-item" role="menuitem">Excluir conversa</div>`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 464

- **Código:** `            <button id="confirm-delete">Excluir</button>`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 465

- **Código:** `        &#96;;`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 466

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 467

- **Código:** `        const optionsBtn = document.getElementById('selected-options');`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 468

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 469

- **Código:** `        const confirmBtn = document.getElementById('confirm-delete');`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 470

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 471

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 472

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 473

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 474

- **Código:** `        confirmBtn.click = jest.fn();`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 475

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 476

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 477

- **Código:** `        installResponder();`
- **Função:** Compõe o cenário CG-45 — recusa item selecionado sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 478

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 479

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 480

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:** Exercita wrapper/export real de exclusão.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 481

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 482

- **Código:** `        expect(optionsBtn.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 483

- **Código:** `        expect(deleteItem.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 484

- **Código:** `        expect(confirmBtn.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 485

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({ action: 'LOG_ENTRY', action_name: 'DELETE_ERROR' }));`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 486

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 487

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-45 — recusa item selecionado sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 488

- **Código:** `    test('CG-46: deleteCurrentConversation recusa heuristica generica da sidebar sem link do chat atual', async () => {`
- **Função:** Declara o cenário real `CG-46: deleteCurrentConversation recusa heuristica generica da sidebar sem link do chat atual`.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 489

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 490

- **Código:** `            <nav>`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 491

- **Código:** `                <button id="sidebar-menu">`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 492

- **Código:** `                    <svg><path></path><path></path><circle></circle></svg>`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 493

- **Código:** `                </button>`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 494

- **Código:** `            </nav>`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 495

- **Código:** `            <div id="delete-item" role="menuitem">Delete conversation</div>`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 496

- **Código:** `            <button id="confirm-delete">Confirm delete</button>`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 497

- **Código:** `        &#96;;`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 498

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 499

- **Código:** `        const optionsBtn = document.getElementById('sidebar-menu');`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 500

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 501

- **Código:** `        const confirmBtn = document.getElementById('confirm-delete');`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 502

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 503

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 504

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 505

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 506

- **Código:** `        confirmBtn.click = jest.fn();`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 507

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 508

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 509

- **Código:** `        installResponder();`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 510

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 511

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 512

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:** Exercita wrapper/export real de exclusão.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 513

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 514

- **Código:** `        // Um botão genérico sem data-test-id/aria-label não é evidência suficiente`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 515

- **Código:** `        // de que seja o toggle da sidebar. A deleção não pode clicar por heurística.`
- **Função:** Compõe o cenário CG-46 — recusa heurística genérica sem link do chat atual, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 516

- **Código:** `        expect(optionsBtn.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 517

- **Código:** `        expect(deleteItem.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 518

- **Código:** `        expect(confirmBtn.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 519

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({ action: 'LOG_ENTRY', action_name: 'DELETE_ERROR' }));`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 520

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 521

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-46 — recusa heurística genérica sem link do chat atual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 522

- **Código:** `    test('CG-50: deleteCurrentConversation falha sem confirmação e não clica fora do modal', async () => {`
- **Função:** Declara o cenário real `CG-50: deleteCurrentConversation falha sem confirmação e não clica fora do modal`.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 523

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 524

- **Código:** `            <div id="conversation-row">`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 525

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 526

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 527

- **Código:** `            </div>`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 528

- **Código:** `            <div id="delete-item" role="menuitem">Excluir</div>`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 529

- **Código:** `        &#96;;`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 530

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 531

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 532

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 533

- **Código:** `        const bodyClickSpy = jest.spyOn(document.body, 'click');`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 534

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 535

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 536

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 537

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 538

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 539

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 540

- **Código:** `        installResponder();`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 541

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 542

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 543

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:** Exercita wrapper/export real de exclusão.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 544

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 545

- **Código:** `        expect(deleteItem.click).toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 546

- **Código:** `        expect(bodyClickSpy).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 547

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 548

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 549

- **Código:** `            action_name: 'DELETE_ERROR',`
- **Função:** Compõe o cenário CG-50 — falha sem confirmação e não clica fora do modal, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 550

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 551

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 552

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-50 — falha sem confirmação e não clica fora do modal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 553

- **Código:** `    test('deleteCurrentConversation aguarda menu e confirmacao renderizados com atraso no Gemini', async () => {`
- **Função:** Declara o cenário real `deleteCurrentConversation aguarda menu e confirmacao renderizados com atraso no Gemini`.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 554

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 555

- **Código:** `            <div id="conversation-row">`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 556

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 557

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 558

- **Código:** `            </div>`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 559

- **Código:** `        &#96;;`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 560

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 561

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 562

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 563

- **Código:** `        optionsBtn.click = jest.fn(() => {`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 564

- **Código:** `            setTimeout(() => {`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 565

- **Código:** `                const deleteItem = document.createElement('button');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 566

- **Código:** `                deleteItem.id = 'delete-item';`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 567

- **Código:** `                deleteItem.setAttribute('role', 'menuitem');`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 568

- **Código:** `                deleteItem.textContent = 'Excluir';`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 569

- **Código:** `                deleteItem.click = jest.fn(() => {`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 570

- **Código:** `                    setTimeout(() => {`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 571

- **Código:** `                        const dialog = document.createElement('div');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 572

- **Código:** `                        dialog.setAttribute('role', 'dialog');`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 573

- **Código:** `                        const confirm = document.createElement('button');`
- **Função:** Cria fixture DOM usada por um helper real.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 574

- **Código:** `                        confirm.id = 'confirm-delete';`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 575

- **Código:** `                        confirm.textContent = 'Excluir';`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 576

- **Código:** `                        confirm.click = jest.fn(() => {`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 577

- **Código:** `                            document.getElementById('conversation-row')?.remove();`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 578

- **Código:** `                            window.location.pathname = '/app';`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 579

- **Código:** `                        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 580

- **Código:** `                        dialog.appendChild(confirm);`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 581

- **Código:** `                        document.body.appendChild(dialog);`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 582

- **Código:** `                    }, 350);`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 583

- **Código:** `                });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 584

- **Código:** `                document.body.appendChild(deleteItem);`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 585

- **Código:** `            }, 350);`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 586

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 587

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 588

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 589

- **Código:** `        installResponder();`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 590

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 591

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 592

- **Código:** `        await mod.deleteCurrentConversation();`
- **Função:** Exercita wrapper/export real de exclusão.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 593

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 594

- **Código:** `        expect(optionsBtn.click).toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 595

- **Código:** `        expect(document.getElementById('delete-item').click).toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 596

- **Código:** `        expect(document.getElementById('confirm-delete').click).toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 597

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 598

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 599

- **Código:** `            action_name: 'DELETE_OK',`
- **Função:** Compõe o cenário deleteCurrentConversation — aguarda menu/confirmação atrasados, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 600

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 601

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 602

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — aguarda menu/confirmação atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 603

- **Código:** `    test('deleteCurrentConversation falha sem item exato de exclusão e não clica fora do menu', async () => {`
- **Função:** Declara o cenário real `deleteCurrentConversation falha sem item exato de exclusão e não clica fora do menu`.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 604

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 605

- **Código:** `            <div id="conversation-row">`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 606

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 607

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 608

- **Código:** `            </div>`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 609

- **Código:** `            <div role="menuitem">Compartilhar</div>`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 610

- **Código:** `        &#96;;`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 611

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 612

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 613

- **Código:** `        const bodyClickSpy = jest.spyOn(document.body, 'click');`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 614

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 615

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 616

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 617

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 618

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 619

- **Código:** `        installResponder();`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 620

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 621

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 622

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:** Exercita wrapper/export real de exclusão.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 623

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 624

- **Código:** `        expect(optionsBtn.click).toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 625

- **Código:** `        expect(bodyClickSpy).not.toHaveBeenCalled();`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 626

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 627

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 628

- **Código:** `            action_name: 'DELETE_ERROR',`
- **Função:** Compõe o cenário deleteCurrentConversation — falha sem item exato de exclusão, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 629

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 630

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 631

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** deleteCurrentConversation — falha sem item exato de exclusão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 632

- **Código:** `    test('CG-47: deleteCurrentConversation falha quando o chat exato não tem botão de opções', async () => {`
- **Função:** Declara o cenário real `CG-47: deleteCurrentConversation falha quando o chat exato não tem botão de opções`.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 633

- **Código:** `        document.body.innerHTML = '<div><a href="/app/chat-1">Conversa atual</a></div>';`
- **Função:** Compõe o cenário CG-47 — falha sem botão de opções do chat exato, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 634

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:** Compõe o cenário CG-47 — falha sem botão de opções do chat exato, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 635

- **Código:** `        installResponder();`
- **Função:** Compõe o cenário CG-47 — falha sem botão de opções do chat exato, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 636

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 637

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 638

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:** Exercita wrapper/export real de exclusão.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 639

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 640

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 641

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário CG-47 — falha sem botão de opções do chat exato, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 642

- **Código:** `            action_name: 'DELETE_ERROR',`
- **Função:** Compõe o cenário CG-47 — falha sem botão de opções do chat exato, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 643

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 644

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 645

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-47 — falha sem botão de opções do chat exato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 646

- **Código:** `    test('CG-42/CG-51: deleteCurrentConversation protege contra reentrada concorrente e reseta o guard', async () => {`
- **Função:** Declara o cenário real `CG-42/CG-51: deleteCurrentConversation protege contra reentrada concorrente e reseta o guard`.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 647

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 648

- **Código:** `            <div id="conversation-row">`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 649

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 650

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 651

- **Código:** `            </div>`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 652

- **Código:** `            <div id="delete-item" role="menuitem">Excluir</div>`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 653

- **Código:** `            <button id="confirm-delete">Excluir</button>`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 654

- **Código:** `        &#96;;`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 655

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 656

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 657

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 658

- **Código:** `        const confirmBtn = document.getElementById('confirm-delete');`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 659

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 660

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 661

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 662

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 663

- **Código:** `        confirmBtn.click = jest.fn(() => {`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 664

- **Código:** `            document.getElementById('conversation-row')?.remove();`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 665

- **Código:** `            window.location.pathname = '/app';`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 666

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 667

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 668

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 669

- **Código:** `        installResponder();`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 670

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 671

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega módulos Gemini reais e content_gemini.js no ambiente JSDOM controlado.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega content_gemini.js e módulos Gemini reais.

### Linha 672

- **Código:** `        const p1 = mod.deleteCurrentConversation();`
- **Função:** Exercita wrapper/export real de exclusão.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 673

- **Código:** `        const p2 = mod.deleteCurrentConversation();`
- **Função:** Exercita wrapper/export real de exclusão.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o resultado.

### Linha 674

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 675

- **Código:** `        await Promise.all([p1, p2]);`
- **Função:** Compõe o cenário CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard, preparando, executando ou verificando o comportamento expresso pelo código desta linha.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 676

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 677

- **Código:** `        expect(optionsBtn.click).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 678

- **Código:** `        expect(deleteItem.click).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 679

- **Código:** `        expect(confirmBtn.click).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal do comportamento observado.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 680

- **Código:** `        expect(mod.__getDeletionInProgress()).toBe(false);`
- **Função:** Observa flag interna exposta pelo módulo real.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 681

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 682

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 683

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 684 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 13. Conclusão documental

Foram documentadas 683 linhas textuais e a posição 684 do newline final. O mesmo blob está verde em Node 20/22; a Bíblia distingue explicitamente a prova real do runner da ponte MAIN-world de inject.js e marca a terminologia execCommand como histórica.

## Correção adversarial de rastreabilidade

Foram revalidados 683 blocos `### Linha N`; 683 campos de contexto foram realinhados ao cenário real e 359 descrições de função com rótulo de cenário foram corrigidas a partir das declarações reais do source.

| Faixa source | Contexto corrigido |
|---:|---|
| 1–186 | helpers, fixtures e setup pré-suite |
| 187–259 | describe/setup da suíte antes dos casos focais |
| 260–271 | CG-01/CG-02 — dataURLtoFile nominal PNG/JPEG |
| 272–278 | CG-03/CG-04 — dataURL inválida sem vírgula/MIME |
| 279–295 | CG-05/CG-06/CG-07 — waitForElement imediato/tardio/timeout |
| 296–311 | CG-08 — sleep com fake timers |
| 312–348 | REG-03/CG-22 — regressão de prompt/paste sem duplicidade |
| 349–393 | CG-23 — CustomEvent MAIN world + fallback DOM |
| 394–431 | CG-24 — fallback DOM quando paste/evento não resolve |
| 432–457 | CG-14 — deleting_urls bloqueia reprocessamento |
| 458–487 | CG-45 — recusa item selecionado sem link do chat atual |
| 488–521 | CG-46 — recusa heurística genérica sem link do chat atual |
| 522–552 | CG-50 — falha sem confirmação e não clica fora do modal |
| 553–602 | deleteCurrentConversation — aguarda menu/confirmação atrasados |
| 603–631 | deleteCurrentConversation — falha sem item exato de exclusão |
| 632–645 | CG-47 — falha sem botão de opções do chat exato |
| 646–683 | CG-42/CG-51 — proteção contra reentrada concorrente e reset do guard |
| 684 | newline final / posição estrutural |

> **Lifecycle:** 179-001 está SUPERSEDED por `050-001`; 179-002 e 179-003 estão ACCEPTED.

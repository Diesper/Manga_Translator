# Bíblia técnica — tests/unit/content-gemini/helpers-and-regressions-real.test.js

> **Estado documental:** 🟡 CORRIGIDA após ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** 4fd9efcb7d63fedfdc9843af1205cd9a805024a7
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de helpers e regressões reais do content Gemini  
> **Linhas textuais:** 687
> **Posições documentais:** 688, contando o newline final
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é um conjunto heterogêneo de regressões do content Gemini real: conversão data URL→File, espera de elementos, delays, visibilidade/seletores, wrappers de exclusão, guards de processGeminiJob e estratégias de preenchimento do prompt.

O loader executa content_gemini.js e os módulos Gemini associados. Isso dá força real aos helpers/exportações exercitados, mas não significa que todo arquivo externo citado pela arquitetura esteja presente no JSDOM — especialmente inject.js, que é a ponte MAIN-world de MANGA_TRANSLATOR_SET_PROMPT.

## 2. dataURLtoFile

CG-01/CG-02 provam a conversão nominal de Data URL para `File` com MIME correto em PNG/JPEG. CG-03/CG-04 provam a rejeição de Data URL sem vírgula ou sem MIME. `job-runner.test.js` agora cobre focalmente tanto **`FileImpl:null`** quanto **`DataUrlAtob:null`** no blob `b0daca4ce839d8a5114c8c94e116fa155c721f7b`; a request `179-004` está RESOLVED.

## 3. waitForElement / sleep / helpers DOM

CG-05/06/07 cobrem elemento já existente, inserção tardia no DOM observado e timeout null. CG-06B cobre um host conectado que recebe uma shadow root aberta depois do início da espera e verifica resolução, disconnect do observer e limpeza dos timers. Os cenários seguintes congelam sleep e helpers de localização/visibilidade usados pelo runner.

## 4. Guard de deleting_urls e wrappers de exclusão

A suíte prova que processGeminiJob encerra cedo quando a URL corrente está em deleting_urls, evitando reprocessar conversa em remoção. Também exercita wrappers de deleteCurrentConversation e o estado deletionInProgress; a semântica detalhada do controller é coberta em deletion.test.js (#176), portanto não é duplicada aqui.

## 5. Injeção de prompt: arquitetura atual

O job-runner atual primeiro dispara CustomEvent MANGA_TRANSLATOR_SET_PROMPT para a página e, depois, usa setPromptInEditor como fallback DOM/Quill no isolated world. Não existe document.execCommand no job-runner atual.

Os testes descrevem o contrato atual de emissão do CustomEvent e fallback DOM/Quill. O fixture de paste nesta suíte representa somente anexos via ClipboardEvent; não simula inserção de prompt nem usa execCommand.

## 6. Limite do teste CG-23

CG-23 instala um listener de teste para MANGA_TRANSLATOR_SET_PROMPT, confirma o detail.prompt e observa que o fallback DOM altera o editor. Porém loadContentGeminiModule não carrega extension/content/inject.js. Assim, o teste prova **emissão do evento + fallback DOM**, mas não prova que a ponte MAIN-world real de inject.js recebeu o evento, encontrou rich-textarea/Quill e despachou beforeinput/input/change.

Não foi localizada outra suíte focal para inject.js nessa ponte.

## 7. Quill e fallback

Os cenários seguintes provam que o runner consegue preencher editor em ausência de Quill por setPromptInEditor e que os helpers continuam funcionando em fixtures simplificadas. O branch de Quill real no MAIN-world pertence a inject.js e fica separado da prova local do runner.

## 8. Evidência CI da revisão anterior

O run 36521561968 no commit e720890cf34dc9437ee91f3b8172953497d69870 executou o blob anterior `65c66f1a756d127909ed6661386e72c19e3a3a2c`: 15 casos, Node 20.x (109255348388) e Node 22.x (109255348406); global 109/109 suítes e 851/851 testes; CI Gate 109256050280 sucesso. Esse resultado é histórico e não valida as alterações desta revisão; o teste focal atualizado e o self-test de Shadow DOM são as evidências atuais.

## 9. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| dataURL válida vira File | CG-01 | ✅ PROVADO DIRETAMENTE |
| dataURL sem vírgula/MIME falha | CG-03/CG-04 | ✅ PROVADO DIRETAMENTE |
| `FileImpl` ausente falha | job-runner RUN-01B | ✅ PROVADO DIRETAMENTE |
| `DataUrlAtob/atob` ausente falha | job-runner RUN-01B @ `b0daca4ce839d8a5114c8c94e116fa155c721f7b` | ✅ PROVADO DIRETAMENTE |
| waitForElement imediato/tardio/timeout e shadow root anexada depois | CG-05/06/07/06B | ✅ PROVADO DIRETAMENTE |
| processGeminiJob respeita deleting_urls | regressão real | ✅ PROVADO DIRETAMENTE |
| wrappers de delete/export respondem | cenários reais | ✅ PROVADO DIRETAMENTE |
| CustomEvent MANGA_TRANSLATOR_SET_PROMPT é emitido | CG-23 | ✅ PROVADO DIRETAMENTE |
| fallback DOM do job-runner preenche editor | CG-23/24 | ✅ PROVADO DIRETAMENTE |
| inject.js MAIN-world reage ao evento | inject.js não é carregado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| document.execCommand participa do caminho atual | não existe no job-runner atual | ⚠️ CONTRATO HISTÓRICO/OBSOLETO |
| waitForElement descobre shadow root anexada depois do início da espera e limpa timers | CG-06B | ✅ PROVADO DIRETAMENTE |

## 10. Solicitações ao auditor

### 179-001 — INTEGRATION_TEST_REQUIRED — SUPERSEDED → 050-001 — HIGH

Encontrado: CG-23 observa o CustomEvent MANGA_TRANSLATOR_SET_PROMPT com listener criado pelo próprio teste; loadContentGeminiModule não carrega extension/content/inject.js, que é a ponte MAIN-world real.

Evidência ausente: carregar inject.js em um contexto apropriado, disparar o evento real e verificar rich-textarea/Quill ou fallback paste + beforeinput/input/change no target, sem depender do setPromptInEditor posterior do job-runner.

Risco: a ponte MAIN-world pode quebrar enquanto CG-23 continua verde porque só comprova emissão do evento.

### 179-002 — TEST_MAINTENANCE — ACCEPTED — NORMAL

Encontrado: títulos/comentários REG-03/CG-22 e CG-24 ainda descrevem fallback paste/execCommand, mas o job-runner atual não contém document.execCommand. O fluxo atual é CustomEvent + setPromptInEditor DOM/Quill.

Ação pedida: atualizar nomenclatura e assertions para a arquitetura atual; se execCommand tiver sido intencionalmente removido, não mantê-lo como requisito implícito.

Risco: documentação de teste obsoleta pode induzir manutenção regressiva ou falsa leitura de cobertura.

### 179-004 — TEST_REQUIRED — RESOLVED — NORMAL

Resolução: `job-runner.test.js` RUN-01B instancia o runner com `DataUrlAtob:null` e exige `APIs de arquivo indisponíveis`, sem prosseguir para conversão/upload. A cobertura está no source blob `b0daca4ce839d8a5114c8c94e116fa155c721f7b`.

A descrição de ausência abaixo pertence ao histórico da solicitação e não representa uma lacuna atual.

Risco mitigado: regressão específica na guarda de `DataUrlAtob` sem detecção.

Severidade: NORMAL.

### 179-003 — TEST_REQUIRED — RESOLVED — NORMAL

Resolução: CG-06B inicia waitForElement antes de anexar uma shadow root aberta a host já conectado, insere o alvo e exige resolução no primeiro ciclo de descoberta, desconexão do observer e limpeza dos timers. O teste falha sem a descoberta periódica de novas shadow roots.

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

    test('CG-06B: waitForElement encontra alvo em shadow root anexada depois da espera iniciar', async () => {
        jest.useFakeTimers();
        try {
            const mod = loadContentGeminiModule();
            const host = document.createElement('div');
            document.body.appendChild(host);

            const pending = mod.waitForElement('.late-shadow-node', 5000);
            const shadowRoot = host.attachShadow({ mode: 'open' });
            const target = document.createElement('span');
            target.className = 'late-shadow-node';
            shadowRoot.appendChild(target);

            await jest.advanceTimersByTimeAsync(50);
            let result = null;
            pending.then(element => { result = element; });
            await Promise.resolve();

            expect(result).toBe(target);
            expect(jest.getTimerCount()).toBe(0);
        } finally {
            await jest.advanceTimersByTimeAsync(5000);
            jest.useRealTimers();
        }
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

    test('REG-03/CG-22: o fallback DOM insere o prompt exatamente uma vez', async () => {
        mountGeminiEditor({
            sendMode: 'exact',
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

        const expectedPrompt = 'Traduzir sem duplicar texto';
        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const editor = await waitFor(() => {
            const candidate = document.querySelector('.ql-editor');
            return candidate && candidate.textContent.includes(expectedPrompt) ? candidate : null;
        });
        expect(editor.textContent).toBe(expectedPrompt);
    });

    test('CG-23: emite evento da página e usa fallback DOM quando o editor não muda', async () => {
        const { editor } = mountGeminiEditor({
            sendMode: 'exact',
            onSubmit: () => {
                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-main-world.png'), 1300);
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

    test('CG-24: usa fallback DOM quando o evento da página não altera o editor', async () => {
        mountGeminiEditor({
            sendMode: 'exact',
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
- **Função:** Importa getRuntimeMock e getStorageMock, usados pelos testes para simular as APIs de Chrome.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 002

- **Código:** `const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');`
- **Função:**
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 003

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 004

- **Código:** `function setWindowLocation(pathname = '/app/chat-1') {`
- **Função:**
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 005

- **Código:** `    Object.defineProperty(window, 'location', {`
- **Função:** Define novamente window.location para fornecer a URL da conversa aos casos da suíte.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 006

- **Código:** `        value: {`
- **Função:** Inicia o objeto de localização controlado definido em window.location.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 007

- **Código:** `            pathname,`
- **Função:** Usa o pathname escolhido pelo teste no objeto window.location.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 008

- **Código:** `            href: &#96;https://gemini.test${pathname}&#96;,`
- **Função:** Monta href de teste a partir do pathname selecionado.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 009

- **Código:** `            origin: 'https://gemini.test',`
- **Função:** Define a origem fixa gemini.test para a localização simulada.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 010

- **Código:** `        },`
- **Função:** Fecha o objeto location dentro do valor do descriptor.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 011

- **Código:** `        configurable: true,`
- **Função:** Permite redefinir a propriedade location em cada preparação de teste.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 012

- **Código:** `        writable: true,`
- **Função:** Permite escrita na propriedade location durante a execução do teste.
- **Contexto:** helpers e configuração de window.location do harness
- **Evidência:**

### Linha 013

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 014

- **Código:** `}`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 015

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 016

- **Código:** `function installDomApis() {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 017

- **Código:** `    if (typeof window.HTMLElement !== 'undefined' && typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 018

- **Código:** `        Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 019

- **Código:** `            value: jest.fn(),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 020

- **Código:** `            configurable: true,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 021

- **Código:** `            writable: true,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 022

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 023

- **Código:** `    }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 024

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 025

- **Código:** `    if (typeof window.PointerEvent !== 'function') window.PointerEvent = window.MouseEvent;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 026

- **Código:** `    if (typeof global.PointerEvent !== 'function') global.PointerEvent = window.PointerEvent;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 027

- **Código:** `    if (typeof global.File !== 'function') global.File = window.File;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 028

- **Código:** `    if (typeof global.Blob !== 'function') global.Blob = window.Blob;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 029

- **Código:** `    if (typeof global.FileReader !== 'function') global.FileReader = window.FileReader;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 030

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 031

- **Código:** `    if (typeof window.DataTransfer !== 'function') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 032

- **Código:** `        class MockDataTransfer {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 033

- **Código:** `            constructor() {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 034

- **Código:** `                const items = [];`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 035

- **Código:** `                items.add = (item) => items.push(item);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 036

- **Código:** `                this.items = items;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 037

- **Código:** `                this._data = new Map();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 038

- **Código:** `            }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 039

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 040

- **Código:** `            setData(type, value) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 041

- **Código:** `                this._data.set(type, value);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 042

- **Código:** `            }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 043

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 044

- **Código:** `            getData(type) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 045

- **Código:** `                return this._data.get(type) || '';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 046

- **Código:** `            }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 047

- **Código:** `        }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 048

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 049

- **Código:** `        window.DataTransfer = MockDataTransfer;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 050

- **Código:** `    }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 051

- **Código:** `    if (typeof global.DataTransfer !== 'function') global.DataTransfer = window.DataTransfer;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 052

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 053

- **Código:** `    if (typeof window.ClipboardEvent !== 'function') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 054

- **Código:** `        class MockClipboardEvent extends window.Event {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 055

- **Código:** `            constructor(type, init = {}) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 056

- **Código:** `                super(type, init);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 057

- **Código:** `                this.clipboardData = init.clipboardData || null;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 058

- **Código:** `            }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 059

- **Código:** `        }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 060

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 061

- **Código:** `        window.ClipboardEvent = MockClipboardEvent;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 062

- **Código:** `    }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 063

- **Código:** `    if (typeof global.ClipboardEvent !== 'function') global.ClipboardEvent = window.ClipboardEvent;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 064

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 065

- **Código:** `    if (typeof window.InputEvent !== 'function') window.InputEvent = window.Event;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 066

- **Código:** `    if (typeof global.InputEvent !== 'function') global.InputEvent = window.InputEvent;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 067

- **Código:** `    if (typeof global.atob !== 'function') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 068

- **Código:** `        global.atob = (value) => Buffer.from(value, 'base64').toString('binary');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 069

- **Código:** `    }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 070

- **Código:** `}`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 071

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 072

- **Código:** `function delay(ms = 0) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 073

- **Código:** `    return new Promise((resolve) => setTimeout(resolve, ms));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 074

- **Código:** `}`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 075

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 076

- **Código:** `async function waitFor(predicate, { timeout = 5000, step = 25 } = {}) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 077

- **Código:** `    let elapsed = 0;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 078

- **Código:** `    while (elapsed <= timeout) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 079

- **Código:** `        const result = await predicate();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 080

- **Código:** `        if (result) return result;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 081

- **Código:** `        await delay(step);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 082

- **Código:** `        elapsed += step;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 083

- **Código:** `    }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 084

- **Código:** `    throw new Error('Timeout aguardando condicao');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 085

- **Código:** `}`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 086

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 087

- **Código:** `function mountGeminiEditor({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 088

- **Código:** `    sendMode = 'exact',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 089

- **Código:** `    onSubmit = () => {},`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 090

- **Código:** `} = {}) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 091

- **Código:** `    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"><p></p></div><div class="momentary-indicator">conversa momentânea</div>';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 092

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 093

- **Código:** `    const editor = document.querySelector('.ql-editor');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 094

- **Código:** `    editor.getBoundingClientRect = () => ({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 095

- **Código:** `        x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 120,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 096

- **Código:** `        width: 640, height: 120, toJSON() { return this; },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 097

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 098

- **Código:** `    editor.focus = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 099

- **Código:** `    editor.scrollIntoView = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 100

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 101

- **Código:** `    editor.addEventListener('paste', (event) => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 102

- **Código:** `        const clipboardData = event.clipboardData;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 103

- **Código:** `        if (clipboardData && clipboardData.items && clipboardData.items.length > 0) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 104

- **Código:** `            let preview = document.querySelector('file-preview');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 105

- **Código:** `            if (!preview) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 106

- **Código:** `                preview = document.createElement('file-preview');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 107

- **Código:** `                const thumbImg = document.createElement('img');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 108

- **Código:** `                thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 109

- **Código:** `                Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 110

- **Código:** `                Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 111

- **Código:** `                Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 112

- **Código:** `                preview.getBoundingClientRect = () => ({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 113

- **Código:** `                    x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 114

- **Código:** `                    width: 120, height: 90, toJSON() { return this; },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 115

- **Código:** `                });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 116

- **Código:** `                preview.appendChild(thumbImg);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 117

- **Código:** `                document.body.appendChild(preview);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 118

- **Código:** `            }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 119

- **Código:** `        }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 120

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 121

- **Código:** `    editor.addEventListener('drop', (event) => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 122

- **Código:** `        const transfer = event.dataTransfer;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 123

- **Código:** `        if (!transfer?.items?.length || document.querySelector('file-preview')) return;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 124

- **Código:** `        const preview = document.createElement('file-preview');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 125

- **Código:** `        const thumbImg = document.createElement('img');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 126

- **Código:** `        thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 127

- **Código:** `        Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 128

- **Código:** `        Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 129

- **Código:** `        Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 130

- **Código:** `        preview.getBoundingClientRect = () => ({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 131

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 132

- **Código:** `            width: 120, height: 90, toJSON() { return this; },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 133

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 134

- **Código:** `        preview.appendChild(thumbImg);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 135

- **Código:** `        document.body.appendChild(preview);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 136

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 137

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 138

- **Código:** `    editor.addEventListener('keydown', (event) => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 139

- **Código:** `        if (sendMode === 'enter' && event.key === 'Enter') onSubmit();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 140

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 141

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 142

- **Código:** `    let sendButton = null;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 143

- **Código:** `    if (sendMode !== 'enter') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 144

- **Código:** `        sendButton = document.createElement('button');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 145

- **Código:** `        sendButton.setAttribute('aria-label', sendMode === 'fuzzy' ? 'enviar agora' : 'send message');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 146

- **Código:** `        sendButton.click = jest.fn(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 147

- **Código:** `            editor.textContent = '';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 148

- **Código:** `            onSubmit();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 149

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 150

- **Código:** `        sendButton.getBoundingClientRect = () => ({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 151

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 40, bottom: 40,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 152

- **Código:** `            width: 40, height: 40, toJSON() { return this; },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 153

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 154

- **Código:** `        document.body.appendChild(sendButton);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 155

- **Código:** `    }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 156

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 157

- **Código:** `    return { editor, sendButton };`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 158

- **Código:** `}`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 159

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 160

- **Código:** `function appendGeneratedImage(src, { width = 1024, height = 1536 } = {}) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 161

- **Código:** `    const img = document.createElement('img');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 162

- **Código:** `    img.src = src;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 163

- **Código:** `    img.scrollIntoView = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 164

- **Código:** `    Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 165

- **Código:** `    Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 166

- **Código:** `    Object.defineProperty(img, 'complete', { value: true, configurable: true });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 167

- **Código:** `    const response = document.createElement('model-response');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 168

- **Código:** `    response.setAttribute('data-message-author', 'model');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 169

- **Código:** `    response.appendChild(img);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 170

- **Código:** `    document.body.appendChild(response);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 171

- **Código:** `    return img;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 172

- **Código:** `}`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 173

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 174

- **Código:** `describe('content_gemini.js - helpers, delecao e regressao real', () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 175

- **Código:** `    let runtimeMock;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 176

- **Código:** `    let storageMock;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 177

- **Código:** `    let sentMessages;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 178

- **Código:** `    let originalSendMessage;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 179

- **Código:** `    let originalFetch;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 180

- **Código:** `    let processPromises;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 181

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 182

- **Código:** `    beforeEach(async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 183

- **Código:** `        jest.resetModules();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 184

- **Código:** `        installDomApis();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 185

- **Código:** `        jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 186

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 187

- **Código:** `            width: 160, height: 48, toJSON() { return this; },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 188

- **Código:** `        }));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 189

- **Código:** `        setWindowLocation('/app/chat-1');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 190

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 191

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 192

- **Código:** `        storageMock = getStorageMock();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 193

- **Código:** `        originalSendMessage = runtimeMock.sendMessage;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 194

- **Código:** `        originalFetch = global.fetch;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 195

- **Código:** `        sentMessages = [];`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 196

- **Código:** `        processPromises = [];`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 197

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 198

- **Código:** `        runtimeMock._messageListeners = [];`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 199

- **Código:** `        runtimeMock._connectListeners = [];`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 200

- **Código:** `        runtimeMock.lastError = null;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 201

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 202

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 203

- **Código:** `        await storageMock.clear();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 204

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 205

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 206

- **Código:** `    afterEach(async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 207

- **Código:** `        const activeObserver = window.__mangaTranslatorActiveGeminiObserver;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 208

- **Código:** `        if (activeObserver && typeof activeObserver.stop === 'function') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 209

- **Código:** `            try { activeObserver.stop(); } catch (_error) {}`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 210

- **Código:** `        }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 211

- **Código:** `        delete window.__mangaTranslatorActiveGeminiObserver;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 212

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 213

- **Código:** `        const observerRegistry = window.__mtGeminiObservers;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 214

- **Código:** `        if (observerRegistry && typeof observerRegistry === 'object') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 215

- **Código:** `            for (const observer of Object.values(observerRegistry)) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 216

- **Código:** `                if (observer && typeof observer.stop === 'function') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 217

- **Código:** `                    try { observer.stop(); } catch (_error) {}`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 218

- **Código:** `                }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 219

- **Código:** `            }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 220

- **Código:** `        }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 221

- **Código:** `        delete window.__mtGeminiObservers;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 222

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 223

- **Código:** `        if (processPromises.length) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 224

- **Código:** `            await Promise.allSettled(processPromises);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 225

- **Código:** `        }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 226

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 227

- **Código:** `        runtimeMock.sendMessage = originalSendMessage;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 228

- **Código:** `        global.fetch = originalFetch;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 229

- **Código:** `        jest.restoreAllMocks();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 230

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 231

- **Código:** `        await storageMock.clear();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 232

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 233

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 234

- **Código:** `    function installResponder(responders = {}) {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 235

- **Código:** `        runtimeMock.sendMessage = jest.fn((message, callback) => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 236

- **Código:** `            sentMessages.push(message);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 237

- **Código:** `            const responder = responders[message.action];`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 238

- **Código:** `            if (typeof callback === 'function') {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 239

- **Código:** `                setTimeout(() => callback(responder ? responder(message) : undefined), 0);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 240

- **Código:** `            }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 241

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 242

- **Código:** `    }`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 243

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 244

- **Código:** `    test('CG-01/CG-02: dataURLtoFile cria File com MIME correto para PNG e JPEG', () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 245

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 246

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 247

- **Código:** `        const png = mod.dataURLtoFile('data:image/png;base64,QUJDRA==', 'page.png');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 248

- **Código:** `        const jpg = mod.dataURLtoFile('data:image/jpeg;base64,QUJDRA==', 'page.jpg');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 249

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 250

- **Código:** `        expect(png).toBeInstanceOf(File);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 251

- **Código:** `        expect(png.type).toBe('image/png');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 252

- **Código:** `        expect(png.size).toBeGreaterThan(0);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 253

- **Código:** `        expect(jpg.type).toBe('image/jpeg');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 254

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 255

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 256

- **Código:** `    test('CG-03/CG-04: dataURLtoFile rejeita dataURL sem virgula ou sem MIME', () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 257

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 258

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 259

- **Código:** `        expect(() => mod.dataURLtoFile('data:image/png;base64QUJDRA==', 'broken.png')).toThrow('dataURL malformada: sem vírgula');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 260

- **Código:** `        expect(() => mod.dataURLtoFile('data:;base64,QUJDRA==', 'broken.png')).toThrow('dataURL malformada: MIME não encontrado');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 261

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 262

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 263

- **Código:** `    test('CG-05/CG-06/CG-07: waitForElement resolve imediato, resolve tardio e retorna null no timeout', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 264

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 265

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 266

- **Código:** `        document.body.innerHTML = '<div class="already-here"></div>';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 267

- **Código:** `        await expect(mod.waitForElement('.already-here', 50)).resolves.toBe(document.querySelector('.already-here'));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 268

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 269

- **Código:** `        setTimeout(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 270

- **Código:** `            const late = document.createElement('span');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 271

- **Código:** `            late.className = 'late-node';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 272

- **Código:** `            document.body.appendChild(late);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 273

- **Código:** `        }, 120);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 274

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 275

- **Código:** `        const lateEl = await mod.waitForElement('.late-node', 600);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 276

- **Código:** `        expect(lateEl).toBe(document.querySelector('.late-node'));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 277

- **Código:** `        await expect(mod.waitForElement('.never-here', 120)).resolves.toBeNull();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 278

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 279

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 280

- **Código:** `    test('CG-06B: waitForElement encontra alvo em shadow root anexada depois da espera iniciar', async () => {`
- **Função:** Declara a regressão para shadow root conectada depois do início da espera.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 281

- **Código:** `        jest.useFakeTimers();`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: jest.useFakeTimers();.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 282

- **Código:** `        try {`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: try {.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 283

- **Código:** `            const mod = loadContentGeminiModule();`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: const mod = loadContentGeminiModule();.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 284

- **Código:** `            const host = document.createElement('div');`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: const host = document.createElement('div');.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 285

- **Código:** `            document.body.appendChild(host);`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: document.body.appendChild(host);.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 286

- **Código:** *(linha vazia)*
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: separador sintático do caso CG-06B.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 287

- **Código:** `            const pending = mod.waitForElement('.late-shadow-node', 5000);`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: const pending = mod.waitForElement('.late-shadow-node', 5000);.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 288

- **Código:** `            const shadowRoot = host.attachShadow({ mode: 'open' });`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: const shadowRoot = host.attachShadow({ mode: 'open' });.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟦 EXECUTADO DIRETAMENTE — teste CG-06B controla a raiz tardia e verifica resultado/limpeza.

### Linha 289

- **Código:** `            const target = document.createElement('span');`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: const target = document.createElement('span');.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 290

- **Código:** `            target.className = 'late-shadow-node';`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: target.className = 'late-shadow-node';.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 291

- **Código:** `            shadowRoot.appendChild(target);`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: shadowRoot.appendChild(target);.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟦 EXECUTADO DIRETAMENTE — teste CG-06B controla a raiz tardia e verifica resultado/limpeza.

### Linha 292

- **Código:** *(linha vazia)*
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: separador sintático do caso CG-06B.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 293

- **Código:** `            await jest.advanceTimersByTimeAsync(50);`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: await jest.advanceTimersByTimeAsync(50);.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟦 EXECUTADO DIRETAMENTE — teste CG-06B controla a raiz tardia e verifica resultado/limpeza.

### Linha 294

- **Código:** `            let result = null;`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: let result = null;.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 295

- **Código:** `            pending.then(element => { result = element; });`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: pending.then(element => { result = element; });.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 296

- **Código:** `            await Promise.resolve();`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: await Promise.resolve();.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 297

- **Código:** *(linha vazia)*
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: separador sintático do caso CG-06B.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 298

- **Código:** `            expect(result).toBe(target);`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: expect(result).toBe(target);.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟦 EXECUTADO DIRETAMENTE — teste CG-06B controla a raiz tardia e verifica resultado/limpeza.

### Linha 299

- **Código:** `            expect(jest.getTimerCount()).toBe(0);`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: expect(jest.getTimerCount()).toBe(0);.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟦 EXECUTADO DIRETAMENTE — teste CG-06B controla a raiz tardia e verifica resultado/limpeza.

### Linha 300

- **Código:** `        } finally {`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: } finally {.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 301

- **Código:** `            await jest.advanceTimersByTimeAsync(5000);`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: await jest.advanceTimersByTimeAsync(5000);.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟦 EXECUTADO DIRETAMENTE — teste CG-06B controla a raiz tardia e verifica resultado/limpeza.

### Linha 302

- **Código:** `            jest.useRealTimers();`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: jest.useRealTimers();.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 303

- **Código:** `        }`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: }.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 304

- **Código:** `    });`
- **Função:** Executa ou verifica a descoberta tardia do alvo Shadow DOM: });.
- **Contexto:** CG-06B — descoberta de shadow root adicionada depois do início da espera.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha integra a preparação ou limpeza do teste CG-06B.

### Linha 305

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 306

- **Código:** `    test('CG-08: sleep resolve apenas depois do tempo solicitado', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 307

- **Código:** `        jest.useFakeTimers();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 308

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 309

- **Código:** `        const marker = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 310

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 311

- **Código:** `        const pending = mod.sleep(100).then(marker);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 312

- **Código:** `        await jest.advanceTimersByTimeAsync(99);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 313

- **Código:** `        expect(marker).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 314

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 315

- **Código:** `        await jest.advanceTimersByTimeAsync(1);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 316

- **Código:** `        await pending;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 317

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 318

- **Código:** `        expect(marker).toHaveBeenCalledTimes(1);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 319

- **Código:** `        jest.useRealTimers();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 320

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 321

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 322

- **Código:** `    test('REG-03/CG-22: o fallback DOM insere o prompt exatamente uma vez', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 323

- **Código:** `        mountGeminiEditor({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 324

- **Código:** `            sendMode: 'exact',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 325

- **Código:** `            onSubmit: () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 326

- **Código:** `                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-reg-03.png'), 1300);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 327

- **Código:** `            },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 328

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 329

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 330

- **Código:** `        await storageMock.set({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 331

- **Código:** `            gemini_job_321: {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 332

- **Código:** `                jobId: 'job-321',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 333

- **Código:** `                batchId: 'batch-test',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 334

- **Código:** `                mangaTabId: 77,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 335

- **Código:** `                index: 4,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 336

- **Código:** `                prompt: 'Traduzir sem duplicar texto',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 337

- **Código:** `            },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 338

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 339

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 340

- **Código:** `        installResponder({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 341

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 342

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 343

- **Código:** `            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 344

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 345

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 346

- **Código:** `        const expectedPrompt = 'Traduzir sem duplicar texto';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 347

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 348

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 349

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 350

- **Código:** `        const editor = await waitFor(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 351

- **Código:** `            const candidate = document.querySelector('.ql-editor');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 352

- **Código:** `            return candidate && candidate.textContent.includes(expectedPrompt) ? candidate : null;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 353

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 354

- **Código:** `        expect(editor.textContent).toBe(expectedPrompt);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 355

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 356

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 357

- **Código:** `    test('CG-23: emite evento da página e usa fallback DOM quando o editor não muda', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 358

- **Código:** `        const { editor } = mountGeminiEditor({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 359

- **Código:** `            sendMode: 'exact',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 360

- **Código:** `            onSubmit: () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 361

- **Código:** `                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-main-world.png'), 1300);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 362

- **Código:** `            },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 363

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 364

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 365

- **Código:** `        await storageMock.set({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 366

- **Código:** `            gemini_job_321: {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 367

- **Código:** `                jobId: 'job-321',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 368

- **Código:** `                batchId: 'batch-test',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 369

- **Código:** `                mangaTabId: 77,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 370

- **Código:** `                index: 9,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 371

- **Código:** `                prompt: 'Traduzir usando fallback DOM',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 372

- **Código:** `            },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 373

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 374

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 375

- **Código:** `        installResponder({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 376

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 377

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 378

- **Código:** `            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 379

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 380

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 381

- **Código:** `        let customEventDetail = null;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 382

- **Código:** `        const setPromptListener = (e) => { customEventDetail = e.detail; };`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 383

- **Código:** `        window.addEventListener('MANGA_TRANSLATOR_SET_PROMPT', setPromptListener);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 384

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 385

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 386

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 387

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 388

- **Código:** `        const promptWasInserted = await waitFor(() => (`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 389

- **Código:** `            document.querySelector('.ql-editor')`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 390

- **Código:** `            && document.querySelector('.ql-editor').textContent.includes('Traduzir usando fallback DOM')`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 391

- **Código:** `        ));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 392

- **Código:** `        await waitFor(() => !editor.textContent.includes('Traduzir usando fallback DOM'));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 393

- **Código:** `        window.removeEventListener('MANGA_TRANSLATOR_SET_PROMPT', setPromptListener);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 394

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 395

- **Código:** `        expect(promptWasInserted).toBeTruthy();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 396

- **Código:** `        expect(customEventDetail).toEqual({ prompt: 'Traduzir usando fallback DOM' });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 397

- **Código:** `        // Após o envio bem-sucedido, o Gemini consome/limpa o conteúdo do editor.`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 398

- **Código:** `        expect(editor.textContent).not.toContain('Traduzir usando fallback DOM');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 399

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 400

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 401

- **Código:** `    test('CG-24: usa fallback DOM quando o evento da página não altera o editor', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 402

- **Código:** `        mountGeminiEditor({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 403

- **Código:** `            sendMode: 'exact',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 404

- **Código:** `            onSubmit: () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 405

- **Código:** `                setTimeout(() => appendGeneratedImage('https://cdn.gemini.test/result-dom-direct.png'), 1300);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 406

- **Código:** `            },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 407

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 408

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 409

- **Código:** `        await storageMock.set({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 410

- **Código:** `            gemini_job_321: {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 411

- **Código:** `                jobId: 'job-321',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 412

- **Código:** `                batchId: 'batch-test',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 413

- **Código:** `                mangaTabId: 77,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 414

- **Código:** `                index: 11,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 415

- **Código:** `                prompt: 'Traduzir via fallback DOM',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 416

- **Código:** `            },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 417

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 418

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 419

- **Código:** `        installResponder({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 420

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 421

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 422

- **Código:** `            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 423

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 424

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 425

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 426

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 427

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 428

- **Código:** `        await waitFor(() => (`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 429

- **Código:** `            document.querySelector('.ql-editor')`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 430

- **Código:** `            && document.querySelector('.ql-editor').textContent.includes('Traduzir via fallback DOM')`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 431

- **Código:** `        ));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 432

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 433

- **Código:** `        expect(document.querySelector('.ql-editor').textContent).toContain('Traduzir via fallback DOM');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 434

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 435

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 436

- **Código:** `    test('CG-14: nao processa job quando a URL atual esta em deleting_urls', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 437

- **Código:** `        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 438

- **Código:** `        await storageMock.set({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 439

- **Código:** `            gemini_job_321: {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 440

- **Código:** `                jobId: 'job-321',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 441

- **Código:** `                batchId: 'batch-test',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 442

- **Código:** `                mangaTabId: 77,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 443

- **Código:** `                index: 2,`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 444

- **Código:** `                prompt: 'Nao deve rodar',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 445

- **Código:** `            },`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 446

- **Código:** `            deleting_urls: ['https://gemini.test/app/chat-1'],`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 447

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 448

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 449

- **Código:** `        installResponder({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 450

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 451

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 452

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 453

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 454

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 455

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 456

- **Código:** `        await delay(100);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 457

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 458

- **Código:** `        expect(sentMessages.some((message) => message.action === 'REQUEST_IMAGE_DATA')).toBe(false);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 459

- **Código:** `        expect(sentMessages.some((message) => message.action === 'GEMINI_ERROR')).toBe(false);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 460

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 461

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 462

- **Código:** `    test('CG-45: deleteCurrentConversation recusa apagar item selecionado sem link do chat atual', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 463

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 464

- **Código:** `            <div aria-selected="true" id="selected-row">`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 465

- **Código:** `                <button id="selected-options" aria-haspopup="menu">...</button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 466

- **Código:** `            </div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 467

- **Código:** `            <div id="delete-item" role="menuitem">Excluir conversa</div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 468

- **Código:** `            <button id="confirm-delete">Excluir</button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 469

- **Código:** `        &#96;;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 470

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 471

- **Código:** `        const optionsBtn = document.getElementById('selected-options');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 472

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 473

- **Código:** `        const confirmBtn = document.getElementById('confirm-delete');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 474

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 475

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 476

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 477

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 478

- **Código:** `        confirmBtn.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 479

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 480

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 481

- **Código:** `        installResponder();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 482

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 483

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 484

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 485

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 486

- **Código:** `        expect(optionsBtn.click).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 487

- **Código:** `        expect(deleteItem.click).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 488

- **Código:** `        expect(confirmBtn.click).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 489

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({ action: 'LOG_ENTRY', action_name: 'DELETE_ERROR' }));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 490

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 491

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 492

- **Código:** `    test('CG-46: deleteCurrentConversation recusa heuristica generica da sidebar sem link do chat atual', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 493

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 494

- **Código:** `            <nav>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 495

- **Código:** `                <button id="sidebar-menu">`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 496

- **Código:** `                    <svg><path></path><path></path><circle></circle></svg>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 497

- **Código:** `                </button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 498

- **Código:** `            </nav>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 499

- **Código:** `            <div id="delete-item" role="menuitem">Delete conversation</div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 500

- **Código:** `            <button id="confirm-delete">Confirm delete</button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 501

- **Código:** `        &#96;;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 502

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 503

- **Código:** `        const optionsBtn = document.getElementById('sidebar-menu');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 504

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 505

- **Código:** `        const confirmBtn = document.getElementById('confirm-delete');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 506

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 507

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 508

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 509

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 510

- **Código:** `        confirmBtn.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 511

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 512

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 513

- **Código:** `        installResponder();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 514

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 515

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 516

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 517

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 518

- **Código:** `        // Um botão genérico sem data-test-id/aria-label não é evidência suficiente`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 519

- **Código:** `        // de que seja o toggle da sidebar. A deleção não pode clicar por heurística.`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 520

- **Código:** `        expect(optionsBtn.click).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 521

- **Código:** `        expect(deleteItem.click).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 522

- **Código:** `        expect(confirmBtn.click).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 523

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({ action: 'LOG_ENTRY', action_name: 'DELETE_ERROR' }));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 524

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 525

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 526

- **Código:** `    test('CG-50: deleteCurrentConversation falha sem confirmação e não clica fora do modal', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 527

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 528

- **Código:** `            <div id="conversation-row">`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 529

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 530

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 531

- **Código:** `            </div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 532

- **Código:** `            <div id="delete-item" role="menuitem">Excluir</div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 533

- **Código:** `        &#96;;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 534

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 535

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 536

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 537

- **Código:** `        const bodyClickSpy = jest.spyOn(document.body, 'click');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 538

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 539

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 540

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 541

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 542

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 543

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 544

- **Código:** `        installResponder();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 545

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 546

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 547

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 548

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 549

- **Código:** `        expect(deleteItem.click).toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 550

- **Código:** `        expect(bodyClickSpy).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 551

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 552

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 553

- **Código:** `            action_name: 'DELETE_ERROR',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 554

- **Código:** `        }));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 555

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 556

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 557

- **Código:** `    test('deleteCurrentConversation aguarda menu e confirmacao renderizados com atraso no Gemini', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 558

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 559

- **Código:** `            <div id="conversation-row">`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 560

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 561

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 562

- **Código:** `            </div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 563

- **Código:** `        &#96;;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 564

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 565

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 566

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 567

- **Código:** `        optionsBtn.click = jest.fn(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 568

- **Código:** `            setTimeout(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 569

- **Código:** `                const deleteItem = document.createElement('button');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 570

- **Código:** `                deleteItem.id = 'delete-item';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 571

- **Código:** `                deleteItem.setAttribute('role', 'menuitem');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 572

- **Código:** `                deleteItem.textContent = 'Excluir';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 573

- **Código:** `                deleteItem.click = jest.fn(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 574

- **Código:** `                    setTimeout(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 575

- **Código:** `                        const dialog = document.createElement('div');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 576

- **Código:** `                        dialog.setAttribute('role', 'dialog');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 577

- **Código:** `                        const confirm = document.createElement('button');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 578

- **Código:** `                        confirm.id = 'confirm-delete';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 579

- **Código:** `                        confirm.textContent = 'Excluir';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 580

- **Código:** `                        confirm.click = jest.fn(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 581

- **Código:** `                            document.getElementById('conversation-row')?.remove();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 582

- **Código:** `                            window.location.pathname = '/app';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 583

- **Código:** `                        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 584

- **Código:** `                        dialog.appendChild(confirm);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 585

- **Código:** `                        document.body.appendChild(dialog);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 586

- **Código:** `                    }, 350);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 587

- **Código:** `                });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 588

- **Código:** `                document.body.appendChild(deleteItem);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 589

- **Código:** `            }, 350);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 590

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 591

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 592

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 593

- **Código:** `        installResponder();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 594

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 595

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 596

- **Código:** `        await mod.deleteCurrentConversation();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 597

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 598

- **Código:** `        expect(optionsBtn.click).toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 599

- **Código:** `        expect(document.getElementById('delete-item').click).toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 600

- **Código:** `        expect(document.getElementById('confirm-delete').click).toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 601

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 602

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 603

- **Código:** `            action_name: 'DELETE_OK',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 604

- **Código:** `        }));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 605

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 606

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 607

- **Código:** `    test('deleteCurrentConversation falha sem item exato de exclusão e não clica fora do menu', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 608

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 609

- **Código:** `            <div id="conversation-row">`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 610

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 611

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 612

- **Código:** `            </div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 613

- **Código:** `            <div role="menuitem">Compartilhar</div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 614

- **Código:** `        &#96;;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 615

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 616

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 617

- **Código:** `        const bodyClickSpy = jest.spyOn(document.body, 'click');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 618

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 619

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 620

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 621

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 622

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 623

- **Código:** `        installResponder();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 624

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 625

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 626

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 627

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 628

- **Código:** `        expect(optionsBtn.click).toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 629

- **Código:** `        expect(bodyClickSpy).not.toHaveBeenCalled();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 630

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 631

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 632

- **Código:** `            action_name: 'DELETE_ERROR',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 633

- **Código:** `        }));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 634

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 635

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 636

- **Código:** `    test('CG-47: deleteCurrentConversation falha quando o chat exato não tem botão de opções', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 637

- **Código:** `        document.body.innerHTML = '<div><a href="/app/chat-1">Conversa atual</a></div>';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 638

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 639

- **Código:** `        installResponder();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 640

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 641

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 642

- **Código:** `        await expect(mod.deleteCurrentConversation()).resolves.toBe(false);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 643

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 644

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 645

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 646

- **Código:** `            action_name: 'DELETE_ERROR',`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 647

- **Código:** `        }));`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 648

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 649

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 650

- **Código:** `    test('CG-42/CG-51: deleteCurrentConversation protege contra reentrada concorrente e reseta o guard', async () => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 651

- **Código:** `        document.body.innerHTML = &#96;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 652

- **Código:** `            <div id="conversation-row">`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 653

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 654

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 655

- **Código:** `            </div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 656

- **Código:** `            <div id="delete-item" role="menuitem">Excluir</div>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 657

- **Código:** `            <button id="confirm-delete">Excluir</button>`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 658

- **Código:** `        &#96;;`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 659

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 660

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 661

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 662

- **Código:** `        const confirmBtn = document.getElementById('confirm-delete');`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 663

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 664

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 665

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 666

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 667

- **Código:** `        confirmBtn.click = jest.fn(() => {`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 668

- **Código:** `            document.getElementById('conversation-row')?.remove();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 669

- **Código:** `            window.location.pathname = '/app';`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 670

- **Código:** `        });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 671

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 672

- **Código:** `        await storageMock.set({ debugMode: false });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 673

- **Código:** `        installResponder();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 674

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 675

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 676

- **Código:** `        const p1 = mod.deleteCurrentConversation();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 677

- **Código:** `        const p2 = mod.deleteCurrentConversation();`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 678

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 679

- **Código:** `        await Promise.all([p1, p2]);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 680

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 681

- **Código:** `        expect(optionsBtn.click).toHaveBeenCalledTimes(1);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 682

- **Código:** `        expect(deleteItem.click).toHaveBeenCalledTimes(1);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 683

- **Código:** `        expect(confirmBtn.click).toHaveBeenCalledTimes(1);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 684

- **Código:** `        expect(mod.__getDeletionInProgress()).toBe(false);`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 685

- **Código:** `    });`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 686

- **Código:** `});`
- **Função:**
- **Contexto:**
- **Evidência:**

### Linha 687

- **Código:** *(linha vazia)*
- **Função:**
- **Contexto:**
- **Evidência:**
### Posição 688 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 13. Conclusão documental

Foram documentadas 687 linhas textuais e a posição 688 do newline final. O mesmo blob está verde em Node 20/22; a Bíblia distingue explicitamente a prova real do runner da ponte MAIN-world de inject.js e marca a terminologia execCommand como histórica.

## Rastreabilidade desta revisão

A fonte integral e o mapa `### Linha N` foram regenerados para o blob atual. Os intervalos históricos de auditoria anteriores não são usados como evidência da revisão atual; a cobertura abaixo aponta o SHA e a fonte integral incorporada.

> **Resolução 179-004:** `RUN-01B` em `tests/unit/content-gemini/job-runner.test.js` instancia o runner com `DataUrlAtob:null` e exige `APIs de arquivo indisponíveis`; evidência no blob `b0daca4ce839d8a5114c8c94e116fa155c721f7b`.

## Cobertura documental de linhas/posições — revisão atual

Esta seção é a cobertura canônica da revisão atual e prevalece sobre mapas históricos preservados acima.

| Linhas/posição | Escopo | Evidência |
|---:|---|---|
| 1–688 | Blob integral atual `4fd9efcb7d63fedfdc9843af1205cd9a805024a7` (687 linhas textuais + newline final quando aplicável). | fonte integral embutida + SHA Git do source |

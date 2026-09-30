# Bíblia técnica — tests/unit/content-gemini/plan-rpa-edge-cases.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** 81e21c6e245ec8f75c68db163170266c40561a6c  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de bordas RPA integradas do content Gemini  
> **Linhas textuais:** 634  
> **Posições documentais:** 635, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte executa content_gemini.js e seus módulos reais com DOM/runtime/storage simulados, cobrindo bordas que atravessam mais de um componente: claim legacy, validação da imagem de entrada, composer/attachment, seleção de Send, heurística de resultado, HUD manual e ordem stage→commit.

Ela é uma suíte de integração de content script, não um teste isolado de uma função. Isso explica o custo de execução alto e a necessidade de teardown cuidadoso de observers/runners.

## 2. CG-10/CG-11 — compatibilidade de claim

Os responders não implementam CLAIM_GEMINI_JOB; portanto esses casos atravessam o fallback transitório GET_TAB_ID + gemini_job_<tabId>. CG-10 prova que job persistido 650ms depois ainda é encontrado. CG-11 prova saída limpa sem job, log JOB_NOT_FOUND e ausência de REQUEST_IMAGE_DATA/GEMINI_ERROR.

O título de CG-11 ainda fala em '30 tentativas', mas o código atual de claim é orientado por timeout e loops de 500ms, com até cinco tentativas de GET_TAB_ID no fallback. A nomenclatura está histórica.

## 3. Input, composer e attachment

CG-17 rejeita srcData que não começa com data:image/. REG-12/CG-19/CG-40 usa editor aria-disabled e exige GEMINI_ERROR + clearInterval. CG-21 deixa paste/drop sem preview e prova que o handshake de attachment expira, registra STARTED/REJECTED/SUBMIT_BLOCKED e não injeta prompt.

## 4. Send button e resultado automático

CG-28/29 cria Send desabilitado, Send oculto e Send válido: somente o válido pode ser clicado. CG-32/33/34 parte de imagem preexistente, avatar e tiny image e exige extração da final-result. Outro caso prova que 60x1024 ainda é aceito, evitando filtro por proporção excessivamente rígido.

Falsos positivos da blacklist de avatar/emoji são tratados como lacuna em dom-modules.test.js (#177); não são duplicados aqui.

## 5. Fallback manual

O caso manual deixa uma imagem 30x1024 órfã que a heurística automática não aceitaria, ativa o HUD e clica nela. O pipeline então envia FETCH_IMAGE_AS_BASE64 para a URL selecionada e registra GEMINI_MANUAL_RESULT source=image-click.

Cobertura profunda de cleanup/handlers do HUD pertence a manual-assist-hud.test.js (#182) e não é duplicada nesta Bíblia.

## 6. Stage/commit antes de delete

CG-41 usa minimized_window, aguarda GEMINI_IMAGE_EXTRACTED e depois GEMINI_RESULT_COMMIT com jobId/batchId, e verifica que até esse ponto não houve DELETE_OK nem clique nos controles de exclusão. Isso congela a barreira: persistência/commit não podem depender de excluir conversa antes.

RUN-12/13/14 em job-runner.test.js (#181) cobrem a ordem e falhas de stage/commit de forma mais focal.

## 7. Qualidade e custo do teste

No CI exato, este arquivo leva aproximadamente 37,8 segundos em cada job Node. Parte desse custo vem de timers reais (job tardio, resultado gerado após 1300ms, polling) e do cenário sem job com timeout amplo. CG-21 já demonstra que fake timers podem reduzir espera sem abandonar o fluxo real.

## 8. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob 81e21c6e245ec8f75c68db163170266c40561a6c. O arquivo passa em Node 20.x (job 109255348388, ~37.846 s) e Node 22.x (109255348406, ~37.807 s); global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 9. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| job legacy persistido tardiamente é encontrado | CG-10 | ✅ PROVADO DIRETAMENTE |
| sem job encerra com JOB_NOT_FOUND | CG-11 | ✅ PROVADO DIRETAMENTE |
| payload não-imagem gera erro | CG-17 | ✅ PROVADO DIRETAMENTE |
| editor disabled aborta e limpa interval | REG-12/CG-19/40 | ✅ PROVADO DIRETAMENTE |
| attachment não confirmado bloqueia prompt | CG-21 | ✅ PROVADO DIRETAMENTE |
| Send hidden/disabled ignorados | CG-28/29 | ✅ PROVADO DIRETAMENTE |
| stale/avatar/tiny ignorados antes de resultado válido | CG-32/33/34 | ✅ PROVADO DIRETAMENTE |
| proporção extrema 60x1024 aceita | caso dedicado | ✅ PROVADO DIRETAMENTE |
| seleção manual alimenta extração | caso HUD manual | ✅ PROVADO DIRETAMENTE |
| stage e commit precedem qualquer delete observado | CG-41 | ✅ PROVADO DIRETAMENTE |
| '30 tentativas' como contrato atual | título histórico; algoritmo atual é temporal | ⚠️ NOMENCLATURA DESATUALIZADA |
| teardown específico do scroll interval | apenas clearInterval chamado, sem identificar timer/ticks | ⚠️ PROVA PARCIAL |
| custo temporal da suíte | ~37,8s por job | 🟦 GATE ESTÁTICO/CI ESPECÍFICO |

## 10. Solicitações ao auditor

### 184-001 — TEST_MAINTENANCE — OPEN — NORMAL

Encontrado: CG-11 e o título da suíte ainda referenciam '30 tentativas'/'plano v3.1', mas claimGeminiJob atual usa timeout e fallback GET_TAB_ID/storage, não contador fixo de 30.

Ação pedida: renomear cenários/comentários para refletir claim atual (protocolo suportado vs fallback legacy, timeout e job tardio) sem alterar o comportamento funcional.

Risco: leitores podem tratar número histórico como requisito vigente e implementar regressão para satisfazer o título.

### 184-002 — TEST_PERFORMANCE_REVIEW — OPEN — NORMAL

Encontrado: a suíte leva ~37,8 s por execução Node, duas vezes no matrix CI, usando vários delays reais de 650/1300ms e polling amplo; CG-11 possui timeout do teste de 20s.

Ação pedida: converter waits determinísticos para fake timers/clock injetado quando possível, preservando pelo menos um smoke temporal real. Medir antes/depois.

Evidência esperada: mesmos contratos com tempo significativamente menor e sem flaky waits.

Risco: custo de CI elevado e maior sensibilidade a scheduling lento.

### 184-003 — TEST_STRENGTH_REVIEW — OPEN — LOW

Encontrado: REG-12/CG-19/40 apenas exige que global.clearInterval tenha sido chamado; não prova que o interval específico de scroll assist foi o removido nem que nenhum tick posterior ocorreu.

Ação pedida: injetar/espionar setInterval/clearInterval do runner ou pageWindow.scrollTo, capturar o id criado e exigir cleanup desse id + ausência de ticks depois do erro.

Risco: chamada incidental a clearInterval poderia manter o teste verde mesmo com leak do scroll assist.

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
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeout = 9000, step = 25 } = {}) {
    let elapsed = 0;
    while (elapsed <= timeout) {
        // eslint-disable-next-line no-await-in-loop
        const result = await predicate();
        if (result) return result;
        // eslint-disable-next-line no-await-in-loop
        await delay(step);
        elapsed += step;
    }
    throw new Error('Timeout aguardando condicao');
}

function defineImageMetrics(img, { width = 1024, height = 1536, complete = true } = {}) {
    img.scrollIntoView = jest.fn();
    Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
    Object.defineProperty(img, 'complete', { value: complete, configurable: true });
}

function appendImage(src, metrics = {}) {
    const img = document.createElement('img');
    img.src = src;
    defineImageMetrics(img, metrics);
    if (metrics.owner === false) {
        document.body.appendChild(img);
    } else {
        const response = document.createElement('model-response');
        response.setAttribute('data-message-author', 'model');
        response.appendChild(img);
        document.body.appendChild(response);
    }
    return img;
}

function mountEditor({
    disabled = false,
    attachThumbnail = true,
    onSubmit = () => {},
} = {}) {
    if (!document.querySelector('.momentary-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'momentary-indicator';
        indicator.textContent = 'conversa momentânea';
        document.body.appendChild(indicator);
    }

    const editor = document.createElement('div');
    editor.className = 'ql-editor';
    editor.setAttribute('contenteditable', 'true');
    if (disabled) editor.setAttribute('aria-disabled', 'true');
    editor.innerHTML = '<p></p>';
    editor.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 120,
        width: 640, height: 120, toJSON() { return this; },
    });
    editor.focus = jest.fn();
    editor.scrollIntoView = jest.fn();

    editor.addEventListener('paste', (event) => {
        const dt = event.clipboardData;
        const text = dt && typeof dt.getData === 'function' ? dt.getData('text/plain') : '';

        if (text) {
            editor.querySelector('p').textContent = text;
            return;
        }

        if (attachThumbnail && dt?.items?.length) {
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
        if (!attachThumbnail || !transfer?.items?.length || document.querySelector('file-preview')) return;
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

    document.body.appendChild(editor);
    return editor;
}

function appendSendButton({
    label = 'send message',
    disabled = false,
    hidden = false,
    onSubmit = () => {},
} = {}) {
    const button = document.createElement('button');
    button.setAttribute('aria-label', label);
    button.disabled = disabled;
    if (hidden) button.style.display = 'none';
    button.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0, right: 40, bottom: 40,
        width: 40, height: 40, toJSON() { return this; },
    });
    button.click = jest.fn(() => {
        const editor = document.querySelector('.ql-editor, [contenteditable="true"]');
        if (editor) editor.textContent = '';
        onSubmit();
    });
    document.body.appendChild(button);
    return button;
}

describe('content_gemini.js - bordas RPA do plano v3.1', () => {
    let runtimeMock;
    let storageMock;
    let originalSendMessage;
    let sentMessages;
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
        sentMessages = [];
        processPromises = [];

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;

        document.documentElement.innerHTML = '<head></head><body></body>';
        await storageMock.clear();
    });

    afterEach(async () => {
        // Os testes observam mensagens intermediárias do runner; isso não garante
        // que processGeminiJob() já tenha alcançado seu finally. Pare observers
        // antes de desmontar o DOM e aguarde todos os runners iniciados pelo caso.
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
        jest.useRealTimers();
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

    async function seedJob(job = {}) {
        await storageMock.set({
            gemini_job_321: {
                jobId: 'job-321',
                batchId: 'batch-test',
                mangaTabId: 77,
                index: 5,
                prompt: 'Traduzir borda do plano',
                ...job,
            },
        });
    }

    test('CG-10: job registrado tardiamente ainda e encontrado pelo loop de tentativas', async () => {
        mountEditor();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            // Encerra o fluxo logo após provar que o job tardio foi encontrado.
            // O comportamento de retry para resposta ausente é coberto separadamente.
            REQUEST_IMAGE_DATA: () => ({ srcData: 'payload-invalido' }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        setTimeout(() => {
            storageMock.set({
                gemini_job_321: {
                    jobId: 'job-321-late',
                    batchId: 'batch-test',
                    mangaTabId: 77,
                    index: 10,
                    prompt: 'Job tardio',
                },
            });
        }, 650);

        await waitFor(() => sentMessages.find(message =>
            message.action === 'REQUEST_IMAGE_DATA' && message.index === 10
        ), { timeout: 2500 });
        await waitFor(() => sentMessages.find(message =>
            message.action === 'GEMINI_ERROR' && message.index === 10
        ), { timeout: 2500 });
    });

    test('CG-11: sem job apos 30 tentativas registra JOB_NOT_FOUND e encerra sem crash', async () => {
        setWindowLocation('/new-chat');
        mountEditor();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const notFoundLog = await waitFor(() => sentMessages.find(message =>
            message.action === 'LOG_ENTRY' && message.action_name === 'JOB_NOT_FOUND'
        ), { timeout: 17000, step: 100 });

        expect(notFoundLog).toEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'JOB_NOT_FOUND',
            level: 'warn',
        }));
        expect(sentMessages.some(message => message.action === 'REQUEST_IMAGE_DATA')).toBe(false);
        expect(sentMessages.some(message => message.action === 'GEMINI_ERROR')).toBe(false);
    }, 20000);

    test('CG-17: REQUEST_IMAGE_DATA com payload que nao e imagem gera GEMINI_ERROR', async () => {
        await seedJob();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'texto puro' }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const error = await waitFor(() => sentMessages.find(message => message.action === 'GEMINI_ERROR'));
        expect(error).toEqual(expect.objectContaining({
            mangaTabId: 77,
            index: 5,
            error: expect.stringContaining('Os dados não são imagem válida'),
        }));
    });

    test('REG-12/CG-19/CG-40: editor desabilitado aborta o RPA e limpa o scrollInterval', async () => {
        mountEditor({ disabled: true });
        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
        await seedJob();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const error = await waitFor(() => sentMessages.find(message => message.action === 'GEMINI_ERROR'));
        expect(error.error).toContain('Editor do Gemini está desabilitado');
        expect(clearIntervalSpy).toHaveBeenCalled();
    });

    test('CG-21: ausencia de thumbnail bloqueia prompt e submit', async () => {
        mountEditor({ attachThumbnail: false });
        await seedJob();
        jest.useFakeTimers();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        for (let i = 0; i < 60; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await jest.advanceTimersByTimeAsync(500);
        }

        const gateLog = sentMessages.find(message =>
            message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_ATTACHMENT_NOT_CONFIRMED'
        );
        expect(gateLog).toEqual(expect.objectContaining({
            level: 'error',
            action_name: 'GEMINI_ATTACHMENT_NOT_CONFIRMED',
        }));
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'ATTACHMENT_STARTED',
            level: 'info',
        }));
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'ATTACHMENT_REJECTED',
            level: 'error',
        }));
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'SUBMIT_BLOCKED_ATTACHMENT',
            level: 'error',
        }));
        expect(sentMessages.some(message =>
            message.action === 'LOG_ENTRY' && message.action_name === 'ATTACHMENT_CONFIRMED'
        )).toBe(false);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'GEMINI_ERROR',
            error: expect.stringContaining('Anexo não confirmado'),
        }));
        expect(document.querySelector('.ql-editor').textContent.trim()).toBe('');
    });

    test('CG-28/CG-29: botoes desabilitados ou ocultos sao ignorados ate achar botao valido', async () => {
        let submitted = false;
        mountEditor();
        const disabledButton = appendSendButton({ disabled: true });
        const hiddenButton = appendSendButton({ label: 'enviar agora', hidden: true });
        const validButton = appendSendButton({
            label: 'send message',
            onSubmit: () => {
                submitted = true;
                setTimeout(() => appendImage('https://cdn.gemini.test/result-valid-button.png'), 1300);
            },
        });

        await seedJob();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        await waitFor(() => sentMessages.find(message => message.action === 'GEMINI_IMAGE_EXTRACTED'));

        expect(submitted).toBe(true);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'ATTACHMENT_STARTED',
            level: 'info',
        }));
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'ATTACHMENT_CONFIRMED',
            level: 'success',
        }));
        expect(sentMessages.some(message =>
            message.action === 'LOG_ENTRY' &&
            ['ATTACHMENT_REJECTED', 'SUBMIT_BLOCKED_ATTACHMENT'].includes(message.action_name)
        )).toBe(false);
        expect(disabledButton.click).not.toHaveBeenCalled();
        expect(hiddenButton.click).not.toHaveBeenCalled();
        expect(validButton.click).toHaveBeenCalled();
    }, 12000);

    test('CG-32/CG-33/CG-34: ignora imagem preexistente, avatar e imagem pequena antes de aceitar resultado valido', async () => {
        appendImage('https://cdn.gemini.test/pre-existing.png');
        mountEditor();
        appendSendButton({
            onSubmit: () => {
                setTimeout(() => {
                    appendImage('https://cdn.gemini.test/avatar-user.png');
                    appendImage('https://cdn.gemini.test/tiny-result.png', { width: 50, height: 50 });
                    appendImage('https://cdn.gemini.test/final-result.png', { width: 900, height: 1200 });
                }, 1300);
            },
        });

        await seedJob();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            FETCH_IMAGE_AS_BASE64: (message) => ({ dataUrl: `data:image/png;base64,${Buffer.from(message.url).toString('base64')}` }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const fetch = await waitFor(() => sentMessages.find(message =>
            message.action === 'FETCH_IMAGE_AS_BASE64'
        ));
        const extracted = await waitFor(() => sentMessages.find(message =>
            message.action === 'GEMINI_IMAGE_EXTRACTED'
        ));

        expect(fetch.url).toBe('https://cdn.gemini.test/final-result.png');
        expect(extracted.src).toBe(`data:image/png;base64,${Buffer.from('https://cdn.gemini.test/final-result.png').toString('base64')}`);
    }, 12000);

    test('aceita imagem gerada em proporcao extrema como 60x1024', async () => {
        mountEditor();
        appendSendButton({
            onSubmit: () => {
                setTimeout(() => appendImage('https://cdn.gemini.test/tall-thin-result.png', { width: 60, height: 1024 }), 1300);
            },
        });

        await seedJob();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            FETCH_IMAGE_AS_BASE64: (message) => ({ dataUrl: `data:image/png;base64,${Buffer.from(message.url).toString('base64')}` }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const fetch = await waitFor(() => sentMessages.find(message =>
            message.action === 'FETCH_IMAGE_AS_BASE64'
        ));
        const extracted = await waitFor(() => sentMessages.find(message =>
            message.action === 'GEMINI_IMAGE_EXTRACTED'
        ));

        expect(fetch.url).toBe('https://cdn.gemini.test/tall-thin-result.png');
        expect(extracted.src).toBe(`data:image/png;base64,${Buffer.from('https://cdn.gemini.test/tall-thin-result.png').toString('base64')}`);
        expect(sentMessages).toContainEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'GEMINI_IMG_FOUND',
        }));
    }, 12000);

    test('painel manual do Gemini permite marcar imagem gerada que a heuristica automatica rejeitaria', async () => {
        let manualImage = null;
        mountEditor();
        appendSendButton({
            onSubmit: () => {
                setTimeout(() => {
                    manualImage = appendImage('https://cdn.gemini.test/manual-result.png', { width: 30, height: 1024, owner: false });
                }, 1300);
            },
        });

        await seedJob();
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            FETCH_IMAGE_AS_BASE64: (message) => ({ dataUrl: `data:image/png;base64,${Buffer.from(message.url).toString('base64')}` }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const panel = await waitFor(() => document.getElementById('mt-gemini-assist'));
        await waitFor(() => manualImage);
        panel.querySelector('#mt-gemini-pick').click();
        manualImage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        const fetch = await waitFor(() => sentMessages.find(message =>
            message.action === 'FETCH_IMAGE_AS_BASE64'
        ), { timeout: 4000 });
        const manualLog = await waitFor(() => sentMessages.find(message =>
            message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_MANUAL_RESULT'
        ), { timeout: 1000 });

        expect(fetch.url).toBe('https://cdn.gemini.test/manual-result.png');
        expect(manualLog.extra).toEqual(expect.objectContaining({ source: 'image-click' }));
    }, 12000);

    test('CG-41: sucesso persiste e commita antes de qualquer exclusão da conversa', async () => {
        mountEditor();
        appendSendButton({
            onSubmit: () => {
                setTimeout(() => appendImage('https://cdn.gemini.test/result-stage-before-delete.png'), 1300);
            },
        });
        document.body.insertAdjacentHTML('beforeend', `
            <div id="conversation-row">
                <a href="/app/chat-1">Conversa atual</a>
                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>
            </div>
            <div id="delete-item" role="menuitem">Excluir</div>
            <button id="confirm-delete">Excluir</button>
        `);
        const optionsButton = document.getElementById('options-btn');
        const deleteItem = document.getElementById('delete-item');
        const confirmDelete = document.getElementById('confirm-delete');
        optionsButton.scrollIntoView = jest.fn();
        optionsButton.click = jest.fn();
        deleteItem.click = jest.fn();
        confirmDelete.click = jest.fn();

        await seedJob();
        await storageMock.set({ debugMode: false, geminiExecutionMode: 'minimized_window' });
        installResponder({
            GET_TAB_ID: () => ({ tabId: 321 }),
            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),
            GEMINI_IMAGE_EXTRACTED: () => ({ ok: true, staged: true, persisted: true }),
            GEMINI_RESULT_COMMIT: () => ({ ok: true, committed: true }),
        });

        const mod = loadContentGeminiModule();
        processPromises.push(mod.processGeminiJob());

        const staged = await waitFor(() => sentMessages.find(message =>
            message.action === 'GEMINI_IMAGE_EXTRACTED'
        ), { timeout: 12000 });
        const committed = await waitFor(() => sentMessages.find(message =>
            message.action === 'GEMINI_RESULT_COMMIT'
        ), { timeout: 4000 });

        expect(staged).toEqual(expect.objectContaining({
            jobId: 'job-321',
            batchId: 'batch-test',
        }));
        expect(committed).toEqual(expect.objectContaining({
            jobId: 'job-321',
            batchId: 'batch-test',
        }));
        expect(sentMessages.some(message =>
            message.action === 'LOG_ENTRY' && message.action_name === 'DELETE_OK'
        )).toBe(false);
        expect(optionsButton.click).not.toHaveBeenCalled();
        expect(deleteItem.click).not.toHaveBeenCalled();
        expect(confirmDelete.click).not.toHaveBeenCalled();
    }, 20000);
});
```

## 12. Auditoria linha a linha

### Linha 001

- **Código:** `const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa mocks Chrome e loader do content Gemini real.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** `const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');`
- **Função:** Importa mocks Chrome e loader do content Gemini real.
- **Contexto:** imports.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 003

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** `function setWindowLocation(pathname = '/app/chat-1') {`
- **Função:** Controla pathname/href/origin do Gemini para o cenário.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `    Object.defineProperty(window, 'location', {`
- **Função:** Compõe o cenário helper location, preparando, executando ou observando o RPA real.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 006

- **Código:** `        value: {`
- **Função:** Compõe o cenário helper location, preparando, executando ou observando o RPA real.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 007

- **Código:** `            pathname,`
- **Função:** Compõe o cenário helper location, preparando, executando ou observando o RPA real.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 008

- **Código:** `            href: &#96;https://gemini.test${pathname}&#96;,`
- **Função:** Compõe o cenário helper location, preparando, executando ou observando o RPA real.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 009

- **Código:** `            origin: 'https://gemini.test',`
- **Função:** Compõe o cenário helper location, preparando, executando ou observando o RPA real.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `        configurable: true,`
- **Função:** Compõe o cenário helper location, preparando, executando ou observando o RPA real.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `        writable: true,`
- **Função:** Compõe o cenário helper location, preparando, executando ou observando o RPA real.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helper location.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `function installDomApis() {`
- **Função:** Instala polyfills de APIs DOM ausentes no JSDOM.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `    if (typeof window.HTMLElement !== 'undefined' && typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {`
- **Função:** Garante método usado pelo RPA para navegação visual.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `        Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {`
- **Função:** Garante método usado pelo RPA para navegação visual.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `            value: jest.fn(),`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `            configurable: true,`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `            writable: true,`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `    if (typeof window.PointerEvent !== 'function') window.PointerEvent = window.MouseEvent;`
- **Função:** Faz fallback para MouseEvent quando PointerEvent não existe.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `    if (typeof global.PointerEvent !== 'function') global.PointerEvent = window.PointerEvent;`
- **Função:** Faz fallback para MouseEvent quando PointerEvent não existe.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `    if (typeof global.File !== 'function') global.File = window.File;`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `    if (typeof global.Blob !== 'function') global.Blob = window.Blob;`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    if (typeof global.FileReader !== 'function') global.FileReader = window.FileReader;`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `    if (typeof window.DataTransfer !== 'function') {`
- **Função:** Instala DataTransfer mínimo para paste/drop.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `        class MockDataTransfer {`
- **Função:** Instala DataTransfer mínimo para paste/drop.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `            constructor() {`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `                const items = [];`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `                items.add = (item) => items.push(item);`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `                this.items = items;`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `                this._data = new Map();`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `            setData(type, value) {`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `                this._data.set(type, value);`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `            getData(type) {`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `                return this._data.get(type) || '';`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `        window.DataTransfer = MockDataTransfer;`
- **Função:** Instala DataTransfer mínimo para paste/drop.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `    if (typeof global.DataTransfer !== 'function') global.DataTransfer = window.DataTransfer;`
- **Função:** Instala DataTransfer mínimo para paste/drop.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `    if (typeof window.ClipboardEvent !== 'function') {`
- **Função:** Instala ClipboardEvent mínimo com clipboardData.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `        class MockClipboardEvent extends window.Event {`
- **Função:** Instala ClipboardEvent mínimo com clipboardData.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `            constructor(type, init = {}) {`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `                super(type, init);`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `                this.clipboardData = init.clipboardData || null;`
- **Função:** Compõe o cenário polyfills DOM, preparando, executando ou observando o RPA real.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `        window.ClipboardEvent = MockClipboardEvent;`
- **Função:** Instala ClipboardEvent mínimo com clipboardData.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `    if (typeof global.ClipboardEvent !== 'function') global.ClipboardEvent = window.ClipboardEvent;`
- **Função:** Instala ClipboardEvent mínimo com clipboardData.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `    if (typeof window.InputEvent !== 'function') window.InputEvent = window.Event;`
- **Função:** Garante InputEvent disponível.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `    if (typeof global.InputEvent !== 'function') global.InputEvent = window.InputEvent;`
- **Função:** Garante InputEvent disponível.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `    if (typeof global.atob !== 'function') {`
- **Função:** Fornece decodificação base64 em Node/Jest.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `        global.atob = (value) => Buffer.from(value, 'base64').toString('binary');`
- **Função:** Fornece decodificação base64 em Node/Jest.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `function delay(ms = 0) {`
- **Função:** Helper de espera real usado pelo polling do teste.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `    return new Promise(resolve => setTimeout(resolve, ms));`
- **Função:** Agenda efeito tardio de fixture/DOM/storage.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `async function waitFor(predicate, { timeout = 9000, step = 25 } = {}) {`
- **Função:** Poll helper do teste para aguardar efeitos assíncronos do runner.
- **Contexto:** delay/waitFor.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 075

- **Código:** `    let elapsed = 0;`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `    while (elapsed <= timeout) {`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `        // eslint-disable-next-line no-await-in-loop`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `        const result = await predicate();`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `        if (result) return result;`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `        // eslint-disable-next-line no-await-in-loop`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `        await delay(step);`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** `        elapsed += step;`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `    throw new Error('Timeout aguardando condicao');`
- **Função:** Compõe o cenário delay/waitFor, preparando, executando ou observando o RPA real.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `function defineImageMetrics(img, { width = 1024, height = 1536, complete = true } = {}) {`
- **Função:** Fixa dimensões/complete de imagens candidatas.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `    img.scrollIntoView = jest.fn();`
- **Função:** Garante método usado pelo RPA para navegação visual.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `    Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `    Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `    Object.defineProperty(img, 'complete', { value: complete, configurable: true });`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `function appendImage(src, metrics = {}) {`
- **Função:** Cria imagem em model-response ou órfã conforme a fixture.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `    const img = document.createElement('img');`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `    img.src = src;`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `    defineImageMetrics(img, metrics);`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `    if (metrics.owner === false) {`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `        document.body.appendChild(img);`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `    } else {`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** `        const response = document.createElement('model-response');`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** `        response.setAttribute('data-message-author', 'model');`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `        response.appendChild(img);`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `        document.body.appendChild(response);`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `    return img;`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** `function mountEditor({`
- **Função:** Monta editor Gemini, paste/drop e preview opcional.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `    disabled = false,`
- **Função:** Compõe o cenário helpers de imagem, preparando, executando ou observando o RPA real.
- **Contexto:** helpers de imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `    attachThumbnail = true,`
- **Função:** Compõe o cenário estrutura final, preparando, executando ou observando o RPA real.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `    onSubmit = () => {},`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `} = {}) {`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `    if (!document.querySelector('.momentary-indicator')) {`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** `        const indicator = document.createElement('div');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `        indicator.className = 'momentary-indicator';`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `        indicator.textContent = 'conversa momentânea';`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `        document.body.appendChild(indicator);`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `    editor.className = 'ql-editor';`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `    if (disabled) editor.setAttribute('aria-disabled', 'true');`
- **Função:** Configura editor desabilitado no cenário de abort.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** `    editor.innerHTML = '<p></p>';`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 126

- **Código:** `    editor.getBoundingClientRect = () => ({`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** `        x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 120,`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `        width: 640, height: 120, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** `    editor.focus = jest.fn();`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** `    editor.scrollIntoView = jest.fn();`
- **Função:** Garante método usado pelo RPA para navegação visual.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `    editor.addEventListener('paste', (event) => {`
- **Função:** Simula inserção de prompt/attachment via paste.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** `        const dt = event.clipboardData;`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `        const text = dt && typeof dt.getData === 'function' ? dt.getData('text/plain') : '';`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `        if (text) {`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `            editor.querySelector('p').textContent = text;`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `            return;`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `        if (attachThumbnail && dt?.items?.length) {`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `            let preview = document.querySelector('file-preview');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `            if (!preview) {`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `                preview = document.createElement('file-preview');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `                const thumbImg = document.createElement('img');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** `                thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `                Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 149

- **Código:** `                Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 150

- **Código:** `                Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** `                preview.getBoundingClientRect = () => ({`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `                    x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `                    width: 120, height: 90, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** `                });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `                preview.appendChild(thumbImg);`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `                document.body.appendChild(preview);`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `    editor.addEventListener('drop', (event) => {`
- **Função:** Simula attachment via drop.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `        const transfer = event.dataTransfer;`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** `        if (!attachThumbnail || !transfer?.items?.length || document.querySelector('file-preview')) return;`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `        const preview = document.createElement('file-preview');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `        const thumbImg = document.createElement('img');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `        thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `        Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `        Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `        Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `        preview.getBoundingClientRect = () => ({`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `            width: 120, height: 90, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `        preview.appendChild(thumbImg);`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** `        document.body.appendChild(preview);`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 175

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 177

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** `    return editor;`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 179

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** `function appendSendButton({`
- **Função:** Cria botão Send controlável, inclusive hidden/disabled.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `    label = 'send message',`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `    disabled = false,`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `    hidden = false,`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** `    onSubmit = () => {},`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `} = {}) {`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `    const button = document.createElement('button');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 188

- **Código:** `    button.setAttribute('aria-label', label);`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `    button.disabled = disabled;`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 190

- **Código:** `    if (hidden) button.style.display = 'none';`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 191

- **Código:** `    button.getBoundingClientRect = () => ({`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** `        x: 0, y: 0, top: 0, left: 0, right: 40, bottom: 40,`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `        width: 40, height: 40, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `    button.click = jest.fn(() => {`
- **Função:** Torna clique observável e executa callback de submit.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 196

- **Código:** `        const editor = document.querySelector('.ql-editor, [contenteditable="true"]');`
- **Função:** Compõe o cenário fixture editor/attachment, preparando, executando ou observando o RPA real.
- **Contexto:** fixture editor/attachment.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `        if (editor) editor.textContent = '';`
- **Função:** Compõe o cenário estrutura final, preparando, executando ou observando o RPA real.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 198

- **Código:** `        onSubmit();`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 199

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 200

- **Código:** `    document.body.appendChild(button);`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 201

- **Código:** `    return button;`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 202

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 203

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 204

- **Código:** `describe('content_gemini.js - bordas RPA do plano v3.1', () => {`
- **Função:** Abre suíte de bordas RPA reais.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 205

- **Código:** `    let runtimeMock;`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `    let storageMock;`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 207

- **Código:** `    let originalSendMessage;`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 208

- **Código:** `    let sentMessages;`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 209

- **Código:** `    let processPromises;`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 211

- **Código:** `    beforeEach(async () => {`
- **Função:** Reinicializa módulos, DOM, runtime, storage e location.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 212

- **Código:** `        jest.resetModules();`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 213

- **Código:** `        installDomApis();`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 214

- **Código:** `        jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 215

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 216

- **Código:** `            width: 160, height: 48, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 217

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 218

- **Código:** `        setWindowLocation('/app/chat-1');`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 219

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 220

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 222

- **Código:** `        originalSendMessage = runtimeMock.sendMessage;`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 223

- **Código:** `        sentMessages = [];`
- **Função:** Compõe o cenário fixture send button, preparando, executando ou observando o RPA real.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 224

- **Código:** `        processPromises = [];`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** fixture send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 225

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 226

- **Código:** `        runtimeMock._messageListeners = [];`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `        runtimeMock._connectListeners = [];`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 228

- **Código:** `        runtimeMock.lastError = null;`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 229

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 230

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 231

- **Código:** `        await storageMock.clear();`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 232

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 233

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 234

- **Código:** `    afterEach(async () => {`
- **Função:** Para observers, aguarda runners e restaura ambiente.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 235

- **Código:** `        // Os testes observam mensagens intermediárias do runner; isso não garante`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 236

- **Código:** `        // que processGeminiJob() já tenha alcançado seu finally. Pare observers`
- **Função:** Executa bootstrap/claim/runner real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 237

- **Código:** `        // antes de desmontar o DOM e aguarde todos os runners iniciados pelo caso.`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** `        const activeObserver = window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 239

- **Código:** `        if (activeObserver && typeof activeObserver.stop === 'function') {`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 240

- **Código:** `            try { activeObserver.stop(); } catch (_error) {}`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 241

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 242

- **Código:** `        delete window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 243

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 244

- **Código:** `        const observerRegistry = window.__mtGeminiObservers;`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `        if (observerRegistry && typeof observerRegistry === 'object') {`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 246

- **Código:** `            for (const observer of Object.values(observerRegistry)) {`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** `                if (observer && typeof observer.stop === 'function') {`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 248

- **Código:** `                    try { observer.stop(); } catch (_error) {}`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** `                }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 250

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 251

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 252

- **Código:** `        delete window.__mtGeminiObservers;`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 254

- **Código:** `        if (processPromises.length) {`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 255

- **Código:** `            await Promise.allSettled(processPromises);`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 256

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 257

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 258

- **Código:** `        runtimeMock.sendMessage = originalSendMessage;`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 259

- **Código:** `        jest.useRealTimers();`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 260

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 261

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 262

- **Código:** `        await storageMock.clear();`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 263

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 264

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 265

- **Código:** `    function installResponder(responders = {}) {`
- **Função:** Substitui runtime.sendMessage e responde por action.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 266

- **Código:** `        runtimeMock.sendMessage = jest.fn((message, callback) => {`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 267

- **Código:** `            sentMessages.push(message);`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 268

- **Código:** `            const responder = responders[message.action];`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 269

- **Código:** `            if (typeof callback === 'function') {`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 270

- **Código:** `                setTimeout(() => callback(responder ? responder(message) : undefined), 0);`
- **Função:** Agenda efeito tardio de fixture/DOM/storage.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 271

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 272

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 273

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 274

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 275

- **Código:** `    async function seedJob(job = {}) {`
- **Função:** Persiste job canônico na chave gemini_job_321.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 276

- **Código:** `        await storageMock.set({`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 277

- **Código:** `            gemini_job_321: {`
- **Função:** Usa storage durável por tabId no fallback legado de claim.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 278

- **Código:** `                jobId: 'job-321',`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 279

- **Código:** `                batchId: 'batch-test',`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 280

- **Código:** `                mangaTabId: 77,`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 281

- **Código:** `                index: 5,`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 282

- **Código:** `                prompt: 'Traduzir borda do plano',`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 283

- **Código:** `                ...job,`
- **Função:** Compõe o cenário suite/setup/teardown/helpers, preparando, executando ou observando o RPA real.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 284

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 285

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 286

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** suite/setup/teardown/helpers.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 287

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 288

- **Código:** `    test('CG-10: job registrado tardiamente ainda e encontrado pelo loop de tentativas', async () => {`
- **Função:** Declara cenário: CG-10 — job tardio.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 289

- **Código:** `        mountEditor();`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 290

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 291

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 292

- **Código:** `            // Encerra o fluxo logo após provar que o job tardio foi encontrado.`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 293

- **Código:** `            // O comportamento de retry para resposta ausente é coberto separadamente.`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 294

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'payload-invalido' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 295

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 296

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 297

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 298

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 299

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 300

- **Código:** `        setTimeout(() => {`
- **Função:** Agenda efeito tardio de fixture/DOM/storage.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 301

- **Código:** `            storageMock.set({`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 302

- **Código:** `                gemini_job_321: {`
- **Função:** Usa storage durável por tabId no fallback legado de claim.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 303

- **Código:** `                    jobId: 'job-321-late',`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 304

- **Código:** `                    batchId: 'batch-test',`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 305

- **Código:** `                    mangaTabId: 77,`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 306

- **Código:** `                    index: 10,`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 307

- **Código:** `                    prompt: 'Job tardio',`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 308

- **Código:** `                },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 309

- **Código:** `            });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 310

- **Código:** `        }, 650);`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 311

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 312

- **Código:** `        await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 313

- **Código:** `            message.action === 'REQUEST_IMAGE_DATA' && message.index === 10`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 314

- **Código:** `        ), { timeout: 2500 });`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 315

- **Código:** `        await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 316

- **Código:** `            message.action === 'GEMINI_ERROR' && message.index === 10`
- **Função:** Exige/observa erro estruturado do pipeline.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 317

- **Código:** `        ), { timeout: 2500 });`
- **Função:** Compõe o cenário CG-10 — job tardio, preparando, executando ou observando o RPA real.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 318

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-10 — job tardio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 319

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 320

- **Código:** `    test('CG-11: sem job apos 30 tentativas registra JOB_NOT_FOUND e encerra sem crash', async () => {`
- **Função:** Declara cenário: CG-11 — sem job.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 321

- **Código:** `        setWindowLocation('/new-chat');`
- **Função:** Compõe o cenário CG-11 — sem job, preparando, executando ou observando o RPA real.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 322

- **Código:** `        mountEditor();`
- **Função:** Compõe o cenário CG-11 — sem job, preparando, executando ou observando o RPA real.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 323

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-11 — sem job, preparando, executando ou observando o RPA real.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 324

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 325

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 326

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 327

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 328

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** CG-11 — sem job.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 329

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 330

- **Código:** `        const notFoundLog = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário CG-11 — sem job, preparando, executando ou observando o RPA real.
- **Contexto:** CG-11 — sem job.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 331

- **Código:** `            message.action === 'LOG_ENTRY' && message.action_name === 'JOB_NOT_FOUND'`
- **Função:** Exige log quando nenhum job é reivindicado.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 332

- **Código:** `        ), { timeout: 17000, step: 100 });`
- **Função:** Compõe o cenário CG-11 — sem job, preparando, executando ou observando o RPA real.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 333

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 334

- **Código:** `        expect(notFoundLog).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-11 — sem job.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 335

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário CG-11 — sem job, preparando, executando ou observando o RPA real.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 336

- **Código:** `            action_name: 'JOB_NOT_FOUND',`
- **Função:** Exige log quando nenhum job é reivindicado.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 337

- **Código:** `            level: 'warn',`
- **Função:** Compõe o cenário CG-11 — sem job, preparando, executando ou observando o RPA real.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 338

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 339

- **Código:** `        expect(sentMessages.some(message => message.action === 'REQUEST_IMAGE_DATA')).toBe(false);`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** CG-11 — sem job.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 340

- **Código:** `        expect(sentMessages.some(message => message.action === 'GEMINI_ERROR')).toBe(false);`
- **Função:** Exige/observa erro estruturado do pipeline.
- **Contexto:** CG-11 — sem job.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 341

- **Código:** `    }, 20000);`
- **Função:** Compõe o cenário CG-11 — sem job, preparando, executando ou observando o RPA real.
- **Contexto:** CG-11 — sem job.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 342

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 343

- **Código:** `    test('CG-17: REQUEST_IMAGE_DATA com payload que nao e imagem gera GEMINI_ERROR', async () => {`
- **Função:** Declara cenário: CG-17 — payload não-imagem.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 344

- **Código:** `        await seedJob();`
- **Função:** Compõe o cenário CG-17 — payload não-imagem, preparando, executando ou observando o RPA real.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 345

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-17 — payload não-imagem, preparando, executando ou observando o RPA real.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 346

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 347

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'texto puro' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 348

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 349

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 350

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 351

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 352

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 353

- **Código:** `        const error = await waitFor(() => sentMessages.find(message => message.action === 'GEMINI_ERROR'));`
- **Função:** Exige/observa erro estruturado do pipeline.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 354

- **Código:** `        expect(error).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 355

- **Código:** `            mangaTabId: 77,`
- **Função:** Compõe o cenário CG-17 — payload não-imagem, preparando, executando ou observando o RPA real.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 356

- **Código:** `            index: 5,`
- **Função:** Compõe o cenário CG-17 — payload não-imagem, preparando, executando ou observando o RPA real.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 357

- **Código:** `            error: expect.stringContaining('Os dados não são imagem válida'),`
- **Função:** Compõe o cenário CG-17 — payload não-imagem, preparando, executando ou observando o RPA real.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 358

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 359

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-17 — payload não-imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 360

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 361

- **Código:** `    test('REG-12/CG-19/CG-40: editor desabilitado aborta o RPA e limpa o scrollInterval', async () => {`
- **Função:** Declara cenário: REG-12/CG-19/40 — editor desabilitado.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 362

- **Código:** `        mountEditor({ disabled: true });`
- **Função:** Compõe o cenário REG-12/CG-19/40 — editor desabilitado, preparando, executando ou observando o RPA real.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 363

- **Código:** `        const clearIntervalSpy = jest.spyOn(global, 'clearInterval');`
- **Função:** Observa limpeza de intervalos no abort/finally.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 364

- **Código:** `        await seedJob();`
- **Função:** Compõe o cenário REG-12/CG-19/40 — editor desabilitado, preparando, executando ou observando o RPA real.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 365

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário REG-12/CG-19/40 — editor desabilitado, preparando, executando ou observando o RPA real.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 366

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 367

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 368

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 369

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 370

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 371

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 372

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 373

- **Código:** `        const error = await waitFor(() => sentMessages.find(message => message.action === 'GEMINI_ERROR'));`
- **Função:** Exige/observa erro estruturado do pipeline.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 374

- **Código:** `        expect(error.error).toContain('Editor do Gemini está desabilitado');`
- **Função:** Assertion focal do cenário.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 375

- **Código:** `        expect(clearIntervalSpy).toHaveBeenCalled();`
- **Função:** Observa limpeza de intervalos no abort/finally.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 376

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** REG-12/CG-19/40 — editor desabilitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 377

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 378

- **Código:** `    test('CG-21: ausencia de thumbnail bloqueia prompt e submit', async () => {`
- **Função:** Declara cenário: CG-21 — attachment sem confirmação.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 379

- **Código:** `        mountEditor({ attachThumbnail: false });`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 380

- **Código:** `        await seedJob();`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 381

- **Código:** `        jest.useFakeTimers();`
- **Função:** Controla timeout longo do attachment sem esperar relógio real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 382

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 383

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 384

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 385

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 386

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 387

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 388

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 389

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 390

- **Código:** `        for (let i = 0; i < 60; i += 1) {`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 391

- **Código:** `            // eslint-disable-next-line no-await-in-loop`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 392

- **Código:** `            await jest.advanceTimersByTimeAsync(500);`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 393

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 394

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 395

- **Código:** `        const gateLog = sentMessages.find(message =>`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 396

- **Código:** `            message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_ATTACHMENT_NOT_CONFIRMED'`
- **Função:** Exige gate que impede prompt após upload não confirmado.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 397

- **Código:** `        );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 398

- **Código:** `        expect(gateLog).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 399

- **Código:** `            level: 'error',`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 400

- **Código:** `            action_name: 'GEMINI_ATTACHMENT_NOT_CONFIRMED',`
- **Função:** Exige gate que impede prompt após upload não confirmado.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 401

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 402

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 403

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 404

- **Código:** `            action_name: 'ATTACHMENT_STARTED',`
- **Função:** Exige telemetria de início do handshake.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 405

- **Código:** `            level: 'info',`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 406

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 407

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 408

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 409

- **Código:** `            action_name: 'ATTACHMENT_REJECTED',`
- **Função:** Exige telemetria de rejeição.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 410

- **Código:** `            level: 'error',`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 411

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 412

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 413

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 414

- **Código:** `            action_name: 'SUBMIT_BLOCKED_ATTACHMENT',`
- **Função:** Exige que submit seja bloqueado explicitamente.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 415

- **Código:** `            level: 'error',`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 416

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 417

- **Código:** `        expect(sentMessages.some(message =>`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 418

- **Código:** `            message.action === 'LOG_ENTRY' && message.action_name === 'ATTACHMENT_CONFIRMED'`
- **Função:** Observa ausência/presença de confirmação do attachment.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 419

- **Código:** `        )).toBe(false);`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 420

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 421

- **Código:** `            action: 'GEMINI_ERROR',`
- **Função:** Exige/observa erro estruturado do pipeline.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 422

- **Código:** `            error: expect.stringContaining('Anexo não confirmado'),`
- **Função:** Compõe o cenário CG-21 — attachment sem confirmação, preparando, executando ou observando o RPA real.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 423

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 424

- **Código:** `        expect(document.querySelector('.ql-editor').textContent.trim()).toBe('');`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 425

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-21 — attachment sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 426

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 427

- **Código:** `    test('CG-28/CG-29: botoes desabilitados ou ocultos sao ignorados ate achar botao valido', async () => {`
- **Função:** Declara cenário: CG-28/29 — seleção de send button.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 428

- **Código:** `        let submitted = false;`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 429

- **Código:** `        mountEditor();`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 430

- **Código:** `        const disabledButton = appendSendButton({ disabled: true });`
- **Função:** Cria/observa botão send desabilitado que deve ser ignorado.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 431

- **Código:** `        const hiddenButton = appendSendButton({ label: 'enviar agora', hidden: true });`
- **Função:** Cria/observa botão send oculto que deve ser ignorado.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 432

- **Código:** `        const validButton = appendSendButton({`
- **Função:** Cria/observa botão send válido escolhido pelo DOM real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 433

- **Código:** `            label: 'send message',`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 434

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 435

- **Código:** `                submitted = true;`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 436

- **Código:** `                setTimeout(() => appendImage('https://cdn.gemini.test/result-valid-button.png'), 1300);`
- **Função:** Agenda efeito tardio de fixture/DOM/storage.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 437

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 438

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 439

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 440

- **Código:** `        await seedJob();`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 441

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 442

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 443

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 444

- **Código:** `            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:** Observa extração base64 da URL escolhida como resultado.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 445

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 446

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 447

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 448

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 449

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 450

- **Código:** `        await waitFor(() => sentMessages.find(message => message.action === 'GEMINI_IMAGE_EXTRACTED'));`
- **Função:** Observa stage/persistência do resultado.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 451

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 452

- **Código:** `        expect(submitted).toBe(true);`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 453

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 454

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 455

- **Código:** `            action_name: 'ATTACHMENT_STARTED',`
- **Função:** Exige telemetria de início do handshake.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 456

- **Código:** `            level: 'info',`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 457

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 458

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 459

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 460

- **Código:** `            action_name: 'ATTACHMENT_CONFIRMED',`
- **Função:** Observa ausência/presença de confirmação do attachment.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 461

- **Código:** `            level: 'success',`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 462

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 463

- **Código:** `        expect(sentMessages.some(message =>`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 464

- **Código:** `            message.action === 'LOG_ENTRY' &&`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 465

- **Código:** `            ['ATTACHMENT_REJECTED', 'SUBMIT_BLOCKED_ATTACHMENT'].includes(message.action_name)`
- **Função:** Exige telemetria de rejeição.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 466

- **Código:** `        )).toBe(false);`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 467

- **Código:** `        expect(disabledButton.click).not.toHaveBeenCalled();`
- **Função:** Cria/observa botão send desabilitado que deve ser ignorado.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 468

- **Código:** `        expect(hiddenButton.click).not.toHaveBeenCalled();`
- **Função:** Cria/observa botão send oculto que deve ser ignorado.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 469

- **Código:** `        expect(validButton.click).toHaveBeenCalled();`
- **Função:** Cria/observa botão send válido escolhido pelo DOM real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 470

- **Código:** `    }, 12000);`
- **Função:** Compõe o cenário CG-28/29 — seleção de send button, preparando, executando ou observando o RPA real.
- **Contexto:** CG-28/29 — seleção de send button.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 471

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 472

- **Código:** `    test('CG-32/CG-33/CG-34: ignora imagem preexistente, avatar e imagem pequena antes de aceitar resultado valido', async () => {`
- **Função:** Declara cenário: CG-32/33/34 — filtros de imagens.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 473

- **Código:** `        appendImage('https://cdn.gemini.test/pre-existing.png');`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 474

- **Código:** `        mountEditor();`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 475

- **Código:** `        appendSendButton({`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 476

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 477

- **Código:** `                setTimeout(() => {`
- **Função:** Agenda efeito tardio de fixture/DOM/storage.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 478

- **Código:** `                    appendImage('https://cdn.gemini.test/avatar-user.png');`
- **Função:** Cria asset com nome de avatar que deve ser rejeitado.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 479

- **Código:** `                    appendImage('https://cdn.gemini.test/tiny-result.png', { width: 50, height: 50 });`
- **Função:** Cria imagem pequena que não deve vencer heurística.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 480

- **Código:** `                    appendImage('https://cdn.gemini.test/final-result.png', { width: 900, height: 1200 });`
- **Função:** Cria resultado válido esperado.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 481

- **Código:** `                }, 1300);`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 482

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 483

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 484

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 485

- **Código:** `        await seedJob();`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 486

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 487

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 488

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 489

- **Código:** `            FETCH_IMAGE_AS_BASE64: (message) => ({ dataUrl: &#96;data:image/png;base64,${Buffer.from(message.url).toString('base64')}&#96; }),`
- **Função:** Observa extração base64 da URL escolhida como resultado.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 490

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 491

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 492

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 493

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 494

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 495

- **Código:** `        const fetch = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 496

- **Código:** `            message.action === 'FETCH_IMAGE_AS_BASE64'`
- **Função:** Observa extração base64 da URL escolhida como resultado.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 497

- **Código:** `        ));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 498

- **Código:** `        const extracted = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 499

- **Código:** `            message.action === 'GEMINI_IMAGE_EXTRACTED'`
- **Função:** Observa stage/persistência do resultado.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 500

- **Código:** `        ));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 501

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 502

- **Código:** `        expect(fetch.url).toBe('https://cdn.gemini.test/final-result.png');`
- **Função:** Cria resultado válido esperado.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 503

- **Código:** `        expect(extracted.src).toBe(&#96;data:image/png;base64,${Buffer.from('https://cdn.gemini.test/final-result.png').toString('base64')}&#96;);`
- **Função:** Cria resultado válido esperado.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 504

- **Código:** `    }, 12000);`
- **Função:** Compõe o cenário CG-32/33/34 — filtros de imagens, preparando, executando ou observando o RPA real.
- **Contexto:** CG-32/33/34 — filtros de imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 505

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 506

- **Código:** `    test('aceita imagem gerada em proporcao extrema como 60x1024', async () => {`
- **Função:** Declara cenário: resultado extremo 60x1024.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 507

- **Código:** `        mountEditor();`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 508

- **Código:** `        appendSendButton({`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 509

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 510

- **Código:** `                setTimeout(() => appendImage('https://cdn.gemini.test/tall-thin-result.png', { width: 60, height: 1024 }), 1300);`
- **Função:** Agenda efeito tardio de fixture/DOM/storage.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 511

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 512

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 513

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 514

- **Código:** `        await seedJob();`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 515

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 516

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 517

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 518

- **Código:** `            FETCH_IMAGE_AS_BASE64: (message) => ({ dataUrl: &#96;data:image/png;base64,${Buffer.from(message.url).toString('base64')}&#96; }),`
- **Função:** Observa extração base64 da URL escolhida como resultado.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 519

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 520

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 521

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 522

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 523

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 524

- **Código:** `        const fetch = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 525

- **Código:** `            message.action === 'FETCH_IMAGE_AS_BASE64'`
- **Função:** Observa extração base64 da URL escolhida como resultado.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 526

- **Código:** `        ));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 527

- **Código:** `        const extracted = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 528

- **Código:** `            message.action === 'GEMINI_IMAGE_EXTRACTED'`
- **Função:** Observa stage/persistência do resultado.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 529

- **Código:** `        ));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 530

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 531

- **Código:** `        expect(fetch.url).toBe('https://cdn.gemini.test/tall-thin-result.png');`
- **Função:** Cria resultado de proporção extrema aceito pela heurística.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 532

- **Código:** `        expect(extracted.src).toBe(&#96;data:image/png;base64,${Buffer.from('https://cdn.gemini.test/tall-thin-result.png').toString('base64')}&#96;);`
- **Função:** Cria resultado de proporção extrema aceito pela heurística.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 533

- **Código:** `        expect(sentMessages).toContainEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 534

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 535

- **Código:** `            action_name: 'GEMINI_IMG_FOUND',`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 536

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 537

- **Código:** `    }, 12000);`
- **Função:** Compõe o cenário resultado extremo 60x1024, preparando, executando ou observando o RPA real.
- **Contexto:** resultado extremo 60x1024.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 538

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 539

- **Código:** `    test('painel manual do Gemini permite marcar imagem gerada que a heuristica automatica rejeitaria', async () => {`
- **Função:** Declara cenário: HUD manual.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 540

- **Código:** `        let manualImage = null;`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 541

- **Código:** `        mountEditor();`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 542

- **Código:** `        appendSendButton({`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 543

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 544

- **Código:** `                setTimeout(() => {`
- **Função:** Agenda efeito tardio de fixture/DOM/storage.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 545

- **Código:** `                    manualImage = appendImage('https://cdn.gemini.test/manual-result.png', { width: 30, height: 1024, owner: false });`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 546

- **Código:** `                }, 1300);`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 547

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 548

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 549

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 550

- **Código:** `        await seedJob();`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 551

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 552

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 553

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 554

- **Código:** `            FETCH_IMAGE_AS_BASE64: (message) => ({ dataUrl: &#96;data:image/png;base64,${Buffer.from(message.url).toString('base64')}&#96; }),`
- **Função:** Observa extração base64 da URL escolhida como resultado.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 555

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 556

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 557

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** HUD manual.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 558

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** HUD manual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 559

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 560

- **Código:** `        const panel = await waitFor(() => document.getElementById('mt-gemini-assist'));`
- **Função:** Observa/usa HUD manual do runner.
- **Contexto:** HUD manual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 561

- **Código:** `        await waitFor(() => manualImage);`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 562

- **Código:** `        panel.querySelector('#mt-gemini-pick').click();`
- **Função:** Ativa seleção manual da imagem.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 563

- **Código:** `        manualImage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));`
- **Função:** Simula clique do usuário na imagem manual.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 564

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 565

- **Código:** `        const fetch = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 566

- **Código:** `            message.action === 'FETCH_IMAGE_AS_BASE64'`
- **Função:** Observa extração base64 da URL escolhida como resultado.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 567

- **Código:** `        ), { timeout: 4000 });`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 568

- **Código:** `        const manualLog = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 569

- **Código:** `            message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_MANUAL_RESULT'`
- **Função:** Exige log da seleção manual.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 570

- **Código:** `        ), { timeout: 1000 });`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 571

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 572

- **Código:** `        expect(fetch.url).toBe('https://cdn.gemini.test/manual-result.png');`
- **Função:** Assertion focal do cenário.
- **Contexto:** HUD manual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 573

- **Código:** `        expect(manualLog.extra).toEqual(expect.objectContaining({ source: 'image-click' }));`
- **Função:** Assertion focal do cenário.
- **Contexto:** HUD manual.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 574

- **Código:** `    }, 12000);`
- **Função:** Compõe o cenário HUD manual, preparando, executando ou observando o RPA real.
- **Contexto:** HUD manual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 575

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 576

- **Código:** `    test('CG-41: sucesso persiste e commita antes de qualquer exclusão da conversa', async () => {`
- **Função:** Declara cenário: CG-41 — persistência/commit antes de delete.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 577

- **Código:** `        mountEditor();`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 578

- **Código:** `        appendSendButton({`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 579

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 580

- **Código:** `                setTimeout(() => appendImage('https://cdn.gemini.test/result-stage-before-delete.png'), 1300);`
- **Função:** Agenda efeito tardio de fixture/DOM/storage.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 581

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 582

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 583

- **Código:** `        document.body.insertAdjacentHTML('beforeend', &#96;`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 584

- **Código:** `            <div id="conversation-row">`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 585

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 586

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 587

- **Código:** `            </div>`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 588

- **Código:** `            <div id="delete-item" role="menuitem">Excluir</div>`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 589

- **Código:** `            <button id="confirm-delete">Excluir</button>`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 590

- **Código:** `        &#96;);`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 591

- **Código:** `        const optionsButton = document.getElementById('options-btn');`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 592

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 593

- **Código:** `        const confirmDelete = document.getElementById('confirm-delete');`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 594

- **Código:** `        optionsButton.scrollIntoView = jest.fn();`
- **Função:** Garante método usado pelo RPA para navegação visual.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 595

- **Código:** `        optionsButton.click = jest.fn();`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 596

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 597

- **Código:** `        confirmDelete.click = jest.fn();`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 598

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 599

- **Código:** `        await seedJob();`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 600

- **Código:** `        await storageMock.set({ debugMode: false, geminiExecutionMode: 'minimized_window' });`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 601

- **Código:** `        installResponder({`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 602

- **Código:** `            GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Responde compatibilidade legacy para resolver a tab física.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 603

- **Código:** `            REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Modela solicitação de imagem ao mangá.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 604

- **Código:** `            FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:** Observa extração base64 da URL escolhida como resultado.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 605

- **Código:** `            GEMINI_IMAGE_EXTRACTED: () => ({ ok: true, staged: true, persisted: true }),`
- **Função:** Observa stage/persistência do resultado.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 606

- **Código:** `            GEMINI_RESULT_COMMIT: () => ({ ok: true, committed: true }),`
- **Função:** Observa commit do job após stage.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 607

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 608

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 609

- **Código:** `        const mod = loadContentGeminiModule();`
- **Função:** Carrega content_gemini e todos os módulos Gemini reais.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — carrega a cadeia real do content Gemini.

### Linha 610

- **Código:** `        processPromises.push(mod.processGeminiJob());`
- **Função:** Rastreia processGeminiJob iniciados para teardown seguro.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 611

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 612

- **Código:** `        const staged = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 613

- **Código:** `            message.action === 'GEMINI_IMAGE_EXTRACTED'`
- **Função:** Observa stage/persistência do resultado.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 614

- **Código:** `        ), { timeout: 12000 });`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 615

- **Código:** `        const committed = await waitFor(() => sentMessages.find(message =>`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa runner real e aguarda efeito observável.

### Linha 616

- **Código:** `            message.action === 'GEMINI_RESULT_COMMIT'`
- **Função:** Observa commit do job após stage.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 617

- **Código:** `        ), { timeout: 4000 });`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 618

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 619

- **Código:** `        expect(staged).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 620

- **Código:** `            jobId: 'job-321',`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 621

- **Código:** `            batchId: 'batch-test',`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 622

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 623

- **Código:** `        expect(committed).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 624

- **Código:** `            jobId: 'job-321',`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 625

- **Código:** `            batchId: 'batch-test',`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 626

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 627

- **Código:** `        expect(sentMessages.some(message =>`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 628

- **Código:** `            message.action === 'LOG_ENTRY' && message.action_name === 'DELETE_OK'`
- **Função:** Verifica ausência de delete antes da persistência/commit.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 629

- **Código:** `        )).toBe(false);`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 630

- **Código:** `        expect(optionsButton.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 631

- **Código:** `        expect(deleteItem.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 632

- **Código:** `        expect(confirmDelete.click).not.toHaveBeenCalled();`
- **Função:** Assertion focal do cenário.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 633

- **Código:** `    }, 20000);`
- **Função:** Compõe o cenário CG-41 — persistência/commit antes de delete, preparando, executando ou observando o RPA real.
- **Contexto:** CG-41 — persistência/commit antes de delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 634

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 635 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 13. Conclusão documental

Foram documentadas 634 linhas textuais e a posição 635 do newline final. Os dez cenários de integração estão verdes no mesmo blob em Node 20/22; as três solicitações OPEN tratam manutenção semântica, custo de CI e força do teardown sem duplicar lacunas já pertencentes às suítes #175/#177/#181/#182.

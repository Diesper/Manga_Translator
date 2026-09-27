const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { TextEncoder } = require('util');

function _findRoot(d) {
    if (fs.existsSync(path.join(d, 'extension', 'manifest.json'))) return d;
    const p = path.dirname(d);
    return p === d ? process.cwd() : _findRoot(p);
}
const ROOT = _findRoot(__dirname);

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = 2000, interval = 10 } = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        const value = await assertion();
        if (value) return value;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condição');
}

function logMessages(spy, actionName) {
    return spy.mock.calls
        .map(([message]) => message)
        .filter(message => message && message.action === 'LOG_ENTRY' && (!actionName || message.action_name === actionName));
}

describe('content_manga — watchdog do botão flutuante e clique individual', () => {
    let runtimeMock;
    let storageMock;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
        Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('não cria botão quando a visibilidade persistente está desligada', async () => {
        await loadContentScript({
            hostname: 'reader.test',
            floatingButtonEnabled: false,
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        expect(document.getElementById('manga-translator-trigger')).toBeNull();
    });

    test('toggle de visibilidade remove e recria o botão sem registrar falso MISSING', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');

        await loadContentScript({
            hostname: 'reader.test',
            floatingButtonEnabled: true,
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        expect(document.getElementById('manga-translator-trigger')).not.toBeNull();

        await storageMock.set({ floatingButtonEnabled: false });
        await waitFor(() => !document.getElementById('manga-translator-trigger'));

        expect(logMessages(sendSpy, 'FLOATING_BUTTON_MISSING')).toHaveLength(0);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_DISABLED_BY_USER').length).toBeGreaterThanOrEqual(1);

        await storageMock.set({ floatingButtonEnabled: true });
        await waitFor(() => document.getElementById('manga-translator-trigger'));

        expect(logMessages(sendSpy, 'FLOATING_BUTTON_ENABLED_BY_USER').length).toBeGreaterThanOrEqual(1);
    });

    test('remoção externa do DOM gera erro e autocura o botão', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');

        await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const original = document.getElementById('manga-translator-trigger');
        original.remove();

        const recovered = await waitFor(() => document.getElementById('manga-translator-trigger'));
        expect(recovered).not.toBe(original);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_MISSING').length).toBeGreaterThanOrEqual(1);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_RECOVERED').length).toBeGreaterThanOrEqual(1);
    });

    test('PROGRESS recupera botão invisível e registra erro de visibilidade', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const btn = context.getButton();
        btn.style.setProperty('display', 'none', 'important');
        btn.style.setProperty('opacity', '0', 'important');

        await context.sendMessage('PROGRESS', { text: 'TRADUZINDO 1/1' });
        await waitFor(() => context.getButton().style.display === 'flex');

        expect(context.getButton().style.opacity).toBe('1');
        expect(context.getMainContent().textContent).toContain('TRADUZINDO 1/1');
        expect(
            logMessages(sendSpy, 'FLOATING_BUTTON_HIDDEN').length
            + logMessages(sendSpy, 'FLOATING_BUTTON_HIDDEN_DURING_TRANSLATION').length
        ).toBeGreaterThanOrEqual(1);
    });

    test('posição salva fora do viewport é corrigida e persistida', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        await storageMock.set({
            btnPos: { top: '-600px', left: '5000px', width: '220px', height: '48px' },
        });

        await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const btn = document.getElementById('manga-translator-trigger');
        await waitFor(() => parseFloat(btn.style.left) < 1000 && parseFloat(btn.style.top) >= 0);

        expect(parseFloat(btn.style.left)).toBeLessThanOrEqual(1024 - 220);
        expect(parseFloat(btn.style.top)).toBeGreaterThanOrEqual(8);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_OFFSCREEN').length).toBeGreaterThanOrEqual(1);

        const stored = await storageMock.get(['btnPos']);
        expect(parseFloat(stored.btnPos.left)).toBeLessThanOrEqual(1024 - 220);
        expect(parseFloat(stored.btnPos.top)).toBeGreaterThanOrEqual(8);
    });

    test('GET_FLOATING_BUTTON_STATUS diferencia habilitado, presente e ocultado', async () => {
        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const before = await context.sendMessage('GET_FLOATING_BUTTON_STATUS');
        expect(before).toEqual(expect.objectContaining({
            success: true,
            enabled: true,
            expected: true,
            present: true,
        }));

        await context.sendMessage('SET_FLOATING_BUTTON_VISIBILITY', { enabled: false });
        await waitFor(() => !document.getElementById('manga-translator-trigger'));

        const after = await context.sendMessage('GET_FLOATING_BUTTON_STATUS');
        expect(after).toEqual(expect.objectContaining({
            success: true,
            enabled: false,
            expected: false,
            present: false,
        }));
    });

    test('clique individual desligado não interfere no clique normal da imagem', async () => {
        await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: false,
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const img = document.querySelector('img');
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 100 });
        const allowed = img.dispatchEvent(event);

        expect(allowed).toBe(true);
        expect(document.getElementById('manga-single-image-action')).toBeNull();
    });

    test('clique individual só oferece tradução para imagem elegível e não banida', async () => {
        await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            bannedImages: ['https://reader.test/banned.png'],
            domImages: [
                { src: 'https://reader.test/small.png', width: 80, height: 80 },
                { src: 'https://reader.test/banned.png', width: 800, height: 1200 },
                { src: 'https://reader.test/ok.png', width: 800, height: 1200 },
            ],
        });

        document.querySelector('[data-testid="img-0"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        await delay(30);
        expect(document.getElementById('manga-single-image-action')).toBeNull();

        document.querySelector('[data-testid="img-1"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        await delay(30);
        expect(document.getElementById('manga-single-image-action')).toBeNull();

        document.querySelector('[data-testid="img-2"]').dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 120,
            clientY: 140,
        }));
        await waitFor(() => document.getElementById('manga-single-image-action'));

        expect(document.getElementById('manga-single-image-translate')).not.toBeNull();
        document.getElementById('manga-single-image-cancel').click();
        expect(document.getElementById('manga-single-image-action')).toBeNull();
    });

    test('imagem já traduzida não abre ação de tradução individual', async () => {
        await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [{
                src: 'https://reader.test/translated.png',
                width: 800,
                height: 1200,
                attributes: { 'data-translated': 'true' },
            }],
        });

        document.querySelector('img').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        await delay(30);
        expect(document.getElementById('manga-single-image-action')).toBeNull();
    });

    test('confirmação individual recalcula o índice quando o DOM muda antes de traduzir', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [
                { src: 'https://reader.test/p1.png', width: 800, height: 1200 },
                { src: 'https://reader.test/p2.png', width: 800, height: 1200 },
            ],
        });

        const target = document.querySelector('[data-testid="img-1"]');
        target.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 100,
            clientY: 100,
        }));
        await waitFor(() => document.getElementById('manga-single-image-action'));

        const inserted = document.createElement('img');
        inserted.src = 'https://reader.test/inserted.png';
        Object.defineProperty(inserted, 'naturalWidth', { value: 800, configurable: true });
        Object.defineProperty(inserted, 'naturalHeight', { value: 1200, configurable: true });
        document.body.insertBefore(inserted, document.body.firstChild);

        document.getElementById('manga-single-image-translate').click();

        const requestLog = await waitFor(() => {
            const logs = logMessages(sendSpy, 'SINGLE_IMAGE_TRANSLATION_REQUEST');
            return logs.length ? logs[logs.length - 1] : null;
        });
        expect(requestLog.extra.index).toBe(2);
        expect(requestLog.extra.cleanUrl).toContain('/p2.png');

        // Interrompe o lote logo após validar a seleção para não deixar timer de
        // watchdog ativo no restante da suíte.
        await waitFor(() => sendSpy.mock.calls.some(([message]) =>
            message && message.action === 'START_BATCH'
        ));
        const main = context.getMainContent();
        if (main) main.click();
        await delay(20);
    });

    test('desativar o site remove o botão sem autocura', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        await context.sendMessage('DISABLE_PAGE');
        await waitFor(() => !document.getElementById('manga-translator-trigger'));
        await delay(30);

        expect(logMessages(sendSpy, 'FLOATING_BUTTON_MISSING')).toHaveLength(0);
    });

    test('remoção durante lote ativo registra erro grave e recria com o progresso mais recente', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const startPromise = context.sendMessage('START_TRANSLATION_FROM_POPUP', { indices: [0] });
        await delay(5);
        const oldButton = context.getButton();
        expect(oldButton).not.toBeNull();
        oldButton.remove();

        await context.sendMessage('PROGRESS', { text: 'TRADUZINDO 1/1 — TESTE' });
        const recovered = await waitFor(() => {
            const button = context.getButton();
            return button && button !== oldButton ? button : null;
        });

        // O pipeline pode emitir um progresso ainda mais novo depois da mensagem
        // manual usada para forçar a recuperação. O contrato é que o botão
        // recriado continue refletindo estado de tradução, nunca volte a
        // "TRADUZIR PÁGINAS".
        const recoveredText = context.getMainContent().textContent;
        expect(recoveredText).toContain('STOP');
        expect(recoveredText).not.toContain('TRADUZIR PÁGINAS');
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_MISSING_DURING_TRANSLATION').length).toBeGreaterThanOrEqual(1);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_RECOVERED').length).toBeGreaterThanOrEqual(1);

        await context.sendMessage('BATCH_COMPLETE', { hasErrors: false });
        await startPromise;
    });

    test('imagem removida entre clique e confirmação aborta sem iniciar tradução', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [{ src: 'https://reader.test/remove-before-confirm.png', width: 800, height: 1200 }],
        });

        // A previous content-script instance can finish an asynchronous batch
        // after this spy is installed. Only this click's messages are relevant.
        sendSpy.mockClear();

        const img = document.querySelector('img');
        img.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 80,
            clientY: 90,
        }));
        await waitFor(() => document.getElementById('manga-single-image-action'));

        img.remove();
        document.getElementById('manga-single-image-translate').click();
        await delay(30);

        expect(document.getElementById('manga-single-image-action')).toBeNull();
        expect(logMessages(sendSpy, 'SINGLE_IMAGE_TRANSLATION_ABORTED').length).toBeGreaterThanOrEqual(1);
        expect(sendSpy.mock.calls.some(([message]) => message && message.action === 'START_BATCH')).toBe(false);
    });

    test('clique individual durante tradução ativa não abre segundo fluxo', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [
                { src: 'https://reader.test/p1.png', width: 800, height: 1200 },
                { src: 'https://reader.test/p2.png', width: 800, height: 1200 },
            ],
        });

        context.sendMessage('START_TRANSLATION_FROM_POPUP', { indices: [0] });
        await delay(5);

        document.querySelector('[data-testid="img-1"]').dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 100,
            clientY: 120,
        }));
        await delay(30);

        expect(document.getElementById('manga-single-image-action')).toBeNull();
        expect(logMessages(sendSpy, 'SINGLE_IMAGE_TRANSLATION_BLOCKED').length).toBeGreaterThanOrEqual(1);

        await context.sendMessage('BATCH_COMPLETE', { hasErrors: false });
    });


    test('banir a imagem enquanto a confirmação individual está aberta fecha a ação imediatamente', async () => {
        await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [{ src: 'https://reader.test/becomes-banned.png', width: 800, height: 1200 }],
        });

        const img = document.querySelector('img');
        img.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 90,
            clientY: 110,
        }));
        await waitFor(() => document.getElementById('manga-single-image-action'));

        await storageMock.set({
            'bannedImages_reader.test': ['https://reader.test/becomes-banned.png'],
        });
        await waitFor(() => !document.getElementById('manga-single-image-action'));

        expect(document.getElementById('manga-single-image-action')).toBeNull();
    });

});

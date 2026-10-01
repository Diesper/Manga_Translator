'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const {
  loadContentScript,
  getMangaContentScriptRelativePaths,
} = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
const {
  getRuntimeMock,
  getStorageMock,
} = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

describe('load-content-script helper selftest', () => {
  let runtimeMock;
  let storageMock;

  beforeEach(async () => {
    runtimeMock = getRuntimeMock();
    storageMock = getStorageMock();
    runtimeMock._messageListeners = [];
    runtimeMock._connectListeners = [];
    runtimeMock.lastError = null;
    storageMock._listeners = [];
    await storageMock.clear();
    delete window.__manga_translator_content_injected;
    delete window.__manga_translator_active_instance;
    delete window.MangaTranslatorGtcFingerprint;
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    runtimeMock._messageListeners = [];
    storageMock._listeners = [];
    await storageMock.clear();
    delete window.__manga_translator_content_injected;
    delete window.__manga_translator_active_instance;
    delete window.MangaTranslatorGtcFingerprint;
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('JSDoc de loadContentScript permanece anexado à função pública', () => {
    const source = fs.readFileSync(path.join(ROOT, 'tests/helpers/load-content-script.js'), 'utf8');
    const signature = '*/\nasync function loadContentScript({';
    const jsdoc = '@returns {Promise<Object>} Helpers { sendMessage, getButton, getMainContent }';

    expect(source).toContain(jsdoc);
    expect(source.indexOf(jsdoc)).toBeLessThan(source.indexOf(signature));
    expect(source).toContain(signature);
  });
  test('deriva o bundle Manga diretamente do manifest atual', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'extension/manifest.json'), 'utf8')
    );
    const mangaEntry = manifest.content_scripts.find(entry =>
      Array.isArray(entry.js) && entry.js.includes('content/content_manga.js')
    );

    expect(mangaEntry).toBeTruthy();
    expect(getMangaContentScriptRelativePaths()).toEqual(mangaEntry.js);
  });

  test('fixture de imagem usa DOM API e não transforma valor de atributo em markup', async () => {
    const injectedValue = '" onerror="globalThis.__fixtureInjected = true';
    await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
      domImages: [{
        src: 'https://reader.test/panel.png',
        width: 800,
        height: 1200,
        attributes: { 'data-note': injectedValue },
      }],
    });

    const img = document.querySelector('[data-testid="img-0"]');
    expect(img).toBeTruthy();
    expect(img.getAttribute('data-note')).toBe(injectedValue);
    expect(img.hasAttribute('onerror')).toBe(false);
    expect(globalThis.__fixtureInjected).toBeUndefined();
  });

  test('instrumentação restaura a forma original de addEventListener', async () => {
    const windowHadOwn = Object.prototype.hasOwnProperty.call(window, 'addEventListener');
    const documentHadOwn = Object.prototype.hasOwnProperty.call(document, 'addEventListener');
    const windowMethod = window.addEventListener;
    const documentMethod = document.addEventListener;

    await loadContentScript({ hostname: 'reader.test', floatingButtonEnabled: false });

    expect(Object.prototype.hasOwnProperty.call(window, 'addEventListener')).toBe(windowHadOwn);
    expect(Object.prototype.hasOwnProperty.call(document, 'addEventListener')).toBe(documentHadOwn);
    expect(window.addEventListener).toBe(windowMethod);
    expect(document.addEventListener).toBe(documentMethod);
  });
  test('reinjeção aciona o teardown da instância anterior', async () => {
    await loadContentScript({ hostname: 'reader.test', floatingButtonEnabled: false });

    let count = 0;
    const onPageHide = () => { count += 1; };
    window.addEventListener('pagehide', onPageHide, { once: true });

    await loadContentScript({ hostname: 'reader.test', floatingButtonEnabled: false });

    expect(count).toBe(1);
  });
  test('reinjeção remove listeners globais adicionados pelo bundle', async () => {
    await loadContentScript({ hostname: 'reader.test', floatingButtonEnabled: false });

    const windowRemoveSpy = jest.spyOn(window, 'removeEventListener');
    const documentRemoveSpy = jest.spyOn(document, 'removeEventListener');

    await loadContentScript({ hostname: 'reader.test', floatingButtonEnabled: false });

    expect(windowRemoveSpy.mock.calls.some(([type]) => type === 'resize')).toBe(true);
    expect(windowRemoveSpy.mock.calls.some(([type]) => type === 'pagehide')).toBe(true);
    expect(documentRemoveSpy.mock.calls.some(([type]) => type === 'contextmenu')).toBe(true);
  });
  test('reinjeção remove listeners de storage da carga anterior', async () => {
    await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    const firstListeners = [...storageMock._listeners];
    expect(firstListeners.length).toBeGreaterThan(0);

    await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    const secondListeners = [...storageMock._listeners];

    expect(secondListeners).toHaveLength(firstListeners.length);
    for (const listener of firstListeners) {
      expect(secondListeners).not.toContain(listener);
    }
  });

  test('reinjeção remove listeners runtime da carga anterior', async () => {
    await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    const firstListeners = [...runtimeMock._messageListeners];
    expect(firstListeners.length).toBeGreaterThan(0);

    await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    const secondListeners = [...runtimeMock._messageListeners];

    expect(secondListeners).toHaveLength(firstListeners.length);
    for (const listener of firstListeners) {
      expect(secondListeners).not.toContain(listener);
    }
  });

  test('cleanup sobrevive a jest.resetModules e reimport do helper', async () => {
    await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    const firstStorageListeners = [...storageMock._listeners];
    const firstRuntimeListeners = [...runtimeMock._messageListeners];
    expect(firstStorageListeners.length).toBeGreaterThan(0);
    expect(firstRuntimeListeners.length).toBeGreaterThan(0);

    jest.resetModules();
    const reloaded = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
    await reloaded.loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });

    const secondStorageListeners = [...storageMock._listeners];
    const secondRuntimeListeners = [...runtimeMock._messageListeners];
    expect(secondStorageListeners).toHaveLength(firstStorageListeners.length);
    expect(secondRuntimeListeners).toHaveLength(firstRuntimeListeners.length);
    for (const listener of firstStorageListeners) {
      expect(secondStorageListeners).not.toContain(listener);
    }
    for (const listener of firstRuntimeListeners) {
      expect(secondRuntimeListeners).not.toContain(listener);
    }
  });

  test('falha parcial de bundle faz teardown e remove listeners registrados antes do erro', async () => {
    let pagehideCount = 0;
    window.addEventListener('pagehide', () => { pagehideCount += 1; }, { once: true });
    const documentRemoveSpy = jest.spyOn(document, 'removeEventListener');
    const manifestPath = path.join(ROOT, 'extension/manifest.json');
    const realReadFileSync = fs.readFileSync.bind(fs);
    jest.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => {
      const content = realReadFileSync(file, ...args);
      if (path.resolve(String(file)) !== manifestPath) return content;

      const manifest = JSON.parse(String(content));
      const mangaEntry = manifest.content_scripts.find(entry =>
        Array.isArray(entry.js) && entry.js.includes('content/content_manga.js')
      );
      mangaEntry.js = [...mangaEntry.js, 'content/__missing_selftest__.js'];
      return JSON.stringify(manifest);
    });

    await expect(loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    })).rejects.toThrow('__missing_selftest__');

    expect(pagehideCount).toBe(1);
    expect(
      documentRemoveSpy.mock.calls.filter(([type]) => type === 'contextmenu').length
    ).toBeGreaterThanOrEqual(2);
    expect(storageMock._listeners).toHaveLength(0);
    expect(runtimeMock._messageListeners).toHaveLength(0);
  });

  test('sendMessage cancela fallback quando listener responde imediatamente', async () => {
    const context = await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    runtimeMock._messageListeners = [
      (_request, _sender, sendResponse) => sendResponse({ ok: true }),
    ];

    jest.useFakeTimers();
    const promise = context.sendMessage('PING');
    await expect(promise).resolves.toEqual({ ok: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('sendMessage preserva resposta assíncrona que chega antes do fallback', async () => {
    const context = await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    runtimeMock._messageListeners = [
      (_request, _sender, sendResponse) => {
        setTimeout(() => sendResponse({ async: true }), 20);
        return true;
      },
    ];

    jest.useFakeTimers();
    const promise = context.sendMessage('ASYNC_EARLY');
    expect(jest.getTimerCount()).toBe(2);
    jest.advanceTimersByTime(20);
    await expect(promise).resolves.toEqual({ async: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('sendMessage usa fallback de 500 ms quando listener retorna true sem responder', async () => {
    const context = await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    runtimeMock._messageListeners = [
      () => true,
    ];

    jest.useFakeTimers();
    const promise = context.sendMessage('ASYNC_NO_RESPONSE');
    let settled = false;
    promise.then(() => { settled = true; });

    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(449);
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(promise).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('sendMessage resolve null após 50 ms quando nenhum listener responde', async () => {
    const context = await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    runtimeMock._messageListeners = [];

    jest.useFakeTimers();
    const promise = context.sendMessage('NO_LISTENER');
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(50);
    await expect(promise).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('sendMessage honra return true e permite resposta assíncrona além de 50 ms', async () => {
    const context = await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });

    jest.useFakeTimers();
    runtimeMock._messageListeners = [
      (_request, _sender, sendResponse) => {
        setTimeout(() => sendResponse({ async: true }), 75);
        return true;
      },
    ];

    const promise = context.sendMessage('ASYNC');
    jest.advanceTimersByTime(75);
    await expect(promise).resolves.toEqual({ async: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('argumento action não pode ser sobrescrito por extra.action', async () => {
    const context = await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    let received;
    runtimeMock._messageListeners = [
      (request, _sender, sendResponse) => {
        received = request;
        sendResponse({ ok: true });
      },
    ];

    await expect(context.sendMessage('CANONICAL', {
      action: 'OVERRIDE',
      value: 7,
    })).resolves.toEqual({ ok: true });

    expect(received).toEqual({ action: 'CANONICAL', value: 7 });
  });

  test('throw antes do settlement rejeita e limpa fallback', async () => {
    const context = await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    runtimeMock._messageListeners = [
      () => { throw new Error('listener boom'); },
    ];

    jest.useFakeTimers();
    const promise = context.sendMessage('THROW');
    await expect(promise).rejects.toThrow('listener boom');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('throw tardio não sobrescreve resposta já resolvida', async () => {
    const context = await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    runtimeMock._messageListeners = [
      (_request, _sender, sendResponse) => sendResponse({ first: true }),
      () => { throw new Error('late boom'); },
    ];

    jest.useFakeTimers();
    const promise = context.sendMessage('FIRST_WINS');
    await expect(promise).resolves.toEqual({ first: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('bootstrap incompleto faz teardown e rejeita com timeout causal', async () => {
    let pagehideCount = 0;
    window.addEventListener('pagehide', () => { pagehideCount += 1; }, { once: true });
    const documentRemoveSpy = jest.spyOn(document, 'removeEventListener');
    const originalGet = storageMock.get.bind(storageMock);
    jest.spyOn(storageMock, 'get').mockImplementation((keys, callback) => {
      if (Array.isArray(keys) && keys.includes('enabledDomains')) {
        return Promise.resolve({});
      }
      return originalGet(keys, callback);
    });

    await expect(loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: true,
      readyTimeoutMs: 20,
    })).rejects.toThrow('Timeout aguardando botão do content_manga ficar pronto após 20 ms');

    expect(pagehideCount).toBe(1);
    expect(
      documentRemoveSpy.mock.calls.filter(([type]) => type === 'contextmenu').length
    ).toBeGreaterThanOrEqual(2);
    expect(storageMock._listeners).toHaveLength(0);
    expect(runtimeMock._messageListeners).toHaveLength(0);
    expect(document.getElementById('manga-translator-trigger')).toBeNull();
  });
});

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

  test('cleanup sobrevive a jest.resetModules e reimport do helper', async () => {
    await loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });
    const firstListeners = [...storageMock._listeners];
    expect(firstListeners.length).toBeGreaterThan(0);

    jest.resetModules();
    const reloaded = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
    await reloaded.loadContentScript({
      hostname: 'reader.test',
      floatingButtonEnabled: false,
    });

    const secondListeners = [...storageMock._listeners];
    expect(secondListeners).toHaveLength(firstListeners.length);
    for (const listener of firstListeners) {
      expect(secondListeners).not.toContain(listener);
    }
  });

  test('falha parcial de bundle remove listeners registrados antes do erro', async () => {
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

    expect(storageMock._listeners).toHaveLength(0);
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

  test('bootstrap incompleto rejeita com timeout causal', async () => {
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

    expect(storageMock._listeners).toHaveLength(0);
    expect(document.getElementById('manga-translator-trigger')).toBeNull();
  });
});

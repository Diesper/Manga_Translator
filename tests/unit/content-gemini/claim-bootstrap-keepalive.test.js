'use strict';

const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');
const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');

function setWindowLocation(pathname = '/new-chat', search = '') {
  const href = `https://gemini.test${pathname}${search}`;
  Object.defineProperty(window, 'location', {
    value: {
      pathname,
      href,
      origin: 'https://gemini.test',
      search,
    },
    configurable: true,
    writable: true,
  });
}

function createPort() {
  const disconnectListeners = [];
  const port = {
    name: 'gemini-keep-alive',
    onDisconnect: {
      addListener(fn) { disconnectListeners.push(fn); },
      removeListener(fn) {
        const index = disconnectListeners.indexOf(fn);
        if (index >= 0) disconnectListeners.splice(index, 1);
      },
    },
    disconnect: jest.fn(() => {
      disconnectListeners.slice().forEach(fn => fn(port));
    }),
    _simulateDisconnect() {
      disconnectListeners.slice().forEach(fn => fn(port));
    },
  };
  return port;
}

describe('content_gemini.js - claim bootstrap e keep-alive', () => {
  let runtime;
  let storage;
  let originalSendMessage;
  let originalConnect;
  let sentMessages;

  beforeEach(async () => {
    jest.resetModules();
    jest.useRealTimers();
    delete window.__mt_gemini_started;
    document.documentElement.innerHTML = '<head></head><body><div id="manual-sentinel">manual</div></body>';

    runtime = getRuntimeMock();
    storage = getStorageMock();
    originalSendMessage = runtime.sendMessage;
    originalConnect = runtime.connect;
    sentMessages = [];

    runtime._messageListeners = [];
    runtime._connectListeners = [];
    runtime.lastError = null;
    await storage.clear();
    setWindowLocation();
  });

  afterEach(async () => {
    runtime.sendMessage = originalSendMessage;
    runtime.connect = originalConnect;
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete window.__mt_gemini_started;
    await storage.clear();
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  function installResponder(responder) {
    runtime.sendMessage = jest.fn((message, callback) => {
      sentMessages.push(message);
      const response = responder(message);
      if (typeof callback === 'function') {
        setTimeout(() => callback(response), 0);
      }
    });
  }

  test('KEEP-01: aba Gemini manual com claim nulo fica inerte e não abre keep-alive', async () => {
    const before = document.body.innerHTML;
    const connectSpy = jest.spyOn(runtime, 'connect');

    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') return { ok: true, job: null };
      return undefined;
    });

    const mod = loadContentGeminiModule();
    await mod.processGeminiJob();

    expect(connectSpy).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe(before);
    expect(sentMessages.some(message => message.action === 'REQUEST_IMAGE_DATA')).toBe(false);
    expect(sentMessages.filter(message => message.action === 'CLAIM_GEMINI_JOB')).toHaveLength(1);
  });

  test('KEEP-02/KEEP-03: claim válido abre uma porta e o fim do job a desconecta', async () => {
    setWindowLocation('/app', '?mangatranslator=true&jobId=job-321');
    const port = createPort();
    const connectSpy = jest.spyOn(runtime, 'connect').mockImplementation(() => port);

    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') {
        return {
          ok: true,
          job: {
            jobId: 'job-321',
            batchId: 'batch-1',
            mangaTabId: 77,
            index: 5,
            prompt: 'translate',
            executionMode: 'temp_chat',
            geminiTabId: 321,
          },
        };
      }
      if (message.action === 'REQUEST_IMAGE_DATA') return { srcData: 'payload-invalido' };
      return undefined;
    });

    const mod = loadContentGeminiModule();
    await mod.processGeminiJob();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith({ name: 'gemini-keep-alive' });
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(sentMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'GEMINI_ERROR', jobId: 'job-321' }),
    ]));
  });

  test('KEEP-04: desconexão durante job ativo tenta reconectar no máximo uma vez', async () => {
    jest.useFakeTimers();
    const firstPort = createPort();
    const secondPort = createPort();
    const connectSpy = jest.spyOn(runtime, 'connect')
      .mockImplementationOnce(() => firstPort)
      .mockImplementationOnce(() => secondPort);

    const mod = loadContentGeminiModule();
    mod.openKeepAlive();
    expect(connectSpy).toHaveBeenCalledTimes(1);

    firstPort._simulateDisconnect();
    await jest.advanceTimersByTimeAsync(250);
    expect(connectSpy).toHaveBeenCalledTimes(2);

    secondPort._simulateDisconnect();
    await jest.advanceTimersByTimeAsync(1000);
    expect(connectSpy).toHaveBeenCalledTimes(2);

    mod.closeKeepAlive();
  });

  test('KEEP-05: close explícito encerra o job e não reconecta a porta', async () => {
    jest.useFakeTimers();
    const port = createPort();
    const connectSpy = jest.spyOn(runtime, 'connect').mockImplementation(() => port);

    const mod = loadContentGeminiModule();
    mod.openKeepAlive();
    mod.closeKeepAlive();

    await jest.advanceTimersByTimeAsync(1000);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });

  test('claim com jobId na URL faz retry limitado antes de desistir', async () => {
    setWindowLocation('/app', '?mangatranslator=true&jobId=late-job');

    let claimCalls = 0;
    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') {
        claimCalls += 1;
        if (claimCalls >= 3) {
          return {
            ok: true,
            job: {
              jobId: 'late-job',
              batchId: 'batch-1',
              mangaTabId: 77,
              index: 2,
              prompt: 'late',
              executionMode: 'temp_chat',
              geminiTabId: 456,
            },
          };
        }
        return { ok: true, job: null };
      }
      return undefined;
    });

    const mod = loadContentGeminiModule();
    await expect(mod.claimGeminiJob({ timeoutMs: 2500 })).resolves.toEqual(expect.objectContaining({
      jobId: 'late-job',
      geminiTabId: 456,
    }));
    expect(claimCalls).toBe(3);
    expect(sentMessages.filter(message => message.action === 'CLAIM_GEMINI_JOB'))
      .toEqual(Array(3).fill(expect.objectContaining({ jobId: 'late-job' })));
  }, 5000);

  test('KEEP-06: fallback legado espera GET_TAB_ID e só devolve o job cujo jobId veio da URL', async () => {
    setWindowLocation('/app', '?mangatranslator=true&jobId=legacy-job');
    await storage.set({
      gemini_job_321: {
        jobId: 'legacy-job',
        prompt: 'legacy prompt',
        mangaTabId: 77,
        index: 4,
      },
    });

    let tabIdCalls = 0;
    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') return undefined;
      if (message.action === 'GET_TAB_ID') {
        tabIdCalls += 1;
        return tabIdCalls >= 3 ? { tabId: 321 } : undefined;
      }
      return undefined;
    });

    const mod = loadContentGeminiModule();
    await expect(mod.claimGeminiJob({ timeoutMs: 1500 })).resolves.toEqual({
      jobId: 'legacy-job',
      prompt: 'legacy prompt',
      mangaTabId: 77,
      index: 4,
      geminiTabId: 321,
    });

    expect(tabIdCalls).toBe(3);
    expect(sentMessages[0]).toEqual({ action: 'CLAIM_GEMINI_JOB', jobId: 'legacy-job' });
  });

  test.each([
    ['different jobId', '?jobId=current-job', 'stale-job'],
    ['missing jobId', '', 'stale-job'],
  ])('KEEP-07/08: fallback legado rejeita registro residual com %s', async (_label, search, storedJobId) => {
    setWindowLocation('/app', search);
    await storage.set({
      gemini_job_321: {
        jobId: storedJobId,
        prompt: 'must-not-be-disclosed',
      },
    });
    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') return undefined;
      if (message.action === 'GET_TAB_ID') return { tabId: 321 };
      return undefined;
    });

    const mod = loadContentGeminiModule();
    await expect(mod.claimGeminiJob({ timeoutMs: 0 })).resolves.toBeNull();
  });

  test('KEEP-09: claim suportado desiste no timeout sem entrar no fallback de storage', async () => {
    jest.useFakeTimers();
    setWindowLocation('/app', '?jobId=never-available');
    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') return { ok: true, job: null };
      return undefined;
    });

    const mod = loadContentGeminiModule();
    const claim = mod.claimGeminiJob({ timeoutMs: 1200 });
    await jest.runAllTimersAsync();
    await expect(claim).resolves.toBeNull();

    expect(sentMessages.filter(message => message.action === 'CLAIM_GEMINI_JOB')).toHaveLength(3);
    expect(sentMessages.some(message => message.action === 'GET_TAB_ID')).toBe(false);
  });

  test('KEEP-09: close depois de disconnect cancela o callback de reconnect já agendado', async () => {
    jest.useFakeTimers();
    const port = createPort();
    const connectSpy = jest.spyOn(runtime, 'connect').mockImplementation(() => port);

    const mod = loadContentGeminiModule();
    mod.openKeepAlive();
    port._simulateDisconnect();
    mod.closeKeepAlive();

    await jest.advanceTimersByTimeAsync(1000);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  test('KEEP-10: falha de connect inicial e de reconnect não propaga nem cria loop', async () => {
    jest.useFakeTimers();
    const port = createPort();
    const connectSpy = jest.spyOn(runtime, 'connect')
      .mockImplementationOnce(() => port)
      .mockImplementationOnce(() => { throw new Error('runtime unavailable'); });

    const mod = loadContentGeminiModule();
    expect(() => mod.openKeepAlive()).not.toThrow();
    port._simulateDisconnect();
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(1000);

    expect(connectSpy).toHaveBeenCalledTimes(2);
    mod.closeKeepAlive();

    const initialFailure = connectSpy.mockReset()
      .mockImplementation(() => { throw new Error('runtime unavailable'); });
    expect(() => mod.openKeepAlive()).not.toThrow();
    expect(initialFailure).toHaveBeenCalledTimes(1);
    mod.closeKeepAlive();
  });
});

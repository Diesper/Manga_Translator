'use strict';

const path = require('path');

const RUNNER_PATH = path.resolve(
  __dirname,
  '../../../extension/gemini/job-runner.js'
);
const SELECTORS_PATH = path.resolve(
  __dirname,
  '../../../extension/gemini/selectors.js'
);
const DOM_PATH = path.resolve(
  __dirname,
  '../../../extension/gemini/dom.js'
);

function loadModule() {
  let api;
  jest.isolateModules(() => {
    api = require(RUNNER_PATH);
  });
  return api;
}

function baseDependencies(overrides = {}) {
  const runtimeMessages = [];
  const runtime = {
    lastError: null,
    sendMessage: jest.fn((message, callback) => {
      runtimeMessages.push(message);
      if (callback) callback(null);
    }),
  };

  const storage = {
    get: jest.fn((keys, callback) => callback({})),
  };

  const domApi = {
    getImageSource: image => image?.src || '',
    isIgnoredGeminiImageSource: () => false,
    isModelResponseImage: () => false,
    findAllDeep: () => [],
    getEditableElement: element => element,
    findSendButton: () => null,
  };

  const deletionController = {
    recoverPending: jest.fn(async () => ({
      handled: false,
      deleted: false,
      recovery: null,
    })),
    deleteCurrentConversation: jest.fn(async () => true),
    deleteOrScheduleRecovery: jest.fn(async () => ({
      deleted: true,
      recoverySaved: false,
      reloadScheduled: false,
    })),
  };

  return {
    runtimeMessages,
    options: {
      root: document,
      pageWindow: window,
      runtime,
      storage,
      domApi,
      observerApi: { createGeminiObserver: jest.fn() },
      editorApi: {
        submitWithConfirmation: jest.fn(),
      },
      attachmentApi: {
        attachFile: jest.fn(),
        findFileInputsDeep: jest.fn(() => []),
        listAttachmentEvidence: jest.fn(() => []),
      },
      temporaryChatApi: {
        ensureActive: jest.fn(),
      },
      resultExtractor: {
        extractOrAuxiliaryFallback: jest.fn(),
      },
      deletionController,
      sleep: async () => {},
      sendLog: jest.fn(),
      getUrlLogMetadata: () => ({}),
      debugConsole: jest.fn(),
      reportProgress: jest.fn(),
      openKeepAlive: jest.fn(),
      closeKeepAlive: jest.fn(),
      ...overrides,
    },
  };
}

function successfulPipelineDependencies({ inputDataUrl, resultDataUrl, advanceClock }) {
  const editor = document.createElement('div');
  editor.setAttribute('contenteditable', 'true');
  const composer = document.createElement('rich-textarea');
  composer.appendChild(editor);
  document.body.appendChild(composer);

  let onStateChange = null;
  const observer = {
    start: jest.fn(function() { return this; }),
    stop: jest.fn(),
    waitForResult: jest.fn(async () => ({ image: null, url: resultDataUrl })),
  };
  const domApi = {
    getImageSource: image => image?.src || '',
    isIgnoredGeminiImageSource: () => false,
    isModelResponseImage: image => Boolean(image?.closest?.('model-response')),
    getStrictModelResponseContainer: image => image?.closest?.('model-response') || null,
    getUserTurnContainer: image => image?.closest?.('[data-message-author="user"]') || null,
    isInsideInputArea: image => Boolean(image?.closest?.('rich-textarea')),
    findAllDeep: (root, matcher) => [root, ...root.querySelectorAll('*')].filter(matcher),
    getEditableElement: element => element,
    findSendButton: () => null,
    isElementVisible: () => true,
  };
  const { options, runtimeMessages } = baseDependencies({
    domApi,
    observerApi: {
      createGeminiObserver: jest.fn(config => {
        onStateChange = config.onStateChange;
        return observer;
      }),
    },
    editorApi: {
      submitWithConfirmation: jest.fn(async () => {
        onStateChange('generation_started', { reason: 'response_created' });
        return { confirmed: true, attempt: 1, reason: 'response_created' };
      }),
    },
    attachmentApi: {
      attachFile: jest.fn(async () => ({
        attempted: true,
        confirmed: true,
        evidence: { type: 'container' },
        methodsAttempted: ['file_input'],
      })),
      findFileInputsDeep: jest.fn(() => []),
      listAttachmentEvidence: jest.fn(() => []),
    },
    resultExtractor: {
      extractOrAuxiliaryFallback: jest.fn(async () => ({
        kind: 'extracted',
        dataUrl: resultDataUrl,
      })),
    },
    sleep: async ms => advanceClock(Number(ms) || 0),
  });
  options.runtime.sendMessage.mockImplementation((message, callback) => {
    runtimeMessages.push(message);
    if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: inputDataUrl });
    else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.({ ok: true, refreshed: true });
    else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: true, staged: true, persisted: true });
    else if (message.action === 'GEMINI_RESULT_COMMIT') callback?.({ ok: true, committed: true });
    else if (message.action === 'GEMINI_RESULT_URL') callback?.({ ok: true, extractionRegistered: true });
    else callback?.({ ok: true });
  });

  return { options, runtimeMessages };
}

describe('gemini/job-runner.js', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    delete window.__mangaTranslatorActiveGeminiObserver;
    delete window.__mangaTranslatorManualGeminiResultUrl;
    delete window.__mangaTranslatorManualPickHandler;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('RUN-00: rejeita dependências obrigatórias ausentes com erro explícito', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();

    expect(() => createGeminiJobRunner({ ...options, root: null }))
      .toThrow('JobRunner requer document/window/runtime/storage');

    expect(() => createGeminiJobRunner({ ...options, domApi: null }))
      .toThrow('JobRunner requer módulos Gemini DOM/Observer/Editor/Attachment/TemporaryChat');

    expect(() => createGeminiJobRunner({ ...options, resultExtractor: null }))
      .toThrow('JobRunner requer resultExtractor e deletionController');
  });

  test('RUN-01: dataURLtoFile valida e converte PNG', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const runner = createGeminiJobRunner(options);

    const file = runner.dataURLtoFile(
      'data:image/png;base64,QUJDRA==',
      'page.png'
    );

    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('page.png');
    expect(file.size).toBe(4);
  });

  test('RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const runner = createGeminiJobRunner(options);

    expect(() => runner.dataURLtoFile('invalid', 'page.png'))
      .toThrow('sem vírgula separadora');
    expect(() => runner.dataURLtoFile('data:,QUJDRA==', 'page.png'))
      .toThrow('MIME não encontrado');

    const withoutFileApi = createGeminiJobRunner({ ...options, FileImpl: null });
    expect(() => withoutFileApi.dataURLtoFile('data:image/png;base64,QUJDRA==', 'page.png'))
      .toThrow('APIs de arquivo indisponíveis');
  });

  test('RUN-02: recovery pendente encerra antes de abrir keepalive', async () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    options.deletionController.recoverPending.mockResolvedValue({
      handled: true,
      deleted: true,
      recovery: { delivery: { action: 'GEMINI_ERROR' } },
    });

    const runner = createGeminiJobRunner(options);
    const result = await runner.run({
      jobId: 'job-recovery',
      geminiTabId: 88,
      mangaTabId: 77,
      index: 1,
    });

    expect(result).toEqual({
      status: 'recovery_handled',
      deleted: true,
    });
    expect(options.openKeepAlive).not.toHaveBeenCalled();
    expect(options.closeKeepAlive).not.toHaveBeenCalled();
  });

  test('RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR', async () => {
    const { createGeminiJobRunner } = loadModule();
    const { options, runtimeMessages } = baseDependencies();

    const runner = createGeminiJobRunner(options);
    const result = await runner.run({
      jobId: 'job-no-image',
      batchId: 'batch-1',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 5,
    });

    expect(options.openKeepAlive).toHaveBeenCalledTimes(1);
    expect(options.closeKeepAlive).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('error');
    expect(runtimeMessages).toContainEqual(expect.objectContaining({
      action: 'GEMINI_ERROR',
      mangaTabId: 77,
      index: 5,
      jobId: 'job-no-image',
      batchId: 'batch-1',
    }));
  });

  test('RUN-04: waitForElement resolve imediatamente quando o editor já existe', async () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const runner = createGeminiJobRunner(options);

    const editor = document.createElement('div');
    editor.className = 'ql-editor';
    document.body.appendChild(editor);

    await expect(
      runner.waitForElement('.ql-editor', 100)
    ).resolves.toBe(editor);
  });

  test('RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM', async () => {
    const { createGeminiJobRunner } = loadModule();

    let realDom;
    jest.isolateModules(() => {
      require(SELECTORS_PATH);
      realDom = require(DOM_PATH);
    });

    const { options } = baseDependencies({ domApi: realDom });
    const runner = createGeminiJobRunner(options);

    const host = document.createElement('gemini-composer');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);

    const pending = runner.waitForElement('.ql-editor', 1000);

    const editor = document.createElement('div');
    editor.className = 'ql-editor';
    shadow.appendChild(editor);

    await expect(pending).resolves.toBe(editor);
  });

  test('RUN-05: seleção manual é entregue ao observer ativo existente', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const observer = {
      acceptResult: jest.fn(),
    };
    window.__mangaTranslatorActiveGeminiObserver = observer;

    const runner = createGeminiJobRunner(options);
    runner.setManualGeminiResultUrl(
      'https://cdn.example/result.png',
      'test'
    );

    expect(observer.acceptResult).toHaveBeenCalledWith(
      null,
      'https://cdn.example/result.png'
    );
    expect(window.__mangaTranslatorManualGeminiResultUrl).toBe(
      'https://cdn.example/result.png'
    );
  });

  test('RUN-06: modos de execução escolhem anti-throttling progressivo', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const runner = createGeminiJobRunner(options);

    expect(runner.getAntiThrottleModeForExecutionMode('temp_chat')).toBe('minimal');
    expect(runner.getAntiThrottleModeForExecutionMode('background_delete')).toBe('balanced');
    expect(runner.getAntiThrottleModeForExecutionMode('minimized_window')).toBe('balanced');
    expect(runner.getAntiThrottleModeForExecutionMode('unknown')).toBe('minimal');
  });

  test('RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const received = [];
    const listener = event => received.push(event.detail && event.detail.mode);

    window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', listener);
    try {
      const runner = createGeminiJobRunner(options);

      expect(runner.setAntiThrottleMode('balanced')).toBe('balanced');
      expect(runner.setAntiThrottleMode('legacy')).toBe('legacy');
      expect(runner.setAntiThrottleMode('qualquer-coisa')).toBe('minimal');

      expect(received).toEqual(['balanced', 'legacy', 'minimal']);
    } finally {
      window.removeEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', listener);
    }
  });

  test('RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const runner = createGeminiJobRunner({
      ...options,
      pageWindow: {},
    });

    expect(runner.setAntiThrottleMode('balanced')).toBe('balanced');
    expect(runner.setAntiThrottleMode('invalid')).toBe('minimal');
  });

  test('RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const runner = createGeminiJobRunner(options);

    runner.createGeminiManualPanel({
      index: 2,
      jobId: 'manual-required-job',
      executionMode: 'temp_chat',
    }, () => new Set());

    document.getElementById('mt-gemini-use-last').click();
    document.getElementById('mt-gemini-pick').click();

    const severeCalls = options.sendLog.mock.calls.filter(
      ([level, action]) =>
        level === 'error' &&
        action === 'GEMINI_MANUAL_INTERVENTION_REQUIRED'
    );

    expect(severeCalls).toHaveLength(2);
    expect(severeCalls[0][3]).toEqual(expect.objectContaining({
      source: 'last-button',
      index: 2,
      executionMode: 'temp_chat',
      jobIdPrefix: 'manual-r',
    }));
    expect(severeCalls[1][3]).toEqual(expect.objectContaining({
      source: 'pick-button',
    }));

    runner.removeGeminiManualPanel();
  });

  test('RUN-08: início da geração renova o watchdog uma única vez e valida a resposta', async () => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 10_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);

    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const composer = document.createElement('rich-textarea');
    composer.appendChild(editor);
    document.body.appendChild(composer);

    let onStateChange = null;
    const observer = {
      start: jest.fn(function() { return this; }),
      stop: jest.fn(),
      waitForResult: jest.fn(async () => ({
        image: null,
        url: 'https://lh3.googleusercontent.com/gg-dl/RUNNER_RESULT',
      })),
    };
    const { options, runtimeMessages } = baseDependencies({
      sleep: async ms => { clock += Number(ms) || 0; },
      domApi: {
        getImageSource: image => image?.src || '',
        isIgnoredGeminiImageSource: () => false,
        isModelResponseImage: () => false,
        getEditableElement: element => element,
        findSendButton: () => null,
        isElementVisible: () => true,
        findAllDeep: (root, matcher) => [root, ...root.querySelectorAll('*')].filter(matcher),
      },
      observerApi: {
        createGeminiObserver: jest.fn(config => {
          onStateChange = config.onStateChange;
          return observer;
        }),
      },
      editorApi: {
        submitWithConfirmation: jest.fn(async () => {
          onStateChange('generation_started', { reason: 'stop_visible' });
          onStateChange('generation_started', { reason: 'response_created' });
          return { confirmed: true, attempt: 1, reason: 'stop_visible' };
        }),
      },
      attachmentApi: {
        attachFile: jest.fn(async () => ({
          attempted: true,
          confirmed: true,
          evidence: { type: 'container' },
          methodsAttempted: ['file_input'],
        })),
        findFileInputsDeep: jest.fn(() => []),
        listAttachmentEvidence: jest.fn(() => []),
      },
      resultExtractor: {
        extractOrAuxiliaryFallback: jest.fn(async () => ({
          kind: 'extracted',
          dataUrl: 'data:image/png;base64,RESULT',
        })),
      },
    });
    options.runtime.sendMessage.mockImplementation((message, callback) => {
      runtimeMessages.push(message);
      if (message.action === 'REQUEST_IMAGE_DATA') {
        callback?.({ srcData: 'data:image/png;base64,QUJDRA==' });
      } else if (message.action === 'REFRESH_JOB_WATCHDOG') {
        callback?.({ ok: true, refreshed: true });
      } else if (message.action === 'GEMINI_IMAGE_EXTRACTED') {
        callback?.({ ok: true, staged: true, persisted: true });
      } else if (message.action === 'GEMINI_RESULT_COMMIT') {
        callback?.({ ok: true, committed: true });
      } else {
        callback?.({ ok: true });
      }
    });

    const runner = createGeminiJobRunner(options);
    await expect(runner.run({
      jobId: 'job-refresh',
      batchId: 'batch-1',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 2,
      prompt: 'Traduza a imagem para português brasileiro.',
      executionMode: 'background_delete',
    })).resolves.toEqual({ status: 'delivered_extracted' });

    expect(runtimeMessages.filter(message =>
      message.action === 'REFRESH_JOB_WATCHDOG'
    )).toEqual([{ action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-refresh' }]);
    expect(options.sendLog).toHaveBeenCalledWith(
      'success',
      'GEMINI_WATCHDOG_REFRESH_CONFIRMED',
      expect.stringContaining('reiniciado'),
      expect.objectContaining({ executionMode: 'background_delete' })
    );
  });

  test('RUN-09: seleção automática e manual recusam imagens do preview do anexo', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const runner = createGeminiJobRunner(options);
    const preview = document.createElement('file-preview');
    const image = document.createElement('img');
    image.src = 'blob:https://gemini.google.com/input-preview';
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1800, configurable: true });
    preview.appendChild(image);
    document.body.appendChild(preview);

    expect(runner.isLikelyGeneratedImage(image)).toBe(false);
    expect(runner.isManualSelectableImage(image)).toBe(false);
  });

  test('RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega', async () => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 20_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const identical = 'data:image/png;base64,SU1BR0VNX09SSUdJTkFM';
    const { options, runtimeMessages } = successfulPipelineDependencies({
      inputDataUrl: identical,
      resultDataUrl: identical,
      advanceClock: ms => { clock += ms; },
    });

    const result = await createGeminiJobRunner(options).run({
      jobId: 'job-quarantine-identical',
      batchId: 'batch-quarantine',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 0,
      prompt: 'Traduza a imagem para português brasileiro.',
      executionMode: 'background_delete',
    });

    expect(result.status).toBe('error');
    expect(result.error.code).toBe('GEMINI_RESULT_MATCHES_INPUT');
    expect(runtimeMessages).not.toContainEqual(expect.objectContaining({
      action: 'GEMINI_IMAGE_EXTRACTED',
    }));
    expect(runtimeMessages).toContainEqual(expect.objectContaining({
      action: 'GEMINI_ERROR',
      error: expect.stringContaining('idêntico'),
    }));
  });

  test('RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue', async () => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 30_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const input = 'data:image/png;base64,SU1BR0VNX09SSUdJTkFM';
    const translated = 'data:image/png;base64,SU1BR0VNX1RSQURVWklEQQ==';
    const { options, runtimeMessages } = successfulPipelineDependencies({
      inputDataUrl: input,
      resultDataUrl: translated,
      advanceClock: ms => { clock += ms; },
    });

    await expect(createGeminiJobRunner(options).run({
      jobId: 'job-quarantine-different',
      batchId: 'batch-quarantine',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 1,
      prompt: 'Traduza a imagem para português brasileiro.',
      executionMode: 'background_delete',
    })).resolves.toEqual({ status: 'delivered_extracted' });

    expect(runtimeMessages).toContainEqual(expect.objectContaining({
      action: 'GEMINI_IMAGE_EXTRACTED',
      src: translated,
    }));
  });


  test('RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery', async () => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 40_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const input = 'data:image/png;base64,SU5QVVQ=';
    const translated = 'data:image/png;base64,VFJBTlNMQVRFRA==';
    const { options, runtimeMessages } = successfulPipelineDependencies({
      inputDataUrl: input,
      resultDataUrl: translated,
      advanceClock: ms => { clock += ms; },
    });

    await expect(createGeminiJobRunner(options).run({
      jobId: 'job-order',
      batchId: 'batch-order',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 3,
      prompt: 'Traduza.',
      executionMode: 'background_delete',
    })).resolves.toEqual({ status: 'delivered_extracted' });

    const stageIndex = runtimeMessages.findIndex(message =>
      message.action === 'GEMINI_IMAGE_EXTRACTED'
    );
    const commitIndex = runtimeMessages.findIndex(message =>
      message.action === 'GEMINI_RESULT_COMMIT'
    );

    expect(stageIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThan(stageIndex);
    expect(options.deletionController.deleteOrScheduleRecovery).not.toHaveBeenCalled();
    expect(options.resultExtractor.extractOrAuxiliaryFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        logContext: {
          jobIdPrefix: 'job-orde',
          batchIdPrefix: 'batch-or',
          index: 3,
        },
      })
    );
    expect(options.sendLog).toHaveBeenCalledWith(
      'success',
      'GEMINI_RESULT_STAGED',
      expect.stringContaining('persistido'),
      expect.objectContaining({ jobIdPrefix: expect.any(String) })
    );
  });

  test('RUN-13: falha de staging nunca envia commit e preserva diagnóstico', async () => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 50_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const { options, runtimeMessages } = successfulPipelineDependencies({
      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',
      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',
      advanceClock: ms => { clock += ms; },
    });

    options.runtime.sendMessage.mockImplementation((message, callback) => {
      runtimeMessages.push(message);
      if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: 'data:image/png;base64,SU5QVVQ=' });
      else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.({ ok: true, refreshed: true });
      else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: false, reason: 'persist_failed' });
      else callback?.({ ok: true });
    });

    const result = await createGeminiJobRunner(options).run({
      jobId: 'job-stage-fail',
      batchId: 'batch-stage-fail',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 4,
      prompt: 'Traduza.',
      executionMode: 'background_delete',
    });

    expect(result.status).toBe('error');
    expect(result.error.code).toBe('RESULT_STAGE_FAILED');
    expect(runtimeMessages).not.toContainEqual(expect.objectContaining({
      action: 'GEMINI_RESULT_COMMIT',
    }));
    expect(options.deletionController.deleteOrScheduleRecovery).not.toHaveBeenCalled();
  });

  test('RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem', async () => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 60_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const { options, runtimeMessages } = successfulPipelineDependencies({
      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',
      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',
      advanceClock: ms => { clock += ms; },
    });

    let commitAttempts = 0;
    options.runtime.sendMessage.mockImplementation((message, callback) => {
      runtimeMessages.push(message);
      if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: 'data:image/png;base64,SU5QVVQ=' });
      else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.({ ok: true, refreshed: true });
      else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: true, staged: true, persisted: true });
      else if (message.action === 'GEMINI_RESULT_COMMIT') {
        commitAttempts += 1;
        callback?.(commitAttempts < 3
          ? { ok: false, reason: 'worker_wakeup' }
          : { ok: true, committed: true });
      } else callback?.({ ok: true });
    });

    await expect(createGeminiJobRunner(options).run({
      jobId: 'job-commit-retry',
      batchId: 'batch-commit-retry',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 5,
      prompt: 'Traduza.',
      executionMode: 'background_delete',
    })).resolves.toEqual({ status: 'delivered_extracted' });

    expect(commitAttempts).toBe(3);
    expect(runtimeMessages.filter(message =>
      message.action === 'GEMINI_IMAGE_EXTRACTED'
    )).toHaveLength(1);
    expect(runtimeMessages.filter(message =>
      message.action === 'GEMINI_RESULT_COMMIT'
    )).toHaveLength(3);
  });
});

# Bíblia técnica — tests/unit/content-gemini/job-runner.test.js

> **Estado documental:** 🟡 CORRIGIDA após ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** feae92421dd98e682caf3f970ba7ff86b8b6aa4a  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest do pipeline central Gemini JobRunner  
> **Linhas textuais:** 757  
> **Posições documentais:** 758, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

job-runner.test.js é uma das suítes centrais do content Gemini. Ela instancia gemini/job-runner.js real e controla as dependências periféricas para provar guards, helpers, recovery, keep-alive, observer, anti-throttling, HUD manual, refresh do watchdog, quarentena, persistência do resultado e commit final.

As suítes attachment, editor-submit, image-quarantine, deletion e observer possuem provas próprias; aqui o foco é o **wiring e a ordem do pipeline** entre essas dependências.

## 2. Guards e helpers

RUN-00 prova os três grupos de dependências obrigatórias. RUN-01/RUN-01B cobrem Data URL válida, formatos inválidos e File API ausente. RUN-04/RUN-04B provam waitForElement imediato e inserção tardia em Shadow DOM.

## 3. Recovery e finally

RUN-02 exige que recoverPending.handled encerre antes de abrir keep-alive. RUN-03 força erro logo no início, exige open/close exatamente uma vez e GEMINI_ERROR com job/batch/index/mangaTabId corretos.

## 4. Manual, anti-throttle e observabilidade

RUN-05 entrega URL manual ao observer ativo. RUN-06 fixa temp_chat→minimal e background_delete/minimized_window→balanced. RUN-07/07A congelam normalização balanced/legacy/invalid→minimal e comportamento sem dispatcher. RUN-07B registra qualquer uso do HUD como GEMINI_MANUAL_INTERVENTION_REQUIRED.

O listener MAIN-world do evento anti-throttle é testado separadamente em inject-anti-hibernation.test.js; por isso esta Bíblia não abre duplicação para consumo do evento.

## 5. Refresh do watchdog

RUN-08 dispara generation_started duas vezes e exige somente uma mensagem REFRESH_JOB_WATCHDOG para o job, com log GEMINI_WATCHDOG_REFRESH_CONFIRMED. Isso prova de-duplicação e ACK feliz. O branch de ACK negativo/lastError/throw só registra warning e não cancela automaticamente a geração; falta caso focal.

## 6. Quarentena e seleção

RUN-09 garante que preview do attachment não é aceito nem automática nem manualmente. RUN-10 bloqueia resultado byte-a-byte idêntico antes de GEMINI_IMAGE_EXTRACTED e reporta GEMINI_ERROR. RUN-11 prova que bytes diferentes atravessam a quarentena e chegam ao stage.

## 7. Persistência antes do commit

RUN-12 prova a ordem GEMINI_IMAGE_EXTRACTED antes de GEMINI_RESULT_COMMIT, proíbe deletion-before-delivery e verifica logContext do extractor. RUN-13 prova que stage falho produz RESULT_STAGE_FAILED e nenhum commit. RUN-14 prova retry de commit por três tentativas com apenas um stage quando o terceiro ACK finalmente confirma.

O branch terminal em que as três tentativas de commit falham ainda não é exercitado.

## 8. Cards de resultado

RUN-COV-01 retorna false quando nenhum candidato existe. RUN-COV-02 simula primeiro botão stale que lança e exige tentativa do próximo .image-card, retornando true após fallback.

## 9. Branches materiais ainda sem caso focal

Além do commit terminal, waitForStableComposer pode expirar com GEMINI_COMPOSER_NOT_READY; o refresh do watchdog pode falhar e deve apenas gerar warning; e extractOrAuxiliaryFallback pode retornar caminho auxiliar, que depende de registrar GEMINI_RESULT_URL no background antes de devolver delivered_auxiliary.

## 10. Evidência CI exata

O run 36521561968 no commit e720890cf34dc9437ee91f3b8172953497d69870 contém exatamente o blob feae92421dd98e682caf3f970ba7ff86b8b6aa4a. Os 21 casos RUN/RUN-COV aparecem individualmente com ✓ em Node 20.x (job 109255348388) e Node 22.x (job 109255348406). Ambos fecham com 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 11. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| guards de dependências | RUN-00 | ✅ PROVADO DIRETAMENTE |
| Data URL → File e erros básicos | RUN-01/01B | ✅ PROVADO DIRETAMENTE |
| recovery antes de keep-alive | RUN-02 | ✅ PROVADO DIRETAMENTE |
| finally fecha keep-alive e reporta erro | RUN-03 | ✅ PROVADO DIRETAMENTE |
| waitForElement DOM/Shadow DOM | RUN-04/04B | ✅ PROVADO DIRETAMENTE |
| resultado manual vai ao observer | RUN-05 | ✅ PROVADO DIRETAMENTE |
| política e evento anti-throttle | RUN-06/07/07A | ✅ PROVADO DIRETAMENTE |
| intervenção manual é erro grave | RUN-07B | ✅ PROVADO DIRETAMENTE |
| watchdog refresh uma vez + ACK feliz | RUN-08 | ✅ PROVADO DIRETAMENTE |
| preview input recusado | RUN-09 | ✅ PROVADO DIRETAMENTE |
| resultado idêntico bloqueado | RUN-10 | ✅ PROVADO DIRETAMENTE |
| resultado diferente entregue | RUN-11 | ✅ PROVADO DIRETAMENTE |
| stage precede commit | RUN-12 | ✅ PROVADO DIRETAMENTE |
| stage falho bloqueia commit | RUN-13 | ✅ PROVADO DIRETAMENTE |
| commit retry sem re-stage | RUN-14 | ✅ PROVADO DIRETAMENTE |
| cards: nenhum/stale→fallback | RUN-COV-01/02 | ✅ PROVADO DIRETAMENTE |
| composer nunca estabiliza | branch GEMINI_COMPOSER_NOT_READY | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| watchdog refresh falha sem abortar geração | branch GEMINI_WATCHDOG_REFRESH_FAILED | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| três commits falham → RESULT_COMMIT_FAILED | branch terminal de stageAndCommitResult | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| auxiliary fallback registrado e entregue | branch GEMINI_RESULT_URL / delivered_auxiliary | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 12. Solicitações ao auditor

### 181-001 — TEST_REQUIRED — SUPERSEDED → 045-001 — HIGH

Encontrado: waitForStableComposer exige editor/composer estáveis por 750 ms e pelo menos 1500 ms; ao expirar 12 s lança GEMINI_COMPOSER_NOT_READY. Nenhum caso focal mantém o composer ausente/trocando até o timeout.

Evidência ausente: relógio controlado com selectLiveComposer sempre null ou alternando nós; exigir status error/GEMINI_ERROR com code GEMINI_COMPOSER_NOT_READY, nenhum submit e cleanup do keepalive/anti-throttle.

Risco: re-render contínuo do Gemini pode avançar com nó stale ou travar sem diagnóstico correto.

### 181-002 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: RUN-08 prova somente REFRESH_JOB_WATCHDOG com {ok:true,refreshed:true}. A implementação trata ACK negativo, runtime.lastError e throw como GEMINI_WATCHDOG_REFRESH_FAILED, mantendo o fluxo.

Evidência ausente: ao menos um ACK negativo e um throw/lastError; exigir uma única tentativa, warning correspondente e continuidade do pipeline até entrega.

Risco: falha de refresh pode cancelar indevidamente a geração ou deixar de ser observável.

### 181-003 — TEST_REQUIRED — SUPERSEDED → 045-005 — HIGH

Encontrado: RUN-14 faz duas falhas e sucesso na terceira tentativa de GEMINI_RESULT_COMMIT. Não cobre o branch após a terceira falha, que lança RESULT_COMMIT_FAILED.

Evidência ausente: três ACKs negativos/no_ack; exigir um único GEMINI_IMAGE_EXTRACTED, três commits, status error/code RESULT_COMMIT_FAILED e GEMINI_ERROR sem re-stage da imagem.

Risco: resultado já persistido pode ficar com job não finalizado e sem diagnóstico consistente.

### 181-004 — INTEGRATION_TEST_REQUIRED — ACCEPTED — HIGH

Encontrado: onAuxiliaryFallback registra GEMINI_RESULT_URL e exige {ok:true,extractionRegistered:true}; o retorno final é delivered_auxiliary. Nenhum caso focal do runner atravessa esse ramo.

Evidência ausente: resultExtractor chamando onAuxiliaryFallback com URL; sucesso deve enviar GEMINI_RESULT_URL com job/batch/index e retornar delivered_auxiliary sem GEMINI_IMAGE_EXTRACTED/commit. Rejeição do registro deve produzir AUXILIARY_REGISTRATION_FAILED e GEMINI_ERROR.

Risco: fallback para aba auxiliar pode parecer disponível no extractor isolado mas quebrar no wiring do runner/background.

## 13. Fonte integral auditada

```javascript
'use strict';

const path = require('path');

const RUNNER_PATH = path.resolve(
  __dirname,
  '../../../extension/content/gemini/job-runner.js'
);
const SELECTORS_PATH = path.resolve(
  __dirname,
  '../../../extension/content/gemini/selectors.js'
);
const DOM_PATH = path.resolve(
  __dirname,
  '../../../extension/content/gemini/dom.js'
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

    expect(() => createGeminiJobRunner({
      ...options,
      domApi: null,
      // Evita que o default de imageQuarantine falhe antes da guarda do runner.
      imageQuarantine: {},
    }))
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

  test('RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();
    const runner = createGeminiJobRunner(options);

    expect(runner.tryClickModelImageCards()).toBe(false);
  });

  test('RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato', () => {
    const { createGeminiJobRunner } = loadModule();
    const { options } = baseDependencies();

    const response = document.createElement('model-response');
    const brokenButton = document.createElement('button');
    brokenButton.setAttribute('aria-label', 'image result');
    brokenButton.click = jest.fn(() => {
      throw new Error('stale element');
    });

    const fallbackCard = document.createElement('div');
    fallbackCard.className = 'image-card';
    fallbackCard.click = jest.fn();

    response.appendChild(brokenButton);
    response.appendChild(fallbackCard);
    document.body.appendChild(response);

    const runner = createGeminiJobRunner(options);
    expect(runner.tryClickModelImageCards()).toBe(true);
    expect(brokenButton.click).toHaveBeenCalled();
    expect(fallbackCard.click).toHaveBeenCalledTimes(1);
  });

});
```

## 14. Auditoria linha a linha

### Linha 001

- **Código:** `'use strict';`
- **Função:** Ativa strict mode.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const path = require('path');`
- **Função:** Importa path.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `const RUNNER_PATH = path.resolve(`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 006

- **Código:** `  __dirname,`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 007

- **Código:** `  '../../../extension/content/gemini/job-runner.js'`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 008

- **Código:** `);`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 009

- **Código:** `const SELECTORS_PATH = path.resolve(`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 010

- **Código:** `  __dirname,`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 011

- **Código:** `  '../../../extension/content/gemini/selectors.js'`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 012

- **Código:** `);`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 013

- **Código:** `const DOM_PATH = path.resolve(`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 014

- **Código:** `  __dirname,`
- **Função:** Resolve caminho absoluto de job-runner.js, selectors.js ou dom.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 015

- **Código:** `  '../../../extension/content/gemini/dom.js'`
- **Função:** Compõe o cenário estrutura final, preparando, executando ou verificando o runner real.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `);`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `function loadModule() {`
- **Função:** Carrega job-runner.js real em isolamento Jest e devolve sua API.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `  let api;`
- **Função:** Compõe o cenário loader do job-runner, preparando, executando ou verificando o runner real.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Força execução isolada do módulo real.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `    api = require(RUNNER_PATH);`
- **Função:** Carrega a implementação real do runner.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 022

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `  return api;`
- **Função:** Compõe o cenário loader do job-runner, preparando, executando ou verificando o runner real.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader do job-runner.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `function baseDependencies(overrides = {}) {`
- **Função:** Constrói dependências controladas para isolar cada contrato do runner.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `  const runtimeMessages = [];`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `  const runtime = {`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    lastError: null,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `    sendMessage: jest.fn((message, callback) => {`
- **Função:** Modela chrome.runtime.sendMessage como boundary observável.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `      runtimeMessages.push(message);`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `      if (callback) callback(null);`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `    }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `  const storage = {`
- **Função:** Cria storage mínimo injetado no runner.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `    get: jest.fn((keys, callback) => callback({})),`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `  const domApi = {`
- **Função:** Cria implementação DOM controlada para os cenários base.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `    getImageSource: image => image?.src || '',`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `    isIgnoredGeminiImageSource: () => false,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `    isModelResponseImage: () => false,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `    findAllDeep: () => [],`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `    getEditableElement: element => element,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `    findSendButton: () => null,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `  const deletionController = {`
- **Função:** Fornece controller de deletion mockado; cenários de runner verificam ordem/wiring sem reexecutar deletion real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `    recoverPending: jest.fn(async () => ({`
- **Função:** Controla/verifica gate de recovery antes da execução normal.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `      handled: false,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `      deleted: false,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `      recovery: null,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `    })),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `    deleteCurrentConversation: jest.fn(async () => true),`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `    deleteOrScheduleRecovery: jest.fn(async () => ({`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `      deleted: true,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `      recoverySaved: false,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `      reloadScheduled: false,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `    })),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `  return {`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `    runtimeMessages,`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `    options: {`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `      root: document,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `      pageWindow: window,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `      runtime,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `      storage,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `      domApi,`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `      observerApi: { createGeminiObserver: jest.fn() },`
- **Função:** Fornece factory de observer controlada.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `      editorApi: {`
- **Função:** Fornece submitWithConfirmation controlado.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `        submitWithConfirmation: jest.fn(),`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `      attachmentApi: {`
- **Função:** Fornece upload/attachment controlado.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `        attachFile: jest.fn(),`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `        findFileInputsDeep: jest.fn(() => []),`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `        listAttachmentEvidence: jest.fn(() => []),`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `      temporaryChatApi: {`
- **Função:** Fornece gate de temporary chat.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `        ensureActive: jest.fn(),`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `      resultExtractor: {`
- **Função:** Fornece extração/fallback controlados.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `        extractOrAuxiliaryFallback: jest.fn(),`
- **Função:** Compõe o cenário factory base de dependências, preparando, executando ou verificando o runner real.
- **Contexto:** factory base de dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `      deletionController,`
- **Função:** Fornece controller de deletion mockado; cenários de runner verificam ordem/wiring sem reexecutar deletion real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `      sendLog: jest.fn(),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `      getUrlLogMetadata: () => ({}),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `      debugConsole: jest.fn(),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `      reportProgress: jest.fn(),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `      openKeepAlive: jest.fn(),`
- **Função:** Injeta boundary observável de abertura do keep-alive.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** `      closeKeepAlive: jest.fn(),`
- **Função:** Injeta boundary observável de fechamento do keep-alive.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `      ...overrides,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `function successfulPipelineDependencies({ inputDataUrl, resultDataUrl, advanceClock }) {`
- **Função:** Monta pipeline feliz reutilizável para quarentena, stage e commit.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `  const editor = document.createElement('div');`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** `  editor.setAttribute('contenteditable', 'true');`
- **Função:** Cria editor conectado usado pelo runner.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** `  const composer = document.createElement('rich-textarea');`
- **Função:** Cria composer realista ao redor do editor.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `  composer.appendChild(editor);`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `  document.body.appendChild(composer);`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `  let onStateChange = null;`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `  const observer = {`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `    start: jest.fn(function() { return this; }),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** `    stop: jest.fn(),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `    waitForResult: jest.fn(async () => ({ image: null, url: resultDataUrl })),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `  const domApi = {`
- **Função:** Cria implementação DOM controlada para os cenários base.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `    getImageSource: image => image?.src || '',`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `    isIgnoredGeminiImageSource: () => false,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** `    isModelResponseImage: image => Boolean(image?.closest?.('model-response')),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `    getStrictModelResponseContainer: image => image?.closest?.('model-response') || null,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `    getUserTurnContainer: image => image?.closest?.('[data-message-author="user"]') || null,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `    isInsideInputArea: image => Boolean(image?.closest?.('rich-textarea')),`
- **Função:** Cria composer realista ao redor do editor.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `    findAllDeep: (root, matcher) => [root, ...root.querySelectorAll('*')].filter(matcher),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `    getEditableElement: element => element,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `    findSendButton: () => null,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `    isElementVisible: () => true,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `  const { options, runtimeMessages } = baseDependencies({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** `    domApi,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 126

- **Código:** `    observerApi: {`
- **Função:** Fornece factory de observer controlada.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** `      createGeminiObserver: jest.fn(config => {`
- **Função:** Captura onStateChange e devolve observer controlado.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `        onStateChange = config.onStateChange;`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `        return observer;`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** `      }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** `    editorApi: {`
- **Função:** Fornece submitWithConfirmation controlado.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `      submitWithConfirmation: jest.fn(async () => {`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** `        onStateChange('generation_started', { reason: 'response_created' });`
- **Função:** Simula sinal observável de início de geração.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `        return { confirmed: true, attempt: 1, reason: 'response_created' };`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** `      }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `    attachmentApi: {`
- **Função:** Fornece upload/attachment controlado.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `      attachFile: jest.fn(async () => ({`
- **Função:** Faz attachment responder confirmado.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `        attempted: true,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `        confirmed: true,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `        evidence: { type: 'container' },`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `        methodsAttempted: ['file_input'],`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `      })),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `      findFileInputsDeep: jest.fn(() => []),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `      listAttachmentEvidence: jest.fn(() => []),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `    resultExtractor: {`
- **Função:** Fornece extração/fallback controlados.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 149

- **Código:** `      extractOrAuxiliaryFallback: jest.fn(async () => ({`
- **Função:** Faz result extractor devolver resultado extraído direto.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 150

- **Código:** `        kind: 'extracted',`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** `        dataUrl: resultDataUrl,`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `      })),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** `    sleep: async ms => advanceClock(Number(ms) || 0),`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `  options.runtime.sendMessage.mockImplementation((message, callback) => {`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `    runtimeMessages.push(message);`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `    if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: inputDataUrl });`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `    else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.({ ok: true, refreshed: true });`
- **Função:** Modela/observa protocolo de renovação de watchdog.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `    else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: true, staged: true, persisted: true });`
- **Função:** Modela/observa stage do resultado no leitor.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `    else if (message.action === 'GEMINI_RESULT_COMMIT') callback?.({ ok: true, committed: true });`
- **Função:** Modela/observa commit final do job após persistência.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** `    else if (message.action === 'GEMINI_RESULT_URL') callback?.({ ok: true, extractionRegistered: true });`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `    else callback?.({ ok: true });`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `  return { options, runtimeMessages };`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `describe('gemini/job-runner.js', () => {`
- **Função:** Abre suíte focal de gemini/job-runner.js.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `  beforeEach(() => {`
- **Função:** Limpa DOM e globais manuais antes de cada cenário.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** `    delete window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `    delete window.__mangaTranslatorManualGeminiResultUrl;`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** `    delete window.__mangaTranslatorManualPickHandler;`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 175

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 177

- **Código:** `  afterEach(() => {`
- **Função:** Restaura mocks e DOM depois de cada cenário.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Compõe o cenário pipeline feliz reutilizável, preparando, executando ou verificando o runner real.
- **Contexto:** pipeline feliz reutilizável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 179

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário estrutura final, preparando, executando ou verificando o runner real.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `  test('RUN-00: rejeita dependências obrigatórias ausentes com erro explícito', () => {`
- **Função:** Declara cenário: RUN-00 — guards de dependência.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-00 — guards de dependência, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `    expect(() => createGeminiJobRunner({ ...options, root: null }))`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 187

- **Código:** `      .toThrow('JobRunner requer document/window/runtime/storage');`
- **Função:** Prova guard/erro explícito esperado.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 188

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `    expect(() => createGeminiJobRunner({`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 190

- **Código:** `      ...options,`
- **Função:** Compõe o cenário RUN-00 — guards de dependência, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 191

- **Código:** `      domApi: null,`
- **Função:** Compõe o cenário RUN-00 — guards de dependência, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** `      // Evita que o default de imageQuarantine falhe antes da guarda do runner.`
- **Função:** Compõe o cenário RUN-00 — guards de dependência, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `      imageQuarantine: {},`
- **Função:** Compõe o cenário RUN-00 — guards de dependência, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** `    }))`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `      .toThrow('JobRunner requer módulos Gemini DOM/Observer/Editor/Attachment/TemporaryChat');`
- **Função:** Prova guard/erro explícito esperado.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 196

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `    expect(() => createGeminiJobRunner({ ...options, resultExtractor: null }))`
- **Função:** Fornece extração/fallback controlados.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 198

- **Código:** `      .toThrow('JobRunner requer resultExtractor e deletionController');`
- **Função:** Fornece controller de deletion mockado; cenários de runner verificam ordem/wiring sem reexecutar deletion real.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 199

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-00 — guards de dependência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 200

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 201

- **Código:** `  test('RUN-01: dataURLtoFile valida e converte PNG', () => {`
- **Função:** Declara cenário: RUN-01 — dataURL para File.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 202

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 203

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-01 — dataURL para File, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 204

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 205

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `    const file = runner.dataURLtoFile(`
- **Função:** Exercita conversão/validação real de Data URL em File.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 207

- **Código:** `      'data:image/png;base64,QUJDRA==',`
- **Função:** Compõe o cenário RUN-01 — dataURL para File, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 208

- **Código:** `      'page.png'`
- **Função:** Compõe o cenário RUN-01 — dataURL para File, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 209

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 211

- **Código:** `    expect(file).toBeInstanceOf(File);`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 212

- **Código:** `    expect(file.type).toBe('image/png');`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 213

- **Código:** `    expect(file.name).toBe('page.png');`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 214

- **Código:** `    expect(file.size).toBe(4);`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 215

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-01 — dataURL para File.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 216

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 217

- **Código:** `  test('RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes', () => {`
- **Função:** Declara cenário: RUN-01B — erros de dataURL/APIs.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 218

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 219

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-01B — erros de dataURL/APIs, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 220

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 222

- **Código:** `    expect(() => runner.dataURLtoFile('invalid', 'page.png'))`
- **Função:** Exercita conversão/validação real de Data URL em File.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 223

- **Código:** `      .toThrow('sem vírgula separadora');`
- **Função:** Prova guard/erro explícito esperado.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 224

- **Código:** `    expect(() => runner.dataURLtoFile('data:,QUJDRA==', 'page.png'))`
- **Função:** Exercita conversão/validação real de Data URL em File.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 225

- **Código:** `      .toThrow('MIME não encontrado');`
- **Função:** Prova guard/erro explícito esperado.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 226

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `    const withoutFileApi = createGeminiJobRunner({ ...options, FileImpl: null });`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 228

- **Código:** `    expect(() => withoutFileApi.dataURLtoFile('data:image/png;base64,QUJDRA==', 'page.png'))`
- **Função:** Exercita conversão/validação real de Data URL em File.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 229

- **Código:** `      .toThrow('APIs de arquivo indisponíveis');`
- **Função:** Prova guard/erro explícito esperado.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 230

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-01B — erros de dataURL/APIs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 231

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 232

- **Código:** `  test('RUN-02: recovery pendente encerra antes de abrir keepalive', async () => {`
- **Função:** Declara cenário: RUN-02 — recovery antes do keepalive.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 233

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 234

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-02 — recovery antes do keepalive, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 235

- **Código:** `    options.deletionController.recoverPending.mockResolvedValue({`
- **Função:** Fornece controller de deletion mockado; cenários de runner verificam ordem/wiring sem reexecutar deletion real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 236

- **Código:** `      handled: true,`
- **Função:** Compõe o cenário RUN-02 — recovery antes do keepalive, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 237

- **Código:** `      deleted: true,`
- **Função:** Compõe o cenário RUN-02 — recovery antes do keepalive, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** `      recovery: { delivery: { action: 'GEMINI_ERROR' } },`
- **Função:** Observa reporte estruturado de erro do runner.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 239

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 240

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 241

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 242

- **Código:** `    const result = await runner.run({`
- **Função:** Executa pipeline real do job runner.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 243

- **Código:** `      jobId: 'job-recovery',`
- **Função:** Compõe o cenário RUN-02 — recovery antes do keepalive, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 244

- **Código:** `      geminiTabId: 88,`
- **Função:** Compõe o cenário RUN-02 — recovery antes do keepalive, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-02 — recovery antes do keepalive, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 246

- **Código:** `      index: 1,`
- **Função:** Compõe o cenário RUN-02 — recovery antes do keepalive, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 248

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** `    expect(result).toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 250

- **Código:** `      status: 'recovery_handled',`
- **Função:** Exige retorno precoce quando recovery já tratou a entrega.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 251

- **Código:** `      deleted: true,`
- **Função:** Compõe o cenário RUN-02 — recovery antes do keepalive, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 252

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** `    expect(options.openKeepAlive).not.toHaveBeenCalled();`
- **Função:** Injeta boundary observável de abertura do keep-alive.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 254

- **Código:** `    expect(options.closeKeepAlive).not.toHaveBeenCalled();`
- **Função:** Injeta boundary observável de fechamento do keep-alive.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 255

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-02 — recovery antes do keepalive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 256

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 257

- **Código:** `  test('RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR', async () => {`
- **Função:** Declara cenário: RUN-03 — erro inicial/finally.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 258

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 259

- **Código:** `    const { options, runtimeMessages } = baseDependencies();`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 260

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 261

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 262

- **Código:** `    const result = await runner.run({`
- **Função:** Executa pipeline real do job runner.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 263

- **Código:** `      jobId: 'job-no-image',`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 264

- **Código:** `      batchId: 'batch-1',`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 265

- **Código:** `      geminiTabId: 321,`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 266

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 267

- **Código:** `      index: 5,`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 268

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 269

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 270

- **Código:** `    expect(options.openKeepAlive).toHaveBeenCalledTimes(1);`
- **Função:** Injeta boundary observável de abertura do keep-alive.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 271

- **Código:** `    expect(options.closeKeepAlive).toHaveBeenCalledTimes(1);`
- **Função:** Injeta boundary observável de fechamento do keep-alive.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 272

- **Código:** `    expect(result.status).toBe('error');`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 273

- **Código:** `    expect(runtimeMessages).toContainEqual(expect.objectContaining({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 274

- **Código:** `      action: 'GEMINI_ERROR',`
- **Função:** Observa reporte estruturado de erro do runner.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 275

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 276

- **Código:** `      index: 5,`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 277

- **Código:** `      jobId: 'job-no-image',`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 278

- **Código:** `      batchId: 'batch-1',`
- **Função:** Compõe o cenário RUN-03 — erro inicial/finally, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 279

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 280

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-03 — erro inicial/finally.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 281

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 282

- **Código:** `  test('RUN-04: waitForElement resolve imediatamente quando o editor já existe', async () => {`
- **Função:** Declara cenário: RUN-04 — waitForElement imediato.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 283

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 284

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-04 — waitForElement imediato, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 285

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 286

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 287

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Compõe o cenário RUN-04 — waitForElement imediato, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 288

- **Código:** `    editor.className = 'ql-editor';`
- **Função:** Compõe o cenário RUN-04 — waitForElement imediato, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 289

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Compõe o cenário RUN-04 — waitForElement imediato, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 290

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 291

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 292

- **Código:** `      runner.waitForElement('.ql-editor', 100)`
- **Função:** Exercita helper real de espera DOM profunda.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 293

- **Código:** `    ).resolves.toBe(editor);`
- **Função:** Compõe o cenário RUN-04 — waitForElement imediato, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 294

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-04 — waitForElement imediato.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 295

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 296

- **Código:** `  test('RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM', async () => {`
- **Função:** Declara cenário: RUN-04B — waitForElement em Shadow DOM.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 297

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 298

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 299

- **Código:** `    let realDom;`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 300

- **Código:** `    jest.isolateModules(() => {`
- **Função:** Força execução isolada do módulo real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 301

- **Código:** `      require(SELECTORS_PATH);`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 302

- **Código:** `      realDom = require(DOM_PATH);`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 303

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 304

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 305

- **Código:** `    const { options } = baseDependencies({ domApi: realDom });`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 306

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 307

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 308

- **Código:** `    const host = document.createElement('gemini-composer');`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 309

- **Código:** `    const shadow = host.attachShadow({ mode: 'open' });`
- **Função:** Cria Shadow DOM aberto para detecção dinâmica.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 310

- **Código:** `    document.body.appendChild(host);`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 311

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 312

- **Código:** `    const pending = runner.waitForElement('.ql-editor', 1000);`
- **Função:** Exercita helper real de espera DOM profunda.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 313

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 314

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 315

- **Código:** `    editor.className = 'ql-editor';`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 316

- **Código:** `    shadow.appendChild(editor);`
- **Função:** Compõe o cenário RUN-04B — waitForElement em Shadow DOM, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 317

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 318

- **Código:** `    await expect(pending).resolves.toBe(editor);`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 319

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-04B — waitForElement em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 320

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 321

- **Código:** `  test('RUN-05: seleção manual é entregue ao observer ativo existente', () => {`
- **Função:** Declara cenário: RUN-05 — resultado manual para observer.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 322

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 323

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-05 — resultado manual para observer, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 324

- **Código:** `    const observer = {`
- **Função:** Compõe o cenário RUN-05 — resultado manual para observer, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 325

- **Código:** `      acceptResult: jest.fn(),`
- **Função:** Observa observer.acceptResult recebendo URL manual.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 326

- **Código:** `    };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 327

- **Código:** `    window.__mangaTranslatorActiveGeminiObserver = observer;`
- **Função:** Compõe o cenário RUN-05 — resultado manual para observer, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 328

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 329

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 330

- **Código:** `    runner.setManualGeminiResultUrl(`
- **Função:** Exercita entrega de seleção manual ao observer ativo.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 331

- **Código:** `      'https://cdn.example/result.png',`
- **Função:** Compõe o cenário RUN-05 — resultado manual para observer, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 332

- **Código:** `      'test'`
- **Função:** Compõe o cenário RUN-05 — resultado manual para observer, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 333

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 334

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 335

- **Código:** `    expect(observer.acceptResult).toHaveBeenCalledWith(`
- **Função:** Observa observer.acceptResult recebendo URL manual.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 336

- **Código:** `      null,`
- **Função:** Compõe o cenário RUN-05 — resultado manual para observer, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 337

- **Código:** `      'https://cdn.example/result.png'`
- **Função:** Compõe o cenário RUN-05 — resultado manual para observer, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 338

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 339

- **Código:** `    expect(window.__mangaTranslatorManualGeminiResultUrl).toBe(`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 340

- **Código:** `      'https://cdn.example/result.png'`
- **Função:** Compõe o cenário RUN-05 — resultado manual para observer, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 341

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 342

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-05 — resultado manual para observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 343

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 344

- **Código:** `  test('RUN-06: modos de execução escolhem anti-throttling progressivo', () => {`
- **Função:** Declara cenário: RUN-06 — anti-throttle por modo.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 345

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 346

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-06 — anti-throttle por modo, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 347

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 348

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 349

- **Código:** `    expect(runner.getAntiThrottleModeForExecutionMode('temp_chat')).toBe('minimal');`
- **Função:** Exercita política de anti-throttling por modo.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 350

- **Código:** `    expect(runner.getAntiThrottleModeForExecutionMode('background_delete')).toBe('balanced');`
- **Função:** Exercita política de anti-throttling por modo.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 351

- **Código:** `    expect(runner.getAntiThrottleModeForExecutionMode('minimized_window')).toBe('balanced');`
- **Função:** Exercita política de anti-throttling por modo.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 352

- **Código:** `    expect(runner.getAntiThrottleModeForExecutionMode('unknown')).toBe('minimal');`
- **Função:** Exercita política de anti-throttling por modo.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 353

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-06 — anti-throttle por modo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 354

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 355

- **Código:** `  test('RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos', () => {`
- **Função:** Declara cenário: RUN-07 — evento anti-throttle MAIN.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 356

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 357

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-07 — evento anti-throttle MAIN, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 358

- **Código:** `    const received = [];`
- **Função:** Compõe o cenário RUN-07 — evento anti-throttle MAIN, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 359

- **Código:** `    const listener = event => received.push(event.detail && event.detail.mode);`
- **Função:** Compõe o cenário RUN-07 — evento anti-throttle MAIN, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 360

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 361

- **Código:** `    window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', listener);`
- **Função:** Fixa nome do evento enviado ao MAIN world.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 362

- **Código:** `    try {`
- **Função:** Compõe o cenário RUN-07 — evento anti-throttle MAIN, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 363

- **Código:** `      const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 364

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 365

- **Código:** `      expect(runner.setAntiThrottleMode('balanced')).toBe('balanced');`
- **Função:** Exercita normalização e emissão do modo anti-throttle.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 366

- **Código:** `      expect(runner.setAntiThrottleMode('legacy')).toBe('legacy');`
- **Função:** Exercita normalização e emissão do modo anti-throttle.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 367

- **Código:** `      expect(runner.setAntiThrottleMode('qualquer-coisa')).toBe('minimal');`
- **Função:** Exercita normalização e emissão do modo anti-throttle.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 368

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 369

- **Código:** `      expect(received).toEqual(['balanced', 'legacy', 'minimal']);`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 370

- **Código:** `    } finally {`
- **Função:** Compõe o cenário RUN-07 — evento anti-throttle MAIN, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 371

- **Código:** `      window.removeEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', listener);`
- **Função:** Fixa nome do evento enviado ao MAIN world.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 372

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 373

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-07 — evento anti-throttle MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 374

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 375

- **Código:** `  test('RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos', () => {`
- **Função:** Declara cenário: RUN-07A — sem dispatcher.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 376

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 377

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-07A — sem dispatcher, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 378

- **Código:** `    const runner = createGeminiJobRunner({`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 379

- **Código:** `      ...options,`
- **Função:** Compõe o cenário RUN-07A — sem dispatcher, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 380

- **Código:** `      pageWindow: {},`
- **Função:** Compõe o cenário RUN-07A — sem dispatcher, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 381

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 382

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 383

- **Código:** `    expect(runner.setAntiThrottleMode('balanced')).toBe('balanced');`
- **Função:** Exercita normalização e emissão do modo anti-throttle.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 384

- **Código:** `    expect(runner.setAntiThrottleMode('invalid')).toBe('minimal');`
- **Função:** Exercita normalização e emissão do modo anti-throttle.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 385

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-07A — sem dispatcher.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 386

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 387

- **Código:** `  test('RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação', () => {`
- **Função:** Declara cenário: RUN-07B — HUD manual como erro grave.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 388

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 389

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 390

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 391

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 392

- **Código:** `    runner.createGeminiManualPanel({`
- **Função:** Materializa HUD manual real para observar telemetria de intervenção.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 393

- **Código:** `      index: 2,`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 394

- **Código:** `      jobId: 'manual-required-job',`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 395

- **Código:** `      executionMode: 'temp_chat',`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 396

- **Código:** `    }, () => new Set());`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 397

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 398

- **Código:** `    document.getElementById('mt-gemini-use-last').click();`
- **Função:** Dispara ação manual 'usar última'.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 399

- **Código:** `    document.getElementById('mt-gemini-pick').click();`
- **Função:** Dispara modo manual de seleção.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 400

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 401

- **Código:** `    const severeCalls = options.sendLog.mock.calls.filter(`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 402

- **Código:** `      ([level, action]) =>`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 403

- **Código:** `        level === 'error' &&`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 404

- **Código:** `        action === 'GEMINI_MANUAL_INTERVENTION_REQUIRED'`
- **Função:** Exige classificação de intervenção manual como erro grave.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 405

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 406

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 407

- **Código:** `    expect(severeCalls).toHaveLength(2);`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 408

- **Código:** `    expect(severeCalls[0][3]).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 409

- **Código:** `      source: 'last-button',`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 410

- **Código:** `      index: 2,`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 411

- **Código:** `      executionMode: 'temp_chat',`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 412

- **Código:** `      jobIdPrefix: 'manual-r',`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 413

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 414

- **Código:** `    expect(severeCalls[1][3]).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 415

- **Código:** `      source: 'pick-button',`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 416

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 417

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 418

- **Código:** `    runner.removeGeminiManualPanel();`
- **Função:** Compõe o cenário RUN-07B — HUD manual como erro grave, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 419

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-07B — HUD manual como erro grave.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 420

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 421

- **Código:** `  test('RUN-08: início da geração renova o watchdog uma única vez e valida a resposta', async () => {`
- **Função:** Declara cenário: RUN-08 — refresh único do watchdog.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 422

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 423

- **Código:** `    let clock = 10_000;`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 424

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Controla relógio para waits/retries determinísticos.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 425

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 426

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 427

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Cria editor conectado usado pelo runner.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 428

- **Código:** `    const composer = document.createElement('rich-textarea');`
- **Função:** Cria composer realista ao redor do editor.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 429

- **Código:** `    composer.appendChild(editor);`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 430

- **Código:** `    document.body.appendChild(composer);`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 431

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 432

- **Código:** `    let onStateChange = null;`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 433

- **Código:** `    const observer = {`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 434

- **Código:** `      start: jest.fn(function() { return this; }),`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 435

- **Código:** `      stop: jest.fn(),`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 436

- **Código:** `      waitForResult: jest.fn(async () => ({`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 437

- **Código:** `        image: null,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 438

- **Código:** `        url: 'https://lh3.googleusercontent.com/gg-dl/RUNNER_RESULT',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 439

- **Código:** `      })),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 440

- **Código:** `    };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 441

- **Código:** `    const { options, runtimeMessages } = baseDependencies({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 442

- **Código:** `      sleep: async ms => { clock += Number(ms) || 0; },`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 443

- **Código:** `      domApi: {`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 444

- **Código:** `        getImageSource: image => image?.src || '',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 445

- **Código:** `        isIgnoredGeminiImageSource: () => false,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 446

- **Código:** `        isModelResponseImage: () => false,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 447

- **Código:** `        getEditableElement: element => element,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 448

- **Código:** `        findSendButton: () => null,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 449

- **Código:** `        isElementVisible: () => true,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 450

- **Código:** `        findAllDeep: (root, matcher) => [root, ...root.querySelectorAll('*')].filter(matcher),`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 451

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 452

- **Código:** `      observerApi: {`
- **Função:** Fornece factory de observer controlada.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 453

- **Código:** `        createGeminiObserver: jest.fn(config => {`
- **Função:** Captura onStateChange e devolve observer controlado.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 454

- **Código:** `          onStateChange = config.onStateChange;`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 455

- **Código:** `          return observer;`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 456

- **Código:** `        }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 457

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 458

- **Código:** `      editorApi: {`
- **Função:** Fornece submitWithConfirmation controlado.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 459

- **Código:** `        submitWithConfirmation: jest.fn(async () => {`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 460

- **Código:** `          onStateChange('generation_started', { reason: 'stop_visible' });`
- **Função:** Simula sinal observável de início de geração.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 461

- **Código:** `          onStateChange('generation_started', { reason: 'response_created' });`
- **Função:** Simula sinal observável de início de geração.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 462

- **Código:** `          return { confirmed: true, attempt: 1, reason: 'stop_visible' };`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 463

- **Código:** `        }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 464

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 465

- **Código:** `      attachmentApi: {`
- **Função:** Fornece upload/attachment controlado.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 466

- **Código:** `        attachFile: jest.fn(async () => ({`
- **Função:** Faz attachment responder confirmado.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 467

- **Código:** `          attempted: true,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 468

- **Código:** `          confirmed: true,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 469

- **Código:** `          evidence: { type: 'container' },`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 470

- **Código:** `          methodsAttempted: ['file_input'],`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 471

- **Código:** `        })),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 472

- **Código:** `        findFileInputsDeep: jest.fn(() => []),`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 473

- **Código:** `        listAttachmentEvidence: jest.fn(() => []),`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 474

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 475

- **Código:** `      resultExtractor: {`
- **Função:** Fornece extração/fallback controlados.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 476

- **Código:** `        extractOrAuxiliaryFallback: jest.fn(async () => ({`
- **Função:** Faz result extractor devolver resultado extraído direto.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 477

- **Código:** `          kind: 'extracted',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 478

- **Código:** `          dataUrl: 'data:image/png;base64,RESULT',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 479

- **Código:** `        })),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 480

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 481

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 482

- **Código:** `    options.runtime.sendMessage.mockImplementation((message, callback) => {`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 483

- **Código:** `      runtimeMessages.push(message);`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 484

- **Código:** `      if (message.action === 'REQUEST_IMAGE_DATA') {`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 485

- **Código:** `        callback?.({ srcData: 'data:image/png;base64,QUJDRA==' });`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 486

- **Código:** `      } else if (message.action === 'REFRESH_JOB_WATCHDOG') {`
- **Função:** Modela/observa protocolo de renovação de watchdog.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 487

- **Código:** `        callback?.({ ok: true, refreshed: true });`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 488

- **Código:** `      } else if (message.action === 'GEMINI_IMAGE_EXTRACTED') {`
- **Função:** Modela/observa stage do resultado no leitor.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 489

- **Código:** `        callback?.({ ok: true, staged: true, persisted: true });`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 490

- **Código:** `      } else if (message.action === 'GEMINI_RESULT_COMMIT') {`
- **Função:** Modela/observa commit final do job após persistência.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 491

- **Código:** `        callback?.({ ok: true, committed: true });`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 492

- **Código:** `      } else {`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 493

- **Código:** `        callback?.({ ok: true });`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 494

- **Código:** `      }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 495

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 496

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 497

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 498

- **Código:** `    await expect(runner.run({`
- **Função:** Executa pipeline real do job runner.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 499

- **Código:** `      jobId: 'job-refresh',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 500

- **Código:** `      batchId: 'batch-1',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 501

- **Código:** `      geminiTabId: 321,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 502

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 503

- **Código:** `      index: 2,`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 504

- **Código:** `      prompt: 'Traduza a imagem para português brasileiro.',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 505

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 506

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Exige status final de resultado extraído e entregue.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 507

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 508

- **Código:** `    expect(runtimeMessages.filter(message =>`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 509

- **Código:** `      message.action === 'REFRESH_JOB_WATCHDOG'`
- **Função:** Modela/observa protocolo de renovação de watchdog.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 510

- **Código:** `    )).toEqual([{ action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-refresh' }]);`
- **Função:** Modela/observa protocolo de renovação de watchdog.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 511

- **Código:** `    expect(options.sendLog).toHaveBeenCalledWith(`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 512

- **Código:** `      'success',`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 513

- **Código:** `      'GEMINI_WATCHDOG_REFRESH_CONFIRMED',`
- **Função:** Exige log de refresh confirmado.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 514

- **Código:** `      expect.stringContaining('reiniciado'),`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 515

- **Código:** `      expect.objectContaining({ executionMode: 'background_delete' })`
- **Função:** Compõe o cenário RUN-08 — refresh único do watchdog, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 516

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 517

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-08 — refresh único do watchdog.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 518

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 519

- **Código:** `  test('RUN-09: seleção automática e manual recusam imagens do preview do anexo', () => {`
- **Função:** Declara cenário: RUN-09 — preview de input recusado.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 520

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 521

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-09 — preview de input recusado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 522

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 523

- **Código:** `    const preview = document.createElement('file-preview');`
- **Função:** Cria preview do attachment que deve ser recusado como resultado.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 524

- **Código:** `    const image = document.createElement('img');`
- **Função:** Compõe o cenário RUN-09 — preview de input recusado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 525

- **Código:** `    image.src = 'blob:https://gemini.google.com/input-preview';`
- **Função:** Compõe o cenário RUN-09 — preview de input recusado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 526

- **Código:** `    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });`
- **Função:** Compõe o cenário RUN-09 — preview de input recusado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 527

- **Código:** `    Object.defineProperty(image, 'naturalHeight', { value: 1800, configurable: true });`
- **Função:** Compõe o cenário RUN-09 — preview de input recusado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 528

- **Código:** `    preview.appendChild(image);`
- **Função:** Compõe o cenário RUN-09 — preview de input recusado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 529

- **Código:** `    document.body.appendChild(preview);`
- **Função:** Compõe o cenário RUN-09 — preview de input recusado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 530

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 531

- **Código:** `    expect(runner.isLikelyGeneratedImage(image)).toBe(false);`
- **Função:** Exercita filtro automático de imagem candidata.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 532

- **Código:** `    expect(runner.isManualSelectableImage(image)).toBe(false);`
- **Função:** Exercita filtro para seleção manual.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 533

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-09 — preview de input recusado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 534

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 535

- **Código:** `  test('RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega', async () => {`
- **Função:** Declara cenário: RUN-10 — resultado idêntico bloqueado.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 536

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 537

- **Código:** `    let clock = 20_000;`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 538

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Controla relógio para waits/retries determinísticos.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 539

- **Código:** `    const identical = 'data:image/png;base64,SU1BR0VNX09SSUdJTkFM';`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 540

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 541

- **Código:** `      inputDataUrl: identical,`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 542

- **Código:** `      resultDataUrl: identical,`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 543

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 544

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 545

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 546

- **Código:** `    const result = await createGeminiJobRunner(options).run({`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 547

- **Código:** `      jobId: 'job-quarantine-identical',`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 548

- **Código:** `      batchId: 'batch-quarantine',`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 549

- **Código:** `      geminiTabId: 321,`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 550

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 551

- **Código:** `      index: 0,`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 552

- **Código:** `      prompt: 'Traduza a imagem para português brasileiro.',`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 553

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 554

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 555

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 556

- **Código:** `    expect(result.status).toBe('error');`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 557

- **Código:** `    expect(result.error.code).toBe('GEMINI_RESULT_MATCHES_INPUT');`
- **Função:** Exige bloqueio da quarentena exata para resultado idêntico.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 558

- **Código:** `    expect(runtimeMessages).not.toContainEqual(expect.objectContaining({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 559

- **Código:** `      action: 'GEMINI_IMAGE_EXTRACTED',`
- **Função:** Modela/observa stage do resultado no leitor.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 560

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 561

- **Código:** `    expect(runtimeMessages).toContainEqual(expect.objectContaining({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 562

- **Código:** `      action: 'GEMINI_ERROR',`
- **Função:** Observa reporte estruturado de erro do runner.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 563

- **Código:** `      error: expect.stringContaining('idêntico'),`
- **Função:** Compõe o cenário RUN-10 — resultado idêntico bloqueado, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 564

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 565

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-10 — resultado idêntico bloqueado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 566

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 567

- **Código:** `  test('RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue', async () => {`
- **Função:** Declara cenário: RUN-11 — resultado diferente entregue.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 568

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 569

- **Código:** `    let clock = 30_000;`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 570

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Controla relógio para waits/retries determinísticos.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 571

- **Código:** `    const input = 'data:image/png;base64,SU1BR0VNX09SSUdJTkFM';`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 572

- **Código:** `    const translated = 'data:image/png;base64,SU1BR0VNX1RSQURVWklEQQ==';`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 573

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 574

- **Código:** `      inputDataUrl: input,`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 575

- **Código:** `      resultDataUrl: translated,`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 576

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 577

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 578

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 579

- **Código:** `    await expect(createGeminiJobRunner(options).run({`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 580

- **Código:** `      jobId: 'job-quarantine-different',`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 581

- **Código:** `      batchId: 'batch-quarantine',`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 582

- **Código:** `      geminiTabId: 321,`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 583

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 584

- **Código:** `      index: 1,`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 585

- **Código:** `      prompt: 'Traduza a imagem para português brasileiro.',`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 586

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 587

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Exige status final de resultado extraído e entregue.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 588

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 589

- **Código:** `    expect(runtimeMessages).toContainEqual(expect.objectContaining({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 590

- **Código:** `      action: 'GEMINI_IMAGE_EXTRACTED',`
- **Função:** Modela/observa stage do resultado no leitor.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 591

- **Código:** `      src: translated,`
- **Função:** Compõe o cenário RUN-11 — resultado diferente entregue, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 592

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 593

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 594

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-11 — resultado diferente entregue.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 595

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 596

- **Código:** `  test('RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery', async () => {`
- **Função:** Declara cenário: RUN-12 — stage antes de commit.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 597

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 598

- **Código:** `    let clock = 40_000;`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 599

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Controla relógio para waits/retries determinísticos.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 600

- **Código:** `    const input = 'data:image/png;base64,SU5QVVQ=';`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 601

- **Código:** `    const translated = 'data:image/png;base64,VFJBTlNMQVRFRA==';`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 602

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 603

- **Código:** `      inputDataUrl: input,`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 604

- **Código:** `      resultDataUrl: translated,`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 605

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 606

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 607

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 608

- **Código:** `    await expect(createGeminiJobRunner(options).run({`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 609

- **Código:** `      jobId: 'job-order',`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 610

- **Código:** `      batchId: 'batch-order',`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 611

- **Código:** `      geminiTabId: 321,`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 612

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 613

- **Código:** `      index: 3,`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 614

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 615

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 616

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Exige status final de resultado extraído e entregue.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 617

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 618

- **Código:** `    const stageIndex = runtimeMessages.findIndex(message =>`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 619

- **Código:** `      message.action === 'GEMINI_IMAGE_EXTRACTED'`
- **Função:** Modela/observa stage do resultado no leitor.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 620

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 621

- **Código:** `    const commitIndex = runtimeMessages.findIndex(message =>`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 622

- **Código:** `      message.action === 'GEMINI_RESULT_COMMIT'`
- **Função:** Modela/observa commit final do job após persistência.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 623

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 624

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 625

- **Código:** `    expect(stageIndex).toBeGreaterThanOrEqual(0);`
- **Função:** Localiza ordem da mensagem de persistência do resultado.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 626

- **Código:** `    expect(commitIndex).toBeGreaterThan(stageIndex);`
- **Função:** Localiza ordem da mensagem de persistência do resultado.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 627

- **Código:** `    expect(options.deletionController.deleteOrScheduleRecovery).not.toHaveBeenCalled();`
- **Função:** Fornece controller de deletion mockado; cenários de runner verificam ordem/wiring sem reexecutar deletion real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 628

- **Código:** `    expect(options.resultExtractor.extractOrAuxiliaryFallback).toHaveBeenCalledWith(`
- **Função:** Fornece extração/fallback controlados.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 629

- **Código:** `      expect.objectContaining({`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 630

- **Código:** `        logContext: {`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 631

- **Código:** `          jobIdPrefix: 'job-orde',`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 632

- **Código:** `          batchIdPrefix: 'batch-or',`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 633

- **Código:** `          index: 3,`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 634

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 635

- **Código:** `      })`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 636

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 637

- **Código:** `    expect(options.sendLog).toHaveBeenCalledWith(`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 638

- **Código:** `      'success',`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 639

- **Código:** `      'GEMINI_RESULT_STAGED',`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 640

- **Código:** `      expect.stringContaining('persistido'),`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 641

- **Código:** `      expect.objectContaining({ jobIdPrefix: expect.any(String) })`
- **Função:** Compõe o cenário RUN-12 — stage antes de commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 642

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 643

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-12 — stage antes de commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 644

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 645

- **Código:** `  test('RUN-13: falha de staging nunca envia commit e preserva diagnóstico', async () => {`
- **Função:** Declara cenário: RUN-13 — stage falho bloqueia commit.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 646

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 647

- **Código:** `    let clock = 50_000;`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 648

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Controla relógio para waits/retries determinísticos.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 649

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 650

- **Código:** `      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 651

- **Código:** `      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 652

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 653

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 654

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 655

- **Código:** `    options.runtime.sendMessage.mockImplementation((message, callback) => {`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 656

- **Código:** `      runtimeMessages.push(message);`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 657

- **Código:** `      if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: 'data:image/png;base64,SU5QVVQ=' });`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 658

- **Código:** `      else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.({ ok: true, refreshed: true });`
- **Função:** Modela/observa protocolo de renovação de watchdog.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 659

- **Código:** `      else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: false, reason: 'persist_failed' });`
- **Função:** Modela/observa stage do resultado no leitor.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 660

- **Código:** `      else callback?.({ ok: true });`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 661

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 662

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 663

- **Código:** `    const result = await createGeminiJobRunner(options).run({`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 664

- **Código:** `      jobId: 'job-stage-fail',`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 665

- **Código:** `      batchId: 'batch-stage-fail',`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 666

- **Código:** `      geminiTabId: 321,`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 667

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 668

- **Código:** `      index: 4,`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 669

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 670

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Compõe o cenário RUN-13 — stage falho bloqueia commit, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 671

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 672

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 673

- **Código:** `    expect(result.status).toBe('error');`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 674

- **Código:** `    expect(result.error.code).toBe('RESULT_STAGE_FAILED');`
- **Função:** Exige erro específico quando persistência inicial falha.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 675

- **Código:** `    expect(runtimeMessages).not.toContainEqual(expect.objectContaining({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 676

- **Código:** `      action: 'GEMINI_RESULT_COMMIT',`
- **Função:** Modela/observa commit final do job após persistência.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 677

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 678

- **Código:** `    expect(options.deletionController.deleteOrScheduleRecovery).not.toHaveBeenCalled();`
- **Função:** Fornece controller de deletion mockado; cenários de runner verificam ordem/wiring sem reexecutar deletion real.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 679

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-13 — stage falho bloqueia commit.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 680

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 681

- **Código:** `  test('RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem', async () => {`
- **Função:** Declara cenário: RUN-14 — retry de commit sem reenviar imagem.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 682

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 683

- **Código:** `    let clock = 60_000;`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 684

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Controla relógio para waits/retries determinísticos.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 685

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 686

- **Código:** `      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 687

- **Código:** `      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 688

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 689

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 690

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 691

- **Código:** `    let commitAttempts = 0;`
- **Função:** Conta tentativas de commit pós-stage.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 692

- **Código:** `    options.runtime.sendMessage.mockImplementation((message, callback) => {`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 693

- **Código:** `      runtimeMessages.push(message);`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 694

- **Código:** `      if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: 'data:image/png;base64,SU5QVVQ=' });`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 695

- **Código:** `      else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.({ ok: true, refreshed: true });`
- **Função:** Modela/observa protocolo de renovação de watchdog.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 696

- **Código:** `      else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: true, staged: true, persisted: true });`
- **Função:** Modela/observa stage do resultado no leitor.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 697

- **Código:** `      else if (message.action === 'GEMINI_RESULT_COMMIT') {`
- **Função:** Modela/observa commit final do job após persistência.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 698

- **Código:** `        commitAttempts += 1;`
- **Função:** Conta tentativas de commit pós-stage.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 699

- **Código:** `        callback?.(commitAttempts < 3`
- **Função:** Conta tentativas de commit pós-stage.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 700

- **Código:** `          ? { ok: false, reason: 'worker_wakeup' }`
- **Função:** Simula ACK negativo transitório que deve ser retentado.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 701

- **Código:** `          : { ok: true, committed: true });`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 702

- **Código:** `      } else callback?.({ ok: true });`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 703

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 704

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 705

- **Código:** `    await expect(createGeminiJobRunner(options).run({`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 706

- **Código:** `      jobId: 'job-commit-retry',`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 707

- **Código:** `      batchId: 'batch-commit-retry',`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 708

- **Código:** `      geminiTabId: 321,`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 709

- **Código:** `      mangaTabId: 77,`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 710

- **Código:** `      index: 5,`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 711

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 712

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 713

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Exige status final de resultado extraído e entregue.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 714

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 715

- **Código:** `    expect(commitAttempts).toBe(3);`
- **Função:** Conta tentativas de commit pós-stage.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 716

- **Código:** `    expect(runtimeMessages.filter(message =>`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 717

- **Código:** `      message.action === 'GEMINI_IMAGE_EXTRACTED'`
- **Função:** Modela/observa stage do resultado no leitor.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 718

- **Código:** `    )).toHaveLength(1);`
- **Função:** Prova cardinalidade única do efeito observado.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 719

- **Código:** `    expect(runtimeMessages.filter(message =>`
- **Função:** Coleta mensagens enviadas ao background para assertions de protocolo.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 720

- **Código:** `      message.action === 'GEMINI_RESULT_COMMIT'`
- **Função:** Modela/observa commit final do job após persistência.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 721

- **Código:** `    )).toHaveLength(3);`
- **Função:** Compõe o cenário RUN-14 — retry de commit sem reenviar imagem, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 722

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-14 — retry de commit sem reenviar imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 723

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 724

- **Código:** `  test('RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta', () => {`
- **Função:** Declara cenário: RUN-COV-01 — nenhum card clicável.
- **Contexto:** RUN-COV-01 — nenhum card clicável.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 725

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-COV-01 — nenhum card clicável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 726

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-COV-01 — nenhum card clicável, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-COV-01 — nenhum card clicável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 727

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-COV-01 — nenhum card clicável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 728

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-COV-01 — nenhum card clicável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 729

- **Código:** `    expect(runner.tryClickModelImageCards()).toBe(false);`
- **Função:** Exercita helper que tenta abrir/clicar cards/imagens de resposta.
- **Contexto:** RUN-COV-01 — nenhum card clicável.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 730

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-COV-01 — nenhum card clicável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 731

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 732

- **Código:** `  test('RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato', () => {`
- **Função:** Declara cenário: RUN-COV-02 — candidato stale e fallback.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o contrato.

### Linha 733

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 734

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Compõe o cenário RUN-COV-02 — candidato stale e fallback, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 735

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 736

- **Código:** `    const response = document.createElement('model-response');`
- **Função:** Compõe o cenário RUN-COV-02 — candidato stale e fallback, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 737

- **Código:** `    const brokenButton = document.createElement('button');`
- **Função:** Compõe o cenário RUN-COV-02 — candidato stale e fallback, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 738

- **Código:** `    brokenButton.setAttribute('aria-label', 'image result');`
- **Função:** Compõe o cenário RUN-COV-02 — candidato stale e fallback, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 739

- **Código:** `    brokenButton.click = jest.fn(() => {`
- **Função:** Compõe o cenário RUN-COV-02 — candidato stale e fallback, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 740

- **Código:** `      throw new Error('stale element');`
- **Função:** Simula primeiro candidato DOM stale que lança ao clicar.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 741

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 742

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 743

- **Código:** `    const fallbackCard = document.createElement('div');`
- **Função:** Fornece segundo candidato clicável após falha do primeiro.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 744

- **Código:** `    fallbackCard.className = 'image-card';`
- **Função:** Fornece segundo candidato clicável após falha do primeiro.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 745

- **Código:** `    fallbackCard.click = jest.fn();`
- **Função:** Fornece segundo candidato clicável após falha do primeiro.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 746

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 747

- **Código:** `    response.appendChild(brokenButton);`
- **Função:** Compõe o cenário RUN-COV-02 — candidato stale e fallback, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 748

- **Código:** `    response.appendChild(fallbackCard);`
- **Função:** Fornece segundo candidato clicável após falha do primeiro.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 749

- **Código:** `    document.body.appendChild(response);`
- **Função:** Compõe o cenário RUN-COV-02 — candidato stale e fallback, preparando, executando ou verificando o runner real.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 750

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 751

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Instancia a implementação real com dependências do cenário.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 752

- **Código:** `    expect(runner.tryClickModelImageCards()).toBe(true);`
- **Função:** Exercita helper que tenta abrir/clicar cards/imagens de resposta.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 753

- **Código:** `    expect(brokenButton.click).toHaveBeenCalled();`
- **Função:** Assertion focal do contrato.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 754

- **Código:** `    expect(fallbackCard.click).toHaveBeenCalledTimes(1);`
- **Função:** Fornece segundo candidato clicável após falha do primeiro.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 755

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** RUN-COV-02 — candidato stale e fallback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 756

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 757

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 758 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 15. Conclusão documental

Foram documentadas 757 linhas textuais e a posição 758 do newline final. Os 21 casos principais estão diretamente provados no mesmo blob verde em Node 20/22. No lifecycle canônico, 181-001 está SUPERSEDED por `045-001`, 181-002 está ACCEPTED, 181-003 está SUPERSEDED por `045-005` e 181-004 está ACCEPTED.

> **Lifecycle pós-adversarial:** requests superseded continuam rastreadas nos IDs canônicos 045-001/045-005; requests ACCEPTED permanecem lacunas reconhecidas, não trabalho OPEN.

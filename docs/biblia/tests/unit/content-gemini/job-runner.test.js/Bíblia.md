# Bíblia técnica — tests/unit/content-gemini/job-runner.test.js

> **Estado documental:** 🟡 correção focada concluída; reauditoria independente pendente
> **SHA auditado:** d40f591b95027b0742c5d4c11b47b7c98a775028
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest do pipeline central Gemini JobRunner  
> **Linhas textuais:** 905
> **Posições documentais:** 906, contando a posição final
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

job-runner.test.js é uma das suítes centrais do content Gemini. Ela instancia gemini/job-runner.js real e controla as dependências periféricas para provar guards, helpers, recovery, keep-alive, observer, anti-throttling, HUD manual, refresh do watchdog, quarentena, persistência do resultado e commit final.

As suítes attachment, editor-submit, image-quarantine, deletion e observer possuem provas próprias; aqui o foco é o **wiring e a ordem do pipeline** entre essas dependências.

## 2. Guards e helpers

RUN-00 prova os três grupos de dependências obrigatórias. RUN-01/RUN-01B cobrem Data URL válida, formatos inválidos, `FileImpl` ausente e `DataUrlAtob` ausente. RUN-04/RUN-04B provam waitForElement imediato e inserção tardia em Shadow DOM.

## 3. Recovery e finally

RUN-02 exige que recoverPending.handled encerre antes de abrir keep-alive. RUN-03 força erro logo no início, exige open/close exatamente uma vez e GEMINI_ERROR com job/batch/index/mangaTabId corretos.

## 4. Manual, anti-throttle e observabilidade

RUN-05 entrega URL manual ao observer ativo. RUN-06 fixa temp_chat→minimal e background_delete/minimized_window→balanced. RUN-07/07A congelam normalização balanced/legacy/invalid→minimal e comportamento sem dispatcher. RUN-07B registra qualquer uso do HUD como GEMINI_MANUAL_INTERVENTION_REQUIRED.

O listener MAIN-world do evento anti-throttle é testado separadamente em inject-anti-hibernation.test.js; por isso esta Bíblia não abre duplicação para consumo do evento.

## 5. Refresh do watchdog

RUN-08 valida ACK positivo e deduplicação. RUN-08B força ACK negativo com duas notificações de generation_started: o refresh é enviado uma vez, gera warning e o pipeline chega à persistência. RUN-08C faz sendMessage lançar sincronicamente; o runner registra a falha e conclui o pipeline sem perder o resultado.

## 6. Quarentena e seleção

RUN-09 garante que preview do attachment não é aceito nem automática nem manualmente. RUN-10 bloqueia resultado byte-a-byte idêntico antes de GEMINI_IMAGE_EXTRACTED e reporta GEMINI_ERROR. RUN-11 prova que bytes diferentes atravessam a quarentena e chegam ao stage.

## 7. Persistência antes do commit

RUN-12 prova a ordem GEMINI_IMAGE_EXTRACTED antes de GEMINI_RESULT_COMMIT, proíbe deletion-before-delivery e verifica logContext do extractor. RUN-13 prova que stage falho produz RESULT_STAGE_FAILED e nenhum commit. RUN-14 prova retry de commit por três tentativas com apenas um stage quando o terceiro ACK finalmente confirma.

O branch terminal em que as três tentativas de commit falham ainda não é exercitado.

## 8. Cards de resultado

RUN-COV-01 retorna false quando nenhum candidato existe. RUN-COV-02 simula primeiro botão stale que lança e exige tentativa do próximo .image-card, retornando true após fallback.

## 9. Branches materiais e cobertura adicionada

RUN-08B/08C cobrem falha negativa e exceção síncrona no refresh do watchdog. RUN-15 atravessa o wiring do fallback auxiliar: registro confirmado retorna delivered_auxiliary; rejeição retorna AUXILIARY_REGISTRATION_FAILED e GEMINI_ERROR. Nos dois casos não há stage/commit de imagem direta.

O branch de três falhas no commit (RESULT_COMMIT_FAILED) e timeout de composer seguem sem caso focal nesta revisão; não são considerados provados.

## 10. Evidência CI exata

O run 36521561968 no commit e720890cf34dc9437ee91f3b8172953497d69870 contém exatamente o blob b0daca4ce839d8a5114c8c94e116fa155c721f7b. Os 21 casos RUN/RUN-COV aparecem individualmente com ✓ em Node 20.x (job 109255348388) e Node 22.x (job 109255348406). Ambos fecham com 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 11. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| guards de dependências | RUN-00 | ✅ PROVADO DIRETAMENTE |
| Data URL → File, formatos inválidos e APIs `FileImpl`/`DataUrlAtob` ausentes | RUN-01/01B | ✅ PROVADO DIRETAMENTE |
| recovery antes de keep-alive | RUN-02 | ✅ PROVADO DIRETAMENTE |
| finally fecha keep-alive e reporta erro | RUN-03 | ✅ PROVADO DIRETAMENTE |
| waitForElement DOM/Shadow DOM | RUN-04/04B | ✅ PROVADO DIRETAMENTE |
| resultado manual vai ao observer | RUN-05 | ✅ PROVADO DIRETAMENTE |
| política e evento anti-throttle | RUN-06/07/07A | ✅ PROVADO DIRETAMENTE |
| intervenção manual é erro grave | RUN-07B | ✅ PROVADO DIRETAMENTE |
| watchdog refresh positivo/negativo/exceção, deduplicado e sem abortar geração | RUN-08/08B/08C | ✅ PROVADO DIRETAMENTE |
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
| fallback auxiliar registrado e rejeitado pelo runtime | RUN-15 | ✅ PROVADO DIRETAMENTE |

## 12. Solicitações ao auditor

### 181-001 — TEST_REQUIRED — SUPERSEDED → 045-001 — HIGH

Encontrado: waitForStableComposer exige editor/composer estáveis por 750 ms e pelo menos 1500 ms; ao expirar 12 s lança GEMINI_COMPOSER_NOT_READY. Nenhum caso focal mantém o composer ausente/trocando até o timeout.

Evidência ausente: relógio controlado com selectLiveComposer sempre null ou alternando nós; exigir status error/GEMINI_ERROR com code GEMINI_COMPOSER_NOT_READY, nenhum submit e cleanup do keepalive/anti-throttle.

Risco: re-render contínuo do Gemini pode avançar com nó stale ou travar sem diagnóstico correto.

### 181-002 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: RUN-08 prova somente REFRESH_JOB_WATCHDOG com {ok:true,refreshed:true}. A implementação trata ACK negativo, runtime.lastError e throw como GEMINI_WATCHDOG_REFRESH_FAILED, mantendo o fluxo.

Evidência ausente: ao menos um ACK negativo e um throw/lastError; exigir uma única tentativa, warning correspondente e continuidade do pipeline até entrega.

Risco: falha de refresh pode cancelar indevidamente a geração ou deixar de ser observável.

**Resolução nesta revisão:** RUN-08B verifica ACK negativo, warning, tentativa única e continuidade até persistência; RUN-08C verifica exceção síncrona, warning e continuidade.

### 181-003 — TEST_REQUIRED — SUPERSEDED → 045-005 — HIGH

Encontrado: RUN-14 faz duas falhas e sucesso na terceira tentativa de GEMINI_RESULT_COMMIT. Não cobre o branch após a terceira falha, que lança RESULT_COMMIT_FAILED.

Evidência ausente: três ACKs negativos/no_ack; exigir um único GEMINI_IMAGE_EXTRACTED, três commits, status error/code RESULT_COMMIT_FAILED e GEMINI_ERROR sem re-stage da imagem.

Risco: resultado já persistido pode ficar com job não finalizado e sem diagnóstico consistente.

### 181-004 — INTEGRATION_TEST_REQUIRED — ACCEPTED — HIGH

Encontrado: onAuxiliaryFallback registra GEMINI_RESULT_URL e exige {ok:true,extractionRegistered:true}; o retorno final é delivered_auxiliary. Nenhum caso focal do runner atravessa esse ramo.

Evidência ausente: resultExtractor chamando onAuxiliaryFallback com URL; sucesso deve enviar GEMINI_RESULT_URL com job/batch/index e retornar delivered_auxiliary sem GEMINI_IMAGE_EXTRACTED/commit. Rejeição do registro deve produzir AUXILIARY_REGISTRATION_FAILED e GEMINI_ERROR.

Risco: fallback para aba auxiliar pode parecer disponível no extractor isolado mas quebrar no wiring do runner/background.

**Resolução nesta revisão:** RUN-15 cobre o callback do runner nos caminhos de registro aceito e rejeitado, fixa payload job/batch/index/URL, estado final e ausência de stage/commit direto.

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

function successfulPipelineDependencies({
  inputDataUrl,
  resultDataUrl,
  advanceClock,
  resultExtractor,
  watchdogResponse = { ok: true, refreshed: true },
  generationEventCount = 1,
}) {
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
        for (let i = 0; i < generationEventCount; i += 1) {
          onStateChange('generation_started', { reason: 'response_created' });
        }
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
      extractOrAuxiliaryFallback: resultExtractor || jest.fn(async () => ({
        kind: 'extracted',
        dataUrl: resultDataUrl,
      })),
    },
    sleep: async ms => advanceClock(Number(ms) || 0),
  });
  options.runtime.sendMessage.mockImplementation((message, callback) => {
    runtimeMessages.push(message);
    if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: inputDataUrl });
    else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.(watchdogResponse);
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

    const withoutAtobApi = createGeminiJobRunner({ ...options, DataUrlAtob: null });
    expect(() => withoutAtobApi.dataURLtoFile('data:image/png;base64,QUJDRA==', 'page.png'))
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

  test('RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline', async () => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 20_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const { options, runtimeMessages } = successfulPipelineDependencies({
      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',
      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',
      advanceClock: ms => { clock += ms; },
      watchdogResponse: { ok: false, reason: 'watchdog_unavailable' },
      generationEventCount: 2,
    });

    await expect(createGeminiJobRunner(options).run({
      jobId: 'job-refresh-negative',
      batchId: 'batch-refresh-negative',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 2,
      prompt: 'Traduza.',
      executionMode: 'background_delete',
    })).resolves.toEqual({ status: 'delivered_extracted' });

    expect(runtimeMessages.filter(message => message.action === 'REFRESH_JOB_WATCHDOG'))
      .toEqual([{ action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-refresh-negative' }]);
    expect(runtimeMessages.some(message => message.action === 'GEMINI_IMAGE_EXTRACTED')).toBe(true);
    expect(options.sendLog).toHaveBeenCalledWith(
      'warn',
      'GEMINI_WATCHDOG_REFRESH_FAILED',
      expect.stringContaining('watchdog'),
      expect.objectContaining({ executionMode: 'background_delete' })
    );
  });

  test('RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline', async () => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 30_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const { options, runtimeMessages } = successfulPipelineDependencies({
      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',
      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',
      advanceClock: ms => { clock += ms; },
      generationEventCount: 2,
    });
    const sendMessage = options.runtime.sendMessage;
    options.runtime.sendMessage = jest.fn((message, callback) => {
      if (message.action === 'REFRESH_JOB_WATCHDOG') {
        runtimeMessages.push(message);
        throw new Error('runtime unavailable');
      }
      sendMessage(message, callback);
    });

    await expect(createGeminiJobRunner(options).run({
      jobId: 'job-refresh-throw',
      batchId: 'batch-refresh-throw',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 2,
      prompt: 'Traduza.',
      executionMode: 'background_delete',
    })).resolves.toEqual({ status: 'delivered_extracted' });

    expect(runtimeMessages.filter(message => message.action === 'REFRESH_JOB_WATCHDOG'))
      .toEqual([{ action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-refresh-throw' }]);
    expect(runtimeMessages.some(message => message.action === 'GEMINI_IMAGE_EXTRACTED')).toBe(true);
    expect(options.sendLog).toHaveBeenCalledWith(
      'warn',
      'GEMINI_WATCHDOG_REFRESH_FAILED',
      expect.stringContaining('watchdog'),
      expect.objectContaining({ executionMode: 'background_delete' })
    );
  });

  test.each([
    ['sucesso', { ok: true, extractionRegistered: true }, 'delivered_auxiliary', null],
    ['falha', { ok: false, reason: 'stale_job' }, 'error', 'AUXILIARY_REGISTRATION_FAILED'],
  ])('RUN-15: fallback auxiliar exige registro confirmado (%s)', async (_label, registration, expectedStatus, expectedCode) => {
    const { createGeminiJobRunner } = loadModule();
    let clock = 40_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    const auxiliaryUrl = 'https://cdn.example/auxiliary-result.png';
    const extractor = jest.fn(async ({ onAuxiliaryFallback }) => {
      await onAuxiliaryFallback({ url: auxiliaryUrl });
      return { kind: 'auxiliary' };
    });
    const { options, runtimeMessages } = successfulPipelineDependencies({
      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',
      resultDataUrl: 'https://cdn.example/observed-result.png',
      advanceClock: ms => { clock += ms; },
      resultExtractor: extractor,
    });
    const sendMessage = options.runtime.sendMessage;
    options.runtime.sendMessage = jest.fn((message, callback) => {
      if (message.action === 'GEMINI_RESULT_URL') {
        runtimeMessages.push(message);
        callback?.(registration);
        return;
      }
      sendMessage(message, callback);
    });

    const result = await createGeminiJobRunner(options).run({
      jobId: 'job-auxiliary',
      batchId: 'batch-auxiliary',
      geminiTabId: 321,
      mangaTabId: 77,
      index: 9,
      prompt: 'Traduza.',
      executionMode: 'background_delete',
    });

    expect(result.status).toBe(expectedStatus);
    if (expectedCode) expect(result.error.code).toBe(expectedCode);
    else expect(result).toEqual({ status: 'delivered_auxiliary' });
    expect(extractor).toHaveBeenCalledTimes(1);
    expect(runtimeMessages.filter(message => message.action === 'GEMINI_RESULT_URL'))
      .toEqual([{
        action: 'GEMINI_RESULT_URL',
        mangaTabId: 77,
        index: 9,
        url: auxiliaryUrl,
        jobId: 'job-auxiliary',
        batchId: 'batch-auxiliary',
      }]);
    expect(runtimeMessages.some(message => message.action === 'GEMINI_IMAGE_EXTRACTED')).toBe(false);
    expect(runtimeMessages.some(message => message.action === 'GEMINI_RESULT_COMMIT')).toBe(false);
    if (expectedCode) {
      expect(runtimeMessages).toContainEqual(expect.objectContaining({
        action: 'GEMINI_ERROR',
        jobId: 'job-auxiliary',
        batchId: 'batch-auxiliary',
      }));
    }
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
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 003

- **Código:** `const path = require('path');`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 004

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 005

- **Código:** `const RUNNER_PATH = path.resolve(`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 006

- **Código:** `  __dirname,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 007

- **Código:** `  '../../../extension/content/gemini/job-runner.js'`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 008

- **Código:** `);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 009

- **Código:** `const SELECTORS_PATH = path.resolve(`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 010

- **Código:** `  __dirname,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 011

- **Código:** `  '../../../extension/content/gemini/selectors.js'`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 012

- **Código:** `);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 013

- **Código:** `const DOM_PATH = path.resolve(`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 014

- **Código:** `  __dirname,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 015

- **Código:** `  '../../../extension/content/gemini/dom.js'`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 016

- **Código:** `);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 017

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 018

- **Código:** `function loadModule() {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 019

- **Código:** `  let api;`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 020

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 021

- **Código:** `    api = require(RUNNER_PATH);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 022

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 023

- **Código:** `  return api;`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 024

- **Código:** `}`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 025

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 026

- **Código:** `function baseDependencies(overrides = {}) {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 027

- **Código:** `  const runtimeMessages = [];`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 028

- **Código:** `  const runtime = {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 029

- **Código:** `    lastError: null,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 030

- **Código:** `    sendMessage: jest.fn((message, callback) => {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 031

- **Código:** `      runtimeMessages.push(message);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 032

- **Código:** `      if (callback) callback(null);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 033

- **Código:** `    }),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 034

- **Código:** `  };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 035

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 036

- **Código:** `  const storage = {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 037

- **Código:** `    get: jest.fn((keys, callback) => callback({})),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 038

- **Código:** `  };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 039

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 040

- **Código:** `  const domApi = {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 041

- **Código:** `    getImageSource: image => image?.src || '',`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 042

- **Código:** `    isIgnoredGeminiImageSource: () => false,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 043

- **Código:** `    isModelResponseImage: () => false,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 044

- **Código:** `    findAllDeep: () => [],`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 045

- **Código:** `    getEditableElement: element => element,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 046

- **Código:** `    findSendButton: () => null,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 047

- **Código:** `  };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 048

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 049

- **Código:** `  const deletionController = {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 050

- **Código:** `    recoverPending: jest.fn(async () => ({`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 051

- **Código:** `      handled: false,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 052

- **Código:** `      deleted: false,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 053

- **Código:** `      recovery: null,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 054

- **Código:** `    })),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 055

- **Código:** `    deleteCurrentConversation: jest.fn(async () => true),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 056

- **Código:** `    deleteOrScheduleRecovery: jest.fn(async () => ({`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 057

- **Código:** `      deleted: true,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 058

- **Código:** `      recoverySaved: false,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 059

- **Código:** `      reloadScheduled: false,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 060

- **Código:** `    })),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 061

- **Código:** `  };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 062

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 063

- **Código:** `  return {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 064

- **Código:** `    runtimeMessages,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 065

- **Código:** `    options: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 066

- **Código:** `      root: document,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 067

- **Código:** `      pageWindow: window,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 068

- **Código:** `      runtime,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 069

- **Código:** `      storage,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 070

- **Código:** `      domApi,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 071

- **Código:** `      observerApi: { createGeminiObserver: jest.fn() },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 072

- **Código:** `      editorApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 073

- **Código:** `        submitWithConfirmation: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 074

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 075

- **Código:** `      attachmentApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 076

- **Código:** `        attachFile: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 077

- **Código:** `        findFileInputsDeep: jest.fn(() => []),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 078

- **Código:** `        listAttachmentEvidence: jest.fn(() => []),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 079

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 080

- **Código:** `      temporaryChatApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 081

- **Código:** `        ensureActive: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 082

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 083

- **Código:** `      resultExtractor: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 084

- **Código:** `        extractOrAuxiliaryFallback: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 085

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 086

- **Código:** `      deletionController,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 087

- **Código:** `      sleep: async () => {},`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 088

- **Código:** `      sendLog: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 089

- **Código:** `      getUrlLogMetadata: () => ({}),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 090

- **Código:** `      debugConsole: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 091

- **Código:** `      reportProgress: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 092

- **Código:** `      openKeepAlive: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 093

- **Código:** `      closeKeepAlive: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 094

- **Código:** `      ...overrides,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 095

- **Código:** `    },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 096

- **Código:** `  };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 097

- **Código:** `}`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 098

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 099

- **Código:** `function successfulPipelineDependencies({`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 100

- **Código:** `  inputDataUrl,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 101

- **Código:** `  resultDataUrl,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 102

- **Código:** `  advanceClock,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 103

- **Código:** `  resultExtractor,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 104

- **Código:** `  watchdogResponse = { ok: true, refreshed: true },`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 105

- **Código:** `  generationEventCount = 1,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 106

- **Código:** `}) {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 107

- **Código:** `  const editor = document.createElement('div');`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 108

- **Código:** `  editor.setAttribute('contenteditable', 'true');`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 109

- **Código:** `  const composer = document.createElement('rich-textarea');`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 110

- **Código:** `  composer.appendChild(editor);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 111

- **Código:** `  document.body.appendChild(composer);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 112

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 113

- **Código:** `  let onStateChange = null;`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 114

- **Código:** `  const observer = {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 115

- **Código:** `    start: jest.fn(function() { return this; }),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 116

- **Código:** `    stop: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 117

- **Código:** `    waitForResult: jest.fn(async () => ({ image: null, url: resultDataUrl })),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 118

- **Código:** `  };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 119

- **Código:** `  const domApi = {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 120

- **Código:** `    getImageSource: image => image?.src || '',`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 121

- **Código:** `    isIgnoredGeminiImageSource: () => false,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 122

- **Código:** `    isModelResponseImage: image => Boolean(image?.closest?.('model-response')),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 123

- **Código:** `    getStrictModelResponseContainer: image => image?.closest?.('model-response') || null,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 124

- **Código:** `    getUserTurnContainer: image => image?.closest?.('[data-message-author="user"]') || null,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 125

- **Código:** `    isInsideInputArea: image => Boolean(image?.closest?.('rich-textarea')),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 126

- **Código:** `    findAllDeep: (root, matcher) => [root, ...root.querySelectorAll('*')].filter(matcher),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 127

- **Código:** `    getEditableElement: element => element,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 128

- **Código:** `    findSendButton: () => null,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 129

- **Código:** `    isElementVisible: () => true,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 130

- **Código:** `  };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 131

- **Código:** `  const { options, runtimeMessages } = baseDependencies({`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 132

- **Código:** `    domApi,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 133

- **Código:** `    observerApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 134

- **Código:** `      createGeminiObserver: jest.fn(config => {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 135

- **Código:** `        onStateChange = config.onStateChange;`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 136

- **Código:** `        return observer;`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 137

- **Código:** `      }),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 138

- **Código:** `    },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 139

- **Código:** `    editorApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 140

- **Código:** `      submitWithConfirmation: jest.fn(async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 141

- **Código:** `        for (let i = 0; i < generationEventCount; i += 1) {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 142

- **Código:** `          onStateChange('generation_started', { reason: 'response_created' });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 143

- **Código:** `        }`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 144

- **Código:** `        return { confirmed: true, attempt: 1, reason: 'response_created' };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 145

- **Código:** `      }),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 146

- **Código:** `    },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 147

- **Código:** `    attachmentApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 148

- **Código:** `      attachFile: jest.fn(async () => ({`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 149

- **Código:** `        attempted: true,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 150

- **Código:** `        confirmed: true,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 151

- **Código:** `        evidence: { type: 'container' },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 152

- **Código:** `        methodsAttempted: ['file_input'],`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 153

- **Código:** `      })),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 154

- **Código:** `      findFileInputsDeep: jest.fn(() => []),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 155

- **Código:** `      listAttachmentEvidence: jest.fn(() => []),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 156

- **Código:** `    },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 157

- **Código:** `    resultExtractor: {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 158

- **Código:** `      extractOrAuxiliaryFallback: resultExtractor || jest.fn(async () => ({`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 159

- **Código:** `        kind: 'extracted',`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 160

- **Código:** `        dataUrl: resultDataUrl,`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 161

- **Código:** `      })),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 162

- **Código:** `    },`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 163

- **Código:** `    sleep: async ms => advanceClock(Number(ms) || 0),`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 164

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 165

- **Código:** `  options.runtime.sendMessage.mockImplementation((message, callback) => {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 166

- **Código:** `    runtimeMessages.push(message);`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 167

- **Código:** `    if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: inputDataUrl });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 168

- **Código:** `    else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.(watchdogResponse);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 169

- **Código:** `    else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: true, staged: true, persisted: true });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 170

- **Código:** `    else if (message.action === 'GEMINI_RESULT_COMMIT') callback?.({ ok: true, committed: true });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 171

- **Código:** `    else if (message.action === 'GEMINI_RESULT_URL') callback?.({ ok: true, extractionRegistered: true });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 172

- **Código:** `    else callback?.({ ok: true });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 173

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 174

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 175

- **Código:** `  return { options, runtimeMessages };`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 176

- **Código:** `}`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 177

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 178

- **Código:** `describe('gemini/job-runner.js', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 179

- **Código:** `  beforeEach(() => {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 180

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 181

- **Código:** `    delete window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 182

- **Código:** `    delete window.__mangaTranslatorManualGeminiResultUrl;`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 183

- **Código:** `    delete window.__mangaTranslatorManualPickHandler;`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 184

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 185

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 186

- **Código:** `  afterEach(() => {`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 187

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 188

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 189

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 190

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** setup/helpers e dependências comuns
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 191

- **Código:** `  test('RUN-00: rejeita dependências obrigatórias ausentes com erro explícito', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 192

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 193

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 194

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 195

- **Código:** `    expect(() => createGeminiJobRunner({ ...options, root: null }))`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 196

- **Código:** `      .toThrow('JobRunner requer document/window/runtime/storage');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 197

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 198

- **Código:** `    expect(() => createGeminiJobRunner({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 199

- **Código:** `      ...options,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 200

- **Código:** `      domApi: null,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 201

- **Código:** `      // Evita que o default de imageQuarantine falhe antes da guarda do runner.`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 202

- **Código:** `      imageQuarantine: {},`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 203

- **Código:** `    }))`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 204

- **Código:** `      .toThrow('JobRunner requer módulos Gemini DOM/Observer/Editor/Attachment/TemporaryChat');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 205

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 206

- **Código:** `    expect(() => createGeminiJobRunner({ ...options, resultExtractor: null }))`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 207

- **Código:** `      .toThrow('JobRunner requer resultExtractor e deletionController');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 208

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 209

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-00: rejeita dependências obrigatórias ausentes com erro explícito
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 210

- **Código:** `  test('RUN-01: dataURLtoFile valida e converte PNG', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 211

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 212

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 213

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 214

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 215

- **Código:** `    const file = runner.dataURLtoFile(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 216

- **Código:** `      'data:image/png;base64,QUJDRA==',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 217

- **Código:** `      'page.png'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 218

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 219

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 220

- **Código:** `    expect(file).toBeInstanceOf(File);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 221

- **Código:** `    expect(file.type).toBe('image/png');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 222

- **Código:** `    expect(file.name).toBe('page.png');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 223

- **Código:** `    expect(file.size).toBe(4);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 224

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 225

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01: dataURLtoFile valida e converte PNG
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 226

- **Código:** `  test('RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 227

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 228

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 229

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 230

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 231

- **Código:** `    expect(() => runner.dataURLtoFile('invalid', 'page.png'))`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 232

- **Código:** `      .toThrow('sem vírgula separadora');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 233

- **Código:** `    expect(() => runner.dataURLtoFile('data:,QUJDRA==', 'page.png'))`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 234

- **Código:** `      .toThrow('MIME não encontrado');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 235

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 236

- **Código:** `    const withoutFileApi = createGeminiJobRunner({ ...options, FileImpl: null });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 237

- **Código:** `    expect(() => withoutFileApi.dataURLtoFile('data:image/png;base64,QUJDRA==', 'page.png'))`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 238

- **Código:** `      .toThrow('APIs de arquivo indisponíveis');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 239

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 240

- **Código:** `    const withoutAtobApi = createGeminiJobRunner({ ...options, DataUrlAtob: null });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 241

- **Código:** `    expect(() => withoutAtobApi.dataURLtoFile('data:image/png;base64,QUJDRA==', 'page.png'))`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 242

- **Código:** `      .toThrow('APIs de arquivo indisponíveis');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 243

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 244

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-01B: dataURLtoFile rejeita formato inválido e APIs ausentes
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 245

- **Código:** `  test('RUN-02: recovery pendente encerra antes de abrir keepalive', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 246

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 247

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 248

- **Código:** `    options.deletionController.recoverPending.mockResolvedValue({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 249

- **Código:** `      handled: true,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 250

- **Código:** `      deleted: true,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 251

- **Código:** `      recovery: { delivery: { action: 'GEMINI_ERROR' } },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 252

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 253

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 254

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 255

- **Código:** `    const result = await runner.run({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 256

- **Código:** `      jobId: 'job-recovery',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 257

- **Código:** `      geminiTabId: 88,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 258

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 259

- **Código:** `      index: 1,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 260

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 261

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 262

- **Código:** `    expect(result).toEqual({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 263

- **Código:** `      status: 'recovery_handled',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 264

- **Código:** `      deleted: true,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 265

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 266

- **Código:** `    expect(options.openKeepAlive).not.toHaveBeenCalled();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 267

- **Código:** `    expect(options.closeKeepAlive).not.toHaveBeenCalled();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 268

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 269

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-02: recovery pendente encerra antes de abrir keepalive
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 270

- **Código:** `  test('RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 271

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 272

- **Código:** `    const { options, runtimeMessages } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 273

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 274

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 275

- **Código:** `    const result = await runner.run({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 276

- **Código:** `      jobId: 'job-no-image',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 277

- **Código:** `      batchId: 'batch-1',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 278

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 279

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 280

- **Código:** `      index: 5,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 281

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 282

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 283

- **Código:** `    expect(options.openKeepAlive).toHaveBeenCalledTimes(1);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 284

- **Código:** `    expect(options.closeKeepAlive).toHaveBeenCalledTimes(1);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 285

- **Código:** `    expect(result.status).toBe('error');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 286

- **Código:** `    expect(runtimeMessages).toContainEqual(expect.objectContaining({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 287

- **Código:** `      action: 'GEMINI_ERROR',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 288

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 289

- **Código:** `      index: 5,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 290

- **Código:** `      jobId: 'job-no-image',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 291

- **Código:** `      batchId: 'batch-1',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 292

- **Código:** `    }));`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 293

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 294

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-03: erro inicial fecha keepalive no finally e reporta GEMINI_ERROR
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 295

- **Código:** `  test('RUN-04: waitForElement resolve imediatamente quando o editor já existe', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 296

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 297

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 298

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 299

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 300

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 301

- **Código:** `    editor.className = 'ql-editor';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 302

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 303

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 304

- **Código:** `    await expect(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 305

- **Código:** `      runner.waitForElement('.ql-editor', 100)`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 306

- **Código:** `    ).resolves.toBe(editor);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 307

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 308

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04: waitForElement resolve imediatamente quando o editor já existe
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 309

- **Código:** `  test('RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 310

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 311

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 312

- **Código:** `    let realDom;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 313

- **Código:** `    jest.isolateModules(() => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 314

- **Código:** `      require(SELECTORS_PATH);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 315

- **Código:** `      realDom = require(DOM_PATH);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 316

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 317

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 318

- **Código:** `    const { options } = baseDependencies({ domApi: realDom });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 319

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 320

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 321

- **Código:** `    const host = document.createElement('gemini-composer');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 322

- **Código:** `    const shadow = host.attachShadow({ mode: 'open' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 323

- **Código:** `    document.body.appendChild(host);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 324

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 325

- **Código:** `    const pending = runner.waitForElement('.ql-editor', 1000);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 326

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 327

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 328

- **Código:** `    editor.className = 'ql-editor';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 329

- **Código:** `    shadow.appendChild(editor);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 330

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 331

- **Código:** `    await expect(pending).resolves.toBe(editor);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 332

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 333

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-04B: waitForElement observa editor inserido depois dentro de Shadow DOM
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 334

- **Código:** `  test('RUN-05: seleção manual é entregue ao observer ativo existente', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 335

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 336

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 337

- **Código:** `    const observer = {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 338

- **Código:** `      acceptResult: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 339

- **Código:** `    };`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 340

- **Código:** `    window.__mangaTranslatorActiveGeminiObserver = observer;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 341

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 342

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 343

- **Código:** `    runner.setManualGeminiResultUrl(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 344

- **Código:** `      'https://cdn.example/result.png',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 345

- **Código:** `      'test'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 346

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 347

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 348

- **Código:** `    expect(observer.acceptResult).toHaveBeenCalledWith(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 349

- **Código:** `      null,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 350

- **Código:** `      'https://cdn.example/result.png'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 351

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 352

- **Código:** `    expect(window.__mangaTranslatorManualGeminiResultUrl).toBe(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 353

- **Código:** `      'https://cdn.example/result.png'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 354

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 355

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 356

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-05: seleção manual é entregue ao observer ativo existente
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 357

- **Código:** `  test('RUN-06: modos de execução escolhem anti-throttling progressivo', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 358

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 359

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 360

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 361

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 362

- **Código:** `    expect(runner.getAntiThrottleModeForExecutionMode('temp_chat')).toBe('minimal');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 363

- **Código:** `    expect(runner.getAntiThrottleModeForExecutionMode('background_delete')).toBe('balanced');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 364

- **Código:** `    expect(runner.getAntiThrottleModeForExecutionMode('minimized_window')).toBe('balanced');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 365

- **Código:** `    expect(runner.getAntiThrottleModeForExecutionMode('unknown')).toBe('minimal');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 366

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 367

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-06: modos de execução escolhem anti-throttling progressivo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 368

- **Código:** `  test('RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 369

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 370

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 371

- **Código:** `    const received = [];`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 372

- **Código:** `    const listener = event => received.push(event.detail && event.detail.mode);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 373

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 374

- **Código:** `    window.addEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', listener);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 375

- **Código:** `    try {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 376

- **Código:** `      const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 377

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 378

- **Código:** `      expect(runner.setAntiThrottleMode('balanced')).toBe('balanced');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 379

- **Código:** `      expect(runner.setAntiThrottleMode('legacy')).toBe('legacy');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 380

- **Código:** `      expect(runner.setAntiThrottleMode('qualquer-coisa')).toBe('minimal');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 381

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 382

- **Código:** `      expect(received).toEqual(['balanced', 'legacy', 'minimal']);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 383

- **Código:** `    } finally {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 384

- **Código:** `      window.removeEventListener('MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE', listener);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 385

- **Código:** `    }`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 386

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 387

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07: setAntiThrottleMode publica evento MAIN-world e normaliza inválidos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 388

- **Código:** `  test('RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 389

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 390

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 391

- **Código:** `    const runner = createGeminiJobRunner({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 392

- **Código:** `      ...options,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 393

- **Código:** `      pageWindow: {},`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 394

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 395

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 396

- **Código:** `    expect(runner.setAntiThrottleMode('balanced')).toBe('balanced');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 397

- **Código:** `    expect(runner.setAntiThrottleMode('invalid')).toBe('minimal');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 398

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 399

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07A: setAntiThrottleMode preserva o modo sem um dispatcher de eventos
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 400

- **Código:** `  test('RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 401

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 402

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 403

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 404

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 405

- **Código:** `    runner.createGeminiManualPanel({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 406

- **Código:** `      index: 2,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 407

- **Código:** `      jobId: 'manual-required-job',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 408

- **Código:** `      executionMode: 'temp_chat',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 409

- **Código:** `    }, () => new Set());`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 410

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 411

- **Código:** `    document.getElementById('mt-gemini-use-last').click();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 412

- **Código:** `    document.getElementById('mt-gemini-pick').click();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 413

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 414

- **Código:** `    const severeCalls = options.sendLog.mock.calls.filter(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 415

- **Código:** `      ([level, action]) =>`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 416

- **Código:** `        level === 'error' &&`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 417

- **Código:** `        action === 'GEMINI_MANUAL_INTERVENTION_REQUIRED'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 418

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 419

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 420

- **Código:** `    expect(severeCalls).toHaveLength(2);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 421

- **Código:** `    expect(severeCalls[0][3]).toEqual(expect.objectContaining({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 422

- **Código:** `      source: 'last-button',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 423

- **Código:** `      index: 2,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 424

- **Código:** `      executionMode: 'temp_chat',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 425

- **Código:** `      jobIdPrefix: 'manual-r',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 426

- **Código:** `    }));`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 427

- **Código:** `    expect(severeCalls[1][3]).toEqual(expect.objectContaining({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 428

- **Código:** `      source: 'pick-button',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 429

- **Código:** `    }));`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 430

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 431

- **Código:** `    runner.removeGeminiManualPanel();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 432

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 433

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-07B: qualquer uso do HUD manual é registrado como erro grave de automação
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 434

- **Código:** `  test('RUN-08: início da geração renova o watchdog uma única vez e valida a resposta', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 435

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 436

- **Código:** `    let clock = 10_000;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 437

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 438

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 439

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 440

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 441

- **Código:** `    const composer = document.createElement('rich-textarea');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 442

- **Código:** `    composer.appendChild(editor);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 443

- **Código:** `    document.body.appendChild(composer);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 444

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 445

- **Código:** `    let onStateChange = null;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 446

- **Código:** `    const observer = {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 447

- **Código:** `      start: jest.fn(function() { return this; }),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 448

- **Código:** `      stop: jest.fn(),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 449

- **Código:** `      waitForResult: jest.fn(async () => ({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 450

- **Código:** `        image: null,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 451

- **Código:** `        url: 'https://lh3.googleusercontent.com/gg-dl/RUNNER_RESULT',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 452

- **Código:** `      })),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 453

- **Código:** `    };`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 454

- **Código:** `    const { options, runtimeMessages } = baseDependencies({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 455

- **Código:** `      sleep: async ms => { clock += Number(ms) || 0; },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 456

- **Código:** `      domApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 457

- **Código:** `        getImageSource: image => image?.src || '',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 458

- **Código:** `        isIgnoredGeminiImageSource: () => false,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 459

- **Código:** `        isModelResponseImage: () => false,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 460

- **Código:** `        getEditableElement: element => element,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 461

- **Código:** `        findSendButton: () => null,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 462

- **Código:** `        isElementVisible: () => true,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 463

- **Código:** `        findAllDeep: (root, matcher) => [root, ...root.querySelectorAll('*')].filter(matcher),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 464

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 465

- **Código:** `      observerApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 466

- **Código:** `        createGeminiObserver: jest.fn(config => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 467

- **Código:** `          onStateChange = config.onStateChange;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 468

- **Código:** `          return observer;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 469

- **Código:** `        }),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 470

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 471

- **Código:** `      editorApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 472

- **Código:** `        submitWithConfirmation: jest.fn(async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 473

- **Código:** `          onStateChange('generation_started', { reason: 'stop_visible' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 474

- **Código:** `          onStateChange('generation_started', { reason: 'response_created' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 475

- **Código:** `          return { confirmed: true, attempt: 1, reason: 'stop_visible' };`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 476

- **Código:** `        }),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 477

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 478

- **Código:** `      attachmentApi: {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 479

- **Código:** `        attachFile: jest.fn(async () => ({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 480

- **Código:** `          attempted: true,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 481

- **Código:** `          confirmed: true,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 482

- **Código:** `          evidence: { type: 'container' },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 483

- **Código:** `          methodsAttempted: ['file_input'],`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 484

- **Código:** `        })),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 485

- **Código:** `        findFileInputsDeep: jest.fn(() => []),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 486

- **Código:** `        listAttachmentEvidence: jest.fn(() => []),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 487

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 488

- **Código:** `      resultExtractor: {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 489

- **Código:** `        extractOrAuxiliaryFallback: jest.fn(async () => ({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 490

- **Código:** `          kind: 'extracted',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 491

- **Código:** `          dataUrl: 'data:image/png;base64,RESULT',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 492

- **Código:** `        })),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 493

- **Código:** `      },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 494

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 495

- **Código:** `    options.runtime.sendMessage.mockImplementation((message, callback) => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 496

- **Código:** `      runtimeMessages.push(message);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 497

- **Código:** `      if (message.action === 'REQUEST_IMAGE_DATA') {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 498

- **Código:** `        callback?.({ srcData: 'data:image/png;base64,QUJDRA==' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 499

- **Código:** `      } else if (message.action === 'REFRESH_JOB_WATCHDOG') {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 500

- **Código:** `        callback?.({ ok: true, refreshed: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 501

- **Código:** `      } else if (message.action === 'GEMINI_IMAGE_EXTRACTED') {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 502

- **Código:** `        callback?.({ ok: true, staged: true, persisted: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 503

- **Código:** `      } else if (message.action === 'GEMINI_RESULT_COMMIT') {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 504

- **Código:** `        callback?.({ ok: true, committed: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 505

- **Código:** `      } else {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 506

- **Código:** `        callback?.({ ok: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 507

- **Código:** `      }`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 508

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 509

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 510

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 511

- **Código:** `    await expect(runner.run({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 512

- **Código:** `      jobId: 'job-refresh',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 513

- **Código:** `      batchId: 'batch-1',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 514

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 515

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 516

- **Código:** `      index: 2,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 517

- **Código:** `      prompt: 'Traduza a imagem para português brasileiro.',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 518

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 519

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 520

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 521

- **Código:** `    expect(runtimeMessages.filter(message =>`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 522

- **Código:** `      message.action === 'REFRESH_JOB_WATCHDOG'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 523

- **Código:** `    )).toEqual([{ action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-refresh' }]);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 524

- **Código:** `    expect(options.sendLog).toHaveBeenCalledWith(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 525

- **Código:** `      'success',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 526

- **Código:** `      'GEMINI_WATCHDOG_REFRESH_CONFIRMED',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 527

- **Código:** `      expect.stringContaining('reiniciado'),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 528

- **Código:** `      expect.objectContaining({ executionMode: 'background_delete' })`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 529

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 530

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 531

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-08: início da geração renova o watchdog uma única vez e valida a resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 532

- **Código:** `  test('RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline', async () => {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 533

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 534

- **Código:** `    let clock = 20_000;`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 535

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 536

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 537

- **Código:** `      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 538

- **Código:** `      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 539

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 540

- **Código:** `      watchdogResponse: { ok: false, reason: 'watchdog_unavailable' },`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 541

- **Código:** `      generationEventCount: 2,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 542

- **Código:** `    });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 543

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 544

- **Código:** `    await expect(createGeminiJobRunner(options).run({`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 545

- **Código:** `      jobId: 'job-refresh-negative',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 546

- **Código:** `      batchId: 'batch-refresh-negative',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 547

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 548

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 549

- **Código:** `      index: 2,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 550

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 551

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 552

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 553

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 554

- **Código:** `    expect(runtimeMessages.filter(message => message.action === 'REFRESH_JOB_WATCHDOG'))`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 555

- **Código:** `      .toEqual([{ action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-refresh-negative' }]);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 556

- **Código:** `    expect(runtimeMessages.some(message => message.action === 'GEMINI_IMAGE_EXTRACTED')).toBe(true);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 557

- **Código:** `    expect(options.sendLog).toHaveBeenCalledWith(`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 558

- **Código:** `      'warn',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 559

- **Código:** `      'GEMINI_WATCHDOG_REFRESH_FAILED',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 560

- **Código:** `      expect.stringContaining('watchdog'),`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 561

- **Código:** `      expect.objectContaining({ executionMode: 'background_delete' })`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 562

- **Código:** `    );`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 563

- **Código:** `  });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 564

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08B: refresh negativo do watchdog é registrado e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 565

- **Código:** `  test('RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline', async () => {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 566

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 567

- **Código:** `    let clock = 30_000;`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 568

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 569

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 570

- **Código:** `      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 571

- **Código:** `      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 572

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 573

- **Código:** `      generationEventCount: 2,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 574

- **Código:** `    });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 575

- **Código:** `    const sendMessage = options.runtime.sendMessage;`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 576

- **Código:** `    options.runtime.sendMessage = jest.fn((message, callback) => {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 577

- **Código:** `      if (message.action === 'REFRESH_JOB_WATCHDOG') {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 578

- **Código:** `        runtimeMessages.push(message);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 579

- **Código:** `        throw new Error('runtime unavailable');`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 580

- **Código:** `      }`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 581

- **Código:** `      sendMessage(message, callback);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 582

- **Código:** `    });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 583

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 584

- **Código:** `    await expect(createGeminiJobRunner(options).run({`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 585

- **Código:** `      jobId: 'job-refresh-throw',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 586

- **Código:** `      batchId: 'batch-refresh-throw',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 587

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 588

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 589

- **Código:** `      index: 2,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 590

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 591

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 592

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 593

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 594

- **Código:** `    expect(runtimeMessages.filter(message => message.action === 'REFRESH_JOB_WATCHDOG'))`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 595

- **Código:** `      .toEqual([{ action: 'REFRESH_JOB_WATCHDOG', jobId: 'job-refresh-throw' }]);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 596

- **Código:** `    expect(runtimeMessages.some(message => message.action === 'GEMINI_IMAGE_EXTRACTED')).toBe(true);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 597

- **Código:** `    expect(options.sendLog).toHaveBeenCalledWith(`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 598

- **Código:** `      'warn',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 599

- **Código:** `      'GEMINI_WATCHDOG_REFRESH_FAILED',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 600

- **Código:** `      expect.stringContaining('watchdog'),`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 601

- **Código:** `      expect.objectContaining({ executionMode: 'background_delete' })`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 602

- **Código:** `    );`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 603

- **Código:** `  });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 604

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 605

- **Código:** `  test.each([`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 606

- **Código:** `    ['sucesso', { ok: true, extractionRegistered: true }, 'delivered_auxiliary', null],`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 607

- **Código:** `    ['falha', { ok: false, reason: 'stale_job' }, 'error', 'AUXILIARY_REGISTRATION_FAILED'],`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-08C: exceção síncrona no refresh é registrada e não interrompe o pipeline
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 608

- **Código:** `  ])('RUN-15: fallback auxiliar exige registro confirmado (%s)', async (_label, registration, expectedStatus, expectedCode) => {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 609

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 610

- **Código:** `    let clock = 40_000;`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 611

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 612

- **Código:** `    const auxiliaryUrl = 'https://cdn.example/auxiliary-result.png';`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 613

- **Código:** `    const extractor = jest.fn(async ({ onAuxiliaryFallback }) => {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 614

- **Código:** `      await onAuxiliaryFallback({ url: auxiliaryUrl });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 615

- **Código:** `      return { kind: 'auxiliary' };`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 616

- **Código:** `    });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 617

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 618

- **Código:** `      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 619

- **Código:** `      resultDataUrl: 'https://cdn.example/observed-result.png',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 620

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 621

- **Código:** `      resultExtractor: extractor,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 622

- **Código:** `    });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 623

- **Código:** `    const sendMessage = options.runtime.sendMessage;`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 624

- **Código:** `    options.runtime.sendMessage = jest.fn((message, callback) => {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 625

- **Código:** `      if (message.action === 'GEMINI_RESULT_URL') {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 626

- **Código:** `        runtimeMessages.push(message);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 627

- **Código:** `        callback?.(registration);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 628

- **Código:** `        return;`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 629

- **Código:** `      }`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 630

- **Código:** `      sendMessage(message, callback);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 631

- **Código:** `    });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 632

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 633

- **Código:** `    const result = await createGeminiJobRunner(options).run({`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 634

- **Código:** `      jobId: 'job-auxiliary',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 635

- **Código:** `      batchId: 'batch-auxiliary',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 636

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 637

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 638

- **Código:** `      index: 9,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 639

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 640

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 641

- **Código:** `    });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 642

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 643

- **Código:** `    expect(result.status).toBe(expectedStatus);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 644

- **Código:** `    if (expectedCode) expect(result.error.code).toBe(expectedCode);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 645

- **Código:** `    else expect(result).toEqual({ status: 'delivered_auxiliary' });`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 646

- **Código:** `    expect(extractor).toHaveBeenCalledTimes(1);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 647

- **Código:** `    expect(runtimeMessages.filter(message => message.action === 'GEMINI_RESULT_URL'))`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 648

- **Código:** `      .toEqual([{`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 649

- **Código:** `        action: 'GEMINI_RESULT_URL',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 650

- **Código:** `        mangaTabId: 77,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 651

- **Código:** `        index: 9,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 652

- **Código:** `        url: auxiliaryUrl,`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 653

- **Código:** `        jobId: 'job-auxiliary',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 654

- **Código:** `        batchId: 'batch-auxiliary',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 655

- **Código:** `      }]);`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 656

- **Código:** `    expect(runtimeMessages.some(message => message.action === 'GEMINI_IMAGE_EXTRACTED')).toBe(false);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 657

- **Código:** `    expect(runtimeMessages.some(message => message.action === 'GEMINI_RESULT_COMMIT')).toBe(false);`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 658

- **Código:** `    if (expectedCode) {`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 659

- **Código:** `      expect(runtimeMessages).toContainEqual(expect.objectContaining({`
- **Função:** Fixa uma expectativa verificável para o comportamento exercitado.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 660

- **Código:** `        action: 'GEMINI_ERROR',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 661

- **Código:** `        jobId: 'job-auxiliary',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 662

- **Código:** `        batchId: 'batch-auxiliary',`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 663

- **Código:** `      }));`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 664

- **Código:** `    }`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 665

- **Código:** `  });`
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 666

- **Código:** *(linha vazia)*
- **Função:** Prepara dependências, dados ou controle do caso.
- **Contexto:** RUN-15: fallback auxiliar exige registro confirmado (%s)
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — setup ou execução do cenário.

### Linha 667

- **Código:** `  test('RUN-09: seleção automática e manual recusam imagens do preview do anexo', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 668

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 669

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 670

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 671

- **Código:** `    const preview = document.createElement('file-preview');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 672

- **Código:** `    const image = document.createElement('img');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 673

- **Código:** `    image.src = 'blob:https://gemini.google.com/input-preview';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 674

- **Código:** `    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 675

- **Código:** `    Object.defineProperty(image, 'naturalHeight', { value: 1800, configurable: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 676

- **Código:** `    preview.appendChild(image);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 677

- **Código:** `    document.body.appendChild(preview);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 678

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 679

- **Código:** `    expect(runner.isLikelyGeneratedImage(image)).toBe(false);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 680

- **Código:** `    expect(runner.isManualSelectableImage(image)).toBe(false);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 681

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 682

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-09: seleção automática e manual recusam imagens do preview do anexo
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 683

- **Código:** `  test('RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 684

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 685

- **Código:** `    let clock = 20_000;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 686

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 687

- **Código:** `    const identical = 'data:image/png;base64,SU1BR0VNX09SSUdJTkFM';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 688

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 689

- **Código:** `      inputDataUrl: identical,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 690

- **Código:** `      resultDataUrl: identical,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 691

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 692

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 693

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 694

- **Código:** `    const result = await createGeminiJobRunner(options).run({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 695

- **Código:** `      jobId: 'job-quarantine-identical',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 696

- **Código:** `      batchId: 'batch-quarantine',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 697

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 698

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 699

- **Código:** `      index: 0,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 700

- **Código:** `      prompt: 'Traduza a imagem para português brasileiro.',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 701

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 702

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 703

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 704

- **Código:** `    expect(result.status).toBe('error');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 705

- **Código:** `    expect(result.error.code).toBe('GEMINI_RESULT_MATCHES_INPUT');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 706

- **Código:** `    expect(runtimeMessages).not.toContainEqual(expect.objectContaining({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 707

- **Código:** `      action: 'GEMINI_IMAGE_EXTRACTED',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 708

- **Código:** `    }));`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 709

- **Código:** `    expect(runtimeMessages).toContainEqual(expect.objectContaining({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 710

- **Código:** `      action: 'GEMINI_ERROR',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 711

- **Código:** `      error: expect.stringContaining('idêntico'),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 712

- **Código:** `    }));`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 713

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 714

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-10: resultado byte a byte idêntico é bloqueado antes da entrega
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 715

- **Código:** `  test('RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 716

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 717

- **Código:** `    let clock = 30_000;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 718

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 719

- **Código:** `    const input = 'data:image/png;base64,SU1BR0VNX09SSUdJTkFM';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 720

- **Código:** `    const translated = 'data:image/png;base64,SU1BR0VNX1RSQURVWklEQQ==';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 721

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 722

- **Código:** `      inputDataUrl: input,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 723

- **Código:** `      resultDataUrl: translated,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 724

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 725

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 726

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 727

- **Código:** `    await expect(createGeminiJobRunner(options).run({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 728

- **Código:** `      jobId: 'job-quarantine-different',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 729

- **Código:** `      batchId: 'batch-quarantine',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 730

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 731

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 732

- **Código:** `      index: 1,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 733

- **Código:** `      prompt: 'Traduza a imagem para português brasileiro.',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 734

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 735

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 736

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 737

- **Código:** `    expect(runtimeMessages).toContainEqual(expect.objectContaining({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 738

- **Código:** `      action: 'GEMINI_IMAGE_EXTRACTED',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 739

- **Código:** `      src: translated,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 740

- **Código:** `    }));`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 741

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 742

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 743

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-11: resultado com bytes diferentes atravessa a quarentena e é entregue
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 744

- **Código:** `  test('RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 745

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 746

- **Código:** `    let clock = 40_000;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 747

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 748

- **Código:** `    const input = 'data:image/png;base64,SU5QVVQ=';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 749

- **Código:** `    const translated = 'data:image/png;base64,VFJBTlNMQVRFRA==';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 750

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 751

- **Código:** `      inputDataUrl: input,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 752

- **Código:** `      resultDataUrl: translated,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 753

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 754

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 755

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 756

- **Código:** `    await expect(createGeminiJobRunner(options).run({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 757

- **Código:** `      jobId: 'job-order',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 758

- **Código:** `      batchId: 'batch-order',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 759

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 760

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 761

- **Código:** `      index: 3,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 762

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 763

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 764

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 765

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 766

- **Código:** `    const stageIndex = runtimeMessages.findIndex(message =>`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 767

- **Código:** `      message.action === 'GEMINI_IMAGE_EXTRACTED'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 768

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 769

- **Código:** `    const commitIndex = runtimeMessages.findIndex(message =>`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 770

- **Código:** `      message.action === 'GEMINI_RESULT_COMMIT'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 771

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 772

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 773

- **Código:** `    expect(stageIndex).toBeGreaterThanOrEqual(0);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 774

- **Código:** `    expect(commitIndex).toBeGreaterThan(stageIndex);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 775

- **Código:** `    expect(options.deletionController.deleteOrScheduleRecovery).not.toHaveBeenCalled();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 776

- **Código:** `    expect(options.resultExtractor.extractOrAuxiliaryFallback).toHaveBeenCalledWith(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 777

- **Código:** `      expect.objectContaining({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 778

- **Código:** `        logContext: {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 779

- **Código:** `          jobIdPrefix: 'job-orde',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 780

- **Código:** `          batchIdPrefix: 'batch-or',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 781

- **Código:** `          index: 3,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 782

- **Código:** `        },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 783

- **Código:** `      })`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 784

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 785

- **Código:** `    expect(options.sendLog).toHaveBeenCalledWith(`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 786

- **Código:** `      'success',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 787

- **Código:** `      'GEMINI_RESULT_STAGED',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 788

- **Código:** `      expect.stringContaining('persistido'),`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 789

- **Código:** `      expect.objectContaining({ jobIdPrefix: expect.any(String) })`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 790

- **Código:** `    );`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 791

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 792

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-12: resultado direto é persistido antes do commit e não usa deleção-before-delivery
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 793

- **Código:** `  test('RUN-13: falha de staging nunca envia commit e preserva diagnóstico', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 794

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 795

- **Código:** `    let clock = 50_000;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 796

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 797

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 798

- **Código:** `      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 799

- **Código:** `      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 800

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 801

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 802

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 803

- **Código:** `    options.runtime.sendMessage.mockImplementation((message, callback) => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 804

- **Código:** `      runtimeMessages.push(message);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 805

- **Código:** `      if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: 'data:image/png;base64,SU5QVVQ=' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 806

- **Código:** `      else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.({ ok: true, refreshed: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 807

- **Código:** `      else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: false, reason: 'persist_failed' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 808

- **Código:** `      else callback?.({ ok: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 809

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 810

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 811

- **Código:** `    const result = await createGeminiJobRunner(options).run({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 812

- **Código:** `      jobId: 'job-stage-fail',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 813

- **Código:** `      batchId: 'batch-stage-fail',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 814

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 815

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 816

- **Código:** `      index: 4,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 817

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 818

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 819

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 820

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 821

- **Código:** `    expect(result.status).toBe('error');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 822

- **Código:** `    expect(result.error.code).toBe('RESULT_STAGE_FAILED');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 823

- **Código:** `    expect(runtimeMessages).not.toContainEqual(expect.objectContaining({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 824

- **Código:** `      action: 'GEMINI_RESULT_COMMIT',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 825

- **Código:** `    }));`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 826

- **Código:** `    expect(options.deletionController.deleteOrScheduleRecovery).not.toHaveBeenCalled();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 827

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 828

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-13: falha de staging nunca envia commit e preserva diagnóstico
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 829

- **Código:** `  test('RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem', async () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 830

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 831

- **Código:** `    let clock = 60_000;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 832

- **Código:** `    jest.spyOn(Date, 'now').mockImplementation(() => clock);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 833

- **Código:** `    const { options, runtimeMessages } = successfulPipelineDependencies({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 834

- **Código:** `      inputDataUrl: 'data:image/png;base64,SU5QVVQ=',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 835

- **Código:** `      resultDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 836

- **Código:** `      advanceClock: ms => { clock += ms; },`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 837

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 838

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 839

- **Código:** `    let commitAttempts = 0;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 840

- **Código:** `    options.runtime.sendMessage.mockImplementation((message, callback) => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 841

- **Código:** `      runtimeMessages.push(message);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 842

- **Código:** `      if (message.action === 'REQUEST_IMAGE_DATA') callback?.({ srcData: 'data:image/png;base64,SU5QVVQ=' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 843

- **Código:** `      else if (message.action === 'REFRESH_JOB_WATCHDOG') callback?.({ ok: true, refreshed: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 844

- **Código:** `      else if (message.action === 'GEMINI_IMAGE_EXTRACTED') callback?.({ ok: true, staged: true, persisted: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 845

- **Código:** `      else if (message.action === 'GEMINI_RESULT_COMMIT') {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 846

- **Código:** `        commitAttempts += 1;`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 847

- **Código:** `        callback?.(commitAttempts < 3`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 848

- **Código:** `          ? { ok: false, reason: 'worker_wakeup' }`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 849

- **Código:** `          : { ok: true, committed: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 850

- **Código:** `      } else callback?.({ ok: true });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 851

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 852

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 853

- **Código:** `    await expect(createGeminiJobRunner(options).run({`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 854

- **Código:** `      jobId: 'job-commit-retry',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 855

- **Código:** `      batchId: 'batch-commit-retry',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 856

- **Código:** `      geminiTabId: 321,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 857

- **Código:** `      mangaTabId: 77,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 858

- **Código:** `      index: 5,`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 859

- **Código:** `      prompt: 'Traduza.',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 860

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 861

- **Código:** `    })).resolves.toEqual({ status: 'delivered_extracted' });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 862

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 863

- **Código:** `    expect(commitAttempts).toBe(3);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 864

- **Código:** `    expect(runtimeMessages.filter(message =>`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 865

- **Código:** `      message.action === 'GEMINI_IMAGE_EXTRACTED'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 866

- **Código:** `    )).toHaveLength(1);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 867

- **Código:** `    expect(runtimeMessages.filter(message =>`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 868

- **Código:** `      message.action === 'GEMINI_RESULT_COMMIT'`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 869

- **Código:** `    )).toHaveLength(3);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 870

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 871

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-14: commit pós-persistência tenta novamente sem reenviar a imagem
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 872

- **Código:** `  test('RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 873

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 874

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 875

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 876

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 877

- **Código:** `    expect(runner.tryClickModelImageCards()).toBe(false);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 878

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 879

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-01: tryClickModelImageCards retorna false quando não há candidato de resposta
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 880

- **Código:** `  test('RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato', () => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 881

- **Código:** `    const { createGeminiJobRunner } = loadModule();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 882

- **Código:** `    const { options } = baseDependencies();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 883

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 884

- **Código:** `    const response = document.createElement('model-response');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 885

- **Código:** `    const brokenButton = document.createElement('button');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 886

- **Código:** `    brokenButton.setAttribute('aria-label', 'image result');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 887

- **Código:** `    brokenButton.click = jest.fn(() => {`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 888

- **Código:** `      throw new Error('stale element');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 889

- **Código:** `    });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 890

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 891

- **Código:** `    const fallbackCard = document.createElement('div');`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 892

- **Código:** `    fallbackCard.className = 'image-card';`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 893

- **Código:** `    fallbackCard.click = jest.fn();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 894

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 895

- **Código:** `    response.appendChild(brokenButton);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 896

- **Código:** `    response.appendChild(fallbackCard);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 897

- **Código:** `    document.body.appendChild(response);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 898

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 899

- **Código:** `    const runner = createGeminiJobRunner(options);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 900

- **Código:** `    expect(runner.tryClickModelImageCards()).toBe(true);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 901

- **Código:** `    expect(brokenButton.click).toHaveBeenCalled();`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 902

- **Código:** `    expect(fallbackCard.click).toHaveBeenCalledTimes(1);`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 903

- **Código:** `  });`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 904

- **Código:** *(linha vazia)*
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Linha 905

- **Código:** `});`
- **Função:** Prepara o cenário.
- **Contexto:** RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — cenário da suíte.

### Posição 906 — posição final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — fonte termina em newline.

## 15. Conclusão documental

A fonte atual contém 905 linhas textuais e 906 posições documentadas, incluindo a posição final. RUN-08B/08C e RUN-15 ampliam a validação dos ramos de erro do watchdog e de fallback auxiliar. A revisão de CI citada anteriormente continua histórica e não serve como prova deste blob; a suíte focal foi executada nesta revisão. Requests 181-001/003 continuam superseded por 045-001/005; 181-002/004 foram cobertas nesta correção e aguardam auditoria independente.

> **Lifecycle pós-correção:** PRIMARY + ADVERSARIAL independentes são necessários antes da aprovação.

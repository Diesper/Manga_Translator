# Bíblia técnica — tests/unit/content-gemini/result-extractor.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** 611df28380a88aa8c0b468e7300ee3a17aca0f70  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest da cadeia modular de extração do resultado Gemini  
> **Linhas textuais:** 490  
> **Posições documentais:** 491, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

result-extractor.test.js valida a política de elevação de rotas para obter a imagem final sem abrir aba auxiliar prematuramente. A cadeia distingue data URL, blob local, canvas, bridge MAIN-world, Service Worker com sessão Gemini e Service Worker legacy.

O fallback auxiliar só é chamado depois de todas as tentativas diretas falharem. A suíte congela não apenas o resultado, mas também a **ordem** das rotas por meio do array events.

## 2. Rotas diretas

EXT-01 prova que data:image retorna imediatamente sem canvas/MAIN/SW. EXT-02 fixa background_delete→canvas primeiro. EXT-03 prova canvas falho→MAIN. EXT-04 prova canvas+MAIN falhos→SW com geminiSession. EXT-05 preserva URL comum em temp_chat pelo SW legacy direto. EXT-06 prova blob→fetch local→FileReader sem SW.

## 3. Retry e fallback auxiliar

EXT-07 usa duas tentativas completas e exige ordem canvas→page→sw-session, sleep, novamente canvas→page→sw-session, e só então auxiliary. Também verifica logs RETRY_ALL, DIAGNOSTIC e AUXILIARY_FALLBACK em ordem coerente.

EXT-08 prova que sucesso direto nunca chama auxiliary. EXT-09 prova que, sem callback auxiliar, o último erro continua sendo propagado.

## 4. Assets gerados autenticados

EXT-10 roda em temp_chat, minimized_window e background_delete: asset /gg-dl/ sempre tenta canvas e depois SW com geminiSession, independentemente do modo. EXT-11 prova que /rd-gg-dl/ só usa MAIN depois de a sessão autenticada falhar. EXT-12 separa URL comum em temp_chat, que continua sem credencial de sessão.

## 5. Observabilidade correlacionada

EXT-13 injeta jobIdPrefix, batchIdPrefix e index e exige esses campos em logs GEMINI_EXTRACT_STAGE, GEMINI_EXTRACT_RETRY_ALL, GEMINI_EXTRACT_DIAGNOSTIC e GEMINI_AUXILIARY_FALLBACK.

## 6. Cobertura externa complementar

safe-background-delete.test.js já prova vários guards da mesma API real: imagem não pronta, MAIN com requestId correto, erro MAIN, resposta de outro requestId ignorada, timeout MAIN, fallback para SW autenticado e retries/logs de failureKind. Esses pontos não geram requests duplicados aqui.

## 7. Branches ainda sem prova focal

O branch blob não possui testes de fetch rejeitado, FileReader ausente, construtor/readAsDataURL lançando ou reader.onerror. O helper de SW não possui prova focal para runtime ausente, runtime.lastError ou sendMessage que lança. Por fim, quando o callback auxiliary em si rejeita/lança, extractOrAuxiliaryFallback simplesmente propaga essa falha; os casos atuais só cobrem auxiliary bem-sucedido ou callback ausente.

## 8. Evidência CI exata

O run 36521561968 no commit e720890cf34dc9437ee91f3b8172953497d69870 contém exatamente o blob 611df28380a88aa8c0b468e7300ee3a17aca0f70. Há 15 execuções efetivas: 12 títulos, com EXT-10 parametrizado nos três modos. Todas passam em Node 20.x (109255348388) e Node 22.x (109255348406); global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 9. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| data URL sem IO | EXT-01 | ✅ PROVADO DIRETAMENTE |
| background_delete usa canvas primeiro | EXT-02 | ✅ PROVADO DIRETAMENTE |
| canvas→MAIN | EXT-03 | ✅ PROVADO DIRETAMENTE |
| canvas→MAIN→SW sessão | EXT-04 | ✅ PROVADO DIRETAMENTE |
| modo comum usa SW legacy | EXT-05/12 | ✅ PROVADO DIRETAMENTE |
| blob local + FileReader sucesso | EXT-06 | ✅ PROVADO DIRETAMENTE |
| retry completo precede auxiliary | EXT-07 | ✅ PROVADO DIRETAMENTE |
| sucesso direto não chama auxiliary | EXT-08 | ✅ PROVADO DIRETAMENTE |
| sem auxiliary, erro terminal propaga | EXT-09 | ✅ PROVADO DIRETAMENTE |
| gg-dl autenticado nos três modos | EXT-10 x3 | ✅ PROVADO DIRETAMENTE |
| rd-gg-dl sessão antes de MAIN | EXT-11 | ✅ PROVADO DIRETAMENTE |
| logs carregam job/batch/index | EXT-13 | ✅ PROVADO DIRETAMENTE |
| requestId errado/timeout MAIN/imagem não pronta | safe-background-delete externo | ✅ PROVADO DIRETAMENTE — externo |
| blob/FileReader falha | branches reais | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| runtime ausente/lastError/throw | branches reais de SW | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| auxiliary callback rejeita | branch real | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Solicitações ao auditor

### 186-001 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: o caminho blob possui vários branches de falha: fetchImpl rejeita, FileReaderImpl ausente, construtor lança, readAsDataURL lança e reader.onerror. EXT-06 cobre apenas sucesso.

Evidência ausente: matriz focal contra blobToDataUrl/extractResultImage real exigindo propagação do erro correto e ausência de SW fallback não previsto para blob.

Risco: blob gerado pelo Gemini pode falhar apenas no navegador/ambiente específico com CI verde.

### 186-002 — TEST_REQUIRED — OPEN — HIGH

Encontrado: sendRuntimeMessageForDataUrl trata runtime/sendMessage ausentes, runtime.lastError e throw síncrono; as fixtures atuais sempre fornecem runtime saudável e respostas normais.

Evidência ausente: runtime=null, sendMessage ausente, lastError com mensagem e sendMessage lançando. Validar tanto fetchImageThroughGeminiPage→SW fallback quanto fetchImageThroughBackground quando aplicável.

Risco: perda/restart do Service Worker pode produzir erro diferente, Promise pendurada ou queda do pipeline.

### 186-003 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: extractOrAuxiliaryFallback chama onAuxiliaryFallback após logs de diagnóstico; se o callback rejeitar/lançar, essa falha é propagada sem envelope específico. Nenhum caso cobre isso.

Evidência ausente: callback auxiliary que lança erro conhecido; exigir uma chamada, logs diagnósticos anteriores preservados e rejeição com erro original. No wiring do runner, 181-004 complementa o caso de registro GEMINI_RESULT_URL falho.

Risco: falha do último recurso pode perder diagnóstico ou ser engolida durante refactor.

## 11. Fonte integral auditada

```javascript
'use strict';

const path = require('path');

const RESULT_EXTRACTOR_PATH = path.resolve(
  __dirname,
  '../../../extension/content/gemini/result-extractor.js'
);

function loadModule() {
  let api;
  jest.isolateModules(() => {
    api = require(RESULT_EXTRACTOR_PATH);
  });
  return api;
}

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail || null;
  }
}

function createImage() {
  return {
    complete: true,
    naturalWidth: 1200,
    naturalHeight: 1800,
  };
}

function createCanvasDocument(events, { fail = false } = {}) {
  return {
    createElement(tag) {
      expect(tag).toBe('canvas');
      return {
        width: 0,
        height: 0,
        getContext(type) {
          expect(type).toBe('2d');
          return {
            drawImage() {
              events.push('canvas');
              if (fail) {
                const error = new Error('SecurityError: canvas tainted by cross-origin image');
                error.name = 'SecurityError';
                throw error;
              }
            },
          };
        },
        toDataURL(type) {
          expect(type).toBe('image/png');
          return 'data:image/png;base64,CANVAS';
        },
      };
    },
  };
}

function createPageWindow(events, outcome) {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatchEvent(event) {
      if (event.type !== 'MANGA_TRANSLATOR_FETCH_IMAGE') return true;

      events.push('page');
      const listener = listeners.get('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT');
      if (!listener) return true;

      const detail = typeof outcome === 'function'
        ? outcome(event.detail)
        : outcome;

      listener({
        detail: {
          requestId: event.detail.requestId,
          ...(detail || {}),
        },
      });
      return true;
    },
  };
}

function createRuntime(events, responder) {
  return {
    lastError: null,
    sendMessage: jest.fn((message, callback) => {
      events.push(message.geminiSession ? 'sw-session' : 'sw-background');
      const response = responder ? responder(message) : { dataUrl: 'data:image/png;base64,SW' };
      callback(response);
    }),
  };
}

describe('gemini/result-extractor.js', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('EXT-01: data URL retorna direto sem tocar canvas, MAIN ou SW', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const runtime = createRuntime(events);

    const extractor = createResultExtractor({
      runtime,
      pageDocument: createCanvasDocument(events),
      pageWindow: createPageWindow(events, { dataUrl: 'data:image/png;base64,PAGE' }),
      CustomEventImpl: TestCustomEvent,
      fetchImpl: jest.fn(),
    });

    const dataUrl = 'data:image/png;base64,DIRECT';
    await expect(
      extractor.extractResultImage(null, dataUrl, 'background_delete')
    ).resolves.toBe(dataUrl);

    expect(events).toEqual([]);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('EXT-02: background_delete usa canvas como primeira rota', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const runtime = createRuntime(events);

    const extractor = createResultExtractor({
      runtime,
      pageDocument: createCanvasDocument(events),
      pageWindow: createPageWindow(events, { dataUrl: 'data:image/png;base64,PAGE' }),
      CustomEventImpl: TestCustomEvent,
    });

    await expect(
      extractor.extractResultImage(
        createImage(),
        'https://example.test/result.png',
        'background_delete'
      )
    ).resolves.toBe('data:image/png;base64,CANVAS');

    expect(events).toEqual(['canvas']);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('EXT-03: falha de canvas escala para MAIN-world fetch antes do SW', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const runtime = createRuntime(events);

    const extractor = createResultExtractor({
      runtime,
      pageDocument: createCanvasDocument(events, { fail: true }),
      pageWindow: createPageWindow(events, {
        dataUrl: 'data:image/png;base64,PAGE',
      }),
      CustomEventImpl: TestCustomEvent,
    });

    await expect(
      extractor.extractResultImage(
        createImage(),
        'https://example.test/result.png',
        'background_delete'
      )
    ).resolves.toBe('data:image/png;base64,PAGE');

    expect(events).toEqual(['canvas', 'page']);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('EXT-04: canvas + MAIN falhos escalam para SW com geminiSession', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const runtime = createRuntime(events, message => {
      expect(message).toEqual(expect.objectContaining({
        action: 'FETCH_IMAGE_AS_BASE64',
        geminiSession: true,
      }));
      return { dataUrl: 'data:image/png;base64,SESSION' };
    });

    const extractor = createResultExtractor({
      runtime,
      pageDocument: createCanvasDocument(events, { fail: true }),
      pageWindow: createPageWindow(events, { error: 'MAIN fetch falhou' }),
      CustomEventImpl: TestCustomEvent,
    });

    await expect(
      extractor.extractResultImage(
        createImage(),
        'https://googleusercontent.com/result.png',
        'background_delete'
      )
    ).resolves.toBe('data:image/png;base64,SESSION');

    expect(events).toEqual(['canvas', 'page', 'sw-session']);
  });

  test('EXT-05: modos não background_delete preservam SW fetch legado direto', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const runtime = createRuntime(events, message => {
      expect(message.geminiSession).toBeUndefined();
      return { dataUrl: 'data:image/png;base64,BACKGROUND' };
    });

    const extractor = createResultExtractor({
      runtime,
      pageDocument: {
        createElement() {
          throw new Error('canvas não deveria ser usado');
        },
      },
      pageWindow: createPageWindow(events, { error: 'não deveria ser usado' }),
      CustomEventImpl: TestCustomEvent,
    });

    await expect(
      extractor.extractResultImage(
        createImage(),
        'https://example.test/result.png',
        'temp_chat'
      )
    ).resolves.toBe('data:image/png;base64,BACKGROUND');

    expect(events).toEqual(['sw-background']);
  });

  test('EXT-06: blob usa fetch local + FileReader sem chamar SW', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const runtime = createRuntime(events);
    const fetchImpl = jest.fn(async () => ({
      blob: async () => ({ kind: 'blob-fixture' }),
    }));

    class FakeFileReader {
      readAsDataURL(blob) {
        expect(blob).toEqual({ kind: 'blob-fixture' });
        this.result = 'data:image/png;base64,BLOB';
        this.onloadend();
      }
    }

    const extractor = createResultExtractor({
      runtime,
      fetchImpl,
      FileReaderImpl: FakeFileReader,
    });

    await expect(
      extractor.extractResultImage(null, 'blob:https://gemini.test/abc', 'background_delete')
    ).resolves.toBe('data:image/png;base64,BLOB');

    expect(fetchImpl).toHaveBeenCalledWith('blob:https://gemini.test/abc');
    expect(events).toEqual([]);
  });

  test('EXT-07: retry repete a cadeia completa e só depois usa auxiliary fallback', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const logs = [];
    const runtime = createRuntime(events, () => ({ error: 'SW indisponível' }));

    const extractor = createResultExtractor({
      runtime,
      pageDocument: createCanvasDocument(events, { fail: true }),
      pageWindow: createPageWindow(events, { error: 'MAIN indisponível' }),
      CustomEventImpl: TestCustomEvent,
      sleep: async () => { events.push('sleep'); },
      sendLog: (level, action, detail, extra) => {
        logs.push({ level, action, detail, extra });
      },
      getUrlLogMetadata: () => ({
        urlKind: 'https',
        host: 'example.test',
        hasQuery: false,
      }),
    });

    const auxiliary = jest.fn(async ({ url, error }) => {
      events.push('auxiliary');
      expect(url).toBe('https://example.test/result.png');
      expect(error).toBeInstanceOf(Error);
      return { delivered: true };
    });

    const result = await extractor.extractOrAuxiliaryFallback({
      resultImageElement: createImage(),
      resultUrl: 'https://example.test/result.png',
      executionMode: 'background_delete',
      maxAttempts: 2,
      retryDelayMs: 0,
      onAuxiliaryFallback: auxiliary,
    });

    expect(result.kind).toBe('auxiliary');
    expect(result.dataUrl).toBeNull();
    expect(result.fallbackResult).toEqual({ delivered: true });
    expect(events).toEqual([
      'canvas', 'page', 'sw-session',
      'sleep',
      'canvas', 'page', 'sw-session',
      'auxiliary',
    ]);

    expect(auxiliary).toHaveBeenCalledTimes(1);
    expect(logs.map(entry => entry.action)).toEqual(expect.arrayContaining([
      'GEMINI_EXTRACT_RETRY_ALL',
      'GEMINI_EXTRACT_DIAGNOSTIC',
      'GEMINI_AUXILIARY_FALLBACK',
    ]));
    expect(
      logs.findIndex(entry => entry.action === 'GEMINI_AUXILIARY_FALLBACK')
    ).toBeGreaterThan(
      logs.findIndex(entry => entry.action === 'GEMINI_EXTRACT_RETRY_ALL')
    );
  });

  test('EXT-08: sucesso direto não executa auxiliary fallback', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const auxiliary = jest.fn();

    const extractor = createResultExtractor({
      pageDocument: createCanvasDocument(events),
      runtime: createRuntime(events),
    });

    const result = await extractor.extractOrAuxiliaryFallback({
      resultImageElement: createImage(),
      resultUrl: 'https://example.test/result.png',
      executionMode: 'background_delete',
      onAuxiliaryFallback: auxiliary,
    });

    expect(result).toEqual({
      kind: 'extracted',
      dataUrl: 'data:image/png;base64,CANVAS',
      error: null,
    });
    expect(auxiliary).not.toHaveBeenCalled();
  });

  test('EXT-09: sem callback auxiliar, erro terminal continua sendo propagado', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];

    const extractor = createResultExtractor({
      runtime: createRuntime(events, () => ({ error: 'SW falhou' })),
      sleep: async () => {},
    });

    await expect(
      extractor.extractOrAuxiliaryFallback({
        resultUrl: 'https://example.test/result.png',
        executionMode: 'temp_chat',
        maxAttempts: 1,
      })
    ).rejects.toThrow('SW falhou');
  });

  test.each(['temp_chat', 'minimized_window', 'background_delete'])(
    'EXT-10: asset gg-dl usa sessão autenticada no modo %s',
    async executionMode => {
      const { createResultExtractor } = loadModule();
      const events = [];
      const runtime = createRuntime(events, message => {
        expect(message).toEqual(expect.objectContaining({
          action: 'FETCH_IMAGE_AS_BASE64',
          geminiSession: true,
        }));
        return { dataUrl: 'data:image/png;base64,AUTHENTICATED' };
      });
      const extractor = createResultExtractor({
        runtime,
        pageDocument: createCanvasDocument(events, { fail: true }),
        pageWindow: createPageWindow(events, { error: 'MAIN não deve ser a primeira rota' }),
        CustomEventImpl: TestCustomEvent,
      });

      await expect(extractor.extractResultImage(
        createImage(),
        'https://lh3.googleusercontent.com/gg-dl/GENERATED_IMAGE',
        executionMode
      )).resolves.toBe('data:image/png;base64,AUTHENTICATED');

      expect(events).toEqual(['canvas', 'sw-session']);
    }
  );

  test('EXT-11: asset rd-gg-dl usa MAIN apenas após falha da sessão autenticada', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const extractor = createResultExtractor({
      runtime: createRuntime(events, () => ({ error: 'sessão indisponível' })),
      pageDocument: createCanvasDocument(events, { fail: true }),
      pageWindow: createPageWindow(events, { dataUrl: 'data:image/png;base64,PAGE_LAST' }),
      CustomEventImpl: TestCustomEvent,
    });

    await expect(extractor.extractResultImage(
      createImage(),
      'https://lh3.googleusercontent.com/rd-gg-dl/GENERATED_IMAGE',
      'temp_chat'
    )).resolves.toBe('data:image/png;base64,PAGE_LAST');

    expect(events).toEqual(['canvas', 'sw-session', 'page']);
  });

  test('EXT-12: URL comum em temp_chat preserva fetch legado sem credencial de sessão', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const runtime = createRuntime(events, message => {
      expect(message).not.toHaveProperty('geminiSession');
      return { dataUrl: 'data:image/png;base64,LEGACY' };
    });
    const extractor = createResultExtractor({
      runtime,
      pageDocument: {
        createElement() {
          throw new Error('canvas não deve executar para URL comum neste modo');
        },
      },
    });

    await expect(extractor.extractResultImage(
      createImage(),
      'https://cdn.example/result.png',
      'temp_chat'
    )).resolves.toBe('data:image/png;base64,LEGACY');

    expect(events).toEqual(['sw-background']);
  });

  test('EXT-13: logs de extração carregam jobId/batchId/index em estágios, retry e diagnóstico', async () => {
    const { createResultExtractor } = loadModule();
    const events = [];
    const logs = [];
    const extractor = createResultExtractor({
      runtime: createRuntime(events, () => ({ error: 'SW indisponível' })),
      pageDocument: createCanvasDocument(events, { fail: true }),
      pageWindow: createPageWindow(events, { error: 'MAIN indisponível' }),
      CustomEventImpl: TestCustomEvent,
      sleep: async () => {},
      sendLog: (level, action, detail, extra) => logs.push({ level, action, detail, extra }),
      getUrlLogMetadata: () => ({ host: 'example.test' }),
    });

    await expect(extractor.extractOrAuxiliaryFallback({
      resultImageElement: createImage(),
      resultUrl: 'https://example.test/result.png',
      executionMode: 'background_delete',
      maxAttempts: 2,
      retryDelayMs: 0,
      logContext: {
        jobIdPrefix: 'job12345',
        batchIdPrefix: 'batch678',
        index: 7,
      },
      onAuxiliaryFallback: async () => ({ delivered: true }),
    })).resolves.toEqual(expect.objectContaining({ kind: 'auxiliary' }));

    const correlated = logs.filter(entry =>
      ['GEMINI_EXTRACT_STAGE', 'GEMINI_EXTRACT_RETRY_ALL', 'GEMINI_EXTRACT_DIAGNOSTIC', 'GEMINI_AUXILIARY_FALLBACK']
        .includes(entry.action)
    );
    expect(correlated.length).toBeGreaterThan(0);
    correlated.forEach(entry => {
      expect(entry.extra).toEqual(expect.objectContaining({
        jobIdPrefix: 'job12345',
        batchIdPrefix: 'batch678',
        index: 7,
      }));
    });
  });

});
```

## 12. Auditoria linha a linha

### Linha 001

- **Código:** `'use strict';`
- **Função:** Ativa strict mode.
- **Contexto:** imports/path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports/path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const path = require('path');`
- **Função:** Importa path para resolver o extractor real.
- **Contexto:** imports/path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports/path do módulo real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `const RESULT_EXTRACTOR_PATH = path.resolve(`
- **Função:** Resolve o caminho absoluto de extension/content/gemini/result-extractor.js.
- **Contexto:** imports/path do módulo real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte ao extractor real.

### Linha 006

- **Código:** `  __dirname,`
- **Função:** Resolve o caminho absoluto de extension/content/gemini/result-extractor.js.
- **Contexto:** imports/path do módulo real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte ao extractor real.

### Linha 007

- **Código:** `  '../../../extension/content/gemini/result-extractor.js'`
- **Função:** Resolve o caminho absoluto de extension/content/gemini/result-extractor.js.
- **Contexto:** imports/path do módulo real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte ao extractor real.

### Linha 008

- **Código:** `);`
- **Função:** Resolve o caminho absoluto de extension/content/gemini/result-extractor.js.
- **Contexto:** imports/path do módulo real.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte ao extractor real.

### Linha 009

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `function loadModule() {`
- **Função:** Carrega result-extractor.js real em isolamento Jest e devolve sua API.
- **Contexto:** loader isolado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `  let api;`
- **Função:** Compõe o cenário loader isolado, preparando ou verificando a cadeia real de extração.
- **Contexto:** loader isolado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Força novo registry/módulo isolado para o cenário.
- **Contexto:** loader isolado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `    api = require(RESULT_EXTRACTOR_PATH);`
- **Função:** Executa a implementação real do extractor.
- **Contexto:** loader isolado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte ao extractor real.

### Linha 014

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader isolado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** `  return api;`
- **Função:** Compõe o cenário loader isolado, preparando ou verificando a cadeia real de extração.
- **Contexto:** loader isolado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader isolado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** loader isolado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `class TestCustomEvent {`
- **Função:** Emula CustomEvent suficiente para o bridge MAIN-world.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `  constructor(type, init = {}) {`
- **Função:** Compõe o cenário CustomEvent de teste, preparando ou verificando a cadeia real de extração.
- **Contexto:** CustomEvent de teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `    this.type = type;`
- **Função:** Preserva o tipo do evento despachado.
- **Contexto:** CustomEvent de teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `    this.detail = init.detail || null;`
- **Função:** Preserva detail com requestId/url/result.
- **Contexto:** CustomEvent de teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `  }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CustomEvent de teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** CustomEvent de teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** CustomEvent de teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `function createImage() {`
- **Função:** Cria imagem renderizada pronta para o caminho canvas.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `  return {`
- **Função:** Compõe o cenário fixture de imagem pronta, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture de imagem pronta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `    complete: true,`
- **Função:** Marca a imagem como carregada.
- **Contexto:** fixture de imagem pronta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `    naturalWidth: 1200,`
- **Função:** Fixa dimensões naturais usadas pelo canvas.
- **Contexto:** fixture de imagem pronta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    naturalHeight: 1800,`
- **Função:** Fixa dimensões naturais usadas pelo canvas.
- **Contexto:** fixture de imagem pronta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture de imagem pronta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture de imagem pronta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture de imagem pronta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `function createCanvasDocument(events, { fail = false } = {}) {`
- **Função:** Cria document/canvas observável para sucesso ou SecurityError.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `  return {`
- **Função:** Compõe o cenário fixture canvas, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `    createElement(tag) {`
- **Função:** Compõe o cenário fixture canvas, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `      expect(tag).toBe('canvas');`
- **Função:** Prova criação explícita de canvas.
- **Contexto:** fixture canvas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 037

- **Código:** `      return {`
- **Função:** Compõe o cenário fixture canvas, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `        width: 0,`
- **Função:** Compõe o cenário fixture canvas, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `        height: 0,`
- **Função:** Compõe o cenário fixture canvas, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `        getContext(type) {`
- **Função:** Emula aquisição de contexto 2D.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `          expect(type).toBe('2d');`
- **Função:** Assertion focal do contrato.
- **Contexto:** fixture canvas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 042

- **Código:** `          return {`
- **Função:** Compõe o cenário fixture canvas, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `            drawImage() {`
- **Função:** Marca execução do caminho canvas e opcionalmente lança erro CORS.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `              events.push('canvas');`
- **Função:** Registra ordem de execução do canvas.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `              if (fail) {`
- **Função:** Compõe o cenário fixture canvas, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `                const error = new Error('SecurityError: canvas tainted by cross-origin image');`
- **Função:** Simula canvas contaminado por cross-origin.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `                error.name = 'SecurityError';`
- **Função:** Simula canvas contaminado por cross-origin.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `                throw error;`
- **Função:** Compõe o cenário fixture canvas, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `              }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `          };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `        toDataURL(type) {`
- **Função:** Retorna PNG base64 determinístico após drawImage.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `          expect(type).toBe('image/png');`
- **Função:** Assertion focal do contrato.
- **Contexto:** fixture canvas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 055

- **Código:** `          return 'data:image/png;base64,CANVAS';`
- **Função:** Fixa resposta de sucesso do canvas.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `      };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `function createPageWindow(events, outcome) {`
- **Função:** Cria bridge MAIN-world com listeners correlacionados por requestId.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `  const listeners = new Map();`
- **Função:** Mantém listeners registrados pela implementação.
- **Contexto:** fixture canvas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `  return {`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `    addEventListener(type, listener) {`
- **Função:** Registra listener de resultado MAIN.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `      listeners.set(type, listener);`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `    removeEventListener(type, listener) {`
- **Função:** Remove listener quando extractor finaliza.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `      if (listeners.get(type) === listener) listeners.delete(type);`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `    dispatchEvent(event) {`
- **Função:** Intercepta request MANGA_TRANSLATOR_FETCH_IMAGE.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `      if (event.type !== 'MANGA_TRANSLATOR_FETCH_IMAGE') return true;`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `      events.push('page');`
- **Função:** Registra ordem da rota MAIN-world.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `      const listener = listeners.get('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT');`
- **Função:** Usa evento de resposta da ponte MAIN.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `      if (!listener) return true;`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `      const detail = typeof outcome === 'function'`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `        ? outcome(event.detail)`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `        : outcome;`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `      listener({`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `        detail: {`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `          requestId: event.detail.requestId,`
- **Função:** Correlaciona resposta ao requestId exato gerado pelo extractor.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `          ...(detail || {}),`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `      });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `      return true;`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `function createRuntime(events, responder) {`
- **Função:** Cria runtime.sendMessage observável para rotas SW autenticada/legacy.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `  return {`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `    lastError: null,`
- **Função:** Compõe o cenário fixture bridge MAIN-world, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture bridge MAIN-world.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `    sendMessage: jest.fn((message, callback) => {`
- **Função:** Compõe o cenário estrutura final, preparando ou verificando a cadeia real de extração.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `      events.push(message.geminiSession ? 'sw-session' : 'sw-background');`
- **Função:** Distingue chamada privilegiada com sessão Gemini da rota background comum.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `      const response = responder ? responder(message) : { dataUrl: 'data:image/png;base64,SW' };`
- **Função:** Compõe o cenário fixture runtime/SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `      callback(response);`
- **Função:** Entrega resposta do SW pelo callback Chrome.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** `    }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `describe('gemini/result-extractor.js', () => {`
- **Função:** Abre suíte focal de gemini/result-extractor.js.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `  afterEach(() => {`
- **Função:** Restaura spies/mocks após cada caso.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Compõe o cenário fixture runtime/SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture runtime/SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `  test('EXT-01: data URL retorna direto sem tocar canvas, MAIN ou SW', async () => {`
- **Função:** Declara cenário: EXT-01 — data URL direta.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-01 — data URL direta, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `    const runtime = createRuntime(events);`
- **Função:** Compõe o cenário EXT-01 — data URL direta, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `      runtime,`
- **Função:** Compõe o cenário EXT-01 — data URL direta, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `      pageDocument: createCanvasDocument(events),`
- **Função:** Compõe o cenário EXT-01 — data URL direta, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `      pageWindow: createPageWindow(events, { dataUrl: 'data:image/png;base64,PAGE' }),`
- **Função:** Fixa resposta de sucesso do bridge MAIN.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `      CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-01 — data URL direta, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `      fetchImpl: jest.fn(),`
- **Função:** Injeta/observa fetch local usado para blob.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `    const dataUrl = 'data:image/png;base64,DIRECT';`
- **Função:** Fixa Data URL que deve retornar sem IO adicional.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 125

- **Código:** `      extractor.extractResultImage(null, dataUrl, 'background_delete')`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 126

- **Código:** `    ).resolves.toBe(dataUrl);`
- **Função:** Compõe o cenário EXT-01 — data URL direta, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 127

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `    expect(events).toEqual([]);`
- **Função:** Prova bypass total de canvas/MAIN/SW.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 129

- **Código:** `    expect(runtime.sendMessage).not.toHaveBeenCalled();`
- **Função:** Prova que o SW não foi acionado.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 130

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-01 — data URL direta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** `  test('EXT-02: background_delete usa canvas como primeira rota', async () => {`
- **Função:** Declara cenário: EXT-02 — canvas em background_delete.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-02 — canvas em background_delete, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `    const runtime = createRuntime(events);`
- **Função:** Compõe o cenário EXT-02 — canvas em background_delete, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `      runtime,`
- **Função:** Compõe o cenário EXT-02 — canvas em background_delete, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `      pageDocument: createCanvasDocument(events),`
- **Função:** Compõe o cenário EXT-02 — canvas em background_delete, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `      pageWindow: createPageWindow(events, { dataUrl: 'data:image/png;base64,PAGE' }),`
- **Função:** Fixa resposta de sucesso do bridge MAIN.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `      CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-02 — canvas em background_delete, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 145

- **Código:** `      extractor.extractResultImage(`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 146

- **Código:** `        createImage(),`
- **Função:** Compõe o cenário EXT-02 — canvas em background_delete, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** `        'https://example.test/result.png',`
- **Função:** Compõe o cenário EXT-02 — canvas em background_delete, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `        'background_delete'`
- **Função:** Seleciona modo que privilegia canvas/chain in-tab.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 149

- **Código:** `      )`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 150

- **Código:** `    ).resolves.toBe('data:image/png;base64,CANVAS');`
- **Função:** Fixa resposta de sucesso do canvas.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 151

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `    expect(events).toEqual(['canvas']);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 153

- **Código:** `    expect(runtime.sendMessage).not.toHaveBeenCalled();`
- **Função:** Prova que o SW não foi acionado.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 154

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-02 — canvas em background_delete.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `  test('EXT-03: falha de canvas escala para MAIN-world fetch antes do SW', async () => {`
- **Função:** Declara cenário: EXT-03 — canvas→MAIN.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-03 — canvas→MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `    const runtime = createRuntime(events);`
- **Função:** Compõe o cenário EXT-03 — canvas→MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** `      runtime,`
- **Função:** Compõe o cenário EXT-03 — canvas→MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `      pageDocument: createCanvasDocument(events, { fail: true }),`
- **Função:** Compõe o cenário EXT-03 — canvas→MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `      pageWindow: createPageWindow(events, {`
- **Função:** Compõe o cenário EXT-03 — canvas→MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `        dataUrl: 'data:image/png;base64,PAGE',`
- **Função:** Fixa resposta de sucesso do bridge MAIN.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `      }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `      CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-03 — canvas→MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 171

- **Código:** `      extractor.extractResultImage(`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 172

- **Código:** `        createImage(),`
- **Função:** Compõe o cenário EXT-03 — canvas→MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `        'https://example.test/result.png',`
- **Função:** Compõe o cenário EXT-03 — canvas→MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** `        'background_delete'`
- **Função:** Seleciona modo que privilegia canvas/chain in-tab.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 175

- **Código:** `      )`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** `    ).resolves.toBe('data:image/png;base64,PAGE');`
- **Função:** Fixa resposta de sucesso do bridge MAIN.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 177

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** `    expect(events).toEqual(['canvas', 'page']);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 179

- **Código:** `    expect(runtime.sendMessage).not.toHaveBeenCalled();`
- **Função:** Prova que o SW não foi acionado.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 180

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-03 — canvas→MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `  test('EXT-04: canvas + MAIN falhos escalam para SW com geminiSession', async () => {`
- **Função:** Declara cenário: EXT-04 — canvas→MAIN→SW sessão.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** `    const runtime = createRuntime(events, message => {`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `      expect(message).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 187

- **Código:** `        action: 'FETCH_IMAGE_AS_BASE64',`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 188

- **Código:** `        geminiSession: true,`
- **Função:** Exige sinal explícito de sessão Gemini no request ao SW.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `      }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 190

- **Código:** `      return { dataUrl: 'data:image/png;base64,SESSION' };`
- **Função:** Fixa resposta do SW com sessão Gemini.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 191

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** `      runtime,`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `      pageDocument: createCanvasDocument(events, { fail: true }),`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 196

- **Código:** `      pageWindow: createPageWindow(events, { error: 'MAIN fetch falhou' }),`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `      CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 198

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 199

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 200

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 201

- **Código:** `      extractor.extractResultImage(`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 202

- **Código:** `        createImage(),`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 203

- **Código:** `        'https://googleusercontent.com/result.png',`
- **Função:** Compõe o cenário EXT-04 — canvas→MAIN→SW sessão, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 204

- **Código:** `        'background_delete'`
- **Função:** Seleciona modo que privilegia canvas/chain in-tab.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 205

- **Código:** `      )`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `    ).resolves.toBe('data:image/png;base64,SESSION');`
- **Função:** Fixa resposta do SW com sessão Gemini.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 207

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 208

- **Código:** `    expect(events).toEqual(['canvas', 'page', 'sw-session']);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 209

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-04 — canvas→MAIN→SW sessão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 211

- **Código:** `  test('EXT-05: modos não background_delete preservam SW fetch legado direto', async () => {`
- **Função:** Declara cenário: EXT-05 — SW legado em outros modos.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 212

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 213

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 214

- **Código:** `    const runtime = createRuntime(events, message => {`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 215

- **Código:** `      expect(message.geminiSession).toBeUndefined();`
- **Função:** Distingue chamada privilegiada com sessão Gemini da rota background comum.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 216

- **Código:** `      return { dataUrl: 'data:image/png;base64,BACKGROUND' };`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 217

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 218

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 219

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 220

- **Código:** `      runtime,`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** `      pageDocument: {`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 222

- **Código:** `        createElement() {`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 223

- **Código:** `          throw new Error('canvas não deveria ser usado');`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 224

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 225

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 226

- **Código:** `      pageWindow: createPageWindow(events, { error: 'não deveria ser usado' }),`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `      CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 228

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 229

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 230

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 231

- **Código:** `      extractor.extractResultImage(`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 232

- **Código:** `        createImage(),`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 233

- **Código:** `        'https://example.test/result.png',`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 234

- **Código:** `        'temp_chat'`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 235

- **Código:** `      )`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 236

- **Código:** `    ).resolves.toBe('data:image/png;base64,BACKGROUND');`
- **Função:** Compõe o cenário EXT-05 — SW legado em outros modos, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 237

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** `    expect(events).toEqual(['sw-background']);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 239

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-05 — SW legado em outros modos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 240

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 241

- **Código:** `  test('EXT-06: blob usa fetch local + FileReader sem chamar SW', async () => {`
- **Função:** Declara cenário: EXT-06 — blob local + FileReader.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 242

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 243

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-06 — blob local + FileReader, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 244

- **Código:** `    const runtime = createRuntime(events);`
- **Função:** Compõe o cenário EXT-06 — blob local + FileReader, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `    const fetchImpl = jest.fn(async () => ({`
- **Função:** Injeta/observa fetch local usado para blob.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 246

- **Código:** `      blob: async () => ({ kind: 'blob-fixture' }),`
- **Função:** Compõe o cenário EXT-06 — blob local + FileReader, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 248

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** `    class FakeFileReader {`
- **Função:** Emula FileReader bem-sucedido no branch blob.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 250

- **Código:** `      readAsDataURL(blob) {`
- **Função:** Converte blob fixture para Data URL.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 251

- **Código:** `        expect(blob).toEqual({ kind: 'blob-fixture' });`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 252

- **Código:** `        this.result = 'data:image/png;base64,BLOB';`
- **Função:** Compõe o cenário EXT-06 — blob local + FileReader, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** `        this.onloadend();`
- **Função:** Compõe o cenário EXT-06 — blob local + FileReader, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 254

- **Código:** `      }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 255

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 256

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 257

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 258

- **Código:** `      runtime,`
- **Função:** Compõe o cenário EXT-06 — blob local + FileReader, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 259

- **Código:** `      fetchImpl,`
- **Função:** Injeta/observa fetch local usado para blob.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 260

- **Código:** `      FileReaderImpl: FakeFileReader,`
- **Função:** Compõe o cenário EXT-06 — blob local + FileReader, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 261

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 262

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 263

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 264

- **Código:** `      extractor.extractResultImage(null, 'blob:https://gemini.test/abc', 'background_delete')`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 265

- **Código:** `    ).resolves.toBe('data:image/png;base64,BLOB');`
- **Função:** Compõe o cenário EXT-06 — blob local + FileReader, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 266

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 267

- **Código:** `    expect(fetchImpl).toHaveBeenCalledWith('blob:https://gemini.test/abc');`
- **Função:** Exercita branch blob local.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 268

- **Código:** `    expect(events).toEqual([]);`
- **Função:** Prova bypass total de canvas/MAIN/SW.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 269

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-06 — blob local + FileReader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 270

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 271

- **Código:** `  test('EXT-07: retry repete a cadeia completa e só depois usa auxiliary fallback', async () => {`
- **Função:** Declara cenário: EXT-07 — retry completo + auxiliary.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 272

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 273

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 274

- **Código:** `    const logs = [];`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 275

- **Código:** `    const runtime = createRuntime(events, () => ({ error: 'SW indisponível' }));`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 276

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 277

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 278

- **Código:** `      runtime,`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 279

- **Código:** `      pageDocument: createCanvasDocument(events, { fail: true }),`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 280

- **Código:** `      pageWindow: createPageWindow(events, { error: 'MAIN indisponível' }),`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 281

- **Código:** `      CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 282

- **Código:** `      sleep: async () => { events.push('sleep'); },`
- **Função:** Registra passagem pelo delay de retry.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 283

- **Código:** `      sendLog: (level, action, detail, extra) => {`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 284

- **Código:** `        logs.push({ level, action, detail, extra });`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 285

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 286

- **Código:** `      getUrlLogMetadata: () => ({`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 287

- **Código:** `        urlKind: 'https',`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 288

- **Código:** `        host: 'example.test',`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 289

- **Código:** `        hasQuery: false,`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 290

- **Código:** `      }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 291

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 292

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 293

- **Código:** `    const auxiliary = jest.fn(async ({ url, error }) => {`
- **Função:** Cria callback auxiliar observável.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 294

- **Código:** `      events.push('auxiliary');`
- **Função:** Registra ordem do fallback auxiliar após as rotas diretas.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 295

- **Código:** `      expect(url).toBe('https://example.test/result.png');`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 296

- **Código:** `      expect(error).toBeInstanceOf(Error);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 297

- **Código:** `      return { delivered: true };`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 298

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 299

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 300

- **Código:** `    const result = await extractor.extractOrAuxiliaryFallback({`
- **Função:** Executa retry completo e possível callback auxiliar.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 301

- **Código:** `      resultImageElement: createImage(),`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 302

- **Código:** `      resultUrl: 'https://example.test/result.png',`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 303

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Seleciona modo que privilegia canvas/chain in-tab.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 304

- **Código:** `      maxAttempts: 2,`
- **Função:** Limita o cenário a duas tentativas completas.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 305

- **Código:** `      retryDelayMs: 0,`
- **Função:** Remove delay real entre retries.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 306

- **Código:** `      onAuxiliaryFallback: auxiliary,`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 307

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 308

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 309

- **Código:** `    expect(result.kind).toBe('auxiliary');`
- **Função:** Exige classificação final de fallback auxiliar.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 310

- **Código:** `    expect(result.dataUrl).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 311

- **Código:** `    expect(result.fallbackResult).toEqual({ delivered: true });`
- **Função:** Preserva valor retornado pelo callback auxiliar.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 312

- **Código:** `    expect(events).toEqual([`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 313

- **Código:** `      'canvas', 'page', 'sw-session',`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 314

- **Código:** `      'sleep',`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 315

- **Código:** `      'canvas', 'page', 'sw-session',`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 316

- **Código:** `      'auxiliary',`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 317

- **Código:** `    ]);`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 318

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 319

- **Código:** `    expect(auxiliary).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 320

- **Código:** `    expect(logs.map(entry => entry.action)).toEqual(expect.arrayContaining([`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 321

- **Código:** `      'GEMINI_EXTRACT_RETRY_ALL',`
- **Função:** Exige telemetria de retry da cadeia completa.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 322

- **Código:** `      'GEMINI_EXTRACT_DIAGNOSTIC',`
- **Função:** Exige diagnóstico depois de esgotar rotas diretas.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 323

- **Código:** `      'GEMINI_AUXILIARY_FALLBACK',`
- **Função:** Exige log do último recurso auxiliar.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 324

- **Código:** `    ]));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 325

- **Código:** `    expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 326

- **Código:** `      logs.findIndex(entry => entry.action === 'GEMINI_AUXILIARY_FALLBACK')`
- **Função:** Exige log do último recurso auxiliar.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 327

- **Código:** `    ).toBeGreaterThan(`
- **Função:** Compõe o cenário EXT-07 — retry completo + auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 328

- **Código:** `      logs.findIndex(entry => entry.action === 'GEMINI_EXTRACT_RETRY_ALL')`
- **Função:** Exige telemetria de retry da cadeia completa.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 329

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 330

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-07 — retry completo + auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 331

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 332

- **Código:** `  test('EXT-08: sucesso direto não executa auxiliary fallback', async () => {`
- **Função:** Declara cenário: EXT-08 — sucesso direto sem auxiliary.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 333

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 334

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-08 — sucesso direto sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 335

- **Código:** `    const auxiliary = jest.fn();`
- **Função:** Cria callback auxiliar observável.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 336

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 337

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 338

- **Código:** `      pageDocument: createCanvasDocument(events),`
- **Função:** Compõe o cenário EXT-08 — sucesso direto sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 339

- **Código:** `      runtime: createRuntime(events),`
- **Função:** Compõe o cenário EXT-08 — sucesso direto sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 340

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 341

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 342

- **Código:** `    const result = await extractor.extractOrAuxiliaryFallback({`
- **Função:** Executa retry completo e possível callback auxiliar.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 343

- **Código:** `      resultImageElement: createImage(),`
- **Função:** Compõe o cenário EXT-08 — sucesso direto sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 344

- **Código:** `      resultUrl: 'https://example.test/result.png',`
- **Função:** Compõe o cenário EXT-08 — sucesso direto sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 345

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Seleciona modo que privilegia canvas/chain in-tab.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 346

- **Código:** `      onAuxiliaryFallback: auxiliary,`
- **Função:** Compõe o cenário EXT-08 — sucesso direto sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 347

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 348

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 349

- **Código:** `    expect(result).toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 350

- **Código:** `      kind: 'extracted',`
- **Função:** Exige classificação de sucesso direto.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 351

- **Código:** `      dataUrl: 'data:image/png;base64,CANVAS',`
- **Função:** Fixa resposta de sucesso do canvas.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 352

- **Código:** `      error: null,`
- **Função:** Compõe o cenário EXT-08 — sucesso direto sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 353

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 354

- **Código:** `    expect(auxiliary).not.toHaveBeenCalled();`
- **Função:** Prova que sucesso direto não usa fallback.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 355

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-08 — sucesso direto sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 356

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 357

- **Código:** `  test('EXT-09: sem callback auxiliar, erro terminal continua sendo propagado', async () => {`
- **Função:** Declara cenário: EXT-09 — erro terminal sem auxiliary.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 358

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 359

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 360

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 361

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 362

- **Código:** `      runtime: createRuntime(events, () => ({ error: 'SW falhou' })),`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 363

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 364

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 365

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 366

- **Código:** `    await expect(`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 367

- **Código:** `      extractor.extractOrAuxiliaryFallback({`
- **Função:** Executa retry completo e possível callback auxiliar.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa a implementação real; assertions subsequentes fixam o resultado.

### Linha 368

- **Código:** `        resultUrl: 'https://example.test/result.png',`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 369

- **Código:** `        executionMode: 'temp_chat',`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 370

- **Código:** `        maxAttempts: 1,`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 371

- **Código:** `      })`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 372

- **Código:** `    ).rejects.toThrow('SW falhou');`
- **Função:** Prova propagação do erro terminal sem callback auxiliar.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 373

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 374

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 375

- **Código:** `  test.each(['temp_chat', 'minimized_window', 'background_delete'])(`
- **Função:** Declara cenário: EXT-09 — erro terminal sem auxiliary.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 376

- **Código:** `    'EXT-10: asset gg-dl usa sessão autenticada no modo %s',`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 377

- **Código:** `    async executionMode => {`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 378

- **Código:** `      const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 379

- **Código:** `      const events = [];`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 380

- **Código:** `      const runtime = createRuntime(events, message => {`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 381

- **Código:** `        expect(message).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 382

- **Código:** `          action: 'FETCH_IMAGE_AS_BASE64',`
- **Função:** Compõe o cenário EXT-09 — erro terminal sem auxiliary, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-09 — erro terminal sem auxiliary.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 383

- **Código:** `          geminiSession: true,`
- **Função:** Exige sinal explícito de sessão Gemini no request ao SW.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 384

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 385

- **Código:** `        return { dataUrl: 'data:image/png;base64,AUTHENTICATED' };`
- **Função:** Compõe o cenário EXT-10 — gg-dl autenticado (test.each), preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 386

- **Código:** `      });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 387

- **Código:** `      const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 388

- **Código:** `        runtime,`
- **Função:** Compõe o cenário EXT-10 — gg-dl autenticado (test.each), preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 389

- **Código:** `        pageDocument: createCanvasDocument(events, { fail: true }),`
- **Função:** Compõe o cenário EXT-10 — gg-dl autenticado (test.each), preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 390

- **Código:** `        pageWindow: createPageWindow(events, { error: 'MAIN não deve ser a primeira rota' }),`
- **Função:** Compõe o cenário EXT-10 — gg-dl autenticado (test.each), preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 391

- **Código:** `        CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-10 — gg-dl autenticado (test.each), preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 392

- **Código:** `      });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 393

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 394

- **Código:** `      await expect(extractor.extractResultImage(`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 395

- **Código:** `        createImage(),`
- **Função:** Compõe o cenário EXT-10 — gg-dl autenticado (test.each), preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 396

- **Código:** `        'https://lh3.googleusercontent.com/gg-dl/GENERATED_IMAGE',`
- **Função:** Usa asset gerado reconhecido como Gemini.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 397

- **Código:** `        executionMode`
- **Função:** Compõe o cenário EXT-10 — gg-dl autenticado (test.each), preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 398

- **Código:** `      )).resolves.toBe('data:image/png;base64,AUTHENTICATED');`
- **Função:** Compõe o cenário EXT-10 — gg-dl autenticado (test.each), preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 399

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 400

- **Código:** `      expect(events).toEqual(['canvas', 'sw-session']);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 401

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 402

- **Código:** `  );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-10 — gg-dl autenticado (test.each).
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 403

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 404

- **Código:** `  test('EXT-11: asset rd-gg-dl usa MAIN apenas após falha da sessão autenticada', async () => {`
- **Função:** Declara cenário: EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 405

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 406

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-11 — rd-gg-dl sessão antes de MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 407

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 408

- **Código:** `      runtime: createRuntime(events, () => ({ error: 'sessão indisponível' })),`
- **Função:** Compõe o cenário EXT-11 — rd-gg-dl sessão antes de MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 409

- **Código:** `      pageDocument: createCanvasDocument(events, { fail: true }),`
- **Função:** Compõe o cenário EXT-11 — rd-gg-dl sessão antes de MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 410

- **Código:** `      pageWindow: createPageWindow(events, { dataUrl: 'data:image/png;base64,PAGE_LAST' }),`
- **Função:** Fixa resposta de sucesso do bridge MAIN.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 411

- **Código:** `      CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-11 — rd-gg-dl sessão antes de MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 412

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 413

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 414

- **Código:** `    await expect(extractor.extractResultImage(`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 415

- **Código:** `      createImage(),`
- **Função:** Compõe o cenário EXT-11 — rd-gg-dl sessão antes de MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 416

- **Código:** `      'https://lh3.googleusercontent.com/rd-gg-dl/GENERATED_IMAGE',`
- **Função:** Usa asset gerado reconhecido como Gemini.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 417

- **Código:** `      'temp_chat'`
- **Função:** Compõe o cenário EXT-11 — rd-gg-dl sessão antes de MAIN, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 418

- **Código:** `    )).resolves.toBe('data:image/png;base64,PAGE_LAST');`
- **Função:** Fixa resposta de sucesso do bridge MAIN.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 419

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 420

- **Código:** `    expect(events).toEqual(['canvas', 'sw-session', 'page']);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 421

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-11 — rd-gg-dl sessão antes de MAIN.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 422

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 423

- **Código:** `  test('EXT-12: URL comum em temp_chat preserva fetch legado sem credencial de sessão', async () => {`
- **Função:** Declara cenário: EXT-12 — URL comum legacy SW.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 424

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 425

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 426

- **Código:** `    const runtime = createRuntime(events, message => {`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 427

- **Código:** `      expect(message).not.toHaveProperty('geminiSession');`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 428

- **Código:** `      return { dataUrl: 'data:image/png;base64,LEGACY' };`
- **Função:** Fixa sucesso da rota background legacy.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 429

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 430

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 431

- **Código:** `      runtime,`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 432

- **Código:** `      pageDocument: {`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 433

- **Código:** `        createElement() {`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 434

- **Código:** `          throw new Error('canvas não deve executar para URL comum neste modo');`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 435

- **Código:** `        },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 436

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 437

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 438

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 439

- **Código:** `    await expect(extractor.extractResultImage(`
- **Função:** Executa a rota real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 440

- **Código:** `      createImage(),`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 441

- **Código:** `      'https://cdn.example/result.png',`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 442

- **Código:** `      'temp_chat'`
- **Função:** Compõe o cenário EXT-12 — URL comum legacy SW, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 443

- **Código:** `    )).resolves.toBe('data:image/png;base64,LEGACY');`
- **Função:** Fixa sucesso da rota background legacy.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 444

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 445

- **Código:** `    expect(events).toEqual(['sw-background']);`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 446

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-12 — URL comum legacy SW.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 447

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 448

- **Código:** `  test('EXT-13: logs de extração carregam jobId/batchId/index em estágios, retry e diagnóstico', async () => {`
- **Função:** Declara cenário: EXT-13 — correlação de logs.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 449

- **Código:** `    const { createResultExtractor } = loadModule();`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 450

- **Código:** `    const events = [];`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 451

- **Código:** `    const logs = [];`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 452

- **Código:** `    const extractor = createResultExtractor({`
- **Função:** Instancia a implementação real com boundaries controlados.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 453

- **Código:** `      runtime: createRuntime(events, () => ({ error: 'SW indisponível' })),`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 454

- **Código:** `      pageDocument: createCanvasDocument(events, { fail: true }),`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 455

- **Código:** `      pageWindow: createPageWindow(events, { error: 'MAIN indisponível' }),`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 456

- **Código:** `      CustomEventImpl: TestCustomEvent,`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 457

- **Código:** `      sleep: async () => {},`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 458

- **Código:** `      sendLog: (level, action, detail, extra) => logs.push({ level, action, detail, extra }),`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 459

- **Código:** `      getUrlLogMetadata: () => ({ host: 'example.test' }),`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 460

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 461

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 462

- **Código:** `    await expect(extractor.extractOrAuxiliaryFallback({`
- **Função:** Executa retry completo e possível callback auxiliar.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 463

- **Código:** `      resultImageElement: createImage(),`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 464

- **Código:** `      resultUrl: 'https://example.test/result.png',`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 465

- **Código:** `      executionMode: 'background_delete',`
- **Função:** Seleciona modo que privilegia canvas/chain in-tab.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 466

- **Código:** `      maxAttempts: 2,`
- **Função:** Limita o cenário a duas tentativas completas.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 467

- **Código:** `      retryDelayMs: 0,`
- **Função:** Remove delay real entre retries.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 468

- **Código:** `      logContext: {`
- **Função:** Injeta metadados de job/batch/index nos logs do extractor.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 469

- **Código:** `        jobIdPrefix: 'job12345',`
- **Função:** Fixa/observa identidade correlacionada nos logs.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 470

- **Código:** `        batchIdPrefix: 'batch678',`
- **Função:** Fixa/observa identidade correlacionada nos logs.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 471

- **Código:** `        index: 7,`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 472

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 473

- **Código:** `      onAuxiliaryFallback: async () => ({ delivered: true }),`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 474

- **Código:** `    })).resolves.toEqual(expect.objectContaining({ kind: 'auxiliary' }));`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 475

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 476

- **Código:** `    const correlated = logs.filter(entry =>`
- **Função:** Filtra logs de estágio/retry/diagnóstico/fallback para checar correlação.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 477

- **Código:** `      ['GEMINI_EXTRACT_STAGE', 'GEMINI_EXTRACT_RETRY_ALL', 'GEMINI_EXTRACT_DIAGNOSTIC', 'GEMINI_AUXILIARY_FALLBACK']`
- **Função:** Exige telemetria de retry da cadeia completa.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 478

- **Código:** `        .includes(entry.action)`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 479

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 480

- **Código:** `    expect(correlated.length).toBeGreaterThan(0);`
- **Função:** Filtra logs de estágio/retry/diagnóstico/fallback para checar correlação.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 481

- **Código:** `    correlated.forEach(entry => {`
- **Função:** Filtra logs de estágio/retry/diagnóstico/fallback para checar correlação.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 482

- **Código:** `      expect(entry.extra).toEqual(expect.objectContaining({`
- **Função:** Assertion focal do contrato.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 483

- **Código:** `        jobIdPrefix: 'job12345',`
- **Função:** Fixa/observa identidade correlacionada nos logs.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 484

- **Código:** `        batchIdPrefix: 'batch678',`
- **Função:** Fixa/observa identidade correlacionada nos logs.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 485

- **Código:** `        index: 7,`
- **Função:** Compõe o cenário EXT-13 — correlação de logs, preparando ou verificando a cadeia real de extração.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 486

- **Código:** `      }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 487

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 488

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 489

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** EXT-13 — correlação de logs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 490

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 491 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 13. Conclusão documental

Foram documentadas 490 linhas textuais e a posição 491 do newline final. A suíte prova diretamente a ordem das rotas e retries, inclusive sessão autenticada nos três modos; as três solicitações OPEN ficaram restritas a falhas de blob/SW/auxiliary não cobertas também pela suíte safe-background-delete.

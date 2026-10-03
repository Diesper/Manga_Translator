# Bíblia técnica — tests/unit/content-gemini/observer.test.js

> **Estado documental:** 🟡 CORRIGIDA após PRIMARY+ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** 0eff259f673c32e44c6d5ccf6f627c0c6d5505cc  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest do observer orientado a eventos por job Gemini  
> **Linhas textuais:** 485  
> **Posições documentais:** 486, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

observer.test.js valida o componente que transforma mudanças verificáveis da UI Gemini em três contratos: confirmação de submit, início/fim de geração e descoberta de resultado. Ele também impõe ownership por model turn e quarentena de previews/input.

A suíte carrega selectors.js, dom.js e observer.js reais e cobre light DOM, Shadow DOM, mutation coalescing, eventos load, erro visual, cleanup e seleção manual.

## 2. Geração e submit

OBS-01 prova que Stop display:none não ativa geração. OBS-02 prova Stop visível → generationActiveObserved + submissionConfirmed. OBS-12 prova que novo response marca geração ativa sem criar resultado prematuro. OBS-13 fixa a regra de Send: disabled no baseline não basta; enabled→disabled confirma com reason send_busy.

## 3. Ownership do model turn e baseline

OBS-03 adquire resposta nova; OBS-04 impede mutation em resposta antiga de transferir ownership; OBS-05 ignora imagem já presente no baseline; OBS-06 aceita nova imagem dentro da nova resposta.

OBS-18/19 fecham casos de wrappers ambíguos: autoria explícita model/assistant pode sobreviver a wrapper user ancestral ou wrapper estrito aninhado, sem abandonar a regra de ownership.

## 4. Erros, cleanup e coalescing

OBS-07 ignora erro oculto. OBS-08 converte erro visível novo em GEMINI_UI_ERROR e encerra logicamente. OBS-09 prova stop idempotente, observers/timers zerados e registry removido. OBS-10 prova que mutations posteriores ao cleanup não geram resultado. O caso de coalescing mostra que várias mutations do mesmo turno têm inspeções limitadas/coalescidas; a assertion aceita no máximo duas inspeções adicionais e, portanto, **não prova exatamente uma única inspeção**.

## 5. Shadow DOM, quarentena e mídia tardia

OBS-14 encontra response/image em Shadow DOM. OBS-15 rejeita cópia da entrada no user turn. OBS-16 permite asset gg-dl órfão apenas depois de geração observada. OBS-17 mantém preview reconstruído em quarentena. OBS-20 usa evento load para reavaliar imagem remota que inicialmente ainda não tinha dimensões válidas.

## 6. Seleção manual

PR6 chama acceptResult e exige que a mesma Promise aberta por waitForResult seja resolvida, comprovando que fallback manual não cria um canal paralelo de conclusão.

## 7. Branches públicos ainda sem prova focal

waitForSubmission possui timeout GEMINI_SUBMISSION_NOT_CONFIRMED; waitForResult possui GEMINI_RESULT_TIMEOUT; stop deve rejeitar waiters pendentes com OBSERVER_STOPPED. A suíte abre vários waitForResult, mas sempre resolve por resultado/erro antes do timeout e OBS-09 não mantém waiter pendente.

Ao criar novo observer com o mesmo jobId, createGeminiObserver procura registry existente e chama stop() antes de instalar o novo. Não há cenário com duas instâncias do mesmo jobId. Também não há assertion para a emissão generation_finished quando Stop desaparece depois de generationActiveObserved com responseContainer ainda conectado.

## 8. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob 0eff259f673c32e44c6d5ccf6f627c0c6d5505cc. Os 22 casos, incluindo coalescing e PR6, passam em Node 20.x (109255348388) e Node 22.x (109255348406); global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 9. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| Stop oculto não ativa geração | OBS-01 | ✅ PROVADO DIRETAMENTE |
| Stop visível confirma geração/submit | OBS-02 | ✅ PROVADO DIRETAMENTE |
| ownership de resposta nova | OBS-03/04 | ✅ PROVADO DIRETAMENTE |
| baseline de imagem é respeitado | OBS-05 | ✅ PROVADO DIRETAMENTE |
| nova mídia do model turn resolve resultado | OBS-06 | ✅ PROVADO DIRETAMENTE |
| erro oculto/visível | OBS-07/08 | ✅ PROVADO DIRETAMENTE |
| cleanup idempotente e mutation pós-stop | OBS-09/10 | ✅ PROVADO DIRETAMENTE |
| resposta imediata pós-submit | OBS-11 | ✅ PROVADO DIRETAMENTE |
| send busy exige transição | OBS-13 | ✅ PROVADO DIRETAMENTE |
| coalescing/limitação de inspeções após múltiplas mutations | caso coalescing | ✅ PROVADO DIRETAMENTE para `inspectCount <= before + 2`; cardinalidade exata de uma inspeção não é provada |
| Shadow DOM/ownership/quarentena | OBS-14..20 | ✅ PROVADO DIRETAMENTE |
| acceptResult manual resolve result waiter | PR6 | ✅ PROVADO DIRETAMENTE |
| timeout de submit/result | branches públicos de waiters | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| stop rejeita waiter ainda pendente | branch settleWaiters no stop | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| novo observer com mesmo jobId para o antigo | registry replacement | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Stop some depois da geração → generation_finished | inspectControls | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Solicitações ao auditor

### 183-001 — TEST_REQUIRED — ACCEPTED — HIGH

Encontrado: waitForSubmission e waitForResult expõem timeouts estruturados e stop rejeita waiters pendentes com OBSERVER_STOPPED; nenhum caso focal congela esses três contratos.

Evidência ausente: fake timers para GEMINI_SUBMISSION_NOT_CONFIRMED e GEMINI_RESULT_TIMEOUT; cenário separado com waiter pendente + stop() exigindo OBSERVER_STOPPED e timer removido.

Risco: promises podem ficar abertas, rejeitar com código errado ou deixar timers após teardown.

### 183-002 — TEST_REQUIRED — ACCEPTED — HIGH

Encontrado: createGeminiObserver substitui observer existente no registry para o mesmo jobId chamando existing.stop(), mas cada teste usa jobId único.

Evidência ausente: iniciar observer A, abrir waiter, criar observer B com mesmo jobId; exigir A cleanedUp/OBSERVER_STOPPED, registry apontando B e apenas B reagindo a mutations posteriores.

Risco: duas instâncias podem disputar ownership/resultados do mesmo job após rebootstrap.

### 183-003 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: inspectControls emite generation_finished quando geração já foi observada, responseContainer continua conectado e Stop deixa de estar visível. Não há assertion desse evento/flag.

Evidência ausente: Stop visível + response nova, depois remover/ocultar Stop e inspecionar; exigir generationFinished=true e um único onStateChange('generation_finished').

Risco: telemetria/estado de fim de geração pode regredir sem afetar descoberta da imagem.

## 11. Fonte integral auditada

```javascript
'use strict';

const path = require('path');

const SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');
const DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');
const OBSERVER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/observer.js');

function loadObserver() {
  let observerApi;
  jest.isolateModules(() => {
    require(SELECTORS_PATH);
    require(DOM_PATH);
    observerApi = require(OBSERVER_PATH);
  });
  return observerApi;
}

function visibleRect(element, width = 120, height = 40) {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() { return this; },
  });
}

function addStop({ hidden = false } = {}) {
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Stop generating');
  visibleRect(button, 36, 36);
  if (hidden) button.style.display = 'none';
  document.body.appendChild(button);
  return button;
}

function addResponse() {
  const response = document.createElement('model-response');
  document.body.appendChild(response);
  return response;
}

function addResultImage(container, src = 'https://cdn.example/result.png') {
  const image = document.createElement('img');
  image.src = src;
  Object.defineProperty(image, 'naturalWidth', { value: 1024, configurable: true });
  Object.defineProperty(image, 'naturalHeight', { value: 1536, configurable: true });
  Object.defineProperty(image, 'complete', { value: true, configurable: true });
  container.appendChild(image);
  return image;
}

function addError(text, { hidden = false } = {}) {
  const alert = document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.textContent = text;
  visibleRect(alert, 300, 50);
  if (hidden) alert.style.display = 'none';
  document.body.appendChild(alert);
  return alert;
}

function flushMutations() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('gemini/observer.js — Observer V2', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    delete window.__mtGeminiObservers;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete window.__mtGeminiObservers;
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('OBS-01: Stop presente mas display:none não ativa geração', () => {
    addStop({ hidden: true });
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-01' }).start();

    expect(observer.getState().generationActiveObserved).toBe(false);
    expect(observer.getState().submissionConfirmed).toBe(false);
    observer.stop();
  });

  test('OBS-02: Stop visível ativa geração e confirma submission', () => {
    addStop();
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-02' }).start();

    expect(observer.getState().generationActiveObserved).toBe(true);
    expect(observer.getState().submissionConfirmed).toBe(true);
    expect(observer.getState().submissionReason).toBe('stop_visible');
    observer.stop();
  });

  test('OBS-03: novo response container é adquirido pelo job atual', () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-03' }).start();
    const response = addResponse();

    observer.inspect();

    expect(observer.getState().responseContainer).toBe(response);
    expect(observer.getState().submissionConfirmed).toBe(true);
    expect(observer.getState().submissionReason).toBe('generation_started');
    observer.stop();
  });

  test('OBS-04: alteração em resposta antiga não transfere ownership', () => {
    const oldResponse = addResponse();
    oldResponse.textContent = 'resposta antiga';

    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-04' }).start();

    oldResponse.textContent = 'resposta antiga alterada';
    observer.inspect();

    expect(observer.getState().responseContainer).toBeNull();
    expect(observer.getState().submissionConfirmed).toBe(false);
    observer.stop();
  });

  test('OBS-05: imagem que já existia no baseline é ignorada mesmo se reaparecer', () => {
    const baseline = document.createElement('img');
    baseline.src = 'https://cdn.example/already-there.png';
    document.body.appendChild(baseline);

    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-05' }).start();

    const response = addResponse();
    addResultImage(response, 'https://cdn.example/already-there.png');
    observer.inspect();

    expect(observer.getState().responseContainer).toBe(response);
    expect(observer.getState().resultUrl).toBeNull();
    expect(observer.getState().done).toBe(false);
    observer.stop();
  });

  test('OBS-06: nova imagem dentro do novo response produz resultado', async () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-06' }).start();
    const pending = observer.waitForResult(1000);

    const response = addResponse();
    const image = addResultImage(response, 'https://cdn.example/new-result.png');
    observer.inspect();

    await expect(pending).resolves.toEqual({
      image,
      url: 'https://cdn.example/new-result.png',
    });
    expect(observer.getState().done).toBe(true);
    observer.stop();
  });

  test('OBS-07: erro oculto é ignorado', () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-07' }).start();

    addError('Falha invisível', { hidden: true });
    observer.inspect();

    expect(observer.getState().error).toBeNull();
    expect(observer.getState().done).toBe(false);
    observer.stop();
  });

  test('OBS-08: erro visível novo encerra o observer logicamente', async () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-08' }).start();
    const pending = observer.waitForResult(1000);

    addError('Gemini indisponível agora');
    observer.inspect();

    await expect(pending).rejects.toMatchObject({
      code: 'GEMINI_UI_ERROR',
      message: 'Gemini indisponível agora',
    });
    expect(observer.getState().error).toBe('Gemini indisponível agora');
    expect(observer.getState().done).toBe(true);
    observer.stop();
  });

  test('OBS-09: cleanup é idempotente e remove observers/timers/registry', () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-09' }).start();

    expect(window.__mtGeminiObservers['obs-09']).toBe(observer);
    expect(observer.stop()).toBe(true);
    expect(observer.stop()).toBe(false);

    const state = observer.getState();
    expect(state.cleanedUp).toBe(true);
    expect(state.observer).toBeNull();
    expect(state.responseObserver).toBeNull();
    expect(state.timers.size).toBe(0);
    expect(window.__mtGeminiObservers['obs-09']).toBeUndefined();
  });

  test('OBS-10: mutations depois do cleanup não emitem resultado', async () => {
    const onStateChange = jest.fn();
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({
      jobId: 'obs-10',
      onStateChange,
    }).start();

    observer.stop();
    const response = addResponse();
    addResultImage(response);
    await flushMutations();

    expect(onStateChange.mock.calls.map(call => call[0])).not.toContain('result_image');
    expect(observer.getState().resultUrl).toBeNull();
  });

  test('OBS-11: observer instalado antes do submit captura resposta imediata', async () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-11' }).start();
    const pending = observer.waitForResult(1000);

    const response = addResponse();
    const image = addResultImage(response, 'https://cdn.example/instant.png');

    await flushMutations();

    await expect(pending).resolves.toEqual({
      image,
      url: 'https://cdn.example/instant.png',
    });
    observer.stop();
  });

  test('OBS-12: resposta nova marca geração ativa sem concluir o job prematuramente', () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-12' }).start();

    const response = addResponse();
    response.textContent = 'preparando';
    observer.inspect();

    expect(observer.getState().responseContainer).toBe(response);
    expect(observer.getState().generationActiveObserved).toBe(true);
    expect(observer.getState().generationFinished).toBe(true);
    expect(observer.getState().done).toBe(false);
    observer.stop();
  });

  test('OBS-13: send disabled no baseline não confirma submit; transição enabled -> disabled confirma', () => {
    const send = document.createElement('button');
    send.setAttribute('aria-label', 'Send message');
    send.disabled = true;
    visibleRect(send, 36, 36);
    document.body.appendChild(send);

    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-13' }).start();

    expect(observer.getState().submissionConfirmed).toBe(false);

    send.disabled = false;
    observer.inspect();
    expect(observer.getState().submissionConfirmed).toBe(false);

    send.disabled = true;
    observer.inspect();

    expect(observer.getState().submissionConfirmed).toBe(true);
    expect(observer.getState().submissionReason).toBe('send_busy');
    observer.stop();
  });

  test('coalescing: várias mutations no mesmo turno agendam uma única inspeção', async () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'obs-coalesce' }).start();
    const before = observer.getState().inspectCount;

    const node = document.createElement('div');
    document.body.appendChild(node);
    node.setAttribute('data-a', '1');
    node.setAttribute('data-b', '2');
    node.textContent = 'mudança';

    await flushMutations();

    expect(observer.getState().inspectCount).toBeLessThanOrEqual(before + 2);
    observer.stop();
  });
  test('OBS-14: encontra resposta estrita e imagem dentro de shadow DOM', async () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'shadow-result' }).start();
    const pending = observer.waitForResult(1000);

    const host = document.createElement('section');
    host.setAttribute('data-message-author', 'assistant');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const image = addResultImage(shadow, 'https://cdn.example/shadow-result.png');
    observer.inspect();

    await expect(pending).resolves.toEqual({
      image,
      url: 'https://cdn.example/shadow-result.png',
    });
    expect(observer.getState().responseContainer).toBe(host);
    observer.stop();
  });

  test('OBS-15: rejeita cópia da entrada dentro do turno do usuário', () => {
    const onStateChange = jest.fn();
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'user-clone', onStateChange }).start();

    addResponse();
    const userTurn = document.createElement('user-query');
    document.body.appendChild(userTurn);
    addResultImage(userTurn, 'https://cdn.example/cloned-input.png');
    observer.inspect();

    expect(observer.getState().resultUrl).toBeNull();
    expect(onStateChange).toHaveBeenCalledWith(
      'result_candidate_rejected',
      expect.objectContaining({ reason: 'user_turn' })
    );
    observer.stop();
  });

  test('OBS-16: aceita asset gg-dl órfão somente após evidência de geração', async () => {
    addStop();
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'generated-fallback' }).start();
    const pending = observer.waitForResult(1000);

    const image = addResultImage(
      document.body,
      'https://lh3.googleusercontent.com/gg-dl/AUTHENTICATED_RESULT'
    );
    observer.inspect();

    await expect(pending).resolves.toEqual({
      image,
      url: 'https://lh3.googleusercontent.com/gg-dl/AUTHENTICATED_RESULT',
    });
    observer.stop();
  });

  test('OBS-17: preview reconstruído do anexo continua em quarentena durante a geração', () => {
    const onStateChange = jest.fn();
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({
      jobId: 'attachment-preview-rebuilt',
      onStateChange,
    }).start();

    addResponse();
    const host = document.createElement('section');
    const shadow = host.attachShadow({ mode: 'open' });
    const preview = document.createElement('file-preview');
    const image = addResultImage(preview, 'blob:https://gemini.google.com/rebuilt-input');
    shadow.appendChild(preview);
    document.body.appendChild(host);
    observer.inspect();

    expect(observer.getState().resultUrl).toBeNull();
    expect(onStateChange).toHaveBeenCalledWith(
      'result_candidate_rejected',
      expect.objectContaining({ reason: 'attachment_preview' })
    );
    expect(image.isConnected).toBe(true);
    observer.stop();
  });

  test('OBS-18: wrapper user ancestral não invalida model turn com autoria explícita', async () => {
    const onStateChange = jest.fn();
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({
      jobId: 'outer-user-wrapper',
      onStateChange,
    }).start();
    const pending = observer.waitForResult(1000);

    const outer = document.createElement('div');
    outer.className = 'user-query-container';
    const response = document.createElement('model-response');
    response.setAttribute('data-message-author', 'model');
    outer.appendChild(response);
    document.body.appendChild(outer);

    const image = addResultImage(
      response,
      'https://lh3.googleusercontent.com/gg-dl/outer-user-generated'
    );
    observer.inspect();

    await expect(pending).resolves.toEqual({
      image,
      url: 'https://lh3.googleusercontent.com/gg-dl/outer-user-generated',
    });
    expect(observer.getState().responseContainer).toBe(response);
    expect(onStateChange.mock.calls.map(call => call[0])).toContain('result_candidate_accepted');
    observer.stop();
  });

  test('OBS-19: wrapper estrito aninhado não invalida ownership do model turn novo', async () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'nested-model-wrapper' }).start();
    const pending = observer.waitForResult(1000);

    const response = addResponse();
    const nested = document.createElement('div');
    nested.className = 'model-response-text';
    response.appendChild(nested);
    const image = addResultImage(
      nested,
      'https://lh3.googleusercontent.com/rd-gg-dl/nested-generated'
    );

    observer.inspect();

    await expect(pending).resolves.toEqual({
      image,
      url: 'https://lh3.googleusercontent.com/rd-gg-dl/nested-generated',
    });
    expect(response.contains(observer.getState().responseContainer)).toBe(true);
    observer.stop();
  });

  test('OBS-20: imagem remota é reavaliada quando o evento load completa dimensões', async () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'result-load-reinspect' }).start();
    const pending = observer.waitForResult(1000);

    const response = addResponse();
    const image = document.createElement('img');
    image.src = 'https://cdn.example/delayed-result.png';
    Object.defineProperty(image, 'naturalWidth', { value: 0, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 0, configurable: true });
    Object.defineProperty(image, 'complete', { value: false, configurable: true });
    response.appendChild(image);

    observer.inspect();
    expect(observer.getState().resultUrl).toBeNull();

    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1600, configurable: true });
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    image.dispatchEvent(new Event('load'));

    await flushMutations();
    await expect(pending).resolves.toEqual({
      image,
      url: 'https://cdn.example/delayed-result.png',
    });
    observer.stop();
  });

  test('PR6: seleção manual resolve a mesma Promise de resultado', async () => {
    const { createGeminiObserver } = loadObserver();
    const observer = createGeminiObserver({ jobId: 'manual-result' }).start();
    const pending = observer.waitForResult(1000);

    expect(observer.acceptResult(null, 'blob:https://gemini.google.com/manual-picked')).toBe(true);

    await expect(pending).resolves.toEqual({
      image: null,
      url: 'blob:https://gemini.google.com/manual-picked',
    });
    observer.stop();
  });

});
```

## 12. Auditoria linha a linha

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

- **Código:** `const SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');`
- **Função:** Resolve selectors.js, dom.js ou observer.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 006

- **Código:** `const DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');`
- **Função:** Resolve selectors.js, dom.js ou observer.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 007

- **Código:** `const OBSERVER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/observer.js');`
- **Função:** Resolve selectors.js, dom.js ou observer.js reais.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 008

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 009

- **Código:** `function loadObserver() {`
- **Função:** Carrega selectors, dom e observer reais em isolamento Jest.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `  let observerApi;`
- **Função:** Compõe o cenário loader selectors/dom/observer, preparando, executando ou verificando o observer real.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Compõe o cenário loader selectors/dom/observer, preparando, executando ou verificando o observer real.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `    require(SELECTORS_PATH);`
- **Função:** Carrega selectors reais usados pelo observer.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 013

- **Código:** `    require(DOM_PATH);`
- **Função:** Carrega helpers DOM reais.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 014

- **Código:** `    observerApi = require(OBSERVER_PATH);`
- **Função:** Carrega observer.js real.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 015

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `  return observerApi;`
- **Função:** Compõe o cenário loader selectors/dom/observer, preparando, executando ou verificando o observer real.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader selectors/dom/observer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `function visibleRect(element, width = 120, height = 40) {`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `  element.getBoundingClientRect = () => ({`
- **Função:** Fornece retângulo usado por checks de visibilidade.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `    x: 0,`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `    y: 0,`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `    top: 0,`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `    left: 0,`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `    right: width,`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `    bottom: height,`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `    width,`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `    height,`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    toJSON() { return this; },`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `function addStop({ hidden = false } = {}) {`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `  const button = document.createElement('button');`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `  button.setAttribute('aria-label', 'Stop generating');`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `  visibleRect(button, 36, 36);`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `  if (hidden) button.style.display = 'none';`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `  document.body.appendChild(button);`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `  return button;`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `function addResponse() {`
- **Função:** Cria container de resposta do modelo para ownership.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `  const response = document.createElement('model-response');`
- **Função:** Materializa elemento semântico de resposta do modelo.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `  document.body.appendChild(response);`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `  return response;`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `function addResultImage(container, src = 'https://cdn.example/result.png') {`
- **Função:** Cria IMG candidata com src/dimensões/complete controlados.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `  const image = document.createElement('img');`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `  image.src = src;`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `  Object.defineProperty(image, 'naturalWidth', { value: 1024, configurable: true });`
- **Função:** Fixa dimensões naturais usadas na validação da mídia.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `  Object.defineProperty(image, 'naturalHeight', { value: 1536, configurable: true });`
- **Função:** Fixa dimensões naturais usadas na validação da mídia.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `  Object.defineProperty(image, 'complete', { value: true, configurable: true });`
- **Função:** Controla estado de carregamento da imagem.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `  container.appendChild(image);`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `  return image;`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `function addError(text, { hidden = false } = {}) {`
- **Função:** Cria elemento de erro Gemini visível/oculto controlado.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `  const alert = document.createElement('div');`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `  alert.setAttribute('role', 'alert');`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `  alert.textContent = text;`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `  visibleRect(alert, 300, 50);`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `  if (hidden) alert.style.display = 'none';`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `  document.body.appendChild(alert);`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `  return alert;`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `function flushMutations() {`
- **Função:** Permite execução de callbacks agendados/coalescidos.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `  return new Promise(resolve => setTimeout(resolve, 0));`
- **Função:** Compõe o cenário helpers de fixture DOM, preparando, executando ou verificando o observer real.
- **Contexto:** helpers de fixture DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `describe('gemini/observer.js — Observer V2', () => {`
- **Função:** Abre suíte focal de gemini/observer.js.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `  beforeEach(() => {`
- **Função:** Reseta DOM e registry global de observers.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário setup/teardown, preparando, executando ou verificando o observer real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `    delete window.__mtGeminiObservers;`
- **Função:** Verifica registry global por jobId.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `  afterEach(() => {`
- **Função:** Restaura mocks, limpa DOM e registry.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `    jest.useRealTimers();`
- **Função:** Compõe o cenário setup/teardown, preparando, executando ou verificando o observer real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Compõe o cenário setup/teardown, preparando, executando ou verificando o observer real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `    delete window.__mtGeminiObservers;`
- **Função:** Verifica registry global por jobId.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário setup/teardown, preparando, executando ou verificando o observer real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `  test('OBS-01: Stop presente mas display:none não ativa geração', () => {`
- **Função:** Declara cenário: OBS-01 — Stop oculto.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `    addStop({ hidden: true });`
- **Função:** Compõe o cenário OBS-01 — Stop oculto, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-01' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `    expect(observer.getState().generationActiveObserved).toBe(false);`
- **Função:** Observa flag que registra início de geração.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 091

- **Código:** `    expect(observer.getState().submissionConfirmed).toBe(false);`
- **Função:** Observa se submit foi confirmado por evidência UI.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 092

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 093

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-01 — Stop oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `  test('OBS-02: Stop visível ativa geração e confirma submission', () => {`
- **Função:** Declara cenário: OBS-02 — Stop visível.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `    addStop();`
- **Função:** Compõe o cenário OBS-02 — Stop visível, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-02' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `    expect(observer.getState().generationActiveObserved).toBe(true);`
- **Função:** Observa flag que registra início de geração.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 101

- **Código:** `    expect(observer.getState().submissionConfirmed).toBe(true);`
- **Função:** Observa se submit foi confirmado por evidência UI.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 102

- **Código:** `    expect(observer.getState().submissionReason).toBe('stop_visible');`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 103

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 104

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-02 — Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `  test('OBS-03: novo response container é adquirido pelo job atual', () => {`
- **Função:** Declara cenário: OBS-03 — ownership de resposta nova.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-03' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** `    const response = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 112

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `    expect(observer.getState().responseContainer).toBe(response);`
- **Função:** Observa container adquirido pelo job atual.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 114

- **Código:** `    expect(observer.getState().submissionConfirmed).toBe(true);`
- **Função:** Observa se submit foi confirmado por evidência UI.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 115

- **Código:** `    expect(observer.getState().submissionReason).toBe('generation_started');`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 116

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 117

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-03 — ownership de resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `  test('OBS-04: alteração em resposta antiga não transfere ownership', () => {`
- **Função:** Declara cenário: OBS-04 — resposta antiga não toma ownership.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `    const oldResponse = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `    oldResponse.textContent = 'resposta antiga';`
- **Função:** Compõe o cenário OBS-04 — resposta antiga não toma ownership, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-04' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 126

- **Código:** `    oldResponse.textContent = 'resposta antiga alterada';`
- **Função:** Compõe o cenário OBS-04 — resposta antiga não toma ownership, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 128

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `    expect(observer.getState().responseContainer).toBeNull();`
- **Função:** Observa container adquirido pelo job atual.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 130

- **Código:** `    expect(observer.getState().submissionConfirmed).toBe(false);`
- **Função:** Observa se submit foi confirmado por evidência UI.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 131

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 132

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-04 — resposta antiga não toma ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** `  test('OBS-05: imagem que já existia no baseline é ignorada mesmo se reaparecer', () => {`
- **Função:** Declara cenário: OBS-05 — imagem baseline ignorada.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `    const baseline = document.createElement('img');`
- **Função:** Relaciona fixture a estado existente antes do start, que deve ser ignorado como novidade.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** `    baseline.src = 'https://cdn.example/already-there.png';`
- **Função:** Relaciona fixture a estado existente antes do start, que deve ser ignorado como novidade.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `    document.body.appendChild(baseline);`
- **Função:** Relaciona fixture a estado existente antes do start, que deve ser ignorado como novidade.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-05' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `    const response = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `    addResultImage(response, 'https://cdn.example/already-there.png');`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 145

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `    expect(observer.getState().responseContainer).toBe(response);`
- **Função:** Observa container adquirido pelo job atual.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 147

- **Código:** `    expect(observer.getState().resultUrl).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 148

- **Código:** `    expect(observer.getState().done).toBe(false);`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 149

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 150

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-05 — imagem baseline ignorada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `  test('OBS-06: nova imagem dentro do novo response produz resultado', async () => {`
- **Função:** Declara cenário: OBS-06 — nova imagem em resposta nova.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-06' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 156

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `    const response = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `    const image = addResultImage(response, 'https://cdn.example/new-result.png');`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 160

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `    await expect(pending).resolves.toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 162

- **Código:** `      image,`
- **Função:** Compõe o cenário OBS-06 — nova imagem em resposta nova, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `      url: 'https://cdn.example/new-result.png',`
- **Função:** Compõe o cenário OBS-06 — nova imagem em resposta nova, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `    expect(observer.getState().done).toBe(true);`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 166

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 167

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-06 — nova imagem em resposta nova.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `  test('OBS-07: erro oculto é ignorado', () => {`
- **Função:** Declara cenário: OBS-07 — erro oculto.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-07' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `    addError('Falha invisível', { hidden: true });`
- **Função:** Adiciona mensagem de erro candidata.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 175

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** `    expect(observer.getState().error).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 177

- **Código:** `    expect(observer.getState().done).toBe(false);`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 178

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 179

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-07 — erro oculto.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** `  test('OBS-08: erro visível novo encerra o observer logicamente', async () => {`
- **Função:** Declara cenário: OBS-08 — erro visível.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-08' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 185

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `    addError('Gemini indisponível agora');`
- **Função:** Adiciona mensagem de erro candidata.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 188

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `    await expect(pending).rejects.toMatchObject({`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 190

- **Código:** `      code: 'GEMINI_UI_ERROR',`
- **Função:** Exige erro estruturado ao detectar novo erro visível.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 191

- **Código:** `      message: 'Gemini indisponível agora',`
- **Função:** Compõe o cenário OBS-08 — erro visível, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `    expect(observer.getState().error).toBe('Gemini indisponível agora');`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 194

- **Código:** `    expect(observer.getState().done).toBe(true);`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 195

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 196

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-08 — erro visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 198

- **Código:** `  test('OBS-09: cleanup é idempotente e remove observers/timers/registry', () => {`
- **Função:** Declara cenário: OBS-09 — cleanup idempotente.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 199

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 200

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-09' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 201

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 202

- **Código:** `    expect(window.__mtGeminiObservers['obs-09']).toBe(observer);`
- **Função:** Verifica registry global por jobId.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 203

- **Código:** `    expect(observer.stop()).toBe(true);`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 204

- **Código:** `    expect(observer.stop()).toBe(false);`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 205

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `    const state = observer.getState();`
- **Função:** Compõe o cenário OBS-09 — cleanup idempotente, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 207

- **Código:** `    expect(state.cleanedUp).toBe(true);`
- **Função:** Observa estado terminal de cleanup.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 208

- **Código:** `    expect(state.observer).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 209

- **Código:** `    expect(state.responseObserver).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 210

- **Código:** `    expect(state.timers.size).toBe(0);`
- **Função:** Verifica timers internos após cleanup.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 211

- **Código:** `    expect(window.__mtGeminiObservers['obs-09']).toBeUndefined();`
- **Função:** Verifica registry global por jobId.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 212

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-09 — cleanup idempotente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 213

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 214

- **Código:** `  test('OBS-10: mutations depois do cleanup não emitem resultado', async () => {`
- **Função:** Declara cenário: OBS-10 — mutation pós-cleanup.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 215

- **Código:** `    const onStateChange = jest.fn();`
- **Função:** Compõe o cenário OBS-10 — mutation pós-cleanup, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 216

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 217

- **Código:** `    const observer = createGeminiObserver({`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 218

- **Código:** `      jobId: 'obs-10',`
- **Função:** Compõe o cenário OBS-10 — mutation pós-cleanup, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 219

- **Código:** `      onStateChange,`
- **Função:** Compõe o cenário OBS-10 — mutation pós-cleanup, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 220

- **Código:** `    }).start();`
- **Função:** Inicia MutationObserver, registry, inspeção inicial e timer periódico.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 222

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 223

- **Código:** `    const response = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 224

- **Código:** `    addResultImage(response);`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 225

- **Código:** `    await flushMutations();`
- **Função:** Permite execução de callbacks agendados/coalescidos.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 226

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `    expect(onStateChange.mock.calls.map(call => call[0])).not.toContain('result_image');`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 228

- **Código:** `    expect(observer.getState().resultUrl).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 229

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-10 — mutation pós-cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 230

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 231

- **Código:** `  test('OBS-11: observer instalado antes do submit captura resposta imediata', async () => {`
- **Função:** Declara cenário: OBS-11 — resposta imediata.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 232

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 233

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-11' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 234

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 235

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 236

- **Código:** `    const response = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 237

- **Código:** `    const image = addResultImage(response, 'https://cdn.example/instant.png');`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 239

- **Código:** `    await flushMutations();`
- **Função:** Permite execução de callbacks agendados/coalescidos.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 240

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 241

- **Código:** `    await expect(pending).resolves.toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 242

- **Código:** `      image,`
- **Função:** Compõe o cenário OBS-11 — resposta imediata, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 243

- **Código:** `      url: 'https://cdn.example/instant.png',`
- **Função:** Compõe o cenário OBS-11 — resposta imediata, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 244

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 246

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-11 — resposta imediata.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 248

- **Código:** `  test('OBS-12: resposta nova marca geração ativa sem concluir o job prematuramente', () => {`
- **Função:** Declara cenário: OBS-12 — geração ativa sem resultado prematuro.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 250

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-12' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 251

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 252

- **Código:** `    const response = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** `    response.textContent = 'preparando';`
- **Função:** Compõe o cenário OBS-12 — geração ativa sem resultado prematuro, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 254

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 255

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 256

- **Código:** `    expect(observer.getState().responseContainer).toBe(response);`
- **Função:** Observa container adquirido pelo job atual.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 257

- **Código:** `    expect(observer.getState().generationActiveObserved).toBe(true);`
- **Função:** Observa flag que registra início de geração.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 258

- **Código:** `    expect(observer.getState().generationFinished).toBe(true);`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 259

- **Código:** `    expect(observer.getState().done).toBe(false);`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 260

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 261

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-12 — geração ativa sem resultado prematuro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 262

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 263

- **Código:** `  test('OBS-13: send disabled no baseline não confirma submit; transição enabled -> disabled confirma', () => {`
- **Função:** Declara cenário: OBS-13 — send busy por transição.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 264

- **Código:** `    const send = document.createElement('button');`
- **Função:** Compõe o cenário OBS-13 — send busy por transição, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 265

- **Código:** `    send.setAttribute('aria-label', 'Send message');`
- **Função:** Compõe o cenário OBS-13 — send busy por transição, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 266

- **Código:** `    send.disabled = true;`
- **Função:** Compõe o cenário OBS-13 — send busy por transição, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 267

- **Código:** `    visibleRect(send, 36, 36);`
- **Função:** Compõe o cenário OBS-13 — send busy por transição, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 268

- **Código:** `    document.body.appendChild(send);`
- **Função:** Compõe o cenário OBS-13 — send busy por transição, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 269

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 270

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 271

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-13' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 272

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 273

- **Código:** `    expect(observer.getState().submissionConfirmed).toBe(false);`
- **Função:** Observa se submit foi confirmado por evidência UI.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 274

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 275

- **Código:** `    send.disabled = false;`
- **Função:** Compõe o cenário OBS-13 — send busy por transição, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 276

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 277

- **Código:** `    expect(observer.getState().submissionConfirmed).toBe(false);`
- **Função:** Observa se submit foi confirmado por evidência UI.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 278

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 279

- **Código:** `    send.disabled = true;`
- **Função:** Compõe o cenário OBS-13 — send busy por transição, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 280

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 281

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 282

- **Código:** `    expect(observer.getState().submissionConfirmed).toBe(true);`
- **Função:** Observa se submit foi confirmado por evidência UI.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 283

- **Código:** `    expect(observer.getState().submissionReason).toBe('send_busy');`
- **Função:** Exige motivo de confirmação por transição enabled→disabled do Send.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 284

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 285

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-13 — send busy por transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 286

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 287

- **Código:** `  test('coalescing: várias mutations no mesmo turno agendam uma única inspeção', async () => {`
- **Função:** Declara cenário: coalescing de mutations.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 288

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 289

- **Código:** `    const observer = createGeminiObserver({ jobId: 'obs-coalesce' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 290

- **Código:** `    const before = observer.getState().inspectCount;`
- **Função:** Mede que múltiplas mutations não fazem o contador crescer além de `before + 2`; não fixa cardinalidade exata de uma inspeção.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 291

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 292

- **Código:** `    const node = document.createElement('div');`
- **Função:** Compõe o cenário coalescing de mutations, preparando, executando ou verificando o observer real.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 293

- **Código:** `    document.body.appendChild(node);`
- **Função:** Compõe o cenário coalescing de mutations, preparando, executando ou verificando o observer real.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 294

- **Código:** `    node.setAttribute('data-a', '1');`
- **Função:** Compõe o cenário coalescing de mutations, preparando, executando ou verificando o observer real.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 295

- **Código:** `    node.setAttribute('data-b', '2');`
- **Função:** Compõe o cenário coalescing de mutations, preparando, executando ou verificando o observer real.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 296

- **Código:** `    node.textContent = 'mudança';`
- **Função:** Compõe o cenário coalescing de mutations, preparando, executando ou verificando o observer real.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 297

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 298

- **Código:** `    await flushMutations();`
- **Função:** Permite execução de callbacks agendados/coalescidos.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 299

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** coalescing de mutations.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 300

- **Código:** `    expect(observer.getState().inspectCount).toBeLessThanOrEqual(before + 2);`
- **Função:** Mede coalescing de múltiplas mutations em uma única inspeção adicional.
- **Contexto:** coalescing de mutations.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 301

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** coalescing de mutations.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 302

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 303

- **Código:** `  test('OBS-14: encontra resposta estrita e imagem dentro de shadow DOM', async () => {`
- **Função:** Declara cenário: OBS-14 — Shadow DOM.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 304

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 305

- **Código:** `    const observer = createGeminiObserver({ jobId: 'shadow-result' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 306

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 307

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 308

- **Código:** `    const host = document.createElement('section');`
- **Função:** Compõe o cenário OBS-14 — Shadow DOM, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 309

- **Código:** `    host.setAttribute('data-message-author', 'assistant');`
- **Função:** Compõe o cenário OBS-14 — Shadow DOM, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 310

- **Código:** `    const shadow = host.attachShadow({ mode: 'open' });`
- **Função:** Cria Shadow DOM aberto percorrido pelo observer/dom real.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 311

- **Código:** `    document.body.appendChild(host);`
- **Função:** Compõe o cenário OBS-14 — Shadow DOM, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 312

- **Código:** `    const image = addResultImage(shadow, 'https://cdn.example/shadow-result.png');`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 313

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 314

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 315

- **Código:** `    await expect(pending).resolves.toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 316

- **Código:** `      image,`
- **Função:** Compõe o cenário OBS-14 — Shadow DOM, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 317

- **Código:** `      url: 'https://cdn.example/shadow-result.png',`
- **Função:** Compõe o cenário OBS-14 — Shadow DOM, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 318

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 319

- **Código:** `    expect(observer.getState().responseContainer).toBe(host);`
- **Função:** Observa container adquirido pelo job atual.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 320

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 321

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-14 — Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 322

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 323

- **Código:** `  test('OBS-15: rejeita cópia da entrada dentro do turno do usuário', () => {`
- **Função:** Declara cenário: OBS-15 — input/user clone rejeitado.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 324

- **Código:** `    const onStateChange = jest.fn();`
- **Função:** Compõe o cenário OBS-15 — input/user clone rejeitado, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 325

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 326

- **Código:** `    const observer = createGeminiObserver({ jobId: 'user-clone', onStateChange }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 327

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 328

- **Código:** `    addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 329

- **Código:** `    const userTurn = document.createElement('user-query');`
- **Função:** Cria contexto de turno do usuário que deve bloquear imagem input.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 330

- **Código:** `    document.body.appendChild(userTurn);`
- **Função:** Compõe o cenário OBS-15 — input/user clone rejeitado, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 331

- **Código:** `    addResultImage(userTurn, 'https://cdn.example/cloned-input.png');`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 332

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 333

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 334

- **Código:** `    expect(observer.getState().resultUrl).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 335

- **Código:** `    expect(onStateChange).toHaveBeenCalledWith(`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 336

- **Código:** `      'result_candidate_rejected',`
- **Função:** Compõe o cenário OBS-15 — input/user clone rejeitado, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 337

- **Código:** `      expect.objectContaining({ reason: 'user_turn' })`
- **Função:** Compõe o cenário OBS-15 — input/user clone rejeitado, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 338

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 339

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 340

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-15 — input/user clone rejeitado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 341

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 342

- **Código:** `  test('OBS-16: aceita asset gg-dl órfão somente após evidência de geração', async () => {`
- **Função:** Declara cenário: OBS-16 — gg-dl órfão após geração.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 343

- **Código:** `    addStop();`
- **Função:** Compõe o cenário OBS-16 — gg-dl órfão após geração, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 344

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 345

- **Código:** `    const observer = createGeminiObserver({ jobId: 'generated-fallback' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 346

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 347

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 348

- **Código:** `    const image = addResultImage(`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 349

- **Código:** `      document.body,`
- **Função:** Compõe o cenário OBS-16 — gg-dl órfão após geração, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 350

- **Código:** `      'https://lh3.googleusercontent.com/gg-dl/AUTHENTICATED_RESULT'`
- **Função:** Usa asset Google gerado que pode ser aceito sem owner após geração observada.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 351

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 352

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 353

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 354

- **Código:** `    await expect(pending).resolves.toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 355

- **Código:** `      image,`
- **Função:** Compõe o cenário OBS-16 — gg-dl órfão após geração, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 356

- **Código:** `      url: 'https://lh3.googleusercontent.com/gg-dl/AUTHENTICATED_RESULT',`
- **Função:** Usa asset Google gerado que pode ser aceito sem owner após geração observada.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 357

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 358

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 359

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-16 — gg-dl órfão após geração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 360

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 361

- **Código:** `  test('OBS-17: preview reconstruído do anexo continua em quarentena durante a geração', () => {`
- **Função:** Declara cenário: OBS-17 — attachment reconstruído em quarentena.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 362

- **Código:** `    const onStateChange = jest.fn();`
- **Função:** Compõe o cenário OBS-17 — attachment reconstruído em quarentena, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 363

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 364

- **Código:** `    const observer = createGeminiObserver({`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 365

- **Código:** `      jobId: 'attachment-preview-rebuilt',`
- **Função:** Compõe o cenário OBS-17 — attachment reconstruído em quarentena, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 366

- **Código:** `      onStateChange,`
- **Função:** Compõe o cenário OBS-17 — attachment reconstruído em quarentena, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 367

- **Código:** `    }).start();`
- **Função:** Inicia MutationObserver, registry, inspeção inicial e timer periódico.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 368

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 369

- **Código:** `    addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 370

- **Código:** `    const host = document.createElement('section');`
- **Função:** Compõe o cenário OBS-17 — attachment reconstruído em quarentena, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 371

- **Código:** `    const shadow = host.attachShadow({ mode: 'open' });`
- **Função:** Cria Shadow DOM aberto percorrido pelo observer/dom real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 372

- **Código:** `    const preview = document.createElement('file-preview');`
- **Função:** Cria estrutura de attachment a ser quarantined.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 373

- **Código:** `    const image = addResultImage(preview, 'blob:https://gemini.google.com/rebuilt-input');`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 374

- **Código:** `    shadow.appendChild(preview);`
- **Função:** Compõe o cenário OBS-17 — attachment reconstruído em quarentena, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 375

- **Código:** `    document.body.appendChild(host);`
- **Função:** Compõe o cenário OBS-17 — attachment reconstruído em quarentena, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 376

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 377

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 378

- **Código:** `    expect(observer.getState().resultUrl).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 379

- **Código:** `    expect(onStateChange).toHaveBeenCalledWith(`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 380

- **Código:** `      'result_candidate_rejected',`
- **Função:** Compõe o cenário OBS-17 — attachment reconstruído em quarentena, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 381

- **Código:** `      expect.objectContaining({ reason: 'attachment_preview' })`
- **Função:** Compõe o cenário OBS-17 — attachment reconstruído em quarentena, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 382

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 383

- **Código:** `    expect(image.isConnected).toBe(true);`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 384

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 385

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-17 — attachment reconstruído em quarentena.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 386

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 387

- **Código:** `  test('OBS-18: wrapper user ancestral não invalida model turn com autoria explícita', async () => {`
- **Função:** Declara cenário: OBS-18 — wrapper user com autoria model.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 388

- **Código:** `    const onStateChange = jest.fn();`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 389

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 390

- **Código:** `    const observer = createGeminiObserver({`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 391

- **Código:** `      jobId: 'outer-user-wrapper',`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 392

- **Código:** `      onStateChange,`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 393

- **Código:** `    }).start();`
- **Função:** Inicia MutationObserver, registry, inspeção inicial e timer periódico.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 394

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 395

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 396

- **Código:** `    const outer = document.createElement('div');`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 397

- **Código:** `    outer.className = 'user-query-container';`
- **Função:** Cria contexto de turno do usuário que deve bloquear imagem input.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 398

- **Código:** `    const response = document.createElement('model-response');`
- **Função:** Materializa elemento semântico de resposta do modelo.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 399

- **Código:** `    response.setAttribute('data-message-author', 'model');`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 400

- **Código:** `    outer.appendChild(response);`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 401

- **Código:** `    document.body.appendChild(outer);`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 402

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 403

- **Código:** `    const image = addResultImage(`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 404

- **Código:** `      response,`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 405

- **Código:** `      'https://lh3.googleusercontent.com/gg-dl/outer-user-generated'`
- **Função:** Usa asset Google gerado que pode ser aceito sem owner após geração observada.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 406

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 407

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 408

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 409

- **Código:** `    await expect(pending).resolves.toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 410

- **Código:** `      image,`
- **Função:** Compõe o cenário OBS-18 — wrapper user com autoria model, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 411

- **Código:** `      url: 'https://lh3.googleusercontent.com/gg-dl/outer-user-generated',`
- **Função:** Usa asset Google gerado que pode ser aceito sem owner após geração observada.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 412

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 413

- **Código:** `    expect(observer.getState().responseContainer).toBe(response);`
- **Função:** Observa container adquirido pelo job atual.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 414

- **Código:** `    expect(onStateChange.mock.calls.map(call => call[0])).toContain('result_candidate_accepted');`
- **Função:** Prova telemetria de candidato aceito.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 415

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 416

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-18 — wrapper user com autoria model.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 417

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 418

- **Código:** `  test('OBS-19: wrapper estrito aninhado não invalida ownership do model turn novo', async () => {`
- **Função:** Declara cenário: OBS-19 — wrapper estrito aninhado.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 419

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 420

- **Código:** `    const observer = createGeminiObserver({ jobId: 'nested-model-wrapper' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 421

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 422

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 423

- **Código:** `    const response = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 424

- **Código:** `    const nested = document.createElement('div');`
- **Função:** Compõe o cenário OBS-19 — wrapper estrito aninhado, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 425

- **Código:** `    nested.className = 'model-response-text';`
- **Função:** Materializa elemento semântico de resposta do modelo.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 426

- **Código:** `    response.appendChild(nested);`
- **Função:** Compõe o cenário OBS-19 — wrapper estrito aninhado, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 427

- **Código:** `    const image = addResultImage(`
- **Função:** Adiciona imagem candidata ao resultado.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 428

- **Código:** `      nested,`
- **Função:** Compõe o cenário OBS-19 — wrapper estrito aninhado, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 429

- **Código:** `      'https://lh3.googleusercontent.com/rd-gg-dl/nested-generated'`
- **Função:** Usa asset Google gerado que pode ser aceito sem owner após geração observada.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 430

- **Código:** `    );`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 431

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 432

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 433

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 434

- **Código:** `    await expect(pending).resolves.toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 435

- **Código:** `      image,`
- **Função:** Compõe o cenário OBS-19 — wrapper estrito aninhado, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 436

- **Código:** `      url: 'https://lh3.googleusercontent.com/rd-gg-dl/nested-generated',`
- **Função:** Usa asset Google gerado que pode ser aceito sem owner após geração observada.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 437

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 438

- **Código:** `    expect(response.contains(observer.getState().responseContainer)).toBe(true);`
- **Função:** Observa container adquirido pelo job atual.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 439

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 440

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-19 — wrapper estrito aninhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 441

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 442

- **Código:** `  test('OBS-20: imagem remota é reavaliada quando o evento load completa dimensões', async () => {`
- **Função:** Declara cenário: OBS-20 — load remoto reavalia mídia.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 443

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 444

- **Código:** `    const observer = createGeminiObserver({ jobId: 'result-load-reinspect' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 445

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 446

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 447

- **Código:** `    const response = addResponse();`
- **Função:** Adiciona novo/antigo model response ao DOM.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 448

- **Código:** `    const image = document.createElement('img');`
- **Função:** Compõe o cenário OBS-20 — load remoto reavalia mídia, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 449

- **Código:** `    image.src = 'https://cdn.example/delayed-result.png';`
- **Função:** Compõe o cenário OBS-20 — load remoto reavalia mídia, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 450

- **Código:** `    Object.defineProperty(image, 'naturalWidth', { value: 0, configurable: true });`
- **Função:** Fixa dimensões naturais usadas na validação da mídia.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 451

- **Código:** `    Object.defineProperty(image, 'naturalHeight', { value: 0, configurable: true });`
- **Função:** Fixa dimensões naturais usadas na validação da mídia.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 452

- **Código:** `    Object.defineProperty(image, 'complete', { value: false, configurable: true });`
- **Função:** Controla estado de carregamento da imagem.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 453

- **Código:** `    response.appendChild(image);`
- **Função:** Compõe o cenário OBS-20 — load remoto reavalia mídia, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 454

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 455

- **Código:** `    observer.inspect();`
- **Função:** Força inspeção síncrona do estado DOM atual.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 456

- **Código:** `    expect(observer.getState().resultUrl).toBeNull();`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 457

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 458

- **Código:** `    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });`
- **Função:** Fixa dimensões naturais usadas na validação da mídia.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 459

- **Código:** `    Object.defineProperty(image, 'naturalHeight', { value: 1600, configurable: true });`
- **Função:** Fixa dimensões naturais usadas na validação da mídia.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 460

- **Código:** `    Object.defineProperty(image, 'complete', { value: true, configurable: true });`
- **Função:** Controla estado de carregamento da imagem.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 461

- **Código:** `    image.dispatchEvent(new Event('load'));`
- **Função:** Dispara load para reavaliar imagem remota após dimensões aparecerem.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 462

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 463

- **Código:** `    await flushMutations();`
- **Função:** Permite execução de callbacks agendados/coalescidos.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 464

- **Código:** `    await expect(pending).resolves.toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 465

- **Código:** `      image,`
- **Função:** Compõe o cenário OBS-20 — load remoto reavalia mídia, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 466

- **Código:** `      url: 'https://cdn.example/delayed-result.png',`
- **Função:** Compõe o cenário OBS-20 — load remoto reavalia mídia, preparando, executando ou verificando o observer real.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 467

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 468

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 469

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** OBS-20 — load remoto reavalia mídia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 470

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 471

- **Código:** `  test('PR6: seleção manual resolve a mesma Promise de resultado', async () => {`
- **Função:** Declara cenário: PR6 — seleção manual resolve result waiter.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 472

- **Código:** `    const { createGeminiObserver } = loadObserver();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 473

- **Código:** `    const observer = createGeminiObserver({ jobId: 'manual-result' }).start();`
- **Função:** Instancia observer real com jobId e overrides do cenário.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 474

- **Código:** `    const pending = observer.waitForResult(1000);`
- **Função:** Abre waiter real de resultado com timeout controlado.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 475

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 476

- **Código:** `    expect(observer.acceptResult(null, 'blob:https://gemini.google.com/manual-picked')).toBe(true);`
- **Função:** Entrega resultado manual diretamente ao mesmo state/waiter do observer.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 477

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 478

- **Código:** `    await expect(pending).resolves.toEqual({`
- **Função:** Assertion focal do contrato.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 479

- **Código:** `      image: null,`
- **Função:** Compõe o cenário PR6 — seleção manual resolve result waiter, preparando, executando ou verificando o observer real.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 480

- **Código:** `      url: 'blob:https://gemini.google.com/manual-picked',`
- **Função:** Compõe o cenário PR6 — seleção manual resolve result waiter, preparando, executando ou verificando o observer real.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 481

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 482

- **Código:** `    observer.stop();`
- **Função:** Executa cleanup real, removendo observers/listeners/timers/registry e rejeitando waiters.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 483

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 484

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** PR6 — seleção manual resolve result waiter.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 485

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 486 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 13. Conclusão documental

Foram documentadas 485 linhas textuais e a posição 486 do newline final. A suíte tem cobertura direta forte de ownership, DOM dinâmico, quarentena e cleanup; as três solicitações ACCEPTED delimitam lifecycle de waiters/registry e o evento terminal de geração ainda sem caso focal.

> **Lifecycle pós-correção:** 183-001, 183-002 e 183-003 estão ACCEPTED. O contrato de coalescing foi limitado ao que a assertion `<= before + 2` realmente demonstra.

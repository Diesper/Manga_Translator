# Bíblia técnica — tests/unit/content-gemini/dom-modules.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `32441920c27f69aef629f33fc6175ff5b48b0859`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest/JSDOM dos módulos reais `selectors.js` e `dom.js`  
> **Linhas textuais:** 162  
> **Posições documentais:** 163

## 1. Papel arquitetural

Esta suíte é a prova unitária direta dos helpers DOM compartilhados pelo subsistema Gemini.

Ela carrega, dentro de `jest.isolateModules`:
- `extension/content/gemini/selectors.js`;
- `extension/content/gemini/dom.js`.

Não usa implementação espelho. As assertions executam a API real que depois é consumida por observer, editor, attachment, quarantine e job-runner.

## 2. Contratos provados

### Seletores críticos

Exige presença semântica em:
- INPUT;
- SEND;
- STOP;
- RESPONSE;
- ERROR.

Isso é um gate de conteúdo, não prova que cada seletor casa com o Gemini real atual.

### Visibilidade

`isElementVisible`:
- aceita retângulo visível;
- rejeita `display:none`;
- rejeita `aria-hidden=true`.

Não cobre `visibility:hidden/collapse`, offset size, clientRects ou exceções.

### Habilitação

`isControlEnabled`:
- aceita botão normal;
- rejeita `disabled=true`;
- rejeita `aria-disabled=true`;
- prova que o helper não muta esses atributos.

### Shadow DOM

`findAllDeep` encontra um botão dentro de ShadowRoot aberto.

### Editor

`getEditableElement` encontra `.ql-editor[contenteditable]` e aceita o próprio editable como root.

### Imagem/ownership básico

Prova:
- promoção de `dataset.src`;
- blacklist para `avatar.png`;
- URL normal aceita;
- imagem dentro de `model-response` é reconhecida como model response.

### Send

Monta Stop, feedback e Send e exige que `findSendButton` retorne o Send semântico.

### Stop visível

Prova que Stop oculto é ignorado e Stop visível é encontrado.

## 3. Limites materiais

A suíte não cobre os caminhos mais arriscados de `findSendButton`:
- candidato semântico oculto;
- segundo passe textual;
- fallback geométrico junto ao composer.

Também não cobre falsos positivos da blacklist por substrings amplas, nem ownership de user turn/composer diretamente neste arquivo.

## 4. Matriz de evidência

| Propriedade | Classificação |
|---|---|
| módulos reais carregados | ✅ PROVADO DIRETAMENTE |
| seletores contêm tokens críticos | ✅ PROVADO DIRETAMENTE |
| display:none/aria-hidden | ✅ PROVADO DIRETAMENTE |
| disabled/aria-disabled | ✅ PROVADO DIRETAMENTE |
| ShadowRoot aberto em findAllDeep | ✅ PROVADO DIRETAMENTE |
| ql-editor/contenteditable | ✅ PROVADO DIRETAMENTE |
| dataset.src + avatar blacklist | ✅ PROVADO DIRETAMENTE |
| model-response ownership | ✅ PROVADO DIRETAMENTE |
| Send semântico vence Stop/feedback | ✅ PROVADO DIRETAMENTE |
| Stop oculto/visível | ✅ PROVADO DIRETAMENTE |
| Send oculto | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback geométrico de Send | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback textual de Send | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| falso positivo de blacklist | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| user turn/composer ownership neste arquivo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| getModelResponseContainer amplo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| isUserTurnImage | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Solicitações ao auditor

### 177-001 — TEST_REQUIRED — OPEN

Adicionar cenários adversariais de `findSendButton`:
- Send semanticamente correto porém oculto;
- botão não-Send próximo ao composer que satisfaz geometria;
- apenas fallback textual;
- múltiplos candidatos stale/visíveis.

**Risco:** click automático em controle errado ou stale.

**Severidade:** HIGH.

### 177-002 — TEST_REQUIRED — OPEN

Parametrizar `isIgnoredGeminiImageSource` com:
- avatar/favicon/emoji/profile reais;
- URL de resultado legítima contendo essas palavras incidentalmente em path/query;
- googleusercontent avatar versus googleusercontent resultado.

**Risco:** resultado legítimo ser ignorado e provocar timeout/fallback manual.

**Severidade:** HIGH.

### 177-003 — TEST_REQUIRED — OPEN

Cobrir diretamente helpers exportados hoje sem assertion focal nesta suíte:
- `closestComposed`;
- `getStrictModelResponseContainer`;
- `getModelResponseContainer`;
- `getUserTurnContainer`;
- `isInsideInputArea`;
- `isUserTurnImage`;
- branches de visibilidade por offset/clientRects/exception.

**Severidade:** NORMAL.

## 6. Fonte integral auditada

```javascript
'use strict';

const path = require('path');

const SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');
const DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');

function loadModules() {
  let selectors;
  let dom;
  jest.isolateModules(() => {
    selectors = require(SELECTORS_PATH);
    dom = require(DOM_PATH);
  });
  return { selectors, dom };
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

describe('gemini/selectors.js + gemini/dom.js', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('centraliza seletores críticos de input, send, stop, response e error', () => {
    const { selectors } = loadModules();

    expect(selectors.SELECTORS.INPUT).toContain('contenteditable');
    expect(selectors.SELECTORS.SEND).toContain('send-button');
    expect(selectors.SELECTORS.STOP).toMatch(/Stop|stop-generating/);
    expect(selectors.SELECTORS.RESPONSE).toContain('model-response');
    expect(selectors.SELECTORS.ERROR).toContain('[role="alert"]');
  });

  test('isElementVisible rejeita display:none, aria-hidden e aceita retângulo visível', () => {
    const { dom } = loadModules();
    const element = document.createElement('button');
    document.body.appendChild(element);
    visibleRect(element);

    expect(dom.isElementVisible(element)).toBe(true);

    element.style.display = 'none';
    expect(dom.isElementVisible(element)).toBe(false);

    element.style.display = '';
    element.setAttribute('aria-hidden', 'true');
    expect(dom.isElementVisible(element)).toBe(false);
  });

  test('isControlEnabled respeita disabled e aria-disabled sem mutar o controle', () => {
    const { dom } = loadModules();
    const button = document.createElement('button');

    expect(dom.isControlEnabled(button)).toBe(true);

    button.disabled = true;
    expect(dom.isControlEnabled(button)).toBe(false);
    expect(button.disabled).toBe(true);

    button.disabled = false;
    button.setAttribute('aria-disabled', 'true');
    expect(dom.isControlEnabled(button)).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  test('findAllDeep atravessa shadow roots sem depender de splice textual do monólito', () => {
    const { dom } = loadModules();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const nested = document.createElement('button');
    nested.setAttribute('data-test-id', 'inside-shadow');
    shadow.appendChild(nested);

    const found = dom.findAllDeep(document.body, element =>
      element.getAttribute && element.getAttribute('data-test-id') === 'inside-shadow'
    );

    expect(found).toEqual([nested]);
  });

  test('getEditableElement preserva a semântica histórica de ql-editor/contenteditable', () => {
    const { dom } = loadModules();
    const root = document.createElement('rich-textarea');
    const editable = document.createElement('div');
    editable.className = 'ql-editor';
    editable.setAttribute('contenteditable', 'true');
    root.appendChild(editable);

    expect(dom.getEditableElement(root)).toBe(editable);
    expect(dom.getEditableElement(editable)).toBe(editable);
  });

  test('helpers de imagem preservam source, blacklist e ownership por resposta do modelo', () => {
    const { dom } = loadModules();
    const response = document.createElement('model-response');
    const img = document.createElement('img');
    img.dataset.src = 'https://cdn.example/result.png';
    response.appendChild(img);
    document.body.appendChild(response);

    expect(dom.getImageSource(img)).toContain('https://cdn.example/result.png');
    expect(dom.isIgnoredGeminiImageSource('https://example.com/avatar.png')).toBe(true);
    expect(dom.isIgnoredGeminiImageSource('https://cdn.example/result.png')).toBe(false);
    expect(dom.isModelResponseImage(img)).toBe(true);
  });

  test('findSendButton prefere candidato semântico e ignora stop/feedback', () => {
    const { dom } = loadModules();

    const stop = document.createElement('button');
    stop.setAttribute('aria-label', 'Stop generating');
    document.body.appendChild(stop);

    const feedback = document.createElement('button');
    feedback.setAttribute('aria-label', 'Send feedback');
    document.body.appendChild(feedback);

    const send = document.createElement('button');
    send.setAttribute('aria-label', 'Send message');
    document.body.appendChild(send);

    expect(dom.findSendButton(document.body)).toBe(send);
  });

  test('findVisibleStopButton ignora nó Stop oculto', () => {
    const { dom } = loadModules();

    const hidden = document.createElement('button');
    hidden.setAttribute('aria-label', 'Stop');
    hidden.style.display = 'none';
    visibleRect(hidden);
    document.body.appendChild(hidden);

    expect(dom.findVisibleStopButton(document)).toBeNull();

    const visible = document.createElement('button');
    visible.setAttribute('aria-label', 'Stop');
    visibleRect(visible);
    document.body.appendChild(visible);

    expect(dom.findVisibleStopButton(document)).toBe(visible);
  });
});
```

## 7. Mapa integral

| Linhas | Responsabilidade |
|---:|---|
| 1–6 | imports dos módulos reais |
| 7–16 | loader isolado |
| 17–29 | helper de retângulo visível |
| 30–39 | setup/cleanup |
| 40–49 | seletores |
| 50–65 | visibilidade |
| 66–81 | controle habilitado |
| 82–99 | Shadow DOM |
| 100–113 | editor |
| 114–130 | imagem/blacklist/ownership |
| 131–148 | Send semântico |
| 149–162 | Stop visível |
| posição final | newline final |

## 8. Autoauditoria do AGENTE 17

- [x] reserva exclusiva confirmada;
- [x] state próprio criado;
- [x] source SHA reconfirmado;
- [x] módulo real correlacionado;
- [x] prova direta separada de branches não exercitados;
- [x] fonte integral incorporada exatamente;
- [x] nenhum código/teste externo modificado;
- [x] três solicitações registradas.

**Resultado:** suíte autêntica e útil, mas ainda não protege os dois fallbacks mais perigosos de seleção do botão Send nem falsos positivos da blacklist.

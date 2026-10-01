# Bíblia técnica — tests/unit/content-gemini/editor-submit.test.js

> **Estado documental:** 🟡 CORRIGIDA após ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** ccfa4c881543111b13d0bd8f8198f402039b2233  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de submit Gemini confirmado por Observer  
> **Linhas textuais:** 264  
> **Posições documentais:** 265, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

editor-submit.test.js congela o princípio de segurança do submit: click, Enter ou bridge MAIN são apenas tentativas. O envio só é considerado confirmado quando o Observer real detecta uma transição do Gemini, como editor consumido ou Stop visível.

A suíte carrega selectors/dom/observer/editor reais e exercita submitWithConfirmation contra DOM real do JSDOM.

## 2. SEND-01/SEND-02 — click não é sinônimo de sucesso

SEND-01 esvazia editor no click e exige confirmed=true/reason=editor_consumed/attempt=1. SEND-02 mantém UI inalterada e exige GEMINI_SUBMISSION_NOT_CONFIRMED, preservando prompt. Isso prova a fronteira entre tentativa e confirmação.

## 3. SEND-03/SEND-04 — fallback MAIN

Com Send disabled, a primeira tentativa local não confirma; na segunda, mainWorldFallback é chamado uma vez. Se MAIN apenas retorna true sem transição, SEND-03 ainda falha. Se MAIN monta Stop visível e o Observer inspeciona, SEND-04 confirma reason=stop_visible/attempt=2.

## 4. SEND-05/SEND-06 — estado final de disabled é preservado

SEND-05 exige que, **ao final da operação**, `disabled`, o atributo `disabled` e `aria-disabled` permaneçam com os valores esperados mesmo quando o envio falha. O teste não observa setters/mutações transitórias durante o fluxo, portanto não prova que esses atributos `jamais` foram tocados. SEND-06 mostra o caminho correto: nudge do editor dispara input, a fixture/framework habilita o botão, o click consome o editor e a submissão confirma.

## 5. SEND-07 — cardinalidade e término

Com duas tentativas sem transição, onAttempt deve produzir [1,2], o erro final é GEMINI_SUBMISSION_NOT_CONFIRMED e o caso termina rapidamente. Isso congela maxAttempts e evita loops silenciosos.

## 6. Branches ainda não congelados

submitWithConfirmation reconsulta getEditor/getSendButton após nudge e em cada attempt, permitindo sobreviver a re-render do composer; a suíte sempre devolve os mesmos nós. O primeiro attempt com botão ainda disabled usa pressEnter(editor), mas nenhum caso observa o KeyboardEvent. Se observer.waitForSubmission rejeita com código diferente de GEMINI_SUBMISSION_NOT_CONFIRMED, editor.js relança imediatamente; também não há caso focal.

## 7. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob ccfa4c881543111b13d0bd8f8198f402039b2233. Os sete casos SEND-01..SEND-07 aparecem com ✓ em Node 20.x (109255348388) e Node 22.x (109255348406); global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 8. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| click + editor consumido confirma | SEND-01 | ✅ PROVADO DIRETAMENTE |
| click sem transição não confirma | SEND-02 | ✅ PROVADO DIRETAMENTE |
| MAIN disparado sem transição não confirma | SEND-03 | ✅ PROVADO DIRETAMENTE |
| MAIN + Stop visível confirma | SEND-04 | ✅ PROVADO DIRETAMENTE |
| estado final de disabled/aria-disabled é preservado | SEND-05 | ✅ PROVADO DIRETAMENTE; ausência de mutação transitória não é provada |
| nudge pode habilitar via framework | SEND-06 | ✅ PROVADO DIRETAMENTE |
| exatamente maxAttempts falhos e erro final | SEND-07 | ✅ PROVADO DIRETAMENTE |
| editor/botão substituídos entre tentativas | getters reais, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback local Enter despacha KeyboardEvent correto | branch pressEnter sem assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| erro do Observer com outro code é relançado imediatamente | branch catch real, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 9. Solicitações ao auditor

### 178-001 — TEST_REQUIRED — ACCEPTED — HIGH

Encontrado: submitWithConfirmation reobtém editor e sendButton antes/depois do nudge. Isso existe para tolerar re-render do composer, mas todos os casos retornam os mesmos elementos.

Evidência ausente: primeiro editor/botão desconectados/substituídos após nudge ou entre attempts, getters retornando nós novos; exigir que o módulo use os novos controles e confirme sem mutar os antigos.

Risco: Gemini re-renderiza o composer e o envio continua mirando nó stale, gerando falha ou click incorreto.

### 178-002 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: quando Send continua disabled na primeira tentativa, editor.js usa pressEnter(editor) antes de recorrer a MAIN na segunda. SEND-03 implica essa ordem, mas não observa o KeyboardEvent nem seus campos.

Evidência ausente: listener keydown no editor exigindo key/code Enter, keyCode/which=13, bubbles/cancelable/composed e apenas um dispatch; sem transição deve continuar não confirmado.

Risco: fallback local pode regredir silenciosamente e a suíte continuar passando pelo MAIN/timeout.

### 178-003 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: observer.waitForSubmission que rejeita com code diferente de GEMINI_SUBMISSION_NOT_CONFIRMED é relançado imediatamente. Nenhum caso usa erro alternativo.

Evidência ausente: observer controlado rejeitando, por exemplo, OBSERVER_ABORTED; exigir mesma exceção/código e ausência de tentativas seguintes.

Risco: falhas estruturais do Observer podem ser mascaradas como simples timeout de submit.

## 10. Fonte integral auditada

```javascript
'use strict';

const path = require('path');

const SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');
const DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');
const OBSERVER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/observer.js');
const EDITOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/editor.js');

function loadModules() {
  let observerApi;
  let editorApi;
  jest.isolateModules(() => {
    require(SELECTORS_PATH);
    require(DOM_PATH);
    observerApi = require(OBSERVER_PATH);
    editorApi = require(EDITOR_PATH);
  });
  return { observerApi, editorApi };
}

function visibleRect(element, width = 40, height = 40) {
  element.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0,
    right: width, bottom: height, width, height,
    toJSON() { return this; },
  });
}

function mountEditor(text = 'prompt') {
  const editor = document.createElement('div');
  editor.className = 'ql-editor';
  editor.setAttribute('contenteditable', 'true');
  editor.textContent = text;
  document.body.appendChild(editor);
  return editor;
}

function mountSend({ disabled = false, onClick = null } = {}) {
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Send message');
  button.disabled = disabled;
  visibleRect(button);
  button.addEventListener('click', () => {
    if (typeof onClick === 'function') onClick();
  });
  document.body.appendChild(button);
  return button;
}

function mountStop() {
  const stop = document.createElement('button');
  stop.setAttribute('aria-label', 'Stop generating');
  visibleRect(stop);
  document.body.appendChild(stop);
  return stop;
}

describe('gemini/editor.js — submit confirmado', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    delete window.__mtGeminiObservers;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.__mtGeminiObservers;
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('SEND-01: botão habilitado + editor consumido confirma submission', async () => {
    const { observerApi, editorApi } = loadModules();
    const editor = mountEditor('prompt');
    const button = mountSend({ onClick: () => { editor.textContent = ''; } });
    const observer = observerApi.createGeminiObserver({
      jobId: 'send-01',
      editor,
      getEditor: () => editor,
    }).start();

    await expect(editorApi.submitWithConfirmation({
      observer,
      getEditor: () => editor,
      getSendButton: () => button,
      maxAttempts: 2,
      confirmationTimeoutMs: 250,
      sleep: async () => {},
    })).resolves.toEqual(expect.objectContaining({
      confirmed: true,
      reason: 'editor_consumed',
      attempt: 1,
    }));

    observer.stop();
  });

  test('SEND-02: click sem qualquer transição observável não é confirmado', async () => {
    const { observerApi, editorApi } = loadModules();
    const editor = mountEditor('prompt');
    const button = mountSend();
    const observer = observerApi.createGeminiObserver({
      jobId: 'send-02',
      editor,
      getEditor: () => editor,
    }).start();

    await expect(editorApi.submitWithConfirmation({
      observer,
      getEditor: () => editor,
      getSendButton: () => button,
      maxAttempts: 1,
      confirmationTimeoutMs: 30,
      sleep: async () => {},
    })).rejects.toMatchObject({ code: 'GEMINI_SUBMISSION_NOT_CONFIRMED' });

    expect(editor.textContent).toBe('prompt');
    observer.stop();
  });

  test('SEND-03: fallback MAIN disparado sem mudança da UI continua não confirmado', async () => {
    const { observerApi, editorApi } = loadModules();
    const editor = mountEditor('prompt');
    const button = mountSend({ disabled: true });
    const fallback = jest.fn(async () => true);
    const observer = observerApi.createGeminiObserver({
      jobId: 'send-03',
      editor,
      getEditor: () => editor,
    }).start();

    await expect(editorApi.submitWithConfirmation({
      observer,
      getEditor: () => editor,
      getSendButton: () => button,
      mainWorldFallback: fallback,
      maxAttempts: 2,
      confirmationTimeoutMs: 30,
      sleep: async () => {},
    })).rejects.toMatchObject({ code: 'GEMINI_SUBMISSION_NOT_CONFIRMED' });

    expect(fallback).toHaveBeenCalledTimes(1);
    observer.stop();
  });

  test('SEND-04: fallback MAIN + Stop visível é confirmado pelo observer', async () => {
    const { observerApi, editorApi } = loadModules();
    const editor = mountEditor('prompt');
    const button = mountSend({ disabled: true });
    const observer = observerApi.createGeminiObserver({
      jobId: 'send-04',
      editor,
      getEditor: () => editor,
    }).start();

    const fallback = jest.fn(async () => {
      mountStop();
      observer.inspect();
      return true;
    });

    await expect(editorApi.submitWithConfirmation({
      observer,
      getEditor: () => editor,
      getSendButton: () => button,
      mainWorldFallback: fallback,
      maxAttempts: 2,
      confirmationTimeoutMs: 30,
      sleep: async () => {},
    })).resolves.toEqual(expect.objectContaining({
      confirmed: true,
      reason: 'stop_visible',
      attempt: 2,
    }));

    observer.stop();
  });

  test('SEND-05: controle disabled jamais é alterado à força', async () => {
    const { observerApi, editorApi } = loadModules();
    const editor = mountEditor('prompt');
    const button = mountSend({ disabled: true });
    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('disabled', '');
    const observer = observerApi.createGeminiObserver({
      jobId: 'send-05',
      editor,
      getEditor: () => editor,
    }).start();

    await expect(editorApi.submitWithConfirmation({
      observer,
      getEditor: () => editor,
      getSendButton: () => button,
      mainWorldFallback: async () => true,
      maxAttempts: 2,
      confirmationTimeoutMs: 20,
      sleep: async () => {},
    })).rejects.toMatchObject({ code: 'GEMINI_SUBMISSION_NOT_CONFIRMED' });

    expect(button.disabled).toBe(true);
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    observer.stop();
  });

  test('SEND-06: nudge do editor pode habilitar o botão sem mutação forçada', async () => {
    const { observerApi, editorApi } = loadModules();
    const editor = mountEditor('prompt');
    const button = mountSend({
      disabled: true,
      onClick: () => { editor.textContent = ''; },
    });
    editor.addEventListener('input', () => {
      button.disabled = false;
      button.removeAttribute('disabled');
    });
    const observer = observerApi.createGeminiObserver({
      jobId: 'send-06',
      editor,
      getEditor: () => editor,
    }).start();

    await expect(editorApi.submitWithConfirmation({
      observer,
      getEditor: () => editor,
      getSendButton: () => button,
      maxAttempts: 2,
      confirmationTimeoutMs: 250,
      sleep: async () => {},
    })).resolves.toEqual(expect.objectContaining({
      confirmed: true,
      attempt: 1,
    }));
    expect(button.disabled).toBe(false);
    observer.stop();
  });

  test('SEND-07: exatamente duas tentativas falhas terminam cedo', async () => {
    const { observerApi, editorApi } = loadModules();
    const editor = mountEditor('prompt');
    const button = mountSend();
    const attempts = [];
    const observer = observerApi.createGeminiObserver({
      jobId: 'send-07',
      editor,
      getEditor: () => editor,
    }).start();

    const startedAt = Date.now();
    await expect(editorApi.submitWithConfirmation({
      observer,
      getEditor: () => editor,
      getSendButton: () => button,
      onAttempt: attempt => attempts.push(attempt),
      maxAttempts: 2,
      confirmationTimeoutMs: 30,
      sleep: async () => {},
    })).rejects.toMatchObject({ code: 'GEMINI_SUBMISSION_NOT_CONFIRMED' });

    expect(attempts).toEqual([1, 2]);
    expect(Date.now() - startedAt).toBeLessThan(1000);
    observer.stop();
  });
});
```

## 11. Auditoria linha a linha

### Linha 001

- **Código:** `'use strict';`
- **Função:** Ativa strict mode.
- **Contexto:** imports e paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports e paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const path = require('path');`
- **Função:** Importa path para resolver módulos reais.
- **Contexto:** imports e paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports e paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `const SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');`
- **Função:** Resolve selectors.js, dom.js, observer.js ou editor.js reais.
- **Contexto:** imports e paths.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte aos módulos reais.

### Linha 006

- **Código:** `const DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');`
- **Função:** Resolve selectors.js, dom.js, observer.js ou editor.js reais.
- **Contexto:** imports e paths.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte aos módulos reais.

### Linha 007

- **Código:** `const OBSERVER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/observer.js');`
- **Função:** Resolve selectors.js, dom.js, observer.js ou editor.js reais.
- **Contexto:** imports e paths.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte aos módulos reais.

### Linha 008

- **Código:** `const EDITOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/editor.js');`
- **Função:** Resolve selectors.js, dom.js, observer.js ou editor.js reais.
- **Contexto:** imports e paths.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte aos módulos reais.

### Linha 009

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `function loadModules() {`
- **Função:** Carrega os quatro módulos reais em isolamento Jest e devolve observer/editor APIs.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `  let observerApi;`
- **Função:** Compõe o cenário loader de selectors/dom/observer/editor, preparando ou verificando editor/observer reais.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `  let editorApi;`
- **Função:** Compõe o cenário loader de selectors/dom/observer/editor, preparando ou verificando editor/observer reais.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Compõe o cenário loader de selectors/dom/observer/editor, preparando ou verificando editor/observer reais.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `    require(SELECTORS_PATH);`
- **Função:** Carrega selectors reais.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte aos módulos reais.

### Linha 015

- **Código:** `    require(DOM_PATH);`
- **Função:** Carrega dom.js real.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte aos módulos reais.

### Linha 016

- **Código:** `    observerApi = require(OBSERVER_PATH);`
- **Função:** Carrega observer.js real.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte aos módulos reais.

### Linha 017

- **Código:** `    editorApi = require(EDITOR_PATH);`
- **Função:** Carrega editor.js real.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — liga a suíte aos módulos reais.

### Linha 018

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `  return { observerApi, editorApi };`
- **Função:** Compõe o cenário loader de selectors/dom/observer/editor, preparando ou verificando editor/observer reais.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** loader de selectors/dom/observer/editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `function visibleRect(element, width = 40, height = 40) {`
- **Função:** Torna controle geometricamente visível para os seletores do DOM.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `  element.getBoundingClientRect = () => ({`
- **Função:** Fornece retângulo determinístico.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `    x: 0, y: 0, top: 0, left: 0,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando editor/observer reais.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `    right: width, bottom: height, width, height,`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando editor/observer reais.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `    toJSON() { return this; },`
- **Função:** Compõe o cenário helper de visibilidade, preparando ou verificando editor/observer reais.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helper de visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `function mountEditor(text = 'prompt') {`
- **Função:** Cria editor ql-editor contenteditable com texto inicial.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `  const editor = document.createElement('div');`
- **Função:** Compõe o cenário fixture do editor, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `  editor.className = 'ql-editor';`
- **Função:** Usa classe reconhecida pelo DOM Gemini.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `  editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca elemento como editor ativo.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `  editor.textContent = text;`
- **Função:** Define prompt inicial usado pelo Observer para detectar consumo.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `  document.body.appendChild(editor);`
- **Função:** Compõe o cenário fixture do editor, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `  return editor;`
- **Função:** Compõe o cenário fixture do editor, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `function mountSend({ disabled = false, onClick = null } = {}) {`
- **Função:** Cria botão Send opcionalmente disabled e com callback de click.
- **Contexto:** fixture do editor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `  const button = document.createElement('button');`
- **Função:** Compõe o cenário estrutura final, preparando ou verificando editor/observer reais.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `  button.setAttribute('aria-label', 'Send message');`
- **Função:** Marca semanticamente o botão como Send.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `  button.disabled = disabled;`
- **Função:** Controla estado enabled/disabled sem hack posterior.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `  visibleRect(button);`
- **Função:** Compõe o cenário fixture do botão Send, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `  button.addEventListener('click', () => {`
- **Função:** Permite à fixture simular transição observável após click.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `    if (typeof onClick === 'function') onClick();`
- **Função:** Compõe o cenário fixture do botão Send, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `  document.body.appendChild(button);`
- **Função:** Compõe o cenário fixture do botão Send, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `  return button;`
- **Função:** Compõe o cenário fixture do botão Send, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `function mountStop() {`
- **Função:** Cria botão Stop visível reconhecido pelo Observer.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `  const stop = document.createElement('button');`
- **Função:** Compõe o cenário fixture do botão Send, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `  stop.setAttribute('aria-label', 'Stop generating');`
- **Função:** Fixa semântica do controle de geração em andamento.
- **Contexto:** fixture do botão Send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `  visibleRect(stop);`
- **Função:** Compõe o cenário estrutura final, preparando ou verificando editor/observer reais.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `  document.body.appendChild(stop);`
- **Função:** Compõe o cenário fixture do botão Stop, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do botão Stop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `  return stop;`
- **Função:** Compõe o cenário fixture do botão Stop, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do botão Stop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** fixture do botão Stop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture do botão Stop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `describe('gemini/editor.js — submit confirmado', () => {`
- **Função:** Abre suíte focal de submit confirmado.
- **Contexto:** fixture do botão Stop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `  beforeEach(() => {`
- **Função:** Reseta DOM e registry de observers.
- **Contexto:** fixture do botão Stop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário fixture do botão Stop, preparando ou verificando editor/observer reais.
- **Contexto:** fixture do botão Stop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `    delete window.__mtGeminiObservers;`
- **Função:** Remove registry global de Observer anterior.
- **Contexto:** fixture do botão Stop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `  afterEach(() => {`
- **Função:** Restaura mocks, registry e DOM.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Compõe o cenário setup/teardown, preparando ou verificando editor/observer reais.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `    delete window.__mtGeminiObservers;`
- **Função:** Remove registry global de Observer anterior.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário setup/teardown, preparando ou verificando editor/observer reais.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `  test('SEND-01: botão habilitado + editor consumido confirma submission', async () => {`
- **Função:** Declara cenário: SEND-01 — confirmação por editor consumido.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `    const { observerApi, editorApi } = loadModules();`
- **Função:** Carrega editor/observer reais para o caso.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `    const editor = mountEditor('prompt');`
- **Função:** Monta editor conectado com prompt.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `    const button = mountSend({ onClick: () => { editor.textContent = ''; } });`
- **Função:** Monta botão Send com estado/callback do cenário.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `    const observer = observerApi.createGeminiObserver({`
- **Função:** Instancia Observer real sobre editor/job.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa editor/observer reais; assertions subsequentes fixam o resultado.

### Linha 076

- **Código:** `      jobId: 'send-01',`
- **Função:** Compõe o cenário SEND-01 — confirmação por editor consumido, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `      editor,`
- **Função:** Compõe o cenário SEND-01 — confirmação por editor consumido, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `    }).start();`
- **Função:** Inicia observação DOM/transições.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `    await expect(editorApi.submitWithConfirmation({`
- **Função:** Executa algoritmo real de submit com até maxAttempts.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 082

- **Código:** `      observer,`
- **Função:** Compõe o cenário SEND-01 — confirmação por editor consumido, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `      getSendButton: () => button,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `      maxAttempts: 2,`
- **Função:** Limita tentativas de envio.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `      confirmationTimeoutMs: 250,`
- **Função:** Configura janela de confirmação do Observer.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `      sleep: async () => {},`
- **Função:** Remove espera artificial do retry/nudge na fixture.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `    })).resolves.toEqual(expect.objectContaining({`
- **Função:** Compõe o cenário SEND-01 — confirmação por editor consumido, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 089

- **Código:** `      confirmed: true,`
- **Função:** Exige confirmação observável, não simples click.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `      reason: 'editor_consumed',`
- **Função:** Exige que o Observer tenha visto o editor ser consumido/esvaziado.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `      attempt: 1,`
- **Função:** Exige sucesso na primeira tentativa.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `    observer.stop();`
- **Função:** Encerra Observer real e limpa recursos.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-01 — confirmação por editor consumido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `  test('SEND-02: click sem qualquer transição observável não é confirmado', async () => {`
- **Função:** Declara cenário: SEND-02 — click sem transição.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `    const { observerApi, editorApi } = loadModules();`
- **Função:** Carrega editor/observer reais para o caso.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `    const editor = mountEditor('prompt');`
- **Função:** Monta editor conectado com prompt.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `    const button = mountSend();`
- **Função:** Monta botão Send com estado/callback do cenário.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** `    const observer = observerApi.createGeminiObserver({`
- **Função:** Instancia Observer real sobre editor/job.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa editor/observer reais; assertions subsequentes fixam o resultado.

### Linha 102

- **Código:** `      jobId: 'send-02',`
- **Função:** Compõe o cenário SEND-02 — click sem transição, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `      editor,`
- **Função:** Compõe o cenário SEND-02 — click sem transição, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `    }).start();`
- **Função:** Inicia observação DOM/transições.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `    await expect(editorApi.submitWithConfirmation({`
- **Função:** Executa algoritmo real de submit com até maxAttempts.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 108

- **Código:** `      observer,`
- **Função:** Compõe o cenário SEND-02 — click sem transição, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `      getSendButton: () => button,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `      maxAttempts: 1,`
- **Função:** Limita tentativas de envio.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `      confirmationTimeoutMs: 30,`
- **Função:** Configura janela de confirmação do Observer.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `      sleep: async () => {},`
- **Função:** Remove espera artificial do retry/nudge na fixture.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `    })).rejects.toMatchObject({ code: 'GEMINI_SUBMISSION_NOT_CONFIRMED' });`
- **Função:** Exige erro canônico quando nenhuma transição observável confirma envio.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 115

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `    expect(editor.textContent).toBe('prompt');`
- **Função:** Prova que click sem transição não alterou artificialmente o editor.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 117

- **Código:** `    observer.stop();`
- **Função:** Encerra Observer real e limpa recursos.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-02 — click sem transição.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `  test('SEND-03: fallback MAIN disparado sem mudança da UI continua não confirmado', async () => {`
- **Função:** Declara cenário: SEND-03 — fallback MAIN sem confirmação.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `    const { observerApi, editorApi } = loadModules();`
- **Função:** Carrega editor/observer reais para o caso.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `    const editor = mountEditor('prompt');`
- **Função:** Monta editor conectado com prompt.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `    const button = mountSend({ disabled: true });`
- **Função:** Monta botão Send com estado/callback do cenário.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `    const fallback = jest.fn(async () => true);`
- **Função:** Cria fallback MAIN observável.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** `    const observer = observerApi.createGeminiObserver({`
- **Função:** Instancia Observer real sobre editor/job.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa editor/observer reais; assertions subsequentes fixam o resultado.

### Linha 126

- **Código:** `      jobId: 'send-03',`
- **Função:** Compõe o cenário SEND-03 — fallback MAIN sem confirmação, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** `      editor,`
- **Função:** Compõe o cenário SEND-03 — fallback MAIN sem confirmação, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `    }).start();`
- **Função:** Inicia observação DOM/transições.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** `    await expect(editorApi.submitWithConfirmation({`
- **Função:** Executa algoritmo real de submit com até maxAttempts.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 132

- **Código:** `      observer,`
- **Função:** Compõe o cenário SEND-03 — fallback MAIN sem confirmação, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** `      getSendButton: () => button,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `      mainWorldFallback: fallback,`
- **Função:** Fornece último recurso executado após tentativa local anterior.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 136

- **Código:** `      maxAttempts: 2,`
- **Função:** Limita tentativas de envio.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `      confirmationTimeoutMs: 30,`
- **Função:** Configura janela de confirmação do Observer.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `      sleep: async () => {},`
- **Função:** Remove espera artificial do retry/nudge na fixture.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `    })).rejects.toMatchObject({ code: 'GEMINI_SUBMISSION_NOT_CONFIRMED' });`
- **Função:** Exige erro canônico quando nenhuma transição observável confirma envio.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 140

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `    expect(fallback).toHaveBeenCalledTimes(1);`
- **Função:** Prova que MAIN foi acionado apenas uma vez.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 142

- **Código:** `    observer.stop();`
- **Função:** Encerra Observer real e limpa recursos.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-03 — fallback MAIN sem confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `  test('SEND-04: fallback MAIN + Stop visível é confirmado pelo observer', async () => {`
- **Função:** Declara cenário: SEND-04 — MAIN + Stop visível.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `    const { observerApi, editorApi } = loadModules();`
- **Função:** Carrega editor/observer reais para o caso.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** `    const editor = mountEditor('prompt');`
- **Função:** Monta editor conectado com prompt.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `    const button = mountSend({ disabled: true });`
- **Função:** Monta botão Send com estado/callback do cenário.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 149

- **Código:** `    const observer = observerApi.createGeminiObserver({`
- **Função:** Instancia Observer real sobre editor/job.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa editor/observer reais; assertions subsequentes fixam o resultado.

### Linha 150

- **Código:** `      jobId: 'send-04',`
- **Função:** Compõe o cenário SEND-04 — MAIN + Stop visível, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** `      editor,`
- **Função:** Compõe o cenário SEND-04 — MAIN + Stop visível, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `    }).start();`
- **Função:** Inicia observação DOM/transições.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** `    const fallback = jest.fn(async () => {`
- **Função:** Cria fallback MAIN observável.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `      mountStop();`
- **Função:** Monta Stop visível para gerar evidência de submission.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `      observer.inspect();`
- **Função:** Força inspeção imediata após Stop surgir.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `      return true;`
- **Função:** Compõe o cenário SEND-04 — MAIN + Stop visível, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `    await expect(editorApi.submitWithConfirmation({`
- **Função:** Executa algoritmo real de submit com até maxAttempts.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 162

- **Código:** `      observer,`
- **Função:** Compõe o cenário SEND-04 — MAIN + Stop visível, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `      getSendButton: () => button,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `      mainWorldFallback: fallback,`
- **Função:** Fornece último recurso executado após tentativa local anterior.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `      maxAttempts: 2,`
- **Função:** Limita tentativas de envio.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** `      confirmationTimeoutMs: 30,`
- **Função:** Configura janela de confirmação do Observer.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `      sleep: async () => {},`
- **Função:** Remove espera artificial do retry/nudge na fixture.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `    })).resolves.toEqual(expect.objectContaining({`
- **Função:** Compõe o cenário SEND-04 — MAIN + Stop visível, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 170

- **Código:** `      confirmed: true,`
- **Função:** Exige confirmação observável, não simples click.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `      reason: 'stop_visible',`
- **Função:** Exige confirmação baseada em Stop visível.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** `      attempt: 2,`
- **Função:** Exige que confirmação via MAIN ocorra na segunda tentativa.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 175

- **Código:** `    observer.stop();`
- **Função:** Encerra Observer real e limpa recursos.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-04 — MAIN + Stop visível.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 177

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** `  test('SEND-05: controle disabled jamais é alterado à força', async () => {`
- **Função:** Declara cenário: SEND-05 — disabled não é mutado.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 179

- **Código:** `    const { observerApi, editorApi } = loadModules();`
- **Função:** Carrega editor/observer reais para o caso.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** `    const editor = mountEditor('prompt');`
- **Função:** Monta editor conectado com prompt.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** `    const button = mountSend({ disabled: true });`
- **Função:** Monta botão Send com estado/callback do cenário.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `    button.setAttribute('aria-disabled', 'true');`
- **Função:** Mantém estado acessível disabled para provar ausência de mutação forçada.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `    button.setAttribute('disabled', '');`
- **Função:** Compõe o cenário SEND-05 — disabled não é mutado, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `    const observer = observerApi.createGeminiObserver({`
- **Função:** Instancia Observer real sobre editor/job.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa editor/observer reais; assertions subsequentes fixam o resultado.

### Linha 185

- **Código:** `      jobId: 'send-05',`
- **Função:** Compõe o cenário SEND-05 — disabled não é mutado, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `      editor,`
- **Função:** Compõe o cenário SEND-05 — disabled não é mutado, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 188

- **Código:** `    }).start();`
- **Função:** Inicia observação DOM/transições.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 190

- **Código:** `    await expect(editorApi.submitWithConfirmation({`
- **Função:** Executa algoritmo real de submit com até maxAttempts.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 191

- **Código:** `      observer,`
- **Função:** Compõe o cenário SEND-05 — disabled não é mutado, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `      getSendButton: () => button,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** `      mainWorldFallback: async () => true,`
- **Função:** Fornece último recurso executado após tentativa local anterior.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `      maxAttempts: 2,`
- **Função:** Limita tentativas de envio.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 196

- **Código:** `      confirmationTimeoutMs: 20,`
- **Função:** Configura janela de confirmação do Observer.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `      sleep: async () => {},`
- **Função:** Remove espera artificial do retry/nudge na fixture.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 198

- **Código:** `    })).rejects.toMatchObject({ code: 'GEMINI_SUBMISSION_NOT_CONFIRMED' });`
- **Função:** Exige erro canônico quando nenhuma transição observável confirma envio.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 199

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 200

- **Código:** `    expect(button.disabled).toBe(true);`
- **Função:** Assertion focal do contrato.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 201

- **Código:** `    expect(button.hasAttribute('disabled')).toBe(true);`
- **Função:** Confirma que atributo disabled permanece intacto.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 202

- **Código:** `    expect(button.getAttribute('aria-disabled')).toBe('true');`
- **Função:** Mantém estado acessível disabled para provar ausência de mutação forçada.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 203

- **Código:** `    observer.stop();`
- **Função:** Encerra Observer real e limpa recursos.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 204

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-05 — disabled não é mutado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 205

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `  test('SEND-06: nudge do editor pode habilitar o botão sem mutação forçada', async () => {`
- **Função:** Declara cenário: SEND-06 — nudge habilita controle.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 207

- **Código:** `    const { observerApi, editorApi } = loadModules();`
- **Função:** Carrega editor/observer reais para o caso.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 208

- **Código:** `    const editor = mountEditor('prompt');`
- **Função:** Monta editor conectado com prompt.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 209

- **Código:** `    const button = mountSend({`
- **Função:** Monta botão Send com estado/callback do cenário.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** `      disabled: true,`
- **Função:** Monta controle não habilitado para exercitar nudge/Enter/MAIN.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 211

- **Código:** `      onClick: () => { editor.textContent = ''; },`
- **Função:** Compõe o cenário SEND-06 — nudge habilita controle, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 212

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 213

- **Código:** `    editor.addEventListener('input', () => {`
- **Função:** Faz nudge/input reavaliar framework e habilitar o botão legitimamente.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 214

- **Código:** `      button.disabled = false;`
- **Função:** Compõe o cenário SEND-06 — nudge habilita controle, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 215

- **Código:** `      button.removeAttribute('disabled');`
- **Função:** Fixture simula framework liberando controle após input.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 216

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 217

- **Código:** `    const observer = observerApi.createGeminiObserver({`
- **Função:** Instancia Observer real sobre editor/job.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa editor/observer reais; assertions subsequentes fixam o resultado.

### Linha 218

- **Código:** `      jobId: 'send-06',`
- **Função:** Compõe o cenário SEND-06 — nudge habilita controle, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 219

- **Código:** `      editor,`
- **Função:** Compõe o cenário SEND-06 — nudge habilita controle, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 220

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** `    }).start();`
- **Função:** Inicia observação DOM/transições.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 222

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 223

- **Código:** `    await expect(editorApi.submitWithConfirmation({`
- **Função:** Executa algoritmo real de submit com até maxAttempts.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 224

- **Código:** `      observer,`
- **Função:** Compõe o cenário SEND-06 — nudge habilita controle, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 225

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 226

- **Código:** `      getSendButton: () => button,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `      maxAttempts: 2,`
- **Função:** Limita tentativas de envio.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 228

- **Código:** `      confirmationTimeoutMs: 250,`
- **Função:** Configura janela de confirmação do Observer.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 229

- **Código:** `      sleep: async () => {},`
- **Função:** Remove espera artificial do retry/nudge na fixture.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 230

- **Código:** `    })).resolves.toEqual(expect.objectContaining({`
- **Função:** Compõe o cenário SEND-06 — nudge habilita controle, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 231

- **Código:** `      confirmed: true,`
- **Função:** Exige confirmação observável, não simples click.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 232

- **Código:** `      attempt: 1,`
- **Função:** Exige sucesso na primeira tentativa.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 233

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 234

- **Código:** `    expect(button.disabled).toBe(false);`
- **Função:** Prova habilitação veio da reação da fixture, não de mutação forçada do módulo.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 235

- **Código:** `    observer.stop();`
- **Função:** Encerra Observer real e limpa recursos.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 236

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-06 — nudge habilita controle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 237

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** `  test('SEND-07: exatamente duas tentativas falhas terminam cedo', async () => {`
- **Função:** Declara cenário: SEND-07 — duas tentativas falhas.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 239

- **Código:** `    const { observerApi, editorApi } = loadModules();`
- **Função:** Carrega editor/observer reais para o caso.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 240

- **Código:** `    const editor = mountEditor('prompt');`
- **Função:** Monta editor conectado com prompt.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 241

- **Código:** `    const button = mountSend();`
- **Função:** Monta botão Send com estado/callback do cenário.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 242

- **Código:** `    const attempts = [];`
- **Função:** Coleta callbacks onAttempt.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 243

- **Código:** `    const observer = observerApi.createGeminiObserver({`
- **Função:** Instancia Observer real sobre editor/job.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa editor/observer reais; assertions subsequentes fixam o resultado.

### Linha 244

- **Código:** `      jobId: 'send-07',`
- **Função:** Compõe o cenário SEND-07 — duas tentativas falhas, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `      editor,`
- **Função:** Compõe o cenário SEND-07 — duas tentativas falhas, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 246

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** `    }).start();`
- **Função:** Inicia observação DOM/transições.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 248

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** `    const startedAt = Date.now();`
- **Função:** Mede duração total para detectar loops longos.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 250

- **Código:** `    await expect(editorApi.submitWithConfirmation({`
- **Função:** Executa algoritmo real de submit com até maxAttempts.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 251

- **Código:** `      observer,`
- **Função:** Compõe o cenário SEND-07 — duas tentativas falhas, preparando ou verificando editor/observer reais.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 252

- **Código:** `      getEditor: () => editor,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** `      getSendButton: () => button,`
- **Função:** Fornece getter reconsultado por tentativa/nudge.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 254

- **Código:** `      onAttempt: attempt => attempts.push(attempt),`
- **Função:** Observa número de tentativa antes de cada ciclo.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 255

- **Código:** `      maxAttempts: 2,`
- **Função:** Limita tentativas de envio.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 256

- **Código:** `      confirmationTimeoutMs: 30,`
- **Função:** Configura janela de confirmação do Observer.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 257

- **Código:** `      sleep: async () => {},`
- **Função:** Remove espera artificial do retry/nudge na fixture.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 258

- **Código:** `    })).rejects.toMatchObject({ code: 'GEMINI_SUBMISSION_NOT_CONFIRMED' });`
- **Função:** Exige erro canônico quando nenhuma transição observável confirma envio.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 259

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 260

- **Código:** `    expect(attempts).toEqual([1, 2]);`
- **Função:** Prova exatamente duas tentativas.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 261

- **Código:** `    expect(Date.now() - startedAt).toBeLessThan(1000);`
- **Função:** Prova término cedo sob timeouts curtos e sleep injetado.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 262

- **Código:** `    observer.stop();`
- **Função:** Encerra Observer real e limpa recursos.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 263

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** SEND-07 — duas tentativas falhas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Linha 264

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa do cenário verde sem assertion exclusiva nesta linha.

### Posição 265 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 12. Conclusão documental

Foram documentadas 264 linhas textuais e a posição 265 do newline final. Os sete cenários principais estão diretamente provados no mesmo blob verde em Node 20/22; 178-001/002/003 estão ACCEPTED e continuam registrando re-render de controles, fallback Enter e propagação de erro estrutural do Observer sem permanecer OPEN.

> **Escopo SEND-05:** as assertions provam o estado final dos atributos após `submitWithConfirmation`; não existe observer/spy de mutation que congele ausência de alteração transitória durante toda a execução.

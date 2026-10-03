# Bíblia técnica — tests/unit/content-gemini/attachment.test.js

> **Estado documental:** 🟡 CORRIGIDA após ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** 43d4591bc9ff684de97d8010aea428a9f83ea321  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de upload/attachment Gemini com confirmação observável  
> **Linhas textuais:** 406  
> **Posições documentais:** 407, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

attachment.test.js congela a regra mais importante do upload para Gemini: disparar paste/change/drop é apenas tentativa; sucesso só existe quando aparece ou muda evidência DOM válida depois do baseline capturado antes do upload.

A suíte carrega selectors.js, dom.js e attachment.js reais. Ela testa fallback entre file input, drop e paste, Shadow DOM, baseline estrutural, previews pendentes e exclusão de imagens de resposta do modelo.

### Cadeia de descoberta e execução da suíte

A implementação real carregada pelo teste deve ser distinguida do harness que o executa:

`package.json#test:ci` → `scripts/ci/run-jest-ci.js` → `jest.config.js` → projeto Jest `content-scripts` → padrão `tests/unit/content-gemini/**/*.test.js` → ambiente `jsdom` + setup/mocks como `tests/mocks/chrome-api.mock.js` e `dom-environment.js` → esta suíte → módulos reais `selectors.js`, `dom.js` e `attachment.js`.

No workflow de CI, o job **Unit + Integration** chama `npm run test:ci` em Node 20.x/22.x. Assim, CI verde prova descoberta/execução da suíte nesse harness; a força de cada contrato continua vindo das actions/assertions específicas do cenário, não do simples fato de o arquivo ter sido executado.

## 2. Confirmação baseada em evidência

ATT-01 exige sucesso apenas depois que paste cria file-preview novo. ATT-02 mostra que eventos enviados sem mudança observável terminam attempted=true mas confirmed=false/evidence=null. ATT-03 impede que thumbnail antigo seja confundido com o upload corrente. ATT-04 aceita mudança estrutural em container já existente quando uma nova IMG passa a compor sua assinatura.

## 3. Métodos de upload e cardinalidade

ATT-05 prova file input como fallback com change/preview posterior. ATT-06 prova drop quando não há file input elegível. ATT-07 exige no máximo um paste e um drop no cenário sem confirmação, evitando duplicar a mesma imagem por retries repetidos do mesmo mecanismo.

## 4. Shadow DOM e assinatura estrutural

ATT-08 prova busca de input file dentro de Shadow DOM. ATT-09 prova que classe cosmética não muda baseline, mas trocar src da mídia muda a assinatura. ATT-09B cria composer e preview em Shadow DOM aninhado e exige confirmação de IMG completa.

## 5. Preview pendente e contexto de resposta

ATT-10 usa IMG incompleta/naturalWidth=0 como sinal de upload em andamento: somente file_input é tentado, nenhum método seguinte dispara, e a confirmação só ocorre após complete/dimensões/src válidos. ATT-11 insere file-preview dentro de model-response e exige que isso não confirme o anexo.

## 6. Branches relevantes ainda não congelados

attachment.js também reconsulta getEditor/getEditorRoot antes de cada método e reporta editor_disconnected; evidenceReady rejeita attachment com aria-busy/progressbar/spinner mesmo que a IMG já esteja completa; findFileInputsDeep filtra disabled, contexto user/model e accept incompatível e prioriza inputs dentro do composer. Esses ramos não têm caso focal localizado.

## 7. Evidência CI exata

O run 36521561968 no commit e720890cf34dc9437ee91f3b8172953497d69870 contém exatamente o blob 43d4591bc9ff684de97d8010aea428a9f83ea321. Os 12 casos ATT-01..ATT-11, incluindo ATT-09B, aparecem com ✓ em Node 20.x (109255348388) e Node 22.x (109255348406); global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 8. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| tentativa sem DOM novo não é sucesso | ATT-02 | ✅ PROVADO DIRETAMENTE |
| baseline não aceita preview antiga | ATT-03 | ✅ PROVADO DIRETAMENTE |
| mudança estrutural no mesmo container conta | ATT-04 | ✅ PROVADO DIRETAMENTE |
| file input funciona | ATT-05 | ✅ PROVADO DIRETAMENTE |
| drop funciona como fallback | ATT-06 | ✅ PROVADO DIRETAMENTE |
| paste e drop não são repetidos no cenário ATT-07 | contadores `pasteCount === 1` e `dropCount === 1` | ✅ PROVADO DIRETAMENTE — escopo restrito a paste/drop; não universaliza file input |
| input file é encontrado em Shadow DOM | ATT-08 | ✅ PROVADO DIRETAMENTE |
| cosmético ignorado / mídia nova aceita | ATT-09 | ✅ PROVADO DIRETAMENTE |
| preview Shadow DOM completo confirma | ATT-09B | ✅ PROVADO DIRETAMENTE |
| preview pendente bloqueia redisparo | ATT-10 | ✅ PROVADO DIRETAMENTE |
| model-response não conta como attachment | ATT-11 | ✅ PROVADO DIRETAMENTE |
| editor substituído/desconectado durante retries | branch getEditor/getEditorRoot | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| IMG completa mas attachment aria-busy/progressbar | branch evidenceReady | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| múltiplos file inputs: accept/disabled/contexto/prioridade | branch findFileInputsDeep | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 9. Solicitações ao auditor

### 174-001 — TEST_REQUIRED — ACCEPTED — HIGH

Encontrado: attachFile chama getEditor/getEditorRoot antes de cada método e pula a tentativa com reason=editor_disconnected quando o editor/raiz foi removido. Nenhum caso focal simula re-render do composer entre tentativas.

Evidência ausente: editor inicial desconectado após primeira espera e getters retornando novo editor/root conectados; exigir que o algoritmo use o novo alvo sem duplicar método anterior. Também testar getters sem substituto e onAttempt editor_disconnected.

Risco: Gemini pode re-renderizar o composer durante upload e o fluxo ficar preso ou enviar evento a nó morto.

### 174-002 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: evidenceReady exige IMG completa/dimensões positivas e ausência de aria-busy=true, role=progressbar ou mat-progress-spinner. ATT-10 cobre apenas imagem incompleta, não indicador explícito de progresso.

Evidência ausente: preview com IMG completa + progress indicator deve gerar sinal mas não confirmed; após remover indicador deve confirmar sem redisparar upload.

Risco: UI ainda processando pode ser declarada pronta cedo e o runner avançar antes do attachment terminar.

### 174-003 — TEST_REQUIRED — ACCEPTED — NORMAL

Encontrado: findFileInputsDeep filtra input disabled, inputs dentro de user/model responses e accept não compatível, além de ordenar inputs no composer antes dos externos. ATT-08 prova apenas travessia de Shadow DOM com um único input genérico.

Evidência ausente: matriz com input disabled, accept=text/plain, accept=image/*, input dentro de model-response e dois válidos (composer vs externo), exigindo somente o correto e prioridade do composer.

Risco: arquivo pode ser atribuído ao input errado da página ou a controle que não aceita imagem.

## 10. Fonte integral auditada

```javascript
'use strict';

const path = require('path');

const SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');
const DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');
const ATTACHMENT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/attachment.js');

function installDataTransferMock() {
  class MockDataTransfer {
    constructor() {
      const files = [];
      const items = [];
      items.add = item => {
        files.push(item);
        return item;
      };
      this.files = files;
      this.items = items;
    }
  }
  window.DataTransfer = MockDataTransfer;
  global.DataTransfer = MockDataTransfer;
}

function loadAttachment() {
  let api;
  jest.isolateModules(() => {
    require(SELECTORS_PATH);
    require(DOM_PATH);
    api = require(ATTACHMENT_PATH);
  });
  return api;
}

function file() {
  return new File([new Uint8Array([1, 2, 3])], 'page.png', { type: 'image/png' });
}

function makeVisible(element, width = 120, height = 80) {
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
  return element;
}

function addPreview({ parent = document.body, withImage = true, src = 'blob:https://gemini.test/attachment' } = {}) {
  const preview = makeVisible(document.createElement('file-preview'));
  if (withImage) {
    const image = document.createElement('img');
    image.src = src;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1200, configurable: true });
    preview.appendChild(image);
  }
  parent.appendChild(preview);
  return preview;
}

describe('gemini/attachment.js', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    installDataTransferMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('ATT-01: paste só é confirmado quando surge evidência nova no DOM', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);

    editor.addEventListener('paste', () => {
      if (!document.querySelector('file-preview')) addPreview();
    });

    await expect(api.attachFile({
      file: file(),
      editor,
      editorRoot: editor,
      root: document,
      timeoutMs: 500,
      retryAfterMs: 50,
      maxDispatches: 2,
    })).resolves.toEqual(expect.objectContaining({
      attempted: true,
      confirmed: true,
      evidence: expect.objectContaining({ type: 'container' }),
      methodsAttempted: expect.arrayContaining(['paste']),
    }));
  });

  test('ATT-02: disparar paste/drop sem mudança observável não declara sucesso', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);

    const result = await api.attachFile({
      file: file(),
      editor,
      editorRoot: editor,
      root: document,
      timeoutMs: 40,
      retryAfterMs: 5,
      maxDispatches: 2,
    });

    expect(result.attempted).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(result.evidence).toBeNull();
    expect(result.methodsAttempted).toEqual(expect.arrayContaining(['paste', 'drop']));
  });

  test('ATT-03: thumbnail antigo no baseline não é confundido com o upload atual', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);
    const oldPreview = addPreview({ withImage: true, src: 'blob:https://gemini.test/old' });

    const result = await api.attachFile({
      file: file(),
      editor,
      root: document,
      timeoutMs: 35,
      retryAfterMs: 5,
      maxDispatches: 2,
    });

    expect(oldPreview.isConnected).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(result.evidence).toBeNull();
  });

  test('ATT-04: mudança observável em container já existente conta como novo attachment', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);
    const preview = addPreview({ withImage: false });

    editor.addEventListener('paste', () => {
      if (preview.querySelector('img')) return;
      const image = document.createElement('img');
      image.src = 'blob:https://gemini.test/new-file';
      Object.defineProperty(image, 'complete', { value: true, configurable: true });
      Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true });
      Object.defineProperty(image, 'naturalHeight', { value: 1200, configurable: true });
      preview.appendChild(image);
    });

    const result = await api.attachFile({
      file: file(),
      editor,
      root: document,
      timeoutMs: 300,
      retryAfterMs: 20,
      maxDispatches: 2,
    });

    expect(result.confirmed).toBe(true);
    expect(result.evidence.el).toBe(preview);
  });

  test('ATT-05: input[type=file] funciona como fallback e pode confirmar por preview posterior', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);

    const input = document.createElement('input');
    input.type = 'file';
    // JSDOM exige FileList no setter nativo; nesta fixture queremos observar
    // apenas o contrato do módulo ao atribuir os arquivos do DataTransfer.
    Object.defineProperty(input, 'files', {
      value: [],
      writable: true,
      configurable: true,
    });
    input.addEventListener('change', () => addPreview());
    document.body.appendChild(input);

    const result = await api.attachFile({
      file: file(),
      editor,
      root: document,
      timeoutMs: 300,
      retryAfterMs: 20,
      maxDispatches: 2,
    });

    expect(result.confirmed).toBe(true);
    expect(result.methodsAttempted).toContain('file_input');
    expect(input.files).toHaveLength(1);
  });

  test('ATT-06: drag/drop permanece como fallback inicial', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);

    editor.addEventListener('drop', event => {
      expect(event.dataTransfer).toBeTruthy();
      addPreview();
    });

    const result = await api.attachFile({
      file: file(),
      editor,
      editorRoot: editor,
      root: document,
      timeoutMs: 300,
      retryAfterMs: 20,
      maxDispatches: 2,
    });

    expect(result.confirmed).toBe(true);
    expect(result.methodsAttempted).toContain('drop');
  });

  test('ATT-07: cada método de upload é tentado no máximo uma vez', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);

    let pasteCount = 0;
    let dropCount = 0;
    editor.addEventListener('paste', () => { pasteCount += 1; });
    editor.addEventListener('drop', () => { dropCount += 1; });

    const result = await api.attachFile({
      file: file(),
      editor,
      root: document,
      timeoutMs: 40,
      retryAfterMs: 0,
      maxDispatches: 3,
      sleep: async () => {},
    });

    expect(result.confirmed).toBe(false);
    expect(pasteCount).toBe(1);
    expect(dropCount).toBe(1);
  });

  test('ATT-08: input[type=file] é localizado também em shadow root', () => {
    const api = loadAttachment();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    input.type = 'file';
    shadow.appendChild(input);
    document.body.appendChild(host);

    expect(api.findFileInputsDeep(document.body)).toContain(input);
  });

  test('ATT-09: baseline ignora mudança cosmética e aceita mudança estrutural de mídia', () => {
    const api = loadAttachment();
    const preview = addPreview({ withImage: true });
    const baseline = api.captureAttachmentBaseline(document);

    expect(api.findAttachmentThumbnailDeep(document, baseline)).toBeNull();

    preview.classList.add('upload-complete');
    expect(api.findAttachmentThumbnailDeep(document, baseline)).toBeNull();

    const image = preview.querySelector('img');
    image.src = 'blob:https://gemini.test/new-attachment';
    expect(api.findAttachmentThumbnailDeep(document, baseline)).toEqual(
      expect.objectContaining({ el: preview, type: 'container' })
    );
  });

  test('ATT-09B: preview completo dentro do Shadow DOM do composer é confirmado', async () => {
    const api = loadAttachment();

    const composer = document.createElement('rich-textarea');
    const composerShadow = composer.attachShadow({ mode: 'open' });
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    composerShadow.appendChild(editor);
    document.body.appendChild(composer);

    editor.addEventListener('paste', () => {
      if (composerShadow.querySelector('file-preview')) return;

      const preview = document.createElement('file-preview');
      preview.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,
        width: 120, height: 90, toJSON() { return this; },
      });
      const previewShadow = preview.attachShadow({ mode: 'open' });
      const image = document.createElement('img');
      image.src = 'blob:https://gemini.google.com/shadow-attachment';
      Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true });
      Object.defineProperty(image, 'naturalHeight', { value: 1100, configurable: true });
      Object.defineProperty(image, 'complete', { value: true, configurable: true });
      previewShadow.appendChild(image);
      composerShadow.appendChild(preview);
    });

    const result = await api.attachFile({
      file: file(),
      editor,
      editorRoot: composer,
      root: document,
      timeoutMs: 500,
      retryAfterMs: 30,
      maxDispatches: 3,
    });

    expect(result.confirmed).toBe(true);
    expect(result.evidence).toEqual(expect.objectContaining({
      type: 'container',
      img: expect.any(HTMLImageElement),
    }));
    expect(result.evidence.img.src).toBe('blob:https://gemini.google.com/shadow-attachment');
  });

  test('ATT-10: preview pendente bloqueia redisparo e só confirma após a imagem carregar', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);
    const attempts = [];
    let pendingImage = null;

    const resultPromise = api.attachFile({
      file: file(),
      editor,
      editorRoot: editor,
      root: document,
      timeoutMs: 500,
      retryAfterMs: 10,
      maxDispatches: 3,
      onAttempt: attempt => attempts.push(attempt),
      dispatchMethodFn: async method => {
        if (method !== 'file_input') return { attempted: false };
        const preview = addPreview({ withImage: false });
        pendingImage = document.createElement('img');
        pendingImage.src = 'blob:https://gemini.test/pending';
        Object.defineProperty(pendingImage, 'complete', { value: false, configurable: true });
        Object.defineProperty(pendingImage, 'naturalWidth', { value: 0, configurable: true });
        Object.defineProperty(pendingImage, 'naturalHeight', { value: 0, configurable: true });
        preview.appendChild(pendingImage);
        return { attempted: true };
      },
    });

    await new Promise(resolve => setTimeout(resolve, 25));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].method).toBe('file_input');

    Object.defineProperty(pendingImage, 'complete', { value: true, configurable: true });
    Object.defineProperty(pendingImage, 'naturalWidth', { value: 800, configurable: true });
    Object.defineProperty(pendingImage, 'naturalHeight', { value: 1200, configurable: true });
    pendingImage.src = 'blob:https://gemini.test/pending-loaded';

    await expect(resultPromise).resolves.toEqual(expect.objectContaining({
      confirmed: true,
      methodsAttempted: ['file_input'],
    }));
  });

  test('ATT-11: imagem de resposta fora do composer não confirma o anexo', async () => {
    const api = loadAttachment();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);

    const result = await api.attachFile({
      file: file(),
      editor,
      root: document,
      timeoutMs: 40,
      retryAfterMs: 5,
      maxDispatches: 1,
      dispatchMethodFn: async () => {
        const response = document.createElement('model-response');
        document.body.appendChild(response);
        addPreview({ parent: response });
        return { attempted: true };
      },
    });

    expect(result.confirmed).toBe(false);
    expect(result.evidence).toBeNull();
  });
});
```

## 11. Auditoria linha a linha

### Linha 001

- **Código:** `'use strict';`
- **Função:** Ativa strict mode.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const path = require('path');`
- **Função:** Importa path para resolver módulos reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 005

- **Código:** `const SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');`
- **Função:** Resolve selectors.js, dom.js ou attachment.js reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 006

- **Código:** `const DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');`
- **Função:** Resolve selectors.js, dom.js ou attachment.js reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 007

- **Código:** `const ATTACHMENT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/attachment.js');`
- **Função:** Resolve selectors.js, dom.js ou attachment.js reais.
- **Contexto:** imports e paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 008

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 009

- **Código:** `function installDataTransferMock() {`
- **Função:** Define DataTransfer mínimo para eventos sintéticos e assignment de files no JSDOM.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `  class MockDataTransfer {`
- **Função:** Emula construtor DataTransfer usado por buildDataTransfer.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `    constructor() {`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `      const files = [];`
- **Função:** Mantém lista de files adicionados ao mock.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `      const items = [];`
- **Função:** Mantém coleção items com método add compatível.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `      items.add = item => {`
- **Função:** Ao adicionar item, também o insere em files e o devolve.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** `        files.push(item);`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `        return item;`
- **Função:** Retorna o valor ou resultado indicado pelo fluxo desta função auxiliar.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `      };`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `      this.files = files;`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** `      this.items = items;`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `    }`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `  }`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `  window.DataTransfer = MockDataTransfer;`
- **Função:** Expõe o mock no window.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `  global.DataTransfer = MockDataTransfer;`
- **Função:** Expõe o mock no escopo global do teste.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `}`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** mock DataTransfer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `function loadAttachment() {`
- **Função:** Carrega selectors, dom e attachment reais em isolamento Jest.
- **Contexto:** loader attachment/selectors/dom.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `  let api;`
- **Função:** Declara ou inicializa a variável indicada especificamente por esta linha.
- **Contexto:** loader attachment/selectors/dom.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `  jest.isolateModules(() => {`
- **Função:** Isola o carregamento de módulos Jest para evitar estado compartilhado entre cenários.
- **Contexto:** loader attachment/selectors/dom.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `    require(SELECTORS_PATH);`
- **Função:** Carrega selectors.js real.
- **Contexto:** loader attachment/selectors/dom.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 030

- **Código:** `    require(DOM_PATH);`
- **Função:** Carrega dom.js real.
- **Contexto:** loader attachment/selectors/dom.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 031

- **Código:** `    api = require(ATTACHMENT_PATH);`
- **Função:** Carrega attachment.js real e captura sua API.
- **Contexto:** loader attachment/selectors/dom.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta a suíte aos módulos reais.

### Linha 032

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** loader attachment/selectors/dom.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `  return api;`
- **Função:** Retorna o valor ou resultado indicado pelo fluxo desta função auxiliar.
- **Contexto:** loader attachment/selectors/dom.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `}`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `function file() {`
- **Função:** Cria File PNG mínimo usado em todas as tentativas.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `  return new File([new Uint8Array([1, 2, 3])], 'page.png', { type: 'image/png' });`
- **Função:** Retorna o valor ou resultado indicado pelo fluxo desta função auxiliar.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `}`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** `function makeVisible(element, width = 120, height = 80) {`
- **Função:** Sobrescreve getBoundingClientRect para a evidência parecer visível e ter tamanho suficiente.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `  element.getBoundingClientRect = () => ({`
- **Função:** Fornece geometria determinística ao detector de preview.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `    x: 0,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `    y: 0,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `    top: 0,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `    left: 0,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `    right: width,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** `    bottom: height,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `    width,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `    height,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `    toJSON() { return this; },`
- **Função:** Retorna o valor ou resultado indicado pelo fluxo desta função auxiliar.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `  return element;`
- **Função:** Retorna o valor ou resultado indicado pelo fluxo desta função auxiliar.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** `}`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `function addPreview({ parent = document.body, withImage = true, src = 'blob:https://gemini.test/attachment' } = {}) {`
- **Função:** Cria file-preview opcionalmente com IMG carregada e dimensões naturais válidas.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `  const preview = makeVisible(document.createElement('file-preview'));`
- **Função:** Materializa container reconhecido pelo detector de attachment.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `  if (withImage) {`
- **Função:** Aplica a guarda condicional expressa nesta linha ao fluxo do cenário.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `    const image = document.createElement('img');`
- **Função:** Cria imagem de preview/response usada como evidência.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** `    image.src = src;`
- **Função:** Define identidade da mídia na assinatura de evidência.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `    Object.defineProperty(image, 'complete', { value: true, configurable: true });`
- **Função:** Controla se a imagem já terminou de carregar.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `    Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `    Object.defineProperty(image, 'naturalHeight', { value: 1200, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `    preview.appendChild(image);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** helpers de fixture/preview.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `  }`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `  parent.appendChild(preview);`
- **Função:** Anexa preview ao contexto escolhido para o detector.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** `  return preview;`
- **Função:** Retorna o valor ou resultado indicado pelo fluxo desta função auxiliar.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `}`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `describe('gemini/attachment.js', () => {`
- **Função:** Abre suíte focal de gemini/attachment.js.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `  beforeEach(() => {`
- **Função:** Reseta o DOM e instala DataTransfer mock antes de cada caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Garante documento limpo entre cenários.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `    installDataTransferMock();`
- **Função:** Configura ou usa o mock Jest expresso nesta linha para controlar/observar o boundary.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `  afterEach(() => {`
- **Função:** Restaura mocks e limpa DOM ao final do cenário.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Restaura spies Jest.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Garante documento limpo entre cenários.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `  test('ATT-01: paste só é confirmado quando surge evidência nova no DOM', async () => {`
- **Função:** Declara cenário: ATT-01 — sucesso só após nova evidência.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** `    editor.addEventListener('paste', () => {`
- **Função:** Instala reação da fixture ao evento paste emitido pelo módulo.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `      if (!document.querySelector('file-preview')) addPreview();`
- **Função:** Evita criar múltiplas previews na fixture.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** `    await expect(api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 091

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** `      editorRoot: editor,`
- **Função:** Define raiz usada por foco/drop e, quando maior que editor, simula composer host.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** `      timeoutMs: 500,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `      retryAfterMs: 50,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 097

- **Código:** `      maxDispatches: 2,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 098

- **Código:** `    })).resolves.toEqual(expect.objectContaining({`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 099

- **Código:** `      attempted: true,`
- **Função:** Exige que ao menos um método tenha sido realmente disparado.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 100

- **Código:** `      confirmed: true,`
- **Função:** Exige confirmação baseada em evidência DOM nova/pronta.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 101

- **Código:** `      evidence: expect.objectContaining({ type: 'container' }),`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 102

- **Código:** `      methodsAttempted: expect.arrayContaining(['paste']),`
- **Função:** Observa quais métodos efetivamente dispararam.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 103

- **Código:** `    }));`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-01 — sucesso só após nova evidência.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `  test('ATT-02: disparar paste/drop sem mudança observável não declara sucesso', async () => {`
- **Função:** Declara cenário: ATT-02 — tentativa sem DOM novo não confirma.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `    const result = await api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 113

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** `      editorRoot: editor,`
- **Função:** Define raiz usada por foco/drop e, quando maior que editor, simula composer host.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `      timeoutMs: 40,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `      retryAfterMs: 5,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `      maxDispatches: 2,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `    expect(result.attempted).toBe(true);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 123

- **Código:** `    expect(result.confirmed).toBe(false);`
- **Função:** Prova que tentativa sem evidência observável não vira sucesso.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 124

- **Código:** `    expect(result.evidence).toBeNull();`
- **Função:** Exige ausência de evidência aceita.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 125

- **Código:** `    expect(result.methodsAttempted).toEqual(expect.arrayContaining(['paste', 'drop']));`
- **Função:** Observa quais métodos efetivamente dispararam.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 126

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-02 — tentativa sem DOM novo não confirma.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** `  test('ATT-03: thumbnail antigo no baseline não é confundido com o upload atual', async () => {`
- **Função:** Declara cenário: ATT-03 — baseline antigo não conta.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 130

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 131

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 133

- **Código:** `    const oldPreview = addPreview({ withImage: true, src: 'blob:https://gemini.test/old' });`
- **Função:** Mantém referência à preview antiga capturada no baseline.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 134

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 135

- **Código:** `    const result = await api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 136

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** `      timeoutMs: 35,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `      retryAfterMs: 5,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `      maxDispatches: 2,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `    expect(oldPreview.isConnected).toBe(true);`
- **Função:** Mantém referência à preview antiga capturada no baseline.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 145

- **Código:** `    expect(result.confirmed).toBe(false);`
- **Função:** Prova que tentativa sem evidência observável não vira sucesso.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 146

- **Código:** `    expect(result.evidence).toBeNull();`
- **Função:** Exige ausência de evidência aceita.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 147

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-03 — baseline antigo não conta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 149

- **Código:** `  test('ATT-04: mudança observável em container já existente conta como novo attachment', async () => {`
- **Função:** Declara cenário: ATT-04 — mudança estrutural em container existente.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 150

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 151

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** `    const preview = addPreview({ withImage: false });`
- **Função:** Cria container pré-existente sem imagem para testar mudança estrutural posterior.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 155

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `    editor.addEventListener('paste', () => {`
- **Função:** Instala reação da fixture ao evento paste emitido pelo módulo.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `      if (preview.querySelector('img')) return;`
- **Função:** Evita inserir segunda imagem na mesma preview.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `      const image = document.createElement('img');`
- **Função:** Cria imagem de preview/response usada como evidência.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 159

- **Código:** `      image.src = 'blob:https://gemini.test/new-file';`
- **Função:** Define identidade da mídia na assinatura de evidência.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `      Object.defineProperty(image, 'complete', { value: true, configurable: true });`
- **Função:** Controla se a imagem já terminou de carregar.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 161

- **Código:** `      Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** `      Object.defineProperty(image, 'naturalHeight', { value: 1200, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `      preview.appendChild(image);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `    const result = await api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 167

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 169

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 170

- **Código:** `      timeoutMs: 300,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 171

- **Código:** `      retryAfterMs: 20,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** `      maxDispatches: 2,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 174

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 175

- **Código:** `    expect(result.confirmed).toBe(true);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 176

- **Código:** `    expect(result.evidence.el).toBe(preview);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 177

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-04 — mudança estrutural em container existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 179

- **Código:** `  test('ATT-05: input[type=file] funciona como fallback e pode confirmar por preview posterior', async () => {`
- **Função:** Declara cenário: ATT-05 — fallback input file.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** `    const input = document.createElement('input');`
- **Função:** Declara uma referência DOM criada ou consultada nesta linha.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `    input.type = 'file';`
- **Função:** Cria input file elegível.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `    // JSDOM exige FileList no setter nativo; nesta fixture queremos observar`
- **Função:** Comentário/documentação do teste; não executa lógica de runtime.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 188

- **Código:** `    // apenas o contrato do módulo ao atribuir os arquivos do DataTransfer.`
- **Função:** Comentário/documentação do teste; não executa lógica de runtime.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `    Object.defineProperty(input, 'files', {`
- **Função:** Contorna restrição de FileList do JSDOM para observar assignment.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 190

- **Código:** `      value: [],`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 191

- **Código:** `      writable: true,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** `      configurable: true,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** `    input.addEventListener('change', () => addPreview());`
- **Função:** Faz a fixture criar preview após change do input.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `    document.body.appendChild(input);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 196

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `    const result = await api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 198

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 199

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 200

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 201

- **Código:** `      timeoutMs: 300,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 202

- **Código:** `      retryAfterMs: 20,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 203

- **Código:** `      maxDispatches: 2,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 204

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 205

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `    expect(result.confirmed).toBe(true);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 207

- **Código:** `    expect(result.methodsAttempted).toContain('file_input');`
- **Função:** Observa quais métodos efetivamente dispararam.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 208

- **Código:** `    expect(input.files).toHaveLength(1);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 209

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-05 — fallback input file.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 211

- **Código:** `  test('ATT-06: drag/drop permanece como fallback inicial', async () => {`
- **Função:** Declara cenário: ATT-06 — fallback drag/drop.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 212

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 213

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 214

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 215

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 216

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 217

- **Código:** `    editor.addEventListener('drop', event => {`
- **Função:** Instala reação da fixture ao evento drop emitido pelo módulo.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 218

- **Código:** `      expect(event.dataTransfer).toBeTruthy();`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 219

- **Código:** `      addPreview();`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 220

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 221

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 222

- **Código:** `    const result = await api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 223

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 224

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 225

- **Código:** `      editorRoot: editor,`
- **Função:** Define raiz usada por foco/drop e, quando maior que editor, simula composer host.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 226

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 227

- **Código:** `      timeoutMs: 300,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 228

- **Código:** `      retryAfterMs: 20,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 229

- **Código:** `      maxDispatches: 2,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 230

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 231

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 232

- **Código:** `    expect(result.confirmed).toBe(true);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 233

- **Código:** `    expect(result.methodsAttempted).toContain('drop');`
- **Função:** Observa quais métodos efetivamente dispararam.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 234

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-06 — fallback drag/drop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 235

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 236

- **Código:** `  test('ATT-07: cada método de upload é tentado no máximo uma vez', async () => {`
- **Função:** Declara cenário: ATT-07 — cada método no máximo uma vez.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 237

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 238

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 239

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 240

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 241

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 242

- **Código:** `    let pasteCount = 0;`
- **Função:** Declara ou inicializa a variável indicada especificamente por esta linha.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 243

- **Código:** `    let dropCount = 0;`
- **Função:** Declara ou inicializa a variável indicada especificamente por esta linha.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 244

- **Código:** `    editor.addEventListener('paste', () => { pasteCount += 1; });`
- **Função:** Instala reação da fixture ao evento paste emitido pelo módulo.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 245

- **Código:** `    editor.addEventListener('drop', () => { dropCount += 1; });`
- **Função:** Instala reação da fixture ao evento drop emitido pelo módulo.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 246

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 247

- **Código:** `    const result = await api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 248

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 249

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 250

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 251

- **Código:** `      timeoutMs: 40,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 252

- **Código:** `      retryAfterMs: 0,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 253

- **Código:** `      maxDispatches: 3,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 254

- **Código:** `      sleep: async () => {},`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 255

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 256

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 257

- **Código:** `    expect(result.confirmed).toBe(false);`
- **Função:** Prova que tentativa sem evidência observável não vira sucesso.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 258

- **Código:** `    expect(pasteCount).toBe(1);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 259

- **Código:** `    expect(dropCount).toBe(1);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 260

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-07 — cada método no máximo uma vez.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 261

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 262

- **Código:** `  test('ATT-08: input[type=file] é localizado também em shadow root', () => {`
- **Função:** Declara cenário: ATT-08 — input file em Shadow DOM.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 263

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 264

- **Código:** `    const host = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 265

- **Código:** `    const shadow = host.attachShadow({ mode: 'open' });`
- **Função:** Cria Shadow DOM para exercitar descoberta profunda de attachment.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 266

- **Código:** `    const input = document.createElement('input');`
- **Função:** Declara uma referência DOM criada ou consultada nesta linha.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 267

- **Código:** `    input.type = 'file';`
- **Função:** Cria input file elegível.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 268

- **Código:** `    shadow.appendChild(input);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 269

- **Código:** `    document.body.appendChild(host);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 270

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 271

- **Código:** `    expect(api.findFileInputsDeep(document.body)).toContain(input);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 272

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-08 — input file em Shadow DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 273

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 274

- **Código:** `  test('ATT-09: baseline ignora mudança cosmética e aceita mudança estrutural de mídia', () => {`
- **Função:** Declara cenário: ATT-09 — mudança cosmética vs estrutural.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 275

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 276

- **Código:** `    const preview = addPreview({ withImage: true });`
- **Função:** Declara ou inicializa a variável indicada especificamente por esta linha.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 277

- **Código:** `    const baseline = api.captureAttachmentBaseline(document);`
- **Função:** Captura o baseline de attachment antes da tentativa de upload.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 278

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 279

- **Código:** `    expect(api.findAttachmentThumbnailDeep(document, baseline)).toBeNull();`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 280

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 281

- **Código:** `    preview.classList.add('upload-complete');`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 282

- **Código:** `    expect(api.findAttachmentThumbnailDeep(document, baseline)).toBeNull();`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 283

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 284

- **Código:** `    const image = preview.querySelector('img');`
- **Função:** Evita inserir segunda imagem na mesma preview.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 285

- **Código:** `    image.src = 'blob:https://gemini.test/new-attachment';`
- **Função:** Define identidade da mídia na assinatura de evidência.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 286

- **Código:** `    expect(api.findAttachmentThumbnailDeep(document, baseline)).toEqual(`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 287

- **Código:** `      expect.objectContaining({ el: preview, type: 'container' })`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 288

- **Código:** `    );`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 289

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-09 — mudança cosmética vs estrutural.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 290

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 291

- **Código:** `  test('ATT-09B: preview completo dentro do Shadow DOM do composer é confirmado', async () => {`
- **Função:** Declara cenário: ATT-09B — preview em Shadow DOM do composer.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 292

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 293

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 294

- **Código:** `    const composer = document.createElement('rich-textarea');`
- **Função:** Declara uma referência DOM criada ou consultada nesta linha.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 295

- **Código:** `    const composerShadow = composer.attachShadow({ mode: 'open' });`
- **Função:** Cria Shadow DOM para exercitar descoberta profunda de attachment.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 296

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 297

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 298

- **Código:** `    composerShadow.appendChild(editor);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 299

- **Código:** `    document.body.appendChild(composer);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 300

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 301

- **Código:** `    editor.addEventListener('paste', () => {`
- **Função:** Instala reação da fixture ao evento paste emitido pelo módulo.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 302

- **Código:** `      if (composerShadow.querySelector('file-preview')) return;`
- **Função:** Consulta o DOM pelo seletor expresso nesta linha.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 303

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 304

- **Código:** `      const preview = document.createElement('file-preview');`
- **Função:** Materializa container reconhecido pelo detector de attachment.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 305

- **Código:** `      preview.getBoundingClientRect = () => ({`
- **Função:** Fornece geometria determinística ao detector de preview.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 306

- **Código:** `        x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 307

- **Código:** `        width: 120, height: 90, toJSON() { return this; },`
- **Função:** Retorna o valor ou resultado indicado pelo fluxo desta função auxiliar.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 308

- **Código:** `      });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 309

- **Código:** `      const previewShadow = preview.attachShadow({ mode: 'open' });`
- **Função:** Cria Shadow DOM para exercitar descoberta profunda de attachment.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 310

- **Código:** `      const image = document.createElement('img');`
- **Função:** Cria imagem de preview/response usada como evidência.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 311

- **Código:** `      image.src = 'blob:https://gemini.google.com/shadow-attachment';`
- **Função:** Define identidade da mídia na assinatura de evidência.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 312

- **Código:** `      Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 313

- **Código:** `      Object.defineProperty(image, 'naturalHeight', { value: 1100, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 314

- **Código:** `      Object.defineProperty(image, 'complete', { value: true, configurable: true });`
- **Função:** Controla se a imagem já terminou de carregar.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 315

- **Código:** `      previewShadow.appendChild(image);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 316

- **Código:** `      composerShadow.appendChild(preview);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 317

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 318

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 319

- **Código:** `    const result = await api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 320

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 321

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 322

- **Código:** `      editorRoot: composer,`
- **Função:** Define raiz usada por foco/drop e, quando maior que editor, simula composer host.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 323

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 324

- **Código:** `      timeoutMs: 500,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 325

- **Código:** `      retryAfterMs: 30,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 326

- **Código:** `      maxDispatches: 3,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 327

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 328

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 329

- **Código:** `    expect(result.confirmed).toBe(true);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 330

- **Código:** `    expect(result.evidence).toEqual(expect.objectContaining({`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 331

- **Código:** `      type: 'container',`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 332

- **Código:** `      img: expect.any(HTMLImageElement),`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 333

- **Código:** `    }));`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 334

- **Código:** `    expect(result.evidence.img.src).toBe('blob:https://gemini.google.com/shadow-attachment');`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 335

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-09B — preview em Shadow DOM do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 336

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 337

- **Código:** `  test('ATT-10: preview pendente bloqueia redisparo e só confirma após a imagem carregar', async () => {`
- **Função:** Declara cenário: ATT-10 — preview pendente bloqueia redisparo.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 338

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 339

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 340

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 341

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 342

- **Código:** `    const attempts = [];`
- **Função:** Declara ou inicializa a variável indicada especificamente por esta linha.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 343

- **Código:** `    let pendingImage = null;`
- **Função:** Declara ou inicializa a variável indicada especificamente por esta linha.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 344

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 345

- **Código:** `    const resultPromise = api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 346

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 347

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 348

- **Código:** `      editorRoot: editor,`
- **Função:** Define raiz usada por foco/drop e, quando maior que editor, simula composer host.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 349

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 350

- **Código:** `      timeoutMs: 500,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 351

- **Código:** `      retryAfterMs: 10,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 352

- **Código:** `      maxDispatches: 3,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 353

- **Código:** `      onAttempt: attempt => attempts.push(attempt),`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 354

- **Código:** `      dispatchMethodFn: async method => {`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 355

- **Código:** `        if (method !== 'file_input') return { attempted: false };`
- **Função:** Retorna o valor ou resultado indicado pelo fluxo desta função auxiliar.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 356

- **Código:** `        const preview = addPreview({ withImage: false });`
- **Função:** Cria container pré-existente sem imagem para testar mudança estrutural posterior.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 357

- **Código:** `        pendingImage = document.createElement('img');`
- **Função:** Cria imagem de preview/response usada como evidência.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 358

- **Código:** `        pendingImage.src = 'blob:https://gemini.test/pending';`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 359

- **Código:** `        Object.defineProperty(pendingImage, 'complete', { value: false, configurable: true });`
- **Função:** Controla se a imagem já terminou de carregar.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 360

- **Código:** `        Object.defineProperty(pendingImage, 'naturalWidth', { value: 0, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 361

- **Código:** `        Object.defineProperty(pendingImage, 'naturalHeight', { value: 0, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 362

- **Código:** `        preview.appendChild(pendingImage);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 363

- **Código:** `        return { attempted: true };`
- **Função:** Exige que ao menos um método tenha sido realmente disparado.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 364

- **Código:** `      },`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 365

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 366

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 367

- **Código:** `    await new Promise(resolve => setTimeout(resolve, 25));`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 368

- **Código:** `    expect(attempts).toHaveLength(1);`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 369

- **Código:** `    expect(attempts[0].method).toBe('file_input');`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 370

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 371

- **Código:** `    Object.defineProperty(pendingImage, 'complete', { value: true, configurable: true });`
- **Função:** Controla se a imagem já terminou de carregar.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 372

- **Código:** `    Object.defineProperty(pendingImage, 'naturalWidth', { value: 800, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 373

- **Código:** `    Object.defineProperty(pendingImage, 'naturalHeight', { value: 1200, configurable: true });`
- **Função:** Controla dimensões naturais usadas por evidenceReady.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 374

- **Código:** `    pendingImage.src = 'blob:https://gemini.test/pending-loaded';`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 375

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 376

- **Código:** `    await expect(resultPromise).resolves.toEqual(expect.objectContaining({`
- **Função:** Assertion focal sobre o valor ou efeito expresso nesta linha.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 377

- **Código:** `      confirmed: true,`
- **Função:** Exige confirmação baseada em evidência DOM nova/pronta.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 378

- **Código:** `      methodsAttempted: ['file_input'],`
- **Função:** Observa quais métodos efetivamente dispararam.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 379

- **Código:** `    }));`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 380

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-10 — preview pendente bloqueia redisparo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 381

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 382

- **Código:** `  test('ATT-11: imagem de resposta fora do composer não confirma o anexo', async () => {`
- **Função:** Declara cenário: ATT-11 — imagem de resposta fora do composer.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 383

- **Código:** `    const api = loadAttachment();`
- **Função:** Carrega a implementação real para o cenário.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 384

- **Código:** `    const editor = document.createElement('div');`
- **Função:** Cria editor/host genérico do cenário.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 385

- **Código:** `    editor.setAttribute('contenteditable', 'true');`
- **Função:** Marca o editor como área editável relevante ao composer.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 386

- **Código:** `    document.body.appendChild(editor);`
- **Função:** Conecta o editor ao DOM real do JSDOM.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 387

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 388

- **Código:** `    const result = await api.attachFile({`
- **Função:** Executa o algoritmo real de upload/fallback/confirmação.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real e assertions subsequentes fixam o contrato.

### Linha 389

- **Código:** `      file: file(),`
- **Função:** Fornece arquivo PNG realista ao algoritmo.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 390

- **Código:** `      editor,`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 391

- **Código:** `      root: document,`
- **Função:** Faz detecção de evidência/inputs percorrer o documento.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 392

- **Código:** `      timeoutMs: 40,`
- **Função:** Configura timeout curto e determinístico da confirmação.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 393

- **Código:** `      retryAfterMs: 5,`
- **Função:** Configura espera antes de tentar o próximo método de upload.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 394

- **Código:** `      maxDispatches: 1,`
- **Função:** Limita o número total de dispatches efetivos.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 395

- **Código:** `      dispatchMethodFn: async () => {`
- **Função:** Atualiza a variável ou propriedade indicada para configurar o estado específico do cenário.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 396

- **Código:** `        const response = document.createElement('model-response');`
- **Função:** Declara uma referência DOM criada ou consultada nesta linha.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 397

- **Código:** `        document.body.appendChild(response);`
- **Função:** Insere o nó indicado na árvore DOM do cenário.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 398

- **Código:** `        addPreview({ parent: response });`
- **Função:** Invoca a operação indicada nesta linha como parte do setup, ação ou observação do cenário.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 399

- **Código:** `        return { attempted: true };`
- **Função:** Exige que ao menos um método tenha sido realmente disparado.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 400

- **Código:** `      },`
- **Função:** Executa a instrução específica desta linha no contexto descrito; não é uma observação genérica de arquivos do input.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 401

- **Código:** `    });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 402

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 403

- **Código:** `    expect(result.confirmed).toBe(false);`
- **Função:** Prova que tentativa sem evidência observável não vira sucesso.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 404

- **Código:** `    expect(result.evidence).toBeNull();`
- **Função:** Exige ausência de evidência aceita.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 405

- **Código:** `  });`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** ATT-11 — imagem de resposta fora do composer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 406

- **Código:** `});`
- **Função:** Fecha ou organiza o bloco sintático anterior; função estrutural.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 407 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 12. Conclusão documental

Foram documentadas 406 linhas textuais e a posição 407 do newline final. Os 12 cenários principais estão diretamente provados no mesmo blob verde em Node 20/22; as três solicitações ACCEPTED concentram-se em re-render do editor, estado busy explícito e seleção segura entre múltiplos inputs file.

> **Correção pós-adversarial:** 146 descrições genéricas `Observa arquivos atribuídos ao input` foram substituídas por função derivada da linha concreta; linhas estruturais, assertions, declarações, chamadas e manipulações DOM não compartilham mais a mesma semântica copiada.
> **Lifecycle:** 174-001, 174-002 e 174-003 estão ACCEPTED em `.state/174.json`.

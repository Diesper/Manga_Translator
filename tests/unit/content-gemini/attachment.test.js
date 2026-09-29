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

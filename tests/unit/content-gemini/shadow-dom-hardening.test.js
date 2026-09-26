'use strict';

const path = require('path');

const SELECTORS_PATH = path.resolve(__dirname, '../../../extension/gemini/selectors.js');
const DOM_PATH = path.resolve(__dirname, '../../../extension/gemini/dom.js');
const OBSERVER_PATH = path.resolve(__dirname, '../../../extension/gemini/observer.js');
const ATTACHMENT_PATH = path.resolve(__dirname, '../../../extension/gemini/attachment.js');

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

function loadModules() {
  let dom;
  let observer;
  let attachment;
  jest.isolateModules(() => {
    require(SELECTORS_PATH);
    dom = require(DOM_PATH);
    observer = require(OBSERVER_PATH);
    attachment = require(ATTACHMENT_PATH);
  });
  return { dom, observer, attachment };
}

function flushMutations() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function defineImageMetrics(img, width = 1200, height = 1600) {
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  Object.defineProperty(img, 'complete', { value: true, configurable: true });
  return img;
}

function visible(element, width = 100, height = 60) {
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

describe('Gemini Shadow DOM hardening', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    installDataTransferMock();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('SHADOW-01: closestComposed encontra model-response através do boundary do shadow root', () => {
    const { dom } = loadModules();

    const response = document.createElement('model-response');
    const shadow = response.attachShadow({ mode: 'open' });
    const img = defineImageMetrics(document.createElement('img'));
    img.src = 'blob:https://gemini.google.com/model-shadow-result';
    shadow.appendChild(img);
    document.body.appendChild(response);

    expect(dom.getStrictModelResponseContainer(img)).toBe(response);
    expect(dom.isModelResponseImage(img)).toBe(true);
  });

  test('SHADOW-02: Observer captura resultado criado dentro de shadow roots abertos', async () => {
    const { observer: observerApi } = loadModules();

    const shell = document.createElement('gemini-shell');
    const shellShadow = shell.attachShadow({ mode: 'open' });
    document.body.appendChild(shell);

    const observer = observerApi.createGeminiObserver({
      jobId: 'shadow-result',
      root: document,
    }).start();
    const pending = observer.waitForResult(1500);

    const response = document.createElement('model-response');
    response.setAttribute('data-message-author', 'model');
    const responseShadow = response.attachShadow({ mode: 'open' });
    shellShadow.appendChild(response);

    const img = defineImageMetrics(document.createElement('img'));
    img.src = 'blob:https://gemini.google.com/shadow-generated-result';
    responseShadow.appendChild(img);

    await flushMutations();
    await flushMutations();

    await expect(pending).resolves.toEqual({
      image: img,
      url: 'blob:https://gemini.google.com/shadow-generated-result',
    });
    expect(observer.getState().modelTurn).toBe(response);
    observer.stop();
  });

  test('SHADOW-03: imagem em user turn dentro de shadow DOM continua proibida como resultado', async () => {
    const { observer: observerApi } = loadModules();

    const shell = document.createElement('gemini-shell');
    const shadow = shell.attachShadow({ mode: 'open' });
    document.body.appendChild(shell);

    const observer = observerApi.createGeminiObserver({
      jobId: 'shadow-user-image',
      root: document,
    }).start();

    const userTurn = document.createElement('div');
    userTurn.setAttribute('data-message-author', 'user');
    const userShadow = userTurn.attachShadow({ mode: 'open' });
    shadow.appendChild(userTurn);

    const img = defineImageMetrics(document.createElement('img'));
    img.src = 'blob:https://gemini.google.com/shadow-user-clone';
    userShadow.appendChild(img);

    await flushMutations();
    observer.inspect();

    expect(observer.getState().modelTurn).toBeNull();
    expect(observer.getState().resultUrl).toBeNull();
    observer.stop();
  });

  test('SHADOW-04: attachment preview dentro do Shadow DOM do composer é confirmado', async () => {
    const { attachment } = loadModules();

    const composer = document.createElement('rich-textarea');
    const composerShadow = composer.attachShadow({ mode: 'open' });
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    composerShadow.appendChild(editor);
    document.body.appendChild(composer);

    editor.addEventListener('paste', () => {
      if (composerShadow.querySelector('file-preview')) return;

      const preview = visible(document.createElement('file-preview'));
      const previewShadow = preview.attachShadow({ mode: 'open' });
      const img = defineImageMetrics(document.createElement('img'), 800, 1100);
      img.src = 'blob:https://gemini.google.com/shadow-attachment';
      previewShadow.appendChild(img);
      composerShadow.appendChild(preview);
    });

    const file = new File(
      [new Uint8Array([1, 2, 3])],
      'page.png',
      { type: 'image/png' }
    );

    const result = await attachment.attachFile({
      file,
      editor,
      editorRoot: composer,
      root: document,
      timeoutMs: 500,
      retryAfterMs: 30,
      maxDispatches: 2,
    });

    expect(result.confirmed).toBe(true);
    expect(result.evidence).toEqual(expect.objectContaining({
      type: 'container',
      imageSource: 'blob:https://gemini.google.com/shadow-attachment',
    }));
  });

  test('SHADOW-05: findVisible e findFirstDeep localizam controles dentro de Shadow DOM', () => {
    const { dom } = loadModules();

    const shell = document.createElement('gemini-shell');
    const shadow = shell.attachShadow({ mode: 'open' });
    const button = visible(document.createElement('button'), 36, 36);
    button.setAttribute('aria-label', 'Send message');
    shadow.appendChild(button);
    document.body.appendChild(shell);

    expect(dom.findFirstDeep(document, 'button[aria-label="Send message"]')).toBe(button);
    expect(dom.findVisible('button[aria-label="Send message"]', document)).toBe(button);
  });
});

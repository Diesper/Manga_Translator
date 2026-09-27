'use strict';

const path = require('path');

const MODULE_PATH = path.resolve(
  __dirname,
  '../../../extension/gemini/image-quarantine.js'
);
const DOM_PATH = path.resolve(
  __dirname,
  '../../../extension/gemini/dom.js'
);

function loadQuarantine({ perceptualEvaluator = null } = {}) {
  let moduleApi;
  let domApi;
  jest.isolateModules(() => {
    domApi = require(DOM_PATH);
    moduleApi = require(MODULE_PATH);
  });
  return moduleApi.createImageQuarantine({
    dom: domApi,
    cryptoImpl: null,
    atobImpl: value => Buffer.from(value, 'base64').toString('binary'),
    perceptualEvaluator,
  });
}

function dataUrl(bytes, mime = 'image/png') {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('gemini/image-quarantine.js', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('QUA-01: SHA-256 é calculado sobre os bytes, sem depender do MIME', async () => {
    const quarantine = loadQuarantine();
    const png = dataUrl('mesmos-bytes', 'image/png');
    const webp = dataUrl('mesmos-bytes', 'image/webp');

    await expect(quarantine.computeExactHash(png)).resolves.toBe(
      await quarantine.computeExactHash(webp)
    );
    await expect(quarantine.computeExactHash(png)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  test('QUA-02: payload idêntico ao anexo é colocado em quarentena', async () => {
    const quarantine = loadQuarantine();
    const input = dataUrl('imagem-original');
    const inputHash = await quarantine.computeExactHash(input);

    await expect(quarantine.assessExtractedResult({
      candidateDataUrl: dataUrl('imagem-original'),
      inputHash,
    })).resolves.toEqual(expect.objectContaining({
      quarantined: true,
      exactMatch: true,
      reason: 'exact_payload_match',
    }));
  });

  test('QUA-03: um único byte diferente não é bloqueado', async () => {
    const quarantine = loadQuarantine();

    await expect(quarantine.assessExtractedResult({
      candidateDataUrl: dataUrl('imagem-traduzida'),
      inputDataUrl: dataUrl('imagem-original'),
    })).resolves.toEqual(expect.objectContaining({
      quarantined: false,
      exactMatch: false,
      reason: null,
    }));
  });

  test('QUA-04: similaridade perceptual é telemetria e não bloqueia payload diferente', async () => {
    const perceptualEvaluator = jest.fn(async () => ({ similar: true, distance: 0 }));
    const quarantine = loadQuarantine({ perceptualEvaluator });

    const result = await quarantine.assessExtractedResult({
      candidateDataUrl: dataUrl('resultado-diferente'),
      inputDataUrl: dataUrl('entrada'),
    });

    expect(result).toEqual(expect.objectContaining({
      quarantined: false,
      exactMatch: false,
      perceptual: { similar: true, distance: 0 },
    }));
    expect(perceptualEvaluator).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['preview do anexo', '<file-preview><img id="candidate"></file-preview>', 'attachment_preview'],
    ['compositor', '<rich-textarea><img id="candidate"></rich-textarea>', 'composer'],
    ['turno do usuário', '<div data-message-author="user"><img id="candidate"></div>', 'user_turn'],
  ])('QUA-05: classifica %s como entrada estrutural', (_label, markup, reason) => {
    document.body.innerHTML = markup;
    const quarantine = loadQuarantine();
    const image = document.getElementById('candidate');

    expect(quarantine.classifyStructuralInput(image)).toBe(reason);
    expect(quarantine.isStructurallyInput(image)).toBe(true);
  });

  test('QUA-06: preview dentro de shadow root também é identificado', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const preview = document.createElement('file-preview');
    const image = document.createElement('img');
    preview.appendChild(image);
    shadow.appendChild(preview);
    document.body.appendChild(host);

    const quarantine = loadQuarantine();
    expect(quarantine.classifyStructuralInput(image)).toBe('attachment_preview');
  });

  test('QUA-07: imagem de resposta do modelo não é confundida com preview', () => {
    document.body.innerHTML = `
      <model-response data-message-author="model">
        <div class="image-preview"><img id="candidate"></div>
      </model-response>
    `;
    const quarantine = loadQuarantine();

    expect(quarantine.classifyStructuralInput(
      document.getElementById('candidate')
    )).toBeNull();
  });

  test('QUA-08: entrada que não é data URL de imagem falha de forma explícita', async () => {
    const quarantine = loadQuarantine();

    await expect(quarantine.computeExactHash('https://example.test/image.png'))
      .rejects.toThrow('data URL de imagem válida');
  });
});

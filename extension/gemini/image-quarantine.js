'use strict';
// gemini/image-quarantine.js — impede que o anexo de entrada seja entregue
// como se fosse a imagem gerada pelo Gemini.

(function(scope) {
  let domApi = scope.MangaTranslatorGeminiDom || null;
  if (!domApi && typeof require === 'function') {
    try { domApi = require('./dom.js'); } catch (_e) {}
  }

  const ATTACHMENT_SELECTOR = [
    'file-preview',
    'attachment-card',
    '[data-test-id*="attachment"]',
    '[data-testid*="attachment"]',
    '[data-test-id*="preview"]',
    '[data-testid*="preview"]',
    '.file-preview',
    '.attachment-preview',
    '.image-preview',
    '.attachment-container',
  ].join(', ');

  function closestComposed(element, selector) {
    for (let current = element; current;) {
      if (current.matches?.(selector)) return current;
      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }
      let root = null;
      try { root = current.getRootNode?.(); } catch (_e) {}
      current = root?.host || null;
    }
    return null;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function sha256BytesFallback(inputBytes) {
    const bytes = Array.from(inputBytes || []);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    [high, low].forEach(word => bytes.push(
      (word >>> 24) & 0xFF,
      (word >>> 16) & 0xFF,
      (word >>> 8) & 0xFF,
      word & 0xFF
    ));

    const constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const words = new Uint32Array(64);

    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        const at = offset + index * 4;
        words[index] = (
          (bytes[at] << 24) |
          (bytes[at + 1] << 16) |
          (bytes[at + 2] << 8) |
          bytes[at + 3]
        ) >>> 0;
      }
      for (let index = 16; index < 64; index += 1) {
        const x = words[index - 15];
        const y = words[index - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let index = 0; index < 64; index += 1) {
        const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const choose = (e & f) ^ (~e & g);
        const temp1 = (h + s1 + choose + constants[index] + words[index]) >>> 0;
        const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + majority) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    return [h0, h1, h2, h3, h4, h5, h6, h7]
      .map(word => word.toString(16).padStart(8, '0'))
      .join('');
  }

  function decodeDataUrl(dataUrl, { atobImpl, TextEncoderImpl } = {}) {
    const raw = String(dataUrl || '');
    const commaIndex = raw.indexOf(',');
    if (!raw.startsWith('data:image/') || commaIndex < 0) {
      throw new Error('Quarentena requer data URL de imagem válida');
    }

    const header = raw.slice(0, commaIndex);
    const payload = raw.slice(commaIndex + 1);
    if (/;base64(?:;|$)/i.test(header)) {
      if (typeof atobImpl !== 'function') throw new Error('Decodificador base64 indisponível');
      const binary = atobImpl(payload.replace(/\s+/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index) & 0xFF;
      }
      return bytes;
    }

    const decoded = decodeURIComponent(payload);
    if (typeof TextEncoderImpl === 'function') return new TextEncoderImpl().encode(decoded);
    return Uint8Array.from(decoded, character => character.charCodeAt(0) & 0xFF);
  }

  function createImageQuarantine({
    dom = domApi,
    cryptoImpl = scope.crypto,
    atobImpl = typeof scope.atob === 'function' ? scope.atob.bind(scope) : null,
    TextEncoderImpl = scope.TextEncoder,
    perceptualEvaluator = null,
  } = {}) {
    if (!dom) throw new Error('ImageQuarantine requer o módulo Gemini DOM');

    function classifyStructuralInput(element) {
      if (!element) return null;
      if (dom.getStrictModelResponseContainer?.(element)) return null;
      if (dom.getUserTurnContainer?.(element)) return 'user_turn';
      const attachment = closestComposed(element, ATTACHMENT_SELECTOR);
      if (attachment) return 'attachment_preview';
      if (dom.isInsideInputArea?.(element)) return 'composer';
      return null;
    }

    function isStructurallyInput(element) {
      return Boolean(classifyStructuralInput(element));
    }

    async function computeExactHash(dataUrl) {
      const bytes = decodeDataUrl(dataUrl, { atobImpl, TextEncoderImpl });
      if (cryptoImpl?.subtle?.digest) {
        const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
        return bytesToHex(new Uint8Array(digest));
      }
      return sha256BytesFallback(bytes);
    }

    async function assessExtractedResult({
      element = null,
      candidateDataUrl,
      inputDataUrl = null,
      inputHash = null,
    } = {}) {
      const structuralReason = classifyStructuralInput(element);
      if (structuralReason) {
        return {
          quarantined: true,
          reason: structuralReason,
          exactMatch: false,
          perceptual: null,
        };
      }

      const resolvedInputHash = inputHash || await computeExactHash(inputDataUrl);
      const candidateHash = await computeExactHash(candidateDataUrl);
      let perceptual = null;
      if (typeof perceptualEvaluator === 'function') {
        try {
          perceptual = await perceptualEvaluator({ inputDataUrl, candidateDataUrl });
        } catch (_e) {}
      }
      const exactMatch = resolvedInputHash === candidateHash;
      return {
        quarantined: exactMatch,
        reason: exactMatch ? 'exact_payload_match' : null,
        exactMatch,
        perceptual,
      };
    }

    return {
      classifyStructuralInput,
      isStructurallyInput,
      computeExactHash,
      assessExtractedResult,
    };
  }

  const api = {
    ATTACHMENT_SELECTOR,
    closestComposed,
    decodeDataUrl,
    sha256BytesFallback,
    createImageQuarantine,
  };
  scope.MangaTranslatorGeminiImageQuarantine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

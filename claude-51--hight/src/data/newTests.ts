export interface NewTest {
  id: string;
  file: string;
  objective: string;
  setup: string;
  action: string;
  expected: string;
  bugPrevented: string;
  code: string;
}

export const newTests: NewTest[] = [
  {
    id: 'NT-01',
    file: 'tests/integration/popup-image-card-escaping.test.js',
    objective: 'Garantir que `renderImageGrid` do popup.js não permite quebra de atributo/HTML injection via `img.src` (SEC-01).',
    setup: 'Carregar popup.html + popup.js reais com `loadExtensionPage` (helper existente). Registrar handler de `GET_PAGE_IMAGES` no ChromeTabsMock devolvendo uma imagem cujo `src` contém `"` e `<`.',
    action: 'Disparar DOMContentLoaded e aguardar o grid renderizar.',
    expected: 'Exatamente 1 `.image-card`, cujo `<img>` tem `getAttribute("src")` igual ao valor bruto; nenhum elemento `<b id="pwned">` no documento; `card.dataset.src` igual ao valor bruto.',
    bugPrevented: 'HTML injection no popup (popup.js:657-661). Com o código atual este teste FALHA (o `"` fecha o atributo e o `<b>` é inserido).',
    code: `const path = require('path');
const { loadExtensionPage } = require('../helpers/load-extension-page.js');
const { getTabsMock, getStorageMock } = require('../mocks/chrome-api.mock.js');

// Payload realista: data: URL preserva aspas (WHATWG opaque path)
const MALICIOUS_SRC =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"/>"><b id="pwned">x</b><img src="';

describe('popup.js — escaping do src no grid de imagens (SEC-01)', () => {
  test('src com aspas e tags não injeta elementos nem quebra o atributo', async () => {
    // Arrange: site habilitado e aba ativa com content script "respondendo"
    const tabs = getTabsMock();
    const storage = getStorageMock();
    const tab = await tabs.create({ url: 'https://manga.test/cap-1', active: true });
    storage._setStore({ enabledDomains: ['manga.test'] });

    tabs._registerMessageHandler(tab.id, (msg, _sender, sendResponse) => {
      if (msg.action === 'GET_PAGE_IMAGES') {
        sendResponse({ images: [{ index: 0, src: MALICIOUS_SRC, width: 400, height: 600 }], total: 1 });
      } else {
        sendResponse({ success: true });
      }
    });

    // Act: carrega popup real
    const { document } = await loadExtensionPage({
      htmlPath: 'extension/popup.html',
      scriptPath: 'extension/popup.js',
      fireDOMContentLoaded: true,
    });
    await new Promise(r => setTimeout(r, 100));

    // Assert
    expect(document.querySelector('#pwned')).toBeNull();
    const cards = document.querySelectorAll('.image-card');
    expect(cards).toHaveLength(1);
    const img = cards[0].querySelector('img');
    expect(img.getAttribute('src')).toBe(MALICIOUS_SRC);
    expect(cards[0].querySelectorAll('img')).toHaveLength(1);
    expect(cards[0].dataset.src).toBe(MALICIOUS_SRC);
  });
});`,
  },
  {
    id: 'NT-02',
    file: 'tests/unit/content-manga/canonical-title-real.test.js (substitui canonical-title*.test.js)',
    objective: 'Testar a função `canonicalTitle` REAL exportada por `cm-chapter.js` em `MangaTranslatorChapter` (TST-01), documentando o comportamento verdadeiro.',
    setup: 'Nenhum mock. `require` direto de `extension/cm-chapter.js`, que anexa `rootScope.MangaTranslatorChapter` (linha 148-149).',
    action: 'Chamar `canonicalTitle` com títulos reais de sites.',
    expected: 'Prefixo numérico removido; prefixo textual ("Cap 5:") NÃO removido (comportamento atual); separadores substituídos; lowercase; limite 80 chars. Inclui teste de "espelho": se alguém recriar `tests/helpers/extracted-functions.js`, garantir igualdade com a produção.',
    bugPrevented: 'Regressão em `cm-chapter.js:5-14` que hoje é invisível; e re-introdução de helper divergente.',
    code: `/**
 * @jest-environment jsdom
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');

function loadReal() {
  let api;
  jest.isolateModules(() => {
    require(path.join(ROOT, 'extension/cm-chapter.js'));
    api = window.MangaTranslatorChapter;
  });
  return api;
}

describe('cm-chapter.js canonicalTitle (REAL)', () => {
  const { canonicalTitle } = loadReal();

  test('entrada vazia/nula retorna string vazia', () => {
    expect(canonicalTitle(undefined)).toBe('');
    expect(canonicalTitle(null)).toBe('');
    expect(canonicalTitle('')).toBe('');
  });

  test('remove prefixo numérico com separador', () => {
    expect(canonicalTitle('1050 - One Piece')).toBe('one piece');
    expect(canonicalTitle('12. Naruto')).toBe('naruto');
  });

  test('COMPORTAMENTO ATUAL: NÃO remove prefixo textual "Cap 5:" (decisão de produto pendente)', () => {
    // Se a intenção for remover, mude a produção E este teste juntos.
    expect(canonicalTitle('Cap 5: Dragon Ball')).toBe('cap 5: dragon ball');
  });

  test('COMPORTAMENTO ATUAL: sufixo de site "| Ler" vira espaço, não é removido', () => {
    expect(canonicalTitle('One Piece | Ler Online')).toBe('one piece ler online');
  });

  test('normaliza separadores, espaços múltiplos e trailing "-"/":"', () => {
    expect(canonicalTitle('  Bleach  [Cap]  —  Final -')).toBe('bleach cap final');
  });

  test('trunca em 80 caracteres após normalizar', () => {
    const long = 'a'.repeat(200);
    expect(canonicalTitle(long)).toHaveLength(80);
  });

  test('é idempotente', () => {
    const once = canonicalTitle('7 - Título Estranho | Site');
    expect(canonicalTitle(once)).toBe(once);
  });
});`,
  },
  {
    id: 'NT-03',
    file: 'tests/unit/inject/inject-behavior.test.js',
    objective: 'Executar `inject.js` real em jsdom e verificar comportamento observável (TST-02): spoof de visibilidade, ponte FETCH_IMAGE e não-ativação fora do host Gemini.',
    setup: 'jsdom com `window.location` em `https://gemini.google.com/app`. Stub de `global.fetch` retornando Blob `image/png`. `FileReader` do jsdom.',
    action: '`require` do inject.js; disparar `CustomEvent("MANGA_TRANSLATOR_FETCH_IMAGE", { detail: { requestId, url } })`.',
    expected: 'Evento `MANGA_TRANSLATOR_FETCH_IMAGE_RESULT` com `dataUrl` que começa por `data:image/png;base64,`; para resposta não-imagem, `detail.error`; `document.visibilityState === "visible"` mesmo após tentativa de setar hidden; sem `requestId` nada é disparado.',
    bugPrevented: 'Remoção/inversão do listener de fetch, quebra do spoof de visibilidade, vazamento para hosts errados.',
    code: `/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://gemini.google.com/app"}
 */
const path = require('path');
const INJECT = path.resolve(__dirname, '../../../extension/inject.js');

function waitForEvent(name) {
  return new Promise(resolve =>
    window.addEventListener(name, e => resolve(e.detail), { once: true }));
}

describe('inject.js (REAL, MAIN world simulado)', () => {
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' }),
    }));
    jest.isolateModules(() => require(INJECT));
  });

  test('FETCH_IMAGE responde com dataUrl da imagem', async () => {
    const resultP = waitForEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT');
    window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE', {
      detail: { requestId: 'r1', url: 'https://lh3.googleusercontent.com/x.png' },
    }));
    const detail = await resultP;
    expect(detail.requestId).toBe('r1');
    expect(detail.dataUrl).toMatch(/^data:image\\/png;base64,/);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://lh3.googleusercontent.com/x.png',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' })
    );
  });

  test('FETCH_IMAGE rejeita blob que não é imagem', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, blob: async () => new Blob(['<html>'], { type: 'text/html' }),
    });
    const resultP = waitForEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT');
    window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE', {
      detail: { requestId: 'r2', url: 'https://x/y' },
    }));
    const detail = await resultP;
    expect(detail.dataUrl).toBeUndefined();
    expect(detail.error).toMatch(/Tipo inválido/);
  });

  test('FETCH_IMAGE sem requestId é ignorado (nenhum fetch)', async () => {
    window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE', { detail: { url: 'https://x' } }));
    await new Promise(r => setTimeout(r, 20));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('document.visibilityState permanece "visible" e hidden === false', () => {
    expect(document.visibilityState).toBe('visible');
    expect(document.hidden).toBe(false);
  });
});`,
  },
  {
    id: 'NT-04',
    file: 'tests/unit/manifest/surface-reduction.test.js (adicionar casos)',
    objective: 'Impedir que hosts de teste (`127.0.0.1`, `localhost`, esquema `http:`) entrem no manifest de produção (SEC-02).',
    setup: 'Ler `extension/manifest.json` via fs (padrão já usado no arquivo).',
    action: 'Percorrer `content_scripts[].matches` e `host_permissions`.',
    expected: 'Nenhum match contendo `127.0.0.1`, `localhost` ou começando por `http://` exceto `<all_urls>` (que é decisão de produto separada). Scripts com `world: "MAIN"` só podem casar `https://gemini.google.com/*`.',
    bugPrevented: 'Injeção de inject.js em servidores locais do usuário.',
    code: `const fs = require('fs');
const path = require('path');
const manifest = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../../extension/manifest.json'), 'utf8'));

describe('manifest — hosts de teste não podem vazar para produção (SEC-02)', () => {
  const allMatches = manifest.content_scripts.flatMap(cs => cs.matches);

  test('nenhum content script casa com loopback/localhost', () => {
    const leaked = allMatches.filter(m => /127\\.0\\.0\\.1|localhost|\\[::1\\]/.test(m));
    expect(leaked).toEqual([]);
  });

  test('nenhum match http: explícito (apenas https ou <all_urls>)', () => {
    const plainHttp = allMatches.filter(m => m.startsWith('http://'));
    expect(plainHttp).toEqual([]);
  });

  test('scripts MAIN world só podem rodar no Gemini', () => {
    const mainWorld = manifest.content_scripts.filter(cs => cs.world === 'MAIN');
    expect(mainWorld.length).toBeGreaterThan(0);
    for (const cs of mainWorld) {
      expect(cs.matches).toEqual(['https://gemini.google.com/*']);
    }
  });
});`,
  },
  {
    id: 'NT-05',
    file: 'tests/unit/background/router.test.js (adicionar casos)',
    objective: 'Cobrir `identifySource` com URLs adversariais (SEC-03).',
    setup: 'Carregar router.js real como já feito no arquivo (`require(ROUTER_PATH)`), `chrome.runtime.id` do mock.',
    action: 'Chamar `identifySource` com senders cujas URLs contêm a substring `gemini.google.com` fora do host.',
    expected: 'Devem ser classificados como "content". Com o código atual (`includes`) este teste FALHA — serve como red-test para a correção.',
    bugPrevented: 'Escalada de origem "content" → "gemini" por substring.',
    code: `describe('identifySource — URLs adversariais (SEC-03)', () => {
  const router = global.MangaTranslatorRouter; // carregado no beforeEach do arquivo

  test.each([
    'https://evil.test/?ref=gemini.google.com',
    'https://gemini.google.com.evil.test/app',
    'https://evil.test/gemini.google.com/',
    'https://evil.test/#127.0.0.1',
  ])('%s deve ser "content", não "gemini"', (url) => {
    expect(router.identifySource({ tab: { id: 7, url } })).toBe('content');
  });

  test('host exato do Gemini continua sendo "gemini"', () => {
    expect(router.identifySource({ tab: { id: 7, url: 'https://gemini.google.com/app/abc' } })).toBe('gemini');
  });

  test('sender sem tab e com id diferente da extensão é "external"', () => {
    expect(router.identifySource({ id: 'other-ext' })).toBe('external');
  });
});`,
  },
  {
    id: 'NT-06',
    file: 'tests/unit/background/download-images-and-show.test.js',
    objective: 'Cobrir `downloadImagesAndShow` e `handleMarkerAndShow` reais (background.js:819-903) — hoje 0 hits.',
    setup: '`loadBackgroundModule` (helper existente exporta `downloadImagesAndShow` e `handleMarkerAndShow`). `getDownloadsMock()` stateful. Fake timers para o safety timer de 10 min.',
    action: 'Chamar `downloadImagesAndShow({0: "data:...", 1: "data:..."}, "titulo", "chap1")`; simular `onChanged` com `complete` e `interrupted`.',
    expected: 'Resolve `true` com lista vazia sem chamar `chrome.downloads.download`; chama `download` uma vez por índice em ordem com filename `MangaTranslator/titulo/pagina_000.png`; download interrompido não trava a Promise; `chap1_paths` persistido em storage.',
    bugPrevented: 'Regressão no padrão de nome de arquivo, ordenação, ou Promise que nunca resolve.',
    code: `const path = require('path');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const { getDownloadsMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');

const BG = path.resolve(__dirname, '../../../extension/background.js');

describe('downloadImagesAndShow (REAL)', () => {
  let bg, downloads, storage;
  beforeEach(() => {
    jest.useFakeTimers();
    downloads = getDownloadsMock();
    storage = getStorageMock();
    bg = loadBackgroundModule(BG);
  });
  afterEach(() => jest.useRealTimers());

  test('lista vazia resolve true sem baixar nada', async () => {
    const spy = jest.spyOn(chrome.downloads, 'download');
    await expect(bg.downloadImagesAndShow({}, 'titulo', 'chap1')).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  test('baixa em ordem de índice com nome padronizado e persiste paths', async () => {
    const calls = [];
    jest.spyOn(chrome.downloads, 'download').mockImplementation((opts, cb) => {
      calls.push(opts.filename);
      const id = calls.length;
      setTimeout(() => cb(id), 0);
      setTimeout(() => downloads._emitChanged({ id, state: { current: 'complete' } }), 5);
    });

    const p = bg.downloadImagesAndShow({ 2: 'data:2', 0: 'data:0' }, 'meu_titulo', 'chapX');
    await jest.advanceTimersByTimeAsync(50);
    await p;

    expect(calls).toEqual([
      'MangaTranslator/meu_titulo/pagina_000.png',
      'MangaTranslator/meu_titulo/pagina_002.png',
    ]);
    const store = storage._getStore();
    expect(store['chapX_paths']).toBeDefined();
  });

  test('download interrompido não trava a Promise', async () => {
    jest.spyOn(chrome.downloads, 'download').mockImplementation((opts, cb) => {
      setTimeout(() => cb(99), 0);
      setTimeout(() => downloads._emitChanged({ id: 99, state: { current: 'interrupted' } }), 5);
    });
    const p = bg.downloadImagesAndShow({ 0: 'data:0' }, 't', 'c');
    await jest.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBeDefined();
  });
});
// NOTA: verificar em tests/mocks/chrome-api.mock.js o nome exato do emissor do
// ChromeDownloadsMock (ex.: _emitChanged / _simulateStateChange) antes de usar.`,
  },
  {
    id: 'NT-07',
    file: 'tests/integration/storage-manager-sm-routing.test.js',
    objective: 'Cobrir `handleStorageManagerMessage` (background.js:170-219) e o round-trip SM_SAVE_PAGE → SM_GET_PAGE com IndexedDB real (fake-indexeddb).',
    setup: '`require("fake-indexeddb/auto")` antes de carregar background.js via `require` direto (não via new Function, para contar cobertura). Chrome mock stateful.',
    action: 'Enviar pelo listener real de `chrome.runtime.onMessage`: `SM_SAVE_PAGE`, depois `SM_GET_PAGE`, depois `SM_DELETE_CLEAN_URL`, depois ação `SM_` inexistente.',
    expected: '`ok:true` e payload devolvido igual ao salvo; após delete, `SM_GET_PAGE` retorna null; ação desconhecida → `ok:false` com erro; exceção do storage → `{ok:false, error}` e log `SM_ERROR`.',
    bugPrevented: 'Quebra no switch de roteamento SM_, perda de persistência, resposta pendurada (listener retorna true sem sendResponse).',
    code: `require('fake-indexeddb/auto');
const path = require('path');
const { getRuntimeMock } = require('../mocks/chrome-api.mock.js');

const BG = path.resolve(__dirname, '../../extension/background.js');

function send(action, extra = {}) {
  return new Promise(resolve => {
    const listeners = getRuntimeMock()._messageListeners;
    const sender = { id: chrome.runtime.id, tab: { id: 1, url: 'https://manga.test/c1' } };
    let async = false;
    for (const fn of listeners) {
      const r = fn({ action, ...extra }, sender, resolve);
      if (r === true) async = true;
    }
    if (!async) setTimeout(() => resolve(undefined), 0);
  });
}

describe('background.js — roteamento SM_* (REAL + fake-indexeddb)', () => {
  beforeAll(() => { global.self = global; jest.isolateModules(() => require(BG)); });

  test('SM_SAVE_PAGE → SM_GET_PAGE devolve a página salva', async () => {
    const save = await send('SM_SAVE_PAGE', {
      chapterId: 'chap-1', pageIndex: 0, cleanUrl: 'https://cdn/x.png',
      translatedDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(save.ok).toBe(true);

    const got = await send('SM_GET_PAGE', { chapterId: 'chap-1', pageIndex: 0 });
    expect(got.ok).toBe(true);
    expect(got.page || got.result || got.data).toBeTruthy();
  });

  test('SM_DELETE_CLEAN_URL remove e SM_GET_PAGE passa a retornar vazio', async () => {
    await send('SM_DELETE_CLEAN_URL', { cleanUrl: 'https://cdn/x.png' });
    const got = await send('SM_GET_PAGE', { chapterId: 'chap-1', pageIndex: 0 });
    expect(got.page ?? got.result ?? null).toBeNull();
  });

  test('ação SM_ desconhecida responde ok:false', async () => {
    const r = await send('SM_NAO_EXISTE');
    expect(r).toMatchObject({ ok: false });
  });
});
// NOTA: os nomes dos campos da resposta (page/result) devem ser conferidos em
// background.js:191-215 e storage-manager.js antes de fixar as asserções.`,
  },
  {
    id: 'NT-08',
    file: 'tests/unit/background/gtc-destructive-gating.test.js (após correção SEC-04)',
    objective: 'Garantir que `GTC_CLEAR_ALL` só é aceito de origem "popup" e que a resposta de negação tem formato estável.',
    setup: 'Carregar background.js real; `gtcRepository.clear` espiado.',
    action: 'Enviar `GTC_CLEAR_ALL` com sender de content script (tab.url = site qualquer) e depois com sender popup (sem tab, id = runtime.id).',
    expected: 'Content: `{ok:false, error:{code:"SOURCE_DENIED"}}` e `clear` NÃO chamado. Popup: `clear` chamado e `{ok:true, cleared:true}`.',
    bugPrevented: 'Limpeza acidental/maliciosa do cache global a partir de qualquer aba.',
    code: `// Depende de refatorar GTC_CLEAR_ALL para registerAction({ meta: { allowedSources: ['popup'] } })
describe('GTC_CLEAR_ALL — gate de origem', () => {
  test('content script não pode limpar o cache global', async () => {
    const clearSpy = jest.fn(async () => {});
    // injetar repository fake via contextFactory / self.MangaTranslatorGtcIndexedDb conforme background.js:223-232
    const r = await send('GTC_CLEAR_ALL', {}, { tab: { id: 5, url: 'https://manga.test/' } });
    expect(r).toEqual({ ok: false, error: { code: 'SOURCE_DENIED' } });
    expect(clearSpy).not.toHaveBeenCalled();
  });

  test('popup pode limpar o cache global', async () => {
    const r = await send('GTC_CLEAR_ALL', {}, { id: chrome.runtime.id });
    expect(r).toMatchObject({ ok: true, cleared: true });
  });
});`,
  },
  {
    id: 'NT-09',
    file: 'tests/unit/content-manga/perceptual-cache-flow-real.test.js',
    objective: 'Cobrir `generateImageFingerprint` e `queryGlobalTranslationCache*` reais (content_manga.js:323-676; hoje 0 hits) incluindo canvas "tainted".',
    setup: '`loadContentScript` (helper existente) com `domImages` de 800×1200. Stub de `HTMLCanvasElement.prototype.getContext` para retornar contexto cujo `getImageData` lança `SecurityError` no primeiro caso e retorna pixels no segundo. Interceptar `chrome.runtime.sendMessage` para `FETCH_IMAGE_AS_BASE64` e `GTC_QUERY_*`.',
    action: 'Disparar o fluxo de tradução (mensagem `START_TRANSLATION`/clique no botão conforme handlers em content_manga.js:2702+) com cache respondendo hit e miss.',
    expected: 'Tainted → envia `FETCH_IMAGE_AS_BASE64` com a URL da imagem e prossegue; hit → `applyImageReplacement` aplicado (img.dataset.translated === "true") sem abrir job; miss → `START_BATCH` enviado ao background.',
    bugPrevented: 'Quebra silenciosa do cache perceptual (todo hit vira miss → custo Gemini) ou do fallback CORS.',
    code: `const { loadContentScript } = require('../../helpers/load-content-script.js');
const { getRuntimeMock } = require('../../mocks/chrome-api.mock.js');

function stubCanvas({ tainted }) {
  const ctx = {
    drawImage: jest.fn(),
    getImageData: jest.fn(() => {
      if (tainted) { const e = new Error('Tainted canvas'); e.name = 'SecurityError'; throw e; }
      return { data: new Uint8ClampedArray(32 * 32 * 4).fill(128), width: 32, height: 32 };
    }),
  };
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  return ctx;
}

describe('content_manga.js — cache perceptual (REAL)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('canvas tainted → fallback FETCH_IMAGE_AS_BASE64', async () => {
    stubCanvas({ tainted: true });
    const sent = [];
    getRuntimeMock().sendMessage = jest.fn((msg, cb) => {
      sent.push(msg.action);
      if (msg.action === 'FETCH_IMAGE_AS_BASE64') cb && cb({ ok: true, dataUrl: 'data:image/png;base64,AAAA' });
      else if (msg.action && msg.action.startsWith('GTC_')) cb && cb({ ok: true, results: [] });
      else cb && cb({ ok: true });
    });

    const cs = await loadContentScript({
      domImages: [{ src: 'https://cdn.test/p1.png', width: 800, height: 1200 }],
    });
    await cs.sendMessage('START_TRANSLATION', { indices: [0] });
    await new Promise(r => setTimeout(r, 200));

    expect(sent).toContain('FETCH_IMAGE_AS_BASE64');
  });

  test('cache hit substitui a imagem sem iniciar lote', async () => {
    stubCanvas({ tainted: false });
    const sent = [];
    getRuntimeMock().sendMessage = jest.fn((msg, cb) => {
      sent.push(msg.action);
      if (msg.action && msg.action.startsWith('GTC_QUERY')) {
        cb && cb({ ok: true, results: [{ translatedDataUrl: 'data:image/png;base64,BBBB', distance: 0 }] });
      } else cb && cb({ ok: true });
    });

    const cs = await loadContentScript({
      domImages: [{ src: 'https://cdn.test/p1.png', width: 800, height: 1200 }],
    });
    await cs.sendMessage('START_TRANSLATION', { indices: [0] });
    await new Promise(r => setTimeout(r, 200));

    expect(sent).not.toContain('START_BATCH');
    expect(document.querySelector('img').dataset.translated).toBe('true');
  });
});
// NOTA: confirmar o nome da mensagem de início (START_TRANSLATION vs clique no
// botão #manga-translator-trigger) em content_manga.js:2702-2770 e o formato de
// resposta esperado por queryGlobalTranslationCache (content_manga.js:466).`,
  },
];

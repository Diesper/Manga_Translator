# Bíblia técnica — `extension/content/cm-gtc-client.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `95d062f41b9f1bd789a576c3a5c5d903b705fa55`  
> **Linhas textuais:** **161**  
> **Posições documentais:** **162** contando newline final

## 1. Papel arquitetural

`cm-gtc-client.js` é a boundary do Global Translation Cache (GTC) no content script. Ele transforma imagens em fingerprints, consulta múltiplos índices do cache por IPC e salva resultados traduzidos, mantendo compatibilidade com storage legado.

O manifest carrega `shared/gtc-fingerprint.js` antes dele, e `content_manga.js` depois. O helper de testes `load-content-script.js` reproduz essa ordem real. `content_manga.js` exige `window.MangaTranslatorGtcClient` e reatribui seus pontos de chamada para esta API.

## 2. Duplicação histórica em content_manga

`content_manga.js` ainda contém implementações locais históricas de fingerprint/query/save antes de rebindar as variáveis para `cmGtcClient` nas linhas ~681–693. Depois desse ponto, o pipeline real usa este módulo.

Isso é dívida técnica: testes que apenas leem/replicam a implementação antiga não provam este arquivo. Os testes via `loadContentScript()` são mais fortes porque carregam `cm-gtc-client.js` e então o `content_manga.js` real.

## 3. IPC normalizado

`sendRuntimeMessageAsync` retorna `{ok:false,error:'runtime_unavailable'}` quando Chrome runtime não existe, converte `runtime.lastError` em erro e evita que callback sem resposta vire sucesso. Todos os queries/saves modernos dependem dessa normalização.

## 4. Fingerprint visual

`generateImageFingerprint` calcula:

- sample 8×8 para descriptor SHA;
- dHash 9×8;
- wHash/pHash 32×32;
- wHashCrop/pHashCrop para imagens não quadradas;
- regionalHashes em 48×48.

Se canvas falha por CORS/taint, envia `CALCULATE_VISUAL_FINGERPRINT` para o background e mescla os campos retornados. Se o fallback também falha, mantém `pixelSample='nopixels'` e hashes perceptuais null; desde que `createFingerprintFromDescriptor` exista, ainda produz SHA descriptor visual-v1.

A versão é: v4 se há crop hash; senão v3 se há w/p; v2 se só dHash; v1 caso contrário.

## 5. Queries de cache

`queryGlobalTranslationCache` deduplica SHA hashes, consulta `GTC_QUERY_MANY` e, se não recebe `entriesByHash`, lê `gtc_<hash>` do `chrome.storage.local` legado.

`queryGlobalTranslationCacheByDHash` consulta visual-v2.

As APIs `queryGlobalTranslationCacheByPerceptual`, `...Crop` e `...Relaxed` permanecem exportadas como compatibilidade de listas independentes. O pipeline moderno usa `queryPerceptualCorrelated`, que envia cada imagem como `{queryId,wHash,pHash,width,height}` para `GTC_QUERY_PERCEPTUAL_V2`. Isso evita produto cruzado entre hashes de páginas diferentes.

`extract-flow-real.test.js` executa o pipeline real com o módulo carregado e prova a sequência strict→crop e strict→crop→relaxed, incluindo `CALCULATE_VISUAL_FINGERPRINT`, `GTC_QUERY_MANY`, dHash e V2 correlacionado.

## 6. Save e compatibilidade legada

`saveGlobalTranslationCacheEntry` envia hash, Data URL e metadados (d/w/p, crop, regional, cleanUrl, dimensões, versão, mimeType) via `GTC_SAVE`. Se a bridge não confirma `ok`, grava `gtc_<hash>` no storage local como fallback.

Importante: após escrever o fallback legado, a função ainda retorna `false`. Portanto o booleano significa **save moderno confirmado**, não “alguma persistência ocorreu”. Callers atuais fazem `.catch(() => {})` e não usam esse booleano como ACK de persistência de página.

## 7. Confirmação regional

`confirmWithRegionalHashes` requer query + entry + fingerprint API. Se `matchRegionalHashes` não existe, aceita (`true`); se existe, usa `{threshold:8,minMatches:3}`.

Há uma diferença relevante em relação à simulação visual antiga: `tests/visual/content-manga-pipeline.visual.js` contém uma função inline que retorna `true` quando dados regionais faltam. **Essa simulação não é prova desta implementação**, porque este módulo retorna `false` quando query/entry/api faltam.

## 8. Evidência de testes

| Comportamento | Evidência | Classificação |
|---|---|---|
| módulo carregado antes de content_manga | `tests/helpers/load-content-script.js` | 🟦 GATE/HARNESS ESPECÍFICO |
| lote todo em SHA cache evita START_BATCH | `extract-flow-real.test.js` | ✅ PROVADO NO PIPELINE REAL COM ESTE MÓDULO |
| CORS → CALCULATE_VISUAL_FINGERPRINT | `extract-flow-real.test.js` visual-v4 crop/relaxed | ✅ PROVADO NO PIPELINE REAL |
| query correlacionada strict/crop | caso visual-v4 center-crop | ✅ PROVADO DIRETAMENTE PELO IPC OBSERVADO |
| query correlacionada strict/crop/relaxed | caso visual-v4 relaxed | ✅ PROVADO DIRETAMENTE PELO IPC OBSERVADO |
| confirmação regional no pipeline relaxed | mesmo caso, log GTC_F5C_REGIONAL_RESULT | 🟨 EXECUTADO INDIRETAMENTE; não isola retorno false/true do helper |
| bridge GTC runtime/IndexedDB | `gtc-runtime-bridge.test.js` / `indexeddb.test.js` | 🟨 DEPENDÊNCIA DOWNSTREAM; não prova este cliente |
| `content-manga-pipeline.visual.js` fingerprint/save/regional | funções reimplementadas inline | 🟨 SIMULAÇÃO COMPLEMENTAR, NÃO PROVA DIRETA |

## 9. Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `sendRuntimeMessageAsync` com runtime ausente, `runtime.lastError` e callback undefined isoladamente neste módulo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `getCleanUrl` Reddit/Imgur/URL inválida; a lógica duplica parcialmente `cm-dom-replace.js` e pode divergir no futuro.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para canvas local bem-sucedido cobrindo todos os hashes v1/v2/v3/v4 deste arquivo; os testes fortes de fingerprint isolam `gtc-fingerprint.js` ou usam simulações.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para fallback CORS do SW retornando somente subconjunto dos campos.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para ausência de `createFingerprintFromDescriptor`; a função retorna null.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para fallback legado `GTC_QUERY_MANY → chrome.storage.local.get(gtc_*)` neste arquivo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para APIs perceptuais legadas de listas independentes (`GTC_QUERY_BY_PERCEPTUAL`, `_CROP`, `_RELAXED`) através deste módulo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `queryPerceptualCorrelated([])` e candidates sem w/p.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para save com hash/data ausente retornando false neste módulo real.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para GTC_SAVE falhar e fallback legado escrever `gtc_<hash>`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `confirmWithRegionalHashes` com dados ausentes. A implementação atual retorna false, enquanto uma simulação visual antiga retorna true.
- ⚠️ Duplicação de `getCleanUrl` entre este arquivo e `cm-dom-replace.js` aumenta risco de chaves divergentes entre scanning/restore e fingerprint/cache.
- ⚠️ Duplicação histórica das funções GTC dentro de `content_manga.js` aumenta risco de documentação/teste atingir a cópia morta em vez da implementação ativa.
- ⚠️ Cada fingerprint pode criar até cinco canvases; em páginas grandes, custo de rasterização é proporcional ao número de imagens e dimensões de samples.

## 10. Segurança e privacidade

- O fallback SW envia a URL original da imagem para o background, que possui privilégios de fetch; isso cruza boundary de privilégio e deve continuar restrito ao action esperado.
- O módulo pode enviar Data URLs traduzidas grandes em `GTC_SAVE`.
- O fallback legado persiste Data URL diretamente em `chrome.storage.local`, aumentando uso de quota em ambientes onde a bridge moderna falha.
- Não há fetch direto neste content script; cross-origin privilegiado é delegado ao background.

## 11. Invariantes

1. Queries devem deduplicar valores falsy/duplicados antes do IPC.
2. `queryPerceptualCorrelated` deve preservar pares wHash/pHash por imagem; nunca reintroduzir produto cruzado.
3. CORS local não pode abortar fingerprint; deve tentar `CALCULATE_VISUAL_FINGERPRINT` quando URL é http(s).
4. Falha total do perceptual ainda pode degradar para visual-v1 se descriptor API existir.
5. Versionamento v1/v2/v3/v4 deve refletir quais hashes realmente existem.
6. Save moderno deve carregar todos os metadados perceptuais disponíveis.
7. Fallback legado não deve ser confundido com confirmação do save moderno.
8. Alterações em `getCleanUrl` precisam ser mantidas consistentes com `cm-dom-replace.js` e auto-restore/cache.
9. `confirmWithRegionalHashes` precisa manter threshold/minMatches alinhados com a fingerprint API/downstream.
10. O manifest/harness deve carregar `gtc-fingerprint.js` antes deste módulo e este módulo antes de `content_manga.js`.

## 12. Fonte integral

~~~javascript
'use strict';

// GTC client for content_manga.  This is a classic content-script module (not an
// ES module) because Chromium injects the files declared in manifest.json into
// the same isolated world.  Keep its public API on window so it can also be
// loaded independently by the test harness.
(function attachContentGtcClient(rootScope) {
    function fingerprintApi() {
        return rootScope.MangaTranslatorGtcFingerprint
            || (typeof self !== 'undefined' && self.MangaTranslatorGtcFingerprint)
            || null;
    }

    function sendRuntimeMessageAsync(message) {
        return new Promise(resolve => {
            if (!rootScope.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                resolve({ ok: false, error: 'runtime_unavailable' });
                return;
            }
            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
                else resolve(response || { ok: false });
            });
        });
    }

    function getCleanUrl(rawUrl) {
        if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return null;
        try {
            const base = (rootScope.location && (rootScope.location.origin || rootScope.location.href))
                || (rootScope.document && rootScope.document.baseURI)
                || 'https://manga-translator.invalid/';
            const url = new URL(rawUrl, base);
            if (url.hostname === 'preview.redd.it' || url.hostname === 'external-preview.redd.it') {
                const match = url.pathname.match(/[-]([a-z0-9]{8,})(\.[a-z]+)$/i);
                return match ? `https://i.redd.it/${match[1]}${match[2].toLowerCase()}` : `https://i.redd.it${url.pathname}`.toLowerCase();
            }
            if (url.hostname === 'i.redd.it') return `${url.protocol}//${url.hostname}${url.pathname}`.toLowerCase();
            if (url.hostname.includes('imgur.com')) {
                const path = url.pathname.replace(/([a-zA-Z0-9]{5,})[bmlhts](\.[a-z]+)$/i, '$1$2');
                return `${url.protocol}//${url.hostname}${path}`.toLowerCase();
            }
            const resizeParams = ['width', 'w', 'h', 'height', 'size', 'quality', 'q', 'format', 'auto', 'crop', 'fit', 'resize', 'scale', 'dpr', 'webp', 'avif', 'thumb', 'thumbnail', 'tr', 'im'];
            let changed = false;
            resizeParams.forEach(param => { if (url.searchParams.has(param)) { url.searchParams.delete(param); changed = true; } });
            return `${url.protocol}//${url.host}${url.pathname}${changed && url.search ? url.search : ''}`.toLowerCase();
        } catch (_) {
            return String(rawUrl).split('?')[0].split('#')[0].toLowerCase();
        }
    }

    async function generateImageFingerprint(imgEl) {
        try {
            const api = fingerprintApi();
            const cleanUrl = getCleanUrl(imgEl.src) || '';
            const width = imgEl.naturalWidth || 0;
            const height = imgEl.naturalHeight || 0;
            let pixelSample = 'nopixels', dHash = null, wHash = null, pHash = null;
            let wHashCrop = null, pHashCrop = null, regionalHashes = null;
            try {
                const canvas = rootScope.document.createElement('canvas');
                canvas.width = 8; canvas.height = 8;
                const context = canvas.getContext('2d');
                context.drawImage(imgEl, 0, 0, 8, 8);
                pixelSample = Array.from(context.getImageData(0, 0, 8, 8).data).map(byte => byte.toString(16).padStart(2, '0')).join('');
                if (api && typeof api.calculateDHash === 'function') {
                    const c = rootScope.document.createElement('canvas'); c.width = 9; c.height = 8;
                    const ctx = c.getContext('2d'); ctx.drawImage(imgEl, 0, 0, 9, 8);
                    dHash = api.calculateDHash(ctx.getImageData(0, 0, 9, 8).data);
                }
                if (api && (typeof api.calculateWHash === 'function' || typeof api.calculatePHash === 'function')) {
                    const c = rootScope.document.createElement('canvas'); c.width = 32; c.height = 32;
                    const ctx = c.getContext('2d'); ctx.drawImage(imgEl, 0, 0, 32, 32);
                    const data = ctx.getImageData(0, 0, 32, 32).data;
                    if (typeof api.calculateWHash === 'function') wHash = api.calculateWHash(data);
                    if (typeof api.calculatePHash === 'function') pHash = api.calculatePHash(data);
                    const sourceWidth = imgEl.naturalWidth || imgEl.width || 0;
                    const sourceHeight = imgEl.naturalHeight || imgEl.height || 0;
                    const side = Math.min(sourceWidth, sourceHeight);
                    if (side > 0 && sourceWidth !== sourceHeight) {
                        const crop = rootScope.document.createElement('canvas'); crop.width = 32; crop.height = 32;
                        const cropCtx = crop.getContext('2d');
                        cropCtx.drawImage(imgEl, Math.floor((sourceWidth - side) / 2), Math.floor((sourceHeight - side) / 2), side, side, 0, 0, 32, 32);
                        const cropData = cropCtx.getImageData(0, 0, 32, 32).data;
                        if (typeof api.calculateWHash === 'function') wHashCrop = api.calculateWHash(cropData);
                        if (typeof api.calculatePHash === 'function') pHashCrop = api.calculatePHash(cropData);
                    }
                }
                if (api && typeof api.calculateRegionalHashes === 'function') {
                    const c = rootScope.document.createElement('canvas'); c.width = 48; c.height = 48;
                    const ctx = c.getContext('2d'); ctx.drawImage(imgEl, 0, 0, 48, 48);
                    regionalHashes = api.calculateRegionalHashes(ctx.getImageData(0, 0, 48, 48).data);
                }
            } catch (_) {
                if (imgEl.src && !imgEl.src.startsWith('data:') && !imgEl.src.startsWith('blob:')) {
                    const response = await sendRuntimeMessageAsync({ action: 'CALCULATE_VISUAL_FINGERPRINT', url: imgEl.src });
                    if (response && response.ok) {
                        pixelSample = response.pixelSample || pixelSample; dHash = response.dHash || dHash;
                        wHash = response.wHash || wHash; pHash = response.pHash || pHash;
                        wHashCrop = response.wHashCrop || wHashCrop; pHashCrop = response.pHashCrop || pHashCrop;
                        regionalHashes = response.regionalHashes || regionalHashes;
                    }
                }
            }
            if (!api || typeof api.createFingerprintFromDescriptor !== 'function') return null;
            const sha256 = await api.createFingerprintFromDescriptor({ width, height, cleanUrl, pixelSample, hasVisualPixels: pixelSample !== 'nopixels' });
            const fingerprintVersion = wHashCrop || pHashCrop ? 'visual-v4' : wHash || pHash ? 'visual-v3' : dHash ? 'visual-v2' : 'visual-v1';
            return { sha256, dHash, wHash, pHash, wHashCrop, pHashCrop, regionalHashes, fingerprintVersion };
        } catch (_) { return null; }
    }

    function unique(values) { return Array.from(new Set((values || []).filter(Boolean))); }
    async function queryGlobalTranslationCache(hashes) {
        const normalized = unique(hashes); if (!normalized.length) return {};
        const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_MANY', hashes: normalized });
        if (response && response.ok && response.entriesByHash) return response.entriesByHash;
        if (!rootScope.chrome || !chrome.storage || !chrome.storage.local) return {};
        const legacy = await new Promise(resolve => chrome.storage.local.get(normalized.map(hash => `gtc_${hash}`), resolve));
        return normalized.reduce((entries, hash) => { if (legacy[`gtc_${hash}`]) entries[hash] = legacy[`gtc_${hash}`]; return entries; }, {});
    }
    async function queryGlobalTranslationCacheByDHash(dHashes) {
        const d = unique(dHashes); if (!d.length) return {};
        const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_BY_DHASH', dHashes: d });
        return response && response.ok && response.entriesByDHash ? response.entriesByDHash : {};
    }
    async function queryGlobalTranslationCacheByPerceptual(wHashes, pHashes) {
        const w = unique(wHashes), p = unique(pHashes); if (!w.length && !p.length) return {};
        const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_BY_PERCEPTUAL', wHashes: w, pHashes: p });
        return response && response.ok && response.entriesByPerceptual ? response.entriesByPerceptual : {};
    }
    async function queryPerceptualCorrelated(candidates, mode = 'strict') {
        const queries = (candidates || []).filter(c => c && (c.wHash || c.pHash)).map(c => ({ queryId: String(c.i), wHash: c.wHash || '', pHash: c.pHash || '', width: c.width || 0, height: c.height || 0 }));
        if (!queries.length) return {};
        const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_PERCEPTUAL_V2', queries, mode });
        return response && response.ok && response.entriesByQueryId ? response.entriesByQueryId : {};
    }
    async function queryGlobalTranslationCacheByPerceptualCrop(wHashesCrop, pHashesCrop) {
        const w = unique(wHashesCrop), p = unique(pHashesCrop); if (!w.length && !p.length) return {};
        const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_BY_PERCEPTUAL_CROP', wHashesCrop: w, pHashesCrop: p });
        return response && response.ok && response.entriesByPerceptualCrop ? response.entriesByPerceptualCrop : {};
    }
    async function queryGlobalTranslationCacheByPerceptualRelaxed(wHashes, pHashes) {
        const w = unique(wHashes), p = unique(pHashes); if (!w.length && !p.length) return {};
        const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_BY_PERCEPTUAL_RELAXED', wHashes: w, pHashes: p });
        return response && response.ok && response.entriesByPerceptualRelaxed ? response.entriesByPerceptualRelaxed : {};
    }
    async function saveGlobalTranslationCacheEntry(hash, translatedDataUrl, metadata = {}) {
        if (!hash || !translatedDataUrl) return false;
        const response = await sendRuntimeMessageAsync({ action: 'GTC_SAVE', hash, translatedDataUrl, dHash: metadata.dHash || null, wHash: metadata.wHash || null, pHash: metadata.pHash || null, wHashCrop: metadata.wHashCrop || null, pHashCrop: metadata.pHashCrop || null, regionalHashes: metadata.regionalHashes || null, cleanUrl: metadata.cleanUrl || null, width: metadata.width || 0, height: metadata.height || 0, fingerprintVersion: metadata.fingerprintVersion || 'visual-v3', mimeType: metadata.mimeType || null });
        if (response && response.ok) return true;
        if (rootScope.chrome && chrome.storage && chrome.storage.local) await chrome.storage.local.set({ [`gtc_${hash}`]: translatedDataUrl });
        return false;
    }
    function confirmWithRegionalHashes(queryRegional, entryRegional) {
        const api = fingerprintApi();
        if (!queryRegional || !entryRegional || !api) return false;
        if (typeof api.matchRegionalHashes !== 'function') return true;
        return api.matchRegionalHashes(queryRegional, entryRegional, { threshold: 8, minMatches: 3 }).match;
    }
    rootScope.MangaTranslatorGtcClient = Object.freeze({ getCleanUrl, generateImageFingerprint, queryGlobalTranslationCache, queryGlobalTranslationCacheByDHash, queryGlobalTranslationCacheByPerceptual, queryPerceptualCorrelated, queryGlobalTranslationCacheByPerceptualCrop, queryGlobalTranslationCacheByPerceptualRelaxed, saveGlobalTranslationCacheEntry, confirmWithRegionalHashes, sendRuntimeMessageAsync });
})(typeof window !== 'undefined' ? window : self);
~~~

## 13. Rastreabilidade 162/162

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | ␠ [linha vazia] | Separador visual dentro de U01. |
| 003 | U01 | // GTC client for content_manga.  This is a classic content-script module (not an | Comentário arquitetural: GTC client for content_manga.  This is a classic content-script module (not an. |
| 004 | U01 | // ES module) because Chromium injects the files declared in manifest.json into | Comentário arquitetural: ES module) because Chromium injects the files declared in manifest.json into. |
| 005 | U01 | // the same isolated world.  Keep its public API on window so it can also be | Comentário arquitetural: the same isolated world.  Keep its public API on window so it can also be. |
| 006 | U01 | // loaded independently by the test harness. | Comentário arquitetural: loaded independently by the test harness.. |
| 007 | U01 | (function attachContentGtcClient(rootScope) { | Abre IIFE que recebe window/self. |
| 008 | U02 |     function fingerprintApi() { | Abre função de U02: function fingerprintApi() { |
| 009 | U02 |         return rootScope.MangaTranslatorGtcFingerprint | Resolve a implementação compartilhada de fingerprints. |
| 010 | U02 |             \|\| (typeof self !== 'undefined' && self.MangaTranslatorGtcFingerprint) | Resolve a implementação compartilhada de fingerprints. |
| 011 | U02 |             \|\| null; | Parte concreta de U02: // null; |
| 012 | U02 |     } | Fecha/continua estrutura sintática de U02. |
| 013 | U02 | ␠ [linha vazia] | Separador visual dentro de U02. |
| 014 | U03 |     function sendRuntimeMessageAsync(message) { | Abre função de U03: function sendRuntimeMessageAsync(message) { |
| 015 | U03 |         return new Promise(resolve => { | Converte API callback em Promise. |
| 016 | U03 |             if (!rootScope.chrome \|\| !chrome.runtime \|\| !chrome.runtime.sendMessage) { | Envia IPC ao background/bridge GTC. |
| 017 | U03 |                 resolve({ ok: false, error: 'runtime_unavailable' }); | Retorna erro normalizado quando runtime não está disponível. |
| 018 | U03 |                 return; | Parte concreta de U03: return; |
| 019 | U03 |             } | Fecha/continua estrutura sintática de U03. |
| 020 | U03 |             chrome.runtime.sendMessage(message, response => { | Envia IPC ao background/bridge GTC. |
| 021 | U03 |                 if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message }); | Converte lastError em objeto de falha. |
| 022 | U03 |                 else resolve(response \|\| { ok: false }); | Evita resposta undefined ser interpretada como sucesso. |
| 023 | U03 |             }); | Fecha/continua estrutura sintática de U03. |
| 024 | U03 |         }); | Fecha/continua estrutura sintática de U03. |
| 025 | U03 |     } | Fecha/continua estrutura sintática de U03. |
| 026 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 027 | U04 |     function getCleanUrl(rawUrl) { | Abre função de U04: function getCleanUrl(rawUrl) { |
| 028 | U04 |         if (!rawUrl \|\| rawUrl.startsWith('data:') \|\| rawUrl.startsWith('blob:')) return null; | Descarta URL transitória/local como chave limpa. |
| 029 | U04 |         try { | Parte concreta de U04: try { |
| 030 | U04 |             const base = (rootScope.location && (rootScope.location.origin \|\| rootScope.location.href)) | Parte concreta de U04: const base = (rootScope.location && (rootScope.location.origin // rootScope.location.href)) |
| 031 | U04 |                 \|\| (rootScope.document && rootScope.document.baseURI) | Parte concreta de U04: // (rootScope.document && rootScope.document.baseURI) |
| 032 | U04 |                 \|\| 'https://manga-translator.invalid/'; | Parte concreta de U04: // 'https://manga-translator.invalid/'; |
| 033 | U04 |             const url = new URL(rawUrl, base); | Resolve URL absoluta a partir do contexto atual. |
| 034 | U04 |             if (url.hostname === 'preview.redd.it' \|\| url.hostname === 'external-preview.redd.it') { | Canonicaliza preview Reddit para i.redd.it. |
| 035 | U04 |                 const match = url.pathname.match(/[-]([a-z0-9]{8,})(\.[a-z]+)$/i); | Parte concreta de U04: const match = url.pathname.match(/[-]([a-z0-9]{8,})(\.[a-z]+)$/i); |
| 036 | U04 |                 return match ? `https://i.redd.it/${match[1]}${match[2].toLowerCase()}` : `https://i.redd.it${url.pathname}`.toLowerCase(); | Parte concreta de U04: return match ? `https://i.redd.it/${match[1]}${match[2].toLowerCase()}` : `https://i.redd.it${url.pathname}`.toLowerCase(); |
| 037 | U04 |             } | Fecha/continua estrutura sintática de U04. |
| 038 | U04 |             if (url.hostname === 'i.redd.it') return `${url.protocol}//${url.hostname}${url.pathname}`.toLowerCase(); | Parte concreta de U04: if (url.hostname === 'i.redd.it') return `${url.protocol}//${url.hostname}${url.pathname}`.toLowerCase(); |
| 039 | U04 |             if (url.hostname.includes('imgur.com')) { | Remove sufixo de thumbnail do Imgur. |
| 040 | U04 |                 const path = url.pathname.replace(/([a-zA-Z0-9]{5,})[bmlhts](\.[a-z]+)$/i, '$1$2'); | Parte concreta de U04: const path = url.pathname.replace(/([a-zA-Z0-9]{5,})[bmlhts](\.[a-z]+)$/i, '$1$2'); |
| 041 | U04 |                 return `${url.protocol}//${url.hostname}${path}`.toLowerCase(); | Parte concreta de U04: return `${url.protocol}//${url.hostname}${path}`.toLowerCase(); |
| 042 | U04 |             } | Fecha/continua estrutura sintática de U04. |
| 043 | U04 |             const resizeParams = ['width', 'w', 'h', 'height', 'size', 'quality', 'q', 'format', 'auto', 'crop', 'fit', 'resize', 'scale', 'dpr', 'webp', 'avif', 'thumb', 'thumbnail', 'tr', 'im']; | Lista query params de resize/qualidade a remover. |
| 044 | U04 |             let changed = false; | Parte concreta de U04: let changed = false; |
| 045 | U04 |             resizeParams.forEach(param => { if (url.searchParams.has(param)) { url.searchParams.delete(param); changed = true; } }); | Lista query params de resize/qualidade a remover. |
| 046 | U04 |             return `${url.protocol}//${url.host}${url.pathname}${changed && url.search ? url.search : ''}`.toLowerCase(); | Parte concreta de U04: return `${url.protocol}//${url.host}${url.pathname}${changed && url.search ? url.search : ''}`.toLowerCase(); |
| 047 | U04 |         } catch (_) { | Degrada falha de canvas/CORS sem abortar o pipeline. |
| 048 | U04 |             return String(rawUrl).split('?')[0].split('#')[0].toLowerCase(); | Fallback para URL inválida removendo query/hash. |
| 049 | U04 |         } | Fecha/continua estrutura sintática de U04. |
| 050 | U04 |     } | Fecha/continua estrutura sintática de U04. |
| 051 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 052 | U05 |     async function generateImageFingerprint(imgEl) { | Abre função de U05: async function generateImageFingerprint(imgEl) { |
| 053 | U05 |         try { | Parte concreta de U05: try { |
| 054 | U05 |             const api = fingerprintApi(); | Obtém primitives de hash compartilhadas. |
| 055 | U05 |             const cleanUrl = getCleanUrl(imgEl.src) \|\| ''; | Deriva identidade URL usada no descriptor SHA. |
| 056 | U05 |             const width = imgEl.naturalWidth \|\| 0; | Captura dimensões naturais da imagem. |
| 057 | U05 |             const height = imgEl.naturalHeight \|\| 0; | Captura dimensões naturais da imagem. |
| 058 | U05 |             let pixelSample = 'nopixels', dHash = null, wHash = null, pHash = null; | Inicializa estado degradado quando canvas não puder ser lido. |
| 059 | U05 |             let wHashCrop = null, pHashCrop = null, regionalHashes = null; | Parte concreta de U05: let wHashCrop = null, pHashCrop = null, regionalHashes = null; |
| 060 | U05 |             try { | Parte concreta de U05: try { |
| 061 | U05 |                 const canvas = rootScope.document.createElement('canvas'); | Cria canvas temporário para amostragem visual. |
| 062 | U05 |                 canvas.width = 8; canvas.height = 8; | Configura sample 8×8 usado no descriptor exato. |
| 063 | U05 |                 const context = canvas.getContext('2d'); | Parte concreta de U05: const context = canvas.getContext('2d'); |
| 064 | U05 |                 context.drawImage(imgEl, 0, 0, 8, 8); | Rasteriza a imagem em resolução apropriada ao hash. |
| 065 | U05 |                 pixelSample = Array.from(context.getImageData(0, 0, 8, 8).data).map(byte => byte.toString(16).padStart(2, '0')).join(''); | Lê pixels RGBA para cálculo de sample/hash. |
| 066 | U05 |                 if (api && typeof api.calculateDHash === 'function') { | Calcula dHash visual-v2 quando API suporta. |
| 067 | U05 |                     const c = rootScope.document.createElement('canvas'); c.width = 9; c.height = 8; | Cria canvas temporário para amostragem visual. |
| 068 | U05 |                     const ctx = c.getContext('2d'); ctx.drawImage(imgEl, 0, 0, 9, 8); | Rasteriza a imagem em resolução apropriada ao hash. |
| 069 | U05 |                     dHash = api.calculateDHash(ctx.getImageData(0, 0, 9, 8).data); | Lê pixels RGBA para cálculo de sample/hash. |
| 070 | U05 |                 } | Fecha/continua estrutura sintática de U05. |
| 071 | U05 |                 if (api && (typeof api.calculateWHash === 'function' \|\| typeof api.calculatePHash === 'function')) { | Calcula wHash perceptual visual-v3/v4 quando disponível. |
| 072 | U05 |                     const c = rootScope.document.createElement('canvas'); c.width = 32; c.height = 32; | Cria canvas temporário para amostragem visual. |
| 073 | U05 |                     const ctx = c.getContext('2d'); ctx.drawImage(imgEl, 0, 0, 32, 32); | Rasteriza a imagem em resolução apropriada ao hash. |
| 074 | U05 |                     const data = ctx.getImageData(0, 0, 32, 32).data; | Lê pixels RGBA para cálculo de sample/hash. |
| 075 | U05 |                     if (typeof api.calculateWHash === 'function') wHash = api.calculateWHash(data); | Calcula wHash perceptual visual-v3/v4 quando disponível. |
| 076 | U05 |                     if (typeof api.calculatePHash === 'function') pHash = api.calculatePHash(data); | Calcula pHash perceptual complementar. |
| 077 | U05 |                     const sourceWidth = imgEl.naturalWidth \|\| imgEl.width \|\| 0; | Captura dimensões naturais da imagem. |
| 078 | U05 |                     const sourceHeight = imgEl.naturalHeight \|\| imgEl.height \|\| 0; | Captura dimensões naturais da imagem. |
| 079 | U05 |                     const side = Math.min(sourceWidth, sourceHeight); | Obtém dimensão original para center-crop quadrado. |
| 080 | U05 |                     if (side > 0 && sourceWidth !== sourceHeight) { | Obtém dimensão original para center-crop quadrado. |
| 081 | U05 |                         const crop = rootScope.document.createElement('canvas'); crop.width = 32; crop.height = 32; | Cria canvas temporário para amostragem visual. |
| 082 | U05 |                         const cropCtx = crop.getContext('2d'); | Parte concreta de U05: const cropCtx = crop.getContext('2d'); |
| 083 | U05 |                         cropCtx.drawImage(imgEl, Math.floor((sourceWidth - side) / 2), Math.floor((sourceHeight - side) / 2), side, side, 0, 0, 32, 32); | Rasteriza a imagem em resolução apropriada ao hash. |
| 084 | U05 |                         const cropData = cropCtx.getImageData(0, 0, 32, 32).data; | Lê pixels RGBA para cálculo de sample/hash. |
| 085 | U05 |                         if (typeof api.calculateWHash === 'function') wHashCrop = api.calculateWHash(cropData); | Calcula wHash perceptual visual-v3/v4 quando disponível. |
| 086 | U05 |                         if (typeof api.calculatePHash === 'function') pHashCrop = api.calculatePHash(cropData); | Calcula pHash perceptual complementar. |
| 087 | U05 |                     } | Fecha/continua estrutura sintática de U05. |
| 088 | U05 |                 } | Fecha/continua estrutura sintática de U05. |
| 089 | U05 |                 if (api && typeof api.calculateRegionalHashes === 'function') { | Calcula hashes dos cantos para confirmação espacial. |
| 090 | U05 |                     const c = rootScope.document.createElement('canvas'); c.width = 48; c.height = 48; | Cria canvas temporário para amostragem visual. |
| 091 | U05 |                     const ctx = c.getContext('2d'); ctx.drawImage(imgEl, 0, 0, 48, 48); | Rasteriza a imagem em resolução apropriada ao hash. |
| 092 | U05 |                     regionalHashes = api.calculateRegionalHashes(ctx.getImageData(0, 0, 48, 48).data); | Lê pixels RGBA para cálculo de sample/hash. |
| 093 | U05 |                 } | Fecha/continua estrutura sintática de U05. |
| 094 | U05 |             } catch (_) { | Degrada falha de canvas/CORS sem abortar o pipeline. |
| 095 | U05 |                 if (imgEl.src && !imgEl.src.startsWith('data:') && !imgEl.src.startsWith('blob:')) { | Descarta URL transitória/local como chave limpa. |
| 096 | U05 |                     const response = await sendRuntimeMessageAsync({ action: 'CALCULATE_VISUAL_FINGERPRINT', url: imgEl.src }); | Solicita fingerprint privilegiado ao background quando canvas local falha. |
| 097 | U05 |                     if (response && response.ok) { | Parte concreta de U05: if (response && response.ok) { |
| 098 | U05 |                         pixelSample = response.pixelSample \|\| pixelSample; dHash = response.dHash \|\| dHash; | Mescla sample/hashes recebidos do fallback SW. |
| 099 | U05 |                         wHash = response.wHash \|\| wHash; pHash = response.pHash \|\| pHash; | Parte concreta de U05: wHash = response.wHash // wHash; pHash = response.pHash // pHash; |
| 100 | U05 |                         wHashCrop = response.wHashCrop \|\| wHashCrop; pHashCrop = response.pHashCrop \|\| pHashCrop; | Parte concreta de U05: wHashCrop = response.wHashCrop // wHashCrop; pHashCrop = response.pHashCrop // pHashCrop; |
| 101 | U05 |                         regionalHashes = response.regionalHashes \|\| regionalHashes; | Parte concreta de U05: regionalHashes = response.regionalHashes // regionalHashes; |
| 102 | U05 |                     } | Fecha/continua estrutura sintática de U05. |
| 103 | U05 |                 } | Fecha/continua estrutura sintática de U05. |
| 104 | U05 |             } | Fecha/continua estrutura sintática de U05. |
| 105 | U05 |             if (!api \|\| typeof api.createFingerprintFromDescriptor !== 'function') return null; | Gera SHA-256 determinístico a partir de dimensões/URL/sample. |
| 106 | U05 |             const sha256 = await api.createFingerprintFromDescriptor({ width, height, cleanUrl, pixelSample, hasVisualPixels: pixelSample !== 'nopixels' }); | Gera SHA-256 determinístico a partir de dimensões/URL/sample. |
| 107 | U05 |             const fingerprintVersion = wHashCrop \|\| pHashCrop ? 'visual-v4' : wHash \|\| pHash ? 'visual-v3' : dHash ? 'visual-v2' : 'visual-v1'; | Classifica a melhor versão visual disponível (v1-v4). |
| 108 | U05 |             return { sha256, dHash, wHash, pHash, wHashCrop, pHashCrop, regionalHashes, fingerprintVersion }; | Classifica a melhor versão visual disponível (v1-v4). |
| 109 | U05 |         } catch (_) { return null; } | Degrada falha de canvas/CORS sem abortar o pipeline. |
| 110 | U05 |     } | Fecha/continua estrutura sintática de U05. |
| 111 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 112 | U06 |     function unique(values) { return Array.from(new Set((values \|\| []).filter(Boolean))); } | Abre função de U06: function unique(values) { return Array.from(new Set((values // []).filter(Boolean))); } |
| 113 | U06 |     async function queryGlobalTranslationCache(hashes) { | Abre função de U06: async function queryGlobalTranslationCache(hashes) { |
| 114 | U06 |         const normalized = unique(hashes); if (!normalized.length) return {}; | Parte concreta de U06: const normalized = unique(hashes); if (!normalized.length) return {}; |
| 115 | U06 |         const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_MANY', hashes: normalized }); | Consulta cache exato por lista deduplicada de SHA. |
| 116 | U06 |         if (response && response.ok && response.entriesByHash) return response.entriesByHash; | Retorna mapa moderno de hits exatos. |
| 117 | U06 |         if (!rootScope.chrome \|\| !chrome.storage \|\| !chrome.storage.local) return {}; | Parte concreta de U06: if (!rootScope.chrome // !chrome.storage // !chrome.storage.local) return {}; |
| 118 | U06 |         const legacy = await new Promise(resolve => chrome.storage.local.get(normalized.map(hash => `gtc_${hash}`), resolve)); | Converte API callback em Promise. |
| 119 | U06 |         return normalized.reduce((entries, hash) => { if (legacy[`gtc_${hash}`]) entries[hash] = legacy[`gtc_${hash}`]; return entries; }, {}); | Mapeia hash para storage legado. |
| 120 | U06 |     } | Fecha/continua estrutura sintática de U06. |
| 121 | U07 |     async function queryGlobalTranslationCacheByDHash(dHashes) { | Abre função de U07: async function queryGlobalTranslationCacheByDHash(dHashes) { |
| 122 | U07 |         const d = unique(dHashes); if (!d.length) return {}; | Parte concreta de U07: const d = unique(dHashes); if (!d.length) return {}; |
| 123 | U07 |         const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_BY_DHASH', dHashes: d }); | Consulta índice dHash. |
| 124 | U07 |         return response && response.ok && response.entriesByDHash ? response.entriesByDHash : {}; | Retorna mapa de hits dHash ou {}. |
| 125 | U07 |     } | Fecha/continua estrutura sintática de U07. |
| 126 | U08 |     async function queryGlobalTranslationCacheByPerceptual(wHashes, pHashes) { | Abre função de U08: async function queryGlobalTranslationCacheByPerceptual(wHashes, pHashes) { |
| 127 | U08 |         const w = unique(wHashes), p = unique(pHashes); if (!w.length && !p.length) return {}; | Parte concreta de U08: const w = unique(wHashes), p = unique(pHashes); if (!w.length && !p.length) return {}; |
| 128 | U08 |         const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_BY_PERCEPTUAL', wHashes: w, pHashes: p }); | Consulta API perceptual legada por listas independentes. |
| 129 | U08 |         return response && response.ok && response.entriesByPerceptual ? response.entriesByPerceptual : {}; | Retorna mapa perceptual legado. |
| 130 | U08 |     } | Fecha/continua estrutura sintática de U08. |
| 131 | U09 |     async function queryPerceptualCorrelated(candidates, mode = 'strict') { | Abre função de U09: async function queryPerceptualCorrelated(candidates, mode = 'strict') { |
| 132 | U09 |         const queries = (candidates \|\| []).filter(c => c && (c.wHash \|\| c.pHash)).map(c => ({ queryId: String(c.i), wHash: c.wHash \|\| '', pHash: c.pHash \|\| '', width: c.width \|\| 0, height: c.height \|\| 0 })); | Constrói queries correlacionadas por imagem. |
| 133 | U09 |         if (!queries.length) return {}; | Parte concreta de U09: if (!queries.length) return {}; |
| 134 | U09 |         const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_PERCEPTUAL_V2', queries, mode }); | Consulta bridge correlacionada com modo strict/crop/relaxed. |
| 135 | U09 |         return response && response.ok && response.entriesByQueryId ? response.entriesByQueryId : {}; | Retorna resultados indexados por queryId. |
| 136 | U09 |     } | Fecha/continua estrutura sintática de U09. |
| 137 | U10 |     async function queryGlobalTranslationCacheByPerceptualCrop(wHashesCrop, pHashesCrop) { | Abre função de U10: async function queryGlobalTranslationCacheByPerceptualCrop(wHashesCrop, pHashesCrop) { |
| 138 | U10 |         const w = unique(wHashesCrop), p = unique(pHashesCrop); if (!w.length && !p.length) return {}; | Parte concreta de U10: const w = unique(wHashesCrop), p = unique(pHashesCrop); if (!w.length && !p.length) return {}; |
| 139 | U10 |         const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_BY_PERCEPTUAL_CROP', wHashesCrop: w, pHashesCrop: p }); | Consulta API crop legada. |
| 140 | U10 |         return response && response.ok && response.entriesByPerceptualCrop ? response.entriesByPerceptualCrop : {}; | Retorna mapa perceptual legado. |
| 141 | U10 |     } | Fecha/continua estrutura sintática de U10. |
| 142 | U11 |     async function queryGlobalTranslationCacheByPerceptualRelaxed(wHashes, pHashes) { | Abre função de U11: async function queryGlobalTranslationCacheByPerceptualRelaxed(wHashes, pHashes) { |
| 143 | U11 |         const w = unique(wHashes), p = unique(pHashes); if (!w.length && !p.length) return {}; | Parte concreta de U11: const w = unique(wHashes), p = unique(pHashes); if (!w.length && !p.length) return {}; |
| 144 | U11 |         const response = await sendRuntimeMessageAsync({ action: 'GTC_QUERY_BY_PERCEPTUAL_RELAXED', wHashes: w, pHashes: p }); | Consulta API relaxed legada. |
| 145 | U11 |         return response && response.ok && response.entriesByPerceptualRelaxed ? response.entriesByPerceptualRelaxed : {}; | Retorna mapa perceptual legado. |
| 146 | U11 |     } | Fecha/continua estrutura sintática de U11. |
| 147 | U12 |     async function saveGlobalTranslationCacheEntry(hash, translatedDataUrl, metadata = {}) { | Abre função de U12: async function saveGlobalTranslationCacheEntry(hash, translatedDataUrl, metadata = {}) { |
| 148 | U12 |         if (!hash \|\| !translatedDataUrl) return false; | Rejeita save sem chave/resultado. |
| 149 | U12 |         const response = await sendRuntimeMessageAsync({ action: 'GTC_SAVE', hash, translatedDataUrl, dHash: metadata.dHash \|\| null, wHash: metadata.wHash \|\| null, pHash: metadata.pHash \|\| null, wHashCrop: metadata.wHashCrop \|\| null, pHashCrop: metadata.pHashCrop \|\| null, regionalHashes: metadata.regionalHashes \|\| null, cleanUrl: metadata.cleanUrl \|\| null, width: metadata.width \|\| 0, height: metadata.height \|\| 0, fingerprintVersion: metadata.fingerprintVersion \|\| 'visual-v3', mimeType: metadata.mimeType \|\| null }); | Classifica a melhor versão visual disponível (v1-v4). |
| 150 | U12 |         if (response && response.ok) return true; | Confirma save moderno quando bridge respondeu ok. |
| 151 | U12 |         if (rootScope.chrome && chrome.storage && chrome.storage.local) await chrome.storage.local.set({ [`gtc_${hash}`]: translatedDataUrl }); | Mapeia hash para storage legado. |
| 152 | U12 |         return false; | Indica que o save moderno não confirmou, mesmo que fallback legado tenha sido escrito. |
| 153 | U12 |     } | Fecha/continua estrutura sintática de U12. |
| 154 | U13 |     function confirmWithRegionalHashes(queryRegional, entryRegional) { | Abre função de U13: function confirmWithRegionalHashes(queryRegional, entryRegional) { |
| 155 | U13 |         const api = fingerprintApi(); | Obtém primitives de hash compartilhadas. |
| 156 | U13 |         if (!queryRegional \|\| !entryRegional \|\| !api) return false; | Indica que o save moderno não confirmou, mesmo que fallback legado tenha sido escrito. |
| 157 | U13 |         if (typeof api.matchRegionalHashes !== 'function') return true; | Executa confirmação regional com threshold/minMatches fixos. |
| 158 | U13 |         return api.matchRegionalHashes(queryRegional, entryRegional, { threshold: 8, minMatches: 3 }).match; | Executa confirmação regional com threshold/minMatches fixos. |
| 159 | U13 |     } | Fecha/continua estrutura sintática de U13. |
| 160 | U14 |     rootScope.MangaTranslatorGtcClient = Object.freeze({ getCleanUrl, generateImageFingerprint, queryGlobalTranslationCache, queryGlobalTranslationCacheByDHash, queryGlobalTranslationCacheByPerceptual, queryPerceptualCorrelated, queryGlobalTranslationCacheByPerceptualCrop, queryGlobalTranslationCacheByPerceptualRelaxed, saveGlobalTranslationCacheEntry, confirmWithRegionalHashes, sendRuntimeMessageAsync }); | Publica API imutável do módulo. |
| 161 | U14 | })(typeof window !== 'undefined' ? window : self); | Fecha IIFE escolhendo window ou self. |
| 162 | U15 | ⏎ [newline final] | Newline terminal editorial da fonte. |

## 14. Análise por unidade

### U01 — linhas 1–7 — Cabeçalho e IIFE

**O que faz:** Define o módulo clássico de content script e o namespace compartilhado.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Manifest MV3 injeta arquivos clássicos no mesmo isolated world; namespace global preserva ordem de bootstrap.

**Alternativa ingênua pior:** Converter só este arquivo para import ESM quebraria a cadeia de content scripts clássicos.

### U02 — linhas 8–13 — fingerprintApi

**O que faz:** Resolve a API compartilhada MangaTranslatorGtcFingerprint em rootScope/self.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Mantém o módulo testável em window e self.

**Alternativa ingênua pior:** Capturar uma global fixa na carga dificultaria testes e ambientes distintos.

### U03 — linhas 14–26 — sendRuntimeMessageAsync

**O que faz:** Normaliza chrome.runtime.sendMessage em Promise e degrada quando runtime não existe.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Todos os queries GTC/fallback SW compartilham o mesmo contrato de erro.

**Alternativa ingênua pior:** Cada caller implementar callbacks separadamente duplicaria handling de lastError.

### U04 — linhas 27–51 — getCleanUrl

**O que faz:** Normaliza URL para chave estável de fingerprint/cache, com casos Reddit/Imgur e resize params.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Mesma imagem precisa gerar descriptor consistente apesar de thumbnails/queries.

**Alternativa ingênua pior:** Usar src cru reduziria cache hits e misturaria variantes de resize.

### U05 — linhas 52–111 — generateImageFingerprint

**O que faz:** Gera pixel sample + dHash/wHash/pHash/crops/regionais localmente; em CORS delega ao background; deriva SHA descriptor e versão visual.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Combina igualdade exata com hashes perceptuais e fallback privilegiado sem exigir fetch direto do content script.

**Alternativa ingênua pior:** Depender só de URL/SHA exato falharia cross-language; depender só do SW aumentaria IPC/custo.

### U06 — linhas 112–120 — unique + query SHA

**O que faz:** Deduplica hashes e consulta GTC_QUERY_MANY, com fallback legado gtc_<hash> em storage.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Preserva compatibilidade com cache v1 local quando bridge moderna não responde.

**Alternativa ingênua pior:** Sem dedup desperdiça IPC; sem fallback perde traduções antigas.

### U07 — linhas 121–125 — query dHash

**O que faz:** Consulta índice perceptual legado visual-v2 por dHash.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Mantém compatibilidade com entradas v2 após miss SHA.

**Alternativa ingênua pior:** Regerar traduções antigas desperdiçaria cache existente.

### U08 — linhas 126–130 — query perceptual legado

**O que faz:** Consulta listas independentes wHash/pHash via action antiga.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Mantém API compatível para integrações/testes antigos.

**Alternativa ingênua pior:** Remover imediatamente quebraria callers externos, embora o pipeline moderno prefira queries correlacionadas.

### U09 — linhas 131–136 — queryPerceptualCorrelated

**O que faz:** Envia pares correlacionados por imagem com queryId/dimensões e mode strict/crop/relaxed.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Evita produto cruzado de wHash de uma página com pHash de outra.

**Alternativa ingênua pior:** Listas independentes podem gerar falso positivo entre páginas diferentes.

### U10 — linhas 137–141 — query crop legado

**O que faz:** Consulta índices crop antigos por listas independentes.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Mantém compatibilidade visual-v4 antiga.

**Alternativa ingênua pior:** Eliminar sem migração quebraria entradas/callers existentes.

### U11 — linhas 142–146 — query relaxed legado

**O que faz:** Consulta lookup perceptual relaxado legado.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Preserva compatibilidade com ação específica anterior ao V2 correlacionado.

**Alternativa ingênua pior:** Duplicar thresholds no content script tornaria regras inconsistentes com IndexedDB/background.

### U12 — linhas 147–153 — saveGlobalTranslationCacheEntry

**O que faz:** Envia GTC_SAVE com metadados visuais e faz fallback legado em storage se bridge falhar.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Não perde tradução útil quando IndexedDB/bridge moderna está indisponível.

**Alternativa ingênua pior:** Falhar fechado desperdiçaria resultado já entregue; gravar só legado perderia metadados perceptuais.

### U13 — linhas 154–159 — confirmWithRegionalHashes

**O que faz:** Confirma match borderline via 3 de 4 regiões e threshold 8 quando API suporta.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Reduz falso positivo perceptual cross-language usando evidência espacial.

**Alternativa ingênua pior:** Aceitar todo match relaxado aumenta risco de aplicar tradução errada.

### U14 — linhas 160–161 — Export e fechamento

**O que faz:** Congela/publica a API usada por content_manga e fecha a IIFE.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Expõe boundary único do cache/fingerprint no isolated world.

**Alternativa ingênua pior:** Exportar helpers extras amplia acoplamento e dificulta evolução.

### U15 — linhas 162–162 — Newline final

**O que faz:** Representa newline terminal da fonte.

**Como faz:** usa as APIs/fallbacks descritos nesta unidade e normaliza retornos para o pipeline de `content_manga.js`.

**Por que assim:** Mantém rastreabilidade física integral.

**Alternativa ingênua pior:** Omitir a posição quebraria a convenção documental.

## 15. Auditoria final

- [x] SHA/fonte integral;
- [x] 161 linhas + newline = 162/162;
- [x] ordem de carregamento manifest/harness confirmada;
- [x] consumer real e rebind de API confirmados;
- [x] strict/crop/relaxed V2 ligados aos testes reais;
- [x] simulações visuais diferenciadas de prova direta;
- [x] fallback legado/save/regional sem provas focais mantidos como lacunas;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `95d062f41b9f1bd789a576c3a5c5d903b705fa55`.

# Bíblia técnica — `extension/content/cm-dom-replace.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `d3fc72032dbddc81eae8fadc5e4da89b13a3bb79`  
> **Linhas textuais:** **189**  
> **Posições documentais:** **190** contando newline final

## 1. Papel arquitetural

`cm-dom-replace.js` centraliza duas responsabilidades visuais que antes seriam fáceis de duplicar em `content_manga.js`: selecionar quais `<img>` realmente representam páginas de mangá e substituir uma página por sua tradução sem o site restaurar `srcset`, lazy attributes, blur/backdrop ou camadas responsivas.

O manifest carrega este módulo antes de `content_manga.js`. O consumer exige `window.MangaTranslatorDomReplace`; se a API não existir, `content_manga.js` lança erro de bootstrap.

## 2. API pública

A API congelada expõe: `getCleanUrl`, `isBackdropOrBlurredImage`, `getScanEligibleImages` e `applyImageReplacement`. `getRawImageUrl` permanece privado porque serve apenas às invariantes internas de normalização/substituição.

## 3. Normalização de URL

`getCleanUrl` rejeita `data:`/`blob:` porque não são identidades estáveis da imagem original. URLs relativas são resolvidas contra `window.location.origin/href`, depois `document.baseURI`, com sentinel final.

Para Reddit, `preview.redd.it`/`external-preview.redd.it` são convertidos para `i.redd.it`; para `i.redd.it` query é removida. Para Imgur, sufixos de thumbnail `b/m/l/h/t/s` são removidos quando a forma regex casa.

Em hosts gerais, parâmetros de resize/quality/format conhecidos são removidos. Observação: a expressão `const query = changed && url.search ? url.search : ''` significa que **se nenhum parâmetro listado for removido, toda a query é descartada**; se algum for removido, parâmetros restantes são preservados. Esse comportamento pode ser intencional para deduplicação, mas não possui teste focal.

Se `new URL` falhar, o fallback remove query/hash e lower-caseia a string.

## 4. Detecção de backdrop/blur

`isBackdropOrBlurredImage` considera `aria-hidden`, ancestrais até profundidade 5, classes conhecidas (`blur`, `backdrop`, `ambient`, Reddit/lightbox), atributos `ambient/backdrop`, CSS `filter/backdropFilter` e combinação pointer-events none + filtro.

Erros de DOM/CSS são absorvidos e retornam `false`: o objetivo é não bloquear scanning inteiro porque um site usa elemento/proxy exótico.

## 5. Seleção de imagens escaneáveis

Os defaults históricos são 300×400, mas limites configuráveis não-negativos substituem os defaults. O filtro inicial exige dimensão natural suficiente, `dataset.translated !== 'true'` e URL não banida.

Cada candidata recebe `index` do DOM, `src`, `cleanUrl`, dimensões e flag backdrop. Depois as candidatas são agrupadas por `cleanUrl || src`.

Grupo unitário é mantido salvo quando a única imagem é backdrop `aria-hidden`. Em duplicatas, imagens não-backdrop ganham preferência; entre elas o código tenta escolher uma cujo `pointerEvents !== 'none'`. Se todas parecem backdrop, escolhe a última. O resultado final é reordenado por índice DOM e perde metadados internos.

`extraction-and-handlers-real.test.js` prova exclusão de banidas, pequenas e já traduzidas, mais alteração dinâmica dos limites sem reload. `twin-backdrop-sync.test.js` prova que o backdrop Reddit aria-hidden é deduplicado e a imagem nítida permanece.

## 6. Substituição da imagem

`applyImageReplacement` é idempotente para `dataset.translated==='true'` e rejeita entrada/dados vazios. Nó detached não é recolocado: opcionalmente emite `REPLACE_DETACHED` e retorna null.

Antes de trocar o nó, remove `<source>` de `<picture>`, lazy attributes, `srcset` e `sizes`. Depois clona o `<img>`, aplica a tradução, marca translated, remove classes blur/backdrop e força visibilidade (`z-index`, `filter:none`, `opacity:1`, etc.).

Clonar em vez de construir do zero preserva atributos/layout/eventual metadata do site; substituir o nó neutraliza pipelines que ainda apontam para o elemento antigo.

## 7. Twin Backdrop Sync

Depois de substituir a imagem principal, o módulo varre outros `<img>` com a mesma URL limpa. Somente gêmeos ainda não traduzidos e classificados como backdrop são sincronizados, recebendo a tradução, `translated=true`, z-index 0 e pointer-events none.

`twin-backdrop-sync.test.js` executa o módulo real e prova esse comportamento em duas imagens Reddit.

## 8. Overlay visual

Resultados novos recebem flash vermelho por 2300 ms; cache hits recebem verde por 1200 ms. O overlay fixed acompanha o bounding rect da imagem no scroll e usa dois `requestAnimationFrame` para acionar a transição.

Após o primeiro timeout inicia fade de 700 ms; 720 ms depois remove listener de scroll e overlay. `replacement-and-completion-real.test.js` prova o vermelho e cleanup; o teste de cache hit prova o verde e sua remoção.

## 9. Evidência de testes

| Comportamento | Evidência | Classificação |
|---|---|---|
| filtro banidas/pequenas/traduzidas | `extraction-and-handlers-real.test.js` — GET_PAGE_IMAGES exclui... | ✅ PROVADO DIRETAMENTE NO MÓDULO REAL |
| limites minWidth/minHeight configuráveis | mesma suíte — respeita limites / aplica novos limites | ✅ PROVADO DIRETAMENTE NO MÓDULO REAL |
| dedup de backdrop Reddit | `twin-backdrop-sync.test.js` caso 1 | ✅ PROVADO DIRETAMENTE |
| sincronização do backdrop gêmeo | `twin-backdrop-sync.test.js` caso 2 | ✅ PROVADO DIRETAMENTE |
| remoção de picture/source/lazy attrs | `replacement-and-completion-real.test.js` UPDATE_IMAGE... | ✅ PROVADO DIRETAMENTE VIA CONSUMIDOR REAL |
| overlay vermelho + listener cleanup | mesmo teste | ✅ PROVADO DIRETAMENTE VIA CONSUMIDOR REAL |
| overlay verde em cache hit | `replacement-and-completion-real.test.js` cache hit visual... | ✅ PROVADO DIRETAMENTE VIA CONSUMIDOR REAL |
| persistência/GTC_SAVE após replacement | `extraction-and-handlers-real.test.js` UPDATE_IMAGE... | 🟨 CONSUMIDOR; prova integração após replacement, não lógica interna adicional deste módulo |
| normalização Reddit/Imgur | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `getCleanUrl(null)`, `data:` e `blob:`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `preview.redd.it` com/sem regex match e `external-preview.redd.it`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para remoção de sufixos thumbnail do Imgur.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para a semântica peculiar de query: quando nenhum resize param é removido, a query inteira é descartada.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para URL inválida cair no fallback string.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para classes/attrs `ambient`, `backdrop`, `media-lightbox-img-background`, CSS `backdrop-filter` e profundidade máxima 5.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para grupo de duplicatas em que todas são backdrop; o código escolhe a última.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para escolha entre dois non-backdrops por `pointerEvents`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para nó detached + emissão `REPLACE_DETACHED`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `picture.querySelectorAll('source').forEach(source.remove)` lançar/parcialmente falhar.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para getComputedStyle lançar durante remoção de blur/position.
- ⚠️ O scan usa `banned.includes(img.src)`, enquanto agrupamento usa URL bruta/lazy normalizada; uma banlist baseada em outra variante equivalente pode não excluir a imagem.
- ⚠️ A sincronização de twins faz uma varredura de todos os `<img>` a cada replacement; em páginas muito grandes isso é O(N) por tradução.
- ⚠️ Timers/overlay/listener são UI efêmera; `pagehide` durante o flash não possui cleanup explícito fora dos timeouts.

## 11. Segurança e privacidade

- O módulo não usa APIs Chrome nem storage diretamente.
- Processa apenas URLs/imagens do DOM corrente e Data URLs traduzidas fornecidas pelo consumer.
- `getCleanUrl` lower-caseia URL completa, inclusive pathname/query restante; em servidores case-sensitive isso pode colidir identidades distintas.
- A API atua no isolated world, mas modifica o DOM compartilhado da página.

## 12. Invariantes

1. Imagem já traduzida não pode voltar à fila nem ser substituída novamente.
2. Lazy/srcset/picture não podem sobrescrever a tradução depois do replacement.
3. Índices retornados por scanning devem continuar correspondendo à ordem original do DOM.
4. Duplicatas visuais devem produzir no máximo um candidato principal por URL agrupada.
5. Twin backdrop só deve ser sincronizado quando a URL limpa coincide e o twin é reconhecido como backdrop.
6. Backdrop aria-hidden não deve virar job quando existe imagem nítida equivalente.
7. Replacement deve preservar layout/atributos úteis por clone, mas remover blur e mecanismos de fonte concorrentes.
8. Overlay nunca deve capturar pointer events e precisa remover listener/DOM ao terminar.
9. Alterar regras de cleanUrl exige considerar cache/auto-restore/deduplicação como um único contrato.
10. Erros heurísticos de CSS não devem abortar o scan inteiro.

## 13. Fonte integral

~~~javascript
// cm-dom-replace.js — seleção e substituição visual de páginas do mangá.
// Content scripts clássicos não suportam imports; a API é carregada antes de
// content_manga.js pelo manifest e fica privada ao mundo isolado da extensão.
(function exposeMangaTranslatorDomReplace(globalScope) {
    'use strict';

    function getCleanUrl(rawUrl) {
        if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return null;
        try {
            const base = (window.location && (window.location.origin || window.location.href))
                || document.baseURI
                || 'https://manga-translator.invalid/';
            const url = new URL(rawUrl, base);

            if (url.hostname === 'preview.redd.it' || url.hostname === 'external-preview.redd.it') {
                const match = url.pathname.match(/[-]([a-z0-9]{8,})(\.[a-z]+)$/i);
                if (match) return `https://i.redd.it/${match[1]}${match[2].toLowerCase()}`;
                return `https://i.redd.it${url.pathname}`.toLowerCase();
            }
            if (url.hostname === 'i.redd.it') return `${url.protocol}//${url.hostname}${url.pathname}`.toLowerCase();
            if (url.hostname.includes('imgur.com')) {
                const cleanedPath = url.pathname.replace(/([a-zA-Z0-9]{5,})[bmlhts](\.[a-z]+)$/i, '$1$2');
                return `${url.protocol}//${url.hostname}${cleanedPath}`.toLowerCase();
            }

            const resizeParams = ['width', 'w', 'h', 'height', 'size', 'quality', 'q', 'format', 'auto', 'crop', 'fit', 'resize', 'scale', 'dpr', 'webp', 'avif', 'thumb', 'thumbnail', 'tr', 'im'];
            let changed = false;
            resizeParams.forEach((param) => {
                if (url.searchParams.has(param)) {
                    url.searchParams.delete(param);
                    changed = true;
                }
            });
            const query = changed && url.search ? url.search : '';
            return `${url.protocol}//${url.host}${url.pathname}${query}`.toLowerCase();
        } catch (_error) {
            return String(rawUrl).split('?')[0].split('#')[0].toLowerCase();
        }
    }

    function getRawImageUrl(img) {
        return img.getAttribute('src') || img.dataset.src || img.dataset.lazySrc || img.getAttribute('data-original') || img.src || '';
    }

    function isBackdropOrBlurredImage(img) {
        if (!img) return false;
        try {
            if (img.getAttribute('aria-hidden') === 'true' || (img.closest && img.closest('[aria-hidden="true"]'))) return true;

            const backdropClassRegex = /(^|\s|__|-)(blur|backdrop|ambient|shreddit-aspect-ratio__blur|media-lightbox-img-background|preview-blur)($|\s|__|-)/i;
            let current = img;
            let depth = 0;
            while (current && depth < 5 && current !== document.body) {
                const className = typeof current.className === 'string' ? current.className : '';
                if (backdropClassRegex.test(className)) return true;
                if (current.hasAttribute && (current.hasAttribute('ambient') || current.hasAttribute('backdrop'))) return true;
                current = current.parentElement;
                depth++;
            }

            const compStyle = window.getComputedStyle ? window.getComputedStyle(img) : null;
            if (compStyle) {
                const filter = compStyle.filter || '';
                const backdropFilter = compStyle.backdropFilter || '';
                if (filter.includes('blur') || backdropFilter.includes('blur')) return true;
                if (compStyle.pointerEvents === 'none' && (filter !== 'none' || (img.style && img.style.filter && img.style.filter.includes('blur')))) return true;
            }
        } catch (_error) {}
        return false;
    }

    function getScanEligibleImages(banned = [], minDimensions = {}) {
        // Os limites vêm do painel de ajustes. Valores inválidos voltam aos
        // padrões históricos para não bloquear a leitura da página.
        const parsedWidth = Number.parseInt(minDimensions.minWidth, 10);
        const parsedHeight = Number.parseInt(minDimensions.minHeight, 10);
        const minWidth = Number.isFinite(parsedWidth) && parsedWidth >= 0 ? parsedWidth : 300;
        const minHeight = Number.isFinite(parsedHeight) && parsedHeight >= 0 ? parsedHeight : 400;
        const candidates = [];
        Array.from(document.querySelectorAll('img')).forEach((img, index) => {
            if (img.naturalWidth >= minWidth && img.naturalHeight >= minHeight && img.dataset.translated !== 'true' && !banned.includes(img.src)) {
                candidates.push({
                    element: img,
                    index,
                    src: img.src,
                    cleanUrl: getCleanUrl(getRawImageUrl(img)),
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    isBackdrop: isBackdropOrBlurredImage(img),
                });
            }
        });

        const urlGroups = new Map();
        candidates.forEach((candidate) => {
            const key = candidate.cleanUrl || candidate.src;
            if (!urlGroups.has(key)) urlGroups.set(key, []);
            urlGroups.get(key).push(candidate);
        });

        const valid = [];
        for (const group of urlGroups.values()) {
            if (group.length === 1) {
                const single = group[0];
                if (!(single.isBackdrop && single.element.getAttribute('aria-hidden') === 'true')) valid.push(single);
                continue;
            }
            const nonBackdrops = group.filter((candidate) => !candidate.isBackdrop);
            if (nonBackdrops.length > 0) {
                valid.push(nonBackdrops.find((candidate) => {
                    try { return window.getComputedStyle(candidate.element).pointerEvents !== 'none'; } catch (_error) { return true; }
                }) || nonBackdrops[0]);
            } else {
                valid.push(group[group.length - 1]);
            }
        }

        return valid.sort((a, b) => a.index - b.index).map(({ index, src, width, height }) => ({ index, src, width, height }));
    }

    function applyImageReplacement(img, translatedBase64, fromCache = false, { sendLog } = {}) {
        if (!img || !translatedBase64 || img.dataset.translated === 'true') return null;
        if (!img.parentNode) {
            if (typeof sendLog === 'function') sendLog('warn', 'REPLACE_DETACHED', 'Imagem desconectada do DOM, ignorando', {});
            return null;
        }

        const origCleanUrl = getCleanUrl(getRawImageUrl(img));
        const pictureParent = img.closest('picture');
        if (pictureParent) pictureParent.querySelectorAll('source').forEach((source) => source.remove());
        ['loading', 'data-src', 'data-lazy', 'data-original', 'srcset', 'sizes'].forEach((attribute) => img.removeAttribute(attribute));
        if (img.dataset.src) delete img.dataset.src;
        if (img.dataset.lazySrc) delete img.dataset.lazySrc;

        const newImg = img.cloneNode(true);
        newImg.src = translatedBase64;
        newImg.dataset.translated = 'true';
        try {
            const classesToRemove = [];
            newImg.classList.forEach((className) => { if (/blur|backdrop/i.test(className)) classesToRemove.push(className); });
            classesToRemove.forEach((className) => newImg.classList.remove(className));
        } catch (_error) {}
        try {
            if (window.getComputedStyle(img).position === 'static') newImg.style.setProperty('position', 'relative', 'important');
        } catch (_error) {}
        newImg.style.setProperty('z-index', '2', 'important');
        newImg.style.setProperty('filter', 'none', 'important');
        newImg.style.setProperty('backdrop-filter', 'none', 'important');
        newImg.style.setProperty('visibility', 'visible', 'important');
        newImg.style.setProperty('opacity', '1', 'important');
        newImg.style.setProperty('background', 'transparent', 'important');
        img.parentNode.replaceChild(newImg, img);

        if (origCleanUrl) {
            try {
                document.querySelectorAll('img').forEach((twin) => {
                    if (twin !== newImg && twin !== img && twin.dataset.translated !== 'true' && getCleanUrl(getRawImageUrl(twin)) === origCleanUrl && isBackdropOrBlurredImage(twin)) {
                        twin.src = translatedBase64;
                        twin.dataset.translated = 'true';
                        twin.style.setProperty('z-index', '0', 'important');
                        twin.style.setProperty('pointer-events', 'none', 'important');
                    }
                });
            } catch (_error) {}
        }

        const flashColor = fromCache ? 'rgba(76,175,80,0.5)' : 'rgba(200,30,30,0.55)';
        const flashDuration = fromCache ? 1200 : 2300;
        const overlay = document.createElement('div');
        document.body.appendChild(overlay);
        const positionOverlay = () => {
            const rect = newImg.getBoundingClientRect();
            overlay.style.top = `${rect.top}px`; overlay.style.left = `${rect.left}px`;
            overlay.style.width = `${rect.width}px`; overlay.style.height = `${rect.height}px`;
        };
        overlay.style.cssText = `position:fixed;background:${flashColor};border-radius:3px;z-index:2147483646;pointer-events:none;opacity:0;transition:opacity 0.35s ease;`;
        positionOverlay();
        const onScroll = () => positionOverlay();
        window.addEventListener('scroll', onScroll, { passive: true });
        requestAnimationFrame(() => requestAnimationFrame(() => { overlay.style.opacity = '1'; }));
        setTimeout(() => {
            overlay.style.transition = 'opacity 0.7s ease'; overlay.style.opacity = '0';
            setTimeout(() => { window.removeEventListener('scroll', onScroll); overlay.remove(); }, 720);
        }, flashDuration);
        return newImg;
    }

    globalScope.MangaTranslatorDomReplace = Object.freeze({ getCleanUrl, isBackdropOrBlurredImage, getScanEligibleImages, applyImageReplacement });
})(typeof window !== 'undefined' ? window : self);
~~~

## 14. Rastreabilidade 190/190

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | // cm-dom-replace.js — seleção e substituição visual de páginas do mangá. | Comentário arquitetural: cm-dom-replace.js — seleção e substituição visual de páginas do mangá.. |
| 002 | U01 | // Content scripts clássicos não suportam imports; a API é carregada antes de | Comentário arquitetural: Content scripts clássicos não suportam imports; a API é carregada antes de. |
| 003 | U01 | // content_manga.js pelo manifest e fica privada ao mundo isolado da extensão. | Comentário arquitetural: content_manga.js pelo manifest e fica privada ao mundo isolado da extensão.. |
| 004 | U01 | (function exposeMangaTranslatorDomReplace(globalScope) { | Abre IIFE que recebe o escopo global do isolated world. |
| 005 | U01 |     'use strict'; | Ativa strict mode. |
| 006 | U01 | ␠ [linha vazia] | Separador visual dentro de U01. |
| 007 | U02 |     function getCleanUrl(rawUrl) { | Abre getCleanUrl: function getCleanUrl(rawUrl) { |
| 008 | U02 |         if (!rawUrl \|\| rawUrl.startsWith('data:') \|\| rawUrl.startsWith('blob:')) return null; | Descarta URLs locais/transitórias que não devem virar chave canônica. |
| 009 | U02 |         try { | Parte concreta de U02: try { |
| 010 | U02 |             const base = (window.location && (window.location.origin \|\| window.location.href)) | Parte concreta de U02: const base = (window.location && (window.location.origin // window.location.href)) |
| 011 | U02 |                 \|\| document.baseURI | Parte concreta de U02: // document.baseURI |
| 012 | U02 |                 \|\| 'https://manga-translator.invalid/'; | Parte concreta de U02: // 'https://manga-translator.invalid/'; |
| 013 | U02 |             const url = new URL(rawUrl, base); | Resolve URL relativa contra a base real do documento. |
| 014 | U02 | ␠ [linha vazia] | Separador visual dentro de U02. |
| 015 | U02 |             if (url.hostname === 'preview.redd.it' \|\| url.hostname === 'external-preview.redd.it') { | Normaliza host de preview do Reddit para i.redd.it. |
| 016 | U02 |                 const match = url.pathname.match(/[-]([a-z0-9]{8,})(\.[a-z]+)$/i); | Extrai o id/ extensão do preview Reddit quando a forma conhecida está presente. |
| 017 | U02 |                 if (match) return `https://i.redd.it/${match[1]}${match[2].toLowerCase()}`; | Remove query de resize e normaliza case para URL direta Reddit. |
| 018 | U02 |                 return `https://i.redd.it${url.pathname}`.toLowerCase(); | Remove query de resize e normaliza case para URL direta Reddit. |
| 019 | U02 |             } | Fecha/continua estrutura sintática de U02. |
| 020 | U02 |             if (url.hostname === 'i.redd.it') return `${url.protocol}//${url.hostname}${url.pathname}`.toLowerCase(); | Remove query de resize e normaliza case para URL direta Reddit. |
| 021 | U02 |             if (url.hostname.includes('imgur.com')) { | Remove sufixos de thumbnail do Imgur quando compatíveis. |
| 022 | U02 |                 const cleanedPath = url.pathname.replace(/([a-zA-Z0-9]{5,})[bmlhts](\.[a-z]+)$/i, '$1$2'); | Parte concreta de U02: const cleanedPath = url.pathname.replace(/([a-zA-Z0-9]{5,})[bmlhts](\.[a-z]+)$/i, '$1$2'); |
| 023 | U02 |                 return `${url.protocol}//${url.hostname}${cleanedPath}`.toLowerCase(); | Parte concreta de U02: return `${url.protocol}//${url.hostname}${cleanedPath}`.toLowerCase(); |
| 024 | U02 |             } | Fecha/continua estrutura sintática de U02. |
| 025 | U02 | ␠ [linha vazia] | Separador visual dentro de U02. |
| 026 | U02 |             const resizeParams = ['width', 'w', 'h', 'height', 'size', 'quality', 'q', 'format', 'auto', 'crop', 'fit', 'resize', 'scale', 'dpr', 'webp', 'avif', 'thumb', 'thumbnail', 'tr', 'im']; | Define parâmetros de transformação visual que não identificam a página original. |
| 027 | U02 |             let changed = false; | Parte concreta de U02: let changed = false; |
| 028 | U02 |             resizeParams.forEach((param) => { | Define parâmetros de transformação visual que não identificam a página original. |
| 029 | U02 |                 if (url.searchParams.has(param)) { | Parte concreta de U02: if (url.searchParams.has(param)) { |
| 030 | U02 |                     url.searchParams.delete(param); | Remove parâmetro de resize/qualidade detectado. |
| 031 | U02 |                     changed = true; | Parte concreta de U02: changed = true; |
| 032 | U02 |                 } | Fecha/continua estrutura sintática de U02. |
| 033 | U02 |             }); | Fecha/continua estrutura sintática de U02. |
| 034 | U02 |             const query = changed && url.search ? url.search : ''; | Parte concreta de U02: const query = changed && url.search ? url.search : ''; |
| 035 | U02 |             return `${url.protocol}//${url.host}${url.pathname}${query}`.toLowerCase(); | Parte concreta de U02: return `${url.protocol}//${url.host}${url.pathname}${query}`.toLowerCase(); |
| 036 | U02 |         } catch (_error) { | Parte concreta de U02: } catch (_error) { |
| 037 | U02 |             return String(rawUrl).split('?')[0].split('#')[0].toLowerCase(); | Fallback conservador para URL inválida: remove query/hash e normaliza case. |
| 038 | U02 |         } | Fecha/continua estrutura sintática de U02. |
| 039 | U02 |     } | Fecha/continua estrutura sintática de U02. |
| 040 | U02 | ␠ [linha vazia] | Separador visual dentro de U02. |
| 041 | U03 |     function getRawImageUrl(img) { | Abre getRawImageUrl: function getRawImageUrl(img) { |
| 042 | U03 |         return img.getAttribute('src') \|\| img.dataset.src \|\| img.dataset.lazySrc \|\| img.getAttribute('data-original') \|\| img.src \|\| ''; | Seleciona URL bruta preferindo atributos explícitos/lazy antes do property fallback. |
| 043 | U03 |     } | Fecha/continua estrutura sintática de U03. |
| 044 | U03 | ␠ [linha vazia] | Separador visual dentro de U03. |
| 045 | U04 |     function isBackdropOrBlurredImage(img) { | Abre isBackdropOrBlurredImage: function isBackdropOrBlurredImage(img) { |
| 046 | U04 |         if (!img) return false; | Parte concreta de U04: if (!img) return false; |
| 047 | U04 |         try { | Parte concreta de U04: try { |
| 048 | U04 |             if (img.getAttribute('aria-hidden') === 'true' \|\| (img.closest && img.closest('[aria-hidden="true"]'))) return true; | Classifica imagem/ancestral aria-hidden como backdrop decorativo. |
| 049 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 050 | U04 |             const backdropClassRegex = /(^\|\s\|__\|-)(blur\|backdrop\|ambient\|shreddit-aspect-ratio__blur\|media-lightbox-img-background\|preview-blur)($\|\s\|__\|-)/i; | Define heurística de classes ambientais/blur conhecidas. |
| 051 | U04 |             let current = img; | Parte concreta de U04: let current = img; |
| 052 | U04 |             let depth = 0; | Parte concreta de U04: let depth = 0; |
| 053 | U04 |             while (current && depth < 5 && current !== document.body) { | Inspeciona até cinco ancestrais para detectar wrappers de backdrop. |
| 054 | U04 |                 const className = typeof current.className === 'string' ? current.className : ''; | Parte concreta de U04: const className = typeof current.className === 'string' ? current.className : ''; |
| 055 | U04 |                 if (backdropClassRegex.test(className)) return true; | Define heurística de classes ambientais/blur conhecidas. |
| 056 | U04 |                 if (current.hasAttribute && (current.hasAttribute('ambient') \|\| current.hasAttribute('backdrop'))) return true; | Reconhece atributos ambientais explícitos. |
| 057 | U04 |                 current = current.parentElement; | Parte concreta de U04: current = current.parentElement; |
| 058 | U04 |                 depth++; | Parte concreta de U04: depth++; |
| 059 | U04 |             } | Fecha/continua estrutura sintática de U04. |
| 060 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 061 | U04 |             const compStyle = window.getComputedStyle ? window.getComputedStyle(img) : null; | Consulta estilos efetivos para blur/pointer-events. |
| 062 | U04 |             if (compStyle) { | Parte concreta de U04: if (compStyle) { |
| 063 | U04 |                 const filter = compStyle.filter \|\| ''; | Parte concreta de U04: const filter = compStyle.filter // ''; |
| 064 | U04 |                 const backdropFilter = compStyle.backdropFilter \|\| ''; | Parte concreta de U04: const backdropFilter = compStyle.backdropFilter // ''; |
| 065 | U04 |                 if (filter.includes('blur') \|\| backdropFilter.includes('blur')) return true; | Classifica blur CSS como backdrop. |
| 066 | U04 |                 if (compStyle.pointerEvents === 'none' && (filter !== 'none' \|\| (img.style && img.style.filter && img.style.filter.includes('blur')))) return true; | Classifica blur CSS como backdrop. |
| 067 | U04 |             } | Fecha/continua estrutura sintática de U04. |
| 068 | U04 |         } catch (_error) {} | Parte concreta de U04: } catch (_error) {} |
| 069 | U04 |         return false; | Parte concreta de U04: return false; |
| 070 | U04 |     } | Fecha/continua estrutura sintática de U04. |
| 071 | U04 | ␠ [linha vazia] | Separador visual dentro de U04. |
| 072 | U05 |     function getScanEligibleImages(banned = [], minDimensions = {}) { | Abre getScanEligibleImages: function getScanEligibleImages(banned = [], minDimensions = {}) { |
| 073 | U05 |         // Os limites vêm do painel de ajustes. Valores inválidos voltam aos | Comentário arquitetural: Os limites vêm do painel de ajustes. Valores inválidos voltam aos. |
| 074 | U05 |         // padrões históricos para não bloquear a leitura da página. | Comentário arquitetural: padrões históricos para não bloquear a leitura da página.. |
| 075 | U05 |         const parsedWidth = Number.parseInt(minDimensions.minWidth, 10); | Converte limites configuráveis de dimensão. |
| 076 | U05 |         const parsedHeight = Number.parseInt(minDimensions.minHeight, 10); | Converte limites configuráveis de dimensão. |
| 077 | U05 |         const minWidth = Number.isFinite(parsedWidth) && parsedWidth >= 0 ? parsedWidth : 300; | Valida limites não-negativos e aplica defaults históricos. |
| 078 | U05 |         const minHeight = Number.isFinite(parsedHeight) && parsedHeight >= 0 ? parsedHeight : 400; | Valida limites não-negativos e aplica defaults históricos. |
| 079 | U05 |         const candidates = []; | Parte concreta de U05: const candidates = []; |
| 080 | U05 |         Array.from(document.querySelectorAll('img')).forEach((img, index) => { | Varre todas as imagens do documento para seleção/sincronização. |
| 081 | U05 |             if (img.naturalWidth >= minWidth && img.naturalHeight >= minHeight && img.dataset.translated !== 'true' && !banned.includes(img.src)) { | Filtra usando dimensão natural real, não CSS escalado. |
| 082 | U05 |                 candidates.push({ | Registra candidato com índice DOM, URL limpa, dimensões e classificação de backdrop. |
| 083 | U05 |                     element: img, | Parte concreta de U05: element: img, |
| 084 | U05 |                     index, | Parte concreta de U05: index, |
| 085 | U05 |                     src: img.src, | Parte concreta de U05: src: img.src, |
| 086 | U05 |                     cleanUrl: getCleanUrl(getRawImageUrl(img)), | Parte concreta de U05: cleanUrl: getCleanUrl(getRawImageUrl(img)), |
| 087 | U05 |                     width: img.naturalWidth, | Filtra usando dimensão natural real, não CSS escalado. |
| 088 | U05 |                     height: img.naturalHeight, | Filtra usando dimensão natural real, não CSS escalado. |
| 089 | U05 |                     isBackdrop: isBackdropOrBlurredImage(img), | Parte concreta de U05: isBackdrop: isBackdropOrBlurredImage(img), |
| 090 | U05 |                 }); | Fecha/continua estrutura sintática de U05. |
| 091 | U05 |             } | Fecha/continua estrutura sintática de U05. |
| 092 | U05 |         }); | Fecha/continua estrutura sintática de U05. |
| 093 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 094 | U05 |         const urlGroups = new Map(); | Agrupa candidatos pela identidade visual normalizada. |
| 095 | U05 |         candidates.forEach((candidate) => { | Parte concreta de U05: candidates.forEach((candidate) => { |
| 096 | U05 |             const key = candidate.cleanUrl \|\| candidate.src; | Usa cleanUrl quando possível e src bruto como fallback de agrupamento. |
| 097 | U05 |             if (!urlGroups.has(key)) urlGroups.set(key, []); | Parte concreta de U05: if (!urlGroups.has(key)) urlGroups.set(key, []); |
| 098 | U05 |             urlGroups.get(key).push(candidate); | Parte concreta de U05: urlGroups.get(key).push(candidate); |
| 099 | U05 |         }); | Fecha/continua estrutura sintática de U05. |
| 100 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 101 | U05 |         const valid = []; | Parte concreta de U05: const valid = []; |
| 102 | U05 |         for (const group of urlGroups.values()) { | Parte concreta de U05: for (const group of urlGroups.values()) { |
| 103 | U05 |             if (group.length === 1) { | Trata grupo unitário sem heurística de competição. |
| 104 | U05 |                 const single = group[0]; | Parte concreta de U05: const single = group[0]; |
| 105 | U05 |                 if (!(single.isBackdrop && single.element.getAttribute('aria-hidden') === 'true')) valid.push(single); | Classifica imagem/ancestral aria-hidden como backdrop decorativo. |
| 106 | U05 |                 continue; | Parte concreta de U05: continue; |
| 107 | U05 |             } | Fecha/continua estrutura sintática de U05. |
| 108 | U05 |             const nonBackdrops = group.filter((candidate) => !candidate.isBackdrop); | Prefere candidatos não-classificados como backdrop em grupos duplicados. |
| 109 | U05 |             if (nonBackdrops.length > 0) { | Prefere candidatos não-classificados como backdrop em grupos duplicados. |
| 110 | U05 |                 valid.push(nonBackdrops.find((candidate) => { | Prefere candidatos não-classificados como backdrop em grupos duplicados. |
| 111 | U05 |                     try { return window.getComputedStyle(candidate.element).pointerEvents !== 'none'; } catch (_error) { return true; } | Consulta estilos efetivos para blur/pointer-events. |
| 112 | U05 |                 }) \|\| nonBackdrops[0]); | Prefere candidatos não-classificados como backdrop em grupos duplicados. |
| 113 | U05 |             } else { | Parte concreta de U05: } else { |
| 114 | U05 |                 valid.push(group[group.length - 1]); | Se todas são backdrops, preserva uma candidata determinística: a última. |
| 115 | U05 |             } | Fecha/continua estrutura sintática de U05. |
| 116 | U05 |         } | Fecha/continua estrutura sintática de U05. |
| 117 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 118 | U05 |         return valid.sort((a, b) => a.index - b.index).map(({ index, src, width, height }) => ({ index, src, width, height })); | Restaura ordem original do DOM e reduz shape para index/src/width/height. |
| 119 | U05 |     } | Fecha/continua estrutura sintática de U05. |
| 120 | U05 | ␠ [linha vazia] | Separador visual dentro de U05. |
| 121 | U06 |     function applyImageReplacement(img, translatedBase64, fromCache = false, { sendLog } = {}) { | Abre applyImageReplacement — guards/preparo: function applyImageReplacement(img, translatedBase64, fromCache = false, { sendLog } = {}) { |
| 122 | U06 |         if (!img \|\| !translatedBase64 \|\| img.dataset.translated === 'true') return null; | Evita retraduzir imagem já substituída. |
| 123 | U06 |         if (!img.parentNode) { | Evita substituir nó já destacado do DOM; opcionalmente registra REPLACE_DETACHED. |
| 124 | U06 |             if (typeof sendLog === 'function') sendLog('warn', 'REPLACE_DETACHED', 'Imagem desconectada do DOM, ignorando', {}); | Parte concreta de U06: if (typeof sendLog === 'function') sendLog('warn', 'REPLACE_DETACHED', 'Imagem desconectada do DOM, ignorando', {}); |
| 125 | U06 |             return null; | Parte concreta de U06: return null; |
| 126 | U06 |         } | Fecha/continua estrutura sintática de U06. |
| 127 | U06 | ␠ [linha vazia] | Separador visual dentro de U06. |
| 128 | U06 |         const origCleanUrl = getCleanUrl(getRawImageUrl(img)); | Captura identidade original antes de remover/alterar atributos. |
| 129 | U06 |         const pictureParent = img.closest('picture'); | Detecta wrapper picture para remover sources concorrentes. |
| 130 | U06 |         if (pictureParent) pictureParent.querySelectorAll('source').forEach((source) => source.remove()); | Remove sources responsivos que poderiam sobrescrever o src traduzido. |
| 131 | U06 |         ['loading', 'data-src', 'data-lazy', 'data-original', 'srcset', 'sizes'].forEach((attribute) => img.removeAttribute(attribute)); | Seleciona URL bruta preferindo atributos explícitos/lazy antes do property fallback. |
| 132 | U06 |         if (img.dataset.src) delete img.dataset.src; | Remove referências lazy mantidas em dataset. |
| 133 | U07 |         if (img.dataset.lazySrc) delete img.dataset.lazySrc; | Seleciona URL bruta preferindo atributos explícitos/lazy antes do property fallback. |
| 134 | U07 | ␠ [linha vazia] | Separador visual dentro de U07. |
| 135 | U07 |         const newImg = img.cloneNode(true); | Preserva estrutura/atributos do elemento original em uma nova instância. |
| 136 | U07 |         newImg.src = translatedBase64; | Aplica bytes/URL traduzidos na cópia. |
| 137 | U07 |         newImg.dataset.translated = 'true'; | Evita retraduzir imagem já substituída. |
| 138 | U07 |         try { | Parte concreta de U07: try { |
| 139 | U07 |             const classesToRemove = []; | Coleta/remove classes com blur/backdrop na cópia. |
| 140 | U07 |             newImg.classList.forEach((className) => { if (/blur\|backdrop/i.test(className)) classesToRemove.push(className); }); | Coleta/remove classes com blur/backdrop na cópia. |
| 141 | U07 |             classesToRemove.forEach((className) => newImg.classList.remove(className)); | Coleta/remove classes com blur/backdrop na cópia. |
| 142 | U07 |         } catch (_error) {} | Parte concreta de U07: } catch (_error) {} |
| 143 | U07 |         try { | Parte concreta de U07: try { |
| 144 | U07 |             if (window.getComputedStyle(img).position === 'static') newImg.style.setProperty('position', 'relative', 'important'); | Consulta estilos efetivos para blur/pointer-events. |
| 145 | U07 |         } catch (_error) {} | Parte concreta de U07: } catch (_error) {} |
| 146 | U07 |         newImg.style.setProperty('z-index', '2', 'important'); | Impõe estilo visual crítico com important para vencer CSS do site. |
| 147 | U07 |         newImg.style.setProperty('filter', 'none', 'important'); | Impõe estilo visual crítico com important para vencer CSS do site. |
| 148 | U07 |         newImg.style.setProperty('backdrop-filter', 'none', 'important'); | Impõe estilo visual crítico com important para vencer CSS do site. |
| 149 | U07 |         newImg.style.setProperty('visibility', 'visible', 'important'); | Impõe estilo visual crítico com important para vencer CSS do site. |
| 150 | U07 |         newImg.style.setProperty('opacity', '1', 'important'); | Impõe estilo visual crítico com important para vencer CSS do site. |
| 151 | U07 |         newImg.style.setProperty('background', 'transparent', 'important'); | Impõe estilo visual crítico com important para vencer CSS do site. |
| 152 | U08 |         img.parentNode.replaceChild(newImg, img); | Troca atomicamente a imagem original pela cópia traduzida. |
| 153 | U08 | ␠ [linha vazia] | Separador visual dentro de U08. |
| 154 | U08 |         if (origCleanUrl) { | Captura identidade original antes de remover/alterar atributos. |
| 155 | U08 |             try { | Parte concreta de U08: try { |
| 156 | U08 |                 document.querySelectorAll('img').forEach((twin) => { | Varre todas as imagens do documento para seleção/sincronização. |
| 157 | U08 |                     if (twin !== newImg && twin !== img && twin.dataset.translated !== 'true' && getCleanUrl(getRawImageUrl(twin)) === origCleanUrl && isBackdropOrBlurredImage(twin)) { | Evita retraduzir imagem já substituída. |
| 158 | U08 |                         twin.src = translatedBase64; | Atualiza backdrop com os mesmos bytes traduzidos. |
| 159 | U08 |                         twin.dataset.translated = 'true'; | Evita retraduzir imagem já substituída. |
| 160 | U08 |                         twin.style.setProperty('z-index', '0', 'important'); | Impõe estilo visual crítico com important para vencer CSS do site. |
| 161 | U08 |                         twin.style.setProperty('pointer-events', 'none', 'important'); | Impõe estilo visual crítico com important para vencer CSS do site. |
| 162 | U08 |                     } | Fecha/continua estrutura sintática de U08. |
| 163 | U08 |                 }); | Fecha/continua estrutura sintática de U08. |
| 164 | U08 |             } catch (_error) {} | Parte concreta de U08: } catch (_error) {} |
| 165 | U08 |         } | Fecha/continua estrutura sintática de U08. |
| 166 | U09 | ␠ [linha vazia] | Separador visual dentro de U09. |
| 167 | U09 |         const flashColor = fromCache ? 'rgba(76,175,80,0.5)' : 'rgba(200,30,30,0.55)'; | Escolhe verde para cache e vermelho para tradução nova. |
| 168 | U09 |         const flashDuration = fromCache ? 1200 : 2300; | Usa duração menor para cache hit e maior para resultado novo. |
| 169 | U09 |         const overlay = document.createElement('div'); | Cria overlay visual temporário. |
| 170 | U09 |         document.body.appendChild(overlay); | Insere overlay no body para feedback acima da página. |
| 171 | U09 |         const positionOverlay = () => { | Parte concreta de U09: const positionOverlay = () => { |
| 172 | U09 |             const rect = newImg.getBoundingClientRect(); | Calcula posição/tamanho atual da imagem traduzida. |
| 173 | U09 |             overlay.style.top = `${rect.top}px`; overlay.style.left = `${rect.left}px`; | Parte concreta de U09: overlay.style.top = `${rect.top}px`; overlay.style.left = `${rect.left}px`; |
| 174 | U09 |             overlay.style.width = `${rect.width}px`; overlay.style.height = `${rect.height}px`; | Parte concreta de U09: overlay.style.width = `${rect.width}px`; overlay.style.height = `${rect.height}px`; |
| 175 | U09 |         }; | Fecha/continua estrutura sintática de U09. |
| 176 | U09 |         overlay.style.cssText = `position:fixed;background:${flashColor};border-radius:3px;z-index:2147483646;pointer-events:none;opacity:0;transition:opacity 0.35s ease;`; | Escolhe verde para cache e vermelho para tradução nova. |
| 177 | U09 |         positionOverlay(); | Parte concreta de U09: positionOverlay(); |
| 178 | U09 |         const onScroll = () => positionOverlay(); | Parte concreta de U09: const onScroll = () => positionOverlay(); |
| 179 | U09 |         window.addEventListener('scroll', onScroll, { passive: true }); | Reposiciona overlay durante scroll enquanto ele existe. |
| 180 | U09 |         requestAnimationFrame(() => requestAnimationFrame(() => { overlay.style.opacity = '1'; })); | Usa dois frames para garantir transição de opacidade visível. |
| 181 | U09 |         setTimeout(() => { | Agenda fade/removal do feedback visual. |
| 182 | U09 |             overlay.style.transition = 'opacity 0.7s ease'; overlay.style.opacity = '0'; | Parte concreta de U09: overlay.style.transition = 'opacity 0.7s ease'; overlay.style.opacity = '0'; |
| 183 | U09 |             setTimeout(() => { window.removeEventListener('scroll', onScroll); overlay.remove(); }, 720); | Agenda fade/removal do feedback visual. |
| 184 | U09 |         }, flashDuration); | Usa duração menor para cache hit e maior para resultado novo. |
| 185 | U09 |         return newImg; | Devolve a nova imagem para callers que precisam continuar usando o nó substituído. |
| 186 | U09 |     } | Fecha/continua estrutura sintática de U09. |
| 187 | U09 | ␠ [linha vazia] | Separador visual dentro de U09. |
| 188 | U09 |     globalScope.MangaTranslatorDomReplace = Object.freeze({ getCleanUrl, isBackdropOrBlurredImage, getScanEligibleImages, applyImageReplacement }); | Publica API imutável com somente quatro operações. |
| 189 | U10 | })(typeof window !== 'undefined' ? window : self); | Fecha IIFE escolhendo window no content script ou self em ambiente de teste. |
| 190 | U11 | ⏎ [newline final] | Newline terminal editorial da fonte. |

## 15. Análise por unidade

### U01 — linhas 1–6 — Cabeçalho e IIFE

**O que faz:** Expõe uma API global privada ao isolated world do content script.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Content scripts clássicos sem ESM precisam de namespace compartilhado carregado pelo manifest.

**Alternativa ingênua pior:** Imports diretos/duplicação no content_manga aumentariam acoplamento e poderiam criar duas implementações divergentes.

### U02 — linhas 7–40 — getCleanUrl

**O que faz:** Normaliza URLs para deduplicar versões resized/thumb e casos Reddit/Imgur.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Agrupa variantes visuais da mesma página antes de selecionar candidatos/restaurar cache.

**Alternativa ingênua pior:** Comparar src cru duplicaria backdrops/thumbs e reduziria acertos de cache.

### U03 — linhas 41–44 — getRawImageUrl

**O que faz:** Obtém a melhor fonte original entre src e lazy/data attrs.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Sites de mangá/lazy-load armazenam URL real em atributos diferentes.

**Alternativa ingênua pior:** Usar só img.src pode capturar placeholder/blob transitório ou perder URL original.

### U04 — linhas 45–71 — isBackdropOrBlurredImage

**O que faz:** Detecta imagens ambientais/backdrop por aria-hidden, classes, attrs e estilos blur/pointer-events.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Evita traduzir duplicatas decorativas e escolhe a imagem nítida principal.

**Alternativa ingênua pior:** Selecionar todo <img> gera jobs duplicados e pode substituir camadas erradas.

### U05 — linhas 72–120 — getScanEligibleImages

**O que faz:** Filtra dimensões/banidas/traduzidas, agrupa por cleanUrl e escolhe um representante por grupo.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Preserva ordem DOM e deduplica variantes/backdrops sem alterar content_manga.

**Alternativa ingênua pior:** Retornar candidatos crus cria duplicação, índices instáveis e trabalho Gemini desnecessário.

### U06 — linhas 121–132 — applyImageReplacement — guards/preparo

**O que faz:** Rejeita entrada inválida/detached, calcula URL original e remove sources/lazy attrs.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Evita mutar nós desconectados e neutraliza mecanismos do site que poderiam restaurar a imagem original.

**Alternativa ingênua pior:** Trocar só src permitiria srcset/picture/lazy loader sobrescrever a tradução.

### U07 — linhas 133–151 — applyImageReplacement — clone e estilos

**O que faz:** Clona a imagem, marca translated, remove classes blur e força visibilidade/filtro/z-index.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Preserva atributos úteis enquanto garante que a tradução fique visível acima do backdrop.

**Alternativa ingênua pior:** Criar <img> do zero perderia layout/atributos; manter blur/opacidade pode esconder a tradução.

### U08 — linhas 152–165 — Twin Backdrop Sync

**O que faz:** Procura imagens com a mesma cleanUrl e sincroniza apenas gêmeos reconhecidos como backdrop.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Mantém fundos ambientais coerentes com a página traduzida sem criar jobs extras.

**Alternativa ingênua pior:** Deixar backdrop original cria arte duplicada/inconsistente; substituir todos os gêmeos poderia tocar imagens legítimas.

### U09 — linhas 166–188 — Overlay visual e cleanup

**O que faz:** Cria flash verde/vermelho, acompanha scroll, anima e remove listener/overlay após timeout.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Dá feedback visual curto sem deixar DOM/listeners permanentes.

**Alternativa ingênua pior:** Overlay sem cleanup causaria leak e UI residual; posição fixa sem acompanhar scroll sairia do lugar.

### U10 — linhas 189–189 — Export público

**O que faz:** Congela e publica quatro funções no namespace MangaTranslatorDomReplace.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Expõe somente a API consumida pelo content_manga.

**Alternativa ingênua pior:** Exportar helpers internos amplia superfície e facilita uso fora das invariantes.

### U11 — linhas 190–190 — Newline final

**O que faz:** Representa o newline terminal do blob auditado.

**Como faz:** opera diretamente sobre DOM/URLs/estilos do isolated world, usando guards e normalização específicos desta unidade.

**Por que assim:** Mantém equivalência física explícita da documentação.

**Alternativa ingênua pior:** Omitir a posição quebraria a convenção de rastreabilidade integral.

## 16. Auditoria final

- [x] SHA/fonte integral;
- [x] 189 linhas + newline = 190/190;
- [x] scanning/limites/filtros ligados às assertions reais;
- [x] twin backdrop dedup/sync ligados à suíte real;
- [x] replacement picture/lazy/overlay ligado ao consumer real testado;
- [x] URL normalization sem prova focal mantida como lacuna;
- [x] performance/DOM cleanup/edge cases explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `d3fc72032dbddc81eae8fadc5e4da89b13a3bb79`.

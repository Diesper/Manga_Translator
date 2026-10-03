# Bíblia técnica — extension/reader/reader.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `490bbb1842348e792cd593c37699a822d81f555b`  
> **Agente responsável pela auditoria:** GPT-5.6-Sol#K  
> **Tipo:** JavaScript — página interna MV3 / leitor offline virtualizado  
> **Linhas textuais:** **259**  
> **Posições documentais:** **260**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`reader.js` é o controlador do **Leitor Offline** do Manga Translator. Ele roda dentro de `extension/reader/reader.html`, recebe o identificador do capítulo por `?id=<chapterId>`, apresenta metadata do capítulo, monta uma sequência de páginas e mantém a memória sob controle carregando e descarregando imagens conforme a posição de scroll.

O arquivo fica entre três subsistemas concretos:

1. **Popup → reader:** `extension/popup/popup.js` abre `chrome.runtime.getURL(`reader/reader.html?id=${chap.id}`)` em uma nova aba.
2. **Reader → storage bridge:** `reader.html` carrega `../shared/shared-ui.js` antes de `reader.js`; esse helper expõe globalmente `smRequest()`, usado aqui para `SM_MIGRATE_CHAPTER`, `SM_PAGE_INDEX` e `SM_GET_PAGE`.
3. **Background → IndexedDB:** `extension/background.js` roteia essas actions para `MangaTranslatorStorageManager`; `storage-manager.js` mantém páginas/assets no IndexedDB e devolve o índice ordenado por `pageIndex`.

O reader preserva compatibilidade com o formato legado `${chapterId}_images` em `chrome.storage.local`. O objetivo é permitir que instalações antigas continuem abrindo capítulos enquanto a migração idempotente move os dados para o storage novo.

## 2. Carregamento, dependências e consumidores reais

- **Loader direto:** `reader.html` carrega `shared-ui.js` e depois `reader.js`. Portanto `smRequest` precisa existir no `globalThis` antes da primeira mensagem ao background.
- **Consumidor que abre a página:** `popup.js`, no item de capítulo traduzido, usa `chrome.tabs.create({ url: chrome.runtime.getURL(`reader/reader.html?id=${chap.id}`) })`.
- **DOM obrigatório:** `reader-container`, `chapter-title`, `page-counter`, `read-progress-fill`, `width-slider`, `width-val` e `close-btn` são definidos por `reader.html`.
- **Storage legado lido diretamente:** `chapterList` e `${chapterId}_images` em `chrome.storage.local`.
- **Storage novo lido indiretamente:** `SM_PAGE_INDEX` e `SM_GET_PAGE` via background/storage-manager.
- **Migração:** `SM_MIGRATE_CHAPTER` é enviada antes da consulta do índice.
- **APIs web:** URLSearchParams, localStorage, IntersectionObserver, requestAnimationFrame, Fullscreen API, DOM/layout e scroll.
- **Testes diretos da implementação real:** `reader.ui.test.js`, `keyboard-nav.test.js`, `page-counter.test.js`.
- **E2E da extensão real:** `reader-offline.spec.js`.

## 3. Lifecycle e estado

Este arquivo **não é o service worker** e não precisa sobreviver à suspensão MV3. Seu estado em memória pertence à aba do reader:

- `pageWraps`: wrappers DOM na ordem visual;
- `totalPages`: número total de páginas do índice escolhido;
- `pageVisibilityRatios`: último ratio conhecido por página;
- `counterScrollFrame`: RAF pendente;
- `currentReadWidth`: recebe a largura atual, mas hoje não possui leitura posterior;
- observers de contador/load/unload.

Ao fechar ou navegar a aba, esse estado pode desaparecer sem perda funcional: capítulo, assets e metadata duráveis vivem em storage. A preferência `readerWidth` é persistida em `localStorage` da origem da extensão.

## 4. Contrato de storage e compatibilidade

A sequência nominal é:

`chapterId da URL → chapterList/legado → SM_MIGRATE_CHAPTER → SM_PAGE_INDEX → wrappers → SM_GET_PAGE sob demanda`.

Se o índice novo estiver disponível e não vazio, os `pageIndex` dele são usados. `storage-manager.js` devolve esse índice ordenado numericamente. Se não houver índice novo, o reader converte as chaves legadas para número e ordena `a-b`.

O código deliberadamente não pede Base64 junto com o índice. Isso evita que abrir um capítulo grande materialize centenas de imagens de uma vez. No caminho novo, cada página é resolvida por `SM_GET_PAGE` apenas quando entra na margem de preload.

## 5. Virtualização, lazy load e memória

Todos os wrappers são criados antecipadamente para formar a sequência e permitir navegação/contagem, mas cada `img` nasce sem `src` e com `data-pending-src="1"`.

O loader usa `rootMargin: '200%'`. Antes do `await loadPageDataUrl`, o estado muda para `loading`, reduzindo fetch duplicado por callbacks repetidos. Depois do sucesso, o `src` recebe a Data URL e o placeholder de 400px só é removido no `onload`.

O unload usa margem mais ampla (`500%`) para criar histerese. Uma página realmente distante congela a altura atual, perde `src` e volta a `pendingSrc='1'`, podendo ser carregada novamente ao retornar.

**Importante:** os E2E atuais provam o lazy load real, inclusive uma página final esparsa, mas **não provam o unload**. A promessa de memória limitada existe no código e nos comentários, porém precisa de teste focal antes de ser tratada como propriedade automatizadamente garantida.

## 6. Contador, scroll e navegação

Há duas fontes de atualização do contador:

1. um IntersectionObserver com thresholds 0..1 mantém o maior `intersectionRatio` global conhecido;
2. scroll/resize agenda um RAF que escolhe o wrapper visível cujo centro está mais próximo do centro da viewport.

A persistência do Map é importante porque callbacks de IntersectionObserver podem ser parciais. O teste de `page-counter` reproduz exatamente isso: página 10 permanece vencedora quando o callback seguinte informa apenas a página 9 com ratio ainda menor.

Setas avançam/recuam 88% da viewport, preservando contexto. Home/End vão às extremidades. F/f alterna fullscreen.

## 7. Segurança, privacidade e trust boundaries

- `chapterId` vem da query string e deve ser tratado como entrada não confiável da própria URL da extensão. Neste arquivo ele é usado como identificador de chave/mensagem; não é interpolado em HTML, SQL ou caminho de filesystem.
- O título do capítulo é atribuído via `textContent`, não `innerHTML`; isso evita interpretar markup persistido como HTML.
- As duas mensagens vazias usam literais constantes em `innerHTML`; não incorporam dados do usuário.
- As imagens usam Data URLs vindas do storage interno. O reader não faz `fetch` de URL arbitrária.
- `smRequest` converte `chrome.runtime.lastError` e exceções síncronas em `null`, permitindo fallback legado no índice e falha recuperável de página.
- O reader confia no contrato interno de que `pageIndexResp.pages` será array quando `ok` e não vazio. Um payload interno malformado com `length > 0` mas sem `.map` poderia lançar.
- Não há validação local de `chapterId` contra tamanho/formato; o boundary real é o storage/router interno. Uma URL manual pode consultar um id inexistente, caso coberto visualmente apenas como metadata ausente/índice vazio.

## 8. Evidência automatizada

| Comportamento | Evidência realmente conferida | Classificação |
|---|---|---|
| Carregamento do reader real com HTML real | `tests/integration/reader.ui.test.js` usa `loadExtensionPage` com `extension/reader/reader.html` e `extension/reader/reader.js` | ✅ PROVADO DIRETAMENTE |
| Título, wrappers, contador e progresso iniciais | assertions exigem `One Piece 1050`, `1 / 2`, `50%`, 2 wrappers/2 imgs e label Página 1 | ✅ PROVADO DIRETAMENTE |
| Largura salva válida e nova largura do slider | assertions exigem 950px, depois 1100px e `localStorage.readerWidth === '1100'` | ✅ PROVADO DIRETAMENTE |
| Largura inválida cai para 800 | reader.ui.test.js semeia 5000 e exige container/slider/rótulo em 800 | ✅ PROVADO DIRETAMENTE |
| Botão fechar | click real em `#close-btn` + `window.close` chamado 1 vez | ✅ PROVADO DIRETAMENTE |
| URL sem chapterId | exige `ID inválido` e mensagem de capítulo não especificado | ✅ PROVADO DIRETAMENTE |
| Capítulo vazio | reader.ui.test.js e page-counter.test.js exigem `0 / 0` e mensagem vazia | ✅ PROVADO DIRETAMENTE |
| Setas avançam/recuam 88% | keyboard-nav.test.js verifica `scrollBy` ±`800*0.88` e preventDefault | ✅ PROVADO DIRETAMENTE |
| F/f alterna fullscreen | keyboard-nav.test.js verifica requestFullscreen e exitFullscreen em estados opostos | ✅ PROVADO DIRETAMENTE |
| Home/End | keyboard-nav.test.js verifica scrollTo topo e `document.body.scrollHeight` | ✅ PROVADO DIRETAMENTE |
| Tecla não mapeada | keyboard-nav.test.js exige ausência de preventDefault/scroll | ✅ PROVADO DIRETAMENTE |
| Observer do contador escolhe maior ratio | page-counter.test.js invoca callback real capturado e exige 3/5→5/5 e percentuais | ✅ PROVADO DIRETAMENTE |
| Empate de ratio | page-counter.test.js exige primeira página quando razões são iguais | ✅ PROVADO DIRETAMENTE |
| Persistência global de ratios entre callbacks | page-counter.test.js prova que callback posterior parcial não substitui página ainda mais visível | ✅ PROVADO DIRETAMENTE |
| Migração + índice + leitura real no Chromium | reader-offline.spec.js semeia legado, abre extensão MV3 real e prova 15 páginas esparsas, idx-0 e idx-200 | ✅ PROVADO EM E2E REAL |
| Persistência de largura ao reabrir no Chromium | reader-offline.spec.js move slider para 1000 e reabre a página exigindo o mesmo valor/CSS | ✅ PROVADO EM E2E REAL |
| Navegação e contador no Chromium | E2E pressiona ArrowRight e depois centraliza página 10; exige 4/15, 10/15 e 67% | ✅ PROVADO EM E2E REAL |
| Ordem de `shared-ui.js` antes de `reader.js` | `reader.html` contém os scripts nessa ordem | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `smRequest` global | `shared-ui.js` define `smRequest` e o expõe via `Object.assign(scope, { smRequest, ... })` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Roteamento SM_GET_PAGE/SM_PAGE_INDEX/SM_MIGRATE_CHAPTER | `background.js` encaminha para storage manager | 🟨 EXECUTADO INDIRETAMENTE para o reader; E2E prova fluxo conjunto |
| Ordenação no storage novo | `storage-manager.js#getChapterPageIndex` ordena por `pageIndex` | 🟨 DEPENDÊNCIA INSPECIONADA |
| Descarregamento de imagem distante | não há assertion que force unload, confira remoção de src, altura e reload posterior | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Falha/null de SM_GET_PAGE | não há teste focal do retry via `pendingSrc='1'` após resposta nula | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Coalescência por requestAnimationFrame/resize | E2E observa resultado de scroll, mas não contagem de RAF nem ramo de resize | 🟨 EXECUTADO INDIRETAMENTE |
| Exceção em localStorage | catches existem, porém testes cobrem valor inválido, não API lançando | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

### 8.1 Arquivos de prova/dependência efetivamente abertos

| Arquivo | SHA lido | Papel na prova |
|---|---|---|
| `extension/reader/reader.js` | `490bbb184234...` | implementação auditada |
| `extension/reader/reader.html` | `065fc4e201c5...` | DOM e ordem shared-ui → reader |
| `extension/shared/shared-ui.js` | `b284fb8eb0e8...` | implementação/exposição global de smRequest |
| `extension/popup/popup.js` | `300cfe9a9c81...` | consumidor que abre o reader |
| `extension/background.js` | `667c05eb2d7a...` | roteamento SM_* |
| `extension/shared/storage-manager.js` | `d1cd5a2c83ed...` | índice/páginas em IndexedDB e ordenação |
| `tests/integration/reader.ui.test.js` | `810a207f1264...` | UI/storage legado/width/close/empty com fonte real |
| `tests/unit/reader/keyboard-nav.test.js` | `0d64775426e2...` | teclado/fullscreen com fonte real |
| `tests/unit/reader/page-counter.test.js` | `cec252ffefc2...` | IntersectionObserver/contador com fonte real |
| `tests/e2e/reader-offline.spec.js` | `1ab953d0a031...` | extensão MV3 real, migração/storage/lazy load/width/keyboard |

## 9. Lacunas de teste

1. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — unload/virtualização de memória.** Falta forçar um wrapper para fora de `UNLOAD_MARGIN`, afirmar remoção de `src`, preservação de `minHeight`, retorno de `pendingSrc='1'` e reload ao voltar. Regressão possível: capítulos longos voltarem a acumular todas as imagens em memória.
2. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — falha de `SM_GET_PAGE`.** Falta responder `null`/`{ok:false}`, comprovar que o sentinel volta a `1` e que uma entrada posterior tenta novamente. Regressão possível: página ficar permanentemente vazia.
3. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — race durante await.** Falta disparar callbacks concorrentes e provar uma única busca por página enquanto `pendingSrc='loading'`. Regressão possível: leituras duplicadas e pressão de IPC/IndexedDB.
4. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — guard `pendingSrc !== 'loading'`.** O código contém o guard, mas os fluxos atuais não demonstram quem altera o sentinel durante o await.
5. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — `localStorage` lançando.** Testa-se valor inválido, não SecurityError/quota/indisponibilidade. Regressão possível: bootstrap do reader quebrar em ambientes restritos.
6. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — chapterId presente porém metadata ausente.** Falta afirmar `Capítulo não encontrado` e a política de continuar tentando páginas do storage.
7. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — payload malformado de `SM_PAGE_INDEX`.** Falta cobrir `ok:true` com `pages` não-array.
8. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — ordenação nova como contrato do reader.** A dependência `storage-manager.js` ordena e o E2E prova um caso esparso, mas não há teste focal que injete índice novo fora de ordem e verifique a sequência do reader.
9. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — scheduler RAF.** Falta disparar vários scrolls no mesmo frame e exigir apenas um cálculo; resize também não é isolado.
10. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — página com geometria zero/parcial.** Falta cobrir todos os wrappers fora da viewport e empate de distância geométrica.
11. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — rejection real da Fullscreen API.** O teste usa Promise resolvida; os `.catch(() => {})` não são focalmente provados.
12. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — valores exatos de PRELOAD/UNLOAD.** Alteração acidental das margens pode degradar performance sem teste falhar.
13. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — cleanup explícito dos observers/listeners.** A página depende do descarte do contexto ao fechar/navegar; não há teardown manual nem teste de lifecycle SPA/reexecução.
14. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — comportamento de `window.close` em aba não script-opened.** Unit test mocka a função; o E2E não clica Fechar.

### Testes recomendados

- Adicionar um teste de virtualização com callbacks controlados dos três IntersectionObservers, cobrindo load → unload → reload e altura congelada.
- Adicionar teste de falha/retry de `SM_GET_PAGE` com contagem de mensagens.
- Adicionar teste de callbacks duplicados enquanto a Promise de página está pendente.
- Adicionar teste de `SM_PAGE_INDEX` malformado e uma decisão explícita: fail closed para legado ou normalização com `Array.isArray`.
- Adicionar teste do scheduler: múltiplos scrolls antes do RAF devem produzir um único `requestAnimationFrame`.
- Adicionar teste de exceção em getItem/setItem de localStorage.
- Adicionar E2E de unload em capítulo grande usando observação de `src` e, se possível, métricas de memória/decodificação como evidência complementar.

## 10. Casos-limite e análise crítica

- **Estado morto:** `currentReadWidth` é atualizado mas não lido. Hoje não influencia comportamento.
- **Código morto/legado:** `loadedUrls = new Map()` nunca é consultado nem preenchido. O comentário fala em `objectURL`, enquanto a implementação usa Data URL diretamente. Isso sugere resíduo de estratégia anterior.
- **Contrato array implícito:** `hasNewStore` testa `(pageIndexResp.pages || []).length`, mas depois chama `.map` sem `Array.isArray`.
- **Metadata ausente com páginas existentes:** o título mostra “Capítulo não encontrado”, mas o fluxo continua e pode renderizar páginas pelo storage. Isso pode ser útil em recuperação, porém o estado visual é semanticamente ambíguo.
- **Erro de storage novo silencioso:** `smRequest` resolve null em runtime.lastError; no índice isso aciona legado. Em `SM_GET_PAGE`, a página fica pendente para retry futuro, sem feedback visual do erro.
- **Sem limite de wrappers:** blobs são virtualizados, mas todos os wrappers e labels continuam no DOM. Um capítulo extremo ainda tem custo DOM O(N), embora muito menor que manter N imagens decodificadas.
- **Observers não são desconectados manualmente:** aceitável para uma página descartável, mas reexecução do script no mesmo documento duplicaria listeners/observers.
- **Smooth scroll + duas fontes de contador:** observer de ratio e centro da viewport podem atualizar em ordens diferentes; o último callback vence. O E2E cobre resultados típicos, não disputa adversarial.
- **`img.loading='lazy'` + IntersectionObserver próprio:** são duas camadas de lazy load. Normalmente complementares, porém timing de decode/load pode variar entre navegadores.
- **Data URL retida em `src`:** remover `src` ajuda o navegador a liberar recursos, mas não há `URL.revokeObjectURL` porque não existem object URLs. Isso reforça que `loadedUrls` está obsoleto.
- **Comentários de distância:** os comentários traduzem `200%`/`500%` como “viewport heights”. A Bíblia preserva a intenção do código, mas os testes não verificam geometricamente essa equivalência em diferentes aspect ratios.
- **chapterId arbitrário:** por ser query string, um id manual pode causar leitura de uma chave legado arbitrária no namespace da extensão no formato `${id}_images`; não há exfiltração externa aqui, mas validação de formato poderia reduzir superfície acidental.

## 11. Invariantes

1. `reader.html` deve carregar o provedor de `smRequest` antes de `reader.js`.
2. O `chapterId` deve continuar vindo de uma fonte explicitamente definida e nunca ser interpolado em HTML não escapado.
3. Títulos persistidos devem continuar sendo escritos com `textContent`.
4. O índice visual `arrayPos` e o índice persistido `imgIdx` não podem ser confundidos; capítulos esparsos dependem dessa separação.
5. O fallback legado deve ordenar numericamente as chaves.
6. A leitura do storage novo deve continuar pedindo metadados primeiro e payload por página sob demanda.
7. Uma imagem não deve iniciar múltiplas cargas concorrentes enquanto seu sentinel está `loading`.
8. Falha de carga deve deixar a página elegível a retry.
9. O contador humano deve permanecer one-based mesmo que índices persistidos sejam zero-based/esparsos.
10. `totalPages === 0` não pode produzir divisão por zero na barra.
11. O Map de ratios deve preservar entradas entre callbacks parciais enquanto o observer não informou saída.
12. Scroll/resize não deve executar varredura geométrica ilimitada a cada evento; a coalescência por frame deve ser preservada ou substituída por mecanismo equivalente.
13. Teclas não mapeadas não devem ser bloqueadas.
14. O reader não deve carregar todas as Data URLs de um capítulo na inicialização.
15. Páginas descarregadas devem preservar altura suficiente para não deslocar o scroll.
16. PRELOAD deve ocorrer antes do ponto visível e UNLOAD deve ter histerese suficiente para evitar thrashing.
17. A preferência de largura inválida deve cair para um valor seguro dentro da faixa do slider.
18. Erros de persistência da largura não devem impedir leitura do capítulo.
19. Mudanças no novo storage não podem remover compatibilidade legada sem migração comprovadamente concluída.
20. `loadedUrls`/objectURL não deve ser reativado sem política explícita de `URL.revokeObjectURL`.
21. Se observers/listeners passarem a sobreviver a reexecução no mesmo documento, deve existir cleanup explícito.
22. Uma alteração de virtualização deve ganhar teste de unload antes de alegar consumo de memória limitado como propriedade provada.

## 12. Fonte integral

```javascript
// reader.js — Manga Translator v3.1

const urlParams  = new URLSearchParams(window.location.search);
const chapterId  = urlParams.get('id');
const container  = document.getElementById('reader-container');
const titleEl    = document.getElementById('chapter-title');
const counterEl  = document.getElementById('page-counter');
const fillEl     = document.getElementById('read-progress-fill');
const sliderEl   = document.getElementById('width-slider');
const widthValEl = document.getElementById('width-val');

let pageWraps  = []; 
let totalPages = 0;
let currentReadWidth = 800;

document.getElementById('close-btn').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
});

function applyWidth(px) {
    currentReadWidth = px;
    widthValEl.textContent = px + 'px';
    container.style.maxWidth = px + 'px';
    container.style.margin = '0 auto';
    try { localStorage.setItem('readerWidth', px); } catch(e) {}
}

sliderEl.addEventListener('input', () => applyWidth(parseInt(sliderEl.value)));

try {
    const saved = parseInt(localStorage.getItem('readerWidth'));
    if (saved >= 400 && saved <= 1200) {
        sliderEl.value = saved;
        applyWidth(saved);
    } else { applyWidth(800); }
} catch(e) { applyWidth(800); }

const pageVisibilityRatios = new Map();

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const idx = parseInt(entry.target.dataset.pageIdx, 10);
        if (!isNaN(idx)) {
            pageVisibilityRatios.set(idx, entry.isIntersecting === false ? 0 : entry.intersectionRatio);
        }
    });

    let mostVisibleIdx = null;
    let maxRatio = 0;
    pageVisibilityRatios.forEach((ratio, idx) => {
        if (ratio > maxRatio) {
            maxRatio = ratio;
            mostVisibleIdx = idx;
        }
    });

    if (mostVisibleIdx !== null) updateCounter(mostVisibleIdx + 1);
}, { threshold: Array.from({ length: 21 }, (_, i) => i * 0.05) });

function updateCounter(currentPage) {
    counterEl.textContent = `${currentPage} / ${totalPages}`;
    if (totalPages > 0) {
        fillEl.style.width = Math.round((currentPage / totalPages) * 100) + '%';
    }
}

let counterScrollFrame = null;

function updateCounterFromViewportCenter() {
    if (!pageWraps.length) return;

    const viewportCenter = window.innerHeight / 2;
    let closestIdx = null;
    let closestDistance = Infinity;

    pageWraps.forEach((wrap, idx) => {
        const rect = wrap.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;

        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - viewportCenter);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIdx = idx;
        }
    });

    if (closestIdx !== null) updateCounter(closestIdx + 1);
}

function scheduleCounterFromViewport() {
    if (counterScrollFrame !== null) return;
    counterScrollFrame = requestAnimationFrame(() => {
        counterScrollFrame = null;
        updateCounterFromViewportCenter();
    });
}

window.addEventListener('scroll', scheduleCounterFromViewport, { passive: true });
window.addEventListener('resize', scheduleCounterFromViewport, { passive: true });

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        window.scrollBy({ top: window.innerHeight * 0.88, behavior: 'smooth' });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        window.scrollBy({ top: -window.innerHeight * 0.88, behavior: 'smooth' });
    } else if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    } else if (e.key === 'Home') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (e.key === 'End') {
        e.preventDefault();
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
});

// ── Ponte com o armazenamento do background ──────────────────────────────────
// As páginas vivem no IndexedDB da extensão (storage-manager.js), gravadas pelo
// background. O leitor pede só o ÍNDICE (metadados, sem Base64) e busca cada
// página quando ela entra na janela de pré-carregamento.
if (!chapterId) {
    titleEl.textContent = 'ID inválido';
    container.innerHTML = '<div id="empty-msg">Nenhum capítulo especificado na URL.</div>';
} else {
    chrome.storage.local.get(['chapterList', `${chapterId}_images`], async (data) => {
        const list    = data.chapterList || [];
        const chapter = list.find(c => c.id === chapterId);

        if (chapter) {
            titleEl.textContent = chapter.title;
            document.title      = chapter.title + ' — Leitor Offline';
        } else {
            titleEl.textContent = 'Capítulo não encontrado';
        }

        // Migração idempotente e índice de páginas (sem blobs)
        await smRequest({ action: 'SM_MIGRATE_CHAPTER', chapterId });
        const pageIndexResp = await smRequest({ action: 'SM_PAGE_INDEX', chapterId });

        // Fallback legado: instalação que ainda não migrou este capítulo
        const legacyImages = data[`${chapterId}_images`] || {};
        const hasNewStore = !!(pageIndexResp && pageIndexResp.ok && (pageIndexResp.pages || []).length > 0);

        const indices = hasNewStore
            ? pageIndexResp.pages.map(p => p.pageIndex)
            : Object.keys(legacyImages).map(Number).sort((a, b) => a - b);

        totalPages = indices.length;

        // Resolve o Base64 de UMA página, sob demanda.
        async function loadPageDataUrl(imgIdx) {
            if (hasNewStore) {
                const resp = await smRequest({ action: 'SM_GET_PAGE', chapterId, pageIndex: imgIdx });
                return (resp && resp.ok && resp.dataUrl) ? resp.dataUrl : null;
            }
            return legacyImages[imgIdx] || null;
        }

        if (indices.length === 0) {
            container.innerHTML = '<div id="empty-msg">Nenhuma imagem salva neste capítulo.</div>';
            counterEl.textContent = '0 / 0';
            return;
        }

        updateCounter(1);

        const PRELOAD_MARGIN = '200%'; // Load images 2 viewport heights ahead
        const UNLOAD_MARGIN = '500%';  // Unload images 5 viewport heights away
        const loadedUrls = new Map(); // pageIdx -> objectURL

        // Create all wrappers but defer image loading
        indices.forEach((idx, arrayPos) => {
            const wrap = document.createElement('div');
            wrap.className = 'reader-page-wrap';
            wrap.dataset.pageIdx = arrayPos;
            wrap.dataset.imgIdx = idx;
            // Set minimum height for scroll estimation
            wrap.style.minHeight = '400px';

            const img = document.createElement('img');
            img.className = 'reader-page';
            img.alt = 'Página ' + (arrayPos + 1);
            img.draggable = false;
            img.loading = 'lazy';
            // Don't set src yet — observer will handle it
            img.dataset.pendingSrc = '1';
            wrap.appendChild(img);

            const label = document.createElement('div');
            label.className = 'page-label';
            label.textContent = `Página ${arrayPos + 1}`;
            wrap.appendChild(label);

            container.appendChild(wrap);
            pageWraps.push(wrap);
            
            observer.observe(wrap);
        });

        // Lazy loading observer
        const loadObserver = new IntersectionObserver((entries) => {
            entries.forEach(async (entry) => {
                if (!entry.isIntersecting) return;
                const wrap = entry.target;
                const imgIdx = parseInt(wrap.dataset.imgIdx, 10);
                const img = wrap.querySelector('img');
                if (!img || !img.dataset.pendingSrc) return;

                // Marca antes do await: o observer pode disparar de novo enquanto
                // a página ainda está sendo buscada no background.
                img.dataset.pendingSrc = 'loading';
                const dataUrl = await loadPageDataUrl(imgIdx);
                if (!dataUrl) { img.dataset.pendingSrc = '1'; return; }

                // A página pode ter saído da tela durante a busca
                if (img.dataset.pendingSrc !== 'loading') return;

                img.src = dataUrl;
                delete img.dataset.pendingSrc;
                img.onload = () => { wrap.style.minHeight = ''; };
            });
        }, { rootMargin: PRELOAD_MARGIN });

        // ── Descarregamento (virtualização real) ─────────────────────────────
        // Sem isto, rolar um capítulo de 200 páginas acabava com TODAS as páginas
        // em memória: o consumo passava a depender do tamanho do capítulo, não da
        // janela visível. Páginas que saem de 5 viewports de distância têm o src
        // liberado e voltam a ser placeholders com altura preservada.
        const unloadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) return;
                const wrap = entry.target;
                const img = wrap.querySelector('img');
                if (!img || img.dataset.pendingSrc || !img.getAttribute('src')) return;

                // Congela a altura atual para o scroll não "pular" ao descarregar
                const currentHeight = wrap.offsetHeight;
                if (currentHeight > 0) wrap.style.minHeight = currentHeight + 'px';

                img.removeAttribute('src');
                img.dataset.pendingSrc = '1';
            });
        }, { rootMargin: UNLOAD_MARGIN });

        pageWraps.forEach(wrap => {
            loadObserver.observe(wrap);
            unloadObserver.observe(wrap);
        });
    });
}

```

## 13. Cobertura documental linha a linha

A seguir, **cada posição do blob auditado** é rastreada. Linhas vazias e o newline final são documentados explicitamente.


### Linha 001 — U01

**Fonte:** ``// reader.js — Manga Translator v3.1``

**O que faz:** Cabeçalho identifica o arquivo e a versão histórica declarada do reader; não altera runtime.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 002 — U01

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U01 (Bootstrap da página, query string, DOM e estado efêmero); não produz efeito de runtime.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 003 — U01

**Fonte:** ``const urlParams  = new URLSearchParams(window.location.search);``

**O que faz:** Cria URLSearchParams a partir da query da própria página do reader.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 004 — U01

**Fonte:** ``const chapterId  = urlParams.get('id');``

**O que faz:** Extrai o parâmetro id; esse chapterId passa a identificar metadata, chaves legadas e mensagens SM_*.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 005 — U01

**Fonte:** ``const container  = document.getElementById('reader-container');``

**O que faz:** Resolve o container que receberá placeholders, imagens e estados vazios.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 006 — U01

**Fonte:** ``const titleEl    = document.getElementById('chapter-title');``

**O que faz:** Resolve o elemento de título do capítulo.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 007 — U01

**Fonte:** ``const counterEl  = document.getElementById('page-counter');``

**O que faz:** Resolve o contador textual de páginas.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 008 — U01

**Fonte:** ``const fillEl     = document.getElementById('read-progress-fill');``

**O que faz:** Resolve o preenchimento visual da barra de progresso.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 009 — U01

**Fonte:** ``const sliderEl   = document.getElementById('width-slider');``

**O que faz:** Resolve o input range que controla a largura de leitura.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 010 — U01

**Fonte:** ``const widthValEl = document.getElementById('width-val');``

**O que faz:** Resolve o rótulo numérico exibido ao lado do slider.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 011 — U01

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U01 (Bootstrap da página, query string, DOM e estado efêmero); não produz efeito de runtime.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 012 — U01

**Fonte:** ``let pageWraps  = []; ``

**O que faz:** Inicializa a lista mutável de wrappers na ordem visual; ela também é usada no cálculo geométrico do contador.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 013 — U01

**Fonte:** ``let totalPages = 0;``

**O que faz:** Inicializa totalPages em zero até a resposta de storage definir o índice real.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 014 — U01

**Fonte:** ``let currentReadWidth = 800;``

**O que faz:** Inicializa currentReadWidth em 800; a variável é atualizada por applyWidth, mas não é lida posteriormente no arquivo.

**Como faz:** O script captura o chapterId da query string, resolve os elementos estáticos definidos por reader.html e inicializa apenas estado efêmero da aba para páginas, total e largura.

**Por que foi implementado dessa forma:** O reader é uma página da própria extensão e pode resolver suas âncoras DOM uma vez no carregamento. O id via URL desacopla a abertura feita pelo popup da persistência real do capítulo.

**Por que uma implementação ingênua seria pior:** Buscar repetidamente os mesmos IDs aumentaria acoplamento e custo; guardar os blobs em variáveis globais desde o início destruiria a virtualização e escalaria memória com o capítulo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: reader.ui.test.js e os testes unitários carregam reader.html + reader.js reais; a ausência de id tem assertion direta mais adiante.


### Linha 015 — U02

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U02 (Fechamento explícito do leitor); não produz efeito de runtime.

**Como faz:** O listener cancela a navegação padrão do link # e delega o fechamento à API window.close().

**Por que foi implementado dessa forma:** O elemento visual é um link por simplicidade de markup, mas seu contrato é fechar a aba/janela do reader, não navegar para um fragmento.

**Por que uma implementação ingênua seria pior:** Deixar o href atuar primeiro alteraria histórico/URL e poderia não fechar a superfície criada pela extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js clica #close-btn e exige window.close exatamente uma vez.


### Linha 016 — U02

**Fonte:** ``document.getElementById('close-btn').addEventListener('click', (e) => {``

**O que faz:** Registra o handler do link/botão Fechar.

**Como faz:** O listener cancela a navegação padrão do link # e delega o fechamento à API window.close().

**Por que foi implementado dessa forma:** O elemento visual é um link por simplicidade de markup, mas seu contrato é fechar a aba/janela do reader, não navegar para um fragmento.

**Por que uma implementação ingênua seria pior:** Deixar o href atuar primeiro alteraria histórico/URL e poderia não fechar a superfície criada pela extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js clica #close-btn e exige window.close exatamente uma vez.


### Linha 017 — U02

**Fonte:** ``    e.preventDefault();``

**O que faz:** Cancela a navegação para # que o elemento <a> executaria por padrão.

**Como faz:** O listener cancela a navegação padrão do link # e delega o fechamento à API window.close().

**Por que foi implementado dessa forma:** O elemento visual é um link por simplicidade de markup, mas seu contrato é fechar a aba/janela do reader, não navegar para um fragmento.

**Por que uma implementação ingênua seria pior:** Deixar o href atuar primeiro alteraria histórico/URL e poderia não fechar a superfície criada pela extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js clica #close-btn e exige window.close exatamente uma vez.


### Linha 018 — U02

**Fonte:** ``    window.close();``

**O que faz:** Solicita fechamento da janela/aba atual do reader.

**Como faz:** O listener cancela a navegação padrão do link # e delega o fechamento à API window.close().

**Por que foi implementado dessa forma:** O elemento visual é um link por simplicidade de markup, mas seu contrato é fechar a aba/janela do reader, não navegar para um fragmento.

**Por que uma implementação ingênua seria pior:** Deixar o href atuar primeiro alteraria histórico/URL e poderia não fechar a superfície criada pela extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js clica #close-btn e exige window.close exatamente uma vez.


### Linha 019 — U02

**Fonte:** ``});``

**O que faz:** Fecha o callback do click.

**Como faz:** O listener cancela a navegação padrão do link # e delega o fechamento à API window.close().

**Por que foi implementado dessa forma:** O elemento visual é um link por simplicidade de markup, mas seu contrato é fechar a aba/janela do reader, não navegar para um fragmento.

**Por que uma implementação ingênua seria pior:** Deixar o href atuar primeiro alteraria histórico/URL e poderia não fechar a superfície criada pela extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js clica #close-btn e exige window.close exatamente uma vez.


### Linha 020 — U02

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U02 (Fechamento explícito do leitor); não produz efeito de runtime.

**Como faz:** O listener cancela a navegação padrão do link # e delega o fechamento à API window.close().

**Por que foi implementado dessa forma:** O elemento visual é um link por simplicidade de markup, mas seu contrato é fechar a aba/janela do reader, não navegar para um fragmento.

**Por que uma implementação ingênua seria pior:** Deixar o href atuar primeiro alteraria histórico/URL e poderia não fechar a superfície criada pela extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js clica #close-btn e exige window.close exatamente uma vez.


### Linha 021 — U03

**Fonte:** ``function applyWidth(px) {``

**O que faz:** Declara a função única que aplica e persiste a largura escolhida.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 022 — U03

**Fonte:** ``    currentReadWidth = px;``

**O que faz:** Atualiza currentReadWidth; hoje esse estado não possui consumidor posterior no arquivo.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 023 — U03

**Fonte:** ``    widthValEl.textContent = px + 'px';``

**O que faz:** Sincroniza o texto visível para o formato Npx.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 024 — U03

**Fonte:** ``    container.style.maxWidth = px + 'px';``

**O que faz:** Limita visualmente o container à largura escolhida.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 025 — U03

**Fonte:** ``    container.style.margin = '0 auto';``

**O que faz:** Centraliza o container horizontalmente após aplicar maxWidth.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 026 — U03

**Fonte:** ``    try { localStorage.setItem('readerWidth', px); } catch(e) {}``

**O que faz:** Persiste readerWidth em localStorage e absorve indisponibilidade/erro de storage para não derrubar a UI.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 027 — U03

**Fonte:** ``}``

**O que faz:** Encerra applyWidth.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 028 — U03

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U03 (Controle de largura e persistência local); não produz efeito de runtime.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 029 — U03

**Fonte:** ``sliderEl.addEventListener('input', () => applyWidth(parseInt(sliderEl.value)));``

**O que faz:** No input do range, converte slider.value para inteiro e aplica a nova largura.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 030 — U03

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U03 (Controle de largura e persistência local); não produz efeito de runtime.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 031 — U03

**Fonte:** ``try {``

**O que faz:** Inicia proteção contra exceções ao ler localStorage.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 032 — U03

**Fonte:** ``    const saved = parseInt(localStorage.getItem('readerWidth'));``

**O que faz:** Lê readerWidth persistido e faz parse inteiro; NaN seguirá para o fallback.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 033 — U03

**Fonte:** ``    if (saved >= 400 && saved <= 1200) {``

**O que faz:** Aceita o valor salvo somente dentro da faixa 400..1200.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 034 — U03

**Fonte:** ``        sliderEl.value = saved;``

**O que faz:** Move o slider para refletir a preferência válida.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 035 — U03

**Fonte:** ``        applyWidth(saved);``

**O que faz:** Aplica visualmente e repersiste a preferência válida.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 036 — U03

**Fonte:** ``    } else { applyWidth(800); }``

**O que faz:** Valor inválido/ausente cai imediatamente para 800px.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 037 — U03

**Fonte:** ``} catch(e) { applyWidth(800); }``

**O que faz:** Qualquer exceção de localStorage também cai para 800px.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 038 — U03

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U03 (Controle de largura e persistência local); não produz efeito de runtime.

**Como faz:** applyWidth sincroniza valor em memória, rótulo, max-width/margem do container e readerWidth em localStorage; o slider chama essa função e o bootstrap aceita somente 400..1200.

**Por que foi implementado dessa forma:** A preferência é puramente de apresentação da página do reader e não precisa trafegar pelo service worker ou chrome.storage. A faixa replica o min/max do input.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer valor persistido pode produzir reader inutilizável; espalhar a aplicação da largura em vários handlers criaria divergência entre UI, CSS e storage.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js cobre largura salva válida, alteração pelo slider e fallback 800 para valor fora da faixa; E2E-20 prova persistência após reabrir.


### Linha 039 — U04

**Fonte:** ``const pageVisibilityRatios = new Map();``

**O que faz:** Cria Map índice→intersectionRatio para conservar visibilidade entre callbacks parciais.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 040 — U04

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U04 (Contador por visibilidade acumulada); não produz efeito de runtime.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 041 — U04

**Fonte:** ``const observer = new IntersectionObserver((entries) => {``

**O que faz:** Cria o IntersectionObserver responsável pelo contador por visibilidade.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 042 — U04

**Fonte:** ``    entries.forEach(entry => {``

**O que faz:** Percorre somente as entries entregues no callback atual.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 043 — U04

**Fonte:** ``        const idx = parseInt(entry.target.dataset.pageIdx, 10);``

**O que faz:** Lê pageIdx posicional do dataset do wrapper e força base decimal.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 044 — U04

**Fonte:** ``        if (!isNaN(idx)) {``

**O que faz:** Ignora wrapper cujo pageIdx não seja número válido.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 045 — U04

**Fonte:** ``            pageVisibilityRatios.set(idx, entry.isIntersecting === false ? 0 : entry.intersectionRatio);``

**O que faz:** Grava razão zero quando isIntersecting é explicitamente false; caso contrário grava intersectionRatio recebido.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 046 — U04

**Fonte:** ``        }``

**O que faz:** Fecha uma estrutura sintática pertencente a U04 (Contador por visibilidade acumulada), sem efeito colateral independente.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 047 — U04

**Fonte:** ``    });``

**O que faz:** Encerra a atualização das entries do callback.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 048 — U04

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U04 (Contador por visibilidade acumulada); não produz efeito de runtime.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 049 — U04

**Fonte:** ``    let mostVisibleIdx = null;``

**O que faz:** Inicializa ausência de página vencedora para esta recomputação global.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 050 — U04

**Fonte:** ``    let maxRatio = 0;``

**O que faz:** Inicializa maior razão em zero; entradas com razão zero não vencem.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 051 — U04

**Fonte:** ``    pageVisibilityRatios.forEach((ratio, idx) => {``

**O que faz:** Percorre todo o Map acumulado, não apenas o callback corrente.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 052 — U04

**Fonte:** ``        if (ratio > maxRatio) {``

**O que faz:** Só substitui o vencedor por razão estritamente maior; empate mantém o primeiro encontrado.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 053 — U04

**Fonte:** ``            maxRatio = ratio;``

**O que faz:** Atualiza o maior ratio observado.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 054 — U04

**Fonte:** ``            mostVisibleIdx = idx;``

**O que faz:** Memoriza o índice visual correspondente ao novo máximo.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 055 — U04

**Fonte:** ``        }``

**O que faz:** Fecha uma estrutura sintática pertencente a U04 (Contador por visibilidade acumulada), sem efeito colateral independente.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 056 — U04

**Fonte:** ``    });``

**O que faz:** Encerra a varredura do mapa.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 057 — U04

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U04 (Contador por visibilidade acumulada); não produz efeito de runtime.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 058 — U04

**Fonte:** ``    if (mostVisibleIdx !== null) updateCounter(mostVisibleIdx + 1);``

**O que faz:** Se alguma página tem ratio positivo, converte índice zero-based em número humano one-based e atualiza UI.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 059 — U04

**Fonte:** ``}, { threshold: Array.from({ length: 21 }, (_, i) => i * 0.05) });``

**O que faz:** Configura 21 thresholds de 0 a 1 em passos de 0,05 para receber granularidade de visibilidade.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 060 — U04

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U04 (Contador por visibilidade acumulada); não produz efeito de runtime.

**Como faz:** Um Map mantém o último intersectionRatio conhecido por índice; o IntersectionObserver atualiza entradas recebidas e escolhe globalmente a maior razão conhecida antes de chamar updateCounter.

**Por que foi implementado dessa forma:** Callbacks de IntersectionObserver podem trazer apenas subconjuntos; manter o mapa evita trocar para uma página menos visível só porque a página dominante não veio no callback seguinte.

**Por que uma implementação ingênua seria pior:** Escolher apenas o maior ratio do callback corrente reproduziria o bug de contador regressando/avançando quando callbacks são parciais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: page-counter.test.js prova atualização 1→3→5, empate preservando o primeiro e, crucialmente, a página globalmente mais visível entre callbacks parciais.


### Linha 061 — U05

**Fonte:** ``function updateCounter(currentPage) {``

**O que faz:** Declara a função central de renderização de contador/progresso.

**Como faz:** updateCounter escreve currentPage/totalPages e, quando existe ao menos uma página, converte a fração lida em percentual inteiro para a barra.

**Por que foi implementado dessa forma:** A função centraliza duas representações do mesmo progresso e evita cálculo de divisão por zero no estado vazio.

**Por que uma implementação ingênua seria pior:** Atualizar texto e barra em caminhos diferentes permitiria inconsistências visuais; dividir por zero poderia produzir NaN/Infinity no CSS.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js exige 1/2 + 50%; page-counter.test.js exige 3/5 + 60% e 5/5 + 100%.


### Linha 062 — U05

**Fonte:** ``    counterEl.textContent = `${currentPage} / ${totalPages}`;``

**O que faz:** Escreve a forma humana current / total.

**Como faz:** updateCounter escreve currentPage/totalPages e, quando existe ao menos uma página, converte a fração lida em percentual inteiro para a barra.

**Por que foi implementado dessa forma:** A função centraliza duas representações do mesmo progresso e evita cálculo de divisão por zero no estado vazio.

**Por que uma implementação ingênua seria pior:** Atualizar texto e barra em caminhos diferentes permitiria inconsistências visuais; dividir por zero poderia produzir NaN/Infinity no CSS.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js exige 1/2 + 50%; page-counter.test.js exige 3/5 + 60% e 5/5 + 100%.


### Linha 063 — U05

**Fonte:** ``    if (totalPages > 0) {``

**O que faz:** Evita calcular porcentagem quando totalPages é zero.

**Como faz:** updateCounter escreve currentPage/totalPages e, quando existe ao menos uma página, converte a fração lida em percentual inteiro para a barra.

**Por que foi implementado dessa forma:** A função centraliza duas representações do mesmo progresso e evita cálculo de divisão por zero no estado vazio.

**Por que uma implementação ingênua seria pior:** Atualizar texto e barra em caminhos diferentes permitiria inconsistências visuais; dividir por zero poderia produzir NaN/Infinity no CSS.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js exige 1/2 + 50%; page-counter.test.js exige 3/5 + 60% e 5/5 + 100%.


### Linha 064 — U05

**Fonte:** ``        fillEl.style.width = Math.round((currentPage / totalPages) * 100) + '%';``

**O que faz:** Calcula fração current/total, arredonda para inteiro e aplica como width percentual.

**Como faz:** updateCounter escreve currentPage/totalPages e, quando existe ao menos uma página, converte a fração lida em percentual inteiro para a barra.

**Por que foi implementado dessa forma:** A função centraliza duas representações do mesmo progresso e evita cálculo de divisão por zero no estado vazio.

**Por que uma implementação ingênua seria pior:** Atualizar texto e barra em caminhos diferentes permitiria inconsistências visuais; dividir por zero poderia produzir NaN/Infinity no CSS.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js exige 1/2 + 50%; page-counter.test.js exige 3/5 + 60% e 5/5 + 100%.


### Linha 065 — U05

**Fonte:** ``    }``

**O que faz:** Fecha uma estrutura sintática pertencente a U05 (Renderização do contador e progresso), sem efeito colateral independente.

**Como faz:** updateCounter escreve currentPage/totalPages e, quando existe ao menos uma página, converte a fração lida em percentual inteiro para a barra.

**Por que foi implementado dessa forma:** A função centraliza duas representações do mesmo progresso e evita cálculo de divisão por zero no estado vazio.

**Por que uma implementação ingênua seria pior:** Atualizar texto e barra em caminhos diferentes permitiria inconsistências visuais; dividir por zero poderia produzir NaN/Infinity no CSS.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js exige 1/2 + 50%; page-counter.test.js exige 3/5 + 60% e 5/5 + 100%.


### Linha 066 — U05

**Fonte:** ``}``

**O que faz:** Encerra updateCounter.

**Como faz:** updateCounter escreve currentPage/totalPages e, quando existe ao menos uma página, converte a fração lida em percentual inteiro para a barra.

**Por que foi implementado dessa forma:** A função centraliza duas representações do mesmo progresso e evita cálculo de divisão por zero no estado vazio.

**Por que uma implementação ingênua seria pior:** Atualizar texto e barra em caminhos diferentes permitiria inconsistências visuais; dividir por zero poderia produzir NaN/Infinity no CSS.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js exige 1/2 + 50%; page-counter.test.js exige 3/5 + 60% e 5/5 + 100%.


### Linha 067 — U05

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U05 (Renderização do contador e progresso); não produz efeito de runtime.

**Como faz:** updateCounter escreve currentPage/totalPages e, quando existe ao menos uma página, converte a fração lida em percentual inteiro para a barra.

**Por que foi implementado dessa forma:** A função centraliza duas representações do mesmo progresso e evita cálculo de divisão por zero no estado vazio.

**Por que uma implementação ingênua seria pior:** Atualizar texto e barra em caminhos diferentes permitiria inconsistências visuais; dividir por zero poderia produzir NaN/Infinity no CSS.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js exige 1/2 + 50%; page-counter.test.js exige 3/5 + 60% e 5/5 + 100%.


### Linha 068 — U06

**Fonte:** ``let counterScrollFrame = null;``

**O que faz:** Mantém o id do requestAnimationFrame pendente; null significa que nenhum recálculo está agendado.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 069 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Fallback de contador pelo centro do viewport e coalescência por RAF); não produz efeito de runtime.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 070 — U06

**Fonte:** ``function updateCounterFromViewportCenter() {``

**O que faz:** Declara o fallback geométrico baseado no centro da viewport.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 071 — U06

**Fonte:** ``    if (!pageWraps.length) return;``

**O que faz:** Sai cedo quando ainda não existem wrappers.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 072 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Fallback de contador pelo centro do viewport e coalescência por RAF); não produz efeito de runtime.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 073 — U06

**Fonte:** ``    const viewportCenter = window.innerHeight / 2;``

**O que faz:** Calcula a coordenada vertical central da viewport.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 074 — U06

**Fonte:** ``    let closestIdx = null;``

**O que faz:** Inicializa o índice candidato como ausente.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 075 — U06

**Fonte:** ``    let closestDistance = Infinity;``

**O que faz:** Inicializa a melhor distância como infinito para qualquer página visível válida poder vencer.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 076 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Fallback de contador pelo centro do viewport e coalescência por RAF); não produz efeito de runtime.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 077 — U06

**Fonte:** ``    pageWraps.forEach((wrap, idx) => {``

**O que faz:** Percorre wrappers na ordem visual e recebe também o índice one-to-one.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 078 — U06

**Fonte:** ``        const rect = wrap.getBoundingClientRect();``

**O que faz:** Obtém a geometria atual do wrapper, operação que pode provocar leitura de layout.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 079 — U06

**Fonte:** ``        if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;``

**O que faz:** Descarta páginas completamente acima ou abaixo da viewport.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 080 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Fallback de contador pelo centro do viewport e coalescência por RAF); não produz efeito de runtime.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 081 — U06

**Fonte:** ``        const pageCenter = rect.top + rect.height / 2;``

**O que faz:** Calcula o centro vertical da página visível.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 082 — U06

**Fonte:** ``        const distance = Math.abs(pageCenter - viewportCenter);``

**O que faz:** Mede distância absoluta entre centro da página e centro da viewport.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 083 — U06

**Fonte:** ``        if (distance < closestDistance) {``

**O que faz:** Compara a distância atual com a menor já encontrada.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 084 — U06

**Fonte:** ``            closestDistance = distance;``

**O que faz:** Guarda a nova menor distância.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 085 — U06

**Fonte:** ``            closestIdx = idx;``

**O que faz:** Guarda o índice visual da página mais central.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 086 — U06

**Fonte:** ``        }``

**O que faz:** Fecha uma estrutura sintática pertencente a U06 (Fallback de contador pelo centro do viewport e coalescência por RAF), sem efeito colateral independente.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 087 — U06

**Fonte:** ``    });``

**O que faz:** Encerra a varredura de wrappers.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 088 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Fallback de contador pelo centro do viewport e coalescência por RAF); não produz efeito de runtime.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 089 — U06

**Fonte:** ``    if (closestIdx !== null) updateCounter(closestIdx + 1);``

**O que faz:** Atualiza o contador para a página visual mais central se alguma estava visível.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 090 — U06

**Fonte:** ``}``

**O que faz:** Encerra o cálculo geométrico.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 091 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Fallback de contador pelo centro do viewport e coalescência por RAF); não produz efeito de runtime.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 092 — U06

**Fonte:** ``function scheduleCounterFromViewport() {``

**O que faz:** Declara o agendador coalescido para scroll/resize.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 093 — U06

**Fonte:** ``    if (counterScrollFrame !== null) return;``

**O que faz:** Se já existe RAF pendente, ignora eventos adicionais até o frame executar.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 094 — U06

**Fonte:** ``    counterScrollFrame = requestAnimationFrame(() => {``

**O que faz:** Agenda um único callback para o próximo frame de animação.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 095 — U06

**Fonte:** ``        counterScrollFrame = null;``

**O que faz:** Libera o sentinel antes do cálculo para permitir novo agendamento posterior.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 096 — U06

**Fonte:** ``        updateCounterFromViewportCenter();``

**O que faz:** Executa o cálculo geométrico já coalescido.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 097 — U06

**Fonte:** ``    });``

**O que faz:** Fecha callback do RAF.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 098 — U06

**Fonte:** ``}``

**O que faz:** Encerra o agendador.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 099 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Fallback de contador pelo centro do viewport e coalescência por RAF); não produz efeito de runtime.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 100 — U06

**Fonte:** ``window.addEventListener('scroll', scheduleCounterFromViewport, { passive: true });``

**O que faz:** Liga scroll da janela ao agendador com listener passive para não bloquear scrolling.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 101 — U06

**Fonte:** ``window.addEventListener('resize', scheduleCounterFromViewport, { passive: true });``

**O que faz:** Liga resize ao mesmo recálculo coalescido.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 102 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Fallback de contador pelo centro do viewport e coalescência por RAF); não produz efeito de runtime.

**Como faz:** O código procura, entre wrappers atualmente visíveis, o centro de página mais próximo do centro vertical da viewport. Scroll/resize apenas agenda um requestAnimationFrame, impedindo múltiplos cálculos no mesmo frame.

**Por que foi implementado dessa forma:** IntersectionObserver é assíncrono e pode não refletir imediatamente o ponto visual esperado durante smooth scroll/resize; o cálculo geométrico serve como segunda fonte de atualização.

**Por que uma implementação ingênua seria pior:** Executar getBoundingClientRect para todas as páginas em cada evento bruto de scroll causaria layout work excessivo e jank; sem filtro de visibilidade páginas distantes poderiam vencer por geometria inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o E2E real verifica que teclado/scroll e scrollIntoView atualizam o contador, mas não há assertion focal que prove cada ramo de centro, RAF e resize.


### Linha 103 — U07

**Fonte:** ``document.addEventListener('keydown', (e) => {``

**O que faz:** Instala um único listener de teclado no document do reader.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 104 — U07

**Fonte:** ``    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {``

**O que faz:** Reconhece ArrowRight e ArrowDown como avanço.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 105 — U07

**Fonte:** ``        e.preventDefault();``

**O que faz:** Evita comportamento nativo adicional dessas setas.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 106 — U07

**Fonte:** ``        window.scrollBy({ top: window.innerHeight * 0.88, behavior: 'smooth' });``

**O que faz:** Rola suavemente para baixo 88% da altura atual da viewport.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 107 — U07

**Fonte:** ``    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {``

**O que faz:** Reconhece ArrowLeft e ArrowUp como retrocesso.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 108 — U07

**Fonte:** ``        e.preventDefault();``

**O que faz:** Evita comportamento nativo adicional dessas setas.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 109 — U07

**Fonte:** ``        window.scrollBy({ top: -window.innerHeight * 0.88, behavior: 'smooth' });``

**O que faz:** Rola suavemente para cima 88% da viewport usando deslocamento negativo.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 110 — U07

**Fonte:** ``    } else if (e.key === 'f' || e.key === 'F') {``

**O que faz:** Reconhece tanto f quanto F como comando de fullscreen.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 111 — U07

**Fonte:** ``        if (!document.fullscreenElement) {``

**O que faz:** Consulta document.fullscreenElement para decidir entrada versus saída.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 112 — U07

**Fonte:** ``            document.documentElement.requestFullscreen().catch(() => {});``

**O que faz:** Pede fullscreen do elemento raiz e absorve rejeição da Promise.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 113 — U07

**Fonte:** ``        } else {``

**O que faz:** Seleciona o ramo de saída quando já existe elemento fullscreen.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 114 — U07

**Fonte:** ``            document.exitFullscreen().catch(() => {});``

**O que faz:** Solicita exitFullscreen e também absorve rejeição.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 115 — U07

**Fonte:** ``        }``

**O que faz:** Fecha uma estrutura sintática pertencente a U07 (Navegação por teclado e fullscreen), sem efeito colateral independente.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 116 — U07

**Fonte:** ``    } else if (e.key === 'Home') {``

**O que faz:** Reconhece Home como navegação para o topo.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 117 — U07

**Fonte:** ``        e.preventDefault();``

**O que faz:** Cancela comportamento padrão de Home.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 118 — U07

**Fonte:** ``        window.scrollTo({ top: 0, behavior: 'smooth' });``

**O que faz:** Rola suavemente para top=0.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 119 — U07

**Fonte:** ``    } else if (e.key === 'End') {``

**O que faz:** Reconhece End como navegação para o fim do documento.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 120 — U07

**Fonte:** ``        e.preventDefault();``

**O que faz:** Cancela comportamento padrão de End.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 121 — U07

**Fonte:** ``        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });``

**O que faz:** Usa document.body.scrollHeight como destino do scroll suave final.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 122 — U07

**Fonte:** ``    }``

**O que faz:** Encerra a cadeia de teclas reconhecidas; teclas restantes não sofrem preventDefault.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 123 — U07

**Fonte:** ``});``

**O que faz:** Encerra o listener keydown.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 124 — U07

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U07 (Navegação por teclado e fullscreen); não produz efeito de runtime.

**Como faz:** Um único keydown mapeia setas para scroll de 88% da viewport, F para alternância fullscreen e Home/End para extremidades, prevenindo default apenas nas teclas de navegação.

**Por que foi implementado dessa forma:** 88% preserva contexto visual entre saltos. A alternância usa document.fullscreenElement como fonte de estado e absorve rejeições da Fullscreen API para não quebrar o reader.

**Por que uma implementação ingênua seria pior:** Um salto de 100% pode ocultar contexto; capturar toda tecla bloquearia atalhos/entrada; ignorar promise rejection da API poderia gerar erro não tratado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: keyboard-nav.test.js cobre setas, 88%, preventDefault, F/f, Home/End e tecla não mapeada; E2E-21 cobre avanço real no Chromium.


### Linha 125 — U08

**Fonte:** ``// ── Ponte com o armazenamento do background ──────────────────────────────────``

**O que faz:** Comentário demarca o boundary entre UI do reader e armazenamento gerenciado pelo background.

**Como faz:** Os comentários registram o desenho IndexedDB-on-demand. Se chapterId não existe, o script não consulta storage e renderiza erro local.

**Por que foi implementado dessa forma:** Sem id não há chave de capítulo segura/útil a consultar; falhar cedo evita mensagens SM_* sem alvo e deixa uma explicação visível ao usuário.

**Por que uma implementação ingênua seria pior:** Continuar com chapterId null produziria chaves como null_images e mensagens ambíguas ao background.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js carrega a URL sem id e exige 'ID inválido' e a mensagem de capítulo não especificado.


### Linha 126 — U08

**Fonte:** ``// As páginas vivem no IndexedDB da extensão (storage-manager.js), gravadas pelo``

**O que faz:** Comentário afirma que o storage novo reside em IndexedDB via storage-manager.js.

**Como faz:** Os comentários registram o desenho IndexedDB-on-demand. Se chapterId não existe, o script não consulta storage e renderiza erro local.

**Por que foi implementado dessa forma:** Sem id não há chave de capítulo segura/útil a consultar; falhar cedo evita mensagens SM_* sem alvo e deixa uma explicação visível ao usuário.

**Por que uma implementação ingênua seria pior:** Continuar com chapterId null produziria chaves como null_images e mensagens ambíguas ao background.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js carrega a URL sem id e exige 'ID inválido' e a mensagem de capítulo não especificado.


### Linha 127 — U08

**Fonte:** ``// background. O leitor pede só o ÍNDICE (metadados, sem Base64) e busca cada``

**O que faz:** Comentário explicita que o reader busca primeiro metadados/índice, não o conjunto de Base64.

**Como faz:** Os comentários registram o desenho IndexedDB-on-demand. Se chapterId não existe, o script não consulta storage e renderiza erro local.

**Por que foi implementado dessa forma:** Sem id não há chave de capítulo segura/útil a consultar; falhar cedo evita mensagens SM_* sem alvo e deixa uma explicação visível ao usuário.

**Por que uma implementação ingênua seria pior:** Continuar com chapterId null produziria chaves como null_images e mensagens ambíguas ao background.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js carrega a URL sem id e exige 'ID inválido' e a mensagem de capítulo não especificado.


### Linha 128 — U08

**Fonte:** ``// página quando ela entra na janela de pré-carregamento.``

**O que faz:** Comentário explicita a estratégia de buscar cada página dentro da janela de preload.

**Como faz:** Os comentários registram o desenho IndexedDB-on-demand. Se chapterId não existe, o script não consulta storage e renderiza erro local.

**Por que foi implementado dessa forma:** Sem id não há chave de capítulo segura/útil a consultar; falhar cedo evita mensagens SM_* sem alvo e deixa uma explicação visível ao usuário.

**Por que uma implementação ingênua seria pior:** Continuar com chapterId null produziria chaves como null_images e mensagens ambíguas ao background.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js carrega a URL sem id e exige 'ID inválido' e a mensagem de capítulo não especificado.


### Linha 129 — U08

**Fonte:** ``if (!chapterId) {``

**O que faz:** Valida presença do chapterId antes de qualquer acesso ao capítulo.

**Como faz:** Os comentários registram o desenho IndexedDB-on-demand. Se chapterId não existe, o script não consulta storage e renderiza erro local.

**Por que foi implementado dessa forma:** Sem id não há chave de capítulo segura/útil a consultar; falhar cedo evita mensagens SM_* sem alvo e deixa uma explicação visível ao usuário.

**Por que uma implementação ingênua seria pior:** Continuar com chapterId null produziria chaves como null_images e mensagens ambíguas ao background.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js carrega a URL sem id e exige 'ID inválido' e a mensagem de capítulo não especificado.


### Linha 130 — U08

**Fonte:** ``    titleEl.textContent = 'ID inválido';``

**O que faz:** Exibe título de erro quando a URL não contém id.

**Como faz:** Os comentários registram o desenho IndexedDB-on-demand. Se chapterId não existe, o script não consulta storage e renderiza erro local.

**Por que foi implementado dessa forma:** Sem id não há chave de capítulo segura/útil a consultar; falhar cedo evita mensagens SM_* sem alvo e deixa uma explicação visível ao usuário.

**Por que uma implementação ingênua seria pior:** Continuar com chapterId null produziria chaves como null_images e mensagens ambíguas ao background.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js carrega a URL sem id e exige 'ID inválido' e a mensagem de capítulo não especificado.


### Linha 131 — U08

**Fonte:** ``    container.innerHTML = '<div id="empty-msg">Nenhum capítulo especificado na URL.</div>';``

**O que faz:** Substitui o container por mensagem de capítulo não especificado.

**Como faz:** Os comentários registram o desenho IndexedDB-on-demand. Se chapterId não existe, o script não consulta storage e renderiza erro local.

**Por que foi implementado dessa forma:** Sem id não há chave de capítulo segura/útil a consultar; falhar cedo evita mensagens SM_* sem alvo e deixa uma explicação visível ao usuário.

**Por que uma implementação ingênua seria pior:** Continuar com chapterId null produziria chaves como null_images e mensagens ambíguas ao background.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js carrega a URL sem id e exige 'ID inválido' e a mensagem de capítulo não especificado.


### Linha 132 — U08

**Fonte:** ``} else {``

**O que faz:** Abre o ramo normal para um id presente.

**Como faz:** Os comentários registram o desenho IndexedDB-on-demand. Se chapterId não existe, o script não consulta storage e renderiza erro local.

**Por que foi implementado dessa forma:** Sem id não há chave de capítulo segura/útil a consultar; falhar cedo evita mensagens SM_* sem alvo e deixa uma explicação visível ao usuário.

**Por que uma implementação ingênua seria pior:** Continuar com chapterId null produziria chaves como null_images e mensagens ambíguas ao background.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js carrega a URL sem id e exige 'ID inválido' e a mensagem de capítulo não especificado.


### Linha 133 — U09

**Fonte:** ``    chrome.storage.local.get(['chapterList', `${chapterId}_images`], async (data) => {``

**O que faz:** Solicita de chrome.storage.local apenas chapterList e a chave de imagens legadas deste capítulo; o callback é async.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 134 — U09

**Fonte:** ``        const list    = data.chapterList || [];``

**O que faz:** Normaliza chapterList ausente para array vazio.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 135 — U09

**Fonte:** ``        const chapter = list.find(c => c.id === chapterId);``

**O que faz:** Procura metadata cujo id seja exatamente igual ao chapterId da URL.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 136 — U09

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U09 (Descoberta do capítulo, migração e seleção do índice); não produz efeito de runtime.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 137 — U09

**Fonte:** ``        if (chapter) {``

**O que faz:** Entra no ramo de metadata encontrada.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 138 — U09

**Fonte:** ``            titleEl.textContent = chapter.title;``

**O que faz:** Exibe o título persistido do capítulo.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 139 — U09

**Fonte:** ``            document.title      = chapter.title + ' — Leitor Offline';``

**O que faz:** Atualiza também document.title para identificar a aba como leitor offline.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 140 — U09

**Fonte:** ``        } else {``

**O que faz:** Seleciona o caso de id existente na URL mas ausente de chapterList.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 141 — U09

**Fonte:** ``            titleEl.textContent = 'Capítulo não encontrado';``

**O que faz:** Mostra 'Capítulo não encontrado'; o fluxo ainda tenta índice/storage, portanto metadata ausente não implica páginas inexistentes.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 142 — U09

**Fonte:** ``        }``

**O que faz:** Encerra a decisão de título.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 143 — U09

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U09 (Descoberta do capítulo, migração e seleção do índice); não produz efeito de runtime.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 144 — U09

**Fonte:** ``        // Migração idempotente e índice de páginas (sem blobs)``

**O que faz:** Comentário introduz migração idempotente e consulta de índice sem blobs.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 145 — U09

**Fonte:** ``        await smRequest({ action: 'SM_MIGRATE_CHAPTER', chapterId });``

**O que faz:** Envia SM_MIGRATE_CHAPTER ao background para trazer dados legados ao storage novo quando necessário.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 146 — U09

**Fonte:** ``        const pageIndexResp = await smRequest({ action: 'SM_PAGE_INDEX', chapterId });``

**O que faz:** Solicita SM_PAGE_INDEX e aguarda metadados das páginas do capítulo.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 147 — U09

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U09 (Descoberta do capítulo, migração e seleção do índice); não produz efeito de runtime.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 148 — U09

**Fonte:** ``        // Fallback legado: instalação que ainda não migrou este capítulo``

**O que faz:** Comentário registra compatibilidade com instalações ainda não migradas.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 149 — U09

**Fonte:** ``        const legacyImages = data[`${chapterId}_images`] || {};``

**O que faz:** Lê o objeto legado retornado no mesmo chrome.storage.get, ou objeto vazio.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 150 — U09

**Fonte:** ``        const hasNewStore = !!(pageIndexResp && pageIndexResp.ok && (pageIndexResp.pages || []).length > 0);``

**O que faz:** Considera novo store utilizável somente com resposta ok e ao menos uma página reportada.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 151 — U09

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U09 (Descoberta do capítulo, migração e seleção do índice); não produz efeito de runtime.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 152 — U09

**Fonte:** ``        const indices = hasNewStore``

**O que faz:** Inicia escolha do vetor de índices conforme o store disponível.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 153 — U09

**Fonte:** ``            ? pageIndexResp.pages.map(p => p.pageIndex)``

**O que faz:** No store novo, projeta apenas pageIndex de cada registro retornado pelo background.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 154 — U09

**Fonte:** ``            : Object.keys(legacyImages).map(Number).sort((a, b) => a - b);``

**O que faz:** No legado, converte chaves para Number e ordena numericamente crescente para suportar índices como 2/10/200.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 155 — U09

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U09 (Descoberta do capítulo, migração e seleção do índice); não produz efeito de runtime.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 156 — U09

**Fonte:** ``        totalPages = indices.length;``

**O que faz:** Define totalPages a partir do vetor final de índices.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 157 — U09

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U09 (Descoberta do capítulo, migração e seleção do índice); não produz efeito de runtime.

**Como faz:** chrome.storage.local fornece metadata chapterList e fallback legado. O reader resolve título, solicita migração idempotente e índice novo via smRequest; usa o novo store somente quando a resposta é ok e contém páginas, senão ordena numericamente as chaves legadas.

**Por que foi implementado dessa forma:** O desenho permite migração progressiva sem carregar todos os Base64 do IndexedDB. O fallback mantém instalações antigas legíveis durante a transição.

**Por que uma implementação ingênua seria pior:** Confiar apenas no storage novo quebraria capítulos legados; ordenar Object.keys lexicalmente colocaria 10 antes de 2; carregar blobs com o índice eliminaria a vantagem de memória.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE/INTEGRAÇÃO REAL: reader.ui.test.js prova metadata e fallback legado; reader-offline.spec.js semeia legado esparso e, com background/IndexedDB reais, prova ordem e leitura após migração.


### Linha 158 — U10

**Fonte:** ``        // Resolve o Base64 de UMA página, sob demanda.``

**O que faz:** Comentário registra que o payload de uma página será resolvido sob demanda.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 159 — U10

**Fonte:** ``        async function loadPageDataUrl(imgIdx) {``

**O que faz:** Declara helper assíncrono fechado sobre chapterId, hasNewStore e legacyImages.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 160 — U10

**Fonte:** ``            if (hasNewStore) {``

**O que faz:** Escolhe o caminho SM_GET_PAGE quando o índice novo está disponível.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 161 — U10

**Fonte:** ``                const resp = await smRequest({ action: 'SM_GET_PAGE', chapterId, pageIndex: imgIdx });``

**O que faz:** Pede exatamente o pageIndex necessário ao background.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 162 — U10

**Fonte:** ``                return (resp && resp.ok && resp.dataUrl) ? resp.dataUrl : null;``

**O que faz:** Só retorna dataUrl se a resposta existe, é ok e contém dataUrl; caso contrário retorna null.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 163 — U10

**Fonte:** ``            }``

**O que faz:** Fecha o ramo do novo store.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 164 — U10

**Fonte:** ``            return legacyImages[imgIdx] || null;``

**O que faz:** No legado, retorna diretamente a imagem por índice ou null se ausente.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 165 — U10

**Fonte:** ``        }``

**O que faz:** Encerra loadPageDataUrl.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 166 — U10

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U10 (Resolução sob demanda de uma página); não produz efeito de runtime.

**Como faz:** loadPageDataUrl escolhe SM_GET_PAGE no novo store e aceita somente resposta ok com dataUrl; no modo legado indexa o objeto em memória pelo índice real.

**Por que foi implementado dessa forma:** Buscar uma página somente quando requerida mantém o footprint proporcional à janela de preload, não ao total do capítulo.

**Por que uma implementação ingênua seria pior:** Materializar todas as imagens em memória antes de renderizar tornaria capítulos longos caros e poderia pressionar severamente memória da aba.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para o caminho migrado: reader-offline.spec.js verifica src da primeira e última páginas de um conjunto esparso após o reader migrar/consultar o storage; respostas SM_GET_PAGE inválidas isoladas não têm teste focal aqui.


### Linha 167 — U11

**Fonte:** ``        if (indices.length === 0) {``

**O que faz:** Detecta capítulo sem qualquer índice de página.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 168 — U11

**Fonte:** ``            container.innerHTML = '<div id="empty-msg">Nenhuma imagem salva neste capítulo.</div>';``

**O que faz:** Exibe estado vazio no container.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 169 — U11

**Fonte:** ``            counterEl.textContent = '0 / 0';``

**O que faz:** Força contador explícito 0 / 0.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 170 — U11

**Fonte:** ``            return;``

**O que faz:** Interrompe o callback antes de criar wrappers/observers.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 171 — U11

**Fonte:** ``        }``

**O que faz:** Encerra o ramo vazio.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 172 — U11

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U11 (Estado vazio e parâmetros de virtualização); não produz efeito de runtime.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 173 — U11

**Fonte:** ``        updateCounter(1);``

**O que faz:** Inicializa UI de capítulo não vazio em página humana 1.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 174 — U11

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U11 (Estado vazio e parâmetros de virtualização); não produz efeito de runtime.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 175 — U11

**Fonte:** ``        const PRELOAD_MARGIN = '200%'; // Load images 2 viewport heights ahead``

**O que faz:** Define margem de preload em 200%; o comentário a descreve como duas alturas de viewport.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 176 — U11

**Fonte:** ``        const UNLOAD_MARGIN = '500%';  // Unload images 5 viewport heights away``

**O que faz:** Define margem de unload em 500%, intencionalmente mais ampla que a de preload para histerese.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 177 — U11

**Fonte:** ``        const loadedUrls = new Map(); // pageIdx -> objectURL``

**O que faz:** Cria loadedUrls Map com comentário pageIdx→objectURL, porém o Map não é usado em nenhuma linha posterior e o reader trabalha com dataUrl.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 178 — U11

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U11 (Estado vazio e parâmetros de virtualização); não produz efeito de runtime.

**Como faz:** Capítulo sem índices recebe mensagem 0/0 e retorna cedo. Para capítulos válidos, o contador começa em 1 e são definidos margins de preload/unload.

**Por que foi implementado dessa forma:** O early return evita construir observers/wrappers sem conteúdo. Margens distintas antecipam carregamento e atrasam descarregamento para reduzir flicker.

**Por que uma implementação ingênua seria pior:** Inicializar virtualização sem páginas desperdiçaria recursos; usar a mesma margem estreita para load/unload aumentaria thrashing ao redor da borda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 0/0 e contador inicial; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para valores exatos PRELOAD_MARGIN/UNLOAD_MARGIN e para loadedUrls.


### Linha 179 — U12

**Fonte:** ``        // Create all wrappers but defer image loading``

**O que faz:** Comentário anuncia criação de todos os wrappers sem carregar imagens imediatamente.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 180 — U12

**Fonte:** ``        indices.forEach((idx, arrayPos) => {``

**O que faz:** Itera índices persistidos mantendo arrayPos separado de idx.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 181 — U12

**Fonte:** ``            const wrap = document.createElement('div');``

**O que faz:** Cria o elemento wrapper de uma página.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 182 — U12

**Fonte:** ``            wrap.className = 'reader-page-wrap';``

**O que faz:** Aplica a classe usada por CSS, testes e seletores do reader.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 183 — U12

**Fonte:** ``            wrap.dataset.pageIdx = arrayPos;``

**O que faz:** Grava a posição visual zero-based para contador/IntersectionObserver.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 184 — U12

**Fonte:** ``            wrap.dataset.imgIdx = idx;``

**O que faz:** Grava o índice persistido real, que pode ser esparso e será usado em SM_GET_PAGE.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 185 — U12

**Fonte:** ``            // Set minimum height for scroll estimation``

**O que faz:** Comentário explica o placeholder de altura para estimar scroll antes da imagem.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 186 — U12

**Fonte:** ``            wrap.style.minHeight = '400px';``

**O que faz:** Reserva inicialmente 400px de altura mínima.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 187 — U12

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U12 (Materialização leve dos wrappers); não produz efeito de runtime.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 188 — U12

**Fonte:** ``            const img = document.createElement('img');``

**O que faz:** Cria o elemento img.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 189 — U12

**Fonte:** ``            img.className = 'reader-page';``

**O que faz:** Aplica a classe visual/testável da imagem de página.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 190 — U12

**Fonte:** ``            img.alt = 'Página ' + (arrayPos + 1);``

**O que faz:** Gera alt humano one-based.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 191 — U12

**Fonte:** ``            img.draggable = false;``

**O que faz:** Desabilita drag nativo para não interferir na leitura.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 192 — U12

**Fonte:** ``            img.loading = 'lazy';``

**O que faz:** Ativa lazy loading nativo como camada adicional de otimização.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 193 — U12

**Fonte:** ``            // Don't set src yet — observer will handle it``

**O que faz:** Comentário enfatiza que src ainda não deve ser definido.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 194 — U12

**Fonte:** ``            img.dataset.pendingSrc = '1';``

**O que faz:** Marca a imagem como pendente com sentinel '1'.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 195 — U12

**Fonte:** ``            wrap.appendChild(img);``

**O que faz:** Insere img no wrapper.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 196 — U12

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U12 (Materialização leve dos wrappers); não produz efeito de runtime.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 197 — U12

**Fonte:** ``            const label = document.createElement('div');``

**O que faz:** Cria o elemento de label da página.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 198 — U12

**Fonte:** ``            label.className = 'page-label';``

**O que faz:** Aplica classe de overlay definida no HTML.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 199 — U12

**Fonte:** ``            label.textContent = `Página ${arrayPos + 1}`;``

**O que faz:** Escreve label one-based independente do índice persistido real.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 200 — U12

**Fonte:** ``            wrap.appendChild(label);``

**O que faz:** Insere o label após a imagem.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 201 — U12

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U12 (Materialização leve dos wrappers); não produz efeito de runtime.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 202 — U12

**Fonte:** ``            container.appendChild(wrap);``

**O que faz:** Materializa o wrapper no container em ordem.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 203 — U12

**Fonte:** ``            pageWraps.push(wrap);``

**O que faz:** Mantém referência do wrapper em pageWraps para geometria e registro posterior.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 204 — U12

**Fonte:** ``            ``

**O que faz:** Executa a expressão desta posição dentro de U12 (Materialização leve dos wrappers); seu efeito deve ser lido em conjunto com as linhas adjacentes da mesma unidade.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 205 — U12

**Fonte:** ``            observer.observe(wrap);``

**O que faz:** Registra o wrapper no observer de contador imediatamente.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 206 — U12

**Fonte:** ``        });``

**O que faz:** Encerra a criação de wrappers.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 207 — U12

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U12 (Materialização leve dos wrappers); não produz efeito de runtime.

**Como faz:** Para cada índice é criado um wrapper com índice posicional e índice real, placeholder de altura, img sem src marcada pending, label humana, inserção no container/pageWraps e observação do contador.

**Por que foi implementado dessa forma:** Separar arrayPos de imgIdx permite sequência visual 1..N mesmo com índices persistidos esparsos. O placeholder conserva uma geometria inicial enquanto o blob ainda não foi buscado.

**Por que uma implementação ingênua seria pior:** Usar arrayPos como pageIndex buscaria a página errada em capítulos esparsos; atribuir src imediatamente carregaria o capítulo inteiro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: reader.ui.test.js verifica quantidade de wrappers/imagens/label; E2E-19 prova 15 índices esparsos, primeiro idx-0, último idx-200 e labels 1..15.


### Linha 208 — U13

**Fonte:** ``        // Lazy loading observer``

**O que faz:** Comentário introduz o observer dedicado a carregamento sob demanda.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 209 — U13

**Fonte:** ``        const loadObserver = new IntersectionObserver((entries) => {``

**O que faz:** Cria IntersectionObserver de preload.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 210 — U13

**Fonte:** ``            entries.forEach(async (entry) => {``

**O que faz:** Percorre entries e permite callback async por entry.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 211 — U13

**Fonte:** ``                if (!entry.isIntersecting) return;``

**O que faz:** Ignora páginas que não estão dentro da margem de interseção de preload.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 212 — U13

**Fonte:** ``                const wrap = entry.target;``

**O que faz:** Recupera o wrapper alvo da entry.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 213 — U13

**Fonte:** ``                const imgIdx = parseInt(wrap.dataset.imgIdx, 10);``

**O que faz:** Converte o índice persistido do dataset para número.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 214 — U13

**Fonte:** ``                const img = wrap.querySelector('img');``

**O que faz:** Localiza a img filha do wrapper.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 215 — U13

**Fonte:** ``                if (!img || !img.dataset.pendingSrc) return;``

**O que faz:** Ignora wrapper sem img ou imagem que já não esteja marcada como pending.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 216 — U13

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U13 (Lazy loading assíncrono com marcador de estado); não produz efeito de runtime.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 217 — U13

**Fonte:** ``                // Marca antes do await: o observer pode disparar de novo enquanto``

**O que faz:** Comentário explica a necessidade de marcar estado antes do await.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 218 — U13

**Fonte:** ``                // a página ainda está sendo buscada no background.``

**O que faz:** Comentário identifica callbacks repetidos do observer durante a busca como race evitada.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 219 — U13

**Fonte:** ``                img.dataset.pendingSrc = 'loading';``

**O que faz:** Troca sentinel para 'loading' antes da operação assíncrona.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 220 — U13

**Fonte:** ``                const dataUrl = await loadPageDataUrl(imgIdx);``

**O que faz:** Busca Data URL usando o helper que decide novo store versus legado.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 221 — U13

**Fonte:** ``                if (!dataUrl) { img.dataset.pendingSrc = '1'; return; }``

**O que faz:** Se não há dados, volta a sentinel '1' para permitir nova tentativa e encerra esta entry.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 222 — U13

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U13 (Lazy loading assíncrono com marcador de estado); não produz efeito de runtime.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 223 — U13

**Fonte:** ``                // A página pode ter saído da tela durante a busca``

**O que faz:** Comentário declara intenção de proteger contra mudança de estado durante o await.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 224 — U13

**Fonte:** ``                if (img.dataset.pendingSrc !== 'loading') return;``

**O que faz:** Recusa aplicar resultado se outro fluxo alterou pendingSrc durante a busca.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 225 — U13

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U13 (Lazy loading assíncrono com marcador de estado); não produz efeito de runtime.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 226 — U13

**Fonte:** ``                img.src = dataUrl;``

**O que faz:** Instala a Data URL como src da imagem.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 227 — U13

**Fonte:** ``                delete img.dataset.pendingSrc;``

**O que faz:** Remove o atributo data-pending-src para representar estado carregado.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 228 — U13

**Fonte:** ``                img.onload = () => { wrap.style.minHeight = ''; };``

**O que faz:** Após load da imagem, remove minHeight artificial para usar altura real.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 229 — U13

**Fonte:** ``            });``

**O que faz:** Encerra o callback de entries.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 230 — U13

**Fonte:** ``        }, { rootMargin: PRELOAD_MARGIN });``

**O que faz:** Configura a margem de interseção do loader com PRELOAD_MARGIN.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 231 — U13

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U13 (Lazy loading assíncrono com marcador de estado); não produz efeito de runtime.

**Como faz:** loadObserver reage à entrada na margem, ignora itens sem trabalho, marca pendingSrc=loading antes do await, busca a página, restaura estado se falhar e só instala src se o marcador ainda representa a mesma carga; onload libera minHeight.

**Por que foi implementado dessa forma:** Marcar antes do await reduz duplicação de fetch quando IntersectionObserver dispara repetidamente durante uma busca assíncrona. Manter placeholder até onload reduz saltos.

**Por que uma implementação ingênua seria pior:** Marcar depois do await permite múltiplas leituras simultâneas da mesma página; apagar a altura antes da imagem decodificar faz o scroll colapsar.

**Evidência automatizada:** ✅ PROVADO EM E2E REAL para lazy load e pendingSrc desaparecer após carga; ⚠️ SEM TESTE focal para resposta nula, callbacks duplicados durante await e o guard pendingSrc !== loading.


### Linha 232 — U14

**Fonte:** ``        // ── Descarregamento (virtualização real) ─────────────────────────────``

**O que faz:** Comentário demarca a virtualização por descarregamento.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 233 — U14

**Fonte:** ``        // Sem isto, rolar um capítulo de 200 páginas acabava com TODAS as páginas``

**O que faz:** Comentário descreve o problema de capítulos longos reterem todas as páginas.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 234 — U14

**Fonte:** ``        // em memória: o consumo passava a depender do tamanho do capítulo, não da``

**O que faz:** Comentário explicita que a memória sem unload cresce com o tamanho total do capítulo.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 235 — U14

**Fonte:** ``        // janela visível. Páginas que saem de 5 viewports de distância têm o src``

**O que faz:** Comentário define a política de distância para liberar src.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 236 — U14

**Fonte:** ``        // liberado e voltam a ser placeholders com altura preservada.``

**O que faz:** Comentário registra que páginas descarregadas voltam a placeholders com altura preservada.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 237 — U14

**Fonte:** ``        const unloadObserver = new IntersectionObserver((entries) => {``

**O que faz:** Cria IntersectionObserver dedicado ao descarregamento.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 238 — U14

**Fonte:** ``            entries.forEach(entry => {``

**O que faz:** Percorre entries do observer de unload de forma síncrona.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 239 — U14

**Fonte:** ``                if (entry.isIntersecting) return;``

**O que faz:** Ignora página que ainda está dentro da margem ampla.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 240 — U14

**Fonte:** ``                const wrap = entry.target;``

**O que faz:** Recupera o wrapper distante.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 241 — U14

**Fonte:** ``                const img = wrap.querySelector('img');``

**O que faz:** Localiza a img filha.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 242 — U14

**Fonte:** ``                if (!img || img.dataset.pendingSrc || !img.getAttribute('src')) return;``

**O que faz:** Só descarrega imagem carregada: exige img, ausência de pendingSrc e src atual.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 243 — U14

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U14 (Descarregamento e virtualização de memória); não produz efeito de runtime.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 244 — U14

**Fonte:** ``                // Congela a altura atual para o scroll não "pular" ao descarregar``

**O que faz:** Comentário explica que a altura precisa ser congelada antes de remover src.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 245 — U14

**Fonte:** ``                const currentHeight = wrap.offsetHeight;``

**O que faz:** Lê offsetHeight atual do wrapper já renderizado.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 246 — U14

**Fonte:** ``                if (currentHeight > 0) wrap.style.minHeight = currentHeight + 'px';``

**O que faz:** Se a altura é positiva, fixa minHeight nessa altura em pixels.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 247 — U14

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U14 (Descarregamento e virtualização de memória); não produz efeito de runtime.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 248 — U14

**Fonte:** ``                img.removeAttribute('src');``

**O que faz:** Remove o atributo src para liberar a imagem distante.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 249 — U14

**Fonte:** ``                img.dataset.pendingSrc = '1';``

**O que faz:** Marca novamente pendingSrc='1' para que uma futura reentrada carregue a página.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 250 — U14

**Fonte:** ``            });``

**O que faz:** Encerra o processamento de entries.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 251 — U14

**Fonte:** ``        }, { rootMargin: UNLOAD_MARGIN });``

**O que faz:** Configura margem do unload com UNLOAD_MARGIN.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 252 — U14

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U14 (Descarregamento e virtualização de memória); não produz efeito de runtime.

**Como faz:** Um segundo IntersectionObserver detecta páginas fora da margem ampla; somente imagens efetivamente carregadas são elegíveis. Antes de remover src, a altura atual é congelada; depois a página volta ao estado pending.

**Por que foi implementado dessa forma:** Remover src de páginas distantes permite ao navegador liberar recursos de imagem e manter memória dependente da janela observada. Congelar altura preserva a posição do scroll.

**Por que uma implementação ingênua seria pior:** Nunca descarregar faz o custo crescer com 200+ páginas; remover src sem reservar altura reflowa a coluna e desloca o leitor.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: os E2E provam lazy load, mas não afirmam que uma imagem distante perde src, preserva altura e volta a carregar ao retornar.


### Linha 253 — U15

**Fonte:** ``        pageWraps.forEach(wrap => {``

**O que faz:** Percorre todos os wrappers já criados.

**Como faz:** Cada wrapper é inscrito tanto no observer de carregamento quanto no de descarregamento; então o callback de chrome.storage e o ramo principal são encerrados.

**Por que foi implementado dessa forma:** Separar observers permite hysteresis (200% para carregar, 500% para descarregar) sem misturar responsabilidades.

**Por que uma implementação ingênua seria pior:** Um único observer com um único limiar/margem dificultaria manter páginas próximas pré-carregadas sem também impedir descarregamento distante.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: E2E real demonstra que wrappers entram no lazy loading; quantidade/registro de ambos observers não recebe assertion específica.


### Linha 254 — U15

**Fonte:** ``            loadObserver.observe(wrap);``

**O que faz:** Inscreve cada wrapper no observer de carregamento.

**Como faz:** Cada wrapper é inscrito tanto no observer de carregamento quanto no de descarregamento; então o callback de chrome.storage e o ramo principal são encerrados.

**Por que foi implementado dessa forma:** Separar observers permite hysteresis (200% para carregar, 500% para descarregar) sem misturar responsabilidades.

**Por que uma implementação ingênua seria pior:** Um único observer com um único limiar/margem dificultaria manter páginas próximas pré-carregadas sem também impedir descarregamento distante.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: E2E real demonstra que wrappers entram no lazy loading; quantidade/registro de ambos observers não recebe assertion específica.


### Linha 255 — U15

**Fonte:** ``            unloadObserver.observe(wrap);``

**O que faz:** Inscreve o mesmo wrapper no observer de descarregamento.

**Como faz:** Cada wrapper é inscrito tanto no observer de carregamento quanto no de descarregamento; então o callback de chrome.storage e o ramo principal são encerrados.

**Por que foi implementado dessa forma:** Separar observers permite hysteresis (200% para carregar, 500% para descarregar) sem misturar responsabilidades.

**Por que uma implementação ingênua seria pior:** Um único observer com um único limiar/margem dificultaria manter páginas próximas pré-carregadas sem também impedir descarregamento distante.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: E2E real demonstra que wrappers entram no lazy loading; quantidade/registro de ambos observers não recebe assertion específica.


### Linha 256 — U15

**Fonte:** ``        });``

**O que faz:** Encerra o registro dos dois observers.

**Como faz:** Cada wrapper é inscrito tanto no observer de carregamento quanto no de descarregamento; então o callback de chrome.storage e o ramo principal são encerrados.

**Por que foi implementado dessa forma:** Separar observers permite hysteresis (200% para carregar, 500% para descarregar) sem misturar responsabilidades.

**Por que uma implementação ingênua seria pior:** Um único observer com um único limiar/margem dificultaria manter páginas próximas pré-carregadas sem também impedir descarregamento distante.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: E2E real demonstra que wrappers entram no lazy loading; quantidade/registro de ambos observers não recebe assertion específica.


### Linha 257 — U15

**Fonte:** ``    });``

**O que faz:** Encerra o callback async de chrome.storage.local.get.

**Como faz:** Cada wrapper é inscrito tanto no observer de carregamento quanto no de descarregamento; então o callback de chrome.storage e o ramo principal são encerrados.

**Por que foi implementado dessa forma:** Separar observers permite hysteresis (200% para carregar, 500% para descarregar) sem misturar responsabilidades.

**Por que uma implementação ingênua seria pior:** Um único observer com um único limiar/margem dificultaria manter páginas próximas pré-carregadas sem também impedir descarregamento distante.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: E2E real demonstra que wrappers entram no lazy loading; quantidade/registro de ambos observers não recebe assertion específica.


### Linha 258 — U15

**Fonte:** ``}``

**O que faz:** Encerra o ramo principal iniciado quando chapterId existe.

**Como faz:** Cada wrapper é inscrito tanto no observer de carregamento quanto no de descarregamento; então o callback de chrome.storage e o ramo principal são encerrados.

**Por que foi implementado dessa forma:** Separar observers permite hysteresis (200% para carregar, 500% para descarregar) sem misturar responsabilidades.

**Por que uma implementação ingênua seria pior:** Um único observer com um único limiar/margem dificultaria manter páginas próximas pré-carregadas sem também impedir descarregamento distante.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: E2E real demonstra que wrappers entram no lazy loading; quantidade/registro de ambos observers não recebe assertion específica.


### Linha 259 — U16

**Fonte:** `␠ [linha vazia]`

**O que faz:** Linha vazia textual após o fechamento do script.

**Como faz:** A linha vazia separa visualmente o fim do script do newline final.

**Por que foi implementado dessa forma:** Não muda runtime; preserva a forma exata do blob auditado.

**Por que uma implementação ingênua seria pior:** Omiti-la na Bíblia quebraria a equivalência posicional exigida pela auditoria documental.

**Evidência automatizada:** 🟦 INTEGRIDADE DOCUMENTAL: coberta pela comparação da fonte integral.


### Linha 260 — U17

**Fonte:** `⏎ [newline final]`

**O que faz:** Representa explicitamente o LF terminal do blob, depois das 259 linhas textuais.

**Como faz:** Representa o terminador LF final do arquivo após as linhas textuais.

**Por que foi implementado dessa forma:** Faz parte da representação byte/texto do blob auditado e é contado como posição documental separada pelo padrão das Bíblias.

**Por que uma implementação ingênua seria pior:** Ignorar o newline final deixaria uma posição do arquivo sem rastreabilidade explícita.

**Evidência automatizada:** 🟦 INTEGRIDADE DOCUMENTAL: posição terminal conferida a partir de source.endsWith('\n').


## 14. Autoauditoria desta Bíblia

- SHA usado na análise: `490bbb1842348e792cd593c37699a822d81f555b`.
- Fonte integral inserida diretamente do blob lido no branch `docs/project-bible`.
- Linhas textuais contadas: 259.
- Newline final detectado: sim.
- Posições documentais esperadas: 260.
- Headings de linha gerados: 260.
- Nenhuma linha foi abreviada com reticências.
- Evidência verde foi limitada a assertions/fluxos efetivamente lidos.
- O teste E2E foi classificado como E2E real, não como prova isolada de branches que ele não afirma.
- O unload continua explicitamente marcado como lacuna, apesar dos comentários de virtualização.
- Dívidas `currentReadWidth` e `loadedUrls` foram registradas sem alterar código funcional.

**Estado documental desta materialização:** ✅ APROVADO em `AUDITORIA.md` para o SHA auditado; fonte integral, 260/260 posições e classificação conservadora de evidência reconfirmadas.

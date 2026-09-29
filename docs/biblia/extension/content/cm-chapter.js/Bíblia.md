# Bíblia técnica — `extension/content/cm-chapter.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `44b621d570b6492ef08982ec4e093ffcfe6d24f8`  
> **Linhas textuais:** **154**  
> **Posições documentais:** **155** contando newline final

## Identidade e papel arquitetural

`cm-chapter.js` concentra identidade de capítulo, wrappers de storage, cache temporário de assets e persistência das páginas traduzidas. Ele é carregado antes de `cm-auto-restore.js` e `content_manga.js`; `content_manga` exige `window.MangaTranslatorChapter` e cria um manager com `generateContentId`, `sendRuntimeMessageAsync` e `onRestoreEntry`.

O módulo é a ponte entre o content script e o Storage Manager: o caminho moderno salva a página via `SM_SAVE_PAGE` e guarda apenas `{assetId,index}` no restore map em memória; o caminho legado continua escrevendo Base64 em `${chapterId}_restoreMap`/`${chapterId}_images` quando o background não devolve assetId.

## canonicalTitle e deduplicação

A implementação atual normaliza assim: remove **apenas** prefixo que começa diretamente por dígitos, troca alguns separadores por espaço, remove `-`/`:` terminal, colapsa espaços, lowercase e corta em 80 chars.

Em `getOrCreateChapterIdImpl`, a ordem é:

1. URL exata;
2. se não achou, mesmo hostname + `canonicalTitle(title).replace(/[^a-z0-9]/gi,'_')`;
3. se achou por fallback, atualiza URL/título do chapter;
4. senão cria novo `chap_*`.

### Divergência crítica dos testes-espelho

`tests/integration/chapter-dedup.test.js` **não importa este arquivo**. Ele declara sua própria `canonicalTitle`, com regex diferente: aceita prefixo textual opcional antes do número e remove um sufixo de site inteiro. `chapter-id-cache.test.js` e `chapter-id-rejection.test.js` também implementam sistemas espelho.

Portanto esses testes são evidência de intenção histórica, não prova de que o código atual possui exatamente aquela deduplicação. Uma mudança no módulo pode divergir e esses testes continuarem verdes.

Exemplo concreto: um título começando `Cap 5: ...` é tratado de forma diferente pela implementação espelho que declara suporte a prefixo textual, enquanto a fonte atual só remove prefixo que começa por dígitos.

## Risco de colisão na deduplicação

O fallback por `hostname + título normalizado` não inclui pathname, obra/manga id ou chapter number estruturado além do que sobrevive ao título. Dois capítulos diferentes do mesmo site que acabem com a mesma chave normalizada podem ser fundidos e ter o `url` do registro reescrito.

A suíte espelho possui cenários “capítulos diferentes” e “obras diferentes”, mas como não executa `cm-chapter.js`, não elimina regressões reais nessa regra.

## Cache de Promise do chapterId

`getOrCreateChapterId()` compara `chapterIdUrl` com `window.location.href`. Em mudança de URL (incluindo SPA), zera a Promise e cria/resolve novamente. Na mesma URL, chamadas concorrentes compartilham a mesma Promise.

Se a implementação rejeita, o `.catch` limpa `chapterIdPromise` para permitir nova tentativa. Os testes `chapter-id-rejection` verificam essa ideia **num espelho**, não neste módulo real.

Há outra fronteira: a Promise cache evita duplicação somente **dentro desta instância do content script**. Duas tabs/content scripts criando o mesmo chapter simultaneamente fazem read-modify-write independente sobre `chapterList`; não há transação/lock cross-tab.

## Atualização de match aproximado

Quando encontra chapter pelo fallback hostname+título, o código muda `chapter.url` e `chapter.title` e chama `chrome.storage.local.set({chapterList:list})` **sem callback e sem await**. A Promise resolve o chapterId imediatamente. Falha desse write não é observada.

Isso significa que o ID pode ser usado na sessão atual mesmo se a atualização de URL/título não ficar durável.

## Wrappers de storage

`storageGetAsync` e `storageSetAsync` convertem callbacks em Promises e rejeitam usando `chrome.runtime.lastError.message`. Eles são usados por callers e pelo fallback legado de persistência.

Não há timeout; uma API que nunca execute callback deixa a Promise pendente.

## enqueueChapterWrite

Há uma Promise chain por chapterId: `previous.then(task,task)`. Mesmo quando uma task falha, a próxima executa. O Map armazena `next.catch(()=>{})` para que a cadeia interna não fique permanentemente rejeitada.

`content_manga.js` usa esta função para serializar updates de `${chapterId}_paths` após download automático.

⚠️ O Map não remove entradas após a fila ficar ociosa; numa sessão SPA muito longa com muitos chapterIds, referências às Promises resolvidas podem acumular.

## Cache de assets

`assetCache` guarda no máximo 12 pares assetId→dataUrl. Inserção de asset já presente faz delete+set, movendo a chave para o fim. Quando passa de 12 remove `keys().next().value`.

Em cache hit de `resolveRestoreAsset`, porém, a entrada é retornada sem delete+set; portanto acessos de leitura **não refrescam recência**. O comportamento é mais próximo de FIFO por inserção/reescrita do que LRU verdadeiro.

Data URLs podem ser grandes, mas o limite de 12 restringe o crescimento dentro da instância.

## resolveRestoreAsset

Entradas string são compatibilidade legada e retornam imediatamente. Entradas objeto sem assetId retornam null. AssetId em cache retorna localmente; miss envia `SM_GET_ASSET`. Só aceita resposta com `ok` e `dataUrl`, depois cacheia.

Os testes reais de auto-restore exercitam principalmente string legado; não encontrei assertion focal do caminho `SM_GET_ASSET` deste manager.

## persistTranslatedPage — caminho moderno

Depois de obter chapterId, envia `SM_SAVE_PAGE` com chapterId/pageIndex/dataUrl/originalUrl/cleanUrl e metadata de host/dimensões/sourceUrl. Se não recebe `{ok:true}`, rejeita.

Quando recebe `assetId` e há `cleanUrl`, cria `{assetId,index}`, chama `onRestoreEntry` e cacheia o dataUrl. Assim auto-restore futuro pode resolver o asset sem novo round-trip imediato.

Depois lê `chapterList` e retorna `{chapterId,chapter,assetId}`.

## persistTranslatedPage — fallback legado

Se há `cleanUrl` mas `SM_SAVE_PAGE` retorna sucesso **sem assetId**, chama `onRestoreEntry(cleanUrl,dataUrl)` e inicia um read-modify-write de `${chapterId}_restoreMap` e `${chapterId}_images`.

Esse fallback é assíncrono fire-and-forget: a chain `storageGetAsync(...).then(...storageSetAsync...)` **não é awaited** pelo `persistTranslatedPage`. Assim a Promise principal pode resolver antes do legado ser escrito.

Mais importante: o fallback não usa `enqueueChapterWrite`. Duas páginas do mesmo capítulo podem ler o mesmo snapshot legado e cada uma escrever sua própria versão, perdendo uma atualização. A suíte real cobre uma página, não concorrência desse fallback.

`extraction-and-handlers-real.test.js` carrega `cm-chapter.js` real pela ordem do helper. O mock de runtime responde `{ok:true}` sem `assetId`, e o teste observa `${chapterId}_images` + `${chapterId}_restoreMap`, portanto esse caso **prova diretamente o fallback legado real** para uma única escrita.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `extraction-and-handlers-real.test.js` — UPDATE_IMAGE | ✅ PROVADO NO MÓDULO REAL INTEGRADO | `cm-chapter.js` real cria/usa chapter e o fallback sem assetId grava `_images` e `_restoreMap` para uma página. |
| `auto-restorer-real.test.js` | ✅ PROVADO NO MÓDULO REAL INTEGRADO | Lookup de chapter existente por URL exata + compatibilidade de restore legado durante inicialização. |
| `load-content-script.js` | 🟦 GATE/AMBIENTE DE TESTE | Carrega cm-chapter real antes de auto-restore/content_manga, igual ao manifest. |
| `manifest.json` | 🟦 GATE ESTÁTICO ESPECÍFICO | Ordem de carregamento do módulo. |
| `chapter-id-cache.test.js` | 🟨 SIMULAÇÃO COMPLEMENTAR | Testa cache de Promise numa implementação local; não importa `cm-chapter.js`. |
| `chapter-id-rejection.test.js` | 🟨 SIMULAÇÃO COMPLEMENTAR | Testa retry/reject num espelho controlável; não prova callbacks reais deste módulo. |
| `chapter-dedup.test.js` | 🟨 SIMULAÇÃO COMPLEMENTAR / DIVERGENTE | Testa uma `canonicalTitle` própria e diferente da fonte atual; não é prova direta. |
| `auto-restore-system.test.js` | 🟨 SIMULAÇÃO COMPLEMENTAR | Testa modelo de restore/storage legado; não substitui o manager real. |

## Lacunas de teste, casos-limite e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** importando diretamente `canonicalTitle` deste módulo com casos de prefixo textual, sufixos de site, Unicode e limite de 80 chars.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** da deduplicação real hostname+título do `cm-chapter.js`; a suíte nominal usa implementação espelho divergente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para duas instâncias/tabs criando o mesmo chapter simultaneamente e concorrendo sobre `chapterList`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para falha do `chrome.storage.local.set` sem callback no ramo que atualiza URL/título de chapter aproximado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** direto para limpeza do `chapterIdPromise` após runtime.lastError no módulo real.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para mudança de `window.location.href` invalidar o cache no manager real.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `enqueueChapterWrite` concorrente, erro na task e execução da task seguinte.
- ⚠️ O `writeQueues` Map não remove chapterIds inativos.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para eviction do assetCache após a 13ª entrada.
- ⚠️ Cache hit não promove recência; não é LRU real.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `SM_GET_ASSET` success/failure/cache hit deste manager.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `SM_SAVE_PAGE` devolver assetId e alimentar `{assetId,index}` + cache.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `SM_SAVE_PAGE` responder erro/undefined e a Promise rejeitar.
- ⚠️ Fallback legado `_restoreMap/_images` não é serializado por `enqueueChapterWrite` e não é awaited, criando risco de lost update e retorno antes da durabilidade.
- ⚠️ `pageIndex` não é validado; string, negativo ou valor extremo é encaminhado ao Storage Manager e pode virar chave no fallback.
- ⚠️ `dataUrl`, `sourceUrl`, `cleanUrl`, width e height também não são validados localmente.
- ⚠️ Matching aproximado pode fundir dois capítulos diferentes do mesmo hostname com a mesma chave de título normalizado.
- ⚠️ A leitura final de `chapterList` pode retornar null para chapter caso outro writer remova/altere a lista entre save e leitura; a página pode ter sido persistida mesmo assim.
- ⚠️ Os exports em globalThis e window são necessários aos testes/runtime, mas outro script privilegiado no mesmo isolated world poderia substituir o global antes de content_manga iniciar; content_manga só testa presença, não assinatura.

## Segurança e privacidade

- `dataUrl` contém bytes da tradução e é enviado apenas ao background da extensão via `SM_SAVE_PAGE`/`SM_GET_ASSET` no fluxo local.
- `chapterList` persiste URL e título de páginas visitadas; é metadata de navegação interna da extensão.
- `sourceUrl`/`cleanUrl` também podem identificar origem da imagem e são enviados ao Storage Manager.
- O módulo não faz fetch de rede diretamente.
- Dependências obrigatórias são funções injetadas pelo próprio content_manga; não há validação do retorno de `generateId` além do uso posterior.

## Invariantes

1. O manager deve continuar exigindo `generateId` e `sendRuntimeMessageAsync` válidos.
2. Chamadas simultâneas de chapter ID na mesma URL/instância devem compartilhar a mesma Promise.
3. Uma rejeição de resolução do chapter deve limpar a Promise para permitir retry.
4. Mudança de href deve invalidar o cache de chapterId.
5. URL exata tem prioridade sobre deduplicação aproximada.
6. Deduplicação aproximada nunca deve ignorar hostname.
7. `SM_SAVE_PAGE` sem confirmação `ok` deve rejeitar a persistência.
8. Entry `{assetId,index}` só deve ser publicada quando há assetId confirmado.
9. Cache de assets deve permanecer limitado.
10. Compatibilidade de restore legado não deve sobrescrever updates concorrentes — a implementação atual ainda precisa de prova/fortalecimento nessa invariável.
11. `enqueueChapterWrite` deve continuar executando a próxima task mesmo se a anterior falhar.
12. O módulo não deve absorver responsabilidades de DOM replacement ou auto-restore orchestration.

## Fonte integral

~~~javascript
// cm-chapter.js — identidade, persistência e memória temporária de capítulos.
(function attachMangaTranslatorChapterApi(rootScope) {
    'use strict';

    function canonicalTitle(value) {
        return (value || '')
            .replace(/^\d+[\s.\-–—:|]+/, '')
            .replace(/[|–—•·\[\]()\u00AB\u00BB]/g, ' ')
            .replace(/\s*[-:]\s*$/, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .toLowerCase()
            .slice(0, 80);
    }

    function createChapterManager({ hostname, generateId, sendRuntimeMessageAsync, onRestoreEntry } = {}) {
        if (typeof generateId !== 'function') throw new Error('cm-chapter requer generateId');
        if (typeof sendRuntimeMessageAsync !== 'function') throw new Error('cm-chapter requer sendRuntimeMessageAsync');

        const writeQueues = new Map();
        const assetCache = new Map();
        const assetCacheMax = 12;
        let chapterIdPromise = null;
        let chapterIdUrl = null;

        function storageGetAsync(keys) {
            return new Promise((resolve, reject) => {
                chrome.storage.local.get(keys, (data) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve(data || {});
                });
            });
        }

        function storageSetAsync(items) {
            return new Promise((resolve, reject) => {
                chrome.storage.local.set(items, () => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve();
                });
            });
        }

        function enqueueChapterWrite(chapterId, task) {
            const previous = writeQueues.get(chapterId) || Promise.resolve();
            const next = previous.then(() => task(), () => task());
            writeQueues.set(chapterId, next.catch(() => {}));
            return next;
        }

        function cacheAsset(assetId, dataUrl) {
            if (!assetId || !dataUrl) return dataUrl;
            assetCache.delete(assetId);
            assetCache.set(assetId, dataUrl);
            while (assetCache.size > assetCacheMax) assetCache.delete(assetCache.keys().next().value);
            return dataUrl;
        }

        async function resolveRestoreAsset(entry) {
            if (!entry) return null;
            if (typeof entry === 'string') return entry;
            if (!entry.assetId) return null;
            if (assetCache.has(entry.assetId)) return assetCache.get(entry.assetId);
            const response = await sendRuntimeMessageAsync({ action: 'SM_GET_ASSET', assetId: entry.assetId });
            if (!response || !response.ok || !response.dataUrl) return null;
            return cacheAsset(entry.assetId, response.dataUrl);
        }

        function getOrCreateChapterId() {
            if (chapterIdUrl !== window.location.href) {
                chapterIdPromise = null;
                chapterIdUrl = window.location.href;
            }
            if (!chapterIdPromise) chapterIdPromise = getOrCreateChapterIdImpl().catch((error) => {
                chapterIdPromise = null;
                throw error;
            });
            return chapterIdPromise;
        }

        function getOrCreateChapterIdImpl() {
            return new Promise((resolve, reject) => {
                chrome.storage.local.get(['chapterList'], (data) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(`storage.get falhou: ${chrome.runtime.lastError.message}`));
                        return;
                    }
                    const list = data.chapterList || [];
                    let chapter = list.find((item) => item.url === window.location.href);
                    if (!chapter) {
                        chapter = list.find((item) => {
                            if (!item.url) return false;
                            try {
                                return new URL(item.url).hostname === hostname
                                    && canonicalTitle(item.title || '').replace(/[^a-z0-9]/gi, '_') === canonicalTitle(document.title || 'Capítulo sem título').replace(/[^a-z0-9]/gi, '_');
                            } catch (_error) { return false; }
                        });
                        if (chapter) {
                            chapter.url = window.location.href;
                            chapter.title = canonicalTitle(document.title || 'Capítulo sem título');
                            chrome.storage.local.set({ chapterList: list });
                        }
                    }
                    if (chapter) { resolve(chapter.id); return; }
                    const newId = generateId('chap_');
                    list.push({ id: newId, url: window.location.href, title: canonicalTitle(document.title || 'Capítulo sem título'), timestamp: Date.now() });
                    chrome.storage.local.set({ chapterList: list }, () => {
                        if (chrome.runtime.lastError) reject(new Error(`storage.set falhou: ${chrome.runtime.lastError.message}`));
                        else resolve(newId);
                    });
                });
            });
        }

        function persistTranslatedPage(pageIndex, dataUrl, meta = {}) {
            return getOrCreateChapterId().then(async (chapterId) => {
                const response = await sendRuntimeMessageAsync({
                    action: 'SM_SAVE_PAGE', chapterId, pageIndex, dataUrl,
                    originalUrl: meta.sourceUrl || '', cleanUrl: meta.cleanUrl || '',
                    meta: { host: hostname, width: meta.width || 0, height: meta.height || 0, sourceUrl: meta.sourceUrl || '' },
                });
                if (!response || !response.ok) throw new Error((response && response.error) || 'SM_SAVE_PAGE não confirmou a gravação');
                if (meta.cleanUrl && response.assetId) {
                    const entry = { assetId: response.assetId, index: pageIndex };
                    if (typeof onRestoreEntry === 'function') onRestoreEntry(meta.cleanUrl, entry);
                    cacheAsset(response.assetId, dataUrl);
                } else if (meta.cleanUrl) {
                    if (typeof onRestoreEntry === 'function') onRestoreEntry(meta.cleanUrl, dataUrl);
                    const restoreKey = `${chapterId}_restoreMap`;
                    const imagesKey = `${chapterId}_images`;
                    storageGetAsync([restoreKey, imagesKey]).then((legacy) => {
                        const restoreMap = legacy[restoreKey] || {};
                        const images = legacy[imagesKey] || {};
                        restoreMap[meta.cleanUrl] = dataUrl;
                        images[pageIndex] = dataUrl;
                        return storageSetAsync({ [restoreKey]: restoreMap, [imagesKey]: images });
                    }).catch(() => {});
                }
                const listData = await storageGetAsync(['chapterList']);
                const chapter = (listData.chapterList || []).find((item) => item.id === chapterId) || null;
                return { chapterId, chapter, assetId: response.assetId };
            });
        }

        return Object.freeze({ canonicalTitle, enqueueChapterWrite, storageGetAsync, storageSetAsync, cacheAsset, resolveRestoreAsset, getOrCreateChapterId, persistTranslatedPage });
    }

    const api = Object.freeze({ canonicalTitle, createChapterManager });
    rootScope.MangaTranslatorChapter = api;
    // Jest/Node carregam scripts clássicos em um escopo global diferente do
    // `window` do JSDOM; publicar nos dois preserva a semântica do content script.
    if (typeof globalThis !== 'undefined') globalThis.MangaTranslatorChapter = api;
    if (typeof window !== 'undefined') window.MangaTranslatorChapter = api;
})(typeof window !== 'undefined' ? window : self);

~~~

## Rastreabilidade 155/155

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | // cm-chapter.js — identidade, persistência e memória temporária de capítulos. | Comentário arquitetural/compatibilidade: cm-chapter.js — identidade, persistência e memória temporária de capítulos.. |
| 002 | U01 | (function attachMangaTranslatorChapterApi(rootScope) { | Abre função/escopo de U01: (function attachMangaTranslatorChapterApi(rootScope) { |
| 003 | U01 |     'use strict'; | Ativa strict mode dentro da IIFE. |
| 004 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 005 | U02 |     function canonicalTitle(value) { | Abre função/escopo de U02: function canonicalTitle(value) { |
| 006 | U02 |         return (value \|\| '') | Retorna/encerra caminho: return (value // '') |
| 007 | U02 |             .replace(/^\d+[\s.\-–—:\|]+/, '') | Parte concreta de U02: .replace(/^\d+[\s.\-–—:/]+/, '') |
| 008 | U02 |             .replace(/[\|–—•·\[\]()\u00AB\u00BB]/g, ' ') | Parte concreta de U02: .replace(/[/–—•·\[\]()\u00AB\u00BB]/g, ' ') |
| 009 | U02 |             .replace(/\s*[-:]\s*$/, '') | Parte concreta de U02: .replace(/\s*[-:]\s*$/, '') |
| 010 | U02 |             .replace(/\s{2,}/g, ' ') | Parte concreta de U02: .replace(/\s{2,}/g, ' ') |
| 011 | U02 |             .trim() | Parte concreta de U02: .trim() |
| 012 | U02 |             .toLowerCase() | Parte concreta de U02: .toLowerCase() |
| 013 | U02 |             .slice(0, 80); | Parte concreta de U02: .slice(0, 80); |
| 014 | U02 |     } | Fecha/continua estrutura sintática de U02. |
| 015 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 016 | U03 |     function createChapterManager({ hostname, generateId, sendRuntimeMessageAsync, onRestoreEntry } = {}) { | Abre função/escopo de U03: function createChapterManager({ hostname, generateId, sendRuntimeMessageAsync, onRestoreEntry } = {}) { |
| 017 | U03 |         if (typeof generateId !== 'function') throw new Error('cm-chapter requer generateId'); | Guard/branch de contrato: if (typeof generateId !== 'function') throw new Error('cm-chapter requer generateId'); |
| 018 | U03 |         if (typeof sendRuntimeMessageAsync !== 'function') throw new Error('cm-chapter requer sendRuntimeMessageAsync'); | Guard/branch de contrato: if (typeof sendRuntimeMessageAsync !== 'function') throw new Error('cm-chapter requer sendRuntimeMessageAsync'); |
| 019 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 020 | U03 |         const writeQueues = new Map(); | Declara binding/estrutura de U03: const writeQueues = new Map(); |
| 021 | U03 |         const assetCache = new Map(); | Declara binding/estrutura de U03: const assetCache = new Map(); |
| 022 | U03 |         const assetCacheMax = 12; | Declara binding/estrutura de U03: const assetCacheMax = 12; |
| 023 | U03 |         let chapterIdPromise = null; | Declara estado privado/cache da instância. |
| 024 | U03 |         let chapterIdUrl = null; | Declara estado privado/cache da instância. |
| 025 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 026 | U04 |         function storageGetAsync(keys) { | Abre função/escopo de U04: function storageGetAsync(keys) { |
| 027 | U04 |             return new Promise((resolve, reject) => { | Retorna/encerra caminho: return new Promise((resolve, reject) => { |
| 028 | U04 |                 chrome.storage.local.get(keys, (data) => { | Faz leitura local de chapter metadata/compatibilidade. |
| 029 | U04 |                     if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); | Guard/branch de contrato: if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); |
| 030 | U04 |                     else resolve(data \|\| {}); | Parte concreta de U04: else resolve(data // {}); |
| 031 | U04 |                 }); | Fecha/continua estrutura sintática de U04. |
| 032 | U04 |             }); | Fecha/continua estrutura sintática de U04. |
| 033 | U04 |         } | Fecha/continua estrutura sintática de U04. |
| 034 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 035 | U04 |         function storageSetAsync(items) { | Abre função/escopo de U04: function storageSetAsync(items) { |
| 036 | U04 |             return new Promise((resolve, reject) => { | Retorna/encerra caminho: return new Promise((resolve, reject) => { |
| 037 | U04 |                 chrome.storage.local.set(items, () => { | Persiste chapter metadata ou fallback legado. |
| 038 | U04 |                     if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); | Guard/branch de contrato: if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); |
| 039 | U04 |                     else resolve(); | Parte concreta de U04: else resolve(); |
| 040 | U04 |                 }); | Fecha/continua estrutura sintática de U04. |
| 041 | U04 |             }); | Fecha/continua estrutura sintática de U04. |
| 042 | U04 |         } | Fecha/continua estrutura sintática de U04. |
| 043 | U04 | ␠ [linha vazia] | Separador visual da unidade U04. |
| 044 | U05 |         function enqueueChapterWrite(chapterId, task) { | Abre função/escopo de U05: function enqueueChapterWrite(chapterId, task) { |
| 045 | U05 |             const previous = writeQueues.get(chapterId) \|\| Promise.resolve(); | Declara binding/estrutura de U05: const previous = writeQueues.get(chapterId) // Promise.resolve(); |
| 046 | U05 |             const next = previous.then(() => task(), () => task()); | Declara binding/estrutura de U05: const next = previous.then(() => task(), () => task()); |
| 047 | U05 |             writeQueues.set(chapterId, next.catch(() => {})); | Manipula Promise chain por chapterId para serialização. |
| 048 | U05 |             return next; | Retorna/encerra caminho: return next; |
| 049 | U05 |         } | Fecha/continua estrutura sintática de U05. |
| 050 | U05 | ␠ [linha vazia] | Separador visual da unidade U05. |
| 051 | U06 |         function cacheAsset(assetId, dataUrl) { | Abre função/escopo de U06: function cacheAsset(assetId, dataUrl) { |
| 052 | U06 |             if (!assetId \|\| !dataUrl) return dataUrl; | Guard/branch de contrato: if (!assetId // !dataUrl) return dataUrl; |
| 053 | U06 |             assetCache.delete(assetId); | Manipula cache em memória de assetId→dataUrl. |
| 054 | U06 |             assetCache.set(assetId, dataUrl); | Manipula cache em memória de assetId→dataUrl. |
| 055 | U06 |             while (assetCache.size > assetCacheMax) assetCache.delete(assetCache.keys().next().value); | Manipula cache em memória de assetId→dataUrl. |
| 056 | U06 |             return dataUrl; | Retorna/encerra caminho: return dataUrl; |
| 057 | U06 |         } | Fecha/continua estrutura sintática de U06. |
| 058 | U06 | ␠ [linha vazia] | Separador visual da unidade U06. |
| 059 | U07 |         async function resolveRestoreAsset(entry) { | Abre função/escopo de U07: async function resolveRestoreAsset(entry) { |
| 060 | U07 |             if (!entry) return null; | Guard/branch de contrato: if (!entry) return null; |
| 061 | U07 |             if (typeof entry === 'string') return entry; | Guard/branch de contrato: if (typeof entry === 'string') return entry; |
| 062 | U07 |             if (!entry.assetId) return null; | Guard/branch de contrato: if (!entry.assetId) return null; |
| 063 | U07 |             if (assetCache.has(entry.assetId)) return assetCache.get(entry.assetId); | Guard/branch de contrato: if (assetCache.has(entry.assetId)) return assetCache.get(entry.assetId); |
| 064 | U07 |             const response = await sendRuntimeMessageAsync({ action: 'SM_GET_ASSET', assetId: entry.assetId }); | Declara binding/estrutura de U07: const response = await sendRuntimeMessageAsync({ action: 'SM_GET_ASSET', assetId: entry.assetId }); |
| 065 | U07 |             if (!response \|\| !response.ok \|\| !response.dataUrl) return null; | Guard/branch de contrato: if (!response // !response.ok // !response.dataUrl) return null; |
| 066 | U07 |             return cacheAsset(entry.assetId, response.dataUrl); | Retorna/encerra caminho: return cacheAsset(entry.assetId, response.dataUrl); |
| 067 | U07 |         } | Fecha/continua estrutura sintática de U07. |
| 068 | U07 | ␠ [linha vazia] | Separador visual da unidade U07. |
| 069 | U08 |         function getOrCreateChapterId() { | Abre função/escopo de U08: function getOrCreateChapterId() { |
| 070 | U08 |             if (chapterIdUrl !== window.location.href) { | Guard/branch de contrato: if (chapterIdUrl !== window.location.href) { |
| 071 | U08 |                 chapterIdPromise = null; | Manipula cache de identidade do capítulo associado à URL atual. |
| 072 | U08 |                 chapterIdUrl = window.location.href; | Manipula cache de identidade do capítulo associado à URL atual. |
| 073 | U08 |             } | Fecha/continua estrutura sintática de U08. |
| 074 | U08 |             if (!chapterIdPromise) chapterIdPromise = getOrCreateChapterIdImpl().catch((error) => { | Guard/branch de contrato: if (!chapterIdPromise) chapterIdPromise = getOrCreateChapterIdImpl().catch((error) => { |
| 075 | U08 |                 chapterIdPromise = null; | Manipula cache de identidade do capítulo associado à URL atual. |
| 076 | U08 |                 throw error; | Parte concreta de U08: throw error; |
| 077 | U08 |             }); | Fecha/continua estrutura sintática de U08. |
| 078 | U08 |             return chapterIdPromise; | Retorna/encerra caminho: return chapterIdPromise; |
| 079 | U08 |         } | Fecha/continua estrutura sintática de U08. |
| 080 | U08 | ␠ [linha vazia] | Separador visual da unidade U08. |
| 081 | U09 |         function getOrCreateChapterIdImpl() { | Abre função/escopo de U09: function getOrCreateChapterIdImpl() { |
| 082 | U09 |             return new Promise((resolve, reject) => { | Retorna/encerra caminho: return new Promise((resolve, reject) => { |
| 083 | U09 |                 chrome.storage.local.get(['chapterList'], (data) => { | Faz leitura local de chapter metadata/compatibilidade. |
| 084 | U09 |                     if (chrome.runtime.lastError) { | Guard/branch de contrato: if (chrome.runtime.lastError) { |
| 085 | U09 |                         reject(new Error(`storage.get falhou: ${chrome.runtime.lastError.message}`)); | Converte erro da API Chrome em rejeição ou branch de falha. |
| 086 | U09 |                         return; | Parte concreta de U09: return; |
| 087 | U09 |                     } | Fecha/continua estrutura sintática de U09. |
| 088 | U09 |                     const list = data.chapterList \|\| []; | Declara binding/estrutura de U09: const list = data.chapterList // []; |
| 089 | U09 |                     let chapter = list.find((item) => item.url === window.location.href); | Declara estado privado/cache da instância. |
| 090 | U09 |                     if (!chapter) { | Guard/branch de contrato: if (!chapter) { |
| 091 | U09 |                         chapter = list.find((item) => { | Parte concreta de U09: chapter = list.find((item) => { |
| 092 | U09 |                             if (!item.url) return false; | Guard/branch de contrato: if (!item.url) return false; |
| 093 | U09 |                             try { | Abre operação protegida contra URL/storage inválido. |
| 094 | U09 |                                 return new URL(item.url).hostname === hostname | Retorna/encerra caminho: return new URL(item.url).hostname === hostname |
| 095 | U09 |                                     && canonicalTitle(item.title \|\| '').replace(/[^a-z0-9]/gi, '_') === canonicalTitle(document.title \|\| 'Capítulo sem título').replace(/[^a-z0-9]/gi, '_'); | Normaliza/compara título do capítulo. |
| 096 | U09 |                             } catch (_error) { return false; } | Captura erro e aplica fallback/retry previsto. |
| 097 | U09 |                         }); | Fecha/continua estrutura sintática de U09. |
| 098 | U09 |                         if (chapter) { | Guard/branch de contrato: if (chapter) { |
| 099 | U09 |                             chapter.url = window.location.href; | Parte concreta de U09: chapter.url = window.location.href; |
| 100 | U09 |                             chapter.title = canonicalTitle(document.title \|\| 'Capítulo sem título'); | Normaliza/compara título do capítulo. |
| 101 | U09 |                             chrome.storage.local.set({ chapterList: list }); | Persiste chapter metadata ou fallback legado. |
| 102 | U09 |                         } | Fecha/continua estrutura sintática de U09. |
| 103 | U09 |                     } | Fecha/continua estrutura sintática de U09. |
| 104 | U09 |                     if (chapter) { resolve(chapter.id); return; } | Guard/branch de contrato: if (chapter) { resolve(chapter.id); return; } |
| 105 | U09 |                     const newId = generateId('chap_'); | Declara binding/estrutura de U09: const newId = generateId('chap_'); |
| 106 | U09 |                     list.push({ id: newId, url: window.location.href, title: canonicalTitle(document.title \|\| 'Capítulo sem título'), timestamp: Date.now() }); | Normaliza/compara título do capítulo. |
| 107 | U09 |                     chrome.storage.local.set({ chapterList: list }, () => { | Persiste chapter metadata ou fallback legado. |
| 108 | U09 |                         if (chrome.runtime.lastError) reject(new Error(`storage.set falhou: ${chrome.runtime.lastError.message}`)); | Guard/branch de contrato: if (chrome.runtime.lastError) reject(new Error(`storage.set falhou: ${chrome.runtime.lastError.message}`)); |
| 109 | U09 |                         else resolve(newId); | Parte concreta de U09: else resolve(newId); |
| 110 | U09 |                     }); | Fecha/continua estrutura sintática de U09. |
| 111 | U09 |                 }); | Fecha/continua estrutura sintática de U09. |
| 112 | U09 |             }); | Fecha/continua estrutura sintática de U09. |
| 113 | U09 |         } | Fecha/continua estrutura sintática de U09. |
| 114 | U09 | ␠ [linha vazia] | Separador visual da unidade U09. |
| 115 | U10 |         function persistTranslatedPage(pageIndex, dataUrl, meta = {}) { | Abre função/escopo de U10: function persistTranslatedPage(pageIndex, dataUrl, meta = {}) { |
| 116 | U10 |             return getOrCreateChapterId().then(async (chapterId) => { | Retorna/encerra caminho: return getOrCreateChapterId().then(async (chapterId) => { |
| 117 | U10 |                 const response = await sendRuntimeMessageAsync({ | Declara binding/estrutura de U10: const response = await sendRuntimeMessageAsync({ |
| 118 | U10 |                     action: 'SM_SAVE_PAGE', chapterId, pageIndex, dataUrl, | Solicita persistência da página ao Storage Manager. |
| 119 | U10 |                     originalUrl: meta.sourceUrl \|\| '', cleanUrl: meta.cleanUrl \|\| '', | Parte concreta de U10: originalUrl: meta.sourceUrl // '', cleanUrl: meta.cleanUrl // '', |
| 120 | U10 |                     meta: { host: hostname, width: meta.width \|\| 0, height: meta.height \|\| 0, sourceUrl: meta.sourceUrl \|\| '' }, | Parte concreta de U10: meta: { host: hostname, width: meta.width // 0, height: meta.height // 0, sourceUrl: meta.sourceUrl // '' }, |
| 121 | U10 |                 }); | Fecha/continua estrutura sintática de U10. |
| 122 | U10 |                 if (!response \|\| !response.ok) throw new Error((response && response.error) \|\| 'SM_SAVE_PAGE não confirmou a gravação'); | Guard/branch de contrato: if (!response // !response.ok) throw new Error((response && response.error) // 'SM_SAVE_PAGE não confirmou a gravação'); |
| 123 | U10 |                 if (meta.cleanUrl && response.assetId) { | Guard/branch de contrato: if (meta.cleanUrl && response.assetId) { |
| 124 | U10 |                     const entry = { assetId: response.assetId, index: pageIndex }; | Declara binding/estrutura de U10: const entry = { assetId: response.assetId, index: pageIndex }; |
| 125 | U10 |                     if (typeof onRestoreEntry === 'function') onRestoreEntry(meta.cleanUrl, entry); | Guard/branch de contrato: if (typeof onRestoreEntry === 'function') onRestoreEntry(meta.cleanUrl, entry); |
| 126 | U10 |                     cacheAsset(response.assetId, dataUrl); | Parte concreta de U10: cacheAsset(response.assetId, dataUrl); |
| 127 | U10 |                 } else if (meta.cleanUrl) { | Parte concreta de U10: } else if (meta.cleanUrl) { |
| 128 | U10 |                     if (typeof onRestoreEntry === 'function') onRestoreEntry(meta.cleanUrl, dataUrl); | Guard/branch de contrato: if (typeof onRestoreEntry === 'function') onRestoreEntry(meta.cleanUrl, dataUrl); |
| 129 | U10 |                     const restoreKey = `${chapterId}_restoreMap`; | Declara binding/estrutura de U10: const restoreKey = `${chapterId}_restoreMap`; |
| 130 | U10 |                     const imagesKey = `${chapterId}_images`; | Declara binding/estrutura de U10: const imagesKey = `${chapterId}_images`; |
| 131 | U10 |                     storageGetAsync([restoreKey, imagesKey]).then((legacy) => { | Atualiza fallback legado de restore/images. |
| 132 | U10 |                         const restoreMap = legacy[restoreKey] \|\| {}; | Declara binding/estrutura de U10: const restoreMap = legacy[restoreKey] // {}; |
| 133 | U10 |                         const images = legacy[imagesKey] \|\| {}; | Declara binding/estrutura de U10: const images = legacy[imagesKey] // {}; |
| 134 | U10 |                         restoreMap[meta.cleanUrl] = dataUrl; | Atualiza fallback legado de restore/images. |
| 135 | U10 |                         images[pageIndex] = dataUrl; | Parte concreta de U10: images[pageIndex] = dataUrl; |
| 136 | U10 |                         return storageSetAsync({ [restoreKey]: restoreMap, [imagesKey]: images }); | Retorna/encerra caminho: return storageSetAsync({ [restoreKey]: restoreMap, [imagesKey]: images }); |
| 137 | U10 |                     }).catch(() => {}); | Parte concreta de U10: }).catch(() => {}); |
| 138 | U10 |                 } | Fecha/continua estrutura sintática de U10. |
| 139 | U10 |                 const listData = await storageGetAsync(['chapterList']); | Declara binding/estrutura de U10: const listData = await storageGetAsync(['chapterList']); |
| 140 | U10 |                 const chapter = (listData.chapterList \|\| []).find((item) => item.id === chapterId) \|\| null; | Declara binding/estrutura de U10: const chapter = (listData.chapterList // []).find((item) => item.id === chapterId) // null; |
| 141 | U10 |                 return { chapterId, chapter, assetId: response.assetId }; | Retorna/encerra caminho: return { chapterId, chapter, assetId: response.assetId }; |
| 142 | U10 |             }); | Fecha/continua estrutura sintática de U10. |
| 143 | U10 |         } | Fecha/continua estrutura sintática de U10. |
| 144 | U11 | ␠ [linha vazia] | Separador visual da unidade U11. |
| 145 | U11 |         return Object.freeze({ canonicalTitle, enqueueChapterWrite, storageGetAsync, storageSetAsync, cacheAsset, resolveRestoreAsset, getOrCreateChapterId, persistTranslatedPage }); | Retorna/encerra caminho: return Object.freeze({ canonicalTitle, enqueueChapterWrite, storageGetAsync, storageSetAsync, cacheAsset, resolveRestoreAsset, getOrCreateChapterId, persistTranslatedPage }); |
| 146 | U11 |     } | Fecha/continua estrutura sintática de U11. |
| 147 | U12 | ␠ [linha vazia] | Separador visual da unidade U12. |
| 148 | U12 |     const api = Object.freeze({ canonicalTitle, createChapterManager }); | Declara binding/estrutura de U12: const api = Object.freeze({ canonicalTitle, createChapterManager }); |
| 149 | U12 |     rootScope.MangaTranslatorChapter = api; | Parte concreta de U12: rootScope.MangaTranslatorChapter = api; |
| 150 | U12 |     // Jest/Node carregam scripts clássicos em um escopo global diferente do | Comentário arquitetural/compatibilidade: Jest/Node carregam scripts clássicos em um escopo global diferente do. |
| 151 | U12 |     // `window` do JSDOM; publicar nos dois preserva a semântica do content script. | Comentário arquitetural/compatibilidade: `window` do JSDOM; publicar nos dois preserva a semântica do content script.. |
| 152 | U12 |     if (typeof globalThis !== 'undefined') globalThis.MangaTranslatorChapter = api; | Guard/branch de contrato: if (typeof globalThis !== 'undefined') globalThis.MangaTranslatorChapter = api; |
| 153 | U12 |     if (typeof window !== 'undefined') window.MangaTranslatorChapter = api; | Guard/branch de contrato: if (typeof window !== 'undefined') window.MangaTranslatorChapter = api; |
| 154 | U12 | })(typeof window !== 'undefined' ? window : self); | Parte concreta de U12: })(typeof window !== 'undefined' ? window : self); |
| 155 | U13 | ⏎ [newline final] | Newline terminal editorial. |

## Análise por unidade

### U01 — linhas 1–4 — Cabeçalho, IIFE e strict mode

**O que faz:** Define o módulo clássico de capítulo e abre o escopo global.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Permite uso em content script clássico e JSDOM sem bundler.

**Por que uma alternativa ingênua seria pior:** Migrar silenciosamente para módulos ES quebraria a ordem atual do manifest/test helper.

### U02 — linhas 5–14 — canonicalTitle

**O que faz:** Normaliza título para matching: remove prefixo numérico inicial, alguns separadores, sufixo terminal simples, espaços, case e limita a 80 chars.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Reduz variações superficiais entre visitas do mesmo capítulo.

**Por que uma alternativa ingênua seria pior:** Comparar document.title cru criaria capítulos duplicados por pontuação/numeração.

### U03 — linhas 15–25 — createChapterManager e estado privado

**O que faz:** Valida dependências obrigatórias e cria filas por chapter, cache de assets e cache de Promise do chapterId por URL.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Mantém coordenação por instância sem expor Maps internos.

**Por que uma alternativa ingênua seria pior:** Estado global compartilhado entre páginas poderia vazar assets/IDs entre capítulos.

### U04 — linhas 26–43 — Wrappers de chrome.storage

**O que faz:** Transforma get/set callback-style em Promises que rejeitam em runtime.lastError.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Permite composição async/await com erro explícito.

**Por que uma alternativa ingênua seria pior:** Ignorar lastError causaria Promises resolvidas com writes/reads que falharam.

### U05 — linhas 44–50 — enqueueChapterWrite

**O que faz:** Serializa tasks por chapterId usando Promise chain que continua mesmo após erro anterior.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Evita read-modify-write concorrente em callers que usam a fila.

**Por que uma alternativa ingênua seria pior:** Executar tasks paralelas pode perder updates em mapas/paths compartilhados.

### U06 — linhas 51–58 — cacheAsset

**O que faz:** Mantém até 12 dataUrls em Map, substitui valor existente e remove a chave mais antiga quando excede limite.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Limita memória do content script e evita refetch imediato de assets.

**Por que uma alternativa ingênua seria pior:** Cache ilimitado de Base64 aumentaria memória em capítulos longos.

### U07 — linhas 59–68 — resolveRestoreAsset

**O que faz:** Aceita string legado diretamente ou resolve assetId via SM_GET_ASSET, usando cache quando possível.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Compatibiliza storage legado e novo asset store sem duplicar blobs no restoreMap.

**Por que uma alternativa ingênua seria pior:** Guardar sempre Base64 no chrome.storage carregaria dados grandes e pioraria leitura/restauração.

### U08 — linhas 69–80 — getOrCreateChapterId

**O que faz:** Cacheia uma Promise por window.location.href e limpa o cache se a resolução rejeita.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Colapsa chamadas concorrentes da mesma instância e permite retry após erro.

**Por que uma alternativa ingênua seria pior:** Cachear Promise rejeitada/presa bloquearia toda persistência futura; não invalidar por URL quebraria SPA.

### U09 — linhas 81–114 — getOrCreateChapterIdImpl

**O que faz:** Procura chapter por URL exata, depois por hostname+título normalizado; atualiza URL/título de match aproximado ou cria novo registro.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Tenta deduplicar sessões do mesmo capítulo mesmo se URL mudou.

**Por que uma alternativa ingênua seria pior:** Criar sempre por URL geraria duplicatas; matching frouxo demais pode fundir capítulos distintos.

### U10 — linhas 115–143 — persistTranslatedPage

**O que faz:** Resolve chapterId, envia SM_SAVE_PAGE com metadata, alimenta restore entry/cache quando recebe assetId e mantém fallback legado quando não recebe.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Centraliza persistência nova e compatibilidade antiga sob um único contrato.

**Por que uma alternativa ingênua seria pior:** Escrever blobs diretamente em vários locais duplicaria storage e criaria divergência de restore.

### U11 — linhas 144–146 — API do manager

**O que faz:** Expõe somente operações de chapter/storage/cache necessárias ao content_manga/auto-restorer.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Preserva encapsulamento dos Maps e Promise cache.

**Por que uma alternativa ingênua seria pior:** Expor internals permitiria callers contornarem serialização/cache.

### U12 — linhas 147–154 — API global e compatibilidade JSDOM

**O que faz:** Congela API e publica em rootScope/globalThis/window para runtime clássico e Jest.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Garante que content_manga encontre window.MangaTranslatorChapter e testes Node vejam o mesmo módulo.

**Por que uma alternativa ingênua seria pior:** Publicar em apenas um scope falharia em um dos ambientes.

### U13 — linhas 155–155 — Newline final

**O que faz:** Representa o newline terminal auditado.

**Como faz:** usa apenas os Maps/Promises/dependências injetadas e APIs Chrome visíveis no bloco, preservando a ordem assíncrona descrita.

**Por que foi feito assim:** Mantém equivalência física explícita.

**Por que uma alternativa ingênua seria pior:** Ignorá-lo quebraria a convenção documental.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 154 linhas + newline = 155/155;
- [x] chapter identity/cache/dedup/persistência mapeados;
- [x] caminho moderno e fallback legado separados;
- [x] testes reais separados de implementações espelho;
- [x] divergência de canonicalTitle dos testes registrada;
- [x] riscos de concorrência/lost update/cache/metadata explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `44b621d570b6492ef08982ec4e093ffcfe6d24f8`.

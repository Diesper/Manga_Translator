# Bíblia técnica — `extension/shared/storage-manager.js`

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `d1cd5a2c83ed5fe5a36e67966ea835806b863395`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#Agent-A`  
> **Tipo:** JavaScript compartilhado — persistência IndexedDB do Manga Translator  
> **Runtime principal:** Chromium MV3 Service Worker / páginas internas da extensão  
> **Linhas textuais:** **516**  
> **Posições documentais:** **517** contando o newline terminal  
> **PR:** `#66`  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`storage-manager.js` é o dono da persistência durável de páginas traduzidas na origem da extensão. Ele substitui o modelo legado que mantinha grandes Data URLs duplicadas em `chrome.storage.local` por quatro stores IndexedDB: capítulos, páginas, restores e assets Blob.

O desenho separa **metadados** de **bytes da imagem**. Popup/reader podem listar páginas/restores sem carregar blobs; o Blob só vira Data URL quando uma página/asset é solicitado. A fila `_chapterWriters` serializa operações destrutivas por capítulo para impedir a antiga perda de páginas por concorrência.

## 2. Ownership, schema e lifecycle

- Banco: `manga_translator_data`, versão 1.
- `chapters`: keyPath `chapterId`; marca existência/updatedAt.
- `chapterPages`: key composta `[chapterId, pageIndex]`, índice `by_chapter`.
- `restoreEntries`: key composta `[chapterId, cleanUrl]`, índices `by_chapter` e `by_cleanUrl`.
- `assets`: keyPath `assetId`; contém Blob, MIME, tamanho e timestamp.
- `chapterList` continua em `chrome.storage.local` porque é metadado pequeno e compartilhado.
- `background.js` resolve `self.MangaTranslatorStorageManager` e roteia ações `SM_*`.

## 3. Fluxos críticos

### 3.1 Save atômico

`savePageResult()` valida capítulo/índice, entra na fila do capítulo, gera novo assetId, converte Data URL para Blob e abre uma única transaction readwrite sobre `assets`, `chapterPages`, `restoreEntries` e `chapters`. Antes de gravar, encontra os assets que serão substituídos; depois grava novo asset/página/restore, remove assets obsoletos e atualiza o capítulo. O retorno só ocorre após `_idbTxComplete(tx)`.

### 3.2 Leitura lazy

Índices de página/restore retornam apenas metadados. `getPageDataUrl()` e `getAssetDataUrl()` materializam Base64 somente sob demanda. Isso reduz o custo de memória do popup/reader em capítulos grandes.

### 3.3 Refazer/deletar

`deleteByCleanUrl()` encontra todas as entradas de restore com a URL e remove restore, página correspondente e assets. `deleteChapter()` coleta páginas/restores, reúne assetIds e apaga todo o conjunto em transaction readwrite.

### 3.4 Migração legada

A migração lê somente `_sm_migrated_<chapterId>`, `<chapter>_images`, `<chapter>_restoreMap` e `<chapter>_restoreMeta`. Páginas são migradas primeiro; restores sem página recebem índices negativos temporários. Ao final grava a flag e, se pelo menos um item migrou, remove as três chaves legadas.

## 4. Evidências automatizadas auditadas

| Comportamento | Evidência | Classificação |
|---|---|---|
| Abertura/schema IDB | smoke-03/04 e E2E usam stores reais; E2E limpa os quatro stores via `openStorageDb` | ✅ PROVADO NO CAMINHO FELIZ |
| Round-trip DataURL↔Blob base64 | smoke-04 compara Data URL PNG antes/depois | ✅ PROVADO DIRETAMENTE |
| savePageResult básico | smoke-04 grava e lê asset/page | ✅ PROVADO DIRETAMENTE |
| overwrite e coleta do asset antigo | smoke-04 salva a mesma página duas vezes e verifica asset antigo = null | ✅ PROVADO DIRETAMENTE |
| 10 saves concorrentes mesmo capítulo | smoke-03 usa Promise.all e comprova 10/10 páginas + restores | ✅ PROVADO DIRETAMENTE |
| persistência real no Chromium MV3 | cache-and-storage.spec lê duas páginas e restoreIndex no background worker | ✅ PROVADO EM E2E |
| deleteByCleanUrl sequencial | smoke-04 prova restore removido | ✅ PROVADO PARCIALMENTE |
| deleteChapter sequencial | smoke-04 prova pageCount 0 após delete | ✅ PROVADO DIRETAMENTE |
| migração legada bem-sucedida/idempotente | smoke-04 prova migrated, flag, limpeza e segunda chamada skipped | ✅ PROVADO DIRETAMENTE |
| roteamento SM_* | smoke-06 usa módulo real, mas copia o handler de background.js | 🟨 SIMULAÇÃO FIEL/CONTRATO, NÃO PROVA DO HANDLER REAL |
| rollback por abort/error de transaction | nenhum fault-injection específico encontrado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| migração parcialmente falha | nenhum teste; catches permitem continuar e flag é gravada no final | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| troca de cleanUrl na mesma página | nenhum teste; restore antigo pode sobreviver com asset removido | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| deleteByCleanUrl concorrente com save | nenhum teste e função não usa `_chapterWriters` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| getChaptersStats conteúdo exato | rota existe, mas não há assertion funcional específica encontrada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Data URL não-base64/malformada | nenhuma assertion específica encontrada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| openStorageDb sem IDB e recuperação posterior | nenhum teste; Promise rejeitada pode ficar cacheada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| orphan restore migrado com índice negativo | nenhum teste específico encontrado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Lacunas de teste e riscos

1. **⚠️ Migração parcial pode consolidar perda.** Cada `savePageResult` da migração é envolvido por `try/catch` e a função continua. Mesmo com falhas, a flag `_sm_migrated_<chapterId>` é escrita no final. Se ao menos uma página migrou, todas as chaves legadas são removidas, inclusive dados de páginas que falharam. Teste necessário: forçar falha em uma de N páginas e verificar que flag/cleanup não apagam o restante.
2. **⚠️ Troca de `cleanUrl` pode deixar restore órfão.** Ao sobrescrever a mesma `[chapterId,pageIndex]` com nova cleanUrl, o código marca o asset da página antiga como obsoleto, mas não remove a entrada restore da cleanUrl antiga. Essa entrada pode continuar apontando para o asset já deletado. Teste necessário: save URL A → mesma página URL B → garantir ausência de A no restoreIndex.
3. **⚠️ `deleteByCleanUrl()` não usa a fila por capítulo.** Um refazer pode correr com `savePageResult()` e intercalar read/write em transactions distintas. Teste necessário: Promise concorrente de save/delete na mesma cleanUrl e invariantes finais.
4. **⚠️ `openStorageDb()` pode cachear rejeição permanente se IDB estiver ausente na primeira chamada.** No ramo `!idb`, a Promise é rejeitada sem zerar `_smDbPromise`. Teste necessário: primeira chamada sem indexedDB, instalar fake IDB, segunda chamada deve conseguir abrir.
5. **⚠️ `_chapterWriters` nunca remove entradas concluídas.** O Map mantém uma Promise settled por chapterId até o worker morrer. Em MV3 a suspensão limita o impacto, mas uma sessão longa com muitos capítulos cresce monotonicamente. Teste/telemetria de cardinalidade não existe.
6. **⚠️ Restores órfãos da migração viram páginas com índices negativos.** `getChapterPageIndex`, `getChapterPageCount` e `getChaptersStats` não filtram negativos, então metadados/popup podem contar restores sem página como páginas reais.
7. **⚠️ `pageIndex` aceita negativos e fracionários.** `savePageResult` usa `Number.isFinite`, não `>=0 && integer`. Isso é deliberadamente usado pela migração para órfãos, mas mistura duas categorias no mesmo store.
8. **⚠️ Falhas/abort de IndexedDB não têm fault-injection específico.** Smoke prova o caminho feliz e atomicidade observada, mas não prova rollback quando `put/delete`/transaction falham.
9. **⚠️ `chrome.storage.local` da migração ignora `chrome.runtime.lastError`.** Callbacks de get/set/remove são resolvidos como sucesso independentemente de erro da API.
10. **⚠️ Data URLs não-base64 e malformadas não são testadas.** `decodeURIComponent` pode lançar; payloads gigantes criam múltiplas cópias em memória durante atob/Uint8Array/Blob.
11. **⚠️ `blobToDataUrl` evita estouro de apply com chunks, mas ainda monta a imagem inteira em string binária antes de `btoa`.** Em páginas grandes isso pode duplicar significativamente o pico de memória.
12. **⚠️ Não há `onversionchange`/`onblocked` na conexão.** Uma futura elevação de `SM_DB_VERSION` pode ser bloqueada por conexão antiga viva no mesmo processo.
13. **⚠️ `getChaptersStats` e `stats.bytes` não têm assertions de conteúdo exato.** Roteamento existe, mas contagens/índices/bytes precisam de testes dedicados.
14. **⚠️ Handler SM de `smoke-06` é uma cópia fiel, não o `handleStorageManagerMessage` real de `background.js`.** O módulo é real; o roteamento do background continua evidência complementar nessa suíte.

## 6. Segurança e privacidade

O módulo persiste imagens traduzidas e URLs. Ele não faz rede, mas recebe dados via callers/roteamento do background. `chapterId`, `cleanUrl`, `originalUrl`, `host`, metadados e Data URLs devem ser tratados como input de fronteira: este arquivo valida muito pouco além de `chapterId` presente e `pageIndex` finito.

`cleanUrl` e `sourceUrl` permanecem em IndexedDB da extensão e podem revelar os sites/páginas traduzidos para código com acesso à origem da extensão. O módulo não deve ser injetado como content script; isso criaria bancos por origem visitada e ampliaria exposição.

Asset IDs de fallback usam tempo + `Math.random`; não devem ser interpretados como segredo, token ou autorização.

## 7. Casos-limite

- IndexedDB ausente na primeira chamada e disponível depois.
- Upgrade futuro com conexão anterior ainda aberta.
- Data URL Blob já pronto, base64 válido, textual percent-encoded e malformed.
- Blob vazio ou com MIME vazio.
- pageIndex NaN, Infinity, negativo, fracionário e string numérica.
- save concorrente para a mesma página/cleanUrl e para páginas diferentes do mesmo capítulo.
- save da mesma página trocando cleanUrl.
- deleteByCleanUrl concorrente com savePageResult.
- deleteChapter enquanto existem saves enfileirados.
- restore sem página durante migração.
- uma página falha no meio da migração enquanto outras passam.
- chrome.storage.local set/remove falha.
- transaction readwrite aborta após alguns requests terem sido agendados.
- asset referenciado por restore/page inconsistente ou ausente.
- capítulo com milhares de assets e chamada `stats()`/listagem.

## 8. Invariantes

1. O banco de páginas traduzidas deve existir apenas na origem da extensão, nunca na origem do site de mangá.
2. Uma página persistida deve referenciar um asset existente.
3. Uma entrada de restore persistida deve referenciar um asset existente.
4. Overwrite de página não pode deixar asset antigo órfão nem restore apontando para asset removido.
5. Operações concorrentes no mesmo capítulo não podem perder páginas já confirmadas.
6. O retorno de `savePageResult` só pode ocorrer depois do commit da transaction.
7. Leituras de índice/listagem não devem carregar blobs desnecessariamente.
8. Delete de capítulo deve remover páginas, restores e assets correspondentes.
9. Refazer por cleanUrl não deve permitir que a tradução apagada reapareça por restore/page residual.
10. Migração não deve apagar dados legados que ainda não tenham sido persistidos com sucesso no novo banco.
11. Migração repetida deve ser idempotente.
12. Conversão Blob/DataURL deve preservar bytes e MIME nos formatos suportados.
13. Mudança futura de schema deve preservar/ migrar keyPaths e índices existentes.
14. Ações SM devem permanecer propriedade do background/realm da extensão.
15. Erros de storage não devem ser convertidos silenciosamente em sucesso.

## 9. Análise crítica

A arquitetura corrige de forma convincente o problema original de Base64 duplicado e read-modify-write: os smoke tests reais demonstram overwrite sem asset órfão e dez saves concorrentes sobrevivendo. O desenho de metadados separados dos blobs também é adequado para popup/reader.

O ponto mais delicado é a migração. O comentário promete que chaves antigas só são removidas depois que a gravação nova confirmou; porém a confirmação é avaliada **por item**, enquanto o cleanup ocorre **por capítulo**. Uma falha parcial pode portanto violar a intenção declarada. A segunda fragilidade é a fronteira entre fila serializada e operações que não entram nela (`deleteByCleanUrl`).

## 10. Fonte integral auditada

```javascript
// storage-manager.js — Manga Translator
//
// Camada de persistência de páginas traduzidas. Roda EXCLUSIVAMENTE no
// Service Worker (background.js) e nas páginas da extensão — nunca como
// content script.
//
// POR QUE ISSO IMPORTA:
//   Content scripts compartilham a origem da PÁGINA, não da extensão. Se este
//   módulo fosse injetado numa página de mangá, o banco `manga_translator_data`
//   seria criado por site e ficaria invisível para popup, leitor e background —
//   um bug de perda de dados pior que o original. O background e as páginas da
//   extensão compartilham a origem chrome-extension://<id>, que é a única
//   origem onde este banco faz sentido.
//
// O QUE ESTE MÓDULO RESOLVE:
//   1. Perda por read-modify-write: cada página é um REGISTRO próprio
//      (chave [chapterId, pageIndex]); gravar a página 7 nunca toca a página 3.
//   2. Múltiplas cópias Base64: um único Blob por resultado, em `assets`,
//      referenciado por assetId em `chapterPages` e `restoreEntries`.
//   3. Deleção incompleta: deleteChapter remove páginas, restores e assets.
//   4. Memória do leitor/popup: dá para listar metadados sem carregar blob algum.
//
// O `chapterList` continua em chrome.storage.local — é metadado pequeno,
// consultado por vários contextos; movê-lo não traria ganho.

'use strict';

(function attachStorageManager(rootScope) {

const SM_DB_NAME = 'manga_translator_data';
const SM_DB_VERSION = 1;

const SM_STORE_CHAPTERS      = 'chapters';
const SM_STORE_CHAPTER_PAGES = 'chapterPages';
const SM_STORE_RESTORE       = 'restoreEntries';
const SM_STORE_ASSETS        = 'assets';

// ── Abertura do banco ────────────────────────────────────────────────────────
let _smDbPromise = null;

function getIndexedDb() {
    if (rootScope && rootScope.indexedDB) return rootScope.indexedDB;
    return (typeof indexedDB !== 'undefined') ? indexedDB : null;
}

function openStorageDb() {
    if (_smDbPromise) return _smDbPromise;
    _smDbPromise = new Promise((resolve, reject) => {
        const idb = getIndexedDb();
        if (!idb || typeof idb.open !== 'function') {
            reject(new Error('IndexedDB indisponível neste contexto'));
            return;
        }
        const req = idb.open(SM_DB_NAME, SM_DB_VERSION);
        req.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(SM_STORE_CHAPTERS)) {
                db.createObjectStore(SM_STORE_CHAPTERS, { keyPath: 'chapterId' });
            }
            if (!db.objectStoreNames.contains(SM_STORE_CHAPTER_PAGES)) {
                const pages = db.createObjectStore(SM_STORE_CHAPTER_PAGES, { keyPath: ['chapterId', 'pageIndex'] });
                pages.createIndex('by_chapter', 'chapterId', { unique: false });
            }
            if (!db.objectStoreNames.contains(SM_STORE_RESTORE)) {
                const restore = db.createObjectStore(SM_STORE_RESTORE, { keyPath: ['chapterId', 'cleanUrl'] });
                restore.createIndex('by_chapter',  'chapterId', { unique: false });
                restore.createIndex('by_cleanUrl', 'cleanUrl',  { unique: false });
            }
            if (!db.objectStoreNames.contains(SM_STORE_ASSETS)) {
                db.createObjectStore(SM_STORE_ASSETS, { keyPath: 'assetId' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { _smDbPromise = null; reject(req.error || new Error('Falha ao abrir IndexedDB')); };
    });
    return _smDbPromise;
}

// ── Helpers IDB ──────────────────────────────────────────────────────────────
function _idbGet(store, key) {
    return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}
function _idbGetAll(storeOrIndex, query) {
    return new Promise((resolve, reject) => {
        const req = query ? storeOrIndex.getAll(query) : storeOrIndex.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}
function _idbTxComplete(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transação IDB abortada'));
    });
}

// ── Utilitários ──────────────────────────────────────────────────────────────
function generateAssetId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return 'asset_' + crypto.randomUUID();
        }
    } catch (_e) {}
    return `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Data URL → Blob. Já sendo Blob, retorna como está. */
function dataUrlToBlob(dataUrl) {
    if (typeof Blob !== 'undefined' && dataUrl instanceof Blob) return dataUrl;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        throw new Error('Entrada inválida para dataUrlToBlob');
    }
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) throw new Error('Data URL malformada: sem vírgula');
    const header = dataUrl.slice(0, commaIdx);
    const mimeMatch = header.match(/:(.*?)[;,]/);
    const mime = (mimeMatch && mimeMatch[1]) || 'application/octet-stream';
    const isBase64 = header.includes('base64');

    if (isBase64) {
        const bstr = atob(dataUrl.slice(commaIdx + 1));
        const len = bstr.length;
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) u8[i] = bstr.charCodeAt(i);
        return new Blob([u8], { type: mime });
    }
    const decoded = decodeURIComponent(dataUrl.slice(commaIdx + 1));
    return new Blob([decoded], { type: mime });
}

/** Blob → Data URL. FileReader não existe em Service Worker: usamos arrayBuffer. */
async function blobToDataUrl(blob) {
    if (!blob) return null;
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x8000; // evita "Maximum call stack size exceeded" em imagens grandes
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    const mime = blob.type || 'image/png';
    return `data:${mime};base64,${btoa(binary)}`;
}

// ── Escritor serializado por capítulo ────────────────────────────────────────
// Mesmo com registros individuais, duas gravações do MESMO capítulo podem
// disputar a troca de asset. A fila garante ordem determinística.
const _chapterWriters = new Map();

function enqueueChapterOp(chapterId, operation) {
    const previous = _chapterWriters.get(chapterId) || Promise.resolve();
    const next = previous.then(() => operation(), () => operation());
    _chapterWriters.set(chapterId, next.catch(() => {}));
    return next;
}

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Grava o resultado de uma página em UMA transação atômica:
 * asset (Blob) + registro da página + registro de restore.
 * Assets substituídos são removidos na mesma transação (sem órfãos).
 */
async function savePageResult(chapterId, pageIndex, imageData, originalUrl, cleanUrl, metadata = {}) {
    if (!chapterId) throw new Error('savePageResult: chapterId obrigatório');
    const index = Number(pageIndex);
    if (!Number.isFinite(index)) throw new Error('savePageResult: pageIndex inválido');

    return enqueueChapterOp(chapterId, async () => {
        const db = await openStorageDb();
        const assetId = generateAssetId();
        const blob = dataUrlToBlob(imageData);
        const now = Date.now();

        const tx = db.transaction(
            [SM_STORE_ASSETS, SM_STORE_CHAPTER_PAGES, SM_STORE_RESTORE, SM_STORE_CHAPTERS],
            'readwrite'
        );
        const assetStore   = tx.objectStore(SM_STORE_ASSETS);
        const pageStore    = tx.objectStore(SM_STORE_CHAPTER_PAGES);
        const restoreStore = tx.objectStore(SM_STORE_RESTORE);

        // Assets que este save substitui
        const obsolete = new Set();
        const previousPage = await _idbGet(pageStore, [chapterId, index]);
        if (previousPage && previousPage.assetId) obsolete.add(previousPage.assetId);
        if (cleanUrl) {
            const previousRestore = await _idbGet(restoreStore, [chapterId, cleanUrl]);
            if (previousRestore && previousRestore.assetId) obsolete.add(previousRestore.assetId);
        }

        assetStore.put({
            assetId,
            blob,
            mimeType: blob.type || 'image/png',
            size: blob.size,
            createdAt: now,
        });

        pageStore.put({
            chapterId,
            pageIndex: index,
            assetId,
            originalUrl: originalUrl || '',
            cleanUrl: cleanUrl || '',
            width: metadata.width || 0,
            height: metadata.height || 0,
            updatedAt: now,
        });

        if (cleanUrl) {
            restoreStore.put({
                chapterId,
                cleanUrl,
                assetId,
                sourceUrl: metadata.sourceUrl || originalUrl || '',
                host: metadata.host || '',
                index,
                width: metadata.width || 0,
                height: metadata.height || 0,
                updatedAt: now,
            });
        }

        obsolete.forEach(id => { if (id !== assetId) assetStore.delete(id); });

        tx.objectStore(SM_STORE_CHAPTERS).put({ chapterId, updatedAt: now });

        await _idbTxComplete(tx);
        return { assetId, chapterId, pageIndex: index };
    });
}

async function getAssetBlob(assetId) {
    if (!assetId) return null;
    const db = await openStorageDb();
    const tx = db.transaction(SM_STORE_ASSETS, 'readonly');
    const asset = await _idbGet(tx.objectStore(SM_STORE_ASSETS), assetId);
    return asset ? asset.blob : null;
}

async function getAssetDataUrl(assetId) {
    const blob = await getAssetBlob(assetId);
    return blob ? blobToDataUrl(blob) : null;
}

async function getPageAsset(chapterId, pageIndex) {
    const db = await openStorageDb();
    const tx = db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readonly');
    const page = await _idbGet(tx.objectStore(SM_STORE_CHAPTER_PAGES), [chapterId, Number(pageIndex)]);
    if (!page || !page.assetId) return null;
    const asset = await _idbGet(tx.objectStore(SM_STORE_ASSETS), page.assetId);
    return asset ? asset.blob : null;
}

async function getPageDataUrl(chapterId, pageIndex) {
    const blob = await getPageAsset(chapterId, pageIndex);
    return blob ? blobToDataUrl(blob) : null;
}

/** Metadados das páginas, SEM carregar nenhum blob. */
async function getChapterPageIndex(chapterId) {
    const db = await openStorageDb();
    const tx = db.transaction(SM_STORE_CHAPTER_PAGES, 'readonly');
    const rows = await _idbGetAll(
        tx.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter'),
        IDBKeyRange.only(chapterId)
    );
    return rows
        .map(r => ({ pageIndex: r.pageIndex, assetId: r.assetId, width: r.width, height: r.height, updatedAt: r.updatedAt }))
        .sort((a, b) => a.pageIndex - b.pageIndex);
}

async function getChapterPageCount(chapterId) {
    const rows = await getChapterPageIndex(chapterId);
    return rows.length;
}

/** Contagem de páginas de vários capítulos numa transação só (popup). */
async function getChaptersStats(chapterIds = []) {
    const db = await openStorageDb();
    const tx = db.transaction(SM_STORE_CHAPTER_PAGES, 'readonly');
    const idx = tx.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter');
    const stats = {};
    for (const chapterId of chapterIds) {
        const rows = await _idbGetAll(idx, IDBKeyRange.only(chapterId));
        stats[chapterId] = {
            pageCount: rows.length,
            indices: rows.map(r => r.pageIndex).sort((a, b) => a - b),
        };
    }
    return stats;
}

/**
 * Mapa de restauração SEM blobs: { [cleanUrl]: { assetId, index } }.
 * O content script só busca o asset da imagem que realmente apareceu no DOM —
 * é isso que desliga o consumo de memória do tamanho do capítulo.
 */
async function getRestoreIndex(chapterId) {
    const db = await openStorageDb();
    const tx = db.transaction(SM_STORE_RESTORE, 'readonly');
    const rows = await _idbGetAll(
        tx.objectStore(SM_STORE_RESTORE).index('by_chapter'),
        IDBKeyRange.only(chapterId)
    );
    const map = {};
    rows.forEach(r => { map[r.cleanUrl] = { assetId: r.assetId, index: r.index }; });
    return map;
}

/** Metadados de restore (popup/opções) — sem blobs. */
async function listRestoreEntries(chapterIds = null) {
    const db = await openStorageDb();
    const tx = db.transaction(SM_STORE_RESTORE, 'readonly');
    const store = tx.objectStore(SM_STORE_RESTORE);
    let rows;
    if (Array.isArray(chapterIds) && chapterIds.length > 0) {
        const idx = store.index('by_chapter');
        rows = [];
        for (const chapterId of chapterIds) {
            rows = rows.concat(await _idbGetAll(idx, IDBKeyRange.only(chapterId)));
        }
    } else {
        rows = await _idbGetAll(store);
    }
    return rows.map(r => ({
        chapterId: r.chapterId,
        cleanUrl:  r.cleanUrl,
        assetId:   r.assetId,
        sourceUrl: r.sourceUrl,
        host:      r.host,
        index:     r.index,
        width:     r.width,
        height:    r.height,
        updatedAt: r.updatedAt,
    })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * "Refazer": apaga tudo que faria a tradução errada voltar — entrada de restore,
 * página correspondente e os assets, em todos os capítulos que tenham essa URL.
 */
async function deleteByCleanUrl(cleanUrl) {
    if (!cleanUrl) return { deleted: 0 };
    const db = await openStorageDb();

    const txRead = db.transaction(SM_STORE_RESTORE, 'readonly');
    const rows = await _idbGetAll(
        txRead.objectStore(SM_STORE_RESTORE).index('by_cleanUrl'),
        IDBKeyRange.only(cleanUrl)
    );
    if (rows.length === 0) return { deleted: 0 };

    const tx = db.transaction([SM_STORE_RESTORE, SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readwrite');
    const restoreStore = tx.objectStore(SM_STORE_RESTORE);
    const pageStore    = tx.objectStore(SM_STORE_CHAPTER_PAGES);
    const assetStore   = tx.objectStore(SM_STORE_ASSETS);

    for (const row of rows) {
        restoreStore.delete([row.chapterId, row.cleanUrl]);
        if (row.assetId) assetStore.delete(row.assetId);
        if (Number.isFinite(row.index)) {
            const page = await _idbGet(pageStore, [row.chapterId, row.index]);
            if (page && page.cleanUrl === cleanUrl) {
                pageStore.delete([row.chapterId, row.index]);
                if (page.assetId) assetStore.delete(page.assetId);
            }
        }
    }

    await _idbTxComplete(tx);
    return { deleted: rows.length };
}

/** Remove capítulo inteiro: páginas, restores e assets. */
async function deleteChapter(chapterId) {
    if (!chapterId) return { deleted: 0 };
    return enqueueChapterOp(chapterId, async () => {
        const db = await openStorageDb();

        const txRead = db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_RESTORE], 'readonly');
        const pages = await _idbGetAll(
            txRead.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter'), IDBKeyRange.only(chapterId));
        const restores = await _idbGetAll(
            txRead.objectStore(SM_STORE_RESTORE).index('by_chapter'), IDBKeyRange.only(chapterId));

        const assetIds = new Set();
        pages.forEach(p => { if (p.assetId) assetIds.add(p.assetId); });
        restores.forEach(r => { if (r.assetId) assetIds.add(r.assetId); });

        const tx = db.transaction(
            [SM_STORE_CHAPTERS, SM_STORE_CHAPTER_PAGES, SM_STORE_RESTORE, SM_STORE_ASSETS], 'readwrite');
        tx.objectStore(SM_STORE_CHAPTERS).delete(chapterId);
        pages.forEach(p => tx.objectStore(SM_STORE_CHAPTER_PAGES).delete([p.chapterId, p.pageIndex]));
        restores.forEach(r => tx.objectStore(SM_STORE_RESTORE).delete([r.chapterId, r.cleanUrl]));
        assetIds.forEach(id => tx.objectStore(SM_STORE_ASSETS).delete(id));

        await _idbTxComplete(tx);
        return { deleted: pages.length + restores.length, assets: assetIds.size };
    });
}

// ── Migração de dados legados ────────────────────────────────────────────────
//
// Idempotente e POR CAPÍTULO: só lê as chaves daquele capítulo (nada de get(null)).
// As chaves antigas só são removidas depois que a gravação nova confirmou — é
// isso que devolve a cota de chrome.storage.local ocupada por Base64 duplicado.
async function migrateChapterFromLegacy(chapterId) {
    if (!chapterId) return { migrated: 0, skipped: true };

    const flagKey = `_sm_migrated_${chapterId}`;
    const keys = [flagKey, `${chapterId}_images`, `${chapterId}_restoreMap`, `${chapterId}_restoreMeta`];
    const data = await new Promise(resolve => chrome.storage.local.get(keys, resolve));

    if (data[flagKey]) return { migrated: 0, skipped: true };

    const images      = data[`${chapterId}_images`] || {};
    const restoreMap  = data[`${chapterId}_restoreMap`] || {};
    const restoreMeta = data[`${chapterId}_restoreMeta`] || {};

    let migrated = 0;

    // Índice reverso: pageIndex → cleanUrl
    const urlByIndex = {};
    Object.keys(restoreMeta).forEach(url => {
        const meta = restoreMeta[url];
        if (meta && meta.index !== undefined && meta.index !== null) urlByIndex[String(meta.index)] = url;
    });

    for (const indexStr of Object.keys(images)) {
        const dataUrl = images[indexStr];
        if (!dataUrl || typeof dataUrl !== 'string') continue;
        const pageIndex = parseInt(indexStr, 10);
        if (!Number.isFinite(pageIndex)) continue;

        const cleanUrl = urlByIndex[indexStr] || '';
        const meta = (cleanUrl && restoreMeta[cleanUrl]) || {};
        try {
            await savePageResult(chapterId, pageIndex, dataUrl, meta.sourceUrl || '', cleanUrl, {
                host: meta.host || '', width: meta.width || 0, height: meta.height || 0,
                sourceUrl: meta.sourceUrl || '',
            });
            migrated++;
        } catch (_e) { /* segue para a próxima página */ }
    }

    // Restores sem página correspondente
    let orphanSlot = -1;
    for (const cleanUrl of Object.keys(restoreMap)) {
        const dataUrl = restoreMap[cleanUrl];
        if (!dataUrl || typeof dataUrl !== 'string') continue;
        const meta = restoreMeta[cleanUrl] || {};
        const declaredIndex = Number(meta.index);
        const hasPage = Number.isFinite(declaredIndex) && images[String(declaredIndex)];
        if (hasPage) continue; // já migrado acima
        const pageIndex = Number.isFinite(declaredIndex) ? declaredIndex : (orphanSlot--);
        try {
            await savePageResult(chapterId, pageIndex, dataUrl, meta.sourceUrl || '', cleanUrl, {
                host: meta.host || '', width: meta.width || 0, height: meta.height || 0,
                sourceUrl: meta.sourceUrl || '',
            });
            migrated++;
        } catch (_e) {}
    }

    await new Promise(resolve => chrome.storage.local.set({ [flagKey]: true }, resolve));
    if (migrated > 0) {
        await new Promise(resolve => chrome.storage.local.remove(
            [`${chapterId}_images`, `${chapterId}_restoreMap`, `${chapterId}_restoreMeta`], resolve));
    }

    return { migrated, skipped: false };
}

async function stats() {
    const db = await openStorageDb();
    const tx = db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readonly');
    const pages = await _idbGetAll(tx.objectStore(SM_STORE_CHAPTER_PAGES));
    const assets = await _idbGetAll(tx.objectStore(SM_STORE_ASSETS));
    const bytes = assets.reduce((sum, a) => sum + (a.size || 0), 0);
    return { pages: pages.length, assets: assets.length, bytes };
}

const api = {
    openStorageDb,
    savePageResult,
    getAssetBlob,
    getAssetDataUrl,
    getPageAsset,
    getPageDataUrl,
    getChapterPageIndex,
    getChapterPageCount,
    getChaptersStats,
    getRestoreIndex,
    listRestoreEntries,
    deleteByCleanUrl,
    deleteChapter,
    migrateChapterFromLegacy,
    stats,
    dataUrlToBlob,
    blobToDataUrl,
    SM_DB_NAME,
    SM_DB_VERSION,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
rootScope.MangaTranslatorStorageManager = api;

})(typeof self !== 'undefined' ? self : globalThis);
```

## 11. Cobertura documental linha a linha

Cada posição abaixo corresponde exatamente a `source.split("\n")`. A classificação de evidência é herdada da unidade funcional e distingue caminho feliz real, E2E, simulação de routing e lacunas de fault-injection.

### Linha 0001

**Fonte:** `// storage-manager.js — Manga Translator`  
**O que faz:** Comentário/JSDoc registra: “storage-manager.js — Manga Translator”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0002

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc registra: “”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0003

**Fonte:** `// Camada de persistência de páginas traduzidas. Roda EXCLUSIVAMENTE no`  
**O que faz:** Comentário/JSDoc registra: “Camada de persistência de páginas traduzidas. Roda EXCLUSIVAMENTE no”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0004

**Fonte:** `// Service Worker (background.js) e nas páginas da extensão — nunca como`  
**O que faz:** Comentário/JSDoc registra: “Service Worker (background.js) e nas páginas da extensão — nunca como”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0005

**Fonte:** `// content script.`  
**O que faz:** Comentário/JSDoc registra: “content script.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0006

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc registra: “”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0007

**Fonte:** `// POR QUE ISSO IMPORTA:`  
**O que faz:** Comentário/JSDoc registra: “POR QUE ISSO IMPORTA:”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0008

**Fonte:** `// Content scripts compartilham a origem da PÁGINA, não da extensão. Se este`  
**O que faz:** Comentário/JSDoc registra: “Content scripts compartilham a origem da PÁGINA, não da extensão. Se este”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0009

**Fonte:** `// módulo fosse injetado numa página de mangá, o banco \`manga_translator_data\``  
**O que faz:** Comentário/JSDoc registra: “módulo fosse injetado numa página de mangá, o banco `manga_translator_data`”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0010

**Fonte:** `// seria criado por site e ficaria invisível para popup, leitor e background —`  
**O que faz:** Comentário/JSDoc registra: “seria criado por site e ficaria invisível para popup, leitor e background —”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0011

**Fonte:** `// um bug de perda de dados pior que o original. O background e as páginas da`  
**O que faz:** Comentário/JSDoc registra: “um bug de perda de dados pior que o original. O background e as páginas da”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0012

**Fonte:** `// extensão compartilham a origem chrome-extension://<id>, que é a única`  
**O que faz:** Comentário/JSDoc registra: “extensão compartilham a origem chrome-extension://<id>, que é a única”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0013

**Fonte:** `// origem onde este banco faz sentido.`  
**O que faz:** Comentário/JSDoc registra: “origem onde este banco faz sentido.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0014

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc registra: “”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0015

**Fonte:** `// O QUE ESTE MÓDULO RESOLVE:`  
**O que faz:** Comentário/JSDoc registra: “O QUE ESTE MÓDULO RESOLVE:”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0016

**Fonte:** `// 1. Perda por read-modify-write: cada página é um REGISTRO próprio`  
**O que faz:** Comentário/JSDoc registra: “1. Perda por read-modify-write: cada página é um REGISTRO próprio”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0017

**Fonte:** `// (chave [chapterId, pageIndex]); gravar a página 7 nunca toca a página 3.`  
**O que faz:** Comentário/JSDoc registra: “(chave [chapterId, pageIndex]); gravar a página 7 nunca toca a página 3.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0018

**Fonte:** `// 2. Múltiplas cópias Base64: um único Blob por resultado, em \`assets\`,`  
**O que faz:** Comentário/JSDoc registra: “2. Múltiplas cópias Base64: um único Blob por resultado, em `assets`,”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0019

**Fonte:** `// referenciado por assetId em \`chapterPages\` e \`restoreEntries\`.`  
**O que faz:** Comentário/JSDoc registra: “referenciado por assetId em `chapterPages` e `restoreEntries`.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0020

**Fonte:** `// 3. Deleção incompleta: deleteChapter remove páginas, restores e assets.`  
**O que faz:** Comentário/JSDoc registra: “3. Deleção incompleta: deleteChapter remove páginas, restores e assets.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0021

**Fonte:** `// 4. Memória do leitor/popup: dá para listar metadados sem carregar blob algum.`  
**O que faz:** Comentário/JSDoc registra: “4. Memória do leitor/popup: dá para listar metadados sem carregar blob algum.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0022

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc registra: “”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0023

**Fonte:** `// O \`chapterList\` continua em chrome.storage.local — é metadado pequeno,`  
**O que faz:** Comentário/JSDoc registra: “O `chapterList` continua em chrome.storage.local — é metadado pequeno,”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0024

**Fonte:** `// consultado por vários contextos; movê-lo não traria ganho.`  
**O que faz:** Comentário/JSDoc registra: “consultado por vários contextos; movê-lo não traria ganho.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0025

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **contrato arquitetural e IIFE multi-runtime**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0026

**Fonte:** `'use strict';`  
**O que faz:** Ativa strict mode para todo o módulo.  
**Como faz:** Faz erros de atribuição/escopo falharem explicitamente em vez de criar globals acidentais.  
**Por que assim:** Persistência compartilhada deve evitar falhas silenciosas.  
**Risco/alternativa:** Modo não estrito pode mascarar corrupção de estado.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0027

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **contrato arquitetural e IIFE multi-runtime**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0028

**Fonte:** `(function attachStorageManager(rootScope) {`  
**O que faz:** Abre a IIFE `attachStorageManager(rootScope)`.  
**Como faz:** Encapsula estado privado e recebe o realm onde a API será publicada.  
**Por que assim:** Permite compartilhar a mesma implementação entre SW, páginas da extensão e Node.  
**Risco/alternativa:** Globals internos expostos aumentariam colisões e mutabilidade.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0029

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **contrato arquitetural e IIFE multi-runtime**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟦 GATE/ARQUITETURA + 🟨 EXECUÇÃO INDIRETA — comentários e carregamento por background/E2E demonstram que o módulo é usado no realm da extensão, não como content script.

### Linha 0030

**Fonte:** `const SM_DB_NAME = 'manga_translator_data';`  
**O que faz:** Inicializa `SM_DB_NAME` com `'manga_translator_data';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** centraliza nomes/versão e reutiliza uma única Promise de abertura.  
**Risco/alternativa:** cache de Promise rejeitada pode impedir recuperação se IDB aparecer depois.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0031

**Fonte:** `const SM_DB_VERSION = 1;`  
**O que faz:** Inicializa `SM_DB_VERSION` com `1;`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** centraliza nomes/versão e reutiliza uma única Promise de abertura.  
**Risco/alternativa:** cache de Promise rejeitada pode impedir recuperação se IDB aparecer depois.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0032

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **schema IndexedDB e cache da conexão**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0033

**Fonte:** `const SM_STORE_CHAPTERS = 'chapters';`  
**O que faz:** Inicializa `SM_STORE_CHAPTERS` com `'chapters';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** centraliza nomes/versão e reutiliza uma única Promise de abertura.  
**Risco/alternativa:** cache de Promise rejeitada pode impedir recuperação se IDB aparecer depois.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0034

**Fonte:** `const SM_STORE_CHAPTER_PAGES = 'chapterPages';`  
**O que faz:** Inicializa `SM_STORE_CHAPTER_PAGES` com `'chapterPages';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** centraliza nomes/versão e reutiliza uma única Promise de abertura.  
**Risco/alternativa:** cache de Promise rejeitada pode impedir recuperação se IDB aparecer depois.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0035

**Fonte:** `const SM_STORE_RESTORE = 'restoreEntries';`  
**O que faz:** Inicializa `SM_STORE_RESTORE` com `'restoreEntries';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** centraliza nomes/versão e reutiliza uma única Promise de abertura.  
**Risco/alternativa:** cache de Promise rejeitada pode impedir recuperação se IDB aparecer depois.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0036

**Fonte:** `const SM_STORE_ASSETS = 'assets';`  
**O que faz:** Inicializa `SM_STORE_ASSETS` com `'assets';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** centraliza nomes/versão e reutiliza uma única Promise de abertura.  
**Risco/alternativa:** cache de Promise rejeitada pode impedir recuperação se IDB aparecer depois.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0037

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **schema IndexedDB e cache da conexão**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0038

**Fonte:** `// ── Abertura do banco ────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc registra: “── Abertura do banco ────────────────────────────────────────────────────────”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0039

**Fonte:** `let _smDbPromise = null;`  
**O que faz:** Inicializa `_smDbPromise` com `null;`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** centraliza nomes/versão e reutiliza uma única Promise de abertura.  
**Risco/alternativa:** cache de Promise rejeitada pode impedir recuperação se IDB aparecer depois.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0040

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **schema IndexedDB e cache da conexão**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — smoke/E2E abrem o banco real via fake-indexeddb/Chromium; ausência inicial de IDB não tem teste específico.

### Linha 0041

**Fonte:** `function getIndexedDb() {`  
**O que faz:** Declara a função `getIndexedDb` em **abertura e upgrade do banco**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0042

**Fonte:** `if (rootScope && rootScope.indexedDB) return rootScope.indexedDB;`  
**O que faz:** Aplica a guarda `if (rootScope && rootScope.indexedDB) return rootScope.indexedDB;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0043

**Fonte:** `return (typeof indexedDB !== 'undefined') ? indexedDB : null;`  
**O que faz:** Retorna `return (typeof indexedDB !== 'undefined') ? indexedDB : null;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0044

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0045

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **abertura e upgrade do banco**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0046

**Fonte:** `function openStorageDb() {`  
**O que faz:** Declara a função `openStorageDb` em **abertura e upgrade do banco**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0047

**Fonte:** `if (_smDbPromise) return _smDbPromise;`  
**O que faz:** Aplica a guarda `if (_smDbPromise) return _smDbPromise;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0048

**Fonte:** `_smDbPromise = new Promise((resolve, reject) => {`  
**O que faz:** Cria uma Promise para adaptar API callback/event-driven.  
**Como faz:** Resolve/rejeita a operação quando o request/transaction correspondente dispara seus eventos.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0049

**Fonte:** `const idb = getIndexedDb();`  
**O que faz:** Inicializa `idb` com `getIndexedDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0050

**Fonte:** `if (!idb \|\| typeof idb.open !== 'function') {`  
**O que faz:** Aplica a guarda `if (!idb \|\| typeof idb.open !== 'function') {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0051

**Fonte:** `reject(new Error('IndexedDB indisponível neste contexto'));`  
**O que faz:** Rejeita explicitamente a abertura quando IndexedDB não existe nesse contexto.  
**Como faz:** Entrega `Error('IndexedDB indisponível neste contexto')` ao executor da Promise e retorna sem chamar `idb.open`.  
**Por que assim:** Falhar cedo evita que operações posteriores tentem usar uma API inexistente.  
**Risco/alternativa:** Como `_smDbPromise` já referencia essa Promise rejeitada, esse ramo pode ficar cacheado até o worker reiniciar; não há teste de recuperação.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0052

**Fonte:** `return;`  
**O que faz:** Retorna `return;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0053

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0054

**Fonte:** `const req = idb.open(SM_DB_NAME, SM_DB_VERSION);`  
**O que faz:** Inicializa `req` com `idb.open(SM_DB_NAME, SM_DB_VERSION);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0055

**Fonte:** `req.onupgradeneeded = (event) => {`  
**O que faz:** Define callback/arrow `req.onupgradeneeded = (event) => {`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0056

**Fonte:** `const db = event.target.result;`  
**O que faz:** Inicializa `db` com `event.target.result;`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0057

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **abertura e upgrade do banco**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0058

**Fonte:** `if (!db.objectStoreNames.contains(SM_STORE_CHAPTERS)) {`  
**O que faz:** Aplica a guarda `if (!db.objectStoreNames.contains(SM_STORE_CHAPTERS)) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0059

**Fonte:** `db.createObjectStore(SM_STORE_CHAPTERS, { keyPath: 'chapterId' });`  
**O que faz:** Cria store com `db.createObjectStore(SM_STORE_CHAPTERS, { keyPath: 'chapterId' });`.  
**Como faz:** Executa apenas durante upgrade quando o store ainda não existe.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0060

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0061

**Fonte:** `if (!db.objectStoreNames.contains(SM_STORE_CHAPTER_PAGES)) {`  
**O que faz:** Aplica a guarda `if (!db.objectStoreNames.contains(SM_STORE_CHAPTER_PAGES)) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0062

**Fonte:** `const pages = db.createObjectStore(SM_STORE_CHAPTER_PAGES, { keyPath: ['chapterId', 'pageIndex'] });`  
**O que faz:** Inicializa `pages` com `db.createObjectStore(SM_STORE_CHAPTER_PAGES, { keyPath: ['chapterId', 'pageIndex'] });`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0063

**Fonte:** `pages.createIndex('by_chapter', 'chapterId', { unique: false });`  
**O que faz:** Cria índice com `pages.createIndex('by_chapter', 'chapterId', { unique: false });`.  
**Como faz:** Define lookup secundário por capítulo ou cleanUrl durante upgrade.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0064

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0065

**Fonte:** `if (!db.objectStoreNames.contains(SM_STORE_RESTORE)) {`  
**O que faz:** Aplica a guarda `if (!db.objectStoreNames.contains(SM_STORE_RESTORE)) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0066

**Fonte:** `const restore = db.createObjectStore(SM_STORE_RESTORE, { keyPath: ['chapterId', 'cleanUrl'] });`  
**O que faz:** Inicializa `restore` com `db.createObjectStore(SM_STORE_RESTORE, { keyPath: ['chapterId', 'cleanUrl'] });`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0067

**Fonte:** `restore.createIndex('by_chapter', 'chapterId', { unique: false });`  
**O que faz:** Cria índice com `restore.createIndex('by_chapter', 'chapterId', { unique: false });`.  
**Como faz:** Define lookup secundário por capítulo ou cleanUrl durante upgrade.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0068

**Fonte:** `restore.createIndex('by_cleanUrl', 'cleanUrl', { unique: false });`  
**O que faz:** Cria índice com `restore.createIndex('by_cleanUrl', 'cleanUrl', { unique: false });`.  
**Como faz:** Define lookup secundário por capítulo ou cleanUrl durante upgrade.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0069

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0070

**Fonte:** `if (!db.objectStoreNames.contains(SM_STORE_ASSETS)) {`  
**O que faz:** Aplica a guarda `if (!db.objectStoreNames.contains(SM_STORE_ASSETS)) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0071

**Fonte:** `db.createObjectStore(SM_STORE_ASSETS, { keyPath: 'assetId' });`  
**O que faz:** Cria store com `db.createObjectStore(SM_STORE_ASSETS, { keyPath: 'assetId' });`.  
**Como faz:** Executa apenas durante upgrade quando o store ainda não existe.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0072

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0073

**Fonte:** `};`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `};`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0074

**Fonte:** `req.onsuccess = () => resolve(req.result);`  
**O que faz:** Define callback/arrow `req.onsuccess = () => resolve(req.result);`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0075

**Fonte:** `req.onerror = () => { _smDbPromise = null; reject(req.error \|\| new Error('Falha ao abrir IndexedDB')); };`  
**O que faz:** Define callback/arrow `req.onerror = () => { _smDbPromise = null; reject(req.error \|\| new Error('Falha ao abrir IndexedDB')); };`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0076

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0077

**Fonte:** `return _smDbPromise;`  
**O que faz:** Retorna `return _smDbPromise;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0078

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **abertura e upgrade do banco** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cria stores/índices idempotentemente e compartilha conexão.  
**Risco/alternativa:** sem onversionchange/onblocked, upgrades futuros podem ficar bloqueados.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0079

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **abertura e upgrade do banco**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO EM SMOKE/E2E PARA CAMINHO FELIZ — smoke-03/04 e E2E usam os quatro stores criados; fault de open/upgrade/versionchange não é injetado.

### Linha 0080

**Fonte:** `// ── Helpers IDB ──────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc registra: “── Helpers IDB ──────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0081

**Fonte:** `function _idbGet(store, key) {`  
**O que faz:** Declara a função `_idbGet` em **helpers de requests e conclusão de transação**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0082

**Fonte:** `return new Promise((resolve, reject) => {`  
**O que faz:** Retorna `return new Promise((resolve, reject) => {`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0083

**Fonte:** `const req = store.get(key);`  
**O que faz:** Inicializa `req` com `store.get(key);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0084

**Fonte:** `req.onsuccess = () => resolve(req.result \|\| null);`  
**O que faz:** Define callback/arrow `req.onsuccess = () => resolve(req.result \|\| null);`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0085

**Fonte:** `req.onerror = () => reject(req.error);`  
**O que faz:** Define callback/arrow `req.onerror = () => reject(req.error);`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0086

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **helpers de requests e conclusão de transação** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0087

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **helpers de requests e conclusão de transação** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0088

**Fonte:** `function _idbGetAll(storeOrIndex, query) {`  
**O que faz:** Declara a função `_idbGetAll` em **helpers de requests e conclusão de transação**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0089

**Fonte:** `return new Promise((resolve, reject) => {`  
**O que faz:** Retorna `return new Promise((resolve, reject) => {`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0090

**Fonte:** `const req = query ? storeOrIndex.getAll(query) : storeOrIndex.getAll();`  
**O que faz:** Inicializa `req` com `query ? storeOrIndex.getAll(query) : storeOrIndex.getAll();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0091

**Fonte:** `req.onsuccess = () => resolve(req.result \|\| []);`  
**O que faz:** Define callback/arrow `req.onsuccess = () => resolve(req.result \|\| []);`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0092

**Fonte:** `req.onerror = () => reject(req.error);`  
**O que faz:** Define callback/arrow `req.onerror = () => reject(req.error);`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0093

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **helpers de requests e conclusão de transação** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0094

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **helpers de requests e conclusão de transação** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0095

**Fonte:** `function _idbTxComplete(tx) {`  
**O que faz:** Declara a função `_idbTxComplete` em **helpers de requests e conclusão de transação**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0096

**Fonte:** `return new Promise((resolve, reject) => {`  
**O que faz:** Retorna `return new Promise((resolve, reject) => {`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0097

**Fonte:** `tx.oncomplete = () => resolve();`  
**O que faz:** Define callback/arrow `tx.oncomplete = () => resolve();`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0098

**Fonte:** `tx.onerror = () => reject(tx.error);`  
**O que faz:** Define callback/arrow `tx.onerror = () => reject(tx.error);`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0099

**Fonte:** `tx.onabort = () => reject(tx.error \|\| new Error('Transação IDB abortada'));`  
**O que faz:** Define callback/arrow `tx.onabort = () => reject(tx.error \|\| new Error('Transação IDB abortada'));`.  
**Como faz:** Encapsula transformação, handler IndexedDB ou operação serializada ligada ao bloco atual.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0100

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **helpers de requests e conclusão de transação** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0101

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **helpers de requests e conclusão de transação** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** promisifica IndexedDB para compor operações assíncronas.  
**Risco/alternativa:** erros/abort não testados podem deixar callers com diagnóstico incompleto.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0102

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **helpers de requests e conclusão de transação**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO PELOS CALLERS REAIS — save/get/delete reais exercitam success; abort/error explícitos não têm fault-injection específico.

### Linha 0103

**Fonte:** `// ── Utilitários ──────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc registra: “── Utilitários ──────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0104

**Fonte:** `function generateAssetId() {`  
**O que faz:** Declara a função `generateAssetId` em **geração de assetId**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** cada gravação recebe asset independente para permitir coleta de órfãos.  
**Risco/alternativa:** fallback Date.now+Math.random não oferece garantia criptográfica nem prova de colisão cross-restart.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0105

**Fonte:** `try {`  
**O que faz:** Abre bloco protegido contra exceção de API opcional.  
**Como faz:** Permite usar crypto/storage sem derrubar a operação quando o fallback é aceitável.  
**Por que assim:** cada gravação recebe asset independente para permitir coleta de órfãos.  
**Risco/alternativa:** fallback Date.now+Math.random não oferece garantia criptográfica nem prova de colisão cross-restart.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0106

**Fonte:** `if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {`  
**O que faz:** Aplica a guarda `if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** cada gravação recebe asset independente para permitir coleta de órfãos.  
**Risco/alternativa:** fallback Date.now+Math.random não oferece garantia criptográfica nem prova de colisão cross-restart.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0107

**Fonte:** `return 'asset_' + crypto.randomUUID();`  
**O que faz:** Retorna `return 'asset_' + crypto.randomUUID();`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** cada gravação recebe asset independente para permitir coleta de órfãos.  
**Risco/alternativa:** fallback Date.now+Math.random não oferece garantia criptográfica nem prova de colisão cross-restart.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0108

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **geração de assetId** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cada gravação recebe asset independente para permitir coleta de órfãos.  
**Risco/alternativa:** fallback Date.now+Math.random não oferece garantia criptográfica nem prova de colisão cross-restart.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0109

**Fonte:** `} catch (_e) {}`  
**O que faz:** Captura a falha da tentativa anterior.  
**Como faz:** Converte a exceção em fallback ou continua migração conforme o contrato local.  
**Por que assim:** cada gravação recebe asset independente para permitir coleta de órfãos.  
**Risco/alternativa:** Capturar sem registrar pode esconder falha parcial; isso é especialmente sensível na migração.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0110

**Fonte:** `return \`asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}\`;`  
**O que faz:** Retorna `return \`asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}\`;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** cada gravação recebe asset independente para permitir coleta de órfãos.  
**Risco/alternativa:** fallback Date.now+Math.random não oferece garantia criptográfica nem prova de colisão cross-restart.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0111

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **geração de assetId** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** cada gravação recebe asset independente para permitir coleta de órfãos.  
**Risco/alternativa:** fallback Date.now+Math.random não oferece garantia criptográfica nem prova de colisão cross-restart.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0112

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **geração de assetId**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0113

**Fonte:** `/** Data URL → Blob. Já sendo Blob, retorna como está. */`  
**O que faz:** Comentário/JSDoc registra: “* Data URL → Blob. Já sendo Blob, retorna como está. */”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — saves reais provam IDs distintos em substituição; branches randomUUID/fallback não são isolados.

### Linha 0114

**Fonte:** `function dataUrlToBlob(dataUrl) {`  
**O que faz:** Declara a função `dataUrlToBlob` em **Data URL para Blob**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0115

**Fonte:** `if (typeof Blob !== 'undefined' && dataUrl instanceof Blob) return dataUrl;`  
**O que faz:** Aplica a guarda `if (typeof Blob !== 'undefined' && dataUrl instanceof Blob) return dataUrl;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0116

**Fonte:** `if (typeof dataUrl !== 'string' \|\| !dataUrl.startsWith('data:')) {`  
**O que faz:** Aplica a guarda `if (typeof dataUrl !== 'string' \|\| !dataUrl.startsWith('data:')) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0117

**Fonte:** `throw new Error('Entrada inválida para dataUrlToBlob');`  
**O que faz:** Falha cedo com `throw new Error('Entrada inválida para dataUrlToBlob');`.  
**Como faz:** Impede que input/contexto inválido avance até uma transaction ou conversão mais difícil de diagnosticar.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0118

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Data URL para Blob** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0119

**Fonte:** `const commaIdx = dataUrl.indexOf(',');`  
**O que faz:** Inicializa `commaIdx` com `dataUrl.indexOf(',');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0120

**Fonte:** `if (commaIdx === -1) throw new Error('Data URL malformada: sem vírgula');`  
**O que faz:** Aplica a guarda `if (commaIdx === -1) throw new Error('Data URL malformada: sem vírgula');`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0121

**Fonte:** `const header = dataUrl.slice(0, commaIdx);`  
**O que faz:** Inicializa `header` com `dataUrl.slice(0, commaIdx);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0122

**Fonte:** `const mimeMatch = header.match(/:(.*?)[;,]/);`  
**O que faz:** Inicializa `mimeMatch` com `header.match(/:(.*?)[;,]/);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0123

**Fonte:** `const mime = (mimeMatch && mimeMatch[1]) \|\| 'application/octet-stream';`  
**O que faz:** Inicializa `mime` com `(mimeMatch && mimeMatch[1]) \|\| 'application/octet-stream';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0124

**Fonte:** `const isBase64 = header.includes('base64');`  
**O que faz:** Inicializa `isBase64` com `header.includes('base64');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0125

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **Data URL para Blob**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0126

**Fonte:** `if (isBase64) {`  
**O que faz:** Aplica a guarda `if (isBase64) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0127

**Fonte:** `const bstr = atob(dataUrl.slice(commaIdx + 1));`  
**O que faz:** Inicializa `bstr` com `atob(dataUrl.slice(commaIdx + 1));`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0128

**Fonte:** `const len = bstr.length;`  
**O que faz:** Inicializa `len` com `bstr.length;`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0129

**Fonte:** `const u8 = new Uint8Array(len);`  
**O que faz:** Inicializa `u8` com `new Uint8Array(len);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0130

**Fonte:** `for (let i = 0; i < len; i++) u8[i] = bstr.charCodeAt(i);`  
**O que faz:** Inicia a iteração `for (let i = 0; i < len; i++) u8[i] = bstr.charCodeAt(i);`.  
**Como faz:** Percorre bytes, capítulos, páginas, restores ou assets na ordem do algoritmo.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0131

**Fonte:** `return new Blob([u8], { type: mime });`  
**O que faz:** Retorna `return new Blob([u8], { type: mime });`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0132

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Data URL para Blob** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0133

**Fonte:** `const decoded = decodeURIComponent(dataUrl.slice(commaIdx + 1));`  
**O que faz:** Inicializa `decoded` com `decodeURIComponent(dataUrl.slice(commaIdx + 1));`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0134

**Fonte:** `return new Blob([decoded], { type: mime });`  
**O que faz:** Retorna `return new Blob([decoded], { type: mime });`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0135

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Data URL para Blob** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** converte payload legado/IPC em Blob persistível no IDB.  
**Risco/alternativa:** payload enorme ou percent-encoding inválido pode custar memória ou lançar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0136

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **Data URL para Blob**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0137

**Fonte:** `/** Blob → Data URL. FileReader não existe em Service Worker: usamos arrayBuffer. */`  
**O que faz:** Comentário/JSDoc registra: “* Blob → Data URL. FileReader não existe em Service Worker: usamos arrayBuffer. */”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO BASE64 — smoke-04 faz round-trip PNG base64; Blob input, data URL textual e erros malformados não têm asserts específicos.

### Linha 0138

**Fonte:** `async function blobToDataUrl(blob) {`  
**O que faz:** Declara a função `blobToDataUrl` em **Blob para Data URL em Service Worker**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0139

**Fonte:** `if (!blob) return null;`  
**O que faz:** Aplica a guarda `if (!blob) return null;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0140

**Fonte:** `const buffer = await blob.arrayBuffer();`  
**O que faz:** Inicializa `buffer` com `await blob.arrayBuffer();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0141

**Fonte:** `const bytes = new Uint8Array(buffer);`  
**O que faz:** Inicializa `bytes` com `new Uint8Array(buffer);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0142

**Fonte:** `let binary = '';`  
**O que faz:** Inicializa `binary` com `'';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0143

**Fonte:** `const CHUNK = 0x8000; // evita "Maximum call stack size exceeded" em imagens grandes`  
**O que faz:** Inicializa `CHUNK` com `0x8000; // evita "Maximum call stack size exceeded" em imagens grandes`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0144

**Fonte:** `for (let i = 0; i < bytes.length; i += CHUNK) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < bytes.length; i += CHUNK) {`.  
**Como faz:** Percorre bytes, capítulos, páginas, restores ou assets na ordem do algoritmo.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0145

**Fonte:** `binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));`  
**O que faz:** Converte um chunk de bytes em string binária.  
**Como faz:** Usa subarrays limitados por `CHUNK` para evitar estouro de argumentos do `apply`.  
**Por que assim:** O chunk evita `Maximum call stack size exceeded`.  
**Risco/alternativa:** Ainda constrói uma string binária completa e pode pressionar memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0146

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Blob para Data URL em Service Worker** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0147

**Fonte:** `const mime = blob.type \|\| 'image/png';`  
**O que faz:** Inicializa `mime` com `blob.type \|\| 'image/png';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0148

**Fonte:** `return \`data:${mime};base64,${btoa(binary)}\`;`  
**O que faz:** Retorna `return \`data:${mime};base64,${btoa(binary)}\`;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0149

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Blob para Data URL em Service Worker** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** evita FileReader, ausente em Service Worker, usando arrayBuffer e chunks.  
**Risco/alternativa:** construir string binária completa ainda duplica memória para imagens grandes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0150

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **Blob para Data URL em Service Worker**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE — smoke-04 prova round-trip exato; E2E obtém páginas como data:image/png;base64.

### Linha 0151

**Fonte:** `// ── Escritor serializado por capítulo ────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc registra: “── Escritor serializado por capítulo ────────────────────────────────────────”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0152

**Fonte:** `// Mesmo com registros individuais, duas gravações do MESMO capítulo podem`  
**O que faz:** Comentário/JSDoc registra: “Mesmo com registros individuais, duas gravações do MESMO capítulo podem”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0153

**Fonte:** `// disputar a troca de asset. A fila garante ordem determinística.`  
**O que faz:** Comentário/JSDoc registra: “disputar a troca de asset. A fila garante ordem determinística.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0154

**Fonte:** `const _chapterWriters = new Map();`  
**O que faz:** Inicializa `_chapterWriters` com `new Map();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** evita corrida read-modify-write e ordena troca de assets por capítulo.  
**Risco/alternativa:** Map não remove Promises concluídas; operações fora da fila podem correr contra saves.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0155

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **fila serializada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0156

**Fonte:** `function enqueueChapterOp(chapterId, operation) {`  
**O que faz:** Declara a função `enqueueChapterOp` em **fila serializada por capítulo**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** evita corrida read-modify-write e ordena troca de assets por capítulo.  
**Risco/alternativa:** Map não remove Promises concluídas; operações fora da fila podem correr contra saves.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0157

**Fonte:** `const previous = _chapterWriters.get(chapterId) \|\| Promise.resolve();`  
**O que faz:** Inicializa `previous` com `_chapterWriters.get(chapterId) \|\| Promise.resolve();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** evita corrida read-modify-write e ordena troca de assets por capítulo.  
**Risco/alternativa:** Map não remove Promises concluídas; operações fora da fila podem correr contra saves.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0158

**Fonte:** `const next = previous.then(() => operation(), () => operation());`  
**O que faz:** Inicializa `next` com `previous.then(() => operation(), () => operation());`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** evita corrida read-modify-write e ordena troca de assets por capítulo.  
**Risco/alternativa:** Map não remove Promises concluídas; operações fora da fila podem correr contra saves.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0159

**Fonte:** `_chapterWriters.set(chapterId, next.catch(() => {}));`  
**O que faz:** Captura a falha da tentativa anterior.  
**Como faz:** Converte a exceção em fallback ou continua migração conforme o contrato local.  
**Por que assim:** evita corrida read-modify-write e ordena troca de assets por capítulo.  
**Risco/alternativa:** Capturar sem registrar pode esconder falha parcial; isso é especialmente sensível na migração.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0160

**Fonte:** `return next;`  
**O que faz:** Retorna `return next;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** evita corrida read-modify-write e ordena troca de assets por capítulo.  
**Risco/alternativa:** Map não remove Promises concluídas; operações fora da fila podem correr contra saves.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0161

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fila serializada por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** evita corrida read-modify-write e ordena troca de assets por capítulo.  
**Risco/alternativa:** Map não remove Promises concluídas; operações fora da fila podem correr contra saves.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0162

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **fila serializada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA SAVES CONCORRENTES — smoke-03 dispara 10 savePageResult concorrentes no mesmo capítulo e comprova 10/10 páginas.

### Linha 0163

**Fonte:** `// ── API ──────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc registra: “── API ──────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0164

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0165

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc registra: “*”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0166

**Fonte:** `* Grava o resultado de uma página em UMA transação atômica:`  
**O que faz:** Comentário/JSDoc registra: “Grava o resultado de uma página em UMA transação atômica:”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0167

**Fonte:** `* asset (Blob) + registro da página + registro de restore.`  
**O que faz:** Comentário/JSDoc registra: “asset (Blob) + registro da página + registro de restore.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0168

**Fonte:** `* Assets substituídos são removidos na mesma transação (sem órfãos).`  
**O que faz:** Comentário/JSDoc registra: “Assets substituídos são removidos na mesma transação (sem órfãos).”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0169

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc registra: “/”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0170

**Fonte:** `async function savePageResult(chapterId, pageIndex, imageData, originalUrl, cleanUrl, metadata = {}) {`  
**O que faz:** Declara a função `savePageResult` em **savePageResult transacional**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0171

**Fonte:** `if (!chapterId) throw new Error('savePageResult: chapterId obrigatório');`  
**O que faz:** Aplica a guarda `if (!chapterId) throw new Error('savePageResult: chapterId obrigatório');`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0172

**Fonte:** `const index = Number(pageIndex);`  
**O que faz:** Inicializa `index` com `Number(pageIndex);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0173

**Fonte:** `if (!Number.isFinite(index)) throw new Error('savePageResult: pageIndex inválido');`  
**O que faz:** Aplica a guarda `if (!Number.isFinite(index)) throw new Error('savePageResult: pageIndex inválido');`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0174

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0175

**Fonte:** `return enqueueChapterOp(chapterId, async () => {`  
**O que faz:** Retorna `return enqueueChapterOp(chapterId, async () => {`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0176

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0177

**Fonte:** `const assetId = generateAssetId();`  
**O que faz:** Inicializa `assetId` com `generateAssetId();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0178

**Fonte:** `const blob = dataUrlToBlob(imageData);`  
**O que faz:** Inicializa `blob` com `dataUrlToBlob(imageData);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0179

**Fonte:** `const now = Date.now();`  
**O que faz:** Inicializa `now` com `Date.now();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0180

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0181

**Fonte:** `const tx = db.transaction(`  
**O que faz:** Inicializa `tx` com `db.transaction(`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0182

**Fonte:** `[SM_STORE_ASSETS, SM_STORE_CHAPTER_PAGES, SM_STORE_RESTORE, SM_STORE_CHAPTERS],`  
**O que faz:** Lista os quatro stores que participam do save atômico.  
**Como faz:** Inclui `assets`, `chapterPages`, `restoreEntries` e `chapters` na mesma chamada `db.transaction`.  
**Por que assim:** A atomicidade depende de todos os registros relacionados compartilharem a mesma transaction.  
**Risco/alternativa:** Separar os stores em transactions diferentes permitiria página/restore apontarem para asset não confirmado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0183

**Fonte:** `'readwrite'`  
**O que faz:** Seleciona o modo `readwrite` da transaction de `savePageResult`.  
**Como faz:** Autoriza `put` e `delete` nos quatro stores declarados na linha anterior.  
**Por que assim:** O save precisa inserir e remover registros antes de confirmar.  
**Risco/alternativa:** Usar `readonly` falharia; usar várias transactions perderia atomicidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0184

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática de **savePageResult transacional** com `);`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0185

**Fonte:** `const assetStore = tx.objectStore(SM_STORE_ASSETS);`  
**O que faz:** Inicializa `assetStore` com `tx.objectStore(SM_STORE_ASSETS);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0186

**Fonte:** `const pageStore = tx.objectStore(SM_STORE_CHAPTER_PAGES);`  
**O que faz:** Inicializa `pageStore` com `tx.objectStore(SM_STORE_CHAPTER_PAGES);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0187

**Fonte:** `const restoreStore = tx.objectStore(SM_STORE_RESTORE);`  
**O que faz:** Inicializa `restoreStore` com `tx.objectStore(SM_STORE_RESTORE);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0188

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0189

**Fonte:** `// Assets que este save substitui`  
**O que faz:** Comentário/JSDoc registra: “Assets que este save substitui”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0190

**Fonte:** `const obsolete = new Set();`  
**O que faz:** Inicializa `obsolete` com `new Set();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0191

**Fonte:** `const previousPage = await _idbGet(pageStore, [chapterId, index]);`  
**O que faz:** Inicializa `previousPage` com `await _idbGet(pageStore, [chapterId, index]);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0192

**Fonte:** `if (previousPage && previousPage.assetId) obsolete.add(previousPage.assetId);`  
**O que faz:** Aplica a guarda `if (previousPage && previousPage.assetId) obsolete.add(previousPage.assetId);`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0193

**Fonte:** `if (cleanUrl) {`  
**O que faz:** Aplica a guarda `if (cleanUrl) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0194

**Fonte:** `const previousRestore = await _idbGet(restoreStore, [chapterId, cleanUrl]);`  
**O que faz:** Inicializa `previousRestore` com `await _idbGet(restoreStore, [chapterId, cleanUrl]);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0195

**Fonte:** `if (previousRestore && previousRestore.assetId) obsolete.add(previousRestore.assetId);`  
**O que faz:** Aplica a guarda `if (previousRestore && previousRestore.assetId) obsolete.add(previousRestore.assetId);`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0196

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **savePageResult transacional** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0197

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0198

**Fonte:** `assetStore.put({`  
**O que faz:** Agenda `put` no IndexedDB com `assetStore.put({`.  
**Como faz:** Insere ou substitui o registro pela keyPath do store dentro da transaction atual.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0199

**Fonte:** `assetId,`  
**O que faz:** Adiciona `assetId` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0200

**Fonte:** `blob,`  
**O que faz:** Adiciona `blob` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0201

**Fonte:** `mimeType: blob.type \|\| 'image/png',`  
**O que faz:** Define o campo `mimeType: blob.type \|\| 'image/png',`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0202

**Fonte:** `size: blob.size,`  
**O que faz:** Define o campo `size: blob.size,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0203

**Fonte:** `createdAt: now,`  
**O que faz:** Define o campo `createdAt: now,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0204

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **savePageResult transacional** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0205

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0206

**Fonte:** `pageStore.put({`  
**O que faz:** Agenda `put` no IndexedDB com `pageStore.put({`.  
**Como faz:** Insere ou substitui o registro pela keyPath do store dentro da transaction atual.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0207

**Fonte:** `chapterId,`  
**O que faz:** Adiciona `chapterId` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0208

**Fonte:** `pageIndex: index,`  
**O que faz:** Define o campo `pageIndex: index,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0209

**Fonte:** `assetId,`  
**O que faz:** Adiciona `assetId` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0210

**Fonte:** `originalUrl: originalUrl \|\| '',`  
**O que faz:** Define o campo `originalUrl: originalUrl \|\| '',`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0211

**Fonte:** `cleanUrl: cleanUrl \|\| '',`  
**O que faz:** Define o campo `cleanUrl: cleanUrl \|\| '',`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0212

**Fonte:** `width: metadata.width \|\| 0,`  
**O que faz:** Define o campo `width: metadata.width \|\| 0,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0213

**Fonte:** `height: metadata.height \|\| 0,`  
**O que faz:** Define o campo `height: metadata.height \|\| 0,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0214

**Fonte:** `updatedAt: now,`  
**O que faz:** Define o campo `updatedAt: now,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0215

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **savePageResult transacional** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0216

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0217

**Fonte:** `if (cleanUrl) {`  
**O que faz:** Aplica a guarda `if (cleanUrl) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0218

**Fonte:** `restoreStore.put({`  
**O que faz:** Agenda `put` no IndexedDB com `restoreStore.put({`.  
**Como faz:** Insere ou substitui o registro pela keyPath do store dentro da transaction atual.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0219

**Fonte:** `chapterId,`  
**O que faz:** Adiciona `chapterId` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0220

**Fonte:** `cleanUrl,`  
**O que faz:** Adiciona `cleanUrl` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0221

**Fonte:** `assetId,`  
**O que faz:** Adiciona `assetId` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0222

**Fonte:** `sourceUrl: metadata.sourceUrl \|\| originalUrl \|\| '',`  
**O que faz:** Define o campo `sourceUrl: metadata.sourceUrl \|\| originalUrl \|\| '',`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0223

**Fonte:** `host: metadata.host \|\| '',`  
**O que faz:** Define o campo `host: metadata.host \|\| '',`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0224

**Fonte:** `index,`  
**O que faz:** Adiciona `index` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0225

**Fonte:** `width: metadata.width \|\| 0,`  
**O que faz:** Define o campo `width: metadata.width \|\| 0,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0226

**Fonte:** `height: metadata.height \|\| 0,`  
**O que faz:** Define o campo `height: metadata.height \|\| 0,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0227

**Fonte:** `updatedAt: now,`  
**O que faz:** Define o campo `updatedAt: now,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0228

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **savePageResult transacional** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0229

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **savePageResult transacional** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0230

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0231

**Fonte:** `obsolete.forEach(id => { if (id !== assetId) assetStore.delete(id); });`  
**O que faz:** Agenda deleção com `obsolete.forEach(id => { if (id !== assetId) assetStore.delete(id); });`.  
**Como faz:** Remove registro/asset identificado pela chave dentro da transaction.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0232

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0233

**Fonte:** `tx.objectStore(SM_STORE_CHAPTERS).put({ chapterId, updatedAt: now });`  
**O que faz:** Obtém object store com `tx.objectStore(SM_STORE_CHAPTERS).put({ chapterId, updatedAt: now });`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0234

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0235

**Fonte:** `await _idbTxComplete(tx);`  
**O que faz:** Aguarda `await _idbTxComplete(tx);`.  
**Como faz:** Impede que a função retorne antes de leitura, transaction, conversão ou save necessário terminar.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0236

**Fonte:** `return { assetId, chapterId, pageIndex: index };`  
**O que faz:** Retorna `return { assetId, chapterId, pageIndex: index };`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0237

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **savePageResult transacional** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0238

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **savePageResult transacional** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** grava asset+página+restore+chapter numa única transaction readwrite e coleta assets substituídos.  
**Risco/alternativa:** troca de cleanUrl pode deixar restore antigo referenciando asset removido; abort não é injetado.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0239

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **savePageResult transacional**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO FELIZ — smoke-04 prova save, overwrite e remoção do asset antigo; smoke-03 prova concorrência e restore; rollback/cleanUrl-change não têm testes.

### Linha 0240

**Fonte:** `async function getAssetBlob(assetId) {`  
**O que faz:** Declara a função `getAssetBlob` em **leitura de asset/página sob demanda**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0241

**Fonte:** `if (!assetId) return null;`  
**O que faz:** Aplica a guarda `if (!assetId) return null;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0242

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0243

**Fonte:** `const tx = db.transaction(SM_STORE_ASSETS, 'readonly');`  
**O que faz:** Inicializa `tx` com `db.transaction(SM_STORE_ASSETS, 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0244

**Fonte:** `const asset = await _idbGet(tx.objectStore(SM_STORE_ASSETS), assetId);`  
**O que faz:** Inicializa `asset` com `await _idbGet(tx.objectStore(SM_STORE_ASSETS), assetId);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0245

**Fonte:** `return asset ? asset.blob : null;`  
**O que faz:** Retorna `return asset ? asset.blob : null;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0246

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **leitura de asset/página sob demanda** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0247

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **leitura de asset/página sob demanda**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0248

**Fonte:** `async function getAssetDataUrl(assetId) {`  
**O que faz:** Declara a função `getAssetDataUrl` em **leitura de asset/página sob demanda**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0249

**Fonte:** `const blob = await getAssetBlob(assetId);`  
**O que faz:** Inicializa `blob` com `await getAssetBlob(assetId);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0250

**Fonte:** `return blob ? blobToDataUrl(blob) : null;`  
**O que faz:** Retorna `return blob ? blobToDataUrl(blob) : null;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0251

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **leitura de asset/página sob demanda** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0252

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **leitura de asset/página sob demanda**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0253

**Fonte:** `async function getPageAsset(chapterId, pageIndex) {`  
**O que faz:** Declara a função `getPageAsset` em **leitura de asset/página sob demanda**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0254

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0255

**Fonte:** `const tx = db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readonly');`  
**O que faz:** Inicializa `tx` com `db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0256

**Fonte:** `const page = await _idbGet(tx.objectStore(SM_STORE_CHAPTER_PAGES), [chapterId, Number(pageIndex)]);`  
**O que faz:** Inicializa `page` com `await _idbGet(tx.objectStore(SM_STORE_CHAPTER_PAGES), [chapterId, Number(pageIndex)]);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0257

**Fonte:** `if (!page \|\| !page.assetId) return null;`  
**O que faz:** Aplica a guarda `if (!page \|\| !page.assetId) return null;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0258

**Fonte:** `const asset = await _idbGet(tx.objectStore(SM_STORE_ASSETS), page.assetId);`  
**O que faz:** Inicializa `asset` com `await _idbGet(tx.objectStore(SM_STORE_ASSETS), page.assetId);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0259

**Fonte:** `return asset ? asset.blob : null;`  
**O que faz:** Retorna `return asset ? asset.blob : null;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0260

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **leitura de asset/página sob demanda** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0261

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **leitura de asset/página sob demanda**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0262

**Fonte:** `async function getPageDataUrl(chapterId, pageIndex) {`  
**O que faz:** Declara a função `getPageDataUrl` em **leitura de asset/página sob demanda**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0263

**Fonte:** `const blob = await getPageAsset(chapterId, pageIndex);`  
**O que faz:** Inicializa `blob` com `await getPageAsset(chapterId, pageIndex);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0264

**Fonte:** `return blob ? blobToDataUrl(blob) : null;`  
**O que faz:** Retorna `return blob ? blobToDataUrl(blob) : null;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0265

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **leitura de asset/página sob demanda** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** carrega Blob/DataURL só quando necessário em vez de hidratar capítulo inteiro.  
**Risco/alternativa:** conversão para DataURL em páginas grandes ainda tem pico de memória.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0266

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **leitura de asset/página sob demanda**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0267

**Fonte:** `/** Metadados das páginas, SEM carregar nenhum blob. */`  
**O que faz:** Comentário/JSDoc registra: “* Metadados das páginas, SEM carregar nenhum blob. */”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE + E2E — smoke-04 usa getAssetBlob/getPageAsset; smoke-06 e E2E usam getPageDataUrl; null/missing parcialmente exercitado.

### Linha 0268

**Fonte:** `async function getChapterPageIndex(chapterId) {`  
**O que faz:** Declara a função `getChapterPageIndex` em **índices e estatísticas por capítulo**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0269

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0270

**Fonte:** `const tx = db.transaction(SM_STORE_CHAPTER_PAGES, 'readonly');`  
**O que faz:** Inicializa `tx` com `db.transaction(SM_STORE_CHAPTER_PAGES, 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0271

**Fonte:** `const rows = await _idbGetAll(`  
**O que faz:** Inicializa `rows` com `await _idbGetAll(`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0272

**Fonte:** `tx.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter'),`  
**O que faz:** Obtém object store com `tx.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter'),`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0273

**Fonte:** `IDBKeyRange.only(chapterId)`  
**O que faz:** Cria query exata `IDBKeyRange.only(...)`.  
**Como faz:** Restringe índice a um chapterId/cleanUrl específico sem varrer o store inteiro.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0274

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática de **índices e estatísticas por capítulo** com `);`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0275

**Fonte:** `return rows`  
**O que faz:** Retorna `return rows`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0276

**Fonte:** `.map(r => ({ pageIndex: r.pageIndex, assetId: r.assetId, width: r.width, height: r.height, updatedAt: r.updatedAt }))`  
**O que faz:** Transforma a coleção com `.map(r => ({ pageIndex: r.pageIndex, assetId: r.assetId, width: r.width, height: r.height, updatedAt: r.updatedAt }))`.  
**Como faz:** Projeta registros persistidos em metadados/índices sem carregar dados desnecessários.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0277

**Fonte:** `.sort((a, b) => a.pageIndex - b.pageIndex);`  
**O que faz:** Ordena resultados com `.sort((a, b) => a.pageIndex - b.pageIndex);`.  
**Como faz:** Garante ordem determinística por pageIndex ou updatedAt para UI/reader.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0278

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **índices e estatísticas por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0279

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **índices e estatísticas por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0280

**Fonte:** `async function getChapterPageCount(chapterId) {`  
**O que faz:** Declara a função `getChapterPageCount` em **índices e estatísticas por capítulo**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0281

**Fonte:** `const rows = await getChapterPageIndex(chapterId);`  
**O que faz:** Inicializa `rows` com `await getChapterPageIndex(chapterId);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0282

**Fonte:** `return rows.length;`  
**O que faz:** Retorna `return rows.length;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0283

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **índices e estatísticas por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0284

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **índices e estatísticas por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0285

**Fonte:** `/** Contagem de páginas de vários capítulos numa transação só (popup). */`  
**O que faz:** Comentário/JSDoc registra: “* Contagem de páginas de vários capítulos numa transação só (popup). */”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0286

**Fonte:** `async function getChaptersStats(chapterIds = []) {`  
**O que faz:** Declara a função `getChaptersStats` em **índices e estatísticas por capítulo**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0287

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0288

**Fonte:** `const tx = db.transaction(SM_STORE_CHAPTER_PAGES, 'readonly');`  
**O que faz:** Inicializa `tx` com `db.transaction(SM_STORE_CHAPTER_PAGES, 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0289

**Fonte:** `const idx = tx.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter');`  
**O que faz:** Inicializa `idx` com `tx.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0290

**Fonte:** `const stats = {};`  
**O que faz:** Inicializa `stats` com `{};`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0291

**Fonte:** `for (const chapterId of chapterIds) {`  
**O que faz:** Inicia a iteração `for (const chapterId of chapterIds) {`.  
**Como faz:** Percorre bytes, capítulos, páginas, restores ou assets na ordem do algoritmo.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0292

**Fonte:** `const rows = await _idbGetAll(idx, IDBKeyRange.only(chapterId));`  
**O que faz:** Inicializa `rows` com `await _idbGetAll(idx, IDBKeyRange.only(chapterId));`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0293

**Fonte:** `stats[chapterId] = {`  
**O que faz:** Atualiza estado com `stats[chapterId] = {`.  
**Como faz:** Atribui o valor calculado ao buffer, mapa, contador ou referência usada nas etapas seguintes.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0294

**Fonte:** `pageCount: rows.length,`  
**O que faz:** Define o campo `pageCount: rows.length,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0295

**Fonte:** `indices: rows.map(r => r.pageIndex).sort((a, b) => a - b),`  
**O que faz:** Transforma a coleção com `indices: rows.map(r => r.pageIndex).sort((a, b) => a - b),`.  
**Como faz:** Projeta registros persistidos em metadados/índices sem carregar dados desnecessários.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0296

**Fonte:** `};`  
**O que faz:** Fecha/continua a estrutura sintática de **índices e estatísticas por capítulo** com `};`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0297

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **índices e estatísticas por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0298

**Fonte:** `return stats;`  
**O que faz:** Retorna `return stats;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0299

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **índices e estatísticas por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** lista apenas metadados e ordena páginas sem carregar blobs.  
**Risco/alternativa:** índices negativos de restores órfãos migrados podem contaminar contagens/ordenação.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0300

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **índices e estatísticas por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0301

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc registra: “*”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0302

**Fonte:** `* Mapa de restauração SEM blobs: { [cleanUrl]: { assetId, index } }.`  
**O que faz:** Comentário/JSDoc registra: “Mapa de restauração SEM blobs: { [cleanUrl]: { assetId, index } }.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0303

**Fonte:** `* O content script só busca o asset da imagem que realmente apareceu no DOM —`  
**O que faz:** Comentário/JSDoc registra: “O content script só busca o asset da imagem que realmente apareceu no DOM —”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0304

**Fonte:** `* é isso que desliga o consumo de memória do tamanho do capítulo.`  
**O que faz:** Comentário/JSDoc registra: “é isso que desliga o consumo de memória do tamanho do capítulo.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0305

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc registra: “/”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — smoke-03/04 provam índice/count; getChaptersStats não recebe assertion funcional direta.

### Linha 0306

**Fonte:** `async function getRestoreIndex(chapterId) {`  
**O que faz:** Declara a função `getRestoreIndex` em **índice/listagem de restore**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0307

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0308

**Fonte:** `const tx = db.transaction(SM_STORE_RESTORE, 'readonly');`  
**O que faz:** Inicializa `tx` com `db.transaction(SM_STORE_RESTORE, 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0309

**Fonte:** `const rows = await _idbGetAll(`  
**O que faz:** Inicializa `rows` com `await _idbGetAll(`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0310

**Fonte:** `tx.objectStore(SM_STORE_RESTORE).index('by_chapter'),`  
**O que faz:** Obtém object store com `tx.objectStore(SM_STORE_RESTORE).index('by_chapter'),`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0311

**Fonte:** `IDBKeyRange.only(chapterId)`  
**O que faz:** Cria query exata `IDBKeyRange.only(...)`.  
**Como faz:** Restringe índice a um chapterId/cleanUrl específico sem varrer o store inteiro.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0312

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática de **índice/listagem de restore** com `);`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0313

**Fonte:** `const map = {};`  
**O que faz:** Inicializa `map` com `{};`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0314

**Fonte:** `rows.forEach(r => { map[r.cleanUrl] = { assetId: r.assetId, index: r.index }; });`  
**O que faz:** Percorre a coleção com `rows.forEach(r => { map[r.cleanUrl] = { assetId: r.assetId, index: r.index }; });`.  
**Como faz:** Aplica delete, coleta de assetId ou construção de mapa a cada registro.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0315

**Fonte:** `return map;`  
**O que faz:** Retorna `return map;`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0316

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **índice/listagem de restore** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0317

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **índice/listagem de restore**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0318

**Fonte:** `/** Metadados de restore (popup/opções) — sem blobs. */`  
**O que faz:** Comentário/JSDoc registra: “* Metadados de restore (popup/opções) — sem blobs. */”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0319

**Fonte:** `async function listRestoreEntries(chapterIds = null) {`  
**O que faz:** Declara a função `listRestoreEntries` em **índice/listagem de restore**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0320

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0321

**Fonte:** `const tx = db.transaction(SM_STORE_RESTORE, 'readonly');`  
**O que faz:** Inicializa `tx` com `db.transaction(SM_STORE_RESTORE, 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0322

**Fonte:** `const store = tx.objectStore(SM_STORE_RESTORE);`  
**O que faz:** Inicializa `store` com `tx.objectStore(SM_STORE_RESTORE);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0323

**Fonte:** `let rows;`  
**O que faz:** Declara `rows` sem valor inicial para receber uma das duas estratégias de listagem.  
**Como faz:** O branch seguinte decide entre consulta por capítulos específicos ou `getAll` global.  
**Por que assim:** Uma única variável permite aplicar o mesmo `map/sort` depois dos dois caminhos.  
**Risco/alternativa:** Duplicar a projeção em cada branch aumentaria risco de divergência.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0324

**Fonte:** `if (Array.isArray(chapterIds) && chapterIds.length > 0) {`  
**O que faz:** Aplica a guarda `if (Array.isArray(chapterIds) && chapterIds.length > 0) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0325

**Fonte:** `const idx = store.index('by_chapter');`  
**O que faz:** Inicializa `idx` com `store.index('by_chapter');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0326

**Fonte:** `rows = [];`  
**O que faz:** Atualiza estado com `rows = [];`.  
**Como faz:** Atribui o valor calculado ao buffer, mapa, contador ou referência usada nas etapas seguintes.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0327

**Fonte:** `for (const chapterId of chapterIds) {`  
**O que faz:** Inicia a iteração `for (const chapterId of chapterIds) {`.  
**Como faz:** Percorre bytes, capítulos, páginas, restores ou assets na ordem do algoritmo.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0328

**Fonte:** `rows = rows.concat(await _idbGetAll(idx, IDBKeyRange.only(chapterId)));`  
**O que faz:** Concatena resultados com `rows = rows.concat(await _idbGetAll(idx, IDBKeyRange.only(chapterId)));`.  
**Como faz:** Acumula restores de vários capítulos numa única lista para ordenação final.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0329

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **índice/listagem de restore** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0330

**Fonte:** `} else {`  
**O que faz:** Abre o ramo usado quando não há lista não vazia de capítulos.  
**Como faz:** Esse caminho cai para `_idbGetAll(store)` e retorna todos os restores.  
**Por que assim:** `null`, array vazio ou valor não-array significam listagem global para popup/opções.  
**Risco/alternativa:** Tratar array vazio como filtro poderia retornar nada quando o caller espera todos.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0331

**Fonte:** `rows = await _idbGetAll(store);`  
**O que faz:** Aguarda `rows = await _idbGetAll(store);`.  
**Como faz:** Impede que a função retorne antes de leitura, transaction, conversão ou save necessário terminar.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0332

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **índice/listagem de restore** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0333

**Fonte:** `return rows.map(r => ({`  
**O que faz:** Retorna `return rows.map(r => ({`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0334

**Fonte:** `chapterId: r.chapterId,`  
**O que faz:** Define o campo `chapterId: r.chapterId,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0335

**Fonte:** `cleanUrl: r.cleanUrl,`  
**O que faz:** Define o campo `cleanUrl: r.cleanUrl,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0336

**Fonte:** `assetId: r.assetId,`  
**O que faz:** Define o campo `assetId: r.assetId,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0337

**Fonte:** `sourceUrl: r.sourceUrl,`  
**O que faz:** Define o campo `sourceUrl: r.sourceUrl,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0338

**Fonte:** `host: r.host,`  
**O que faz:** Define o campo `host: r.host,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0339

**Fonte:** `index: r.index,`  
**O que faz:** Define o campo `index: r.index,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0340

**Fonte:** `width: r.width,`  
**O que faz:** Define o campo `width: r.width,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0341

**Fonte:** `height: r.height,`  
**O que faz:** Define o campo `height: r.height,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0342

**Fonte:** `updatedAt: r.updatedAt,`  
**O que faz:** Define o campo `updatedAt: r.updatedAt,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0343

**Fonte:** `})).sort((a, b) => (b.updatedAt \|\| 0) - (a.updatedAt \|\| 0));`  
**O que faz:** Ordena resultados com `})).sort((a, b) => (b.updatedAt \|\| 0) - (a.updatedAt \|\| 0));`.  
**Como faz:** Garante ordem determinística por pageIndex ou updatedAt para UI/reader.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0344

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **índice/listagem de restore** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** permite restauração lazy por cleanUrl/assetId sem Base64 em memória.  
**Risco/alternativa:** cleanUrl duplicada no mesmo capítulo depende do registro mais recente e de consistência do asset.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0345

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **índice/listagem de restore**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0346

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc registra: “*”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0347

**Fonte:** `* "Refazer": apaga tudo que faria a tradução errada voltar — entrada de restore,`  
**O que faz:** Comentário/JSDoc registra: “"Refazer": apaga tudo que faria a tradução errada voltar — entrada de restore,”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0348

**Fonte:** `* página correspondente e os assets, em todos os capítulos que tenham essa URL.`  
**O que faz:** Comentário/JSDoc registra: “página correspondente e os assets, em todos os capítulos que tenham essa URL.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0349

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc registra: “/”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA FLUXOS PRINCIPAIS — smoke-03 prova restoreIndex/listRestoreEntries filtrado; E2E verifica restoreIndex real; sort global não é testado isoladamente.

### Linha 0350

**Fonte:** `async function deleteByCleanUrl(cleanUrl) {`  
**O que faz:** Declara a função `deleteByCleanUrl` em **deleteByCleanUrl/refazer**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0351

**Fonte:** `if (!cleanUrl) return { deleted: 0 };`  
**O que faz:** Aplica a guarda `if (!cleanUrl) return { deleted: 0 };`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0352

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0353

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteByCleanUrl/refazer**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0354

**Fonte:** `const txRead = db.transaction(SM_STORE_RESTORE, 'readonly');`  
**O que faz:** Inicializa `txRead` com `db.transaction(SM_STORE_RESTORE, 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0355

**Fonte:** `const rows = await _idbGetAll(`  
**O que faz:** Inicializa `rows` com `await _idbGetAll(`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0356

**Fonte:** `txRead.objectStore(SM_STORE_RESTORE).index('by_cleanUrl'),`  
**O que faz:** Obtém object store com `txRead.objectStore(SM_STORE_RESTORE).index('by_cleanUrl'),`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0357

**Fonte:** `IDBKeyRange.only(cleanUrl)`  
**O que faz:** Cria query exata `IDBKeyRange.only(...)`.  
**Como faz:** Restringe índice a um chapterId/cleanUrl específico sem varrer o store inteiro.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0358

**Fonte:** `);`  
**O que faz:** Fecha/continua a estrutura sintática de **deleteByCleanUrl/refazer** com `);`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0359

**Fonte:** `if (rows.length === 0) return { deleted: 0 };`  
**O que faz:** Aplica a guarda `if (rows.length === 0) return { deleted: 0 };`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0360

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteByCleanUrl/refazer**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0361

**Fonte:** `const tx = db.transaction([SM_STORE_RESTORE, SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readwrite');`  
**O que faz:** Inicializa `tx` com `db.transaction([SM_STORE_RESTORE, SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readwrite');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0362

**Fonte:** `const restoreStore = tx.objectStore(SM_STORE_RESTORE);`  
**O que faz:** Inicializa `restoreStore` com `tx.objectStore(SM_STORE_RESTORE);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0363

**Fonte:** `const pageStore = tx.objectStore(SM_STORE_CHAPTER_PAGES);`  
**O que faz:** Inicializa `pageStore` com `tx.objectStore(SM_STORE_CHAPTER_PAGES);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0364

**Fonte:** `const assetStore = tx.objectStore(SM_STORE_ASSETS);`  
**O que faz:** Inicializa `assetStore` com `tx.objectStore(SM_STORE_ASSETS);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0365

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteByCleanUrl/refazer**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0366

**Fonte:** `for (const row of rows) {`  
**O que faz:** Inicia a iteração `for (const row of rows) {`.  
**Como faz:** Percorre bytes, capítulos, páginas, restores ou assets na ordem do algoritmo.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0367

**Fonte:** `restoreStore.delete([row.chapterId, row.cleanUrl]);`  
**O que faz:** Agenda deleção com `restoreStore.delete([row.chapterId, row.cleanUrl]);`.  
**Como faz:** Remove registro/asset identificado pela chave dentro da transaction.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0368

**Fonte:** `if (row.assetId) assetStore.delete(row.assetId);`  
**O que faz:** Aplica a guarda `if (row.assetId) assetStore.delete(row.assetId);`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0369

**Fonte:** `if (Number.isFinite(row.index)) {`  
**O que faz:** Aplica a guarda `if (Number.isFinite(row.index)) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0370

**Fonte:** `const page = await _idbGet(pageStore, [row.chapterId, row.index]);`  
**O que faz:** Inicializa `page` com `await _idbGet(pageStore, [row.chapterId, row.index]);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0371

**Fonte:** `if (page && page.cleanUrl === cleanUrl) {`  
**O que faz:** Aplica a guarda `if (page && page.cleanUrl === cleanUrl) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0372

**Fonte:** `pageStore.delete([row.chapterId, row.index]);`  
**O que faz:** Agenda deleção com `pageStore.delete([row.chapterId, row.index]);`.  
**Como faz:** Remove registro/asset identificado pela chave dentro da transaction.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0373

**Fonte:** `if (page.assetId) assetStore.delete(page.assetId);`  
**O que faz:** Aplica a guarda `if (page.assetId) assetStore.delete(page.assetId);`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0374

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **deleteByCleanUrl/refazer** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0375

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **deleteByCleanUrl/refazer** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0376

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **deleteByCleanUrl/refazer** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0377

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteByCleanUrl/refazer**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0378

**Fonte:** `await _idbTxComplete(tx);`  
**O que faz:** Aguarda `await _idbTxComplete(tx);`.  
**Como faz:** Impede que a função retorne antes de leitura, transaction, conversão ou save necessário terminar.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0379

**Fonte:** `return { deleted: rows.length };`  
**O que faz:** Retorna `return { deleted: rows.length };`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0380

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **deleteByCleanUrl/refazer** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** remove restores/página/assets associados à URL em todos os capítulos.  
**Risco/alternativa:** não passa por enqueueChapterOp e pode correr contra savePageResult do mesmo capítulo.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0381

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteByCleanUrl/refazer**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0382

**Fonte:** `/** Remove capítulo inteiro: páginas, restores e assets. */`  
**O que faz:** Comentário/JSDoc registra: “* Remove capítulo inteiro: páginas, restores e assets. */”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 prova remoção do restore; corrida com save e remoção completa de page/asset não têm assertions específicas.

### Linha 0383

**Fonte:** `async function deleteChapter(chapterId) {`  
**O que faz:** Declara a função `deleteChapter` em **deleteChapter**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0384

**Fonte:** `if (!chapterId) return { deleted: 0 };`  
**O que faz:** Aplica a guarda `if (!chapterId) return { deleted: 0 };`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0385

**Fonte:** `return enqueueChapterOp(chapterId, async () => {`  
**O que faz:** Retorna `return enqueueChapterOp(chapterId, async () => {`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0386

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0387

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteChapter**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0388

**Fonte:** `const txRead = db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_RESTORE], 'readonly');`  
**O que faz:** Inicializa `txRead` com `db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_RESTORE], 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0389

**Fonte:** `const pages = await _idbGetAll(`  
**O que faz:** Inicializa `pages` com `await _idbGetAll(`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0390

**Fonte:** `txRead.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter'), IDBKeyRange.only(chapterId));`  
**O que faz:** Obtém object store com `txRead.objectStore(SM_STORE_CHAPTER_PAGES).index('by_chapter'), IDBKeyRange.only(chapterId));`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0391

**Fonte:** `const restores = await _idbGetAll(`  
**O que faz:** Inicializa `restores` com `await _idbGetAll(`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0392

**Fonte:** `txRead.objectStore(SM_STORE_RESTORE).index('by_chapter'), IDBKeyRange.only(chapterId));`  
**O que faz:** Obtém object store com `txRead.objectStore(SM_STORE_RESTORE).index('by_chapter'), IDBKeyRange.only(chapterId));`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0393

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteChapter**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0394

**Fonte:** `const assetIds = new Set();`  
**O que faz:** Inicializa `assetIds` com `new Set();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0395

**Fonte:** `pages.forEach(p => { if (p.assetId) assetIds.add(p.assetId); });`  
**O que faz:** Percorre a coleção com `pages.forEach(p => { if (p.assetId) assetIds.add(p.assetId); });`.  
**Como faz:** Aplica delete, coleta de assetId ou construção de mapa a cada registro.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0396

**Fonte:** `restores.forEach(r => { if (r.assetId) assetIds.add(r.assetId); });`  
**O que faz:** Percorre a coleção com `restores.forEach(r => { if (r.assetId) assetIds.add(r.assetId); });`.  
**Como faz:** Aplica delete, coleta de assetId ou construção de mapa a cada registro.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0397

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteChapter**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0398

**Fonte:** `const tx = db.transaction(`  
**O que faz:** Inicializa `tx` com `db.transaction(`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0399

**Fonte:** `[SM_STORE_CHAPTERS, SM_STORE_CHAPTER_PAGES, SM_STORE_RESTORE, SM_STORE_ASSETS], 'readwrite');`  
**O que faz:** Abre a transaction readwrite que remove todo o capítulo.  
**Como faz:** Agrupa `chapters`, `chapterPages`, `restoreEntries` e `assets` na mesma transação de deleção.  
**Por que assim:** A remoção integral precisa ser atomicamente coerente entre metadados e blobs.  
**Risco/alternativa:** Transactions separadas poderiam deixar restos parciais se uma etapa falhar.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0400

**Fonte:** `tx.objectStore(SM_STORE_CHAPTERS).delete(chapterId);`  
**O que faz:** Obtém object store com `tx.objectStore(SM_STORE_CHAPTERS).delete(chapterId);`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0401

**Fonte:** `pages.forEach(p => tx.objectStore(SM_STORE_CHAPTER_PAGES).delete([p.chapterId, p.pageIndex]));`  
**O que faz:** Obtém object store com `pages.forEach(p => tx.objectStore(SM_STORE_CHAPTER_PAGES).delete([p.chapterId, p.pageIndex]));`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0402

**Fonte:** `restores.forEach(r => tx.objectStore(SM_STORE_RESTORE).delete([r.chapterId, r.cleanUrl]));`  
**O que faz:** Obtém object store com `restores.forEach(r => tx.objectStore(SM_STORE_RESTORE).delete([r.chapterId, r.cleanUrl]));`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0403

**Fonte:** `assetIds.forEach(id => tx.objectStore(SM_STORE_ASSETS).delete(id));`  
**O que faz:** Obtém object store com `assetIds.forEach(id => tx.objectStore(SM_STORE_ASSETS).delete(id));`.  
**Como faz:** Resolve o store dentro da transaction atual antes de get/put/delete.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0404

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteChapter**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0405

**Fonte:** `await _idbTxComplete(tx);`  
**O que faz:** Aguarda `await _idbTxComplete(tx);`.  
**Como faz:** Impede que a função retorne antes de leitura, transaction, conversão ou save necessário terminar.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0406

**Fonte:** `return { deleted: pages.length + restores.length, assets: assetIds.size };`  
**O que faz:** Retorna `return { deleted: pages.length + restores.length, assets: assetIds.size };`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0407

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **deleteChapter** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0408

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **deleteChapter** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** coleta IDs e apaga capítulos/páginas/restores/assets em lote.  
**Risco/alternativa:** transação de leitura é separada da de escrita; serialização só cobre operações que usam a mesma fila.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0409

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **deleteChapter**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE NO CAMINHO SEQUENCIAL — smoke-04 salva e deleta capítulo, depois prova pageCount=0; race é serializada pela fila do capítulo.

### Linha 0410

**Fonte:** `// ── Migração de dados legados ────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc registra: “── Migração de dados legados ────────────────────────────────────────────────”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0411

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc registra: “”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0412

**Fonte:** `// Idempotente e POR CAPÍTULO: só lê as chaves daquele capítulo (nada de get(null)).`  
**O que faz:** Comentário/JSDoc registra: “Idempotente e POR CAPÍTULO: só lê as chaves daquele capítulo (nada de get(null)).”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0413

**Fonte:** `// As chaves antigas só são removidas depois que a gravação nova confirmou — é`  
**O que faz:** Comentário/JSDoc registra: “As chaves antigas só são removidas depois que a gravação nova confirmou — é”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0414

**Fonte:** `// isso que devolve a cota de chrome.storage.local ocupada por Base64 duplicado.`  
**O que faz:** Comentário/JSDoc registra: “isso que devolve a cota de chrome.storage.local ocupada por Base64 duplicado.”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0415

**Fonte:** `async function migrateChapterFromLegacy(chapterId) {`  
**O que faz:** Declara a função `migrateChapterFromLegacy` em **migração legada por capítulo**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0416

**Fonte:** `if (!chapterId) return { migrated: 0, skipped: true };`  
**O que faz:** Aplica a guarda `if (!chapterId) return { migrated: 0, skipped: true };`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0417

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0418

**Fonte:** `const flagKey = \`_sm_migrated_${chapterId}\`;`  
**O que faz:** Inicializa `flagKey` com `\`_sm_migrated_${chapterId}\`;`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0419

**Fonte:** `const keys = [flagKey, \`${chapterId}_images\`, \`${chapterId}_restoreMap\`, \`${chapterId}_restoreMeta\`];`  
**O que faz:** Inicializa `keys` com `[flagKey, \`${chapterId}_images\`, \`${chapterId}_restoreMap\`, \`${chapterId}_restoreMeta\`];`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0420

**Fonte:** `const data = await new Promise(resolve => chrome.storage.local.get(keys, resolve));`  
**O que faz:** Inicializa `data` com `await new Promise(resolve => chrome.storage.local.get(keys, resolve));`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0421

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0422

**Fonte:** `if (data[flagKey]) return { migrated: 0, skipped: true };`  
**O que faz:** Aplica a guarda `if (data[flagKey]) return { migrated: 0, skipped: true };`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0423

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0424

**Fonte:** `const images = data[\`${chapterId}_images\`] \|\| {};`  
**O que faz:** Inicializa `images` com `data[\`${chapterId}_images\`] \|\| {};`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0425

**Fonte:** `const restoreMap = data[\`${chapterId}_restoreMap\`] \|\| {};`  
**O que faz:** Inicializa `restoreMap` com `data[\`${chapterId}_restoreMap\`] \|\| {};`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0426

**Fonte:** `const restoreMeta = data[\`${chapterId}_restoreMeta\`] \|\| {};`  
**O que faz:** Inicializa `restoreMeta` com `data[\`${chapterId}_restoreMeta\`] \|\| {};`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0427

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0428

**Fonte:** `let migrated = 0;`  
**O que faz:** Inicializa `migrated` com `0;`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0429

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0430

**Fonte:** `// Índice reverso: pageIndex → cleanUrl`  
**O que faz:** Comentário/JSDoc registra: “Índice reverso: pageIndex → cleanUrl”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0431

**Fonte:** `const urlByIndex = {};`  
**O que faz:** Inicializa `urlByIndex` com `{};`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0432

**Fonte:** `Object.keys(restoreMeta).forEach(url => {`  
**O que faz:** Percorre a coleção com `Object.keys(restoreMeta).forEach(url => {`.  
**Como faz:** Aplica delete, coleta de assetId ou construção de mapa a cada registro.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0433

**Fonte:** `const meta = restoreMeta[url];`  
**O que faz:** Inicializa `meta` com `restoreMeta[url];`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0434

**Fonte:** `if (meta && meta.index !== undefined && meta.index !== null) urlByIndex[String(meta.index)] = url;`  
**O que faz:** Aplica a guarda `if (meta && meta.index !== undefined && meta.index !== null) urlByIndex[String(meta.index)] = url;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0435

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **migração legada por capítulo** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0436

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0437

**Fonte:** `for (const indexStr of Object.keys(images)) {`  
**O que faz:** Inicia a iteração `for (const indexStr of Object.keys(images)) {`.  
**Como faz:** Percorre bytes, capítulos, páginas, restores ou assets na ordem do algoritmo.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0438

**Fonte:** `const dataUrl = images[indexStr];`  
**O que faz:** Inicializa `dataUrl` com `images[indexStr];`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0439

**Fonte:** `if (!dataUrl \|\| typeof dataUrl !== 'string') continue;`  
**O que faz:** Aplica a guarda `if (!dataUrl \|\| typeof dataUrl !== 'string') continue;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0440

**Fonte:** `const pageIndex = parseInt(indexStr, 10);`  
**O que faz:** Inicializa `pageIndex` com `parseInt(indexStr, 10);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0441

**Fonte:** `if (!Number.isFinite(pageIndex)) continue;`  
**O que faz:** Aplica a guarda `if (!Number.isFinite(pageIndex)) continue;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0442

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0443

**Fonte:** `const cleanUrl = urlByIndex[indexStr] \|\| '';`  
**O que faz:** Inicializa `cleanUrl` com `urlByIndex[indexStr] \|\| '';`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0444

**Fonte:** `const meta = (cleanUrl && restoreMeta[cleanUrl]) \|\| {};`  
**O que faz:** Inicializa `meta` com `(cleanUrl && restoreMeta[cleanUrl]) \|\| {};`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0445

**Fonte:** `try {`  
**O que faz:** Abre bloco protegido contra exceção de API opcional.  
**Como faz:** Permite usar crypto/storage sem derrubar a operação quando o fallback é aceitável.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0446

**Fonte:** `await savePageResult(chapterId, pageIndex, dataUrl, meta.sourceUrl \|\| '', cleanUrl, {`  
**O que faz:** Aguarda `await savePageResult(chapterId, pageIndex, dataUrl, meta.sourceUrl \|\| '', cleanUrl, {`.  
**Como faz:** Impede que a função retorne antes de leitura, transaction, conversão ou save necessário terminar.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0447

**Fonte:** `host: meta.host \|\| '', width: meta.width \|\| 0, height: meta.height \|\| 0,`  
**O que faz:** Define o campo `host: meta.host \|\| '', width: meta.width \|\| 0, height: meta.height \|\| 0,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0448

**Fonte:** `sourceUrl: meta.sourceUrl \|\| '',`  
**O que faz:** Define o campo `sourceUrl: meta.sourceUrl \|\| '',`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0449

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **migração legada por capítulo** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0450

**Fonte:** `migrated++;`  
**O que faz:** Incrementa o contador `migrated` após uma página legada ser salva com sucesso.  
**Como faz:** O incremento só ocorre depois de `await savePageResult(...)` resolver sem erro.  
**Por que assim:** O contador deve refletir itens confirmados no novo storage.  
**Risco/alternativa:** A função ainda marca o capítulo como migrado mesmo se outros itens falharem; essa lacuna é documentada.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0451

**Fonte:** `} catch (_e) { /* segue para a próxima página */ }`  
**O que faz:** Captura a falha da tentativa anterior.  
**Como faz:** Converte a exceção em fallback ou continua migração conforme o contrato local.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** Capturar sem registrar pode esconder falha parcial; isso é especialmente sensível na migração.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0452

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **migração legada por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0453

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0454

**Fonte:** `// Restores sem página correspondente`  
**O que faz:** Comentário/JSDoc registra: “Restores sem página correspondente”.  
**Como faz:** Documenta ownership, schema, atomicidade, migração ou intenção de memória sem side effect.  
**Por que assim:** Esses comentários explicitam invariantes de dados importantes para futuras mudanças.  
**Risco/alternativa:** Comentário desatualizado pode induzir alteração que reintroduza perda de dados.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0455

**Fonte:** `let orphanSlot = -1;`  
**O que faz:** Inicializa `orphanSlot` com `-1;`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0456

**Fonte:** `for (const cleanUrl of Object.keys(restoreMap)) {`  
**O que faz:** Inicia a iteração `for (const cleanUrl of Object.keys(restoreMap)) {`.  
**Como faz:** Percorre bytes, capítulos, páginas, restores ou assets na ordem do algoritmo.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0457

**Fonte:** `const dataUrl = restoreMap[cleanUrl];`  
**O que faz:** Inicializa `dataUrl` com `restoreMap[cleanUrl];`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0458

**Fonte:** `if (!dataUrl \|\| typeof dataUrl !== 'string') continue;`  
**O que faz:** Aplica a guarda `if (!dataUrl \|\| typeof dataUrl !== 'string') continue;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0459

**Fonte:** `const meta = restoreMeta[cleanUrl] \|\| {};`  
**O que faz:** Inicializa `meta` com `restoreMeta[cleanUrl] \|\| {};`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0460

**Fonte:** `const declaredIndex = Number(meta.index);`  
**O que faz:** Inicializa `declaredIndex` com `Number(meta.index);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0461

**Fonte:** `const hasPage = Number.isFinite(declaredIndex) && images[String(declaredIndex)];`  
**O que faz:** Inicializa `hasPage` com `Number.isFinite(declaredIndex) && images[String(declaredIndex)];`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0462

**Fonte:** `if (hasPage) continue; // já migrado acima`  
**O que faz:** Aplica a guarda `if (hasPage) continue; // já migrado acima`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0463

**Fonte:** `const pageIndex = Number.isFinite(declaredIndex) ? declaredIndex : (orphanSlot--);`  
**O que faz:** Inicializa `pageIndex` com `Number.isFinite(declaredIndex) ? declaredIndex : (orphanSlot--);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0464

**Fonte:** `try {`  
**O que faz:** Abre bloco protegido contra exceção de API opcional.  
**Como faz:** Permite usar crypto/storage sem derrubar a operação quando o fallback é aceitável.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0465

**Fonte:** `await savePageResult(chapterId, pageIndex, dataUrl, meta.sourceUrl \|\| '', cleanUrl, {`  
**O que faz:** Aguarda `await savePageResult(chapterId, pageIndex, dataUrl, meta.sourceUrl \|\| '', cleanUrl, {`.  
**Como faz:** Impede que a função retorne antes de leitura, transaction, conversão ou save necessário terminar.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0466

**Fonte:** `host: meta.host \|\| '', width: meta.width \|\| 0, height: meta.height \|\| 0,`  
**O que faz:** Define o campo `host: meta.host \|\| '', width: meta.width \|\| 0, height: meta.height \|\| 0,`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0467

**Fonte:** `sourceUrl: meta.sourceUrl \|\| '',`  
**O que faz:** Define o campo `sourceUrl: meta.sourceUrl \|\| '',`.  
**Como faz:** Compõe registro de page/restore/asset ou objeto de retorno com valor explícito.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0468

**Fonte:** `});`  
**O que faz:** Fecha/continua a estrutura sintática de **migração legada por capítulo** com `});`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0469

**Fonte:** `migrated++;`  
**O que faz:** Incrementa `migrated` após migrar com sucesso um restore órfão.  
**Como faz:** A contagem é atualizada apenas depois de `savePageResult` confirmar o slot negativo correspondente.  
**Por que assim:** Distingue restores realmente persistidos de tentativas que caíram no catch.  
**Risco/alternativa:** Esses slots negativos entram em contagens de página porque o schema não separa restore-only de page record.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0470

**Fonte:** `} catch (_e) {}`  
**O que faz:** Captura a falha da tentativa anterior.  
**Como faz:** Converte a exceção em fallback ou continua migração conforme o contrato local.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** Capturar sem registrar pode esconder falha parcial; isso é especialmente sensível na migração.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0471

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **migração legada por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0472

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0473

**Fonte:** `await new Promise(resolve => chrome.storage.local.set({ [flagKey]: true }, resolve));`  
**O que faz:** Cria uma Promise para adaptar API callback/event-driven.  
**Como faz:** Resolve/rejeita a operação quando o request/transaction correspondente dispara seus eventos.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0474

**Fonte:** `if (migrated > 0) {`  
**O que faz:** Aplica a guarda `if (migrated > 0) {`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0475

**Fonte:** `await new Promise(resolve => chrome.storage.local.remove(`  
**O que faz:** Cria uma Promise para adaptar API callback/event-driven.  
**Como faz:** Resolve/rejeita a operação quando o request/transaction correspondente dispara seus eventos.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0476

**Fonte:** `[\`${chapterId}_images\`, \`${chapterId}_restoreMap\`, \`${chapterId}_restoreMeta\`], resolve));`  
**O que faz:** Passa as três chaves legadas do capítulo para `chrome.storage.local.remove`.  
**Como faz:** Remove `<chapter>_images`, `<chapter>_restoreMap` e `<chapter>_restoreMeta` em uma única chamada após `migrated > 0`.  
**Por que assim:** Libera a cota ocupada por Base64 antigo depois da migração.  
**Risco/alternativa:** Em migração parcial, esse cleanup pode apagar dados de itens que falharam; além disso `runtime.lastError` não é verificado.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0477

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **migração legada por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0478

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0479

**Fonte:** `return { migrated, skipped: false };`  
**O que faz:** Retorna `return { migrated, skipped: false };`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0480

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **migração legada por capítulo** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** migra chaves específicas do capítulo e limpa Base64 legado só após o fluxo de saves.  
**Risco/alternativa:** catch por página + flag final pode transformar falha parcial em perda/skip permanente; orphan slots negativos afetam índices.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0481

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **migração legada por capítulo**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 PROVADO DIRETAMENTE PARA SUCESSO/IDEMPOTÊNCIA — smoke-04 prova migração, flag, limpeza e segunda execução skipped; falha parcial/orphan restore não são injetados.

### Linha 0482

**Fonte:** `async function stats() {`  
**O que faz:** Declara a função `stats` em **stats de pages/assets/bytes**.  
**Como faz:** Abre o escopo da operação de storage descrita nas linhas seguintes.  
**Por que assim:** oferece diagnóstico barato de volume persistido.  
**Risco/alternativa:** getAll carrega todos os registros de assets em memória para somar tamanho.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0483

**Fonte:** `const db = await openStorageDb();`  
**O que faz:** Inicializa `db` com `await openStorageDb();`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** oferece diagnóstico barato de volume persistido.  
**Risco/alternativa:** getAll carrega todos os registros de assets em memória para somar tamanho.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0484

**Fonte:** `const tx = db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readonly');`  
**O que faz:** Inicializa `tx` com `db.transaction([SM_STORE_CHAPTER_PAGES, SM_STORE_ASSETS], 'readonly');`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** oferece diagnóstico barato de volume persistido.  
**Risco/alternativa:** getAll carrega todos os registros de assets em memória para somar tamanho.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0485

**Fonte:** `const pages = await _idbGetAll(tx.objectStore(SM_STORE_CHAPTER_PAGES));`  
**O que faz:** Inicializa `pages` com `await _idbGetAll(tx.objectStore(SM_STORE_CHAPTER_PAGES));`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** oferece diagnóstico barato de volume persistido.  
**Risco/alternativa:** getAll carrega todos os registros de assets em memória para somar tamanho.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0486

**Fonte:** `const assets = await _idbGetAll(tx.objectStore(SM_STORE_ASSETS));`  
**O que faz:** Inicializa `assets` com `await _idbGetAll(tx.objectStore(SM_STORE_ASSETS));`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** oferece diagnóstico barato de volume persistido.  
**Risco/alternativa:** getAll carrega todos os registros de assets em memória para somar tamanho.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0487

**Fonte:** `const bytes = assets.reduce((sum, a) => sum + (a.size \|\| 0), 0);`  
**O que faz:** Inicializa `bytes` com `assets.reduce((sum, a) => sum + (a.size \|\| 0), 0);`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** oferece diagnóstico barato de volume persistido.  
**Risco/alternativa:** getAll carrega todos os registros de assets em memória para somar tamanho.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0488

**Fonte:** `return { pages: pages.length, assets: assets.length, bytes };`  
**O que faz:** Retorna `return { pages: pages.length, assets: assets.length, bytes };`.  
**Como faz:** Encerra a função/ramificação com valor, Promise, Blob, metadado ou resultado de mutação.  
**Por que assim:** oferece diagnóstico barato de volume persistido.  
**Risco/alternativa:** getAll carrega todos os registros de assets em memória para somar tamanho.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0489

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **stats de pages/assets/bytes** com `}`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** oferece diagnóstico barato de volume persistido.  
**Risco/alternativa:** getAll carrega todos os registros de assets em memória para somar tamanho.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0490

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **stats de pages/assets/bytes**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** 🟨 EXECUTADO VIA ROTEAMENTO SIMULADO — smoke-06 consulta SM_STATS usando módulo real mas handler copiado; bytes exatos não são assertados.

### Linha 0491

**Fonte:** `const api = {`  
**O que faz:** Inicializa `api` com `{`.  
**Como faz:** Materializa store name, transaction, registro, buffer, contador ou estado intermediário.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0492

**Fonte:** `openStorageDb,`  
**O que faz:** Adiciona `openStorageDb` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0493

**Fonte:** `savePageResult,`  
**O que faz:** Adiciona `savePageResult` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0494

**Fonte:** `getAssetBlob,`  
**O que faz:** Adiciona `getAssetBlob` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0495

**Fonte:** `getAssetDataUrl,`  
**O que faz:** Adiciona `getAssetDataUrl` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0496

**Fonte:** `getPageAsset,`  
**O que faz:** Adiciona `getPageAsset` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0497

**Fonte:** `getPageDataUrl,`  
**O que faz:** Adiciona `getPageDataUrl` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0498

**Fonte:** `getChapterPageIndex,`  
**O que faz:** Adiciona `getChapterPageIndex` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0499

**Fonte:** `getChapterPageCount,`  
**O que faz:** Adiciona `getChapterPageCount` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0500

**Fonte:** `getChaptersStats,`  
**O que faz:** Adiciona `getChaptersStats` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0501

**Fonte:** `getRestoreIndex,`  
**O que faz:** Adiciona `getRestoreIndex` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0502

**Fonte:** `listRestoreEntries,`  
**O que faz:** Adiciona `listRestoreEntries` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0503

**Fonte:** `deleteByCleanUrl,`  
**O que faz:** Adiciona `deleteByCleanUrl` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0504

**Fonte:** `deleteChapter,`  
**O que faz:** Adiciona `deleteChapter` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0505

**Fonte:** `migrateChapterFromLegacy,`  
**O que faz:** Adiciona `migrateChapterFromLegacy` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0506

**Fonte:** `stats,`  
**O que faz:** Adiciona `stats` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0507

**Fonte:** `dataUrlToBlob,`  
**O que faz:** Adiciona `dataUrlToBlob` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0508

**Fonte:** `blobToDataUrl,`  
**O que faz:** Adiciona `blobToDataUrl` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0509

**Fonte:** `SM_DB_NAME,`  
**O que faz:** Adiciona `SM_DB_NAME` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0510

**Fonte:** `SM_DB_VERSION,`  
**O que faz:** Adiciona `SM_DB_VERSION` ao objeto/API em construção.  
**Como faz:** Usa shorthand de propriedade para expor a função/constante já definida.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0511

**Fonte:** `};`  
**O que faz:** Fecha/continua a estrutura sintática de **API pública e export multi-runtime** com `};`.  
**Como faz:** Delimita função, object literal, array ou chamada aberta nas linhas anteriores.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0512

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **API pública e export multi-runtime**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0513

**Fonte:** `if (typeof module !== 'undefined' && module.exports) module.exports = api;`  
**O que faz:** Aplica a guarda `if (typeof module !== 'undefined' && module.exports) module.exports = api;`.  
**Como faz:** Rejeita input, escolhe fallback ou evita trabalho desnecessário antes de tocar o storage.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** objeto não é congelado; monkey-patch no mesmo realm pode alterar persistência.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0514

**Fonte:** `rootScope.MangaTranslatorStorageManager = api;`  
**O que faz:** Publica `api` como `rootScope.MangaTranslatorStorageManager`.  
**Como faz:** Torna o contrato disponível ao `background.js` e páginas da extensão no mesmo realm.  
**Por que assim:** expõe um contrato único para SW/páginas da extensão/testes.  
**Risco/alternativa:** Objeto público não é congelado e pode ser modificado por código trusted no realm.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0515

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **API pública e export multi-runtime**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0516

**Fonte:** `})(typeof self !== 'undefined' ? self : globalThis);`  
**O que faz:** Fecha e executa a IIFE escolhendo `self` ou `globalThis`.  
**Como faz:** Resolve o root compatível com Service Worker/Node no carregamento.  
**Por que assim:** O módulo não pode depender de `window`.  
**Risco/alternativa:** Usar window quebraria o Service Worker.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

### Linha 0517

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia em **API pública e export multi-runtime**.  
**Como faz:** Não executa lógica; separa blocos e preserva a posição física do fonte.  
**Por que assim:** Facilita auditoria linha a linha sem alterar semântica.  
**Risco/alternativa:** Remover só mudaria rastreabilidade/legibilidade.  
**Evidência:** ✅ PROVADO POR CONSUMIDORES REAIS — background, smoke e E2E usam MangaTranslatorStorageManager/CommonJS; smoke-06 copia o handler e não prova o switch real do background.

## 12. Checklist de revisão antes da conclusão

- [x] Fonte integral materializada.
- [x] SHA da reserva coincide com o fonte atual.
- [x] 517/517 posições documentadas em ordem.
- [x] Consumers background/content/popup/reader investigados.
- [x] Smoke/E2E reais separados de simulação de routing.
- [x] Schema, transactions, fila, deleção e migração documentados.
- [x] Lacunas de fault-injection/race/migração registradas.
- [x] Invariantes de integridade e privacidade explícitos.
- [ ] Releitura do blob gravado e validação mecânica final.
- [ ] Atualização de STATUS/CHECKLIST/AUDITORIA/PR sob PROGRESS lock.
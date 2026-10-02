# Bíblia técnica — tests/integration/chapter-dedup.test.js

> **Estado documental:** correção materializada; execução focal pendente  
> **SHA auditado:** `10e17e85fe967d7e8ba15cdc0123c37c90458976`  
> **Índice do corpus:** 107  
> **Tipo:** Jest integration — identidade e persistência de capítulo pelo módulo real  
> **Linhas textuais:** **236**  
> **Posições documentais:** **237**, contando o LF final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta revisão remove a implementação espelho `buildChapterSystem` que antes fazia a suíte testar sua própria cópia de `canonicalTitle/getOrCreate`.

O arquivo agora carrega diretamente `extension/content/cm-chapter.js`, obtém `MangaTranslatorChapter` publicado pela implementação de produção e cria managers por `createChapterManager()`.

Consequências:

- `canonicalTitle` usado nas assertions é o export real;
- `getOrCreateChapterId()` é o caminho real;
- mudança de URL usa o cache/invalidation real do manager;
- persistência de página usa `persistTranslatedPage()` e observa mensagens reais `SM_SAVE_PAGE`;
- a suíte não escreve `_<chapter>_images` ou `_restoreMap` manualmente como prova principal.

## 2. Dependências revalidadas

- `extension/content/cm-chapter.js`: `44b621d570b6492ef08982ec4e093ffcfe6d24f8`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `extension/shared/storage-manager.js`: `f4e1e231fa62d22dd50fb20cf0cffbb09da98bee` — boundary produtivo de `SM_SAVE_PAGE`, não importado diretamente nesta suíte.
- `extension/content/content_manga.js`: `a8b3698019f6f22027f09f544f15c0563a9f6515` — consumidor real de `createChapterManager`.
- `extension/manifest.json`: `841fe70c183350e4110bc8ff57ab69b157169c36`.
- `jest.config.js`: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.
- `scripts/ci/run-jest-ci.js`: `6d2e36a647aadeadb2b875c1b3f92df24cd2f494`.
- `package.json`: `5b5c328f6139eeff920dc65a78014a6c5b6db3a6`.
- `.github/workflows/ci.yml`: `9ce62e2b116e2204d1689edf9d302e6ee0cf8c3a`.

As âncoras de `package.json` e `ci.yml` substituem os SHAs stale apontados pelo finding 107-A27-002.

## 3. Harness

`getStorageMock()` fornece o `chrome.storage.local` usado pelo manager real.

`setPage(pathname, title)` altera apenas dados ambientais observados pela produção:

- `window.location.href` via `history.replaceState`;
- `document.title`.

`createManager()` injeta somente dependências previstas pelo contrato público:

- `hostname`;
- `generateId`;
- `sendRuntimeMessageAsync`;
- `onRestoreEntry`.

Nenhuma regra de deduplicação é reimplementada pelo teste.

## 4. Cenários de identidade

### 4.1 Primeira visita

O primeiro caso cria um capítulo e exige:

- ID gerado pelo callback injetado;
- um único registro em `chapterList`;
- URL corrente;
- título exatamente igual a `chapterApi.canonicalTitle(document.title)`;
- timestamp numérico.

### 4.2 URL exata

Com a mesma URL e título totalmente diferente, uma nova instância de manager reutiliza o ID existente.

Isso prova a precedência real `item.url === window.location.href`.

### 4.3 Deduplicação aproximada real

Duas URLs diferentes do mesmo host usam:

- `One Piece [Cap 1050]`;
- `One Piece (Cap 1050)`.

O próprio export real prova que os dois títulos canonicalizam para a mesma string; em seguida o segundo manager reutiliza o ID e atualiza URL/título do único registro.

### 4.4 Contrato que o mirror antigo inventava

O teste anterior afirmava que:

- `One Piece Cap 1050 | Ler`;
- `One Piece Cap 1050 - Mangás`

eram equivalentes.

O runtime atual não possui a etapa de remoção arbitrária desses sufixos. A nova suíte torna isso explícito: primeiro prova que `canonicalTitle` real produz chaves diferentes e depois prova que duas URLs diferentes resultam em dois capítulos.

Isso resolve 107-002 sem alterar produção para satisfazer uma expectativa histórica não implementada.

### 4.5 Não-colisões

A suíte também prova diretamente:

- capítulos `1050` e `1051` no mesmo host permanecem separados;
- mesmo título com `hostname` contratado diferente não deduplica.

## 5. Persistência moderna entre sessões

O último cenário usa `persistTranslatedPage()` real em duas instâncias.

Sessão 1:

- resolve/cria chapter;
- envia página 0 por `SM_SAVE_PAGE`;
- recebe `asset_1`;
- publica restore `{assetId,index}`.

Sessão 2:

- muda URL;
- usa título canonicalmente equivalente;
- resolve o mesmo chapterId;
- envia página 1 por `SM_SAVE_PAGE`;
- recebe `asset_2`;
- publica segundo restore.

As assertions exigem:

- duas mensagens `SM_SAVE_PAGE`;
- mesmo `chapterId`;
- índices 0 e 1;
- `dataUrl/originalUrl/cleanUrl/meta` corretos;
- callbacks de restore com asset IDs corretos;
- um único item em `chapterList`;
- ausência de writes manuais `*_images` e `*_restoreMap`.

O teste para no boundary `sendRuntimeMessageAsync`: ele verifica o contrato real emitido por `cm-chapter.js`, não a implementação interna do Storage Manager, que possui suítes próprias.

## 6. Audit requests

### 107-001 — TEST_REQUIRED — IMPLEMENTED_AWAITING_CI

**Correção:** `buildChapterSystem` foi removido. Todos os cenários agora usam `MangaTranslatorChapter.createChapterManager()` real.

**Validação pendente:** Jest focal da revisão atual.

### 107-002 — FUNCTIONAL_REVIEW — IMPLEMENTED_AWAITING_CI

**Decisão de contrato:** o runtime atual é canônico. A equivalência histórica `| Ler ↔ - Mangás` existia somente no mirror/helper antigo e não é tratada como requisito implícito.

**Correção:** a suíte prova o comportamento real em vez de manter uma expectativa divergente.

**Validação pendente:** Jest focal da revisão atual.

### 107-003 — TEST_REQUIRED — IMPLEMENTED_AWAITING_CI

**Correção:** removidas mutações manuais de `<chapterId>_images`. Duas sessões chamam `persistTranslatedPage()` real e geram `SM_SAVE_PAGE` sob o mesmo chapterId.

**Validação pendente:** Jest focal da revisão atual.

## 7. Findings PRIMARY da revisão anterior

### 107-A27-001 — lifecycle ACCEPTED vs OPEN — CORRIGIDO

Esta Bíblia não chama requests ACCEPTED de OPEN. Enquanto não houver execução focal da nova revisão, elas permanecem explicitamente `IMPLEMENTED_AWAITING_CI`.

### 107-A27-002 — SHAs stale — CORRIGIDO

As âncoras de `package.json` e `.github/workflows/ci.yml` foram atualizadas para os blobs correntes listados na seção 2.

## 8. Evidência e limites

Até esta atualização:

- parse JavaScript estático: **PASS**;
- source/Bíblia: **sincronizados**;
- mirrors de deduplicação: **REMOVIDOS**;
- persistência legacy manual no teste: **REMOVIDA**;
- Jest focal da revisão nova: **PENDENTE**.

Limites:

- `chrome.storage.local` continua mockado;
- o boundary `SM_SAVE_PAGE` é observado com responder injetado, não com IndexedDB real;
- o teste valida o contrato de chapter manager, não tenta duplicar a cobertura interna de `storage-manager.js`;
- alteração futura do contrato de normalização deve ser feita em `cm-chapter.js` e refletirá diretamente nesta suíte.

## 9. Fonte integral exata

```js
/**
 * chapter-dedup.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração real da identidade/persistência de capítulos.
 *
 * A suíte carrega extension/content/cm-chapter.js e observa chapterList +
 * mensagens SM_SAVE_PAGE. Nenhuma regra de canonicalTitle/getOrCreate é copiada
 * para o teste.
 */

const { getStorageMock } = require('../mocks/chrome-api.mock.js');

describe('Deduplicação de capítulos — cm-chapter real', () => {
    let storageMock;
    let chapterApi;
    let idSequence;
    let originalPath;

    function setPage(pathname, title) {
        window.history.replaceState({}, '', pathname);
        document.title = title;
    }

    function createManager({
        hostname = window.location.hostname,
        sendRuntimeMessageAsync = async () => ({ ok: true, assetId: 'asset_default' }),
        onRestoreEntry = null,
    } = {}) {
        return chapterApi.createChapterManager({
            hostname,
            generateId: prefix => `${prefix}${++idSequence}`,
            sendRuntimeMessageAsync,
            onRestoreEntry,
        });
    }

    async function chapterList() {
        const data = await storageMock.get(['chapterList']);
        return data.chapterList || [];
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        await storageMock.clear();
        chrome.runtime.lastError = null;
        idSequence = 0;
        originalPath = window.location.pathname + window.location.search + window.location.hash;

        delete window.MangaTranslatorChapter;
        delete globalThis.MangaTranslatorChapter;
        require('../../extension/content/cm-chapter.js');
        chapterApi = window.MangaTranslatorChapter || globalThis.MangaTranslatorChapter;
        expect(chapterApi).toBeTruthy();
    });

    afterEach(async () => {
        await storageMock.clear();
        chrome.runtime.lastError = null;
        window.history.replaceState({}, '', originalPath || '/');
        document.title = '';
        delete window.MangaTranslatorChapter;
        delete globalThis.MangaTranslatorChapter;
    });

    test('primeira visita cria capítulo usando canonicalTitle da produção', async () => {
        setPage('/one-piece/1050', 'One Piece [Cap 1050]');

        const manager = createManager();
        const id = await manager.getOrCreateChapterId();

        expect(id).toBe('chap_1');
        expect(await chapterList()).toEqual([
            expect.objectContaining({
                id,
                url: window.location.href,
                title: chapterApi.canonicalTitle(document.title),
                timestamp: expect.any(Number),
            }),
        ]);
    });

    test('URL exata tem prioridade e reutiliza ID mesmo se o título mudou', async () => {
        setPage('/exact/chapter', 'Título inicial');
        const first = createManager();
        const id1 = await first.getOrCreateChapterId();

        document.title = 'Título completamente diferente';
        const second = createManager();
        const id2 = await second.getOrCreateChapterId();

        expect(id2).toBe(id1);
        expect(await chapterList()).toHaveLength(1);
    });

    test('URLs diferentes do mesmo host deduplicam quando canonicalTitle real é equivalente', async () => {
        setPage('/one-piece/1050', 'One Piece [Cap 1050]');
        const first = createManager();
        const id1 = await first.getOrCreateChapterId();

        setPage('/one-piece/1050?page=2', 'One Piece (Cap 1050)');
        const second = createManager();
        const id2 = await second.getOrCreateChapterId();

        expect(chapterApi.canonicalTitle('One Piece [Cap 1050]'))
            .toBe(chapterApi.canonicalTitle('One Piece (Cap 1050)'));
        expect(id2).toBe(id1);

        const list = await chapterList();
        expect(list).toHaveLength(1);
        expect(list[0]).toEqual(expect.objectContaining({
            id: id1,
            url: window.location.href,
            title: chapterApi.canonicalTitle(document.title),
        }));
    });

    test('não inventa equivalência de sufixos textuais que canonicalTitle real preserva', async () => {
        expect(chapterApi.canonicalTitle('One Piece Cap 1050 | Ler'))
            .not.toBe(chapterApi.canonicalTitle('One Piece Cap 1050 - Mangás'));

        setPage('/legacy-mirror/1050', 'One Piece Cap 1050 | Ler');
        const id1 = await createManager().getOrCreateChapterId();

        setPage('/legacy-mirror/1050?page=2', 'One Piece Cap 1050 - Mangás');
        const id2 = await createManager().getOrCreateChapterId();

        expect(id2).not.toBe(id1);
        expect(await chapterList()).toHaveLength(2);
    });

    test('capítulos diferentes do mesmo host não são agrupados', async () => {
        setPage('/one-piece/1050', 'One Piece Cap 1050');
        const id1050 = await createManager().getOrCreateChapterId();

        setPage('/one-piece/1051', 'One Piece Cap 1051');
        const id1051 = await createManager().getOrCreateChapterId();

        expect(id1051).not.toBe(id1050);
        expect(await chapterList()).toHaveLength(2);
    });

    test('mesmo título não deduplica quando o hostname contratado é diferente', async () => {
        setPage('/site-a/chapter/1', 'Mesmo Título');
        const idA = await createManager({ hostname: window.location.hostname })
            .getOrCreateChapterId();

        setPage('/site-b/chapter/1', 'Mesmo Título');
        const idB = await createManager({ hostname: 'different.example' })
            .getOrCreateChapterId();

        expect(idB).not.toBe(idA);
        expect(await chapterList()).toHaveLength(2);
    });

    test('persistTranslatedPage de duas sessões envia páginas ao SM_SAVE_PAGE sob o mesmo chapterId', async () => {
        const saveRequests = [];
        const restoreSpy = jest.fn();
        const storageService = async request => {
            expect(request.action).toBe('SM_SAVE_PAGE');
            saveRequests.push(request);
            return { ok: true, assetId: `asset_${saveRequests.length}` };
        };

        setPage('/manga/chapter-7', 'Manga [Chapter 7]');
        const session1 = createManager({
            sendRuntimeMessageAsync: storageService,
            onRestoreEntry: restoreSpy,
        });
        const saved1 = await session1.persistTranslatedPage(
            0,
            'data:image/png;base64,UEFHRTA=',
            {
                sourceUrl: 'https://cdn.example/page-0.png?token=a',
                cleanUrl: 'https://cdn.example/page-0.png',
                width: 800,
                height: 1200,
            }
        );

        setPage('/manga/chapter-7?page=2', 'Manga (Chapter 7)');
        const session2 = createManager({
            sendRuntimeMessageAsync: storageService,
            onRestoreEntry: restoreSpy,
        });
        const saved2 = await session2.persistTranslatedPage(
            1,
            'data:image/png;base64,UEFHRTE=',
            {
                sourceUrl: 'https://cdn.example/page-1.png?token=b',
                cleanUrl: 'https://cdn.example/page-1.png',
                width: 801,
                height: 1201,
            }
        );

        expect(saved2.chapterId).toBe(saved1.chapterId);
        expect(saveRequests).toHaveLength(2);
        expect(saveRequests.map(request => ({
            action: request.action,
            chapterId: request.chapterId,
            pageIndex: request.pageIndex,
        }))).toEqual([
            { action: 'SM_SAVE_PAGE', chapterId: saved1.chapterId, pageIndex: 0 },
            { action: 'SM_SAVE_PAGE', chapterId: saved1.chapterId, pageIndex: 1 },
        ]);
        expect(saveRequests[0]).toEqual(expect.objectContaining({
            dataUrl: 'data:image/png;base64,UEFHRTA=',
            originalUrl: 'https://cdn.example/page-0.png?token=a',
            cleanUrl: 'https://cdn.example/page-0.png',
            meta: expect.objectContaining({
                host: window.location.hostname,
                width: 800,
                height: 1200,
            }),
        }));
        expect(saveRequests[1]).toEqual(expect.objectContaining({
            dataUrl: 'data:image/png;base64,UEFHRTE=',
            cleanUrl: 'https://cdn.example/page-1.png',
            meta: expect.objectContaining({ width: 801, height: 1201 }),
        }));
        expect(restoreSpy).toHaveBeenNthCalledWith(1, 'https://cdn.example/page-0.png', {
            assetId: 'asset_1',
            index: 0,
        });
        expect(restoreSpy).toHaveBeenNthCalledWith(2, 'https://cdn.example/page-1.png', {
            assetId: 'asset_2',
            index: 1,
        });

        const local = await storageMock.get(null);
        expect(local.chapterList).toHaveLength(1);
        expect(Object.keys(local).some(key => key.endsWith('_images'))).toBe(false);
        expect(Object.keys(local).some(key => key.endsWith('_restoreMap'))).toBe(false);
    });
});
```

## 10. Cobertura integral por posições

- **1–10:** cabeçalho e import do Chrome storage mock.
- **11–18:** abertura da suíte e estado compartilhado.
- **19–22:** helper ambiental `setPage`.
- **23–36:** factory sobre `createChapterManager` real.
- **37–40:** leitura de `chapterList`.
- **41–56:** setup: reset, storage, URL base e carregamento de `cm-chapter.js`.
- **57–64:** cleanup.
- **65–81:** primeira visita/registro real.
- **82–94:** prioridade de URL exata.
- **95–116:** deduplicação real por canonical title equivalente e atualização do registro.
- **117–130:** rejeição da equivalência artificial `| Ler ↔ - Mangás`.
- **131–141:** capítulos 1050/1051 permanecem distintos.
- **142–154:** hostname contratado distinto impede deduplicação.
- **155–235:** duas sessões por `persistTranslatedPage → SM_SAVE_PAGE`, restores e ausência de storage legacy manual.
- **236:** fechamento da suíte.
- **237:** posição vazia do LF final.

**Cobertura:** 237/237 posições, contíguas e sem overlap.

## 11. Reauditoria pós-correção

- `buildChapterSystem`: removido.
- `canonicalTitle` local: removido.
- `resetCache` artificial: removido.
- imports `path/fs/repo-root`: removidos.
- writes `*_images`: removidos.
- writes `*_restoreMap`: removidos.
- módulo real `cm-chapter.js`: carregado diretamente.
- URL exata: coberta.
- match aproximado real: coberto.
- divergência histórica de sufixos: explicitada sem inventar contrato.
- separação por capítulo/hostname: coberta.
- `persistTranslatedPage → SM_SAVE_PAGE`: coberto no boundary.
- execução focal: necessária antes de resolver requests.

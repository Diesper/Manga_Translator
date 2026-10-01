# Bíblia técnica — tests/integration/chapter-dedup.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 22  
> **SHA auditado:** e62187cd957a2fe241e4e704aaa9f8285e89162e  
> **Agente responsável:** AGENTE 22  
> **Índice do corpus:** 107  
> **Tipo:** teste Jest de integração nominal / regressão de identidade de capítulo / simulação de storage  
> **Linhas textuais:** **261**  
> **Posições documentais:** **262**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible  
> **Escopo de escrita respeitado:** somente esta Bíblia, a reserva e o state #107; fontes, testes, mocks, workflows e configs permaneceram somente leitura.

## 1. Papel arquitetural

Este arquivo registra a intenção histórica do **BUG #12**: duas visitas ao mesmo capítulo, com pequenas variações de URL/título, deveriam convergir para um único `chapterId`. A suíte também verifica que capítulos diferentes, obras diferentes e domínios diferentes não colidem, além de simular duas páginas acumuladas sob a mesma chave de imagens.

A classificação “integração” vem do local do arquivo e do wiring do Jest, porém há uma limitação essencial: **a suíte não importa a implementação de produção que hoje executa esse contrato**. Em vez disso, as linhas 25–96 definem `buildChapterSystem`, uma implementação espelho completa; as assertions das linhas 107–259 exercitam esse espelho e `chromeStorage` mockado.

No estado atual do projeto, identidade e persistência de capítulo vivem em `extension/content/cm-chapter.js`, que é carregado antes de `content_manga.js` pelo manifest e instanciado por `content_manga.js` via `window.MangaTranslatorChapter.createChapterManager(...)`.

Consequência documental: este arquivo é **prova direta de suas próprias funções-espelho**, mas **não é prova direta da deduplicação do produto atual**.

## 2. Dependências diretas

- **Node.js `path`** — resolve o caminho do mock de Chrome.
- **Node.js `fs`** — importado na linha 16, mas não utilizado.
- **`../helpers/repo-root`** — fornece `findRepoRoot(__dirname)`, permitindo localizar a raiz sem depender do cwd.
- **`tests/mocks/chrome-api.mock.js`** — fornece o singleton `storageMock`; o próprio mock inicializa `global.chrome`, reseta storage/timers nos hooks Jest e limpa `chrome.runtime.lastError` após cada caso.
- **globais Jest** — `describe`, `test`, `beforeEach`, `expect`.
- **globais JS** — `URL`, `Date`, `Math`, `Promise`.
- **`global chrome.runtime.lastError`** — usado pela implementação espelho para simular falhas, mesmo quando o objeto de storage é injetado.

Não há import de `extension/content/cm-chapter.js`, `content_manga.js` ou Storage Manager real.

## 3. Wiring real da suíte

### 3.1 Jest

`jest.config.js` (f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc) define o projeto `integration` com:

- ambiente `jsdom`;
- `testMatch: <rootDir>/tests/integration/**/*.test.js`;
- setup `chrome-api.mock.js` e `dom-environment.js`.

Portanto este arquivo é descoberto pelo projeto de integração.

### 3.2 package.json

`package.json` (51bbd80a5a8a6c49385ce7aa4ec10afc79c7aa48) define:

- `test:integration = jest --config jest.config.js --selectProjects integration`;
- `test:ci = node scripts/ci/run-jest-ci.js`;
- `test` inclui `test:ci`.

### 3.3 Gate de inventário e CI

`scripts/ci/run-jest-ci.js` inclui todo `tests/integration/**/*.test.js` no inventário esperado, compara a partição Jest descoberta com o inventário e rejeita skipped/TODO/falhas acima do baseline.

`.github/workflows/ci.yml` (ebee75820db9bfab618bf3c3016065c5bc857ed7) executa `npm run test:ci` no job **Unit + Integration** em Node 20.x e 22.x; outros jobs também executam `npm run test:integration`/Jest completo.

**Classificação:** o wiring é **🟦 GATE ESTÁTICO ESPECÍFICO**. Esta auditoria não reivindica uma execução local nova nem fabrica resultado de CI.

## 4. O sistema espelho realmente testado

O fluxo interno da suíte é:

`buildChapterSystem(storageMock, location)`
→ normaliza título com `canonicalTitle` local
→ busca `chapterList` por URL exata
→ se falhar, busca por mesmo hostname + chave normalizada
→ se encontrar fallback, atualiza URL/título
→ se não encontrar, cria `chap_<timestamp>_<random>`
→ cacheia a Promise em `_chapterIdPromise`
→ testes podem chamar `resetCache()` manualmente.

Esse fluxo é autocontido no arquivo e não depende da extensão para funcionar.

### 4.1 Canonicalização do espelho

A versão local:

1. aceita prefixo textual opcional antes do número (ex.: `Cap 5:`, `Vol. 3:`);
2. remove um sufixo terminal de site (` | Ler`, ` - Mangás`);
3. substitui vários separadores Unicode;
4. remove traço/dois-pontos finais;
5. colapsa espaços, aplica `trim`, lowercase e limite de 80 caracteres.

### 4.2 Lookup

A busca exata por URL tem prioridade. O fallback usa hostname + chave textual. URL inválida armazenada é ignorada por `catch { return false; }`.

### 4.3 Cache

A Promise é reutilizada até `resetCache()` ou uma rejeição. O reset manual existe apenas no espelho.

### 4.4 Persistência simulada

A criação escreve `chapterList` no storage mock. O cenário “Imagens salvas” não chama o manager de produção: escreve diretamente `${chapId}_images`, lê o objeto, adiciona a página 1 e grava novamente.

## 5. Divergências contra a implementação real atual

Fonte real comparada: `extension/content/cm-chapter.js` (44b621d570b6492ef08982ec4e093ffcfe6d24f8).

| Tema | Teste #107 | Produção atual | Consequência |
|---|---|---|---|
| Local da implementação | `buildChapterSystem` dentro do teste | `MangaTranslatorChapter.createChapterManager` em `cm-chapter.js` | o teste pode ficar verde enquanto produção muda |
| Prefixo textual | regex aceita `Cap 5:` | regex real remove apenas prefixo iniciado por dígitos | intenção v3.2 do teste não é prova do produto |
| Sufixo de site | remove ` | Ler` / ` - Mangás` | não há etapa equivalente no `canonicalTitle` real | o caso nominal de duas sessões pode divergir do produto |
| Cache | reset manual exposto | produção invalida automaticamente quando `window.location.href` muda | semântica de sessão/SPA diferente |
| Geração de ID | `Date.now()+Math.random()` | `generateId('chap_')` injetado | teste não prova formato/colisões do gerador real |
| Match aproximado | usa fixture `location` | usa `window.location` e `document.title` | ambiente e fonte de dados diferentes |
| Persistência de página | escreve `_<images>` manualmente | `persistTranslatedPage` envia `SM_SAVE_PAGE`; fallback legado só ocorre em condições específicas | cenário “integração com storage” não testa o caminho atual |
| Erro de atualização de match | write sem await/callback | produção também faz write não aguardado nesse ramo | risco existe, mas este arquivo não testa falha desse write |

A divergência já é observável diretamente nas fontes: o teste adiciona duas etapas de normalização que não existem na implementação real atual.

## 6. Relação com consumidores reais

`extension/manifest.json` (841fe70c183350e4110bc8ff57ab69b157169c36) carrega:

`cm-chapter.js` → `cm-auto-restore.js` → `content_manga.js`.

`extension/content/content_manga.js` (a8b3698019f6f22027f09f544f15c0563a9f6515) exige `window.MangaTranslatorChapter`, cria o manager e recebe dele `getOrCreateChapterId` e `persistTranslatedPage`. Portanto, o contrato produtivo passa pelo módulo real e não por qualquer função deste teste.

Há testes adjacentes que carregam o content script real:

- `tests/unit/content-manga/extraction-and-handlers-real.test.js` (038961e8228c7b5f1a87023a739ad5f33288423b) exerce `UPDATE_IMAGE` e observa `_images`/`_restoreMap` no fallback real;
- `tests/unit/content-manga/auto-restorer-real.test.js` (cf792733e62f4b787073f1f7257e2701d29547a6) usa chapterList real durante restauração.

Esses testes fortalecem partes do pipeline, mas não fornecem assertion específica para a deduplicação por **mesmo hostname + títulos com sufixos diferentes** que dá nome ao #107.

## 7. Matriz de evidência

| Comportamento | Evidência existente | Classificação |
|---|---|---|
| Espelho cria ID `chap_*` e um registro | linhas 107–119 | ✅ PROVADO DIRETAMENTE para o espelho local |
| Espelho reutiliza registro após reset manual e mesma URL | linhas 121–136 | ✅ PROVADO DIRETAMENTE para o espelho local |
| Espelho une `| Ler` e `- Mangás` | linhas 140–162 | ✅ PROVADO DIRETAMENTE para o espelho local |
| Espelho separa capítulo 1050 de 1051 | linhas 164–183 | ✅ PROVADO DIRETAMENTE para o espelho local |
| Espelho separa Naruto de Bleach | linhas 185–202 | ✅ PROVADO DIRETAMENTE para o espelho local |
| Espelho reaproveita ID em duas sessões e mapa manual acumula duas imagens | linhas 205–238 | ✅ PROVADO DIRETAMENTE para o cenário sintético/manual |
| Espelho separa mesmo título em domínios diferentes | linhas 241–259 | ✅ PROVADO DIRETAMENTE para o espelho local |
| Arquivo pertence ao projeto Jest `integration` | `jest.config.js` + inventário CI | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI está configurada para executar integração | workflow + `test:ci` | 🟦 GATE ESTÁTICO / WIRING — a configuração prevê execução, mas nenhuma run concreta é usada aqui como prova runtime |
| `cm-chapter.js` real deduplica `| Ler` versus `- Mangás` | este arquivo não importa o módulo; regex real diverge | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `canonicalTitle` real aceita prefixo textual como `Cap 5:` | testes canonical-title usam `extracted-functions.js`, não o módulo real | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Caminho real `persistTranslatedPage → SM_SAVE_PAGE` mantém duas sessões no mesmo chapter | cenário #107 grava storage manualmente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| Cache real invalida por mudança de URL | espelho expõe `resetCache` manual | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |

## 8. Casos-limite e riscos

1. **Drift de espelho:** não existe vínculo mecânico entre `buildChapterSystem` e `cm-chapter.js`.
2. **Comentário histórico obsoleto:** linha 24 cita `content_manga.js v3.1`, mas a responsabilidade foi modularizada em `cm-chapter.js`.
3. **Contrato nominal possivelmente não implementado:** o caso crítico depende da remoção de sufixo que só existe no espelho/test helper.
4. **Falso positivo de integração:** o arquivo pode permanecer verde mesmo se a deduplicação real regressar ou já divergir.
5. **Persistência manual:** linhas 216 e 230–233 bypassam `persistTranslatedPage` e o Storage Manager.
6. **Write não aguardado no fallback:** linha 70 pode falhar depois de o fluxo já ter resolvido o ID.
7. **Acoplamento global:** erros consultam `chrome.runtime.lastError`, não um runtime injetado.
8. **IDs não determinísticos:** `Date.now()` + `Math.random()` torna IDs sintéticos e diferentes do gerador de produção.
9. **`fs` não utilizado:** import morto na linha 16.
10. **Unicode de chaves:** depois do `canonicalTitle`, `replace(/[^a-z0-9]/gi,'_')` transforma letras acentuadas em underscores; colisões são possíveis.
11. **Truncamento a 80 chars:** diferenças após o caractere 80 são descartadas pelo espelho.
12. **URL inválida persistida:** silenciosamente vira não-match; não há assertion específica neste arquivo.
13. **Falha de storage:** o espelho possui branches de erro, mas esta suíte não simula `get`/ `set` falhando.
14. **Concorrência entre instâncias:** duas instâncias diferentes não compartilham `_chapterIdPromise`; o teste não exercita duas criações simultâneas.
15. **Nenhum código externo foi alterado para produzir evidência.**

## 9. Solicitações ao auditor

### 107-001 — TEST_REQUIRED — ACCEPTED — severidade HIGH

**Encontrado:** o teste nominal de integração implementa `buildChapterSystem` local e não importa `extension/content/cm-chapter.js`.

**Evidência atual:** todas as assertions de deduplicação exercitam somente o espelho das linhas 25–96.

**Evidência ausente:** execução do manager real com as mesmas fixtures e assertions de chapterId/chapterList.

**Necessário:** refatorar/adicionar teste que carregue `cm-chapter.js` real, instancie `createChapterManager` e execute os cenários de URL exata, sufixos variáveis, capítulos diferentes, obras diferentes e domínios diferentes.

**Risco:** regressão ou divergência do produto pode permanecer verde indefinidamente.

### 107-002 — FUNCTIONAL_REVIEW — ACCEPTED — severidade HIGH

**Encontrado:** o `canonicalTitle` espelho remove prefixo textual opcional e sufixo de site; o `canonicalTitle` real atual não possui as mesmas etapas.

**Comportamento afetado:** deduplicação do BUG #12 para títulos como `One Piece Cap 1050 | Ler` versus `One Piece Cap 1050 - Mangás` e prefixos como `Cap 5:`.

**Necessário:** decidir o contrato canônico; se a intenção do teste continua válida, alinhar a implementação real e cobri-la com assertion direta. Se não, atualizar/remover a expectativa histórica do teste para que não anuncie um contrato inexistente.

**Risco:** duplicação de capítulos ou confiança indevida em um teste verde que não representa produção.

### 107-003 — TEST_REQUIRED — ACCEPTED — severidade NORMAL

**Encontrado:** o bloco “integração com storage” escreve `${chapId}_images` manualmente e não chama `persistTranslatedPage`, `SM_SAVE_PAGE` ou o Storage Manager.

**Evidência atual:** prova apenas que duas mutações manuais no mesmo objeto do mock resultam em duas chaves.

**Evidência ausente:** duas sessões passando pelo caminho real de persistência e convergindo para o mesmo chapterId/índice.

**Necessário:** adicionar cenário usando o módulo real, resposta de `SM_SAVE_PAGE` e assertions no resultado persistido/restore correspondente.

**Risco:** mudanças no roteamento moderno de storage podem quebrar persistência entre sessões sem afetar este teste.

## 10. SHAs observados durante a auditoria

- `tests/integration/chapter-dedup.test.js` — `e62187cd957a2fe241e4e704aaa9f8285e89162e`
- `extension/content/cm-chapter.js` — `44b621d570b6492ef08982ec4e093ffcfe6d24f8`
- `extension/content/content_manga.js` — `a8b3698019f6f22027f09f544f15c0563a9f6515`
- `tests/helpers/extracted-functions.js` — `ccbf20485608a223c723adf638860cb7151c8886`
- `tests/mocks/chrome-api.mock.js` — `c1d9a056b7777183bfd3f540c49811335f410425`
- `tests/unit/content-manga/extraction-and-handlers-real.test.js` — `038961e8228c7b5f1a87023a739ad5f33288423b`
- `tests/unit/content-manga/auto-restorer-real.test.js` — `cf792733e62f4b787073f1f7257e2701d29547a6`
- `tests/unit/content-manga/canonical-title-full.test.js` — `1b46903dbe4affda36a20b7fc140af2dc890a4dd`
- `tests/unit/content-manga/chapter-id-cache.test.js` — `7bc23a456be69aaac252e7acea2b498d61a07520`
- `tests/unit/content-manga/chapter-id-rejection.test.js` — `783c8abd86029345a97ce44f4eaf5415274bf4b3`
- `tests/helpers/repo-root.js` — `b2520d65820e7b9072602018b0f46609ac967c58`
- `package.json` — `51bbd80a5a8a6c49385ce7aa4ec10afc79c7aa48`
- `jest.config.js` — `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`
- `.github/workflows/ci.yml` — `ebee75820db9bfab618bf3c3016065c5bc857ed7`
- `extension/manifest.json` — `841fe70c183350e4110bc8ff57ab69b157169c36`

## 11. Fonte integral exata

O bloco abaixo reproduz **byte a byte** o source auditado em `e62187cd957a2fe241e4e704aaa9f8285e89162e`. Ele é a âncora canônica para revalidação do conteúdo integral; o mapa posicional da seção seguinte continua fornecendo rastreabilidade semântica por linha.

```js
/**
 * chapter-dedup.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste de integração: Deduplicação de capítulos com canonicalTitle (BUG #12).
 *
 * CENÁRIO: O usuário traduz páginas do mesmo capítulo em duas sessões distintas.
 * Entre as sessões, o título da aba pode variar ligeiramente (sufixos do site,
 * separadores diferentes, etc.). O sistema deve reconhecer que é o mesmo capítulo
 * e agrupar todas as imagens na mesma "pasta" do banco de dados.
 *
 * Testa a integração completa: canonicalTitle + _getOrCreateChapterIdImpl +
 * persistência no chrome.storage.
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

// Implementação espelho completa de getOrCreateChapterId (mesma lógica do content_manga.js v3.1)
function buildChapterSystem(chromeStorage, location) {
    let _chapterIdPromise = null;

    function canonicalTitle(t) {
        // CORREÇÃO v3.2: alinhado com extracted-functions.js
        // 1. Prefixo textual opcional + número: "Cap 5: " além de "1050 - "
        // 2. Strip de sufixo de site: "| Ler Online", " - Mangás"
        //    Garante que o mesmo capítulo visitado com sufixos diferentes
        //    (variando entre sessões) produza a mesma chave de deduplicação.
        return (t || '')
            .replace(/^(?:[A-Za-z]+\.?\s+)?\d+[\s.\-\u2013\u2014:|]+/, '')
            .replace(/\s+[-|\u2013\u2014]\s+.+$/, '')
            .replace(/[|\u2013\u2014\u2022\u00B7\[\]()\u00AB\u00BB]/g, ' ')
            .replace(/\s*[-:]\s*$/, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .toLowerCase()
            .slice(0, 80);
    }

    function impl() {
        return new Promise((resolve, reject) => {
            chromeStorage.get(['chapterList'], (data) => {
                if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                const list = data.chapterList || [];
                const href = location.href;
                const hostname = location.hostname;
                const titleKey = canonicalTitle(location.title || '').replace(/[^a-z0-9]/gi, '_');

                // Busca por URL exata primeiro
                let chapter = list.find(c => c.url === href);

                // Fallback: mesmo hostname + título normalizado similar
                if (!chapter) {
                    chapter = list.find(c => {
                        if (!c.url) return false;
                        try {
                            const sameHost = new URL(c.url).hostname === hostname;
                            const cKey = canonicalTitle(c.title || '').replace(/[^a-z0-9]/gi, '_');
                            return sameHost && cKey === titleKey;
                        } catch { return false; }
                    });
                    if (chapter) {
                        chapter.url = href;
                        chapter.title = canonicalTitle(location.title || '');
                        chromeStorage.set({ chapterList: list });
                    }
                }

                if (chapter) { resolve(chapter.id); return; }

                const newId = 'chap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
                list.push({ id: newId, url: href, title: canonicalTitle(location.title || ''), timestamp: Date.now() });
                chromeStorage.set({ chapterList: list }, () => {
                    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                    resolve(newId);
                });
            });
        });
    }

    function getOrCreate() {
        if (!_chapterIdPromise) {
            _chapterIdPromise = impl().catch(e => { _chapterIdPromise = null; throw e; });
        }
        return _chapterIdPromise;
    }

    function resetCache() { _chapterIdPromise = null; }

    return { getOrCreate, resetCache };
}

describe('Deduplicação de Capítulos — Integração (BUG #12)', () => {

    let storageMock;

    beforeEach(() => {
        storageMock = getStorageMock();
    });

    describe('Sessão única', () => {
        test('cria novo capítulo na primeira visita', async () => {
            const system = buildChapterSystem(storageMock, {
                href: 'https://manga.com/one-piece/cap-1050',
                hostname: 'manga.com',
                title: 'One Piece Capítulo 1050 | Ler Online',
            });

            const id = await system.getOrCreate();
            expect(id).toMatch(/^chap_/);

            const data = await storageMock.get(['chapterList']);
            expect(data.chapterList).toHaveLength(1);
        });

        test('reutiliza capítulo na segunda chamada (mesma URL)', async () => {
            const system = buildChapterSystem(storageMock, {
                href: 'https://manga.com/one-piece/cap-1050',
                hostname: 'manga.com',
                title: 'One Piece Capítulo 1050 | Ler Online',
            });

            const id1 = await system.getOrCreate();
            system.resetCache();
            const id2 = await system.getOrCreate();

            expect(id1).toBe(id2);

            const data = await storageMock.get(['chapterList']);
            expect(data.chapterList).toHaveLength(1);
        });
    });

    describe('Duas sessões — mesmo capítulo, títulos variando (BUG #12)', () => {
        test('Sessão 1: "One Piece Cap 1050 | Ler" → Sessão 2: "One Piece Cap 1050 - Mangás" → mesmo ID', async () => {
            // Sessão 1
            const system1 = buildChapterSystem(storageMock, {
                href: 'https://manga.com/one-piece/1050',
                hostname: 'manga.com',
                title: 'One Piece Cap 1050 | Ler',
            });
            const id1 = await system1.getOrCreate();

            // Sessão 2 — URL diferente, título similar
            const system2 = buildChapterSystem(storageMock, {
                href: 'https://manga.com/one-piece/1050?page=2',
                hostname: 'manga.com',
                title: 'One Piece Cap 1050 - Mangás',
            });
            const id2 = await system2.getOrCreate();

            // Devem ser o mesmo capítulo
            expect(id1).toBe(id2);

            const data = await storageMock.get(['chapterList']);
            expect(data.chapterList).toHaveLength(1);
        });

        test('capítulos DIFERENTES não devem ser agrupados', async () => {
            const system1050 = buildChapterSystem(storageMock, {
                href: 'https://manga.com/one-piece/1050',
                hostname: 'manga.com',
                title: 'One Piece Cap 1050',
            });

            const system1051 = buildChapterSystem(storageMock, {
                href: 'https://manga.com/one-piece/1051',
                hostname: 'manga.com',
                title: 'One Piece Cap 1051',
            });

            const id1050 = await system1050.getOrCreate();
            const id1051 = await system1051.getOrCreate();

            expect(id1050).not.toBe(id1051);
            const data = await storageMock.get(['chapterList']);
            expect(data.chapterList).toHaveLength(2);
        });

        test('obras DIFERENTES não devem ser agrupadas', async () => {
            const naruto = buildChapterSystem(storageMock, {
                href: 'https://manga.com/naruto/1',
                hostname: 'manga.com',
                title: 'Naruto Capítulo 1',
            });

            const bleach = buildChapterSystem(storageMock, {
                href: 'https://manga.com/bleach/1',
                hostname: 'manga.com',
                title: 'Bleach Capítulo 1',
            });

            const idN = await naruto.getOrCreate();
            const idB = await bleach.getOrCreate();

            expect(idN).not.toBe(idB);
        });
    });

    describe('Imagens salvas no mesmo capítulo (integração com storage)', () => {
        test('imagens de duas sessões são salvas sob o mesmo chapterId', async () => {
            // Sessão 1: traduz página 0
            const sys1 = buildChapterSystem(storageMock, {
                href: 'https://manga.com/chapter/1',
                hostname: 'manga.com',
                title: 'Test Chapter 1',
            });
            const chapId = await sys1.getOrCreate();

            // Salva imagem da sessão 1
            await storageMock.set({ [`${chapId}_images`]: { 0: 'data:image/png;base64,sess1page0' } });

            // Sessão 2: traduz página 1 (URL ligeiramente diferente, título igual)
            const sys2 = buildChapterSystem(storageMock, {
                href: 'https://manga.com/chapter/1?p=2',
                hostname: 'manga.com',
                title: 'Test Chapter 1',
            });
            const chapId2 = await sys2.getOrCreate();

            // Deve ser o mesmo capítulo
            expect(chapId2).toBe(chapId);

            // Adiciona imagem da sessão 2
            const data = await storageMock.get([`${chapId}_images`]);
            const images = data[`${chapId}_images`] || {};
            images[1] = 'data:image/png;base64,sess2page1';
            await storageMock.set({ [`${chapId}_images`]: images });

            // Verifica que ambas estão no mesmo capítulo
            const finalData = await storageMock.get([`${chapId}_images`]);
            expect(Object.keys(finalData[`${chapId}_images`])).toHaveLength(2);
        });
    });

    describe('Domínios diferentes não interferem', () => {
        test('mesmo título em domínios diferentes gera capítulos separados', async () => {
            const siteA = buildChapterSystem(storageMock, {
                href: 'https://siteA.com/chapter/1',
                hostname: 'siteA.com',
                title: 'Same Title',
            });

            const siteB = buildChapterSystem(storageMock, {
                href: 'https://siteB.com/chapter/1',
                hostname: 'siteB.com',
                title: 'Same Title',
            });

            const idA = await siteA.getOrCreate();
            const idB = await siteB.getOrCreate();

            expect(idA).not.toBe(idB);
        });
    });
});
```

## 12. Mapeamento linha a linha

| Pos. | Unidade | Fonte | Função auditada |
|---:|:---:|---|---|
| 001 | U01 | `/**` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 002 | U01 | ` * chapter-dedup.test.js` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 003 | U01 | ` * ─────────────────────────────────────────────────────────────────────────────` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 004 | U01 | ` * Teste de integração: Deduplicação de capítulos com canonicalTitle (BUG #12).` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 005 | U01 | ` *` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 006 | U01 | ` * CENÁRIO: O usuário traduz páginas do mesmo capítulo em duas sessões distintas.` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 007 | U01 | ` * Entre as sessões, o título da aba pode variar ligeiramente (sufixos do site,` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 008 | U01 | ` * separadores diferentes, etc.). O sistema deve reconhecer que é o mesmo capítulo` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 009 | U01 | ` * e agrupar todas as imagens na mesma "pasta" do banco de dados.` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 010 | U01 | ` *` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 011 | U01 | ` * Testa a integração completa: canonicalTitle + _getOrCreateChapterIdImpl +` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 012 | U01 | ` * persistência no chrome.storage.` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 013 | U01 | ` */` | Comentário de cabeçalho declara a intenção histórica do teste: deduplicar capítulos entre sessões e tratar o arquivo como integração; essa alegação é qualificada nesta Bíblia porque a implementação usada abaixo é um espelho local. |
| 014 | U02 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 015 | U02 | `const path = require('path');` | Importa `path` para resolver o caminho do mock de Chrome a partir da raiz descoberta. |
| 016 | U02 | `const fs   = require('fs');` | Importa `fs`, porém o identificador não é usado em nenhuma linha executável deste arquivo. |
| 017 | U02 | `// Portable root finder — works regardless of where this file is placed in the tree.` | Comentário explica a estratégia portável de descoberta da raiz do repositório. |
| 018 | U02 | `// Walks up from __dirname until it finds the folder containing extension/manifest.json.` | Comentário explica a estratégia portável de descoberta da raiz do repositório. |
| 019 | U02 | `const { findRepoRoot } = require('../helpers/repo-root');` | Importa `findRepoRoot` do helper real `tests/helpers/repo-root.js`. |
| 020 | U02 | `const ROOT = findRepoRoot(__dirname);` | Resolve `ROOT` caminhando a partir de `__dirname` até a raiz do repositório. |
| 021 | U02 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 022 | U02 | `const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));` | Importa `getStorageMock` do mock compartilhado de Chrome; o mock é stateful e resetado pelos hooks Jest do próprio módulo. |
| 023 | U02 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 024 | U03 | `// Implementação espelho completa de getOrCreateChapterId (mesma lógica do content_manga.js v3.1)` | Comentário afirma que o bloco seguinte espelha `getOrCreateChapterId` do `content_manga.js v3.1`; a fonte atual moveu essa lógica para `cm-chapter.js` e o espelho já diverge. |
| 025 | U03 | `function buildChapterSystem(chromeStorage, location) {` | Abre `buildChapterSystem`, fábrica local usada exclusivamente pelo teste; ela não importa nem executa `cm-chapter.js`. |
| 026 | U03 | `    let _chapterIdPromise = null;` | Cria cache local `_chapterIdPromise` para reutilizar a Promise entre chamadas do sistema espelho. |
| 027 | U03 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 028 | U03 | `    function canonicalTitle(t) {` | Declara `canonicalTitle` local; esta função é parte do espelho testado, não a implementação de produção. |
| 029 | U03 | `        // CORREÇÃO v3.2: alinhado com extracted-functions.js` | Comentários descrevem a intenção v3.2 de aceitar prefixo textual+numérico e remover sufixo de site; esses dois comportamentos não existem da mesma forma no `cm-chapter.js` atual. |
| 030 | U03 | `        // 1. Prefixo textual opcional + número: "Cap 5: " além de "1050 - "` | Comentários descrevem a intenção v3.2 de aceitar prefixo textual+numérico e remover sufixo de site; esses dois comportamentos não existem da mesma forma no `cm-chapter.js` atual. |
| 031 | U03 | `        // 2. Strip de sufixo de site: "\| Ler Online", " - Mangás"` | Comentários descrevem a intenção v3.2 de aceitar prefixo textual+numérico e remover sufixo de site; esses dois comportamentos não existem da mesma forma no `cm-chapter.js` atual. |
| 032 | U03 | `        //    Garante que o mesmo capítulo visitado com sufixos diferentes` | Comentários descrevem a intenção v3.2 de aceitar prefixo textual+numérico e remover sufixo de site; esses dois comportamentos não existem da mesma forma no `cm-chapter.js` atual. |
| 033 | U03 | `        //    (variando entre sessões) produza a mesma chave de deduplicação.` | Comentários descrevem a intenção v3.2 de aceitar prefixo textual+numérico e remover sufixo de site; esses dois comportamentos não existem da mesma forma no `cm-chapter.js` atual. |
| 034 | U03 | `        return (t \|\| '')` | Inicia pipeline de normalização usando string vazia para valor falsy. |
| 035 | U03 | `            .replace(/^(?:[A-Za-z]+\\.?\\s+)?\\d+[\\s.\\-\\u2013\\u2014:\|]+/, '')` | Remove prefixo opcional alfabético seguido de número e separador; diverge do `cm-chapter.js`, que remove apenas prefixo iniciado por dígitos. |
| 036 | U03 | `            .replace(/\\s+[-\|\\u2013\\u2014]\\s+.+$/, '')` | Remove sufixo de site do tipo ` \| Site` ou ` - Site`; essa etapa não existe no `canonicalTitle` atual de `cm-chapter.js`. |
| 037 | U03 | `            .replace(/[\|\\u2013\\u2014\\u2022\\u00B7\\[\\]()\\u00AB\\u00BB]/g, ' ')` | Substitui vários separadores Unicode/ASCII por espaço. |
| 038 | U03 | `            .replace(/\\s*[-:]\\s*$/, '')` | Remove hífen ou dois-pontos residuais no fim. |
| 039 | U03 | `            .replace(/\\s{2,}/g, ' ')` | Colapsa sequências de dois ou mais espaços. |
| 040 | U03 | `            .trim()` | Remove espaços das bordas. |
| 041 | U03 | `            .toLowerCase()` | Converte a chave para minúsculas. |
| 042 | U03 | `            .slice(0, 80);` | Limita a chave normalizada a 80 caracteres. |
| 043 | U03 | `    }` | Fecha a função `canonicalTitle` local. |
| 044 | U04 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 045 | U04 | `    function impl() {` | Abre `impl`, implementação assíncrona local de obtenção/criação de chapterId. |
| 046 | U04 | `        return new Promise((resolve, reject) => {` | Cria Promise explícita com caminhos de `resolve` e `reject`. |
| 047 | U04 | `            chromeStorage.get(['chapterList'], (data) => {` | Lê `chapterList` pelo `chromeStorage` injetado. |
| 048 | U04 | `                if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }` | Rejeita se `global chrome.runtime.lastError` estiver presente; apesar de storage ser injetado, a checagem de erro depende do global configurado pelo mock. |
| 049 | U04 | `                const list = data.chapterList \|\| [];` | Normaliza ausência de `chapterList` para array vazio. |
| 050 | U04 | `                const href = location.href;` | Captura a URL da fixture local. |
| 051 | U04 | `                const hostname = location.hostname;` | Captura hostname da fixture local. |
| 052 | U04 | `                const titleKey = canonicalTitle(location.title \|\| '').replace(/[^a-z0-9]/gi, '_');` | Produz `titleKey` usando o `canonicalTitle` espelho e substituição de não alfanuméricos por `_`. |
| 053 | U04 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 054 | U04 | `                // Busca por URL exata primeiro` | Comentário marca a primeira estratégia de lookup: URL exata. |
| 055 | U04 | `                let chapter = list.find(c => c.url === href);` | Procura item de `chapterList` cuja URL seja exatamente igual à URL simulada. |
| 056 | U04 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 057 | U04 | `                // Fallback: mesmo hostname + título normalizado similar` | Comentário marca fallback por hostname e título normalizado. |
| 058 | U04 | `                if (!chapter) {` | Só executa fallback quando a busca por URL exata falhou. |
| 059 | U04 | `                    chapter = list.find(c => {` | Procura capítulo candidato no array persistido. |
| 060 | U04 | `                        if (!c.url) return false;` | Descarta entradas sem URL. |
| 061 | U04 | `                        try {` | Abre `try` para tolerar URLs persistidas inválidas. |
| 062 | U04 | `                            const sameHost = new URL(c.url).hostname === hostname;` | Compara hostname extraído da URL persistida com o hostname da fixture. |
| 063 | U04 | `                            const cKey = canonicalTitle(c.title \|\| '').replace(/[^a-z0-9]/gi, '_');` | Calcula chave normalizada do título persistido usando o espelho local. |
| 064 | U04 | `                            return sameHost && cKey === titleKey;` | Exige simultaneamente mesmo hostname e mesma chave de título. |
| 065 | U04 | `                        } catch { return false; }` | URL inválida no item é tratada como não-match, sem propagar erro. |
| 066 | U04 | `                    });` | Fecha o callback do `find` do fallback. |
| 067 | U04 | `                    if (chapter) {` | Se houve match aproximado, entra no ramo de atualização do registro existente. |
| 068 | U04 | `                        chapter.url = href;` | Atualiza a URL do capítulo espelho para a URL da sessão atual. |
| 069 | U04 | `                        chapter.title = canonicalTitle(location.title \|\| '');` | Atualiza o título persistido com o resultado da normalização local. |
| 070 | U04 | `                        chromeStorage.set({ chapterList: list });` | Dispara `chromeStorage.set({chapterList:list})` sem aguardar Promise/callback; falha desse write não é observada pelo espelho. |
| 071 | U04 | `                    }` | Fecha o ramo de match aproximado/fallback. |
| 072 | U04 | `                }` | Fecha o ramo de match aproximado/fallback. |
| 073 | U04 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 074 | U04 | `                if (chapter) { resolve(chapter.id); return; }` | Se qualquer busca encontrou capítulo, resolve imediatamente com o ID existente. |
| 075 | U04 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 076 | U04 | `                const newId = 'chap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);` | Gera ID local com `Date.now()` + três caracteres pseudoaleatórios; produção atual usa `generateId('chap_')` injetado. |
| 077 | U04 | `                list.push({ id: newId, url: href, title: canonicalTitle(location.title \|\| ''), timestamp: Date.now() });` | Anexa novo capítulo ao array com ID, URL, título normalizado e timestamp. |
| 078 | U04 | `                chromeStorage.set({ chapterList: list }, () => {` | Persiste o array novo e fornece callback para concluir a criação. |
| 079 | U04 | `                    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }` | No callback de escrita, rejeita quando `chrome.runtime.lastError` existe. |
| 080 | U04 | `                    resolve(newId);` | Resolve com o novo ID quando a escrita não reporta erro. |
| 081 | U04 | `                });` | Fecha callback de storage, Promise e função `impl`. |
| 082 | U04 | `            });` | Fecha callback de storage, Promise e função `impl`. |
| 083 | U04 | `        });` | Fecha callback de storage, Promise e função `impl`. |
| 084 | U04 | `    }` | Fecha callback de storage, Promise e função `impl`. |
| 085 | U05 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 086 | U05 | `    function getOrCreate() {` | Abre wrapper `getOrCreate`, responsável pelo cache de Promise do espelho. |
| 087 | U05 | `        if (!_chapterIdPromise) {` | Executa `impl` apenas quando o cache está vazio. |
| 088 | U05 | `            _chapterIdPromise = impl().catch(e => { _chapterIdPromise = null; throw e; });` | Cacheia a Promise e, em rejeição, zera o cache antes de relançar o erro. |
| 089 | U05 | `        }` | Fecha o ramo de inicialização do cache. |
| 090 | U05 | `        return _chapterIdPromise;` | Retorna a Promise cacheada. |
| 091 | U05 | `    }` | Fecha `getOrCreate`. |
| 092 | U05 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 093 | U05 | `    function resetCache() { _chapterIdPromise = null; }` | Expõe reset manual do cache para os testes; produção atual invalida por mudança de `window.location.href` internamente e não expõe este método. |
| 094 | U05 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 095 | U05 | `    return { getOrCreate, resetCache };` | Retorna somente `getOrCreate` e `resetCache` do sistema espelho. |
| 096 | U05 | `}` | Fecha a fábrica local. |
| 097 | U06 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 098 | U06 | `describe('Deduplicação de Capítulos — Integração (BUG #12)', () => {` | Abre suíte Jest nominalmente de integração para BUG #12. |
| 099 | U06 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 100 | U06 | `    let storageMock;` | Declara referência ao singleton `storageMock` compartilhado. |
| 101 | U06 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 102 | U06 | `    beforeEach(() => {` | Abre `beforeEach` local. |
| 103 | U06 | `        storageMock = getStorageMock();` | Obtém o mock de storage; o setup compartilhado já resetou o estado no `beforeEach` do mock. |
| 104 | U06 | `    });` | Fecha setup local. |
| 105 | U06 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 106 | U07 | `    describe('Sessão única', () => {` | Agrupa cenários de uma única sessão. |
| 107 | U07 | `        test('cria novo capítulo na primeira visita', async () => {` | Caso: primeira visita deve criar capítulo. |
| 108 | U07 | `            const system = buildChapterSystem(storageMock, {` | Constrói sistema espelho com URL/hostname/título de One Piece para o primeiro caso. |
| 109 | U07 | `                href: 'https://manga.com/one-piece/cap-1050',` | Constrói sistema espelho com URL/hostname/título de One Piece para o primeiro caso. |
| 110 | U07 | `                hostname: 'manga.com',` | Constrói sistema espelho com URL/hostname/título de One Piece para o primeiro caso. |
| 111 | U07 | `                title: 'One Piece Capítulo 1050 \| Ler Online',` | Constrói sistema espelho com URL/hostname/título de One Piece para o primeiro caso. |
| 112 | U07 | `            });` | Constrói sistema espelho com URL/hostname/título de One Piece para o primeiro caso. |
| 113 | U07 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 114 | U07 | `            const id = await system.getOrCreate();` | Executa `getOrCreate` do espelho. |
| 115 | U07 | `            expect(id).toMatch(/^chap_/);` | Assertion direta: o ID retornado pelo espelho começa com `chap_`. |
| 116 | U07 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 117 | U07 | `            const data = await storageMock.get(['chapterList']);` | Lê `chapterList` do storage mock após a criação. |
| 118 | U07 | `            expect(data.chapterList).toHaveLength(1);` | Assertion direta: o espelho persistiu exatamente um capítulo. |
| 119 | U07 | `        });` | Fecha o teste de primeira visita. |
| 120 | U07 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 121 | U07 | `        test('reutiliza capítulo na segunda chamada (mesma URL)', async () => {` | Caso: reset manual do cache + mesma URL deve reutilizar o mesmo registro. |
| 122 | U07 | `            const system = buildChapterSystem(storageMock, {` | Cria sistema espelho com a mesma fixture do caso anterior. |
| 123 | U07 | `                href: 'https://manga.com/one-piece/cap-1050',` | Cria sistema espelho com a mesma fixture do caso anterior. |
| 124 | U07 | `                hostname: 'manga.com',` | Cria sistema espelho com a mesma fixture do caso anterior. |
| 125 | U07 | `                title: 'One Piece Capítulo 1050 \| Ler Online',` | Cria sistema espelho com a mesma fixture do caso anterior. |
| 126 | U07 | `            });` | Cria sistema espelho com a mesma fixture do caso anterior. |
| 127 | U07 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 128 | U07 | `            const id1 = await system.getOrCreate();` | Obtém o primeiro ID. |
| 129 | U07 | `            system.resetCache();` | Zera manualmente `_chapterIdPromise` via API exclusiva do espelho. |
| 130 | U07 | `            const id2 = await system.getOrCreate();` | Obtém o segundo ID, forçando nova consulta ao storage. |
| 131 | U07 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 132 | U07 | `            expect(id1).toBe(id2);` | Assertion direta: os dois IDs do espelho são iguais. |
| 133 | U07 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 134 | U07 | `            const data = await storageMock.get(['chapterList']);` | Relê `chapterList`. |
| 135 | U07 | `            expect(data.chapterList).toHaveLength(1);` | Assertion direta: continua havendo somente um registro. |
| 136 | U07 | `        });` | Fecha o segundo teste. |
| 137 | U07 | `    });` | Fecha grupo de sessão única. |
| 138 | U08 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 139 | U08 | `    describe('Duas sessões — mesmo capítulo, títulos variando (BUG #12)', () => {` | Agrupa casos que simulam duas sessões com variações de título. |
| 140 | U08 | `        test('Sessão 1: "One Piece Cap 1050 \| Ler" → Sessão 2: "One Piece Cap 1050 - Mangás" → mesmo ID', async () => {` | Caso crítico nominal: sufixo `\| Ler` versus `- Mangás` deve produzir o mesmo ID no espelho. |
| 141 | U08 | `            // Sessão 1` | Comentário marca a primeira sessão. |
| 142 | U08 | `            const system1 = buildChapterSystem(storageMock, {` | Cria primeira instância do espelho com URL sem query e título terminando em `\| Ler`. |
| 143 | U08 | `                href: 'https://manga.com/one-piece/1050',` | Cria primeira instância do espelho com URL sem query e título terminando em `\| Ler`. |
| 144 | U08 | `                hostname: 'manga.com',` | Cria primeira instância do espelho com URL sem query e título terminando em `\| Ler`. |
| 145 | U08 | `                title: 'One Piece Cap 1050 \| Ler',` | Cria primeira instância do espelho com URL sem query e título terminando em `\| Ler`. |
| 146 | U08 | `            });` | Cria primeira instância do espelho com URL sem query e título terminando em `\| Ler`. |
| 147 | U08 | `            const id1 = await system1.getOrCreate();` | Resolve o ID da primeira sessão. |
| 148 | U08 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 149 | U08 | `            // Sessão 2 — URL diferente, título similar` | Comentário marca a segunda sessão. |
| 150 | U08 | `            const system2 = buildChapterSystem(storageMock, {` | Cria segunda instância com URL diferente por query e título terminando em `- Mangás`. |
| 151 | U08 | `                href: 'https://manga.com/one-piece/1050?page=2',` | Cria segunda instância com URL diferente por query e título terminando em `- Mangás`. |
| 152 | U08 | `                hostname: 'manga.com',` | Cria segunda instância com URL diferente por query e título terminando em `- Mangás`. |
| 153 | U08 | `                title: 'One Piece Cap 1050 - Mangás',` | Cria segunda instância com URL diferente por query e título terminando em `- Mangás`. |
| 154 | U08 | `            });` | Cria segunda instância com URL diferente por query e título terminando em `- Mangás`. |
| 155 | U08 | `            const id2 = await system2.getOrCreate();` | Resolve o ID da segunda sessão, obrigando fallback por hostname+título do espelho. |
| 156 | U08 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 157 | U08 | `            // Devem ser o mesmo capítulo` | Comentário explicita a expectativa de deduplicação. |
| 158 | U08 | `            expect(id1).toBe(id2);` | Assertion direta apenas sobre o espelho: IDs das duas sessões são iguais. |
| 159 | U08 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 160 | U08 | `            const data = await storageMock.get(['chapterList']);` | Relê a lista persistida. |
| 161 | U08 | `            expect(data.chapterList).toHaveLength(1);` | Assertion direta apenas sobre o espelho: existe um único capítulo. |
| 162 | U08 | `        });` | Fecha o caso de sufixos variáveis. |
| 163 | U08 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 164 | U09 | `        test('capítulos DIFERENTES não devem ser agrupados', async () => {` | Caso negativo: capítulos distintos da mesma obra não podem colidir. |
| 165 | U09 | `            const system1050 = buildChapterSystem(storageMock, {` | Cria sistema para capítulo 1050. |
| 166 | U09 | `                href: 'https://manga.com/one-piece/1050',` | Cria sistema para capítulo 1050. |
| 167 | U09 | `                hostname: 'manga.com',` | Cria sistema para capítulo 1050. |
| 168 | U09 | `                title: 'One Piece Cap 1050',` | Cria sistema para capítulo 1050. |
| 169 | U09 | `            });` | Cria sistema para capítulo 1050. |
| 170 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 171 | U09 | `            const system1051 = buildChapterSystem(storageMock, {` | Cria sistema para capítulo 1051. |
| 172 | U09 | `                href: 'https://manga.com/one-piece/1051',` | Cria sistema para capítulo 1051. |
| 173 | U09 | `                hostname: 'manga.com',` | Cria sistema para capítulo 1051. |
| 174 | U09 | `                title: 'One Piece Cap 1051',` | Cria sistema para capítulo 1051. |
| 175 | U09 | `            });` | Cria sistema para capítulo 1051. |
| 176 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 177 | U09 | `            const id1050 = await system1050.getOrCreate();` | Resolve IDs das duas fixtures de capítulos distintos. |
| 178 | U09 | `            const id1051 = await system1051.getOrCreate();` | Resolve IDs das duas fixtures de capítulos distintos. |
| 179 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 180 | U09 | `            expect(id1050).not.toBe(id1051);` | Assertion direta: IDs do espelho devem ser diferentes. |
| 181 | U09 | `            const data = await storageMock.get(['chapterList']);` | Relê `chapterList` do mock. |
| 182 | U09 | `            expect(data.chapterList).toHaveLength(2);` | Assertion direta: duas entradas distintas permanecem persistidas. |
| 183 | U09 | `        });` | Fecha caso de capítulos diferentes. |
| 184 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 185 | U09 | `        test('obras DIFERENTES não devem ser agrupadas', async () => {` | Caso negativo: obras diferentes no mesmo domínio não devem colidir. |
| 186 | U09 | `            const naruto = buildChapterSystem(storageMock, {` | Cria sistema espelho para Naruto. |
| 187 | U09 | `                href: 'https://manga.com/naruto/1',` | Cria sistema espelho para Naruto. |
| 188 | U09 | `                hostname: 'manga.com',` | Cria sistema espelho para Naruto. |
| 189 | U09 | `                title: 'Naruto Capítulo 1',` | Cria sistema espelho para Naruto. |
| 190 | U09 | `            });` | Cria sistema espelho para Naruto. |
| 191 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 192 | U09 | `            const bleach = buildChapterSystem(storageMock, {` | Cria sistema espelho para Bleach. |
| 193 | U09 | `                href: 'https://manga.com/bleach/1',` | Cria sistema espelho para Bleach. |
| 194 | U09 | `                hostname: 'manga.com',` | Cria sistema espelho para Bleach. |
| 195 | U09 | `                title: 'Bleach Capítulo 1',` | Cria sistema espelho para Bleach. |
| 196 | U09 | `            });` | Cria sistema espelho para Bleach. |
| 197 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 198 | U09 | `            const idN = await naruto.getOrCreate();` | Resolve IDs das duas obras. |
| 199 | U09 | `            const idB = await bleach.getOrCreate();` | Resolve IDs das duas obras. |
| 200 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 201 | U09 | `            expect(idN).not.toBe(idB);` | Assertion direta: IDs do espelho para obras diferentes são distintos. |
| 202 | U09 | `        });` | Fecha caso de obras diferentes. |
| 203 | U09 | `    });` | Fecha grupo de duas sessões. |
| 204 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 205 | U10 | `    describe('Imagens salvas no mesmo capítulo (integração com storage)', () => {` | Abre cenário nominal de integração com storage de imagens. |
| 206 | U10 | `        test('imagens de duas sessões são salvas sob o mesmo chapterId', async () => {` | Caso: duas sessões devem usar o mesmo `chapterId` e acumular duas páginas. |
| 207 | U10 | `            // Sessão 1: traduz página 0` | Comentário marca a primeira sessão. |
| 208 | U10 | `            const sys1 = buildChapterSystem(storageMock, {` | Cria espelho para a primeira sessão de `Test Chapter 1`. |
| 209 | U10 | `                href: 'https://manga.com/chapter/1',` | Cria espelho para a primeira sessão de `Test Chapter 1`. |
| 210 | U10 | `                hostname: 'manga.com',` | Cria espelho para a primeira sessão de `Test Chapter 1`. |
| 211 | U10 | `                title: 'Test Chapter 1',` | Cria espelho para a primeira sessão de `Test Chapter 1`. |
| 212 | U10 | `            });` | Cria espelho para a primeira sessão de `Test Chapter 1`. |
| 213 | U10 | `            const chapId = await sys1.getOrCreate();` | Resolve `chapId` da primeira sessão. |
| 214 | U10 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 215 | U10 | `            // Salva imagem da sessão 1` | Comentário anuncia gravação da primeira imagem. |
| 216 | U10 | `            await storageMock.set({ [\`${chapId}_images\`]: { 0: 'data:image/png;base64,sess1page0' } });` | Escreve manualmente `${chapId}_images` no mock; não chama `persistTranslatedPage` nem Storage Manager real. |
| 217 | U10 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 218 | U10 | `            // Sessão 2: traduz página 1 (URL ligeiramente diferente, título igual)` | Comentário marca segunda sessão com URL alterada por query. |
| 219 | U10 | `            const sys2 = buildChapterSystem(storageMock, {` | Cria segunda instância do espelho para o mesmo título. |
| 220 | U10 | `                href: 'https://manga.com/chapter/1?p=2',` | Cria segunda instância do espelho para o mesmo título. |
| 221 | U10 | `                hostname: 'manga.com',` | Cria segunda instância do espelho para o mesmo título. |
| 222 | U10 | `                title: 'Test Chapter 1',` | Cria segunda instância do espelho para o mesmo título. |
| 223 | U10 | `            });` | Cria segunda instância do espelho para o mesmo título. |
| 224 | U10 | `            const chapId2 = await sys2.getOrCreate();` | Resolve o ID da segunda sessão. |
| 225 | U10 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 226 | U10 | `            // Deve ser o mesmo capítulo` | Comentário explicita a expectativa de mesmo capítulo. |
| 227 | U10 | `            expect(chapId2).toBe(chapId);` | Assertion direta sobre o espelho: segunda sessão recupera o mesmo ID. |
| 228 | U10 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 229 | U10 | `            // Adiciona imagem da sessão 2` | Comentário anuncia merge manual da segunda imagem. |
| 230 | U10 | `            const data = await storageMock.get([\`${chapId}_images\`]);` | Lê manualmente o mapa legado `${chapId}_images`. |
| 231 | U10 | `            const images = data[\`${chapId}_images\`] \|\| {};` | Normaliza ausência do mapa para objeto vazio. |
| 232 | U10 | `            images[1] = 'data:image/png;base64,sess2page1';` | Adiciona manualmente índice 1 ao objeto lido. |
| 233 | U10 | `            await storageMock.set({ [\`${chapId}_images\`]: images });` | Persiste manualmente o objeto atualizado; novamente não passa pelo caminho de produção. |
| 234 | U10 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 235 | U10 | `            // Verifica que ambas estão no mesmo capítulo` | Comentário anuncia verificação do mapa combinado. |
| 236 | U10 | `            const finalData = await storageMock.get([\`${chapId}_images\`]);` | Relê o mapa legado manualmente. |
| 237 | U10 | `            expect(Object.keys(finalData[\`${chapId}_images\`])).toHaveLength(2);` | Assertion direta apenas sobre a manipulação do mock: existem duas chaves de imagem. |
| 238 | U10 | `        });` | Fecha caso de imagens. |
| 239 | U10 | `    });` | Fecha grupo de persistência manual. |
| 240 | U10 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 241 | U11 | `    describe('Domínios diferentes não interferem', () => {` | Abre casos de isolamento entre domínios. |
| 242 | U11 | `        test('mesmo título em domínios diferentes gera capítulos separados', async () => {` | Caso: mesmo título em hostnames diferentes deve gerar IDs distintos no espelho. |
| 243 | U11 | `            const siteA = buildChapterSystem(storageMock, {` | Cria fixture para `siteA.com`. |
| 244 | U11 | `                href: 'https://siteA.com/chapter/1',` | Cria fixture para `siteA.com`. |
| 245 | U11 | `                hostname: 'siteA.com',` | Cria fixture para `siteA.com`. |
| 246 | U11 | `                title: 'Same Title',` | Cria fixture para `siteA.com`. |
| 247 | U11 | `            });` | Cria fixture para `siteA.com`. |
| 248 | U11 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 249 | U11 | `            const siteB = buildChapterSystem(storageMock, {` | Cria fixture para `siteB.com`. |
| 250 | U11 | `                href: 'https://siteB.com/chapter/1',` | Cria fixture para `siteB.com`. |
| 251 | U11 | `                hostname: 'siteB.com',` | Cria fixture para `siteB.com`. |
| 252 | U11 | `                title: 'Same Title',` | Cria fixture para `siteB.com`. |
| 253 | U11 | `            });` | Cria fixture para `siteB.com`. |
| 254 | U11 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 255 | U11 | `            const idA = await siteA.getOrCreate();` | Resolve IDs dos dois domínios. |
| 256 | U11 | `            const idB = await siteB.getOrCreate();` | Resolve IDs dos dois domínios. |
| 257 | U11 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 258 | U11 | `            expect(idA).not.toBe(idB);` | Assertion direta: o fallback do espelho respeita hostname e retorna IDs diferentes. |
| 259 | U11 | `        });` | Fecha teste de domínios. |
| 260 | U11 | `    });` | Fecha grupo de isolamento por domínio. |
| 261 | U11 | `});` | Fecha a suíte Jest principal. |
| 262 | U12 | ␠ [linha vazia] | Newline terminal do arquivo; posição física final explicitamente auditada. |

## 13. Auditoria final

- [x] reserva exclusiva confirmada para **AGENTE 22**;
- [x] SHA do fonte reconfirmado antes da materialização da Bíblia;
- [x] 261 linhas textuais + newline final = **262/262 posições documentadas**;
- [x] imports, mock, wiring Jest, package e CI cruzados;
- [x] implementação espelho separada explicitamente da implementação de produção;
- [x] divergências de canonicalização, cache, ID e persistência registradas;
- [x] assertions classificadas sem promovê-las indevidamente a prova do produto real;
- [x] três necessidades externas persistidas como `audit_requests`;
- [x] nenhum código, teste, fixture, workflow ou config foi alterado.

**Reparo editorial 2026-10-01:** findings da auditoria independente corrigidos sem alterar o source: fonte integral canônica adicionada; SHA de `package.json` atualizado para o blob atual; wiring da CI reclassificado como gate estático; 107-001..003 alinhadas ao state canônico `ACCEPTED`. Reauditoria independente continua necessária.

**Conclusão documental:** a Bíblia está completa para o SHA `e62187cd957a2fe241e4e704aaa9f8285e89162e`. O arquivo é uma suíte executável de integração **por wiring**, mas sua principal lógica funcional é uma **simulação local divergente**. As solicitações OPEN não impedem a conclusão documental.

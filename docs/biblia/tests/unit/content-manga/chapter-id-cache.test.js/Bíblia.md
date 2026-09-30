# Bíblia técnica — tests/unit/content-manga/chapter-id-cache.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `7bc23a456be69aaac252e7acea2b498d61a07520`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** stub Jest histórico / mirror v3.0  
> **Linhas textuais:** 84  
> **Posições documentais:** 85, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é explicitamente identificado como **STUB ORIGINAL (v3.0)**.

Ele não carrega `extension/content/cm-chapter.js` nem instancia `MangaTranslatorChapter.createChapterManager()`.

Em vez disso, define localmente `createSystem()` com uma implementação simplificada de cache de Promise e testa três propriedades do mirror:

1. cria capítulo na primeira chamada;
2. chamadas subsequentes resolvem para o mesmo ID;
3. chamadas paralelas não inserem capítulos duplicados.

## 2. Implementação realmente executada

O objeto sob teste é:

```text
createSystem(storageMock, location)
  -> _cache local
  -> impl() local
  -> storageMock.get/set
```

A implementação de produção atual está em:

```text
extension/content/cm-chapter.js
  -> createChapterManager()
  -> getOrCreateChapterId()
  -> getOrCreateChapterIdImpl()
```

Portanto as assertions deste arquivo são prova do mirror, não do runtime.

## 3. Contrato do mirror

### Primeira chamada

Sem capítulo existente:
- lê `chapterList`;
- cria ID `chap_${Date.now()}`;
- adiciona URL/título;
- grava no storage;
- resolve o ID.

### Cache

`getOrCreate()` faz:

```js
if (!_cache) _cache = impl();
return _cache;
```

A mesma Promise local é reutilizada enquanto o sistema existir.

### Paralelismo

Três chamadas simultâneas recebem o mesmo `_cache`.

Após resolução, o storage possui apenas uma entrada em `chapterList`.

## 4. Diferenças para produção atual

A produção atual possui semântica adicional ausente do stub:

- cache é associado a `window.location.href`;
- mudança de URL limpa `chapterIdPromise`;
- rejeição limpa o cache para permitir retry;
- `storage.get` e `storage.set` propagam `chrome.runtime.lastError`;
- busca por URL exata;
- fallback por hostname + título canonicalizado;
- atualização de URL/título quando encontra capítulo equivalente;
- ID vem de `generateId('chap_')`;
- grava timestamp.

Logo o stub v3.0 não é semanticamente equivalente ao runtime atual.

## 5. Relação com outras suítes

`chapter-id-rejection.test.js` também declara uma implementação espelho, agora da lógica de rejeição v3.1.

`tests/integration/chapter-dedup.test.js` também declara um `buildChapterSystem` mirror.

Na busca desta auditoria não foi localizada suíte que invoque diretamente `createChapterManager()` real.

## 6. Evidência por teste

### “cria novo capítulo”

Prova que o mirror cria ID com prefixo `chap_`.

Não prova `generateId` real.

### “reutiliza Promise cacheada”

O teste faz:

```js
const id1 = await sys.getOrCreate();
const id2 = await sys.getOrCreate();
expect(id1).toBe(id2);
```

Isso prova igualdade do resultado.

Não prova diretamente identidade da Promise porque as Promises já foram aguardadas.

### “chamadas paralelas”

É o caso mais forte:
- três calls simultâneas;
- todos os IDs iguais;
- apenas um capítulo no storage.

Isso prova deduplicação concorrente do mirror.

## 7. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| mirror cria ID chap_* | teste 1 | ✅ PROVADO DIRETAMENTE — mirror |
| mirror retorna mesmo ID | teste 2 | ✅ PROVADO DIRETAMENTE — mirror |
| mirror evita duplicação paralela | teste 3 | ✅ PROVADO DIRETAMENTE — mirror |
| mesma Promise object é retornada | código local faz, assertion compara só IDs | 🟨 EXECUTADO/ESTRUTURAL |
| produção real cacheia Promise | cm-chapter.js não é importado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| produção invalida cache ao mudar URL | inexistente no mirror | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| produção limpa cache em rejeição | inexistente no mirror | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback hostname+título | inexistente no mirror | ⚠️ SEM TESTE NESTE ARQUIVO |
| lastError get/set | inexistente no mirror | ⚠️ SEM TESTE NESTE ARQUIVO |

## 8. Solicitações ao auditor

### 198-001 — TEST_AUTHENTICITY — OPEN

**Encontrado:** o arquivo testa `createSystem()` definido dentro do próprio teste, não `createChapterManager()` real.

**Evidência atual:** três assertions coerentes do mirror v3.0.

**Evidência ausente:** execução do `getOrCreateChapterId()` atual de `cm-chapter.js`.

**Ação solicitada:** adicionar suíte que carregue `cm-chapter.js`, instancie `createChapterManager` com dependências controladas e execute o método real.

**Evidência esperada:** cache, criação e deduplicação paralela falham se o runtime real regredir.

**Risco:** mirror permanece verde enquanto a produção muda.

**Severidade:** HIGH.

### 198-002 — STALE_TEST_CONTRACT — OPEN

**Encontrado:** o stub histórico não contém invalidação por URL nem limpeza do cache após rejeição, ambos presentes na produção atual.

**Evidência atual:** comentários reconhecem que é v3.0/happy path.

**Evidência ausente:** gate real para troca de `window.location.href` e retry após falha usando `cm-chapter.js`.

**Ação solicitada:** manter este arquivo claramente histórico ou migrar seus casos para o módulo real; garantir testes reais para URL change + rejection retry.

**Evidência esperada:** navegação para outro capítulo não reutiliza ID antigo e falha de storage não envenena o cache.

**Risco:** bugs de cache cross-chapter ou Promise morta podem escapar.

**Severidade:** HIGH.

### 198-003 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** o teste chamado “reutiliza Promise cacheada” compara apenas IDs resolvidos.

**Evidência atual:** o código local retorna a mesma Promise, e o teste paralelo prova deduplicação.

**Evidência ausente:** assertion explícita `p1 === p2` antes do await.

**Ação solicitada:** se identidade da Promise for contrato relevante, capturar duas chamadas antes da resolução e exigir `toBe`.

**Risco:** baixo; implementações com Promises distintas mas mesmo ID poderiam passar o teste nominal.

**Severidade:** LOW.

## 9. Fonte integral auditada

```js
/**
 * chapter-id-cache.test.js — STUB ORIGINAL (v3.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa o comportamento básico de cache de getOrCreateChapterId().
 *
 * POR QUE ESTE ARQUIVO EXISTE JUNTO COM chapter-id-rejection.test.js?
 * Este stub cobre apenas o "happy path": a Promise é cacheada e reutilizada.
 * A versão rejection (v3.1) adicionou o teste do caso de FALHA — quando
 * o storage falha, a Promise deve ser rejeitada E o cache deve ser limpo
 * para permitir nova tentativa (BUG #11 Fix).
 *
 * O código original (v3.0) NUNCA rejeitava. Se chrome.storage.get falhasse,
 * a Promise ficava pendente para sempre. O cache armazenava essa Promise
 * morta, silenciosamente bloqueando toda escrita de imagem traduzida.
 *
 * VEJA: chapter-id-rejection.test.js para o teste de BUG #11.
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

describe('getOrCreateChapterId() — Cache de Promise (stub v3.0)', () => {
    let storageMock;

    beforeEach(() => {
        storageMock = getStorageMock();
    });

    function createSystem(storageMock, location) {
        let _cache = null;

        function impl() {
            return new Promise((resolve) => {
                storageMock.get(['chapterList'], (data) => {
                    const list = data.chapterList || [];
                    let chapter = list.find(c => c.url === location.href);
                    if (chapter) { resolve(chapter.id); return; }

                    const newId = 'chap_' + Date.now();
                    list.push({ id: newId, url: location.href, title: location.title || '' });
                    storageMock.set({ chapterList: list }, () => resolve(newId));
                });
            });
        }

        return {
            getOrCreate() {
                if (!_cache) _cache = impl();
                return _cache;
            }
        };
    }

    test('cria novo capítulo na primeira chamada', async () => {
        const sys = createSystem(storageMock, { href: 'https://manga.com/1', title: 'Test' });
        const id = await sys.getOrCreate();
        expect(id).toMatch(/^chap_/);
    });

    test('reutiliza Promise cacheada em chamadas subsequentes', async () => {
        const sys = createSystem(storageMock, { href: 'https://manga.com/1', title: 'Test' });
        const id1 = await sys.getOrCreate();
        const id2 = await sys.getOrCreate();
        expect(id1).toBe(id2);
    });

    test('chamadas paralelas não criam capítulos duplicados', async () => {
        const sys = createSystem(storageMock, { href: 'https://manga.com/1', title: 'Test' });
        const [a, b, c] = await Promise.all([
            sys.getOrCreate(), sys.getOrCreate(), sys.getOrCreate()
        ]);
        expect(a).toBe(b);
        expect(b).toBe(c);

        const data = await storageMock.get(['chapterList']);
        expect(data.chapterList).toHaveLength(1);
    });
});
```

## 10. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–16 | documentação histórica v3.0/BUG #11 |
| 18–25 | imports/root/storage mock |
| 27–35 | describe/setup |
| 37–59 | mirror createSystem |
| 61–65 | criação inicial |
| 67–72 | reutilização por resultado |
| 74–83 | concorrência e ausência de duplicação |
| 84 | fecha describe |
| posição 85 | newline final |

## 11. Autoauditoria do AGENTE 17

- [x] reserva #198 criada e relida;
- [x] state próprio criado;
- [x] produção real `cm-chapter.js` comparada;
- [x] outras suítes relacionadas pesquisadas;
- [x] fonte integral incorporada;
- [x] 84 linhas + newline = 85 posições;
- [x] mirror não promovido a prova de produção;
- [x] três solicitações registradas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #198 é uma prova válida do mirror histórico v3.0, mas não constitui prova automatizada do cache atual de `cm-chapter.js`.

# Bíblia técnica — tests/unit/content-manga/chapter-id-rejection.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `783c8abd86029345a97ce44f4eaf5415274bf4b3`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest baseada em mirror controlável de chapter ID  
> **Linhas textuais:** 227  
> **Posições documentais:** 228, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo documenta/testa a correção histórica do BUG #11: uma Promise de criação/recuperação de capítulo que, em versões antigas, podia permanecer pendente para sempre quando storage falhava.

A suíte não importa `extension/content/cm-chapter.js`.

Ela define localmente:

```text
createGetOrCreateChapterId(chromeStorage, location)
```

e testa esse mirror.

## 2. Contrato do mirror

O mirror possui:

- `_chapterIdPromise` cacheada;
- lookup por URL exata;
- criação com `chap_${Date.now()}`;
- escrita em `chapterList`;
- rejeição simulada no get;
- rejeição simulada no set;
- `.catch()` que limpa cache antes de relançar;
- coalescência de chamadas paralelas.

## 3. Caminho normal

A suíte prova no mirror:

- criação de ID quando capítulo não existe;
- reutilização do mesmo resultado em chamadas subsequentes;
- persistência de uma entrada em `chapterList`;
- reaproveitamento de capítulo existente por URL.

## 4. BUG #11 — rejeição e retry

Os casos centrais provam no mirror:

- falha de get rejeita;
- rejeição limpa `_chapterIdPromise`;
- nova tentativa após remover a falha funciona;
- falha de set rejeita.

Isso captura corretamente a intenção histórica da correção.

## 5. Concorrência

Cinco chamadas simultâneas resolvem para o mesmo ID.

Três chamadas paralelas resultam em apenas um capítulo persistido.

Logo a coalescência do mirror é diretamente testada.

## 6. Diferenças para o runtime atual

O runtime atual está em `extension/content/cm-chapter.js`.

Hoje `getOrCreateChapterId()` inclui comportamentos que o mirror não possui:

1. cache associado a `window.location.href`;
2. mudança de URL limpa o cache;
3. `chapterIdUrl` separado da Promise;
4. `chrome.runtime.lastError` real em get/set;
5. lookup por URL exata;
6. fallback por hostname + título canonicalizado;
7. atualização de URL/título quando encontra capítulo equivalente;
8. ID por `generateId('chap_')`;
9. timestamp;
10. canonicalização atual mais ampla que a regex histórica deste teste.

Assim, o comentário “espelha exatamente a lógica do content_manga.js v3.1” é histórico e não descreve o runtime atual.

## 7. Canonicalização

O mirror local usa:

```js
.replace(/^\d+[\s.\-–—:|]+/, '')
.replace(/\s{2,}/g, ' ')
.trim()
.toLowerCase()
.slice(0, 80)
```

A implementação atual de `cm-chapter.js` usa `canonicalTitle()` mais completa e também a utiliza para deduplicação por hostname+título.

Portanto os testes deste arquivo não protegem a canonicalização moderna.

## 8. Simulação de erro

A suíte usa flags privadas do mock:

```text
storageMock._simulateError
storageMock._simulateSetError
```

O runtime, por outro lado, observa `chrome.runtime.lastError` dentro dos callbacks.

Essas duas coisas representam a mesma intenção de falha, mas não são a mesma execução.

## 9. Relação com #198

#198 é o stub v3.0 de happy path.

#199 adiciona rejeição, limpeza de cache e retry, porém continua sendo mirror.

Os dois juntos documentam a evolução histórica, mas nenhum substitui um teste direto de `createChapterManager()` atual.

## 10. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| mirror cria capítulo novo | testes normais | ✅ PROVADO DIRETAMENTE — mirror |
| mirror reaproveita URL existente | teste normal | ✅ PROVADO DIRETAMENTE — mirror |
| mirror rejeita get simulado | BUG #11 tests | ✅ PROVADO DIRETAMENTE — mirror |
| mirror limpa cache após rejeição | BUG #11 tests | ✅ PROVADO DIRETAMENTE — mirror |
| mirror permite retry | BUG #11 tests | ✅ PROVADO DIRETAMENTE — mirror |
| mirror rejeita set simulado | BUG #11 tests | ✅ PROVADO DIRETAMENTE — mirror |
| mirror coalesce chamadas paralelas | testes finais | ✅ PROVADO DIRETAMENTE — mirror |
| runtime real usa lastError corretamente | não executado aqui | ⚠️ SEM TESTE PROBATÓRIO NESTE ARQUIVO |
| runtime real limpa cache após erro | lógica existe no source, não executada aqui | 🟦 GATE ESTÁTICO / NÃO EXECUTADO |
| runtime invalida cache quando URL muda | ausente do mirror | ⚠️ SEM TESTE PROBATÓRIO NESTE ARQUIVO |
| fallback hostname+título | ausente do mirror | ⚠️ SEM TESTE NESTE ARQUIVO |
| canonicalTitle moderno | ausente do mirror | ⚠️ SEM TESTE NESTE ARQUIVO |

## 11. Solicitações ao auditor

### 199-001 — TEST_AUTHENTICITY — OPEN

**Encontrado:** todos os comportamentos são exercitados em `createGetOrCreateChapterId()` local, não no `createChapterManager()` real.

**Evidência atual:** mirror cobre muito bem a intenção do BUG #11.

**Evidência ausente:** callback real de `chrome.storage.local.get/set`, `chrome.runtime.lastError` e cache real do módulo.

**Ação solicitada:** criar suíte direta de `cm-chapter.js` com storage mock controlável e executar `getOrCreateChapterId()` real para get-error, set-error, cache-null e retry.

**Evidência esperada:** regressão no runtime real quebra a suíte sem depender de atualizar mirror.

**Risco:** mirror permanece verde enquanto implementação real diverge.

**Severidade:** HIGH.

### 199-002 — STALE_TEST_CONTRACT — OPEN

**Encontrado:** o comentário afirma espelhar exatamente a lógica v3.1, mas o runtime atual ganhou URL-scoped cache, fallback hostname+título, canonicalização nova e `generateId`.

**Evidência atual:** o núcleo reject→clear→retry continua semanticamente equivalente.

**Ação solicitada:** reclassificar explicitamente este arquivo como regressão histórica/mirror ou migrar seus casos para o módulo real.

**Evidência esperada:** descrição alinhada ao objeto efetivamente testado.

**Risco:** leitores superestimam a cobertura atual.

**Severidade:** HIGH.

### 199-003 — TEST_REQUIRED — OPEN

**Encontrado:** a invalidação de `chapterIdPromise` quando `window.location.href` muda não é representada no mirror.

**Evidência atual:** `cm-chapter.js` possui `chapterIdUrl` e limpa cache ao detectar URL diferente.

**Evidência ausente:** teste direto de navegação SPA/mesma instância do content script entre capítulos.

**Ação solicitada:** no teste do módulo real, resolver capítulo A, mudar `window.location.href`, chamar novamente e provar que capítulo B não reutiliza o ID de A.

**Evidência esperada:** cache é scoped pela URL atual.

**Risco:** tradução de capítulo novo pode ser associada ao capítulo anterior.

**Severidade:** HIGH.

## 12. Fonte integral auditada

```js
/**
 * chapter-id-rejection.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa a correção da Promise não-rejeitável em _getOrCreateChapterIdImpl (BUG #11).
 *
 * PROBLEMA ORIGINAL: A Promise usava apenas `resolve` — nunca `reject`.
 * Se chrome.storage falhasse (SW reiniciando, storage corrompido), a Promise
 * ficava pendente para sempre. O wrapper `getOrCreateChapterId` cacheava essa
 * Promise morta, impedindo qualquer escrita de imagem traduzida no storage
 * silenciosamente, até a página ser recarregada.
 *
 * CORREÇÃO: `reject` adicionado + verificação de `chrome.runtime.lastError` em
 * ambos os callbacks (get e set). O `.catch` do wrapper agora limpa o cache.
 *
 * ABORDAGEM: Testa a lógica de cache + reject através de uma implementação
 * espelho controlável — o comportamento real é o que importa, não o código interno.
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

// ── Implementação espelho de getOrCreateChapterId para testes controlados ────
// Esta implementação espelha exatamente a lógica do content_manga.js v3.1.
function createGetOrCreateChapterId(chromeStorage, location) {
    let _chapterIdPromise = null;

    function canonicalTitle(t) {
        return (t || '').replace(/^\d+[\s.\-–—:|]+/, '').replace(/\s{2,}/g, ' ').trim().toLowerCase().slice(0, 80);
    }

    function _impl() {
        return new Promise((resolve, reject) => {
            chromeStorage.get(['chapterList'], (data) => {
                if (chromeStorage._simulateError) {
                    reject(new Error('storage.get falhou: simulado'));
                    return;
                }
                const list = data.chapterList || [];
                let chapter = list.find(c => c.url === location.href);
                if (chapter) { resolve(chapter.id); return; }

                const newId = 'chap_' + Date.now();
                list.push({ id: newId, url: location.href, title: canonicalTitle(location.title || ''), timestamp: Date.now() });
                chromeStorage.set({ chapterList: list }, () => {
                    if (chromeStorage._simulateSetError) {
                        reject(new Error('storage.set falhou: simulado'));
                        return;
                    }
                    resolve(newId);
                });
            });
        });
    }

    function getOrCreate() {
        if (!_chapterIdPromise) {
            _chapterIdPromise = _impl().catch(e => {
                _chapterIdPromise = null; // Limpa cache no erro — BUG #11 Fix
                throw e;
            });
        }
        return _chapterIdPromise;
    }

    return { getOrCreate, getCache: () => _chapterIdPromise };
}

describe('CM-88/CM-89/CM-90/CM-91/CM-92/CM-93: _getOrCreateChapterIdImpl — Promise com Reject (BUG #11)', () => {

    let storageMock;

    beforeEach(() => {
        storageMock = getStorageMock();
        storageMock._simulateError = false;
        storageMock._simulateSetError = false;
    });

    describe('Comportamento normal (sem erros)', () => {
        test('resolve com novo ID quando capítulo não existe', async () => {
            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'One Piece Cap 1'
            });

            const id = await system.getOrCreate();
            expect(id).toMatch(/^chap_\d+/);
        });

        test('retorna o mesmo ID em chamadas subsequentes (cache)', async () => {
            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'Test'
            });

            const id1 = await system.getOrCreate();
            const id2 = await system.getOrCreate();
            expect(id1).toBe(id2);
        });

        test('salva o capítulo no storage', async () => {
            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'Test Chapter'
            });

            await system.getOrCreate();
            const data = await storageMock.get(['chapterList']);
            expect(data.chapterList).toHaveLength(1);
            expect(data.chapterList[0].url).toBe('https://manga.com/cap/1');
        });

        test('reutiliza capítulo existente (mesma URL)', async () => {
            await storageMock.set({
                chapterList: [{ id: 'chap_existing', url: 'https://manga.com/cap/1', title: 'test', timestamp: 1 }]
            });

            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'Test'
            });

            const id = await system.getOrCreate();
            expect(id).toBe('chap_existing');
        });
    });

    describe('Comportamento com falha de storage (BUG #11 Fix)', () => {
        test('rejeita a Promise quando storage.get falha', async () => {
            storageMock._simulateError = true;

            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'Test'
            });

            await expect(system.getOrCreate()).rejects.toThrow('storage.get falhou');
        });

        test('limpa o cache após rejeição (permite nova tentativa)', async () => {
            storageMock._simulateError = true;

            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'Test'
            });

            try { await system.getOrCreate(); } catch (e) { /* esperado */ }

            // Cache deve ser null após a rejeição
            expect(system.getCache()).toBeNull();
        });

        test('após limpar cache, nova chamada bem-sucedida funciona', async () => {
            storageMock._simulateError = true;

            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'Test'
            });

            // Primeira tentativa falha
            try { await system.getOrCreate(); } catch (e) { /* esperado */ }

            // Corrige o erro e tenta novamente
            storageMock._simulateError = false;
            const id = await system.getOrCreate();
            expect(id).toMatch(/^chap_\d+/);
        });

        test('rejeita quando storage.set falha', async () => {
            storageMock._simulateSetError = true;

            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/2',
                title: 'New Chapter'
            });

            await expect(system.getOrCreate()).rejects.toThrow('storage.set falhou');
        });
    });

    describe('Chamadas simultâneas (paralelismo)', () => {
        test('múltiplas chamadas simultâneas retornam o mesmo ID (cache de Promise)', async () => {
            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'Test'
            });

            // Simula 5 imagens chegando "ao mesmo tempo" (paralelo)
            const [id1, id2, id3, id4, id5] = await Promise.all([
                system.getOrCreate(),
                system.getOrCreate(),
                system.getOrCreate(),
                system.getOrCreate(),
                system.getOrCreate(),
            ]);

            expect(id1).toBe(id2);
            expect(id2).toBe(id3);
            expect(id3).toBe(id4);
            expect(id4).toBe(id5);
        });

        test('chamadas paralelas não criam duplicatas no storage', async () => {
            const system = createGetOrCreateChapterId(storageMock, {
                href: 'https://manga.com/cap/1',
                title: 'Test'
            });

            await Promise.all([
                system.getOrCreate(),
                system.getOrCreate(),
                system.getOrCreate(),
            ]);

            const data = await storageMock.get(['chapterList']);
            // Deve haver exatamente 1 capítulo, não 3
            expect(data.chapterList).toHaveLength(1);
        });
    });
});
```

## 13. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–17 | contexto do BUG #11 e abordagem mirror |
| 19–27 | imports/root/storage mock |
| 29–70 | implementação espelho |
| 72–80 | describe/setup |
| 82–133 | happy path |
| 135–190 | falhas get/set, limpeza e retry |
| 192–226 | paralelismo/deduplicação |
| 227 | fecha describe |
| posição 228 | newline final |

## 14. Autoauditoria do AGENTE 17

- [x] reserva #199 criada e relida;
- [x] state próprio criado;
- [x] mirror comparado ao `cm-chapter.js` atual;
- [x] diferenças de URL cache/canonicalização/fallback registradas;
- [x] fonte integral incorporada;
- [x] 227 linhas + newline = 228 posições;
- [x] prova de mirror separada de prova de runtime;
- [x] três solicitações persistíveis identificadas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #199 é uma regressão histórica útil do BUG #11, mas não é prova direta de que o `cm-chapter.js` atual mantém esses contratos.

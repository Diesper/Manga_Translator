# Bíblia técnica — tests/unit/content-manga/auto-restore-system.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `3aa7a39030aba4577f530f575869a6d535d1c3a3`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest histórica baseada em mirrors/simulações locais  
> **Linhas textuais:** 261  
> **Posições documentais:** 262, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte documenta o comportamento histórico do Auto-Restore v3.2, mas **não carrega o módulo real `extension/content/cm-auto-restore.js`** nem o content script completo.

Ela define localmente:

- `getCleanUrl()`;
- `createAutoRestoreSystem()`;
- `applyImageReplacement()`;
- `applyAutoRestore()`;
- debounce manual de 150 ms;
- writes diretos no storage mock.

Portanto a evidência é direta sobre o mirror e indireta sobre o runtime atual.

## 2. Contratos cobertos pelo mirror

A suíte prova no sistema local:

1. clean URL remove querystring/token;
2. imagem presente no restoreMap é substituída;
3. imagem já marcada `data-translated="true"` é ignorada;
4. imagem ausente do restoreMap é ignorada;
5. múltiplas imagens podem ser restauradas;
6. restoreMap nulo/vazio não faz nada.

## 3. Persistência cross-session simulada

Os testes de storage:

- gravam manualmente a chave de restoreMap do capítulo;
- leem a mesma chave;
- verificam que URL com token diferente produz a mesma clean URL.

Isso prova o mock/storage e a função local de clean URL.

Não prova o fluxo atual de persistência do content script.

## 4. Debounce

O bloco de debounce cria um closure local:

```js
const debouncedApply = () => {
  clearTimeout(timer);
  timer = setTimeout(applyFn, 150);
};
```

Ele prova corretamente a semântica genérica do debounce de 150 ms:

- cinco chamadas rápidas → uma execução;
- duas rajadas separadas → duas execuções.

Mas não instancia `MutationObserver` real nem `createAutoRestorer()`.

## 5. “Integração: restoreMap + GTC juntos”

O último teste declara que “UPDATE_IMAGE salva tanto restoreMap quanto GTC no mesmo set”.

Porém ele não envia `UPDATE_IMAGE`.

Ele monta diretamente um objeto `toSet` contendo imagens, restoreMap e uma chave GTC e chama `storageMock.set(toSet)`.

Logo o teste prova apenas que o storage mock armazena três chaves em uma chamada.

Ele não prova o handler real de UPDATE_IMAGE, nem ordem/atomicidade, nem arquitetura atual de IndexedDB/storage-manager.

## 6. Runtime atual

O Auto-Restore atual está modularizado em `extension/content/cm-auto-restore.js`.

Ele inclui comportamentos ausentes do mirror:

- `createAutoRestorer(deps)`;
- config global/site/imagem bloqueada;
- `isActive()` e `isTranslating()`;
- guard de reentrância `running`;
- `resolveAsset()`;
- tratamento especial de backdrop/blur;
- logs de restore e bloqueio;
- migração `SM_MIGRATE_CHAPTER`;
- índice `SM_RESTORE_INDEX`;
- fallback para restoreMap legado;
- observer real com `childList`, `subtree`, atributos e debounce;
- reação a `chrome.storage.onChanged`;
- disconnect/reinitialize.

## 7. Cobertura real já existente

`tests/unit/content-manga/auto-restorer-real.test.js` carrega o content script real e cobre, entre outros pontos:

- restauração imediata por clean URL;
- reaplicação quando `src` muda;
- restauração de imagens adicionadas ao DOM;
- REG-10: entrada escrita durante inicialização assíncrona;
- `autoRestoreEnabled=false`;
- bloqueio por site;
- bloqueio por imagem;
- canonicalizações visuais específicas.

Assim, #193 não é a única proteção do recurso e não deve ser promovido a prova principal do runtime.

## 8. Drift arquitetural

A suíte #193 foi escrita quando restoreMap e GTC eram modelados como estruturas simples no storage local.

O runtime atual usa bridges/índices e assets via background/IndexedDB em vários caminhos.

A afirmação “UPDATE_IMAGE salva tudo no mesmo set” é especialmente sensível a drift porque o teste não executa código de UPDATE_IMAGE.

## 9. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| mirror restaura clean URL | testes locais | ✅ PROVADO DIRETAMENTE — mirror |
| mirror ignora translated=true | teste local | ✅ PROVADO DIRETAMENTE — mirror |
| mirror ignora URL desconhecida | teste local | ✅ PROVADO DIRETAMENTE — mirror |
| mirror restaura múltiplas imagens | teste local | ✅ PROVADO DIRETAMENTE — mirror |
| debounce genérico 150ms | closure local | ✅ PROVADO DIRETAMENTE — simulação |
| storage mock persiste restoreMap | storage direto | ✅ PROVADO DIRETAMENTE — mock |
| URL tokenizada converge para clean URL | getCleanUrl local | ✅ PROVADO DIRETAMENTE — mirror |
| runtime real cm-auto-restore | não importado | ⚠️ NÃO PROVADO NESTE ARQUIVO |
| MutationObserver real | não instanciado | ⚠️ NÃO PROVADO NESTE ARQUIVO |
| config global/site/imagem | ausente | ⚠️ NÃO PROVADO NESTE ARQUIVO |
| resolveAsset/IndexedDB | ausente | ⚠️ NÃO PROVADO NESTE ARQUIVO |
| UPDATE_IMAGE persiste três estruturas no mesmo set | storage manual, sem UPDATE_IMAGE | ⚠️ CLAIM NÃO PROVADA |
| runtime real de Auto-Restore | suíte #194 | 🟨 PROVADO EM OUTRA SUÍTE |

## 10. Solicitações ao auditor

### 193-001 — TEST_AUTHENTICITY — OPEN

**Encontrado:** #193 testa apenas `createAutoRestoreSystem()` local, não `cm-auto-restore.js`.

**Evidência atual:** mirror histórico cobre clean URL, idempotência e ausência de match.

**Contexto adicional:** #194 já cobre o fluxo real de forma extensa.

**Ação solicitada:** reclassificar #193 como regressão histórica/algorítmica auxiliar ou migrar/remover cenários redundantes em favor da suíte real.

**Evidência esperada:** matriz de testes deixa claro qual arquivo é o gate do runtime.

**Risco:** manutenção pode confundir mirror com integração real.

**Severidade:** HIGH.

### 193-002 — STALE_TEST_CONTRACT — OPEN

**Encontrado:** o teste “MutationObserver com debounce” não cria MutationObserver; ele testa apenas um closure local com `setTimeout(150)`.

**Evidência atual:** a semântica matemática do debounce é válida.

**Evidência ausente neste arquivo:** observer real, filtros de mutação, disconnect/reconnect e interação com estado de tradução.

**Ação solicitada:** renomear o caso para refletir debounce isolado ou apontar explicitamente para #194 como prova do observer real.

**Evidência esperada:** nome e objeto executado alinhados.

**Risco:** falsa impressão de cobertura estrutural.

**Severidade:** NORMAL.

### 193-003 — STALE_TEST_CONTRACT — OPEN

**Encontrado:** o caso “UPDATE_IMAGE salva restoreMap + GTC no mesmo set” apenas executa `storageMock.set(toSet)` manualmente.

**Evidência atual:** o storage mock aceita as três chaves.

**Evidência ausente:** qualquer execução do handler real UPDATE_IMAGE ou do pipeline atual de storage/IndexedDB.

**Ação solicitada:** remover/renomear esse claim ou substituí-lo por teste real do handler/persistência vigente.

**Evidência esperada:** o teste falha se a implementação real de UPDATE_IMAGE/persistência mudar de forma incompatível.

**Risco:** arquitetura de persistência pode mudar e o teste continuar verde sem validar nada do runtime.

**Severidade:** HIGH.

## 11. Fonte integral auditada

```js
/**
 * auto-restore-system.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes do sistema de Auto-Restore (v3.2).
 *
 * CENÁRIOS COBERTOS:
 * 1. applyAutoRestore substitui imagens com clean URL no restoreMap
 * 2. Imagens com data-translated="true" são ignoradas (idempotência)
 * 3. Imagens fora do restoreMap são ignoradas (não substituídas)
 * 4. MutationObserver com debounce é configurado corretamente
 * 5. restoreMap vazio = sistema não ativa o observer (otimização)
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

// ── Implementações espelho ────────────────────────────────────────────────────

function getCleanUrl(urlStr) {
    if (!urlStr || urlStr.startsWith('data:')) return null;
    try {
        const u = new URL(urlStr, 'https://testmanga.com');
        return u.origin + u.pathname;
    } catch(e) { return urlStr.split('?')[0].split('#')[0]; }
}

function createAutoRestoreSystem() {
    let _activeRestoreMap = null;
    let _restoreObserver = null;
    let _restoreDebounceTimer = null;
    const replacements = []; // Log de substituições para verificação

    function applyImageReplacement(img, base64, fromCache) {
        if (!img || img.dataset.translated === 'true') return null;
        // Simula a substituição (sem DOM real)
        const newImg = { src: base64, dataset: { translated: 'true' }, fromCache };
        replacements.push({ originalSrc: img.src, newSrc: base64, fromCache });
        img.dataset.translated = 'true'; // Marca como traduzida
        return newImg;
    }

    function applyAutoRestore(domImages) {
        if (!_activeRestoreMap || Object.keys(_activeRestoreMap).length === 0) return 0;
        let count = 0;
        for (const img of domImages) {
            if (img.dataset.translated === 'true') continue;
            const rawUrl = img.src || img.dataset_src || '';
            const cleanUrl = getCleanUrl(rawUrl);
            if (cleanUrl && _activeRestoreMap[cleanUrl]) {
                applyImageReplacement(img, _activeRestoreMap[cleanUrl], true);
                count++;
            }
        }
        return count;
    }

    function setActiveRestoreMap(map) { _activeRestoreMap = map; }
    function getReplacements() { return replacements; }

    return { applyAutoRestore, setActiveRestoreMap, getReplacements };
}

// Cria objeto img fake para testes
function makeImgDOM(src, translated = false) {
    return {
        src,
        dataset: { translated: translated ? 'true' : '', src: undefined },
        dataset_src: undefined,
    };
}

describe('Sistema de Auto-Restore — v3.2', () => {

    describe('applyAutoRestore() — substituição por clean URL', () => {
        test('substitui imagem quando clean URL está no restoreMap', () => {
            const { applyAutoRestore, setActiveRestoreMap, getReplacements } = createAutoRestoreSystem();
            setActiveRestoreMap({
                'https://cdn.site.com/pag1.jpg': 'data:image/png;base64,TRANSLATED1'
            });

            const imgs = [makeImgDOM('https://cdn.site.com/pag1.jpg?token=ABC')];
            const count = applyAutoRestore(imgs);

            expect(count).toBe(1);
            expect(getReplacements()[0].fromCache).toBe(true);
            expect(getReplacements()[0].newSrc).toBe('data:image/png;base64,TRANSLATED1');
        });

        test('ignora imagens não presentes no restoreMap', () => {
            const { applyAutoRestore, setActiveRestoreMap, getReplacements } = createAutoRestoreSystem();
            setActiveRestoreMap({ 'https://cdn.site.com/pag1.jpg': 'data:base64...' });

            const imgs = [makeImgDOM('https://cdn.site.com/pag2.jpg')]; // pag2, não está no mapa
            const count = applyAutoRestore(imgs);

            expect(count).toBe(0);
            expect(getReplacements()).toHaveLength(0);
        });

        test('ignora imagens já traduzidas (data-translated="true") — idempotência', () => {
            const { applyAutoRestore, setActiveRestoreMap, getReplacements } = createAutoRestoreSystem();
            setActiveRestoreMap({ 'https://cdn.site.com/pag1.jpg': 'data:base64...' });

            const imgs = [makeImgDOM('https://cdn.site.com/pag1.jpg', true)]; // já traduzida
            const count = applyAutoRestore(imgs);

            expect(count).toBe(0);
        });

        test('substitui múltiplas imagens corretamente', () => {
            const { applyAutoRestore, setActiveRestoreMap, getReplacements } = createAutoRestoreSystem();
            setActiveRestoreMap({
                'https://cdn.site.com/pag1.jpg': 'data:base64:TRANS1',
                'https://cdn.site.com/pag2.jpg': 'data:base64:TRANS2',
            });

            const imgs = [
                makeImgDOM('https://cdn.site.com/pag1.jpg?token=A'),
                makeImgDOM('https://cdn.site.com/pag2.jpg?token=B'),
                makeImgDOM('https://cdn.site.com/avatar.jpg'), // não no mapa
            ];
            const count = applyAutoRestore(imgs);

            expect(count).toBe(2);
            expect(getReplacements()).toHaveLength(2);
        });

        test('com restoreMap nulo ou vazio, não substitui nada', () => {
            const { applyAutoRestore, setActiveRestoreMap, getReplacements } = createAutoRestoreSystem();

            setActiveRestoreMap(null);
            const imgs = [makeImgDOM('https://cdn.site.com/pag1.jpg')];
            expect(applyAutoRestore(imgs)).toBe(0);

            setActiveRestoreMap({});
            expect(applyAutoRestore(imgs)).toBe(0);

            expect(getReplacements()).toHaveLength(0);
        });
    });

    describe('Persistência cross-session via storage', () => {
        test('restoreMap é salvo no storage com clean URL como chave', async () => {
            const storageMock = getStorageMock();
            const chapterId = 'chap_test123';
            const cleanUrl = 'https://cdn.site.com/pag1.jpg';
            const translatedBase64 = 'data:image/png;base64,TRANSLATED';

            const restoreMap = { [cleanUrl]: translatedBase64 };
            await storageMock.set({ [`${chapterId}_restoreMap`]: restoreMap });

            const data = await storageMock.get([`${chapterId}_restoreMap`]);
            expect(data[`${chapterId}_restoreMap`][cleanUrl]).toBe(translatedBase64);
        });

        test('URL com token diferente após F5 encontra a entrada no restoreMap', async () => {
            const storageMock = getStorageMock();
            const chapterId = 'chap_f5test';
            const cleanUrl = 'https://cdn.site.com/pag1.jpg';

            // Simula: primeira sessão salva com URL+token=ABC
            await storageMock.set({
                [`${chapterId}_restoreMap`]: { [cleanUrl]: 'data:base64:TRANS' }
            });

            // Após F5, URL tem token=XYZ — mas clean URL é idêntica
            const urlAfterF5 = 'https://cdn.site.com/pag1.jpg?token=XYZ&expires=9999';
            const cleanUrlAfterF5 = getCleanUrl(urlAfterF5);

            expect(cleanUrlAfterF5).toBe(cleanUrl); // Mesma clean URL

            const data = await storageMock.get([`${chapterId}_restoreMap`]);
            const found = data[`${chapterId}_restoreMap`][cleanUrlAfterF5];
            expect(found).toBe('data:base64:TRANS'); // Encontrou!
        });
    });

    describe('Debounce do MutationObserver', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        test('debounce colapsa múltiplas chamadas em uma única execução após 150ms', () => {
            const applyFn = jest.fn();
            let timer = null;

            // Simula o debounce do initializeAutoRestorer
            const debouncedApply = () => {
                clearTimeout(timer);
                timer = setTimeout(applyFn, 150);
            };

            // 5 chamadas rápidas
            debouncedApply();
            debouncedApply();
            debouncedApply();
            debouncedApply();
            debouncedApply();

            // Nenhuma execução ainda
            expect(applyFn).not.toHaveBeenCalled();

            // Após 150ms, apenas UMA execução
            jest.advanceTimersByTime(150);
            expect(applyFn).toHaveBeenCalledTimes(1);
        });

        test('duas rajadas separadas por > 150ms geram duas execuções', () => {
            const applyFn = jest.fn();
            let timer = null;
            const debouncedApply = () => { clearTimeout(timer); timer = setTimeout(applyFn, 150); };

            debouncedApply();
            debouncedApply();
            jest.advanceTimersByTime(200); // Primeira rajada completa

            debouncedApply();
            debouncedApply();
            jest.advanceTimersByTime(200); // Segunda rajada completa

            expect(applyFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('Integração: restoreMap + GTC juntos', () => {
        test('UPDATE_IMAGE salva tanto restoreMap quanto GTC no mesmo set', async () => {
            const storageMock = getStorageMock();
            const chapterId = 'chap_integration';
            const cleanUrl = 'https://cdn.site.com/pag1.jpg';
            const hash = 'a'.repeat(64); // SHA-256 simulado
            const translated = 'data:image/png;base64,TRANSLATED';

            const restoreMap = {};
            restoreMap[cleanUrl] = translated;

            // O UPDATE_IMAGE salva tudo em um único set
            const toSet = {
                [`${chapterId}_images`]: { 0: translated },
                [`${chapterId}_restoreMap`]: restoreMap,
                [`gtc_${hash}`]: translated,
            };
            await storageMock.set(toSet);

            // Verifica que todas as 3 estruturas foram salvas
            const data = await storageMock.get([
                `${chapterId}_images`,
                `${chapterId}_restoreMap`,
                `gtc_${hash}`,
            ]);

            expect(data[`${chapterId}_images`][0]).toBe(translated);
            expect(data[`${chapterId}_restoreMap`][cleanUrl]).toBe(translated);
            expect(data[`gtc_${hash}`]).toBe(translated);
        });
    });
});
```

## 12. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–10 | contexto e cenários declarados |
| 12–21 | imports/root/storage mock |
| 23–72 | mirrors getCleanUrl/createAutoRestoreSystem |
| 74–82 | factory de imagem fake |
| 84–154 | testes do mirror applyAutoRestore |
| 156–199 | persistência cross-session simulada |
| 201–239 | debounce local |
| 241–260 | “integração” por storageMock.set manual |
| 261 | fecha describe |
| posição 262 | newline final |

## 13. Autoauditoria do AGENTE 17

- [x] reserva #193 criada e relida;
- [x] state próprio criado;
- [x] cm-auto-restore.js atual inspecionado;
- [x] suíte real #194 consultada;
- [x] fonte integral incorporada;
- [x] 261 linhas + newline = 262 posições;
- [x] mirror separado de runtime;
- [x] claims sintéticos de debounce/UPDATE_IMAGE classificados corretamente;
- [x] três solicitações persistíveis identificadas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #193 é útil como documentação histórica de regras simples do Auto-Restore, mas não deve ser tratado como prova do sistema real atual.

# Bíblia técnica — tests/unit/content-manga/twin-backdrop-sync.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `5d2151b3673af6ca7c4faf39b4a23d039d9aaa64`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte Jest com content script real para detecção/sincronização de backdrops  
> **Linhas textuais:** **146**  
> **Posições documentais:** **147**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

A suíte carrega o content script real via `loadContentScript` e valida dois comportamentos relacionados a imagens gêmeas/backdrops: deduplicação no `GET_PAGE_IMAGES` e sincronização do backdrop quando a imagem principal é traduzida.

O código real envolvido está principalmente em `cm-dom-replace.js`: `isBackdropOrBlurredImage`, `getScanEligibleImages` e `applyImageReplacement`.

## 2. Harness

- injeta Web Crypto/TextEncoder;
- usa runtime/storage mocks compartilhados;
- reseta módulos, listeners, storage, flags e DOM em cada teste;
- `dispatchToContent` chama o listener real e resolve `sendResponse`.

## 3. Cenário 1 — filtragem do backdrop

Cria duas imagens com a mesma URL Reddit: a primeira marcada `shreddit-aspect-ratio__blur` + `aria-hidden=true`, a segunda nítida. `GET_PAGE_IMAGES` real deve devolver apenas uma candidata.

As assertions exigem `images.length === 1` e a mesma `src`. Como as duas imagens têm `src` idêntica, porém, o teste **não verifica o índice/elemento escolhido**. Uma regressão que retornasse o backdrop em vez da imagem nítida ainda poderia satisfazer essas duas assertions.

## 4. Cenário 2 — Twin Backdrop Sync

Cria backdrop e imagem principal com a mesma URL `i.redd.it`, marca a principal com `data-manga-index=0`, envia `UPDATE_IMAGE` real e verifica:
- o objeto DOM original do backdrop recebe a Data URL traduzida;
- `dataset.translated` vira `true`;
- `pointerEvents` vira `none`;
- a imagem principal clonada/substituída também contém a tradução.

Esse cenário é uma prova direta forte da sincronização pós-replacement.

## 5. Cobertura dos heurísticos reais

`isBackdropOrBlurredImage` possui vários caminhos: `aria-hidden`, ancestrais aria-hidden, regex de classes em até 5 níveis e computed styles `filter/backdropFilter/pointerEvents`. A suíte #210 usa simultaneamente classe blur e `aria-hidden`, portanto não isola os outros branches.

## 6. Matriz de evidência

| Comportamento | Classificação |
|---|---|
| Content script real é carregado | ✅ PROVADO DIRETAMENTE pelo loader e efeitos |
| Duas imagens equivalentes viram uma candidata | ✅ PROVADO DIRETAMENTE |
| A candidata escolhida é especificamente a nítida, não o backdrop | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — src é igual e index não é verificado |
| UPDATE_IMAGE sincroniza backdrop | ✅ PROVADO DIRETAMENTE |
| Backdrop sincronizado fica translated/pointer-events none | ✅ PROVADO DIRETAMENTE |
| Imagem principal também é substituída | ✅ PROVADO DIRETAMENTE |
| Heurístico por classe sem aria-hidden | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Heurístico por computed blur/backdropFilter | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Heurístico em ancestral | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Invariantes

1. Backdrop não deve aparecer como página separada quando há imagem principal equivalente.
2. O candidato escolhido deve preservar o índice do elemento principal correto.
3. Replacement da principal deve sincronizar twins/backdrops equivalentes.
4. Twin sincronizado não deve continuar interceptando eventos.

## 8. Solicitações ao auditor

### 210-001 — TEST_ASSERTION_QUALITY — OPEN

**Encontrado:** o teste de deduplicação exige apenas uma imagem com a mesma `src`, mas backdrop e principal compartilham a URL. Não há assertion de `index` ou identidade da principal.

**Necessário:** exigir `response.images[0].index === 1` (ou outra prova equivalente) para garantir seleção da imagem nítida correta.

**Risco:** retorno do backdrop incorreto pode passar verde e causar seleção/tradução do elemento errado.

**Severidade:** HIGH.

### 210-002 — TEST_REQUIRED — OPEN

**Encontrado:** os heurísticos de backdrop possuem branches por ancestral/classe/computed style que não são isolados nesta suíte.

**Necessário:** localizar cobertura equivalente ou adicionar matriz focal para os principais heurísticos, especialmente blur via computed style e classe sem aria-hidden.

**Risco:** regressão em heurística específica pode reintroduzir duplicatas sem quebrar os dois casos atuais.

**Severidade:** NORMAL.

### 210-003 — TEST_REQUIRED — OPEN

**Encontrado:** `applyImageReplacement` sincroniza twins comparando `getCleanUrl(...)`, mas o teste de sincronização usa exatamente a mesma string de URL nos dois elementos.

**Necessário:** adicionar cenário real com URLs textualmente diferentes que canonicalizem para a mesma clean URL (por exemplo, variante Reddit preview versus chave canônica compatível, ou parâmetros de resize equivalentes).

**Risco:** regressão na canonicalização pode quebrar Twin Backdrop Sync sem afetar o caso atual de igualdade literal.

**Severidade:** HIGH.

## 9. Fonte integral exata

```js
/**
 * twin-backdrop-sync.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa a detecção de backdrops desfocados (Reddit, lightboxes ambientais)
 * e a sincronização automática (Twin Backdrop Sync) no content_manga.js.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { TextEncoder } = require('util');

const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

function getContentListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    if (listeners.length !== 1) {
        throw new Error(`Esperava 1 listener do content_manga, recebi ${listeners.length}`);
    }
    return listeners[0];
}

function dispatchToContent(runtimeMock, request, sender = { tab: { id: 1 } }) {
    return new Promise((resolve) => {
        let settled = false;
        const sendResponse = (response) => {
            settled = true;
            resolve(response);
        };
        const keepAlive = getContentListener(runtimeMock)(request, sender, sendResponse);
        if (keepAlive !== true && !settled) {
            resolve(undefined);
        }
    });
}

describe('Twin Backdrop Sync — content_manga.js', () => {
    let runtimeMock;
    let storageMock;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('filtra backdrop gêmeo com aria-hidden mantendo apenas a imagem nítida principal', async () => {
        const imageUrl = 'https://preview.redd.it/chapter1.png?width=1080';

        await loadContentScript({
            hostname: 'reddit.com',
            enabledDomains: ['reddit.com'],
            domImages: [
                {
                    src: imageUrl,
                    width: 1080,
                    height: 1920,
                    className: 'shreddit-aspect-ratio__blur',
                    attributes: { 'aria-hidden': 'true', id: 'bg-img' },
                },
                {
                    src: imageUrl,
                    width: 1080,
                    height: 1920,
                    attributes: { id: 'sharp-img' },
                },
            ],
        });

        const response = await dispatchToContent(runtimeMock, { action: 'GET_PAGE_IMAGES' });

        // Deve retornar apenas 1 imagem candidata (a imagem nítida) e não duplicar com o backdrop
        expect(response).toBeDefined();
        expect(response.images).toHaveLength(1);
        expect(response.images[0].src).toBe(imageUrl);
    });

    test('sincroniza o backdrop gêmeo ao aplicar a tradução na imagem principal', async () => {
        const imageUrl = 'https://i.redd.it/page1.png';
        const translatedBase64 = 'data:image/png;base64,TRANSLATED_PAGE_DATA';

        await loadContentScript({
            hostname: 'reddit.com',
            enabledDomains: ['reddit.com'],
            domImages: [
                {
                    src: imageUrl,
                    width: 800,
                    height: 1200,
                    className: 'shreddit-aspect-ratio__blur',
                    attributes: { 'aria-hidden': 'true', id: 'twin-backdrop' },
                },
                {
                    src: imageUrl,
                    width: 800,
                    height: 1200,
                    attributes: { id: 'primary-sharp', 'data-manga-index': '0' },
                },
            ],
        });

        const backdropImg = document.getElementById('twin-backdrop');

        // Envia comando para atualizar a imagem traduzida
        await dispatchToContent(runtimeMock, {
            action: 'UPDATE_IMAGE',
            index: 0,
            newSrc: translatedBase64,
        });

        // Verifica que o backdrop gêmeo foi sincronizado simultaneamente
        expect(backdropImg.src).toBe(translatedBase64);
        expect(backdropImg.dataset.translated).toBe('true');
        expect(backdropImg.style.pointerEvents).toBe('none');

        // A imagem principal clonada e substituída também deve conter a tradução
        const replacedPrimary = document.querySelector('img[data-translated="true"]:not(#twin-backdrop)');
        expect(replacedPrimary).not.toBeNull();
        expect(replacedPrimary.src).toBe(translatedBase64);
    });
});
```

## 10. Cobertura documental por linha/posição

Cobertura contígua de **1–147**; 147 é o newline final.

### Posições 1–6 — cabeçalho
Declara objetivo de detecção e Twin Backdrop Sync. **Evidência:** 🟦 GATE ESTÁTICO para o escopo.

### Posição 7 — separador
Linha vazia.

### Posições 8–23 — imports/globals
Configura crypto/TextEncoder e loader/mocks. **Evidência:** 🟨 setup.

### Posição 24 — separador
Linha vazia.

### Posições 25–47 — listener/dispatch
Obtém listener único e adapta callback. **Evidência:** 🟨 harness.

### Posições 48–70 — suíte/setup/cleanup
Reseta módulos, mocks, storage, flags e DOM. **Evidência:** 🟨 lifecycle.

### Posição 71 — separador
Linha vazia.

### Posições 72–102 — filtragem do backdrop
Carrega duas imagens gêmeas e exige uma candidata. **Evidência:** ✅ deduplicação; ⚠️ identidade da candidata não provada.

### Posição 103 — separador
Linha vazia.

### Posições 104–145 — sincronização
UPDATE_IMAGE real sincroniza backdrop e replacement principal. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 146 — fechamento
Fecha a suíte. **Evidência:** 🟨 estrutural.

### Posição 147 — newline final
Terminador textual.

## 11. Autoauditoria documental

- SHA reconfirmado.
- Fonte integral embutida exatamente.
- **147/147 posições** cobertas: 1–6, 7, 8–23, 24, 25–47, 48–70, 71, 72–102, 103, 104–145, 146, 147.
- Provas diretas separadas de lacunas de assertion.
- Nenhuma execução de suíte foi alegada.
- Nenhum arquivo externo foi alterado.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com duas solicitações abertas.

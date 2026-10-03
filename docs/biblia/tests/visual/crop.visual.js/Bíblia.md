# Bíblia técnica — tests/visual/crop.visual.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `432fe488697a98d09e056b89f40b4bf686e8541c`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte visual custom runner / gate de CI  
> **Linhas textuais:** 106  
> **Posições documentais:** 107, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`crop.visual.js` valida componentes do visual-v4 relacionados a Center-Crop:

1. formato dos hashes `wHashCrop` e `pHashCrop`;
2. persistência dos campos crop no repositório;
3. consulta `getManyByPerceptualCrop`;
4. exclusão de entradas sem hashes crop;
5. uma correspondência perceptual de baixa distância.

O arquivo carrega diretamente:

- `extension/shared/gtc-fingerprint.js`;
- `extension/shared/gtc-indexeddb.js`.

Portanto não é mirror: usa APIs reais.

## 2. Execução no CI

Este arquivo não é Jest.

Ele usa `tests/visual/runner.js` com:
- `it` síncrono;
- `ita` assíncrono serializado;
- contagem de pass/fail/skip;
- gate de baseline.

`tests/visual/run-all.js` faz `require('./crop.visual.js')`, aguarda `getAsyncQueue()` e encerra o processo com código 1 em falha.

`package.json` inclui:

```text
npm test -> test:ci -> test:smoke -> test:visual
test:visual -> node tests/visual/run-all.js
```

O workflow CI também executa `npm run test:visual`.

Classificação do arquivo como gate:

**✅ PROVADO DIRETAMENTE**

## 3. Hashes crop

### calculateWHash

Usa `checkerboard(32,32,4)` e exige 64 caracteres hex.

Prova:
- função real executa;
- saída tem formato esperado.

Não prova neste arquivo:
- valor conhecido;
- determinismo;
- distância perceptual entre imagens.

### calculatePHash

Usa `horizontalGradient(32,32)` e exige 64 caracteres hex.

Mesma classificação: prova formato, não vetor conhecido.

## 4. Persistência crop no repositório

O teste grava uma entrada contendo:

- `hash`;
- `wHash`;
- `pHash`;
- `wHashCrop`;
- `pHashCrop`;
- `translatedDataUrl`.

Ele exige:
- `putResult.saved === true`;
- `getMany` recupera a tradução;
- `getManyByPerceptualCrop` encontra a mesma entrada;
- a tradução do hit corresponde ao valor persistido.

O repositório usado é `createInMemoryRepository()`.

Logo este arquivo prova a implementação in-memory real.

O caminho IndexedDB real é provado separadamente por `tests/unit/gtc/indexeddb.test.js`, inclusive índices `by_whash_crop/by_phash_crop`.

## 5. Consulta por Center-Crop

Um caso grava somente hashes crop + tradução e consulta com os mesmos hashes.

O resultado precisa conter:

```text
<queryWHashCrop>:<queryPHashCrop>
```

com a URL traduzida.

Isso prova o lookup crop positivo básico.

## 6. Entrada sem crop

Uma entrada com apenas `wHash/pHash` principais não pode aparecer em `getManyByPerceptualCrop`.

A suíte exige resultado vazio.

Isso prova que o fallback crop não reutiliza indevidamente os hashes integrais.

## 7. Caso rotulado como “thresholds relaxados”

O último teste declara:

> matchPerceptualHashes suporta thresholds relaxados para variação de layout

Mas chama:

```js
fp.matchPerceptualHashes(...)
```

e não:

```js
fp.matchPerceptualHashesRelaxed(...)
```

A imagem/hash similar possui distância de apenas 10 bits.

No código atual:
- strict wHash match: <= 40;
- strict pHash match: <= 35;
- relaxed: <= 50 / <=45.

Portanto 10 bits é **strict hit** e também seria relaxed hit.

O teste prova o matcher estrito com baixa distância, não a zona “relaxed-only”.

A cobertura correta do relaxado existe em `tests/unit/gtc/fingerprint.test.js`, que usa 44 bits para wHash e 40 para pHash: strict miss e relaxed hit.

## 8. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| crop.visual entra no test:visual | run-all.js + package/CI | 🟦 GATE ESTÁTICO ESPECÍFICO |
| calculateWHash retorna 64-hex | teste 1 | ✅ PROVADO DIRETAMENTE |
| calculatePHash retorna 64-hex | teste 2 | ✅ PROVADO DIRETAMENTE |
| put preserva crop fields no in-memory repo | teste 3 | ✅ PROVADO DIRETAMENTE |
| lookup crop encontra entrada | testes 3/4 | ✅ PROVADO DIRETAMENTE |
| entrada sem crop é ignorada | teste 5 | ✅ PROVADO DIRETAMENTE |
| matcher estrito aceita distância 10 | teste 6 | ✅ PROVADO DIRETAMENTE |
| matcher relaxado aceita strict miss | **não é provado neste arquivo** | ⚠️ CONTRATO DO TESTE INCORRETO |
| IndexedDB real v4 crop | não é usado aqui; outra suíte prova | 🟨 PROVADO EM OUTRA SUÍTE |
| índices by_whash_crop/by_phash_crop | outra suíte | 🟨 PROVADO EM OUTRA SUÍTE |
| melhor candidato por confidence entre múltiplos hits | não testado aqui | ⚠️ SEM TESTE NESTE ARQUIVO |

## 9. Solicitações ao auditor

### 227-001 — STALE_TEST_CONTRACT — OPEN

**Encontrado:** o cabeçalho e o último nome de teste afirmam cobrir “thresholds relaxados”, mas o código chama `matchPerceptualHashes` estrito.

**Evidência atual:** distância 10 passa confortavelmente no strict.

**Evidência ausente neste arquivo:** caso que falha no strict e passa no relaxed.

**Contexto adicional:** `tests/unit/gtc/fingerprint.test.js` já possui essa prova correta com distâncias 44/40.

**Ação solicitada:** renomear o teste/comentário para refletir matcher estrito, ou chamar `matchPerceptualHashesRelaxed` com caso relaxed-only se esse é o objetivo desta suíte visual.

**Risco:** leitores podem concluir que o gate visual protege thresholds relaxados quando não protege.

**Severidade:** NORMAL.

### 227-002 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** os testes de `calculateWHash/PHash` verificam apenas formato 64-hex.

**Evidência atual:** funções reais executam com fixtures não triviais.

**Evidência ausente:** determinismo/known-vector ou relação de distância esperada dentro desta suíte visual.

**Contexto:** cobertura mais detalhada existe na suíte unitária GTC, portanto não é uma lacuna global crítica.

**Ação solicitada:** decidir se o visual gate precisa de pelo menos um vetor determinístico para detectar mudança algorítmica silenciosa.

**Risco:** algoritmo pode mudar drasticamente mantendo somente o formato 64-hex.

**Severidade:** LOW.

## 10. Fonte integral auditada

```js
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// visual-v4-crop.visual-v3.js
// Testes para as novidades do visual-v4:
//   1. Center-Crop hashes (wHashCrop, pHashCrop)
//   2. getManyByPerceptualCrop no repositório
//   3. Correspondência com thresholds relaxados para layouts responsivos
// ─────────────────────────────────────────────────────────────────────────────

globalThis.self = globalThis;
require('../../extension/shared/gtc-fingerprint.js');
require('../../extension/shared/gtc-indexeddb.js');

const { describe, it, ita, beforeEach, expect } = require('./runner.js');
const {
    solidColor, horizontalGradient, checkerboard,
    mangaPage, isValidHex,
} = require('./helpers.js');

const fp  = globalThis.MangaTranslatorGtcFingerprint;
const idb = globalThis.MangaTranslatorGtcIndexedDb;

function makeRepo() {
    return idb.createInMemoryRepository();
}

describe('visual-v4 — Center-Crop Hashes e Perceptual Crop Lookup', () => {
    let repo;

    beforeEach(() => {
        repo = makeRepo();
    });

    it('calculateWHash gera hash válido de 64 caracteres hex para imagem crop', () => {
        const cropData = checkerboard(32, 32, 4);
        const wHashCrop = fp.calculateWHash(cropData);
        expect(isValidHex(wHashCrop, 64)).toBeTruthy();
    });

    it('calculatePHash gera hash válido de 64 caracteres hex para imagem crop', () => {
        const cropData = horizontalGradient(32, 32);
        const pHashCrop = fp.calculatePHash(cropData);
        expect(isValidHex(pHashCrop, 64)).toBeTruthy();
    });

    ita('put persiste wHashCrop e pHashCrop no repositório', async () => {
        const entry = {
            hash: 'hash-v4-test-01',
            wHash: 'a'.repeat(64),
            pHash: 'b'.repeat(64),
            wHashCrop: 'c'.repeat(64),
            pHashCrop: 'd'.repeat(64),
            translatedDataUrl: 'data:image/png;base64,V4_TRANSLATED_IMAGE',
        };

        const putResult = await repo.put(entry);
        expect(putResult.saved).toBe(true);

        const queryResult = await repo.getMany(['hash-v4-test-01']);
        expect(queryResult['hash-v4-test-01']).toBe('data:image/png;base64,V4_TRANSLATED_IMAGE');

        const cropMatch = await repo.getManyByPerceptualCrop(['c'.repeat(64)], ['d'.repeat(64)], fp);
        expect(cropMatch[`${'c'.repeat(64)}:${'d'.repeat(64)}`]).toBeDefined();
        expect(cropMatch[`${'c'.repeat(64)}:${'d'.repeat(64)}`].translatedDataUrl).toBe('data:image/png;base64,V4_TRANSLATED_IMAGE');
    });

    ita('getManyByPerceptualCrop encontra resultado por correspondência de Center-Crop', async () => {
        const queryWHashCrop = 'e'.repeat(64);
        const queryPHashCrop = 'f'.repeat(64);

        await repo.put({
            hash: 'crop-hit-01',
            wHashCrop: queryWHashCrop,
            pHashCrop: queryPHashCrop,
            translatedDataUrl: 'data:image/png;base64,CROP_HIT_DATA',
        });

        const hits = await repo.getManyByPerceptualCrop([queryWHashCrop], [queryPHashCrop], fp);
        expect(hits).toBeDefined();
        const hitKey = `${queryWHashCrop}:${queryPHashCrop}`;
        expect(hits[hitKey]).toBeDefined();
        expect(hits[hitKey].translatedDataUrl).toBe('data:image/png;base64,CROP_HIT_DATA');
    });

    ita('getManyByPerceptualCrop ignora entradas sem wHashCrop ou pHashCrop', async () => {
        await repo.put({
            hash: 'no-crop-entry',
            wHash: '1'.repeat(64),
            pHash: '2'.repeat(64),
            translatedDataUrl: 'data:image/png;base64,NO_CROP',
        });

        const hits = await repo.getManyByPerceptualCrop(['1'.repeat(64)], ['2'.repeat(64)], fp);
        expect(Object.keys(hits)).toHaveLength(0);
    });

    it('matchPerceptualHashes suporta thresholds relaxados para variação de layout', () => {
        const hashA = '0000000000000000000000000000000000000000000000000000000000000000';
        // Variação pequena (10 bits de distância)
        const hashSimilar = '00000000000000000000000000000000000000000000000000000000000003ff';

        const match = fp.matchPerceptualHashes(hashA, hashA, hashSimilar, hashSimilar);
        expect(match.match).toBe(true);
        expect(match.confidence).toBeGreaterThan(0.7);
    });
});
```

## 11. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–10 | cabeçalho visual-v4 |
| 11–12 | carrega módulos reais |
| 14–18 | runner/helpers |
| 20–25 | APIs e repo factory |
| 27–34 | describe + beforeEach |
| 35–40 | wHash crop |
| 41–46 | pHash crop |
| 47–68 | persistência crop |
| 69–88 | lookup crop positivo |
| 89–100 | ignora entrada sem crop |
| 102–105 | caso strict de 10 bits rotulado relaxed |
| 106 | fecha describe |
| posição 107 | newline final |

## 12. Autoauditoria do AGENTE 17

- [x] reserva #227 criada e relida;
- [x] state próprio criado;
- [x] runner visual, run-all, package e CI inspecionados;
- [x] módulos GTC reais comparados;
- [x] cobertura unitária relacionada consultada;
- [x] fonte integral incorporada;
- [x] 106 linhas + newline = 107 posições;
- [x] diferença strict vs relaxed registrada;
- [x] duas solicitações abertas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #227 é um gate visual real e útil para Center-Crop, mas seu último teste está rotulado de forma incompatível com a função que realmente executa.

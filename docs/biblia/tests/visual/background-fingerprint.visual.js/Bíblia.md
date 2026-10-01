# Bíblia técnica — tests/visual/background-fingerprint.visual.js

> Estado documental: ✅ CONCLUÍDA pelo AGENTE 20 após autoauditoria documental  
> SHA auditado: 91f5cf4d9ed4d9f4386184931f93ab32f33c95ca  
> Agente: AGENTE 20  
> Tipo: suíte visual customizada de fingerprints e integração perceptual  
> Linhas textuais: 426  
> Posições documentais: 427, incluindo newline terminal  
> PR/branch: #66 / docs/project-bible

## 1. Papel real do arquivo

Apesar do nome e dos comentários dizerem que testa o handler CALCULATE_VISUAL_FINGERPRINT do Service Worker, este arquivo não carrega a action real do background. Ele carrega a implementação real extension/shared/gtc-fingerprint.js, cria um OffscreenCanvas local simplificado, reimplementa parte da pipeline do handler em simulateCalculateVisualFingerprint, usa fixtures de tests/visual/helpers.js e, na última suíte, carrega o gtc-indexeddb.js real.

A interpretação correta da evidência é:
- propriedades da API real de fingerprint e do repositório real chamadas diretamente podem ser provadas pelas assertions;
- propriedades do simulador local são exercidas por este arquivo;
- propriedades do handler real do background não são provadas por esta suíte só porque o simulador possui nome/estrutura semelhante.

O arquivo contém 6 describes, 19 testes assíncronos ita e 40 chamadas expect.

## 2. Bootstrap e dependências

O bootstrap força globalThis.self = globalThis e requer gtc-fingerprint.js real. O runner visual fornece describe/it/ita/beforeEach/expect. As fixtures vêm de helpers.js.

Símbolos importados sem uso local: it, beforeEach e brightnessShifted. A variável fpApiMock na suíte de recursos também é criada sem uso.

## 3. makeOffscreenCanvasStub — linhas 31–69

O stub fecha sobre sourceData/sourceW/sourceH. O construtor cria buffer RGBA. drawImage usa nearest-neighbor: para cada pixel de destino calcula sr=floor(r*sh/th) e sc=floor(c*sw/tw) e copia os quatro canais.

Limitações verificadas:
- ignora efetivamente o bitmap recebido;
- ignora x e y;
- usa apenas dw/dh da assinatura simples;
- não implementa a assinatura de 9 argumentos usada pelo action real para center-crop;
- getImageData ignora a região pedida e devolve todo o buffer.

É suficiente para os redimensionamentos simples desta suíte, mas não é um modelo geral de OffscreenCanvasRenderingContext2D.

Classificação: 🟨 EXECUTADO INDIRETAMENTE, sem self-test focal do stub.

## 4. simulateCalculateVisualFingerprint — linhas 74–138

Fluxo implementado localmente:
1. escolhe fpApiOverride ou a API global;
2. retorna ok:false se a API faltar;
3. cria bitmap sintético;
4. escala para 8x8 e monta pixelSample;
5. calcula dHash em 9x8 quando disponível;
6. calcula wHash/pHash sobre o mesmo 32x32;
7. calcula regionalHashes em 48x48;
8. chama bitmap.close;
9. retorna ok:true com pixelSample, dHash, wHash, pHash e regionalHashes.

### Diferenças para a implementação real atual

A action real extension/background/actions/calculate-visual-fingerprint.js:
- valida URL e restringe a HTTP/HTTPS;
- executa fetch com credentials omit e cache no-store;
- cria Blob e ImageBitmap reais/stubáveis;
- calcula wHashCrop e pHashCrop visual-v4 para imagem não quadrada;
- usa crop central com a assinatura de 9 argumentos de drawImage;
- faz logging VISUAL_FP_OK/VISUAL_FP_FAIL;
- converte exceções em resposta de erro;
- usa finally para fechar o bitmap também em falha.

O simulador não implementa esses contratos. Logo a suíte é adequada para validar a composição algorítmica que ela própria simula, mas não deve ser citada como prova direta do action/handler atual.

## 5. Suíte 1 — estrutura da resposta — linhas 142–194

Seis casos verificam o retorno do simulador:
- campos básicos presentes;
- pixelSample hex de 512 caracteres;
- dHash de 16 hex;
- wHash de 64 hex;
- pHash de 64 hex;
- quatro hashes regionais de 16 hex.

Há divergência textual concreta: o título do caso da linha 156 diz “256 chars”, enquanto o comentário matemático e a assertion usam 512. O valor correto para 8x8x4 bytes serializados como hex é 512 caracteres. Isso gera 225-002.

A resposta simulada não contém os campos wHashCrop/pHashCrop existentes no contrato visual-v4 real.

## 6. Suíte 2 — determinismo — linhas 197–239

Três testes:
- mesma imagem produz os mesmos hashes;
- gradiente e checkerboard produzem wHashes diferentes;
- wHash e pHash calculados do mesmo buffer 32x32 do simulador coincidem com chamadas diretas da API real sobre esse buffer.

Como fp.calculate* é a implementação real compartilhada, essas propriedades estão ✅ PROVADAS DIRETAMENTE para as fixtures usadas. A alegação de “otimização do handler”, porém, continua sendo apenas do simulador.

## 7. Suíte 3 — cross-language — linhas 243–293

Três testes chamam diretamente matchPerceptualHashes e matchRegionalHashes reais:
- EN/PT da mesma página faz match;
- EN vs noise não faz match;
- EN/PT passa confirmação regional com threshold 8 e minMatches 3.

Essas propriedades do matcher real estão ✅ PROVADAS DIRETAMENTE para as fixtures sintéticas usadas. Os console.log de confidence/distâncias são observabilidade, não assertions.

## 8. Suíte 4 — gestão de recursos — linhas 297–339

O teste chamado “bitmap.close() é chamado mesmo em caso de sucesso” não chama simulateCalculateVisualFingerprint nem a action real. Ele cria fakeBitmap, chama fakeBitmap.close manualmente e depois verifica a flag que a própria chamada alterou.

Portanto esse caso não prova cleanup do subject declarado. fpApiMock também é declarado e não utilizado.

Há, porém, evidência externa forte: tests/unit/background/test_bg59.test.js e tests/unit/background/calculate-visual-fingerprint-action.test.js executam o action verdadeiro e verificam close em sucesso; a segunda também verifica close quando o cálculo falha.

O segundo caso desta suíte apenas confirma que quatro fixtures geram pixelSample de 512 chars no simulador.

## 9. Suíte 5 — consistência — linhas 343–383

Quatro testes comparam resultado simulado e cálculo direto para inputs já nas dimensões alvo:
- wHash 32x32;
- pHash 32x32;
- dHash 9x8;
- regionalHashes 48x48.

Eles provam consistência do simulador para essas dimensões e a API real de fingerprint. Não executam Service Worker real nem content script real, portanto “SW ↔ content script” é uma descrição conceitual, não uma prova de ambos os ambientes.

## 10. Suíte 6 — IndexedDB perceptual — linhas 386–426

A suíte carrega gtc-indexeddb.js real, cria createInMemoryRepository, gera fingerprint EN pelo simulador, salva campos visual-v3, gera fingerprint PT e consulta getManyByPerceptual.

Assertions exigem resultado, translatedDataUrl correto e confidence positiva. Isso é prova direta da integração entre API real de fingerprint, repositório in-memory real, fixtures e dados produzidos pelo simulador. Não inclui fetch/router/action do Service Worker.

## 11. Evidência externa do handler real

tests/unit/background/test_bg59.test.js carrega o background real e despacha CALCULATE_VISUAL_FINGERPRINT. Ele verifica pixelSample, dHash, wHash/pHash, wHashCrop/pHashCrop, regionalHashes, argumentos de fetch, center-crop e close do bitmap.

tests/unit/background/calculate-visual-fingerprint-action.test.js carrega router + action reais e verifica resposta visual-v4, rejeição de data/chrome-extension URLs sem fetch, crop, logging e fechamento do bitmap em sucesso e falha.

Assim, o produto possui cobertura real para aspectos que esta suíte visual apenas simula. A lacuna aqui é de desenho/fidelidade do arquivo #225, não ausência total de testes do action.

## 12. Evidência CI

O mesmo blob 91f5cf4d9ed4d9f4386184931f93ab32f33c95ca existe no commit b6ad13fce47adcab3fcd10281f28848f7b4ce50f. O run-all desse commit requer explicitamente background-fingerprint.visual.js.

No MangaTranslator CI #36577447500:
- Visual Tests, job 109437162605: success;
- comando test:visual executa node tests/visual/run-all.js;
- resumo: Passed: 224;
- logs mostram os grupos CALCULATE_VISUAL_FINGERPRINT;
- Windows Portability, job 109437162789, também registra Passed: 224.

Classificação: ✅ o arquivo é realmente executado pelo gate visual do snapshot.

## 13. Matriz de evidência

| Afirmação | Classificação | Motivo |
|---|---|---|
| arquivo participa do run visual | ✅ PROVADO DIRETAMENTE | run-all + CI mesmo blob |
| gtc-fingerprint real é carregado | 🟦 GATE ESTÁTICO ESPECÍFICO | require direto |
| formato/determinismo dos hashes para fixtures | ✅ PROVADO DIRETAMENTE | assertions usam API real |
| matching perceptual/regional real | ✅ PROVADO DIRETAMENTE | matchers reais chamados |
| integração com repositório in-memory real | ✅ PROVADO DIRETAMENTE | módulo real + assertions |
| comportamento do simulador nos caminhos assertados | ✅ PROVADO DIRETAMENTE | função local é subject imediato |
| URL/fetch/log/finally do handler real | ⚠️ NÃO PROVADO POR ESTE ARQUIVO | action não é carregada |
| center-crop visual-v4 | ⚠️ NÃO PROVADO POR ESTE ARQUIVO | simulador não retorna crop hashes |
| close do handler no caso da suíte 4 | ⚠️ SEM PROVA NESTE CASO | close chamado manualmente |
| equivalência geral SW ↔ content script | 🟨 LIMITADA AO MODELO/DIMENSÕES LOCAIS | ambientes reais não são ambos executados |

## 14. Solicitações ao auditor

### 225-001 — TEST_DESIGN_REVIEW — OPEN
Encontrado: a suíte afirma testar toda a lógica do handler, mas usa reimplementação local visual-v3; o action real é visual-v4 e inclui contratos ausentes. O stub não suporta center-crop e o teste de close é tautológico.

Arquivo alvo: tests/visual/background-fingerprint.visual.js.

Evidência atual: comparação com extension/background/actions/calculate-visual-fingerprint.js e com os Jest reais mostra drift em URL, fetch, ImageBitmap, crop, logging, erro/finally e response shape.

Evidência ausente neste arquivo: prova visual do action real atual e cleanup legítimo pelo subject.

Ação: decidir entre renomear/reorientar a suíte explicitamente como simulação algorítmica ou refatorá-la para executar a action real com stubs, removendo duplicação e incluindo visual-v4.

Evidência esperada: subject inequívoco; se mantiver alegação de handler, center-crop/cleanup/action real cobertos sem copiar implementação.

Risco: simulador pode permanecer verde enquanto produção diverge.

Severidade: NORMAL.

### 225-002 — DOCUMENTATION_MISMATCH — OPEN
Encontrado: nome do teste diz 256 chars, enquanto matemática e assertion usam 512.

Arquivo alvo: tests/visual/background-fingerprint.visual.js.

Evidência atual: 8x8x4 = 256 bytes e cada byte vira dois hex; toHaveLength(512).

Ação: alterar o título para 512 caracteres, preservando se útil a explicação de 256 bytes.

Risco: confusão de manutenção, sem impacto runtime.

Severidade: NORMAL.

### 225-003 — CLEANUP_REVIEW — OPEN
Encontrado: it, beforeEach e brightnessShifted são importados sem uso; fpApiMock também é variável morta.

Arquivo alvo: tests/visual/background-fingerprint.visual.js.

Ação: remover símbolos mortos ou dar uso real se houver intenção.

Risco: baixo funcionalmente, mas aumenta ruído em uma suíte já sujeita a drift.

Severidade: NORMAL.

## 15. Fonte integral auditada

```js
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// test_background_fingerprint.js
// Testes para o handler CALCULATE_VISUAL_FINGERPRINT do background.js
// e para a integração background ↔ gtc-fingerprint via OffscreenCanvas simulado.
//
// Como o background.js é um Service Worker e usa fetch + OffscreenCanvas,
// criamos stubs determinísticos que replicam o comportamento real:
//   - fetchStub: retorna um Blob fake com pixels controlados
//   - createImageBitmapStub: retorna um bitmap fake com close()
//   - OffscreenCanvasStub: implementa getContext('2d').drawImage / getImageData
//
// Isso testa TODA a lógica do handler sem depender de chrome.* ou DOM real.
// ─────────────────────────────────────────────────────────────────────────────

globalThis.self = globalThis;
require('../../extension/shared/gtc-fingerprint.js');

const { describe, it, ita, beforeEach, expect } = require('./runner.js');
const { solidColor, horizontalGradient, checkerboard, mangaPage, noise, brightnessShifted, isValidHex } = require('./helpers.js');
const fp = globalThis.MangaTranslatorGtcFingerprint;

// ─────────────────────────────────────────────────────────────────────────────
// Stubs reutilizáveis para simular ambiente do Service Worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria um OffscreenCanvas stub que, ao receber drawImage, escreve os pixels
 * da imageData `pixelData` (redimensionada para width×height via nearest-neighbor).
 */
function makeOffscreenCanvasStub(sourceData, sourceW, sourceH) {
    function OffscreenCanvasStub(w, h) {
        this._w = w;
        this._h = h;
        this._data = new Uint8ClampedArray(w * h * 4);
    }

    OffscreenCanvasStub.prototype.getContext = function(type) {
        const canvas = this;
        return {
            drawImage(bitmap, x, y, dw, dh) {
                // Nearest-neighbor resize de sourceData → canvas._w × canvas._h
                const sw = sourceW, sh = sourceH;
                const tw = dw || canvas._w, th = dh || canvas._h;
                const buf = new Uint8ClampedArray(tw * th * 4);
                for (let r = 0; r < th; r++) {
                    for (let c = 0; c < tw; c++) {
                        const sr = Math.floor(r * sh / th);
                        const sc = Math.floor(c * sw / tw);
                        const si = (sr * sw + sc) * 4;
                        const di = (r  * tw + c)  * 4;
                        buf[di]   = sourceData[si];
                        buf[di+1] = sourceData[si+1];
                        buf[di+2] = sourceData[si+2];
                        buf[di+3] = sourceData[si+3];
                    }
                }
                canvas._data = buf;
                canvas._w = tw; canvas._h = th;
            },
            getImageData(x, y, w, h) {
                return { data: canvas._data };
            },
        };
    };

    return OffscreenCanvasStub;
}

/**
 * Simula a lógica completa do handler CALCULATE_VISUAL_FINGERPRINT.
 * Extrai o handler inline para poder testá-lo de forma isolada.
 */
async function simulateCalculateVisualFingerprint(imageData, imageW, imageH, fpApiOverride) {
    const fpApi = fpApiOverride || globalThis.MangaTranslatorGtcFingerprint;
    if (!fpApi) return { ok: false, error: 'fpApi não disponível' };

    // Simula OffscreenCanvas com os dados fornecidos
    const OffscreenCanvas = makeOffscreenCanvasStub(imageData, imageW, imageH);

    // Simula createImageBitmap retornando objeto com close()
    const bitmap = {
        width:  imageW,
        height: imageH,
        _data:  imageData,
        close() {},
    };

    // ── Canvas 8×8 → pixelSample ────────────────────────────────────────────
    const oc8  = new OffscreenCanvas(8, 8);
    const ctx8 = oc8.getContext('2d');
    ctx8.drawImage(bitmap, 0, 0, 8, 8);
    const id8 = ctx8.getImageData(0, 0, 8, 8);
    const pixelSample = Array.from(id8.data)
        .map(b => b.toString(16).padStart(2, '0')).join('');

    // ── Canvas 9×8 → dHash ──────────────────────────────────────────────────
    let dHash = null;
    if (typeof fpApi.calculateDHash === 'function') {
        const oc9  = new OffscreenCanvas(9, 8);
        const ctx9 = oc9.getContext('2d');
        ctx9.drawImage(bitmap, 0, 0, 9, 8);
        const id9 = ctx9.getImageData(0, 0, 9, 8);
        dHash = fpApi.calculateDHash(id9.data);
    }

    // ── Canvas 32×32 → wHash + pHash (mesmo ImageData, NOVO) ───────────────
    let wHash = null;
    let pHash = null;
    if (fpApi.calculateWHash || fpApi.calculatePHash) {
        const oc32  = new OffscreenCanvas(32, 32);
        const ctx32 = oc32.getContext('2d');
        ctx32.drawImage(bitmap, 0, 0, 32, 32);
        const id32 = ctx32.getImageData(0, 0, 32, 32);

        if (typeof fpApi.calculateWHash === 'function') {
            wHash = fpApi.calculateWHash(id32.data);
        }
        if (typeof fpApi.calculatePHash === 'function') {
            pHash = fpApi.calculatePHash(id32.data);
        }
    }

    // ── Canvas 48×48 → regionalHashes ──────────────────────────────────────
    let regionalHashes = null;
    if (typeof fpApi.calculateRegionalHashes === 'function') {
        const oc48  = new OffscreenCanvas(48, 48);
        const ctx48 = oc48.getContext('2d');
        ctx48.drawImage(bitmap, 0, 0, 48, 48);
        const id48 = ctx48.getImageData(0, 0, 48, 48);
        regionalHashes = fpApi.calculateRegionalHashes(id48.data);
    }

    bitmap.close();

    return { ok: true, pixelSample, dHash, wHash, pHash, regionalHashes };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — CALCULATE_VISUAL_FINGERPRINT — estrutura da resposta
// ─────────────────────────────────────────────────────────────────────────────
describe('CALCULATE_VISUAL_FINGERPRINT — estrutura da resposta', () => {

    ita('retorna ok:true com todos os campos presentes', async () => {
        const img = horizontalGradient(100, 100);
        const r = await simulateCalculateVisualFingerprint(img, 100, 100);

        expect(r.ok).toBe(true);
        expect(r).toHaveProperty('pixelSample');
        expect(r).toHaveProperty('dHash');
        expect(r).toHaveProperty('wHash');
        expect(r).toHaveProperty('pHash');
        expect(r).toHaveProperty('regionalHashes');
    });

    ita('pixelSample é string hex de 256 chars (8×8×4 bytes = 256 bytes = 512 hex chars)', async () => {
        // 8×8 canvas = 64 pixels × 4 bytes RGBA = 256 bytes → 512 hex chars
        const img = solidColor(100, 100, 128, 64, 32);
        const r   = await simulateCalculateVisualFingerprint(img, 100, 100);
        expect(typeof r.pixelSample).toBe('string');
        expect(r.pixelSample).toHaveLength(512);
        expect(r.pixelSample).toMatch(/^[0-9a-f]+$/);
    });

    ita('dHash é string de 16 chars hex', async () => {
        const img = horizontalGradient(200, 300);
        const r   = await simulateCalculateVisualFingerprint(img, 200, 300);
        expect(isValidHex(r.dHash, 16)).toBeTruthy();
    });

    ita('wHash é string de 64 chars hex (256 bits)', async () => {
        const img = mangaPage(200, 300, 'EN');
        const r   = await simulateCalculateVisualFingerprint(img, 200, 300);
        expect(isValidHex(r.wHash, 64)).toBeTruthy();
    });

    ita('pHash é string de 64 chars hex (256 bits)', async () => {
        const img = mangaPage(200, 300, 'EN');
        const r   = await simulateCalculateVisualFingerprint(img, 200, 300);
        expect(isValidHex(r.pHash, 64)).toBeTruthy();
    });

    ita('regionalHashes tem 4 campos, cada um com 16 chars hex', async () => {
        const img = mangaPage(200, 300, 'EN');
        const r   = await simulateCalculateVisualFingerprint(img, 200, 300);
        expect(r.regionalHashes).toBeDefined();
        expect(isValidHex(r.regionalHashes.topLeft,     16)).toBeTruthy();
        expect(isValidHex(r.regionalHashes.topRight,    16)).toBeTruthy();
        expect(isValidHex(r.regionalHashes.bottomLeft,  16)).toBeTruthy();
        expect(isValidHex(r.regionalHashes.bottomRight, 16)).toBeTruthy();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — CALCULATE_VISUAL_FINGERPRINT — determinismo e consistência
// ─────────────────────────────────────────────────────────────────────────────
describe('CALCULATE_VISUAL_FINGERPRINT — determinismo', () => {

    ita('dois calls com mesma imagem retornam hashes idênticos', async () => {
        const img = mangaPage(150, 200, 'EN');
        const r1 = await simulateCalculateVisualFingerprint(img, 150, 200);
        const r2 = await simulateCalculateVisualFingerprint(img, 150, 200);
        expect(r1.pixelSample).toBe(r2.pixelSample);
        expect(r1.dHash).toBe(r2.dHash);
        expect(r1.wHash).toBe(r2.wHash);
        expect(r1.pHash).toBe(r2.pHash);
        expect(r1.regionalHashes.topLeft).toBe(r2.regionalHashes.topLeft);
    });

    ita('estruturalmente diferentes produzem wHashes diferentes', async () => {
        // Use images with genuine spatial structure — constant images have identical LL subband
        const imgA = horizontalGradient(100, 100);    // low-freq gradient
        const imgB = checkerboard(100, 100, 4);        // high-freq checkerboard
        const rA = await simulateCalculateVisualFingerprint(imgA, 100, 100);
        const rB = await simulateCalculateVisualFingerprint(imgB, 100, 100);
        // Genuinely different spatial content → different wHash
        expect(rA.wHash).not.toBe(rB.wHash);
    });

    ita('wHash e pHash são calculados do MESMO ImageData 32×32 (otimização)', async () => {
        // Verifica que a otimização de compartilhar o canvas 32×32
        // produz resultados equivalentes a calculá-los separadamente
        const img   = mangaPage(100, 100, 'EN');
        const r     = await simulateCalculateVisualFingerprint(img, 100, 100);

        // Recalcula individualmente com a imagem escalada 32×32 para verificar
        const OffscreenCanvas = makeOffscreenCanvasStub(img, 100, 100);
        const oc32 = new OffscreenCanvas(32, 32);
        oc32.getContext('2d').drawImage({ _data: img, close() {} }, 0, 0, 32, 32);
        const id32 = oc32.getContext('2d').getImageData(0, 0, 32, 32);

        const wHashIndividual = fp.calculateWHash(id32.data);
        const pHashIndividual = fp.calculatePHash(id32.data);

        expect(r.wHash).toBe(wHashIndividual);
        expect(r.pHash).toBe(pHashIndividual);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — CALCULATE_VISUAL_FINGERPRINT — cross-language matching via SW
// ─────────────────────────────────────────────────────────────────────────────
describe('CALCULATE_VISUAL_FINGERPRINT — cross-language matching via SW', () => {

    ita('[CROSS-LANGUAGE] fingerprint EN e PT da mesma página passam em matchPerceptualHashes', async () => {
        const imgEN = mangaPage(200, 300, 'EN');
        const imgPT = mangaPage(200, 300, 'PT');

        const rEN = await simulateCalculateVisualFingerprint(imgEN, 200, 300);
        const rPT = await simulateCalculateVisualFingerprint(imgPT, 200, 300);

        const decision = fp.matchPerceptualHashes(
            rEN.wHash, rEN.pHash,
            rPT.wHash, rPT.pHash,
        );

        console.log(`      SW cross-language: match=${decision.match}, confidence=${decision.confidence?.toFixed(3)}, wDist=${decision.wDist}, pDist=${decision.pDist}`);
        expect(decision.match).toBe(true);
    });

    ita('[CROSS-LANGUAGE] imagem diferente NÃO faz match', async () => {
        const imgEN    = mangaPage(200, 300, 'EN');
        const imgNoise = noise(200, 300, 9999);

        const rEN    = await simulateCalculateVisualFingerprint(imgEN,    200, 300);
        const rNoise = await simulateCalculateVisualFingerprint(imgNoise, 200, 300);

        const decision = fp.matchPerceptualHashes(
            rEN.wHash, rEN.pHash,
            rNoise.wHash, rNoise.pHash,
        );

        expect(decision.match).toBe(false);
    });

    ita('regionalHashes EN vs PT — ≥ 3/4 cantos coincidem', async () => {
        const imgEN = mangaPage(200, 300, 'EN');
        const imgPT = mangaPage(200, 300, 'PT');

        const rEN = await simulateCalculateVisualFingerprint(imgEN, 200, 300);
        const rPT = await simulateCalculateVisualFingerprint(imgPT, 200, 300);

        const matchResult = fp.matchRegionalHashes(
            rEN.regionalHashes,
            rPT.regionalHashes,
            { threshold: 8, minMatches: 3 },
        );

        console.log(`      Regional match: count=${matchResult.matchCount}/4`);
        expect(matchResult.match).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — CALCULATE_VISUAL_FINGERPRINT — gestão do bitmap.close()
// ─────────────────────────────────────────────────────────────────────────────
describe('CALCULATE_VISUAL_FINGERPRINT — gestão de recursos (bitmap.close)', () => {

    ita('bitmap.close() é chamado mesmo em caso de sucesso', async () => {
        let closeCalled = false;
        const fpApiMock = {
            ...fp,
            // Não sobrescreve nada — só rastreia o close()
        };

        // Adiciona rastreamento ao bitmap dentro do simulador
        const img = solidColor(50, 50);
        const OffscreenCanvas = makeOffscreenCanvasStub(img, 50, 50);
        const fakeBitmap = {
            _data: img, width: 50, height: 50,
            close() { closeCalled = true; },
        };

        // Executa a pipeline manualmente para interceptar o close
        const oc8 = new OffscreenCanvas(8, 8);
        oc8.getContext('2d').drawImage(fakeBitmap, 0, 0, 8, 8);
        const pixelSample = Array.from(oc8.getContext('2d').getImageData(0,0,8,8).data)
            .map(b => b.toString(16).padStart(2,'0')).join('');
        fakeBitmap.close();

        expect(closeCalled).toBe(true);
    });

    ita('pixelSample nunca está vazio para imagem válida', async () => {
        const images = [
            solidColor(100, 100, 0,   0,   0),
            solidColor(100, 100, 255, 255, 255),
            horizontalGradient(100, 100),
            mangaPage(100, 100, 'EN'),
        ];
        for (const img of images) {
            const r = await simulateCalculateVisualFingerprint(img, 100, 100);
            expect(r.pixelSample).toHaveLength(512);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — CALCULATE_VISUAL_FINGERPRINT — consistência entre SW e content script
// Verifica que os mesmos pixels produzem os mesmos hashes independente
// de onde são calculados (SW via OffscreenCanvas ou content script via canvas DOM).
// ─────────────────────────────────────────────────────────────────────────────
describe('CALCULATE_VISUAL_FINGERPRINT — consistência SW ↔ content script', () => {

    ita('wHash calculado no SW == wHash calculado diretamente (mesmos pixels 32×32)', async () => {
        const img = mangaPage(32, 32, 'EN'); // já é 32×32

        // Simula SW: drawImage no OffscreenCanvas 32×32 → wHash
        const r = await simulateCalculateVisualFingerprint(img, 32, 32);

        // Simula content script: calculateWHash diretamente com mesmos pixels
        const directWHash = fp.calculateWHash(img);

        expect(r.wHash).toBe(directWHash);
    });

    ita('pHash calculado no SW == pHash calculado diretamente (mesmos pixels 32×32)', async () => {
        const img = mangaPage(32, 32, 'PT');
        const r   = await simulateCalculateVisualFingerprint(img, 32, 32);
        const directPHash = fp.calculatePHash(img);
        expect(r.pHash).toBe(directPHash);
    });

    ita('dHash calculado no SW == dHash calculado diretamente (mesmos pixels 9×8)', async () => {
        const img = horizontalGradient(9, 8);
        const r   = await simulateCalculateVisualFingerprint(img, 9, 8);
        const directDHash = fp.calculateDHash(img);
        expect(r.dHash).toBe(directDHash);
    });

    ita('regionalHashes SW == regionalHashes direto (mesmos pixels 48×48)', async () => {
        const img = mangaPage(48, 48, 'EN');
        const r   = await simulateCalculateVisualFingerprint(img, 48, 48);
        const directRegional = fp.calculateRegionalHashes(img);
        expect(r.regionalHashes.topLeft).toBe(directRegional.topLeft);
        expect(r.regionalHashes.topRight).toBe(directRegional.topRight);
        expect(r.regionalHashes.bottomLeft).toBe(directRegional.bottomLeft);
        expect(r.regionalHashes.bottomRight).toBe(directRegional.bottomRight);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — Integração: SW fingerprint → IndexedDB → lookup perceptual
// End-to-end sem DOM, sem chrome.*, sem fetch real.
// ─────────────────────────────────────────────────────────────────────────────
describe('Integração SW fingerprint → IndexedDB → lookup perceptual', () => {

    require('../../extension/shared/gtc-indexeddb.js');
    const idb = globalThis.MangaTranslatorGtcIndexedDb;

    ita('pipeline completo: calcular → salvar → buscar cross-language', async () => {
        const repo = idb.createInMemoryRepository();

        // 1. Usuário A traduz página EN via Gemini
        const imgEN = mangaPage(200, 300, 'EN');
        const fpEN  = await simulateCalculateVisualFingerprint(imgEN, 200, 300);

        // 2. Salva no IndexedDB com todos os campos visual-v3
        await repo.put({
            hash:               'sha256_en_page1',
            translatedDataUrl:  'data:image/png;base64,TRANSLATED_PAGE1',
            dHash:              fpEN.dHash,
            wHash:              fpEN.wHash,
            pHash:              fpEN.pHash,
            regionalHashes:     fpEN.regionalHashes,
            cleanUrl:           'https://cdn.site.com/en/chapter1/page1.jpg',
            width:              1200,
            height:             1800,
            fingerprintVersion: 'visual-v3',
        });

        // 3. Usuário B acessa mesma página em scanlação PT
        const imgPT = mangaPage(200, 300, 'PT');
        const fpPT  = await simulateCalculateVisualFingerprint(imgPT, 200, 300);

        // 4. Fase 2 (SHA-256 diferente → fallback para lookup perceptual)
        const result = await repo.getManyByPerceptual([fpPT.wHash], [fpPT.pHash], fp);
        const values = Object.values(result);

        console.log(`      Pipeline E2E: ${values.length} resultado(s), confidence=${values[0]?.confidence?.toFixed(3)}`);

        expect(values.length).toBeGreaterThan(0);
        expect(values[0].translatedDataUrl).toBe('data:image/png;base64,TRANSLATED_PAGE1');
        expect(values[0].confidence).toBeGreaterThan(0);
    });
});
```

## 16. Mapa linha por linha

| Linha | Unidade e conteúdo | Evidência |
|---:|---|---|
| 1 | bootstrap/imports — 'use strict'; | 🟨 executado no runner visual |
| 2 | bootstrap/imports — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 3 | bootstrap/imports — // test_background_fingerprint.js | estrutural/documental |
| 4 | bootstrap/imports — // Testes para o handler CALCULATE_VISUAL_FINGERPRINT do background.js | estrutural/documental |
| 5 | bootstrap/imports — // e para a integração background ↔ gtc-fingerprint via OffscreenCanvas simulado. | estrutural/documental |
| 6 | bootstrap/imports — // | estrutural/documental |
| 7 | bootstrap/imports — // Como o background.js é um Service Worker e usa fetch + OffscreenCanvas, | estrutural/documental |
| 8 | bootstrap/imports — // criamos stubs determinísticos que replicam o comportamento real: | estrutural/documental |
| 9 | bootstrap/imports — //   - fetchStub: retorna um Blob fake com pixels controlados | estrutural/documental |
| 10 | bootstrap/imports — //   - createImageBitmapStub: retorna um bitmap fake com close() | estrutural/documental |
| 11 | bootstrap/imports — //   - OffscreenCanvasStub: implementa getContext('2d').drawImage / getImageData | estrutural/documental |
| 12 | bootstrap/imports — // | estrutural/documental |
| 13 | bootstrap/imports — // Isso testa TODA a lógica do handler sem depender de chrome.* ou DOM real. | estrutural/documental |
| 14 | bootstrap/imports — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 15 | bootstrap/imports — (linha em branco) | estrutural/documental |
| 16 | bootstrap/imports — globalThis.self = globalThis; | 🟨 executado no runner visual |
| 17 | bootstrap/imports — require('../../extension/shared/gtc-fingerprint.js'); | 🟦 carrega implementação compartilhada real |
| 18 | bootstrap/imports — (linha em branco) | estrutural/documental |
| 19 | bootstrap/imports — const { describe, it, ita, beforeEach, expect } = require('./runner.js'); | 🟨 executado no runner visual |
| 20 | bootstrap/imports — const { solidColor, horizontalGradient, checkerboard, mangaPage, noise, brightnessShifted... | 🟨 executado no runner visual |
| 21 | bootstrap/imports — const fp = globalThis.MangaTranslatorGtcFingerprint; | 🟨 executado no runner visual |
| 22 | makeOffscreenCanvasStub — (linha em branco) | estrutural/documental |
| 23 | makeOffscreenCanvasStub — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 24 | makeOffscreenCanvasStub — // Stubs reutilizáveis para simular ambiente do Service Worker | estrutural/documental |
| 25 | makeOffscreenCanvasStub — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 26 | makeOffscreenCanvasStub — (linha em branco) | estrutural/documental |
| 27 | makeOffscreenCanvasStub — /** | estrutural/documental |
| 28 | makeOffscreenCanvasStub — * Cria um OffscreenCanvas stub que, ao receber drawImage, escreve os pixels | estrutural/documental |
| 29 | makeOffscreenCanvasStub — * da imageData 'pixelData' (redimensionada para width×height via nearest-neighbor). | estrutural/documental |
| 30 | makeOffscreenCanvasStub — */ | estrutural/documental |
| 31 | makeOffscreenCanvasStub — function makeOffscreenCanvasStub(sourceData, sourceW, sourceH) { | 🟨 executado no simulador local; não é handler real |
| 32 | makeOffscreenCanvasStub — function OffscreenCanvasStub(w, h) { | 🟨 executado no simulador local; não é handler real |
| 33 | makeOffscreenCanvasStub — this._w = w; | 🟨 executado no simulador local; não é handler real |
| 34 | makeOffscreenCanvasStub — this._h = h; | 🟨 executado no simulador local; não é handler real |
| 35 | makeOffscreenCanvasStub — this._data = new Uint8ClampedArray(w * h * 4); | 🟨 executado no simulador local; não é handler real |
| 36 | makeOffscreenCanvasStub — } | 🟨 executado no simulador local; não é handler real |
| 37 | makeOffscreenCanvasStub — (linha em branco) | estrutural/documental |
| 38 | makeOffscreenCanvasStub — OffscreenCanvasStub.prototype.getContext = function(type) { | 🟨 executado no simulador local; não é handler real |
| 39 | makeOffscreenCanvasStub — const canvas = this; | 🟨 executado no simulador local; não é handler real |
| 40 | makeOffscreenCanvasStub — return { | 🟨 executado no simulador local; não é handler real |
| 41 | makeOffscreenCanvasStub — drawImage(bitmap, x, y, dw, dh) { | 🟨 executado no simulador local; não é handler real |
| 42 | makeOffscreenCanvasStub — // Nearest-neighbor resize de sourceData → canvas._w × canvas._h | estrutural/documental |
| 43 | makeOffscreenCanvasStub — const sw = sourceW, sh = sourceH; | 🟨 executado no simulador local; não é handler real |
| 44 | makeOffscreenCanvasStub — const tw = dw \|\| canvas._w, th = dh \|\| canvas._h; | 🟨 executado no simulador local; não é handler real |
| 45 | makeOffscreenCanvasStub — const buf = new Uint8ClampedArray(tw * th * 4); | 🟨 executado no simulador local; não é handler real |
| 46 | makeOffscreenCanvasStub — for (let r = 0; r < th; r++) { | 🟨 executado no simulador local; não é handler real |
| 47 | makeOffscreenCanvasStub — for (let c = 0; c < tw; c++) { | 🟨 executado no simulador local; não é handler real |
| 48 | makeOffscreenCanvasStub — const sr = Math.floor(r * sh / th); | 🟨 executado no simulador local; não é handler real |
| 49 | makeOffscreenCanvasStub — const sc = Math.floor(c * sw / tw); | 🟨 executado no simulador local; não é handler real |
| 50 | makeOffscreenCanvasStub — const si = (sr * sw + sc) * 4; | 🟨 executado no simulador local; não é handler real |
| 51 | makeOffscreenCanvasStub — const di = (r  * tw + c)  * 4; | 🟨 executado no simulador local; não é handler real |
| 52 | makeOffscreenCanvasStub — buf[di]   = sourceData[si]; | 🟨 executado no simulador local; não é handler real |
| 53 | makeOffscreenCanvasStub — buf[di+1] = sourceData[si+1]; | 🟨 executado no simulador local; não é handler real |
| 54 | makeOffscreenCanvasStub — buf[di+2] = sourceData[si+2]; | 🟨 executado no simulador local; não é handler real |
| 55 | makeOffscreenCanvasStub — buf[di+3] = sourceData[si+3]; | 🟨 executado no simulador local; não é handler real |
| 56 | makeOffscreenCanvasStub — } | 🟨 executado no simulador local; não é handler real |
| 57 | makeOffscreenCanvasStub — } | 🟨 executado no simulador local; não é handler real |
| 58 | makeOffscreenCanvasStub — canvas._data = buf; | 🟨 executado no simulador local; não é handler real |
| 59 | makeOffscreenCanvasStub — canvas._w = tw; canvas._h = th; | 🟨 executado no simulador local; não é handler real |
| 60 | makeOffscreenCanvasStub — }, | 🟨 executado no simulador local; não é handler real |
| 61 | makeOffscreenCanvasStub — getImageData(x, y, w, h) { | 🟨 executado no simulador local; não é handler real |
| 62 | makeOffscreenCanvasStub — return { data: canvas._data }; | 🟨 executado no simulador local; não é handler real |
| 63 | makeOffscreenCanvasStub — }, | 🟨 executado no simulador local; não é handler real |
| 64 | makeOffscreenCanvasStub — }; | 🟨 executado no simulador local; não é handler real |
| 65 | makeOffscreenCanvasStub — }; | 🟨 executado no simulador local; não é handler real |
| 66 | makeOffscreenCanvasStub — (linha em branco) | estrutural/documental |
| 67 | makeOffscreenCanvasStub — return OffscreenCanvasStub; | 🟨 executado no simulador local; não é handler real |
| 68 | makeOffscreenCanvasStub — } | 🟨 executado no simulador local; não é handler real |
| 69 | makeOffscreenCanvasStub — (linha em branco) | estrutural/documental |
| 70 | simulateCalculateVisualFingerprint — /** | estrutural/documental |
| 71 | simulateCalculateVisualFingerprint — * Simula a lógica completa do handler CALCULATE_VISUAL_FINGERPRINT. | estrutural/documental |
| 72 | simulateCalculateVisualFingerprint — * Extrai o handler inline para poder testá-lo de forma isolada. | estrutural/documental |
| 73 | simulateCalculateVisualFingerprint — */ | estrutural/documental |
| 74 | simulateCalculateVisualFingerprint — async function simulateCalculateVisualFingerprint(imageData, imageW, imageH, fpApiOverrid... | 🟨 executado no simulador local; não é handler real |
| 75 | simulateCalculateVisualFingerprint — const fpApi = fpApiOverride \|\| globalThis.MangaTranslatorGtcFingerprint; | 🟨 executado no simulador local; não é handler real |
| 76 | simulateCalculateVisualFingerprint — if (!fpApi) return { ok: false, error: 'fpApi não disponível' }; | 🟨 executado no simulador local; não é handler real |
| 77 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 78 | simulateCalculateVisualFingerprint — // Simula OffscreenCanvas com os dados fornecidos | estrutural/documental |
| 79 | simulateCalculateVisualFingerprint — const OffscreenCanvas = makeOffscreenCanvasStub(imageData, imageW, imageH); | 🟨 executado no simulador local; não é handler real |
| 80 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 81 | simulateCalculateVisualFingerprint — // Simula createImageBitmap retornando objeto com close() | estrutural/documental |
| 82 | simulateCalculateVisualFingerprint — const bitmap = { | 🟨 executado no simulador local; não é handler real |
| 83 | simulateCalculateVisualFingerprint — width:  imageW, | 🟨 executado no simulador local; não é handler real |
| 84 | simulateCalculateVisualFingerprint — height: imageH, | 🟨 executado no simulador local; não é handler real |
| 85 | simulateCalculateVisualFingerprint — _data:  imageData, | 🟨 executado no simulador local; não é handler real |
| 86 | simulateCalculateVisualFingerprint — close() {}, | 🟨 executado no simulador local; não é handler real |
| 87 | simulateCalculateVisualFingerprint — }; | 🟨 executado no simulador local; não é handler real |
| 88 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 89 | simulateCalculateVisualFingerprint — // ── Canvas 8×8 → pixelSample ──────────────────────────────────────────── | estrutural/documental |
| 90 | simulateCalculateVisualFingerprint — const oc8  = new OffscreenCanvas(8, 8); | 🟨 executado no simulador local; não é handler real |
| 91 | simulateCalculateVisualFingerprint — const ctx8 = oc8.getContext('2d'); | 🟨 executado no simulador local; não é handler real |
| 92 | simulateCalculateVisualFingerprint — ctx8.drawImage(bitmap, 0, 0, 8, 8); | 🟨 executado no simulador local; não é handler real |
| 93 | simulateCalculateVisualFingerprint — const id8 = ctx8.getImageData(0, 0, 8, 8); | 🟨 executado no simulador local; não é handler real |
| 94 | simulateCalculateVisualFingerprint — const pixelSample = Array.from(id8.data) | 🟨 executado no simulador local; não é handler real |
| 95 | simulateCalculateVisualFingerprint — .map(b => b.toString(16).padStart(2, '0')).join(''); | 🟨 executado no simulador local; não é handler real |
| 96 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 97 | simulateCalculateVisualFingerprint — // ── Canvas 9×8 → dHash ────────────────────────────────────────────────── | estrutural/documental |
| 98 | simulateCalculateVisualFingerprint — let dHash = null; | 🟨 executado no simulador local; não é handler real |
| 99 | simulateCalculateVisualFingerprint — if (typeof fpApi.calculateDHash === 'function') { | 🟨 executado no simulador local; não é handler real |
| 100 | simulateCalculateVisualFingerprint — const oc9  = new OffscreenCanvas(9, 8); | 🟨 executado no simulador local; não é handler real |
| 101 | simulateCalculateVisualFingerprint — const ctx9 = oc9.getContext('2d'); | 🟨 executado no simulador local; não é handler real |
| 102 | simulateCalculateVisualFingerprint — ctx9.drawImage(bitmap, 0, 0, 9, 8); | 🟨 executado no simulador local; não é handler real |
| 103 | simulateCalculateVisualFingerprint — const id9 = ctx9.getImageData(0, 0, 9, 8); | 🟨 executado no simulador local; não é handler real |
| 104 | simulateCalculateVisualFingerprint — dHash = fpApi.calculateDHash(id9.data); | 🟨 executado no simulador local; não é handler real |
| 105 | simulateCalculateVisualFingerprint — } | 🟨 executado no simulador local; não é handler real |
| 106 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 107 | simulateCalculateVisualFingerprint — // ── Canvas 32×32 → wHash + pHash (mesmo ImageData, NOVO) ─────────────── | estrutural/documental |
| 108 | simulateCalculateVisualFingerprint — let wHash = null; | 🟨 executado no simulador local; não é handler real |
| 109 | simulateCalculateVisualFingerprint — let pHash = null; | 🟨 executado no simulador local; não é handler real |
| 110 | simulateCalculateVisualFingerprint — if (fpApi.calculateWHash \|\| fpApi.calculatePHash) { | 🟨 executado no simulador local; não é handler real |
| 111 | simulateCalculateVisualFingerprint — const oc32  = new OffscreenCanvas(32, 32); | 🟨 executado no simulador local; não é handler real |
| 112 | simulateCalculateVisualFingerprint — const ctx32 = oc32.getContext('2d'); | 🟨 executado no simulador local; não é handler real |
| 113 | simulateCalculateVisualFingerprint — ctx32.drawImage(bitmap, 0, 0, 32, 32); | 🟨 executado no simulador local; não é handler real |
| 114 | simulateCalculateVisualFingerprint — const id32 = ctx32.getImageData(0, 0, 32, 32); | 🟨 executado no simulador local; não é handler real |
| 115 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 116 | simulateCalculateVisualFingerprint — if (typeof fpApi.calculateWHash === 'function') { | 🟨 executado no simulador local; não é handler real |
| 117 | simulateCalculateVisualFingerprint — wHash = fpApi.calculateWHash(id32.data); | 🟨 executado no simulador local; não é handler real |
| 118 | simulateCalculateVisualFingerprint — } | 🟨 executado no simulador local; não é handler real |
| 119 | simulateCalculateVisualFingerprint — if (typeof fpApi.calculatePHash === 'function') { | 🟨 executado no simulador local; não é handler real |
| 120 | simulateCalculateVisualFingerprint — pHash = fpApi.calculatePHash(id32.data); | 🟨 executado no simulador local; não é handler real |
| 121 | simulateCalculateVisualFingerprint — } | 🟨 executado no simulador local; não é handler real |
| 122 | simulateCalculateVisualFingerprint — } | 🟨 executado no simulador local; não é handler real |
| 123 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 124 | simulateCalculateVisualFingerprint — // ── Canvas 48×48 → regionalHashes ────────────────────────────────────── | estrutural/documental |
| 125 | simulateCalculateVisualFingerprint — let regionalHashes = null; | 🟨 executado no simulador local; não é handler real |
| 126 | simulateCalculateVisualFingerprint — if (typeof fpApi.calculateRegionalHashes === 'function') { | 🟨 executado no simulador local; não é handler real |
| 127 | simulateCalculateVisualFingerprint — const oc48  = new OffscreenCanvas(48, 48); | 🟨 executado no simulador local; não é handler real |
| 128 | simulateCalculateVisualFingerprint — const ctx48 = oc48.getContext('2d'); | 🟨 executado no simulador local; não é handler real |
| 129 | simulateCalculateVisualFingerprint — ctx48.drawImage(bitmap, 0, 0, 48, 48); | 🟨 executado no simulador local; não é handler real |
| 130 | simulateCalculateVisualFingerprint — const id48 = ctx48.getImageData(0, 0, 48, 48); | 🟨 executado no simulador local; não é handler real |
| 131 | simulateCalculateVisualFingerprint — regionalHashes = fpApi.calculateRegionalHashes(id48.data); | 🟨 executado no simulador local; não é handler real |
| 132 | simulateCalculateVisualFingerprint — } | 🟨 executado no simulador local; não é handler real |
| 133 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 134 | simulateCalculateVisualFingerprint — bitmap.close(); | 🟨 executado no simulador local; não é handler real |
| 135 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 136 | simulateCalculateVisualFingerprint — return { ok: true, pixelSample, dHash, wHash, pHash, regionalHashes }; | 🟨 executado no simulador local; não é handler real |
| 137 | simulateCalculateVisualFingerprint — } | 🟨 executado no simulador local; não é handler real |
| 138 | simulateCalculateVisualFingerprint — (linha em branco) | estrutural/documental |
| 139 | suite 1 resposta — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 140 | suite 1 resposta — // SUITE 1 — CALCULATE_VISUAL_FINGERPRINT — estrutura da resposta | estrutural/documental |
| 141 | suite 1 resposta — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 142 | suite 1 resposta — describe('CALCULATE_VISUAL_FINGERPRINT — estrutura da resposta', () => { | 🟨 executado no runner visual |
| 143 | suite 1 resposta — (linha em branco) | estrutural/documental |
| 144 | suite 1 resposta — ita('retorna ok:true com todos os campos presentes', async () => { | 🟨 executado no runner visual |
| 145 | suite 1 resposta — const img = horizontalGradient(100, 100); | 🟨 executado no runner visual |
| 146 | suite 1 resposta — const r = await simulateCalculateVisualFingerprint(img, 100, 100); | 🟨 executado no runner visual |
| 147 | suite 1 resposta — (linha em branco) | estrutural/documental |
| 148 | suite 1 resposta — expect(r.ok).toBe(true); | ✅ assertion direta do cenário |
| 149 | suite 1 resposta — expect(r).toHaveProperty('pixelSample'); | ✅ assertion direta do cenário |
| 150 | suite 1 resposta — expect(r).toHaveProperty('dHash'); | ✅ assertion direta do cenário |
| 151 | suite 1 resposta — expect(r).toHaveProperty('wHash'); | ✅ assertion direta do cenário |
| 152 | suite 1 resposta — expect(r).toHaveProperty('pHash'); | ✅ assertion direta do cenário |
| 153 | suite 1 resposta — expect(r).toHaveProperty('regionalHashes'); | ✅ assertion direta do cenário |
| 154 | suite 1 resposta — }); | 🟨 executado no runner visual |
| 155 | suite 1 resposta — (linha em branco) | estrutural/documental |
| 156 | suite 1 resposta — ita('pixelSample é string hex de 256 chars (8×8×4 bytes = 256 bytes = 512 hex chars)', as... | 🟨 executado no runner visual |
| 157 | suite 1 resposta — // 8×8 canvas = 64 pixels × 4 bytes RGBA = 256 bytes → 512 hex chars | estrutural/documental |
| 158 | suite 1 resposta — const img = solidColor(100, 100, 128, 64, 32); | 🟨 executado no runner visual |
| 159 | suite 1 resposta — const r   = await simulateCalculateVisualFingerprint(img, 100, 100); | 🟨 executado no runner visual |
| 160 | suite 1 resposta — expect(typeof r.pixelSample).toBe('string'); | ✅ assertion direta do cenário |
| 161 | suite 1 resposta — expect(r.pixelSample).toHaveLength(512); | ✅ assertion direta do cenário |
| 162 | suite 1 resposta — expect(r.pixelSample).toMatch(/^[0-9a-f]+$/); | ✅ assertion direta do cenário |
| 163 | suite 1 resposta — }); | 🟨 executado no runner visual |
| 164 | suite 1 resposta — (linha em branco) | estrutural/documental |
| 165 | suite 1 resposta — ita('dHash é string de 16 chars hex', async () => { | 🟨 executado no runner visual |
| 166 | suite 1 resposta — const img = horizontalGradient(200, 300); | 🟨 executado no runner visual |
| 167 | suite 1 resposta — const r   = await simulateCalculateVisualFingerprint(img, 200, 300); | 🟨 executado no runner visual |
| 168 | suite 1 resposta — expect(isValidHex(r.dHash, 16)).toBeTruthy(); | ✅ assertion direta do cenário |
| 169 | suite 1 resposta — }); | 🟨 executado no runner visual |
| 170 | suite 1 resposta — (linha em branco) | estrutural/documental |
| 171 | suite 1 resposta — ita('wHash é string de 64 chars hex (256 bits)', async () => { | 🟨 executado no runner visual |
| 172 | suite 1 resposta — const img = mangaPage(200, 300, 'EN'); | 🟨 executado no runner visual |
| 173 | suite 1 resposta — const r   = await simulateCalculateVisualFingerprint(img, 200, 300); | 🟨 executado no runner visual |
| 174 | suite 1 resposta — expect(isValidHex(r.wHash, 64)).toBeTruthy(); | ✅ assertion direta do cenário |
| 175 | suite 1 resposta — }); | 🟨 executado no runner visual |
| 176 | suite 1 resposta — (linha em branco) | estrutural/documental |
| 177 | suite 1 resposta — ita('pHash é string de 64 chars hex (256 bits)', async () => { | 🟨 executado no runner visual |
| 178 | suite 1 resposta — const img = mangaPage(200, 300, 'EN'); | 🟨 executado no runner visual |
| 179 | suite 1 resposta — const r   = await simulateCalculateVisualFingerprint(img, 200, 300); | 🟨 executado no runner visual |
| 180 | suite 1 resposta — expect(isValidHex(r.pHash, 64)).toBeTruthy(); | ✅ assertion direta do cenário |
| 181 | suite 1 resposta — }); | 🟨 executado no runner visual |
| 182 | suite 1 resposta — (linha em branco) | estrutural/documental |
| 183 | suite 1 resposta — ita('regionalHashes tem 4 campos, cada um com 16 chars hex', async () => { | 🟨 executado no runner visual |
| 184 | suite 1 resposta — const img = mangaPage(200, 300, 'EN'); | 🟨 executado no runner visual |
| 185 | suite 1 resposta — const r   = await simulateCalculateVisualFingerprint(img, 200, 300); | 🟨 executado no runner visual |
| 186 | suite 1 resposta — expect(r.regionalHashes).toBeDefined(); | ✅ assertion direta do cenário |
| 187 | suite 1 resposta — expect(isValidHex(r.regionalHashes.topLeft,     16)).toBeTruthy(); | ✅ assertion direta do cenário |
| 188 | suite 1 resposta — expect(isValidHex(r.regionalHashes.topRight,    16)).toBeTruthy(); | ✅ assertion direta do cenário |
| 189 | suite 1 resposta — expect(isValidHex(r.regionalHashes.bottomLeft,  16)).toBeTruthy(); | ✅ assertion direta do cenário |
| 190 | suite 1 resposta — expect(isValidHex(r.regionalHashes.bottomRight, 16)).toBeTruthy(); | ✅ assertion direta do cenário |
| 191 | suite 1 resposta — }); | 🟨 executado no runner visual |
| 192 | suite 1 resposta — }); | 🟨 executado no runner visual |
| 193 | suite 1 resposta — (linha em branco) | estrutural/documental |
| 194 | suite 1 resposta — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 195 | suite 2 determinismo — // SUITE 2 — CALCULATE_VISUAL_FINGERPRINT — determinismo e consistência | estrutural/documental |
| 196 | suite 2 determinismo — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 197 | suite 2 determinismo — describe('CALCULATE_VISUAL_FINGERPRINT — determinismo', () => { | 🟨 executado no runner visual |
| 198 | suite 2 determinismo — (linha em branco) | estrutural/documental |
| 199 | suite 2 determinismo — ita('dois calls com mesma imagem retornam hashes idênticos', async () => { | 🟨 executado no runner visual |
| 200 | suite 2 determinismo — const img = mangaPage(150, 200, 'EN'); | 🟨 executado no runner visual |
| 201 | suite 2 determinismo — const r1 = await simulateCalculateVisualFingerprint(img, 150, 200); | 🟨 executado no runner visual |
| 202 | suite 2 determinismo — const r2 = await simulateCalculateVisualFingerprint(img, 150, 200); | 🟨 executado no runner visual |
| 203 | suite 2 determinismo — expect(r1.pixelSample).toBe(r2.pixelSample); | ✅ assertion direta do cenário |
| 204 | suite 2 determinismo — expect(r1.dHash).toBe(r2.dHash); | ✅ assertion direta do cenário |
| 205 | suite 2 determinismo — expect(r1.wHash).toBe(r2.wHash); | ✅ assertion direta do cenário |
| 206 | suite 2 determinismo — expect(r1.pHash).toBe(r2.pHash); | ✅ assertion direta do cenário |
| 207 | suite 2 determinismo — expect(r1.regionalHashes.topLeft).toBe(r2.regionalHashes.topLeft); | ✅ assertion direta do cenário |
| 208 | suite 2 determinismo — }); | 🟨 executado no runner visual |
| 209 | suite 2 determinismo — (linha em branco) | estrutural/documental |
| 210 | suite 2 determinismo — ita('estruturalmente diferentes produzem wHashes diferentes', async () => { | 🟨 executado no runner visual |
| 211 | suite 2 determinismo — // Use images with genuine spatial structure — constant images have identical LL subband | estrutural/documental |
| 212 | suite 2 determinismo — const imgA = horizontalGradient(100, 100);    // low-freq gradient | 🟨 executado no runner visual |
| 213 | suite 2 determinismo — const imgB = checkerboard(100, 100, 4);        // high-freq checkerboard | 🟨 executado no runner visual |
| 214 | suite 2 determinismo — const rA = await simulateCalculateVisualFingerprint(imgA, 100, 100); | 🟨 executado no runner visual |
| 215 | suite 2 determinismo — const rB = await simulateCalculateVisualFingerprint(imgB, 100, 100); | 🟨 executado no runner visual |
| 216 | suite 2 determinismo — // Genuinely different spatial content → different wHash | estrutural/documental |
| 217 | suite 2 determinismo — expect(rA.wHash).not.toBe(rB.wHash); | ✅ assertion direta do cenário |
| 218 | suite 2 determinismo — }); | 🟨 executado no runner visual |
| 219 | suite 2 determinismo — (linha em branco) | estrutural/documental |
| 220 | suite 2 determinismo — ita('wHash e pHash são calculados do MESMO ImageData 32×32 (otimização)', async () => { | 🟨 executado no runner visual |
| 221 | suite 2 determinismo — // Verifica que a otimização de compartilhar o canvas 32×32 | estrutural/documental |
| 222 | suite 2 determinismo — // produz resultados equivalentes a calculá-los separadamente | estrutural/documental |
| 223 | suite 2 determinismo — const img   = mangaPage(100, 100, 'EN'); | 🟨 executado no runner visual |
| 224 | suite 2 determinismo — const r     = await simulateCalculateVisualFingerprint(img, 100, 100); | 🟨 executado no runner visual |
| 225 | suite 2 determinismo — (linha em branco) | estrutural/documental |
| 226 | suite 2 determinismo — // Recalcula individualmente com a imagem escalada 32×32 para verificar | estrutural/documental |
| 227 | suite 2 determinismo — const OffscreenCanvas = makeOffscreenCanvasStub(img, 100, 100); | 🟨 executado no runner visual |
| 228 | suite 2 determinismo — const oc32 = new OffscreenCanvas(32, 32); | 🟨 executado no runner visual |
| 229 | suite 2 determinismo — oc32.getContext('2d').drawImage({ _data: img, close() {} }, 0, 0, 32, 32); | 🟨 executado no runner visual |
| 230 | suite 2 determinismo — const id32 = oc32.getContext('2d').getImageData(0, 0, 32, 32); | 🟨 executado no runner visual |
| 231 | suite 2 determinismo — (linha em branco) | estrutural/documental |
| 232 | suite 2 determinismo — const wHashIndividual = fp.calculateWHash(id32.data); | 🟨 executado no runner visual |
| 233 | suite 2 determinismo — const pHashIndividual = fp.calculatePHash(id32.data); | 🟨 executado no runner visual |
| 234 | suite 2 determinismo — (linha em branco) | estrutural/documental |
| 235 | suite 2 determinismo — expect(r.wHash).toBe(wHashIndividual); | ✅ assertion direta do cenário |
| 236 | suite 2 determinismo — expect(r.pHash).toBe(pHashIndividual); | ✅ assertion direta do cenário |
| 237 | suite 2 determinismo — }); | 🟨 executado no runner visual |
| 238 | suite 2 determinismo — }); | 🟨 executado no runner visual |
| 239 | suite 2 determinismo — (linha em branco) | estrutural/documental |
| 240 | suite 3 cross-language — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 241 | suite 3 cross-language — // SUITE 3 — CALCULATE_VISUAL_FINGERPRINT — cross-language matching via SW | estrutural/documental |
| 242 | suite 3 cross-language — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 243 | suite 3 cross-language — describe('CALCULATE_VISUAL_FINGERPRINT — cross-language matching via SW', () => { | 🟨 executado no runner visual |
| 244 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 245 | suite 3 cross-language — ita('[CROSS-LANGUAGE] fingerprint EN e PT da mesma página passam em matchPerceptualHashes... | 🟨 executado no runner visual |
| 246 | suite 3 cross-language — const imgEN = mangaPage(200, 300, 'EN'); | 🟨 executado no runner visual |
| 247 | suite 3 cross-language — const imgPT = mangaPage(200, 300, 'PT'); | 🟨 executado no runner visual |
| 248 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 249 | suite 3 cross-language — const rEN = await simulateCalculateVisualFingerprint(imgEN, 200, 300); | 🟨 executado no runner visual |
| 250 | suite 3 cross-language — const rPT = await simulateCalculateVisualFingerprint(imgPT, 200, 300); | 🟨 executado no runner visual |
| 251 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 252 | suite 3 cross-language — const decision = fp.matchPerceptualHashes( | 🟨 executado no runner visual |
| 253 | suite 3 cross-language — rEN.wHash, rEN.pHash, | 🟨 executado no runner visual |
| 254 | suite 3 cross-language — rPT.wHash, rPT.pHash, | 🟨 executado no runner visual |
| 255 | suite 3 cross-language — ); | 🟨 executado no runner visual |
| 256 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 257 | suite 3 cross-language — console.log('      SW cross-language: match=${decision.match}, confidence=${decision.conf... | 🟨 executado no runner visual |
| 258 | suite 3 cross-language — expect(decision.match).toBe(true); | ✅ assertion direta do cenário |
| 259 | suite 3 cross-language — }); | 🟨 executado no runner visual |
| 260 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 261 | suite 3 cross-language — ita('[CROSS-LANGUAGE] imagem diferente NÃO faz match', async () => { | 🟨 executado no runner visual |
| 262 | suite 3 cross-language — const imgEN    = mangaPage(200, 300, 'EN'); | 🟨 executado no runner visual |
| 263 | suite 3 cross-language — const imgNoise = noise(200, 300, 9999); | 🟨 executado no runner visual |
| 264 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 265 | suite 3 cross-language — const rEN    = await simulateCalculateVisualFingerprint(imgEN,    200, 300); | 🟨 executado no runner visual |
| 266 | suite 3 cross-language — const rNoise = await simulateCalculateVisualFingerprint(imgNoise, 200, 300); | 🟨 executado no runner visual |
| 267 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 268 | suite 3 cross-language — const decision = fp.matchPerceptualHashes( | 🟨 executado no runner visual |
| 269 | suite 3 cross-language — rEN.wHash, rEN.pHash, | 🟨 executado no runner visual |
| 270 | suite 3 cross-language — rNoise.wHash, rNoise.pHash, | 🟨 executado no runner visual |
| 271 | suite 3 cross-language — ); | 🟨 executado no runner visual |
| 272 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 273 | suite 3 cross-language — expect(decision.match).toBe(false); | ✅ assertion direta do cenário |
| 274 | suite 3 cross-language — }); | 🟨 executado no runner visual |
| 275 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 276 | suite 3 cross-language — ita('regionalHashes EN vs PT — ≥ 3/4 cantos coincidem', async () => { | 🟨 executado no runner visual |
| 277 | suite 3 cross-language — const imgEN = mangaPage(200, 300, 'EN'); | 🟨 executado no runner visual |
| 278 | suite 3 cross-language — const imgPT = mangaPage(200, 300, 'PT'); | 🟨 executado no runner visual |
| 279 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 280 | suite 3 cross-language — const rEN = await simulateCalculateVisualFingerprint(imgEN, 200, 300); | 🟨 executado no runner visual |
| 281 | suite 3 cross-language — const rPT = await simulateCalculateVisualFingerprint(imgPT, 200, 300); | 🟨 executado no runner visual |
| 282 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 283 | suite 3 cross-language — const matchResult = fp.matchRegionalHashes( | 🟨 executado no runner visual |
| 284 | suite 3 cross-language — rEN.regionalHashes, | 🟨 executado no runner visual |
| 285 | suite 3 cross-language — rPT.regionalHashes, | 🟨 executado no runner visual |
| 286 | suite 3 cross-language — { threshold: 8, minMatches: 3 }, | 🟨 executado no runner visual |
| 287 | suite 3 cross-language — ); | 🟨 executado no runner visual |
| 288 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 289 | suite 3 cross-language — console.log('      Regional match: count=${matchResult.matchCount}/4'); | 🟨 executado no runner visual |
| 290 | suite 3 cross-language — expect(matchResult.match).toBe(true); | ✅ assertion direta do cenário |
| 291 | suite 3 cross-language — }); | 🟨 executado no runner visual |
| 292 | suite 3 cross-language — }); | 🟨 executado no runner visual |
| 293 | suite 3 cross-language — (linha em branco) | estrutural/documental |
| 294 | suite 4 recursos — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 295 | suite 4 recursos — // SUITE 4 — CALCULATE_VISUAL_FINGERPRINT — gestão do bitmap.close() | estrutural/documental |
| 296 | suite 4 recursos — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 297 | suite 4 recursos — describe('CALCULATE_VISUAL_FINGERPRINT — gestão de recursos (bitmap.close)', () => { | 🟨 executado no runner visual |
| 298 | suite 4 recursos — (linha em branco) | estrutural/documental |
| 299 | suite 4 recursos — ita('bitmap.close() é chamado mesmo em caso de sucesso', async () => { | 🟨 executado no runner visual |
| 300 | suite 4 recursos — let closeCalled = false; | 🟨 executado no runner visual |
| 301 | suite 4 recursos — const fpApiMock = { | 🟨 executado no runner visual |
| 302 | suite 4 recursos — ...fp, | 🟨 executado no runner visual |
| 303 | suite 4 recursos — // Não sobrescreve nada — só rastreia o close() | estrutural/documental |
| 304 | suite 4 recursos — }; | 🟨 executado no runner visual |
| 305 | suite 4 recursos — (linha em branco) | estrutural/documental |
| 306 | suite 4 recursos — // Adiciona rastreamento ao bitmap dentro do simulador | estrutural/documental |
| 307 | suite 4 recursos — const img = solidColor(50, 50); | 🟨 executado no runner visual |
| 308 | suite 4 recursos — const OffscreenCanvas = makeOffscreenCanvasStub(img, 50, 50); | 🟨 executado no runner visual |
| 309 | suite 4 recursos — const fakeBitmap = { | 🟨 executado no runner visual |
| 310 | suite 4 recursos — _data: img, width: 50, height: 50, | 🟨 executado no runner visual |
| 311 | suite 4 recursos — close() { closeCalled = true; }, | 🟨 executado no runner visual |
| 312 | suite 4 recursos — }; | 🟨 executado no runner visual |
| 313 | suite 4 recursos — (linha em branco) | estrutural/documental |
| 314 | suite 4 recursos — // Executa a pipeline manualmente para interceptar o close | estrutural/documental |
| 315 | suite 4 recursos — const oc8 = new OffscreenCanvas(8, 8); | 🟨 executado no runner visual |
| 316 | suite 4 recursos — oc8.getContext('2d').drawImage(fakeBitmap, 0, 0, 8, 8); | 🟨 executado no runner visual |
| 317 | suite 4 recursos — const pixelSample = Array.from(oc8.getContext('2d').getImageData(0,0,8,8).data) | 🟨 executado no runner visual |
| 318 | suite 4 recursos — .map(b => b.toString(16).padStart(2,'0')).join(''); | 🟨 executado no runner visual |
| 319 | suite 4 recursos — fakeBitmap.close(); | 🟨 executado no runner visual |
| 320 | suite 4 recursos — (linha em branco) | estrutural/documental |
| 321 | suite 4 recursos — expect(closeCalled).toBe(true); | ✅ assertion direta do cenário |
| 322 | suite 4 recursos — }); | 🟨 executado no runner visual |
| 323 | suite 4 recursos — (linha em branco) | estrutural/documental |
| 324 | suite 4 recursos — ita('pixelSample nunca está vazio para imagem válida', async () => { | 🟨 executado no runner visual |
| 325 | suite 4 recursos — const images = [ | 🟨 executado no runner visual |
| 326 | suite 4 recursos — solidColor(100, 100, 0,   0,   0), | 🟨 executado no runner visual |
| 327 | suite 4 recursos — solidColor(100, 100, 255, 255, 255), | 🟨 executado no runner visual |
| 328 | suite 4 recursos — horizontalGradient(100, 100), | 🟨 executado no runner visual |
| 329 | suite 4 recursos — mangaPage(100, 100, 'EN'), | 🟨 executado no runner visual |
| 330 | suite 4 recursos — ]; | 🟨 executado no runner visual |
| 331 | suite 4 recursos — for (const img of images) { | 🟨 executado no runner visual |
| 332 | suite 4 recursos — const r = await simulateCalculateVisualFingerprint(img, 100, 100); | 🟨 executado no runner visual |
| 333 | suite 4 recursos — expect(r.pixelSample).toHaveLength(512); | ✅ assertion direta do cenário |
| 334 | suite 4 recursos — } | 🟨 executado no runner visual |
| 335 | suite 4 recursos — }); | 🟨 executado no runner visual |
| 336 | suite 4 recursos — }); | 🟨 executado no runner visual |
| 337 | suite 4 recursos — (linha em branco) | estrutural/documental |
| 338 | suite 4 recursos — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 339 | suite 4 recursos — // SUITE 5 — CALCULATE_VISUAL_FINGERPRINT — consistência entre SW e content script | estrutural/documental |
| 340 | suite 5 consistencia — // Verifica que os mesmos pixels produzem os mesmos hashes independente | estrutural/documental |
| 341 | suite 5 consistencia — // de onde são calculados (SW via OffscreenCanvas ou content script via canvas DOM). | estrutural/documental |
| 342 | suite 5 consistencia — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 343 | suite 5 consistencia — describe('CALCULATE_VISUAL_FINGERPRINT — consistência SW ↔ content script', () => { | 🟨 executado no runner visual |
| 344 | suite 5 consistencia — (linha em branco) | estrutural/documental |
| 345 | suite 5 consistencia — ita('wHash calculado no SW == wHash calculado diretamente (mesmos pixels 32×32)', async (... | 🟨 executado no runner visual |
| 346 | suite 5 consistencia — const img = mangaPage(32, 32, 'EN'); // já é 32×32 | 🟨 executado no runner visual |
| 347 | suite 5 consistencia — (linha em branco) | estrutural/documental |
| 348 | suite 5 consistencia — // Simula SW: drawImage no OffscreenCanvas 32×32 → wHash | estrutural/documental |
| 349 | suite 5 consistencia — const r = await simulateCalculateVisualFingerprint(img, 32, 32); | 🟨 executado no runner visual |
| 350 | suite 5 consistencia — (linha em branco) | estrutural/documental |
| 351 | suite 5 consistencia — // Simula content script: calculateWHash diretamente com mesmos pixels | estrutural/documental |
| 352 | suite 5 consistencia — const directWHash = fp.calculateWHash(img); | 🟨 executado no runner visual |
| 353 | suite 5 consistencia — (linha em branco) | estrutural/documental |
| 354 | suite 5 consistencia — expect(r.wHash).toBe(directWHash); | ✅ assertion direta do cenário |
| 355 | suite 5 consistencia — }); | 🟨 executado no runner visual |
| 356 | suite 5 consistencia — (linha em branco) | estrutural/documental |
| 357 | suite 5 consistencia — ita('pHash calculado no SW == pHash calculado diretamente (mesmos pixels 32×32)', async (... | 🟨 executado no runner visual |
| 358 | suite 5 consistencia — const img = mangaPage(32, 32, 'PT'); | 🟨 executado no runner visual |
| 359 | suite 5 consistencia — const r   = await simulateCalculateVisualFingerprint(img, 32, 32); | 🟨 executado no runner visual |
| 360 | suite 5 consistencia — const directPHash = fp.calculatePHash(img); | 🟨 executado no runner visual |
| 361 | suite 5 consistencia — expect(r.pHash).toBe(directPHash); | ✅ assertion direta do cenário |
| 362 | suite 5 consistencia — }); | 🟨 executado no runner visual |
| 363 | suite 5 consistencia — (linha em branco) | estrutural/documental |
| 364 | suite 5 consistencia — ita('dHash calculado no SW == dHash calculado diretamente (mesmos pixels 9×8)', async () ... | 🟨 executado no runner visual |
| 365 | suite 5 consistencia — const img = horizontalGradient(9, 8); | 🟨 executado no runner visual |
| 366 | suite 5 consistencia — const r   = await simulateCalculateVisualFingerprint(img, 9, 8); | 🟨 executado no runner visual |
| 367 | suite 5 consistencia — const directDHash = fp.calculateDHash(img); | 🟨 executado no runner visual |
| 368 | suite 5 consistencia — expect(r.dHash).toBe(directDHash); | ✅ assertion direta do cenário |
| 369 | suite 5 consistencia — }); | 🟨 executado no runner visual |
| 370 | suite 5 consistencia — (linha em branco) | estrutural/documental |
| 371 | suite 5 consistencia — ita('regionalHashes SW == regionalHashes direto (mesmos pixels 48×48)', async () => { | 🟨 executado no runner visual |
| 372 | suite 5 consistencia — const img = mangaPage(48, 48, 'EN'); | 🟨 executado no runner visual |
| 373 | suite 5 consistencia — const r   = await simulateCalculateVisualFingerprint(img, 48, 48); | 🟨 executado no runner visual |
| 374 | suite 5 consistencia — const directRegional = fp.calculateRegionalHashes(img); | 🟨 executado no runner visual |
| 375 | suite 5 consistencia — expect(r.regionalHashes.topLeft).toBe(directRegional.topLeft); | ✅ assertion direta do cenário |
| 376 | suite 5 consistencia — expect(r.regionalHashes.topRight).toBe(directRegional.topRight); | ✅ assertion direta do cenário |
| 377 | suite 5 consistencia — expect(r.regionalHashes.bottomLeft).toBe(directRegional.bottomLeft); | ✅ assertion direta do cenário |
| 378 | suite 5 consistencia — expect(r.regionalHashes.bottomRight).toBe(directRegional.bottomRight); | ✅ assertion direta do cenário |
| 379 | suite 5 consistencia — }); | 🟨 executado no runner visual |
| 380 | suite 5 consistencia — }); | 🟨 executado no runner visual |
| 381 | suite 5 consistencia — (linha em branco) | estrutural/documental |
| 382 | suite 5 consistencia — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 383 | suite 5 consistencia — // SUITE 6 — Integração: SW fingerprint → IndexedDB → lookup perceptual | estrutural/documental |
| 384 | suite 6 IndexedDB — // End-to-end sem DOM, sem chrome.*, sem fetch real. | estrutural/documental |
| 385 | suite 6 IndexedDB — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 386 | suite 6 IndexedDB — describe('Integração SW fingerprint → IndexedDB → lookup perceptual', () => { | 🟨 executado no runner visual |
| 387 | suite 6 IndexedDB — (linha em branco) | estrutural/documental |
| 388 | suite 6 IndexedDB — require('../../extension/shared/gtc-indexeddb.js'); | 🟦 carrega implementação compartilhada real |
| 389 | suite 6 IndexedDB — const idb = globalThis.MangaTranslatorGtcIndexedDb; | 🟨 executado no runner visual |
| 390 | suite 6 IndexedDB — (linha em branco) | estrutural/documental |
| 391 | suite 6 IndexedDB — ita('pipeline completo: calcular → salvar → buscar cross-language', async () => { | 🟨 executado no runner visual |
| 392 | suite 6 IndexedDB — const repo = idb.createInMemoryRepository(); | 🟨 executado no runner visual |
| 393 | suite 6 IndexedDB — (linha em branco) | estrutural/documental |
| 394 | suite 6 IndexedDB — // 1. Usuário A traduz página EN via Gemini | estrutural/documental |
| 395 | suite 6 IndexedDB — const imgEN = mangaPage(200, 300, 'EN'); | 🟨 executado no runner visual |
| 396 | suite 6 IndexedDB — const fpEN  = await simulateCalculateVisualFingerprint(imgEN, 200, 300); | 🟨 executado no runner visual |
| 397 | suite 6 IndexedDB — (linha em branco) | estrutural/documental |
| 398 | suite 6 IndexedDB — // 2. Salva no IndexedDB com todos os campos visual-v3 | estrutural/documental |
| 399 | suite 6 IndexedDB — await repo.put({ | 🟨 executado no runner visual |
| 400 | suite 6 IndexedDB — hash:               'sha256_en_page1', | 🟨 executado no runner visual |
| 401 | suite 6 IndexedDB — translatedDataUrl:  'data:image/png;base64,TRANSLATED_PAGE1', | 🟨 executado no runner visual |
| 402 | suite 6 IndexedDB — dHash:              fpEN.dHash, | 🟨 executado no runner visual |
| 403 | suite 6 IndexedDB — wHash:              fpEN.wHash, | 🟨 executado no runner visual |
| 404 | suite 6 IndexedDB — pHash:              fpEN.pHash, | 🟨 executado no runner visual |
| 405 | suite 6 IndexedDB — regionalHashes:     fpEN.regionalHashes, | 🟨 executado no runner visual |
| 406 | suite 6 IndexedDB — cleanUrl:           'https://cdn.site.com/en/chapter1/page1.jpg', | 🟨 executado no runner visual |
| 407 | suite 6 IndexedDB — width:              1200, | 🟨 executado no runner visual |
| 408 | suite 6 IndexedDB — height:             1800, | 🟨 executado no runner visual |
| 409 | suite 6 IndexedDB — fingerprintVersion: 'visual-v3', | 🟨 executado no runner visual |
| 410 | suite 6 IndexedDB — }); | 🟨 executado no runner visual |
| 411 | suite 6 IndexedDB — (linha em branco) | estrutural/documental |
| 412 | suite 6 IndexedDB — // 3. Usuário B acessa mesma página em scanlação PT | estrutural/documental |
| 413 | suite 6 IndexedDB — const imgPT = mangaPage(200, 300, 'PT'); | 🟨 executado no runner visual |
| 414 | suite 6 IndexedDB — const fpPT  = await simulateCalculateVisualFingerprint(imgPT, 200, 300); | 🟨 executado no runner visual |
| 415 | suite 6 IndexedDB — (linha em branco) | estrutural/documental |
| 416 | suite 6 IndexedDB — // 4. Fase 2 (SHA-256 diferente → fallback para lookup perceptual) | estrutural/documental |
| 417 | suite 6 IndexedDB — const result = await repo.getManyByPerceptual([fpPT.wHash], [fpPT.pHash], fp); | 🟨 executado no runner visual |
| 418 | suite 6 IndexedDB — const values = Object.values(result); | 🟨 executado no runner visual |
| 419 | suite 6 IndexedDB — (linha em branco) | estrutural/documental |
| 420 | suite 6 IndexedDB — console.log('      Pipeline E2E: ${values.length} resultado(s), confidence=${values[0]?.c... | 🟨 executado no runner visual |
| 421 | suite 6 IndexedDB — (linha em branco) | estrutural/documental |
| 422 | suite 6 IndexedDB — expect(values.length).toBeGreaterThan(0); | ✅ assertion direta do cenário |
| 423 | suite 6 IndexedDB — expect(values[0].translatedDataUrl).toBe('data:image/png;base64,TRANSLATED_PAGE1'); | ✅ assertion direta do cenário |
| 424 | suite 6 IndexedDB — expect(values[0].confidence).toBeGreaterThan(0); | ✅ assertion direta do cenário |
| 425 | suite 6 IndexedDB — }); | 🟨 executado no runner visual |
| 426 | suite 6 IndexedDB — }); | 🟨 executado no runner visual |
| 427 | newline terminal | 🟦 integridade do blob reconfirmada |

## 17. Invariantes documentais e funcionais

1. run-all deve continuar carregando este arquivo para ele fazer parte do gate visual.
2. gtc-fingerprint.js é a implementação real compartilhada usada nas assertions.
3. as fixtures precisam permanecer determinísticas.
4. pixelSample esperado é 512 caracteres hex.
5. dHash normal tem 16 hex; wHash/pHash 64 hex.
6. match EN/PT e não-match EN/noise são propriedades das fixtures + thresholds atuais.
7. o simulador compartilha o mesmo ImageData 32x32 entre wHash e pHash.
8. o repositório da suíte 6 é a implementação in-memory real de gtc-indexeddb.
9. o simulador não deve ser confundido com action real.
10. qualquer alegação de visual-v4 precisa considerar wHashCrop/pHashCrop.

## 18. Riscos

- drift visual-v3 versus action visual-v4;
- stub parcial de Canvas;
- teste de close tautológico;
- duplicação de lógica do production handler;
- nomenclatura “SW/handler” mais forte que a evidência;
- fixtures sintéticas não representam toda distribuição de imagens reais;
- globals compartilhados pelo runner;
- imports mortos escondem manutenção incompleta.

## 19. Segurança e trust boundary

Não há rede, DOM ou Chrome real nesta suíte. O bloco de IndexedDB usa repositório in-memory. O risco principal é confiabilidade da evidência, não exposição de runtime.

Módulos compartilhados reais são carregados por require e publicam API em globalThis; isso é parte do ambiente de teste.

## 20. Autoauditoria AGENTE 20

- [x] ownership #225 confirmado;
- [x] state criado antes da documentação;
- [x] SHA fonte reconfirmado;
- [x] 426 linhas + newline = 427 posições;
- [x] fonte integral incluída;
- [x] 6 describes, 19 ita e 40 expect contabilizados;
- [x] simulador comparado com action real atual;
- [x] suítes Jest reais relacionadas lidas;
- [x] CI do mesmo blob verificado Linux/Windows;
- [x] evidência de API real separada de alegação sobre handler;
- [x] nenhum arquivo externo alterado;
- [x] lacunas convertidas em audit_requests.

Resultado: Bíblia concluída para 91f5cf4d9ed4d9f4386184931f93ab32f33c95ca; 225-001, 225-002 e 225-003 permanecem OPEN.

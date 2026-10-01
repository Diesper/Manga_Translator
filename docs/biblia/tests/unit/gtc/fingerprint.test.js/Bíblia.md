# Bíblia técnica — tests/unit/gtc/fingerprint.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `5255083ff2881ad8ed4ad6c6940253031e789658`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte unitária direta do módulo compartilhado real `gtc-fingerprint.js`  
> **Linhas textuais:** **454**  
> **Posições documentais:** **455**, contando o newline final

## 1. Papel arquitetural

Esta suíte importa diretamente `extension/shared/gtc-fingerprint.js`, portanto suas assertions são prova direta do módulo de produção compartilhado entre content scripts/background para geração e comparação de fingerprints visuais.

Ela cobre as famílias visual-v1/v2/v3/v4: fonte SHA-256, fallback SHA puro, IDs, dHash, wHash, pHash, hashes regionais, distância de Hamming, matching perceptual estrito/relaxado e criação final de fingerprint.

## 2. Dependências reais

- `crypto` nativo do Node fornece WebCrypto de referência e SHA-256 independente para expected values.
- `TextEncoder` do Node é injetado como dependência.
- `extension/shared/gtc-fingerprint.js` — SHA lido `fa014028d5e2ec9d9ca5d05c1199e1f6c45a2198` — é o objeto auditado indiretamente por esta suíte.

Não há implementação espelho das funções principais: `buildFingerprintSource`, hashes e matchers vêm do módulo real. `sha256Utf8` e `makeRgba` são apenas oráculos/fixtures locais.

## 3. Cobertura funcional

### Fingerprint source
Cobre precedência de `visualHash`, pixels, fallback por URL, descritor vazio, sentinela `nopixels` e visualHash vazio.

### SHA-256
Compara WebCrypto e fallback puro contra `crypto.createHash` para string simples, vazia, null e Unicode.

### IDs
Cobre UUID v4 via `getRandomValues` e fallback sem crypto. O caminho `crypto.randomUUID()` não é exercitado.

### dHash
Cobre imagem uniforme, gradiente descendente, buffer pequeno, formato/determinismo e independência de Canvas/DOM.

### wHash/pHash/regionais
Cobre formato de 64 hex, determinismo, rejeição de buffers pequenos, quatro cantos regionais e minMatches configurável.

### Matching
Cobre Hamming básico, casos strict w-only/p-only/both reject/no hashes e relaxed-only matches, confidence cap 0.75 e reject relaxado.

### Fingerprint final
Cobre formato, determinismo, sensibilidade a descriptor e fallback URL sem pixels.

## 4. Matriz de evidência

| Propriedade | Classificação |
|---|---|
| `buildFingerprintSource` visualHash/pixels/url/nopixels | ✅ PROVADO DIRETAMENTE |
| SHA-256 WebCrypto igual ao oracle Node | ✅ PROVADO DIRETAMENTE |
| SHA fallback sem crypto/TextEncoder | ✅ PROVADO DIRETAMENTE |
| Unicode UTF-8 | ✅ PROVADO DIRETAMENTE |
| `generateId` via getRandomValues e fallback | ✅ PROVADO DIRETAMENTE |
| `generateId` via `randomUUID` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| dHash uniforme/gradiente/formato/erro | ✅ PROVADO DIRETAMENTE |
| wHash/pHash formato e determinismo | ✅ PROVADO DIRETAMENTE |
| wHash/pHash contra vetor de referência independente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| regionais quatro cantos + minMatches | ✅ PROVADO DIRETAMENTE |
| `matchRegionalHashes(null,...)` | branch real, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Hamming tamanho incompatível/null | ✅ PROVADO DIRETAMENTE |
| Hamming caracteres não-hex | não coberto e implementação não valida | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO / revisão requerida |
| Matching strict caminhos principais | ✅ PROVADO DIRETAMENTE |
| Matching strict thresholds exatos 40/41,35/36,80/81,70/71 | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Matching relaxed thresholds públicos 50/45/90/82 | ✅ constantes relaxadas e alguns casos próximos provados; boundaries completos ausentes |
| Confidence relaxada limitada a 0.75 | ✅ PROVADO DIRETAMENTE |
| createFingerprintFromDescriptor formato/determinismo/sensibilidade | ✅ PROVADO DIRETAMENTE |

## 5. Invariantes

1. A precedência da fonte é visualHash → pixels válidos → URL/nopixels.
2. Fallback SHA deve produzir exatamente SHA-256 padrão, inclusive Unicode.
3. Hashes perceptuais têm tamanhos fixos e determinismo para pixels idênticos.
4. Buffers insuficientes devem falhar explicitamente.
5. Distâncias inválidas não devem ser interpretadas como matches.
6. Thresholds strict/relaxed fazem parte do contrato de compatibilidade do cache.
7. Confidence relaxed nunca deve ultrapassar 0.75.

## 6. Riscos e lacunas

**Validação de hex ausente em `hammingDistance`.** A função verifica presença e comprimento, mas não verifica `/^[0-9a-f]+$/i`. `parseInt` inválido vira `NaN` e operações bitwise convertem NaN para zero, podendo produzir distância enganosa.

**Thresholds strict sem boundary tests.** A suíte usa distâncias 20/8/far, mas não fixa os pontos exatos onde match vira miss/reject. Uma mudança off-by-one pode passar.

**Vetores de referência de wHash/pHash ausentes.** Formato+determinismo detectam muitos erros, mas não garantem matematicamente que a transformação está correta contra um oracle independente.

**Caminho randomUUID não coberto.** A prioridade da função é randomUUID antes de getRandomValues.

**IDs FP duplicados.** `FP-19`/`FP-20` são usados tanto em `generateId` quanto em `createFingerprintFromDescriptor`, reduzindo rastreabilidade.

## 7. Solicitações ao auditor

### 211-001 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** `hammingDistance` documenta hashes hex, mas não valida caracteres; parseInt inválido pode ser coerced para zero em XOR bitwise.

**Necessário:** confirmar contrato para dados corrompidos/legados. Se input não-hex deve ser inválido, adicionar validação e teste (`'zz'`, `'0g'`) retornando -1 ou erro conforme contrato.

**Risco:** hash malformado pode parecer idêntico ou próximo, criando match perceptual incorreto.

**Severidade:** HIGH.

### 211-002 — TEST_REQUIRED — OPEN

**Encontrado:** thresholds strict públicos 40/35/80/70 não possuem boundary cases exatos; a suíte usa apenas valores internos/far.

**Necessário:** adicionar matriz para match/miss/reject em boundary e boundary+1 de wHash e pHash, inclusive both_miss versus both_reject.

**Risco:** regressão off-by-one altera política de cache sem falha da suíte.

**Severidade:** HIGH.

### 211-003 — TEST_REQUIRED — OPEN

**Encontrado:** wHash/pHash são testados por formato/determinismo, sem vetor de referência independente; `generateId` também não cobre o ramo `randomUUID`.

**Necessário:** adicionar ao menos um vetor conhecido para cada hash perceptual e um teste simples de `randomUUID` com prefixo.

**Risco:** implementação determinística porém matematicamente incorreta ou branch primário de ID quebrado pode permanecer verde.

**Severidade:** NORMAL.

### 211-004 — TEST_MAINTENANCE — OPEN

**Encontrado:** identificadores FP-19/FP-20 são reutilizados em dois grupos distintos.

**Necessário:** renumerar/estabilizar IDs para rastreabilidade sem mudar comportamento.

**Severidade:** LOW.

## 8. Fonte integral exata

```js
const crypto = require('crypto');
const { TextEncoder } = require('util');

const {
    buildFingerprintSource,
    calculateDHash,
    calculatePHash,
    calculateRegionalHashes,
    calculateWHash,
    hashStringSha256,
    hammingDistance,
    matchPerceptualHashes,
    matchPerceptualHashesRelaxed,
    matchRegionalHashes,
    createFingerprintFromDescriptor,
    generateId,
    WHASH_MATCH_THRESHOLD_RELAXED,
    PHASH_MATCH_THRESHOLD_RELAXED,
    WHASH_REJECT_THRESHOLD_RELAXED,
    PHASH_REJECT_THRESHOLD_RELAXED,
} = require('../../../extension/shared/gtc-fingerprint.js');

function sha256Utf8(input) {
    return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function makeRgba(width, height, grayAt) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
            const offset = (row * width + col) * 4;
            const gray = grayAt(row, col);
            data[offset] = gray;
            data[offset + 1] = gray;
            data[offset + 2] = gray;
            data[offset + 3] = 255;
        }
    }
    return data;
}

describe('gtc-fingerprint.js', () => {
    describe('buildFingerprintSource()', () => {
        test('FP-01 usa visualHash preenchido no formato visual-v2', () => {
            const source = buildFingerprintSource({
                width: 800,
                height: 1200,
                visualHash: 'abc123',
                pixelSample: 'ff00ff',
                cleanUrl: 'https://site.com/panel.jpg',
                hasVisualPixels: true,
            });

            expect(source).toBe('v2:800:1200:abc123');
        });

        test('FP-02 usa o caminho de pixels quando ha dados visuais validos', () => {
            const source = buildFingerprintSource({
                width: 400,
                height: 600,
                hasVisualPixels: true,
                pixelSample: 'ff00ff',
                cleanUrl: 'https://site.com/panel.jpg',
            });

            expect(source).toBe('400:600:pixels:ff00ff');
        });

        test('FP-03 cai no fallback por URL quando nao ha pixels', () => {
            const source = buildFingerprintSource({
                width: 300,
                height: 400,
                cleanUrl: 'https://site.com/img.jpg',
            });

            expect(source).toBe('300:400:url:https://site.com/img.jpg:nopixels');
        });

        test('FP-04 suporta descritor vazio sem lancar excecao', () => {
            expect(buildFingerprintSource({})).toBe('0:0:url::nopixels');
            expect(buildFingerprintSource()).toBe('0:0:url::nopixels');
        });

        test("FP-05 trata 'nopixels' como sentinela e nao como amostra valida", () => {
            const source = buildFingerprintSource({
                width: 900,
                height: 1400,
                hasVisualPixels: true,
                pixelSample: 'nopixels',
                cleanUrl: 'https://site.com/page.png',
            });

            expect(source).toBe('900:1400:url:https://site.com/page.png:nopixels');
        });

        test('FP-06 visualHash vazio nao usa o caminho visual-v2', () => {
            const source = buildFingerprintSource({
                width: 640,
                height: 960,
                visualHash: '',
                hasVisualPixels: true,
                pixelSample: 'abcd',
                cleanUrl: 'https://site.com/page.png',
            });

            expect(source).toBe('640:960:pixels:abcd');
        });
    });

    describe('hashStringSha256()', () => {
        const deps = {
            cryptoImpl: crypto.webcrypto,
            TextEncoderImpl: TextEncoder,
        };

        test('FP-13 calcula o SHA-256 conhecido de uma string simples', async () => {
            await expect(hashStringSha256('test', deps)).resolves.toBe(sha256Utf8('test'));
        });

        test('FP-14 calcula corretamente o hash da string vazia', async () => {
            await expect(hashStringSha256('', deps)).resolves.toBe(sha256Utf8(''));
        });

        test('FP-15 usa SHA-256 puro quando crypto nao esta disponivel', async () => {
            await expect(
                hashStringSha256('test', { cryptoImpl: null, TextEncoderImpl: TextEncoder })
            ).resolves.toBe(sha256Utf8('test'));
        });

        test('FP-16 usa SHA-256 puro quando TextEncoder nao esta disponivel', async () => {
            await expect(
                hashStringSha256('test', { cryptoImpl: crypto.webcrypto, TextEncoderImpl: null })
            ).resolves.toBe(sha256Utf8('test'));
        });

        test('FP-17 aceita input null e aplica String(null) sem crash', async () => {
            await expect(hashStringSha256(null, deps)).resolves.toBe(sha256Utf8('null'));
        });

        test('FP-18 preserva UTF-8 para caracteres Unicode', async () => {
            const input = 'áé漢字';
            await expect(hashStringSha256(input, deps)).resolves.toBe(sha256Utf8(input));
        });
    });

    describe('generateId()', () => {
        test('FP-19 usa UUID v4 gerado por getRandomValues sem randomUUID', () => {
            const cryptoImpl = {
                getRandomValues(bytes) {
                    bytes.fill(0xAB);
                    return bytes;
                },
            };

            expect(generateId('chap_', { cryptoImpl })).toBe('chap_abababab-abab-4bab-abab-abababababab');
        });

        test('FP-20 permanece único e compatível sem nenhuma API crypto', () => {
            const first = generateId('batch_', { cryptoImpl: null });
            const second = generateId('batch_', { cryptoImpl: null });

            expect(first).toMatch(/^batch_[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
            expect(second).toMatch(/^batch_[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
            expect(second).not.toBe(first);
        });
    });

    describe('calculateDHash()', () => {
        test('FP-07 imagem uniforme gera dHash zerado', () => {
            const imageData = makeRgba(9, 8, () => 255);

            expect(calculateDHash(imageData)).toBe('0000000000000000');
        });

        test('FP-08 gradiente horizontal descendente gera todos os bits ligados', () => {
            const imageData = makeRgba(9, 8, (_row, col) => 255 - col);

            expect(calculateDHash(imageData)).toBe('ffffffffffffffff');
        });

        test('FP-09 entrada menor que 9x8 RGBA falha com mensagem clara', () => {
            expect(() => calculateDHash(new Uint8ClampedArray(10))).toThrow('calculateDHash');
        });

        test('FP-10/FP-11 retorna 16 hex lowercase e e deterministico para pixels iguais', () => {
            const imageData = makeRgba(9, 8, (row, col) => ((row * 17) + (col * 11)) % 256);

            const first = calculateDHash(imageData);
            const second = calculateDHash(imageData.slice());

            expect(first).toMatch(/^[0-9a-f]{16}$/);
            expect(second).toBe(first);
        });

        test('FP-12 calculateDHash independe de OffscreenCanvas e document', () => {
            const originalOffscreenCanvas = global.OffscreenCanvas;
            const originalDocument = global.document;
            const imageData = makeRgba(9, 8, (row, col) => ((row + col) % 2 === 0 ? 40 : 220));

            try {
                global.OffscreenCanvas = function MockOffscreenCanvas() {};
                global.document = { createElement: jest.fn() };
                const withCanvasGlobals = calculateDHash(imageData);

                delete global.OffscreenCanvas;
                delete global.document;
                const withoutCanvasGlobals = calculateDHash(imageData);

                expect(withCanvasGlobals).toBe(withoutCanvasGlobals);
                expect(withoutCanvasGlobals).toMatch(/^[0-9a-f]{16}$/);
            } finally {
                if (originalOffscreenCanvas === undefined) delete global.OffscreenCanvas;
                else global.OffscreenCanvas = originalOffscreenCanvas;

                if (originalDocument === undefined) delete global.document;
                else global.document = originalDocument;
            }
        });
    });

    describe('hashes perceptuais visual-v3', () => {
        test('wHash e pHash retornam 64 hex e sao deterministicos para a mesma matriz 32x32', () => {
            const imageData = makeRgba(32, 32, (row, col) => ((row * 13) + (col * 7)) % 256);

            const wHash = calculateWHash(imageData);
            const pHash = calculatePHash(imageData);

            expect(wHash).toMatch(/^[0-9a-f]{64}$/);
            expect(pHash).toMatch(/^[0-9a-f]{64}$/);
            expect(calculateWHash(imageData.slice())).toBe(wHash);
            expect(calculatePHash(imageData.slice())).toBe(pHash);
        });

        test('wHash, pHash e hashes regionais rejeitam buffers pequenos', () => {
            expect(() => calculateWHash(new Uint8ClampedArray(32))).toThrow('calculateWHash');
            expect(() => calculatePHash(new Uint8ClampedArray(32))).toThrow('calculatePHash');
            expect(() => calculateRegionalHashes(new Uint8ClampedArray(32))).toThrow('calculateRegionalHashes');
        });

        test('hashes regionais retornam quatro cantos e match regional exige minimo configuravel', () => {
            const imageData = makeRgba(48, 48, (row, col) => ((row * 5) + (col * 9)) % 256);
            const regional = calculateRegionalHashes(imageData);

            expect(regional).toEqual({
                topLeft: expect.stringMatching(/^[0-9a-f]{16}$/),
                topRight: expect.stringMatching(/^[0-9a-f]{16}$/),
                bottomLeft: expect.stringMatching(/^[0-9a-f]{16}$/),
                bottomRight: expect.stringMatching(/^[0-9a-f]{16}$/),
            });

            expect(matchRegionalHashes(regional, { ...regional })).toEqual(expect.objectContaining({
                match: true,
                matchCount: 4,
            }));

            expect(matchRegionalHashes(regional, {
                topLeft: 'ffffffffffffffff',
                topRight: 'ffffffffffffffff',
                bottomLeft: regional.bottomLeft,
                bottomRight: regional.bottomRight,
            }, { threshold: 0, minMatches: 3 })).toEqual(expect.objectContaining({
                match: false,
                matchCount: 2,
            }));
        });
    });

    describe('hammingDistance() e matchPerceptualHashes()', () => {
        test('distancia de Hamming aceita hashes hex de tamanhos variados e rejeita entradas invalidas', () => {
            expect(hammingDistance('0', 'f')).toBe(4);
            expect(hammingDistance('00ff', '0fff')).toBe(4);
            expect(hammingDistance('abc', 'ab')).toBe(-1);
            expect(hammingDistance(null, 'ab')).toBe(-1);
        });

        test('matchPerceptualHashes aplica thresholds combinados e caminhos de fallback', () => {
            const zero = '0'.repeat(64);
            const nearW = '0'.repeat(54) + '3'.repeat(10); // 20 bits distantes
            const nearP = '0'.repeat(56) + '1'.repeat(8);  // 8 bits distantes
            const far = 'f'.repeat(64);

            expect(matchPerceptualHashes(zero, zero, nearW, far)).toEqual(expect.objectContaining({
                match: true,
                reason: 'whash_match',
                wDist: 20,
                pDist: 256,
            }));

            expect(matchPerceptualHashes(far, nearP, zero, zero)).toEqual(expect.objectContaining({
                match: true,
                reason: 'phash_match',
                wDist: 256,
                pDist: 8,
            }));

            expect(matchPerceptualHashes(far, far, zero, zero)).toEqual(expect.objectContaining({
                match: false,
                reason: 'both_reject',
            }));

            expect(matchPerceptualHashes(zero, null, nearW, null)).toEqual(expect.objectContaining({
                match: true,
                reason: 'whash_only_match',
                pDist: -1,
            }));

            expect(matchPerceptualHashes(null, null, null, null)).toEqual(expect.objectContaining({
                match: false,
                reason: 'no_hashes',
                wDist: -1,
                pDist: -1,
            }));
        });

        test('visual-v4: matchPerceptualHashesRelaxed aceita misses strict e limita confidence em 0.75', () => {
            const zero = '0'.repeat(64);
            const relaxedOnlyW = 'f'.repeat(11) + '0'.repeat(53); // 44 bits: strict miss, relaxed hit
            const relaxedOnlyP = 'f'.repeat(10) + '0'.repeat(54); // 40 bits: strict miss, relaxed hit
            const far = 'f'.repeat(64);

            expect(WHASH_MATCH_THRESHOLD_RELAXED).toBe(50);
            expect(PHASH_MATCH_THRESHOLD_RELAXED).toBe(45);
            expect(WHASH_REJECT_THRESHOLD_RELAXED).toBe(90);
            expect(PHASH_REJECT_THRESHOLD_RELAXED).toBe(82);

            expect(matchPerceptualHashes(zero, null, relaxedOnlyW, null)).toEqual(expect.objectContaining({
                match: false,
                reason: 'whash_only_miss',
                wDist: 44,
            }));

            const relaxedW = matchPerceptualHashesRelaxed(zero, null, relaxedOnlyW, null);
            expect(relaxedW).toEqual(expect.objectContaining({
                match: true,
                reason: 'relaxed_whash_only_match',
                wDist: 44,
                pDist: -1,
            }));
            expect(relaxedW.confidence).toBeCloseTo(1 - (44 / 90), 6);
            expect(relaxedW.confidence).toBeLessThanOrEqual(0.75);

            expect(matchPerceptualHashes(null, zero, null, relaxedOnlyP)).toEqual(expect.objectContaining({
                match: false,
                reason: 'phash_only_miss',
                pDist: 40,
            }));

            const relaxedP = matchPerceptualHashesRelaxed(null, zero, null, relaxedOnlyP);
            expect(relaxedP).toEqual(expect.objectContaining({
                match: true,
                reason: 'relaxed_phash_only_match',
                wDist: -1,
                pDist: 40,
            }));
            expect(relaxedP.confidence).toBeCloseTo(1 - (40 / 82), 6);
            expect(relaxedP.confidence).toBeLessThanOrEqual(0.75);

            expect(matchPerceptualHashesRelaxed(zero, zero, zero, zero)).toEqual(expect.objectContaining({
                match: true,
                confidence: 0.75,
                reason: 'relaxed_both_match',
                wDist: 0,
                pDist: 0,
            }));

            expect(matchPerceptualHashesRelaxed(far, far, zero, zero)).toEqual(expect.objectContaining({
                match: false,
                reason: 'relaxed_both_reject',
            }));
        });
    });

    describe('createFingerprintFromDescriptor()', () => {
        const deps = {
            cryptoImpl: crypto.webcrypto,
            TextEncoderImpl: TextEncoder,
        };

        test('FP-19 gera um fingerprint hex de 64 caracteres para descritor valido', async () => {
            const fingerprint = await createFingerprintFromDescriptor({
                width: 800,
                height: 1200,
                cleanUrl: 'https://reader.test/panel-001.png',
                pixelSample: 'abcd1234',
                hasVisualPixels: true,
            }, deps);

            expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
        });

        test('FP-20 e deterministico para o mesmo descritor', async () => {
            const descriptor = {
                width: 800,
                height: 1200,
                cleanUrl: 'https://reader.test/panel-001.png',
                pixelSample: 'feedbeef',
                hasVisualPixels: true,
            };

            const [first, second] = await Promise.all([
                createFingerprintFromDescriptor(descriptor, deps),
                createFingerprintFromDescriptor(descriptor, deps),
            ]);

            expect(first).toBe(second);
        });

        test('FP-21 muda o hash final quando o descritor muda', async () => {
            const baseDescriptor = {
                width: 800,
                height: 1200,
                cleanUrl: 'https://reader.test/panel-001.png',
                pixelSample: 'aaaaaaaa',
                hasVisualPixels: true,
            };

            const changedDescriptor = {
                ...baseDescriptor,
                pixelSample: 'aaaaaaab',
            };

            const [first, second] = await Promise.all([
                createFingerprintFromDescriptor(baseDescriptor, deps),
                createFingerprintFromDescriptor(changedDescriptor, deps),
            ]);

            expect(first).not.toBe(second);
        });

        test('FP-22 imagens sem pixels visuais com URLs diferentes geram fingerprints diferentes', async () => {
            const baseDescriptor = {
                width: 800,
                height: 1200,
                pixelSample: 'nopixels',
                hasVisualPixels: false,
            };

            const [first, second] = await Promise.all([
                createFingerprintFromDescriptor({
                    ...baseDescriptor,
                    cleanUrl: 'https://cdn-a.test/chapter/page_001.png',
                }, deps),
                createFingerprintFromDescriptor({
                    ...baseDescriptor,
                    cleanUrl: 'https://cdn-b.test/chapter/page_001.png',
                }, deps),
            ]);

            expect(first).toMatch(/^[a-f0-9]{64}$/);
            expect(second).toMatch(/^[a-f0-9]{64}$/);
            expect(first).not.toBe(second);
        });
    });
});
```

## 9. Cobertura documental por linha/posição

Cobertura contígua de **1–455**; 455 é o newline terminal.

### Posições 1–20 — imports do módulo real
Importa crypto/TextEncoder e 17 APIs/thresholds do módulo real. **Evidência:** 🟦/🟨 estrutural e setup.

### Posições 21–41 — oracles/fixtures
Define SHA Node e matriz RGBA. **Evidência:** 🟨 harness independente.

### Posições 42–111 — buildFingerprintSource
Seis casos cobrem precedência e fallbacks. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 112–151 — hashStringSha256
WebCrypto/fallback/vazio/null/Unicode contra oracle Node. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 152–177 — generateId
getRandomValues e fallback sem crypto. **Evidência:** ✅ nesses ramos; ⚠️ randomUUID ausente.

### Posições 178–229 — calculateDHash
Uniforme, gradiente, erro, formato, determinismo e independência de DOM. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 230–282 — hashes visual-v3
wHash/pHash formato/determinismo, buffers pequenos e regionais. **Evidência:** ✅ direta; vetor oracle ausente.

### Posições 283–393 — Hamming e matchers
Cobre distância básica, strict e relaxed incluindo confidence cap. **Evidência:** ✅ caminhos escolhidos; boundaries e hex inválido ausentes.

### Posições 394–453 — createFingerprintFromDescriptor
Formato, determinismo, mudança de descriptor e URLs sem pixels. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 454 — fechamento
Fecha suíte. **Evidência:** 🟨 estrutural.

### Posição 455 — newline final
Terminador textual.

## 10. Autoauditoria documental

- SHA do fonte reconfirmado.
- Fonte integral incorporada.
- **455/455 posições** cobertas.
- O módulo real, não um mirror, é exercitado.
- Lacunas de robustez e boundaries registradas sem modificar produção/testes.
- Nenhuma execução de suíte foi alegada nesta sessão.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com quatro solicitações externas abertas.

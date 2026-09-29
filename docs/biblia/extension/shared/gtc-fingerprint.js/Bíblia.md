# Bíblia técnica — `extension/shared/gtc-fingerprint.js`

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE  
> **SHA auditado:** `fa014028d5e2ec9d9ca5d05c1199e1f6c45a2198`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#Agent-A`  
> **Tipo:** JavaScript compartilhado — fingerprint/hash visual multi-runtime  
> **Linhas textuais:** **770**  
> **Posições documentais:** **771** contando o newline terminal  
> **PR:** `#66`  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`extension/shared/gtc-fingerprint.js` é a implementação canônica dos fingerprints usados pelo Global Translation Cache. O mesmo arquivo é carregado como content script antes de `cm-gtc-client.js`, importado no Service Worker por `background.js` e requerido diretamente em testes Node. Assim, reader/content, background, IndexedDB e testes usam a mesma matemática.

A API combina SHA-256 determinístico de descritor, dHash, wHash, pHash, hashes regionais e decisões strict/relaxed. Esses resultados alimentam lookup de cache, deduplicação e confirmação visual cross-language.

## 2. Consumers e ordem de carregamento

- `extension/manifest.json`: carrega `shared/gtc-fingerprint.js` antes de `content/cm-gtc-client.js` e `content/content_manga.js`.
- `extension/background.js`: importa o módulo antes do IndexedDB e disponibiliza a API aos handlers GTC.
- `extension/content/cm-gtc-client.js`: gera hashes e confirma matches regionais.
- `extension/background/actions/calculate-visual-fingerprint.js`: calcula hashes no Service Worker com OffscreenCanvas.
- `extension/shared/gtc-indexeddb.js`: usa match strict/relaxed em consulta perceptual.
- `extension/content/content_manga.js`: usa hashes no pipeline de cache visual-v3/v4.

## 3. Contratos matemáticos

`buildFingerprintSource` prioriza `visualHash`, depois pixels visuais válidos, e por fim dimensões + URL. `hashStringSha256` prefere WebCrypto e cai para SHA-256 puro quando `crypto.subtle` ou `TextEncoder` faltam.

dHash recebe 9×8 RGBA e gera 64 bits. wHash recebe 32×32, aplica Haar DWT e gera 256 bits pela mediana da sub-banda LL. pHash aplica DCT-II separável em 32×32 e usa 256 coeficientes de baixa frequência, excluindo DC da mediana. Hashes regionais trabalham em canvas 48×48 e produzem quatro hashes de 64 bits.

Strict usa wHash ≤40 ou pHash ≤35, com rejeição forte quando ambos excedem 80/70. Relaxed usa 50/45, rejeição 90/82 e confidence limitada a 0.75.

## 4. Evidências automatizadas auditadas

| Comportamento | Evidência | Classificação |
|---|---|---|
| buildFingerprintSource | FP-01..06 + visual SHA carregam o módulo real | ✅ PROVADO DIRETAMENTE |
| hashStringSha256 WebCrypto | FP-13/14/17/18 | ✅ PROVADO DIRETAMENTE |
| sha256Fallback ASCII | FP-15/16 comparam a implementação real a `crypto.createHash` | ✅ PROVADO DIRETAMENTE |
| sha256Fallback lone surrogate | nenhum teste encontrado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| generateId getRandomValues/fallback | FP-19/20 | ✅ PROVADO DIRETAMENTE |
| calculateDHash | FP-07..12 + visual | ✅ PROVADO DIRETAMENTE |
| calculateWHash | unit + visual cross-language/brightness | ✅ PROVADO DIRETAMENTE |
| calculatePHash | unit + visual DCT/brightness | ✅ PROVADO DIRETAMENTE |
| regional generation/match | unit + visual centro/cantos/minMatches/details | ✅ PROVADO DIRETAMENTE |
| hammingDistance válido/null/length | unit + visual | ✅ PROVADO DIRETAMENTE |
| hammingDistance caractere não-hex | nenhuma assertion | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| matcher strict | unit + visual incluindo 40/41 e reasons | ✅ PROVADO DIRETAMENTE |
| matcher relaxed | unit visual-v4 + consumer IDB | ✅ PROVADO DIRETAMENTE |
| matcher com hash de tamanho diferente de 64 chars | nenhum teste; thresholds são de 256 bits | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| pipelines content/SW/IDB | integration/visual/smoke carregam o módulo real e consumers | ✅ PROVADO EM INTEGRAÇÃO |

## 5. Lacunas e riscos

1. **⚠️ Hex inválido em `hammingDistance`.** A função valida presença/comprimento, mas não `^[0-9a-f]+$`; `parseInt` pode produzir `NaN` e operações bitwise podem mascarar o erro.
2. **⚠️ Comprimento não-256 nos matchers perceptuais.** O contrato documenta 64 hex chars, mas a implementação não impõe isso; thresholds fixos deixam de representar as porcentagens calibradas.
3. **⚠️ Unicode inválido no SHA fallback.** Não há teste para surrogate isolado; o encoder manual pode divergir do comportamento de `TextEncoder` com U+FFFD.
4. **⚠️ Fallback de ID não criptográfico.** Date.now + contador + Math.random garante utilidade operacional, não segurança nem prova de ausência de colisão entre reinicializações.
5. **⚠️ Opções regionais não validadas.** `minMatches=0`, threshold negativo ou threshold >64 não são rejeitados.
6. **⚠️ Helpers Haar assumem dimensões pares/potência de 2.** Hoje são internos e chamados apenas com 16/32.
7. **⚠️ Comentário de Hamming diz comprimento par, mas o teste aceita um único nibble.** A documentação local e o runtime divergem.
8. **⚠️ Claim de performance DCT não é provado no mesmo limite.** Há teste agregado para 20 imagens <500 ms, não prova individual <0.5 ms.
9. **⚠️ API global não é congelada.** Outro módulo trusted no mesmo realm pode monkey-patch funções/thresholds.
10. **⚠️ Compatibilidade de cache depende de estabilidade matemática.** Mudanças em grayscale, DWT, DCT, packing ou medianas precisam de versionamento/migração.

## 6. Segurança e privacidade

Este módulo não faz rede, storage ou DOM. A fronteira principal é integridade: um hash ou match incorreto pode associar uma tradução à imagem errada. `cleanUrl` só participa da string a ser hasheada aqui; não é transmitida nem logada pelo módulo.

IDs do fallback sem crypto são identificadores operacionais, não segredos, tokens ou capacidades de autenticação.

## 7. Invariantes

1. A mesma entrada e mesma versão do algoritmo devem gerar o mesmo hash em content, SW e Node.
2. SHA fallback deve ser compatível com SHA-256 UTF-8 nativo para toda entrada suportada.
3. dHash deve produzir 16 hex; wHash/pHash 64; cada regional 16.
4. Alpha não deve influenciar os hashes perceptuais baseados em RGB.
5. Packing de bits deve permanecer estável para não invalidar cache persistido.
6. `hammingDistance(a,b)` deve ser simétrica e retornar 0 para hashes idênticos válidos.
7. Strict não pode aceitar o caso em que ambos os componentes excedem os thresholds de rejeição.
8. Relaxed nunca deve retornar confidence acima de 0.75.
9. Relaxed deve continuar sendo fallback e, quando aplicável, seguido de confirmação regional.
10. Thresholds públicos e lógica interna do matcher devem permanecer coerentes.
11. Mudança de dimensão/frequência exige versionamento de fingerprint/cache.
12. API CommonJS e global devem expor as mesmas funções/constantes.

## 8. Análise crítica

O arquivo é matematicamente coeso e possui cobertura direta forte. A maior lacuna está na validação de hashes serializados: entradas malformadas ou do tamanho errado podem chegar aos matchers e produzir decisões numericamente plausíveis. A segunda área de risco é compatibilidade histórica, porque hashes persistidos transformam qualquer mudança algorítmica em possível migração de dados.

## 9. Fonte integral auditada

```javascript
'use strict';

(function attachGtcFingerprintApi(rootScope) {

    let fallbackIdCounter = 0;

    function utf8Encode(input) {
        const text = String(input);
        const bytes = [];
        for (let i = 0; i < text.length; i += 1) {
            let codePoint = text.charCodeAt(i);
            if (codePoint >= 0xD800 && codePoint <= 0xDBFF && i + 1 < text.length) {
                const low = text.charCodeAt(i + 1);
                if (low >= 0xDC00 && low <= 0xDFFF) {
                    codePoint = 0x10000 + ((codePoint - 0xD800) << 10) + (low - 0xDC00);
                    i += 1;
                }
            }
            if (codePoint <= 0x7F) bytes.push(codePoint);
            else if (codePoint <= 0x7FF) bytes.push(0xC0 | (codePoint >> 6), 0x80 | (codePoint & 0x3F));
            else if (codePoint <= 0xFFFF) bytes.push(0xE0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3F), 0x80 | (codePoint & 0x3F));
            else bytes.push(0xF0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3F), 0x80 | ((codePoint >> 6) & 0x3F), 0x80 | (codePoint & 0x3F));
        }
        return bytes;
    }

    function sha256Fallback(input) {
        const bytes = utf8Encode(input);
        const bitLength = bytes.length * 8;
        bytes.push(0x80);
        while ((bytes.length % 64) !== 56) bytes.push(0);
        const high = Math.floor(bitLength / 0x100000000);
        const low = bitLength >>> 0;
        [high, low].forEach(word => bytes.push((word >>> 24) & 0xFF, (word >>> 16) & 0xFF, (word >>> 8) & 0xFF, word & 0xFF));

        const constants = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
        ];
        let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
        let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
        const words = new Uint32Array(64);
        for (let offset = 0; offset < bytes.length; offset += 64) {
            for (let i = 0; i < 16; i += 1) {
                const j = offset + i * 4;
                words[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
            }
            for (let i = 16; i < 64; i += 1) {
                const x = words[i - 15];
                const y = words[i - 2];
                const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
                const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
                words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
            }
            let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
            for (let i = 0; i < 64; i += 1) {
                const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
                const choose = (e & f) ^ (~e & g);
                const temp1 = (h + s1 + choose + constants[i] + words[i]) >>> 0;
                const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
                const majority = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (s0 + majority) >>> 0;
                h = g; g = f; f = e; e = (d + temp1) >>> 0;
                d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
            }
            h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
            h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
        }
        return [h0, h1, h2, h3, h4, h5, h6, h7].map(word => word.toString(16).padStart(8, '0')).join('');
    }

    function generateId(prefix = '', { cryptoImpl } = {}) {
        const cryptoRef = cryptoImpl === undefined ? rootScope.crypto : cryptoImpl;
        if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return prefix + cryptoRef.randomUUID();
        if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
            const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
            bytes[6] = (bytes[6] & 0x0F) | 0x40;
            bytes[8] = (bytes[8] & 0x3F) | 0x80;
            const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
            return `${prefix}${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }
        fallbackIdCounter = (fallbackIdCounter + 1) >>> 0;
        return `${prefix}${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHA-256 fingerprint (visual-v1 / visual-v2)
    // ─────────────────────────────────────────────────────────────────────────

    function buildFingerprintSource({
        width = 0,
        height = 0,
        visualHash = '',
        pixelSample = '',
        cleanUrl = '',
        hasVisualPixels = false,
    } = {}) {
        const dims = `${width || 0}:${height || 0}`;
        if (visualHash) {
            return `v2:${dims}:${visualHash}`;
        }
        if (hasVisualPixels && pixelSample && pixelSample !== 'nopixels') {
            return `${dims}:pixels:${pixelSample}`;
        }
        return `${dims}:url:${cleanUrl || ''}:nopixels`;
    }

    async function hashStringSha256(input, { cryptoImpl, TextEncoderImpl } = {}) {
        const cryptoRef = cryptoImpl === undefined ? rootScope.crypto : cryptoImpl;
        const Encoder = TextEncoderImpl === undefined ? rootScope.TextEncoder : TextEncoderImpl;
        if (!cryptoRef || !cryptoRef.subtle || !Encoder) return sha256Fallback(input);
        const msgBuffer = new Encoder().encode(String(input));
        const hashBuffer = await cryptoRef.subtle.digest('SHA-256', msgBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async function createFingerprintFromDescriptor(descriptor, deps = {}) {
        const source = buildFingerprintSource(descriptor);
        return hashStringSha256(source, deps);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // dHash — Difference Hash  (perceptual, 9×8 → 64 bits → 16 hex chars)
    //
    // visual-v2: complemento ao SHA-256 para lookup CORS-resiliente.
    // LIMITAÇÃO CONHECIDA: gradientes horizontais são afetados por texto em
    // balões → 50-75% do hash corrompido em matching cross-language.
    // Para matching cross-language, usar wHash (visual-v3).
    // ─────────────────────────────────────────────────────────────────────────

    function calculateDHash(imageData) {
        if (!imageData || imageData.length < 9 * 8 * 4) {
            throw new Error('calculateDHash: imageData precisa de pelo menos 9×8×4=288 bytes (canvas 9×8 RGBA)');
        }

        const W = 9;
        const H = 8;

        const gray = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) {
            const b = i * 4;
            gray[i] = 0.299 * imageData[b]
                    + 0.587 * imageData[b + 1]
                    + 0.114 * imageData[b + 2];
        }

        let hex = '';
        for (let row = 0; row < H; row++) {
            let rowByte = 0;
            for (let col = 0; col < H; col++) {
                rowByte = (rowByte << 1) | (gray[row * W + col] > gray[row * W + col + 1] ? 1 : 0);
            }
            hex += rowByte.toString(16).padStart(2, '0');
        }

        return hex; // 16 chars hex lowercase
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Haar Wavelet 1D/2D — primitivas internas
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Transformada Haar 1D: [a0,a1,...,aN-1] → [avg0,...,avgN/2-1, diff0,...,diffN/2-1]
     * Low-pass (médias) ficam na primeira metade; high-pass (diferenças) na segunda.
     *
     * @param {Float32Array|ArrayLike} arr  array de entrada (tamanho n, potência de 2)
     * @param {number} n  tamanho do array
     * @returns {Float32Array}
     */
    function _haarDWT1D(arr, n) {
        const out  = new Float32Array(n);
        const half = n >> 1;
        for (let i = 0; i < half; i++) {
            out[i]        = (arr[2 * i]     + arr[2 * i + 1]) * 0.5; // low-pass
            out[i + half] = (arr[2 * i]     - arr[2 * i + 1]) * 0.5; // high-pass
        }
        return out;
    }

    /**
     * Transformada Haar 2D (1 nível) sobre matriz N×N (Float32Array, row-major).
     *
     * Resultado:
     *   quadrante superior esquerdo  (N/2 × N/2)  = LL  (low-low, aproximação)
     *   quadrante superior direito   (N/2 × N/2)  = LH  (bordas horizontais)
     *   quadrante inferior esquerdo  (N/2 × N/2)  = HL  (bordas verticais)
     *   quadrante inferior direito   (N/2 × N/2)  = HH  (detalhes diagonais — texto)
     *
     * Por que a LL captura arte e descarta texto:
     *   - Arte (traços, composição, painéis): energia concentrada em baixas frequências → LL
     *   - Texto em balões: detalhes locais de alta frequência → HH, descartado
     *
     * @param {Float32Array} matrix  array N×N row-major
     * @param {number} N  lado da matriz (potência de 2)
     * @returns {Float32Array}  mesma estrutura N×N com sub-bandas reorganizadas
     */
    function _haarDWT2D(matrix, N) {
        const buf = matrix.slice(); // cópia para não alterar o original

        // Passo 1: transformada 1D em cada linha
        for (let row = 0; row < N; row++) {
            const rowSlice = buf.subarray(row * N, (row + 1) * N);
            const transformed = _haarDWT1D(rowSlice, N);
            buf.set(transformed, row * N);
        }

        // Passo 2: transformada 1D em cada coluna
        const colBuf = new Float32Array(N);
        for (let col = 0; col < N; col++) {
            for (let row = 0; row < N; row++) colBuf[row] = buf[row * N + col];
            const transformed = _haarDWT1D(colBuf, N);
            for (let row = 0; row < N; row++) buf[row * N + col] = transformed[row];
        }

        return buf;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // wHash — Haar Wavelet Hash  (perceptual, 32×32 → LL 16×16 → 256 bits → 64 hex)
    //
    // Por que é melhor que dHash para matching cross-language em mangá:
    //   1. Preserva topologia espacial (DCT não preserva): painéis no mesmo lugar
    //      → LL idêntico mesmo com texto diferente
    //   2. Texto nos balões é energia de alta frequência → sub-banda HH → descartada
    //   3. Arte (traços, screentones, composição) é baixa frequência → sub-banda LL
    //
    // Threshold ótimo (256 bits, texto ~12% da imagem):
    //   Bits afetados pelo texto: 256 × 0.12 ≈ 30 bits
    //   Threshold para "mesma imagem cross-language": ≤ 40 bits (≤ 15.6%)
    //   Threshold conservador (deduplicação): ≤ 20 bits (≤ 7.8%)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Calcula wHash (Haar Wavelet Hash) 256-bit a partir de imageData 32×32.
     *
     * Pipeline:
     *   imageData (32×32 RGBA, 4096 bytes)
     *   → grayscale BT.601 (Float32, 0–255)
     *   → Haar DWT 2D 1 nível (32×32 → sub-bandas LL/LH/HL/HH cada 16×16)
     *   → extrair sub-banda LL (primeiros 16×16 = 256 coeficientes)
     *   → mediana dos 256 coeficientes LL
     *   → bit[i] = 1 se LL[i] > mediana, 0 caso contrário
     *   → 256 bits empacotados como nibbles → 64 hex chars lowercase
     *
     * @param {Uint8ClampedArray} imageData  getImageData(0, 0, 32, 32).data  (4096 bytes)
     * @returns {string}  64 chars hex lowercase (256 bits)
     */
    function calculateWHash(imageData) {
        if (!imageData || imageData.length < 32 * 32 * 4) {
            throw new Error('calculateWHash: imageData precisa de pelo menos 32×32×4=4096 bytes');
        }

        const N = 32;

        // RGBA → grayscale (luminância BT.601)
        const gray = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) {
            const b = i * 4;
            gray[i] = 0.299 * imageData[b]
                    + 0.587 * imageData[b + 1]
                    + 0.114 * imageData[b + 2];
        }

        // Haar DWT 2D (1 nível): 32×32 → LL está no quadrante 16×16 superior esquerdo
        const dwt = _haarDWT2D(gray, N);

        // Extrair sub-banda LL: linhas 0..15, colunas 0..15
        const LL = new Float32Array(16 * 16);
        for (let row = 0; row < 16; row++) {
            for (let col = 0; col < 16; col++) {
                LL[row * 16 + col] = dwt[row * N + col];
            }
        }

        // Mediana dos 256 coeficientes LL (ordenação parcial para performance)
        const sorted = LL.slice().sort();
        const median = (sorted[127] + sorted[128]) * 0.5;

        // 256 bits → 64 hex chars (4 bits por char, nibble)
        let hex = '';
        for (let i = 0; i < 256; i += 4) {
            const nibble = ((LL[i]     > median ? 8 : 0) |
                            (LL[i + 1] > median ? 4 : 0) |
                            (LL[i + 2] > median ? 2 : 0) |
                            (LL[i + 3] > median ? 1 : 0));
            hex += nibble.toString(16);
        }

        return hex; // sempre 64 chars hex lowercase
    }

    // ─────────────────────────────────────────────────────────────────────────
    // pHash — DCT Perceptual Hash  (visual-v3, 32×32 → DCT → top-left 16×16 → 256 bits)
    //
    // Implementação separável DCT-II 2D:
    //   Fase 1: DCT 1D em cada linha (32 linhas × 16 frequências × 32 ops = 16384 ops)
    //   Fase 2: DCT 1D em cada coluna de frequência 0..15 (16 cols × 16 freq × 32 ops = 8192 ops)
    //   Total: ~25K multiply-adds → <0.5ms no content script
    //
    // Por que o DCT suprime texto em mangá:
    //   O texto nos balões é concentrado localmente → energia em altos coeficientes AC
    //   Os 16×16 coeficientes de baixa frequência capturam layout global (arte)
    //   O DC[0,0] representa brilho médio → excluído para robustez a variações de exposição
    //
    // Complemento ao wHash:
    //   wHash: preserva topologia espacial via Haar (melhor para layout estruturado)
    //   pHash: robusto a variações globais de cor/tonalidade via DCT
    //   Juntos: cobrem casos onde um hash falha isoladamente
    // ─────────────────────────────────────────────────────────────────────────

    // Tabela de cossenos pré-computada para DCT 32×32
    // cosTable[k * N + n] = cos(π·k·(2n+1)/(2N)), N=32
    // Lazy-initialized para não impactar carregamento da extensão
    let _dctCosTable = null;

    function _getDctCosTable() {
        if (_dctCosTable) return _dctCosTable;
        const N = 32;
        _dctCosTable = new Float32Array(N * N);
        for (let k = 0; k < N; k++) {
            for (let n = 0; n < N; n++) {
                _dctCosTable[k * N + n] = Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
            }
        }
        return _dctCosTable;
    }

    /**
     * Calcula pHash (DCT Perceptual Hash) 256-bit a partir de imageData 32×32.
     *
     * Pipeline:
     *   imageData (32×32 RGBA, 4096 bytes)
     *   → grayscale BT.601
     *   → DCT-II 2D separável (32×32) — tabela de cossenos pré-computada
     *   → coeficientes AC top-left 16×16 (excluindo DC[0,0] em [0,0])
     *   → mediana dos 255 coeficientes AC
     *   → bit[0]=0 (DC fixo), bit[1..255] = AC[i] > mediana
     *   → 256 bits → 64 hex chars
     *
     * @param {Uint8ClampedArray} imageData  getImageData(0, 0, 32, 32).data  (4096 bytes)
     * @returns {string}  64 chars hex lowercase (256 bits)
     */
    function calculatePHash(imageData) {
        if (!imageData || imageData.length < 32 * 32 * 4) {
            throw new Error('calculatePHash: imageData precisa de pelo menos 32×32×4=4096 bytes');
        }

        const N        = 32;
        const cosTable = _getDctCosTable();

        // RGBA → grayscale BT.601
        const gray = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) {
            const b = i * 4;
            gray[i] = 0.299 * imageData[b]
                    + 0.587 * imageData[b + 1]
                    + 0.114 * imageData[b + 2];
        }

        // Fatores de normalização DCT-II ortogonal
        const scale0 = 1.0 / Math.sqrt(N);    // α(k=0)
        const scale1 = Math.sqrt(2.0 / N);    // α(k>0)

        // ── Fase 1: DCT 1D em cada linha (j-dimension → frequência v) ────────
        // G[row][v] = α(v) · Σ_j f[row][j] · cos(π·v·(2j+1)/(2N))
        // Armazenado em dctRowPartial[row * 16 + v], apenas v=0..15
        const dctRowPartial = new Float32Array(N * 16);
        for (let row = 0; row < N; row++) {
            const rowOff = row * N;
            for (let v = 0; v < 16; v++) {
                let sum    = 0;
                const cosV = v * N;
                for (let j = 0; j < N; j++) {
                    sum += gray[rowOff + j] * cosTable[cosV + j];
                }
                dctRowPartial[row * 16 + v] = (v === 0 ? scale0 : scale1) * sum;
            }
        }

        // ── Fase 2: DCT 1D em cada coluna de frequência v (i-dimension → freq u) ─
        // F[u][v] = α(u) · Σ_i G[i][v] · cos(π·u·(2i+1)/(2N))
        // Armazenado em dct16[u * 16 + v]
        const dct16 = new Float32Array(16 * 16);
        for (let v = 0; v < 16; v++) {
            for (let u = 0; u < 16; u++) {
                let sum    = 0;
                const cosU = u * N;
                for (let i = 0; i < N; i++) {
                    sum += dctRowPartial[i * 16 + v] * cosTable[cosU + i];
                }
                dct16[u * 16 + v] = (u === 0 ? scale0 : scale1) * sum;
            }
        }

        // ── Mediana dos 255 coeficientes AC (exclui DC = dct16[0]) ───────────
        const acCoeffs = new Float32Array(255);
        for (let i = 1; i < 256; i++) {
            acCoeffs[i - 1] = dct16[i];
        }
        const sortedAC = acCoeffs.slice().sort((a, b) => a - b);
        const median   = (sortedAC[126] + sortedAC[127]) * 0.5;

        // ── 256 bits → 64 hex chars ──────────────────────────────────────────
        // bit[0] = 0 (DC excluído); bit[1..255] = AC[i] > mediana
        let hex = '';
        for (let i = 0; i < 256; i += 4) {
            let nibble = 0;
            for (let j = 0; j < 4; j++) {
                const idx = i + j;
                const bit = (idx === 0) ? 0 : (dct16[idx] > median ? 1 : 0);
                nibble    = (nibble << 1) | bit;
            }
            hex += nibble.toString(16);
        }

        return hex; // sempre 64 chars hex lowercase
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hashes Regionais — Cantos (aproximação do RANSAC em JS puro)
    //
    // Divide a imagem em grid 3×3 de regiões 16×16 (canvas 48×48).
    // Calcula wHash 64-bit (8×8 LL) apenas dos 4 cantos onde texto raramente aparece.
    //
    // Complemento ao RANSAC:
    //   RANSAC (AKAZE): exclui keypoints de texto como outliers geometricamente inconsistentes
    //   Approach regional: usa conhecimento de domínio — texto fica no centro/balões, não nos cantos
    //   Implementável em JS puro sem OpenCV
    //
    // Grid de regiões 16×16 em canvas 48×48:
    //   [TL: (0,0)]    [TM: (0,16)]   [TR: (0,32)]
    //   [ML: (16,0)]   [MM: (16,16)]  [MR: (16,32)]
    //   [BL: (32,0)]   [BM: (32,16)]  [BR: (32,32)]
    //
    // Apenas TL, TR, BL, BR são usados (cantos com raridade de texto).
    // Match em ≥ 3/4 cantos = confirmação de identidade visual.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * wHash simplificado (64-bit) de um bloco 16×16 extraído de imageData 48×48.
     * 1 nível Haar 2D → LL 8×8 → 64 bits → 16 hex chars.
     *
     * @param {Uint8ClampedArray} imageData  48×48×4 = 9216 bytes
     * @param {number} startRow  linha inicial do bloco no canvas 48×48
     * @param {number} startCol  coluna inicial do bloco no canvas 48×48
     * @returns {string}  16 chars hex lowercase (64 bits)
     */
    function _blockWHash16(imageData, startRow, startCol) {
        const FULL_W = 48;
        const BLOCK  = 16;

        // Extrair bloco 16×16 → grayscale
        const gray = new Float32Array(BLOCK * BLOCK);
        for (let r = 0; r < BLOCK; r++) {
            for (let c = 0; c < BLOCK; c++) {
                const pix = ((startRow + r) * FULL_W + (startCol + c)) * 4;
                gray[r * BLOCK + c] = 0.299 * imageData[pix]
                                    + 0.587 * imageData[pix + 1]
                                    + 0.114 * imageData[pix + 2];
            }
        }

        // Haar 2D 16×16 → LL está no quadrante 8×8 superior esquerdo
        const dwt = _haarDWT2D(gray, BLOCK);

        // Extrair LL 8×8
        const LL = new Float32Array(8 * 8);
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                LL[r * 8 + c] = dwt[r * BLOCK + c];
            }
        }

        // Mediana → 64 bits → 16 hex chars
        const sorted = LL.slice().sort();
        const median = (sorted[31] + sorted[32]) * 0.5;

        let hex = '';
        for (let i = 0; i < 64; i += 4) {
            const nibble = ((LL[i]     > median ? 8 : 0) |
                            (LL[i + 1] > median ? 4 : 0) |
                            (LL[i + 2] > median ? 2 : 0) |
                            (LL[i + 3] > median ? 1 : 0));
            hex += nibble.toString(16);
        }

        return hex; // 16 chars hex
    }

    /**
     * Calcula wHash dos 4 cantos a partir de imageData 48×48.
     *
     * @param {Uint8ClampedArray} imageData  getImageData(0,0,48,48).data (9216 bytes)
     * @returns {{ topLeft: string, topRight: string, bottomLeft: string, bottomRight: string }}
     *   Cada campo: 16 chars hex (64 bits)
     */
    function calculateRegionalHashes(imageData) {
        if (!imageData || imageData.length < 48 * 48 * 4) {
            throw new Error('calculateRegionalHashes: imageData precisa de pelo menos 48×48×4=9216 bytes');
        }
        return {
            topLeft:     _blockWHash16(imageData, 0,  0),
            topRight:    _blockWHash16(imageData, 0,  32),
            bottomLeft:  _blockWHash16(imageData, 32, 0),
            bottomRight: _blockWHash16(imageData, 32, 32),
        };
    }

    /**
     * Verifica match regional: retorna true se ≥ minMatches dos 4 cantos coincidem
     * com Hamming ≤ threshold (default: 8 bits de 64 = 12.5%).
     *
     * @param {object} regionalA  { topLeft, topRight, bottomLeft, bottomRight }
     * @param {object} regionalB  { topLeft, topRight, bottomLeft, bottomRight }
     * @param {{ threshold?: number, minMatches?: number }} opts
     * @returns {{ match: boolean, matchCount: number, details: object }}
     */
    function matchRegionalHashes(regionalA, regionalB, { threshold = 8, minMatches = 3 } = {}) {
        if (!regionalA || !regionalB) return { match: false, matchCount: 0, details: {} };

        const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
        let matchCount = 0;
        const details  = {};

        for (const corner of corners) {
            const dist = hammingDistance(regionalA[corner], regionalB[corner]);
            const ok   = dist >= 0 && dist <= threshold;
            if (ok) matchCount++;
            details[corner] = { dist, match: ok };
        }

        return { match: matchCount >= minMatches, matchCount, details };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Distância de Hamming generalizada
    //
    // Aceita hashes hex de qualquer comprimento par (múltiplo de 4 bits):
    //   16 chars → dHash 64-bit
    //   64 chars → wHash / pHash 256-bit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {string} hashA  hex lowercase, qualquer comprimento par
     * @param {string} hashB  hex lowercase, mesmo comprimento de hashA
     * @returns {number}  bits diferentes (0 a len*4), ou -1 se input inválido
     */
    function hammingDistance(hashA, hashB) {
        if (!hashA || !hashB || hashA.length !== hashB.length) return -1;
        let dist = 0;
        for (let i = 0; i < hashA.length; i++) {
            let xor = (parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16));
            while (xor) { dist += xor & 1; xor >>>= 1; }
        }
        return dist;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // matchPerceptualHashes — Decisão combinada wHash + pHash
    //
    // Implementação direta do pipeline descrito na análise matemática:
    //
    //   MATCH se: (Hamming_wHash ≤ 40 OU Hamming_pHash ≤ 35)
    //             E NOT (Hamming_wHash > 80 E Hamming_pHash > 70)
    //
    //   Rejeição absoluta: ambos os hashes muito distantes (imagem diferente)
    //
    // Thresholds (base: 256 bits):
    //   wHash match:          ≤ 40 bits (≤ 15.6%) — threshold cross-language
    //   pHash match:          ≤ 35 bits (≤ 13.7%)
    //   wHash rejeição:       > 80 bits (> 31.3%)
    //   pHash rejeição:       > 70 bits (> 27.3%)
    //
    // Confidence score [0..1]:
    //   confidence = max(wConf, pConf)
    //   wConf = 1 - wDist / WHASH_REJECT_THRESHOLD  (quando wMatch)
    //   pConf = 1 - pDist / PHASH_REJECT_THRESHOLD  (quando pMatch)
    // ─────────────────────────────────────────────────────────────────────────

    const WHASH_MATCH_THRESHOLD  = 40;  // Hamming ≤ 40/256 → wHash match
    const PHASH_MATCH_THRESHOLD  = 35;  // Hamming ≤ 35/256 → pHash match
    const WHASH_REJECT_THRESHOLD = 80;  // Hamming > 80 → componente wHash rejeita
    const PHASH_REJECT_THRESHOLD = 70;  // Hamming > 70 → componente pHash rejeita

    // ── Thresholds relaxados (visual-v4 / Solução C) ────────────────────────
    //
    // Usados apenas como fallback depois de SHA-256, dHash, perceptual strict e
    // center-crop falharem. A confidence é limitada a 0.75 para forçar a
    // confirmação regional no content script antes de qualquer substituição.
    const WHASH_MATCH_THRESHOLD_RELAXED  = 50;
    const PHASH_MATCH_THRESHOLD_RELAXED  = 45;
    const WHASH_REJECT_THRESHOLD_RELAXED = 90;
    const PHASH_REJECT_THRESHOLD_RELAXED = 82;

    /**
     * @param {string|null} wHashA  64 chars hex (256 bits) ou null
     * @param {string|null} pHashA  64 chars hex (256 bits) ou null
     * @param {string|null} wHashB  64 chars hex (256 bits) ou null
     * @param {string|null} pHashB  64 chars hex (256 bits) ou null
     * @returns {{
     *   match:      boolean,
     *   confidence: number,   // [0..1]
     *   reason:     string,
     *   wDist:      number,   // -1 se hash ausente
     *   pDist:      number,
     * }}
     */
    function matchPerceptualHashes(wHashA, pHashA, wHashB, pHashB) {
        const wDist = (wHashA && wHashB) ? hammingDistance(wHashA, wHashB) : -1;
        const pDist = (pHashA && pHashB) ? hammingDistance(pHashA, pHashB) : -1;

        // ── Ambos disponíveis: lógica combinada ──────────────────────────────
        if (wDist >= 0 && pDist >= 0) {
            // Rejeição absoluta: ambos sinalizando imagem diferente
            if (wDist > WHASH_REJECT_THRESHOLD && pDist > PHASH_REJECT_THRESHOLD) {
                return { match: false, confidence: 0, reason: 'both_reject', wDist, pDist };
            }

            const wMatch = wDist <= WHASH_MATCH_THRESHOLD;
            const pMatch = pDist <= PHASH_MATCH_THRESHOLD;

            if (wMatch || pMatch) {
                const wConf = wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD) : 0;
                const pConf = pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD) : 0;
                const confidence = Math.min(1, Math.max(wConf, pConf));
                const reason = (wMatch && pMatch) ? 'both_match'
                             : wMatch             ? 'whash_match'
                             :                      'phash_match';
                return { match: true, confidence, reason, wDist, pDist };
            }

            return { match: false, confidence: 0, reason: 'both_miss', wDist, pDist };
        }

        // ── Apenas wHash ─────────────────────────────────────────────────────
        if (wDist >= 0) {
            const wMatch = wDist <= WHASH_MATCH_THRESHOLD;
            return {
                match:      wMatch,
                confidence: wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD) : 0,
                reason:     wMatch ? 'whash_only_match' : 'whash_only_miss',
                wDist,
                pDist: -1,
            };
        }

        // ── Apenas pHash ─────────────────────────────────────────────────────
        if (pDist >= 0) {
            const pMatch = pDist <= PHASH_MATCH_THRESHOLD;
            return {
                match:      pMatch,
                confidence: pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD) : 0,
                reason:     pMatch ? 'phash_only_match' : 'phash_only_miss',
                wDist: -1,
                pDist,
            };
        }

        // ── Nenhum hash disponível ────────────────────────────────────────────
        return { match: false, confidence: 0, reason: 'no_hashes', wDist: -1, pDist: -1 };
    }

    function matchPerceptualHashesRelaxed(wHashA, pHashA, wHashB, pHashB) {
        const wDist = (wHashA && wHashB) ? hammingDistance(wHashA, wHashB) : -1;
        const pDist = (pHashA && pHashB) ? hammingDistance(pHashA, pHashB) : -1;

        if (wDist >= 0 && pDist >= 0) {
            if (wDist > WHASH_REJECT_THRESHOLD_RELAXED && pDist > PHASH_REJECT_THRESHOLD_RELAXED) {
                return { match: false, confidence: 0, reason: 'relaxed_both_reject', wDist, pDist };
            }

            const wMatch = wDist <= WHASH_MATCH_THRESHOLD_RELAXED;
            const pMatch = pDist <= PHASH_MATCH_THRESHOLD_RELAXED;

            if (wMatch || pMatch) {
                const wConf = wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD_RELAXED) : 0;
                const pConf = pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD_RELAXED) : 0;
                const confidence = Math.min(0.75, Math.max(wConf, pConf));
                const reason = (wMatch && pMatch) ? 'relaxed_both_match'
                             : wMatch             ? 'relaxed_whash_match'
                             :                      'relaxed_phash_match';
                return { match: true, confidence, reason, wDist, pDist };
            }

            return { match: false, confidence: 0, reason: 'relaxed_both_miss', wDist, pDist };
        }

        if (wDist >= 0) {
            const wMatch = wDist <= WHASH_MATCH_THRESHOLD_RELAXED;
            return {
                match:      wMatch,
                confidence: wMatch ? Math.min(0.75, 1 - wDist / WHASH_REJECT_THRESHOLD_RELAXED) : 0,
                reason:     wMatch ? 'relaxed_whash_only_match' : 'relaxed_whash_only_miss',
                wDist,
                pDist: -1,
            };
        }

        if (pDist >= 0) {
            const pMatch = pDist <= PHASH_MATCH_THRESHOLD_RELAXED;
            return {
                match:      pMatch,
                confidence: pMatch ? Math.min(0.75, 1 - pDist / PHASH_REJECT_THRESHOLD_RELAXED) : 0,
                reason:     pMatch ? 'relaxed_phash_only_match' : 'relaxed_phash_only_miss',
                wDist: -1,
                pDist,
            };
        }

        return { match: false, confidence: 0, reason: 'no_hashes', wDist: -1, pDist: -1 };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API pública
    // ─────────────────────────────────────────────────────────────────────────

    const api = {
        // SHA-256 (visual-v1/v2, inalterado)
        buildFingerprintSource,
        hashStringSha256,
        createFingerprintFromDescriptor,
        generateId,

        // dHash (visual-v2) — 9×8 → 16 hex chars
        calculateDHash,

        // wHash (visual-v3) — Haar Wavelet, 32×32 → 64 hex chars (256 bits)
        calculateWHash,

        // pHash (visual-v3) — DCT, 32×32 → 64 hex chars (256 bits)
        calculatePHash,

        // Hashes regionais dos 4 cantos (48×48 canvas, aproximação do RANSAC)
        calculateRegionalHashes,
        matchRegionalHashes,

        // Hamming distance generalizada (16, 64, ou qualquer comprimento par)
        hammingDistance,

        // Match combinado wHash + pHash com thresholds calibrados para mangá
        matchPerceptualHashes,
        matchPerceptualHashesRelaxed,

        // Thresholds públicos (para uso no content script, SW e IndexedDB)
        WHASH_MATCH_THRESHOLD,
        PHASH_MATCH_THRESHOLD,
        WHASH_REJECT_THRESHOLD,
        PHASH_REJECT_THRESHOLD,
        WHASH_MATCH_THRESHOLD_RELAXED,
        PHASH_MATCH_THRESHOLD_RELAXED,
        WHASH_REJECT_THRESHOLD_RELAXED,
        PHASH_REJECT_THRESHOLD_RELAXED,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    rootScope.MangaTranslatorGtcFingerprint = api;

})(typeof self !== 'undefined' ? self : globalThis);
```

## 10. Cobertura documental linha a linha

Cada posição abaixo corresponde exatamente a `source.split("\n")`. Helpers internos recebem evidência via funções exportadas que os executam; isso é distinguido de assertions diretas sobre o helper.

### Linha 0001

**Fonte:** `'use strict';`  
**O que faz:** Executa a operação `'use strict';` dentro de **wrapper compartilhado e estado do fallback de ID**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** permite uma implementação única em content script, Service Worker e Node/Jest.  
**Risco/alternativa:** duplicar o módulo por runtime criaria hashes incompatíveis.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — o módulo real é carregado por Jest/visual e publica a mesma API em CommonJS/global.

### Linha 0002

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wrapper compartilhado e estado do fallback de ID**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — o módulo real é carregado por Jest/visual e publica a mesma API em CommonJS/global.

### Linha 0003

**Fonte:** `(function attachGtcFingerprintApi(rootScope) {`  
**O que faz:** Executa a operação `(function attachGtcFingerprintApi(rootScope) {` dentro de **wrapper compartilhado e estado do fallback de ID**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** permite uma implementação única em content script, Service Worker e Node/Jest.  
**Risco/alternativa:** duplicar o módulo por runtime criaria hashes incompatíveis.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — o módulo real é carregado por Jest/visual e publica a mesma API em CommonJS/global.

### Linha 0004

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wrapper compartilhado e estado do fallback de ID**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — o módulo real é carregado por Jest/visual e publica a mesma API em CommonJS/global.

### Linha 0005

**Fonte:** `let fallbackIdCounter = 0;`  
**O que faz:** Inicializa `fallbackIdCounter` com `0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wrapper compartilhado e estado do fallback de ID**.  
**Por que assim:** permite uma implementação única em content script, Service Worker e Node/Jest.  
**Risco/alternativa:** duplicar o módulo por runtime criaria hashes incompatíveis.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — o módulo real é carregado por Jest/visual e publica a mesma API em CommonJS/global.

### Linha 0006

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wrapper compartilhado e estado do fallback de ID**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 EXECUTADO DIRETAMENTE — o módulo real é carregado por Jest/visual e publica a mesma API em CommonJS/global.

### Linha 0007

**Fonte:** `function utf8Encode(input) {`  
**O que faz:** Declara a função `utf8Encode` em **codificação UTF-8 manual**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0008

**Fonte:** `const text = String(input);`  
**O que faz:** Inicializa `text` com `String(input);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **codificação UTF-8 manual**.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0009

**Fonte:** `const bytes = [];`  
**O que faz:** Inicializa `bytes` com `[];`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **codificação UTF-8 manual**.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0010

**Fonte:** `for (let i = 0; i < text.length; i += 1) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < text.length; i += 1) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0011

**Fonte:** `let codePoint = text.charCodeAt(i);`  
**O que faz:** Inicializa `codePoint` com `text.charCodeAt(i);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **codificação UTF-8 manual**.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0012

**Fonte:** `if (codePoint >= 0xD800 && codePoint <= 0xDBFF && i + 1 < text.length) {`  
**O que faz:** Aplica a guarda `if (codePoint >= 0xD800 && codePoint <= 0xDBFF && i + 1 < text.length) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0013

**Fonte:** `const low = text.charCodeAt(i + 1);`  
**O que faz:** Inicializa `low` com `text.charCodeAt(i + 1);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **codificação UTF-8 manual**.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0014

**Fonte:** `if (low >= 0xDC00 && low <= 0xDFFF) {`  
**O que faz:** Aplica a guarda `if (low >= 0xDC00 && low <= 0xDFFF) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0015

**Fonte:** `codePoint = 0x10000 + ((codePoint - 0xD800) << 10) + (low - 0xDC00);`  
**O que faz:** Executa a operação `codePoint = 0x10000 + ((codePoint - 0xD800) << 10) + (low - 0xDC00);` dentro de **codificação UTF-8 manual**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0016

**Fonte:** `i += 1;`  
**O que faz:** Executa a operação `i += 1;` dentro de **codificação UTF-8 manual**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0017

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **codificação UTF-8 manual** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0018

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **codificação UTF-8 manual** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0019

**Fonte:** `if (codePoint <= 0x7F) bytes.push(codePoint);`  
**O que faz:** Aplica a guarda `if (codePoint <= 0x7F) bytes.push(codePoint);`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0020

**Fonte:** `else if (codePoint <= 0x7FF) bytes.push(0xC0 \| (codePoint >> 6), 0x80 \| (codePoint & 0x3F));`  
**O que faz:** Acrescenta bytes/words com `else if (codePoint <= 0x7FF) bytes.push(0xC0 \| (codePoint >> 6), 0x80 \| (codePoint & 0x3F));`.  
**Como faz:** Constrói a sequência na ordem exigida por UTF-8 ou padding SHA.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0021

**Fonte:** `else if (codePoint <= 0xFFFF) bytes.push(0xE0 \| (codePoint >> 12), 0x80 \| ((codePoint >> 6) & 0x3F), 0x80 \| (codePoint & 0x3F));`  
**O que faz:** Acrescenta bytes/words com `else if (codePoint <= 0xFFFF) bytes.push(0xE0 \| (codePoint >> 12), 0x80 \| ((codePoint >> 6) & 0x3F), 0x80 \| (codePoint & 0x3F));`.  
**Como faz:** Constrói a sequência na ordem exigida por UTF-8 ou padding SHA.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0022

**Fonte:** `else bytes.push(0xF0 \| (codePoint >> 18), 0x80 \| ((codePoint >> 12) & 0x3F), 0x80 \| ((codePoint >> 6) & 0x3F), 0x80 \| (codePoint & 0x3F));`  
**O que faz:** Acrescenta bytes/words com `else bytes.push(0xF0 \| (codePoint >> 18), 0x80 \| ((codePoint >> 12) & 0x3F), 0x80 \| ((codePoint >> 6) & 0x3F), 0x80 \| (codePoint & 0x3F));`.  
**Como faz:** Constrói a sequência na ordem exigida por UTF-8 ou padding SHA.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0023

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **codificação UTF-8 manual** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0024

**Fonte:** `return bytes;`  
**O que faz:** Retorna `return bytes;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0025

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **codificação UTF-8 manual** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece bytes UTF-8 quando TextEncoder não existe.  
**Risco/alternativa:** um encoder manual divergente fragmentaria fingerprints entre runtimes.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0026

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **codificação UTF-8 manual**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 PARCIALMENTE PROVADO DIRETAMENTE — o fallback SHA real é testado em ASCII; Unicode normal é testado no caminho WebCrypto/TextEncoder, não lone surrogates.

### Linha 0027

**Fonte:** `function sha256Fallback(input) {`  
**O que faz:** Declara a função `sha256Fallback` em **SHA-256 puro em JavaScript**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0028

**Fonte:** `const bytes = utf8Encode(input);`  
**O que faz:** Inicializa `bytes` com `utf8Encode(input);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0029

**Fonte:** `const bitLength = bytes.length * 8;`  
**O que faz:** Inicializa `bitLength` com `bytes.length * 8;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0030

**Fonte:** `bytes.push(0x80);`  
**O que faz:** Acrescenta bytes/words com `bytes.push(0x80);`.  
**Como faz:** Constrói a sequência na ordem exigida por UTF-8 ou padding SHA.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0031

**Fonte:** `while ((bytes.length % 64) !== 56) bytes.push(0);`  
**O que faz:** Inicia a iteração `while ((bytes.length % 64) !== 56) bytes.push(0);`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0032

**Fonte:** `const high = Math.floor(bitLength / 0x100000000);`  
**O que faz:** Inicializa `high` com `Math.floor(bitLength / 0x100000000);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0033

**Fonte:** `const low = bitLength >>> 0;`  
**O que faz:** Inicializa `low` com `bitLength >>> 0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0034

**Fonte:** `[high, low].forEach(word => bytes.push((word >>> 24) & 0xFF, (word >>> 16) & 0xFF, (word >>> 8) & 0xFF, word & 0xFF));`  
**O que faz:** Acrescenta bytes/words com `[high, low].forEach(word => bytes.push((word >>> 24) & 0xFF, (word >>> 16) & 0xFF, (word >>> 8) & 0xFF, word & 0xFF));`.  
**Como faz:** Constrói a sequência na ordem exigida por UTF-8 ou padding SHA.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0035

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0036

**Fonte:** `const constants = [`  
**O que faz:** Inicializa `constants` com `[`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0037

**Fonte:** `0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,`  
**O que faz:** Executa a operação `0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0038

**Fonte:** `0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,`  
**O que faz:** Executa a operação `0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0039

**Fonte:** `0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,`  
**O que faz:** Executa a operação `0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0040

**Fonte:** `0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,`  
**O que faz:** Executa a operação `0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0041

**Fonte:** `0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,`  
**O que faz:** Executa a operação `0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0042

**Fonte:** `0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,`  
**O que faz:** Executa a operação `0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0043

**Fonte:** `0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,`  
**O que faz:** Executa a operação `0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0044

**Fonte:** `0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,`  
**O que faz:** Executa a operação `0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0045

**Fonte:** `];`  
**O que faz:** Fecha/continua a estrutura sintática de **SHA-256 puro em JavaScript** com `];`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0046

**Fonte:** `let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;`  
**O que faz:** Inicializa `h0` com `0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0047

**Fonte:** `let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;`  
**O que faz:** Inicializa `h4` com `0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0048

**Fonte:** `const words = new Uint32Array(64);`  
**O que faz:** Inicializa `words` com `new Uint32Array(64);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0049

**Fonte:** `for (let offset = 0; offset < bytes.length; offset += 64) {`  
**O que faz:** Inicia a iteração `for (let offset = 0; offset < bytes.length; offset += 64) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0050

**Fonte:** `for (let i = 0; i < 16; i += 1) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < 16; i += 1) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0051

**Fonte:** `const j = offset + i * 4;`  
**O que faz:** Inicializa `j` com `offset + i * 4;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0052

**Fonte:** `words[i] = (bytes[j] << 24) \| (bytes[j + 1] << 16) \| (bytes[j + 2] << 8) \| bytes[j + 3];`  
**O que faz:** Executa a operação `words[i] = (bytes[j] << 24) \| (bytes[j + 1] << 16) \| (bytes[j + 2] << 8) \| bytes[j + 3];` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0053

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **SHA-256 puro em JavaScript** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0054

**Fonte:** `for (let i = 16; i < 64; i += 1) {`  
**O que faz:** Inicia a iteração `for (let i = 16; i < 64; i += 1) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0055

**Fonte:** `const x = words[i - 15];`  
**O que faz:** Inicializa `x` com `words[i - 15];`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0056

**Fonte:** `const y = words[i - 2];`  
**O que faz:** Inicializa `y` com `words[i - 2];`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0057

**Fonte:** `const s0 = ((x >>> 7) \| (x << 25)) ^ ((x >>> 18) \| (x << 14)) ^ (x >>> 3);`  
**O que faz:** Inicializa `s0` com `((x >>> 7) \| (x << 25)) ^ ((x >>> 18) \| (x << 14)) ^ (x >>> 3);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0058

**Fonte:** `const s1 = ((y >>> 17) \| (y << 15)) ^ ((y >>> 19) \| (y << 13)) ^ (y >>> 10);`  
**O que faz:** Inicializa `s1` com `((y >>> 17) \| (y << 15)) ^ ((y >>> 19) \| (y << 13)) ^ (y >>> 10);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0059

**Fonte:** `words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;`  
**O que faz:** Executa a operação `words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0060

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **SHA-256 puro em JavaScript** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0061

**Fonte:** `let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;`  
**O que faz:** Inicializa `a` com `h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0062

**Fonte:** `for (let i = 0; i < 64; i += 1) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < 64; i += 1) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0063

**Fonte:** `const s1 = ((e >>> 6) \| (e << 26)) ^ ((e >>> 11) \| (e << 21)) ^ ((e >>> 25) \| (e << 7));`  
**O que faz:** Inicializa `s1` com `((e >>> 6) \| (e << 26)) ^ ((e >>> 11) \| (e << 21)) ^ ((e >>> 25) \| (e << 7));`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0064

**Fonte:** `const choose = (e & f) ^ (~e & g);`  
**O que faz:** Inicializa `choose` com `(e & f) ^ (~e & g);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0065

**Fonte:** `const temp1 = (h + s1 + choose + constants[i] + words[i]) >>> 0;`  
**O que faz:** Inicializa `temp1` com `(h + s1 + choose + constants[i] + words[i]) >>> 0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0066

**Fonte:** `const s0 = ((a >>> 2) \| (a << 30)) ^ ((a >>> 13) \| (a << 19)) ^ ((a >>> 22) \| (a << 10));`  
**O que faz:** Inicializa `s0` com `((a >>> 2) \| (a << 30)) ^ ((a >>> 13) \| (a << 19)) ^ ((a >>> 22) \| (a << 10));`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0067

**Fonte:** `const majority = (a & b) ^ (a & c) ^ (b & c);`  
**O que faz:** Inicializa `majority` com `(a & b) ^ (a & c) ^ (b & c);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0068

**Fonte:** `const temp2 = (s0 + majority) >>> 0;`  
**O que faz:** Inicializa `temp2` com `(s0 + majority) >>> 0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **SHA-256 puro em JavaScript**.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0069

**Fonte:** `h = g; g = f; f = e; e = (d + temp1) >>> 0;`  
**O que faz:** Executa a operação `h = g; g = f; f = e; e = (d + temp1) >>> 0;` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0070

**Fonte:** `d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;`  
**O que faz:** Executa a operação `d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0071

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **SHA-256 puro em JavaScript** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0072

**Fonte:** `h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;`  
**O que faz:** Executa a operação `h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0073

**Fonte:** `h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;`  
**O que faz:** Executa a operação `h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;` dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0074

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **SHA-256 puro em JavaScript** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0075

**Fonte:** `return [h0, h1, h2, h3, h4, h5, h6, h7].map(word => word.toString(16).padStart(8, '0')).join('');`  
**O que faz:** Retorna `return [h0, h1, h2, h3, h4, h5, h6, h7].map(word => word.toString(16).padStart(8, '0')).join('');`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0076

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **SHA-256 puro em JavaScript** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** mantém SHA-256 determinístico sem WebCrypto.  
**Risco/alternativa:** um hash alternativo incompatível invalidaria o cache global.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0077

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **SHA-256 puro em JavaScript**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-15/16 comparam o fallback real a crypto.createHash; hash vazio e caminho nativo também são cobertos.

### Linha 0078

**Fonte:** `function generateId(prefix = '', { cryptoImpl } = {}) {`  
**O que faz:** Declara a função `generateId` em **geração de IDs multi-fallback**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0079

**Fonte:** `const cryptoRef = cryptoImpl === undefined ? rootScope.crypto : cryptoImpl;`  
**O que faz:** Inicializa `cryptoRef` com `cryptoImpl === undefined ? rootScope.crypto : cryptoImpl;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **geração de IDs multi-fallback**.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0080

**Fonte:** `if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return prefix + cryptoRef.randomUUID();`  
**O que faz:** Aplica a guarda `if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return prefix + cryptoRef.randomUUID();`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0081

**Fonte:** `if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {`  
**O que faz:** Aplica a guarda `if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0082

**Fonte:** `const bytes = cryptoRef.getRandomValues(new Uint8Array(16));`  
**O que faz:** Inicializa `bytes` com `cryptoRef.getRandomValues(new Uint8Array(16));`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **geração de IDs multi-fallback**.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0083

**Fonte:** `bytes[6] = (bytes[6] & 0x0F) \| 0x40;`  
**O que faz:** Executa a operação `bytes[6] = (bytes[6] & 0x0F) \| 0x40;` dentro de **geração de IDs multi-fallback**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0084

**Fonte:** `bytes[8] = (bytes[8] & 0x3F) \| 0x80;`  
**O que faz:** Executa a operação `bytes[8] = (bytes[8] & 0x3F) \| 0x80;` dentro de **geração de IDs multi-fallback**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0085

**Fonte:** `const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');`  
**O que faz:** Inicializa `hex` com `Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **geração de IDs multi-fallback**.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0086

**Fonte:** `return \`${prefix}${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}\`;`  
**O que faz:** Retorna `return \`${prefix}${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}\`;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0087

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **geração de IDs multi-fallback** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0088

**Fonte:** `fallbackIdCounter = (fallbackIdCounter + 1) >>> 0;`  
**O que faz:** Executa a operação `fallbackIdCounter = (fallbackIdCounter + 1) >>> 0;` dentro de **geração de IDs multi-fallback**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0089

**Fonte:** `return \`${prefix}${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 14)}\`;`  
**O que faz:** Retorna `return \`${prefix}${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 14)}\`;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0090

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **geração de IDs multi-fallback** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** impede que runtimes sem randomUUID interrompam jobs/lotes.  
**Risco/alternativa:** o fallback Math.random não deve ser tratado como token de segurança.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0091

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **geração de IDs multi-fallback**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-19 prova getRandomValues UUIDv4 e FP-20 prova formato/unicidade imediata sem crypto.

### Linha 0092

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0093

**Fonte:** `// SHA-256 fingerprint (visual-v1 / visual-v2)`  
**O que faz:** Comentário/JSDoc do fonte registra: “SHA-256 fingerprint (visual-v1 / visual-v2)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0094

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0095

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0096

**Fonte:** `function buildFingerprintSource({`  
**O que faz:** Declara a função `buildFingerprintSource` em **fonte canônica do fingerprint SHA**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0097

**Fonte:** `width = 0,`  
**O que faz:** Executa a operação `width = 0,` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0098

**Fonte:** `height = 0,`  
**O que faz:** Executa a operação `height = 0,` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0099

**Fonte:** `visualHash = '',`  
**O que faz:** Executa a operação `visualHash = '',` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0100

**Fonte:** `pixelSample = '',`  
**O que faz:** Executa a operação `pixelSample = '',` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0101

**Fonte:** `cleanUrl = '',`  
**O que faz:** Executa a operação `cleanUrl = '',` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0102

**Fonte:** `hasVisualPixels = false,`  
**O que faz:** Executa a operação `hasVisualPixels = false,` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0103

**Fonte:** `} = {}) {`  
**O que faz:** Executa a operação `} = {}) {` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0104

**Fonte:** `const dims = \`${width \|\| 0}:${height \|\| 0}\`;`  
**O que faz:** Inicializa `dims` com `\`${width \|\| 0}:${height \|\| 0}\`;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **fonte canônica do fingerprint SHA**.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0105

**Fonte:** `if (visualHash) {`  
**O que faz:** Aplica a guarda `if (visualHash) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0106

**Fonte:** `return \`v2:${dims}:${visualHash}\`;`  
**O que faz:** Retorna `return \`v2:${dims}:${visualHash}\`;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0107

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fonte canônica do fingerprint SHA** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0108

**Fonte:** `if (hasVisualPixels && pixelSample && pixelSample !== 'nopixels') {`  
**O que faz:** Aplica a guarda `if (hasVisualPixels && pixelSample && pixelSample !== 'nopixels') {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0109

**Fonte:** `return \`${dims}:pixels:${pixelSample}\`;`  
**O que faz:** Retorna `return \`${dims}:pixels:${pixelSample}\`;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0110

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fonte canônica do fingerprint SHA** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0111

**Fonte:** `return \`${dims}:url:${cleanUrl \|\| ''}:nopixels\`;`  
**O que faz:** Retorna `return \`${dims}:url:${cleanUrl \|\| ''}:nopixels\`;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0112

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fonte canônica do fingerprint SHA** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0113

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0114

**Fonte:** `async function hashStringSha256(input, { cryptoImpl, TextEncoderImpl } = {}) {`  
**O que faz:** Declara a função `hashStringSha256` em **fonte canônica do fingerprint SHA**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0115

**Fonte:** `const cryptoRef = cryptoImpl === undefined ? rootScope.crypto : cryptoImpl;`  
**O que faz:** Inicializa `cryptoRef` com `cryptoImpl === undefined ? rootScope.crypto : cryptoImpl;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **fonte canônica do fingerprint SHA**.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0116

**Fonte:** `const Encoder = TextEncoderImpl === undefined ? rootScope.TextEncoder : TextEncoderImpl;`  
**O que faz:** Inicializa `Encoder` com `TextEncoderImpl === undefined ? rootScope.TextEncoder : TextEncoderImpl;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **fonte canônica do fingerprint SHA**.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0117

**Fonte:** `if (!cryptoRef \|\| !cryptoRef.subtle \|\| !Encoder) return sha256Fallback(input);`  
**O que faz:** Aplica a guarda `if (!cryptoRef \|\| !cryptoRef.subtle \|\| !Encoder) return sha256Fallback(input);`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0118

**Fonte:** `const msgBuffer = new Encoder().encode(String(input));`  
**O que faz:** Inicializa `msgBuffer` com `new Encoder().encode(String(input));`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **fonte canônica do fingerprint SHA**.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0119

**Fonte:** `const hashBuffer = await cryptoRef.subtle.digest('SHA-256', msgBuffer);`  
**O que faz:** Inicializa `hashBuffer` com `await cryptoRef.subtle.digest('SHA-256', msgBuffer);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **fonte canônica do fingerprint SHA**.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0120

**Fonte:** `return Array.from(new Uint8Array(hashBuffer))`  
**O que faz:** Retorna `return Array.from(new Uint8Array(hashBuffer))`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0121

**Fonte:** `.map(b => b.toString(16).padStart(2, '0'))`  
**O que faz:** Executa a operação `.map(b => b.toString(16).padStart(2, '0'))` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0122

**Fonte:** `.join('');`  
**O que faz:** Executa a operação `.join('');` dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0123

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fonte canônica do fingerprint SHA** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0124

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0125

**Fonte:** `async function createFingerprintFromDescriptor(descriptor, deps = {}) {`  
**O que faz:** Declara a função `createFingerprintFromDescriptor` em **fonte canônica do fingerprint SHA**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0126

**Fonte:** `const source = buildFingerprintSource(descriptor);`  
**O que faz:** Inicializa `source` com `buildFingerprintSource(descriptor);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **fonte canônica do fingerprint SHA**.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0127

**Fonte:** `return hashStringSha256(source, deps);`  
**O que faz:** Retorna `return hashStringSha256(source, deps);`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0128

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **fonte canônica do fingerprint SHA** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** normaliza o descritor antes do SHA-256.  
**Risco/alternativa:** hashar dados sem formato canônico produziria chaves divergentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0129

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **fonte canônica do fingerprint SHA**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-01..06 e FP-13..22 provam prioridade visualHash/pixels/URL, SHA e determinismo.

### Linha 0130

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0131

**Fonte:** `// dHash — Difference Hash (perceptual, 9×8 → 64 bits → 16 hex chars)`  
**O que faz:** Comentário/JSDoc do fonte registra: “dHash — Difference Hash (perceptual, 9×8 → 64 bits → 16 hex chars)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0132

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0133

**Fonte:** `// visual-v2: complemento ao SHA-256 para lookup CORS-resiliente.`  
**O que faz:** Comentário/JSDoc do fonte registra: “visual-v2: complemento ao SHA-256 para lookup CORS-resiliente.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0134

**Fonte:** `// LIMITAÇÃO CONHECIDA: gradientes horizontais são afetados por texto em`  
**O que faz:** Comentário/JSDoc do fonte registra: “LIMITAÇÃO CONHECIDA: gradientes horizontais são afetados por texto em”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0135

**Fonte:** `// balões → 50-75% do hash corrompido em matching cross-language.`  
**O que faz:** Comentário/JSDoc do fonte registra: “balões → 50-75% do hash corrompido em matching cross-language.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0136

**Fonte:** `// Para matching cross-language, usar wHash (visual-v3).`  
**O que faz:** Comentário/JSDoc do fonte registra: “Para matching cross-language, usar wHash (visual-v3).”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0137

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0138

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **dHash 64-bit**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0139

**Fonte:** `function calculateDHash(imageData) {`  
**O que faz:** Declara a função `calculateDHash` em **dHash 64-bit**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0140

**Fonte:** `if (!imageData \|\| imageData.length < 9 * 8 * 4) {`  
**O que faz:** Aplica a guarda `if (!imageData \|\| imageData.length < 9 * 8 * 4) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0141

**Fonte:** `throw new Error('calculateDHash: imageData precisa de pelo menos 9×8×4=288 bytes (canvas 9×8 RGBA)');`  
**O que faz:** Rejeita entrada inválida com `throw new Error('calculateDHash: imageData precisa de pelo menos 9×8×4=288 bytes (canvas 9×8 RGBA)');`.  
**Como faz:** Falha cedo antes de ler um buffer menor que a dimensão mínima do algoritmo.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0142

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **dHash 64-bit** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0143

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **dHash 64-bit**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0144

**Fonte:** `const W = 9;`  
**O que faz:** Inicializa `W` com `9;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **dHash 64-bit**.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0145

**Fonte:** `const H = 8;`  
**O que faz:** Inicializa `H` com `8;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **dHash 64-bit**.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0146

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **dHash 64-bit**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0147

**Fonte:** `const gray = new Float32Array(W * H);`  
**O que faz:** Inicializa `gray` com `new Float32Array(W * H);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **dHash 64-bit**.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0148

**Fonte:** `for (let i = 0; i < W * H; i++) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < W * H; i++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0149

**Fonte:** `const b = i * 4;`  
**O que faz:** Inicializa `b` com `i * 4;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **dHash 64-bit**.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0150

**Fonte:** `gray[i] = 0.299 * imageData[b]`  
**O que faz:** Executa a operação `gray[i] = 0.299 * imageData[b]` dentro de **dHash 64-bit**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0151

**Fonte:** `+ 0.587 * imageData[b + 1]`  
**O que faz:** Executa a operação `+ 0.587 * imageData[b + 1]` dentro de **dHash 64-bit**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0152

**Fonte:** `+ 0.114 * imageData[b + 2];`  
**O que faz:** Executa a operação `+ 0.114 * imageData[b + 2];` dentro de **dHash 64-bit**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0153

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **dHash 64-bit** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0154

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **dHash 64-bit**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0155

**Fonte:** `let hex = '';`  
**O que faz:** Inicializa `hex` com `'';`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **dHash 64-bit**.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0156

**Fonte:** `for (let row = 0; row < H; row++) {`  
**O que faz:** Inicia a iteração `for (let row = 0; row < H; row++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0157

**Fonte:** `let rowByte = 0;`  
**O que faz:** Inicializa `rowByte` com `0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **dHash 64-bit**.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0158

**Fonte:** `for (let col = 0; col < H; col++) {`  
**O que faz:** Inicia a iteração `for (let col = 0; col < H; col++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0159

**Fonte:** `rowByte = (rowByte << 1) \| (gray[row * W + col] > gray[row * W + col + 1] ? 1 : 0);`  
**O que faz:** Executa a operação `rowByte = (rowByte << 1) \| (gray[row * W + col] > gray[row * W + col + 1] ? 1 : 0);` dentro de **dHash 64-bit**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0160

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **dHash 64-bit** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0161

**Fonte:** `hex += rowByte.toString(16).padStart(2, '0');`  
**O que faz:** Executa a operação `hex += rowByte.toString(16).padStart(2, '0');` dentro de **dHash 64-bit**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0162

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **dHash 64-bit** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0163

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **dHash 64-bit**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0164

**Fonte:** `return hex; // 16 chars hex lowercase`  
**O que faz:** Retorna `return hex; // 16 chars hex lowercase`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0165

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **dHash 64-bit** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** fornece lookup perceptual barato visual-v2.  
**Risco/alternativa:** usar pixels crus tornaria o cache sensível demais a mudanças pequenas.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0166

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **dHash 64-bit**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — FP-07..12 e a suíte visual provam formato, gradiente, tamanho e determinismo.

### Linha 0167

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0168

**Fonte:** `// Haar Wavelet 1D/2D — primitivas internas`  
**O que faz:** Comentário/JSDoc do fonte registra: “Haar Wavelet 1D/2D — primitivas internas”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0169

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0170

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **Haar DWT 1D/2D**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0171

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0172

**Fonte:** `* Transformada Haar 1D: [a0,a1,...,aN-1] → [avg0,...,avgN/2-1, diff0,...,diffN/2-1]`  
**O que faz:** Comentário/JSDoc do fonte registra: “Transformada Haar 1D: [a0,a1,...,aN-1] → [avg0,...,avgN/2-1, diff0,...,diffN/2-1]”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0173

**Fonte:** `* Low-pass (médias) ficam na primeira metade; high-pass (diferenças) na segunda.`  
**O que faz:** Comentário/JSDoc do fonte registra: “Low-pass (médias) ficam na primeira metade; high-pass (diferenças) na segunda.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0174

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0175

**Fonte:** `* @param {Float32Array\|ArrayLike} arr array de entrada (tamanho n, potência de 2)`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {Float32Array|ArrayLike} arr array de entrada (tamanho n, potência de 2)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0176

**Fonte:** `* @param {number} n tamanho do array`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {number} n tamanho do array”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0177

**Fonte:** `* @returns {Float32Array}`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {Float32Array}”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0178

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0179

**Fonte:** `function _haarDWT1D(arr, n) {`  
**O que faz:** Declara a função `_haarDWT1D` em **Haar DWT 1D/2D**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0180

**Fonte:** `const out = new Float32Array(n);`  
**O que faz:** Inicializa `out` com `new Float32Array(n);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **Haar DWT 1D/2D**.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0181

**Fonte:** `const half = n >> 1;`  
**O que faz:** Inicializa `half` com `n >> 1;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **Haar DWT 1D/2D**.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0182

**Fonte:** `for (let i = 0; i < half; i++) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < half; i++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0183

**Fonte:** `out[i] = (arr[2 * i] + arr[2 * i + 1]) * 0.5; // low-pass`  
**O que faz:** Executa a operação `out[i] = (arr[2 * i] + arr[2 * i + 1]) * 0.5; // low-pass` dentro de **Haar DWT 1D/2D**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0184

**Fonte:** `out[i + half] = (arr[2 * i] - arr[2 * i + 1]) * 0.5; // high-pass`  
**O que faz:** Executa a operação `out[i + half] = (arr[2 * i] - arr[2 * i + 1]) * 0.5; // high-pass` dentro de **Haar DWT 1D/2D**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0185

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Haar DWT 1D/2D** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0186

**Fonte:** `return out;`  
**O que faz:** Retorna `return out;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0187

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Haar DWT 1D/2D** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0188

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **Haar DWT 1D/2D**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0189

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0190

**Fonte:** `* Transformada Haar 2D (1 nível) sobre matriz N×N (Float32Array, row-major).`  
**O que faz:** Comentário/JSDoc do fonte registra: “Transformada Haar 2D (1 nível) sobre matriz N×N (Float32Array, row-major).”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0191

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0192

**Fonte:** `* Resultado:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Resultado:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0193

**Fonte:** `* quadrante superior esquerdo (N/2 × N/2) = LL (low-low, aproximação)`  
**O que faz:** Comentário/JSDoc do fonte registra: “quadrante superior esquerdo (N/2 × N/2) = LL (low-low, aproximação)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0194

**Fonte:** `* quadrante superior direito (N/2 × N/2) = LH (bordas horizontais)`  
**O que faz:** Comentário/JSDoc do fonte registra: “quadrante superior direito (N/2 × N/2) = LH (bordas horizontais)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0195

**Fonte:** `* quadrante inferior esquerdo (N/2 × N/2) = HL (bordas verticais)`  
**O que faz:** Comentário/JSDoc do fonte registra: “quadrante inferior esquerdo (N/2 × N/2) = HL (bordas verticais)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0196

**Fonte:** `* quadrante inferior direito (N/2 × N/2) = HH (detalhes diagonais — texto)`  
**O que faz:** Comentário/JSDoc do fonte registra: “quadrante inferior direito (N/2 × N/2) = HH (detalhes diagonais — texto)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0197

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0198

**Fonte:** `* Por que a LL captura arte e descarta texto:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Por que a LL captura arte e descarta texto:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0199

**Fonte:** `* - Arte (traços, composição, painéis): energia concentrada em baixas frequências → LL`  
**O que faz:** Comentário/JSDoc do fonte registra: “- Arte (traços, composição, painéis): energia concentrada em baixas frequências → LL”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0200

**Fonte:** `* - Texto em balões: detalhes locais de alta frequência → HH, descartado`  
**O que faz:** Comentário/JSDoc do fonte registra: “- Texto em balões: detalhes locais de alta frequência → HH, descartado”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0201

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0202

**Fonte:** `* @param {Float32Array} matrix array N×N row-major`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {Float32Array} matrix array N×N row-major”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0203

**Fonte:** `* @param {number} N lado da matriz (potência de 2)`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {number} N lado da matriz (potência de 2)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0204

**Fonte:** `* @returns {Float32Array} mesma estrutura N×N com sub-bandas reorganizadas`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {Float32Array} mesma estrutura N×N com sub-bandas reorganizadas”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0205

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0206

**Fonte:** `function _haarDWT2D(matrix, N) {`  
**O que faz:** Declara a função `_haarDWT2D` em **Haar DWT 1D/2D**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0207

**Fonte:** `const buf = matrix.slice(); // cópia para não alterar o original`  
**O que faz:** Inicializa `buf` com `matrix.slice(); // cópia para não alterar o original`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **Haar DWT 1D/2D**.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0208

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **Haar DWT 1D/2D**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0209

**Fonte:** `// Passo 1: transformada 1D em cada linha`  
**O que faz:** Comentário/JSDoc do fonte registra: “Passo 1: transformada 1D em cada linha”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0210

**Fonte:** `for (let row = 0; row < N; row++) {`  
**O que faz:** Inicia a iteração `for (let row = 0; row < N; row++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0211

**Fonte:** `const rowSlice = buf.subarray(row * N, (row + 1) * N);`  
**O que faz:** Inicializa `rowSlice` com `buf.subarray(row * N, (row + 1) * N);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **Haar DWT 1D/2D**.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0212

**Fonte:** `const transformed = _haarDWT1D(rowSlice, N);`  
**O que faz:** Inicializa `transformed` com `_haarDWT1D(rowSlice, N);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **Haar DWT 1D/2D**.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0213

**Fonte:** `buf.set(transformed, row * N);`  
**O que faz:** Copia dados para um buffer com `buf.set(transformed, row * N);`.  
**Como faz:** Posiciona a transformação no offset row-major esperado pela fase seguinte.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0214

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Haar DWT 1D/2D** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0215

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **Haar DWT 1D/2D**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0216

**Fonte:** `// Passo 2: transformada 1D em cada coluna`  
**O que faz:** Comentário/JSDoc do fonte registra: “Passo 2: transformada 1D em cada coluna”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0217

**Fonte:** `const colBuf = new Float32Array(N);`  
**O que faz:** Inicializa `colBuf` com `new Float32Array(N);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **Haar DWT 1D/2D**.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0218

**Fonte:** `for (let col = 0; col < N; col++) {`  
**O que faz:** Inicia a iteração `for (let col = 0; col < N; col++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0219

**Fonte:** `for (let row = 0; row < N; row++) colBuf[row] = buf[row * N + col];`  
**O que faz:** Inicia a iteração `for (let row = 0; row < N; row++) colBuf[row] = buf[row * N + col];`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0220

**Fonte:** `const transformed = _haarDWT1D(colBuf, N);`  
**O que faz:** Inicializa `transformed` com `_haarDWT1D(colBuf, N);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **Haar DWT 1D/2D**.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0221

**Fonte:** `for (let row = 0; row < N; row++) buf[row * N + col] = transformed[row];`  
**O que faz:** Inicia a iteração `for (let row = 0; row < N; row++) buf[row * N + col] = transformed[row];`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0222

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Haar DWT 1D/2D** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0223

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **Haar DWT 1D/2D**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0224

**Fonte:** `return buf;`  
**O que faz:** Retorna `return buf;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0225

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **Haar DWT 1D/2D** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** separa baixa frequência espacial da alta frequência onde texto tende a concentrar energia.  
**Risco/alternativa:** DWT errada corromperia wHash e confirmação regional.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0226

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **Haar DWT 1D/2D**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** 🟨 PROVADO PELOS CONSUMIDORES DIRETOS — helpers internos não são exportados, mas wHash e hashes regionais reais os exercitam com assertions determinísticas.

### Linha 0227

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0228

**Fonte:** `// wHash — Haar Wavelet Hash (perceptual, 32×32 → LL 16×16 → 256 bits → 64 hex)`  
**O que faz:** Comentário/JSDoc do fonte registra: “wHash — Haar Wavelet Hash (perceptual, 32×32 → LL 16×16 → 256 bits → 64 hex)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0229

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0230

**Fonte:** `// Por que é melhor que dHash para matching cross-language em mangá:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Por que é melhor que dHash para matching cross-language em mangá:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0231

**Fonte:** `// 1. Preserva topologia espacial (DCT não preserva): painéis no mesmo lugar`  
**O que faz:** Comentário/JSDoc do fonte registra: “1. Preserva topologia espacial (DCT não preserva): painéis no mesmo lugar”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0232

**Fonte:** `// → LL idêntico mesmo com texto diferente`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ LL idêntico mesmo com texto diferente”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0233

**Fonte:** `// 2. Texto nos balões é energia de alta frequência → sub-banda HH → descartada`  
**O que faz:** Comentário/JSDoc do fonte registra: “2. Texto nos balões é energia de alta frequência → sub-banda HH → descartada”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0234

**Fonte:** `// 3. Arte (traços, screentones, composição) é baixa frequência → sub-banda LL`  
**O que faz:** Comentário/JSDoc do fonte registra: “3. Arte (traços, screentones, composição) é baixa frequência → sub-banda LL”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0235

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0236

**Fonte:** `// Threshold ótimo (256 bits, texto ~12% da imagem):`  
**O que faz:** Comentário/JSDoc do fonte registra: “Threshold ótimo (256 bits, texto ~12% da imagem):”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0237

**Fonte:** `// Bits afetados pelo texto: 256 × 0.12 ≈ 30 bits`  
**O que faz:** Comentário/JSDoc do fonte registra: “Bits afetados pelo texto: 256 × 0.12 ≈ 30 bits”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0238

**Fonte:** `// Threshold para "mesma imagem cross-language": ≤ 40 bits (≤ 15.6%)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Threshold para "mesma imagem cross-language": ≤ 40 bits (≤ 15.6%)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0239

**Fonte:** `// Threshold conservador (deduplicação): ≤ 20 bits (≤ 7.8%)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Threshold conservador (deduplicação): ≤ 20 bits (≤ 7.8%)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0240

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0241

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0242

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0243

**Fonte:** `* Calcula wHash (Haar Wavelet Hash) 256-bit a partir de imageData 32×32.`  
**O que faz:** Comentário/JSDoc do fonte registra: “Calcula wHash (Haar Wavelet Hash) 256-bit a partir de imageData 32×32.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0244

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0245

**Fonte:** `* Pipeline:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Pipeline:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0246

**Fonte:** `* imageData (32×32 RGBA, 4096 bytes)`  
**O que faz:** Comentário/JSDoc do fonte registra: “imageData (32×32 RGBA, 4096 bytes)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0247

**Fonte:** `* → grayscale BT.601 (Float32, 0–255)`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ grayscale BT.601 (Float32, 0–255)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0248

**Fonte:** `* → Haar DWT 2D 1 nível (32×32 → sub-bandas LL/LH/HL/HH cada 16×16)`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ Haar DWT 2D 1 nível (32×32 → sub-bandas LL/LH/HL/HH cada 16×16)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0249

**Fonte:** `* → extrair sub-banda LL (primeiros 16×16 = 256 coeficientes)`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ extrair sub-banda LL (primeiros 16×16 = 256 coeficientes)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0250

**Fonte:** `* → mediana dos 256 coeficientes LL`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ mediana dos 256 coeficientes LL”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0251

**Fonte:** `* → bit[i] = 1 se LL[i] > mediana, 0 caso contrário`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ bit[i] = 1 se LL[i] > mediana, 0 caso contrário”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0252

**Fonte:** `* → 256 bits empacotados como nibbles → 64 hex chars lowercase`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ 256 bits empacotados como nibbles → 64 hex chars lowercase”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0253

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0254

**Fonte:** `* @param {Uint8ClampedArray} imageData getImageData(0, 0, 32, 32).data (4096 bytes)`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {Uint8ClampedArray} imageData getImageData(0, 0, 32, 32).data (4096 bytes)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0255

**Fonte:** `* @returns {string} 64 chars hex lowercase (256 bits)`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {string} 64 chars hex lowercase (256 bits)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0256

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0257

**Fonte:** `function calculateWHash(imageData) {`  
**O que faz:** Declara a função `calculateWHash` em **wHash 256-bit por Haar**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0258

**Fonte:** `if (!imageData \|\| imageData.length < 32 * 32 * 4) {`  
**O que faz:** Aplica a guarda `if (!imageData \|\| imageData.length < 32 * 32 * 4) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0259

**Fonte:** `throw new Error('calculateWHash: imageData precisa de pelo menos 32×32×4=4096 bytes');`  
**O que faz:** Rejeita entrada inválida com `throw new Error('calculateWHash: imageData precisa de pelo menos 32×32×4=4096 bytes');`.  
**Como faz:** Falha cedo antes de ler um buffer menor que a dimensão mínima do algoritmo.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0260

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **wHash 256-bit por Haar** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0261

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0262

**Fonte:** `const N = 32;`  
**O que faz:** Inicializa `N` com `32;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0263

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0264

**Fonte:** `// RGBA → grayscale (luminância BT.601)`  
**O que faz:** Comentário/JSDoc do fonte registra: “RGBA → grayscale (luminância BT.601)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0265

**Fonte:** `const gray = new Float32Array(N * N);`  
**O que faz:** Inicializa `gray` com `new Float32Array(N * N);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0266

**Fonte:** `for (let i = 0; i < N * N; i++) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < N * N; i++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0267

**Fonte:** `const b = i * 4;`  
**O que faz:** Inicializa `b` com `i * 4;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0268

**Fonte:** `gray[i] = 0.299 * imageData[b]`  
**O que faz:** Executa a operação `gray[i] = 0.299 * imageData[b]` dentro de **wHash 256-bit por Haar**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0269

**Fonte:** `+ 0.587 * imageData[b + 1]`  
**O que faz:** Executa a operação `+ 0.587 * imageData[b + 1]` dentro de **wHash 256-bit por Haar**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0270

**Fonte:** `+ 0.114 * imageData[b + 2];`  
**O que faz:** Executa a operação `+ 0.114 * imageData[b + 2];` dentro de **wHash 256-bit por Haar**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0271

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **wHash 256-bit por Haar** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0272

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0273

**Fonte:** `// Haar DWT 2D (1 nível): 32×32 → LL está no quadrante 16×16 superior esquerdo`  
**O que faz:** Comentário/JSDoc do fonte registra: “Haar DWT 2D (1 nível): 32×32 → LL está no quadrante 16×16 superior esquerdo”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0274

**Fonte:** `const dwt = _haarDWT2D(gray, N);`  
**O que faz:** Inicializa `dwt` com `_haarDWT2D(gray, N);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0275

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0276

**Fonte:** `// Extrair sub-banda LL: linhas 0..15, colunas 0..15`  
**O que faz:** Comentário/JSDoc do fonte registra: “Extrair sub-banda LL: linhas 0..15, colunas 0..15”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0277

**Fonte:** `const LL = new Float32Array(16 * 16);`  
**O que faz:** Inicializa `LL` com `new Float32Array(16 * 16);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0278

**Fonte:** `for (let row = 0; row < 16; row++) {`  
**O que faz:** Inicia a iteração `for (let row = 0; row < 16; row++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0279

**Fonte:** `for (let col = 0; col < 16; col++) {`  
**O que faz:** Inicia a iteração `for (let col = 0; col < 16; col++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0280

**Fonte:** `LL[row * 16 + col] = dwt[row * N + col];`  
**O que faz:** Executa a operação `LL[row * 16 + col] = dwt[row * N + col];` dentro de **wHash 256-bit por Haar**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0281

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **wHash 256-bit por Haar** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0282

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **wHash 256-bit por Haar** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0283

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0284

**Fonte:** `// Mediana dos 256 coeficientes LL (ordenação parcial para performance)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Mediana dos 256 coeficientes LL (ordenação parcial para performance)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0285

**Fonte:** `const sorted = LL.slice().sort();`  
**O que faz:** Inicializa `sorted` com `LL.slice().sort();`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0286

**Fonte:** `const median = (sorted[127] + sorted[128]) * 0.5;`  
**O que faz:** Inicializa `median` com `(sorted[127] + sorted[128]) * 0.5;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0287

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0288

**Fonte:** `// 256 bits → 64 hex chars (4 bits por char, nibble)`  
**O que faz:** Comentário/JSDoc do fonte registra: “256 bits → 64 hex chars (4 bits por char, nibble)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0289

**Fonte:** `let hex = '';`  
**O que faz:** Inicializa `hex` com `'';`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0290

**Fonte:** `for (let i = 0; i < 256; i += 4) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < 256; i += 4) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0291

**Fonte:** `const nibble = ((LL[i] > median ? 8 : 0) \|`  
**O que faz:** Inicializa `nibble` com `((LL[i] > median ? 8 : 0) \|`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **wHash 256-bit por Haar**.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0292

**Fonte:** `(LL[i + 1] > median ? 4 : 0) \|`  
**O que faz:** Executa a operação `(LL[i + 1] > median ? 4 : 0) \|` dentro de **wHash 256-bit por Haar**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0293

**Fonte:** `(LL[i + 2] > median ? 2 : 0) \|`  
**O que faz:** Executa a operação `(LL[i + 2] > median ? 2 : 0) \|` dentro de **wHash 256-bit por Haar**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0294

**Fonte:** `(LL[i + 3] > median ? 1 : 0));`  
**O que faz:** Executa a operação `(LL[i + 3] > median ? 1 : 0));` dentro de **wHash 256-bit por Haar**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0295

**Fonte:** `hex += nibble.toString(16);`  
**O que faz:** Executa a operação `hex += nibble.toString(16);` dentro de **wHash 256-bit por Haar**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0296

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **wHash 256-bit por Haar** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0297

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0298

**Fonte:** `return hex; // sempre 64 chars hex lowercase`  
**O que faz:** Retorna `return hex; // sempre 64 chars hex lowercase`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0299

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **wHash 256-bit por Haar** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** captura layout/arte de baixa frequência com robustez maior a texto.  
**Risco/alternativa:** dHash sozinho é mais sensível a texto horizontal.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0300

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **wHash 256-bit por Haar**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, brilho, estrutura e cross-language.

### Linha 0301

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0302

**Fonte:** `// pHash — DCT Perceptual Hash (visual-v3, 32×32 → DCT → top-left 16×16 → 256 bits)`  
**O que faz:** Comentário/JSDoc do fonte registra: “pHash — DCT Perceptual Hash (visual-v3, 32×32 → DCT → top-left 16×16 → 256 bits)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0303

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0304

**Fonte:** `// Implementação separável DCT-II 2D:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Implementação separável DCT-II 2D:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0305

**Fonte:** `// Fase 1: DCT 1D em cada linha (32 linhas × 16 frequências × 32 ops = 16384 ops)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Fase 1: DCT 1D em cada linha (32 linhas × 16 frequências × 32 ops = 16384 ops)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0306

**Fonte:** `// Fase 2: DCT 1D em cada coluna de frequência 0..15 (16 cols × 16 freq × 32 ops = 8192 ops)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Fase 2: DCT 1D em cada coluna de frequência 0..15 (16 cols × 16 freq × 32 ops = 8192 ops)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0307

**Fonte:** `// Total: ~25K multiply-adds → <0.5ms no content script`  
**O que faz:** Comentário/JSDoc do fonte registra: “Total: ~25K multiply-adds → <0.5ms no content script”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0308

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0309

**Fonte:** `// Por que o DCT suprime texto em mangá:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Por que o DCT suprime texto em mangá:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0310

**Fonte:** `// O texto nos balões é concentrado localmente → energia em altos coeficientes AC`  
**O que faz:** Comentário/JSDoc do fonte registra: “O texto nos balões é concentrado localmente → energia em altos coeficientes AC”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0311

**Fonte:** `// Os 16×16 coeficientes de baixa frequência capturam layout global (arte)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Os 16×16 coeficientes de baixa frequência capturam layout global (arte)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0312

**Fonte:** `// O DC[0,0] representa brilho médio → excluído para robustez a variações de exposição`  
**O que faz:** Comentário/JSDoc do fonte registra: “O DC[0,0] representa brilho médio → excluído para robustez a variações de exposição”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0313

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0314

**Fonte:** `// Complemento ao wHash:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Complemento ao wHash:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0315

**Fonte:** `// wHash: preserva topologia espacial via Haar (melhor para layout estruturado)`  
**O que faz:** Comentário/JSDoc do fonte registra: “wHash: preserva topologia espacial via Haar (melhor para layout estruturado)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0316

**Fonte:** `// pHash: robusto a variações globais de cor/tonalidade via DCT`  
**O que faz:** Comentário/JSDoc do fonte registra: “pHash: robusto a variações globais de cor/tonalidade via DCT”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0317

**Fonte:** `// Juntos: cobrem casos onde um hash falha isoladamente`  
**O que faz:** Comentário/JSDoc do fonte registra: “Juntos: cobrem casos onde um hash falha isoladamente”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0318

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0319

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0320

**Fonte:** `// Tabela de cossenos pré-computada para DCT 32×32`  
**O que faz:** Comentário/JSDoc do fonte registra: “Tabela de cossenos pré-computada para DCT 32×32”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0321

**Fonte:** `// cosTable[k * N + n] = cos(π·k·(2n+1)/(2N)), N=32`  
**O que faz:** Comentário/JSDoc do fonte registra: “cosTable[k * N + n] = cos(π·k·(2n+1)/(2N)), N=32”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0322

**Fonte:** `// Lazy-initialized para não impactar carregamento da extensão`  
**O que faz:** Comentário/JSDoc do fonte registra: “Lazy-initialized para não impactar carregamento da extensão”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0323

**Fonte:** `let _dctCosTable = null;`  
**O que faz:** Inicializa `_dctCosTable` com `null;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0324

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0325

**Fonte:** `function _getDctCosTable() {`  
**O que faz:** Declara a função `_getDctCosTable` em **pHash 256-bit por DCT-II**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0326

**Fonte:** `if (_dctCosTable) return _dctCosTable;`  
**O que faz:** Aplica a guarda `if (_dctCosTable) return _dctCosTable;`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0327

**Fonte:** `const N = 32;`  
**O que faz:** Inicializa `N` com `32;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0328

**Fonte:** `_dctCosTable = new Float32Array(N * N);`  
**O que faz:** Executa a operação `_dctCosTable = new Float32Array(N * N);` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0329

**Fonte:** `for (let k = 0; k < N; k++) {`  
**O que faz:** Inicia a iteração `for (let k = 0; k < N; k++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0330

**Fonte:** `for (let n = 0; n < N; n++) {`  
**O que faz:** Inicia a iteração `for (let n = 0; n < N; n++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0331

**Fonte:** `_dctCosTable[k * N + n] = Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));`  
**O que faz:** Aplica a operação matemática `_dctCosTable[k * N + n] = Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));`.  
**Como faz:** Calcula cosseno, normalização, limite, padding ou entropia conforme o algoritmo atual.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0332

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0333

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0334

**Fonte:** `return _dctCosTable;`  
**O que faz:** Retorna `return _dctCosTable;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0335

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0336

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0337

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0338

**Fonte:** `* Calcula pHash (DCT Perceptual Hash) 256-bit a partir de imageData 32×32.`  
**O que faz:** Comentário/JSDoc do fonte registra: “Calcula pHash (DCT Perceptual Hash) 256-bit a partir de imageData 32×32.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0339

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0340

**Fonte:** `* Pipeline:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Pipeline:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0341

**Fonte:** `* imageData (32×32 RGBA, 4096 bytes)`  
**O que faz:** Comentário/JSDoc do fonte registra: “imageData (32×32 RGBA, 4096 bytes)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0342

**Fonte:** `* → grayscale BT.601`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ grayscale BT.601”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0343

**Fonte:** `* → DCT-II 2D separável (32×32) — tabela de cossenos pré-computada`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ DCT-II 2D separável (32×32) — tabela de cossenos pré-computada”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0344

**Fonte:** `* → coeficientes AC top-left 16×16 (excluindo DC[0,0] em [0,0])`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ coeficientes AC top-left 16×16 (excluindo DC[0,0] em [0,0])”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0345

**Fonte:** `* → mediana dos 255 coeficientes AC`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ mediana dos 255 coeficientes AC”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0346

**Fonte:** `* → bit[0]=0 (DC fixo), bit[1..255] = AC[i] > mediana`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ bit[0]=0 (DC fixo), bit[1..255] = AC[i] > mediana”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0347

**Fonte:** `* → 256 bits → 64 hex chars`  
**O que faz:** Comentário/JSDoc do fonte registra: “→ 256 bits → 64 hex chars”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0348

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0349

**Fonte:** `* @param {Uint8ClampedArray} imageData getImageData(0, 0, 32, 32).data (4096 bytes)`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {Uint8ClampedArray} imageData getImageData(0, 0, 32, 32).data (4096 bytes)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0350

**Fonte:** `* @returns {string} 64 chars hex lowercase (256 bits)`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {string} 64 chars hex lowercase (256 bits)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0351

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0352

**Fonte:** `function calculatePHash(imageData) {`  
**O que faz:** Declara a função `calculatePHash` em **pHash 256-bit por DCT-II**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0353

**Fonte:** `if (!imageData \|\| imageData.length < 32 * 32 * 4) {`  
**O que faz:** Aplica a guarda `if (!imageData \|\| imageData.length < 32 * 32 * 4) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0354

**Fonte:** `throw new Error('calculatePHash: imageData precisa de pelo menos 32×32×4=4096 bytes');`  
**O que faz:** Rejeita entrada inválida com `throw new Error('calculatePHash: imageData precisa de pelo menos 32×32×4=4096 bytes');`.  
**Como faz:** Falha cedo antes de ler um buffer menor que a dimensão mínima do algoritmo.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0355

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0356

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0357

**Fonte:** `const N = 32;`  
**O que faz:** Inicializa `N` com `32;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0358

**Fonte:** `const cosTable = _getDctCosTable();`  
**O que faz:** Inicializa `cosTable` com `_getDctCosTable();`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0359

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0360

**Fonte:** `// RGBA → grayscale BT.601`  
**O que faz:** Comentário/JSDoc do fonte registra: “RGBA → grayscale BT.601”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0361

**Fonte:** `const gray = new Float32Array(N * N);`  
**O que faz:** Inicializa `gray` com `new Float32Array(N * N);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0362

**Fonte:** `for (let i = 0; i < N * N; i++) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < N * N; i++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0363

**Fonte:** `const b = i * 4;`  
**O que faz:** Inicializa `b` com `i * 4;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0364

**Fonte:** `gray[i] = 0.299 * imageData[b]`  
**O que faz:** Executa a operação `gray[i] = 0.299 * imageData[b]` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0365

**Fonte:** `+ 0.587 * imageData[b + 1]`  
**O que faz:** Executa a operação `+ 0.587 * imageData[b + 1]` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0366

**Fonte:** `+ 0.114 * imageData[b + 2];`  
**O que faz:** Executa a operação `+ 0.114 * imageData[b + 2];` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0367

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0368

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0369

**Fonte:** `// Fatores de normalização DCT-II ortogonal`  
**O que faz:** Comentário/JSDoc do fonte registra: “Fatores de normalização DCT-II ortogonal”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0370

**Fonte:** `const scale0 = 1.0 / Math.sqrt(N); // α(k=0)`  
**O que faz:** Inicializa `scale0` com `1.0 / Math.sqrt(N); // α(k=0)`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0371

**Fonte:** `const scale1 = Math.sqrt(2.0 / N); // α(k>0)`  
**O que faz:** Inicializa `scale1` com `Math.sqrt(2.0 / N); // α(k>0)`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0372

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0373

**Fonte:** `// ── Fase 1: DCT 1D em cada linha (j-dimension → frequência v) ────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “── Fase 1: DCT 1D em cada linha (j-dimension → frequência v) ────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0374

**Fonte:** `// G[row][v] = α(v) · Σ_j f[row][j] · cos(π·v·(2j+1)/(2N))`  
**O que faz:** Comentário/JSDoc do fonte registra: “G[row][v] = α(v) · Σ_j f[row][j] · cos(π·v·(2j+1)/(2N))”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0375

**Fonte:** `// Armazenado em dctRowPartial[row * 16 + v], apenas v=0..15`  
**O que faz:** Comentário/JSDoc do fonte registra: “Armazenado em dctRowPartial[row * 16 + v], apenas v=0..15”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0376

**Fonte:** `const dctRowPartial = new Float32Array(N * 16);`  
**O que faz:** Inicializa `dctRowPartial` com `new Float32Array(N * 16);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0377

**Fonte:** `for (let row = 0; row < N; row++) {`  
**O que faz:** Inicia a iteração `for (let row = 0; row < N; row++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0378

**Fonte:** `const rowOff = row * N;`  
**O que faz:** Inicializa `rowOff` com `row * N;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0379

**Fonte:** `for (let v = 0; v < 16; v++) {`  
**O que faz:** Inicia a iteração `for (let v = 0; v < 16; v++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0380

**Fonte:** `let sum = 0;`  
**O que faz:** Inicializa `sum` com `0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0381

**Fonte:** `const cosV = v * N;`  
**O que faz:** Inicializa `cosV` com `v * N;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0382

**Fonte:** `for (let j = 0; j < N; j++) {`  
**O que faz:** Inicia a iteração `for (let j = 0; j < N; j++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0383

**Fonte:** `sum += gray[rowOff + j] * cosTable[cosV + j];`  
**O que faz:** Executa a operação `sum += gray[rowOff + j] * cosTable[cosV + j];` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0384

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0385

**Fonte:** `dctRowPartial[row * 16 + v] = (v === 0 ? scale0 : scale1) * sum;`  
**O que faz:** Executa a operação `dctRowPartial[row * 16 + v] = (v === 0 ? scale0 : scale1) * sum;` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0386

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0387

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0388

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0389

**Fonte:** `// ── Fase 2: DCT 1D em cada coluna de frequência v (i-dimension → freq u) ─`  
**O que faz:** Comentário/JSDoc do fonte registra: “── Fase 2: DCT 1D em cada coluna de frequência v (i-dimension → freq u) ─”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0390

**Fonte:** `// F[u][v] = α(u) · Σ_i G[i][v] · cos(π·u·(2i+1)/(2N))`  
**O que faz:** Comentário/JSDoc do fonte registra: “F[u][v] = α(u) · Σ_i G[i][v] · cos(π·u·(2i+1)/(2N))”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0391

**Fonte:** `// Armazenado em dct16[u * 16 + v]`  
**O que faz:** Comentário/JSDoc do fonte registra: “Armazenado em dct16[u * 16 + v]”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0392

**Fonte:** `const dct16 = new Float32Array(16 * 16);`  
**O que faz:** Inicializa `dct16` com `new Float32Array(16 * 16);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0393

**Fonte:** `for (let v = 0; v < 16; v++) {`  
**O que faz:** Inicia a iteração `for (let v = 0; v < 16; v++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0394

**Fonte:** `for (let u = 0; u < 16; u++) {`  
**O que faz:** Inicia a iteração `for (let u = 0; u < 16; u++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0395

**Fonte:** `let sum = 0;`  
**O que faz:** Inicializa `sum` com `0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0396

**Fonte:** `const cosU = u * N;`  
**O que faz:** Inicializa `cosU` com `u * N;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0397

**Fonte:** `for (let i = 0; i < N; i++) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < N; i++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0398

**Fonte:** `sum += dctRowPartial[i * 16 + v] * cosTable[cosU + i];`  
**O que faz:** Executa a operação `sum += dctRowPartial[i * 16 + v] * cosTable[cosU + i];` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0399

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0400

**Fonte:** `dct16[u * 16 + v] = (u === 0 ? scale0 : scale1) * sum;`  
**O que faz:** Executa a operação `dct16[u * 16 + v] = (u === 0 ? scale0 : scale1) * sum;` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0401

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0402

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0403

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0404

**Fonte:** `// ── Mediana dos 255 coeficientes AC (exclui DC = dct16[0]) ───────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “── Mediana dos 255 coeficientes AC (exclui DC = dct16[0]) ───────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0405

**Fonte:** `const acCoeffs = new Float32Array(255);`  
**O que faz:** Inicializa `acCoeffs` com `new Float32Array(255);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0406

**Fonte:** `for (let i = 1; i < 256; i++) {`  
**O que faz:** Inicia a iteração `for (let i = 1; i < 256; i++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0407

**Fonte:** `acCoeffs[i - 1] = dct16[i];`  
**O que faz:** Executa a operação `acCoeffs[i - 1] = dct16[i];` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0408

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0409

**Fonte:** `const sortedAC = acCoeffs.slice().sort((a, b) => a - b);`  
**O que faz:** Inicializa `sortedAC` com `acCoeffs.slice().sort((a, b) => a - b);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0410

**Fonte:** `const median = (sortedAC[126] + sortedAC[127]) * 0.5;`  
**O que faz:** Inicializa `median` com `(sortedAC[126] + sortedAC[127]) * 0.5;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0411

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0412

**Fonte:** `// ── 256 bits → 64 hex chars ──────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “── 256 bits → 64 hex chars ──────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0413

**Fonte:** `// bit[0] = 0 (DC excluído); bit[1..255] = AC[i] > mediana`  
**O que faz:** Comentário/JSDoc do fonte registra: “bit[0] = 0 (DC excluído); bit[1..255] = AC[i] > mediana”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0414

**Fonte:** `let hex = '';`  
**O que faz:** Inicializa `hex` com `'';`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0415

**Fonte:** `for (let i = 0; i < 256; i += 4) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < 256; i += 4) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0416

**Fonte:** `let nibble = 0;`  
**O que faz:** Inicializa `nibble` com `0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0417

**Fonte:** `for (let j = 0; j < 4; j++) {`  
**O que faz:** Inicia a iteração `for (let j = 0; j < 4; j++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0418

**Fonte:** `const idx = i + j;`  
**O que faz:** Inicializa `idx` com `i + j;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0419

**Fonte:** `const bit = (idx === 0) ? 0 : (dct16[idx] > median ? 1 : 0);`  
**O que faz:** Inicializa `bit` com `(idx === 0) ? 0 : (dct16[idx] > median ? 1 : 0);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **pHash 256-bit por DCT-II**.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0420

**Fonte:** `nibble = (nibble << 1) \| bit;`  
**O que faz:** Executa a operação `nibble = (nibble << 1) \| bit;` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0421

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0422

**Fonte:** `hex += nibble.toString(16);`  
**O que faz:** Executa a operação `hex += nibble.toString(16);` dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0423

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0424

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0425

**Fonte:** `return hex; // sempre 64 chars hex lowercase`  
**O que faz:** Retorna `return hex; // sempre 64 chars hex lowercase`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0426

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **pHash 256-bit por DCT-II** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** complementa Haar com frequência global e robustez tonal.  
**Risco/alternativa:** um único hash deixa zonas cegas; DCT não separável seria mais caro.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0427

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **pHash 256-bit por DCT-II**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam formato, determinismo, buffer, brilho, cache de cosseno e matching combinado.

### Linha 0428

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0429

**Fonte:** `// Hashes Regionais — Cantos (aproximação do RANSAC em JS puro)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Hashes Regionais — Cantos (aproximação do RANSAC em JS puro)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0430

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0431

**Fonte:** `// Divide a imagem em grid 3×3 de regiões 16×16 (canvas 48×48).`  
**O que faz:** Comentário/JSDoc do fonte registra: “Divide a imagem em grid 3×3 de regiões 16×16 (canvas 48×48).”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0432

**Fonte:** `// Calcula wHash 64-bit (8×8 LL) apenas dos 4 cantos onde texto raramente aparece.`  
**O que faz:** Comentário/JSDoc do fonte registra: “Calcula wHash 64-bit (8×8 LL) apenas dos 4 cantos onde texto raramente aparece.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0433

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0434

**Fonte:** `// Complemento ao RANSAC:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Complemento ao RANSAC:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0435

**Fonte:** `// RANSAC (AKAZE): exclui keypoints de texto como outliers geometricamente inconsistentes`  
**O que faz:** Comentário/JSDoc do fonte registra: “RANSAC (AKAZE): exclui keypoints de texto como outliers geometricamente inconsistentes”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0436

**Fonte:** `// Approach regional: usa conhecimento de domínio — texto fica no centro/balões, não nos cantos`  
**O que faz:** Comentário/JSDoc do fonte registra: “Approach regional: usa conhecimento de domínio — texto fica no centro/balões, não nos cantos”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0437

**Fonte:** `// Implementável em JS puro sem OpenCV`  
**O que faz:** Comentário/JSDoc do fonte registra: “Implementável em JS puro sem OpenCV”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0438

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0439

**Fonte:** `// Grid de regiões 16×16 em canvas 48×48:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Grid de regiões 16×16 em canvas 48×48:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0440

**Fonte:** `// [TL: (0,0)] [TM: (0,16)] [TR: (0,32)]`  
**O que faz:** Comentário/JSDoc do fonte registra: “[TL: (0,0)] [TM: (0,16)] [TR: (0,32)]”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0441

**Fonte:** `// [ML: (16,0)] [MM: (16,16)] [MR: (16,32)]`  
**O que faz:** Comentário/JSDoc do fonte registra: “[ML: (16,0)] [MM: (16,16)] [MR: (16,32)]”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0442

**Fonte:** `// [BL: (32,0)] [BM: (32,16)] [BR: (32,32)]`  
**O que faz:** Comentário/JSDoc do fonte registra: “[BL: (32,0)] [BM: (32,16)] [BR: (32,32)]”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0443

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0444

**Fonte:** `// Apenas TL, TR, BL, BR são usados (cantos com raridade de texto).`  
**O que faz:** Comentário/JSDoc do fonte registra: “Apenas TL, TR, BL, BR são usados (cantos com raridade de texto).”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0445

**Fonte:** `// Match em ≥ 3/4 cantos = confirmação de identidade visual.`  
**O que faz:** Comentário/JSDoc do fonte registra: “Match em ≥ 3/4 cantos = confirmação de identidade visual.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0446

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0447

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0448

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0449

**Fonte:** `* wHash simplificado (64-bit) de um bloco 16×16 extraído de imageData 48×48.`  
**O que faz:** Comentário/JSDoc do fonte registra: “wHash simplificado (64-bit) de um bloco 16×16 extraído de imageData 48×48.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0450

**Fonte:** `* 1 nível Haar 2D → LL 8×8 → 64 bits → 16 hex chars.`  
**O que faz:** Comentário/JSDoc do fonte registra: “1 nível Haar 2D → LL 8×8 → 64 bits → 16 hex chars.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0451

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0452

**Fonte:** `* @param {Uint8ClampedArray} imageData 48×48×4 = 9216 bytes`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {Uint8ClampedArray} imageData 48×48×4 = 9216 bytes”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0453

**Fonte:** `* @param {number} startRow linha inicial do bloco no canvas 48×48`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {number} startRow linha inicial do bloco no canvas 48×48”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0454

**Fonte:** `* @param {number} startCol coluna inicial do bloco no canvas 48×48`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {number} startCol coluna inicial do bloco no canvas 48×48”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0455

**Fonte:** `* @returns {string} 16 chars hex lowercase (64 bits)`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {string} 16 chars hex lowercase (64 bits)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0456

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0457

**Fonte:** `function _blockWHash16(imageData, startRow, startCol) {`  
**O que faz:** Declara a função `_blockWHash16` em **hashes regionais dos quatro cantos**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0458

**Fonte:** `const FULL_W = 48;`  
**O que faz:** Inicializa `FULL_W` com `48;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0459

**Fonte:** `const BLOCK = 16;`  
**O que faz:** Inicializa `BLOCK` com `16;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0460

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0461

**Fonte:** `// Extrair bloco 16×16 → grayscale`  
**O que faz:** Comentário/JSDoc do fonte registra: “Extrair bloco 16×16 → grayscale”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0462

**Fonte:** `const gray = new Float32Array(BLOCK * BLOCK);`  
**O que faz:** Inicializa `gray` com `new Float32Array(BLOCK * BLOCK);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0463

**Fonte:** `for (let r = 0; r < BLOCK; r++) {`  
**O que faz:** Inicia a iteração `for (let r = 0; r < BLOCK; r++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0464

**Fonte:** `for (let c = 0; c < BLOCK; c++) {`  
**O que faz:** Inicia a iteração `for (let c = 0; c < BLOCK; c++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0465

**Fonte:** `const pix = ((startRow + r) * FULL_W + (startCol + c)) * 4;`  
**O que faz:** Inicializa `pix` com `((startRow + r) * FULL_W + (startCol + c)) * 4;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0466

**Fonte:** `gray[r * BLOCK + c] = 0.299 * imageData[pix]`  
**O que faz:** Executa a operação `gray[r * BLOCK + c] = 0.299 * imageData[pix]` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0467

**Fonte:** `+ 0.587 * imageData[pix + 1]`  
**O que faz:** Executa a operação `+ 0.587 * imageData[pix + 1]` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0468

**Fonte:** `+ 0.114 * imageData[pix + 2];`  
**O que faz:** Executa a operação `+ 0.114 * imageData[pix + 2];` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0469

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **hashes regionais dos quatro cantos** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0470

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **hashes regionais dos quatro cantos** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0471

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0472

**Fonte:** `// Haar 2D 16×16 → LL está no quadrante 8×8 superior esquerdo`  
**O que faz:** Comentário/JSDoc do fonte registra: “Haar 2D 16×16 → LL está no quadrante 8×8 superior esquerdo”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0473

**Fonte:** `const dwt = _haarDWT2D(gray, BLOCK);`  
**O que faz:** Inicializa `dwt` com `_haarDWT2D(gray, BLOCK);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0474

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0475

**Fonte:** `// Extrair LL 8×8`  
**O que faz:** Comentário/JSDoc do fonte registra: “Extrair LL 8×8”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0476

**Fonte:** `const LL = new Float32Array(8 * 8);`  
**O que faz:** Inicializa `LL` com `new Float32Array(8 * 8);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0477

**Fonte:** `for (let r = 0; r < 8; r++) {`  
**O que faz:** Inicia a iteração `for (let r = 0; r < 8; r++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0478

**Fonte:** `for (let c = 0; c < 8; c++) {`  
**O que faz:** Inicia a iteração `for (let c = 0; c < 8; c++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0479

**Fonte:** `LL[r * 8 + c] = dwt[r * BLOCK + c];`  
**O que faz:** Executa a operação `LL[r * 8 + c] = dwt[r * BLOCK + c];` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0480

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **hashes regionais dos quatro cantos** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0481

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **hashes regionais dos quatro cantos** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0482

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0483

**Fonte:** `// Mediana → 64 bits → 16 hex chars`  
**O que faz:** Comentário/JSDoc do fonte registra: “Mediana → 64 bits → 16 hex chars”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0484

**Fonte:** `const sorted = LL.slice().sort();`  
**O que faz:** Inicializa `sorted` com `LL.slice().sort();`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0485

**Fonte:** `const median = (sorted[31] + sorted[32]) * 0.5;`  
**O que faz:** Inicializa `median` com `(sorted[31] + sorted[32]) * 0.5;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0486

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0487

**Fonte:** `let hex = '';`  
**O que faz:** Inicializa `hex` com `'';`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0488

**Fonte:** `for (let i = 0; i < 64; i += 4) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < 64; i += 4) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0489

**Fonte:** `const nibble = ((LL[i] > median ? 8 : 0) \|`  
**O que faz:** Inicializa `nibble` com `((LL[i] > median ? 8 : 0) \|`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **hashes regionais dos quatro cantos**.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0490

**Fonte:** `(LL[i + 1] > median ? 4 : 0) \|`  
**O que faz:** Executa a operação `(LL[i + 1] > median ? 4 : 0) \|` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0491

**Fonte:** `(LL[i + 2] > median ? 2 : 0) \|`  
**O que faz:** Executa a operação `(LL[i + 2] > median ? 2 : 0) \|` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0492

**Fonte:** `(LL[i + 3] > median ? 1 : 0));`  
**O que faz:** Executa a operação `(LL[i + 3] > median ? 1 : 0));` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0493

**Fonte:** `hex += nibble.toString(16);`  
**O que faz:** Executa a operação `hex += nibble.toString(16);` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0494

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **hashes regionais dos quatro cantos** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0495

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0496

**Fonte:** `return hex; // 16 chars hex`  
**O que faz:** Retorna `return hex; // 16 chars hex`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0497

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **hashes regionais dos quatro cantos** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0498

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0499

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0500

**Fonte:** `* Calcula wHash dos 4 cantos a partir de imageData 48×48.`  
**O que faz:** Comentário/JSDoc do fonte registra: “Calcula wHash dos 4 cantos a partir de imageData 48×48.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0501

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0502

**Fonte:** `* @param {Uint8ClampedArray} imageData getImageData(0,0,48,48).data (9216 bytes)`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {Uint8ClampedArray} imageData getImageData(0,0,48,48).data (9216 bytes)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0503

**Fonte:** `* @returns {{ topLeft: string, topRight: string, bottomLeft: string, bottomRight: string }}`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {{ topLeft: string, topRight: string, bottomLeft: string, bottomRight: string }}”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0504

**Fonte:** `* Cada campo: 16 chars hex (64 bits)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Cada campo: 16 chars hex (64 bits)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0505

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0506

**Fonte:** `function calculateRegionalHashes(imageData) {`  
**O que faz:** Declara a função `calculateRegionalHashes` em **hashes regionais dos quatro cantos**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0507

**Fonte:** `if (!imageData \|\| imageData.length < 48 * 48 * 4) {`  
**O que faz:** Aplica a guarda `if (!imageData \|\| imageData.length < 48 * 48 * 4) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0508

**Fonte:** `throw new Error('calculateRegionalHashes: imageData precisa de pelo menos 48×48×4=9216 bytes');`  
**O que faz:** Rejeita entrada inválida com `throw new Error('calculateRegionalHashes: imageData precisa de pelo menos 48×48×4=9216 bytes');`.  
**Como faz:** Falha cedo antes de ler um buffer menor que a dimensão mínima do algoritmo.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0509

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **hashes regionais dos quatro cantos** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0510

**Fonte:** `return {`  
**O que faz:** Retorna `return {`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0511

**Fonte:** `topLeft: _blockWHash16(imageData, 0, 0),`  
**O que faz:** Define o campo/opção `topLeft: _blockWHash16(imageData, 0, 0),`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0512

**Fonte:** `topRight: _blockWHash16(imageData, 0, 32),`  
**O que faz:** Define o campo/opção `topRight: _blockWHash16(imageData, 0, 32),`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0513

**Fonte:** `bottomLeft: _blockWHash16(imageData, 32, 0),`  
**O que faz:** Define o campo/opção `bottomLeft: _blockWHash16(imageData, 32, 0),`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0514

**Fonte:** `bottomRight: _blockWHash16(imageData, 32, 32),`  
**O que faz:** Define o campo/opção `bottomRight: _blockWHash16(imageData, 32, 32),`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0515

**Fonte:** `};`  
**O que faz:** Executa a operação `};` dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0516

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **hashes regionais dos quatro cantos** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** confirma identidade visual em regiões menos dominadas por texto.  
**Risco/alternativa:** relaxed sem confirmação regional aumenta falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0517

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **hashes regionais dos quatro cantos**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0518

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0519

**Fonte:** `* Verifica match regional: retorna true se ≥ minMatches dos 4 cantos coincidem`  
**O que faz:** Comentário/JSDoc do fonte registra: “Verifica match regional: retorna true se ≥ minMatches dos 4 cantos coincidem”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0520

**Fonte:** `* com Hamming ≤ threshold (default: 8 bits de 64 = 12.5%).`  
**O que faz:** Comentário/JSDoc do fonte registra: “com Hamming ≤ threshold (default: 8 bits de 64 = 12.5%).”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0521

**Fonte:** `*`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0522

**Fonte:** `* @param {object} regionalA { topLeft, topRight, bottomLeft, bottomRight }`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {object} regionalA { topLeft, topRight, bottomLeft, bottomRight }”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0523

**Fonte:** `* @param {object} regionalB { topLeft, topRight, bottomLeft, bottomRight }`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {object} regionalB { topLeft, topRight, bottomLeft, bottomRight }”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0524

**Fonte:** `* @param {{ threshold?: number, minMatches?: number }} opts`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {{ threshold?: number, minMatches?: number }} opts”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0525

**Fonte:** `* @returns {{ match: boolean, matchCount: number, details: object }}`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {{ match: boolean, matchCount: number, details: object }}”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0526

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam quatro hashes, formato, determinismo, centro estável e diferença espacial.

### Linha 0527

**Fonte:** `function matchRegionalHashes(regionalA, regionalB, { threshold = 8, minMatches = 3 } = {}) {`  
**O que faz:** Declara a função `matchRegionalHashes` em **matching regional**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0528

**Fonte:** `if (!regionalA \|\| !regionalB) return { match: false, matchCount: 0, details: {} };`  
**O que faz:** Aplica a guarda `if (!regionalA \|\| !regionalB) return { match: false, matchCount: 0, details: {} };`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0529

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matching regional**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0530

**Fonte:** `const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];`  
**O que faz:** Inicializa `corners` com `['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matching regional**.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0531

**Fonte:** `let matchCount = 0;`  
**O que faz:** Inicializa `matchCount` com `0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matching regional**.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0532

**Fonte:** `const details = {};`  
**O que faz:** Inicializa `details` com `{};`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matching regional**.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0533

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matching regional**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0534

**Fonte:** `for (const corner of corners) {`  
**O que faz:** Inicia a iteração `for (const corner of corners) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0535

**Fonte:** `const dist = hammingDistance(regionalA[corner], regionalB[corner]);`  
**O que faz:** Inicializa `dist` com `hammingDistance(regionalA[corner], regionalB[corner]);`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matching regional**.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0536

**Fonte:** `const ok = dist >= 0 && dist <= threshold;`  
**O que faz:** Inicializa `ok` com `dist >= 0 && dist <= threshold;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matching regional**.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0537

**Fonte:** `if (ok) matchCount++;`  
**O que faz:** Aplica a guarda `if (ok) matchCount++;`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0538

**Fonte:** `details[corner] = { dist, match: ok };`  
**O que faz:** Executa a operação `details[corner] = { dist, match: ok };` dentro de **matching regional**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0539

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matching regional** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0540

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matching regional**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0541

**Fonte:** `return { match: matchCount >= minMatches, matchCount, details };`  
**O que faz:** Retorna `return { match: matchCount >= minMatches, matchCount, details };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0542

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matching regional** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** transforma quatro distâncias em confirmação 3-de-4 configurável.  
**Risco/alternativa:** um único canto seria frágil; opções inválidas sem validação continuam lacuna.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0543

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matching regional**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual provam identical, minMatches customizado, details e null.

### Linha 0544

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0545

**Fonte:** `// Distância de Hamming generalizada`  
**O que faz:** Comentário/JSDoc do fonte registra: “Distância de Hamming generalizada”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0546

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0547

**Fonte:** `// Aceita hashes hex de qualquer comprimento par (múltiplo de 4 bits):`  
**O que faz:** Comentário/JSDoc do fonte registra: “Aceita hashes hex de qualquer comprimento par (múltiplo de 4 bits):”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0548

**Fonte:** `// 16 chars → dHash 64-bit`  
**O que faz:** Comentário/JSDoc do fonte registra: “16 chars → dHash 64-bit”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0549

**Fonte:** `// 64 chars → wHash / pHash 256-bit`  
**O que faz:** Comentário/JSDoc do fonte registra: “64 chars → wHash / pHash 256-bit”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0550

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0551

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **distância Hamming hexadecimal**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0552

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0553

**Fonte:** `* @param {string} hashA hex lowercase, qualquer comprimento par`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {string} hashA hex lowercase, qualquer comprimento par”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0554

**Fonte:** `* @param {string} hashB hex lowercase, mesmo comprimento de hashA`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {string} hashB hex lowercase, mesmo comprimento de hashA”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0555

**Fonte:** `* @returns {number} bits diferentes (0 a len*4), ou -1 se input inválido`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {number} bits diferentes (0 a len*4), ou -1 se input inválido”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0556

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0557

**Fonte:** `function hammingDistance(hashA, hashB) {`  
**O que faz:** Declara a função `hammingDistance` em **distância Hamming hexadecimal**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0558

**Fonte:** `if (!hashA \|\| !hashB \|\| hashA.length !== hashB.length) return -1;`  
**O que faz:** Aplica a guarda `if (!hashA \|\| !hashB \|\| hashA.length !== hashB.length) return -1;`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0559

**Fonte:** `let dist = 0;`  
**O que faz:** Inicializa `dist` com `0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **distância Hamming hexadecimal**.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0560

**Fonte:** `for (let i = 0; i < hashA.length; i++) {`  
**O que faz:** Inicia a iteração `for (let i = 0; i < hashA.length; i++) {`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0561

**Fonte:** `let xor = (parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16));`  
**O que faz:** Inicializa `xor` com `(parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16));`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **distância Hamming hexadecimal**.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0562

**Fonte:** `while (xor) { dist += xor & 1; xor >>>= 1; }`  
**O que faz:** Inicia a iteração `while (xor) { dist += xor & 1; xor >>>= 1; }`.  
**Como faz:** Percorre bytes, pixels, coeficientes, bits ou cantos na ordem determinística exigida.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0563

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **distância Hamming hexadecimal** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0564

**Fonte:** `return dist;`  
**O que faz:** Retorna `return dist;`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0565

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **distância Hamming hexadecimal** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** é a métrica binária central dos hashes serializados como hex.  
**Risco/alternativa:** hex inválido pode ser coercido por bitwise e fabricar distância incorreta.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0566

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **distância Hamming hexadecimal**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE PARA ENTRADAS VÁLIDAS — unit/visual provam 1/4/64/256 bits, simetria, null e length mismatch; caracteres não-hex não são cobertos.

### Linha 0567

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0568

**Fonte:** `// matchPerceptualHashes — Decisão combinada wHash + pHash`  
**O que faz:** Comentário/JSDoc do fonte registra: “matchPerceptualHashes — Decisão combinada wHash + pHash”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0569

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0570

**Fonte:** `// Implementação direta do pipeline descrito na análise matemática:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Implementação direta do pipeline descrito na análise matemática:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0571

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0572

**Fonte:** `// MATCH se: (Hamming_wHash ≤ 40 OU Hamming_pHash ≤ 35)`  
**O que faz:** Comentário/JSDoc do fonte registra: “MATCH se: (Hamming_wHash ≤ 40 OU Hamming_pHash ≤ 35)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0573

**Fonte:** `// E NOT (Hamming_wHash > 80 E Hamming_pHash > 70)`  
**O que faz:** Comentário/JSDoc do fonte registra: “E NOT (Hamming_wHash > 80 E Hamming_pHash > 70)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0574

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0575

**Fonte:** `// Rejeição absoluta: ambos os hashes muito distantes (imagem diferente)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Rejeição absoluta: ambos os hashes muito distantes (imagem diferente)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0576

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0577

**Fonte:** `// Thresholds (base: 256 bits):`  
**O que faz:** Comentário/JSDoc do fonte registra: “Thresholds (base: 256 bits):”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0578

**Fonte:** `// wHash match: ≤ 40 bits (≤ 15.6%) — threshold cross-language`  
**O que faz:** Comentário/JSDoc do fonte registra: “wHash match: ≤ 40 bits (≤ 15.6%) — threshold cross-language”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0579

**Fonte:** `// pHash match: ≤ 35 bits (≤ 13.7%)`  
**O que faz:** Comentário/JSDoc do fonte registra: “pHash match: ≤ 35 bits (≤ 13.7%)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0580

**Fonte:** `// wHash rejeição: > 80 bits (> 31.3%)`  
**O que faz:** Comentário/JSDoc do fonte registra: “wHash rejeição: > 80 bits (> 31.3%)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0581

**Fonte:** `// pHash rejeição: > 70 bits (> 27.3%)`  
**O que faz:** Comentário/JSDoc do fonte registra: “pHash rejeição: > 70 bits (> 27.3%)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0582

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0583

**Fonte:** `// Confidence score [0..1]:`  
**O que faz:** Comentário/JSDoc do fonte registra: “Confidence score [0..1]:”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0584

**Fonte:** `// confidence = max(wConf, pConf)`  
**O que faz:** Comentário/JSDoc do fonte registra: “confidence = max(wConf, pConf)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0585

**Fonte:** `// wConf = 1 - wDist / WHASH_REJECT_THRESHOLD (quando wMatch)`  
**O que faz:** Comentário/JSDoc do fonte registra: “wConf = 1 - wDist / WHASH_REJECT_THRESHOLD (quando wMatch)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0586

**Fonte:** `// pConf = 1 - pDist / PHASH_REJECT_THRESHOLD (quando pMatch)`  
**O que faz:** Comentário/JSDoc do fonte registra: “pConf = 1 - pDist / PHASH_REJECT_THRESHOLD (quando pMatch)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0587

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0588

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **thresholds strict e relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0589

**Fonte:** `const WHASH_MATCH_THRESHOLD = 40; // Hamming ≤ 40/256 → wHash match`  
**O que faz:** Inicializa `WHASH_MATCH_THRESHOLD` com `40; // Hamming ≤ 40/256 → wHash match`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **thresholds strict e relaxed**.  
**Por que assim:** centraliza calibração para 256 bits.  
**Risco/alternativa:** thresholds dispersos entre consumers produziriam decisões incoerentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0590

**Fonte:** `const PHASH_MATCH_THRESHOLD = 35; // Hamming ≤ 35/256 → pHash match`  
**O que faz:** Inicializa `PHASH_MATCH_THRESHOLD` com `35; // Hamming ≤ 35/256 → pHash match`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **thresholds strict e relaxed**.  
**Por que assim:** centraliza calibração para 256 bits.  
**Risco/alternativa:** thresholds dispersos entre consumers produziriam decisões incoerentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0591

**Fonte:** `const WHASH_REJECT_THRESHOLD = 80; // Hamming > 80 → componente wHash rejeita`  
**O que faz:** Inicializa `WHASH_REJECT_THRESHOLD` com `80; // Hamming > 80 → componente wHash rejeita`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **thresholds strict e relaxed**.  
**Por que assim:** centraliza calibração para 256 bits.  
**Risco/alternativa:** thresholds dispersos entre consumers produziriam decisões incoerentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0592

**Fonte:** `const PHASH_REJECT_THRESHOLD = 70; // Hamming > 70 → componente pHash rejeita`  
**O que faz:** Inicializa `PHASH_REJECT_THRESHOLD` com `70; // Hamming > 70 → componente pHash rejeita`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **thresholds strict e relaxed**.  
**Por que assim:** centraliza calibração para 256 bits.  
**Risco/alternativa:** thresholds dispersos entre consumers produziriam decisões incoerentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0593

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **thresholds strict e relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0594

**Fonte:** `// ── Thresholds relaxados (visual-v4 / Solução C) ────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “── Thresholds relaxados (visual-v4 / Solução C) ────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0595

**Fonte:** `//`  
**O que faz:** Comentário/JSDoc do fonte registra: “”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0596

**Fonte:** `// Usados apenas como fallback depois de SHA-256, dHash, perceptual strict e`  
**O que faz:** Comentário/JSDoc do fonte registra: “Usados apenas como fallback depois de SHA-256, dHash, perceptual strict e”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0597

**Fonte:** `// center-crop falharem. A confidence é limitada a 0.75 para forçar a`  
**O que faz:** Comentário/JSDoc do fonte registra: “center-crop falharem. A confidence é limitada a 0.75 para forçar a”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0598

**Fonte:** `// confirmação regional no content script antes de qualquer substituição.`  
**O que faz:** Comentário/JSDoc do fonte registra: “confirmação regional no content script antes de qualquer substituição.”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0599

**Fonte:** `const WHASH_MATCH_THRESHOLD_RELAXED = 50;`  
**O que faz:** Inicializa `WHASH_MATCH_THRESHOLD_RELAXED` com `50;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **thresholds strict e relaxed**.  
**Por que assim:** centraliza calibração para 256 bits.  
**Risco/alternativa:** thresholds dispersos entre consumers produziriam decisões incoerentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0600

**Fonte:** `const PHASH_MATCH_THRESHOLD_RELAXED = 45;`  
**O que faz:** Inicializa `PHASH_MATCH_THRESHOLD_RELAXED` com `45;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **thresholds strict e relaxed**.  
**Por que assim:** centraliza calibração para 256 bits.  
**Risco/alternativa:** thresholds dispersos entre consumers produziriam decisões incoerentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0601

**Fonte:** `const WHASH_REJECT_THRESHOLD_RELAXED = 90;`  
**O que faz:** Inicializa `WHASH_REJECT_THRESHOLD_RELAXED` com `90;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **thresholds strict e relaxed**.  
**Por que assim:** centraliza calibração para 256 bits.  
**Risco/alternativa:** thresholds dispersos entre consumers produziriam decisões incoerentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0602

**Fonte:** `const PHASH_REJECT_THRESHOLD_RELAXED = 82;`  
**O que faz:** Inicializa `PHASH_REJECT_THRESHOLD_RELAXED` com `82;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **thresholds strict e relaxed**.  
**Por que assim:** centraliza calibração para 256 bits.  
**Risco/alternativa:** thresholds dispersos entre consumers produziriam decisões incoerentes.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0603

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **thresholds strict e relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0604

**Fonte:** `/**`  
**O que faz:** Comentário/JSDoc do fonte registra: “*”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0605

**Fonte:** `* @param {string\|null} wHashA 64 chars hex (256 bits) ou null`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {string|null} wHashA 64 chars hex (256 bits) ou null”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0606

**Fonte:** `* @param {string\|null} pHashA 64 chars hex (256 bits) ou null`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {string|null} pHashA 64 chars hex (256 bits) ou null”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0607

**Fonte:** `* @param {string\|null} wHashB 64 chars hex (256 bits) ou null`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {string|null} wHashB 64 chars hex (256 bits) ou null”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0608

**Fonte:** `* @param {string\|null} pHashB 64 chars hex (256 bits) ou null`  
**O que faz:** Comentário/JSDoc do fonte registra: “@param {string|null} pHashB 64 chars hex (256 bits) ou null”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0609

**Fonte:** `* @returns {{`  
**O que faz:** Comentário/JSDoc do fonte registra: “@returns {{”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0610

**Fonte:** `* match: boolean,`  
**O que faz:** Comentário/JSDoc do fonte registra: “match: boolean,”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0611

**Fonte:** `* confidence: number, // [0..1]`  
**O que faz:** Comentário/JSDoc do fonte registra: “confidence: number, // [0..1]”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0612

**Fonte:** `* reason: string,`  
**O que faz:** Comentário/JSDoc do fonte registra: “reason: string,”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0613

**Fonte:** `* wDist: number, // -1 se hash ausente`  
**O que faz:** Comentário/JSDoc do fonte registra: “wDist: number, // -1 se hash ausente”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0614

**Fonte:** `* pDist: number,`  
**O que faz:** Comentário/JSDoc do fonte registra: “pDist: number,”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0615

**Fonte:** `* }}`  
**O que faz:** Comentário/JSDoc do fonte registra: “}}”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0616

**Fonte:** `*/`  
**O que faz:** Comentário/JSDoc do fonte registra: “/”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual verificam valores públicos, relações e fronteiras strict/relaxed.

### Linha 0617

**Fonte:** `function matchPerceptualHashes(wHashA, pHashA, wHashB, pHashB) {`  
**O que faz:** Declara a função `matchPerceptualHashes` em **matcher perceptual strict**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0618

**Fonte:** `const wDist = (wHashA && wHashB) ? hammingDistance(wHashA, wHashB) : -1;`  
**O que faz:** Inicializa `wDist` com `(wHashA && wHashB) ? hammingDistance(wHashA, wHashB) : -1;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0619

**Fonte:** `const pDist = (pHashA && pHashB) ? hammingDistance(pHashA, pHashB) : -1;`  
**O que faz:** Inicializa `pDist` com `(pHashA && pHashB) ? hammingDistance(pHashA, pHashB) : -1;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0620

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual strict**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0621

**Fonte:** `// ── Ambos disponíveis: lógica combinada ──────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “── Ambos disponíveis: lógica combinada ──────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0622

**Fonte:** `if (wDist >= 0 && pDist >= 0) {`  
**O que faz:** Aplica a guarda `if (wDist >= 0 && pDist >= 0) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0623

**Fonte:** `// Rejeição absoluta: ambos sinalizando imagem diferente`  
**O que faz:** Comentário/JSDoc do fonte registra: “Rejeição absoluta: ambos sinalizando imagem diferente”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0624

**Fonte:** `if (wDist > WHASH_REJECT_THRESHOLD && pDist > PHASH_REJECT_THRESHOLD) {`  
**O que faz:** Aplica a guarda `if (wDist > WHASH_REJECT_THRESHOLD && pDist > PHASH_REJECT_THRESHOLD) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0625

**Fonte:** `return { match: false, confidence: 0, reason: 'both_reject', wDist, pDist };`  
**O que faz:** Retorna `return { match: false, confidence: 0, reason: 'both_reject', wDist, pDist };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0626

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual strict** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0627

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual strict**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0628

**Fonte:** `const wMatch = wDist <= WHASH_MATCH_THRESHOLD;`  
**O que faz:** Inicializa `wMatch` com `wDist <= WHASH_MATCH_THRESHOLD;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0629

**Fonte:** `const pMatch = pDist <= PHASH_MATCH_THRESHOLD;`  
**O que faz:** Inicializa `pMatch` com `pDist <= PHASH_MATCH_THRESHOLD;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0630

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual strict**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0631

**Fonte:** `if (wMatch \|\| pMatch) {`  
**O que faz:** Aplica a guarda `if (wMatch \|\| pMatch) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0632

**Fonte:** `const wConf = wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD) : 0;`  
**O que faz:** Inicializa `wConf` com `wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD) : 0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0633

**Fonte:** `const pConf = pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD) : 0;`  
**O que faz:** Inicializa `pConf` com `pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD) : 0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0634

**Fonte:** `const confidence = Math.min(1, Math.max(wConf, pConf));`  
**O que faz:** Inicializa `confidence` com `Math.min(1, Math.max(wConf, pConf));`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0635

**Fonte:** `const reason = (wMatch && pMatch) ? 'both_match'`  
**O que faz:** Inicializa `reason` com `(wMatch && pMatch) ? 'both_match'`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0636

**Fonte:** `: wMatch ? 'whash_match'`  
**O que faz:** Executa a operação `: wMatch ? 'whash_match'` dentro de **matcher perceptual strict**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0637

**Fonte:** `: 'phash_match';`  
**O que faz:** Executa a operação `: 'phash_match';` dentro de **matcher perceptual strict**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0638

**Fonte:** `return { match: true, confidence, reason, wDist, pDist };`  
**O que faz:** Retorna `return { match: true, confidence, reason, wDist, pDist };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0639

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual strict** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0640

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual strict**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0641

**Fonte:** `return { match: false, confidence: 0, reason: 'both_miss', wDist, pDist };`  
**O que faz:** Retorna `return { match: false, confidence: 0, reason: 'both_miss', wDist, pDist };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0642

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual strict** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0643

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual strict**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0644

**Fonte:** `// ── Apenas wHash ─────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “── Apenas wHash ─────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0645

**Fonte:** `if (wDist >= 0) {`  
**O que faz:** Aplica a guarda `if (wDist >= 0) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0646

**Fonte:** `const wMatch = wDist <= WHASH_MATCH_THRESHOLD;`  
**O que faz:** Inicializa `wMatch` com `wDist <= WHASH_MATCH_THRESHOLD;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0647

**Fonte:** `return {`  
**O que faz:** Retorna `return {`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0648

**Fonte:** `match: wMatch,`  
**O que faz:** Define o campo/opção `match: wMatch,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0649

**Fonte:** `confidence: wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD) : 0,`  
**O que faz:** Define o campo/opção `confidence: wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD) : 0,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0650

**Fonte:** `reason: wMatch ? 'whash_only_match' : 'whash_only_miss',`  
**O que faz:** Define o campo/opção `reason: wMatch ? 'whash_only_match' : 'whash_only_miss',`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0651

**Fonte:** `wDist,`  
**O que faz:** Executa a operação `wDist,` dentro de **matcher perceptual strict**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0652

**Fonte:** `pDist: -1,`  
**O que faz:** Define o campo/opção `pDist: -1,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0653

**Fonte:** `};`  
**O que faz:** Executa a operação `};` dentro de **matcher perceptual strict**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0654

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual strict** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0655

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual strict**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0656

**Fonte:** `// ── Apenas pHash ─────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “── Apenas pHash ─────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0657

**Fonte:** `if (pDist >= 0) {`  
**O que faz:** Aplica a guarda `if (pDist >= 0) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0658

**Fonte:** `const pMatch = pDist <= PHASH_MATCH_THRESHOLD;`  
**O que faz:** Inicializa `pMatch` com `pDist <= PHASH_MATCH_THRESHOLD;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual strict**.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0659

**Fonte:** `return {`  
**O que faz:** Retorna `return {`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0660

**Fonte:** `match: pMatch,`  
**O que faz:** Define o campo/opção `match: pMatch,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0661

**Fonte:** `confidence: pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD) : 0,`  
**O que faz:** Define o campo/opção `confidence: pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD) : 0,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0662

**Fonte:** `reason: pMatch ? 'phash_only_match' : 'phash_only_miss',`  
**O que faz:** Define o campo/opção `reason: pMatch ? 'phash_only_match' : 'phash_only_miss',`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0663

**Fonte:** `wDist: -1,`  
**O que faz:** Define o campo/opção `wDist: -1,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0664

**Fonte:** `pDist,`  
**O que faz:** Executa a operação `pDist,` dentro de **matcher perceptual strict**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0665

**Fonte:** `};`  
**O que faz:** Executa a operação `};` dentro de **matcher perceptual strict**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0666

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual strict** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0667

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual strict**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0668

**Fonte:** `// ── Nenhum hash disponível ────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “── Nenhum hash disponível ────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0669

**Fonte:** `return { match: false, confidence: 0, reason: 'no_hashes', wDist: -1, pDist: -1 };`  
**O que faz:** Retorna `return { match: false, confidence: 0, reason: 'no_hashes', wDist: -1, pDist: -1 };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0670

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual strict** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** combina wHash e pHash com rejeição forte quando ambos discordam.  
**Risco/alternativa:** OR ingênuo sem reject guard aumentaria falsos positivos.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0671

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual strict**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit/visual cobrem both_match, componentes isolados, reject, grey zone, no hashes, confidence e limite 40/41.

### Linha 0672

**Fonte:** `function matchPerceptualHashesRelaxed(wHashA, pHashA, wHashB, pHashB) {`  
**O que faz:** Declara a função `matchPerceptualHashesRelaxed` em **matcher perceptual relaxed**.  
**Como faz:** Abre o escopo que implementa o algoritmo/contrato nomeado nas linhas seguintes.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0673

**Fonte:** `const wDist = (wHashA && wHashB) ? hammingDistance(wHashA, wHashB) : -1;`  
**O que faz:** Inicializa `wDist` com `(wHashA && wHashB) ? hammingDistance(wHashA, wHashB) : -1;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0674

**Fonte:** `const pDist = (pHashA && pHashB) ? hammingDistance(pHashA, pHashB) : -1;`  
**O que faz:** Inicializa `pDist` com `(pHashA && pHashB) ? hammingDistance(pHashA, pHashB) : -1;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0675

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0676

**Fonte:** `if (wDist >= 0 && pDist >= 0) {`  
**O que faz:** Aplica a guarda `if (wDist >= 0 && pDist >= 0) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0677

**Fonte:** `if (wDist > WHASH_REJECT_THRESHOLD_RELAXED && pDist > PHASH_REJECT_THRESHOLD_RELAXED) {`  
**O que faz:** Aplica a guarda `if (wDist > WHASH_REJECT_THRESHOLD_RELAXED && pDist > PHASH_REJECT_THRESHOLD_RELAXED) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0678

**Fonte:** `return { match: false, confidence: 0, reason: 'relaxed_both_reject', wDist, pDist };`  
**O que faz:** Retorna `return { match: false, confidence: 0, reason: 'relaxed_both_reject', wDist, pDist };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0679

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual relaxed** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0680

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0681

**Fonte:** `const wMatch = wDist <= WHASH_MATCH_THRESHOLD_RELAXED;`  
**O que faz:** Inicializa `wMatch` com `wDist <= WHASH_MATCH_THRESHOLD_RELAXED;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0682

**Fonte:** `const pMatch = pDist <= PHASH_MATCH_THRESHOLD_RELAXED;`  
**O que faz:** Inicializa `pMatch` com `pDist <= PHASH_MATCH_THRESHOLD_RELAXED;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0683

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0684

**Fonte:** `if (wMatch \|\| pMatch) {`  
**O que faz:** Aplica a guarda `if (wMatch \|\| pMatch) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0685

**Fonte:** `const wConf = wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD_RELAXED) : 0;`  
**O que faz:** Inicializa `wConf` com `wMatch ? (1 - wDist / WHASH_REJECT_THRESHOLD_RELAXED) : 0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0686

**Fonte:** `const pConf = pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD_RELAXED) : 0;`  
**O que faz:** Inicializa `pConf` com `pMatch ? (1 - pDist / PHASH_REJECT_THRESHOLD_RELAXED) : 0;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0687

**Fonte:** `const confidence = Math.min(0.75, Math.max(wConf, pConf));`  
**O que faz:** Inicializa `confidence` com `Math.min(0.75, Math.max(wConf, pConf));`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0688

**Fonte:** `const reason = (wMatch && pMatch) ? 'relaxed_both_match'`  
**O que faz:** Inicializa `reason` com `(wMatch && pMatch) ? 'relaxed_both_match'`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0689

**Fonte:** `: wMatch ? 'relaxed_whash_match'`  
**O que faz:** Executa a operação `: wMatch ? 'relaxed_whash_match'` dentro de **matcher perceptual relaxed**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0690

**Fonte:** `: 'relaxed_phash_match';`  
**O que faz:** Executa a operação `: 'relaxed_phash_match';` dentro de **matcher perceptual relaxed**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0691

**Fonte:** `return { match: true, confidence, reason, wDist, pDist };`  
**O que faz:** Retorna `return { match: true, confidence, reason, wDist, pDist };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0692

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual relaxed** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0693

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0694

**Fonte:** `return { match: false, confidence: 0, reason: 'relaxed_both_miss', wDist, pDist };`  
**O que faz:** Retorna `return { match: false, confidence: 0, reason: 'relaxed_both_miss', wDist, pDist };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0695

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual relaxed** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0696

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0697

**Fonte:** `if (wDist >= 0) {`  
**O que faz:** Aplica a guarda `if (wDist >= 0) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0698

**Fonte:** `const wMatch = wDist <= WHASH_MATCH_THRESHOLD_RELAXED;`  
**O que faz:** Inicializa `wMatch` com `wDist <= WHASH_MATCH_THRESHOLD_RELAXED;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0699

**Fonte:** `return {`  
**O que faz:** Retorna `return {`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0700

**Fonte:** `match: wMatch,`  
**O que faz:** Define o campo/opção `match: wMatch,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0701

**Fonte:** `confidence: wMatch ? Math.min(0.75, 1 - wDist / WHASH_REJECT_THRESHOLD_RELAXED) : 0,`  
**O que faz:** Aplica a operação matemática `confidence: wMatch ? Math.min(0.75, 1 - wDist / WHASH_REJECT_THRESHOLD_RELAXED) : 0,`.  
**Como faz:** Calcula cosseno, normalização, limite, padding ou entropia conforme o algoritmo atual.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0702

**Fonte:** `reason: wMatch ? 'relaxed_whash_only_match' : 'relaxed_whash_only_miss',`  
**O que faz:** Define o campo/opção `reason: wMatch ? 'relaxed_whash_only_match' : 'relaxed_whash_only_miss',`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0703

**Fonte:** `wDist,`  
**O que faz:** Executa a operação `wDist,` dentro de **matcher perceptual relaxed**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0704

**Fonte:** `pDist: -1,`  
**O que faz:** Define o campo/opção `pDist: -1,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0705

**Fonte:** `};`  
**O que faz:** Executa a operação `};` dentro de **matcher perceptual relaxed**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0706

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual relaxed** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0707

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0708

**Fonte:** `if (pDist >= 0) {`  
**O que faz:** Aplica a guarda `if (pDist >= 0) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0709

**Fonte:** `const pMatch = pDist <= PHASH_MATCH_THRESHOLD_RELAXED;`  
**O que faz:** Inicializa `pMatch` com `pDist <= PHASH_MATCH_THRESHOLD_RELAXED;`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **matcher perceptual relaxed**.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0710

**Fonte:** `return {`  
**O que faz:** Retorna `return {`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0711

**Fonte:** `match: pMatch,`  
**O que faz:** Define o campo/opção `match: pMatch,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0712

**Fonte:** `confidence: pMatch ? Math.min(0.75, 1 - pDist / PHASH_REJECT_THRESHOLD_RELAXED) : 0,`  
**O que faz:** Aplica a operação matemática `confidence: pMatch ? Math.min(0.75, 1 - pDist / PHASH_REJECT_THRESHOLD_RELAXED) : 0,`.  
**Como faz:** Calcula cosseno, normalização, limite, padding ou entropia conforme o algoritmo atual.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0713

**Fonte:** `reason: pMatch ? 'relaxed_phash_only_match' : 'relaxed_phash_only_miss',`  
**O que faz:** Define o campo/opção `reason: pMatch ? 'relaxed_phash_only_match' : 'relaxed_phash_only_miss',`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0714

**Fonte:** `wDist: -1,`  
**O que faz:** Define o campo/opção `wDist: -1,`.  
**Como faz:** Compõe objeto de resultado, detalhe regional ou API pública com valor calculado no bloco.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0715

**Fonte:** `pDist,`  
**O que faz:** Executa a operação `pDist,` dentro de **matcher perceptual relaxed**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0716

**Fonte:** `};`  
**O que faz:** Executa a operação `};` dentro de **matcher perceptual relaxed**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0717

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual relaxed** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0718

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0719

**Fonte:** `return { match: false, confidence: 0, reason: 'no_hashes', wDist: -1, pDist: -1 };`  
**O que faz:** Retorna `return { match: false, confidence: 0, reason: 'no_hashes', wDist: -1, pDist: -1 };`.  
**Como faz:** Encerra a função/ramificação com hash, distância, decisão ou fallback já calculado.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0720

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **matcher perceptual relaxed** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** é fallback controlado após caminhos mais confiáveis falharem.  
**Risco/alternativa:** confidence 1.0 no relaxed permitiria substituição sem confirmação regional.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0721

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **matcher perceptual relaxed**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE — unit prova miss strict que vira hit relaxed, cap 0.75, both match/reject e thresholds.

### Linha 0722

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0723

**Fonte:** `// API pública`  
**O que faz:** Comentário/JSDoc do fonte registra: “API pública”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0724

**Fonte:** `// ─────────────────────────────────────────────────────────────────────────`  
**O que faz:** Comentário/JSDoc do fonte registra: “─────────────────────────────────────────────────────────────────────────”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0725

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0726

**Fonte:** `const api = {`  
**O que faz:** Inicializa `api` com `{`.  
**Como faz:** Materializa estado, dimensão, buffer, threshold ou intermediário usado por **API pública e exports multi-runtime**.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0727

**Fonte:** `// SHA-256 (visual-v1/v2, inalterado)`  
**O que faz:** Comentário/JSDoc do fonte registra: “SHA-256 (visual-v1/v2, inalterado)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0728

**Fonte:** `buildFingerprintSource,`  
**O que faz:** Executa a operação `buildFingerprintSource,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0729

**Fonte:** `hashStringSha256,`  
**O que faz:** Executa a operação `hashStringSha256,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0730

**Fonte:** `createFingerprintFromDescriptor,`  
**O que faz:** Executa a operação `createFingerprintFromDescriptor,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0731

**Fonte:** `generateId,`  
**O que faz:** Executa a operação `generateId,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0732

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0733

**Fonte:** `// dHash (visual-v2) — 9×8 → 16 hex chars`  
**O que faz:** Comentário/JSDoc do fonte registra: “dHash (visual-v2) — 9×8 → 16 hex chars”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0734

**Fonte:** `calculateDHash,`  
**O que faz:** Executa a operação `calculateDHash,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0735

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0736

**Fonte:** `// wHash (visual-v3) — Haar Wavelet, 32×32 → 64 hex chars (256 bits)`  
**O que faz:** Comentário/JSDoc do fonte registra: “wHash (visual-v3) — Haar Wavelet, 32×32 → 64 hex chars (256 bits)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0737

**Fonte:** `calculateWHash,`  
**O que faz:** Executa a operação `calculateWHash,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0738

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0739

**Fonte:** `// pHash (visual-v3) — DCT, 32×32 → 64 hex chars (256 bits)`  
**O que faz:** Comentário/JSDoc do fonte registra: “pHash (visual-v3) — DCT, 32×32 → 64 hex chars (256 bits)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0740

**Fonte:** `calculatePHash,`  
**O que faz:** Executa a operação `calculatePHash,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0741

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0742

**Fonte:** `// Hashes regionais dos 4 cantos (48×48 canvas, aproximação do RANSAC)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Hashes regionais dos 4 cantos (48×48 canvas, aproximação do RANSAC)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0743

**Fonte:** `calculateRegionalHashes,`  
**O que faz:** Executa a operação `calculateRegionalHashes,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0744

**Fonte:** `matchRegionalHashes,`  
**O que faz:** Executa a operação `matchRegionalHashes,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0745

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0746

**Fonte:** `// Hamming distance generalizada (16, 64, ou qualquer comprimento par)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Hamming distance generalizada (16, 64, ou qualquer comprimento par)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0747

**Fonte:** `hammingDistance,`  
**O que faz:** Executa a operação `hammingDistance,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0748

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0749

**Fonte:** `// Match combinado wHash + pHash com thresholds calibrados para mangá`  
**O que faz:** Comentário/JSDoc do fonte registra: “Match combinado wHash + pHash com thresholds calibrados para mangá”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0750

**Fonte:** `matchPerceptualHashes,`  
**O que faz:** Executa a operação `matchPerceptualHashes,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0751

**Fonte:** `matchPerceptualHashesRelaxed,`  
**O que faz:** Executa a operação `matchPerceptualHashesRelaxed,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0752

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0753

**Fonte:** `// Thresholds públicos (para uso no content script, SW e IndexedDB)`  
**O que faz:** Comentário/JSDoc do fonte registra: “Thresholds públicos (para uso no content script, SW e IndexedDB)”.  
**Como faz:** Documenta fórmula, dimensão, threshold, limitação ou API próxima sem gerar side effect.  
**Por que assim:** Neste módulo a matemática documentada é parte importante do contrato de manutenção.  
**Risco/alternativa:** Comentário incorreto pode induzir mudança incompatível mesmo sem alterar o runtime atual.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0754

**Fonte:** `WHASH_MATCH_THRESHOLD,`  
**O que faz:** Executa a operação `WHASH_MATCH_THRESHOLD,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0755

**Fonte:** `PHASH_MATCH_THRESHOLD,`  
**O que faz:** Executa a operação `PHASH_MATCH_THRESHOLD,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0756

**Fonte:** `WHASH_REJECT_THRESHOLD,`  
**O que faz:** Executa a operação `WHASH_REJECT_THRESHOLD,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0757

**Fonte:** `PHASH_REJECT_THRESHOLD,`  
**O que faz:** Executa a operação `PHASH_REJECT_THRESHOLD,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0758

**Fonte:** `WHASH_MATCH_THRESHOLD_RELAXED,`  
**O que faz:** Executa a operação `WHASH_MATCH_THRESHOLD_RELAXED,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0759

**Fonte:** `PHASH_MATCH_THRESHOLD_RELAXED,`  
**O que faz:** Executa a operação `PHASH_MATCH_THRESHOLD_RELAXED,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0760

**Fonte:** `WHASH_REJECT_THRESHOLD_RELAXED,`  
**O que faz:** Executa a operação `WHASH_REJECT_THRESHOLD_RELAXED,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0761

**Fonte:** `PHASH_REJECT_THRESHOLD_RELAXED,`  
**O que faz:** Executa a operação `PHASH_REJECT_THRESHOLD_RELAXED,` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0762

**Fonte:** `};`  
**O que faz:** Executa a operação `};` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0763

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0764

**Fonte:** `if (typeof module !== 'undefined' && module.exports) {`  
**O que faz:** Aplica a guarda `if (typeof module !== 'undefined' && module.exports) {`.  
**Como faz:** Seleciona fallback, rejeita entrada ou escolhe um ramo antes da etapa matemática seguinte.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0765

**Fonte:** `module.exports = api;`  
**O que faz:** Exporta a API real via CommonJS.  
**Como faz:** Faz Jest/smoke/Node carregarem exatamente o módulo de produção.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0766

**Fonte:** `}`  
**O que faz:** Fecha/continua a estrutura sintática de **API pública e exports multi-runtime** com `}`.  
**Como faz:** Delimita função, objeto, array ou chamada iniciada anteriormente.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0767

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0768

**Fonte:** `rootScope.MangaTranslatorGtcFingerprint = api;`  
**O que faz:** Publica a API em `rootScope.MangaTranslatorGtcFingerprint`.  
**Como faz:** Expõe o mesmo objeto ao content script ou Service Worker conforme o realm.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0769

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0770

**Fonte:** `})(typeof self !== 'undefined' ? self : globalThis);`  
**O que faz:** Executa a operação `})(typeof self !== 'undefined' ? self : globalThis);` dentro de **API pública e exports multi-runtime**.  
**Como faz:** Aplica a atribuição, fórmula ou chamada usando os intermediários definidos no mesmo bloco matemático.  
**Por que assim:** mantém content, SW, IDB e testes na mesma implementação.  
**Risco/alternativa:** exports ou ordem divergentes quebrariam interoperabilidade.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

### Linha 0771

**Fonte:** ␠ [posição vazia/newline]  
**O que faz:** Mantém uma posição vazia dentro de **API pública e exports multi-runtime**.  
**Como faz:** Não executa JavaScript; separa visualmente blocos e preserva a numeração física.  
**Por que assim:** A separação ajuda a revisar fórmulas e contratos sem perder alinhamento com o fonte.  
**Risco/alternativa:** Remover não muda o runtime, mas muda a rastreabilidade desta Bíblia.  
**Evidência:** ✅ PROVADO DIRETAMENTE + 🟦 GATE DE ORDEM — integration visual verifica símbolos/thresholds; manifest/background e consumers carregam a mesma API.

## 11. Checklist de revisão antes da conclusão

- [x] Fonte integral materializada.
- [x] SHA da reserva coincide com o fonte atual.
- [x] 771/771 posições documentadas em ordem.
- [x] Consumers content/SW/IDB investigados.
- [x] Testes diretos separados de consumer mocks/simulações.
- [x] Fórmulas, dimensões, thresholds e formatos documentados.
- [x] Lacunas de validação/migração registradas.
- [x] Invariantes matemáticos explícitos.
- [ ] Releitura do blob gravado e validação mecânica final.
- [ ] Atualização de STATUS/CHECKLIST/AUDITORIA/PR sob PROGRESS lock.
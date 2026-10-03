# Bíblia técnica — tests/visual/helpers.js

> **Estado documental:** ✅ CONCLUÍDA pelo AGENTE 20 após autoauditoria documental  
> **SHA auditado:** `8d740eb3ee276d99c8a82acfb3eada6712e2efed`  
> **Agente:** AGENTE 20  
> **Tipo:** fábricas determinísticas de ImageData e oráculos auxiliares da suíte visual  
> **Linhas textuais:** 243  
> **Posições documentais:** 244, contando newline terminal  
> **PR/branch:** #66 / `docs/project-bible`

## 1. Papel arquitetural

`tests/visual/helpers.js` não é código de produção. Ele gera `Uint8ClampedArray` RGBA controlados usados pela suíte visual para exercitar fingerprints, cache perceptual e fluxos cross-language. Também contém dois utilitários de validação/contagem de hash.

O arquivo funciona como **gerador de fixtures programáticas**. Isso é importante: defeitos aqui podem mudar silenciosamente a geometria/estatística das imagens que os testes acreditam estar usando. Em particular, `isValidHex` é usado como oráculo de assertions; portanto um bug nesse helper pode enfraquecer o próprio teste.

Não acessa rede, filesystem, DOM, Chrome API ou banco. Seus efeitos são apenas alocação/cópia de typed arrays e cálculos determinísticos.

## 2. API exportada

| Export | Contrato atual |
|---|---|
| `solidColor` | cria RGBA constante, defaults 128/128/128/255 |
| `horizontalGradient` | cinza horizontal 0→255, alpha 255 |
| `checkerboard` | xadrez branco/preto por `cellSize`, alpha 255 |
| `mangaPage` | página sintética com base suave, balão branco e “texto” EN/PT |
| `noise` | ruído RGB determinístico via LCG, alpha 255 |
| `brightnessShifted` | copia input, altera RGB por delta com clamp, preserva alpha |
| `extractBlock` | copia retângulo RGBA para novo buffer |
| `injectTextInCenter` | clona imagem e injeta padrão preto/branco central |
| `isValidHex` | valida string hex lowercase não vazia e comprimento opcional |
| `countSetBits` | soma popcount de cada nibble hexadecimal |

## 3. Consumers e alcance real

Seis suítes visuais importam este helper:

1. `tests/visual/gtc-fingerprint.visual.js`;
2. `tests/visual/gtc-indexeddb.visual.js`;
3. `tests/visual/background-fingerprint.visual.js`;
4. `tests/visual/content-manga-pipeline.visual.js`;
5. `tests/visual/integration.visual.js`;
6. `tests/visual/crop.visual.js`.

`tests/visual/run-all.js` carrega exatamente essas seis suítes e depois aguarda a fila assíncrona do runner.

Uso encontrado:
- `solidColor`: amplo;
- `horizontalGradient`: amplo;
- `checkerboard`: amplo;
- `mangaPage`: amplo;
- `noise`: múltiplas suítes;
- `brightnessShifted`: fingerprint/integration;
- `isValidHex`: usado diretamente em assertions;
- `countSetBits`: **importado** por `gtc-fingerprint.visual.js`, mas nenhuma chamada foi localizada;
- `extractBlock`: nenhuma referência externa localizada;
- `injectTextInCenter`: nenhuma referência externa localizada.

As três últimas situações são registradas em 230-002.

## 4. solidColor — linhas 17–26

Aloca `width * height * 4` bytes e escreve, para cada pixel, R/G/B/A em offsets consecutivos.

Características:
- usa `Uint8ClampedArray`, então valores fora de 0–255 são clampados/conversões seguem semântica do typed array;
- não valida dimensões nem canais;
- alpha é configurável e default 255;
- retorna buffer novo em cada chamada.

Consumers usam cores constantes para comparar determinismo, alpha ignorado pelos hashes e caminhos de cache. As assertions recaem sobre o sistema sob teste, não sobre posições RGBA do helper.

Classificação: **🟨 EXECUTADO INDIRETAMENTE**.

## 5. horizontalGradient — linhas 32–45

Para cada coluna `c` calcula `round((c/(width-1))*255)` e replica esse valor em RGB; alpha é 255.

Para `width > 1`, a primeira coluna é 0 e a última 255. A mesma linha horizontal se repete em todas as linhas.

Borda importante: `width === 1` faz divisão `0/0`, produz `NaN`, que ao ser escrito em `Uint8ClampedArray` vira 0. Não existe validação/contrato focal para essa dimensão.

Classificação: **🟨 EXECUTADO INDIRETAMENTE** nos tamanhos normais (32/48/100 etc.).

## 6. checkerboard — linhas 51–64

A cor é definida pela paridade de:
`floor(r/cellSize) + floor(c/cellSize)`.

Paridade par → 255; ímpar → 0. RGB são iguais e alpha 255.

O default é `cellSize=4`. Não há validação para 0/negativo/não finito; os consumers conhecidos usam valores positivos.

Classificação: **🟨 EXECUTADO INDIRETAMENTE**.

## 7. mangaPage — linhas 78–144

É a fixture mais complexa.

### 7.1 Base
Cria buffer RGBA e usa:
`round(180 + 60 * sin(r/height*π) * cos(c/width*π))`.

Portanto a base real é um **gradiente/sombreamento suave**, não um fundo branco uniforme. Alpha é 255.

### 7.2 Balão
Define:
- vertical: 35%–65% da altura;
- horizontal: 25%–75% da largura;
- preenche RGB do retângulo com 255.

### 7.3 Texto EN
Se `textPattern === 'EN'`, usa aproximadamente 70% da largura do balão e escreve valor 10 nas colunas cuja posição `dc % 3 !== 1`.

### 7.4 Ramo não-EN
**Qualquer** valor diferente de `'EN'` entra no ramo descrito como PT. Esse ramo usa ~40% da largura, deslocado 30% dentro do balão, e valor 15 quando `dc % 4 !== 2`.

Logo o contrato implementado é “EN vs qualquer outro valor”, não validação de enum EN/PT.

### 7.5 Evidência
As suítes calculam hashes de páginas EN/PT e verificam proximidade cross-language e separação contra ruído. Isso demonstra que a fixture participa do cenário real da suíte, mas não verifica diretamente cada pixel/região.

Classificação: **🟨 EXECUTADO INDIRETAMENTE**.

### 7.6 Divergência comentário/implementação
O JSDoc diz “Fundo branco (arte): toda a imagem”, mas a implementação cria gradiente cinza e só torna o balão branco. Isso é 230-003.

## 8. noise — linhas 149–162

Usa um LCG com constantes `1664525` e `1013904223`. Para cada pixel:

- atualiza estado com operação bitwise de 32 bits;
- extrai byte alto para R;
- G = R + 85 mod 256;
- B = R + 170 mod 256;
- A = 255.

O seed default é 42. A sequência é determinística no runtime JS; o uso bitwise força semântica inteira de 32 bits.

É usado como contraste “imagem estruturalmente diferente” em várias suítes.

Classificação: **🟨 EXECUTADO INDIRETAMENTE**.

## 9. brightnessShifted — linhas 168–175

Cria novo buffer do mesmo comprimento.

- índices `i % 4 === 3`: alpha copiado sem alteração;
- demais canais: soma `delta` e faz clamp explícito entre 0 e 255;
- input não é mutado;
- delta default = 30.

É usado para provar robustez perceptual a mudança global de brilho, mas a suíte não verifica diretamente cópia, clamp e preservação alpha do helper.

Classificação: **🟨 EXECUTADO INDIRETAMENTE**.

## 10. extractBlock — linhas 181–194

Aloca `blockH * blockW * 4` e copia RGBA do retângulo calculando índices de origem/destino.

Não há bounds check. Leitura fora do `fullData` produz `undefined`; ao gravar em `Uint8ClampedArray`, o valor vira 0. Assim input inválido pode virar preenchimento silencioso em vez de erro.

Apesar do comentário dizer que é usado para validar `_blockWHash16`, nenhuma referência externa foi localizada.

Classificação: **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO**.

## 11. injectTextInCenter — linhas 200–216

Clona o buffer de entrada e modifica a região:
- início vertical = 40% da altura;
- início horizontal = 25% da largura;
- largura = 50%;
- altura = 20%.

O padrão usa o mesmo LCG e escreve RGB preto (0) ou branco (255), preservando alpha original.

Não há validação de coerência entre `data.length`, `width` e `height`. Nenhum consumer externo foi localizado.

Classificação: **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO**.

## 12. isValidHex — linhas 221–225

Contrato real:

1. não-string → false;
2. se `expectedLen` foi fornecido e o comprimento difere → false;
3. regex `^[0-9a-f]+$` → somente lowercase e pelo menos um caractere.

É usado diretamente em assertions como `expect(isValidHex(hash, 64)).toBeTruthy()`. Portanto há **✅ PROVA DIRETA** do caminho positivo para hashes reais válidos produzidos pelo sistema.

Não há self-test focal para:
- uppercase;
- caractere não hex;
- string vazia;
- tipo não-string;
- comprimento incorreto;
- ausência de `expectedLen`.

Como ele próprio é um oráculo de teste, esses negativos merecem cobertura separada.

## 13. countSetBits — linhas 230–237

Converte cada caractere com `parseInt(ch,16)` e conta bits usando `n & 1` + shift unsigned.

Não valida a string. Caractere inválido produz `NaN`; o `while(NaN)` não roda e aquele caractere contribui zero silenciosamente.

O símbolo é importado em `gtc-fingerprint.visual.js`, mas nenhuma chamada foi localizada.

Classificação: **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO**.

## 14. Evidência de CI do mesmo blob

O SHA `8d740eb3ee276d99c8a82acfb3eada6712e2efed` existe no commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`.

No workflow **MangaTranslator CI #36577447500**:
- job **Visual Tests** (`109437162605`) executou `npm run test:visual` → `node tests/visual/run-all.js`;
- o log final registra **Passed: 224**;
- o mesmo log contém cenários alimentados por estas fixtures (gradient vs checkerboard, cross-language etc.);
- **Windows Portability** (`109437162789`) também executou a suíte visual e registrou **Passed: 224**.

Isso prova que o helper real participou de um run verde em Linux e Windows. Não converte os seus geradores em self-tests.

## 15. Matriz consolidada

| Comportamento | Evidência | Classificação |
|---|---|---|
| seis suítes conseguem importar exports usados | imports reais + run visual | 🟦 GATE ESTÁTICO ESPECÍFICO / 🟨 execução |
| solidColor gera fixtures consumíveis | cenários reais passam | 🟨 EXECUTADO INDIRETAMENTE |
| horizontalGradient/checkerboard distinguem estruturas nos testes | hashes resultantes são comparados | 🟨 EXECUTADO INDIRETAMENTE |
| mangaPage EN/PT suporta cenários cross-language | thresholds/assertions passam | 🟨 EXECUTADO INDIRETAMENTE |
| noise separa imagem diferente | testes de distância passam | 🟨 EXECUTADO INDIRETAMENTE |
| brightnessShifted alimenta cenários de robustez | testes de hash passam | 🟨 EXECUTADO INDIRETAMENTE |
| isValidHex aceita hashes válidos esperados | assertion é sobre retorno do helper | ✅ PROVADO DIRETAMENTE |
| negativos de isValidHex | nenhum self-test focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| extractBlock | sem consumer externo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| injectTextInCenter | sem consumer externo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| countSetBits | apenas import localizado, sem chamada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| parâmetros inválidos/bordas dos geradores | sem self-test focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 16. Solicitações ao auditor

### 230-001 — TEST_REQUIRED — OPEN
**Encontrado:** não existe self-test focal para as fábricas/oráculos deste arquivo; os testes atuais usam suas saídas para provar o sistema sob teste.  
**Arquivo sugerido:** `tests/visual/helpers.visual.js` (novo, se aprovado), com registro correspondente no runner/agregador se necessário.  
**Evidência atual:** 224 testes visuais passam em Linux/Windows usando o helper.  
**Evidência ausente:** assertions diretas sobre comprimento RGBA, canais, extremos de gradiente, padrão xadrez, determinismo por seed, cópia/clamp/alpha, extração de bloco, injeção, casos negativos de isValidHex e popcount conhecido.  
**Ação esperada:** criar self-test da implementação real sem duplicar algoritmos, e assegurar que a suíte seja carregada pelo `run-all.js`.  
**Risco:** uma mudança no gerador/oráculo pode produzir testes enganadores ou enfraquecer validações de hash.  
**Severidade:** NORMAL.

### 230-002 — CONTRACT_REVIEW — OPEN
**Encontrado:** `extractBlock` e `injectTextInCenter` são exportados sem qualquer consumer localizado; `countSetBits` é importado por uma suíte, porém não é chamado.  
**Arquivo alvo:** `tests/visual/helpers.js` e consumers visuais.  
**Evidência atual:** pesquisa no repositório encontra somente definição/export para os dois primeiros e definição/export + import para `countSetBits`.  
**Ausente:** uso que justifique a superfície ou teste que fixe seus contratos.  
**Ação esperada:** decidir se são helpers reservados intencionalmente. Se não, remover em alteração separada; se sim, adicionar uso/teste explícito.  
**Risco:** dead surface pode divergir silenciosamente e transmitir falsa impressão de cobertura.  
**Severidade:** NORMAL.

### 230-003 — DOCUMENTATION_MISMATCH — OPEN
**Encontrado:** o comentário de `mangaPage` afirma “Fundo branco (arte): toda a imagem”, enquanto as linhas 79–89 implementam um gradiente/sombreamento cinza; branco é aplicado apenas ao balão.  
**Arquivo alvo:** `tests/visual/helpers.js`.  
**Evidência atual:** comentário e implementação no mesmo blob são contraditórios.  
**Ausente:** indicação de que o gradiente seja acidental; consumers atuais parecem depender da estrutura suave.  
**Ação esperada:** confirmar a intenção e alinhar o comentário (ou, se a intenção funcional for realmente fundo branco, tratar a mudança funcional separadamente com testes).  
**Risco:** manutenção futura pode “corrigir” o lado errado e alterar fixtures cross-language.  
**Severidade:** NORMAL.

## 17. Fonte integral auditada

```js
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// helpers.js — Fábricas de imageData controladas para os testes
// Gera Uint8ClampedArray RGBA representando padrões de pixel determinísticos.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria uma imageData RGBA sólida de uma cor.
 * @param {number} width
 * @param {number} height
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @param {number} a 0-255
 * @returns {Uint8ClampedArray}
 */
function solidColor(width, height, r = 128, g = 128, b = 128, a = 255) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data[i * 4]     = r;
        data[i * 4 + 1] = g;
        data[i * 4 + 2] = b;
        data[i * 4 + 3] = a;
    }
    return data;
}

/**
 * Cria uma imageData com gradiente horizontal (esquerda escura → direita clara).
 * Simula arte de mangá (traços, screentones).
 */
function horizontalGradient(width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const v = Math.round((c / (width - 1)) * 255);
            const i = (r * width + c) * 4;
            data[i]     = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
    }
    return data;
}

/**
 * Cria uma imageData com padrão de xadrez (preto e branco).
 * Simula screentone de mangá.
 */
function checkerboard(width, height, cellSize = 4) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const v = ((Math.floor(r / cellSize) + Math.floor(c / cellSize)) % 2 === 0) ? 255 : 0;
            const i = (r * width + c) * 4;
            data[i]     = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
    }
    return data;
}

/**
 * Cria imageData de uma "página de mangá" sintética:
 *   - Fundo branco (arte): toda a imagem
 *   - Balão de texto no centro: pixels pretos simulando texto
 *
 * Usado para testar que wHash/pHash são robustos ao texto no balão.
 *
 * @param {number} width
 * @param {number} height
 * @param {string} textPattern  'EN' (padrão H-e-l-l-o) ou 'PT' (padrão O-l-á)
 * @returns {Uint8ClampedArray}
 */
function mangaPage(width, height, textPattern = 'EN') {
    // Base: arte com gradiente suave (baixa frequência = dominante na LL Haar)
    const data = new Uint8ClampedArray(width * height * 4);
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            // Arte: gradiente diagonal suave simulando sombreamento
            const artValue = Math.round(180 + 60 * Math.sin(r / height * Math.PI) * Math.cos(c / width * Math.PI));
            const i = (r * width + c) * 4;
            data[i] = data[i+1] = data[i+2] = artValue;
            data[i+3] = 255;
        }
    }

    // Balão de texto no centro (região de alta frequência)
    // EN: padrão de pixels representando "HELLO" (mais pixels preenchidos à esquerda)
    // PT: padrão de pixels representando "OLÁ"  (menos pixels, distribuição diferente)
    const balloonTop    = Math.floor(height * 0.35);
    const balloonBottom = Math.floor(height * 0.65);
    const balloonLeft   = Math.floor(width  * 0.25);
    const balloonRight  = Math.floor(width  * 0.75);

    // Fundo do balão: branco
    for (let r = balloonTop; r < balloonBottom; r++) {
        for (let c = balloonLeft; c < balloonRight; c++) {
            const i = (r * width + c) * 4;
            data[i] = data[i+1] = data[i+2] = 255; // branco
        }
    }

    // Texto simulado: sequência de pixels pretos em padrão diferente por idioma
    // EN: preenche colunas ímpares da metade esquerda (simula H-E-L-L-O mais largo)
    // PT: preenche colunas pares da metade direita (simula O-L-Á mais estreito)
    const textRow = Math.floor((balloonTop + balloonBottom) / 2);
    const textHeight = Math.max(1, Math.floor((balloonBottom - balloonTop) * 0.4));

    if (textPattern === 'EN') {
        // "HELLO!" — texto longo, ocupa 70% da largura do balão
        for (let dr = -textHeight; dr <= textHeight; dr++) {
            for (let dc = 0; dc < Math.floor((balloonRight - balloonLeft) * 0.7); dc++) {
                if (dc % 3 !== 1) { // padrão de letra
                    const r = textRow + dr;
                    const c = balloonLeft + dc;
                    if (r >= 0 && r < height && c >= 0 && c < width) {
                        const i = (r * width + c) * 4;
                        data[i] = data[i+1] = data[i+2] = 10; // quase preto
                    }
                }
            }
        }
    } else {
        // "OLÁ!" — texto curto, ocupa 40% da largura do balão
        for (let dr = -textHeight; dr <= textHeight; dr++) {
            for (let dc = 0; dc < Math.floor((balloonRight - balloonLeft) * 0.4); dc++) {
                if (dc % 4 !== 2) { // padrão de letra diferente
                    const r = textRow + dr;
                    const c = balloonLeft + Math.floor((balloonRight - balloonLeft) * 0.3) + dc;
                    if (r >= 0 && r < height && c >= 0 && c < width) {
                        const i = (r * width + c) * 4;
                        data[i] = data[i+1] = data[i+2] = 15; // quase preto
                    }
                }
            }
        }
    }

    return data;
}

/**
 * Cria imageData completamente diferente (ruído pseudo-aleatório determinístico).
 */
function noise(width, height, seed = 42) {
    const data = new Uint8ClampedArray(width * height * 4);
    let s = seed;
    for (let i = 0; i < width * height; i++) {
        // LCG simples para determinismo
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        const v = (s >>> 24) & 0xff;
        data[i * 4]     = v;
        data[i * 4 + 1] = (v + 85) & 0xff;
        data[i * 4 + 2] = (v + 170) & 0xff;
        data[i * 4 + 3] = 255;
    }
    return data;
}

/**
 * Cria imageData idêntica mas com brilho globalmente alterado (+delta).
 * Usado para testar robustez do pHash (DC excluído).
 */
function brightnessShifted(baseData, delta = 30) {
    const data = new Uint8ClampedArray(baseData.length);
    for (let i = 0; i < baseData.length; i++) {
        if ((i % 4) === 3) { data[i] = baseData[i]; continue; } // alpha inalterado
        data[i] = Math.min(255, Math.max(0, baseData[i] + delta));
    }
    return data;
}

/**
 * Extrai a sub-imageData de um bloco dentro de um canvas maior.
 * Usado para verificar que _blockWHash16 processa a região correta.
 */
function extractBlock(fullData, fullWidth, startRow, startCol, blockH, blockW) {
    const out = new Uint8ClampedArray(blockH * blockW * 4);
    for (let r = 0; r < blockH; r++) {
        for (let c = 0; c < blockW; c++) {
            const srcIdx = ((startRow + r) * fullWidth + (startCol + c)) * 4;
            const dstIdx = (r * blockW + c) * 4;
            out[dstIdx]     = fullData[srcIdx];
            out[dstIdx + 1] = fullData[srcIdx + 1];
            out[dstIdx + 2] = fullData[srcIdx + 2];
            out[dstIdx + 3] = fullData[srcIdx + 3];
        }
    }
    return out;
}

/**
 * Injeta "texto" no centro de uma imageData existente (destrói pixels centrais).
 * Simula a diferença entre versão EN e PT da mesma página.
 */
function injectTextInCenter(data, width, height, textSeed = 0) {
    const out = new Uint8ClampedArray(data);
    const midR = Math.floor(height * 0.4);
    const midC = Math.floor(width  * 0.25);
    const textW = Math.floor(width * 0.5);
    const textH = Math.floor(height * 0.2);
    let s = textSeed;
    for (let r = midR; r < midR + textH; r++) {
        for (let c = midC; c < midC + textW; c++) {
            s = (s * 1664525 + 1013904223) & 0xffffffff;
            const v = (s >>> 26) < 3 ? 0 : 255; // maioria branca, alguns pixels pretos (texto)
            const i = (r * width + c) * 4;
            out[i] = out[i+1] = out[i+2] = v;
        }
    }
    return out;
}

/**
 * Verifica se uma string é hex lowercase válida de comprimento esperado.
 */
function isValidHex(str, expectedLen) {
    if (typeof str !== 'string') return false;
    if (expectedLen !== undefined && str.length !== expectedLen) return false;
    return /^[0-9a-f]+$/.test(str);
}

/**
 * Conta quantos bits são 1 em uma string hex.
 */
function countSetBits(hexStr) {
    let count = 0;
    for (const ch of hexStr) {
        let n = parseInt(ch, 16);
        while (n) { count += n & 1; n >>>= 1; }
    }
    return count;
}

module.exports = {
    solidColor, horizontalGradient, checkerboard, mangaPage,
    noise, brightnessShifted, extractBlock, injectTextInCenter,
    isValidHex, countSetBits,
};
```

## 18. Mapa linha por linha

| Linha | Unidade e conteúdo | Evidência |
|---:|---|---|
| 1 | cabeçalho/JSDoc solidColor — 'use strict'; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 2 | cabeçalho/JSDoc solidColor — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 3 | cabeçalho/JSDoc solidColor — // helpers.js — Fábricas de imageData controladas para os testes | estrutural/documental |
| 4 | cabeçalho/JSDoc solidColor — // Gera Uint8ClampedArray RGBA representando padrões de pixel determinísticos. | estrutural/documental |
| 5 | cabeçalho/JSDoc solidColor — // ───────────────────────────────────────────────────────────────────────────── | estrutural/documental |
| 6 | cabeçalho/JSDoc solidColor — (linha em branco) | estrutural/documental |
| 7 | cabeçalho/JSDoc solidColor — /** | estrutural/documental |
| 8 | cabeçalho/JSDoc solidColor — * Cria uma imageData RGBA sólida de uma cor. | estrutural/documental |
| 9 | cabeçalho/JSDoc solidColor — * @param {number} width | estrutural/documental |
| 10 | cabeçalho/JSDoc solidColor — * @param {number} height | estrutural/documental |
| 11 | cabeçalho/JSDoc solidColor — * @param {number} r 0-255 | estrutural/documental |
| 12 | cabeçalho/JSDoc solidColor — * @param {number} g 0-255 | estrutural/documental |
| 13 | cabeçalho/JSDoc solidColor — * @param {number} b 0-255 | estrutural/documental |
| 14 | cabeçalho/JSDoc solidColor — * @param {number} a 0-255 | estrutural/documental |
| 15 | cabeçalho/JSDoc solidColor — * @returns {Uint8ClampedArray} | estrutural/documental |
| 16 | cabeçalho/JSDoc solidColor — */ | estrutural/documental |
| 17 | solidColor — function solidColor(width, height, r = 128, g = 128, b = 128, a = 255) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 18 | solidColor — const data = new Uint8ClampedArray(width * height * 4); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 19 | solidColor — for (let i = 0; i < width * height; i++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 20 | solidColor — data[i * 4]     = r; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 21 | solidColor — data[i * 4 + 1] = g; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 22 | solidColor — data[i * 4 + 2] = b; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 23 | solidColor — data[i * 4 + 3] = a; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 24 | solidColor — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 25 | solidColor — return data; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 26 | solidColor — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 27 | solidColor — (linha em branco) | estrutural/documental |
| 28 | horizontalGradient — /** | estrutural/documental |
| 29 | horizontalGradient — * Cria uma imageData com gradiente horizontal (esquerda escura → direita clara). | estrutural/documental |
| 30 | horizontalGradient — * Simula arte de mangá (traços, screentones). | estrutural/documental |
| 31 | horizontalGradient — */ | estrutural/documental |
| 32 | horizontalGradient — function horizontalGradient(width, height) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 33 | horizontalGradient — const data = new Uint8ClampedArray(width * height * 4); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 34 | horizontalGradient — for (let r = 0; r < height; r++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 35 | horizontalGradient — for (let c = 0; c < width; c++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 36 | horizontalGradient — const v = Math.round((c / (width - 1)) * 255); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 37 | horizontalGradient — const i = (r * width + c) * 4; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 38 | horizontalGradient — data[i]     = v; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 39 | horizontalGradient — data[i + 1] = v; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 40 | horizontalGradient — data[i + 2] = v; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 41 | horizontalGradient — data[i + 3] = 255; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 42 | horizontalGradient — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 43 | horizontalGradient — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 44 | horizontalGradient — return data; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 45 | horizontalGradient — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 46 | horizontalGradient — (linha em branco) | estrutural/documental |
| 47 | checkerboard — /** | estrutural/documental |
| 48 | checkerboard — * Cria uma imageData com padrão de xadrez (preto e branco). | estrutural/documental |
| 49 | checkerboard — * Simula screentone de mangá. | estrutural/documental |
| 50 | checkerboard — */ | estrutural/documental |
| 51 | checkerboard — function checkerboard(width, height, cellSize = 4) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 52 | checkerboard — const data = new Uint8ClampedArray(width * height * 4); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 53 | checkerboard — for (let r = 0; r < height; r++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 54 | checkerboard — for (let c = 0; c < width; c++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 55 | checkerboard — const v = ((Math.floor(r / cellSize) + Math.floor(c / cellSize)) % 2 === 0) ? 255 : 0; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 56 | checkerboard — const i = (r * width + c) * 4; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 57 | checkerboard — data[i]     = v; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 58 | checkerboard — data[i + 1] = v; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 59 | checkerboard — data[i + 2] = v; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 60 | checkerboard — data[i + 3] = 255; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 61 | checkerboard — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 62 | checkerboard — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 63 | checkerboard — return data; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 64 | checkerboard — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 65 | checkerboard — (linha em branco) | estrutural/documental |
| 66 | checkerboard — /** | estrutural/documental |
| 67 | mangaPage — * Cria imageData de uma "página de mangá" sintética: | estrutural/documental |
| 68 | mangaPage — *   - Fundo branco (arte): toda a imagem | estrutural/documental |
| 69 | mangaPage — *   - Balão de texto no centro: pixels pretos simulando texto | estrutural/documental |
| 70 | mangaPage — * | estrutural/documental |
| 71 | mangaPage — * Usado para testar que wHash/pHash são robustos ao texto no balão. | estrutural/documental |
| 72 | mangaPage — * | estrutural/documental |
| 73 | mangaPage — * @param {number} width | estrutural/documental |
| 74 | mangaPage — * @param {number} height | estrutural/documental |
| 75 | mangaPage — * @param {string} textPattern  'EN' (padrão H-e-l-l-o) ou 'PT' (padrão O-l-á) | estrutural/documental |
| 76 | mangaPage — * @returns {Uint8ClampedArray} | estrutural/documental |
| 77 | mangaPage — */ | estrutural/documental |
| 78 | mangaPage — function mangaPage(width, height, textPattern = 'EN') { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 79 | mangaPage — // Base: arte com gradiente suave (baixa frequência = dominante na LL Haar) | estrutural/documental |
| 80 | mangaPage — const data = new Uint8ClampedArray(width * height * 4); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 81 | mangaPage — for (let r = 0; r < height; r++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 82 | mangaPage — for (let c = 0; c < width; c++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 83 | mangaPage — // Arte: gradiente diagonal suave simulando sombreamento | estrutural/documental |
| 84 | mangaPage — const artValue = Math.round(180 + 60 * Math.sin(r / height * Math.PI) * Math.cos(c / widt... | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 85 | mangaPage — const i = (r * width + c) * 4; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 86 | mangaPage — data[i] = data[i+1] = data[i+2] = artValue; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 87 | mangaPage — data[i+3] = 255; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 88 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 89 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 90 | mangaPage — (linha em branco) | estrutural/documental |
| 91 | mangaPage — // Balão de texto no centro (região de alta frequência) | estrutural/documental |
| 92 | mangaPage — // EN: padrão de pixels representando "HELLO" (mais pixels preenchidos à esquerda) | estrutural/documental |
| 93 | mangaPage — // PT: padrão de pixels representando "OLÁ"  (menos pixels, distribuição diferente) | estrutural/documental |
| 94 | mangaPage — const balloonTop    = Math.floor(height * 0.35); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 95 | mangaPage — const balloonBottom = Math.floor(height * 0.65); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 96 | mangaPage — const balloonLeft   = Math.floor(width  * 0.25); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 97 | mangaPage — const balloonRight  = Math.floor(width  * 0.75); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 98 | mangaPage — (linha em branco) | estrutural/documental |
| 99 | mangaPage — // Fundo do balão: branco | estrutural/documental |
| 100 | mangaPage — for (let r = balloonTop; r < balloonBottom; r++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 101 | mangaPage — for (let c = balloonLeft; c < balloonRight; c++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 102 | mangaPage — const i = (r * width + c) * 4; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 103 | mangaPage — data[i] = data[i+1] = data[i+2] = 255; // branco | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 104 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 105 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 106 | mangaPage — (linha em branco) | estrutural/documental |
| 107 | mangaPage — // Texto simulado: sequência de pixels pretos em padrão diferente por idioma | estrutural/documental |
| 108 | mangaPage — // EN: preenche colunas ímpares da metade esquerda (simula H-E-L-L-O mais largo) | estrutural/documental |
| 109 | mangaPage — // PT: preenche colunas pares da metade direita (simula O-L-Á mais estreito) | estrutural/documental |
| 110 | mangaPage — const textRow = Math.floor((balloonTop + balloonBottom) / 2); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 111 | mangaPage — const textHeight = Math.max(1, Math.floor((balloonBottom - balloonTop) * 0.4)); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 112 | mangaPage — (linha em branco) | estrutural/documental |
| 113 | mangaPage — if (textPattern === 'EN') { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 114 | mangaPage — // "HELLO!" — texto longo, ocupa 70% da largura do balão | estrutural/documental |
| 115 | mangaPage — for (let dr = -textHeight; dr <= textHeight; dr++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 116 | mangaPage — for (let dc = 0; dc < Math.floor((balloonRight - balloonLeft) * 0.7); dc++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 117 | mangaPage — if (dc % 3 !== 1) { // padrão de letra | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 118 | mangaPage — const r = textRow + dr; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 119 | mangaPage — const c = balloonLeft + dc; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 120 | mangaPage — if (r >= 0 && r < height && c >= 0 && c < width) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 121 | mangaPage — const i = (r * width + c) * 4; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 122 | mangaPage — data[i] = data[i+1] = data[i+2] = 10; // quase preto | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 123 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 124 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 125 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 126 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 127 | mangaPage — } else { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 128 | mangaPage — // "OLÁ!" — texto curto, ocupa 40% da largura do balão | estrutural/documental |
| 129 | mangaPage — for (let dr = -textHeight; dr <= textHeight; dr++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 130 | mangaPage — for (let dc = 0; dc < Math.floor((balloonRight - balloonLeft) * 0.4); dc++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 131 | mangaPage — if (dc % 4 !== 2) { // padrão de letra diferente | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 132 | mangaPage — const r = textRow + dr; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 133 | mangaPage — const c = balloonLeft + Math.floor((balloonRight - balloonLeft) * 0.3) + dc; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 134 | mangaPage — if (r >= 0 && r < height && c >= 0 && c < width) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 135 | mangaPage — const i = (r * width + c) * 4; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 136 | mangaPage — data[i] = data[i+1] = data[i+2] = 15; // quase preto | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 137 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 138 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 139 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 140 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 141 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 142 | mangaPage — (linha em branco) | estrutural/documental |
| 143 | mangaPage — return data; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 144 | mangaPage — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 145 | mangaPage — (linha em branco) | estrutural/documental |
| 146 | mangaPage — /** | estrutural/documental |
| 147 | noise — * Cria imageData completamente diferente (ruído pseudo-aleatório determinístico). | estrutural/documental |
| 148 | noise — */ | estrutural/documental |
| 149 | noise — function noise(width, height, seed = 42) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 150 | noise — const data = new Uint8ClampedArray(width * height * 4); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 151 | noise — let s = seed; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 152 | noise — for (let i = 0; i < width * height; i++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 153 | noise — // LCG simples para determinismo | estrutural/documental |
| 154 | noise — s = (s * 1664525 + 1013904223) & 0xffffffff; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 155 | noise — const v = (s >>> 24) & 0xff; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 156 | noise — data[i * 4]     = v; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 157 | noise — data[i * 4 + 1] = (v + 85) & 0xff; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 158 | noise — data[i * 4 + 2] = (v + 170) & 0xff; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 159 | noise — data[i * 4 + 3] = 255; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 160 | noise — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 161 | noise — return data; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 162 | noise — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 163 | brightnessShifted — (linha em branco) | estrutural/documental |
| 164 | brightnessShifted — /** | estrutural/documental |
| 165 | brightnessShifted — * Cria imageData idêntica mas com brilho globalmente alterado (+delta). | estrutural/documental |
| 166 | brightnessShifted — * Usado para testar robustez do pHash (DC excluído). | estrutural/documental |
| 167 | brightnessShifted — */ | estrutural/documental |
| 168 | brightnessShifted — function brightnessShifted(baseData, delta = 30) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 169 | brightnessShifted — const data = new Uint8ClampedArray(baseData.length); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 170 | brightnessShifted — for (let i = 0; i < baseData.length; i++) { | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 171 | brightnessShifted — if ((i % 4) === 3) { data[i] = baseData[i]; continue; } // alpha inalterado | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 172 | brightnessShifted — data[i] = Math.min(255, Math.max(0, baseData[i] + delta)); | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 173 | brightnessShifted — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 174 | brightnessShifted — return data; | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 175 | brightnessShifted — } | 🟨 EXECUTADO INDIRETAMENTE pelos testes visuais reais |
| 176 | brightnessShifted — (linha em branco) | estrutural/documental |
| 177 | extractBlock — /** | estrutural/documental |
| 178 | extractBlock — * Extrai a sub-imageData de um bloco dentro de um canvas maior. | estrutural/documental |
| 179 | extractBlock — * Usado para verificar que _blockWHash16 processa a região correta. | estrutural/documental |
| 180 | extractBlock — */ | estrutural/documental |
| 181 | extractBlock — function extractBlock(fullData, fullWidth, startRow, startCol, blockH, blockW) { | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 182 | extractBlock — const out = new Uint8ClampedArray(blockH * blockW * 4); | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 183 | extractBlock — for (let r = 0; r < blockH; r++) { | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 184 | extractBlock — for (let c = 0; c < blockW; c++) { | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 185 | extractBlock — const srcIdx = ((startRow + r) * fullWidth + (startCol + c)) * 4; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 186 | extractBlock — const dstIdx = (r * blockW + c) * 4; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 187 | extractBlock — out[dstIdx]     = fullData[srcIdx]; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 188 | extractBlock — out[dstIdx + 1] = fullData[srcIdx + 1]; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 189 | extractBlock — out[dstIdx + 2] = fullData[srcIdx + 2]; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 190 | extractBlock — out[dstIdx + 3] = fullData[srcIdx + 3]; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 191 | extractBlock — } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 192 | extractBlock — } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 193 | extractBlock — return out; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 194 | extractBlock — } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 195 | injectTextInCenter — (linha em branco) | estrutural/documental |
| 196 | injectTextInCenter — /** | estrutural/documental |
| 197 | injectTextInCenter — * Injeta "texto" no centro de uma imageData existente (destrói pixels centrais). | estrutural/documental |
| 198 | injectTextInCenter — * Simula a diferença entre versão EN e PT da mesma página. | estrutural/documental |
| 199 | injectTextInCenter — */ | estrutural/documental |
| 200 | injectTextInCenter — function injectTextInCenter(data, width, height, textSeed = 0) { | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 201 | injectTextInCenter — const out = new Uint8ClampedArray(data); | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 202 | injectTextInCenter — const midR = Math.floor(height * 0.4); | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 203 | injectTextInCenter — const midC = Math.floor(width  * 0.25); | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 204 | injectTextInCenter — const textW = Math.floor(width * 0.5); | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 205 | injectTextInCenter — const textH = Math.floor(height * 0.2); | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 206 | injectTextInCenter — let s = textSeed; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 207 | injectTextInCenter — for (let r = midR; r < midR + textH; r++) { | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 208 | injectTextInCenter — for (let c = midC; c < midC + textW; c++) { | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 209 | injectTextInCenter — s = (s * 1664525 + 1013904223) & 0xffffffff; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 210 | injectTextInCenter — const v = (s >>> 26) < 3 ? 0 : 255; // maioria branca, alguns pixels pretos (texto) | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 211 | injectTextInCenter — const i = (r * width + c) * 4; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 212 | injectTextInCenter — out[i] = out[i+1] = out[i+2] = v; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 213 | injectTextInCenter — } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 214 | injectTextInCenter — } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 215 | injectTextInCenter — return out; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 216 | injectTextInCenter — } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; sem consumer localizado |
| 217 | isValidHex — (linha em branco) | estrutural/documental |
| 218 | isValidHex — /** | estrutural/documental |
| 219 | isValidHex — * Verifica se uma string é hex lowercase válida de comprimento esperado. | estrutural/documental |
| 220 | isValidHex — */ | estrutural/documental |
| 221 | isValidHex — function isValidHex(str, expectedLen) { | ✅ PROVADO DIRETAMENTE para entradas válidas; negativos sem teste focal |
| 222 | isValidHex — if (typeof str !== 'string') return false; | ✅ PROVADO DIRETAMENTE para entradas válidas; negativos sem teste focal |
| 223 | isValidHex — if (expectedLen !== undefined && str.length !== expectedLen) return false; | ✅ PROVADO DIRETAMENTE para entradas válidas; negativos sem teste focal |
| 224 | isValidHex — return /^[0-9a-f]+$/.test(str); | ✅ PROVADO DIRETAMENTE para entradas válidas; negativos sem teste focal |
| 225 | isValidHex — } | ✅ PROVADO DIRETAMENTE para entradas válidas; negativos sem teste focal |
| 226 | isValidHex — (linha em branco) | estrutural/documental |
| 227 | isValidHex — /** | estrutural/documental |
| 228 | countSetBits — * Conta quantos bits são 1 em uma string hex. | estrutural/documental |
| 229 | countSetBits — */ | estrutural/documental |
| 230 | countSetBits — function countSetBits(hexStr) { | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; export importado mas sem chamada localizada |
| 231 | countSetBits — let count = 0; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; export importado mas sem chamada localizada |
| 232 | countSetBits — for (const ch of hexStr) { | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; export importado mas sem chamada localizada |
| 233 | countSetBits — let n = parseInt(ch, 16); | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; export importado mas sem chamada localizada |
| 234 | countSetBits — while (n) { count += n & 1; n >>>= 1; } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; export importado mas sem chamada localizada |
| 235 | countSetBits — } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; export importado mas sem chamada localizada |
| 236 | countSetBits — return count; | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; export importado mas sem chamada localizada |
| 237 | countSetBits — } | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; export importado mas sem chamada localizada |
| 238 | countSetBits — (linha em branco) | estrutural/documental |
| 239 | exports — module.exports = { | 🟦 GATE ESTÁTICO ESPECÍFICO / imports dos consumers |
| 240 | exports — solidColor, horizontalGradient, checkerboard, mangaPage, | 🟦 GATE ESTÁTICO ESPECÍFICO / imports dos consumers |
| 241 | exports — noise, brightnessShifted, extractBlock, injectTextInCenter, | 🟦 GATE ESTÁTICO ESPECÍFICO / imports dos consumers |
| 242 | exports — isValidHex, countSetBits, | 🟦 GATE ESTÁTICO ESPECÍFICO / imports dos consumers |
| 243 | exports — }; | 🟦 GATE ESTÁTICO ESPECÍFICO / imports dos consumers |
| 244 | newline terminal | 🟦 integridade do blob reconfirmada |

## 19. Invariantes

1. Todas as fábricas retornam buffers novos, salvo que recebem input apenas para copiá-lo/transformá-lo.
2. As imagens geradas usam layout RGBA intercalado.
3. Alpha é 255 nos geradores primários; brightnessShifted e injectTextInCenter preservam alpha existente.
4. Seeds devem manter determinismo para que testes visuais sejam reproduzíveis.
5. Fixtures EN/PT precisam permanecer suficientemente semelhantes para cenários cross-language e suficientemente distintas no texto.
6. noise deve permanecer estruturalmente distinto das páginas sintéticas usadas nos thresholds atuais.
7. isValidHex é parte do oráculo da suíte e não deve aceitar formato inválido.
8. Nenhum helper deve depender de estado global, rede ou relógio.
9. Mudanças nos padrões de pixels podem exigir reinterpretação dos thresholds, mesmo sem tocar em código de produção.
10. Código morto/export sem uso não deve ser tratado como comportamento coberto.

## 20. Casos-limite e pressupostos

- dimensões zero/negativas podem produzir buffers vazios ou RangeError conforme o tamanho calculado;
- horizontalGradient com width=1 calcula NaN antes do clamp do typed array;
- checkerboard com cellSize=0 não possui guard;
- mangaPage trata qualquer padrão diferente de EN como ramo PT;
- loops de texto verificam bounds da imagem, não bounds estritos do balão;
- noise usa coerção bitwise de 32 bits;
- brightnessShifted aceita delta negativo e faz clamp;
- extractBlock não valida retângulo contra origem;
- injectTextInCenter presume que data corresponde às dimensões;
- isValidHex rejeita uppercase e vazio;
- countSetBits não rejeita caracteres inválidos.

## 21. Segurança e confiabilidade

Não há input externo em produção. Os parâmetros vêm da própria suíte. Portanto o risco não é exploração remota, mas **qualidade do teste**: fixtures incorretas podem validar uma propriedade diferente da pretendida.

A ausência de aleatoriedade não determinística é positiva: `noise` e `injectTextInCenter` usam LCG com seed, favorecendo reprodutibilidade.

## 22. Autoauditoria do AGENTE 20

- [x] reserva #230 criada com CREATE ONLY e relida;
- [x] ownership confirmado como AGENTE 20;
- [x] state #230 criado antes da análise;
- [x] SHA do fonte reconfirmado;
- [x] fonte integral incorporada exatamente;
- [x] 243 linhas + newline = 244 posições documentadas;
- [x] consumers e exports pesquisados;
- [x] run visual do mesmo blob verificado em Linux e Windows;
- [x] execução indireta separada de assertions diretas;
- [x] exports sem uso não foram tratados como prova;
- [x] nenhuma fixture/teste/código externo foi alterado;
- [x] lacunas externas foram convertidas em audit_requests.

**Resultado:** Bíblia concluída para `8d740eb3ee276d99c8a82acfb3eada6712e2efed`; solicitações 230-001, 230-002 e 230-003 permanecem OPEN.

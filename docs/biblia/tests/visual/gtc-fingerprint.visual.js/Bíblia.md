# Bíblia técnica — tests/visual/gtc-fingerprint.visual.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `fb66d9d8eb4125fae1ee9c7f93e52a94cdc5e6e7`  
> **Agente responsável:** AGENTE 1  
> **Tipo:** suíte visual/algorítmica Node.js para a API real de fingerprint GTC  
> **Linhas textuais:** 460  
> **Posições documentais:** 461, contando o newline final  
> **Testes declarados:** 76 (`70 it` + `6 ita`)  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/visual/gtc-fingerprint.visual.js` é a suíte visual algorítmica dedicada a `extension/shared/gtc-fingerprint.js`. Ela carrega **a implementação real de produção** por `require('../../extension/shared/gtc-fingerprint.js')`, obtém `globalThis.MangaTranslatorGtcFingerprint` e verifica, com dados sintéticos determinísticos, os contratos de:

- origem textual do fingerprint SHA-256;
- SHA-256 assíncrono;
- wHash baseado em Haar;
- pHash baseado em DCT;
- dHash legado;
- hashes regionais;
- distância de Hamming;
- decisão perceptual combinada wHash+pHash;
- propriedades cross-language usadas para reutilização de tradução.

A suíte não usa DOM, Canvas real, IndexedDB real nem navegador. Os pixels são produzidos por `tests/visual/helpers.js` e passados diretamente às funções puras. Portanto ela é uma prova direta forte das funções algorítmicas chamadas, mas não prova, isoladamente, aquisição de pixels no content script nem persistência/roteamento.

## 2. Wiring e execução

### 2.1 Runner visual

O arquivo importa de `tests/visual/runner.js`:

```js
const { describe, it, ita, beforeEach, expect } = require('./runner.js');
```

Neste arquivo auditado, `beforeEach` é importado mas não é utilizado. O runner:

- executa `it` de forma síncrona;
- serializa `ita` numa Promise queue;
- soma pass/fail/skip;
- aplica baseline global de quantidade e skips em `printSummary()`;
- devolve falha para `run-all.js` quando há falha ou violação do gate.

Uma lacuna do runner, relevante ao ecossistema visual, está registrada em `228-004`: exceções de hooks são capturadas e descartadas.

### 2.2 Agregador visual

`tests/visual/run-all.js` carrega esta suíte primeiro:

```js
require('./gtc-fingerprint.visual.js');
```

Depois carrega as demais suítes, espera a fila de `ita`, chama `printSummary()` e encerra com exit code 0/1.

### 2.3 npm e CI

`package.json` define:

```text
"test:visual": "node tests/visual/run-all.js"
"test": "npm run test:ci && npm run test:smoke && npm run test:visual"
```

`.github/workflows/ci.yml` contém job **Visual Tests** com `npm run test:visual`, além de execuções adicionais do mesmo comando e do entrypoint `npm test`.

`scripts/validation/verify-ci-contract.js` protege estaticamente a presença do job `visual`, do comando `npm run test:visual` e do baseline `visual.minTests`.

## 3. Dependências diretas

### Produção

- `extension/shared/gtc-fingerprint.js`
  - blob auditado durante esta investigação: `fa014028d5e2ec9d9ca5d05c1199e1f6c45a2198`;
  - fornece a API testada por `fp`.

### Harness

- `tests/visual/runner.js`
  - blob: `fe34764874cac8961bf6c614f5f6d5f85a599763`.
- `tests/visual/helpers.js`
  - blob: `8d740eb3ee276d99c8a82acfb3eada6712e2efed`;
  - produz `solidColor`, `horizontalGradient`, `checkerboard`, `mangaPage`, `noise`, `brightnessShifted` e valida hex.

`countSetBits` e `beforeEach` são importados no arquivo auditado, mas não possuem uso além da própria importação.

## 4. Estrutura e contagem das suítes

| Faixa | Suíte | Testes | O que prova |
|---|---|---:|---|
| 1–64 | bootstrap + SHA-256 | 10 | serialização da fonte, hash 64-hex, determinismo, diferenciação e crypto injetável |
| 65–97 | Haar via wHash | 3 | validade, diferença estrutural e distância não-zero |
| 98–148 | calculateWHash | 10 | formato, determinismo, erros, alpha ignorado, thresholds cross-language/brilho |
| 149–203 | calculatePHash | 9 | formato, determinismo, erros, brilho, integração perceptual e complementaridade |
| 204–235 | calculateDHash | 6 | compatibilidade 16-hex, determinismo, erro de tamanho e casos uniformes |
| 236–310 | hashes regionais | 11 | shape, formato, estabilidade, match de 4 cantos e opções |
| 311–329 | hammingDistance | 10 | distâncias exatas e entradas ausentes/com comprimentos incompatíveis |
| 330–420 | matchPerceptualHashes | 14 | todos os ramos strict principais, confiança, thresholds e limites |
| 421–460 | simulação cross-language | 3 | mesma arte EN/PT, rejeição de ruído e comparação relativa wHash/dHash |
| 461 | newline final | — | integridade textual do blob |

Total: **76 testes**.

## 5. Suíte 1 — SHA-256

A suíte prova diretamente:

1. `buildFingerprintSource` no caminho de pixels:
   `800:1200:pixels:aabb`;
2. caminho de URL:
   `100:200:url:https://ex.com/img.jpg:nopixels`;
3. defaults vazios;
4. `pixelSample='nopixels'` não sendo tratado como pixels reais;
5. `hashStringSha256` retornando 64 caracteres hex;
6. determinismo para a mesma entrada;
7. diferença entre entradas distintas;
8. uso explícito de `cryptoImpl`;
9. `createFingerprintFromDescriptor` produzindo 64-hex;
10. determinismo do descriptor.

Os seis testes assíncronos desta suíte usam `ita`; o runner os enfileira e `run-all.js` aguarda a fila antes do resumo.

## 6. Suítes wHash e Haar

Os testes usam imagens sintéticas com estrutura espacial controlada.

### Provas diretas

- wHash tem 64 hex chars;
- entrada idêntica é determinística;
- Hamming de um hash consigo mesmo é 0;
- gradient e checkerboard produzem diferença;
- buffers insuficientes e `null` lançam erro;
- canal alpha não altera o hash quando RGB é igual;
- a fixture cross-language EN/PT fica dentro de `WHASH_MATCH_THRESHOLD`;
- ruído fica acima do threshold;
- deslocamento de brilho +30 permanece dentro do threshold na fixture adotada.

### Limite da prova

Esses resultados são sobre as fixtures determinísticas de `helpers.js`. Eles não estabelecem taxa estatística de falsos positivos/falsos negativos sobre um corpus real de páginas de mangá.

## 7. Suíte pHash

A suíte chama `calculatePHash` real e prova:

- 64 hex chars;
- determinismo;
- Hamming 0 para identidade;
- erro em buffer insuficiente e `null`;
- tolerância de brilho da fixture;
- decisão combinada cross-language via `matchPerceptualHashes`;
- wHash e pHash de uma mesma imagem não são a mesma string.

### Claim de cache não provado

O teste:

```text
cosine table lazy-init — second call reuses cache
```

executa duas chamadas e verifica apenas que ambas retornam hex válido. Não observa identidade de cache, contador de inicialização, alocação ou ausência de recomputação. Portanto:

**Classificação:** 🟨 EXECUTADO INDIRETAMENTE para a segunda chamada; **não há prova específica de reutilização do cache**.

A lacuna está em `228-001`.

## 8. Suíte dHash

Prova diretamente:

- saída 16-hex;
- determinismo;
- rejeição de buffer insuficiente;
- imagem toda branca => `0000000000000000`;
- imagem toda preta => `0000000000000000`.

O caso “cross-language Hamming is reported (informational)” apenas exige que o resultado seja `number` e `>=0`. O próprio nome declara intenção informacional: ele não estabelece threshold de qualidade.

## 9. Hashes regionais

A suíte prova:

- objeto com `topLeft`, `topRight`, `bottomLeft`, `bottomRight`;
- 16 hex chars por canto;
- determinismo;
- erro para input curto;
- pelo menos um canto diferente entre gradient e checkerboard;
- fixture EN/PT mantém pelo menos 3 de 4 cantos com Hamming <= 8;
- identidade => `match=true`, `matchCount=4`;
- opção customizada `minMatches`;
- presença de detalhes por canto;
- input `null` => `match=false`, `matchCount=0`.

O teste “different images returns boolean” só fixa o **tipo** do campo `match`; não exige `false`. Isso é deliberadamente mais fraco que uma prova de rejeição semântica e deve ser lido dessa forma.

## 10. hammingDistance

A suíte possui assertions diretas para:

- identidade;
- 64 bits de diferença em 16 hex chars;
- 256 bits de diferença em 64 hex chars;
- comprimentos diferentes;
- `null`;
- `undefined`;
- strings vazias;
- simetria;
- um bit;
- um nibble inteiro.

### Entrada não-hex

A implementação real documenta “`-1 se input inválido`”, mas só rejeita ausência ou tamanhos diferentes. Cada caractere é passado por `parseInt(..., 16)` e operação bitwise; caracteres não hexadecimais não são validados.

`gtc-indexeddb.js::normalizeHash` apenas faz `trim().toLowerCase()`, sem validar formato.

A suíte visual e `tests/unit/gtc/fingerprint.test.js` cobrem `null`/comprimento incompatível, mas não strings não-hex de mesmo comprimento. Isso está em `228-002`.

## 11. matchPerceptualHashes strict

A suíte cobre diretamente os ramos principais do matcher strict:

- ambos casam => `both_match`;
- só wHash => `whash_match`;
- só pHash => `phash_match`;
- ambos muito distantes => `both_reject`;
- grey zone => `both_miss`;
- somente wHash presente => match e miss;
- somente pHash presente => match e miss;
- nenhum hash => `no_hashes`;
- hashes idênticos => confidence próxima de 1;
- confidence cai quando a distância aumenta;
- `wDist`/`pDist` batem com `hammingDistance`;
- thresholds públicos strict = 40/35/80/70;
- limite wDist=40 aceita;
- wDist=41 isolado rejeita.

Essa seção é uma prova executável direta e granular dos ramos strict.

## 12. Função relaxed: evidência está fora deste arquivo

O arquivo #228 **não contém nenhuma chamada** a:

- `matchPerceptualHashesRelaxed`;
- `WHASH_MATCH_THRESHOLD_RELAXED`;
- `PHASH_MATCH_THRESHOLD_RELAXED`;
- `WHASH_REJECT_THRESHOLD_RELAXED`;
- `PHASH_REJECT_THRESHOLD_RELAXED`.

A produção, porém, expõe o matcher relaxed e thresholds 50/45/90/82.

Há evidência direta em `tests/unit/gtc/fingerprint.test.js`, que verifica:

- strict miss + relaxed hit;
- reasons relaxed;
- limite de confidence <= 0.75;
- thresholds públicos;
- `relaxed_both_match`;
- `relaxed_both_reject`.

`tests/visual/integration.visual.js` verifica apenas que os símbolos relaxed estão expostos.

Além disso, `tests/visual/crop.visual.js` contém um teste chamado “matchPerceptualHashes suporta thresholds relaxados”, mas a implementação do teste chama **`fp.matchPerceptualHashes` strict**, com distância 10 — valor que já está dentro do threshold strict. Portanto esse teste não prova o matcher relaxed.

Não existe lacuna global total de automação, pois a suíte Jest unitária prova o comportamento. Existe, contudo, desalinhamento da cobertura/rotulagem visual, registrado em `228-003`.

## 13. Simulação cross-language

A última suíte usa `mangaPage` + `scaleDown` e prova sobre as fixtures:

- EN/PT da mesma arte resultam em match combinado;
- ruído não casa com página de mangá;
- distância relativa de wHash não é maior que a distância relativa de dHash no exemplo.

Isso é útil como regressão determinística de algoritmo. Não deve ser interpretado como benchmark representativo de todos os sites, estilos, resoluções, compressões ou idiomas.

## 14. Evidência de execução real

Foi localizado o GitHub Actions run **36577447500**, job **Visual Tests** **109437162605**, concluído com `success`.

O checkout do job terminou em merge commit `c6d75b8`.

Ao reler `tests/visual/gtc-fingerprint.visual.js` nesse commit, o blob é exatamente:

```text
fb66d9d8eb4125fae1ee9c7f93e52a94cdc5e6e7
```

ou seja, **o mesmo SHA desta Bíblia**.

O log mostra nominalmente as nove suítes deste arquivo. Uma comparação das 76 labels declaradas na fonte contra o log encontrou **76/76 labels presentes**.

O agregado visual terminou:

```text
Passed: 224
Total:  224
```

sem linha de `Failed` nem `Skipped` no resumo.

### Classificação

- Assertions das 76 labels + execução do mesmo blob: ✅ **PROVADO DIRETAMENTE** para as propriedades efetivamente assertadas.
- Wiring do arquivo em `run-all.js`, npm, CI e verify-ci-contract: 🟦 **GATE ESTÁTICO ESPECÍFICO**.
- Claims mais fortes que a assertion real (ex.: “cache reuse”): 🟨 **EXECUTADO INDIRETAMENTE**.
- Comportamento relaxed dentro desta suíte visual: ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO**, embora exista prova unitária direta em outro arquivo.

## 15. Matriz de evidência

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| arquivo é carregado pelo agregador visual | `run-all.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| job CI executa `npm run test:visual` | `ci.yml` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| mesmo blob foi executado | run 36577447500 + blob em `c6d75b8` | ✅ PROVADO DIRETAMENTE |
| 76 labels deste arquivo apareceram no log | comparação fonte↔log | ✅ PROVADO DIRETAMENTE |
| SHA-256 / descriptor | assertions da suíte + run | ✅ PROVADO DIRETAMENTE |
| wHash strict e thresholds exercitados | assertions + run | ✅ PROVADO DIRETAMENTE |
| pHash strict | assertions + run | ✅ PROVADO DIRETAMENTE |
| cache interno da tabela de cosseno é reutilizado | só duas chamadas válidas | 🟨 EXECUTADO INDIRETAMENTE |
| dHash básico | assertions + run | ✅ PROVADO DIRETAMENTE |
| qualidade cross-language do dHash | teste apenas informacional | 🟨 EXECUTADO INDIRETAMENTE |
| hashes regionais | assertions + run | ✅ PROVADO DIRETAMENTE |
| “different images” regional é rejeitado | assertion exige apenas boolean | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para rejeição |
| Hamming para hex válidos e entradas ausentes/len diferente | assertions + run | ✅ PROVADO DIRETAMENTE |
| Hamming rejeita caracteres não-hex | nenhuma assertion; implementação não valida | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| matcher strict | 14 cenários + run | ✅ PROVADO DIRETAMENTE |
| matcher relaxed nesta suíte | zero referências | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| matcher relaxed globalmente | Jest unitário dedicado | ✅ PROVADO DIRETAMENTE em outro arquivo |
| simulação EN/PT sintética | 3 cenários + run | ✅ PROVADO DIRETAMENTE para as fixtures |

## 16. Solicitações ao auditor

### 228-001 — TEST_QUALITY — OPEN

**Encontrado:** o teste `cosine table lazy-init — second call reuses cache` não observa reutilização de cache.

**Arquivo relacionado:** `tests/visual/gtc-fingerprint.visual.js`.

**Evidência atual:** duas chamadas consecutivas de `calculatePHash` retornam hashes 64-hex válidos.

**Evidência ausente:** prova de que a tabela DCT/cosseno não é reconstruída na segunda chamada.

**Necessário:** decidir se “cache reuse” é requisito testável. Se for, usar seam/telemetria controlada ou teste estrutural que não replique a implementação.

**Risco:** refactor pode remover cache e manter o teste verde, degradando desempenho sem quebrar funcionalidade.

**Severidade:** NORMAL.

### 228-002 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** `hammingDistance` documenta `-1` para input inválido, mas não valida caracteres hex; `normalizeHash` só trim/lowercase.

**Arquivos relacionados:** `extension/shared/gtc-fingerprint.js`, `extension/shared/gtc-indexeddb.js`, `tests/unit/gtc/fingerprint.test.js`.

**Evidência atual:** a implementação rejeita ausência/tamanho diferente e processa cada caractere com `parseInt(...,16)` + bitwise; os testes usam hashes hex válidos e casos `null`/len diferente.

**Evidência ausente:** comportamento definido e assertion para string não-hex de mesmo tamanho.

**Necessário:** decidir se hashes malformados devem retornar `-1`/ser rejeitados; se sim, endurecer validação em mudança funcional separada e adicionar regressões para matcher e repository.

**Risco:** hash persistido/corrompido não-hex pode produzir distância subestimada e potencial falso match.

**Severidade:** NORMAL.

### 228-003 — TEST_SUITE_SCOPE_REVIEW — OPEN

**Encontrado:** a suíte dedicada visual não chama o matcher relaxed; `crop.visual.js` possui label dizendo “thresholds relaxados”, mas chama o matcher strict com distância já aceita pelo strict.

**Arquivos relacionados:** `tests/visual/crop.visual.js`, `tests/visual/integration.visual.js`, `tests/unit/gtc/fingerprint.test.js`.

**Evidência atual:** Jest unitário possui cobertura direta boa do matcher relaxed; integração visual prova apenas export dos símbolos.

**Evidência ausente:** caso visual que execute realmente `matchPerceptualHashesRelaxed`, ou rotulagem que deixe claro que a prova relaxed pertence apenas ao Jest unitário.

**Necessário:** alinhar claim e cobertura; não é necessário duplicar teste se a política aceitar a cobertura unitária como fonte única.

**Risco:** relatório visual pode sugerir cobertura de um caminho que, naquele conjunto, não foi executado.

**Severidade:** LOW.

### 228-004 — TEST_HARNESS_ROBUSTNESS — OPEN

**Encontrado:** `tests/visual/runner.js` engole exceções de `beforeEach` e `afterEach` tanto no caminho síncrono quanto no assíncrono.

**Contexto:** #228 importa `beforeEach` sem usar; outras suítes visuais, especialmente `gtc-indexeddb.visual.js` e `crop.visual.js`, usam hooks.

**Evidência atual:** runner contém `try { bf(); } catch (_e) {}` / equivalente async e o mesmo para after hooks.

**Evidência ausente:** self-test do runner que force hook a lançar/rejeitar e exija resultado vermelho.

**Necessário:** decidir política fail-closed; se hooks forem parte do contrato de teste, exceção de setup/teardown deve virar falha observável em alteração separada.

**Risco:** erro de preparação/cleanup pode ser silenciado e produzir falso verde ou estado contaminado.

**Severidade:** HIGH.

### 228-005 — SOURCE_DOCUMENTATION_CORRECTION — OPEN

**Encontrado:** cabeçalho da suíte ainda diz `MangaTranslator v3.3`, enquanto `package.json` está em `6.5.0` e `run-all.js` deriva a versão atual dinamicamente.

**Arquivo relacionado:** `tests/visual/gtc-fingerprint.visual.js`.

**Evidência atual:** comentário estático na linha 2 versus package version 6.5.0.

**Necessário:** remover a versão hardcoded ou alinhá-la a uma fonte única em alteração documental do fonte.

**Risco:** confusão de manutenção/auditoria; sem impacto runtime.

**Severidade:** LOW.

## 17. Mapa de linhas contíguas

| Faixa | Conteúdo |
|---:|---|
| 1–3 | strict mode e cabeçalho histórico |
| 4–11 | global, require da implementação real, runner/helpers e `fp` |
| 12–15 | separador/identificação da suíte 1 |
| 16–60 | SHA-256 / descriptor |
| 61–64 | separação para Haar |
| 65–93 | Haar via wHash |
| 94–97 | separação para wHash |
| 98–144 | wHash visual-v3 |
| 145–148 | separação para pHash |
| 149–199 | pHash visual-v3 |
| 200–203 | separação para dHash |
| 204–231 | dHash |
| 232–235 | separação regional |
| 236–306 | hashes regionais |
| 307–310 | separação Hamming |
| 311–326 | distância de Hamming |
| 327–329 | separação matcher |
| 330–416 | `matchPerceptualHashes` strict + helper `makeH` |
| 417–420 | separação cross-language |
| 421–460 | `scaleDown` e simulação cross-language |
| 461 | newline final |

As faixas são contíguas e cobrem **461/461 posições documentais**.

## 18. Side effects e isolamento

Ao ser requerido, o arquivo:

- atribui `globalThis.self = globalThis`;
- carrega `gtc-fingerprint.js`, que publica API em `globalThis.MangaTranslatorGtcFingerprint`;
- registra testes no runner compartilhado;
- executa imediatamente testes síncronos durante o `require`;
- enfileira seis testes assíncronos;
- escreve logs pelos testes informacionais e pelo runner.

Ele não grava arquivos, não altera código do projeto e não acessa rede.

## 19. Fonte integral auditada

```js
'use strict';
// test_gtc_fingerprint.js — MangaTranslator v3.3
// Testes completos para gtc-fingerprint.js visual-v3

globalThis.self = globalThis;
require('../../extension/shared/gtc-fingerprint.js');

const { describe, it, ita, beforeEach, expect } = require('./runner.js');
const { solidColor, horizontalGradient, checkerboard, mangaPage,
        noise, brightnessShifted, isValidHex, countSetBits } = require('./helpers.js');
const fp = globalThis.MangaTranslatorGtcFingerprint;

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — SHA-256
// ─────────────────────────────────────────────────────────────────────────────
describe('SHA-256 fingerprint (visual-v1/v2)', () => {
    it('buildFingerprintSource — pixels path', () => {
        const s = fp.buildFingerprintSource({ width:800, height:1200, pixelSample:'aabb', hasVisualPixels:true });
        expect(s).toBe('800:1200:pixels:aabb');
    });
    it('buildFingerprintSource — url path', () => {
        const s = fp.buildFingerprintSource({ width:100, height:200, cleanUrl:'https://ex.com/img.jpg', hasVisualPixels:false });
        expect(s).toBe('100:200:url:https://ex.com/img.jpg:nopixels');
    });
    it('buildFingerprintSource — empty defaults', () => {
        expect(fp.buildFingerprintSource({})).toBe('0:0:url::nopixels');
    });
    it('buildFingerprintSource — pixelSample=nopixels ignored', () => {
        const s = fp.buildFingerprintSource({ width:1, height:1, pixelSample:'nopixels', hasVisualPixels:true });
        expect(s).not.toMatch(':pixels:');
    });
    ita('hashStringSha256 — 64 hex chars', async () => {
        const h = await fp.hashStringSha256('hello world');
        expect(h).toHaveLength(64);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
    ita('hashStringSha256 — deterministic', async () => {
        const h1 = await fp.hashStringSha256('manga-page-test');
        const h2 = await fp.hashStringSha256('manga-page-test');
        expect(h1).toBe(h2);
    });
    ita('hashStringSha256 — different inputs differ', async () => {
        const h1 = await fp.hashStringSha256('input-a');
        const h2 = await fp.hashStringSha256('input-b');
        expect(h1).not.toBe(h2);
    });
    ita('hashStringSha256 — injected cryptoImpl', async () => {
        const h = await fp.hashStringSha256('test', { cryptoImpl: globalThis.crypto });
        expect(h).toHaveLength(64);
    });
    ita('createFingerprintFromDescriptor — 64 chars', async () => {
        const h = await fp.createFingerprintFromDescriptor({ width:800, height:1200, pixelSample:'deadbeef', hasVisualPixels:true });
        expect(h).toHaveLength(64);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
    ita('createFingerprintFromDescriptor — deterministic', async () => {
        const d = { width:500, height:700, cleanUrl:'https://cdn.site.com/p1.jpg', hasVisualPixels:false };
        expect(await fp.createFingerprintFromDescriptor(d)).toBe(await fp.createFingerprintFromDescriptor(d));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — Haar DWT primitives (via calculateWHash behaviour)
// ─────────────────────────────────────────────────────────────────────────────
describe('Haar DWT — primitivas (via calculateWHash)', () => {
    it('constant image produces valid hex wHash', () => {
        // Constant image: all LL coefficients equal → all bits compare vs same median
        // Result is deterministic (all-zero or all-one nibbles), always a valid 64-char hex
        const data = solidColor(32, 32, 128, 128, 128);
        const hash = fp.calculateWHash(data);
        expect(isValidHex(hash, 64)).toBeTruthy();
    });

    it('two differently-structured images have different wHashes', () => {
        // Use images with genuine spatial variation, not constants
        const img1 = horizontalGradient(32, 32);         // left→right gradient
        const img2 = checkerboard(32, 32, 4);            // high-freq checkerboard
        const h1 = fp.calculateWHash(img1);
        const h2 = fp.calculateWHash(img2);
        expect(h1).not.toBe(h2);
    });

    it('DWT low-pass captures gross structure — gradient wHash ≠ checkerboard wHash', () => {
        // Validates that LL subband behaves differently for low-freq vs high-freq content
        const gradient = horizontalGradient(32, 32);
        const check    = checkerboard(32, 32, 2);
        const hG = fp.calculateWHash(gradient);
        const hC = fp.calculateWHash(check);
        const d  = fp.hammingDistance(hG, hC);
        // Genuinely different images → non-zero distance
        expect(d).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — calculateWHash
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateWHash (Haar Wavelet, visual-v3)', () => {
    it('returns 64 hex chars', () => {
        expect(isValidHex(fp.calculateWHash(solidColor(32,32,200,100,50)), 64)).toBeTruthy();
    });
    it('deterministic — same imageData → same hash', () => {
        const data = horizontalGradient(32, 32);
        expect(fp.calculateWHash(data)).toBe(fp.calculateWHash(data));
    });
    it('Hamming = 0 for identical data', () => {
        const data = mangaPage(32, 32, 'EN');
        const h = fp.calculateWHash(data);
        expect(fp.hammingDistance(h, h)).toBe(0);
    });
    it('genuinely different images have non-zero Hamming', () => {
        // Use gradient vs checkerboard — guaranteed structural difference
        const h1 = fp.calculateWHash(horizontalGradient(32, 32));
        const h2 = fp.calculateWHash(checkerboard(32, 32, 2));
        expect(fp.hammingDistance(h1, h2)).toBeGreaterThan(0);
    });
    it('throws for insufficient imageData', () => {
        expect(() => fp.calculateWHash(new Uint8ClampedArray(100))).toThrow();
    });
    it('throws for null', () => {
        expect(() => fp.calculateWHash(null)).toThrow();
    });
    it('alpha channel ignored — same RGB different alpha → same hash', () => {
        const dA = solidColor(32, 32, 100, 150, 200, 255);
        const dB = solidColor(32, 32, 100, 150, 200, 100);
        expect(fp.calculateWHash(dA)).toBe(fp.calculateWHash(dB));
    });
    it('[CROSS-LANGUAGE] same art, different text → wHash Hamming ≤ WHASH_MATCH_THRESHOLD', () => {
        const hEN = fp.calculateWHash(mangaPage(32, 32, 'EN'));
        const hPT = fp.calculateWHash(mangaPage(32, 32, 'PT'));
        expect(fp.hammingDistance(hEN, hPT)).toBeLessThanOrEqual(fp.WHASH_MATCH_THRESHOLD);
    });
    it('[CROSS-LANGUAGE] completely different image → wHash Hamming > WHASH_MATCH_THRESHOLD', () => {
        const hEN    = fp.calculateWHash(mangaPage(32, 32, 'EN'));
        const hNoise = fp.calculateWHash(noise(32, 32, 999));
        expect(fp.hammingDistance(hEN, hNoise)).toBeGreaterThan(fp.WHASH_MATCH_THRESHOLD);
    });
    it('brightness shift +30 stays within match threshold', () => {
        const base    = horizontalGradient(32, 32);
        const shifted = brightnessShifted(base, 30);
        const d = fp.hammingDistance(fp.calculateWHash(base), fp.calculateWHash(shifted));
        expect(d).toBeLessThanOrEqual(fp.WHASH_MATCH_THRESHOLD);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — calculatePHash
// ─────────────────────────────────────────────────────────────────────────────
describe('calculatePHash (DCT separável, visual-v3)', () => {
    it('returns 64 hex chars', () => {
        expect(isValidHex(fp.calculatePHash(solidColor(32,32,128,64,32)), 64)).toBeTruthy();
    });
    it('deterministic', () => {
        const data = checkerboard(32, 32, 4);
        expect(fp.calculatePHash(data)).toBe(fp.calculatePHash(data));
    });
    it('Hamming = 0 for identical data', () => {
        const data = mangaPage(32, 32, 'EN');
        const h = fp.calculatePHash(data);
        expect(fp.hammingDistance(h, h)).toBe(0);
    });
    it('throws for insufficient imageData', () => {
        expect(() => fp.calculatePHash(new Uint8ClampedArray(500))).toThrow();
    });
    it('throws for null', () => {
        expect(() => fp.calculatePHash(null)).toThrow();
    });
    it('cosine table lazy-init — second call reuses cache', () => {
        expect(isValidHex(fp.calculatePHash(solidColor(32,32,100,100,100)), 64)).toBeTruthy();
        expect(isValidHex(fp.calculatePHash(solidColor(32,32,101,101,101)), 64)).toBeTruthy();
    });
    it('[DC-ROBUSTEZ] brightness +40 → pHash Hamming ≤ PHASH_MATCH_THRESHOLD', () => {
        // DC[0,0] excluded from pHash → global brightness shifts don't change hash
        const base    = mangaPage(32, 32, 'EN');
        const shifted = brightnessShifted(base, 40);
        const d = fp.hammingDistance(fp.calculatePHash(base), fp.calculatePHash(shifted));
        expect(d).toBeLessThanOrEqual(fp.PHASH_MATCH_THRESHOLD);
    });
    it('[CROSS-LANGUAGE] via matchPerceptualHashes (pHash alone or combined)', () => {
        // At 32x32, pHash cross-language distance can exceed 35 alone.
        // This is correct — pHash is a COMPLEMENT to wHash, not a replacement.
        // The combined decision (wHash OR pHash) still produces a match.
        const imgEN = mangaPage(32, 32, 'EN');
        const imgPT = mangaPage(32, 32, 'PT');
        const wEN = fp.calculateWHash(imgEN), pEN = fp.calculatePHash(imgEN);
        const wPT = fp.calculateWHash(imgPT), pPT = fp.calculatePHash(imgPT);
        const decision = fp.matchPerceptualHashes(wEN, pEN, wPT, pPT);
        // Combined decision must be a match (even if pHash alone exceeds its threshold)
        expect(decision.match).toBe(true);
    });
    it('wHash and pHash of same image are different strings (complementary algorithms)', () => {
        const data = mangaPage(32, 32, 'EN');
        const hw = fp.calculateWHash(data);
        const hp = fp.calculatePHash(data);
        expect(hw).toHaveLength(64);
        expect(hp).toHaveLength(64);
        expect(hw).not.toBe(hp);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — dHash (visual-v2)
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateDHash (visual-v2) — backward-compat', () => {
    it('returns 16 hex chars', () => {
        const data = new Uint8ClampedArray(9 * 8 * 4); data.fill(128);
        expect(isValidHex(fp.calculateDHash(data), 16)).toBeTruthy();
    });
    it('deterministic', () => {
        const data = new Uint8ClampedArray(9 * 8 * 4);
        for (let i = 0; i < data.length; i++) data[i] = i % 255;
        expect(fp.calculateDHash(data)).toBe(fp.calculateDHash(data));
    });
    it('throws for insufficient imageData', () => {
        expect(() => fp.calculateDHash(new Uint8ClampedArray(100))).toThrow();
    });
    it('all-white image → all bits 0 (left never > right)', () => {
        expect(fp.calculateDHash(solidColor(9, 8, 255, 255, 255))).toBe('0000000000000000');
    });
    it('all-black image → all bits 0 (same logic)', () => {
        expect(fp.calculateDHash(solidColor(9, 8, 0, 0, 0))).toBe('0000000000000000');
    });
    it('cross-language Hamming is reported (informational)', () => {
        const hEN = fp.calculateDHash(mangaPage(9, 8, 'EN'));
        const hPT = fp.calculateDHash(mangaPage(9, 8, 'PT'));
        const d   = fp.hammingDistance(hEN, hPT);
        console.log(`      dHash cross-language Hamming: ${d}/64 bits`);
        expect(typeof d).toBe('number');
        expect(d).toBeGreaterThanOrEqual(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — Regional Hashes
// ─────────────────────────────────────────────────────────────────────────────
describe('Regional Hashes (visual-v3) — 4 cantos 48×48', () => {
    it('returns object with 4 fields', () => {
        const r = fp.calculateRegionalHashes(solidColor(48, 48, 128, 128, 128));
        expect(r).toHaveProperty('topLeft');
        expect(r).toHaveProperty('topRight');
        expect(r).toHaveProperty('bottomLeft');
        expect(r).toHaveProperty('bottomRight');
    });
    it('each field is 16 hex chars', () => {
        const r = fp.calculateRegionalHashes(horizontalGradient(48, 48));
        expect(isValidHex(r.topLeft,    16)).toBeTruthy();
        expect(isValidHex(r.topRight,   16)).toBeTruthy();
        expect(isValidHex(r.bottomLeft, 16)).toBeTruthy();
        expect(isValidHex(r.bottomRight,16)).toBeTruthy();
    });
    it('deterministic', () => {
        const data = mangaPage(48, 48, 'EN');
        const r1 = fp.calculateRegionalHashes(data);
        const r2 = fp.calculateRegionalHashes(data);
        expect(r1.topLeft).toBe(r2.topLeft);
        expect(r1.bottomRight).toBe(r2.bottomRight);
    });
    it('throws for insufficient imageData', () => {
        expect(() => fp.calculateRegionalHashes(new Uint8ClampedArray(100))).toThrow();
    });
    it('genuinely different spatial content → at least one corner differs', () => {
        // Use images with real spatial variation (not pure constants)
        const r1 = fp.calculateRegionalHashes(horizontalGradient(48, 48));
        const r2 = fp.calculateRegionalHashes(checkerboard(48, 48, 4));
        const anyDiff = ['topLeft','topRight','bottomLeft','bottomRight']
            .some(k => r1[k] !== r2[k]);
        expect(anyDiff).toBeTruthy();
    });
    it('[CENTRE-STABLE] text in centre does not change corner hashes', () => {
        const rEN = fp.calculateRegionalHashes(mangaPage(48, 48, 'EN'));
        const rPT = fp.calculateRegionalHashes(mangaPage(48, 48, 'PT'));
        const dTL = fp.hammingDistance(rEN.topLeft,     rPT.topLeft);
        const dTR = fp.hammingDistance(rEN.topRight,    rPT.topRight);
        const dBL = fp.hammingDistance(rEN.bottomLeft,  rPT.bottomLeft);
        const dBR = fp.hammingDistance(rEN.bottomRight, rPT.bottomRight);
        console.log(`      Regional Hamming EN vs PT: TL=${dTL} TR=${dTR} BL=${dBL} BR=${dBR}`);
        const matches = [dTL, dTR, dBL, dBR].filter(d => d <= 8).length;
        expect(matches).toBeGreaterThanOrEqual(3);
    });
    it('matchRegionalHashes — identical → match=true, matchCount=4', () => {
        const r = fp.calculateRegionalHashes(mangaPage(48, 48, 'EN'));
        const result = fp.matchRegionalHashes(r, r);
        expect(result.match).toBe(true);
        expect(result.matchCount).toBe(4);
    });
    it('matchRegionalHashes — different images returns boolean', () => {
        const r1 = fp.calculateRegionalHashes(horizontalGradient(48, 48));
        const r2 = fp.calculateRegionalHashes(noise(48, 48, 12345));
        expect(typeof fp.matchRegionalHashes(r1, r2).match).toBe('boolean');
    });
    it('matchRegionalHashes — respects custom minMatches', () => {
        const r = fp.calculateRegionalHashes(mangaPage(48, 48, 'EN'));
        expect(fp.matchRegionalHashes(r, r, { threshold:8, minMatches:1 }).match).toBe(true);
    });
    it('matchRegionalHashes — returns details per corner', () => {
        const r = fp.calculateRegionalHashes(mangaPage(48, 48, 'EN'));
        const result = fp.matchRegionalHashes(r, r);
        expect(result.details.topLeft.dist).toBe(0);
        expect(result.details.topLeft.match).toBe(true);
    });
    it('matchRegionalHashes — null input → match=false', () => {
        const result = fp.matchRegionalHashes(null, null);
        expect(result.match).toBe(false);
        expect(result.matchCount).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7 — hammingDistance (generalised)
// ─────────────────────────────────────────────────────────────────────────────
describe('hammingDistance (generalizada)', () => {
    it('identical hash → 0',        () => expect(fp.hammingDistance('deadbeef01234567','deadbeef01234567')).toBe(0));
    it('all-0 vs all-f (16 chars) → 64', () => expect(fp.hammingDistance('0'.repeat(16),'f'.repeat(16))).toBe(64));
    it('all-0 vs all-f (64 chars) → 256',() => expect(fp.hammingDistance('0'.repeat(64),'f'.repeat(64))).toBe(256));
    it('different lengths → -1',    () => expect(fp.hammingDistance('abcd','abcdef')).toBe(-1));
    it('null → -1',                 () => { expect(fp.hammingDistance(null,'abcd')).toBe(-1); expect(fp.hammingDistance('abcd',null)).toBe(-1); });
    it('undefined → -1',            () => expect(fp.hammingDistance(undefined,'abcd')).toBe(-1));
    it('empty strings → -1',        () => expect(fp.hammingDistance('','')).toBe(-1));
    it('symmetric: d(a,b)==d(b,a)', () => {
        const h1='a1b2c3d4e5f60718', h2='f0e1d2c3b4a59687';
        expect(fp.hammingDistance(h1,h2)).toBe(fp.hammingDistance(h2,h1));
    });
    it('1 bit difference → 1',  () => expect(fp.hammingDistance('0'+'0'.repeat(15),'1'+'0'.repeat(15))).toBe(1));
    it('full nibble diff → 4',  () => expect(fp.hammingDistance('0'+'0'.repeat(15),'f'+'0'.repeat(15))).toBe(4));
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8 — matchPerceptualHashes
// ─────────────────────────────────────────────────────────────────────────────
describe('matchPerceptualHashes (decisão combinada wHash+pHash)', () => {
    function makeH(len, ones) {
        const chars=[]; let left=ones;
        for(let i=0;i<len;i++){
            if(left>=4){chars.push('f');left-=4;}
            else if(left===3){chars.push('e');left=0;}
            else if(left===2){chars.push('c');left=0;}
            else if(left===1){chars.push('8');left=0;}
            else chars.push('0');
        }
        return chars.join('');
    }

    it('both match → match=true, reason=both_match', () => {
        const r = fp.matchPerceptualHashes(makeH(64,0), makeH(64,0), makeH(64,20), makeH(64,15));
        expect(r.match).toBe(true);
        expect(r.reason).toBe('both_match');
        expect(r.confidence).toBeGreaterThan(0);
    });
    it('only wHash match → reason=whash_match', () => {
        const r = fp.matchPerceptualHashes(makeH(64,0), makeH(64,0), makeH(64,30), makeH(64,40));
        expect(r.match).toBe(true);
        expect(r.reason).toBe('whash_match');
    });
    it('only pHash match → reason=phash_match', () => {
        const r = fp.matchPerceptualHashes(makeH(64,0), makeH(64,0), makeH(64,50), makeH(64,25));
        expect(r.match).toBe(true);
        expect(r.reason).toBe('phash_match');
    });
    it('both reject → match=false, reason=both_reject', () => {
        const r = fp.matchPerceptualHashes(makeH(64,0), makeH(64,0), makeH(64,100), makeH(64,90));
        expect(r.match).toBe(false);
        expect(r.reason).toBe('both_reject');
    });
    it('both miss (grey zone) → match=false, reason=both_miss', () => {
        const r = fp.matchPerceptualHashes(makeH(64,0), makeH(64,0), makeH(64,60), makeH(64,50));
        expect(r.match).toBe(false);
        expect(r.reason).toBe('both_miss');
    });
    it('only wHash → whash_only_match/miss', () => {
        const base = makeH(64,0);
        expect(fp.matchPerceptualHashes(base,null,makeH(64,20),null).reason).toBe('whash_only_match');
        expect(fp.matchPerceptualHashes(base,null,makeH(64,60),null).reason).toBe('whash_only_miss');
    });
    it('only pHash → phash_only_match/miss', () => {
        const base = makeH(64,0);
        expect(fp.matchPerceptualHashes(null,base,null,makeH(64,20)).reason).toBe('phash_only_match');
        expect(fp.matchPerceptualHashes(null,base,null,makeH(64,60)).reason).toBe('phash_only_miss');
    });
    it('no hashes → reason=no_hashes', () => {
        const r = fp.matchPerceptualHashes(null,null,null,null);
        expect(r.match).toBe(false);
        expect(r.reason).toBe('no_hashes');
        expect(r.wDist).toBe(-1);
        expect(r.pDist).toBe(-1);
    });
    it('identical hashes → confidence ≈ 1', () => {
        const h = makeH(64,0);
        expect(fp.matchPerceptualHashes(h,h,h,h).confidence).toBeCloseTo(1.0, 1);
    });
    it('confidence decreases as distance increases', () => {
        const b = makeH(64,0);
        const r1 = fp.matchPerceptualHashes(b,b,makeH(64,10),makeH(64,10));
        const r2 = fp.matchPerceptualHashes(b,b,makeH(64,30),makeH(64,25));
        expect(r1.confidence).toBeGreaterThan(r2.confidence);
    });
    it('wDist and pDist are correct in response', () => {
        const wA='0'.repeat(64), pA='0'.repeat(64), wB=makeH(64,20), pB=makeH(64,15);
        const r = fp.matchPerceptualHashes(wA,pA,wB,pB);
        expect(r.wDist).toBe(fp.hammingDistance(wA,wB));
        expect(r.pDist).toBe(fp.hammingDistance(pA,pB));
    });
    it('public thresholds have correct values', () => {
        expect(fp.WHASH_MATCH_THRESHOLD).toBe(40);
        expect(fp.PHASH_MATCH_THRESHOLD).toBe(35);
        expect(fp.WHASH_REJECT_THRESHOLD).toBe(80);
        expect(fp.PHASH_REJECT_THRESHOLD).toBe(70);
    });
    it('exact threshold wDist=40 counts as match', () => {
        const wA='0'.repeat(64), wB=makeH(64,40);
        expect(fp.matchPerceptualHashes(wA,null,wB,null).match).toBe(true);
    });
    it('one above threshold wDist=41 does NOT match (isolated)', () => {
        const wA='0'.repeat(64), wB=makeH(64,41);
        expect(fp.matchPerceptualHashes(wA,null,wB,null).match).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9 — Cross-language simulation end-to-end
// ─────────────────────────────────────────────────────────────────────────────
describe('Simulação Cross-Language — pipeline completo', () => {
    function scaleDown(data, sW, sH, dW, dH) {
        const out = new Uint8ClampedArray(dW*dH*4);
        for(let r=0;r<dH;r++) for(let c=0;c<dW;c++){
            const si=((Math.floor(r*sH/dH))*sW+Math.floor(c*sW/dW))*4, di=(r*dW+c)*4;
            out[di]=data[si]; out[di+1]=data[si+1]; out[di+2]=data[si+2]; out[di+3]=data[si+3];
        }
        return out;
    }

    it('wHash EN and PT pass matchPerceptualHashes', () => {
        const eN32 = scaleDown(mangaPage(64,64,'EN'),64,64,32,32);
        const pT32 = scaleDown(mangaPage(64,64,'PT'),64,64,32,32);
        const dec  = fp.matchPerceptualHashes(
            fp.calculateWHash(eN32), fp.calculatePHash(eN32),
            fp.calculateWHash(pT32), fp.calculatePHash(pT32));
        console.log(`      Cross-language: match=${dec.match}, reason=${dec.reason}, conf=${dec.confidence?.toFixed(3)}, wDist=${dec.wDist}, pDist=${dec.pDist}`);
        expect(dec.match).toBe(true);
    });

    it('noise does NOT match manga page', () => {
        const mG32  = scaleDown(mangaPage(64,64,'EN'),64,64,32,32);
        const nZ32  = scaleDown(noise(64,64,777),64,64,32,32);
        const dec   = fp.matchPerceptualHashes(
            fp.calculateWHash(mG32), fp.calculatePHash(mG32),
            fp.calculateWHash(nZ32), fp.calculatePHash(nZ32));
        expect(dec.match).toBe(false);
    });

    it('wHash better than dHash for cross-language (lower relative Hamming)', () => {
        const eN9x8 = mangaPage(9,8,'EN'), pT9x8 = mangaPage(9,8,'PT');
        const dD = fp.hammingDistance(fp.calculateDHash(eN9x8), fp.calculateDHash(pT9x8));
        const eN32 = scaleDown(mangaPage(64,64,'EN'),64,64,32,32);
        const pT32 = scaleDown(mangaPage(64,64,'PT'),64,64,32,32);
        const wD = fp.hammingDistance(fp.calculateWHash(eN32), fp.calculateWHash(pT32));
        console.log(`      dHash rel=${(dD/64*100).toFixed(1)}% wHash rel=${(wD/256*100).toFixed(1)}%`);
        // wHash relative distance should be ≤ dHash relative distance
        expect(wD/256).toBeLessThanOrEqual(dD/64);
    });
});

```

## 20. Autoauditoria do AGENTE 1

- [x] reserva #228 criada com semântica CREATE ONLY;
- [x] reserva relida e proprietário confirmado como AGENTE 1;
- [x] `.state/228.json` criado como IN_PROGRESS;
- [x] SHA da fonte reconfirmado antes da escrita;
- [x] fonte integral preservada nesta Bíblia;
- [x] 461/461 posições cobertas por faixas contíguas;
- [x] 76 testes contabilizados;
- [x] implementação real, runner, helper, agregador, npm e CI investigados;
- [x] mesmo blob confirmado em execução CI real;
- [x] 76/76 labels confirmadas no log;
- [x] prova strict separada de claims não provados;
- [x] evidência externa do matcher relaxed localizada em Jest;
- [x] problemas externos registrados como solicitações, sem alteração dos arquivos;
- [x] nenhum código, teste, fixture, workflow, baseline ou runner foi modificado para fabricar evidência.

**Resultado:** Bíblia concluída para o blob `fb66d9d8eb4125fae1ee9c7f93e52a94cdc5e6e7`, com cinco solicitações abertas para auditoria separada.

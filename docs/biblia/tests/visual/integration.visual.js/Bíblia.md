# Bíblia técnica — tests/visual/integration.visual.js

> **Estado documental:** ✅ CONCLUÍDO pelo AGENTE 14  
> **SHA auditado:** `2407ce31e6c16ef39466550608a529e92392259f`  
> **Agente:** AGENTE 14  
> **Tipo:** suíte visual de integração em Node para GTC fingerprint + runtime handler + repositório em memória  
> **Linhas textuais:** **502**  
> **Posições documentais:** **503**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/visual/integration.visual.js` exercita conjuntamente as implementações reais de:

- `extension/shared/gtc-fingerprint.js`;
- `extension/shared/gtc-indexeddb.js`;
- o runtime handler criado por `createGtcRuntimeHandler`;
- o fallback `createInMemoryRepository`;
- os helpers visuais sintéticos de `tests/visual/helpers.js`.

Ele contém **28 testes**: **13 `it`** síncronos e **15 `ita`** assíncronos.

O arquivo é carregado diretamente por `tests/visual/run-all.js`; portanto participa do gate visual oficial, cujo baseline atual exige 224 testes e zero skips.

## 2. O que esta suíte prova — e o que não prova

### Prova diretamente

Quando uma assertion deste arquivo chama a API real, existe prova direta para o cenário concreto:

- save/query por SHA-256 no repositório em memória;
- lookup dHash;
- lookup perceptual wHash+pHash;
- shapes lógicos visual-v1/v2;
- batch save/query em memória;
- propriedades concretas de hashing/matching;
- exports públicos;
- `DB_VERSION === 4`;
- sincronismo declarativo do handler atual;
- limites de microbenchmark no ambiente em que a suíte roda;
- `cloneValue` para objetos JSON simples/null/undefined.

### Não prova diretamente

Apesar do cabeçalho usar “integração end-to-end” e uma suíte mencionar “IndexedDB”, este arquivo **não** usa `createIndexedDbRepository`, `fake-indexeddb`, browser real, Chrome runtime real, service worker real, `content_manga.js`, canvas real ou persistência entre processos.

A implementação persistente de IndexedDB possui evidência separada em `tests/unit/gtc/indexeddb.test.js` e `tests/integration/ipc/gtc-indexeddb-deep.test.js`, que usam `createIndexedDbRepository`/fake-indexeddb. Isso não transforma automaticamente as assertions deste arquivo em prova de IndexedDB real; as categorias devem permanecer separadas.

## 3. Dependências e consumidores

### Dependências reais
- `extension/shared/gtc-fingerprint.js`;
- `extension/shared/gtc-indexeddb.js`;
- `tests/visual/runner.js`;
- `tests/visual/helpers.js`;
- APIs JS padrão: `Uint8ClampedArray`, `Promise`, `Date.now`, `Math.random`.

### Consumidor
- `tests/visual/run-all.js` requer explicitamente `./integration.visual.js`;
- `package.json#test:visual` executa `run-all.js`;
- a CI possui job visual e também executa `test:visual` em fluxos adicionais.

## 4. Fixtures visuais

`mangaPage(width,height,'EN'|'PT')` é uma fixture sintética determinística:
- mantém um padrão de “arte” de baixa frequência;
- cria um balão central;
- altera pixels que simulam texto EN/PT.

`noise` usa LCG determinístico quando seed é fornecido. `brightnessShifted` aplica delta limitado aos canais RGB.

Essas fixtures são úteis para propriedades controladas, mas não representam a distribuição de páginas reais, compressão JPEG/WebP, scaling do browser, CORS, canvas ou artefatos de rede.

## 5. Matriz das 28 verificações

| Área | Teste | O que a assertion realmente prova |
|---|---|---|
| Ciclo | mesmo SHA | GTC_SAVE + GTC_QUERY_MANY recuperam URL no repo em memória |
| Ciclo | cross-language | fixture PT encontra entrada EN via lookup perceptual |
| Compat | visual-v1 | shape antigo recuperável por SHA |
| Compat | visual-v2 | shape com dHash recuperável por dHash |
| “Capítulos” | hashes distintos | 3 imagens estruturais distintas produzem wHash distintos |
| “Capítulos” | query seletiva | consulta de uma chave não inclui segunda chave não solicitada |
| “Capítulos” | batch | 3 de 4 chaves salvas são verificadas explicitamente |
| Robustez | brilho | pelo menos um hit após +30 de brilho |
| Robustez | ruído | fixture de ruído não produz hit perceptual |
| Robustez | confiança | caso idêntico combinado tem confidence >= wHash único |
| Performance | 20 w+p | termina <500 ms e gera hashes hex |
| Performance | 20 regional | termina <500 ms e retorna 20 resultados |
| Batch | 50 entradas | save count=50 e query retorna 50 chaves |
| Performance | 10 candidatos | chamada termina <200 ms; resultado semântico não é assertado |
| API | fp global | global definido |
| API | idb global | global definido |
| API | surface fp | 18 símbolos definidos |
| API | surface idb | 8 símbolos definidos |
| Handler | sync | função retornada não inicia com `async` |
| Schema | DB v4 | constante exportada é 4 |
| Threshold | reject > match | relação numérica w/p |
| Hamming | identidade | 7 exemplos d(h,h)=0 |
| Hamming | simetria | 1 par é comutativo |
| Matcher | simetria | booleano match EN↔PT igual |
| Distâncias | domínio | dW/dP no intervalo 0..256 |
| Clone | objeto | mutação do clone não muda original |
| Clone | null | null preservado |
| Clone | undefined | undefined preservado |

## 6. Achados críticos

### 6.1 “End-to-end” é um rótulo excessivo
A suíte integra módulos reais, mas não atravessa a aplicação real inteira. Não deve ser citada como prova de browser/extension/IndexedDB persistente.

### 6.2 “Isolamento de capítulos” não é modelado
Nenhuma chamada fornece `chapterId`. Strings como `cap1_pg1` são apenas hashes arbitrários. A suíte prova key isolation/query filtering, não isolamento de capítulo.

### 6.3 Microbenchmarks usam wall-clock absoluto
Limiares de 500 ms/200 ms são sensíveis à máquina, load da CI e jitter. Não há warm-up, repetição ou percentil.

### 6.4 Algumas assertions são mais fracas que o título
- brilho: exige `values.length > 0`, mas não o payload esperado;
- save-many “capítulos”: não verifica `c1p2`;
- lote de 50: verifica cardinalidade, não cada mapeamento;
- lookup de 10 candidatos: não verifica qualquer resultado;
- “distâncias independentes”: verifica apenas faixa 0..256.

### 6.5 Terminologia de pipeline está desatualizada
O cabeçalho diz “pipeline 5 fases”; a produção atual documenta pipeline de cache em 6 fases. Este arquivo não implementa o pipeline `content_manga`, reforçando que o comentário é legado conceitual.

## 7. Evidência automatizada e classificação

| Propriedade | Classificação | Observação |
|---|---|---|
| módulo fingerprint real é carregado | ✅ PROVADO DIRETAMENTE | APIs reais são chamadas |
| módulo GTC real é carregado | ✅ PROVADO DIRETAMENTE | handler/repo real in-memory |
| IndexedDB persistente real | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo | há outras suítes separadas |
| browser/MV3 real | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO | Node + globais |
| cross-language fixture | ✅ PROVADO DIRETAMENTE | cenário EN/PT sintético |
| backward logical v1/v2 | ✅ PROVADO DIRETAMENTE | shape lógico, não migration física |
| chapter isolation | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO | chapterId ausente |
| save/query batch | ✅ PROVADO DIRETAMENTE | repo/handler in-memory |
| performance limits | ✅ PROVADO DIRETAMENTE por execução | limite por run; robustez estatística ausente |
| exports/DB_VERSION | 🟦 GATE ESTRUTURAL ESPECÍFICO | valores/símbolos congelados |
| invariantes matemáticos universais | 🟨 EXECUTADO/PROVADO EM AMOSTRAS | exemplos finitos não são prova universal |
| execução na suíte visual oficial | 🟨 EXECUTADO INDIRETAMENTE | run-all requer o módulo |

## 8. Solicitações ao auditor

### 231-001 — SCOPE_ACCURACY — OPEN
Confirmar e ajustar, em mudança separada, a nomenclatura “end-to-end”/“IndexedDB” deste arquivo ou adicionar evidência que realmente percorra a implementação persistente/aplicação se essa for a intenção.

### 231-002 — ASSERTION_STRENGTH — OPEN
Os três testes sob “Múltiplos capítulos — isolamento no IndexedDB” não modelam chapterId nem `createIndexedDbRepository`. Decidir se devem ser renomeados para isolamento por chave/batch ou substituídos/complementados por assertions reais de isolamento de capítulo.

### 231-003 — FLAKY_PERFORMANCE_RISK — OPEN
Revisar os microbenchmarks absolutos 500/200 ms para evitar flakiness dependente de hardware/CI e distinguir performance gate de teste funcional.

### 231-004 — ASSERTION_STRENGTH — OPEN
Fortalecer as assertions que hoje só conferem existência/cardinalidade/faixa quando o título promete identidade/resultado específico, especialmente brilho, lote 50, lookup perceptual 10 candidatos e “distâncias independentes”.

### 231-005 — DOCUMENTATION_DRIFT — OPEN
Reconciliar o comentário “pipeline 5 fases” com a arquitetura atual de 6 fases, sem usar alteração documental para fingir cobertura que a suíte não possui.

## 9. Invariantes documentados

1. `createGtcRuntimeHandler` usado por MV3 deve continuar retornando função não-`async`.
2. `DB_VERSION` esperado por esta suíte é 4.
3. Hash exato salvo deve ser recuperável pela mesma chave.
4. Entrada v2 com dHash deve permanecer consultável por dHash.
5. Lookup perceptual não deve aceitar a fixture de ruído totalmente distinta.
6. APIs públicas listadas não devem desaparecer silenciosamente.
7. `REJECT_THRESHOLD > MATCH_THRESHOLD` para wHash/pHash.
8. Distância de Hamming deve satisfazer identidade e simetria nos domínios válidos.
9. `cloneValue` não deve compartilhar nested object para objetos JSON simples.
10. Resultados desta suíte sobre in-memory repository não devem ser promovidos a prova automática de IndexedDB persistente.
11. Títulos/comentários não devem reivindicar propriedades não representadas pelas assertions.
12. Esta Bíblia é válida apenas enquanto o fonte permanecer no SHA `2407ce31e6c16ef39466550608a529e92392259f`.

## 10. Casos-limite ainda relevantes

- falha/rejeição do handler;
- repository sem fingerprintApi;
- migração física v1/v2/v3→v4 em IndexedDB;
- persistência após fechar/reabrir DB;
- colisões/normalização de hashes de capítulos reais;
- resultado correto no benchmark de 10 candidatos;
- payload correto no teste de brilho;
- performance sob Windows/runner carregado;
- limiares próximos dos boundaries perceptuais;
- imagens reais com resize/compressão/crop;
- pipeline de produção de 6 fases e center-crop visual-v4.

## 11. Fonte integral

~~~javascript
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// test_integration.js
// Testes de integração end-to-end — cadeia completa
//
// Simula o ciclo de vida real:
//   1. Usuário A traduz página EN → fingerprint calculado → salvo no IndexedDB
//   2. Usuário B acessa mesma página em PT → pipeline 5 fases → cache hit
//
// Também testa:
//   - Degradação graciosa quando partes do sistema estão indisponíveis
//   - Compatibilidade backward com entradas v1/v2
//   - Múltiplos capítulos no mesmo banco
//   - Performance de lote (N imagens)
// ─────────────────────────────────────────────────────────────────────────────

globalThis.self = globalThis;
require('../../extension/shared/gtc-fingerprint.js');
require('../../extension/shared/gtc-indexeddb.js');

const { describe, it, ita, beforeEach, expect } = require('./runner.js');
const {
    solidColor, horizontalGradient, checkerboard,
    mangaPage, noise, brightnessShifted, isValidHex,
} = require('./helpers.js');

const fp  = globalThis.MangaTranslatorGtcFingerprint;
const idb = globalThis.MangaTranslatorGtcIndexedDb;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de integração
// ─────────────────────────────────────────────────────────────────────────────

function makeRepo() { return idb.createInMemoryRepository(); }

function makeHandler(repo) {
    return idb.createGtcRuntimeHandler({ repository: repo, fingerprintApi: fp });
}

function makeSend(handler) {
    return (msg) => new Promise(resolve => {
        const handled = handler(msg, {}, resolve);
        if (!handled) resolve({ ok: false });
    });
}

function makeFullSend(repo) {
    return makeSend(makeHandler(repo));
}

async function calcAllHashes(imageData32, imageData48, imageData9x8) {
    const wHash = fp.calculateWHash(imageData32);
    const pHash = fp.calculatePHash(imageData32);
    const dHash = fp.calculateDHash(imageData9x8 || new Uint8ClampedArray(9*8*4).fill(128));
    const regionalHashes = fp.calculateRegionalHashes(imageData48);
    return { wHash, pHash, dHash, regionalHashes };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — Ciclo de vida completo: traduzir → salvar → encontrar
// ─────────────────────────────────────────────────────────────────────────────
describe('Ciclo de vida completo: traduzir → salvar → encontrar', () => {

    ita('Usuário A salva; Usuário A re-encontra pelo mesmo SHA-256', async () => {
        const repo   = makeRepo();
        const send   = makeFullSend(repo);
        const img32  = solidColor(32, 32, 100, 150, 200);
        const img48  = new Uint8ClampedArray(48*48*4).fill(120);
        const hashes = await calcAllHashes(img32, img48);

        // SHA-256 do fingerprint (usa pixelSample de 8×8)
        const pixelSample = Array.from(img32.slice(0, 8*8*4)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 512);
        const sha256 = await fp.hashStringSha256(`800:1200:pixels:${pixelSample}`);

        // Usuário A: salva
        await send({ action: 'GTC_SAVE', hash: sha256, translatedDataUrl: 'data:trad',
            wHash: hashes.wHash, pHash: hashes.pHash, dHash: hashes.dHash,
            regionalHashes: hashes.regionalHashes, fingerprintVersion: 'visual-v3' });

        // Usuário A: re-encontra
        const r = await send({ action: 'GTC_QUERY_MANY', hashes: [sha256] });
        expect(r.ok).toBe(true);
        expect(r.entriesByHash[sha256]).toBe('data:trad');
    });

    ita('[CROSS-LANGUAGE] Usuário A (EN) salva; Usuário B (PT) encontra via perceptual', async () => {
        const repo  = makeRepo();
        const send  = makeFullSend(repo);

        // Imagens "EN" e "PT" — mesma arte, texto diferente
        const imgEN32 = mangaPage(32, 32, 'EN');
        const imgPT32 = mangaPage(32, 32, 'PT');
        const img48   = new Uint8ClampedArray(48*48*4);
        // Preenche o 48x48 com a imagem EN escalada
        for (let i = 0; i < img48.length; i++) img48[i] = imgEN32[i % imgEN32.length];

        const hashesEN = await calcAllHashes(imgEN32, img48);
        const hashesPT = await calcAllHashes(imgPT32, img48);

        // Usuário A: salva com hashes EN
        await send({
            action: 'GTC_SAVE', hash: 'sha256_en_page3',
            translatedDataUrl: 'data:traduzida_en',
            wHash: hashesEN.wHash, pHash: hashesEN.pHash,
            dHash: hashesEN.dHash, regionalHashes: hashesEN.regionalHashes,
            fingerprintVersion: 'visual-v3',
        });

        // Usuário B: busca com hashes PT (SHA-256 diferente → recai em lookup perceptual)
        const r = await send({
            action: 'GTC_QUERY_BY_PERCEPTUAL',
            wHashes: [hashesPT.wHash],
            pHashes: [hashesPT.pHash],
        });

        expect(r.ok).toBe(true);
        const values = Object.values(r.entriesByPerceptual);
        console.log(`      [Cross-language] Resultados encontrados: ${values.length}`);
        expect(values.length).toBeGreaterThan(0);
        expect(values[0].translatedDataUrl).toBe('data:traduzida_en');
        expect(values[0].confidence).toBeGreaterThan(0);
    });

    ita('[BACKWARD-COMPAT] entrada visual-v1 encontrada via SHA-256', async () => {
        const repo = makeRepo();
        const send = makeFullSend(repo);

        const sha256 = 'old_sha256_v1_entry_hash';
        await send({
            action: 'GTC_SAVE', hash: sha256,
            translatedDataUrl: 'data:v1_entry',
            fingerprintVersion: 'visual-v1',
            // wHash/pHash/dHash ausentes (visual-v1)
        });

        const r = await send({ action: 'GTC_QUERY_MANY', hashes: [sha256] });
        expect(r.ok).toBe(true);
        expect(r.entriesByHash[sha256]).toBe('data:v1_entry');
    });

    ita('[BACKWARD-COMPAT] entrada visual-v2 encontrada via dHash', async () => {
        const repo = makeRepo();
        const send = makeFullSend(repo);

        const dHash = fp.calculateDHash(new Uint8ClampedArray(9*8*4).fill(180));

        await send({
            action: 'GTC_SAVE', hash: 'sha256_v2_page',
            translatedDataUrl: 'data:v2_entry',
            dHash,
            fingerprintVersion: 'visual-v2',
        });

        const r = await send({ action: 'GTC_QUERY_BY_DHASH', dHashes: [dHash] });
        expect(r.ok).toBe(true);
        expect(r.entriesByDHash[dHash]).toBe('data:v2_entry');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — Multiple capítulos — isolamento de dados
// ─────────────────────────────────────────────────────────────────────────────
describe('Múltiplos capítulos — isolamento no IndexedDB', () => {

    ita('páginas de capítulos diferentes têm wHashes diferentes', async () => {
        // Use images with genuine spatial variation so wHash differs
        const imgCap1P1 = horizontalGradient(32, 32);
        const imgCap1P2 = checkerboard(32, 32, 4);
        const imgCap2P1 = noise(32, 32, 42);

        const w1 = fp.calculateWHash(imgCap1P1);
        const w2 = fp.calculateWHash(imgCap1P2);
        const w3 = fp.calculateWHash(imgCap2P1);

        // Each structurally different image has a different wHash
        expect(w1).not.toBe(w2);
        expect(w1).not.toBe(w3);
        expect(w2).not.toBe(w3);
    });

    ita('lookup por SHA-256 não retorna entradas de outros capítulos', async () => {
        const repo = makeRepo();
        const send = makeFullSend(repo);

        await send({ action: 'GTC_SAVE', hash: 'cap1_pg1', translatedDataUrl: 'data:c1p1',
            wHash: null, pHash: null });
        await send({ action: 'GTC_SAVE', hash: 'cap2_pg1', translatedDataUrl: 'data:c2p1',
            wHash: null, pHash: null });

        const r = await send({ action: 'GTC_QUERY_MANY', hashes: ['cap1_pg1'] });
        expect(r.entriesByHash['cap1_pg1']).toBe('data:c1p1');
        expect(r.entriesByHash['cap2_pg1']).toBeUndefined();
    });

    ita('putMany com mistura de capítulos → cada um recuperável', async () => {
        const repo = makeRepo();
        const send = makeFullSend(repo);

        await send({
            action: 'GTC_SAVE_MANY',
            entries: [
                { hash: 'c1p1', translatedDataUrl: 'data:c1p1' },
                { hash: 'c1p2', translatedDataUrl: 'data:c1p2' },
                { hash: 'c2p1', translatedDataUrl: 'data:c2p1' },
                { hash: 'c3p1', translatedDataUrl: 'data:c3p1' },
            ],
        });

        const r = await send({ action: 'GTC_QUERY_MANY', hashes: ['c1p1', 'c1p2', 'c2p1', 'c3p1'] });
        expect(r.entriesByHash['c1p1']).toBe('data:c1p1');
        expect(r.entriesByHash['c2p1']).toBe('data:c2p1');
        expect(r.entriesByHash['c3p1']).toBe('data:c3p1');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — Robustez a variações entre scanlações
// ─────────────────────────────────────────────────────────────────────────────
describe('Robustez a variações entre scanlações', () => {

    ita('variação de brilho (+30) não destrói o match cross-language', async () => {
        const repo = makeRepo();
        const send = makeFullSend(repo);

        const imgBase    = mangaPage(32, 32, 'EN');
        const imgShifted = brightnessShifted(imgBase, 30);

        const wH_base    = fp.calculateWHash(imgBase);
        const pH_base    = fp.calculatePHash(imgBase);
        const wH_shifted = fp.calculateWHash(imgShifted);
        const pH_shifted = fp.calculatePHash(imgShifted);

        await send({ action: 'GTC_SAVE', hash: 'sha_brightness',
            translatedDataUrl: 'data:brightness_test',
            wHash: wH_base, pHash: pH_base, fingerprintVersion: 'visual-v3' });

        const r = await send({
            action: 'GTC_QUERY_BY_PERCEPTUAL',
            wHashes: [wH_shifted], pHashes: [pH_shifted],
        });

        const values = Object.values(r.entriesByPerceptual);
        console.log(`      Brilho+30: ${values.length} resultado(s)`);
        expect(values.length).toBeGreaterThan(0);
    });

    ita('imagem completamente diferente não contamina o cache', async () => {
        const repo = makeRepo();
        const send = makeFullSend(repo);

        const imgManga = mangaPage(32, 32, 'EN');
        const imgNoise = noise(32, 32, 12345);

        const wH_manga = fp.calculateWHash(imgManga);
        const pH_manga = fp.calculatePHash(imgManga);
        const wH_noise = fp.calculateWHash(imgNoise);
        const pH_noise = fp.calculatePHash(imgNoise);

        await send({ action: 'GTC_SAVE', hash: 'sha_real_manga',
            translatedDataUrl: 'data:real_manga_translation',
            wHash: wH_manga, pHash: pH_manga, fingerprintVersion: 'visual-v3' });

        // Busca com imagem completamente diferente — não deve encontrar
        const r = await send({
            action: 'GTC_QUERY_BY_PERCEPTUAL',
            wHashes: [wH_noise], pHashes: [pH_noise],
        });

        expect(Object.keys(r.entriesByPerceptual).length).toBe(0);
    });

    ita('match combinado (wHash + pHash) tem confidence maior que match simples', async () => {
        const d32 = mangaPage(32, 32, 'EN');
        const wH  = fp.calculateWHash(d32);
        const pH  = fp.calculatePHash(d32);

        // wDist=0, pDist=0 → ambos match = confidence próxima de 1
        const both = fp.matchPerceptualHashes(wH, pH, wH, pH);

        // wDist=0, pDist não disponível → só wHash match
        const single = fp.matchPerceptualHashes(wH, null, wH, null);

        expect(both.match).toBe(true);
        expect(single.match).toBe(true);
        // both_match deve ter confidence ≥ whash_only_match
        expect(both.confidence).toBeGreaterThanOrEqual(single.confidence);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — Performance: N imagens em lote
// ─────────────────────────────────────────────────────────────────────────────
describe('Performance: processamento em lote', () => {

    ita('calcular wHash+pHash para 20 imagens em < 500ms', async () => {
        const images = Array.from({ length: 20 }, (_, i) =>
            mangaPage(32, 32, i % 2 === 0 ? 'EN' : 'PT')
        );

        const start = Date.now();
        const results = await Promise.all(images.map(async img => ({
            wHash: fp.calculateWHash(img),
            pHash: fp.calculatePHash(img),
        })));
        const elapsed = Date.now() - start;

        console.log(`      20 imagens wHash+pHash: ${elapsed}ms`);
        expect(results.length).toBe(20);
        expect(elapsed).toBeLessThan(500);
        results.forEach(r => {
            expect(isValidHex(r.wHash, 64)).toBeTruthy();
            expect(isValidHex(r.pHash, 64)).toBeTruthy();
        });
    });

    ita('calcular regionalHashes para 20 imagens em < 500ms', async () => {
        const images = Array.from({ length: 20 }, () =>
            new Uint8ClampedArray(48*48*4).fill(Math.floor(Math.random() * 255))
        );

        const start = Date.now();
        const results = images.map(img => fp.calculateRegionalHashes(img));
        const elapsed = Date.now() - start;

        console.log(`      20 imagens regionalHashes: ${elapsed}ms`);
        expect(results.length).toBe(20);
        expect(elapsed).toBeLessThan(500);
    });

    ita('GTC_SAVE_MANY + GTC_QUERY_MANY para 50 entradas', async () => {
        const repo = makeRepo();
        const send = makeFullSend(repo);

        const entries = Array.from({ length: 50 }, (_, i) => ({
            hash:              `bulk_hash_${i}`,
            translatedDataUrl: `data:bulk_${i}`,
        }));

        const saveR = await send({ action: 'GTC_SAVE_MANY', entries });
        expect(saveR.ok).toBe(true);
        expect(saveR.count).toBe(50);

        const hashes = entries.map(e => e.hash);
        const queryR = await send({ action: 'GTC_QUERY_MANY', hashes });
        expect(queryR.ok).toBe(true);
        expect(Object.keys(queryR.entriesByHash).length).toBe(50);
    });

    ita('lookup perceptual com 10 candidatos no banco em < 200ms', async () => {
        const repo = makeRepo();

        // Popula banco com 10 entradas diversas
        for (let i = 0; i < 10; i++) {
            const d32 = solidColor(32, 32, i*20, i*15, i*10);
            await repo.put({
                hash:              `perf_hash_${i}`,
                translatedDataUrl: `data:perf_${i}`,
                wHash:             fp.calculateWHash(d32),
                pHash:             fp.calculatePHash(d32),
                fingerprintVersion: 'visual-v3',
            });
        }

        // Busca com imagem EN (cross-language scan)
        const queryD32 = mangaPage(32, 32, 'PT');
        const qW = fp.calculateWHash(queryD32);
        const qP = fp.calculatePHash(queryD32);

        const start = Date.now();
        await repo.getManyByPerceptual([qW], [qP], fp);
        const elapsed = Date.now() - start;

        console.log(`      Lookup perceptual 10 candidatos: ${elapsed}ms`);
        expect(elapsed).toBeLessThan(200);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — Invariantes arquiteturais
// ─────────────────────────────────────────────────────────────────────────────
describe('Invariantes arquiteturais', () => {

    it('MangaTranslatorGtcFingerprint está acessível como global', () => {
        expect(globalThis.MangaTranslatorGtcFingerprint).toBeDefined();
    });

    it('MangaTranslatorGtcIndexedDb está acessível como global', () => {
        expect(globalThis.MangaTranslatorGtcIndexedDb).toBeDefined();
    });

    it('API fingerprint expõe todos os símbolos esperados', () => {
        const expected = [
            'buildFingerprintSource', 'hashStringSha256', 'createFingerprintFromDescriptor',
            'calculateDHash',
            'calculateWHash', 'calculatePHash',
            'calculateRegionalHashes', 'matchRegionalHashes',
            'hammingDistance', 'matchPerceptualHashes', 'matchPerceptualHashesRelaxed',
            'WHASH_MATCH_THRESHOLD', 'PHASH_MATCH_THRESHOLD',
            'WHASH_REJECT_THRESHOLD', 'PHASH_REJECT_THRESHOLD',
            'WHASH_MATCH_THRESHOLD_RELAXED', 'PHASH_MATCH_THRESHOLD_RELAXED',
            'WHASH_REJECT_THRESHOLD_RELAXED', 'PHASH_REJECT_THRESHOLD_RELAXED',
        ];
        expected.forEach(key => {
            expect(fp[key]).toBeDefined();
        });
    });

    it('API indexeddb expõe todos os símbolos esperados', () => {
        const expected = [
            'DB_NAME', 'STORE_NAME', 'DB_VERSION',
            'createIndexedDbRepository', 'createInMemoryRepository',
            'createGtcRuntimeHandler', 'normalizeHash', 'cloneValue',
        ];
        expected.forEach(key => {
            expect(idb[key]).toBeDefined();
        });
    });

    it('createGtcRuntimeHandler retorna função síncrona (não async)', () => {
        const repo    = makeRepo();
        const handler = makeHandler(repo);
        // Função síncrona: typeof === 'function', toString não contém "async"
        expect(typeof handler).toBe('function');
        const fnStr = handler.toString();
        // Não deve começar com "async" — CRÍTICO para MV3 chrome.runtime.onMessage
        expect(fnStr.trimStart().startsWith('async')).toBe(false);
    });

    it('DB_VERSION é 4 (schema visual-v4)', () => {
        expect(idb.DB_VERSION).toBe(4);
    });

    it('thresholds seguem a relação REJECT > MATCH para ambos os hashes', () => {
        expect(fp.WHASH_REJECT_THRESHOLD).toBeGreaterThan(fp.WHASH_MATCH_THRESHOLD);
        expect(fp.PHASH_REJECT_THRESHOLD).toBeGreaterThan(fp.PHASH_MATCH_THRESHOLD);
    });

    it('hammingDistance(a, a) = 0 para qualquer hash válido', () => {
        const hashes = [
            '0'.repeat(16),
            'f'.repeat(16),
            'deadbeef01234567',
            '0'.repeat(64),
            'f'.repeat(64),
            fp.calculateWHash(solidColor(32,32,100,100,100)),
            fp.calculatePHash(solidColor(32,32,100,100,100)),
        ];
        hashes.forEach(h => {
            expect(fp.hammingDistance(h, h)).toBe(0);
        });
    });

    it('hammingDistance é comutativa: d(a,b) == d(b,a)', () => {
        const h1 = fp.calculateWHash(solidColor(32,32,50,50,50));
        const h2 = fp.calculateWHash(solidColor(32,32,200,200,200));
        expect(fp.hammingDistance(h1, h2)).toBe(fp.hammingDistance(h2, h1));
    });

    it('matchPerceptualHashes é simétrico para ambos os tipos de match', () => {
        const d32A = mangaPage(32, 32, 'EN');
        const d32B = mangaPage(32, 32, 'PT');
        const wA = fp.calculateWHash(d32A), pA = fp.calculatePHash(d32A);
        const wB = fp.calculateWHash(d32B), pB = fp.calculatePHash(d32B);

        const rAB = fp.matchPerceptualHashes(wA, pA, wB, pB);
        const rBA = fp.matchPerceptualHashes(wB, pB, wA, pA);

        // Match deve ser simétrico
        expect(rAB.match).toBe(rBA.match);
    });

    it('wHash e pHash de imagens diferentes têm distâncias independentes', () => {
        // A distinção entre wHash e pHash é que capturam aspectos complementares
        // Duas imagens com wHash similar podem ter pHash diferente e vice-versa
        const img1 = horizontalGradient(32, 32);
        const img2 = checkerboard(32, 32, 2);

        const dW = fp.hammingDistance(fp.calculateWHash(img1), fp.calculateWHash(img2));
        const dP = fp.hammingDistance(fp.calculatePHash(img1), fp.calculatePHash(img2));

        // Ambas são distâncias válidas (0-256)
        expect(dW).toBeGreaterThanOrEqual(0);
        expect(dW).toBeLessThanOrEqual(256);
        expect(dP).toBeGreaterThanOrEqual(0);
        expect(dP).toBeLessThanOrEqual(256);
    });

    ita('cloneValue faz deep-copy de objetos', async () => {
        const original = { hash: 'abc', nested: { x: 1 } };
        const clone    = idb.cloneValue(original);
        clone.nested.x = 999;
        expect(original.nested.x).toBe(1);
    });

    it('cloneValue retorna null para null', () => {
        expect(idb.cloneValue(null)).toBeNull();
    });

    it('cloneValue retorna undefined para undefined', () => {
        expect(idb.cloneValue(undefined)).toBeUndefined();
    });
});
~~~

## 12. Cobertura documental por linhas

As faixas abaixo são contíguas e cobrem **1–503**; a posição 503 é o newline final do blob auditado.

### 1. Linhas 1-15 — Cabeçalho e escopo declarado

Fonte auditada:
~~~text
1: 'use strict';
2: // ─────────────────────────────────────────────────────────────────────────────
3: // test_integration.js
4: // Testes de integração end-to-end — cadeia completa
5: //
6: // Simula o ciclo de vida real:
7: //   1. Usuário A traduz página EN → fingerprint calculado → salvo no IndexedDB
8: //   2. Usuário B acessa mesma página em PT → pipeline 5 fases → cache hit
9: //
10: // Também testa:
11: //   - Degradação graciosa quando partes do sistema estão indisponíveis
12: //   - Compatibilidade backward com entradas v1/v2
13: //   - Múltiplos capítulos no mesmo banco
14: //   - Performance de lote (N imagens)
15: // ─────────────────────────────────────────────────────────────────────────────
~~~

**O que faz:** Ativa strict mode e apresenta a suíte como integração end-to-end da cadeia GTC, listando cross-language, compatibilidade, múltiplos capítulos e performance.

**Como faz:** O bloco é somente comentário; não altera runtime.

**Por que existe assim:** Documenta a intenção ampla da suíte para quem lê logs/código.

**Risco/limite:** A expressão end-to-end é mais forte que a evidência real: este arquivo chama módulos GTC diretamente e usa createInMemoryRepository, sem browser, content_manga, service worker real ou IndexedDB persistente.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a alegação end-to-end completa; as assertions provam apenas os caminhos realmente invocados.

### 2. Linhas 16-28 — Bootstrap dos módulos reais e helpers

Fonte auditada:
~~~text
16: ␠ [linha vazia]
17: globalThis.self = globalThis;
18: require('../../extension/shared/gtc-fingerprint.js');
19: require('../../extension/shared/gtc-indexeddb.js');
20: ␠ [linha vazia]
21: const { describe, it, ita, beforeEach, expect } = require('./runner.js');
22: const {
23:     solidColor, horizontalGradient, checkerboard,
24:     mangaPage, noise, brightnessShifted, isValidHex,
25: } = require('./helpers.js');
26: ␠ [linha vazia]
27: const fp  = globalThis.MangaTranslatorGtcFingerprint;
28: const idb = globalThis.MangaTranslatorGtcIndexedDb;
~~~

**O que faz:** Expõe globalThis.self, carrega os módulos reais de fingerprint/IndexedDB e importa DSL do runner e geradores sintéticos.

**Como faz:** Os módulos anexem APIs a globalThis; fp/idb capturam essas APIs depois dos requires.

**Por que existe assim:** Permite testar implementação real de funções GTC em Node sem browser completo.

**Risco/limite:** O ambiente Node + globais simulados não reproduz lifecycle MV3/Chrome runtime; helpers geram imagens sintéticas.

**Evidência:** ✅ PROVADO DIRETAMENTE para as APIs carregadas e assertions que as chamam; 🟨 ambiente browser real é simulado.

### 3. Linhas 29-58 — Factories do repositório/handler e cálculo de hashes

Fonte auditada:
~~~text
29: ␠ [linha vazia]
30: // ─────────────────────────────────────────────────────────────────────────────
31: // Helpers de integração
32: // ─────────────────────────────────────────────────────────────────────────────
33: ␠ [linha vazia]
34: function makeRepo() { return idb.createInMemoryRepository(); }
35: ␠ [linha vazia]
36: function makeHandler(repo) {
37:     return idb.createGtcRuntimeHandler({ repository: repo, fingerprintApi: fp });
38: }
39: ␠ [linha vazia]
40: function makeSend(handler) {
41:     return (msg) => new Promise(resolve => {
42:         const handled = handler(msg, {}, resolve);
43:         if (!handled) resolve({ ok: false });
44:     });
45: }
46: ␠ [linha vazia]
47: function makeFullSend(repo) {
48:     return makeSend(makeHandler(repo));
49: }
50: ␠ [linha vazia]
51: async function calcAllHashes(imageData32, imageData48, imageData9x8) {
52:     const wHash = fp.calculateWHash(imageData32);
53:     const pHash = fp.calculatePHash(imageData32);
54:     const dHash = fp.calculateDHash(imageData9x8 || new Uint8ClampedArray(9*8*4).fill(128));
55:     const regionalHashes = fp.calculateRegionalHashes(imageData48);
56:     return { wHash, pHash, dHash, regionalHashes };
57: }
58: ␠ [linha vazia]
~~~

**O que faz:** Cria repositório em memória, runtime handler real, adaptador Promise e helper que calcula wHash/pHash/dHash/regionalHashes.

**Como faz:** makeRepo chama createInMemoryRepository; makeHandler usa createGtcRuntimeHandler real; makeSend adapta sendResponse; calcAllHashes chama funções fp reais.

**Por que existe assim:** Reduz boilerplate e mantém cada caso focal no contrato GTC.

**Risco/limite:** createInMemoryRepository não prova semântica de transação, índices, upgrades ou persistência do IndexedDB real; calcAllHashes é async sem await interno.

**Evidência:** ✅ PROVADO DIRETAMENTE para implementação real in-memory/handler/fingerprint; ⚠️ não prova createIndexedDbRepository.

### 4. Linhas 59-63 — Abertura da suíte de ciclo de vida

Fonte auditada:
~~~text
59: // ─────────────────────────────────────────────────────────────────────────────
60: // SUITE 1 — Ciclo de vida completo: traduzir → salvar → encontrar
61: // ─────────────────────────────────────────────────────────────────────────────
62: describe('Ciclo de vida completo: traduzir → salvar → encontrar', () => {
63: ␠ [linha vazia]
~~~

**O que faz:** Define o grupo que pretende cobrir salvar e reencontrar traduções.

**Como faz:** Usa describe do runner visual.

**Por que existe assim:** Agrupa operações que atravessam fingerprint API, handler e repository.

**Risco/limite:** Não há tradução real; translatedDataUrl é valor sintético já pronto.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo runner; as provas específicas estão nos testes internos.

### 5. Linhas 64-85 — Save/query pelo mesmo SHA-256

Fonte auditada:
~~~text
64:     ita('Usuário A salva; Usuário A re-encontra pelo mesmo SHA-256', async () => {
65:         const repo   = makeRepo();
66:         const send   = makeFullSend(repo);
67:         const img32  = solidColor(32, 32, 100, 150, 200);
68:         const img48  = new Uint8ClampedArray(48*48*4).fill(120);
69:         const hashes = await calcAllHashes(img32, img48);
70: ␠ [linha vazia]
71:         // SHA-256 do fingerprint (usa pixelSample de 8×8)
72:         const pixelSample = Array.from(img32.slice(0, 8*8*4)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 512);
73:         const sha256 = await fp.hashStringSha256(`800:1200:pixels:${pixelSample}`);
74: ␠ [linha vazia]
75:         // Usuário A: salva
76:         await send({ action: 'GTC_SAVE', hash: sha256, translatedDataUrl: 'data:trad',
77:             wHash: hashes.wHash, pHash: hashes.pHash, dHash: hashes.dHash,
78:             regionalHashes: hashes.regionalHashes, fingerprintVersion: 'visual-v3' });
79: ␠ [linha vazia]
80:         // Usuário A: re-encontra
81:         const r = await send({ action: 'GTC_QUERY_MANY', hashes: [sha256] });
82:         expect(r.ok).toBe(true);
83:         expect(r.entriesByHash[sha256]).toBe('data:trad');
84:     });
85: ␠ [linha vazia]
~~~

**O que faz:** Gera hashes, deriva SHA-256, salva via GTC_SAVE e busca via GTC_QUERY_MANY, verificando ok e data URL.

**Como faz:** Usa handler real sobre repositório em memória e fp.hashStringSha256.

**Por que existe assim:** Prova o contrato básico hash exato → tradução persistida no repositório da sessão.

**Risco/limite:** O pixelSample é construído manualmente e não passa pelo produtor real de descriptor; storage não é IndexedDB persistente.

**Evidência:** ✅ PROVADO DIRETAMENTE para handler+repositório em memória e lookup por hash.

### 6. Linhas 86-123 — Cross-language EN→PT via perceptual

Fonte auditada:
~~~text
86:     ita('[CROSS-LANGUAGE] Usuário A (EN) salva; Usuário B (PT) encontra via perceptual', async () => {
87:         const repo  = makeRepo();
88:         const send  = makeFullSend(repo);
89: ␠ [linha vazia]
90:         // Imagens "EN" e "PT" — mesma arte, texto diferente
91:         const imgEN32 = mangaPage(32, 32, 'EN');
92:         const imgPT32 = mangaPage(32, 32, 'PT');
93:         const img48   = new Uint8ClampedArray(48*48*4);
94:         // Preenche o 48x48 com a imagem EN escalada
95:         for (let i = 0; i < img48.length; i++) img48[i] = imgEN32[i % imgEN32.length];
96: ␠ [linha vazia]
97:         const hashesEN = await calcAllHashes(imgEN32, img48);
98:         const hashesPT = await calcAllHashes(imgPT32, img48);
99: ␠ [linha vazia]
100:         // Usuário A: salva com hashes EN
101:         await send({
102:             action: 'GTC_SAVE', hash: 'sha256_en_page3',
103:             translatedDataUrl: 'data:traduzida_en',
104:             wHash: hashesEN.wHash, pHash: hashesEN.pHash,
105:             dHash: hashesEN.dHash, regionalHashes: hashesEN.regionalHashes,
106:             fingerprintVersion: 'visual-v3',
107:         });
108: ␠ [linha vazia]
109:         // Usuário B: busca com hashes PT (SHA-256 diferente → recai em lookup perceptual)
110:         const r = await send({
111:             action: 'GTC_QUERY_BY_PERCEPTUAL',
112:             wHashes: [hashesPT.wHash],
113:             pHashes: [hashesPT.pHash],
114:         });
115: ␠ [linha vazia]
116:         expect(r.ok).toBe(true);
117:         const values = Object.values(r.entriesByPerceptual);
118:         console.log(`      [Cross-language] Resultados encontrados: ${values.length}`);
119:         expect(values.length).toBeGreaterThan(0);
120:         expect(values[0].translatedDataUrl).toBe('data:traduzida_en');
121:         expect(values[0].confidence).toBeGreaterThan(0);
122:     });
123: ␠ [linha vazia]
~~~

**O que faz:** Cria duas imagens sintéticas com mesma arte e texto diferente, salva hashes EN e consulta wHash/pHash PT, exigindo resultado e confidence positiva.

**Como faz:** mangaPage gera fixtures EN/PT; GTC_SAVE e GTC_QUERY_BY_PERCEPTUAL usam o handler real.

**Por que existe assim:** Demonstra a propriedade central de reaproveitar tradução entre scanlações visualmente semelhantes.

**Risco/limite:** A fixture é sintética; não há canvas/browser/network, regional confirmation nem imagem real. O teste prova o matcher/handler no domínio dessa fixture.

**Evidência:** ✅ PROVADO DIRETAMENTE para lookup perceptual real sobre fixture sintética e repo em memória.

### 7. Linhas 124-140 — Backward compatibility visual-v1

Fonte auditada:
~~~text
124:     ita('[BACKWARD-COMPAT] entrada visual-v1 encontrada via SHA-256', async () => {
125:         const repo = makeRepo();
126:         const send = makeFullSend(repo);
127: ␠ [linha vazia]
128:         const sha256 = 'old_sha256_v1_entry_hash';
129:         await send({
130:             action: 'GTC_SAVE', hash: sha256,
131:             translatedDataUrl: 'data:v1_entry',
132:             fingerprintVersion: 'visual-v1',
133:             // wHash/pHash/dHash ausentes (visual-v1)
134:         });
135: ␠ [linha vazia]
136:         const r = await send({ action: 'GTC_QUERY_MANY', hashes: [sha256] });
137:         expect(r.ok).toBe(true);
138:         expect(r.entriesByHash[sha256]).toBe('data:v1_entry');
139:     });
140: ␠ [linha vazia]
~~~

**O que faz:** Salva entrada sem hashes perceptuais, marcada visual-v1, e confirma recuperação por SHA-256.

**Como faz:** GTC_SAVE seguido de GTC_QUERY_MANY.

**Por que existe assim:** Protege compatibilidade mínima de entradas antigas baseadas apenas em hash exato.

**Risco/limite:** Não testa migração de banco v1 nem dado persistido de uma versão anterior; apenas shape lógico v1 no repo atual.

**Evidência:** ✅ PROVADO DIRETAMENTE para shape visual-v1 no handler/repo em memória; ⚠️ migração IndexedDB não é provada.

### 8. Linhas 141-159 — Backward compatibility visual-v2

Fonte auditada:
~~~text
141:     ita('[BACKWARD-COMPAT] entrada visual-v2 encontrada via dHash', async () => {
142:         const repo = makeRepo();
143:         const send = makeFullSend(repo);
144: ␠ [linha vazia]
145:         const dHash = fp.calculateDHash(new Uint8ClampedArray(9*8*4).fill(180));
146: ␠ [linha vazia]
147:         await send({
148:             action: 'GTC_SAVE', hash: 'sha256_v2_page',
149:             translatedDataUrl: 'data:v2_entry',
150:             dHash,
151:             fingerprintVersion: 'visual-v2',
152:         });
153: ␠ [linha vazia]
154:         const r = await send({ action: 'GTC_QUERY_BY_DHASH', dHashes: [dHash] });
155:         expect(r.ok).toBe(true);
156:         expect(r.entriesByDHash[dHash]).toBe('data:v2_entry');
157:     });
158: });
159: ␠ [linha vazia]
~~~

**O que faz:** Salva entrada visual-v2 com dHash e confirma consulta por GTC_QUERY_BY_DHASH.

**Como faz:** dHash é calculado pela implementação real e roteado pelo handler real.

**Por que existe assim:** Protege compatibilidade lógica com entradas dHash anteriores ao wHash/pHash.

**Risco/limite:** Assim como v1, não executa upgrade físico de banco.

**Evidência:** ✅ PROVADO DIRETAMENTE para contrato dHash no repositório em memória; ⚠️ não prova upgrade persistente.

### 9. Linhas 160-164 — Abertura da suíte de múltiplos capítulos

Fonte auditada:
~~~text
160: // ─────────────────────────────────────────────────────────────────────────────
161: // SUITE 2 — Multiple capítulos — isolamento de dados
162: // ─────────────────────────────────────────────────────────────────────────────
163: describe('Múltiplos capítulos — isolamento no IndexedDB', () => {
164: ␠ [linha vazia]
~~~

**O que faz:** Declara um grupo de isolamento de capítulos no IndexedDB.

**Como faz:** Apenas describe/comentário.

**Por que existe assim:** Pretende demonstrar que entradas de páginas diferentes coexistem sem colisão.

**Risco/limite:** Nenhum teste deste bloco modela chapterId e makeRepo usa memória, não IndexedDB; o título sobre-promete a propriedade comprovada.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para isolamento por capítulo/IndexedDB neste arquivo.

### 10. Linhas 165-180 — wHashes diferentes para três imagens

Fonte auditada:
~~~text
165:     ita('páginas de capítulos diferentes têm wHashes diferentes', async () => {
166:         // Use images with genuine spatial variation so wHash differs
167:         const imgCap1P1 = horizontalGradient(32, 32);
168:         const imgCap1P2 = checkerboard(32, 32, 4);
169:         const imgCap2P1 = noise(32, 32, 42);
170: ␠ [linha vazia]
171:         const w1 = fp.calculateWHash(imgCap1P1);
172:         const w2 = fp.calculateWHash(imgCap1P2);
173:         const w3 = fp.calculateWHash(imgCap2P1);
174: ␠ [linha vazia]
175:         // Each structurally different image has a different wHash
176:         expect(w1).not.toBe(w2);
177:         expect(w1).not.toBe(w3);
178:         expect(w2).not.toBe(w3);
179:     });
180: ␠ [linha vazia]
~~~

**O que faz:** Calcula wHash de gradiente, checkerboard e ruído e exige diferenças par-a-par.

**Como faz:** Chama calculateWHash real e usa .not.toBe.

**Por que existe assim:** Mostra que padrões estruturais distintos produzem identificadores perceptuais distintos.

**Risco/limite:** As imagens não têm identidade de capítulo; portanto a assertion não prova isolamento entre capítulos.

**Evidência:** ✅ PROVADO DIRETAMENTE para distinção dessas três fixtures; ⚠️ não prova propriedade de capítulo.

### 11. Linhas 181-194 — Lookup exato não retorna hash não solicitado

Fonte auditada:
~~~text
181:     ita('lookup por SHA-256 não retorna entradas de outros capítulos', async () => {
182:         const repo = makeRepo();
183:         const send = makeFullSend(repo);
184: ␠ [linha vazia]
185:         await send({ action: 'GTC_SAVE', hash: 'cap1_pg1', translatedDataUrl: 'data:c1p1',
186:             wHash: null, pHash: null });
187:         await send({ action: 'GTC_SAVE', hash: 'cap2_pg1', translatedDataUrl: 'data:c2p1',
188:             wHash: null, pHash: null });
189: ␠ [linha vazia]
190:         const r = await send({ action: 'GTC_QUERY_MANY', hashes: ['cap1_pg1'] });
191:         expect(r.entriesByHash['cap1_pg1']).toBe('data:c1p1');
192:         expect(r.entriesByHash['cap2_pg1']).toBeUndefined();
193:     });
194: ␠ [linha vazia]
~~~

**O que faz:** Salva duas entradas e consulta apenas uma chave, verificando que a outra não aparece.

**Como faz:** GTC_SAVE duas vezes e GTC_QUERY_MANY com um array de uma chave.

**Por que existe assim:** Protege a semântica de consulta por conjunto solicitado.

**Risco/limite:** Os rótulos cap1/cap2 são apenas parte da string hash; o repositório não recebe chapterId. Não é isolamento de capítulos.

**Evidência:** ✅ PROVADO DIRETAMENTE para filtragem de getMany por chave solicitada; ⚠️ título de capítulo não é provado.

### 12. Linhas 195-215 — Save-many com quatro chaves

Fonte auditada:
~~~text
195:     ita('putMany com mistura de capítulos → cada um recuperável', async () => {
196:         const repo = makeRepo();
197:         const send = makeFullSend(repo);
198: ␠ [linha vazia]
199:         await send({
200:             action: 'GTC_SAVE_MANY',
201:             entries: [
202:                 { hash: 'c1p1', translatedDataUrl: 'data:c1p1' },
203:                 { hash: 'c1p2', translatedDataUrl: 'data:c1p2' },
204:                 { hash: 'c2p1', translatedDataUrl: 'data:c2p1' },
205:                 { hash: 'c3p1', translatedDataUrl: 'data:c3p1' },
206:             ],
207:         });
208: ␠ [linha vazia]
209:         const r = await send({ action: 'GTC_QUERY_MANY', hashes: ['c1p1', 'c1p2', 'c2p1', 'c3p1'] });
210:         expect(r.entriesByHash['c1p1']).toBe('data:c1p1');
211:         expect(r.entriesByHash['c2p1']).toBe('data:c2p1');
212:         expect(r.entriesByHash['c3p1']).toBe('data:c3p1');
213:     });
214: });
215: ␠ [linha vazia]
~~~

**O que faz:** Salva quatro entradas em lote e verifica recuperação de três delas após consultar as quatro.

**Como faz:** GTC_SAVE_MANY seguido de GTC_QUERY_MANY.

**Por que existe assim:** Exercita path batch do handler com múltiplas entradas.

**Risco/limite:** Não verifica explicitamente c1p2 apesar de consultá-la, nem modela metadado de capítulo; prova coexistência por hash, não isolamento.

**Evidência:** ✅ PROVADO DIRETAMENTE para três das quatro entradas verificadas e resposta batch; 🟨 quarta entrada é executada sem assertion específica.

### 13. Linhas 216-220 — Abertura da suíte de robustez

Fonte auditada:
~~~text
216: // ─────────────────────────────────────────────────────────────────────────────
217: // SUITE 3 — Robustez a variações entre scanlações
218: // ─────────────────────────────────────────────────────────────────────────────
219: describe('Robustez a variações entre scanlações', () => {
220: ␠ [linha vazia]
~~~

**O que faz:** Agrupa casos de variação visual entre scanlações.

**Como faz:** Describe do runner.

**Por que existe assim:** Separa propriedades perceptuais de persistência/batch.

**Risco/limite:** Fixtures continuam sintéticas e thresholds reais podem ter domínio mais amplo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; assertions internas fornecem a prova.

### 14. Linhas 221-246 — Robustez a brilho +30

Fonte auditada:
~~~text
221:     ita('variação de brilho (+30) não destrói o match cross-language', async () => {
222:         const repo = makeRepo();
223:         const send = makeFullSend(repo);
224: ␠ [linha vazia]
225:         const imgBase    = mangaPage(32, 32, 'EN');
226:         const imgShifted = brightnessShifted(imgBase, 30);
227: ␠ [linha vazia]
228:         const wH_base    = fp.calculateWHash(imgBase);
229:         const pH_base    = fp.calculatePHash(imgBase);
230:         const wH_shifted = fp.calculateWHash(imgShifted);
231:         const pH_shifted = fp.calculatePHash(imgShifted);
232: ␠ [linha vazia]
233:         await send({ action: 'GTC_SAVE', hash: 'sha_brightness',
234:             translatedDataUrl: 'data:brightness_test',
235:             wHash: wH_base, pHash: pH_base, fingerprintVersion: 'visual-v3' });
236: ␠ [linha vazia]
237:         const r = await send({
238:             action: 'GTC_QUERY_BY_PERCEPTUAL',
239:             wHashes: [wH_shifted], pHashes: [pH_shifted],
240:         });
241: ␠ [linha vazia]
242:         const values = Object.values(r.entriesByPerceptual);
243:         console.log(`      Brilho+30: ${values.length} resultado(s)`);
244:         expect(values.length).toBeGreaterThan(0);
245:     });
246: ␠ [linha vazia]
~~~

**O que faz:** Salva wHash/pHash da imagem base e consulta com versão de brilho alterado, exigindo pelo menos um resultado.

**Como faz:** brightnessShifted preserva alpha e soma delta; o handler usa matcher perceptual real.

**Por que existe assim:** Testa invariância útil a transformação fotométrica simples.

**Risco/limite:** Não confirma que o resultado encontrado é exatamente data:brightness_test nem verifica confidence/reason; uma entrada errada ainda satisfaria length > 0 neste cenário se houvesse contaminação.

**Evidência:** ✅ PROVADO DIRETAMENTE que há algum hit no cenário isolado; ⚠️ assertion específica do payload retornado é ausente.

### 15. Linhas 247-271 — Imagem diferente não contamina cache

Fonte auditada:
~~~text
247:     ita('imagem completamente diferente não contamina o cache', async () => {
248:         const repo = makeRepo();
249:         const send = makeFullSend(repo);
250: ␠ [linha vazia]
251:         const imgManga = mangaPage(32, 32, 'EN');
252:         const imgNoise = noise(32, 32, 12345);
253: ␠ [linha vazia]
254:         const wH_manga = fp.calculateWHash(imgManga);
255:         const pH_manga = fp.calculatePHash(imgManga);
256:         const wH_noise = fp.calculateWHash(imgNoise);
257:         const pH_noise = fp.calculatePHash(imgNoise);
258: ␠ [linha vazia]
259:         await send({ action: 'GTC_SAVE', hash: 'sha_real_manga',
260:             translatedDataUrl: 'data:real_manga_translation',
261:             wHash: wH_manga, pHash: pH_manga, fingerprintVersion: 'visual-v3' });
262: ␠ [linha vazia]
263:         // Busca com imagem completamente diferente — não deve encontrar
264:         const r = await send({
265:             action: 'GTC_QUERY_BY_PERCEPTUAL',
266:             wHashes: [wH_noise], pHashes: [pH_noise],
267:         });
268: ␠ [linha vazia]
269:         expect(Object.keys(r.entriesByPerceptual).length).toBe(0);
270:     });
271: ␠ [linha vazia]
~~~

**O que faz:** Salva manga sintético e consulta ruído determinístico, exigindo zero resultados perceptuais.

**Como faz:** Calcula hashes reais e verifica Object.keys(...).length === 0.

**Por que existe assim:** Protege contra falso positivo perceptual grosseiro.

**Risco/limite:** Cobre uma fixture de ruído e um limiar; não caracteriza taxa geral de falso positivo.

**Evidência:** ✅ PROVADO DIRETAMENTE para a fixture específica.

### 16. Linhas 272-289 — Confidence combinada versus hash único

Fonte auditada:
~~~text
272:     ita('match combinado (wHash + pHash) tem confidence maior que match simples', async () => {
273:         const d32 = mangaPage(32, 32, 'EN');
274:         const wH  = fp.calculateWHash(d32);
275:         const pH  = fp.calculatePHash(d32);
276: ␠ [linha vazia]
277:         // wDist=0, pDist=0 → ambos match = confidence próxima de 1
278:         const both = fp.matchPerceptualHashes(wH, pH, wH, pH);
279: ␠ [linha vazia]
280:         // wDist=0, pDist não disponível → só wHash match
281:         const single = fp.matchPerceptualHashes(wH, null, wH, null);
282: ␠ [linha vazia]
283:         expect(both.match).toBe(true);
284:         expect(single.match).toBe(true);
285:         // both_match deve ter confidence ≥ whash_only_match
286:         expect(both.confidence).toBeGreaterThanOrEqual(single.confidence);
287:     });
288: });
289: ␠ [linha vazia]
~~~

**O que faz:** Compara match usando wHash+pHash idênticos com match usando apenas wHash e exige ambos match e confidence combinada >= simples.

**Como faz:** Chama matchPerceptualHashes diretamente.

**Por que existe assim:** Protege monotonicidade esperada da confiança ao possuir duas evidências concordantes.

**Risco/limite:** Usa igualdade perfeita, não casos de borda perto dos thresholds.

**Evidência:** ✅ PROVADO DIRETAMENTE para o caso de distância zero.

### 17. Linhas 290-294 — Abertura da suíte de performance

Fonte auditada:
~~~text
290: // ─────────────────────────────────────────────────────────────────────────────
291: // SUITE 4 — Performance: N imagens em lote
292: // ─────────────────────────────────────────────────────────────────────────────
293: describe('Performance: processamento em lote', () => {
294: ␠ [linha vazia]
~~~

**O que faz:** Agrupa quatro microbenchmarks executados como testes funcionais.

**Como faz:** Usa ita e relógio Date.now.

**Por que existe assim:** Impõe limites simples para detectar regressões grosseiras de custo.

**Risco/limite:** Wall-clock absoluto em CI compartilhada é sensível a carga, CPU/VM e aquecimento; pode gerar flakiness ou ser frouxo demais em máquinas rápidas.

**Evidência:** ✅ Assertion temporal direta no ambiente em que roda; ⚠️ estabilidade estatística não é provada.

### 18. Linhas 295-315 — 20 wHash+pHash em menos de 500 ms

Fonte auditada:
~~~text
295:     ita('calcular wHash+pHash para 20 imagens em < 500ms', async () => {
296:         const images = Array.from({ length: 20 }, (_, i) =>
297:             mangaPage(32, 32, i % 2 === 0 ? 'EN' : 'PT')
298:         );
299: ␠ [linha vazia]
300:         const start = Date.now();
301:         const results = await Promise.all(images.map(async img => ({
302:             wHash: fp.calculateWHash(img),
303:             pHash: fp.calculatePHash(img),
304:         })));
305:         const elapsed = Date.now() - start;
306: ␠ [linha vazia]
307:         console.log(`      20 imagens wHash+pHash: ${elapsed}ms`);
308:         expect(results.length).toBe(20);
309:         expect(elapsed).toBeLessThan(500);
310:         results.forEach(r => {
311:             expect(isValidHex(r.wHash, 64)).toBeTruthy();
312:             expect(isValidHex(r.pHash, 64)).toBeTruthy();
313:         });
314:     });
315: ␠ [linha vazia]
~~~

**O que faz:** Calcula 40 hashes sobre 20 imagens e exige contagem, tempo <500 ms e hex válido.

**Como faz:** Promise.all envolve cálculos síncronos dentro de callbacks async.

**Por que existe assim:** Protege throughput mínimo aproximado.

**Risco/limite:** Não mede distribuição nem repetições; Promise.all não paraleliza CPU síncrona e Date.now tem resolução limitada.

**Evidência:** ✅ PROVADO DIRETAMENTE no ambiente da execução para o limite; ⚠️ risco de flakiness por wall-clock.

### 19. Linhas 316-329 — 20 regionalHashes em menos de 500 ms

Fonte auditada:
~~~text
316:     ita('calcular regionalHashes para 20 imagens em < 500ms', async () => {
317:         const images = Array.from({ length: 20 }, () =>
318:             new Uint8ClampedArray(48*48*4).fill(Math.floor(Math.random() * 255))
319:         );
320: ␠ [linha vazia]
321:         const start = Date.now();
322:         const results = images.map(img => fp.calculateRegionalHashes(img));
323:         const elapsed = Date.now() - start;
324: ␠ [linha vazia]
325:         console.log(`      20 imagens regionalHashes: ${elapsed}ms`);
326:         expect(results.length).toBe(20);
327:         expect(elapsed).toBeLessThan(500);
328:     });
329: ␠ [linha vazia]
~~~

**O que faz:** Gera 20 buffers uniformes pseudoaleatórios, calcula hashes regionais e exige contagem e tempo.

**Como faz:** Valor fill usa Math.random; cálculo é síncrono e cronometrado.

**Por que existe assim:** Detecta regressão grosseira no custo regional.

**Risco/limite:** Input varia entre runs e não se validam hashes produzidos; o teste prova essencialmente conclusão/tempo, não correção dos valores.

**Evidência:** ✅ PROVADO DIRETAMENTE para contagem/tempo; 🟨 correção do regional hash é coberta em outras suítes, não aqui.

### 20. Linhas 330-348 — Batch de 50 entradas

Fonte auditada:
~~~text
330:     ita('GTC_SAVE_MANY + GTC_QUERY_MANY para 50 entradas', async () => {
331:         const repo = makeRepo();
332:         const send = makeFullSend(repo);
333: ␠ [linha vazia]
334:         const entries = Array.from({ length: 50 }, (_, i) => ({
335:             hash:              `bulk_hash_${i}`,
336:             translatedDataUrl: `data:bulk_${i}`,
337:         }));
338: ␠ [linha vazia]
339:         const saveR = await send({ action: 'GTC_SAVE_MANY', entries });
340:         expect(saveR.ok).toBe(true);
341:         expect(saveR.count).toBe(50);
342: ␠ [linha vazia]
343:         const hashes = entries.map(e => e.hash);
344:         const queryR = await send({ action: 'GTC_QUERY_MANY', hashes });
345:         expect(queryR.ok).toBe(true);
346:         expect(Object.keys(queryR.entriesByHash).length).toBe(50);
347:     });
348: ␠ [linha vazia]
~~~

**O que faz:** Salva 50 entradas via GTC_SAVE_MANY, exige ok/count=50 e consulta todas por GTC_QUERY_MANY.

**Como faz:** Gera hashes/data URLs sintéticos e verifica tamanho do mapa retornado.

**Por que existe assim:** Exercita lote maior e integridade de cardinalidade.

**Risco/limite:** Não verifica mapeamento individual hash→URL; uma resposta com 50 chaves incorretas poderia passar a última assertion se ok/count também fossem fabricados pelo mesmo path.

**Evidência:** ✅ PROVADO DIRETAMENTE para status/count/cardinalidade; 🟨 conteúdo individual não recebe assertion.

### 21. Linhas 349-377 — Lookup perceptual com 10 candidatos em menos de 200 ms

Fonte auditada:
~~~text
349:     ita('lookup perceptual com 10 candidatos no banco em < 200ms', async () => {
350:         const repo = makeRepo();
351: ␠ [linha vazia]
352:         // Popula banco com 10 entradas diversas
353:         for (let i = 0; i < 10; i++) {
354:             const d32 = solidColor(32, 32, i*20, i*15, i*10);
355:             await repo.put({
356:                 hash:              `perf_hash_${i}`,
357:                 translatedDataUrl: `data:perf_${i}`,
358:                 wHash:             fp.calculateWHash(d32),
359:                 pHash:             fp.calculatePHash(d32),
360:                 fingerprintVersion: 'visual-v3',
361:             });
362:         }
363: ␠ [linha vazia]
364:         // Busca com imagem EN (cross-language scan)
365:         const queryD32 = mangaPage(32, 32, 'PT');
366:         const qW = fp.calculateWHash(queryD32);
367:         const qP = fp.calculatePHash(queryD32);
368: ␠ [linha vazia]
369:         const start = Date.now();
370:         await repo.getManyByPerceptual([qW], [qP], fp);
371:         const elapsed = Date.now() - start;
372: ␠ [linha vazia]
373:         console.log(`      Lookup perceptual 10 candidatos: ${elapsed}ms`);
374:         expect(elapsed).toBeLessThan(200);
375:     });
376: });
377: ␠ [linha vazia]
~~~

**O que faz:** Popula dez entradas, executa uma consulta perceptual e exige somente tempo <200 ms.

**Como faz:** As entradas usam solidColor com intensidades distintas e hashes reais; a consulta usa mangaPage PT.

**Por que existe assim:** Cria um orçamento simples para busca perceptual em pequeno conjunto.

**Risco/limite:** Não existe assertion de resultado/correção; solidColor pode produzir hashes perceptuais iguais/similares; wall-clock absoluto é sensível ao ambiente.

**Evidência:** ✅ PROVADO DIRETAMENTE apenas para conclusão abaixo do limiar naquela execução; ⚠️ sem prova do resultado semântico.

### 22. Linhas 378-382 — Abertura das invariantes arquiteturais

Fonte auditada:
~~~text
378: // ─────────────────────────────────────────────────────────────────────────────
379: // SUITE 5 — Invariantes arquiteturais
380: // ─────────────────────────────────────────────────────────────────────────────
381: describe('Invariantes arquiteturais', () => {
382: ␠ [linha vazia]
~~~

**O que faz:** Agrupa checks de exports, sincronismo do handler, versão, thresholds e propriedades matemáticas.

**Como faz:** Mistura it síncrono e um ita.

**Por que existe assim:** Funciona como contrato estrutural complementar aos fluxos.

**Risco/limite:** Alguns checks são shape/runtime e não equivalem a comportamento completo.

**Evidência:** As assertions seguintes variam entre ✅ prova direta e 🟦 contrato estrutural.

### 23. Linhas 383-386 — Global fingerprint disponível

Fonte auditada:
~~~text
383:     it('MangaTranslatorGtcFingerprint está acessível como global', () => {
384:         expect(globalThis.MangaTranslatorGtcFingerprint).toBeDefined();
385:     });
386: ␠ [linha vazia]
~~~

**O que faz:** Exige que MangaTranslatorGtcFingerprint tenha sido anexado ao global.

**Como faz:** toBeDefined após require do módulo real.

**Por que existe assim:** Protege o modo de exposição usado por scripts não-bundled.

**Risco/limite:** Não prova que todos os consumidores browser recebem o mesmo global.

**Evidência:** ✅ PROVADO DIRETAMENTE no ambiente Node desta suíte.

### 24. Linhas 387-390 — Global IndexedDB API disponível

Fonte auditada:
~~~text
387:     it('MangaTranslatorGtcIndexedDb está acessível como global', () => {
388:         expect(globalThis.MangaTranslatorGtcIndexedDb).toBeDefined();
389:     });
390: ␠ [linha vazia]
~~~

**O que faz:** Exige MangaTranslatorGtcIndexedDb definido.

**Como faz:** toBeDefined após require.

**Por que existe assim:** Protege contrato global do módulo.

**Risco/limite:** Não prova inicialização de IndexedDB nativo.

**Evidência:** ✅ PROVADO DIRETAMENTE para export global.

### 25. Linhas 391-407 — Surface da API de fingerprint

Fonte auditada:
~~~text
391:     it('API fingerprint expõe todos os símbolos esperados', () => {
392:         const expected = [
393:             'buildFingerprintSource', 'hashStringSha256', 'createFingerprintFromDescriptor',
394:             'calculateDHash',
395:             'calculateWHash', 'calculatePHash',
396:             'calculateRegionalHashes', 'matchRegionalHashes',
397:             'hammingDistance', 'matchPerceptualHashes', 'matchPerceptualHashesRelaxed',
398:             'WHASH_MATCH_THRESHOLD', 'PHASH_MATCH_THRESHOLD',
399:             'WHASH_REJECT_THRESHOLD', 'PHASH_REJECT_THRESHOLD',
400:             'WHASH_MATCH_THRESHOLD_RELAXED', 'PHASH_MATCH_THRESHOLD_RELAXED',
401:             'WHASH_REJECT_THRESHOLD_RELAXED', 'PHASH_REJECT_THRESHOLD_RELAXED',
402:         ];
403:         expected.forEach(key => {
404:             expect(fp[key]).toBeDefined();
405:         });
406:     });
407: ␠ [linha vazia]
~~~

**O que faz:** Lista 18 símbolos esperados e exige todos definidos.

**Como faz:** expected.forEach aplica toBeDefined em fp[key].

**Por que existe assim:** Detecta remoção/rename de funções e thresholds consumidos pela arquitetura.

**Risco/limite:** Não verifica tipo/função para cada símbolo nem comportamento; apenas presença não-nullish.

**Evidência:** 🟦 GATE ESTÁTICO/ESTRUTURAL ESPECÍFICO em runtime para presença dos símbolos.

### 26. Linhas 408-418 — Surface da API indexeddb

Fonte auditada:
~~~text
408:     it('API indexeddb expõe todos os símbolos esperados', () => {
409:         const expected = [
410:             'DB_NAME', 'STORE_NAME', 'DB_VERSION',
411:             'createIndexedDbRepository', 'createInMemoryRepository',
412:             'createGtcRuntimeHandler', 'normalizeHash', 'cloneValue',
413:         ];
414:         expected.forEach(key => {
415:             expect(idb[key]).toBeDefined();
416:         });
417:     });
418: ␠ [linha vazia]
~~~

**O que faz:** Exige presença de oito símbolos públicos, incluindo DB_VERSION e factories.

**Como faz:** Itera lista e usa toBeDefined.

**Por que existe assim:** Protege superfície mínima da API GTC.

**Risco/limite:** Não valida tipos/assinaturas individuais.

**Evidência:** 🟦 GATE ESTRUTURAL ESPECÍFICO para presença.

### 27. Linhas 419-428 — Handler precisa ser síncrono

Fonte auditada:
~~~text
419:     it('createGtcRuntimeHandler retorna função síncrona (não async)', () => {
420:         const repo    = makeRepo();
421:         const handler = makeHandler(repo);
422:         // Função síncrona: typeof === 'function', toString não contém "async"
423:         expect(typeof handler).toBe('function');
424:         const fnStr = handler.toString();
425:         // Não deve começar com "async" — CRÍTICO para MV3 chrome.runtime.onMessage
426:         expect(fnStr.trimStart().startsWith('async')).toBe(false);
427:     });
428: ␠ [linha vazia]
~~~

**O que faz:** Cria handler real, confirma typeof function e que sua representação textual não começa com async.

**Como faz:** handler.toString().trimStart().startsWith('async') deve ser false.

**Por que existe assim:** Chrome runtime.onMessage depende de retorno síncrono para indicar resposta assíncrona via sendResponse.

**Risco/limite:** toString é aproximação estrutural; não prova todos os paths de retorno do handler.

**Evidência:** ✅ PROVADO DIRETAMENTE que a função retornada atual não é declarada async.

### 28. Linhas 429-432 — DB_VERSION = 4

Fonte auditada:
~~~text
429:     it('DB_VERSION é 4 (schema visual-v4)', () => {
430:         expect(idb.DB_VERSION).toBe(4);
431:     });
432: ␠ [linha vazia]
~~~

**O que faz:** Exige versão de schema 4.

**Como faz:** toBe(4) no export real.

**Por que existe assim:** Congela o contrato visual-v4 do banco.

**Risco/limite:** Como usa a API carregada, prova constante; não prova upgrade v3→v4.

**Evidência:** ✅ PROVADO DIRETAMENTE para valor exportado; ⚠️ upgrade não é exercitado.

### 29. Linhas 433-437 — Relação REJECT > MATCH

Fonte auditada:
~~~text
433:     it('thresholds seguem a relação REJECT > MATCH para ambos os hashes', () => {
434:         expect(fp.WHASH_REJECT_THRESHOLD).toBeGreaterThan(fp.WHASH_MATCH_THRESHOLD);
435:         expect(fp.PHASH_REJECT_THRESHOLD).toBeGreaterThan(fp.PHASH_MATCH_THRESHOLD);
436:     });
437: ␠ [linha vazia]
~~~

**O que faz:** Exige thresholds de rejeição maiores que thresholds de match para wHash/pHash.

**Como faz:** Duas comparações numéricas.

**Por que existe assim:** Protege uma relação lógica básica das zonas de decisão.

**Risco/limite:** Não congela valores absolutos nem relaxed thresholds.

**Evidência:** ✅ PROVADO DIRETAMENTE para as relações comparadas.

### 30. Linhas 438-452 — Identidade da distância de Hamming

Fonte auditada:
~~~text
438:     it('hammingDistance(a, a) = 0 para qualquer hash válido', () => {
439:         const hashes = [
440:             '0'.repeat(16),
441:             'f'.repeat(16),
442:             'deadbeef01234567',
443:             '0'.repeat(64),
444:             'f'.repeat(64),
445:             fp.calculateWHash(solidColor(32,32,100,100,100)),
446:             fp.calculatePHash(solidColor(32,32,100,100,100)),
447:         ];
448:         hashes.forEach(h => {
449:             expect(fp.hammingDistance(h, h)).toBe(0);
450:         });
451:     });
452: ␠ [linha vazia]
~~~

**O que faz:** Para sete hashes válidos, exige d(h,h)=0.

**Como faz:** Inclui hex fixo e hashes calculados.

**Por que existe assim:** Protege invariante matemática fundamental.

**Risco/limite:** Não é prova formal para qualquer hash; o título generaliza além da amostra finita.

**Evidência:** ✅ PROVADO DIRETAMENTE para sete casos; ⚠️ universalidade 'qualquer' é inferida, não exaustivamente provada.

### 31. Linhas 453-458 — Comutatividade da distância de Hamming

Fonte auditada:
~~~text
453:     it('hammingDistance é comutativa: d(a,b) == d(b,a)', () => {
454:         const h1 = fp.calculateWHash(solidColor(32,32,50,50,50));
455:         const h2 = fp.calculateWHash(solidColor(32,32,200,200,200));
456:         expect(fp.hammingDistance(h1, h2)).toBe(fp.hammingDistance(h2, h1));
457:     });
458: ␠ [linha vazia]
~~~

**O que faz:** Calcula dois hashes e exige d(a,b)=d(b,a).

**Como faz:** Usa duas chamadas reais com argumentos invertidos.

**Por que existe assim:** Protege simetria do algoritmo.

**Risco/limite:** Um único par não prova universalidade.

**Evidência:** ✅ PROVADO DIRETAMENTE para o par escolhido.

### 32. Linhas 459-471 — Simetria do match perceptual

Fonte auditada:
~~~text
459:     it('matchPerceptualHashes é simétrico para ambos os tipos de match', () => {
460:         const d32A = mangaPage(32, 32, 'EN');
461:         const d32B = mangaPage(32, 32, 'PT');
462:         const wA = fp.calculateWHash(d32A), pA = fp.calculatePHash(d32A);
463:         const wB = fp.calculateWHash(d32B), pB = fp.calculatePHash(d32B);
464: ␠ [linha vazia]
465:         const rAB = fp.matchPerceptualHashes(wA, pA, wB, pB);
466:         const rBA = fp.matchPerceptualHashes(wB, pB, wA, pA);
467: ␠ [linha vazia]
468:         // Match deve ser simétrico
469:         expect(rAB.match).toBe(rBA.match);
470:     });
471: ␠ [linha vazia]
~~~

**O que faz:** Executa match EN→PT e PT→EN e compara apenas o booleano match.

**Como faz:** Calcula w/p reais das fixtures e chama matcher nas duas direções.

**Por que existe assim:** Protege decisão binária simétrica.

**Risco/limite:** Não compara confidence/reason/distâncias; o título 'ambos os tipos de match' é mais amplo que a única fixture.

**Evidência:** ✅ PROVADO DIRETAMENTE para igualdade do booleano nessa fixture.

### 33. Linhas 472-487 — Faixa válida de distâncias wHash/pHash

Fonte auditada:
~~~text
472:     it('wHash e pHash de imagens diferentes têm distâncias independentes', () => {
473:         // A distinção entre wHash e pHash é que capturam aspectos complementares
474:         // Duas imagens com wHash similar podem ter pHash diferente e vice-versa
475:         const img1 = horizontalGradient(32, 32);
476:         const img2 = checkerboard(32, 32, 2);
477: ␠ [linha vazia]
478:         const dW = fp.hammingDistance(fp.calculateWHash(img1), fp.calculateWHash(img2));
479:         const dP = fp.hammingDistance(fp.calculatePHash(img1), fp.calculatePHash(img2));
480: ␠ [linha vazia]
481:         // Ambas são distâncias válidas (0-256)
482:         expect(dW).toBeGreaterThanOrEqual(0);
483:         expect(dW).toBeLessThanOrEqual(256);
484:         expect(dP).toBeGreaterThanOrEqual(0);
485:         expect(dP).toBeLessThanOrEqual(256);
486:     });
487: ␠ [linha vazia]
~~~

**O que faz:** Calcula distâncias entre gradiente e checkerboard e exige cada uma entre 0 e 256.

**Como faz:** Quatro assertions de limites.

**Por que existe assim:** Protege domínio numérico esperado para hashes de 256 bits.

**Risco/limite:** Não prova que as distâncias sejam 'independentes' entre si; nenhuma assertion exige dW != dP ou relação de independência.

**Evidência:** ✅ PROVADO DIRETAMENTE para faixas; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a independência alegada no título.

### 34. Linhas 488-494 — cloneValue faz deep-copy

Fonte auditada:
~~~text
488:     ita('cloneValue faz deep-copy de objetos', async () => {
489:         const original = { hash: 'abc', nested: { x: 1 } };
490:         const clone    = idb.cloneValue(original);
491:         clone.nested.x = 999;
492:         expect(original.nested.x).toBe(1);
493:     });
494: ␠ [linha vazia]
~~~

**O que faz:** Clona objeto aninhado, muta o clone e exige original intacto.

**Como faz:** Chama cloneValue real e verifica nested.x original.

**Por que existe assim:** Protege ausência de aliasing para objeto JSON simples.

**Risco/limite:** Não cobre tipos não JSON/ciclos; a implementação atual é JSON stringify/parse.

**Evidência:** ✅ PROVADO DIRETAMENTE para objeto JSON simples.

### 35. Linhas 495-498 — cloneValue preserva null

Fonte auditada:
~~~text
495:     it('cloneValue retorna null para null', () => {
496:         expect(idb.cloneValue(null)).toBeNull();
497:     });
498: ␠ [linha vazia]
~~~

**O que faz:** Exige cloneValue(null) === null.

**Como faz:** Matcher toBeNull.

**Por que existe assim:** Protege short-circuit null.

**Risco/limite:** Sem risco relevante além do escopo pontual.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### 36. Linhas 499-502 — cloneValue preserva undefined e fecha suite

Fonte auditada:
~~~text
499:     it('cloneValue retorna undefined para undefined', () => {
500:         expect(idb.cloneValue(undefined)).toBeUndefined();
501:     });
502: });
~~~

**O que faz:** Exige undefined na entrada retorna undefined e encerra o describe.

**Como faz:** toBeUndefined na implementação real.

**Por que existe assim:** Protege short-circuit undefined.

**Risco/limite:** Sem prova de outros tipos especiais.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### 37. Linhas 503 — Newline final

Fonte auditada:
~~~text
503: ␠ [linha vazia]
~~~

**O que faz:** Representa a terminação final do arquivo.

**Como faz:** Slot vazio após o último newline.

**Por que existe assim:** Mantém convenção de arquivo texto.

**Risco/limite:** Nenhum efeito runtime.

**Evidência:** 🟦 Confirmado pela leitura exata do blob.



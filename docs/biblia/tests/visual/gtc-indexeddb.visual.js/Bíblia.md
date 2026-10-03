# Bíblia técnica — tests/visual/gtc-indexeddb.visual.js

> **Estado documental:** ✅ CONCLUÍDO pelo AGENTE 14  
> **SHA auditado:** `0f5ca8e043a06219a342d2f32b59017762a953f0`  
> **Agente:** AGENTE 14  
> **Tipo:** suíte visual Node para gtc-indexeddb/fingerprint, predominantemente sobre repositório em memória  
> **Linhas textuais:** **705**  
> **Posições documentais:** **706**, contando o newline final  
> **Testes registrados:** **59** — 13 `it` + 46 `ita`  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é a maior bateria visual dedicada ao contrato GTC de armazenamento/lookup. Ela carrega as implementações reais de `gtc-fingerprint.js` e `gtc-indexeddb.js`, mas a maior parte das assertions executa `createInMemoryRepository`, não o IndexedDB persistente.

Ela participa do entry point `tests/visual/run-all.js` e, portanto, dos 224 testes protegidos por `visual.minTests`.

## 2. Escopo real versus cabeçalho legado

O cabeçalho afirma:

- “testes completos”;
- visual-v3/schema v3;
- cobertura de `createIndexedDbRepository`;
- “todas as actions GTC_*”;
- upgrade v2→v3.

No estado atual essas frases não são literalmente verdadeiras:

- o módulo exporta `DB_VERSION = 4`;
- a suíte verifica v4 mais abaixo;
- `createIndexedDbRepository` só é chamado com `indexedDbFactory:null`, exercitando o fallback in-memory;
- não ocorre abertura/upgrade real de IndexedDB nesta suíte;
- o handler atual possui actions visual-v4/correlacionadas e delete que o bloco “todas as actions” não testa.

A documentação abaixo mantém a evidência real sem promovê-la a cobertura inexistente.

## 3. Actions atuais do handler versus actions exercitadas aqui

A implementação atual de `createGtcRuntimeHandler` reconhece:

- GTC_QUERY_MANY — exercitada aqui;
- GTC_QUERY_BY_DHASH — exercitada aqui;
- GTC_QUERY_BY_PERCEPTUAL — exercitada aqui;
- GTC_QUERY_BY_PERCEPTUAL_CROP — **não exercitada aqui**;
- GTC_QUERY_BY_PERCEPTUAL_RELAXED — **não exercitada aqui**;
- GTC_QUERY_PERCEPTUAL_V2 — **não exercitada aqui**;
- GTC_SAVE — exercitada aqui;
- GTC_SAVE_MANY — exercitada aqui;
- GTC_DELETE_BY_CLEAN_URL — **não exercitada aqui**;
- GTC_CLEAR_ALL — exercitada aqui;
- GTC_STATS — exercitada aqui.

Há cobertura de algumas actions omitidas em outras suítes unitárias/integradas, mas isso não torna a alegação “todas” deste arquivo correta.

## 4. Persistência e schema

### O que é diretamente testado aqui
- fallback `createInMemoryRepository`;
- fallback de `createIndexedDbRepository({ indexedDbFactory:null })`;
- constantes `DB_VERSION=4`, DB_NAME e STORE_NAME;
- compatibilidade lógica de entradas visual-v2 no fallback;
- métodos in-memory de lookup/save/clear/stats.

### O que não é diretamente testado aqui
- `IDBFactory`;
- `indexedDB.open`;
- `onupgradeneeded`;
- criação dos índices físicos;
- upgrade v2→v3, v3→v4 ou preservação de registros durante upgrade;
- transações readonly/readwrite reais;
- persistência após reabertura.

Esses caminhos possuem testes separados em `tests/unit/gtc/indexeddb.test.js` e `tests/integration/ipc/gtc-indexeddb-deep.test.js`.

## 5. Falsos-verdes/força de assertion encontrados

### 5.1 Metadados perceptuais condicionados
No caso “resultado inclui reason, wDist, pDist”:

`if (values.length > 0) { assertions... }`

Se uma regressão fizer o lookup retornar zero resultados, o teste termina sem nenhuma assertion e fica verde.

### 5.2 “Maior confidence” não identifica o vencedor
O teste cria `closer` e `farther`, mas só calcula o maior confidence observado e exige `>0.5`. Ele não exige que a tradução vencedora seja `data:closer`.

### 5.3 “FASE 1 vs FASE 2” não executa Fase 2
O caso faz apenas lookup com hashes exatos. Não há segunda consulta aproximada. O comentário declara uma comparação que a execução não realiza.

### 5.4 “retorna {} sem fingerprintApi” não exige vazio
No bloco final, o teste exige apenas `entriesByPerceptual` definido, não `Object.keys(...).length === 0`.

### 5.5 GTC_SAVE “todos os campos visual-v3”
A request envia diversos campos, mas a verificação posterior lê apenas `translatedDataUrl` por hash. Persistência dos metadados individuais não é comprovada por esse caso.

## 6. Evidência por áreas

| Área | Classificação | Limite |
|---|---|---|
| normalizeHash | ✅ PROVADO DIRETAMENTE | cinco inputs |
| in-memory put/get/clear/stats | ✅ PROVADO DIRETAMENTE | não é IndexedDB físico |
| dHash in-memory | ✅ PROVADO DIRETAMENTE | índice IDB não provado |
| perceptual strict in-memory | ✅ PROVADO DIRETAMENTE | alguns casos com assertions fracas |
| handler actions antigas | ✅ PROVADO DIRETAMENTE | não são todas as actions atuais |
| DB_VERSION/DB_NAME/STORE_NAME | 🟦 GATE ESTRUTURAL ESPECÍFICO | constantes |
| createIndexedDbRepository persistente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo | somente fallback null |
| upgrade v2→v3/v3→v4 | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo | nenhuma abertura/upgrade |
| cross-language sintético | ✅ PROVADO DIRETAMENTE | in-memory + fixture controlada |
| Fase 1 vs Fase 2 no teste nomeado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO | só fase exata executada |
| actions crop/relaxed/V2/delete | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo | outras suítes podem cobrir parcialmente |
| degradação sem fpApi | ✅/🟨 | vazio perceptual não é assertado especificamente |

## 7. Dependências e consumidores

### Dependências
- `extension/shared/gtc-fingerprint.js`;
- `extension/shared/gtc-indexeddb.js`;
- `tests/visual/runner.js`;
- `tests/visual/helpers.js`.

### Consumidor
- `tests/visual/run-all.js` requer esta suíte diretamente;
- `package.json#test:visual` executa o entry point;
- CI executa `test:visual`.

## 8. Solicitações ao auditor

### 229-001 — DOCUMENTATION_DRIFT — OPEN
Cabeçalho visual-v3/schema v3/upgrade v2→v3 está desatualizado frente a DB_VERSION=4 e ao próprio conteúdo posterior.

### 229-002 — COVERAGE_GAP — OPEN
O bloco “todas as actions GTC_*” omite quatro actions atuais: crop, relaxed, correlated V2 e delete-by-clean-url.

### 229-003 — SCOPE_ACCURACY — OPEN
A suíte afirma cobrir createIndexedDbRepository e upgrade paths, mas só testa fallback com indexedDbFactory:null; não há upgrade/persistência física neste arquivo.

### 229-004 — FALSE_GREEN_RISK — OPEN
Remover o `if (values.length > 0)` como guard de assertions no teste de reason/wDist/pDist ou exigir explicitamente hit antes de validar metadados.

### 229-005 — ASSERTION_STRENGTH — OPEN
Fortalecer “múltiplos candidatos — maior confidence”, “GTC_SAVE todos os campos” e “sem fingerprintApi retorna {}” para verificar exatamente a propriedade do título.

### 229-006 — MISSING_PHASE2_ASSERTION — OPEN
O teste “[FASE 1 vs FASE 2]” deve realmente executar uma query aproximada separada e verificar a evidência de scan/Hamming; hoje só exercita o path exato.

## 9. Invariantes

1. normalizeHash deve produzir chaves canônicas.
2. Entradas sem hash/data URL não devem ser salvas.
3. GetMany não deve inventar misses.
4. dHash legado deve permanecer consultável.
5. Lookup perceptual sem fpApi deve degradar sem exceção.
6. Melhor candidato por query deve ser escolhido por maior confidence.
7. Entradas sem wHash/pHash não devem aparecer no strict perceptual.
8. Handler desconhecido deve retornar false e não interceptar.
9. DB_VERSION atual é 4.
10. Ausência de IndexedDB deve cair no fallback em memória.
11. Compatibilidade visual-v2 por SHA/dHash deve ser preservada.
12. A lista de actions documentada como completa deve acompanhar o handler real.
13. Testes não devem passar sem executar a assertion que dá nome ao caso.
14. Esta Bíblia vale apenas para SHA `0f5ca8e043a06219a342d2f32b59017762a953f0`.

## 10. Casos-limite relevantes

- hashes duplicados e case variants;
- arrays com null/undefined/duplicatas;
- entradas com apenas wHash ou apenas pHash;
- empate exato de confidence;
- campos crop visual-v4;
- relaxed thresholds;
- API correlacionada por queryId;
- aspect-ratio compatibility;
- delete por cleanUrl;
- upgrade físico de schemas;
- erro de transação/IDB;
- fpApi parcial sem matcher;
- metadata preservation em save/saveMany.

## 11. Fonte integral

~~~javascript
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// test_gtc_indexeddb.js
// Testes completos para gtc-indexeddb.js visual-v3
// Cobre: schema v3, createInMemoryRepository, createIndexedDbRepository,
//        getManyByPerceptual (fase 1 exata + fase 2 Hamming cross-language),
//        createGtcRuntimeHandler (todas as actions GTC_*), upgrade v2→v3.
// ─────────────────────────────────────────────────────────────────────────────

globalThis.self = globalThis;
require('../../extension/shared/gtc-fingerprint.js');
require('../../extension/shared/gtc-indexeddb.js');

const { describe, it, ita, beforeEach, expect } = require('./runner.js');
const fp  = globalThis.MangaTranslatorGtcFingerprint;
const idb = globalThis.MangaTranslatorGtcIndexedDb;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(overrides = {}) {
    return {
        hash:               overrides.hash              ?? 'sha256hash_' + Math.random().toString(36).slice(2),
        translatedDataUrl:  overrides.translatedDataUrl ?? 'data:image/png;base64,TRANSLATED_' + Math.random(),
        dHash:              overrides.dHash             ?? null,
        wHash:              overrides.wHash             ?? null,
        pHash:              overrides.pHash             ?? null,
        regionalHashes:     overrides.regionalHashes    ?? null,
        cleanUrl:           overrides.cleanUrl          ?? 'https://cdn.example.com/page1.jpg',
        width:              overrides.width             ?? 800,
        height:             overrides.height            ?? 1200,
        fingerprintVersion: overrides.fingerprintVersion ?? 'visual-v3',
        mimeType:           overrides.mimeType          ?? 'image/png',
        ...overrides,
    };
}

// Cria um hash hex de 64 chars com exatamente `ones` bits setados
function makeHash64(ones) {
    const chars = [];
    let bitsLeft = ones;
    for (let i = 0; i < 64; i++) {
        if      (bitsLeft >= 4) { chars.push('f'); bitsLeft -= 4; }
        else if (bitsLeft === 3) { chars.push('e'); bitsLeft = 0;  }
        else if (bitsLeft === 2) { chars.push('c'); bitsLeft = 0;  }
        else if (bitsLeft === 1) { chars.push('8'); bitsLeft = 0;  }
        else                     { chars.push('0'); }
    }
    return chars.join('');
}

// Pares de wHash/pHash similares (dentro do threshold) e distantes (fora)
const W_BASE  = makeHash64(0);   // todos zeros
const W_NEAR  = makeHash64(20);  // 20 bits → Hamming 20 ≤ 40 → match
const W_FAR   = makeHash64(100); // 100 bits → Hamming 100 > 80 → rejeição absoluta
const P_BASE  = makeHash64(0);
const P_NEAR  = makeHash64(15);  // 15 bits ≤ 35 → match
const P_FAR   = makeHash64(90);  // 90 > 70 → rejeição

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — normalizeHash
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeHash', () => {

    it('converte para lowercase', () => {
        expect(idb.normalizeHash('ABCDEF')).toBe('abcdef');
    });

    it('faz trim de espaços', () => {
        expect(idb.normalizeHash('  abc  ')).toBe('abc');
    });

    it('retorna "" para null', () => {
        expect(idb.normalizeHash(null)).toBe('');
    });

    it('retorna "" para undefined', () => {
        expect(idb.normalizeHash(undefined)).toBe('');
    });

    it('retorna "" para número', () => {
        expect(idb.normalizeHash(123)).toBe('');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — createInMemoryRepository — operações básicas
// ─────────────────────────────────────────────────────────────────────────────
describe('createInMemoryRepository — operações básicas', () => {

    let repo;
    beforeEach(() => { repo = idb.createInMemoryRepository(); });

    ita('put salva entrada e getMany retorna por SHA-256', async () => {
        const e = makeEntry({ hash: 'sha256abc' });
        await repo.put(e);
        const result = await repo.getMany(['sha256abc']);
        expect(result['sha256abc']).toBe(e.translatedDataUrl);
    });

    ita('getMany retorna {} para hash inexistente', async () => {
        const result = await repo.getMany(['nao_existe']);
        expect(Object.keys(result).length).toBe(0);
    });

    ita('put normaliza hash (case-insensitive)', async () => {
        const e = makeEntry({ hash: 'ABCDEF123' });
        await repo.put(e);
        const result = await repo.getMany(['abcdef123']);
        expect(result['abcdef123']).toBeDefined();
    });

    ita('put retorna { saved: false } para entry sem hash', async () => {
        const r = await repo.put({ translatedDataUrl: 'data:...' });
        expect(r.saved).toBe(false);
    });

    ita('put retorna { saved: false } para entry sem translatedDataUrl', async () => {
        const r = await repo.put({ hash: 'abc' });
        expect(r.saved).toBe(false);
    });

    ita('getMany em lote retorna múltiplas entradas', async () => {
        await repo.put(makeEntry({ hash: 'h1', translatedDataUrl: 'data:1' }));
        await repo.put(makeEntry({ hash: 'h2', translatedDataUrl: 'data:2' }));
        const r = await repo.getMany(['h1', 'h2', 'h3']);
        expect(r['h1']).toBe('data:1');
        expect(r['h2']).toBe('data:2');
        expect(r['h3']).toBeUndefined();
    });

    ita('putMany salva múltiplas entradas em uma chamada', async () => {
        await repo.putMany([
            makeEntry({ hash: 'm1', translatedDataUrl: 'data:m1' }),
            makeEntry({ hash: 'm2', translatedDataUrl: 'data:m2' }),
        ]);
        const r = await repo.getMany(['m1', 'm2']);
        expect(r['m1']).toBe('data:m1');
        expect(r['m2']).toBe('data:m2');
    });

    ita('stats retorna count correto', async () => {
        await repo.put(makeEntry({ hash: 's1' }));
        await repo.put(makeEntry({ hash: 's2' }));
        const s = await repo.stats();
        expect(s.count).toBeGreaterThanOrEqual(2);
    });

    ita('clear apaga todas as entradas', async () => {
        await repo.put(makeEntry({ hash: 'clear1' }));
        await repo.clear();
        const s = await repo.stats();
        expect(s.count).toBe(0);
    });

    ita('put sobrescreve entrada existente com mesmo hash', async () => {
        await repo.put(makeEntry({ hash: 'dupe', translatedDataUrl: 'data:original' }));
        await repo.put(makeEntry({ hash: 'dupe', translatedDataUrl: 'data:updated' }));
        const r = await repo.getMany(['dupe']);
        expect(r['dupe']).toBe('data:updated');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — createInMemoryRepository — getManyByDHash
// ─────────────────────────────────────────────────────────────────────────────
describe('createInMemoryRepository — getManyByDHash', () => {

    let repo;
    beforeEach(() => { repo = idb.createInMemoryRepository(); });

    ita('retorna translatedDataUrl pelo dHash', async () => {
        await repo.put(makeEntry({ hash: 'sha1', dHash: 'dhash1111', translatedDataUrl: 'data:dh1' }));
        const r = await repo.getManyByDHash(['dhash1111']);
        expect(r['dhash1111']).toBe('data:dh1');
    });

    ita('retorna {} para dHash inexistente', async () => {
        const r = await repo.getManyByDHash(['nao_existe_dh']);
        expect(Object.keys(r).length).toBe(0);
    });

    ita('retorna {} para array vazio', async () => {
        const r = await repo.getManyByDHash([]);
        expect(Object.keys(r).length).toBe(0);
    });

    ita('lookup múltiplos dHashes simultaneamente', async () => {
        await repo.put(makeEntry({ hash: 'a', dHash: 'dh_a', translatedDataUrl: 'data:a' }));
        await repo.put(makeEntry({ hash: 'b', dHash: 'dh_b', translatedDataUrl: 'data:b' }));
        const r = await repo.getManyByDHash(['dh_a', 'dh_b', 'dh_c']);
        expect(r['dh_a']).toBe('data:a');
        expect(r['dh_b']).toBe('data:b');
        expect(r['dh_c']).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — createInMemoryRepository — getManyByPerceptual (wHash+pHash)
// Testa o CORAÇÃO do visual-v3: lookup perceptual com Hamming.
// ─────────────────────────────────────────────────────────────────────────────
describe('createInMemoryRepository — getManyByPerceptual (visual-v3)', () => {

    let repo;
    beforeEach(() => { repo = idb.createInMemoryRepository(); });

    ita('retorna {} sem fpApi (graceful degradation)', async () => {
        await repo.put(makeEntry({ hash: 'h', wHash: W_BASE, pHash: P_BASE, translatedDataUrl: 'data:t' }));
        const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], null);
        expect(Object.keys(r).length).toBe(0);
    });

    ita('retorna {} para arrays vazios', async () => {
        const r = await repo.getManyByPerceptual([], [], fp);
        expect(Object.keys(r).length).toBe(0);
    });

    ita('match exato (wHash idêntico) → retorna resultado', async () => {
        await repo.put(makeEntry({
            hash: 'exact1', wHash: W_BASE, pHash: P_BASE,
            translatedDataUrl: 'data:exact',
        }));
        const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], fp);
        const values = Object.values(r);
        expect(values.length).toBeGreaterThan(0);
        expect(values[0].translatedDataUrl).toBe('data:exact');
    });

    ita('match aproximado (wHash similar, Hamming ≤ 40) → retorna resultado com confidence', async () => {
        // Salva com W_BASE, busca com W_NEAR (Hamming=20 ≤ 40 = match)
        await repo.put(makeEntry({
            hash: 'approx1', wHash: W_BASE, pHash: P_BASE,
            translatedDataUrl: 'data:approx',
        }));
        const r = await repo.getManyByPerceptual([W_NEAR], [P_NEAR], fp);
        const values = Object.values(r);
        expect(values.length).toBeGreaterThan(0);
        const hit = values[0];
        expect(hit.translatedDataUrl).toBe('data:approx');
        expect(hit.confidence).toBeGreaterThan(0);
        expect(hit.confidence).toBeLessThanOrEqual(1);
    });

    ita('match distante (wHash Hamming > 80) → não retorna resultado', async () => {
        await repo.put(makeEntry({
            hash: 'far1', wHash: W_BASE, pHash: P_BASE,
            translatedDataUrl: 'data:far',
        }));
        const r = await repo.getManyByPerceptual([W_FAR], [P_FAR], fp);
        expect(Object.keys(r).length).toBe(0);
    });

    ita('entrada sem wHash/pHash é ignorada no lookup perceptual', async () => {
        await repo.put(makeEntry({
            hash: 'nowhash', wHash: null, pHash: null,
            translatedDataUrl: 'data:nowhash',
        }));
        const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], fp);
        // Não deve retornar a entrada sem wHash (sem dados para comparar)
        expect(Object.keys(r).length).toBe(0);
    });

    ita('múltiplos candidatos — retorna o de maior confidence', async () => {
        // Dois candidatos: um mais próximo e um mais distante
        await repo.put(makeEntry({
            hash: 'closer', wHash: makeHash64(10), pHash: makeHash64(8),
            translatedDataUrl: 'data:closer',
        }));
        await repo.put(makeEntry({
            hash: 'farther', wHash: makeHash64(35), pHash: makeHash64(28),
            translatedDataUrl: 'data:farther',
        }));
        const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], fp);
        const values = Object.values(r);
        // Deve haver resultados (ambos dentro do threshold)
        expect(values.length).toBeGreaterThan(0);
        // O mais próximo deve ter confidence maior
        const maxConf = Math.max(...values.map(v => v.confidence || 0));
        expect(maxConf).toBeGreaterThan(0.5); // o mais próximo tem alta confidence
    });

    ita('resultado inclui reason, wDist, pDist', async () => {
        await repo.put(makeEntry({
            hash: 'reason_test', wHash: W_BASE, pHash: P_BASE,
            translatedDataUrl: 'data:reason',
        }));
        const r = await repo.getManyByPerceptual([W_NEAR], [P_NEAR], fp);
        const values = Object.values(r);
        if (values.length > 0) {
            expect(values[0]).toHaveProperty('reason');
            expect(values[0]).toHaveProperty('wDist');
            expect(values[0]).toHaveProperty('pDist');
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — createGtcRuntimeHandler — todas as actions GTC_*
// ─────────────────────────────────────────────────────────────────────────────
describe('createGtcRuntimeHandler — actions GTC_*', () => {

    let repo, handler;

    beforeEach(() => {
        repo    = idb.createInMemoryRepository();
        handler = idb.createGtcRuntimeHandler({ repository: repo, fingerprintApi: fp });
    });

    // Helper: simula chrome.runtime.sendMessage assíncrono
    function sendMessage(action, payload = {}) {
        return new Promise((resolve) => {
            const request = { action, ...payload };
            const shouldContinue = handler(request, {}, resolve);
            if (!shouldContinue) resolve({ ok: false, reason: 'unhandled' });
        });
    }

    // ── GTC_QUERY_MANY ────────────────────────────────────────────────────────
    ita('GTC_QUERY_MANY — retorna ok:true e entriesByHash', async () => {
        await repo.put(makeEntry({ hash: 'qh1', translatedDataUrl: 'data:q1' }));
        const r = await sendMessage('GTC_QUERY_MANY', { hashes: ['qh1'] });
        expect(r.ok).toBe(true);
        expect(r.entriesByHash['qh1']).toBe('data:q1');
    });

    ita('GTC_QUERY_MANY — retorna ok:true com entriesByHash vazio para miss', async () => {
        const r = await sendMessage('GTC_QUERY_MANY', { hashes: ['inexistente'] });
        expect(r.ok).toBe(true);
        expect(Object.keys(r.entriesByHash).length).toBe(0);
    });

    ita('GTC_QUERY_MANY — inclui durationMs na resposta', async () => {
        const r = await sendMessage('GTC_QUERY_MANY', { hashes: [] });
        expect(typeof r.durationMs).toBe('number');
        expect(r.durationMs).toBeGreaterThanOrEqual(0);
    });

    // ── GTC_QUERY_BY_DHASH ────────────────────────────────────────────────────
    ita('GTC_QUERY_BY_DHASH — encontra por dHash', async () => {
        await repo.put(makeEntry({ hash: 'sha_dh', dHash: 'dhash_test', translatedDataUrl: 'data:dh' }));
        const r = await sendMessage('GTC_QUERY_BY_DHASH', { dHashes: ['dhash_test'] });
        expect(r.ok).toBe(true);
        expect(r.entriesByDHash['dhash_test']).toBe('data:dh');
    });

    ita('GTC_QUERY_BY_DHASH — retorna ok:true com vazio para miss', async () => {
        const r = await sendMessage('GTC_QUERY_BY_DHASH', { dHashes: ['dhash_miss'] });
        expect(r.ok).toBe(true);
        expect(Object.keys(r.entriesByDHash).length).toBe(0);
    });

    // ── GTC_QUERY_BY_PERCEPTUAL (visual-v3, NOVO) ─────────────────────────────
    ita('GTC_QUERY_BY_PERCEPTUAL — match exato retorna resultado', async () => {
        await repo.put(makeEntry({
            hash: 'perc_exact', wHash: W_BASE, pHash: P_BASE,
            translatedDataUrl: 'data:perc_exact',
        }));
        const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
            wHashes: [W_BASE], pHashes: [P_BASE],
        });
        expect(r.ok).toBe(true);
        const values = Object.values(r.entriesByPerceptual);
        expect(values.length).toBeGreaterThan(0);
        expect(values[0].translatedDataUrl).toBe('data:perc_exact');
    });

    ita('GTC_QUERY_BY_PERCEPTUAL — match aproximado (cross-language) retorna resultado', async () => {
        await repo.put(makeEntry({
            hash: 'perc_approx', wHash: W_BASE, pHash: P_BASE,
            translatedDataUrl: 'data:perc_approx',
        }));
        const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
            wHashes: [W_NEAR], pHashes: [P_NEAR],
        });
        expect(r.ok).toBe(true);
        const values = Object.values(r.entriesByPerceptual);
        expect(values.length).toBeGreaterThan(0);
    });

    ita('GTC_QUERY_BY_PERCEPTUAL — sem match retorna objeto vazio', async () => {
        await repo.put(makeEntry({
            hash: 'perc_far', wHash: W_BASE, pHash: P_BASE,
            translatedDataUrl: 'data:far',
        }));
        const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
            wHashes: [W_FAR], pHashes: [P_FAR],
        });
        expect(r.ok).toBe(true);
        expect(Object.keys(r.entriesByPerceptual).length).toBe(0);
    });

    ita('GTC_QUERY_BY_PERCEPTUAL — arrays vazios retorna objeto vazio', async () => {
        const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
            wHashes: [], pHashes: [],
        });
        expect(r.ok).toBe(true);
        expect(Object.keys(r.entriesByPerceptual).length).toBe(0);
    });

    // ── GTC_SAVE ──────────────────────────────────────────────────────────────
    ita('GTC_SAVE — salva todos os campos visual-v3', async () => {
        const r = await sendMessage('GTC_SAVE', {
            hash:               'save_v3',
            translatedDataUrl:  'data:saved_v3',
            dHash:              'dhash_save',
            wHash:              W_BASE,
            pHash:              P_BASE,
            regionalHashes:     { topLeft: 'aabbccdd00112233', topRight: 'aabbccdd00112234',
                                  bottomLeft: 'aabbccdd00112235', bottomRight: 'aabbccdd00112236' },
            cleanUrl:           'https://ex.com/p1.jpg',
            width:              800,
            height:             1200,
            fingerprintVersion: 'visual-v3',
            mimeType:           'image/png',
        });
        expect(r.ok).toBe(true);
        expect(r.saved).toBe(true);

        // Verifica que o dado foi salvo corretamente
        const q = await repo.getMany(['save_v3']);
        expect(q['save_v3']).toBe('data:saved_v3');
    });

    ita('GTC_SAVE — retorna ok:true e saved:false para hash vazio', async () => {
        const r = await sendMessage('GTC_SAVE', { hash: '', translatedDataUrl: 'data:x' });
        expect(r.ok).toBe(true);
        expect(r.saved).toBe(false);
    });

    // ── GTC_SAVE_MANY ─────────────────────────────────────────────────────────
    ita('GTC_SAVE_MANY — salva múltiplas entradas', async () => {
        const r = await sendMessage('GTC_SAVE_MANY', {
            entries: [
                makeEntry({ hash: 'many1', translatedDataUrl: 'data:m1' }),
                makeEntry({ hash: 'many2', translatedDataUrl: 'data:m2', wHash: W_BASE, pHash: P_BASE }),
            ],
        });
        expect(r.ok).toBe(true);
        expect(r.count).toBe(2);
        const q = await repo.getMany(['many1', 'many2']);
        expect(q['many1']).toBe('data:m1');
        expect(q['many2']).toBe('data:m2');
    });

    ita('GTC_SAVE_MANY — array vazio não lança erro', async () => {
        const r = await sendMessage('GTC_SAVE_MANY', { entries: [] });
        expect(r.ok).toBe(true);
    });

    // ── GTC_CLEAR_ALL ─────────────────────────────────────────────────────────
    ita('GTC_CLEAR_ALL — remove todas as entradas', async () => {
        await repo.put(makeEntry({ hash: 'toClear' }));
        const r = await sendMessage('GTC_CLEAR_ALL');
        expect(r.ok).toBe(true);
        expect(r.cleared).toBe(true);
        const s = await repo.stats();
        expect(s.count).toBe(0);
    });

    // ── GTC_STATS ─────────────────────────────────────────────────────────────
    ita('GTC_STATS — retorna count correto', async () => {
        await repo.put(makeEntry({ hash: 'stat1' }));
        await repo.put(makeEntry({ hash: 'stat2' }));
        const r = await sendMessage('GTC_STATS');
        expect(r.ok).toBe(true);
        expect(r.stats.count).toBeGreaterThanOrEqual(2);
    });

    // ── Ação desconhecida ─────────────────────────────────────────────────────
    it('ação desconhecida retorna false (não intercepta)', () => {
        const result = handler({ action: 'SOME_OTHER_ACTION' }, {}, () => {});
        expect(result).toBe(false);
    });

    it('request null retorna false', () => {
        const result = handler(null, {}, () => {});
        expect(result).toBe(false);
    });

    it('request sem action retorna false', () => {
        const result = handler({}, {}, () => {});
        expect(result).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — Schema v4 — upgrade paths e backward-compat
// ─────────────────────────────────────────────────────────────────────────────
describe('Schema v4 — constantes e backward-compat', () => {

    it('DB_VERSION é 4', () => {
        expect(idb.DB_VERSION).toBe(4);
    });

    it('DB_NAME é o esperado', () => {
        expect(idb.DB_NAME).toBe('manga_translator_gtc');
    });

    it('STORE_NAME é o esperado', () => {
        expect(idb.STORE_NAME).toBe('translations');
    });

    it('createInMemoryRepository cria repositório funcional (fallback)', () => {
        const repo = idb.createInMemoryRepository();
        expect(typeof repo.getMany).toBe('function');
        expect(typeof repo.getManyByDHash).toBe('function');
        expect(typeof repo.getManyByPerceptual).toBe('function');
        expect(typeof repo.getManyByPerceptualCrop).toBe('function');
        expect(typeof repo.put).toBe('function');
        expect(typeof repo.putMany).toBe('function');
        expect(typeof repo.clear).toBe('function');
        expect(typeof repo.stats).toBe('function');
    });

    it('createIndexedDbRepository usa fallback de memória quando indexedDB ausente', () => {
        const repo = idb.createIndexedDbRepository({ indexedDbFactory: null });
        // Sem IndexedDB real, cria repositório em memória
        expect(typeof repo.getMany).toBe('function');
        expect(typeof repo.getManyByPerceptual).toBe('function');
        expect(typeof repo.getManyByPerceptualCrop).toBe('function');
    });

    ita('entradas visual-v2 (sem wHash/pHash) são lookup-áveis via SHA-256', async () => {
        const repo = idb.createInMemoryRepository();
        // Simula entrada visual-v2 (sem wHash/pHash)
        await repo.put(makeEntry({
            hash: 'v2_entry', dHash: 'dh_v2', wHash: null, pHash: null,
            fingerprintVersion: 'visual-v2',
            translatedDataUrl: 'data:v2',
        }));
        // SHA-256 lookup deve funcionar
        const r = await repo.getMany(['v2_entry']);
        expect(r['v2_entry']).toBe('data:v2');
    });

    ita('entradas visual-v2 são lookup-áveis via dHash', async () => {
        const repo = idb.createInMemoryRepository();
        await repo.put(makeEntry({
            hash: 'v2_dh', dHash: 'dh_legacy', wHash: null, pHash: null,
            fingerprintVersion: 'visual-v2',
            translatedDataUrl: 'data:v2_dh',
        }));
        const r = await repo.getManyByDHash(['dh_legacy']);
        expect(r['dh_legacy']).toBe('data:v2_dh');
    });

    ita('entradas visual-v2 NÃO aparecem no lookup perceptual (wHash null)', async () => {
        const repo = idb.createInMemoryRepository();
        await repo.put(makeEntry({
            hash: 'v2_perc', wHash: null, pHash: null,
            fingerprintVersion: 'visual-v2',
            translatedDataUrl: 'data:v2_perc',
        }));
        const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], fp);
        // Entrada sem wHash/pHash não deve aparecer no lookup perceptual
        expect(Object.keys(r).length).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7 — getManyByPerceptual — Fase 2 cross-language (Hamming scan)
// Testa o path de matching aproximado com hashes reais gerados pelo
// calculateWHash/calculatePHash usando imagens sintéticas de mangá.
// ─────────────────────────────────────────────────────────────────────────────
describe('getManyByPerceptual — Fase 2 cross-language com hashes reais', () => {

    const { solidColor, mangaPage, noise } = require('./helpers.js');

    function scaleDown(data, srcW, srcH, dstW, dstH) {
        const out = new Uint8ClampedArray(dstW * dstH * 4);
        for (let r = 0; r < dstH; r++) {
            for (let c = 0; c < dstW; c++) {
                const srcR = Math.floor(r * srcH / dstH);
                const srcC = Math.floor(c * srcW / dstW);
                const si = (srcR * srcW + srcC) * 4;
                const di = (r * dstW + c) * 4;
                out[di] = data[si]; out[di+1] = data[si+1];
                out[di+2] = data[si+2]; out[di+3] = data[si+3];
            }
        }
        return out;
    }

    let repo;
    beforeEach(() => { repo = idb.createInMemoryRepository(); });

    ita('[CROSS-LANGUAGE] salva EN, busca PT — deve fazer match', async () => {
        const srcEN = scaleDown(mangaPage(64, 64, 'EN'), 64, 64, 32, 32);
        const srcPT = scaleDown(mangaPage(64, 64, 'PT'), 64, 64, 32, 32);

        const wHashEN = fp.calculateWHash(srcEN);
        const pHashEN = fp.calculatePHash(srcEN);
        const wHashPT = fp.calculateWHash(srcPT);
        const pHashPT = fp.calculatePHash(srcPT);

        // Salva a tradução gerada para a versão EN
        await repo.put(makeEntry({
            hash: 'cross_en', wHash: wHashEN, pHash: pHashEN,
            translatedDataUrl: 'data:translated_en',
        }));

        // Busca com a versão PT (mesma arte, texto diferente)
        const r = await repo.getManyByPerceptual([wHashPT], [pHashPT], fp);
        const values = Object.values(r);

        console.log(`      Cross-language match: ${values.length} resultado(s) encontrado(s)`);
        if (values.length > 0) {
            console.log(`      Confidence: ${values[0].confidence?.toFixed(3)}, Reason: ${values[0].reason}`);
        }

        expect(values.length).toBeGreaterThan(0);
        expect(values[0].translatedDataUrl).toBe('data:translated_en');
    });

    ita('[CROSS-LANGUAGE] página diferente NÃO faz match', async () => {
        const srcEN    = scaleDown(mangaPage(64, 64, 'EN'),   64, 64, 32, 32);
        const srcNoise = scaleDown(noise(64, 64, 54321),      64, 64, 32, 32);

        const wHashEN    = fp.calculateWHash(srcEN);
        const pHashEN    = fp.calculatePHash(srcEN);
        const wHashNoise = fp.calculateWHash(srcNoise);
        const pHashNoise = fp.calculatePHash(srcNoise);

        await repo.put(makeEntry({
            hash: 'cross_en2', wHash: wHashEN, pHash: pHashEN,
            translatedDataUrl: 'data:en2',
        }));

        const r = await repo.getManyByPerceptual([wHashNoise], [pHashNoise], fp);
        expect(Object.keys(r).length).toBe(0);
    });

    ita('[FASE 1 vs FASE 2] hash exato usa fase 1, hash aproximado usa fase 2', async () => {
        const srcEN = scaleDown(mangaPage(64, 64, 'EN'), 64, 64, 32, 32);
        const wH    = fp.calculateWHash(srcEN);
        const pH    = fp.calculatePHash(srcEN);

        await repo.put(makeEntry({
            hash: 'phase_test', wHash: wH, pHash: pH,
            translatedDataUrl: 'data:phase',
        }));

        // Fase 1: hash exato
        const r1 = await repo.getManyByPerceptual([wH], [pH], fp);
        expect(Object.values(r1)[0]?.translatedDataUrl).toBe('data:phase');

        // Nota sobre confidence: fase 1 retorna 1.0 (exato), fase 2 < 1.0
        const exactResult = Object.values(r1)[0];
        if (exactResult?.reason === 'whash_exact' || exactResult?.reason === 'phash_exact') {
            expect(exactResult.confidence).toBe(1.0);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8 — createGtcRuntimeHandler — fingerprintApi null (degradação graciosa)
// ─────────────────────────────────────────────────────────────────────────────
describe('createGtcRuntimeHandler — degradação graciosa sem fingerprintApi', () => {

    let repo, handlerNoFp;

    beforeEach(() => {
        repo        = idb.createInMemoryRepository();
        // handler criado SEM fingerprintApi
        handlerNoFp = idb.createGtcRuntimeHandler({ repository: repo, fingerprintApi: null });
    });

    function sendMessage(action, payload = {}) {
        return new Promise((resolve) => {
            const request = { action, ...payload };
            const cont = handlerNoFp(request, {}, resolve);
            if (!cont) resolve({ ok: false });
        });
    }

    ita('GTC_QUERY_MANY ainda funciona sem fingerprintApi', async () => {
        await repo.put(makeEntry({ hash: 'nofp', translatedDataUrl: 'data:nofp' }));
        const r = await sendMessage('GTC_QUERY_MANY', { hashes: ['nofp'] });
        expect(r.ok).toBe(true);
        expect(r.entriesByHash['nofp']).toBe('data:nofp');
    });

    ita('GTC_QUERY_BY_PERCEPTUAL retorna ok:true com {} (não quebra)', async () => {
        await repo.put(makeEntry({
            hash: 'nofp2', wHash: W_BASE, pHash: P_BASE,
            translatedDataUrl: 'data:nofp2',
        }));
        // Sem fpApi, getManyByPerceptual retorna {} mas não lança exceção
        const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
            wHashes: [W_BASE], pHashes: [P_BASE],
        });
        expect(r.ok).toBe(true);
        expect(r.entriesByPerceptual).toBeDefined();
    });

    ita('GTC_SAVE ainda salva com wHash/pHash sem fingerprintApi', async () => {
        const r = await sendMessage('GTC_SAVE', {
            hash: 'nofp_save', translatedDataUrl: 'data:nofp_save',
            wHash: W_BASE, pHash: P_BASE,
        });
        expect(r.ok).toBe(true);
        expect(r.saved).toBe(true);
    });
});
~~~

## 12. Cobertura documental por linhas

As faixas são contíguas e cobrem **1–706**; 706 representa o newline final.

### 1. Linhas 1-9 — Cabeçalho visual-v3 legado

Fonte auditada:
~~~text
1: 'use strict';
2: // ─────────────────────────────────────────────────────────────────────────────
3: // test_gtc_indexeddb.js
4: // Testes completos para gtc-indexeddb.js visual-v3
5: // Cobre: schema v3, createInMemoryRepository, createIndexedDbRepository,
6: //        getManyByPerceptual (fase 1 exata + fase 2 Hamming cross-language),
7: //        createGtcRuntimeHandler (todas as actions GTC_*), upgrade v2→v3.
8: // ─────────────────────────────────────────────────────────────────────────────
9: ␠ [linha vazia]
~~~

**O que faz:** Declara a suíte como testes completos do gtc-indexeddb visual-v3, schema v3 e upgrade v2→v3.

**Como faz:** Somente comentários introdutórios.

**Por que existe assim:** Registra a intenção histórica da suíte.

**Risco/limite:** Está desatualizado e sobre-afirma cobertura: o código atual é DB_VERSION 4, e esta suíte não executa upgrade físico de IndexedDB nem todas as actions atuais.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para as alegações de completude/upgrade do cabeçalho.

### 2. Linhas 10-16 — Bootstrap das APIs reais

Fonte auditada:
~~~text
10: globalThis.self = globalThis;
11: require('../../extension/shared/gtc-fingerprint.js');
12: require('../../extension/shared/gtc-indexeddb.js');
13: ␠ [linha vazia]
14: const { describe, it, ita, beforeEach, expect } = require('./runner.js');
15: const fp  = globalThis.MangaTranslatorGtcFingerprint;
16: const idb = globalThis.MangaTranslatorGtcIndexedDb;
~~~

**O que faz:** Mapeia self para globalThis, carrega fingerprint e indexeddb reais, importa runner e captura fp/idb globais.

**Como faz:** Requires CommonJS executam os módulos reais no processo Node.

**Por que existe assim:** Permite testar a lógica compartilhada sem browser.

**Risco/limite:** Node não é IndexedDB/browser real; createIndexedDbRepository persistente só é exercitado em outras suítes.

**Evidência:** ✅ PROVADO DIRETAMENTE para as APIs carregadas; 🟨 ambiente é simulado.

### 3. Linhas 17-50 — Factory makeEntry e makeHash64

Fonte auditada:
~~~text
17: ␠ [linha vazia]
18: // ─────────────────────────────────────────────────────────────────────────────
19: // Helpers
20: // ─────────────────────────────────────────────────────────────────────────────
21: ␠ [linha vazia]
22: function makeEntry(overrides = {}) {
23:     return {
24:         hash:               overrides.hash              ?? 'sha256hash_' + Math.random().toString(36).slice(2),
25:         translatedDataUrl:  overrides.translatedDataUrl ?? 'data:image/png;base64,TRANSLATED_' + Math.random(),
26:         dHash:              overrides.dHash             ?? null,
27:         wHash:              overrides.wHash             ?? null,
28:         pHash:              overrides.pHash             ?? null,
29:         regionalHashes:     overrides.regionalHashes    ?? null,
30:         cleanUrl:           overrides.cleanUrl          ?? 'https://cdn.example.com/page1.jpg',
31:         width:              overrides.width             ?? 800,
32:         height:             overrides.height            ?? 1200,
33:         fingerprintVersion: overrides.fingerprintVersion ?? 'visual-v3',
34:         mimeType:           overrides.mimeType          ?? 'image/png',
35:         ...overrides,
36:     };
37: }
38: ␠ [linha vazia]
39: // Cria um hash hex de 64 chars com exatamente `ones` bits setados
40: function makeHash64(ones) {
41:     const chars = [];
42:     let bitsLeft = ones;
43:     for (let i = 0; i < 64; i++) {
44:         if      (bitsLeft >= 4) { chars.push('f'); bitsLeft -= 4; }
45:         else if (bitsLeft === 3) { chars.push('e'); bitsLeft = 0;  }
46:         else if (bitsLeft === 2) { chars.push('c'); bitsLeft = 0;  }
47:         else if (bitsLeft === 1) { chars.push('8'); bitsLeft = 0;  }
48:         else                     { chars.push('0'); }
49:     }
50:     return chars.join('');
~~~

**O que faz:** Cria entradas GTC padrão e hashes hex com quantidade controlada de bits 1.

**Como faz:** makeEntry usa defaults/overrides e valores aleatórios para hash/data URL; makeHash64 constrói 64 nibbles.

**Por que existe assim:** Reduz boilerplate e permite distâncias de Hamming previsíveis.

**Risco/limite:** Math.random torna campos default não determinísticos, embora casos relevantes geralmente sobrescrevam as chaves; makeHash64 não valida faixa de ones.

**Evidência:** 🟨 Helpers são exercitados por dezenas de testes; não há self-test isolado de todos os edge cases.

### 4. Linhas 51-59 — Constantes de hashes próximos/distantes

Fonte auditada:
~~~text
51: }
52: ␠ [linha vazia]
53: // Pares de wHash/pHash similares (dentro do threshold) e distantes (fora)
54: const W_BASE  = makeHash64(0);   // todos zeros
55: const W_NEAR  = makeHash64(20);  // 20 bits → Hamming 20 ≤ 40 → match
56: const W_FAR   = makeHash64(100); // 100 bits → Hamming 100 > 80 → rejeição absoluta
57: const P_BASE  = makeHash64(0);
58: const P_NEAR  = makeHash64(15);  // 15 bits ≤ 35 → match
59: const P_FAR   = makeHash64(90);  // 90 > 70 → rejeição
~~~

**O que faz:** Deriva W/P base, near e far com distâncias planejadas contra thresholds strict.

**Como faz:** makeHash64 cria 0, 20/15 e 100/90 bits setados.

**Por que existe assim:** Fornece fixtures determinísticas para match, aproximação e rejeição.

**Risco/limite:** Thresholds estão codificados nos comentários; se valores do módulo mudarem, a intenção textual pode divergir.

**Evidência:** 🟨 Os casos perceptuais exercitam as fixtures; não há gate que compare comentários aos thresholds exportados.

### 5. Linhas 60-86 — Suite 1 — normalizeHash

Fonte auditada:
~~~text
60: ␠ [linha vazia]
61: // ─────────────────────────────────────────────────────────────────────────────
62: // SUITE 1 — normalizeHash
63: // ─────────────────────────────────────────────────────────────────────────────
64: describe('normalizeHash', () => {
65: ␠ [linha vazia]
66:     it('converte para lowercase', () => {
67:         expect(idb.normalizeHash('ABCDEF')).toBe('abcdef');
68:     });
69: ␠ [linha vazia]
70:     it('faz trim de espaços', () => {
71:         expect(idb.normalizeHash('  abc  ')).toBe('abc');
72:     });
73: ␠ [linha vazia]
74:     it('retorna "" para null', () => {
75:         expect(idb.normalizeHash(null)).toBe('');
76:     });
77: ␠ [linha vazia]
78:     it('retorna "" para undefined', () => {
79:         expect(idb.normalizeHash(undefined)).toBe('');
80:     });
81: ␠ [linha vazia]
82:     it('retorna "" para número', () => {
83:         expect(idb.normalizeHash(123)).toBe('');
84:     });
85: });
86: ␠ [linha vazia]
~~~

**O que faz:** Testa lowercase, trim e rejeição de null/undefined/número.

**Como faz:** Cinco it chamam normalizeHash real com assertions exatas.

**Por que existe assim:** Protege normalização usada como chave/índice.

**Risco/limite:** Não cobre whitespace interno, string vazia ou objetos; isso não invalida os casos presentes.

**Evidência:** ✅ PROVADO DIRETAMENTE para os cinco inputs.

### 6. Linhas 87-164 — Suite 2 — operações básicas in-memory

Fonte auditada:
~~~text
87: // ─────────────────────────────────────────────────────────────────────────────
88: // SUITE 2 — createInMemoryRepository — operações básicas
89: // ─────────────────────────────────────────────────────────────────────────────
90: describe('createInMemoryRepository — operações básicas', () => {
91: ␠ [linha vazia]
92:     let repo;
93:     beforeEach(() => { repo = idb.createInMemoryRepository(); });
94: ␠ [linha vazia]
95:     ita('put salva entrada e getMany retorna por SHA-256', async () => {
96:         const e = makeEntry({ hash: 'sha256abc' });
97:         await repo.put(e);
98:         const result = await repo.getMany(['sha256abc']);
99:         expect(result['sha256abc']).toBe(e.translatedDataUrl);
100:     });
101: ␠ [linha vazia]
102:     ita('getMany retorna {} para hash inexistente', async () => {
103:         const result = await repo.getMany(['nao_existe']);
104:         expect(Object.keys(result).length).toBe(0);
105:     });
106: ␠ [linha vazia]
107:     ita('put normaliza hash (case-insensitive)', async () => {
108:         const e = makeEntry({ hash: 'ABCDEF123' });
109:         await repo.put(e);
110:         const result = await repo.getMany(['abcdef123']);
111:         expect(result['abcdef123']).toBeDefined();
112:     });
113: ␠ [linha vazia]
114:     ita('put retorna { saved: false } para entry sem hash', async () => {
115:         const r = await repo.put({ translatedDataUrl: 'data:...' });
116:         expect(r.saved).toBe(false);
117:     });
118: ␠ [linha vazia]
119:     ita('put retorna { saved: false } para entry sem translatedDataUrl', async () => {
120:         const r = await repo.put({ hash: 'abc' });
121:         expect(r.saved).toBe(false);
122:     });
123: ␠ [linha vazia]
124:     ita('getMany em lote retorna múltiplas entradas', async () => {
125:         await repo.put(makeEntry({ hash: 'h1', translatedDataUrl: 'data:1' }));
126:         await repo.put(makeEntry({ hash: 'h2', translatedDataUrl: 'data:2' }));
127:         const r = await repo.getMany(['h1', 'h2', 'h3']);
128:         expect(r['h1']).toBe('data:1');
129:         expect(r['h2']).toBe('data:2');
130:         expect(r['h3']).toBeUndefined();
131:     });
132: ␠ [linha vazia]
133:     ita('putMany salva múltiplas entradas em uma chamada', async () => {
134:         await repo.putMany([
135:             makeEntry({ hash: 'm1', translatedDataUrl: 'data:m1' }),
136:             makeEntry({ hash: 'm2', translatedDataUrl: 'data:m2' }),
137:         ]);
138:         const r = await repo.getMany(['m1', 'm2']);
139:         expect(r['m1']).toBe('data:m1');
140:         expect(r['m2']).toBe('data:m2');
141:     });
142: ␠ [linha vazia]
143:     ita('stats retorna count correto', async () => {
144:         await repo.put(makeEntry({ hash: 's1' }));
145:         await repo.put(makeEntry({ hash: 's2' }));
146:         const s = await repo.stats();
147:         expect(s.count).toBeGreaterThanOrEqual(2);
148:     });
149: ␠ [linha vazia]
150:     ita('clear apaga todas as entradas', async () => {
151:         await repo.put(makeEntry({ hash: 'clear1' }));
152:         await repo.clear();
153:         const s = await repo.stats();
154:         expect(s.count).toBe(0);
155:     });
156: ␠ [linha vazia]
157:     ita('put sobrescreve entrada existente com mesmo hash', async () => {
158:         await repo.put(makeEntry({ hash: 'dupe', translatedDataUrl: 'data:original' }));
159:         await repo.put(makeEntry({ hash: 'dupe', translatedDataUrl: 'data:updated' }));
160:         const r = await repo.getMany(['dupe']);
161:         expect(r['dupe']).toBe('data:updated');
162:     });
163: });
164: ␠ [linha vazia]
~~~

**O que faz:** Exercita put/getMany, validação, normalização, batch, stats, clear e overwrite no fallback em memória.

**Como faz:** beforeEach cria repo novo; dez ita usam métodos reais.

**Por que existe assim:** Protege o fallback e o contrato de armazenamento lógico sem IndexedDB.

**Risco/limite:** beforeEach depende do runner que atualmente engole falha de hook; stats usa >=2, não exatamente 2. Nenhuma transação/index físico é provado.

**Evidência:** ✅ PROVADO DIRETAMENTE para createInMemoryRepository nos cenários; ⚠️ não prova IndexedDB real.

### 7. Linhas 165-198 — Suite 3 — getManyByDHash in-memory

Fonte auditada:
~~~text
165: // ─────────────────────────────────────────────────────────────────────────────
166: // SUITE 3 — createInMemoryRepository — getManyByDHash
167: // ─────────────────────────────────────────────────────────────────────────────
168: describe('createInMemoryRepository — getManyByDHash', () => {
169: ␠ [linha vazia]
170:     let repo;
171:     beforeEach(() => { repo = idb.createInMemoryRepository(); });
172: ␠ [linha vazia]
173:     ita('retorna translatedDataUrl pelo dHash', async () => {
174:         await repo.put(makeEntry({ hash: 'sha1', dHash: 'dhash1111', translatedDataUrl: 'data:dh1' }));
175:         const r = await repo.getManyByDHash(['dhash1111']);
176:         expect(r['dhash1111']).toBe('data:dh1');
177:     });
178: ␠ [linha vazia]
179:     ita('retorna {} para dHash inexistente', async () => {
180:         const r = await repo.getManyByDHash(['nao_existe_dh']);
181:         expect(Object.keys(r).length).toBe(0);
182:     });
183: ␠ [linha vazia]
184:     ita('retorna {} para array vazio', async () => {
185:         const r = await repo.getManyByDHash([]);
186:         expect(Object.keys(r).length).toBe(0);
187:     });
188: ␠ [linha vazia]
189:     ita('lookup múltiplos dHashes simultaneamente', async () => {
190:         await repo.put(makeEntry({ hash: 'a', dHash: 'dh_a', translatedDataUrl: 'data:a' }));
191:         await repo.put(makeEntry({ hash: 'b', dHash: 'dh_b', translatedDataUrl: 'data:b' }));
192:         const r = await repo.getManyByDHash(['dh_a', 'dh_b', 'dh_c']);
193:         expect(r['dh_a']).toBe('data:a');
194:         expect(r['dh_b']).toBe('data:b');
195:         expect(r['dh_c']).toBeUndefined();
196:     });
197: });
198: ␠ [linha vazia]
~~~

**O que faz:** Testa hit, miss, array vazio e lookup múltiplo por dHash.

**Como faz:** Repo em memória novo por teste; dHashes sintéticos.

**Por que existe assim:** Protege compatibilidade visual-v2 e batch lógico.

**Risco/limite:** Não prova índice by_dhash real do IndexedDB.

**Evidência:** ✅ PROVADO DIRETAMENTE para fallback em memória; ⚠️ storage persistente não exercitado.

### 8. Linhas 199-297 — Suite 4 — lookup perceptual strict in-memory

Fonte auditada:
~~~text
199: // ─────────────────────────────────────────────────────────────────────────────
200: // SUITE 4 — createInMemoryRepository — getManyByPerceptual (wHash+pHash)
201: // Testa o CORAÇÃO do visual-v3: lookup perceptual com Hamming.
202: // ─────────────────────────────────────────────────────────────────────────────
203: describe('createInMemoryRepository — getManyByPerceptual (visual-v3)', () => {
204: ␠ [linha vazia]
205:     let repo;
206:     beforeEach(() => { repo = idb.createInMemoryRepository(); });
207: ␠ [linha vazia]
208:     ita('retorna {} sem fpApi (graceful degradation)', async () => {
209:         await repo.put(makeEntry({ hash: 'h', wHash: W_BASE, pHash: P_BASE, translatedDataUrl: 'data:t' }));
210:         const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], null);
211:         expect(Object.keys(r).length).toBe(0);
212:     });
213: ␠ [linha vazia]
214:     ita('retorna {} para arrays vazios', async () => {
215:         const r = await repo.getManyByPerceptual([], [], fp);
216:         expect(Object.keys(r).length).toBe(0);
217:     });
218: ␠ [linha vazia]
219:     ita('match exato (wHash idêntico) → retorna resultado', async () => {
220:         await repo.put(makeEntry({
221:             hash: 'exact1', wHash: W_BASE, pHash: P_BASE,
222:             translatedDataUrl: 'data:exact',
223:         }));
224:         const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], fp);
225:         const values = Object.values(r);
226:         expect(values.length).toBeGreaterThan(0);
227:         expect(values[0].translatedDataUrl).toBe('data:exact');
228:     });
229: ␠ [linha vazia]
230:     ita('match aproximado (wHash similar, Hamming ≤ 40) → retorna resultado com confidence', async () => {
231:         // Salva com W_BASE, busca com W_NEAR (Hamming=20 ≤ 40 = match)
232:         await repo.put(makeEntry({
233:             hash: 'approx1', wHash: W_BASE, pHash: P_BASE,
234:             translatedDataUrl: 'data:approx',
235:         }));
236:         const r = await repo.getManyByPerceptual([W_NEAR], [P_NEAR], fp);
237:         const values = Object.values(r);
238:         expect(values.length).toBeGreaterThan(0);
239:         const hit = values[0];
240:         expect(hit.translatedDataUrl).toBe('data:approx');
241:         expect(hit.confidence).toBeGreaterThan(0);
242:         expect(hit.confidence).toBeLessThanOrEqual(1);
243:     });
244: ␠ [linha vazia]
245:     ita('match distante (wHash Hamming > 80) → não retorna resultado', async () => {
246:         await repo.put(makeEntry({
247:             hash: 'far1', wHash: W_BASE, pHash: P_BASE,
248:             translatedDataUrl: 'data:far',
249:         }));
250:         const r = await repo.getManyByPerceptual([W_FAR], [P_FAR], fp);
251:         expect(Object.keys(r).length).toBe(0);
252:     });
253: ␠ [linha vazia]
254:     ita('entrada sem wHash/pHash é ignorada no lookup perceptual', async () => {
255:         await repo.put(makeEntry({
256:             hash: 'nowhash', wHash: null, pHash: null,
257:             translatedDataUrl: 'data:nowhash',
258:         }));
259:         const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], fp);
260:         // Não deve retornar a entrada sem wHash (sem dados para comparar)
261:         expect(Object.keys(r).length).toBe(0);
262:     });
263: ␠ [linha vazia]
264:     ita('múltiplos candidatos — retorna o de maior confidence', async () => {
265:         // Dois candidatos: um mais próximo e um mais distante
266:         await repo.put(makeEntry({
267:             hash: 'closer', wHash: makeHash64(10), pHash: makeHash64(8),
268:             translatedDataUrl: 'data:closer',
269:         }));
270:         await repo.put(makeEntry({
271:             hash: 'farther', wHash: makeHash64(35), pHash: makeHash64(28),
272:             translatedDataUrl: 'data:farther',
273:         }));
274:         const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], fp);
275:         const values = Object.values(r);
276:         // Deve haver resultados (ambos dentro do threshold)
277:         expect(values.length).toBeGreaterThan(0);
278:         // O mais próximo deve ter confidence maior
279:         const maxConf = Math.max(...values.map(v => v.confidence || 0));
280:         expect(maxConf).toBeGreaterThan(0.5); // o mais próximo tem alta confidence
281:     });
282: ␠ [linha vazia]
283:     ita('resultado inclui reason, wDist, pDist', async () => {
284:         await repo.put(makeEntry({
285:             hash: 'reason_test', wHash: W_BASE, pHash: P_BASE,
286:             translatedDataUrl: 'data:reason',
287:         }));
288:         const r = await repo.getManyByPerceptual([W_NEAR], [P_NEAR], fp);
289:         const values = Object.values(r);
290:         if (values.length > 0) {
291:             expect(values[0]).toHaveProperty('reason');
292:             expect(values[0]).toHaveProperty('wDist');
293:             expect(values[0]).toHaveProperty('pDist');
294:         }
295:     });
296: });
297: ␠ [linha vazia]
~~~

**O que faz:** Cobre ausência de fpApi, inputs vazios, hit exato, hit aproximado, rejeição distante, entrada sem hashes, competição de candidatos e metadados reason/distâncias.

**Como faz:** Usa matchPerceptualHashes real sobre repo em memória e hashes controlados.

**Por que existe assim:** É a principal prova visual-v3 do lookup strict in-memory.

**Risco/limite:** Dois casos são fracos: 'maior confidence' só verifica maxConf >0.5 e não que data:closer venceu; 'resultado inclui reason...' condiciona assertions a values.length>0, logo zero hits passa silenciosamente.

**Evidência:** ✅ para vários paths concretos; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para seleção correta do melhor candidato e ⚠️ falso-verde no caso de metadados.

### 9. Linhas 298-486 — Suite 5 — runtime handler GTC_* legado

Fonte auditada:
~~~text
298: // ─────────────────────────────────────────────────────────────────────────────
299: // SUITE 5 — createGtcRuntimeHandler — todas as actions GTC_*
300: // ─────────────────────────────────────────────────────────────────────────────
301: describe('createGtcRuntimeHandler — actions GTC_*', () => {
302: ␠ [linha vazia]
303:     let repo, handler;
304: ␠ [linha vazia]
305:     beforeEach(() => {
306:         repo    = idb.createInMemoryRepository();
307:         handler = idb.createGtcRuntimeHandler({ repository: repo, fingerprintApi: fp });
308:     });
309: ␠ [linha vazia]
310:     // Helper: simula chrome.runtime.sendMessage assíncrono
311:     function sendMessage(action, payload = {}) {
312:         return new Promise((resolve) => {
313:             const request = { action, ...payload };
314:             const shouldContinue = handler(request, {}, resolve);
315:             if (!shouldContinue) resolve({ ok: false, reason: 'unhandled' });
316:         });
317:     }
318: ␠ [linha vazia]
319:     // ── GTC_QUERY_MANY ────────────────────────────────────────────────────────
320:     ita('GTC_QUERY_MANY — retorna ok:true e entriesByHash', async () => {
321:         await repo.put(makeEntry({ hash: 'qh1', translatedDataUrl: 'data:q1' }));
322:         const r = await sendMessage('GTC_QUERY_MANY', { hashes: ['qh1'] });
323:         expect(r.ok).toBe(true);
324:         expect(r.entriesByHash['qh1']).toBe('data:q1');
325:     });
326: ␠ [linha vazia]
327:     ita('GTC_QUERY_MANY — retorna ok:true com entriesByHash vazio para miss', async () => {
328:         const r = await sendMessage('GTC_QUERY_MANY', { hashes: ['inexistente'] });
329:         expect(r.ok).toBe(true);
330:         expect(Object.keys(r.entriesByHash).length).toBe(0);
331:     });
332: ␠ [linha vazia]
333:     ita('GTC_QUERY_MANY — inclui durationMs na resposta', async () => {
334:         const r = await sendMessage('GTC_QUERY_MANY', { hashes: [] });
335:         expect(typeof r.durationMs).toBe('number');
336:         expect(r.durationMs).toBeGreaterThanOrEqual(0);
337:     });
338: ␠ [linha vazia]
339:     // ── GTC_QUERY_BY_DHASH ────────────────────────────────────────────────────
340:     ita('GTC_QUERY_BY_DHASH — encontra por dHash', async () => {
341:         await repo.put(makeEntry({ hash: 'sha_dh', dHash: 'dhash_test', translatedDataUrl: 'data:dh' }));
342:         const r = await sendMessage('GTC_QUERY_BY_DHASH', { dHashes: ['dhash_test'] });
343:         expect(r.ok).toBe(true);
344:         expect(r.entriesByDHash['dhash_test']).toBe('data:dh');
345:     });
346: ␠ [linha vazia]
347:     ita('GTC_QUERY_BY_DHASH — retorna ok:true com vazio para miss', async () => {
348:         const r = await sendMessage('GTC_QUERY_BY_DHASH', { dHashes: ['dhash_miss'] });
349:         expect(r.ok).toBe(true);
350:         expect(Object.keys(r.entriesByDHash).length).toBe(0);
351:     });
352: ␠ [linha vazia]
353:     // ── GTC_QUERY_BY_PERCEPTUAL (visual-v3, NOVO) ─────────────────────────────
354:     ita('GTC_QUERY_BY_PERCEPTUAL — match exato retorna resultado', async () => {
355:         await repo.put(makeEntry({
356:             hash: 'perc_exact', wHash: W_BASE, pHash: P_BASE,
357:             translatedDataUrl: 'data:perc_exact',
358:         }));
359:         const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
360:             wHashes: [W_BASE], pHashes: [P_BASE],
361:         });
362:         expect(r.ok).toBe(true);
363:         const values = Object.values(r.entriesByPerceptual);
364:         expect(values.length).toBeGreaterThan(0);
365:         expect(values[0].translatedDataUrl).toBe('data:perc_exact');
366:     });
367: ␠ [linha vazia]
368:     ita('GTC_QUERY_BY_PERCEPTUAL — match aproximado (cross-language) retorna resultado', async () => {
369:         await repo.put(makeEntry({
370:             hash: 'perc_approx', wHash: W_BASE, pHash: P_BASE,
371:             translatedDataUrl: 'data:perc_approx',
372:         }));
373:         const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
374:             wHashes: [W_NEAR], pHashes: [P_NEAR],
375:         });
376:         expect(r.ok).toBe(true);
377:         const values = Object.values(r.entriesByPerceptual);
378:         expect(values.length).toBeGreaterThan(0);
379:     });
380: ␠ [linha vazia]
381:     ita('GTC_QUERY_BY_PERCEPTUAL — sem match retorna objeto vazio', async () => {
382:         await repo.put(makeEntry({
383:             hash: 'perc_far', wHash: W_BASE, pHash: P_BASE,
384:             translatedDataUrl: 'data:far',
385:         }));
386:         const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
387:             wHashes: [W_FAR], pHashes: [P_FAR],
388:         });
389:         expect(r.ok).toBe(true);
390:         expect(Object.keys(r.entriesByPerceptual).length).toBe(0);
391:     });
392: ␠ [linha vazia]
393:     ita('GTC_QUERY_BY_PERCEPTUAL — arrays vazios retorna objeto vazio', async () => {
394:         const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
395:             wHashes: [], pHashes: [],
396:         });
397:         expect(r.ok).toBe(true);
398:         expect(Object.keys(r.entriesByPerceptual).length).toBe(0);
399:     });
400: ␠ [linha vazia]
401:     // ── GTC_SAVE ──────────────────────────────────────────────────────────────
402:     ita('GTC_SAVE — salva todos os campos visual-v3', async () => {
403:         const r = await sendMessage('GTC_SAVE', {
404:             hash:               'save_v3',
405:             translatedDataUrl:  'data:saved_v3',
406:             dHash:              'dhash_save',
407:             wHash:              W_BASE,
408:             pHash:              P_BASE,
409:             regionalHashes:     { topLeft: 'aabbccdd00112233', topRight: 'aabbccdd00112234',
410:                                   bottomLeft: 'aabbccdd00112235', bottomRight: 'aabbccdd00112236' },
411:             cleanUrl:           'https://ex.com/p1.jpg',
412:             width:              800,
413:             height:             1200,
414:             fingerprintVersion: 'visual-v3',
415:             mimeType:           'image/png',
416:         });
417:         expect(r.ok).toBe(true);
418:         expect(r.saved).toBe(true);
419: ␠ [linha vazia]
420:         // Verifica que o dado foi salvo corretamente
421:         const q = await repo.getMany(['save_v3']);
422:         expect(q['save_v3']).toBe('data:saved_v3');
423:     });
424: ␠ [linha vazia]
425:     ita('GTC_SAVE — retorna ok:true e saved:false para hash vazio', async () => {
426:         const r = await sendMessage('GTC_SAVE', { hash: '', translatedDataUrl: 'data:x' });
427:         expect(r.ok).toBe(true);
428:         expect(r.saved).toBe(false);
429:     });
430: ␠ [linha vazia]
431:     // ── GTC_SAVE_MANY ─────────────────────────────────────────────────────────
432:     ita('GTC_SAVE_MANY — salva múltiplas entradas', async () => {
433:         const r = await sendMessage('GTC_SAVE_MANY', {
434:             entries: [
435:                 makeEntry({ hash: 'many1', translatedDataUrl: 'data:m1' }),
436:                 makeEntry({ hash: 'many2', translatedDataUrl: 'data:m2', wHash: W_BASE, pHash: P_BASE }),
437:             ],
438:         });
439:         expect(r.ok).toBe(true);
440:         expect(r.count).toBe(2);
441:         const q = await repo.getMany(['many1', 'many2']);
442:         expect(q['many1']).toBe('data:m1');
443:         expect(q['many2']).toBe('data:m2');
444:     });
445: ␠ [linha vazia]
446:     ita('GTC_SAVE_MANY — array vazio não lança erro', async () => {
447:         const r = await sendMessage('GTC_SAVE_MANY', { entries: [] });
448:         expect(r.ok).toBe(true);
449:     });
450: ␠ [linha vazia]
451:     // ── GTC_CLEAR_ALL ─────────────────────────────────────────────────────────
452:     ita('GTC_CLEAR_ALL — remove todas as entradas', async () => {
453:         await repo.put(makeEntry({ hash: 'toClear' }));
454:         const r = await sendMessage('GTC_CLEAR_ALL');
455:         expect(r.ok).toBe(true);
456:         expect(r.cleared).toBe(true);
457:         const s = await repo.stats();
458:         expect(s.count).toBe(0);
459:     });
460: ␠ [linha vazia]
461:     // ── GTC_STATS ─────────────────────────────────────────────────────────────
462:     ita('GTC_STATS — retorna count correto', async () => {
463:         await repo.put(makeEntry({ hash: 'stat1' }));
464:         await repo.put(makeEntry({ hash: 'stat2' }));
465:         const r = await sendMessage('GTC_STATS');
466:         expect(r.ok).toBe(true);
467:         expect(r.stats.count).toBeGreaterThanOrEqual(2);
468:     });
469: ␠ [linha vazia]
470:     // ── Ação desconhecida ─────────────────────────────────────────────────────
471:     it('ação desconhecida retorna false (não intercepta)', () => {
472:         const result = handler({ action: 'SOME_OTHER_ACTION' }, {}, () => {});
473:         expect(result).toBe(false);
474:     });
475: ␠ [linha vazia]
476:     it('request null retorna false', () => {
477:         const result = handler(null, {}, () => {});
478:         expect(result).toBe(false);
479:     });
480: ␠ [linha vazia]
481:     it('request sem action retorna false', () => {
482:         const result = handler({}, {}, () => {});
483:         expect(result).toBe(false);
484:     });
485: });
486: ␠ [linha vazia]
~~~

**O que faz:** Cria handler real e exercita query SHA/dHash/perceptual, save, save-many, clear, stats e requests desconhecidos.

**Como faz:** sendMessage adapta sendResponse a Promise; repo e handler são recriados em beforeEach.

**Por que existe assim:** Valida o roteamento do handler sobre o fallback in-memory.

**Risco/limite:** O título 'todas as actions GTC_*' está incorreto no estado atual. O handler também implementa GTC_QUERY_BY_PERCEPTUAL_CROP, GTC_QUERY_BY_PERCEPTUAL_RELAXED, GTC_QUERY_PERCEPTUAL_V2 e GTC_DELETE_BY_CLEAN_URL, ausentes desta suite. GTC_SAVE 'todos os campos visual-v3' só reconsulta translatedDataUrl, não os metadados salvos.

**Evidência:** ✅ PROVADO DIRETAMENTE para actions exercitadas; ⚠️ ações atuais omitidas não são provadas por esta suíte.

### 10. Linhas 487-560 — Suite 6 — constantes/fallback e backward compat v2

Fonte auditada:
~~~text
487: // ─────────────────────────────────────────────────────────────────────────────
488: // SUITE 6 — Schema v4 — upgrade paths e backward-compat
489: // ─────────────────────────────────────────────────────────────────────────────
490: describe('Schema v4 — constantes e backward-compat', () => {
491: ␠ [linha vazia]
492:     it('DB_VERSION é 4', () => {
493:         expect(idb.DB_VERSION).toBe(4);
494:     });
495: ␠ [linha vazia]
496:     it('DB_NAME é o esperado', () => {
497:         expect(idb.DB_NAME).toBe('manga_translator_gtc');
498:     });
499: ␠ [linha vazia]
500:     it('STORE_NAME é o esperado', () => {
501:         expect(idb.STORE_NAME).toBe('translations');
502:     });
503: ␠ [linha vazia]
504:     it('createInMemoryRepository cria repositório funcional (fallback)', () => {
505:         const repo = idb.createInMemoryRepository();
506:         expect(typeof repo.getMany).toBe('function');
507:         expect(typeof repo.getManyByDHash).toBe('function');
508:         expect(typeof repo.getManyByPerceptual).toBe('function');
509:         expect(typeof repo.getManyByPerceptualCrop).toBe('function');
510:         expect(typeof repo.put).toBe('function');
511:         expect(typeof repo.putMany).toBe('function');
512:         expect(typeof repo.clear).toBe('function');
513:         expect(typeof repo.stats).toBe('function');
514:     });
515: ␠ [linha vazia]
516:     it('createIndexedDbRepository usa fallback de memória quando indexedDB ausente', () => {
517:         const repo = idb.createIndexedDbRepository({ indexedDbFactory: null });
518:         // Sem IndexedDB real, cria repositório em memória
519:         expect(typeof repo.getMany).toBe('function');
520:         expect(typeof repo.getManyByPerceptual).toBe('function');
521:         expect(typeof repo.getManyByPerceptualCrop).toBe('function');
522:     });
523: ␠ [linha vazia]
524:     ita('entradas visual-v2 (sem wHash/pHash) são lookup-áveis via SHA-256', async () => {
525:         const repo = idb.createInMemoryRepository();
526:         // Simula entrada visual-v2 (sem wHash/pHash)
527:         await repo.put(makeEntry({
528:             hash: 'v2_entry', dHash: 'dh_v2', wHash: null, pHash: null,
529:             fingerprintVersion: 'visual-v2',
530:             translatedDataUrl: 'data:v2',
531:         }));
532:         // SHA-256 lookup deve funcionar
533:         const r = await repo.getMany(['v2_entry']);
534:         expect(r['v2_entry']).toBe('data:v2');
535:     });
536: ␠ [linha vazia]
537:     ita('entradas visual-v2 são lookup-áveis via dHash', async () => {
538:         const repo = idb.createInMemoryRepository();
539:         await repo.put(makeEntry({
540:             hash: 'v2_dh', dHash: 'dh_legacy', wHash: null, pHash: null,
541:             fingerprintVersion: 'visual-v2',
542:             translatedDataUrl: 'data:v2_dh',
543:         }));
544:         const r = await repo.getManyByDHash(['dh_legacy']);
545:         expect(r['dh_legacy']).toBe('data:v2_dh');
546:     });
547: ␠ [linha vazia]
548:     ita('entradas visual-v2 NÃO aparecem no lookup perceptual (wHash null)', async () => {
549:         const repo = idb.createInMemoryRepository();
550:         await repo.put(makeEntry({
551:             hash: 'v2_perc', wHash: null, pHash: null,
552:             fingerprintVersion: 'visual-v2',
553:             translatedDataUrl: 'data:v2_perc',
554:         }));
555:         const r = await repo.getManyByPerceptual([W_BASE], [P_BASE], fp);
556:         // Entrada sem wHash/pHash não deve aparecer no lookup perceptual
557:         expect(Object.keys(r).length).toBe(0);
558:     });
559: });
560: ␠ [linha vazia]
~~~

**O que faz:** Verifica DB_VERSION/nomes, surface do repo in-memory, fallback quando indexedDBFactory=null e compatibilidade lógica visual-v2.

**Como faz:** Mistura it estruturais e ita sobre repo em memória.

**Por que existe assim:** Congela contratos públicos e garante que ausência de IndexedDB não quebra o uso básico.

**Risco/limite:** O comentário 'upgrade paths' não corresponde às assertions: nenhuma abertura de DB v2/v3, onupgradeneeded, índices ou dados migrados é executada. visual-v4 crop/relaxed não é exercitado aqui.

**Evidência:** 🟦/✅ para constantes/fallback lógico; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para upgrade físico.

### 11. Linhas 561-655 — Suite 7 — cross-language com hashes reais

Fonte auditada:
~~~text
561: // ─────────────────────────────────────────────────────────────────────────────
562: // SUITE 7 — getManyByPerceptual — Fase 2 cross-language (Hamming scan)
563: // Testa o path de matching aproximado com hashes reais gerados pelo
564: // calculateWHash/calculatePHash usando imagens sintéticas de mangá.
565: // ─────────────────────────────────────────────────────────────────────────────
566: describe('getManyByPerceptual — Fase 2 cross-language com hashes reais', () => {
567: ␠ [linha vazia]
568:     const { solidColor, mangaPage, noise } = require('./helpers.js');
569: ␠ [linha vazia]
570:     function scaleDown(data, srcW, srcH, dstW, dstH) {
571:         const out = new Uint8ClampedArray(dstW * dstH * 4);
572:         for (let r = 0; r < dstH; r++) {
573:             for (let c = 0; c < dstW; c++) {
574:                 const srcR = Math.floor(r * srcH / dstH);
575:                 const srcC = Math.floor(c * srcW / dstW);
576:                 const si = (srcR * srcW + srcC) * 4;
577:                 const di = (r * dstW + c) * 4;
578:                 out[di] = data[si]; out[di+1] = data[si+1];
579:                 out[di+2] = data[si+2]; out[di+3] = data[si+3];
580:             }
581:         }
582:         return out;
583:     }
584: ␠ [linha vazia]
585:     let repo;
586:     beforeEach(() => { repo = idb.createInMemoryRepository(); });
587: ␠ [linha vazia]
588:     ita('[CROSS-LANGUAGE] salva EN, busca PT — deve fazer match', async () => {
589:         const srcEN = scaleDown(mangaPage(64, 64, 'EN'), 64, 64, 32, 32);
590:         const srcPT = scaleDown(mangaPage(64, 64, 'PT'), 64, 64, 32, 32);
591: ␠ [linha vazia]
592:         const wHashEN = fp.calculateWHash(srcEN);
593:         const pHashEN = fp.calculatePHash(srcEN);
594:         const wHashPT = fp.calculateWHash(srcPT);
595:         const pHashPT = fp.calculatePHash(srcPT);
596: ␠ [linha vazia]
597:         // Salva a tradução gerada para a versão EN
598:         await repo.put(makeEntry({
599:             hash: 'cross_en', wHash: wHashEN, pHash: pHashEN,
600:             translatedDataUrl: 'data:translated_en',
601:         }));
602: ␠ [linha vazia]
603:         // Busca com a versão PT (mesma arte, texto diferente)
604:         const r = await repo.getManyByPerceptual([wHashPT], [pHashPT], fp);
605:         const values = Object.values(r);
606: ␠ [linha vazia]
607:         console.log(`      Cross-language match: ${values.length} resultado(s) encontrado(s)`);
608:         if (values.length > 0) {
609:             console.log(`      Confidence: ${values[0].confidence?.toFixed(3)}, Reason: ${values[0].reason}`);
610:         }
611: ␠ [linha vazia]
612:         expect(values.length).toBeGreaterThan(0);
613:         expect(values[0].translatedDataUrl).toBe('data:translated_en');
614:     });
615: ␠ [linha vazia]
616:     ita('[CROSS-LANGUAGE] página diferente NÃO faz match', async () => {
617:         const srcEN    = scaleDown(mangaPage(64, 64, 'EN'),   64, 64, 32, 32);
618:         const srcNoise = scaleDown(noise(64, 64, 54321),      64, 64, 32, 32);
619: ␠ [linha vazia]
620:         const wHashEN    = fp.calculateWHash(srcEN);
621:         const pHashEN    = fp.calculatePHash(srcEN);
622:         const wHashNoise = fp.calculateWHash(srcNoise);
623:         const pHashNoise = fp.calculatePHash(srcNoise);
624: ␠ [linha vazia]
625:         await repo.put(makeEntry({
626:             hash: 'cross_en2', wHash: wHashEN, pHash: pHashEN,
627:             translatedDataUrl: 'data:en2',
628:         }));
629: ␠ [linha vazia]
630:         const r = await repo.getManyByPerceptual([wHashNoise], [pHashNoise], fp);
631:         expect(Object.keys(r).length).toBe(0);
632:     });
633: ␠ [linha vazia]
634:     ita('[FASE 1 vs FASE 2] hash exato usa fase 1, hash aproximado usa fase 2', async () => {
635:         const srcEN = scaleDown(mangaPage(64, 64, 'EN'), 64, 64, 32, 32);
636:         const wH    = fp.calculateWHash(srcEN);
637:         const pH    = fp.calculatePHash(srcEN);
638: ␠ [linha vazia]
639:         await repo.put(makeEntry({
640:             hash: 'phase_test', wHash: wH, pHash: pH,
641:             translatedDataUrl: 'data:phase',
642:         }));
643: ␠ [linha vazia]
644:         // Fase 1: hash exato
645:         const r1 = await repo.getManyByPerceptual([wH], [pH], fp);
646:         expect(Object.values(r1)[0]?.translatedDataUrl).toBe('data:phase');
647: ␠ [linha vazia]
648:         // Nota sobre confidence: fase 1 retorna 1.0 (exato), fase 2 < 1.0
649:         const exactResult = Object.values(r1)[0];
650:         if (exactResult?.reason === 'whash_exact' || exactResult?.reason === 'phash_exact') {
651:             expect(exactResult.confidence).toBe(1.0);
652:         }
653:     });
654: });
655: ␠ [linha vazia]
~~~

**O que faz:** Gera fixtures EN/PT, downscale manual, testa match, non-match e pretende comparar Fase 1/Fase 2.

**Como faz:** Usa helpers reais e fp.calculateWHash/pHash, depois getManyByPerceptual in-memory.

**Por que existe assim:** Liga o matcher a dados de imagem sintética em vez de hashes artificiais.

**Risco/limite:** O teste '[FASE 1 vs FASE 2]' só executa consulta exata r1; não existe query aproximada r2. A assertion de confidence ainda é condicional ao reason, então pode não executar. Portanto Fase 2 não é provada por esse caso específico.

**Evidência:** ✅ cross-language match/non-match são diretos; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a comparação Fase 1 vs Fase 2 nomeada.

### 12. Linhas 656-705 — Suite 8 — handler sem fingerprintApi

Fonte auditada:
~~~text
656: // ─────────────────────────────────────────────────────────────────────────────
657: // SUITE 8 — createGtcRuntimeHandler — fingerprintApi null (degradação graciosa)
658: // ─────────────────────────────────────────────────────────────────────────────
659: describe('createGtcRuntimeHandler — degradação graciosa sem fingerprintApi', () => {
660: ␠ [linha vazia]
661:     let repo, handlerNoFp;
662: ␠ [linha vazia]
663:     beforeEach(() => {
664:         repo        = idb.createInMemoryRepository();
665:         // handler criado SEM fingerprintApi
666:         handlerNoFp = idb.createGtcRuntimeHandler({ repository: repo, fingerprintApi: null });
667:     });
668: ␠ [linha vazia]
669:     function sendMessage(action, payload = {}) {
670:         return new Promise((resolve) => {
671:             const request = { action, ...payload };
672:             const cont = handlerNoFp(request, {}, resolve);
673:             if (!cont) resolve({ ok: false });
674:         });
675:     }
676: ␠ [linha vazia]
677:     ita('GTC_QUERY_MANY ainda funciona sem fingerprintApi', async () => {
678:         await repo.put(makeEntry({ hash: 'nofp', translatedDataUrl: 'data:nofp' }));
679:         const r = await sendMessage('GTC_QUERY_MANY', { hashes: ['nofp'] });
680:         expect(r.ok).toBe(true);
681:         expect(r.entriesByHash['nofp']).toBe('data:nofp');
682:     });
683: ␠ [linha vazia]
684:     ita('GTC_QUERY_BY_PERCEPTUAL retorna ok:true com {} (não quebra)', async () => {
685:         await repo.put(makeEntry({
686:             hash: 'nofp2', wHash: W_BASE, pHash: P_BASE,
687:             translatedDataUrl: 'data:nofp2',
688:         }));
689:         // Sem fpApi, getManyByPerceptual retorna {} mas não lança exceção
690:         const r = await sendMessage('GTC_QUERY_BY_PERCEPTUAL', {
691:             wHashes: [W_BASE], pHashes: [P_BASE],
692:         });
693:         expect(r.ok).toBe(true);
694:         expect(r.entriesByPerceptual).toBeDefined();
695:     });
696: ␠ [linha vazia]
697:     ita('GTC_SAVE ainda salva com wHash/pHash sem fingerprintApi', async () => {
698:         const r = await sendMessage('GTC_SAVE', {
699:             hash: 'nofp_save', translatedDataUrl: 'data:nofp_save',
700:             wHash: W_BASE, pHash: P_BASE,
701:         });
702:         expect(r.ok).toBe(true);
703:         expect(r.saved).toBe(true);
704:     });
705: });
~~~

**O que faz:** Verifica query exata, query perceptual sem fpApi e save com hashes presentes.

**Como faz:** Handler é criado com fingerprintApi:null e adaptado a Promise.

**Por que existe assim:** Protege degradação graciosa quando matching perceptual não está disponível.

**Risco/limite:** O caso que diz 'retorna ok:true com {}' só exige entriesByPerceptual definido; uma resposta não vazia também passaria. Não cobre crop/relaxed/V2 sem fpApi.

**Evidência:** ✅ query exata/save; ⚠️ assertion insuficiente para vazio perceptual e ações modernas ausentes.

### 13. Linhas 706 — Newline final

Fonte auditada:
~~~text
706: ␠ [linha vazia]
~~~

**O que faz:** Terminação final do arquivo.

**Como faz:** Posição vazia após newline.

**Por que existe assim:** Convenção de texto.

**Risco/limite:** Sem efeito funcional.

**Evidência:** 🟦 Confirmado pelo blob auditado.

## 13. Revalidação final do AGENTE 14

Revalidação executada diretamente no branch `docs/project-bible` antes da conclusão do estado individual.

- [x] reserva relida e ownership confirmado como **AGENTE 14**;
- [x] `.state/229.json` relido e confirmado como `IN_PROGRESS` do mesmo agente;
- [x] SHA da fonte reconfirmado: `0f5ca8e043a06219a342d2f32b59017762a953f0`;
- [x] fonte integral incorporada comparada byte a byte com o blob real;
- [x] **705 linhas textuais + newline final = 706/706 posições documentais**;
- [x] inventário de testes reconfirmado: **59** registros — **13 `it` + 46 `ita`**;
- [x] `tests/visual/run-all.js` continua carregando esta suíte;
- [x] baseline visual reconfirmado em **minTests=224** e **maxSkipped=0**;
- [x] implementação atual continua em `DB_VERSION = 4`;
- [x] inventário das actions atuais do handler foi cruzado novamente com `createGtcRuntimeHandler`;
- [x] gaps de escopo, cobertura e força de assertions permanecem classificados como lacunas, sem promoção indevida a prova direta;
- [x] seis solicitações externas foram preparadas para persistência em `.state/229.json`;
- [x] nenhum código-fonte, teste, fixture, workflow, configuração ou tracker global foi alterado para fabricar evidência.

**Resultado:** Bíblia documental concluída para o SHA auditado. As solicitações 229-001 a 229-006 podem permanecer `OPEN` sem invalidar a conclusão documental, pois registram mudanças externas futuras e a Bíblia descreve o comportamento/evidência realmente existentes.


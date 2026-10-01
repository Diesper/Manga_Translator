# Bíblia técnica — tests/smoke/smoke-05-perceptual-queries.js

> **Estado:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA:** `bf8409c3df43062e5e6af496393412eee0c6a694`  
> **Agente:** AGENTE 11  
> **Linhas:** 88; **posições:** 89 com newline final  
> **PR/branch:** #66 / `docs/project-bible`

## Papel

Smoke Node que executa `gtc-indexeddb.js` + `gtc-fingerprint.js` reais e prova: (a) rejeição de produto cruzado de hashes, (b) rejeição por aspect ratio incompatível e (c) que um hit exato não impede outra query aproximada do mesmo lote.

`tests/smoke/run-smoke.js` descobre `smoke-*.js`; `package.json#test:smoke` chama o runner e `npm test` inclui os smokes.

## Backend efetivo

A linha 16 escolhe `createInMemoryRepository()` quando disponível. O módulo atual exporta esse factory; portanto este arquivo **prova o repositório em memória**, não o backend IndexedDB. `fake-indexeddb/auto` só seria usado pelo fallback `openGtcDatabase()`.

## Cenários e força

| Cenário | Assertion | Classificação |
|---|---|---|
| q_exact_A existe e retorna A | 51–52 | ✅ PROVADO DIRETAMENTE |
| wHashA + pHashB é rejeitado | 53 | ✅ PROVADO DIRETAMENTE |
| hashes B com formato vertical são rejeitados | 63 | ✅ PROVADO DIRETAMENTE |
| q1 exata permanece válida | 77 | ✅ PROVADO DIRETAMENTE |
| q2 aproximada também retorna no mesmo lote | 78 | ✅ PROVADO DIRETAMENTE |
| descoberta pelo runner smoke | regex no runner | 🟦 GATE ESTÁTICO ESPECÍFICO |
| backend IndexedDB | não selecionado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| runtime handler V2 | não chamado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| colisão de índice | cenário não identificado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |

## Divergência documental

O cabeçalho afirma cobrir “colisão de índice, handler V2”, mas o corpo não cria `createGtcRuntimeHandler`, não envia `GTC_QUERY_PERCEPTUAL_V2` e não monta cenário de duplicata/colisão de índice. Outros arquivos possuem cobertura relacionada; isso não torna esta unidade uma prova desses itens.

## Invariantes

1. resultados permanecem correlacionados por `queryId`;
2. hashes de queries diferentes não formam match cruzado;
3. aspecto incompatível bloqueia falso positivo;
4. hit exato não interrompe demais queries;
5. aproximação válida pode coexistir com hit exato;
6. falha em assertion encerra o processo com status 1;
7. esta unidade não deve ser citada como prova de IndexedDB/handler V2.

## Solicitações ao auditor

### 127-001 — DOCUMENTATION_MISMATCH — OPEN

O cabeçalho promete “colisão de índice, handler V2” sem executar esses contratos. Corrigir o comentário ou adicionar cenários reais em alteração separada.

**Risco:** cobertura desta unidade pode ser superestimada.

### 127-002 — TEST_SCOPE_REVIEW — OPEN

Apesar de importar `fake-indexeddb/auto`, o caminho atual prefere `createInMemoryRepository`. Decidir se o smoke é deliberadamente apenas do backend em memória ou se precisa de cenário IndexedDB separado.

**Risco:** regressão específica do backend IndexedDB pode permanecer fora deste smoke.

## Fonte integral

```js
/**
 * smoke-05-perceptual-queries.js
 * Cobre: Produto cruzado rejeitado, hit exato não cega busca aproximada,
 * proporção de aspecto, colisão de índice, handler V2.
 */
'use strict';

const assert = require('assert');
require('fake-indexeddb/auto');

const fp = require('../../extension/shared/gtc-fingerprint.js');
const gtcModule = require('../../extension/shared/gtc-indexeddb.js');

async function run() {
    console.log('[smoke-05] 1. Inicializando repositório GTC...');
    const repo = gtcModule.createInMemoryRepository ? gtcModule.createInMemoryRepository() : (await gtcModule.openGtcDatabase()).repository;

    const dummyDataUrlA = 'data:image/png;base64,AAA1';
    const dummyDataUrlB = 'data:image/png;base64,BBB2';

    // Salva duas entradas no repositório
    // Imagem A: 64 chars hex (256 bits)
    const wHashA = '0'.repeat(64);
    const pHashA = '0'.repeat(64);
    await repo.put({
        hash: 'sha256_image_A',
        translatedDataUrl: dummyDataUrlA,
        wHash: wHashA,
        pHash: pHashA,
        width: 800,
        height: 1200,
    });

    // Imagem B: hashes opostos (distância máxima) e proporção horizontal 1200x800
    const wHashB = 'f'.repeat(64);
    const pHashB = 'f'.repeat(64);
    await repo.put({
        hash: 'sha256_image_B',
        translatedDataUrl: dummyDataUrlB,
        wHash: wHashB,
        pHash: pHashB,
        width: 1200,
        height: 800,
    });

    console.log('[smoke-05] 2. Testando isolamento de queryId e prevenção de produto cruzado...');
    // Consulta 1: quer Imagem A pelo par correto
    // Consulta 2: combinação cruzada que NÃO deve casar com ninguém
    const queries = [
        { queryId: 'q_exact_A', wHash: wHashA, pHash: pHashA, width: 800, height: 1200 },
        { queryId: 'q_cross_invalid', wHash: wHashA, pHash: pHashB, width: 800, height: 1200 },
    ];

    const results = await repo.queryPerceptual(queries, fp);
    assert(results['q_exact_A'], 'Consulta A deve retornar resultado');
    assert.strictEqual(results['q_exact_A'].translatedDataUrl, dummyDataUrlA);
    assert(!results['q_cross_invalid'], 'Produto cruzado wHashA + pHashB deve ser rejeitado');
    console.log('  -> Isolamento de par correlacionado OK');

    console.log('[smoke-05] 3. Testando compatibilidade de aspecto (aspect ratio)...');
    // Consulta com hashes de B, mas formato vertical (800x1200 em vez de 1200x800)
    const queryBadRatio = [
        { queryId: 'q_bad_ratio', wHash: wHashB, pHash: pHashB, width: 800, height: 1200 }
    ];
    const resRatio = await repo.queryPerceptual(queryBadRatio, fp);
    assert(!resRatio['q_bad_ratio'], 'Aspect ratio incompatível (>20% diferença) deve ser rejeitado');
    console.log('  -> Validação de aspecto OK');

    console.log('[smoke-05] 4. Testando busca aproximada sem cegamento por hit exato...');
    // Query 1 exata para A, Query 2 levemente diferente de B
    // Modifica apenas 2 caracteres de wHashB (poucos bits de distância)
    const wHashB_approx = 'f'.repeat(62) + '00';
    const batchQueries = [
        { queryId: 'q1', wHash: wHashA, pHash: pHashA, width: 800, height: 1200 },
        { queryId: 'q2', wHash: wHashB_approx, pHash: pHashB, width: 1200, height: 800 },
    ];
    const batchResults = await repo.queryPerceptual(batchQueries, fp);
    assert(batchResults['q1'], 'Query 1 (exata) deve casar');
    assert(batchResults['q2'], 'Query 2 (aproximada) deve casar mesmo coexistindo no mesmo lote');
    console.log('  -> Hit exato não cega busca aproximada OK');

    console.log('✅ smoke-05-perceptual-queries passou com sucesso.');
}

run().catch(err => {
    console.error('❌ Falha em smoke-05-perceptual-queries:', err);
    process.exit(1);
});
```

## Mapa completo linha/posição

| Pos. | Contexto | Função | Evidência |
|---:|---|---|---|
| 1 | cabeçalho/strict | comentário/intenção | ⚠️ sem prova própria |
| 2 | cabeçalho/strict | comentário/intenção | ⚠️ sem prova própria |
| 3 | cabeçalho/strict | comentário/intenção | ⚠️ sem prova própria |
| 4 | cabeçalho/strict | comentário/intenção | ⚠️ sem prova própria |
| 5 | cabeçalho/strict | comentário/intenção | ⚠️ sem prova própria |
| 6 | cabeçalho/strict | setup/controle do cenário | 🟨 indireto |
| 7 | imports | separação visual | ⚠️ sem prova própria |
| 8 | imports | carrega dependência | 🟨 indireto |
| 9 | imports | carrega dependência | 🟨 indireto |
| 10 | imports | separação visual | ⚠️ sem prova própria |
| 11 | imports | carrega dependência | 🟨 indireto |
| 12 | imports | carrega dependência | 🟨 indireto |
| 13 | repo/dados | separação visual | ⚠️ sem prova própria |
| 14 | repo/dados | setup/controle do cenário | 🟨 indireto |
| 15 | repo/dados | setup/controle do cenário | 🟨 indireto |
| 16 | repo/dados | prefere backend em memória; IndexedDB é fallback | 🟨 indireto |
| 17 | repo/dados | separação visual | ⚠️ sem prova própria |
| 18 | repo/dados | setup/controle do cenário | 🟨 indireto |
| 19 | repo/dados | setup/controle do cenário | 🟨 indireto |
| 20 | repo/dados | separação visual | ⚠️ sem prova própria |
| 21 | seed A/B | comentário/intenção | ⚠️ sem prova própria |
| 22 | seed A/B | comentário/intenção | ⚠️ sem prova própria |
| 23 | seed A/B | configura hashes controlados | 🟨 indireto |
| 24 | seed A/B | configura hashes controlados | 🟨 indireto |
| 25 | seed A/B | insere entrada no repositório real escolhido | 🟨 indireto |
| 26 | seed A/B | setup/controle do cenário | 🟨 indireto |
| 27 | seed A/B | setup/controle do cenário | 🟨 indireto |
| 28 | seed A/B | configura hashes controlados | 🟨 indireto |
| 29 | seed A/B | configura hashes controlados | 🟨 indireto |
| 30 | seed A/B | configura dimensões/aspect ratio | 🟨 indireto |
| 31 | seed A/B | configura dimensões/aspect ratio | 🟨 indireto |
| 32 | seed A/B | setup/controle do cenário | 🟨 indireto |
| 33 | seed A/B | separação visual | ⚠️ sem prova própria |
| 34 | seed A/B | comentário/intenção | ⚠️ sem prova própria |
| 35 | seed A/B | configura hashes controlados | 🟨 indireto |
| 36 | seed A/B | configura hashes controlados | 🟨 indireto |
| 37 | seed A/B | insere entrada no repositório real escolhido | 🟨 indireto |
| 38 | seed A/B | setup/controle do cenário | 🟨 indireto |
| 39 | seed A/B | setup/controle do cenário | 🟨 indireto |
| 40 | seed A/B | configura hashes controlados | 🟨 indireto |
| 41 | produto cruzado | configura hashes controlados | 🟨 indireto |
| 42 | produto cruzado | configura dimensões/aspect ratio | 🟨 indireto |
| 43 | produto cruzado | configura dimensões/aspect ratio | 🟨 indireto |
| 44 | produto cruzado | setup/controle do cenário | 🟨 indireto |
| 45 | produto cruzado | separação visual | ⚠️ sem prova própria |
| 46 | produto cruzado | define correlação por queryId | 🟨 indireto |
| 47 | produto cruzado | comentário/intenção | ⚠️ sem prova própria |
| 48 | produto cruzado | comentário/intenção | ⚠️ sem prova própria |
| 49 | produto cruzado | setup/controle do cenário | 🟨 indireto |
| 50 | produto cruzado | define correlação por queryId | 🟨 indireto |
| 51 | produto cruzado | define correlação por queryId | 🟨 indireto |
| 52 | produto cruzado | setup/controle do cenário | 🟨 indireto |
| 53 | produto cruzado | separação visual | ⚠️ sem prova própria |
| 54 | produto cruzado | executa matcher perceptual real | 🟨 indireto |
| 55 | aspect ratio | assertion direta do resultado | ✅ direto |
| 56 | aspect ratio | assertion direta do resultado | ✅ direto |
| 57 | aspect ratio | assertion direta do resultado | ✅ direto |
| 58 | aspect ratio | setup/controle do cenário | 🟨 indireto |
| 59 | aspect ratio | separação visual | ⚠️ sem prova própria |
| 60 | aspect ratio | setup/controle do cenário | 🟨 indireto |
| 61 | aspect ratio | comentário/intenção | ⚠️ sem prova própria |
| 62 | aspect ratio | setup/controle do cenário | 🟨 indireto |
| 63 | aspect ratio | define correlação por queryId | 🟨 indireto |
| 64 | aspect ratio | setup/controle do cenário | 🟨 indireto |
| 65 | aspect ratio | executa matcher perceptual real | 🟨 indireto |
| 66 | exato+aproximado | assertion direta do resultado | ✅ direto |
| 67 | exato+aproximado | setup/controle do cenário | 🟨 indireto |
| 68 | exato+aproximado | separação visual | ⚠️ sem prova própria |
| 69 | exato+aproximado | setup/controle do cenário | 🟨 indireto |
| 70 | exato+aproximado | comentário/intenção | ⚠️ sem prova própria |
| 71 | exato+aproximado | configura hashes controlados | ⚠️ sem prova própria |
| 72 | exato+aproximado | configura hashes controlados | 🟨 indireto |
| 73 | exato+aproximado | setup/controle do cenário | 🟨 indireto |
| 74 | exato+aproximado | define correlação por queryId | 🟨 indireto |
| 75 | exato+aproximado | define correlação por queryId | 🟨 indireto |
| 76 | exato+aproximado | setup/controle do cenário | 🟨 indireto |
| 77 | exato+aproximado | executa matcher perceptual real | 🟨 indireto |
| 78 | exato+aproximado | assertion direta do resultado | ✅ direto |
| 79 | exato+aproximado | assertion direta do resultado | ✅ direto |
| 80 | exato+aproximado | setup/controle do cenário | 🟨 indireto |
| 81 | sucesso | separação visual | ⚠️ sem prova própria |
| 82 | sucesso | setup/controle do cenário | 🟨 indireto |
| 83 | sucesso | setup/controle do cenário | 🟨 indireto |
| 84 | sucesso | separação visual | ⚠️ sem prova própria |
| 85 | catch | executa e captura falha | 🟨 indireto |
| 86 | catch | setup/controle do cenário | 🟨 indireto |
| 87 | catch | converte falha em exit 1 | 🟨 indireto |
| 88 | catch | setup/controle do cenário | 🟨 indireto |
| 89 | newline | newline final POSIX | ⚠️ sem prova própria |

## Autoauditoria

- SHA reconfirmado: `bf8409c3df43062e5e6af496393412eee0c6a694`.
- Fonte integral embutida.
- Mapa cobre **89/89 posições**.
- Runner/package, factory em memória e handler V2 foram investigados.
- Nenhum arquivo externo foi alterado para fabricar evidência.

# Bíblia técnica — tests/integration/ipc/gtc-cache-flow.test.js

> **Estado documental:** ✅ CONCLUÍDO pelo AGENTE 9  
> **SHA auditado:** `e6eb5c744499fcaa0309a187a173841c185bbaea`  
> **Agente responsável:** AGENTE 9  
> **Tipo real observado:** suíte Jest de simulação/contrato do GTC legado sobre `ChromeStorageMock`  
> **Linhas textuais:** **250**  
> **Posições documentais:** **251**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural real

Apesar do caminho `tests/integration/ipc/` e do cabeçalho “Fluxo Completo v3.2”, este arquivo **não importa nem executa a implementação real do GTC/pipeline**. A regra central de lookup é reimplementada localmente por `simulateExtractWithGTC`; os cenários de “UPDATE_IMAGE” gravam diretamente no `ChromeStorageMock`. Portanto, as assertions são prova direta da simulação e do mock, não de `extractAndSendImages`, `UPDATE_IMAGE`, `GTC_QUERY_MANY`, `GTC_SAVE` ou do repositório IndexedDB real.

Isso não torna a suíte inútil: ela documenta/valida um contrato legado simples — chaves `gtc_<sha256>`, consulta batch, particionamento por índice, equivalência de hash cross-URL e comportamento para hash nulo. O risco é **classificação excessiva**: tratar essa suíte como evidência de integração completa produziria falso positivo documental.

## 2. Contraste com a arquitetura atual

- `extension/content/content_manga.js` consulta primeiro o runtime com `GTC_QUERY_MANY`; somente se a resposta moderna não estiver disponível cai no fallback legado `chrome.storage.local` com `gtc_<hash>`.
- O mesmo módulo salva via `GTC_SAVE` com metadados visuais e só usa `storage.local` como fallback de backward compatibility.
- O pipeline atual possui níveis SHA-256, dHash e consultas perceptuais correlacionadas; esta suíte cobre apenas SHA-256 exato legado.
- `tests/unit/content-manga/extract-flow-real.test.js` carrega `content_manga.js` real e possui cenários focais de `extractAndSendImages`.
- `tests/unit/content-manga/extraction-and-handlers-real.test.js` despacha `UPDATE_IMAGE` real e verifica emissão de `GTC_SAVE`.
- Existem ainda testes reais do bridge/background/IndexedDB; logo esta suíte deve ser classificada como complemento simulado, não como substituta dessas provas.

## 3. Isolamento do storage mock

`getStorageMock()` devolve uma instância singleton, mas o próprio `tests/mocks/chrome-api.mock.js` instala um `beforeEach` global que chama `initChromeMocks()`. Nas chamadas subsequentes, esse reset executa `storageMock.clear()` e cancela timers antes de cada caso. Assim, o Cenário B pode assumir storage vazio apesar de Cenário A ter gravado dados; a limpeza não aparece neste arquivo porque pertence à infraestrutura Jest compartilhada.

## 4. Matriz de evidência

| Alegação | O que este arquivo realmente executa | Classificação |
|---|---|---|
| 100% hits / 0% misses | helper local `simulateExtractWithGTC` + storage mock | ✅ PROVADO DIRETAMENTE **na simulação** |
| 0% hits / todos misses | helper local + storage vazio | ✅ PROVADO DIRETAMENTE **na simulação** |
| hits parciais preservam índices | helper local | ✅ PROVADO DIRETAMENTE **na simulação** |
| mesma imagem cross-URL dá hit | passa literalmente o mesmo hash; não usa URLs/fingerprint real | ✅ PROVADO apenas como **mesmo hash → mesma chave** |
| `UPDATE_IMAGE` salva GTC | não despacha `UPDATE_IMAGE`; chama `storageMock.set` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| `extractAndSendImages` usa cache | não importa/chama `content_manga.js` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| sem hash não salva | branch local `if (origHash)` | ✅ PROVADO apenas para a reimplementação local |
| batch get retorna mesmas três entradas | uma chamada `storageMock.get([...])` | ✅ PROVADO DIRETAMENTE para o mock |
| batch get é mais eficiente que N gets | não mede chamadas/tempo versus N gets | ⚠️ NÃO PROVADO; somente equivalência dos dados |
| arquitetura GTC moderna runtime/IndexedDB | não executada | ⚠️ SEM PROVA NESTE ARQUIVO |

## 5. Invariantes/casos-limite realmente cobertos

1. Hash truthy é mapeado para `gtc_<hash>` pela simulação.
2. Hash falsy não gera chave de lookup e vira miss.
3. Índices originais são preservados nos dois vetores.
4. Valor truthy armazenado vira hit; ausência/falsy vira miss.
5. Um array de chaves pode ser lido em batch pelo `ChromeStorageMock`.
6. Mesmo hash sintético recupera a mesma tradução independentemente da narrativa de URL.
7. Cada caso recebe storage limpo pela infraestrutura global de mocks.
8. Nenhum destes invariantes, isoladamente, prova que o pipeline de produção continua igual à simulação.

## 6. Achados e solicitações ao auditor

> **Lifecycle canônico:** os status abaixo refletem `docs/biblia/.state/110.json`; todos os cinco findings estão `ACCEPTED` e continuam como lacunas não bloqueantes de software/cobertura.

- **110-001 — TEST_CLASSIFICATION_REVIEW — ACCEPTED — HIGH:** o nome/cabeçalho falam em integração e “FLUXO COMPLETO”, mas a suíte não carrega produção. Reclassificar/documentar de forma que simulação não seja citada como prova real.
- **110-002 — TEST_REQUIRED — ACCEPTED — HIGH:** se este arquivo deve permanecer responsável por fluxo GTC, criar/usar teste que execute `content_manga.js`/bridge/IndexedDB reais e verifique `GTC_QUERY_MANY`, miss→fila, cache hit→replacement e `UPDATE_IMAGE`→`GTC_SAVE`; hoje essas provas estão dispersas em outras suítes.
- **110-003 — ARCHITECTURE_DRIFT — ACCEPTED:** decidir se a cobertura de `gtc_<hash>` deve ser explicitamente rotulada como fallback legado, porque o caminho primário atual usa runtime/IndexedDB e metadados perceptuais.
- **110-004 — TEST_ASSERTION_QUALITY — ACCEPTED:** o teste intitulado “Batch get vs N gets individuais (eficiência)” não executa N gets, não conta chamadas nem mede desempenho; ajustar a alegação ou adicionar prova correspondente.
- **110-005 — CLEANUP — ACCEPTED — LOW:** `const fs = require('fs')` não possui consumidor no arquivo.

## 7. Fonte integral exata

```js
/**
 * gtc-cache-flow.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes de integração do Global Translation Cache (GTC) — v3.2.
 *
 * FLUXO COMPLETO:
 * 1. extractAndSendImages gera fingerprints em paralelo
 * 2. Consulta o GTC no storage (batch get)
 * 3. Cache hits → applyImageReplacement(fromCache=true)
 * 4. Cache misses → fila do Gemini
 * 5. UPDATE_IMAGE salva no GTC após nova tradução
 *
 * CENÁRIOS:
 * A. 100% cache hits → sem Gemini, checkIfComplete(true)
 * B. 0% cache hits → tudo vai para Gemini (comportamento v3.1)
 * C. Hits parciais → alguns imediatos + resto para Gemini
 * D. Mesma imagem em site espelho → GTC resolve sem Gemini
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

describe('Global Translation Cache (GTC) — Fluxo Completo v3.2', () => {

    const TRANS_BASE64 = 'data:image/png;base64,TRANSLATED_IMAGE';
    const HASH_PAGE1   = 'a'.repeat(64); // SHA-256 simulado para página 1
    const HASH_PAGE2   = 'b'.repeat(64); // SHA-256 simulado para página 2
    const HASH_PAGE3   = 'c'.repeat(64); // SHA-256 simulado para página 3

    // ── Simulação do fluxo de extractAndSendImages com GTC ─────────────────────
    async function simulateExtractWithGTC(chromeStorage, imageHashes) {
        const hashKeys = imageHashes.filter(Boolean).map(h => `gtc_${h}`);
        const gtcData = hashKeys.length > 0
            ? await new Promise(r => chromeStorage.get(hashKeys, r))
            : {};

        const cacheHits = [];
        const cacheMisses = [];

        imageHashes.forEach((hash, i) => {
            const cacheKey = hash ? `gtc_${hash}` : null;
            const cached = cacheKey ? gtcData[cacheKey] : null;
            if (cached) cacheHits.push({ index: i, base64: cached });
            else cacheMisses.push({ index: i });
        });

        return { cacheHits, cacheMisses };
    }

    let storageMock;

    beforeEach(() => {
        storageMock = getStorageMock();
    });

    describe('Cenário A: 100% cache hits', () => {
        test('todas as imagens no cache → sem envio para Gemini', async () => {
            // Pré-popula o GTC
            await storageMock.set({
                [`gtc_${HASH_PAGE1}`]: TRANS_BASE64,
                [`gtc_${HASH_PAGE2}`]: TRANS_BASE64,
            });

            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(
                storageMock,
                [HASH_PAGE1, HASH_PAGE2]
            );

            expect(cacheHits).toHaveLength(2);
            expect(cacheMisses).toHaveLength(0);
        });

        test('cache hits têm o base64 correto', async () => {
            const TRANS_P1 = 'data:image/png;base64,PAGE1_TRANSLATED';
            const TRANS_P2 = 'data:image/png;base64,PAGE2_TRANSLATED';

            await storageMock.set({
                [`gtc_${HASH_PAGE1}`]: TRANS_P1,
                [`gtc_${HASH_PAGE2}`]: TRANS_P2,
            });

            const { cacheHits } = await simulateExtractWithGTC(
                storageMock,
                [HASH_PAGE1, HASH_PAGE2]
            );

            expect(cacheHits[0].base64).toBe(TRANS_P1);
            expect(cacheHits[1].base64).toBe(TRANS_P2);
        });
    });

    describe('Cenário B: 0% cache hits', () => {
        test('nenhuma imagem no cache → todas vão para Gemini', async () => {
            // Storage vazio — sem GTC entries
            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(
                storageMock,
                [HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]
            );

            expect(cacheHits).toHaveLength(0);
            expect(cacheMisses).toHaveLength(3);
        });

        test('indices dos cache misses são preservados corretamente', async () => {
            const { cacheMisses } = await simulateExtractWithGTC(
                storageMock,
                [HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]
            );

            expect(cacheMisses.map(m => m.index)).toEqual([0, 1, 2]);
        });
    });

    describe('Cenário C: hits parciais', () => {
        test('pag1 e pag3 no cache, pag2 não → pag2 vai para Gemini', async () => {
            await storageMock.set({
                [`gtc_${HASH_PAGE1}`]: TRANS_BASE64,
                // HASH_PAGE2 não está no cache
                [`gtc_${HASH_PAGE3}`]: TRANS_BASE64,
            });

            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(
                storageMock,
                [HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]
            );

            expect(cacheHits.map(h => h.index)).toEqual([0, 2]);
            expect(cacheMisses.map(m => m.index)).toEqual([1]);
        });

        test('contagem total = cache hits + cache misses = imagens selecionadas', async () => {
            await storageMock.set({ [`gtc_${HASH_PAGE1}`]: TRANS_BASE64 });

            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(
                storageMock,
                [HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]
            );

            expect(cacheHits.length + cacheMisses.length).toBe(3);
        });
    });

    describe('Cenário D: mesma imagem em site espelho (cross-URL)', () => {
        test('imagem traduzida em siteA é reconhecida em siteB pelo hash', async () => {
            // A MESMA imagem física (mesmo conteúdo de pixels) tem URLs diferentes
            // em dois sites, mas produz o MESMO fingerprint hash.
            const SHARED_HASH = HASH_PAGE1; // Mesmo hash = mesma imagem

            // Salva no GTC após tradução em siteA
            await storageMock.set({ [`gtc_${SHARED_HASH}`]: TRANS_BASE64 });

            // siteB tenta traduzir a mesma imagem — deve encontrar no GTC
            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(
                storageMock,
                [SHARED_HASH] // Mesmo hash, URL diferente (mas hash é o que importa)
            );

            expect(cacheHits).toHaveLength(1);
            expect(cacheMisses).toHaveLength(0);
            expect(cacheHits[0].base64).toBe(TRANS_BASE64);
        });
    });

    describe('Salvamento no GTC após tradução pelo Gemini', () => {
        test('UPDATE_IMAGE salva entry no GTC com chave gtc_${hash}', async () => {
            const hash = HASH_PAGE1;
            const translated = TRANS_BASE64;

            // Simula o que UPDATE_IMAGE faz
            await storageMock.set({ [`gtc_${hash}`]: translated });

            // Verifica que a entry foi salva
            const data = await storageMock.get([`gtc_${hash}`]);
            expect(data[`gtc_${hash}`]).toBe(translated);
        });

        test('sem hash disponível (fingerprint falhou), GTC não é salvo', async () => {
            // origHash = null significa que generateImageFingerprint retornou null
            const origHash = null;
            const toSet = {};

            if (origHash) {
                toSet[`gtc_${origHash}`] = TRANS_BASE64;
            }

            await storageMock.set(toSet);

            // Nenhuma chave gtc_* deve existir
            const data = await storageMock.get(null);
            const gtcKeys = Object.keys(data).filter(k => k.startsWith('gtc_'));
            expect(gtcKeys).toHaveLength(0);
        });

        test('múltiplas traduções criam múltiplas entries no GTC', async () => {
            await storageMock.set({ [`gtc_${HASH_PAGE1}`]: 'data:base64:T1' });
            await storageMock.set({ [`gtc_${HASH_PAGE2}`]: 'data:base64:T2' });
            await storageMock.set({ [`gtc_${HASH_PAGE3}`]: 'data:base64:T3' });

            const data = await storageMock.get(null);
            const gtcKeys = Object.keys(data).filter(k => k.startsWith('gtc_'));
            expect(gtcKeys).toHaveLength(3);
        });
    });

    describe('Batch get vs N gets individuais (eficiência)', () => {
        test('um único get com N chaves retorna os mesmos dados que N gets individuais', async () => {
            await storageMock.set({
                [`gtc_${HASH_PAGE1}`]: 'data:T1',
                [`gtc_${HASH_PAGE2}`]: 'data:T2',
                [`gtc_${HASH_PAGE3}`]: 'data:T3',
            });

            // Batch get (uma chamada)
            const batchResult = await new Promise(r =>
                storageMock.get([
                    `gtc_${HASH_PAGE1}`,
                    `gtc_${HASH_PAGE2}`,
                    `gtc_${HASH_PAGE3}`
                ], r)
            );

            expect(batchResult[`gtc_${HASH_PAGE1}`]).toBe('data:T1');
            expect(batchResult[`gtc_${HASH_PAGE2}`]).toBe('data:T2');
            expect(batchResult[`gtc_${HASH_PAGE3}`]).toBe('data:T3');
        });
    });

    describe('Hashes nulos ou imagens inválidas', () => {
        test('hash null é ignorado (sem entrada no GTC)', async () => {
            const hashes = [null, HASH_PAGE1, null];
            await storageMock.set({ [`gtc_${HASH_PAGE1}`]: TRANS_BASE64 });

            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(
                storageMock,
                hashes
            );

            // null hashes = cache miss
            expect(cacheMisses.map(m => m.index)).toContain(0);
            expect(cacheMisses.map(m => m.index)).toContain(2);
            expect(cacheHits.map(h => h.index)).toContain(1);
        });
    });
});
```

## 8. Auditoria linha a linha

### Linha 001 — cabeçalho e intenção declarada

- **Código:** `/**`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 002 — cabeçalho e intenção declarada

- **Código:** ` * gtc-cache-flow.test.js`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 003 — cabeçalho e intenção declarada

- **Código:** ` * ─────────────────────────────────────────────────────────────────────────────`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 004 — cabeçalho e intenção declarada

- **Código:** ` * Testes de integração do Global Translation Cache (GTC) — v3.2.`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 005 — cabeçalho e intenção declarada

- **Código:** ` *`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 006 — cabeçalho e intenção declarada

- **Código:** ` * FLUXO COMPLETO:`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 007 — cabeçalho e intenção declarada

- **Código:** ` * 1. extractAndSendImages gera fingerprints em paralelo`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 008 — cabeçalho e intenção declarada

- **Código:** ` * 2. Consulta o GTC no storage (batch get)`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 009 — cabeçalho e intenção declarada

- **Código:** ` * 3. Cache hits → applyImageReplacement(fromCache=true)`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 010 — cabeçalho e intenção declarada

- **Código:** ` * 4. Cache misses → fila do Gemini`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 011 — cabeçalho e intenção declarada

- **Código:** ` * 5. UPDATE_IMAGE salva no GTC após nova tradução`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 012 — cabeçalho e intenção declarada

- **Código:** ` *`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 013 — cabeçalho e intenção declarada

- **Código:** ` * CENÁRIOS:`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 014 — cabeçalho e intenção declarada

- **Código:** ` * A. 100% cache hits → sem Gemini, checkIfComplete(true)`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 015 — cabeçalho e intenção declarada

- **Código:** ` * B. 0% cache hits → tudo vai para Gemini (comportamento v3.1)`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 016 — cabeçalho e intenção declarada

- **Código:** ` * C. Hits parciais → alguns imediatos + resto para Gemini`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 017 — cabeçalho e intenção declarada

- **Código:** ` * D. Mesma imagem em site espelho → GTC resolve sem Gemini`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 018 — cabeçalho e intenção declarada

- **Código:** ` */`
- **O que faz:** Parte do comentário de cabeçalho que descreve a intenção alegada da suíte; não executa código.
- **Como:** É texto de comentário interpretado apenas por leitores/ferramentas, não pelo runtime.
- **Por que / risco de alternativa:** Comentários deveriam refletir com precisão a evidência. Aqui “FLUXO COMPLETO/integração” excede o que o corpo realmente executa, por isso há solicitação ao auditor.
- **Evidência:** ⚠️ DESCRIÇÃO NÃO PROBATÓRIA — o cabeçalho declara integração/fluxo completo, mas o corpo usa simulação local.

### Linha 019 — infraestrutura e root/mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de infraestrutura e root/mock; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 020 — infraestrutura e root/mock

- **Código:** `const path = require('path');`
- **O que faz:** Importa `path`, usado para resolver o mock Chrome a partir do root detectado.
- **Como:** Usa CommonJS e paths derivados de `__dirname` para carregar infraestrutura de teste.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte.

### Linha 021 — infraestrutura e root/mock

- **Código:** `const fs   = require('fs');`
- **O que faz:** Importa `fs`, mas nenhum uso de `fs` aparece no restante deste arquivo; é uma dependência atualmente ociosa.
- **Como:** Usa CommonJS e paths derivados de `__dirname` para carregar infraestrutura de teste.
- **Por que / risco de alternativa:** Não há justificativa funcional observável no estado atual porque `fs` não é consumido; manter import morto aumenta ruído e merece limpeza separada.
- **Evidência:** ⚠️ SEM EFEITO/SEM TESTE — import não utilizado.

### Linha 022 — infraestrutura e root/mock

- **Código:** `// Portable root finder — works regardless of where this file is placed in the tree.`
- **O que faz:** Comentário do infraestrutura e root/mock; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Usa CommonJS e paths derivados de `__dirname` para carregar infraestrutura de teste.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 023 — infraestrutura e root/mock

- **Código:** `// Walks up from __dirname until it finds the folder containing extension/manifest.json.`
- **O que faz:** Comentário do infraestrutura e root/mock; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Usa CommonJS e paths derivados de `__dirname` para carregar infraestrutura de teste.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 024 — infraestrutura e root/mock

- **Código:** `const { findRepoRoot } = require('../../helpers/repo-root');`
- **O que faz:** Importa `findRepoRoot`, helper compartilhado que procura a raiz real do repositório.
- **Como:** Usa CommonJS e paths derivados de `__dirname` para carregar infraestrutura de teste.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte.

### Linha 025 — infraestrutura e root/mock

- **Código:** `const ROOT = findRepoRoot(__dirname);`
- **O que faz:** Calcula `ROOT` a partir de `__dirname`, tornando o path do mock independente da profundidade/cwd.
- **Como:** Usa CommonJS e paths derivados de `__dirname` para carregar infraestrutura de teste.
- **Por que / risco de alternativa:** Resolver a raiz evita acoplamento à profundidade do teste ou cwd; hardcode absoluto seria menos portável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte.

### Linha 026 — infraestrutura e root/mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de infraestrutura e root/mock; não produz efeito em runtime.
- **Como:** Usa CommonJS e paths derivados de `__dirname` para carregar infraestrutura de teste.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 027 — infraestrutura e root/mock

- **Código:** `const { getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));`
- **O que faz:** Importa `getStorageMock` do mock Chrome usando o root resolvido.
- **Como:** Usa CommonJS e paths derivados de `__dirname` para carregar infraestrutura de teste.
- **Por que / risco de alternativa:** Resolver a raiz evita acoplamento à profundidade do teste ou cwd; hardcode absoluto seria menos portável.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte.

### Linha 028 — suite e fixtures constantes

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de suite e fixtures constantes; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 029 — suite e fixtures constantes

- **Código:** `describe('Global Translation Cache (GTC) — Fluxo Completo v3.2', () => {`
- **O que faz:** Abre a suíte Jest principal rotulada como fluxo completo GTC v3.2.
- **Como:** Executa dentro do processo Jest e do ambiente de mocks configurado pelo projeto.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 030 — suite e fixtures constantes

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de suite e fixtures constantes; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 031 — suite e fixtures constantes

- **Código:** `    const TRANS_BASE64 = 'data:image/png;base64,TRANSLATED_IMAGE';`
- **O que faz:** Define o Data URL sintético comum usado como tradução armazenada.
- **Como:** Executa dentro do processo Jest e do ambiente de mocks configurado pelo projeto.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 032 — suite e fixtures constantes

- **Código:** `    const HASH_PAGE1   = 'a'.repeat(64); // SHA-256 simulado para página 1`
- **O que faz:** Define um hash SHA-256 sintético de 64 caracteres para página 1; não calcula fingerprint real.
- **Como:** Executa dentro do processo Jest e do ambiente de mocks configurado pelo projeto.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 033 — suite e fixtures constantes

- **Código:** `    const HASH_PAGE2   = 'b'.repeat(64); // SHA-256 simulado para página 2`
- **O que faz:** Define um hash SHA-256 sintético de 64 caracteres para página 2; não calcula fingerprint real.
- **Como:** Executa dentro do processo Jest e do ambiente de mocks configurado pelo projeto.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 034 — suite e fixtures constantes

- **Código:** `    const HASH_PAGE3   = 'c'.repeat(64); // SHA-256 simulado para página 3`
- **O que faz:** Define um hash SHA-256 sintético de 64 caracteres para página 3; não calcula fingerprint real.
- **Como:** Executa dentro do processo Jest e do ambiente de mocks configurado pelo projeto.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 035 — simulação local de lookup GTC

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de simulação local de lookup GTC; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 036 — simulação local de lookup GTC

- **Código:** `    // ── Simulação do fluxo de extractAndSendImages com GTC ─────────────────────`
- **O que faz:** Comentário do simulação local de lookup GTC; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Executa dentro do processo Jest e do ambiente de mocks configurado pelo projeto.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 037 — simulação local de lookup GTC

- **Código:** `    async function simulateExtractWithGTC(chromeStorage, imageHashes) {`
- **O que faz:** Declara `simulateExtractWithGTC`, uma implementação local/espelho que particiona hashes em hits e misses usando somente o storage mock.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 038 — simulação local de lookup GTC

- **Código:** `        const hashKeys = imageHashes.filter(Boolean).map(h => \`gtc_${h}\`);`
- **O que faz:** Filtra hashes falsy e produz chaves legadas `gtc_<hash>` para consulta em lote.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 039 — simulação local de lookup GTC

- **Código:** `        const gtcData = hashKeys.length > 0`
- **O que faz:** Inicia a expressão ternária que decide se haverá consulta ao storage.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 040 — simulação local de lookup GTC

- **Código:** `            ? await new Promise(r => chromeStorage.get(hashKeys, r))`
- **O que faz:** Quando há chaves, faz um único `chromeStorage.get(hashKeys, callback)` encapsulado em Promise.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 041 — simulação local de lookup GTC

- **Código:** `            : {};`
- **O que faz:** Quando não há chave válida, usa objeto vazio sem consultar storage.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 042 — simulação local de lookup GTC

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de simulação local de lookup GTC; não produz efeito em runtime.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 043 — simulação local de lookup GTC

- **Código:** `        const cacheHits = [];`
- **O que faz:** Cria acumulador dos cache hits produzidos pela simulação.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 044 — simulação local de lookup GTC

- **Código:** `        const cacheMisses = [];`
- **O que faz:** Cria acumulador dos cache misses produzidos pela simulação.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 045 — simulação local de lookup GTC

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de simulação local de lookup GTC; não produz efeito em runtime.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 046 — simulação local de lookup GTC

- **Código:** `        imageHashes.forEach((hash, i) => {`
- **O que faz:** Percorre os hashes originais preservando o índice de cada imagem.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 047 — simulação local de lookup GTC

- **Código:** `            const cacheKey = hash ? \`gtc_${hash}\` : null;`
- **O que faz:** Converte hash truthy em chave legada; hash falsy recebe chave nula.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 048 — simulação local de lookup GTC

- **Código:** `            const cached = cacheKey ? gtcData[cacheKey] : null;`
- **O que faz:** Lê do resultado do storage somente quando existe chave válida.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 049 — simulação local de lookup GTC

- **Código:** `            if (cached) cacheHits.push({ index: i, base64: cached });`
- **O que faz:** Classifica valor truthy como hit e preserva índice/base64.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 050 — simulação local de lookup GTC

- **Código:** `            else cacheMisses.push({ index: i });`
- **O que faz:** Classifica ausência/falsy como miss e preserva o índice.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 051 — simulação local de lookup GTC

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do simulação local de lookup GTC.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 052 — simulação local de lookup GTC

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de simulação local de lookup GTC; não produz efeito em runtime.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 053 — simulação local de lookup GTC

- **Código:** `        return { cacheHits, cacheMisses };`
- **O que faz:** Retorna os dois vetores simulados para as assertions da suíte.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 054 — simulação local de lookup GTC

- **Código:** `    }`
- **O que faz:** Fecha uma construção sintática do simulação local de lookup GTC.
- **Como:** Opera exclusivamente sobre `imageHashes`, `chromeStorage.get` e arrays locais; não importa/chama `content_manga.js` nem `cm-gtc-client.js`.
- **Por que / risco de alternativa:** A simulação torna cenários simples e determinísticos, mas copiar a regra de produção cria risco de drift: ela pode continuar verde quando o pipeline real muda.
- **Evidência:** ✅ PROVADO DIRETAMENTE para a **função simulada local** pelos cenários A–D e hashes nulos; ⚠️ não prova a implementação real.

### Linha 055 — setup do storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de setup do storage mock; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 056 — setup do storage mock

- **Código:** `    let storageMock;`
- **O que faz:** Declara referência mutável ao singleton do storage mock.
- **Como:** Executa dentro do processo Jest e do ambiente de mocks configurado pelo projeto.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 057 — setup do storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de setup do storage mock; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 058 — setup do storage mock

- **Código:** `    beforeEach(() => {`
- **O que faz:** Registra setup por teste; o setup global de `chrome-api.mock.js` executa antes e limpa os dados do singleton.
- **Como:** O `chrome-api.mock.js` possui hook Jest global que limpa storage/timers antes de cada teste e `getStorageMock()` devolve o singleton já resetado.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** ✅ PROVADO POR INFRAESTRUTURA DE TESTE — `chrome-api.mock.js` registra hook `beforeEach(initChromeMocks)` que limpa o storage singleton.

### Linha 059 — setup do storage mock

- **Código:** `        storageMock = getStorageMock();`
- **O que faz:** Obtém a instância corrente do storage mock; não cria storage de produção nem IndexedDB.
- **Como:** O `chrome-api.mock.js` possui hook Jest global que limpa storage/timers antes de cada teste e `getStorageMock()` devolve o singleton já resetado.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** ✅ PROVADO POR INFRAESTRUTURA DE TESTE — `chrome-api.mock.js` registra hook `beforeEach(initChromeMocks)` que limpa o storage singleton.

### Linha 060 — setup do storage mock

- **Código:** `    });`
- **O que faz:** Fecha uma construção sintática do setup do storage mock.
- **Como:** O `chrome-api.mock.js` possui hook Jest global que limpa storage/timers antes de cada teste e `getStorageMock()` devolve o singleton já resetado.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** ✅ PROVADO POR INFRAESTRUTURA DE TESTE — `chrome-api.mock.js` registra hook `beforeEach(initChromeMocks)` que limpa o storage singleton.

### Linha 061 — Cenário A — 100% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário A — 100% hits simulados; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 062 — Cenário A — 100% hits simulados

- **Código:** `    describe('Cenário A: 100% cache hits', () => {`
- **O que faz:** Abre o agrupamento Jest do Cenário A — 100% hits simulados, organizando os casos sem mudar a lógica de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 063 — Cenário A — 100% hits simulados

- **Código:** `        test('todas as imagens no cache → sem envio para Gemini', async () => {`
- **O que faz:** Declara um caso Jest do Cenário A — 100% hits simulados; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 064 — Cenário A — 100% hits simulados

- **Código:** `            // Pré-popula o GTC`
- **O que faz:** Comentário do Cenário A — 100% hits simulados; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 065 — Cenário A — 100% hits simulados

- **Código:** `            await storageMock.set({`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 066 — Cenário A — 100% hits simulados

- **Código:** `                [\`gtc_${HASH_PAGE1}\`]: TRANS_BASE64,`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `[\`gtc_${HASH_PAGE1}\`]: TRANS_BASE64,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 067 — Cenário A — 100% hits simulados

- **Código:** `                [\`gtc_${HASH_PAGE2}\`]: TRANS_BASE64,`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `[\`gtc_${HASH_PAGE2}\`]: TRANS_BASE64,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 068 — Cenário A — 100% hits simulados

- **Código:** `            });`
- **O que faz:** Fecha uma construção sintática do Cenário A — 100% hits simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 069 — Cenário A — 100% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário A — 100% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 070 — Cenário A — 100% hits simulados

- **Código:** `            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(`
- **O que faz:** Executa a simulação local e desestrutura seu resultado para as assertions subsequentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 071 — Cenário A — 100% hits simulados

- **Código:** `                storageMock,`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `storageMock,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 072 — Cenário A — 100% hits simulados

- **Código:** `                [HASH_PAGE1, HASH_PAGE2]`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `[HASH_PAGE1, HASH_PAGE2]`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 073 — Cenário A — 100% hits simulados

- **Código:** `            );`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `);`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 074 — Cenário A — 100% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário A — 100% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 075 — Cenário A — 100% hits simulados

- **Código:** `            expect(cacheHits).toHaveLength(2);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 076 — Cenário A — 100% hits simulados

- **Código:** `            expect(cacheMisses).toHaveLength(0);`
- **O que faz:** Assertion Jest direta sobre o vetor de misses produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 077 — Cenário A — 100% hits simulados

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do Cenário A — 100% hits simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 078 — Cenário A — 100% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário A — 100% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 079 — Cenário A — 100% hits simulados

- **Código:** `        test('cache hits têm o base64 correto', async () => {`
- **O que faz:** Declara um caso Jest do Cenário A — 100% hits simulados; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 080 — Cenário A — 100% hits simulados

- **Código:** `            const TRANS_P1 = 'data:image/png;base64,PAGE1_TRANSLATED';`
- **O que faz:** Declara valor local usado pelo Cenário A — 100% hits simulados; sua validade é limitada à fixture/teste e não deriva automaticamente da implementação de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 081 — Cenário A — 100% hits simulados

- **Código:** `            const TRANS_P2 = 'data:image/png;base64,PAGE2_TRANSLATED';`
- **O que faz:** Declara valor local usado pelo Cenário A — 100% hits simulados; sua validade é limitada à fixture/teste e não deriva automaticamente da implementação de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 082 — Cenário A — 100% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário A — 100% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 083 — Cenário A — 100% hits simulados

- **Código:** `            await storageMock.set({`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 084 — Cenário A — 100% hits simulados

- **Código:** `                [\`gtc_${HASH_PAGE1}\`]: TRANS_P1,`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `[\`gtc_${HASH_PAGE1}\`]: TRANS_P1,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 085 — Cenário A — 100% hits simulados

- **Código:** `                [\`gtc_${HASH_PAGE2}\`]: TRANS_P2,`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `[\`gtc_${HASH_PAGE2}\`]: TRANS_P2,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 086 — Cenário A — 100% hits simulados

- **Código:** `            });`
- **O que faz:** Fecha uma construção sintática do Cenário A — 100% hits simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 087 — Cenário A — 100% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário A — 100% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 088 — Cenário A — 100% hits simulados

- **Código:** `            const { cacheHits } = await simulateExtractWithGTC(`
- **O que faz:** Executa a simulação local e desestrutura seu resultado para as assertions subsequentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 089 — Cenário A — 100% hits simulados

- **Código:** `                storageMock,`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `storageMock,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 090 — Cenário A — 100% hits simulados

- **Código:** `                [HASH_PAGE1, HASH_PAGE2]`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `[HASH_PAGE1, HASH_PAGE2]`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 091 — Cenário A — 100% hits simulados

- **Código:** `            );`
- **O que faz:** Linha estrutural do Cenário A — 100% hits simulados: `);`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 092 — Cenário A — 100% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário A — 100% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 093 — Cenário A — 100% hits simulados

- **Código:** `            expect(cacheHits[0].base64).toBe(TRANS_P1);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 094 — Cenário A — 100% hits simulados

- **Código:** `            expect(cacheHits[1].base64).toBe(TRANS_P2);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 095 — Cenário A — 100% hits simulados

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do Cenário A — 100% hits simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 096 — Cenário A — 100% hits simulados

- **Código:** `    });`
- **O que faz:** Fecha uma construção sintática do Cenário A — 100% hits simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 097 — Cenário B — 0% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário B — 0% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 098 — Cenário B — 0% hits simulados

- **Código:** `    describe('Cenário B: 0% cache hits', () => {`
- **O que faz:** Abre o agrupamento Jest do Cenário B — 0% hits simulados, organizando os casos sem mudar a lógica de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 099 — Cenário B — 0% hits simulados

- **Código:** `        test('nenhuma imagem no cache → todas vão para Gemini', async () => {`
- **O que faz:** Declara um caso Jest do Cenário B — 0% hits simulados; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 100 — Cenário B — 0% hits simulados

- **Código:** `            // Storage vazio — sem GTC entries`
- **O que faz:** Comentário do Cenário B — 0% hits simulados; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 101 — Cenário B — 0% hits simulados

- **Código:** `            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(`
- **O que faz:** Executa a simulação local e desestrutura seu resultado para as assertions subsequentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 102 — Cenário B — 0% hits simulados

- **Código:** `                storageMock,`
- **O que faz:** Linha estrutural do Cenário B — 0% hits simulados: `storageMock,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 103 — Cenário B — 0% hits simulados

- **Código:** `                [HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]`
- **O que faz:** Linha estrutural do Cenário B — 0% hits simulados: `[HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 104 — Cenário B — 0% hits simulados

- **Código:** `            );`
- **O que faz:** Linha estrutural do Cenário B — 0% hits simulados: `);`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 105 — Cenário B — 0% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário B — 0% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 106 — Cenário B — 0% hits simulados

- **Código:** `            expect(cacheHits).toHaveLength(0);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 107 — Cenário B — 0% hits simulados

- **Código:** `            expect(cacheMisses).toHaveLength(3);`
- **O que faz:** Assertion Jest direta sobre o vetor de misses produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 108 — Cenário B — 0% hits simulados

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do Cenário B — 0% hits simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 109 — Cenário B — 0% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário B — 0% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 110 — Cenário B — 0% hits simulados

- **Código:** `        test('indices dos cache misses são preservados corretamente', async () => {`
- **O que faz:** Declara um caso Jest do Cenário B — 0% hits simulados; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 111 — Cenário B — 0% hits simulados

- **Código:** `            const { cacheMisses } = await simulateExtractWithGTC(`
- **O que faz:** Executa a simulação local e desestrutura seu resultado para as assertions subsequentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 112 — Cenário B — 0% hits simulados

- **Código:** `                storageMock,`
- **O que faz:** Linha estrutural do Cenário B — 0% hits simulados: `storageMock,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 113 — Cenário B — 0% hits simulados

- **Código:** `                [HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]`
- **O que faz:** Linha estrutural do Cenário B — 0% hits simulados: `[HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 114 — Cenário B — 0% hits simulados

- **Código:** `            );`
- **O que faz:** Linha estrutural do Cenário B — 0% hits simulados: `);`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 115 — Cenário B — 0% hits simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário B — 0% hits simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 116 — Cenário B — 0% hits simulados

- **Código:** `            expect(cacheMisses.map(m => m.index)).toEqual([0, 1, 2]);`
- **O que faz:** Assertion Jest direta sobre o vetor de misses produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 117 — Cenário B — 0% hits simulados

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do Cenário B — 0% hits simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 118 — Cenário B — 0% hits simulados

- **Código:** `    });`
- **O que faz:** Fecha uma construção sintática do Cenário B — 0% hits simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 119 — Cenário C — hits parciais simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário C — hits parciais simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 120 — Cenário C — hits parciais simulados

- **Código:** `    describe('Cenário C: hits parciais', () => {`
- **O que faz:** Abre o agrupamento Jest do Cenário C — hits parciais simulados, organizando os casos sem mudar a lógica de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 121 — Cenário C — hits parciais simulados

- **Código:** `        test('pag1 e pag3 no cache, pag2 não → pag2 vai para Gemini', async () => {`
- **O que faz:** Declara um caso Jest do Cenário C — hits parciais simulados; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 122 — Cenário C — hits parciais simulados

- **Código:** `            await storageMock.set({`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 123 — Cenário C — hits parciais simulados

- **Código:** `                [\`gtc_${HASH_PAGE1}\`]: TRANS_BASE64,`
- **O que faz:** Linha estrutural do Cenário C — hits parciais simulados: `[\`gtc_${HASH_PAGE1}\`]: TRANS_BASE64,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 124 — Cenário C — hits parciais simulados

- **Código:** `                // HASH_PAGE2 não está no cache`
- **O que faz:** Comentário do Cenário C — hits parciais simulados; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 125 — Cenário C — hits parciais simulados

- **Código:** `                [\`gtc_${HASH_PAGE3}\`]: TRANS_BASE64,`
- **O que faz:** Linha estrutural do Cenário C — hits parciais simulados: `[\`gtc_${HASH_PAGE3}\`]: TRANS_BASE64,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 126 — Cenário C — hits parciais simulados

- **Código:** `            });`
- **O que faz:** Fecha uma construção sintática do Cenário C — hits parciais simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 127 — Cenário C — hits parciais simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário C — hits parciais simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 128 — Cenário C — hits parciais simulados

- **Código:** `            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(`
- **O que faz:** Executa a simulação local e desestrutura seu resultado para as assertions subsequentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 129 — Cenário C — hits parciais simulados

- **Código:** `                storageMock,`
- **O que faz:** Linha estrutural do Cenário C — hits parciais simulados: `storageMock,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 130 — Cenário C — hits parciais simulados

- **Código:** `                [HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]`
- **O que faz:** Linha estrutural do Cenário C — hits parciais simulados: `[HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 131 — Cenário C — hits parciais simulados

- **Código:** `            );`
- **O que faz:** Linha estrutural do Cenário C — hits parciais simulados: `);`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 132 — Cenário C — hits parciais simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário C — hits parciais simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 133 — Cenário C — hits parciais simulados

- **Código:** `            expect(cacheHits.map(h => h.index)).toEqual([0, 2]);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 134 — Cenário C — hits parciais simulados

- **Código:** `            expect(cacheMisses.map(m => m.index)).toEqual([1]);`
- **O que faz:** Assertion Jest direta sobre o vetor de misses produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 135 — Cenário C — hits parciais simulados

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do Cenário C — hits parciais simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 136 — Cenário C — hits parciais simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário C — hits parciais simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 137 — Cenário C — hits parciais simulados

- **Código:** `        test('contagem total = cache hits + cache misses = imagens selecionadas', async () => {`
- **O que faz:** Declara um caso Jest do Cenário C — hits parciais simulados; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 138 — Cenário C — hits parciais simulados

- **Código:** `            await storageMock.set({ [\`gtc_${HASH_PAGE1}\`]: TRANS_BASE64 });`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 139 — Cenário C — hits parciais simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário C — hits parciais simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 140 — Cenário C — hits parciais simulados

- **Código:** `            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(`
- **O que faz:** Executa a simulação local e desestrutura seu resultado para as assertions subsequentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 141 — Cenário C — hits parciais simulados

- **Código:** `                storageMock,`
- **O que faz:** Linha estrutural do Cenário C — hits parciais simulados: `storageMock,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 142 — Cenário C — hits parciais simulados

- **Código:** `                [HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]`
- **O que faz:** Linha estrutural do Cenário C — hits parciais simulados: `[HASH_PAGE1, HASH_PAGE2, HASH_PAGE3]`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 143 — Cenário C — hits parciais simulados

- **Código:** `            );`
- **O que faz:** Linha estrutural do Cenário C — hits parciais simulados: `);`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 144 — Cenário C — hits parciais simulados

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário C — hits parciais simulados; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 145 — Cenário C — hits parciais simulados

- **Código:** `            expect(cacheHits.length + cacheMisses.length).toBe(3);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 146 — Cenário C — hits parciais simulados

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do Cenário C — hits parciais simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 147 — Cenário C — hits parciais simulados

- **Código:** `    });`
- **O que faz:** Fecha uma construção sintática do Cenário C — hits parciais simulados.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 148 — Cenário D — cross-URL por hash simulado

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário D — cross-URL por hash simulado; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 149 — Cenário D — cross-URL por hash simulado

- **Código:** `    describe('Cenário D: mesma imagem em site espelho (cross-URL)', () => {`
- **O que faz:** Abre o agrupamento Jest do Cenário D — cross-URL por hash simulado, organizando os casos sem mudar a lógica de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 150 — Cenário D — cross-URL por hash simulado

- **Código:** `        test('imagem traduzida em siteA é reconhecida em siteB pelo hash', async () => {`
- **O que faz:** Declara um caso Jest do Cenário D — cross-URL por hash simulado; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 151 — Cenário D — cross-URL por hash simulado

- **Código:** `            // A MESMA imagem física (mesmo conteúdo de pixels) tem URLs diferentes`
- **O que faz:** Comentário explicando a hipótese simulada de site espelho: URLs diferentes são representadas pelo mesmo hash, sem haver URLs reais neste caso.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 152 — Cenário D — cross-URL por hash simulado

- **Código:** `            // em dois sites, mas produz o MESMO fingerprint hash.`
- **O que faz:** Comentário explicando a hipótese simulada de site espelho: URLs diferentes são representadas pelo mesmo hash, sem haver URLs reais neste caso.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 153 — Cenário D — cross-URL por hash simulado

- **Código:** `            const SHARED_HASH = HASH_PAGE1; // Mesmo hash = mesma imagem`
- **O que faz:** Alias do hash sintético da página 1 para representar conteúdo idêntico entre sites.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 154 — Cenário D — cross-URL por hash simulado

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário D — cross-URL por hash simulado; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 155 — Cenário D — cross-URL por hash simulado

- **Código:** `            // Salva no GTC após tradução em siteA`
- **O que faz:** Comentário que descreve semanticamente um salvamento após tradução, embora a linha seguinte escreva diretamente no mock.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 156 — Cenário D — cross-URL por hash simulado

- **Código:** `            await storageMock.set({ [\`gtc_${SHARED_HASH}\`]: TRANS_BASE64 });`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 157 — Cenário D — cross-URL por hash simulado

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário D — cross-URL por hash simulado; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 158 — Cenário D — cross-URL por hash simulado

- **Código:** `            // siteB tenta traduzir a mesma imagem — deve encontrar no GTC`
- **O que faz:** Comentário que descreve a consulta do segundo site; a execução real continua sendo a simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 159 — Cenário D — cross-URL por hash simulado

- **Código:** `            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(`
- **O que faz:** Executa a simulação local e desestrutura seu resultado para as assertions subsequentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 160 — Cenário D — cross-URL por hash simulado

- **Código:** `                storageMock,`
- **O que faz:** Linha estrutural do Cenário D — cross-URL por hash simulado: `storageMock,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 161 — Cenário D — cross-URL por hash simulado

- **Código:** `                [SHARED_HASH] // Mesmo hash, URL diferente (mas hash é o que importa)`
- **O que faz:** Fornece o mesmo hash à simulação; a afirmação de URL diferente é conceitual e não há URL como input.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 162 — Cenário D — cross-URL por hash simulado

- **Código:** `            );`
- **O que faz:** Linha estrutural do Cenário D — cross-URL por hash simulado: `);`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 163 — Cenário D — cross-URL por hash simulado

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de Cenário D — cross-URL por hash simulado; não produz efeito em runtime.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 164 — Cenário D — cross-URL por hash simulado

- **Código:** `            expect(cacheHits).toHaveLength(1);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 165 — Cenário D — cross-URL por hash simulado

- **Código:** `            expect(cacheMisses).toHaveLength(0);`
- **O que faz:** Assertion Jest direta sobre o vetor de misses produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 166 — Cenário D — cross-URL por hash simulado

- **Código:** `            expect(cacheHits[0].base64).toBe(TRANS_BASE64);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 167 — Cenário D — cross-URL por hash simulado

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do Cenário D — cross-URL por hash simulado.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 168 — Cenário D — cross-URL por hash simulado

- **Código:** `    });`
- **O que faz:** Fecha uma construção sintática do Cenário D — cross-URL por hash simulado.
- **Como:** Prepara estado no storage mock, chama `simulateExtractWithGTC` e valida seus arrays com `expect`; portanto é prova direta da simulação.
- **Por que / risco de alternativa:** Fixtures sintéticas isolam particionamento hit/miss, mas não podem ser promovidas a prova de Gemini, DOM, fingerprint, IPC ou IndexedDB que não são executados.
- **Evidência:** ✅ ASSERTION DIRETA sobre a simulação/storage mock; ⚠️ SEM PROVA DIRETA do pipeline de produção alegado.

### Linha 169 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 170 — salvamento legado direto no storage mock

- **Código:** `    describe('Salvamento no GTC após tradução pelo Gemini', () => {`
- **O que faz:** Abre o agrupamento Jest do salvamento legado direto no storage mock, organizando os casos sem mudar a lógica de produção.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 171 — salvamento legado direto no storage mock

- **Código:** `        test('UPDATE_IMAGE salva entry no GTC com chave gtc_${hash}', async () => {`
- **O que faz:** Declara um caso Jest do salvamento legado direto no storage mock; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 172 — salvamento legado direto no storage mock

- **Código:** `            const hash = HASH_PAGE1;`
- **O que faz:** Declara valor local usado pelo salvamento legado direto no storage mock; sua validade é limitada à fixture/teste e não deriva automaticamente da implementação de produção.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 173 — salvamento legado direto no storage mock

- **Código:** `            const translated = TRANS_BASE64;`
- **O que faz:** Declara valor local usado pelo salvamento legado direto no storage mock; sua validade é limitada à fixture/teste e não deriva automaticamente da implementação de produção.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 174 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 175 — salvamento legado direto no storage mock

- **Código:** `            // Simula o que UPDATE_IMAGE faz`
- **O que faz:** Comentário reconhece explicitamente que o teste apenas simula o que `UPDATE_IMAGE` faria.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 176 — salvamento legado direto no storage mock

- **Código:** `            await storageMock.set({ [\`gtc_${hash}\`]: translated });`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 177 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 178 — salvamento legado direto no storage mock

- **Código:** `            // Verifica que a entry foi salva`
- **O que faz:** Comentário do salvamento legado direto no storage mock; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 179 — salvamento legado direto no storage mock

- **Código:** `            const data = await storageMock.get([\`gtc_${hash}\`]);`
- **O que faz:** Consulta diretamente a chave recém-gravada no storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 180 — salvamento legado direto no storage mock

- **Código:** `            expect(data[\`gtc_${hash}\`]).toBe(translated);`
- **O que faz:** Assertion Jest direta sobre o conteúdo atualmente salvo no storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 181 — salvamento legado direto no storage mock

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do salvamento legado direto no storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 182 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 183 — salvamento legado direto no storage mock

- **Código:** `        test('sem hash disponível (fingerprint falhou), GTC não é salvo', async () => {`
- **O que faz:** Declara um caso Jest do salvamento legado direto no storage mock; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 184 — salvamento legado direto no storage mock

- **Código:** `            // origHash = null significa que generateImageFingerprint retornou null`
- **O que faz:** Comentário do salvamento legado direto no storage mock; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 185 — salvamento legado direto no storage mock

- **Código:** `            const origHash = null;`
- **O que faz:** Define `origHash=null` para simular falha do fingerprint; nenhum fingerprint real é executado.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 186 — salvamento legado direto no storage mock

- **Código:** `            const toSet = {};`
- **O que faz:** Inicializa objeto local que espelha um payload de persistência.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 187 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 188 — salvamento legado direto no storage mock

- **Código:** `            if (origHash) {`
- **O que faz:** Branch local que só adicionaria a chave se `origHash` fosse truthy.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 189 — salvamento legado direto no storage mock

- **Código:** `                toSet[\`gtc_${origHash}\`] = TRANS_BASE64;`
- **O que faz:** Montaria a chave legada no objeto local; neste cenário não é executada porque o hash é nulo.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 190 — salvamento legado direto no storage mock

- **Código:** `            }`
- **O que faz:** Fecha uma construção sintática do salvamento legado direto no storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 191 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 192 — salvamento legado direto no storage mock

- **Código:** `            await storageMock.set(toSet);`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 193 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 194 — salvamento legado direto no storage mock

- **Código:** `            // Nenhuma chave gtc_* deve existir`
- **O que faz:** Comentário do salvamento legado direto no storage mock; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 195 — salvamento legado direto no storage mock

- **Código:** `            const data = await storageMock.get(null);`
- **O que faz:** Lê todo o storage mock para checar ausência de chaves.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 196 — salvamento legado direto no storage mock

- **Código:** `            const gtcKeys = Object.keys(data).filter(k => k.startsWith('gtc_'));`
- **O que faz:** Filtra as chaves do mock pelo prefixo legado `gtc_`.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 197 — salvamento legado direto no storage mock

- **Código:** `            expect(gtcKeys).toHaveLength(0);`
- **O que faz:** Assertion Jest direta sobre a contagem/lista de chaves `gtc_` do storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 198 — salvamento legado direto no storage mock

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do salvamento legado direto no storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 199 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 200 — salvamento legado direto no storage mock

- **Código:** `        test('múltiplas traduções criam múltiplas entries no GTC', async () => {`
- **O que faz:** Declara um caso Jest do salvamento legado direto no storage mock; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 201 — salvamento legado direto no storage mock

- **Código:** `            await storageMock.set({ [\`gtc_${HASH_PAGE1}\`]: 'data:base64:T1' });`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 202 — salvamento legado direto no storage mock

- **Código:** `            await storageMock.set({ [\`gtc_${HASH_PAGE2}\`]: 'data:base64:T2' });`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 203 — salvamento legado direto no storage mock

- **Código:** `            await storageMock.set({ [\`gtc_${HASH_PAGE3}\`]: 'data:base64:T3' });`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 204 — salvamento legado direto no storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de salvamento legado direto no storage mock; não produz efeito em runtime.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 205 — salvamento legado direto no storage mock

- **Código:** `            const data = await storageMock.get(null);`
- **O que faz:** Obtém snapshot completo do storage mock depois das três gravações.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 206 — salvamento legado direto no storage mock

- **Código:** `            const gtcKeys = Object.keys(data).filter(k => k.startsWith('gtc_'));`
- **O que faz:** Seleciona somente chaves com prefixo legado para contagem.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 207 — salvamento legado direto no storage mock

- **Código:** `            expect(gtcKeys).toHaveLength(3);`
- **O que faz:** Assertion Jest direta sobre a contagem/lista de chaves `gtc_` do storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 208 — salvamento legado direto no storage mock

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do salvamento legado direto no storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 209 — salvamento legado direto no storage mock

- **Código:** `    });`
- **O que faz:** Fecha uma construção sintática do salvamento legado direto no storage mock.
- **Como:** Escreve/lê `storageMock` diretamente e usa lógica local; não despacha `UPDATE_IMAGE` e não chama `GTC_SAVE`.
- **Por que / risco de alternativa:** A escrita direta é adequada para testar o mock/forma da chave legado, porém não comprova que `UPDATE_IMAGE` real persiste corretamente; existe teste real separado para isso.
- **Evidência:** ✅ ASSERTION DIRETA sobre gravação/leitura do storage mock; ⚠️ SEM EXECUÇÃO do handler `UPDATE_IMAGE`/`GTC_SAVE` real.

### Linha 210 — batch get do storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de batch get do storage mock; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 211 — batch get do storage mock

- **Código:** `    describe('Batch get vs N gets individuais (eficiência)', () => {`
- **O que faz:** Abre o agrupamento Jest do batch get do storage mock, organizando os casos sem mudar a lógica de produção.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 212 — batch get do storage mock

- **Código:** `        test('um único get com N chaves retorna os mesmos dados que N gets individuais', async () => {`
- **O que faz:** Declara um caso Jest do batch get do storage mock; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 213 — batch get do storage mock

- **Código:** `            await storageMock.set({`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 214 — batch get do storage mock

- **Código:** `                [\`gtc_${HASH_PAGE1}\`]: 'data:T1',`
- **O que faz:** Linha estrutural do batch get do storage mock: `[\`gtc_${HASH_PAGE1}\`]: 'data:T1',`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 215 — batch get do storage mock

- **Código:** `                [\`gtc_${HASH_PAGE2}\`]: 'data:T2',`
- **O que faz:** Linha estrutural do batch get do storage mock: `[\`gtc_${HASH_PAGE2}\`]: 'data:T2',`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 216 — batch get do storage mock

- **Código:** `                [\`gtc_${HASH_PAGE3}\`]: 'data:T3',`
- **O que faz:** Linha estrutural do batch get do storage mock: `[\`gtc_${HASH_PAGE3}\`]: 'data:T3',`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 217 — batch get do storage mock

- **Código:** `            });`
- **O que faz:** Fecha uma construção sintática do batch get do storage mock.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 218 — batch get do storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de batch get do storage mock; não produz efeito em runtime.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 219 — batch get do storage mock

- **Código:** `            // Batch get (uma chamada)`
- **O que faz:** Comentário do batch get do storage mock; descreve intenção do cenário, sem constituir execução/prova por si só.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 220 — batch get do storage mock

- **Código:** `            const batchResult = await new Promise(r =>`
- **O que faz:** Inicia uma Promise que converte a API callback do mock em valor aguardável.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 221 — batch get do storage mock

- **Código:** `                storageMock.get([`
- **O que faz:** Chama `storageMock.get` uma única vez com um array de três chaves.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 222 — batch get do storage mock

- **Código:** `                    \`gtc_${HASH_PAGE1}\`,`
- **O que faz:** Inclui a chave legada da página 1 no array da consulta em lote.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 223 — batch get do storage mock

- **Código:** `                    \`gtc_${HASH_PAGE2}\`,`
- **O que faz:** Inclui a chave legada da página 2 no array da consulta em lote.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 224 — batch get do storage mock

- **Código:** `                    \`gtc_${HASH_PAGE3}\``
- **O que faz:** Inclui a chave legada da página 3 no array da consulta em lote.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 225 — batch get do storage mock

- **Código:** `                ], r)`
- **O que faz:** Fecha o array de chaves passado ao único `get`.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 226 — batch get do storage mock

- **Código:** `            );`
- **O que faz:** Fecha a chamada/Promise da consulta em lote.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 227 — batch get do storage mock

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de batch get do storage mock; não produz efeito em runtime.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 228 — batch get do storage mock

- **Código:** `            expect(batchResult[\`gtc_${HASH_PAGE1}\`]).toBe('data:T1');`
- **O que faz:** Assertion Jest direta sobre o valor devolvido pelo `storageMock.get` em lote.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 229 — batch get do storage mock

- **Código:** `            expect(batchResult[\`gtc_${HASH_PAGE2}\`]).toBe('data:T2');`
- **O que faz:** Assertion Jest direta sobre o valor devolvido pelo `storageMock.get` em lote.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 230 — batch get do storage mock

- **Código:** `            expect(batchResult[\`gtc_${HASH_PAGE3}\`]).toBe('data:T3');`
- **O que faz:** Assertion Jest direta sobre o valor devolvido pelo `storageMock.get` em lote.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 231 — batch get do storage mock

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do batch get do storage mock.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 232 — batch get do storage mock

- **Código:** `    });`
- **O que faz:** Fecha uma construção sintática do batch get do storage mock.
- **Como:** Exercita diretamente a API callback/promessa do `ChromeStorageMock`, confirmando que um array de chaves pode ser buscado numa única chamada.
- **Por que / risco de alternativa:** Batch get testa eficiência sem N chamadas no nível do mock, mas não mede tempo nem conta spy de chamadas; o título deve ser entendido como equivalência funcional da leitura.
- **Evidência:** ✅ ASSERTION DIRETA sobre o `storageMock.get` em lote; não é benchmark nem prova do IndexedDB real.

### Linha 233 — hashes nulos na simulação

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de hashes nulos na simulação; não produz efeito em runtime.
- **Como:** Não há operação em runtime.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Linha 234 — hashes nulos na simulação

- **Código:** `    describe('Hashes nulos ou imagens inválidas', () => {`
- **O que faz:** Abre o agrupamento Jest do hashes nulos na simulação, organizando os casos sem mudar a lógica de produção.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 235 — hashes nulos na simulação

- **Código:** `        test('hash null é ignorado (sem entrada no GTC)', async () => {`
- **O que faz:** Declara um caso Jest do hashes nulos na simulação; a prova resultante se limita ao código local e ao storage mock executados dentro deste arquivo.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 236 — hashes nulos na simulação

- **Código:** `            const hashes = [null, HASH_PAGE1, null];`
- **O que faz:** Cria sequência com hashes nulos nas posições 0 e 2 e um hash válido na posição 1.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 237 — hashes nulos na simulação

- **Código:** `            await storageMock.set({ [\`gtc_${HASH_PAGE1}\`]: TRANS_BASE64 });`
- **O que faz:** Pré-popula diretamente o storage mock com chaves legadas; não passa por `GTC_SAVE` nem pelo handler de produção.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 238 — hashes nulos na simulação

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de hashes nulos na simulação; não produz efeito em runtime.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 239 — hashes nulos na simulação

- **Código:** `            const { cacheHits, cacheMisses } = await simulateExtractWithGTC(`
- **O que faz:** Executa a simulação local e desestrutura seu resultado para as assertions subsequentes.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 240 — hashes nulos na simulação

- **Código:** `                storageMock,`
- **O que faz:** Linha estrutural do hashes nulos na simulação: `storageMock,`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 241 — hashes nulos na simulação

- **Código:** `                hashes`
- **O que faz:** Linha estrutural do hashes nulos na simulação: `hashes`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 242 — hashes nulos na simulação

- **Código:** `            );`
- **O que faz:** Linha estrutural do hashes nulos na simulação: `);`; conecta as operações de teste imediatamente adjacentes.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 243 — hashes nulos na simulação

- **Código:** linha vazia
- **O que faz:** Separa visualmente o bloco de hashes nulos na simulação; não produz efeito em runtime.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 244 — hashes nulos na simulação

- **Código:** `            // null hashes = cache miss`
- **O que faz:** Comentário explicita o contrato da simulação: hash nulo é tratado como miss.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 245 — hashes nulos na simulação

- **Código:** `            expect(cacheMisses.map(m => m.index)).toContain(0);`
- **O que faz:** Assertion Jest direta sobre o vetor de misses produzido pela simulação local.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 246 — hashes nulos na simulação

- **Código:** `            expect(cacheMisses.map(m => m.index)).toContain(2);`
- **O que faz:** Assertion Jest direta sobre o vetor de misses produzido pela simulação local.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 247 — hashes nulos na simulação

- **Código:** `            expect(cacheHits.map(h => h.index)).toContain(1);`
- **O que faz:** Assertion Jest direta sobre o vetor de hits produzido pela simulação local.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 248 — hashes nulos na simulação

- **Código:** `        });`
- **O que faz:** Fecha uma construção sintática do hashes nulos na simulação.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 249 — hashes nulos na simulação

- **Código:** `    });`
- **O que faz:** Fecha uma construção sintática do hashes nulos na simulação.
- **Como:** Usa a própria função simulada para classificar valores nulos como misses e o único hash válido como hit.
- **Por que / risco de alternativa:** Tratar hash nulo como miss é conservador na simulação; a implementação real deve ser validada pelos testes que carregam `content_manga.js`.
- **Evidência:** ✅ ASSERTION DIRETA sobre a classificação feita por `simulateExtractWithGTC`; produção não executada.

### Linha 250 — hashes nulos na simulação

- **Código:** `});`
- **O que faz:** Fecha uma construção sintática do hashes nulos na simulação.
- **Como:** Executa dentro do processo Jest e do ambiente de mocks configurado pelo projeto.
- **Por que / risco de alternativa:** A estrutura mantém o teste legível, mas sua interpretação deve permanecer limitada ao que é realmente executado.
- **Evidência:** 🟨 EXECUTADO no carregamento/estrutura da suíte; sem assertion específica isolada.

### Posição 251 — newline final

- **Código:** newline terminal após a linha 250.
- **O que faz:** encerra o arquivo textual de forma canônica; não executa lógica Jest.
- **Como:** o blob auditado termina em `\n`.
- **Por que:** evita diffs artificiais e preserva convenção textual do repositório.
- **Evidência:** 🟦 INTEGRIDADE DOCUMENTAL confirmada no blob auditado.

## 9. Conclusão documental

O SHA `e6eb5c744499fcaa0309a187a173841c185bbaea` contém 250 linhas textuais mais newline final e foi coberto integralmente. A suíte oferece prova direta de uma **simulação de cache legado sobre o mock**, não de integração end-to-end do GTC real. A Bíblia preserva essa distinção e registra as lacunas sem modificar testes, produção, mocks ou qualquer arquivo externo ao ownership do AGENTE 9.

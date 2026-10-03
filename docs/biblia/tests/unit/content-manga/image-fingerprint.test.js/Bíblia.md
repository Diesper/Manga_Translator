# Bíblia técnica — tests/unit/content-manga/image-fingerprint.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `e4e553c7702701fd17a1d1f3ed2e429ad23934fd`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte Jest histórica com implementação espelho de fingerprint  
> **Linhas textuais:** **173**  
> **Posições documentais:** **174**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

A suíte pretende proteger `generateImageFingerprint()` e a ideia histórica de um SHA-256 derivado de dimensões, URL limpa e thumbnail 8×8. Porém o arquivo define sua própria implementação espelho e não executa `content_manga.js`, `cm-gtc-client.js` nem `gtc-fingerprint.js` reais.

A produção atual evoluiu para fingerprint visual-v1/v2/v3/v4 e retorna um **objeto**, não um hash string. O espelho deste teste está portanto funcionalmente desatualizado.

## 2. Produção atual

### `extension/content/content_manga.js`

SHA lido `a8b3698019f6f22027f09f544f15c0563a9f6515`. O `generateImageFingerprint` real tenta:
- Canvas 8×8 para `pixelSample`;
- Canvas 9×8 para dHash;
- Canvas 32×32 para wHash/pHash;
- center-crop 32×32 para wHashCrop/pHashCrop;
- Canvas 48×48 para regional hashes;
- fallback por `CALCULATE_VISUAL_FINGERPRINT` no Service Worker quando CORS bloqueia;
- `createFingerprintFromDescriptor` do shared GTC para o SHA-256;
- retorno `{sha256,dHash,wHash,pHash,wHashCrop,pHashCrop,regionalHashes,fingerprintVersion}`.

### `extension/content/cm-gtc-client.js`

SHA lido `95d062f41b9f1bd789a576c3a5c5d903b705fa55`. Possui fluxo equivalente para fingerprint/cache GTC.

### `extension/shared/gtc-fingerprint.js`

SHA lido `fa014028d5e2ec9d9ca5d05c1199e1f6c45a2198`. Centraliza criação do descritor/hash e hashes perceptuais. `tests/unit/gtc/fingerprint.test.js` importa este módulo real e testa SHA-256, dHash, wHash, pHash, regionais e matching.

## 3. Drift entre #208 e produção

| Tema | Espelho #208 | Produção atual |
|---|---|---|
| Retorno | string SHA-256 | objeto visual-v1..v4 |
| SHA | Node `createHash` síncrono | shared API / WebCrypto/fallback |
| Canvas | objeto fake, `drawImage` no-op | canvases reais 8×8/9×8/32×32/48×48 |
| dHash | ausente | presente |
| wHash/pHash | ausentes | presentes |
| crop hashes | ausentes | presentes |
| regionais | ausentes | presentes |
| CORS | substitui pixels por `nopixels` localmente | chama Service Worker |
| URL clean | mirror v3.2 antigo | canonicalização atual de `cm-dom-replace.js` |
| versão | não existe | `visual-v1`..`visual-v4` |

## 4. Fluxo da suíte

1. Importa `createHash` do Node.
2. Define `getCleanUrl` mirror com base fixa `testmanga.com`.
3. Define `generateImageFingerprint` mirror.
4. O mock de canvas não usa o `imgEl` visualmente; `drawImage` é no-op e os pixels default são sempre 256 zeros.
5. O hash local combina `dims:cleanUrl:pixelSample`.
6. Testa formato/determinismo, sensibilidade a URL/dimensões, token invariance, CORS local, entradas problemáticas e tempo de 20 hashes.

## 5. Qualidade das assertions

### Cobertura válida do mirror

Formato SHA-256, determinismo, diferença por URL/dimensões e invariância a token são assertions diretas sobre a função local.

### CORS: claim não verificado

O caso linhas 123–132 comenta que o hash com pixels e sem pixels deve ser diferente, mas só verifica que ambos têm formato hexadecimal. Não há `expect(hashWithPixels).not.toBe(hashWithoutPixels)`.

### ‘Sem throw’ com matcher inadequado

Linha 147 usa `await expect(generateImageFingerprint(img)).resolves.not.toThrow()`. Após resolução, o valor é hash/null e não uma função; `toThrow` é semanticamente um matcher para funções. Mesmo sem executar a suíte nesta auditoria, a assertion não é uma prova apropriada de “Promise não rejeita”.

### Benchmark não representa produção

O teste de `<500ms` mede 20 chamadas de `createHash` sobre pixels artificiais, sem Canvas real, sem WebCrypto real, sem hashes perceptuais e sem fallback IPC. Não sustenta a meta de desempenho do pipeline atual.

## 6. Evidência automatizada

| Propriedade | Evidência | Classificação |
|---|---|---|
| Mirror retorna 64 hex | linhas 73–77 | ✅ PROVADO DIRETAMENTE para o mirror |
| Mirror é determinístico | linhas 79–84 | ✅ PROVADO DIRETAMENTE para o mirror |
| URL/dimensões alteram mirror | linhas 87–102 | ✅ PROVADO DIRETAMENTE para o mirror |
| Tokens não alteram mirror | linhas 104–111 | ✅ PROVADO DIRETAMENTE para o mirror |
| CORS local ainda gera hash | linhas 114–121 | ✅ PROVADO DIRETAMENTE para o mirror |
| CORS produz hash diferente | comentário, sem inequality assertion | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Produção gera dHash/wHash/pHash/regionais | `tests/unit/gtc/fingerprint.test.js` testa shared real | ✅ PROVADO DIRETAMENTE por teste externo |
| Produção delega CORS ao Service Worker | action/background reais possuem testes focais | ✅ PROVADO DIRETAMENTE por testes externos |
| Produção retorna objeto com fingerprintVersion | código real; #208 não importa a função | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| Performance real <500ms | benchmark é mirror simplificado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Invariantes atuais

1. SHA-256 deve permanecer determinístico para o mesmo descritor.
2. O fallback sem pixels precisa continuar identificando imagem por dimensões+URL canônica.
3. CORS deve tentar recuperação via Service Worker antes de degradar para url-based.
4. Hashes perceptuais devem coexistir com SHA primário e definir a versão do fingerprint.
5. A chave de URL usada no descritor deve seguir a canonicalização real atual.

## 8. Solicitações ao auditor

### 208-001 — TEST_CORRECTION — OPEN

**Encontrado:** a suíte testa um fingerprint v3.2 espelho que retorna string e não representa o pipeline visual-v4 atual.

**Necessário:** migrar os casos para uma API real/exportável ou testar via content script real, verificando o objeto completo, versões e fallback CORS.

**Risco:** regressões em dHash/wHash/pHash/crop/regionais/IPC não afetam esta suíte.

**Severidade:** HIGH.

### 208-002 — TEST_ASSERTION_QUALITY — OPEN

**Encontrado:** o teste que diz que fallback CORS gera hash diferente não compara os hashes; o caso de src vazio usa `resolves.not.toThrow()` sobre valor não-função.

**Necessário:** usar inequality explícita quando esse for o contrato e usar matcher apropriado para Promise que não rejeita.

**Risco:** propriedades descritas podem não ser realmente verificadas.

**Severidade:** NORMAL.

### 208-003 — PERFORMANCE_TEST_VALIDITY — OPEN

**Encontrado:** o benchmark de 20 imagens mede somente mirror+`createHash` do Node e pixels sintéticos, sem custos do pipeline real.

**Necessário:** remover claim de performance real ou criar benchmark representativo fora de suíte unitária frágil, com critérios/environment controlados.

**Risco:** falso sinal de desempenho e flakiness por wall-clock.

**Severidade:** NORMAL.

### 208-004 — TEST_CORRECTION — OPEN

**Encontrado:** o `getCleanUrl` local usado no fingerprint repete o mirror antigo já divergente documentado no #205.

**Necessário:** usar a canonicalização real/compartilhada para que fingerprint e restore sejam testados contra a mesma política.

**Risco:** testes de invariância por token podem proteger uma chave diferente da produção.

**Severidade:** HIGH.

## 9. Fonte integral exata

```js
/**
 * image-fingerprint.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes de generateImageFingerprint() — v3.2.
 *
 * CONTEXTO: Esta função cria uma assinatura digital de 3 camadas (~1ms):
 * 1. Dimensões (NxM) — distingue tamanhos
 * 2. Clean URL — distingue páginas do mesmo CDN sem tokens
 * 3. Thumbnail 8×8 — captura conteúdo visual sem CORS-blocking
 *
 * Por que não hashear o Base64 completo (toDataURL)?
 * toDataURL: 100-500ms por imagem × 20 imagens = 2-10s de freeze.
 * Thumbnail 8×8: ~0.5-2ms por imagem × 20 = ~10-40ms total.
 *
 * CORREÇÃO v3.2 (test environment):
 * A versão original usava `crypto.subtle.digest('SHA-256', ...)` (Web Crypto API).
 * Em Jest+Node, `globalThis.crypto.subtle` pode não estar disponível dependendo
 * da versão do Node e do jest-environment-jsdom. Resultado: a função caía no
 * catch externo e retornava `null`, fazendo TODOS os testes de hash falharem.
 *
 * Solução: usar o módulo nativo `crypto` do Node.js (`createHash('sha256')`),
 * que é 100% disponível em qualquer versão Node ≥ 10. O hash produzido é
 * idêntico (SHA-256, 64 hex chars), apenas síncrono em vez de async.
 * A função espelho permanece async para compatibilidade com o código de produção.
 */

// CORREÇÃO: require do módulo nativo Node.js em vez de crypto.subtle
const { createHash } = require('crypto');

describe('CM-09/CM-10/CM-11/CM-12/CM-13: generateImageFingerprint() — Fingerprint de Imagem em ~1ms (v3.2)', () => {

    // ── Implementação espelho ─────────────────────────────────────────────────
    function getCleanUrl(urlStr) {
        if (!urlStr || urlStr.startsWith('data:')) return null;
        try {
            const u = new URL(urlStr, 'https://testmanga.com');
            return u.origin + u.pathname;
        } catch(e) {
            return urlStr.split('?')[0].split('#')[0];
        }
    }

    async function generateImageFingerprint(imgEl, canvasGetterOverride = null) {
        try {
            const cleanUrl = getCleanUrl(imgEl.src) || '';
            const dims = `${imgEl.naturalWidth || 0}:${imgEl.naturalHeight || 0}`;
            let pixelSample = 'nopixels';

            try {
                const sc = { width: 0, height: 0, getContext: () => ({
                    drawImage: () => {},
                    getImageData: canvasGetterOverride || (() => ({ data: new Uint8Array(256) }))
                })};
                const imageData = sc.getContext('2d').getImageData(0, 0, 8, 8);
                pixelSample = Array.from(imageData.data)
                    .map(b => b.toString(16).padStart(2,'0')).join('');
            } catch(corsErr) {
                pixelSample = 'nopixels';
            }

            const combined = `${dims}:${cleanUrl}:${pixelSample}`;
            // CORREÇÃO: usa Node.js createHash em vez de crypto.subtle.digest
            // crypto.subtle não é garantido no ambiente Jest/JSDOM dependendo da
            // versão do Node. createHash é nativo do Node e sempre disponível.
            return createHash('sha256').update(combined).digest('hex');
        } catch(e) { return null; }
    }

    function makeImgMock({ src = 'https://cdn.site.com/pag1.jpg', width = 800, height = 1200 } = {}) {
        return { src, naturalWidth: width, naturalHeight: height };
    }

    describe('Formato do hash retornado', () => {
        test('retorna string hexadecimal de 64 caracteres (SHA-256)', async () => {
            const hash = await generateImageFingerprint(makeImgMock());
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        test('retorna string determinística para a mesma entrada', async () => {
            const img = makeImgMock();
            const hash1 = await generateImageFingerprint(img);
            const hash2 = await generateImageFingerprint(img);
            expect(hash1).toBe(hash2);
        });
    });

    describe('Sensibilidade às 3 camadas', () => {
        test('imagens com URLs diferentes têm fingerprints diferentes', async () => {
            const img1 = makeImgMock({ src: 'https://cdn.site.com/pag1.jpg' });
            const img2 = makeImgMock({ src: 'https://cdn.site.com/pag2.jpg' });
            const h1 = await generateImageFingerprint(img1);
            const h2 = await generateImageFingerprint(img2);
            expect(h1).not.toBe(h2);
        });

        test('imagens com dimensões diferentes têm fingerprints diferentes', async () => {
            const img1 = makeImgMock({ width: 800, height: 1200 });
            const img2 = makeImgMock({ width: 800, height: 1100 });
            const h1 = await generateImageFingerprint(img1);
            const h2 = await generateImageFingerprint(img2);
            expect(h1).not.toBe(h2);
        });

        test('tokens diferentes na URL NÃO mudam o fingerprint (clean URL invariante)', async () => {
            const img1 = makeImgMock({ src: 'https://cdn.site.com/pag1.jpg?token=ABC&expires=111' });
            const img2 = makeImgMock({ src: 'https://cdn.site.com/pag1.jpg?token=XYZ&expires=999' });
            const h1 = await generateImageFingerprint(img1);
            const h2 = await generateImageFingerprint(img2);
            // Mesma URL limpa + mesmas dimensões + mesmo conteúdo = mesmo fingerprint
            expect(h1).toBe(h2);
        });
    });

    describe('Fallback quando CORS bloqueia getImageData', () => {
        test('com CORS bloqueado (getImageData lança), retorna hash não-null', async () => {
            const corsBlockingOverride = () => { throw new Error('SecurityError'); };
            const img = makeImgMock();
            const hash = await generateImageFingerprint(img, corsBlockingOverride);
            // Hash deve usar 'nopixels' como fallback — ainda válido
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        test('fallback CORS produz hash diferente do hash com pixels', async () => {
            const img = makeImgMock();
            const hashWithPixels = await generateImageFingerprint(img);
            const corsBlockingOverride = () => { throw new Error('SecurityError'); };
            const hashWithoutPixels = await generateImageFingerprint(img, corsBlockingOverride);
            // Hashes diferentes (pixel sample difere)
            // Mas ambos são válidos — o sistema funciona em ambos os casos
            expect(hashWithPixels).toMatch(/^[0-9a-f]{64}$/);
            expect(hashWithoutPixels).toMatch(/^[0-9a-f]{64}$/);
        });
    });

    describe('Entradas com problemas', () => {
        test('imagem sem naturalWidth/Height (não carregada) não quebra', async () => {
            const img = makeImgMock({ width: 0, height: 0 });
            const hash = await generateImageFingerprint(img);
            // Pode retornar hash ou null, mas não deve lançar exceção
            if (hash !== null) {
                expect(hash).toMatch(/^[0-9a-f]{64}$/);
            }
        });

        test('imagem com src vazio retorna hash ou null (sem throw)', async () => {
            const img = makeImgMock({ src: '' });
            await expect(generateImageFingerprint(img)).resolves.not.toThrow();
        });

        test('imagem com data:URL usa apenas dimensões (getCleanUrl retorna null)', async () => {
            const img = makeImgMock({ src: 'data:image/png;base64,iVBOR==' });
            const hash = await generateImageFingerprint(img);
            // getCleanUrl retorna null → combined usa '' no lugar da URL
            // Ainda deve gerar hash válido
            if (hash !== null) {
                expect(hash).toMatch(/^[0-9a-f]{64}$/);
            }
        });
    });

    describe('Performance expectation (estrutural)', () => {
        test('fingerprinting de 20 imagens em paralelo completa em < 500ms', async () => {
            const images = Array.from({ length: 20 }, (_, i) =>
                makeImgMock({ src: `https://cdn.site.com/pag${i+1}.jpg`, width: 800, height: 1200 })
            );
            const start = Date.now();
            await Promise.all(images.map(img => generateImageFingerprint(img)));
            const elapsed = Date.now() - start;
            // 500ms é muito conservador — em prática deve ser < 50ms
            expect(elapsed).toBeLessThan(500);
        });
    });
});
```

## 10. Cobertura documental por linha/posição

Cobertura contígua de **1–174**; 174 representa o newline terminal.

### Posições 1–25 — cabeçalho
Descreve modelo v3.2 de três camadas e justificativa de `createHash` Node. Esse modelo não corresponde mais ao pipeline visual-v4. **Evidência:** 🟦 GATE ESTÁTICO para o texto.

### Posições 26–29 — import Node
Importa `createHash`, dependência inexistente no content script de produção. **Evidência:** 🟨 setup do mirror.

### Posições 30–41 — suíte e clean URL mirror
Abre a suíte e define canonicalização histórica local. **Evidência:** ✅ exercitada indiretamente pelo mirror; ⚠️ não produção.

### Posições 42–67 — fingerprint mirror
Cria pixels artificiais, fallback `nopixels`, concatena descritor e usa Node SHA-256. **Evidência:** ✅ função local testada; ⚠️ diverge do algoritmo atual.

### Posições 68–72 — factory de imagem
Cria objetos simples com src/dimensões; não são elementos DOM/canvas reais. **Evidência:** 🟨 fixture.

### Posições 73–85 — formato e determinismo
Exigem 64 hex e igualdade para mesma entrada. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posições 86–113 — sensibilidade
URL e dimensão distintas produzem hashes distintos; tokens diferentes no mesmo path convergem. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posições 114–133 — fallback CORS
Primeiro caso prova formato válido após exceção. Segundo cria dois hashes mas não compara desigualdade, apesar do comentário. **Evidência:** ✅ formato; ⚠️ diferença não provada.

### Posições 134–159 — entradas problemáticas
0×0 e data URL aceitam hash/null. Src vazio usa matcher semanticamente inadequado para não-throw assíncrono. **Evidência:** parcial.

### Posições 160–172 — performance
Mede 20 mirrors em paralelo e exige <500ms. **Evidência:** ✅ tempo do mirror no ambiente de execução; ⚠️ não performance da produção.

### Posição 173 — fechamento
Fecha a suíte. **Evidência:** 🟨 estrutural.

### Posição 174 — newline final
Terminador textual. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- SHA reconfirmado.
- Fonte integral embutida exatamente.
- **174/174 posições** cobertas: 1–25, 26–29, 30–41, 42–67, 68–72, 73–85, 86–113, 114–133, 134–159, 160–172, 173, 174.
- Mirror histórico separado de provas reais externas.
- Nenhuma execução de suíte foi alegada.
- Nenhum arquivo externo foi alterado.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com quatro solicitações abertas.

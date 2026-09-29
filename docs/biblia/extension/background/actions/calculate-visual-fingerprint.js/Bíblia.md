# Bíblia técnica — `extension/background/actions/calculate-visual-fingerprint.js`

> **Estado:** ✅ REAUDITADO E APROVÁVEL.  
> **SHA auditado:** `ea474845cf9c6a6784e3ceb75298f0ac8df86e06`  
> **Tipo:** action assíncrona do service worker MV3.  
> **Linhas textuais:** **129**.  
> **Posições documentais:** **130** incluindo newline final.  
> **Teste direto principal:** `tests/unit/background/calculate-visual-fingerprint-action.test.js` — `f51a0b629ac17be3eda349333192b9480494a07e`.

## 1. Papel arquitetural

Esta action é o fallback privilegiado de fingerprint visual quando o leitor não consegue ler pixels localmente — tipicamente por CORS/tainted canvas. O cliente em `extension/content/cm-gtc-client.js` primeiro tenta canvas no content script; se isso falha e a imagem possui URL remota HTTP(S), envia `CALCULATE_VISUAL_FINGERPRINT`. O router converte esse alias para `calculate-visual-fingerprint`.

A action faz apenas **fetch/decode/resample/hash/retorno**. Matching perceptual e persistência no GTC ficam em outros módulos.

## 2. Fluxo e contratos

1. Rejeita URL não HTTP(S) antes da rede.
2. Faz fetch com `credentials:'omit'` e `cache:'no-store'`.
3. Decodifica para ImageBitmap.
4. Produz:
   - pixelSample 8×8 RGBA → 512 hex;
   - dHash em 9×8, se disponível;
   - wHash/pHash em 32×32, se disponíveis;
   - wHashCrop/pHashCrop em center-crop quadrado para imagem retangular;
   - regionalHashes em 48×48, se disponível.
5. Fecha ImageBitmap.
6. Loga capacidades produzidas.
7. Retorna os campos para o caller.
8. Em falha operacional, loga e retorna erro; finally garante cleanup.

## 3. Consumidores e dependências

- **Router:** `CALCULATE_VISUAL_FINGERPRINT → calculate-visual-fingerprint`.
- **Fallback principal:** `extension/content/cm-gtc-client.js`, que usa a resposta para montar fingerprintVersion e consultas strict/crop/relaxed.
- **Pipeline legado/maior:** `extension/content/content_manga.js` contém lógica equivalente de fallback para SW.
- **API de hash:** `self.MangaTranslatorGtcFingerprint`, fornecida por `shared/gtc-fingerprint.js`.
- **APIs Web:** `fetch`, `URL`, `createImageBitmap`, `OffscreenCanvas`.

## 4. Trust boundary, segurança e privacidade

### URL privilegiada
A action aceita qualquer URL HTTP(S) e `allowedSources:['any']`. Isso significa que qualquer contexto da extensão que chegue ao router pode pedir ao SW um fetch dentro das permissões da extensão.

A allowlist de protocolo reduz muito a superfície, e `credentials:'omit'` impede envio de cookies HTTP. Porém não existe allowlist de hostname, bloqueio de IP privado, limite de tamanho, timeout/AbortController ou limite de dimensões antes de `createImageBitmap`.

**Risco residual:** uma origem comprometida da extensão pode usar a action para forçar fetch de recursos HTTP(S) alcançáveis pelo SW e observar sucesso/erro/latência/fingerprint, embora não receba os bytes crus.

### Logs
A action não loga pixels nem hashes completos, mas loga `url.slice(0,80)`. Truncar não é sanitizar: query strings/tokens curtos podem aparecer nos primeiros 80 caracteres.

### Memória/DoS
O Blob e ImageBitmap representam a imagem completa antes do downscale. Uma imagem enorme ou resposta lenta pode consumir memória/tempo; não há content-length guard nem abort timeout.

## 5. Matriz de evidência

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `tests/unit/background/calculate-visual-fingerprint-action.test.js` | ✅ PROVADO DIRETAMENTE | Carrega router + action reais. Prova resposta v4, fetch options, pixelSample 512 hex, d/w/p/crop/regional, geometria center-crop, close em sucesso, rejeição data/chrome-extension sem fetch e close+log em falha de hash. |
| `tests/unit/background/test_bg59.test.js` — `ae96b142717418e4071fd160b6c521412da03090` | ✅ PROVADO DIRETAMENTE EM BACKGROUND COMPLETO | Carrega `background.js` real e despacha `CALCULATE_VISUAL_FINGERPRINT`; prova hashes/crop/fetch e close atravessando o listener principal. |
| `tests/unit/background/message-handlers-real.test.js` — `1c2815cd1f2fecba58a07c568f24d69af0367af3` | ✅ PROVADO DIRETAMENTE EM FLUXO INTEGRADO | Exercita o handler real no background e resposta de hashes; complementa o teste focal. |
| `tests/unit/content-manga/extract-flow-real.test.js` | 🟨 PROVA DO CONSUMIDOR, NÃO DA ACTION | Mocka a resposta do fingerprint do SW e prova que hashes de crop alimentam lookup visual-v4 e evitam START_BATCH quando há cache hit. |
| `tests/visual/background-fingerprint.visual.js` | ⚠️ SIMULAÇÃO COMPLEMENTAR | Reimplementa `simulateCalculateVisualFingerprint`; prova propriedades dos algoritmos/helpers e integração perceptual, mas **não importa nem executa esta action**. |

## 6. Lacunas de teste

### URL realmente malformada
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para o catch de `new URL(url)`. Data/chrome-extension são URLs sintaticamente válidas e cobrem somente a allowlist de protocolo.

### HTTP não-2xx
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `!resp.ok` e mensagem `HTTP <status>...`.

### Falhas de blob/decode/canvas
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `resp.blob()`, `createImageBitmap()`, `getContext(null)`, `getImageData` ou `drawImage` falhando.

### API parcial/ausente
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para fpApi ausente, somente dHash, somente wHash, somente pHash, sem regional hashes.

### Imagem quadrada/zero-dimension
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** provando que crop permanece null para imagem quadrada ou dimensões inválidas.

### Rede/tamanho/memória
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** e sem guarda funcional para timeout, response muito grande ou bitmap gigante.

### Privacidade do log
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** garantindo que query/token sensível não apareça em `url.slice(0,80)`.

### close() excepcional
⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para um `bitmap.close()` que lança. No sucesso, se o primeiro close lançar antes de `bitmap=null`, o finally tentará close novamente e a exceção do finally pode substituir a resposta.

## 7. Análise crítica

1. **Observabilidade desatualizada:** o log diz “Fingerprint visual-v3” embora a resposta já inclua center-crop visual-v4.
2. **Fetch sem timeout/size guard:** risco de uso excessivo de memória/tempo em SW.
3. **allowedSources:any + HTTP(S) arbitrário:** adequado ao fallback cross-origin, mas amplia superfície de rede; credentials omit reduz, não elimina, risco.
4. **URL truncada não é redaction:** 80 chars podem conter segredo em query.
5. **Feature detection é boa degradação:** hashes ausentes viram null sem quebrar pixelSample, mas esses caminhos estão pouco testados.
6. **Cleanup é robusto no caso testado:** sucesso zera bitmap para evitar double-close; falha após decode fecha no finally.

## 8. Invariantes

1. URL não HTTP(S) deve falhar antes de fetch.
2. Fetch deve continuar sem credenciais.
3. pixelSample deve continuar 8×8 RGBA serializado com padding.
4. dHash deve continuar usar 9×8.
5. wHash/pHash principais devem compartilhar o mesmo 32×32.
6. Center-crop só deve existir para dimensão válida e não quadrada.
7. Crop deve permanecer central e quadrado.
8. Regional hashes devem usar a resolução esperada pelo helper.
9. Capability ausente deve degradar para null, não derrubar outros hashes.
10. O shape de resposta deve preservar nomes usados por cm-gtc-client/cache.
11. ImageBitmap deve ser fechado em sucesso e em falha pós-decode.
12. Não logar pixelSample, hashes completos, Blob ou Base64.
13. Simulações visuais não podem ser promovidas a prova direta desta action.
14. Mudanças de hostname policy/timeout/tamanho precisam ser tratadas como decisão de segurança explícita.

## 9. Fonte integral

~~~javascript
'use strict';
// background/actions/calculate-visual-fingerprint.js -- Computes visual-v3/v4 fingerprints in the service worker.

(function(scope) {
  scope.MangaTranslatorRouter.registerAction({
    name: 'calculate-visual-fingerprint',

    meta: {
      // Compatibility contract: this action remains available to every extension context.
      allowedSources: ['any'],
    },

    async execute(request, context) {
      let bitmap = null;
      try {
        const { url } = request;
        let parsedUrl;
        try {
          parsedUrl = new URL(url);
        } catch (_error) {
          return { ok: false, error: 'URL inválida para fingerprint visual' };
        }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return { ok: false, error: 'URL inválida para fingerprint visual' };
        }

        const resp = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar imagem`);
        const blob = await resp.blob();
        bitmap = await createImageBitmap(blob);
        const fpApi = scope.MangaTranslatorGtcFingerprint || null;

        const oc8 = new OffscreenCanvas(8, 8);
        const ctx8 = oc8.getContext('2d');
        ctx8.drawImage(bitmap, 0, 0, 8, 8);
        const id8 = ctx8.getImageData(0, 0, 8, 8);
        const pixelSample = Array.from(id8.data)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');

        let dHash = null;
        if (fpApi && typeof fpApi.calculateDHash === 'function') {
          const oc9 = new OffscreenCanvas(9, 8);
          const ctx9 = oc9.getContext('2d');
          ctx9.drawImage(bitmap, 0, 0, 9, 8);
          const id9 = ctx9.getImageData(0, 0, 9, 8);
          dHash = fpApi.calculateDHash(id9.data);
        }

        let wHash = null;
        let pHash = null;
        let wHashCrop = null;
        let pHashCrop = null;
        if (fpApi && (typeof fpApi.calculateWHash === 'function' || typeof fpApi.calculatePHash === 'function')) {
          const oc32 = new OffscreenCanvas(32, 32);
          const ctx32 = oc32.getContext('2d');
          ctx32.drawImage(bitmap, 0, 0, 32, 32);
          const id32 = ctx32.getImageData(0, 0, 32, 32);

          if (typeof fpApi.calculateWHash === 'function') {
            wHash = fpApi.calculateWHash(id32.data);
          }
          if (typeof fpApi.calculatePHash === 'function') {
            pHash = fpApi.calculatePHash(id32.data);
          }

          const width = bitmap.width || 0;
          const height = bitmap.height || 0;
          const side = Math.min(width, height);
          if (side > 0 && width !== height) {
            const cropX = Math.floor((width - side) / 2);
            const cropY = Math.floor((height - side) / 2);
            const ocCrop = new OffscreenCanvas(32, 32);
            const ctxCrop = ocCrop.getContext('2d');
            ctxCrop.drawImage(bitmap, cropX, cropY, side, side, 0, 0, 32, 32);
            const idCrop = ctxCrop.getImageData(0, 0, 32, 32);
            if (typeof fpApi.calculateWHash === 'function') {
              wHashCrop = fpApi.calculateWHash(idCrop.data);
            }
            if (typeof fpApi.calculatePHash === 'function') {
              pHashCrop = fpApi.calculatePHash(idCrop.data);
            }
          }
        }

        let regionalHashes = null;
        if (fpApi && typeof fpApi.calculateRegionalHashes === 'function') {
          const oc48 = new OffscreenCanvas(48, 48);
          const ctx48 = oc48.getContext('2d');
          ctx48.drawImage(bitmap, 0, 0, 48, 48);
          const id48 = ctx48.getImageData(0, 0, 48, 48);
          regionalHashes = fpApi.calculateRegionalHashes(id48.data);
        }

        bitmap.close();
        bitmap = null;

        context.log('info', 'bg', 'VISUAL_FP_OK', 'Fingerprint visual-v3 calculado via SW', {
          url: url.slice(0, 80),
          hasDHash: dHash !== null,
          hasWHash: wHash !== null,
          hasPHash: pHash !== null,
          hasCrop: wHashCrop !== null || pHashCrop !== null,
          hasRegional: regionalHashes !== null,
        });

        return {
          pixelSample,
          dHash,
          wHash,
          pHash,
          wHashCrop,
          pHashCrop,
          regionalHashes,
        };
      } catch (e) {
        context.log('warn', 'bg', 'VISUAL_FP_FAIL', `Falha no fingerprint visual-v3 via SW: ${e.message}`, {
          url: (request.url || '').slice(0, 80),
        });
        return { ok: false, error: e.message };
      } finally {
        // Calculating a hash may fail after the decoded image has been created.
        if (bitmap && typeof bitmap.close === 'function') {
          bitmap.close();
        }
      }
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## 10. Rastreabilidade de todas as posições

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode antes do registro da action. |
| 002 | U01 | // background/actions/calculate-visual-fingerprint.js -- Computes visual-v3/v4 fingerprints in the service worker. | Comentário local de U01: “background/actions/calculate-visual-fingerprint.js -- Computes visual-v3/v4 fingerprints in the service worker.”; registra intenção/compatibilidade sem executar. |
| 003 | U01 | ␠ [linha vazia] | Separador visual de U01 (Cabeçalho e intenção); não altera controle, recursos ou resposta. |
| 004 | U02 | (function(scope) { | Completa a expressão de U02 com `(function(scope) {`, fornecendo argumento/propriedade/estrutura necessária às linhas contíguas. |
| 005 | U02 |   scope.MangaTranslatorRouter.registerAction({ | Registra no router a definição de action construída pelas linhas seguintes. |
| 006 | U02 |     name: 'calculate-visual-fingerprint', | Define o nome canônico `calculate-visual-fingerprint`, alvo do alias `CALCULATE_VISUAL_FINGERPRINT` no router. |
| 007 | U02 | ␠ [linha vazia] | Separador visual de U02 (Registro no router e política de origem); não altera controle, recursos ou resposta. |
| 008 | U02 |     meta: { | Completa a expressão de U02 com `meta: {`, fornecendo argumento/propriedade/estrutura necessária às linhas contíguas. |
| 009 | U02 |       // Compatibility contract: this action remains available to every extension context. | Comentário local de U02: “Compatibility contract: this action remains available to every extension context.”; registra intenção/compatibilidade sem executar. |
| 010 | U02 |       allowedSources: ['any'], | Autoriza qualquer classificação de origem do router; a proteção desta action está na validação do URL alvo, não em sender ownership. |
| 011 | U02 |     }, | Fecha a estrutura sintática da unidade U02; nenhuma operação adicional além do limite do bloco. |
| 012 | U02 | ␠ [linha vazia] | Separador visual de U02 (Registro no router e política de origem); não altera controle, recursos ou resposta. |
| 013 | U03 |     async execute(request, context) { | Abre o executor assíncrono que realiza fetch, decode, canvas, hashes e cleanup. |
| 014 | U03 |       let bitmap = null; | Inicializa a referência do ImageBitmap como null para o finally saber se existe recurso a fechar. |
| 015 | U03 |       try { | Abre região protegida de U03; falhas seguem ao catch/finally da action. |
| 016 | U03 |         const { url } = request; | Extrai `url` do request; esse é o único dado do payload usado para rede. |
| 017 | U03 |         let parsedUrl; | Reserva a URL parseada para separar validade sintática de allowlist de protocolo. |
| 018 | U03 |         try { | Abre região protegida de U03; falhas seguem ao catch/finally da action. |
| 019 | U03 |           parsedUrl = new URL(url); | Parseia o alvo com URL(), rejeitando sintaxe inválida antes de rede. |
| 020 | U03 |         } catch (_error) { | Completa a expressão de U03 com `} catch (_error) {`, fornecendo argumento/propriedade/estrutura necessária às linhas contíguas. |
| 021 | U03 |           return { ok: false, error: 'URL inválida para fingerprint visual' }; | Retorna falha estável de validação sem executar fetch. |
| 022 | U03 |         } | Fecha a estrutura sintática da unidade U03; nenhuma operação adicional além do limite do bloco. |
| 023 | U03 |         if (!['http:', 'https:'].includes(parsedUrl.protocol)) { | Aplica allowlist estrita `http:`/`https:` ao protocolo parseado. |
| 024 | U03 |           return { ok: false, error: 'URL inválida para fingerprint visual' }; | Retorna falha estável de validação sem executar fetch. |
| 025 | U03 |         } | Fecha a estrutura sintática da unidade U03; nenhuma operação adicional além do limite do bloco. |
| 026 | U03 | ␠ [linha vazia] | Separador visual de U03 (Validação do URL alvo); não altera controle, recursos ou resposta. |
| 027 | U04 |         const resp = await fetch(url, { credentials: 'omit', cache: 'no-store' }); | Executa fetch cross-origin com `credentials:'omit'` e `cache:'no-store'`. |
| 028 | U04 |         if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar imagem`); | Transforma status HTTP não-ok em exceção com código de status para o catch comum. |
| 029 | U04 |         const blob = await resp.blob(); | Materializa o corpo HTTP como Blob para o decoder de imagem do browser. |
| 030 | U04 |         bitmap = await createImageBitmap(blob); | Decodifica o Blob em ImageBitmap e guarda a referência para cleanup determinístico. |
| 031 | U04 |         const fpApi = scope.MangaTranslatorGtcFingerprint \|\| null; | Obtém a API global de fingerprints; null permite degradar algoritmos opcionais sem impedir pixelSample. |
| 032 | U04 | ␠ [linha vazia] | Separador visual de U04 (Fetch e decodificação privilegiada); não altera controle, recursos ou resposta. |
| 033 | U05 |         const oc8 = new OffscreenCanvas(8, 8); | Cria canvas 8×8 usado exclusivamente para o pixelSample RGBA. |
| 034 | U05 |         const ctx8 = oc8.getContext('2d'); | Obtém contexto 2D do canvas da unidade U05; as operações seguintes desenham/leem pixels dessa resolução. |
| 035 | U05 |         ctx8.drawImage(bitmap, 0, 0, 8, 8); | Redimensiona/corta o bitmap no canvas da unidade U05 com os parâmetros explícitos desta linha. |
| 036 | U05 |         const id8 = ctx8.getImageData(0, 0, 8, 8); | Lê os pixels RGBA do canvas da unidade U05 para serialização ou algoritmo de hash. |
| 037 | U05 |         const pixelSample = Array.from(id8.data) | Converte o buffer 8×8 em array para serialização hexadecimal determinística. |
| 038 | U05 |           .map(byte => byte.toString(16).padStart(2, '0')) | Converte cada byte em hexadecimal com padding de 2 caracteres. |
| 039 | U05 |           .join(''); | Concatena todos os bytes hex sem separador, formando 512 caracteres no caminho normal. |
| 040 | U05 | ␠ [linha vazia] | Separador visual de U05 (pixelSample 8×8 RGBA); não altera controle, recursos ou resposta. |
| 041 | U05 |         let dHash = null; | Inicializa dHash como null para representar capability ausente sem omitir o campo. |
| 042 | U06 |         if (fpApi && typeof fpApi.calculateDHash === 'function') { | Faz feature detection de dHash antes de criar o canvas 9×8. |
| 043 | U06 |           const oc9 = new OffscreenCanvas(9, 8); | Cria canvas 9×8 exigido pelo algoritmo dHash horizontal. |
| 044 | U06 |           const ctx9 = oc9.getContext('2d'); | Obtém contexto 2D do canvas da unidade U06; as operações seguintes desenham/leem pixels dessa resolução. |
| 045 | U06 |           ctx9.drawImage(bitmap, 0, 0, 9, 8); | Redimensiona/corta o bitmap no canvas da unidade U06 com os parâmetros explícitos desta linha. |
| 046 | U06 |           const id9 = ctx9.getImageData(0, 0, 9, 8); | Lê os pixels RGBA do canvas da unidade U06 para serialização ou algoritmo de hash. |
| 047 | U06 |           dHash = fpApi.calculateDHash(id9.data); | Calcula dHash usando o buffer 9×8 preparado imediatamente acima. |
| 048 | U06 |         } | Fecha a estrutura sintática da unidade U06; nenhuma operação adicional além do limite do bloco. |
| 049 | U06 | ␠ [linha vazia] | Separador visual de U06 (dHash 9×8 opcional); não altera controle, recursos ou resposta. |
| 050 | U06 |         let wHash = null; | Inicializa wHash como null para preservar shape da resposta quando indisponível. |
| 051 | U06 |         let pHash = null; | Inicializa pHash como null para preservar shape da resposta quando indisponível. |
| 052 | U07 |         let wHashCrop = null; | Inicializa wHashCrop como null; só imagem retangular com API W produz valor. |
| 053 | U07 |         let pHashCrop = null; | Inicializa pHashCrop como null; só imagem retangular com API P produz valor. |
| 054 | U07 |         if (fpApi && (typeof fpApi.calculateWHash === 'function' \|\| typeof fpApi.calculatePHash === 'function')) { | Abre o bloco 32×32 quando pelo menos um dos hashes perceptuais está disponível. |
| 055 | U07 |           const oc32 = new OffscreenCanvas(32, 32); | Cria canvas 32×32 compartilhado pelo(s) hash(es) perceptuais desta etapa. |
| 056 | U07 |           const ctx32 = oc32.getContext('2d'); | Obtém contexto 2D do canvas da unidade U07; as operações seguintes desenham/leem pixels dessa resolução. |
| 057 | U07 |           ctx32.drawImage(bitmap, 0, 0, 32, 32); | Redimensiona/corta o bitmap no canvas da unidade U07 com os parâmetros explícitos desta linha. |
| 058 | U07 |           const id32 = ctx32.getImageData(0, 0, 32, 32); | Lê os pixels RGBA do canvas da unidade U07 para serialização ou algoritmo de hash. |
| 059 | U07 | ␠ [linha vazia] | Separador visual de U07 (wHash/pHash e center-crop visual-v4); não altera controle, recursos ou resposta. |
| 060 | U07 |           if (typeof fpApi.calculateWHash === 'function') { | Completa a expressão de U07 com `if (typeof fpApi.calculateWHash === 'function') {`, fornecendo argumento/propriedade/estrutura necessária às linhas contíguas. |
| 061 | U07 |             wHash = fpApi.calculateWHash(id32.data); | Calcula wHash principal a partir do ImageData 32×32 compartilhado. |
| 062 | U07 |           } | Fecha a estrutura sintática da unidade U07; nenhuma operação adicional além do limite do bloco. |
| 063 | U07 |           if (typeof fpApi.calculatePHash === 'function') { | Completa a expressão de U07 com `if (typeof fpApi.calculatePHash === 'function') {`, fornecendo argumento/propriedade/estrutura necessária às linhas contíguas. |
| 064 | U07 |             pHash = fpApi.calculatePHash(id32.data); | Calcula pHash principal a partir do mesmo ImageData 32×32. |
| 065 | U07 |           } | Fecha a estrutura sintática da unidade U07; nenhuma operação adicional além do limite do bloco. |
| 066 | U07 | ␠ [linha vazia] | Separador visual de U07 (wHash/pHash e center-crop visual-v4); não altera controle, recursos ou resposta. |
| 067 | U07 |           const width = bitmap.width \|\| 0; | Normaliza largura do bitmap para 0 quando ausente, preparando geometria do crop. |
| 068 | U07 |           const height = bitmap.height \|\| 0; | Normaliza altura do bitmap para 0 quando ausente. |
| 069 | U07 |           const side = Math.min(width, height); | Escolhe o menor lado como tamanho do quadrado central máximo. |
| 070 | U07 |           if (side > 0 && width !== height) { | Executa center-crop apenas para dimensão válida e imagem não quadrada. |
| 071 | U07 |             const cropX = Math.floor((width - side) / 2); | Centraliza horizontalmente o quadrado calculando offset X inteiro. |
| 072 | U07 |             const cropY = Math.floor((height - side) / 2); | Centraliza verticalmente o quadrado calculando offset Y inteiro. |
| 073 | U07 |             const ocCrop = new OffscreenCanvas(32, 32); | Cria canvas 32×32 compartilhado pelo(s) hash(es) perceptuais desta etapa. |
| 074 | U07 |             const ctxCrop = ocCrop.getContext('2d'); | Obtém contexto 2D do canvas da unidade U07; as operações seguintes desenham/leem pixels dessa resolução. |
| 075 | U07 |             ctxCrop.drawImage(bitmap, cropX, cropY, side, side, 0, 0, 32, 32); | Redimensiona/corta o bitmap no canvas da unidade U07 com os parâmetros explícitos desta linha. |
| 076 | U07 |             const idCrop = ctxCrop.getImageData(0, 0, 32, 32); | Lê os pixels RGBA do canvas da unidade U07 para serialização ou algoritmo de hash. |
| 077 | U07 |             if (typeof fpApi.calculateWHash === 'function') { | Completa a expressão de U07 com `if (typeof fpApi.calculateWHash === 'function') {`, fornecendo argumento/propriedade/estrutura necessária às linhas contíguas. |
| 078 | U07 |               wHashCrop = fpApi.calculateWHash(idCrop.data); | Calcula wHash do center-crop quando a função existe. |
| 079 | U07 |             } | Fecha a estrutura sintática da unidade U07; nenhuma operação adicional além do limite do bloco. |
| 080 | U07 |             if (typeof fpApi.calculatePHash === 'function') { | Completa a expressão de U07 com `if (typeof fpApi.calculatePHash === 'function') {`, fornecendo argumento/propriedade/estrutura necessária às linhas contíguas. |
| 081 | U07 |               pHashCrop = fpApi.calculatePHash(idCrop.data); | Calcula pHash do center-crop quando a função existe. |
| 082 | U07 |             } | Fecha a estrutura sintática da unidade U07; nenhuma operação adicional além do limite do bloco. |
| 083 | U07 |           } | Fecha a estrutura sintática da unidade U07; nenhuma operação adicional além do limite do bloco. |
| 084 | U07 |         } | Fecha a estrutura sintática da unidade U07; nenhuma operação adicional além do limite do bloco. |
| 085 | U07 | ␠ [linha vazia] | Separador visual de U07 (wHash/pHash e center-crop visual-v4); não altera controle, recursos ou resposta. |
| 086 | U07 |         let regionalHashes = null; | Inicializa regionalHashes como null para capability opcional. |
| 087 | U08 |         if (fpApi && typeof fpApi.calculateRegionalHashes === 'function') { | Faz feature detection antes de criar/processar canvas regional 48×48. |
| 088 | U08 |           const oc48 = new OffscreenCanvas(48, 48); | Cria canvas 48×48 esperado por calculateRegionalHashes. |
| 089 | U08 |           const ctx48 = oc48.getContext('2d'); | Obtém contexto 2D do canvas da unidade U08; as operações seguintes desenham/leem pixels dessa resolução. |
| 090 | U08 |           ctx48.drawImage(bitmap, 0, 0, 48, 48); | Redimensiona/corta o bitmap no canvas da unidade U08 com os parâmetros explícitos desta linha. |
| 091 | U08 |           const id48 = ctx48.getImageData(0, 0, 48, 48); | Lê os pixels RGBA do canvas da unidade U08 para serialização ou algoritmo de hash. |
| 092 | U08 |           regionalHashes = fpApi.calculateRegionalHashes(id48.data); | Delegada o buffer 48×48 à API regional e guarda o objeto retornado. |
| 093 | U08 |         } | Fecha a estrutura sintática da unidade U08; nenhuma operação adicional além do limite do bloco. |
| 094 | U08 | ␠ [linha vazia] | Separador visual de U08 (Regional hashes 48×48); não altera controle, recursos ou resposta. |
| 095 | U08 |         bitmap.close(); | Libera explicitamente o recurso ImageBitmap; no sucesso isso ocorre antes do log/return. |
| 096 | U09 |         bitmap = null; | Zera a referência após close bem-sucedido para que finally não feche o mesmo bitmap novamente. |
| 097 | U09 | ␠ [linha vazia] | Separador visual de U09 (Liberação antecipada do bitmap no sucesso); não altera controle, recursos ou resposta. |
| 098 | U09 |         context.log('info', 'bg', 'VISUAL_FP_OK', 'Fingerprint visual-v3 calculado via SW', { | Emite evento VISUAL_FP_OK de sucesso sem incluir pixels/hashes completos. |
| 099 | U09 |           url: url.slice(0, 80), | Loga apenas os primeiros 80 caracteres do URL; ainda pode conter query sensível e não é redaction semântica. |
| 100 | U10 |           hasDHash: dHash !== null, | Indica no log se dHash foi produzido. |
| 101 | U10 |           hasWHash: wHash !== null, | Indica no log se wHash foi produzido. |
| 102 | U10 |           hasPHash: pHash !== null, | Indica no log se pHash foi produzido. |
| 103 | U10 |           hasCrop: wHashCrop !== null \|\| pHashCrop !== null, | Indica no log se ao menos um hash de center-crop foi produzido. |
| 104 | U10 |           hasRegional: regionalHashes !== null, | Indica no log se regionalHashes foi produzido. |
| 105 | U10 |         }); | Fecha a estrutura sintática da unidade U10; nenhuma operação adicional além do limite do bloco. |
| 106 | U10 | ␠ [linha vazia] | Separador visual de U10 (Telemetria de sucesso); não altera controle, recursos ou resposta. |
| 107 | U10 |         return { | Abre o objeto de resposta da unidade U10; campos seguintes formam o contrato do router. |
| 108 | U10 |           pixelSample, | Inclui `pixelSample` no objeto de resposta sem renomear, preservando o contrato do consumidor. |
| 109 | U11 |           dHash, | Inclui `dHash` no objeto de resposta sem renomear, preservando o contrato do consumidor. |
| 110 | U11 |           wHash, | Inclui `wHash` no objeto de resposta sem renomear, preservando o contrato do consumidor. |
| 111 | U11 |           pHash, | Inclui `pHash` no objeto de resposta sem renomear, preservando o contrato do consumidor. |
| 112 | U11 |           wHashCrop, | Inclui `wHashCrop` no objeto de resposta sem renomear, preservando o contrato do consumidor. |
| 113 | U11 |           pHashCrop, | Inclui `pHashCrop` no objeto de resposta sem renomear, preservando o contrato do consumidor. |
| 114 | U11 |           regionalHashes, | Inclui `regionalHashes` no objeto de resposta sem renomear, preservando o contrato do consumidor. |
| 115 | U11 |         }; | Fecha a estrutura sintática da unidade U11; nenhuma operação adicional além do limite do bloco. |
| 116 | U11 |       } catch (e) { | Captura qualquer falha operacional após a validação e inicia resposta estruturada de erro. |
| 117 | U11 |         context.log('warn', 'bg', 'VISUAL_FP_FAIL', `Falha no fingerprint visual-v3 via SW: ${e.message}`, { | Emite VISUAL_FP_FAIL com a mensagem de exceção para diagnóstico. |
| 118 | U11 |           url: (request.url \|\| '').slice(0, 80), | Inclui no log de falha até 80 caracteres do URL original, com fallback vazio. |
| 119 | U12 |         }); | Fecha a estrutura sintática da unidade U12; nenhuma operação adicional além do limite do bloco. |
| 120 | U12 |         return { ok: false, error: e.message }; | Converte a exceção operacional em erro explícito consumível pelo caller. |
| 121 | U12 |       } finally { | Abre cleanup incondicional executado em sucesso ou erro. |
| 122 | U12 |         // Calculating a hash may fail after the decoded image has been created. | Comentário local de U12: “Calculating a hash may fail after the decoded image has been created.”; registra intenção/compatibilidade sem executar. |
| 123 | U12 |         if (bitmap && typeof bitmap.close === 'function') { | Guarda o cleanup para executar close somente quando existe bitmap fechável ainda referenciado. |
| 124 | U12 |           bitmap.close(); | Libera explicitamente o recurso ImageBitmap; no sucesso isso ocorre antes do log/return. |
| 125 | U13 |         } | Fecha a estrutura sintática da unidade U13; nenhuma operação adicional além do limite do bloco. |
| 126 | U13 |       } | Fecha a estrutura sintática da unidade U13; nenhuma operação adicional além do limite do bloco. |
| 127 | U13 |     }, | Fecha a estrutura sintática da unidade U13; nenhuma operação adicional além do limite do bloco. |
| 128 | U13 |   }); | Fecha a estrutura sintática da unidade U13; nenhuma operação adicional além do limite do bloco. |
| 129 | U13 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha a IIFE usando self no service worker e globalThis como fallback de teste. |
| 130 | U14 | ⏎ [newline final] | Preserva o newline terminal do blob; posição editorial sem efeito runtime. |

## 11. Análise por unidade

### U01 — linhas/posição 1–3: Cabeçalho e intenção

**O que faz:** Ativa strict mode e declara que a action calcula fingerprints visuais v3/v4 no service worker.

**Como faz:** A diretiva precede a IIFE; o comentário fixa a responsabilidade do arquivo sem produzir efeito runtime.

**Por que desta forma:** Fingerprint cross-origin precisa de um local privilegiado quando canvas do content script é bloqueado por CORS.

**Por que outra implementação ingênua seria pior:** Misturar essa responsabilidade em content_manga duplicaria pipeline e continuaria sujeito a canvas tainted.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o teste direto carrega o arquivo real; não existe assertion para comentário/strict mode isoladamente.

### U02 — linhas/posição 4–12: Registro no router e política de origem

**O que faz:** Registra a action canônica calculate-visual-fingerprint e a disponibiliza a qualquer classe de origem reconhecida pelo router.

**Como faz:** IIFE usa self/globalThis e chama MangaTranslatorRouter.registerAction; meta.allowedSources=['any'].

**Por que desta forma:** O fallback pode ser solicitado por diferentes contextos da extensão; a action não depende de sender para o cálculo.

**Por que outra implementação ingênua seria pior:** Duplicar listener próprio concorreria com o router; restringir por heurística de URL do sender poderia bloquear consumidores legítimos sem melhorar a validação do URL alvo.

**Evidência:** ✅ PROVADO DIRETAMENTE para registro/dispatch via calculate-visual-fingerprint-action.test.js; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a necessidade de allowedSources:any.

### U03 — linhas/posição 13–26: Validação do URL alvo

**O que faz:** Inicializa bitmap para cleanup, extrai request.url, tenta parsear com URL() e rejeita qualquer protocolo que não seja HTTP/HTTPS antes do fetch.

**Como faz:** O parse tem catch próprio que devolve erro estável; depois uma allowlist de protocolos fecha data:, blob:, chrome-extension: e outros esquemas.

**Por que desta forma:** O service worker possui capacidade cross-origin maior que um content script; limitar esquema reduz superfície de leitura arbitrária e impede fetch de URLs internas do runtime/data payload.

**Por que outra implementação ingênua seria pior:** Aceitar data/blob/chrome-extension ampliaria a action para fontes que não precisam do fallback privilegiado; validar só depois do fetch já teria feito o efeito de rede.

**Evidência:** ✅ PROVADO DIRETAMENTE — testes rejeitam data: e chrome-extension: e exigem zero fetch. ⚠️ URL sintaticamente malformada que dispara o catch de new URL não tem caso focal.

### U04 — linhas/posição 27–32: Fetch e decodificação privilegiada

**O que faz:** Busca a imagem sem credenciais/cache, exige HTTP ok, converte para Blob e decodifica ImageBitmap.

**Como faz:** fetch(url,{credentials:'omit',cache:'no-store'}); !resp.ok lança erro; blob() e createImageBitmap() são awaits; fpApi é obtida do namespace global.

**Por que desta forma:** credentials:omit reduz vazamento de cookies/autenticação e no-store evita fingerprint stale; ImageBitmap permite OffscreenCanvas no worker.

**Por que outra implementação ingênua seria pior:** Incluir credenciais transformaria a action em uma leitura autenticada mais sensível; cache padrão poderia devolver conteúdo antigo; processar bytes manualmente duplicaria decoder do browser.

**Evidência:** ✅ PROVADO DIRETAMENTE para argumentos do fetch e caminho de sucesso. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para HTTP não-2xx, blob() rejeitado ou createImageBitmap() rejeitado.

### U05 — linhas/posição 33–41: pixelSample 8×8 RGBA

**O que faz:** Redimensiona a imagem para 8×8, lê 256 bytes RGBA e serializa cada byte em dois hex chars, produzindo 512 chars.

**Como faz:** OffscreenCanvas(8,8) + drawImage + getImageData; Array.from(data).map(toString(16).padStart(2,'0')).join('').

**Por que desta forma:** Fornece um descritor visual barato e determinístico para composição do fingerprint/compatibilidade v1.

**Por que outra implementação ingênua seria pior:** Usar imagem inteira tornaria hashing caro e dependente da resolução; serialização sem padding produziria tamanho variável/ambíguo.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste da action exige regex hex e 512 caracteres; test_bg59 confirma o mesmo no background completo.

### U06 — linhas/posição 42–51: dHash 9×8 opcional

**O que faz:** Calcula dHash somente se a API de fingerprint expõe calculateDHash.

**Como faz:** Cria canvas 9×8, desenha, lê pixels e entrega id9.data ao helper; caso contrário dHash permanece null.

**Por que desta forma:** dHash precisa de nove colunas para comparar oito diferenças horizontais; feature detection preserva compatibilidade com versões parciais da API.

**Por que outra implementação ingênua seria pior:** Chamar método ausente derrubaria todo fingerprint; reutilizar 8×8 do pixelSample mudaria a definição matemática do dHash.

**Evidência:** ✅ PROVADO DIRETAMENTE para dHash presente/uma chamada. ⚠️ Caminho sem calculateDHash mantendo null não possui teste focal.

### U07 — linhas/posição 52–86: wHash/pHash e center-crop visual-v4

**O que faz:** Calcula wHash e pHash sobre o mesmo 32×32 e, para imagens retangulares, repete ambos sobre crop quadrado central.

**Como faz:** Feature detection cria um único canvas principal; width/height/side definem cropX/cropY; drawImage usa source crop e destino 32×32; cada algoritmo é invocado apenas se existir.

**Por que desta forma:** Compartilhar ImageData 32×32 evita dois resizes; center-crop reduz influência de margens/aspect ratio e fornece fallback visual-v4 para scans equivalentes com enquadramento diferente.

**Por que outra implementação ingênua seria pior:** Criar canvases separados por algoritmo duplica trabalho; crop não central pode deslocar conteúdo; calcular crop em imagem quadrada é redundante e pode mudar pixels por reamostragem.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste real exige w/p main+crop, duas chamadas de cada e geometria 800×1200 → crop y=200/800×800. ⚠️ Sem teste focal para imagem quadrada (crop null), width/height zero ou somente um dos dois algoritmos disponível.

### U08 — linhas/posição 87–95: Regional hashes 48×48

**O que faz:** Calcula hashes regionais quando calculateRegionalHashes existe.

**Como faz:** Redimensiona para 48×48, lê ImageData e delega o buffer à API compartilhada.

**Por que desta forma:** Cantos/regiões fornecem confirmação espacial adicional para matching perceptual cross-language.

**Por que outra implementação ingênua seria pior:** Sempre exigir regional hashes quebraria versões antigas da API; calcular sobre outra resolução mudaria o contrato esperado pelo matcher.

**Evidência:** ✅ PROVADO DIRETAMENTE — action test/test_bg59 exigem objeto regional e uma chamada. ⚠️ Caminho sem função regional permanecendo null não tem teste focal.

### U09 — linhas/posição 96–99: Liberação antecipada do bitmap no sucesso

**O que faz:** Fecha o ImageBitmap após todos os hashes e zera a variável para impedir fechamento duplicado no finally.

**Como faz:** bitmap.close(); bitmap=null antes do log/return.

**Por que desta forma:** Bitmap pode manter memória gráfica relevante; liberar antes de logging/retorno reduz lifetime e null sinaliza que cleanup já ocorreu.

**Por que outra implementação ingênua seria pior:** Esperar GC aumenta pressão de memória em lote; não zerar bitmap faria finally chamar close novamente no sucesso.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste de sucesso exige close exatamente uma vez.

### U10 — linhas/posição 100–108: Telemetria de sucesso

**O que faz:** Registra VISUAL_FP_OK com prefixo de URL e flags indicando quais famílias de hash foram produzidas.

**Como faz:** context.log recebe level info, source bg, action e metadata booleana calculada por comparação com null.

**Por que desta forma:** Permite diagnosticar degradação de versão sem logar buffers/pixels/hashes completos.

**Por que outra implementação ingênua seria pior:** Logar pixels/hashes/Base64 aumentaria volume e exposição; omitir flags esconderia quando a API global carregou parcialmente.

**Evidência:** ✅ PROVADO DIRETAMENTE para chamada de log VISUAL_FP_OK. ⚠️ Conteúdo de todas as flags e redaction do URL não têm assertions focais.

### U11 — linhas/posição 109–118: Contrato de resposta de sucesso

**O que faz:** Retorna pixelSample e todas as variantes de hash ao router; o router adiciona ok:true ao envelope.

**Como faz:** O objeto inclui dHash, wHash, pHash, wHashCrop, pHashCrop e regionalHashes, preservando null para capacidades ausentes.

**Por que desta forma:** O consumidor cm-gtc-client usa esses campos para selecionar fingerprintVersion e fallback strict/crop/relaxed sem repetir o fetch.

**Por que outra implementação ingênua seria pior:** Omitir campos null mudaria shape e complicaria compatibilidade; renomear campos quebraria cache/indexeddb e o cliente do leitor.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste da action compara todos os campos v4; test_bg59 atravessa background completo; extract-flow usa resposta mockada para crop lookup, evidência de consumidor, não da action.

### U12 — linhas/posição 119–124: Falha operacional e observabilidade

**O que faz:** Converte qualquer erro posterior à validação em resposta ok:false/error e log VISUAL_FP_FAIL.

**Como faz:** catch captura e.message, loga URL truncada e retorna o texto da exceção; o router mantém a resposta de falha.

**Por que desta forma:** Fetch/decode/canvas/hash podem falhar por rede, CORS, memória ou API parcial; o caller precisa de falha estruturada para usar fallback.

**Por que outra implementação ingênua seria pior:** Propagar exceção sem resposta faria o caller depender apenas do catch genérico do router e perderia evento específico VISUAL_FP_FAIL.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste força calculateWHash a lançar, exige erro exato e log warn. ⚠️ Erros de fetch/decode/canvas não têm casos separados.

### U13 — linhas/posição 125–129: finally e cleanup em falha

**O que faz:** Garante fechamento do bitmap se uma falha ocorreu depois de createImageBitmap e antes do fechamento de sucesso.

**Como faz:** finally testa bitmap e bitmap.close antes de chamar close; no sucesso bitmap já é null.

**Por que desta forma:** Recursos gráficos precisam ser liberados também quando qualquer algoritmo falha.

**Por que outra implementação ingênua seria pior:** Cleanup só no sucesso vazaria ImageBitmap em exceções; chamar close sem checar método quebraria mocks/implementações incompletas.

**Evidência:** ✅ PROVADO DIRETAMENTE — teste de falha em wHash exige close exatamente uma vez. ⚠️ bitmap existente sem método close e close() que lança não têm teste focal.

### U14 — linhas/posição 130–130: Newline final

**O que faz:** Documenta a posição editorial do newline terminal.

**Como faz:** Contabilizada separadamente das 129 linhas textuais.

**Por que desta forma:** Mantém equivalência física com o blob e padrão da auditoria.

**Por que outra implementação ingênua seria pior:** Ignorar a posição produziria cobertura 129/130 mascarada.

**Evidência:** 🟦 GATE DOCUMENTAL — verificado pelo blob; não é comportamento runtime.


## 12. Revisão final

- [x] SHA correto;
- [x] fonte integral exata;
- [x] 129 linhas + newline = 130/130 posições;
- [x] 14 unidades estruturais, sem gaps;
- [x] nenhuma evidência é atribuída automaticamente a cada linha;
- [x] teste direto da action separado da simulação visual;
- [x] consumidor separado da implementação;
- [x] lacunas de erro/rede/capabilities/privacy registradas;
- [x] invariantes e riscos MV3/security registrados;
- [x] nenhum código funcional alterado.

**Veredito documental:** aprovada para `ea474845cf9c6a6784e3ceb75298f0ac8df86e06`.

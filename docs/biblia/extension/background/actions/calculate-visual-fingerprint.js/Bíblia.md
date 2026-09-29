# Bíblia técnica — `extension/background/actions/calculate-visual-fingerprint.js`

> **Estado:** 🟣 **REVISÃO DE QUALIDADE — NÃO CONCLUÍDO**.  
> **Auditoria:** reprovada em 2026-09-29; ver `docs/biblia/AUDITORIA.md` para os motivos e o protocolo de correção.
> **SHA auditado:** `ea474845cf9c6a6784e3ceb75298f0ac8df86e06`  
> **Linhas auditadas:** **130**  
> **Teste real principal:** `tests/unit/background/calculate-visual-fingerprint-action.test.js` (`f51a0b629ac17be3eda349333192b9480494a07e`).  
> **Evidência complementar:** `tests/visual/background-fingerprint.visual.js` — útil para propriedades dos algoritmos, mas parte da suíte visual simula o pipeline e não substitui o teste da action real.

## 1. Papel arquitetural

Esta action é a fronteira privilegiada que recebe uma URL HTTP(S), baixa a imagem no Service Worker, decodifica para `ImageBitmap`, normaliza a imagem em vários `OffscreenCanvas` e produz a família de fingerprints usada pelo GTC. Ela existe no background porque o Service Worker dispõe do contexto de rede/OffscreenCanvas necessário e porque o cache perceptual precisa de uma representação independente do DOM da página.

O pipeline deliberadamente combina: amostra RGBA 8×8, dHash 9×8, wHash/pHash 32×32, hashes de center crop para imagens retangulares e hashes regionais 48×48. O resultado mantém campos opcionais como `null` em vez de variar o shape, e o bitmap é fechado tanto em sucesso quanto em falha.

## 2. Evidência e lacunas

| Faixa | Contrato | Evidência |
|---:|---|---|
| 1–12 | Registro da action e política de origem | 🟨 PROVA PARCIAL: `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico. |
| 13–25 | Validação de URL | ✅ PROVADO: testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch. |
| 26–32 | Fetch e decodificação da imagem | ✅/🟨 MISTO: o teste principal verifica URL e opções `credentials:'omit'`/`cache:'no-store'`; falha HTTP específica não possui caso dedicado. |
| 33–41 | pixelSample 8×8 | ✅ PROVADO: o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura. |
| 42–51 | dHash 9×8 opcional | ✅/🟨 MISTO: caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado. |
| 52–83 | wHash/pHash 32×32 e center crop | ✅ PROVADO COM LACUNAS DE BORDA: o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes. |
| 84–92 | Hashes regionais 48×48 e liberação no sucesso | ✅ PROVADO: resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes. |
| 93–113 | Log e resposta de sucesso | ✅ PROVADO: o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`. |
| 114–124 | Falha, log e cleanup em finally | ✅ PROVADO COM LACUNA DE ORIGEM: o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados. |
| 125–127 | Fechamento do registro IIFE | ✅ EXECUTADO: `loadAction` exige que o módulo registre a action no router para todos os testes passarem. |

### Lacunas explícitas

- ⚠️ `allowedSources: ['any']` é exercitado pelo dispatch bem-sucedido, mas não há teste comparando a metadata nem um teste de origem alternativa/restrição.
- ⚠️ não há caso focal para resposta HTTP `!ok`; o catch é provado por falha de hash, mas a origem HTTP do erro não.
- ⚠️ não há caso focal para ausência total de `MangaTranslatorGtcFingerprint`; o contrato esperado de retornar somente `pixelSample` + hashes `null` é inferido do código.
- ⚠️ não há caso focal para imagem já quadrada garantindo que center crop permaneça `null`.
- ⚠️ não há matriz completa de capacidades parciais (somente W, somente P, sem regional, sem dHash).

## 3. Fonte integral

```javascript
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

```

## 4. Comentário linha por linha

### Linha 001 — Registro da action e política de origem
<code>'use strict';</code>

**O que faz:** ativa strict mode neste módulo de action.

**Como faz:** é uma diretiva de script avaliada antes da IIFE.

**Por que desta forma / alternativa pior:** reduz globais acidentais e erros silenciosos num módulo carregado dentro do Service Worker.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 002 — Registro da action e política de origem
<code>// background/actions/calculate-visual-fingerprint.js -- Computes visual-v3/v4 fingerprints in the service worker.</code>

**O que faz:** documenta a decisão local: “background/actions/calculate-visual-fingerprint.js -- Computes visual-v3/v4 fingerprints in the service worker.”.

**Como faz:** mantém a justificativa junto do código que ela explica.

**Por que desta forma / alternativa pior:** sem esse contexto, uma otimização futura poderia remover validação/cleanup acreditando ser redundante.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 003 — Registro da action e política de origem
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 004 — Registro da action e política de origem
<code>(function(scope) {</code>

**O que faz:** abre IIFE parametrizada pelo escopo global compatível com browser e Node.

**Como faz:** recebe `self` ou `globalThis` no fechamento final.

**Por que desta forma / alternativa pior:** evita criar nomes auxiliares globais enquanto ainda permite registrar a action no router compartilhado.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 005 — Registro da action e política de origem
<code>  scope.MangaTranslatorRouter.registerAction({</code>

**O que faz:** registra a action no roteador central.

**Como faz:** entrega um descriptor com nome, metadata e `execute`.

**Por que desta forma / alternativa pior:** registrar por router central mantém autorização/normalização de mensagens fora da lógica de fingerprint.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 006 — Registro da action e política de origem
<code>    name: 'calculate-visual-fingerprint',</code>

**O que faz:** define o nome canônico interno `calculate-visual-fingerprint`.

**Como faz:** o router resolve a action pública para este descriptor.

**Por que desta forma / alternativa pior:** um nome divergente faria o handler existir no arquivo mas nunca ser encontrado pelo dispatch.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 007 — Registro da action e política de origem
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 008 — Registro da action e política de origem
<code>    meta: {</code>

**O que faz:** executa a instrução específica `meta: {` dentro de **Registro da action e política de origem**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 009 — Registro da action e política de origem
<code>      // Compatibility contract: this action remains available to every extension context.</code>

**O que faz:** documenta a decisão local: “Compatibility contract: this action remains available to every extension context.”.

**Como faz:** mantém a justificativa junto do código que ela explica.

**Por que desta forma / alternativa pior:** sem esse contexto, uma otimização futura poderia remover validação/cleanup acreditando ser redundante.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 010 — Registro da action e política de origem
<code>      allowedSources: ['any'],</code>

**O que faz:** declara compatibilidade com qualquer contexto da extensão.

**Como faz:** usa metadata do router para não restringir sender.

**Por que desta forma / alternativa pior:** restringir sem mapear todos os chamadores quebraria consumidores; manter `any` exige confiar na validação de URL dentro da própria action.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 011 — Registro da action e política de origem
<code>    },</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 012 — Registro da action e política de origem
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** 🟨 PROVA PARCIAL — `calculate-visual-fingerprint-action.test.js` carrega a action real pelo router; `allowedSources: ['any']` não possui teste negativo específico.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 013 — Validação de URL
<code>    async execute(request, context) {</code>

**O que faz:** define o handler assíncrono da action.

**Como faz:** recebe a mensagem e o contexto de dependências/log do router.

**Por que desta forma / alternativa pior:** fetch, Blob e ImageBitmap são assíncronos; forçar callback manual aumentaria complexidade de erro/cleanup.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 014 — Validação de URL
<code>      let bitmap = null;</code>

**O que faz:** cria referência ao ImageBitmap fora do `try`.

**Como faz:** inicia em `null` para que `finally` saiba se existe recurso decodificado.

**Por que desta forma / alternativa pior:** declarar dentro do try impediria cleanup uniforme após exceções posteriores.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 015 — Validação de URL
<code>      try {</code>

**O que faz:** executa a instrução específica `try {` dentro de **Validação de URL**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 016 — Validação de URL
<code>        const { url } = request;</code>

**O que faz:** extrai somente `url` da requisição.

**Como faz:** usa destructuring para tornar a entrada principal explícita.

**Por que desta forma / alternativa pior:** usar o objeto inteiro espalhado por todo o fluxo dificultaria validar a fronteira antes do fetch.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 017 — Validação de URL
<code>        let parsedUrl;</code>

**O que faz:** executa a instrução específica `let parsedUrl;` dentro de **Validação de URL**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 018 — Validação de URL
<code>        try {</code>

**O que faz:** executa a instrução específica `try {` dentro de **Validação de URL**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 019 — Validação de URL
<code>          parsedUrl = new URL(url);</code>

**O que faz:** faz parsing estrutural da URL antes de rede.

**Como faz:** usa a implementação URL do runtime e captura exceção local.

**Por que desta forma / alternativa pior:** chamar fetch primeiro aceitaria esquemas inesperados e ampliaria superfície SSRF-like dentro do privilégio da extensão.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 020 — Validação de URL
<code>        } catch (_error) {</code>

**O que faz:** executa a instrução específica `} catch (_error) {` dentro de **Validação de URL**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 021 — Validação de URL
<code>          return { ok: false, error: 'URL inválida para fingerprint visual' };</code>

**O que faz:** retorna erro controlado para URL inválida/não permitida.

**Como faz:** usa `{ok:false,error}` que o router preserva ao responder.

**Por que desta forma / alternativa pior:** lançar exceção aqui transformaria erro de entrada esperado em falha genérica e faria logging de warning desnecessário.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 022 — Validação de URL
<code>        }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 023 — Validação de URL
<code>        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {</code>

**O que faz:** limita explicitamente o protocolo a HTTP(S).

**Como faz:** compara `parsedUrl.protocol` contra allowlist fechada.

**Por que desta forma / alternativa pior:** bloquear por denylist seria pior porque novos esquemas/`data:`/`chrome-extension:` poderiam escapar por omissão.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 024 — Validação de URL
<code>          return { ok: false, error: 'URL inválida para fingerprint visual' };</code>

**O que faz:** retorna erro controlado para URL inválida/não permitida.

**Como faz:** usa `{ok:false,error}` que o router preserva ao responder.

**Por que desta forma / alternativa pior:** lançar exceção aqui transformaria erro de entrada esperado em falha genérica e faria logging de warning desnecessário.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 025 — Validação de URL
<code>        }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO — testes `rejects data URLs` e `rejects non-HTTP(S) URLs` verificam rejeição e ausência de fetch.

### Linha 026 — Fetch e decodificação da imagem
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅/🟨 MISTO — o teste principal verifica URL e opções `credentials:'omit'`/`cache:'no-store'`; falha HTTP específica não possui caso dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 027 — Fetch e decodificação da imagem
<code>        const resp = await fetch(url, { credentials: 'omit', cache: 'no-store' });</code>

**O que faz:** busca bytes da imagem sem credenciais e sem cache.

**Como faz:** usa `credentials:'omit'` e `cache:'no-store'`.

**Por que desta forma / alternativa pior:** evita vazar cookies da sessão do usuário e evita fingerprint calculado sobre resposta stale de cache.

**Evidência:** ✅/🟨 MISTO — o teste principal verifica URL e opções `credentials:'omit'`/`cache:'no-store'`; falha HTTP específica não possui caso dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 028 — Fetch e decodificação da imagem
<code>        if (!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar imagem`);</code>

**O que faz:** transforma status HTTP não-2xx em falha explícita.

**Como faz:** lança erro contendo o status para cair no catch comum.

**Por que desta forma / alternativa pior:** continuar para `blob()` em resposta de erro poderia hashear HTML/erro como se fosse imagem válida.

**Evidência:** ✅/🟨 MISTO — o teste principal verifica URL e opções `credentials:'omit'`/`cache:'no-store'`; falha HTTP específica não possui caso dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 029 — Fetch e decodificação da imagem
<code>        const blob = await resp.blob();</code>

**O que faz:** materializa o corpo HTTP como Blob de imagem.

**Como faz:** aguarda a Promise antes de decodificar.

**Por que desta forma / alternativa pior:** passar Response direto a `createImageBitmap` não respeita o contrato esperado e mistura rede com decode.

**Evidência:** ✅/🟨 MISTO — o teste principal verifica URL e opções `credentials:'omit'`/`cache:'no-store'`; falha HTTP específica não possui caso dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 030 — Fetch e decodificação da imagem
<code>        bitmap = await createImageBitmap(blob);</code>

**O que faz:** decodifica o Blob em recurso gráfico eficiente para OffscreenCanvas.

**Como faz:** armazena o bitmap na variável externa protegida por finally.

**Por que desta forma / alternativa pior:** usar elemento DOM `<img>` não é apropriado no Service Worker e dificultaria cleanup determinístico.

**Evidência:** ✅/🟨 MISTO — o teste principal verifica URL e opções `credentials:'omit'`/`cache:'no-store'`; falha HTTP específica não possui caso dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 031 — Fetch e decodificação da imagem
<code>        const fpApi = scope.MangaTranslatorGtcFingerprint || null;</code>

**O que faz:** executa a instrução específica `const fpApi = scope.MangaTranslatorGtcFingerprint || null;` dentro de **Fetch e decodificação da imagem**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅/🟨 MISTO — o teste principal verifica URL e opções `credentials:'omit'`/`cache:'no-store'`; falha HTTP específica não possui caso dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 032 — Fetch e decodificação da imagem
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅/🟨 MISTO — o teste principal verifica URL e opções `credentials:'omit'`/`cache:'no-store'`; falha HTTP específica não possui caso dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 033 — pixelSample 8×8
<code>        const oc8 = new OffscreenCanvas(8, 8);</code>

**O que faz:** cria canvas 8×8 para amostra RGBA compacta.

**Como faz:** faz resize independente do tamanho original.

**Por que desta forma / alternativa pior:** amostrar tamanho original produziria payload enorme e não normalizado entre resoluções.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 034 — pixelSample 8×8
<code>        const ctx8 = oc8.getContext('2d');</code>

**O que faz:** executa a instrução específica `const ctx8 = oc8.getContext('2d');` dentro de **pixelSample 8×8**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 035 — pixelSample 8×8
<code>        ctx8.drawImage(bitmap, 0, 0, 8, 8);</code>

**O que faz:** redesenha o bitmap no canvas normalizado deste bloco (`ctx8.drawImage(bitmap, 0, 0, 8, 8);`).

**Como faz:** usa drawImage como etapa de resize/crop no ambiente offscreen.

**Por que desta forma / alternativa pior:** hashear diretamente pixels da resolução original impediria comparação robusta entre versões redimensionadas da mesma página.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 036 — pixelSample 8×8
<code>        const id8 = ctx8.getImageData(0, 0, 8, 8);</code>

**O que faz:** extrai bytes RGBA do canvas normalizado.

**Como faz:** lê exatamente a área desenhada para alimentar algoritmo puro.

**Por que desta forma / alternativa pior:** algoritmos de hash precisam de buffer determinístico; depender do objeto Canvas os acoplaria ao ambiente gráfico.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 037 — pixelSample 8×8
<code>        const pixelSample = Array.from(id8.data)</code>

**O que faz:** converte os 256 bytes RGBA do 8×8 para representação hexadecimal estável.

**Como faz:** cada byte é zero-padded para dois hex chars e concatenado.

**Por que desta forma / alternativa pior:** sem padding, valores abaixo de 16 produziriam comprimento variável e colisões de concatenação.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 038 — pixelSample 8×8
<code>          .map(byte =&gt; byte.toString(16).padStart(2, '0'))</code>

**O que faz:** converte os 256 bytes RGBA do 8×8 para representação hexadecimal estável.

**Como faz:** cada byte é zero-padded para dois hex chars e concatenado.

**Por que desta forma / alternativa pior:** sem padding, valores abaixo de 16 produziriam comprimento variável e colisões de concatenação.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 039 — pixelSample 8×8
<code>          .join('');</code>

**O que faz:** converte os 256 bytes RGBA do 8×8 para representação hexadecimal estável.

**Como faz:** cada byte é zero-padded para dois hex chars e concatenado.

**Por que desta forma / alternativa pior:** sem padding, valores abaixo de 16 produziriam comprimento variável e colisões de concatenação.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 040 — pixelSample 8×8
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 041 — pixelSample 8×8
<code>        let dHash = null;</code>

**O que faz:** inicializa dHash como `null` para representar algoritmo indisponível.

**Como faz:** o valor só muda se a API expuser `calculateDHash`.

**Por que desta forma / alternativa pior:** usar string vazia confundiria ausência de algoritmo com hash calculado vazio/inválido.

**Evidência:** ✅ PROVADO — o teste real exige hex de 512 caracteres; testes visuais também verificam determinismo/estrutura.

### Linha 042 — dHash 9×8 opcional
<code>        if (fpApi &amp;&amp; typeof fpApi.calculateDHash === 'function') {</code>

**O que faz:** calcula dHash somente quando a API fornece a função.

**Como faz:** faz feature detection antes da chamada.

**Por que desta forma / alternativa pior:** chamar incondicionalmente quebraria compatibilidade com versões/ambientes onde apenas hashes avançados existem.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 043 — dHash 9×8 opcional
<code>          const oc9 = new OffscreenCanvas(9, 8);</code>

**O que faz:** cria canvas 9×8 exigido pelo dHash horizontal.

**Como faz:** a coluna extra permite comparar pares adjacentes para gerar 8×8 diferenças.

**Por que desta forma / alternativa pior:** usar 8×8 não forneceria 8 comparações horizontais por linha.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 044 — dHash 9×8 opcional
<code>          const ctx9 = oc9.getContext('2d');</code>

**O que faz:** executa a instrução específica `const ctx9 = oc9.getContext('2d');` dentro de **dHash 9×8 opcional**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 045 — dHash 9×8 opcional
<code>          ctx9.drawImage(bitmap, 0, 0, 9, 8);</code>

**O que faz:** redesenha o bitmap no canvas normalizado deste bloco (`ctx9.drawImage(bitmap, 0, 0, 9, 8);`).

**Como faz:** usa drawImage como etapa de resize/crop no ambiente offscreen.

**Por que desta forma / alternativa pior:** hashear diretamente pixels da resolução original impediria comparação robusta entre versões redimensionadas da mesma página.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 046 — dHash 9×8 opcional
<code>          const id9 = ctx9.getImageData(0, 0, 9, 8);</code>

**O que faz:** extrai bytes RGBA do canvas normalizado.

**Como faz:** lê exatamente a área desenhada para alimentar algoritmo puro.

**Por que desta forma / alternativa pior:** algoritmos de hash precisam de buffer determinístico; depender do objeto Canvas os acoplaria ao ambiente gráfico.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 047 — dHash 9×8 opcional
<code>          dHash = fpApi.calculateDHash(id9.data);</code>

**O que faz:** calcula dHash somente quando a API fornece a função.

**Como faz:** faz feature detection antes da chamada.

**Por que desta forma / alternativa pior:** chamar incondicionalmente quebraria compatibilidade com versões/ambientes onde apenas hashes avançados existem.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 048 — dHash 9×8 opcional
<code>        }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 049 — dHash 9×8 opcional
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 050 — dHash 9×8 opcional
<code>        let wHash = null;</code>

**O que faz:** inicializa um campo de hash opcional como `null`.

**Como faz:** preserva shape estável da resposta independentemente das capacidades presentes.

**Por que desta forma / alternativa pior:** omitir chaves dinamicamente obrigaria consumidores a distinguir ausência de propriedade de ausência de resultado.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 051 — dHash 9×8 opcional
<code>        let pHash = null;</code>

**O que faz:** inicializa um campo de hash opcional como `null`.

**Como faz:** preserva shape estável da resposta independentemente das capacidades presentes.

**Por que desta forma / alternativa pior:** omitir chaves dinamicamente obrigaria consumidores a distinguir ausência de propriedade de ausência de resultado.

**Evidência:** ✅/🟨 MISTO — caminho com `calculateDHash` é verificado; ausência da função e retorno `null` não têm caso focal dedicado.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 052 — wHash/pHash 32×32 e center crop
<code>        let wHashCrop = null;</code>

**O que faz:** inicializa um campo de hash opcional como `null`.

**Como faz:** preserva shape estável da resposta independentemente das capacidades presentes.

**Por que desta forma / alternativa pior:** omitir chaves dinamicamente obrigaria consumidores a distinguir ausência de propriedade de ausência de resultado.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 053 — wHash/pHash 32×32 e center crop
<code>        let pHashCrop = null;</code>

**O que faz:** inicializa um campo de hash opcional como `null`.

**Como faz:** preserva shape estável da resposta independentemente das capacidades presentes.

**Por que desta forma / alternativa pior:** omitir chaves dinamicamente obrigaria consumidores a distinguir ausência de propriedade de ausência de resultado.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 054 — wHash/pHash 32×32 e center crop
<code>        if (fpApi &amp;&amp; (typeof fpApi.calculateWHash === 'function' || typeof fpApi.calculatePHash === 'function')) {</code>

**O que faz:** calcula wHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa dados normalizados/crop conforme o bloco.

**Por que desta forma / alternativa pior:** wHash é complementar ao pHash; remover um sem atualizar matching degradaria robustez perceptual.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 055 — wHash/pHash 32×32 e center crop
<code>          const oc32 = new OffscreenCanvas(32, 32);</code>

**O que faz:** normaliza imagem para 32×32, entrada compartilhada de wHash/pHash.

**Como faz:** reutiliza o mesmo ImageData para ambos os algoritmos.

**Por que desta forma / alternativa pior:** dois resizes separados aumentariam custo e poderiam introduzir diferenças de amostragem.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 056 — wHash/pHash 32×32 e center crop
<code>          const ctx32 = oc32.getContext('2d');</code>

**O que faz:** executa a instrução específica `const ctx32 = oc32.getContext('2d');` dentro de **wHash/pHash 32×32 e center crop**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 057 — wHash/pHash 32×32 e center crop
<code>          ctx32.drawImage(bitmap, 0, 0, 32, 32);</code>

**O que faz:** redesenha o bitmap no canvas normalizado deste bloco (`ctx32.drawImage(bitmap, 0, 0, 32, 32);`).

**Como faz:** usa drawImage como etapa de resize/crop no ambiente offscreen.

**Por que desta forma / alternativa pior:** hashear diretamente pixels da resolução original impediria comparação robusta entre versões redimensionadas da mesma página.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 058 — wHash/pHash 32×32 e center crop
<code>          const id32 = ctx32.getImageData(0, 0, 32, 32);</code>

**O que faz:** extrai bytes RGBA do canvas normalizado.

**Como faz:** lê exatamente a área desenhada para alimentar algoritmo puro.

**Por que desta forma / alternativa pior:** algoritmos de hash precisam de buffer determinístico; depender do objeto Canvas os acoplaria ao ambiente gráfico.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 059 — wHash/pHash 32×32 e center crop
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 060 — wHash/pHash 32×32 e center crop
<code>          if (typeof fpApi.calculateWHash === 'function') {</code>

**O que faz:** calcula wHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa dados normalizados/crop conforme o bloco.

**Por que desta forma / alternativa pior:** wHash é complementar ao pHash; remover um sem atualizar matching degradaria robustez perceptual.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 061 — wHash/pHash 32×32 e center crop
<code>            wHash = fpApi.calculateWHash(id32.data);</code>

**O que faz:** calcula wHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa dados normalizados/crop conforme o bloco.

**Por que desta forma / alternativa pior:** wHash é complementar ao pHash; remover um sem atualizar matching degradaria robustez perceptual.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 062 — wHash/pHash 32×32 e center crop
<code>          }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 063 — wHash/pHash 32×32 e center crop
<code>          if (typeof fpApi.calculatePHash === 'function') {</code>

**O que faz:** calcula pHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa a mesma base visual do wHash.

**Por que desta forma / alternativa pior:** calcular em resize diferente impediria comparar as métricas sob o mesmo conteúdo normalizado.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 064 — wHash/pHash 32×32 e center crop
<code>            pHash = fpApi.calculatePHash(id32.data);</code>

**O que faz:** calcula pHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa a mesma base visual do wHash.

**Por que desta forma / alternativa pior:** calcular em resize diferente impediria comparar as métricas sob o mesmo conteúdo normalizado.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 065 — wHash/pHash 32×32 e center crop
<code>          }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 066 — wHash/pHash 32×32 e center crop
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 067 — wHash/pHash 32×32 e center crop
<code>          const width = bitmap.width || 0;</code>

**O que faz:** captura dimensão decodificada para decidir center crop.

**Como faz:** usa fallback zero caso propriedade falte.

**Por que desta forma / alternativa pior:** assumir dimensões sempre válidas poderia gerar crop negativo/NaN em stubs ou decoders anômalos.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 068 — wHash/pHash 32×32 e center crop
<code>          const height = bitmap.height || 0;</code>

**O que faz:** captura dimensão decodificada para decidir center crop.

**Como faz:** usa fallback zero caso propriedade falte.

**Por que desta forma / alternativa pior:** assumir dimensões sempre válidas poderia gerar crop negativo/NaN em stubs ou decoders anômalos.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 069 — wHash/pHash 32×32 e center crop
<code>          const side = Math.min(width, height);</code>

**O que faz:** define o maior quadrado central que cabe integralmente na imagem.

**Como faz:** usa a menor dimensão como lado.

**Por que desta forma / alternativa pior:** usar a maior dimensão exigiria pixels fora da imagem ou padding artificial que contaminaria o hash.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 070 — wHash/pHash 32×32 e center crop
<code>          if (side &gt; 0 &amp;&amp; width !== height) {</code>

**O que faz:** executa center crop somente quando dimensões são válidas e não quadradas.

**Como faz:** evita trabalho redundante em imagens já quadradas.

**Por que desta forma / alternativa pior:** recalcular crop idêntico desperdiçaria CPU; permitir side zero criaria draw inválido.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 071 — wHash/pHash 32×32 e center crop
<code>            const cropX = Math.floor((width - side) / 2);</code>

**O que faz:** calcula offset inteiro para centralizar o quadrado de crop.

**Como faz:** divide a sobra por dois e aplica `Math.floor`.

**Por que desta forma / alternativa pior:** ancorar em um canto mudaria conteúdo estrutural preservado e reduziria invariância a barras/margens laterais.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 072 — wHash/pHash 32×32 e center crop
<code>            const cropY = Math.floor((height - side) / 2);</code>

**O que faz:** calcula offset inteiro para centralizar o quadrado de crop.

**Como faz:** divide a sobra por dois e aplica `Math.floor`.

**Por que desta forma / alternativa pior:** ancorar em um canto mudaria conteúdo estrutural preservado e reduziria invariância a barras/margens laterais.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 073 — wHash/pHash 32×32 e center crop
<code>            const ocCrop = new OffscreenCanvas(32, 32);</code>

**O que faz:** normaliza imagem para 32×32, entrada compartilhada de wHash/pHash.

**Como faz:** reutiliza o mesmo ImageData para ambos os algoritmos.

**Por que desta forma / alternativa pior:** dois resizes separados aumentariam custo e poderiam introduzir diferenças de amostragem.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 074 — wHash/pHash 32×32 e center crop
<code>            const ctxCrop = ocCrop.getContext('2d');</code>

**O que faz:** executa a instrução específica `const ctxCrop = ocCrop.getContext('2d');` dentro de **wHash/pHash 32×32 e center crop**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 075 — wHash/pHash 32×32 e center crop
<code>            ctxCrop.drawImage(bitmap, cropX, cropY, side, side, 0, 0, 32, 32);</code>

**O que faz:** redesenha o bitmap no canvas normalizado deste bloco (`ctxCrop.drawImage(bitmap, cropX, cropY, side, side, 0, 0, 32, 32);`).

**Como faz:** usa drawImage como etapa de resize/crop no ambiente offscreen.

**Por que desta forma / alternativa pior:** hashear diretamente pixels da resolução original impediria comparação robusta entre versões redimensionadas da mesma página.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 076 — wHash/pHash 32×32 e center crop
<code>            const idCrop = ctxCrop.getImageData(0, 0, 32, 32);</code>

**O que faz:** extrai bytes RGBA do canvas normalizado.

**Como faz:** lê exatamente a área desenhada para alimentar algoritmo puro.

**Por que desta forma / alternativa pior:** algoritmos de hash precisam de buffer determinístico; depender do objeto Canvas os acoplaria ao ambiente gráfico.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 077 — wHash/pHash 32×32 e center crop
<code>            if (typeof fpApi.calculateWHash === 'function') {</code>

**O que faz:** calcula wHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa dados normalizados/crop conforme o bloco.

**Por que desta forma / alternativa pior:** wHash é complementar ao pHash; remover um sem atualizar matching degradaria robustez perceptual.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 078 — wHash/pHash 32×32 e center crop
<code>              wHashCrop = fpApi.calculateWHash(idCrop.data);</code>

**O que faz:** calcula wHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa dados normalizados/crop conforme o bloco.

**Por que desta forma / alternativa pior:** wHash é complementar ao pHash; remover um sem atualizar matching degradaria robustez perceptual.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 079 — wHash/pHash 32×32 e center crop
<code>            }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 080 — wHash/pHash 32×32 e center crop
<code>            if (typeof fpApi.calculatePHash === 'function') {</code>

**O que faz:** calcula pHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa a mesma base visual do wHash.

**Por que desta forma / alternativa pior:** calcular em resize diferente impediria comparar as métricas sob o mesmo conteúdo normalizado.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 081 — wHash/pHash 32×32 e center crop
<code>              pHashCrop = fpApi.calculatePHash(idCrop.data);</code>

**O que faz:** calcula pHash para a amostra 32×32 correspondente.

**Como faz:** faz feature detection e usa a mesma base visual do wHash.

**Por que desta forma / alternativa pior:** calcular em resize diferente impediria comparar as métricas sob o mesmo conteúdo normalizado.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 082 — wHash/pHash 32×32 e center crop
<code>            }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 083 — wHash/pHash 32×32 e center crop
<code>          }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO COM LACUNAS DE BORDA — o teste real verifica hashes principal/crop e argumentos exatos do crop 800×1200→quadrado central; não há caso focal para bitmap já quadrado nem para APIs parcialmente ausentes.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 084 — Hashes regionais 48×48 e liberação no sucesso
<code>        }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 085 — Hashes regionais 48×48 e liberação no sucesso
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 086 — Hashes regionais 48×48 e liberação no sucesso
<code>        let regionalHashes = null;</code>

**O que faz:** executa a instrução específica `let regionalHashes = null;` dentro de **Hashes regionais 48×48 e liberação no sucesso**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 087 — Hashes regionais 48×48 e liberação no sucesso
<code>        if (fpApi &amp;&amp; typeof fpApi.calculateRegionalHashes === 'function') {</code>

**O que faz:** calcula hashes dos cantos quando a API regional está disponível.

**Como faz:** usa buffer 48×48 normalizado.

**Por que desta forma / alternativa pior:** a feature detection mantém compatibilidade e evita transformar ausência opcional em falha total.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 088 — Hashes regionais 48×48 e liberação no sucesso
<code>          const oc48 = new OffscreenCanvas(48, 48);</code>

**O que faz:** normaliza para 48×48 antes dos hashes regionais.

**Como faz:** fornece resolução padronizada ao algoritmo de quatro regiões.

**Por que desta forma / alternativa pior:** usar dimensões variáveis tornaria distâncias regionais dependentes da resolução de origem.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 089 — Hashes regionais 48×48 e liberação no sucesso
<code>          const ctx48 = oc48.getContext('2d');</code>

**O que faz:** executa a instrução específica `const ctx48 = oc48.getContext('2d');` dentro de **Hashes regionais 48×48 e liberação no sucesso**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 090 — Hashes regionais 48×48 e liberação no sucesso
<code>          ctx48.drawImage(bitmap, 0, 0, 48, 48);</code>

**O que faz:** redesenha o bitmap no canvas normalizado deste bloco (`ctx48.drawImage(bitmap, 0, 0, 48, 48);`).

**Como faz:** usa drawImage como etapa de resize/crop no ambiente offscreen.

**Por que desta forma / alternativa pior:** hashear diretamente pixels da resolução original impediria comparação robusta entre versões redimensionadas da mesma página.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 091 — Hashes regionais 48×48 e liberação no sucesso
<code>          const id48 = ctx48.getImageData(0, 0, 48, 48);</code>

**O que faz:** extrai bytes RGBA do canvas normalizado.

**Como faz:** lê exatamente a área desenhada para alimentar algoritmo puro.

**Por que desta forma / alternativa pior:** algoritmos de hash precisam de buffer determinístico; depender do objeto Canvas os acoplaria ao ambiente gráfico.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 092 — Hashes regionais 48×48 e liberação no sucesso
<code>          regionalHashes = fpApi.calculateRegionalHashes(id48.data);</code>

**O que faz:** calcula hashes dos cantos quando a API regional está disponível.

**Como faz:** usa buffer 48×48 normalizado.

**Por que desta forma / alternativa pior:** a feature detection mantém compatibilidade e evita transformar ausência opcional em falha total.

**Evidência:** ✅ PROVADO — resultado regional e `bitmap.close()` no sucesso são verificados; visual suite valida propriedades dos hashes.

### Linha 093 — Log e resposta de sucesso
<code>        }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 094 — Log e resposta de sucesso
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 095 — Log e resposta de sucesso
<code>        bitmap.close();</code>

**O que faz:** libera explicitamente o recurso nativo ImageBitmap no caminho de sucesso.

**Como faz:** chama `close()` antes de zerar a referência.

**Por que desta forma / alternativa pior:** depender apenas de GC pode manter memória gráfica viva em worker que processa muitas páginas.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 096 — Log e resposta de sucesso
<code>        bitmap = null;</code>

**O que faz:** zera a referência após cleanup de sucesso.

**Como faz:** impede o `finally` de fechar o mesmo bitmap pela segunda vez.

**Por que desta forma / alternativa pior:** double-close pode ser tolerado em alguns ambientes, mas não deve ser requisito implícito do recurso.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 097 — Log e resposta de sucesso
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 098 — Log e resposta de sucesso
<code>        context.log('info', 'bg', 'VISUAL_FP_OK', 'Fingerprint visual-v3 calculado via SW', {</code>

**O que faz:** emite evento de sucesso `VISUAL_FP_OK`.

**Como faz:** usa logger do contexto do router e adiciona sinais de quais hashes foram produzidos.

**Por que desta forma / alternativa pior:** telemetria de capacidade ajuda diagnosticar diferenças de API sem serializar hashes inteiros.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 099 — Log e resposta de sucesso
<code>          url: url.slice(0, 80),</code>

**O que faz:** executa a instrução específica `url: url.slice(0, 80),` dentro de **Log e resposta de sucesso**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 100 — Log e resposta de sucesso
<code>          hasDHash: dHash !== null,</code>

**O que faz:** registra um booleano de presença do resultado correspondente.

**Como faz:** compara contra `null`, preservando distinção entre ausente e valor calculado.

**Por que desta forma / alternativa pior:** logar conteúdo completo dos hashes aumentaria ruído sem melhorar diagnóstico de capacidade.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 101 — Log e resposta de sucesso
<code>          hasWHash: wHash !== null,</code>

**O que faz:** registra um booleano de presença do resultado correspondente.

**Como faz:** compara contra `null`, preservando distinção entre ausente e valor calculado.

**Por que desta forma / alternativa pior:** logar conteúdo completo dos hashes aumentaria ruído sem melhorar diagnóstico de capacidade.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 102 — Log e resposta de sucesso
<code>          hasPHash: pHash !== null,</code>

**O que faz:** registra um booleano de presença do resultado correspondente.

**Como faz:** compara contra `null`, preservando distinção entre ausente e valor calculado.

**Por que desta forma / alternativa pior:** logar conteúdo completo dos hashes aumentaria ruído sem melhorar diagnóstico de capacidade.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 103 — Log e resposta de sucesso
<code>          hasCrop: wHashCrop !== null || pHashCrop !== null,</code>

**O que faz:** registra um booleano de presença do resultado correspondente.

**Como faz:** compara contra `null`, preservando distinção entre ausente e valor calculado.

**Por que desta forma / alternativa pior:** logar conteúdo completo dos hashes aumentaria ruído sem melhorar diagnóstico de capacidade.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 104 — Log e resposta de sucesso
<code>          hasRegional: regionalHashes !== null,</code>

**O que faz:** registra um booleano de presença do resultado correspondente.

**Como faz:** compara contra `null`, preservando distinção entre ausente e valor calculado.

**Por que desta forma / alternativa pior:** logar conteúdo completo dos hashes aumentaria ruído sem melhorar diagnóstico de capacidade.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 105 — Log e resposta de sucesso
<code>        });</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 106 — Log e resposta de sucesso
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 107 — Log e resposta de sucesso
<code>        return {</code>

**O que faz:** inicia retorno estruturado do handler.

**Como faz:** o router adiciona/normaliza `ok:true` ao resolver execução bem-sucedida.

**Por que desta forma / alternativa pior:** shape fixo simplifica consumidores e permite testes exatos.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 108 — Log e resposta de sucesso
<code>          pixelSample,</code>

**O que faz:** inclui `pixelSample` no payload de fingerprint.

**Como faz:** usa shorthand de propriedade para preservar exatamente o valor calculado.

**Por que desta forma / alternativa pior:** renomear/omitir campo quebraria consumidores/cache e contrato testado da resposta.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 109 — Log e resposta de sucesso
<code>          dHash,</code>

**O que faz:** inclui `dHash` no payload de fingerprint.

**Como faz:** usa shorthand de propriedade para preservar exatamente o valor calculado.

**Por que desta forma / alternativa pior:** renomear/omitir campo quebraria consumidores/cache e contrato testado da resposta.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 110 — Log e resposta de sucesso
<code>          wHash,</code>

**O que faz:** inclui `wHash` no payload de fingerprint.

**Como faz:** usa shorthand de propriedade para preservar exatamente o valor calculado.

**Por que desta forma / alternativa pior:** renomear/omitir campo quebraria consumidores/cache e contrato testado da resposta.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 111 — Log e resposta de sucesso
<code>          pHash,</code>

**O que faz:** inclui `pHash` no payload de fingerprint.

**Como faz:** usa shorthand de propriedade para preservar exatamente o valor calculado.

**Por que desta forma / alternativa pior:** renomear/omitir campo quebraria consumidores/cache e contrato testado da resposta.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 112 — Log e resposta de sucesso
<code>          wHashCrop,</code>

**O que faz:** inclui `wHashCrop` no payload de fingerprint.

**Como faz:** usa shorthand de propriedade para preservar exatamente o valor calculado.

**Por que desta forma / alternativa pior:** renomear/omitir campo quebraria consumidores/cache e contrato testado da resposta.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 113 — Log e resposta de sucesso
<code>          pHashCrop,</code>

**O que faz:** inclui `pHashCrop` no payload de fingerprint.

**Como faz:** usa shorthand de propriedade para preservar exatamente o valor calculado.

**Por que desta forma / alternativa pior:** renomear/omitir campo quebraria consumidores/cache e contrato testado da resposta.

**Evidência:** ✅ PROVADO — o teste principal compara o payload completo e exige evento `VISUAL_FP_OK`.

### Linha 114 — Falha, log e cleanup em finally
<code>          regionalHashes,</code>

**O que faz:** inclui `regionalHashes` no payload de fingerprint.

**Como faz:** usa shorthand de propriedade para preservar exatamente o valor calculado.

**Por que desta forma / alternativa pior:** renomear/omitir campo quebraria consumidores/cache e contrato testado da resposta.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 115 — Falha, log e cleanup em finally
<code>        };</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 116 — Falha, log e cleanup em finally
<code>      } catch (e) {</code>

**O que faz:** captura qualquer falha após entrar no pipeline protegido.

**Como faz:** converge rede, decode, canvas e algoritmo para uma resposta de erro uniforme.

**Por que desta forma / alternativa pior:** vários catches independentes tenderiam a esquecer cleanup ou produzir formatos incompatíveis.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 117 — Falha, log e cleanup em finally
<code>        context.log('warn', 'bg', 'VISUAL_FP_FAIL', `Falha no fingerprint visual-v3 via SW: ${e.message}`, {</code>

**O que faz:** registra falha de fingerprint com mensagem do erro.

**Como faz:** usa nível warn e URL truncada para contexto.

**Por que desta forma / alternativa pior:** sem log, falhas de decode/algoritmo seriam indistinguíveis para diagnóstico; URL inteira pode ser desnecessariamente ruidosa.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 118 — Falha, log e cleanup em finally
<code>          url: (request.url || '').slice(0, 80),</code>

**O que faz:** executa a instrução específica `url: (request.url || '').slice(0, 80),` dentro de **Falha, log e cleanup em finally**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 119 — Falha, log e cleanup em finally
<code>        });</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 120 — Falha, log e cleanup em finally
<code>        return { ok: false, error: e.message };</code>

**O que faz:** inicia retorno estruturado do handler.

**Como faz:** o router adiciona/normaliza `ok:true` ao resolver execução bem-sucedida.

**Por que desta forma / alternativa pior:** shape fixo simplifica consumidores e permite testes exatos.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 121 — Falha, log e cleanup em finally
<code>      } finally {</code>

**O que faz:** abre cleanup incondicional que roda em sucesso ou falha.

**Como faz:** executa depois de try/catch.

**Por que desta forma / alternativa pior:** garante liberação mesmo se hash lançar depois de o bitmap existir.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 122 — Falha, log e cleanup em finally
<code>        // Calculating a hash may fail after the decoded image has been created.</code>

**O que faz:** documenta a decisão local: “Calculating a hash may fail after the decoded image has been created.”.

**Como faz:** mantém a justificativa junto do código que ela explica.

**Por que desta forma / alternativa pior:** sem esse contexto, uma otimização futura poderia remover validação/cleanup acreditando ser redundante.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 123 — Falha, log e cleanup em finally
<code>        if (bitmap &amp;&amp; typeof bitmap.close === 'function') {</code>

**O que faz:** verifica se existe bitmap ainda não limpo e se ele suporta `close`.

**Como faz:** feature-detecta o método antes de chamar.

**Por que desta forma / alternativa pior:** stubs/ambientes incompletos não devem transformar cleanup em nova exceção que masque o erro original.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 124 — Falha, log e cleanup em finally
<code>          bitmap.close();</code>

**O que faz:** libera explicitamente o recurso nativo ImageBitmap no caminho de sucesso.

**Como faz:** chama `close()` antes de zerar a referência.

**Por que desta forma / alternativa pior:** depender apenas de GC pode manter memória gráfica viva em worker que processa muitas páginas.

**Evidência:** ✅ PROVADO COM LACUNA DE ORIGEM — o teste força erro em `calculateWHash`, exige payload de erro, `VISUAL_FP_FAIL` e `close()` uma vez; outros pontos de falha usam o mesmo catch mas não têm casos separados.

**⚠️ Comentário extra de prova:** esta linha/faixa não deve ser tratada como 100% provada além do cenário explicitamente descrito acima; os casos ausentes permanecem risco documentado.

### Linha 125 — Fechamento do registro IIFE
<code>        }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ EXECUTADO — `loadAction` exige que o módulo registre a action no router para todos os testes passarem.

### Linha 126 — Fechamento do registro IIFE
<code>      }</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ EXECUTADO — `loadAction` exige que o módulo registre a action no router para todos os testes passarem.

### Linha 127 — Fechamento do registro IIFE
<code>    },</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ EXECUTADO — `loadAction` exige que o módulo registre a action no router para todos os testes passarem.

### Linha 128 — Fechamento do registro IIFE
<code>  });</code>

**O que faz:** fecha a estrutura sintática iniciada nas linhas anteriores.

**Como faz:** preserva escopo de try, handler, descriptor ou IIFE.

**Por que desta forma / alternativa pior:** alterar o fechamento pode deslocar cleanup/retorno para escopo incorreto e mudar comportamento assíncrono.

**Evidência:** ✅ EXECUTADO — `loadAction` exige que o módulo registre a action no router para todos os testes passarem.

### Linha 129 — Fechamento do registro IIFE
<code>})(typeof self !== 'undefined' ? self : globalThis);</code>

**O que faz:** executa a instrução específica `})(typeof self !== 'undefined' ? self : globalThis);` dentro de **Fechamento do registro IIFE**.

**Como faz:** usa valores produzidos nas linhas vizinhas para avançar a etapa atual do pipeline.

**Por que desta forma / alternativa pior:** a ordem é parte do contrato de validação→rede→decode→normalização→hash→cleanup; mover a instrução sem preservar dependências pode gerar hash inválido ou vazamento.

**Evidência:** ✅ EXECUTADO — `loadAction` exige que o módulo registre a action no router para todos os testes passarem.

### Linha 130 — Fechamento do registro IIFE
<code>␠ [linha vazia]</code>

**O que faz:** separa etapas sem efeito de runtime.

**Como faz:** não executa expressão; preserva legibilidade entre blocos.

**Por que desta forma / alternativa pior:** juntar blocos reduziria clareza ao revisar recursos e cleanup.

**Evidência:** ✅ EXECUTADO — `loadAction` exige que o módulo registre a action no router para todos os testes passarem.

## 5. Invariantes

1. Nunca fazer `fetch` antes de validar URL e protocolo.
2. Continuar omitindo credenciais em fetch de imagem externa.
3. Preservar o shape estável da resposta, inclusive `null` para algoritmos ausentes.
4. wHash e pHash principais devem continuar compartilhando o mesmo resize 32×32.
5. center crop deve permanecer realmente central e apenas para imagens retangulares válidas.
6. `bitmap.close()` precisa ocorrer exatamente uma vez em sucesso e também ocorrer após falha posterior à decodificação.
7. Falhas devem retornar payload serializável e produzir evento `VISUAL_FP_FAIL`.

## 6. Resultado

- Fonte integral reproduzida: **SIM**.
- Todas as linhas comentadas: **SIM**.
- Teste real distinguido de simulação visual: **SIM**.
- Lacunas explicitamente mantidas: **SIM**.
- Arquivo apto a `CONCLUÍDO`: **NÃO — REVISÃO DE QUALIDADE OBRIGATÓRIA**.

**Próximo arquivo após atualizar o rastreador:** `extension/background/actions/check-extraction-tab.js`.
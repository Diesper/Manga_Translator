# Bíblia técnica — `extension/content/gemini/image-quarantine.js`

> **Estado:** 🟠 EM ANDAMENTO — GPT-5.6-Sol#F — REVISÃO DE QUALIDADE EM CURSO  
> **SHA auditado:** `ddca93d17ca2934a9e95dba96a87283be4e9b9a3`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#F`  
> **Tipo:** JavaScript de runtime/content script Gemini + módulo CommonJS de teste  
> **Linhas textuais:** **215**  
> **Posições documentais:** **216** contando o newline final  
> **PR / branch:** `#66` / `docs/project-bible`

## 1. Papel arquitetural

`image-quarantine.js` é a barreira anti-“eco da entrada” do pipeline Gemini. O risco que ele reduz é o fluxo confundir o preview/anexo enviado ao Gemini com a imagem traduzida produzida pelo modelo. Para isso usa duas famílias independentes de sinais:

1. **estrutura DOM** — rejeita imagens localizadas em turno do usuário, preview/attachment ou composer;
2. **identidade byte-a-byte** — calcula SHA-256 dos bytes decodificados da Data URL e bloqueia quando o candidato é exatamente igual à entrada.

O módulo **não** decide autoria completa do modelo, não extrai imagem, não persiste job, não envia mensagens e não toca em storage. Ele fornece primitives para `observer.js` e `job-runner.js`.

A similaridade perceptual é explicitamente **telemetria**: mesmo quando um avaliador diz que duas imagens são semelhantes, `assessExtractedResult` só define `quarantined:true` por motivo estrutural ou igualdade exata. Isso evita transformar uma heurística de visão em bloqueio de uma tradução válida.

## 2. Runtime, carga e lifecycle

No browser, `extension/manifest.json` injeta os módulos Gemini nesta ordem relevante:

`selectors.js → dom.js → image-quarantine.js → observer.js → ... → job-runner.js → content_gemini.js`.

Assim, quando esta IIFE roda, `MangaTranslatorGeminiDom` normalmente já existe no global. Depois ela publica `MangaTranslatorGeminiImageQuarantine`, que é consumida pelos módulos seguintes.

No Jest, o mesmo arquivo suporta CommonJS. `tests/unit/content-gemini/image-quarantine.test.js` requer o arquivo real e chama sua factory. `job-runner.js` e `observer.js` também possuem fallback `require('./image-quarantine.js')`, de modo que seus testes de consumidor exercitam a implementação real quando não é injetado um double.

Este não é um Service Worker MV3; é código de content script na página Gemini. Portanto, os riscos principais são DOM dinâmico, Shadow DOM, custo de CPU na thread do documento e mudanças de markup — não suspensão do worker.

## 3. Dependências e consumidores verificados

### Dependências

- `extension/content/gemini/dom.js`: fornece `getStrictModelResponseContainer`, `getUserTurnContainer` e `isInsideInputArea`.
- Web Platform: `Element.matches`, `parentElement`, `getRootNode`, `Uint8Array`, `TextEncoder`, `atob`, `crypto.subtle.digest`.
- CommonJS opcional: `require('./dom.js')` e `module.exports`.

### Consumidores reais

- `extension/content/gemini/job-runner.js`
  - linha 20: cria a quarentena por default;
  - linhas 284 e 321: `isStructurallyInput` elimina input tanto da seleção automática quanto manual;
  - linha 836: pré-calcula o hash da entrada;
  - linha 1345: executa `assessExtractedResult` antes de persistir/entregar;
  - linhas 1354–1364: transforma quarentena em `GEMINI_RESULT_MATCHES_INPUT`.
- `extension/content/gemini/observer.js`
  - linha 74: cria a quarentena quando não há instância injetada;
  - linha 375: usa `classifyStructuralInput` para rejeitar candidatos estruturais e registrar o motivo.
- `extension/content/content_gemini.js`
  - linhas 217–219: cria uma instância real;
  - linha 227: injeta essa mesma instância no job runner.
- `extension/manifest.json`
  - linha 62: carrega este arquivo depois de `dom.js` e antes de observer/job-runner/content_gemini.
- `tests/helpers/load-content-gemini-module.js`
  - linhas 6 e 18: inclui o módulo no harness antes dos consumidores.

## 4. Fluxo de dados e efeitos colaterais

Entrada típica:

`job.srcData (Data URL original) → computeExactHash → inputImageHash`

Depois:

`element candidato + extraction.dataUrl + inputDataUrl/inputHash → assessExtractedResult`.

Saída de `assessExtractedResult`:

- `quarantined`: decisão booleana;
- `reason`: `user_turn`, `attachment_preview`, `composer`, `exact_payload_match` ou `null`;
- `exactMatch`: informa se o bloqueio/resultado veio de igualdade de hash;
- `perceptual`: telemetria opcional.

Efeitos colaterais locais do arquivo:

- publica `scope.MangaTranslatorGeminiImageQuarantine`;
- opcionalmente publica `module.exports`;
- não usa `chrome.*`;
- não lê/escreve storage;
- não envia rede;
- não registra listeners/timers;
- não remove nem altera nós DOM.

## 5. Segurança, privacidade e trust boundaries

A fronteira principal é **candidato de resultado versus entrada do usuário**. O DOM do Gemini é mutável e não deve ser tratado como autoria confiável por um único seletor; por isso o módulo combina classificação estrutural e identidade exata.

O SHA-256 aqui não autentica origem e não é segredo. Ele é somente uma assinatura de identidade dos bytes. O hash da imagem não é persistido nem enviado por este módulo; `job-runner.js` registra apenas que o algoritmo foi preparado, não o valor do hash.

A ordem de `classifyStructuralInput` importa:

- resposta estrita do modelo vence seletores amplos de preview, reduzindo falso positivo;
- turno do usuário vence attachment/composer como motivo mais semântico;
- attachment é procurado atravessando Shadow DOM;
- composer é fallback estrutural adicional.

A comparação exata não protege contra uma cópia recomprimida/reescalada da entrada; nesse cenário os bytes mudam. O desenho atual prefere não bloquear por similaridade perceptual para evitar falso positivo.

## 6. Algoritmo SHA-256 fallback

O fallback implementa as fases padrão do SHA-256:

1. cópia dos bytes e comprimento em bits;
2. padding `0x80 + zeros + comprimento 64-bit big-endian`;
3. 64 constantes K e oito valores iniciais;
4. leitura de 16 palavras big-endian;
5. expansão para 64 palavras;
6. 64 rodadas com `Ch`, `Maj`, Σ0/Σ1 e σ0/σ1;
7. acumulação módulo 2³²;
8. serialização em 64 caracteres hexadecimais.

Ele existe para compatibilidade. Em runtime com `crypto.subtle.digest`, o caminho nativo é preferido e assíncrono.

## 7. Casos-limite e comportamento de erro

- `null`/elemento ausente: não recebe motivo estrutural.
- Data URL sem `data:image/` ou sem vírgula: erro explícito.
- Base64 sem `atobImpl`: erro explícito.
- Base64 com whitespace: whitespace é removido antes do decode.
- Payload não-Base64: usa percent-decoding e `TextEncoder` quando disponível.
- Erro de `getRootNode`: tratado como fim seguro da travessia.
- Erro do `perceptualEvaluator`: ignorado; `perceptual` permanece `null`.
- `inputHash` truthy evita recalcular a entrada.
- Sem `inputHash` e sem `inputDataUrl`: o cálculo falha explicitamente; o consumer atual decide como degradar.
- Resultado estrutural: retorna antes de decodificar candidato, portanto pode bloquear um preview mesmo sem Data URL válida.

## 8. Evidência automatizada — classificação conservadora

### `tests/unit/content-gemini/image-quarantine.test.js` — SHA `b2c73b79c8824e5507e436a75ec9abc663919c6b`

| Caso | O que a assertion realmente prova | Classificação |
|---|---|---|
| QUA-01, linhas 38–47 | módulo real, com `cryptoImpl:null`, produz o mesmo hash para bytes iguais apesar de MIME diferente e formato de 64 hex | ✅ PROVADO DIRETAMENTE para byte-based/fallback; **não** prova vetor SHA-256 conhecido |
| QUA-02, 49–62 | candidato idêntico a hash pré-calculado retorna `quarantined:true`, `exactMatch:true`, `exact_payload_match` | ✅ PROVADO DIRETAMENTE |
| QUA-03, 64–75 | payload diferente com hash da entrada calculado internamente não é bloqueado | ✅ PROVADO DIRETAMENTE |
| QUA-04, 77–92 | resultado perceptual semelhante é retornado como telemetria, mas não bloqueia bytes diferentes; evaluator chamado 1 vez | ✅ PROVADO DIRETAMENTE |
| QUA-05, 94–105 | preview, composer e user turn reais no jsdom recebem os três motivos e `isStructurallyInput:true` | ✅ PROVADO DIRETAMENTE |
| QUA-06, 107–118 | `closestComposed` encontra `file-preview` atravessando ShadowRoot aberto | ✅ PROVADO DIRETAMENTE |
| QUA-07, 120–131 | model response estrito prevalece sobre descendant `.image-preview` e retorna `null` | ✅ PROVADO DIRETAMENTE |
| QUA-08, 133–138 | URL HTTP comum rejeita com erro de Data URL de imagem | ✅ PROVADO DIRETAMENTE |

### Consumidores reais

- `tests/unit/content-gemini/job-runner.test.js` — SHA `feae92421dd98e682caf3f970ba7ff86b8b6aa4a`
  - RUN-09: a seleção automática e manual, usando a quarentena real default do runner, recusa imagem em `file-preview`. **✅ PROVADO DIRETAMENTE NO CONSUMIDOR.**
  - RUN-10: pipeline real do runner com entrada/candidato idênticos termina em `GEMINI_RESULT_MATCHES_INPUT`, não envia `GEMINI_IMAGE_EXTRACTED` e envia `GEMINI_ERROR`. **✅ PROVADO DIRETAMENTE NO CONSUMIDOR.**
  - RUN-11: bytes diferentes passam e `GEMINI_IMAGE_EXTRACTED` contém a Data URL traduzida. **✅ PROVADO DIRETAMENTE NO CONSUMIDOR.**
- `tests/unit/content-gemini/observer.test.js` — SHA `0eff259f673c32e44c6d5ccf6f627c0c6d5505cc`
  - OBS-15: clone no turno do usuário é rejeitado com `reason:'user_turn'`. **✅ PROVADO DIRETAMENTE NO CONSUMIDOR.**
  - OBS-17: preview reconstruído dentro de Shadow DOM é rejeitado com `reason:'attachment_preview'`. **✅ PROVADO DIRETAMENTE NO CONSUMIDOR.**
- `scripts/validation/verify-repository-structure.js` — SHA `c4509784d71a0f52dc98e822159ffd6b45b0cd7d`
  - compara exatamente a lista de `manifest.content_scripts`, incluindo a posição deste módulo entre `dom.js` e `observer.js`. **🟦 GATE ESTÁTICO ESPECÍFICO** para path/ordem de carga, não para lógica da quarentena.

## 9. ⚠️ Lacunas de teste probatório específico

1. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — Web Crypto nativo.** QUA-01 injeta `cryptoImpl:null`; falta fake de `subtle.digest` ou teste browser que prove a conversão `ArrayBuffer → hex`. Regressão: caminho de produção pode quebrar enquanto o fallback continua verde.
2. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — vetor SHA-256 canônico do fallback.** QUA-01 prova consistência, independência de MIME e shape 64-hex, mas uma implementação hash internamente consistente e matematicamente errada ainda poderia passar. Teste necessário: `sha256BytesFallback([])`, `abc` e/ou bytes conhecidos contra digest canônico.
3. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — Data URL não-Base64.** Faltam percent-encoded ASCII, UTF-8 com `TextEncoder` e fallback sem `TextEncoder`. Regressão: hash divergente por ambiente.
4. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — Base64 sem `atobImpl`.** Falta provar a mensagem `Decodificador base64 indisponível`.
5. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — payload codificado inválido.** Exceções do decoder podem mudar ou ser mascaradas.
6. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — falha do `perceptualEvaluator`.** O contrato atual é fail-open da telemetria, preservando decisão por hash.
7. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — formato de `inputHash`.** Um caller pode fornecer qualquer string truthy; o consumer atual fornece hash interno confiável, mas falta teste/guard de formato para uso isolado.
8. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — variantes restantes de `ATTACHMENT_SELECTOR`.** QUA-05/06 cobrem `file-preview`; não há assertions focais para `attachment-card`, data attributes e classes restantes.
9. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — exceção de `getRootNode`.** O catch existe, mas não há prova de que retorna miss sem crash.
10. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — factory sem DOM.** Falta assertion do erro `ImageQuarantine requer o módulo Gemini DOM`.
11. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — publicação browser global.** CommonJS é provado pelo `require`; o manifest/gate prova ordem do arquivo, não que o global foi publicado corretamente.
12. ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO — imagem muito grande/performance do fallback.** O fallback é O(n) e síncrono; falta limite/benchmark que detecte jank ou uso de memória excessivo.

## 10. Análise crítica e riscos

### 10.1 Fail-open do hash no consumidor

`job-runner.js` captura falha ao calcular/comparar hash e registra `GEMINI_QUARANTINE_HASH_UNAVAILABLE`; o fluxo continua com filtros estruturais. Isso preserva disponibilidade, mas significa que uma cópia byte-a-byte pode escapar se:

- o hashing falhar; **e**
- o elemento não for reconhecido estruturalmente como input.

Não é bug comprovado neste arquivo; é um trade-off arquitetural relevante do consumidor.

### 10.2 Custo do fallback na thread do content script

`sha256BytesFallback` é síncrono e percorre toda a imagem. Para Data URLs grandes, o decode já aloca bytes e o fallback cria outra cópia `Array.from`, além do padding. Em navegadores normais Web Crypto deve ser preferido, mas ausência de `subtle` pode causar jank.

### 10.3 Encoding não-Base64 sem TextEncoder

A linha 130 usa `character.charCodeAt(0) & 0xFF`. Para caracteres não-ASCII, isso não equivale a UTF-8 produzido por `TextEncoder`. Assim, a mesma Data URL textual não-Base64 pode receber digest diferente entre ambientes com/sem TextEncoder. Imagens raster do fluxo atual são tipicamente Base64, mas a divergência é real e está sem teste.

### 10.4 Seletor amplo e precedência de model response

`[data-testid*="preview"]` e `.image-preview` são deliberadamente amplos. A linha 144 reduz falso positivo liberando qualquer elemento dentro de `getStrictModelResponseContainer` antes desses seletores. Essa ordem é um invariante: invertê-la pode bloquear respostas válidas.

### 10.5 Hash exato não detecta equivalência visual

Recompressão, resize ou metadata incorporada podem alterar bytes de uma imagem visualmente igual. O avaliador perceptual poderia detectar semelhança, mas o desenho atual não o usa para bloquear. Isso evita falso positivo, porém deixa uma classe de “eco visual” fora da garantia exata.

## 11. Invariantes

1. Resposta estrita do modelo deve continuar tendo precedência sobre seletores genéricos de preview.
2. Turno do usuário, attachment preview e composer devem continuar excluídos da seleção de resultado.
3. A travessia de attachment deve continuar atravessando Shadow DOM por `root.host`.
4. O hash deve ser calculado sobre **bytes decodificados**, nunca sobre cabeçalho MIME ou string Data URL completa.
5. MIME diferente com payload igual deve produzir a mesma assinatura.
6. `assessExtractedResult` deve bloquear estruturalmente antes de exigir hash.
7. `perceptualEvaluator` não deve, sozinho, transformar `quarantined` em `true` sem mudança explícita de contrato/testes.
8. Falha de telemetria perceptual não deve abortar a comparação exata.
9. Browser global e CommonJS devem exportar a mesma API real.
10. O caminho nativo Web Crypto e o fallback devem permanecer semanticamente equivalentes.
11. O módulo não deve introduzir rede/storage/log de payload de imagem.
12. `job-runner` deve continuar bloqueando igualdade exata antes de `GEMINI_IMAGE_EXTRACTED`.

## 12. Unidades estruturais

- **U01 — linhas 1–9: Modo estrito, IIFE e resolução do DOM.** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.
- **U02 — linhas 10–22: Seletores estruturais de preview/anexo.** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.
- **U03 — linhas 23–36: Travessia composta através de Shadow DOM.** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.
- **U04 — linhas 37–40: Serialização hexadecimal de bytes.** Converte uma sequência de bytes em pares hexadecimais minúsculos, preenchendo cada byte para duas posições.
- **U05 — linhas 41–55: Padding e comprimento do SHA-256 fallback.** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.
- **U06 — linhas 56–68: Constantes, estado inicial e message schedule.** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.
- **U07 — linhas 69–86: Carga do bloco e expansão das 64 palavras.** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².
- **U08 — linhas 87–102: 64 rodadas de compressão e acumulação.** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².
- **U09 — linhas 103–107: Formatação do digest fallback.** Concatena h0..h7 como oito palavras hexadecimais de oito caracteres, totalizando 64 dígitos.
- **U10 — linhas 108–131: Decodificação de Data URL em bytes.** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.
- **U11 — linhas 132–140: Factory e injeção de dependências.** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.
- **U12 — linhas 141–150: Classificação estrutural da origem da imagem.** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.
- **U13 — linhas 151–154: Predicate booleano para consumidores.** `isStructurallyInput` reduz o motivo detalhado de `classifyStructuralInput` a booleano.
- **U14 — linhas 155–163: Hash exato com Web Crypto e fallback.** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.
- **U15 — linhas 164–180: Avaliação — curto-circuito estrutural.** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.
- **U16 — linhas 181–195: Avaliação — identidade exata e telemetria perceptual.** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.
- **U17 — linhas 196–204: API da instância de quarentena.** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.
- **U18 — linhas 205–215: API do módulo e export dual.** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.
- **U19 — linhas 216–216: Newline terminal.** A posição final representa o newline que encerra fisicamente o arquivo.

## 13. Fonte integral

```javascript
'use strict';
// gemini/image-quarantine.js — impede que o anexo de entrada seja entregue
// como se fosse a imagem gerada pelo Gemini.

(function(scope) {
  let domApi = scope.MangaTranslatorGeminiDom || null;
  if (!domApi && typeof require === 'function') {
    try { domApi = require('./dom.js'); } catch (_e) {}
  }

  const ATTACHMENT_SELECTOR = [
    'file-preview',
    'attachment-card',
    '[data-test-id*="attachment"]',
    '[data-testid*="attachment"]',
    '[data-test-id*="preview"]',
    '[data-testid*="preview"]',
    '.file-preview',
    '.attachment-preview',
    '.image-preview',
    '.attachment-container',
  ].join(', ');

  function closestComposed(element, selector) {
    for (let current = element; current;) {
      if (current.matches?.(selector)) return current;
      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }
      let root = null;
      try { root = current.getRootNode?.(); } catch (_e) {}
      current = root?.host || null;
    }
    return null;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function sha256BytesFallback(inputBytes) {
    const bytes = Array.from(inputBytes || []);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    [high, low].forEach(word => bytes.push(
      (word >>> 24) & 0xFF,
      (word >>> 16) & 0xFF,
      (word >>> 8) & 0xFF,
      word & 0xFF
    ));

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
      for (let index = 0; index < 16; index += 1) {
        const at = offset + index * 4;
        words[index] = (
          (bytes[at] << 24) |
          (bytes[at + 1] << 16) |
          (bytes[at + 2] << 8) |
          bytes[at + 3]
        ) >>> 0;
      }
      for (let index = 16; index < 64; index += 1) {
        const x = words[index - 15];
        const y = words[index - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let index = 0; index < 64; index += 1) {
        const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const choose = (e & f) ^ (~e & g);
        const temp1 = (h + s1 + choose + constants[index] + words[index]) >>> 0;
        const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + majority) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    return [h0, h1, h2, h3, h4, h5, h6, h7]
      .map(word => word.toString(16).padStart(8, '0'))
      .join('');
  }

  function decodeDataUrl(dataUrl, { atobImpl, TextEncoderImpl } = {}) {
    const raw = String(dataUrl || '');
    const commaIndex = raw.indexOf(',');
    if (!raw.startsWith('data:image/') || commaIndex < 0) {
      throw new Error('Quarentena requer data URL de imagem válida');
    }

    const header = raw.slice(0, commaIndex);
    const payload = raw.slice(commaIndex + 1);
    if (/;base64(?:;|$)/i.test(header)) {
      if (typeof atobImpl !== 'function') throw new Error('Decodificador base64 indisponível');
      const binary = atobImpl(payload.replace(/\s+/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index) & 0xFF;
      }
      return bytes;
    }

    const decoded = decodeURIComponent(payload);
    if (typeof TextEncoderImpl === 'function') return new TextEncoderImpl().encode(decoded);
    return Uint8Array.from(decoded, character => character.charCodeAt(0) & 0xFF);
  }

  function createImageQuarantine({
    dom = domApi,
    cryptoImpl = scope.crypto,
    atobImpl = typeof scope.atob === 'function' ? scope.atob.bind(scope) : null,
    TextEncoderImpl = scope.TextEncoder,
    perceptualEvaluator = null,
  } = {}) {
    if (!dom) throw new Error('ImageQuarantine requer o módulo Gemini DOM');

    function classifyStructuralInput(element) {
      if (!element) return null;
      if (dom.getStrictModelResponseContainer?.(element)) return null;
      if (dom.getUserTurnContainer?.(element)) return 'user_turn';
      const attachment = closestComposed(element, ATTACHMENT_SELECTOR);
      if (attachment) return 'attachment_preview';
      if (dom.isInsideInputArea?.(element)) return 'composer';
      return null;
    }

    function isStructurallyInput(element) {
      return Boolean(classifyStructuralInput(element));
    }

    async function computeExactHash(dataUrl) {
      const bytes = decodeDataUrl(dataUrl, { atobImpl, TextEncoderImpl });
      if (cryptoImpl?.subtle?.digest) {
        const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
        return bytesToHex(new Uint8Array(digest));
      }
      return sha256BytesFallback(bytes);
    }

    async function assessExtractedResult({
      element = null,
      candidateDataUrl,
      inputDataUrl = null,
      inputHash = null,
    } = {}) {
      const structuralReason = classifyStructuralInput(element);
      if (structuralReason) {
        return {
          quarantined: true,
          reason: structuralReason,
          exactMatch: false,
          perceptual: null,
        };
      }

      const resolvedInputHash = inputHash || await computeExactHash(inputDataUrl);
      const candidateHash = await computeExactHash(candidateDataUrl);
      let perceptual = null;
      if (typeof perceptualEvaluator === 'function') {
        try {
          perceptual = await perceptualEvaluator({ inputDataUrl, candidateDataUrl });
        } catch (_e) {}
      }
      const exactMatch = resolvedInputHash === candidateHash;
      return {
        quarantined: exactMatch,
        reason: exactMatch ? 'exact_payload_match' : null,
        exactMatch,
        perceptual,
      };
    }

    return {
      classifyStructuralInput,
      isStructurallyInput,
      computeExactHash,
      assessExtractedResult,
    };
  }

  const api = {
    ATTACHMENT_SELECTOR,
    closestComposed,
    decodeDataUrl,
    sha256BytesFallback,
    createImageQuarantine,
  };
  scope.MangaTranslatorGeminiImageQuarantine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

## 14. Mapa integral de posições

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 1 | U01 | 'use strict'; | Ativa `strict mode`, evitando semântica permissiva antes da inicialização do módulo. |
| 2 | U01 | // gemini/image-quarantine.js — impede que o anexo de entrada seja entregue | Documenta a finalidade do arquivo: impedir que o anexo de entrada seja devolvido como resultado Gemini. |
| 3 | U01 | // como se fosse a imagem gerada pelo Gemini. | Completa o comentário de contrato, explicitando o falso resultado que a quarentena combate. |
| 4 | U01 | ␠ [linha vazia] | Separador visual dentro de U01 (“Modo estrito, IIFE e resolução do DOM”); não altera estado, mas delimita a unidade sem esconder a posição 4. |
| 5 | U01 | (function(scope) { | Abre a IIFE que encapsula helpers/estado e recebe a superfície global do ambiente. |
| 6 | U01 |   let domApi = scope.MangaTranslatorGeminiDom \|\| null; | Prefere a API DOM já publicada por módulos carregados anteriormente no content script. |
| 7 | U01 |   if (!domApi && typeof require === 'function') { | Só habilita fallback CommonJS quando a API DOM global não foi resolvida e `require` existe. |
| 8 | U01 |     try { domApi = require('./dom.js'); } catch (_e) {} | Tenta carregar `./dom.js`; a falha é absorvida para que a factory faça o fail-fast explícito depois. |
| 9 | U01 |   } | Fecha a estrutura sintática aberta em U01, preservando o escopo/retorno definido pela unidade “Modo estrito, IIFE e resolução do DOM”. |
| 10 | U02 | ␠ [linha vazia] | Separador visual dentro de U02 (“Seletores estruturais de preview/anexo”); não altera estado, mas delimita a unidade sem esconder a posição 10. |
| 11 | U02 |   const ATTACHMENT_SELECTOR = [ | Inicia a lista canônica de seletores usados para reconhecer ancestors de attachment/preview. |
| 12 | U02 |     'file-preview', | Reconhece o custom element `file-preview` usado como contêiner de preview de arquivo. |
| 13 | U02 |     'attachment-card', | Reconhece o custom element `attachment-card` como superfície de anexo. |
| 14 | U02 |     '[data-test-id*="attachment"]', | Aceita qualquer elemento cujo `data-test-id` contenha `attachment`, cobrindo variantes de teste/DOM. |
| 15 | U02 |     '[data-testid*="attachment"]', | Aceita a grafia `data-testid` contendo `attachment`, variante comum do atributo anterior. |
| 16 | U02 |     '[data-test-id*="preview"]', | Reconhece `data-test-id` contendo `preview` para variantes de preview. |
| 17 | U02 |     '[data-testid*="preview"]', | Reconhece `data-testid` contendo `preview` na segunda convenção de atributo. |
| 18 | U02 |     '.file-preview', | Reconhece a classe `.file-preview`. |
| 19 | U02 |     '.attachment-preview', | Reconhece a classe `.attachment-preview`. |
| 20 | U02 |     '.image-preview', | Reconhece `.image-preview`; por ser amplo, ele é mitigado pela precedência de model response em `classifyStructuralInput`. |
| 21 | U02 |     '.attachment-container', | Reconhece `.attachment-container` como ancestor de attachment. |
| 22 | U02 |   ].join(', '); | Une as alternativas em um único seletor CSS separado por vírgulas. |
| 23 | U03 | ␠ [linha vazia] | Separador visual dentro de U03 (“Travessia composta através de Shadow DOM”); não altera estado, mas delimita a unidade sem esconder a posição 23. |
| 24 | U03 |   function closestComposed(element, selector) { | Declara helper que procura um ancestor em árvore DOM composta, inclusive atravessando Shadow DOM. |
| 25 | U03 |     for (let current = element; current;) { | Itera do elemento inicial para ancestors/hosts até não existir próximo nó. |
| 26 | U03 |       if (current.matches?.(selector)) return current; | Retorna imediatamente o primeiro nó cujo `matches(selector)` seja verdadeiro; optional chaining tolera objetos sem `matches`. |
| 27 | U03 |       if (current.parentElement) { | Prioriza subir por `parentElement` quando ainda está dentro da mesma árvore DOM. |
| 28 | U03 |         current = current.parentElement; | Avança para o pai elemento do nó atual. |
| 29 | U03 |         continue; | Reinicia o laço sem consultar ShadowRoot enquanto um pai normal existir. |
| 30 | U03 |       } | Fecha a estrutura sintática aberta em U03, preservando o escopo/retorno definido pela unidade “Travessia composta através de Shadow DOM”. |
| 31 | U03 |       let root = null; | Inicializa o root como `null` antes de tentar cruzar a fronteira da árvore. |
| 32 | U03 |       try { root = current.getRootNode?.(); } catch (_e) {} | Obtém `getRootNode()` defensivamente; exceção é absorvida para transformar travessia impossível em miss, não crash. |
| 33 | U03 |       current = root?.host \|\| null; | Se o root for ShadowRoot, continua pelo `host`; sem host encerra a subida. |
| 34 | U03 |     } | Fecha a estrutura sintática aberta em U03, preservando o escopo/retorno definido pela unidade “Travessia composta através de Shadow DOM”. |
| 35 | U03 |     return null; | Sinaliza que nenhum ancestor composto correspondeu ao seletor. |
| 36 | U03 |   } | Fecha a estrutura sintática aberta em U03, preservando o escopo/retorno definido pela unidade “Travessia composta através de Shadow DOM”. |
| 37 | U04 | ␠ [linha vazia] | Separador visual dentro de U04 (“Serialização hexadecimal de bytes”); não altera estado, mas delimita a unidade sem esconder a posição 37. |
| 38 | U04 |   function bytesToHex(bytes) { | Declara helper privado que converte bytes de digest em hexadecimal. |
| 39 | U04 |     return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); | Transforma cada byte em base 16, garante dois dígitos e concatena sem separador. |
| 40 | U04 |   } | Fecha a estrutura sintática aberta em U04, preservando o escopo/retorno definido pela unidade “Serialização hexadecimal de bytes”. |
| 41 | U05 | ␠ [linha vazia] | Separador visual dentro de U05 (“Padding e comprimento do SHA-256 fallback”); não altera estado, mas delimita a unidade sem esconder a posição 41. |
| 42 | U05 |   function sha256BytesFallback(inputBytes) { | Inicia implementação síncrona de SHA-256 usada quando Web Crypto não está disponível. |
| 43 | U05 |     const bytes = Array.from(inputBytes \|\| []); | Copia `inputBytes` para array mutável; `null`/`undefined` vira sequência vazia. |
| 44 | U05 |     const bitLength = bytes.length * 8; | Calcula o comprimento original em bits antes de adicionar padding. |
| 45 | U05 |     bytes.push(0x80); | Anexa o bit inicial do padding SHA-256 como byte `0x80`. |
| 46 | U05 |     while ((bytes.length % 64) !== 56) bytes.push(0); | Adiciona zeros até restarem 8 bytes no bloco final para o comprimento de 64 bits. |
| 47 | U05 |     const high = Math.floor(bitLength / 0x100000000); | Calcula a metade alta do comprimento em bits em unidades de 32 bits. |
| 48 | U05 |     const low = bitLength >>> 0; | Extrai a metade baixa unsigned de 32 bits do comprimento. |
| 49 | U05 |     [high, low].forEach(word => bytes.push( | Itera pelas palavras alta e baixa do comprimento para serializá-las em big-endian. |
| 50 | U05 |       (word >>> 24) & 0xFF, | Anexa o byte mais significativo de cada palavra do comprimento. |
| 51 | U05 |       (word >>> 16) & 0xFF, | Anexa o segundo byte da palavra do comprimento. |
| 52 | U05 |       (word >>> 8) & 0xFF, | Anexa o terceiro byte da palavra do comprimento. |
| 53 | U05 |       word & 0xFF | Anexa o byte menos significativo da palavra do comprimento. |
| 54 | U05 |     )); | Fecha a estrutura sintática aberta em U05, preservando o escopo/retorno definido pela unidade “Padding e comprimento do SHA-256 fallback”. |
| 55 | U05 | ␠ [linha vazia] | Separador visual dentro de U05 (“Padding e comprimento do SHA-256 fallback”); não altera estado, mas delimita a unidade sem esconder a posição 55. |
| 56 | U06 |     const constants = [ | Abre o vetor das 64 constantes K do SHA-256, uma por rodada. |
| 57 | U06 |       0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, | Declara K[0..7] do SHA-256. |
| 58 | U06 |       0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, | Declara K[8..15] do SHA-256. |
| 59 | U06 |       0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, | Declara K[16..23] do SHA-256. |
| 60 | U06 |       0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, | Declara K[24..31] do SHA-256. |
| 61 | U06 |       0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, | Declara K[32..39] do SHA-256. |
| 62 | U06 |       0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, | Declara K[40..47] do SHA-256. |
| 63 | U06 |       0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, | Declara K[48..55] do SHA-256. |
| 64 | U06 |       0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2, | Declara K[56..63] do SHA-256. |
| 65 | U06 |     ]; | Participa da implementação de U06 (“Constantes, estado inicial e message schedule”): `];`. |
| 66 | U06 |     let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a; | Inicializa h0..h3 com os quatro primeiros IVs padronizados do SHA-256. |
| 67 | U06 |     let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19; | Inicializa h4..h7 com os quatro IVs restantes. |
| 68 | U06 |     const words = new Uint32Array(64); | Aloca 64 palavras unsigned para o message schedule de cada bloco. |
| 69 | U07 | ␠ [linha vazia] | Separador visual dentro de U07 (“Carga do bloco e expansão das 64 palavras”); não altera estado, mas delimita a unidade sem esconder a posição 69. |
| 70 | U07 |     for (let offset = 0; offset < bytes.length; offset += 64) { | Percorre a mensagem padded em blocos de 64 bytes. |
| 71 | U07 |       for (let index = 0; index < 16; index += 1) { | Carrega as 16 palavras originais W[0..15] do bloco. |
| 72 | U07 |         const at = offset + index * 4; | Calcula o offset do primeiro byte da palavra atual dentro do bloco. |
| 73 | U07 |         words[index] = ( | Inicia a composição big-endian de uma palavra de 32 bits. |
| 74 | U07 |           (bytes[at] << 24) \| | Posiciona o primeiro byte nos bits 31..24. |
| 75 | U07 |           (bytes[at + 1] << 16) \| | Posiciona o segundo byte nos bits 23..16. |
| 76 | U07 |           (bytes[at + 2] << 8) \| | Posiciona o terceiro byte nos bits 15..8. |
| 77 | U07 |           bytes[at + 3] | Mantém o quarto byte nos bits 7..0. |
| 78 | U07 |         ) >>> 0; | Normaliza o resultado da composição para inteiro unsigned de 32 bits. |
| 79 | U07 |       } | Fecha a estrutura sintática aberta em U07, preservando o escopo/retorno definido pela unidade “Carga do bloco e expansão das 64 palavras”. |
| 80 | U07 |       for (let index = 16; index < 64; index += 1) { | Expande o schedule de W[16] até W[63]. |
| 81 | U07 |         const x = words[index - 15]; | Seleciona W[i-15], entrada da função σ0. |
| 82 | U07 |         const y = words[index - 2]; | Seleciona W[i-2], entrada da função σ1. |
| 83 | U07 |         const s0 = ((x >>> 7) \| (x << 25)) ^ ((x >>> 18) \| (x << 14)) ^ (x >>> 3); | Calcula σ0 por rotações 7/18 e shift 3. |
| 84 | U07 |         const s1 = ((y >>> 17) \| (y << 15)) ^ ((y >>> 19) \| (y << 13)) ^ (y >>> 10); | Calcula σ1 por rotações 17/19 e shift 10. |
| 85 | U07 |         words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0; | Combina W[i-16], σ0, W[i-7] e σ1 módulo 2³². |
| 86 | U07 |       } | Fecha a estrutura sintática aberta em U07, preservando o escopo/retorno definido pela unidade “Carga do bloco e expansão das 64 palavras”. |
| 87 | U08 |       let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7; | Copia o estado do hash para os oito registradores de trabalho `a..h`. |
| 88 | U08 |       for (let index = 0; index < 64; index += 1) { | Executa exatamente 64 rodadas de compressão para o bloco. |
| 89 | U08 |         const s1 = ((e >>> 6) \| (e << 26)) ^ ((e >>> 11) \| (e << 21)) ^ ((e >>> 25) \| (e << 7)); | Calcula Σ1(e) pelas rotações 6, 11 e 25. |
| 90 | U08 |         const choose = (e & f) ^ (~e & g); | Calcula `Ch(e,f,g)`, escolhendo bits de f/g controlados por e. |
| 91 | U08 |         const temp1 = (h + s1 + choose + constants[index] + words[index]) >>> 0; | Calcula `temp1 = h + Σ1 + Ch + K[i] + W[i]` módulo 2³². |
| 92 | U08 |         const s0 = ((a >>> 2) \| (a << 30)) ^ ((a >>> 13) \| (a << 19)) ^ ((a >>> 22) \| (a << 10)); | Calcula Σ0(a) pelas rotações 2, 13 e 22. |
| 93 | U08 |         const majority = (a & b) ^ (a & c) ^ (b & c); | Calcula `Maj(a,b,c)`, a função de maioria do SHA-256. |
| 94 | U08 |         const temp2 = (s0 + majority) >>> 0; | Calcula `temp2 = Σ0 + Maj` módulo 2³². |
| 95 | U08 |         h = g; g = f; f = e; e = (d + temp1) >>> 0; | Desloca h→g→f→e e define o novo e como `d + temp1`. |
| 96 | U08 |         d = c; c = b; b = a; a = (temp1 + temp2) >>> 0; | Desloca d→c→b→a e define o novo a como `temp1 + temp2`. |
| 97 | U08 |       } | Fecha a estrutura sintática aberta em U08, preservando o escopo/retorno definido pela unidade “64 rodadas de compressão e acumulação”. |
| 98 | U08 |       h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; | Acumula a/b de volta em h0/h1 após as 64 rodadas. |
| 99 | U08 |       h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; | Acumula c/d em h2/h3. |
| 100 | U08 |       h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; | Acumula e/f em h4/h5. |
| 101 | U08 |       h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0; | Acumula g/h em h6/h7. |
| 102 | U08 |     } | Fecha a estrutura sintática aberta em U08, preservando o escopo/retorno definido pela unidade “64 rodadas de compressão e acumulação”. |
| 103 | U09 | ␠ [linha vazia] | Separador visual dentro de U09 (“Formatação do digest fallback”); não altera estado, mas delimita a unidade sem esconder a posição 103. |
| 104 | U09 |     return [h0, h1, h2, h3, h4, h5, h6, h7] | Monta o digest final com as oito palavras de estado. |
| 105 | U09 |       .map(word => word.toString(16).padStart(8, '0')) | Serializa cada palavra como oito dígitos hexadecimais, incluindo zeros à esquerda. |
| 106 | U09 |       .join(''); | Concatena as oito palavras para produzir 64 caracteres hex. |
| 107 | U09 |   } | Fecha a estrutura sintática aberta em U09, preservando o escopo/retorno definido pela unidade “Formatação do digest fallback”. |
| 108 | U10 | ␠ [linha vazia] | Separador visual dentro de U10 (“Decodificação de Data URL em bytes”); não altera estado, mas delimita a unidade sem esconder a posição 108. |
| 109 | U10 |   function decodeDataUrl(dataUrl, { atobImpl, TextEncoderImpl } = {}) { | Declara o decoder de Data URL com `atob` e `TextEncoder` injetáveis. |
| 110 | U10 |     const raw = String(dataUrl \|\| ''); | Normaliza a entrada para string; valores falsy viram string vazia para falhar pela validação uniforme. |
| 111 | U10 |     const commaIndex = raw.indexOf(','); | Localiza a primeira vírgula, separador obrigatório entre metadata e payload de Data URL. |
| 112 | U10 |     if (!raw.startsWith('data:image/') \|\| commaIndex < 0) { | Exige esquema/mídia `data:image/` e a vírgula de separação. |
| 113 | U10 |       throw new Error('Quarentena requer data URL de imagem válida'); | Lança erro explícito quando a entrada não é uma Data URL de imagem válida. |
| 114 | U10 |     } | Fecha a estrutura sintática aberta em U10, preservando o escopo/retorno definido pela unidade “Decodificação de Data URL em bytes”. |
| 115 | U10 | ␠ [linha vazia] | Separador visual dentro de U10 (“Decodificação de Data URL em bytes”); não altera estado, mas delimita a unidade sem esconder a posição 115. |
| 116 | U10 |     const header = raw.slice(0, commaIndex); | Extrai a metadata anterior à vírgula sem incluí-la no hash. |
| 117 | U10 |     const payload = raw.slice(commaIndex + 1); | Extrai somente o payload posterior à vírgula. |
| 118 | U10 |     if (/;base64(?:;\|$)/i.test(header)) { | Detecta token `;base64` no cabeçalho de modo case-insensitive. |
| 119 | U10 |       if (typeof atobImpl !== 'function') throw new Error('Decodificador base64 indisponível'); | Falha explicitamente se o payload é Base64 mas não existe função decodificadora. |
| 120 | U10 |       const binary = atobImpl(payload.replace(/\s+/g, '')); | Remove whitespace do Base64 antes de chamar o decoder injetado. |
| 121 | U10 |       const bytes = new Uint8Array(binary.length); | Aloca `Uint8Array` com exatamente o comprimento binário decodificado. |
| 122 | U10 |       for (let index = 0; index < binary.length; index += 1) { | Percorre cada caractere da string binária produzida por `atob`. |
| 123 | U10 |         bytes[index] = binary.charCodeAt(index) & 0xFF; | Copia o low byte de cada code unit para o array binário. |
| 124 | U10 |       } | Fecha a estrutura sintática aberta em U10, preservando o escopo/retorno definido pela unidade “Decodificação de Data URL em bytes”. |
| 125 | U10 |       return bytes; | Retorna os bytes exatos do payload Base64. |
| 126 | U10 |     } | Fecha a estrutura sintática aberta em U10, preservando o escopo/retorno definido pela unidade “Decodificação de Data URL em bytes”. |
| 127 | U10 | ␠ [linha vazia] | Separador visual dentro de U10 (“Decodificação de Data URL em bytes”); não altera estado, mas delimita a unidade sem esconder a posição 127. |
| 128 | U10 |     const decoded = decodeURIComponent(payload); | No caminho não-Base64, aplica percent-decoding ao payload. |
| 129 | U10 |     if (typeof TextEncoderImpl === 'function') return new TextEncoderImpl().encode(decoded); | Quando disponível, codifica o texto decodificado em UTF-8 via `TextEncoder`. |
| 130 | U10 |     return Uint8Array.from(decoded, character => character.charCodeAt(0) & 0xFF); | Sem `TextEncoder`, usa o low byte de cada code unit como fallback simples; isso pode divergir de UTF-8 para caracteres não ASCII. |
| 131 | U10 |   } | Fecha a estrutura sintática aberta em U10, preservando o escopo/retorno definido pela unidade “Decodificação de Data URL em bytes”. |
| 132 | U11 | ␠ [linha vazia] | Separador visual dentro de U11 (“Factory e injeção de dependências”); não altera estado, mas delimita a unidade sem esconder a posição 132. |
| 133 | U11 |   function createImageQuarantine({ | Abre a factory que captura as dependências da quarentena. |
| 134 | U11 |     dom = domApi, | Usa por padrão a API DOM resolvida no bootstrap do módulo. |
| 135 | U11 |     cryptoImpl = scope.crypto, | Usa `scope.crypto` por padrão para aproveitar Web Crypto no navegador. |
| 136 | U11 |     atobImpl = typeof scope.atob === 'function' ? scope.atob.bind(scope) : null, | Captura `scope.atob` já bindado ao scope quando existe. |
| 137 | U11 |     TextEncoderImpl = scope.TextEncoder, | Captura o construtor `TextEncoder` do ambiente. |
| 138 | U11 |     perceptualEvaluator = null, | Mantém avaliação perceptual desabilitada por padrão e opcional por injeção. |
| 139 | U11 |   } = {}) { | Fecha a lista de opções com objeto padrão vazio para permitir chamada sem argumentos. |
| 140 | U11 |     if (!dom) throw new Error('ImageQuarantine requer o módulo Gemini DOM'); | Faz fail-fast se a API DOM essencial não foi resolvida. |
| 141 | U12 | ␠ [linha vazia] | Separador visual dentro de U12 (“Classificação estrutural da origem da imagem”); não altera estado, mas delimita a unidade sem esconder a posição 141. |
| 142 | U12 |     function classifyStructuralInput(element) { | Declara o classificador que identifica se uma imagem pertence estruturalmente à entrada. |
| 143 | U12 |       if (!element) return null; | Elemento ausente não é classificado como input. |
| 144 | U12 |       if (dom.getStrictModelResponseContainer?.(element)) return null; | Uma imagem dentro de resposta estrita do modelo é liberada estruturalmente antes dos seletores amplos de preview. |
| 145 | U12 |       if (dom.getUserTurnContainer?.(element)) return 'user_turn'; | Imagem pertencente a turno do usuário recebe o motivo `user_turn`. |
| 146 | U12 |       const attachment = closestComposed(element, ATTACHMENT_SELECTOR); | Procura ancestor de attachment/preview atravessando a árvore composta. |
| 147 | U12 |       if (attachment) return 'attachment_preview'; | Ancestor correspondente produz o motivo `attachment_preview`. |
| 148 | U12 |       if (dom.isInsideInputArea?.(element)) return 'composer'; | Imagem dentro da área de input/composer recebe o motivo `composer`. |
| 149 | U12 |       return null; | Sem evidência estrutural de entrada, retorna `null`. |
| 150 | U12 |     } | Fecha a estrutura sintática aberta em U12, preservando o escopo/retorno definido pela unidade “Classificação estrutural da origem da imagem”. |
| 151 | U13 | ␠ [linha vazia] | Separador visual dentro de U13 (“Predicate booleano para consumidores”); não altera estado, mas delimita a unidade sem esconder a posição 151. |
| 152 | U13 |     function isStructurallyInput(element) { | Declara predicate simplificado para consumidores que não precisam do motivo textual. |
| 153 | U13 |       return Boolean(classifyStructuralInput(element)); | Converte presença/ausência do motivo do classificador em booleano. |
| 154 | U13 |     } | Fecha a estrutura sintática aberta em U13, preservando o escopo/retorno definido pela unidade “Predicate booleano para consumidores”. |
| 155 | U14 | ␠ [linha vazia] | Separador visual dentro de U14 (“Hash exato com Web Crypto e fallback”); não altera estado, mas delimita a unidade sem esconder a posição 155. |
| 156 | U14 |     async function computeExactHash(dataUrl) { | Declara o cálculo assíncrono da assinatura exata de uma Data URL. |
| 157 | U14 |       const bytes = decodeDataUrl(dataUrl, { atobImpl, TextEncoderImpl }); | Decodifica primeiro a imagem para bytes, removendo diferenças de MIME/metadata do hash. |
| 158 | U14 |       if (cryptoImpl?.subtle?.digest) { | Prefere o caminho Web Crypto quando `subtle.digest` está disponível. |
| 159 | U14 |         const digest = await cryptoImpl.subtle.digest('SHA-256', bytes); | Solicita SHA-256 nativo sobre o array de bytes. |
| 160 | U14 |         return bytesToHex(new Uint8Array(digest)); | Converte o `ArrayBuffer` do digest nativo em hex minúsculo. |
| 161 | U14 |       } | Fecha a estrutura sintática aberta em U14, preservando o escopo/retorno definido pela unidade “Hash exato com Web Crypto e fallback”. |
| 162 | U14 |       return sha256BytesFallback(bytes); | Sem Web Crypto, executa o SHA-256 JavaScript sobre os mesmos bytes. |
| 163 | U14 |     } | Fecha a estrutura sintática aberta em U14, preservando o escopo/retorno definido pela unidade “Hash exato com Web Crypto e fallback”. |
| 164 | U15 | ␠ [linha vazia] | Separador visual dentro de U15 (“Avaliação — curto-circuito estrutural”); não altera estado, mas delimita a unidade sem esconder a posição 164. |
| 165 | U15 |     async function assessExtractedResult({ | Declara a decisão final de quarentena para um candidato extraído. |
| 166 | U15 |       element = null, | Permite omitir o elemento quando só a comparação de conteúdo está disponível. |
| 167 | U15 |       candidateDataUrl, | Recebe a Data URL do candidato que seria entregue ao mangá. |
| 168 | U15 |       inputDataUrl = null, | Recebe opcionalmente a Data URL original para calcular sua assinatura. |
| 169 | U15 |       inputHash = null, | Aceita opcionalmente hash pré-calculado da entrada para evitar rehasear imagem grande. |
| 170 | U15 |     } = {}) { | Permite chamada sem objeto, embora dados ausentes acabem falhando no cálculo quando não houver motivo estrutural. |
| 171 | U15 |       const structuralReason = classifyStructuralInput(element); | Classifica primeiro o contexto DOM do elemento candidato. |
| 172 | U15 |       if (structuralReason) { | Entra no curto-circuito quando qualquer motivo estrutural de input foi encontrado. |
| 173 | U15 |         return { | Inicia resposta de quarentena estrutural sem executar hash. |
| 174 | U15 |           quarantined: true, | Marca o candidato como bloqueado. |
| 175 | U15 |           reason: structuralReason, | Propaga o motivo estrutural específico para observabilidade/consumer. |
| 176 | U15 |           exactMatch: false, | Declara que esse bloqueio não foi motivado por igualdade de payload. |
| 177 | U15 |           perceptual: null, | Não executa/retorna telemetria perceptual no curto-circuito. |
| 178 | U15 |         }; | Fecha a estrutura sintática aberta em U15, preservando o escopo/retorno definido pela unidade “Avaliação — curto-circuito estrutural”. |
| 179 | U15 |       } | Fecha a estrutura sintática aberta em U15, preservando o escopo/retorno definido pela unidade “Avaliação — curto-circuito estrutural”. |
| 180 | U15 | ␠ [linha vazia] | Separador visual dentro de U15 (“Avaliação — curto-circuito estrutural”); não altera estado, mas delimita a unidade sem esconder a posição 180. |
| 181 | U16 |       const resolvedInputHash = inputHash \|\| await computeExactHash(inputDataUrl); | Reutiliza `inputHash` truthy; caso contrário calcula SHA-256 da Data URL de entrada. |
| 182 | U16 |       const candidateHash = await computeExactHash(candidateDataUrl); | Calcula sempre o hash exato do candidato para comparar com a entrada. |
| 183 | U16 |       let perceptual = null; | Inicializa telemetria perceptual como ausente. |
| 184 | U16 |       if (typeof perceptualEvaluator === 'function') { | Só chama avaliador perceptual quando a dependência injetada é função. |
| 185 | U16 |         try { | Abre proteção contra falha do avaliador opcional. |
| 186 | U16 |           perceptual = await perceptualEvaluator({ inputDataUrl, candidateDataUrl }); | Executa o avaliador com as duas Data URLs e conserva o valor retornado apenas como telemetria. |
| 187 | U16 |         } catch (_e) {} | Absorve falha do avaliador perceptual para que telemetria não interrompa a decisão exata. |
| 188 | U16 |       } | Fecha a estrutura sintática aberta em U16, preservando o escopo/retorno definido pela unidade “Avaliação — identidade exata e telemetria perceptual”. |
| 189 | U16 |       const exactMatch = resolvedInputHash === candidateHash; | Compara os dois hashes por igualdade estrita de string. |
| 190 | U16 |       return { | Inicia o objeto final de avaliação. |
| 191 | U16 |         quarantined: exactMatch, | Bloqueia somente quando os hashes exatos são iguais. |
| 192 | U16 |         reason: exactMatch ? 'exact_payload_match' : null, | Expõe `exact_payload_match` apenas para igualdade exata; caso contrário o motivo é nulo. |
| 193 | U16 |         exactMatch, | Expõe explicitamente o booleano de igualdade ao consumidor. |
| 194 | U16 |         perceptual, | Inclui a telemetria perceptual, sem usá-la para decidir `quarantined`. |
| 195 | U16 |       }; | Fecha a estrutura sintática aberta em U16, preservando o escopo/retorno definido pela unidade “Avaliação — identidade exata e telemetria perceptual”. |
| 196 | U17 |     } | Fecha a estrutura sintática aberta em U17, preservando o escopo/retorno definido pela unidade “API da instância de quarentena”. |
| 197 | U17 | ␠ [linha vazia] | Separador visual dentro de U17 (“API da instância de quarentena”); não altera estado, mas delimita a unidade sem esconder a posição 197. |
| 198 | U17 |     return { | Inicia a API da instância criada pela factory. |
| 199 | U17 |       classifyStructuralInput, | Expõe o classificador com motivo para observer/diagnóstico. |
| 200 | U17 |       isStructurallyInput, | Expõe o predicate booleano usado por filtros de seleção. |
| 201 | U17 |       computeExactHash, | Expõe cálculo de SHA-256 para pré-calcular a entrada no job runner. |
| 202 | U17 |       assessExtractedResult, | Expõe a avaliação combinada usada antes da entrega do resultado. |
| 203 | U17 |     }; | Fecha a estrutura sintática aberta em U17, preservando o escopo/retorno definido pela unidade “API da instância de quarentena”. |
| 204 | U17 |   } | Fecha a estrutura sintática aberta em U17, preservando o escopo/retorno definido pela unidade “API da instância de quarentena”. |
| 205 | U18 | ␠ [linha vazia] | Separador visual dentro de U18 (“API do módulo e export dual”); não altera estado, mas delimita a unidade sem esconder a posição 205. |
| 206 | U18 |   const api = { | Inicia o objeto público estático do módulo. |
| 207 | U18 |     ATTACHMENT_SELECTOR, | Expõe o seletor composto para inspeção/reuso. |
| 208 | U18 |     closestComposed, | Expõe a travessia composta para testes/consumidores especializados. |
| 209 | U18 |     decodeDataUrl, | Expõe o decoder de Data URL. |
| 210 | U18 |     sha256BytesFallback, | Expõe a implementação fallback de SHA-256. |
| 211 | U18 |     createImageQuarantine, | Expõe a factory principal. |
| 212 | U18 |   }; | Fecha a estrutura sintática aberta em U18, preservando o escopo/retorno definido pela unidade “API do módulo e export dual”. |
| 213 | U18 |   scope.MangaTranslatorGeminiImageQuarantine = api; | Publica a API no global `MangaTranslatorGeminiImageQuarantine` consumido pelos scripts seguintes do manifest. |
| 214 | U18 |   if (typeof module !== 'undefined' && module.exports) module.exports = api; | Em CommonJS, exporta o mesmo objeto `api` para executar a implementação real nos testes. |
| 215 | U18 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha a IIFE escolhendo `self` quando definido e `globalThis` nos demais ambientes. |
| 216 | U19 | ␠ [linha vazia] | Representa o newline terminal físico do arquivo. |


## 15. Cobertura linha a linha — 216/216

### Linha 001 — U01

**Fonte:** 'use strict';

**O que faz:** Ativa `strict mode`, evitando semântica permissiva antes da inicialização do módulo.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 002 — U01

**Fonte:** // gemini/image-quarantine.js — impede que o anexo de entrada seja entregue

**O que faz:** Documenta a finalidade do arquivo: impedir que o anexo de entrada seja devolvido como resultado Gemini.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 003 — U01

**Fonte:** // como se fosse a imagem gerada pelo Gemini.

**O que faz:** Completa o comentário de contrato, explicitando o falso resultado que a quarentena combate.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 004 — U01

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U01 (“Modo estrito, IIFE e resolução do DOM”); não altera estado, mas delimita a unidade sem esconder a posição 4.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 005 — U01

**Fonte:** (function(scope) {

**O que faz:** Abre a IIFE que encapsula helpers/estado e recebe a superfície global do ambiente.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 006 — U01

**Fonte:**   let domApi = scope.MangaTranslatorGeminiDom \|\| null;

**O que faz:** Prefere a API DOM já publicada por módulos carregados anteriormente no content script.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 007 — U01

**Fonte:**   if (!domApi && typeof require === 'function') {

**O que faz:** Só habilita fallback CommonJS quando a API DOM global não foi resolvida e `require` existe.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 008 — U01

**Fonte:**     try { domApi = require('./dom.js'); } catch (_e) {}

**O que faz:** Tenta carregar `./dom.js`; a falha é absorvida para que a factory faça o fail-fast explícito depois.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 009 — U01

**Fonte:**   }

**O que faz:** Fecha a estrutura sintática aberta em U01, preservando o escopo/retorno definido pela unidade “Modo estrito, IIFE e resolução do DOM”.

**Como faz:** O script roda em uma IIFE que recebe `self`/`globalThis`, tenta reutilizar `MangaTranslatorGeminiDom` do content script e só usa `require('./dom.js')` quando CommonJS existe.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa ser executável como content script clássico do Manifest V3 e, sem uma implementação paralela, como módulo real nos testes Jest.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no navegador; depender apenas do global tornaria os testes mais frágeis; lançar dentro do `require` impediria o fail-fast estável da factory.

### Linha 010 — U02

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U02 (“Seletores estruturais de preview/anexo”); não altera estado, mas delimita a unidade sem esconder a posição 10.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 011 — U02

**Fonte:**   const ATTACHMENT_SELECTOR = [

**O que faz:** Inicia a lista canônica de seletores usados para reconhecer ancestors de attachment/preview.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 012 — U02

**Fonte:**     'file-preview',

**O que faz:** Reconhece o custom element `file-preview` usado como contêiner de preview de arquivo.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 013 — U02

**Fonte:**     'attachment-card',

**O que faz:** Reconhece o custom element `attachment-card` como superfície de anexo.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 014 — U02

**Fonte:**     '[data-test-id*="attachment"]',

**O que faz:** Aceita qualquer elemento cujo `data-test-id` contenha `attachment`, cobrindo variantes de teste/DOM.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 015 — U02

**Fonte:**     '[data-testid*="attachment"]',

**O que faz:** Aceita a grafia `data-testid` contendo `attachment`, variante comum do atributo anterior.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 016 — U02

**Fonte:**     '[data-test-id*="preview"]',

**O que faz:** Reconhece `data-test-id` contendo `preview` para variantes de preview.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 017 — U02

**Fonte:**     '[data-testid*="preview"]',

**O que faz:** Reconhece `data-testid` contendo `preview` na segunda convenção de atributo.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 018 — U02

**Fonte:**     '.file-preview',

**O que faz:** Reconhece a classe `.file-preview`.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 019 — U02

**Fonte:**     '.attachment-preview',

**O que faz:** Reconhece a classe `.attachment-preview`.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 020 — U02

**Fonte:**     '.image-preview',

**O que faz:** Reconhece `.image-preview`; por ser amplo, ele é mitigado pela precedência de model response em `classifyStructuralInput`.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 021 — U02

**Fonte:**     '.attachment-container',

**O que faz:** Reconhece `.attachment-container` como ancestor de attachment.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 022 — U02

**Fonte:**   ].join(', ');

**O que faz:** Une as alternativas em um único seletor CSS separado por vírgulas.

**Como faz:** `ATTACHMENT_SELECTOR` agrega tags, atributos `data-test-id`/`data-testid` e classes conhecidas e os transforma em um único seletor CSS com `join(', ')`.

**Por que foi implementado dessa forma:** A UI do Gemini muda e pode representar anexos com componentes ou atributos diferentes; uma lista de alternativas torna a detecção estrutural resiliente sem acoplar o módulo a um único markup.

**Por que uma implementação ingênua seria pior:** Usar um seletor único deixaria cópias da entrada escaparem após mudanças de DOM; bloquear qualquer `.image-preview` sem a precedência de model response aumentaria falsos positivos.

### Linha 023 — U03

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U03 (“Travessia composta através de Shadow DOM”); não altera estado, mas delimita a unidade sem esconder a posição 23.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 024 — U03

**Fonte:**   function closestComposed(element, selector) {

**O que faz:** Declara helper que procura um ancestor em árvore DOM composta, inclusive atravessando Shadow DOM.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 025 — U03

**Fonte:**     for (let current = element; current;) {

**O que faz:** Itera do elemento inicial para ancestors/hosts até não existir próximo nó.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 026 — U03

**Fonte:**       if (current.matches?.(selector)) return current;

**O que faz:** Retorna imediatamente o primeiro nó cujo `matches(selector)` seja verdadeiro; optional chaining tolera objetos sem `matches`.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 027 — U03

**Fonte:**       if (current.parentElement) {

**O que faz:** Prioriza subir por `parentElement` quando ainda está dentro da mesma árvore DOM.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 028 — U03

**Fonte:**         current = current.parentElement;

**O que faz:** Avança para o pai elemento do nó atual.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 029 — U03

**Fonte:**         continue;

**O que faz:** Reinicia o laço sem consultar ShadowRoot enquanto um pai normal existir.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 030 — U03

**Fonte:**       }

**O que faz:** Fecha a estrutura sintática aberta em U03, preservando o escopo/retorno definido pela unidade “Travessia composta através de Shadow DOM”.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 031 — U03

**Fonte:**       let root = null;

**O que faz:** Inicializa o root como `null` antes de tentar cruzar a fronteira da árvore.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 032 — U03

**Fonte:**       try { root = current.getRootNode?.(); } catch (_e) {}

**O que faz:** Obtém `getRootNode()` defensivamente; exceção é absorvida para transformar travessia impossível em miss, não crash.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 033 — U03

**Fonte:**       current = root?.host \|\| null;

**O que faz:** Se o root for ShadowRoot, continua pelo `host`; sem host encerra a subida.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 034 — U03

**Fonte:**     }

**O que faz:** Fecha a estrutura sintática aberta em U03, preservando o escopo/retorno definido pela unidade “Travessia composta através de Shadow DOM”.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 035 — U03

**Fonte:**     return null;

**O que faz:** Sinaliza que nenhum ancestor composto correspondeu ao seletor.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 036 — U03

**Fonte:**   }

**O que faz:** Fecha a estrutura sintática aberta em U03, preservando o escopo/retorno definido pela unidade “Travessia composta através de Shadow DOM”.

**Como faz:** `closestComposed` sobe por `parentElement`; quando chega ao limite de uma árvore, usa `getRootNode()` e continua pelo `host` do ShadowRoot até achar um ancestor que corresponda ao seletor.

**Por que foi implementado dessa forma:** Componentes do Gemini podem encapsular previews em Shadow DOM; `Element.closest()` sozinho não atravessa a fronteira do shadow root.

**Por que uma implementação ingênua seria pior:** Parar no primeiro root perderia attachments encapsulados; assumir que `getRootNode` nunca falha transformaria uma heurística defensiva em exceção de produção.

### Linha 037 — U04

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U04 (“Serialização hexadecimal de bytes”); não altera estado, mas delimita a unidade sem esconder a posição 37.

**Como faz:** Converte uma sequência de bytes em pares hexadecimais minúsculos, preenchendo cada byte para duas posições.

**Por que foi implementado dessa forma:** `crypto.subtle.digest` devolve `ArrayBuffer`; a comparação com o fallback precisa de uma representação textual determinística.

**Por que uma implementação ingênua seria pior:** Comparar buffers por identidade de objeto daria falso negativo; hex sem `padStart(2)` produziria comprimentos ambíguos.

### Linha 038 — U04

**Fonte:**   function bytesToHex(bytes) {

**O que faz:** Declara helper privado que converte bytes de digest em hexadecimal.

**Como faz:** Converte uma sequência de bytes em pares hexadecimais minúsculos, preenchendo cada byte para duas posições.

**Por que foi implementado dessa forma:** `crypto.subtle.digest` devolve `ArrayBuffer`; a comparação com o fallback precisa de uma representação textual determinística.

**Por que uma implementação ingênua seria pior:** Comparar buffers por identidade de objeto daria falso negativo; hex sem `padStart(2)` produziria comprimentos ambíguos.

### Linha 039 — U04

**Fonte:**     return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

**O que faz:** Transforma cada byte em base 16, garante dois dígitos e concatena sem separador.

**Como faz:** Converte uma sequência de bytes em pares hexadecimais minúsculos, preenchendo cada byte para duas posições.

**Por que foi implementado dessa forma:** `crypto.subtle.digest` devolve `ArrayBuffer`; a comparação com o fallback precisa de uma representação textual determinística.

**Por que uma implementação ingênua seria pior:** Comparar buffers por identidade de objeto daria falso negativo; hex sem `padStart(2)` produziria comprimentos ambíguos.

### Linha 040 — U04

**Fonte:**   }

**O que faz:** Fecha a estrutura sintática aberta em U04, preservando o escopo/retorno definido pela unidade “Serialização hexadecimal de bytes”.

**Como faz:** Converte uma sequência de bytes em pares hexadecimais minúsculos, preenchendo cada byte para duas posições.

**Por que foi implementado dessa forma:** `crypto.subtle.digest` devolve `ArrayBuffer`; a comparação com o fallback precisa de uma representação textual determinística.

**Por que uma implementação ingênua seria pior:** Comparar buffers por identidade de objeto daria falso negativo; hex sem `padStart(2)` produziria comprimentos ambíguos.

### Linha 041 — U05

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U05 (“Padding e comprimento do SHA-256 fallback”); não altera estado, mas delimita a unidade sem esconder a posição 41.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 042 — U05

**Fonte:**   function sha256BytesFallback(inputBytes) {

**O que faz:** Inicia implementação síncrona de SHA-256 usada quando Web Crypto não está disponível.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 043 — U05

**Fonte:**     const bytes = Array.from(inputBytes \|\| []);

**O que faz:** Copia `inputBytes` para array mutável; `null`/`undefined` vira sequência vazia.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 044 — U05

**Fonte:**     const bitLength = bytes.length * 8;

**O que faz:** Calcula o comprimento original em bits antes de adicionar padding.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 045 — U05

**Fonte:**     bytes.push(0x80);

**O que faz:** Anexa o bit inicial do padding SHA-256 como byte `0x80`.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 046 — U05

**Fonte:**     while ((bytes.length % 64) !== 56) bytes.push(0);

**O que faz:** Adiciona zeros até restarem 8 bytes no bloco final para o comprimento de 64 bits.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 047 — U05

**Fonte:**     const high = Math.floor(bitLength / 0x100000000);

**O que faz:** Calcula a metade alta do comprimento em bits em unidades de 32 bits.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 048 — U05

**Fonte:**     const low = bitLength >>> 0;

**O que faz:** Extrai a metade baixa unsigned de 32 bits do comprimento.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 049 — U05

**Fonte:**     [high, low].forEach(word => bytes.push(

**O que faz:** Itera pelas palavras alta e baixa do comprimento para serializá-las em big-endian.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 050 — U05

**Fonte:**       (word >>> 24) & 0xFF,

**O que faz:** Anexa o byte mais significativo de cada palavra do comprimento.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 051 — U05

**Fonte:**       (word >>> 16) & 0xFF,

**O que faz:** Anexa o segundo byte da palavra do comprimento.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 052 — U05

**Fonte:**       (word >>> 8) & 0xFF,

**O que faz:** Anexa o terceiro byte da palavra do comprimento.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 053 — U05

**Fonte:**       word & 0xFF

**O que faz:** Anexa o byte menos significativo da palavra do comprimento.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 054 — U05

**Fonte:**     ));

**O que faz:** Fecha a estrutura sintática aberta em U05, preservando o escopo/retorno definido pela unidade “Padding e comprimento do SHA-256 fallback”.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 055 — U05

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U05 (“Padding e comprimento do SHA-256 fallback”); não altera estado, mas delimita a unidade sem esconder a posição 55.

**Como faz:** Clona os bytes, registra o comprimento em bits, acrescenta `0x80`, completa zeros até 56 mod 64 e anexa o comprimento original em 64 bits big-endian.

**Por que foi implementado dessa forma:** Esse é o pré-processamento exigido pelo SHA-256 antes da compressão em blocos de 512 bits.

**Por que uma implementação ingênua seria pior:** Hashear a Data URL textual incluiria MIME/cabeçalho; padding incorreto faria o fallback divergir do SHA-256 padrão e quebraria identidade entre ambientes.

### Linha 056 — U06

**Fonte:**     const constants = [

**O que faz:** Abre o vetor das 64 constantes K do SHA-256, uma por rodada.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 057 — U06

**Fonte:**       0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,

**O que faz:** Declara K[0..7] do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 058 — U06

**Fonte:**       0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,

**O que faz:** Declara K[8..15] do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 059 — U06

**Fonte:**       0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,

**O que faz:** Declara K[16..23] do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 060 — U06

**Fonte:**       0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,

**O que faz:** Declara K[24..31] do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 061 — U06

**Fonte:**       0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,

**O que faz:** Declara K[32..39] do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 062 — U06

**Fonte:**       0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,

**O que faz:** Declara K[40..47] do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 063 — U06

**Fonte:**       0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,

**O que faz:** Declara K[48..55] do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 064 — U06

**Fonte:**       0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,

**O que faz:** Declara K[56..63] do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 065 — U06

**Fonte:**     ];

**O que faz:** Participa da implementação de U06 (“Constantes, estado inicial e message schedule”): `];`.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 066 — U06

**Fonte:**     let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;

**O que faz:** Inicializa h0..h3 com os quatro primeiros IVs padronizados do SHA-256.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 067 — U06

**Fonte:**     let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

**O que faz:** Inicializa h4..h7 com os quatro IVs restantes.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 068 — U06

**Fonte:**     const words = new Uint32Array(64);

**O que faz:** Aloca 64 palavras unsigned para o message schedule de cada bloco.

**Como faz:** Declara as 64 constantes de rodada SHA-256, os oito IVs padronizados e um `Uint32Array(64)` reutilizado como message schedule.

**Por que foi implementado dessa forma:** A implementação fallback precisa reproduzir a função SHA-256 quando Web Crypto não está disponível; `Uint32Array` mantém palavras de 32 bits.

**Por que uma implementação ingênua seria pior:** Constantes/IVs errados gerariam um digest consistente porém não-SHA-256; arrays numéricos sem normalização de 32 bits aumentariam risco de overflow semânticamente incorreto.

### Linha 069 — U07

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U07 (“Carga do bloco e expansão das 64 palavras”); não altera estado, mas delimita a unidade sem esconder a posição 69.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 070 — U07

**Fonte:**     for (let offset = 0; offset < bytes.length; offset += 64) {

**O que faz:** Percorre a mensagem padded em blocos de 64 bytes.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 071 — U07

**Fonte:**       for (let index = 0; index < 16; index += 1) {

**O que faz:** Carrega as 16 palavras originais W[0..15] do bloco.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 072 — U07

**Fonte:**         const at = offset + index * 4;

**O que faz:** Calcula o offset do primeiro byte da palavra atual dentro do bloco.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 073 — U07

**Fonte:**         words[index] = (

**O que faz:** Inicia a composição big-endian de uma palavra de 32 bits.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 074 — U07

**Fonte:**           (bytes[at] << 24) \|

**O que faz:** Posiciona o primeiro byte nos bits 31..24.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 075 — U07

**Fonte:**           (bytes[at + 1] << 16) \|

**O que faz:** Posiciona o segundo byte nos bits 23..16.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 076 — U07

**Fonte:**           (bytes[at + 2] << 8) \|

**O que faz:** Posiciona o terceiro byte nos bits 15..8.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 077 — U07

**Fonte:**           bytes[at + 3]

**O que faz:** Mantém o quarto byte nos bits 7..0.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 078 — U07

**Fonte:**         ) >>> 0;

**O que faz:** Normaliza o resultado da composição para inteiro unsigned de 32 bits.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 079 — U07

**Fonte:**       }

**O que faz:** Fecha a estrutura sintática aberta em U07, preservando o escopo/retorno definido pela unidade “Carga do bloco e expansão das 64 palavras”.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 080 — U07

**Fonte:**       for (let index = 16; index < 64; index += 1) {

**O que faz:** Expande o schedule de W[16] até W[63].

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 081 — U07

**Fonte:**         const x = words[index - 15];

**O que faz:** Seleciona W[i-15], entrada da função σ0.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 082 — U07

**Fonte:**         const y = words[index - 2];

**O que faz:** Seleciona W[i-2], entrada da função σ1.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 083 — U07

**Fonte:**         const s0 = ((x >>> 7) \| (x << 25)) ^ ((x >>> 18) \| (x << 14)) ^ (x >>> 3);

**O que faz:** Calcula σ0 por rotações 7/18 e shift 3.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 084 — U07

**Fonte:**         const s1 = ((y >>> 17) \| (y << 15)) ^ ((y >>> 19) \| (y << 13)) ^ (y >>> 10);

**O que faz:** Calcula σ1 por rotações 17/19 e shift 10.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 085 — U07

**Fonte:**         words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;

**O que faz:** Combina W[i-16], σ0, W[i-7] e σ1 módulo 2³².

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 086 — U07

**Fonte:**       }

**O que faz:** Fecha a estrutura sintática aberta em U07, preservando o escopo/retorno definido pela unidade “Carga do bloco e expansão das 64 palavras”.

**Como faz:** Processa 64 bytes por bloco, monta as primeiras 16 palavras em big-endian e expande W[16..63] usando as funções σ0/σ1 e adição módulo 2³².

**Por que foi implementado dessa forma:** SHA-256 opera em palavras de 32 bits e exige um schedule de 64 palavras por bloco.

**Por que uma implementação ingênua seria pior:** Ler bytes em little-endian ou omitir `>>> 0` alteraria completamente o digest; recriar estruturas por rodada aumentaria alocação desnecessária.

### Linha 087 — U08

**Fonte:**       let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

**O que faz:** Copia o estado do hash para os oito registradores de trabalho `a..h`.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 088 — U08

**Fonte:**       for (let index = 0; index < 64; index += 1) {

**O que faz:** Executa exatamente 64 rodadas de compressão para o bloco.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 089 — U08

**Fonte:**         const s1 = ((e >>> 6) \| (e << 26)) ^ ((e >>> 11) \| (e << 21)) ^ ((e >>> 25) \| (e << 7));

**O que faz:** Calcula Σ1(e) pelas rotações 6, 11 e 25.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 090 — U08

**Fonte:**         const choose = (e & f) ^ (~e & g);

**O que faz:** Calcula `Ch(e,f,g)`, escolhendo bits de f/g controlados por e.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 091 — U08

**Fonte:**         const temp1 = (h + s1 + choose + constants[index] + words[index]) >>> 0;

**O que faz:** Calcula `temp1 = h + Σ1 + Ch + K[i] + W[i]` módulo 2³².

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 092 — U08

**Fonte:**         const s0 = ((a >>> 2) \| (a << 30)) ^ ((a >>> 13) \| (a << 19)) ^ ((a >>> 22) \| (a << 10));

**O que faz:** Calcula Σ0(a) pelas rotações 2, 13 e 22.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 093 — U08

**Fonte:**         const majority = (a & b) ^ (a & c) ^ (b & c);

**O que faz:** Calcula `Maj(a,b,c)`, a função de maioria do SHA-256.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 094 — U08

**Fonte:**         const temp2 = (s0 + majority) >>> 0;

**O que faz:** Calcula `temp2 = Σ0 + Maj` módulo 2³².

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 095 — U08

**Fonte:**         h = g; g = f; f = e; e = (d + temp1) >>> 0;

**O que faz:** Desloca h→g→f→e e define o novo e como `d + temp1`.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 096 — U08

**Fonte:**         d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;

**O que faz:** Desloca d→c→b→a e define o novo a como `temp1 + temp2`.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 097 — U08

**Fonte:**       }

**O que faz:** Fecha a estrutura sintática aberta em U08, preservando o escopo/retorno definido pela unidade “64 rodadas de compressão e acumulação”.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 098 — U08

**Fonte:**       h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;

**O que faz:** Acumula a/b de volta em h0/h1 após as 64 rodadas.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 099 — U08

**Fonte:**       h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;

**O que faz:** Acumula c/d em h2/h3.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 100 — U08

**Fonte:**       h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0;

**O que faz:** Acumula e/f em h4/h5.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 101 — U08

**Fonte:**       h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;

**O que faz:** Acumula g/h em h6/h7.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 102 — U08

**Fonte:**     }

**O que faz:** Fecha a estrutura sintática aberta em U08, preservando o escopo/retorno definido pela unidade “64 rodadas de compressão e acumulação”.

**Como faz:** Copia o estado em `a..h`, calcula Σ1/Ch/temp1 e Σ0/Maj/temp2 por rodada, desloca os registradores e soma o resultado de volta em h0..h7 módulo 2³².

**Por que foi implementado dessa forma:** Esse é o núcleo de compressão do SHA-256 e permite que o fallback produza uma assinatura de identidade dos bytes sem API externa.

**Por que uma implementação ingênua seria pior:** Comparar Base64 textual seria sensível a representação; uma função hash ad-hoc teria colisões muito mais fáceis e não manteria equivalência com Web Crypto.

### Linha 103 — U09

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U09 (“Formatação do digest fallback”); não altera estado, mas delimita a unidade sem esconder a posição 103.

**Como faz:** Concatena h0..h7 como oito palavras hexadecimais de oito caracteres, totalizando 64 dígitos.

**Por que foi implementado dessa forma:** A saída textual precisa ser idêntica ao formato produzido pelo caminho Web Crypto convertido por `bytesToHex`.

**Por que uma implementação ingênua seria pior:** Retornar inteiros/arrays diferentes por implementação complicaria comparação e permitiria bugs de coerção.

### Linha 104 — U09

**Fonte:**     return [h0, h1, h2, h3, h4, h5, h6, h7]

**O que faz:** Monta o digest final com as oito palavras de estado.

**Como faz:** Concatena h0..h7 como oito palavras hexadecimais de oito caracteres, totalizando 64 dígitos.

**Por que foi implementado dessa forma:** A saída textual precisa ser idêntica ao formato produzido pelo caminho Web Crypto convertido por `bytesToHex`.

**Por que uma implementação ingênua seria pior:** Retornar inteiros/arrays diferentes por implementação complicaria comparação e permitiria bugs de coerção.

### Linha 105 — U09

**Fonte:**       .map(word => word.toString(16).padStart(8, '0'))

**O que faz:** Serializa cada palavra como oito dígitos hexadecimais, incluindo zeros à esquerda.

**Como faz:** Concatena h0..h7 como oito palavras hexadecimais de oito caracteres, totalizando 64 dígitos.

**Por que foi implementado dessa forma:** A saída textual precisa ser idêntica ao formato produzido pelo caminho Web Crypto convertido por `bytesToHex`.

**Por que uma implementação ingênua seria pior:** Retornar inteiros/arrays diferentes por implementação complicaria comparação e permitiria bugs de coerção.

### Linha 106 — U09

**Fonte:**       .join('');

**O que faz:** Concatena as oito palavras para produzir 64 caracteres hex.

**Como faz:** Concatena h0..h7 como oito palavras hexadecimais de oito caracteres, totalizando 64 dígitos.

**Por que foi implementado dessa forma:** A saída textual precisa ser idêntica ao formato produzido pelo caminho Web Crypto convertido por `bytesToHex`.

**Por que uma implementação ingênua seria pior:** Retornar inteiros/arrays diferentes por implementação complicaria comparação e permitiria bugs de coerção.

### Linha 107 — U09

**Fonte:**   }

**O que faz:** Fecha a estrutura sintática aberta em U09, preservando o escopo/retorno definido pela unidade “Formatação do digest fallback”.

**Como faz:** Concatena h0..h7 como oito palavras hexadecimais de oito caracteres, totalizando 64 dígitos.

**Por que foi implementado dessa forma:** A saída textual precisa ser idêntica ao formato produzido pelo caminho Web Crypto convertido por `bytesToHex`.

**Por que uma implementação ingênua seria pior:** Retornar inteiros/arrays diferentes por implementação complicaria comparação e permitiria bugs de coerção.

### Linha 108 — U10

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U10 (“Decodificação de Data URL em bytes”); não altera estado, mas delimita a unidade sem esconder a posição 108.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 109 — U10

**Fonte:**   function decodeDataUrl(dataUrl, { atobImpl, TextEncoderImpl } = {}) {

**O que faz:** Declara o decoder de Data URL com `atob` e `TextEncoder` injetáveis.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 110 — U10

**Fonte:**     const raw = String(dataUrl \|\| '');

**O que faz:** Normaliza a entrada para string; valores falsy viram string vazia para falhar pela validação uniforme.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 111 — U10

**Fonte:**     const commaIndex = raw.indexOf(',');

**O que faz:** Localiza a primeira vírgula, separador obrigatório entre metadata e payload de Data URL.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 112 — U10

**Fonte:**     if (!raw.startsWith('data:image/') \|\| commaIndex < 0) {

**O que faz:** Exige esquema/mídia `data:image/` e a vírgula de separação.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 113 — U10

**Fonte:**       throw new Error('Quarentena requer data URL de imagem válida');

**O que faz:** Lança erro explícito quando a entrada não é uma Data URL de imagem válida.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 114 — U10

**Fonte:**     }

**O que faz:** Fecha a estrutura sintática aberta em U10, preservando o escopo/retorno definido pela unidade “Decodificação de Data URL em bytes”.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 115 — U10

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U10 (“Decodificação de Data URL em bytes”); não altera estado, mas delimita a unidade sem esconder a posição 115.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 116 — U10

**Fonte:**     const header = raw.slice(0, commaIndex);

**O que faz:** Extrai a metadata anterior à vírgula sem incluí-la no hash.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 117 — U10

**Fonte:**     const payload = raw.slice(commaIndex + 1);

**O que faz:** Extrai somente o payload posterior à vírgula.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 118 — U10

**Fonte:**     if (/;base64(?:;\|$)/i.test(header)) {

**O que faz:** Detecta token `;base64` no cabeçalho de modo case-insensitive.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 119 — U10

**Fonte:**       if (typeof atobImpl !== 'function') throw new Error('Decodificador base64 indisponível');

**O que faz:** Falha explicitamente se o payload é Base64 mas não existe função decodificadora.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 120 — U10

**Fonte:**       const binary = atobImpl(payload.replace(/\s+/g, ''));

**O que faz:** Remove whitespace do Base64 antes de chamar o decoder injetado.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 121 — U10

**Fonte:**       const bytes = new Uint8Array(binary.length);

**O que faz:** Aloca `Uint8Array` com exatamente o comprimento binário decodificado.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 122 — U10

**Fonte:**       for (let index = 0; index < binary.length; index += 1) {

**O que faz:** Percorre cada caractere da string binária produzida por `atob`.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 123 — U10

**Fonte:**         bytes[index] = binary.charCodeAt(index) & 0xFF;

**O que faz:** Copia o low byte de cada code unit para o array binário.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 124 — U10

**Fonte:**       }

**O que faz:** Fecha a estrutura sintática aberta em U10, preservando o escopo/retorno definido pela unidade “Decodificação de Data URL em bytes”.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 125 — U10

**Fonte:**       return bytes;

**O que faz:** Retorna os bytes exatos do payload Base64.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 126 — U10

**Fonte:**     }

**O que faz:** Fecha a estrutura sintática aberta em U10, preservando o escopo/retorno definido pela unidade “Decodificação de Data URL em bytes”.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 127 — U10

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U10 (“Decodificação de Data URL em bytes”); não altera estado, mas delimita a unidade sem esconder a posição 127.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 128 — U10

**Fonte:**     const decoded = decodeURIComponent(payload);

**O que faz:** No caminho não-Base64, aplica percent-decoding ao payload.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 129 — U10

**Fonte:**     if (typeof TextEncoderImpl === 'function') return new TextEncoderImpl().encode(decoded);

**O que faz:** Quando disponível, codifica o texto decodificado em UTF-8 via `TextEncoder`.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 130 — U10

**Fonte:**     return Uint8Array.from(decoded, character => character.charCodeAt(0) & 0xFF);

**O que faz:** Sem `TextEncoder`, usa o low byte de cada code unit como fallback simples; isso pode divergir de UTF-8 para caracteres não ASCII.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 131 — U10

**Fonte:**   }

**O que faz:** Fecha a estrutura sintática aberta em U10, preservando o escopo/retorno definido pela unidade “Decodificação de Data URL em bytes”.

**Como faz:** Valida prefixo `data:image/` e vírgula, separa cabeçalho/payload, decodifica Base64 com whitespace removido ou percent-encoding com `decodeURIComponent`, preferindo `TextEncoder` para o caminho textual.

**Por que foi implementado dessa forma:** A quarentena deve comparar conteúdo binário da imagem, não MIME, nome ou forma textual da Data URL.

**Por que uma implementação ingênua seria pior:** Hashear a string inteira permitiria contornar igualdade trocando apenas MIME; aceitar URL HTTP/blobs sem materialização impediria comparar exatamente os bytes.

### Linha 132 — U11

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U11 (“Factory e injeção de dependências”); não altera estado, mas delimita a unidade sem esconder a posição 132.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 133 — U11

**Fonte:**   function createImageQuarantine({

**O que faz:** Abre a factory que captura as dependências da quarentena.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 134 — U11

**Fonte:**     dom = domApi,

**O que faz:** Usa por padrão a API DOM resolvida no bootstrap do módulo.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 135 — U11

**Fonte:**     cryptoImpl = scope.crypto,

**O que faz:** Usa `scope.crypto` por padrão para aproveitar Web Crypto no navegador.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 136 — U11

**Fonte:**     atobImpl = typeof scope.atob === 'function' ? scope.atob.bind(scope) : null,

**O que faz:** Captura `scope.atob` já bindado ao scope quando existe.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 137 — U11

**Fonte:**     TextEncoderImpl = scope.TextEncoder,

**O que faz:** Captura o construtor `TextEncoder` do ambiente.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 138 — U11

**Fonte:**     perceptualEvaluator = null,

**O que faz:** Mantém avaliação perceptual desabilitada por padrão e opcional por injeção.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 139 — U11

**Fonte:**   } = {}) {

**O que faz:** Fecha a lista de opções com objeto padrão vazio para permitir chamada sem argumentos.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 140 — U11

**Fonte:**     if (!dom) throw new Error('ImageQuarantine requer o módulo Gemini DOM');

**O que faz:** Faz fail-fast se a API DOM essencial não foi resolvida.

**Como faz:** `createImageQuarantine` recebe DOM, crypto, atob, TextEncoder e avaliador perceptual, com defaults do ambiente; falha imediatamente se a API DOM essencial não existe.

**Por que foi implementado dessa forma:** Injeção mantém o runtime real simples e torna caminhos determinísticos testáveis sem duplicar a lógica.

**Por que uma implementação ingênua seria pior:** Capturar todas as dependências rigidamente do global dificultaria testes e fallback; prosseguir sem DOM faria a classificação estrutural falhar tarde e silenciosamente.

### Linha 141 — U12

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U12 (“Classificação estrutural da origem da imagem”); não altera estado, mas delimita a unidade sem esconder a posição 141.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 142 — U12

**Fonte:**     function classifyStructuralInput(element) {

**O que faz:** Declara o classificador que identifica se uma imagem pertence estruturalmente à entrada.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 143 — U12

**Fonte:**       if (!element) return null;

**O que faz:** Elemento ausente não é classificado como input.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 144 — U12

**Fonte:**       if (dom.getStrictModelResponseContainer?.(element)) return null;

**O que faz:** Uma imagem dentro de resposta estrita do modelo é liberada estruturalmente antes dos seletores amplos de preview.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 145 — U12

**Fonte:**       if (dom.getUserTurnContainer?.(element)) return 'user_turn';

**O que faz:** Imagem pertencente a turno do usuário recebe o motivo `user_turn`.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 146 — U12

**Fonte:**       const attachment = closestComposed(element, ATTACHMENT_SELECTOR);

**O que faz:** Procura ancestor de attachment/preview atravessando a árvore composta.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 147 — U12

**Fonte:**       if (attachment) return 'attachment_preview';

**O que faz:** Ancestor correspondente produz o motivo `attachment_preview`.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 148 — U12

**Fonte:**       if (dom.isInsideInputArea?.(element)) return 'composer';

**O que faz:** Imagem dentro da área de input/composer recebe o motivo `composer`.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 149 — U12

**Fonte:**       return null;

**O que faz:** Sem evidência estrutural de entrada, retorna `null`.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 150 — U12

**Fonte:**     }

**O que faz:** Fecha a estrutura sintática aberta em U12, preservando o escopo/retorno definido pela unidade “Classificação estrutural da origem da imagem”.

**Como faz:** A ordem é deliberada: ausência → neutro; resposta estrita do modelo → neutro; turno do usuário → `user_turn`; ancestor de attachment → `attachment_preview`; área de input → `composer`; caso contrário → neutro.

**Por que foi implementado dessa forma:** O módulo precisa bloquear imagens de entrada sem confundir imagens reais do model response que podem compartilhar classes genéricas como `.image-preview`.

**Por que uma implementação ingênua seria pior:** Checar preview antes de autoria do modelo poderia bloquear resultado válido; omitir user/composer permitiria seleção acidental da própria entrada.

### Linha 151 — U13

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U13 (“Predicate booleano para consumidores”); não altera estado, mas delimita a unidade sem esconder a posição 151.

**Como faz:** `isStructurallyInput` reduz o motivo detalhado de `classifyStructuralInput` a booleano.

**Por que foi implementado dessa forma:** `job-runner.js` precisa apenas excluir candidatos de seleção automática/manual, enquanto `observer.js` usa o motivo textual para telemetria.

**Por que uma implementação ingênua seria pior:** Duplicar os critérios nos consumidores criaria drift entre seleção e observação.

### Linha 152 — U13

**Fonte:**     function isStructurallyInput(element) {

**O que faz:** Declara predicate simplificado para consumidores que não precisam do motivo textual.

**Como faz:** `isStructurallyInput` reduz o motivo detalhado de `classifyStructuralInput` a booleano.

**Por que foi implementado dessa forma:** `job-runner.js` precisa apenas excluir candidatos de seleção automática/manual, enquanto `observer.js` usa o motivo textual para telemetria.

**Por que uma implementação ingênua seria pior:** Duplicar os critérios nos consumidores criaria drift entre seleção e observação.

### Linha 153 — U13

**Fonte:**       return Boolean(classifyStructuralInput(element));

**O que faz:** Converte presença/ausência do motivo do classificador em booleano.

**Como faz:** `isStructurallyInput` reduz o motivo detalhado de `classifyStructuralInput` a booleano.

**Por que foi implementado dessa forma:** `job-runner.js` precisa apenas excluir candidatos de seleção automática/manual, enquanto `observer.js` usa o motivo textual para telemetria.

**Por que uma implementação ingênua seria pior:** Duplicar os critérios nos consumidores criaria drift entre seleção e observação.

### Linha 154 — U13

**Fonte:**     }

**O que faz:** Fecha a estrutura sintática aberta em U13, preservando o escopo/retorno definido pela unidade “Predicate booleano para consumidores”.

**Como faz:** `isStructurallyInput` reduz o motivo detalhado de `classifyStructuralInput` a booleano.

**Por que foi implementado dessa forma:** `job-runner.js` precisa apenas excluir candidatos de seleção automática/manual, enquanto `observer.js` usa o motivo textual para telemetria.

**Por que uma implementação ingênua seria pior:** Duplicar os critérios nos consumidores criaria drift entre seleção e observação.

### Linha 155 — U14

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U14 (“Hash exato com Web Crypto e fallback”); não altera estado, mas delimita a unidade sem esconder a posição 155.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 156 — U14

**Fonte:**     async function computeExactHash(dataUrl) {

**O que faz:** Declara o cálculo assíncrono da assinatura exata de uma Data URL.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 157 — U14

**Fonte:**       const bytes = decodeDataUrl(dataUrl, { atobImpl, TextEncoderImpl });

**O que faz:** Decodifica primeiro a imagem para bytes, removendo diferenças de MIME/metadata do hash.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 158 — U14

**Fonte:**       if (cryptoImpl?.subtle?.digest) {

**O que faz:** Prefere o caminho Web Crypto quando `subtle.digest` está disponível.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 159 — U14

**Fonte:**         const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);

**O que faz:** Solicita SHA-256 nativo sobre o array de bytes.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 160 — U14

**Fonte:**         return bytesToHex(new Uint8Array(digest));

**O que faz:** Converte o `ArrayBuffer` do digest nativo em hex minúsculo.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 161 — U14

**Fonte:**       }

**O que faz:** Fecha a estrutura sintática aberta em U14, preservando o escopo/retorno definido pela unidade “Hash exato com Web Crypto e fallback”.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 162 — U14

**Fonte:**       return sha256BytesFallback(bytes);

**O que faz:** Sem Web Crypto, executa o SHA-256 JavaScript sobre os mesmos bytes.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 163 — U14

**Fonte:**     }

**O que faz:** Fecha a estrutura sintática aberta em U14, preservando o escopo/retorno definido pela unidade “Hash exato com Web Crypto e fallback”.

**Como faz:** Primeiro converte a Data URL em bytes; se `crypto.subtle.digest` existe, calcula SHA-256 assíncrono e serializa para hex; senão executa o fallback JavaScript.

**Por que foi implementado dessa forma:** Web Crypto evita custo síncrono quando disponível, mas o fallback preserva funcionalidade em ambientes de teste/compatibilidade.

**Por que uma implementação ingênua seria pior:** Exigir Web Crypto faria a quarentena falhar em ambientes sem `subtle`; usar apenas fallback pode bloquear a main thread em imagens grandes.

### Linha 164 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U15 (“Avaliação — curto-circuito estrutural”); não altera estado, mas delimita a unidade sem esconder a posição 164.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 165 — U15

**Fonte:**     async function assessExtractedResult({

**O que faz:** Declara a decisão final de quarentena para um candidato extraído.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 166 — U15

**Fonte:**       element = null,

**O que faz:** Permite omitir o elemento quando só a comparação de conteúdo está disponível.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 167 — U15

**Fonte:**       candidateDataUrl,

**O que faz:** Recebe a Data URL do candidato que seria entregue ao mangá.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 168 — U15

**Fonte:**       inputDataUrl = null,

**O que faz:** Recebe opcionalmente a Data URL original para calcular sua assinatura.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 169 — U15

**Fonte:**       inputHash = null,

**O que faz:** Aceita opcionalmente hash pré-calculado da entrada para evitar rehasear imagem grande.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 170 — U15

**Fonte:**     } = {}) {

**O que faz:** Permite chamada sem objeto, embora dados ausentes acabem falhando no cálculo quando não houver motivo estrutural.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 171 — U15

**Fonte:**       const structuralReason = classifyStructuralInput(element);

**O que faz:** Classifica primeiro o contexto DOM do elemento candidato.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 172 — U15

**Fonte:**       if (structuralReason) {

**O que faz:** Entra no curto-circuito quando qualquer motivo estrutural de input foi encontrado.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 173 — U15

**Fonte:**         return {

**O que faz:** Inicia resposta de quarentena estrutural sem executar hash.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 174 — U15

**Fonte:**           quarantined: true,

**O que faz:** Marca o candidato como bloqueado.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 175 — U15

**Fonte:**           reason: structuralReason,

**O que faz:** Propaga o motivo estrutural específico para observabilidade/consumer.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 176 — U15

**Fonte:**           exactMatch: false,

**O que faz:** Declara que esse bloqueio não foi motivado por igualdade de payload.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 177 — U15

**Fonte:**           perceptual: null,

**O que faz:** Não executa/retorna telemetria perceptual no curto-circuito.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 178 — U15

**Fonte:**         };

**O que faz:** Fecha a estrutura sintática aberta em U15, preservando o escopo/retorno definido pela unidade “Avaliação — curto-circuito estrutural”.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 179 — U15

**Fonte:**       }

**O que faz:** Fecha a estrutura sintática aberta em U15, preservando o escopo/retorno definido pela unidade “Avaliação — curto-circuito estrutural”.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 180 — U15

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U15 (“Avaliação — curto-circuito estrutural”); não altera estado, mas delimita a unidade sem esconder a posição 180.

**Como faz:** `assessExtractedResult` recebe elemento/candidato/entrada/hash. Antes de hashear, classifica o elemento; um motivo estrutural devolve quarentena imediata, `exactMatch:false` e sem avaliação perceptual.

**Por que foi implementado dessa forma:** Se o elemento é claramente input/preview/user turn, gastar CPU lendo bytes é desnecessário e o bloqueio deve ocorrer mesmo se a Data URL estiver ausente ou malformada.

**Por que uma implementação ingênua seria pior:** Hashear primeiro atrasaria rejeições óbvias; depender apenas de hash deixaria passar previews cuja representação foi recomprimida ou reserializada.

### Linha 181 — U16

**Fonte:**       const resolvedInputHash = inputHash \|\| await computeExactHash(inputDataUrl);

**O que faz:** Reutiliza `inputHash` truthy; caso contrário calcula SHA-256 da Data URL de entrada.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 182 — U16

**Fonte:**       const candidateHash = await computeExactHash(candidateDataUrl);

**O que faz:** Calcula sempre o hash exato do candidato para comparar com a entrada.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 183 — U16

**Fonte:**       let perceptual = null;

**O que faz:** Inicializa telemetria perceptual como ausente.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 184 — U16

**Fonte:**       if (typeof perceptualEvaluator === 'function') {

**O que faz:** Só chama avaliador perceptual quando a dependência injetada é função.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 185 — U16

**Fonte:**         try {

**O que faz:** Abre proteção contra falha do avaliador opcional.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 186 — U16

**Fonte:**           perceptual = await perceptualEvaluator({ inputDataUrl, candidateDataUrl });

**O que faz:** Executa o avaliador com as duas Data URLs e conserva o valor retornado apenas como telemetria.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 187 — U16

**Fonte:**         } catch (_e) {}

**O que faz:** Absorve falha do avaliador perceptual para que telemetria não interrompa a decisão exata.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 188 — U16

**Fonte:**       }

**O que faz:** Fecha a estrutura sintática aberta em U16, preservando o escopo/retorno definido pela unidade “Avaliação — identidade exata e telemetria perceptual”.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 189 — U16

**Fonte:**       const exactMatch = resolvedInputHash === candidateHash;

**O que faz:** Compara os dois hashes por igualdade estrita de string.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 190 — U16

**Fonte:**       return {

**O que faz:** Inicia o objeto final de avaliação.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 191 — U16

**Fonte:**         quarantined: exactMatch,

**O que faz:** Bloqueia somente quando os hashes exatos são iguais.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 192 — U16

**Fonte:**         reason: exactMatch ? 'exact_payload_match' : null,

**O que faz:** Expõe `exact_payload_match` apenas para igualdade exata; caso contrário o motivo é nulo.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 193 — U16

**Fonte:**         exactMatch,

**O que faz:** Expõe explicitamente o booleano de igualdade ao consumidor.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 194 — U16

**Fonte:**         perceptual,

**O que faz:** Inclui a telemetria perceptual, sem usá-la para decidir `quarantined`.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 195 — U16

**Fonte:**       };

**O que faz:** Fecha a estrutura sintática aberta em U16, preservando o escopo/retorno definido pela unidade “Avaliação — identidade exata e telemetria perceptual”.

**Como faz:** Reutiliza `inputHash` truthy ou calcula o hash da entrada, calcula o candidato, chama opcionalmente o avaliador perceptual em `try/catch`, compara hashes por igualdade estrita e bloqueia somente a igualdade exata.

**Por que foi implementado dessa forma:** A regra de segurança funcional é identidade byte-a-byte; similaridade perceptual é informativa para evitar falso positivo em traduções visualmente próximas.

**Por que uma implementação ingênua seria pior:** Bloquear por similaridade perceptual poderia rejeitar traduções válidas; deixar exceção de telemetria abortar o job transformaria observabilidade em dependência crítica.

### Linha 196 — U17

**Fonte:**     }

**O que faz:** Fecha a estrutura sintática aberta em U17, preservando o escopo/retorno definido pela unidade “API da instância de quarentena”.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 197 — U17

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U17 (“API da instância de quarentena”); não altera estado, mas delimita a unidade sem esconder a posição 197.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 198 — U17

**Fonte:**     return {

**O que faz:** Inicia a API da instância criada pela factory.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 199 — U17

**Fonte:**       classifyStructuralInput,

**O que faz:** Expõe o classificador com motivo para observer/diagnóstico.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 200 — U17

**Fonte:**       isStructurallyInput,

**O que faz:** Expõe o predicate booleano usado por filtros de seleção.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 201 — U17

**Fonte:**       computeExactHash,

**O que faz:** Expõe cálculo de SHA-256 para pré-calcular a entrada no job runner.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 202 — U17

**Fonte:**       assessExtractedResult,

**O que faz:** Expõe a avaliação combinada usada antes da entrega do resultado.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 203 — U17

**Fonte:**     };

**O que faz:** Fecha a estrutura sintática aberta em U17, preservando o escopo/retorno definido pela unidade “API da instância de quarentena”.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 204 — U17

**Fonte:**   }

**O que faz:** Fecha a estrutura sintática aberta em U17, preservando o escopo/retorno definido pela unidade “API da instância de quarentena”.

**Como faz:** A factory devolve apenas classificador, predicate, hash exato e avaliação de resultado.

**Por que foi implementado dessa forma:** Consumidores recebem uma superfície pequena e coerente, com dependências já capturadas na closure.

**Por que uma implementação ingênua seria pior:** Expor estado interno/constantes de compressão aumentaria acoplamento e permitiria consumidores contornarem o contrato.

### Linha 205 — U18

**Fonte:** ␠ [linha vazia]

**O que faz:** Separador visual dentro de U18 (“API do módulo e export dual”); não altera estado, mas delimita a unidade sem esconder a posição 205.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 206 — U18

**Fonte:**   const api = {

**O que faz:** Inicia o objeto público estático do módulo.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 207 — U18

**Fonte:**     ATTACHMENT_SELECTOR,

**O que faz:** Expõe o seletor composto para inspeção/reuso.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 208 — U18

**Fonte:**     closestComposed,

**O que faz:** Expõe a travessia composta para testes/consumidores especializados.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 209 — U18

**Fonte:**     decodeDataUrl,

**O que faz:** Expõe o decoder de Data URL.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 210 — U18

**Fonte:**     sha256BytesFallback,

**O que faz:** Expõe a implementação fallback de SHA-256.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 211 — U18

**Fonte:**     createImageQuarantine,

**O que faz:** Expõe a factory principal.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 212 — U18

**Fonte:**   };

**O que faz:** Fecha a estrutura sintática aberta em U18, preservando o escopo/retorno definido pela unidade “API do módulo e export dual”.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 213 — U18

**Fonte:**   scope.MangaTranslatorGeminiImageQuarantine = api;

**O que faz:** Publica a API no global `MangaTranslatorGeminiImageQuarantine` consumido pelos scripts seguintes do manifest.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 214 — U18

**Fonte:**   if (typeof module !== 'undefined' && module.exports) module.exports = api;

**O que faz:** Em CommonJS, exporta o mesmo objeto `api` para executar a implementação real nos testes.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 215 — U18

**Fonte:** })(typeof self !== 'undefined' ? self : globalThis);

**O que faz:** Fecha a IIFE escolhendo `self` quando definido e `globalThis` nos demais ambientes.

**Como faz:** O módulo publica seletor/helper/decoder/fallback/factory em `api`, atribui o mesmo objeto ao global browser e a `module.exports` quando CommonJS existe, encerrando a IIFE com `self` ou `globalThis`.

**Por que foi implementado dessa forma:** Manifest, módulos Gemini seguintes e testes Jest precisam compartilhar exatamente a mesma implementação.

**Por que uma implementação ingênua seria pior:** Manter exportações diferentes entre browser e testes permitiria a suíte validar código distinto do executado em produção.

### Linha 216 — U19

**Fonte:** ␠ [linha vazia]

**O que faz:** Representa o newline terminal físico do arquivo.

**Como faz:** A posição final representa o newline que encerra fisicamente o arquivo.

**Por que foi implementado dessa forma:** A Bíblia e o gate contam posições com `split('\n')`; documentar o newline mantém rastreabilidade 216/216.

**Por que uma implementação ingênua seria pior:** Ignorar a posição terminal faria o gate detectar cobertura incompleta mesmo com todas as linhas textuais descritas.


## 16. Checklist de auditoria interna

- [x] SHA do blob conferido: `ddca93d17ca2934a9e95dba96a87283be4e9b9a3`.
- [x] Fonte integral incorporada sem abreviação.
- [x] 215 linhas textuais + newline final = 216/216 posições.
- [x] 216 headings `Linha N` sequenciais preparados para o gate.
- [x] Dependências e consumidores reais abertos e cruzados.
- [x] Assertions de `image-quarantine.test.js`, `job-runner.test.js` e `observer.test.js` lidas antes da classificação.
- [x] Prova direta, prova no consumidor e gate estático separados.
- [x] Caminhos sem assertion focal marcados como lacunas.
- [x] Segurança/privacidade, Shadow DOM, encoding, custo do fallback e fail-open do consumidor registrados.
- [x] Nenhum código funcional alterado.

**Veredito documental local:** a Bíblia está materialmente pronta para aprovação compartilhada do SHA `ddca93d17ca2934a9e95dba96a87283be4e9b9a3`; enquanto o mutex global estiver ocupado, ela permanece **EM ANDAMENTO** e não deve ser contada como concluída.

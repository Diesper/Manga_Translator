# Bíblia técnica — tests/unit/content-gemini/image-quarantine.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `b2c73b79c8824e5507e436a75ec9abc663919c6b`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest/JSDOM do módulo real de quarentena de imagens Gemini  
> **Linhas textuais:** 139  
> **Posições documentais:** 140

## 1. Papel arquitetural

Esta suíte executa diretamente `extension/content/gemini/image-quarantine.js` e `dom.js`, sem mirror local.

Ela protege dois mecanismos centrais:

1. **quarentena estrutural** — preview/anexo, composer e turno do usuário não podem ser tratados como resultado;
2. **igualdade exata de payload** — bytes idênticos ao input são bloqueados mesmo quando o MIME da Data URL difere.

A suíte também documenta explicitamente uma decisão de produto: similaridade perceptual é telemetria, não critério de bloqueio.

## 2. Harness

`loadQuarantine()`:
- requer o módulo real de DOM;
- requer o módulo real de quarentena;
- cria a factory com `cryptoImpl:null`;
- injeta `atobImpl` baseado em Buffer;
- permite `perceptualEvaluator` injetado.

Consequência importante: todos os testes de hash desta suíte passam pelo **fallback JavaScript de SHA-256**, não por `crypto.subtle.digest`.

## 3. Cenários

### QUA-01 — hash por bytes, não MIME

Duas Data URLs com bytes iguais e MIME png/webp devem produzir o mesmo hash e formato de 64 caracteres hexadecimais.

✅ PROVADO DIRETAMENTE para o fallback SHA-256.

### QUA-02 — payload idêntico

Pré-calcula `inputHash` e exige:
- `quarantined:true`;
- `exactMatch:true`;
- `reason:'exact_payload_match'`.

✅ PROVADO DIRETAMENTE.

### QUA-03 — um byte/conteúdo diferente

Input e candidato diferentes devem resultar:
- `quarantined:false`;
- `exactMatch:false`;
- `reason:null`.

✅ PROVADO DIRETAMENTE.

### QUA-04 — perceptual semelhante não bloqueia

Mesmo com evaluator retornando `similar:true, distance:0`, bytes diferentes continuam aceitos.

✅ PROVADO DIRETAMENTE e estabelece o contrato fail-open perceptual.

### QUA-05 — input estrutural

Tabela prova:
- preview de anexo → `attachment_preview`;
- composer → `composer`;
- turno do usuário → `user_turn`.

✅ PROVADO DIRETAMENTE.

### QUA-06 — Shadow DOM

Preview dentro de ShadowRoot aberto é reconhecido como attachment.

✅ PROVADO DIRETAMENTE.

### QUA-07 — model response não é preview

Imagem dentro de `model-response[data-message-author=model]` retorna classificação estrutural nula.

✅ PROVADO DIRETAMENTE.

### QUA-08 — entrada inválida

URL HTTP comum passada para `computeExactHash` rejeita com erro de Data URL de imagem válida.

✅ PROVADO DIRETAMENTE.

## 4. Matriz de evidência

| Contrato | Classificação |
|---|---|
| módulo real importado | ✅ PROVADO DIRETAMENTE |
| hash independe de MIME | ✅ PROVADO DIRETAMENTE |
| igualdade exata bloqueia | ✅ PROVADO DIRETAMENTE |
| diferença de payload libera | ✅ PROVADO DIRETAMENTE |
| perceptual não bloqueia | ✅ PROVADO DIRETAMENTE |
| preview/composer/user turn bloqueados | ✅ PROVADO DIRETAMENTE |
| ShadowRoot aberto | ✅ PROVADO DIRETAMENTE |
| model response não confundida com input | ✅ PROVADO DIRETAMENTE |
| URL não-data rejeitada | ✅ PROVADO DIRETAMENTE |
| Web Crypto nativo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback contra vetor SHA-256 canônico | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Data URL percent-encoded/UTF-8 | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| atob ausente/lançando | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| perceptualEvaluator lançando | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| factory sem DOM | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| variantes restantes de ATTACHMENT_SELECTOR | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Solicitações ao auditor

### 180-001 — TEST_REQUIRED — OPEN

A suíte força `cryptoImpl:null`, portanto não prova o caminho Web Crypto usado normalmente no navegador.

**Necessário:** testar `crypto.subtle.digest` com resultado conhecido e validar a serialização ArrayBuffer→hex.

**Severidade:** HIGH.

### 180-002 — TEST_STRENGTH_REVIEW — OPEN

QUA-01 prova consistência do fallback, mas não correção matemática. Uma implementação hash determinística porém errada ainda poderia satisfazer “bytes iguais → hash igual” e regex 64-hex.

**Necessário:** vetores canônicos SHA-256, por exemplo vazio e `abc`.

**Severidade:** HIGH.

### 180-003 — TEST_REQUIRED — OPEN

Faltam branches de compatibilidade/erro:
- Data URL não-base64 e UTF-8;
- `atobImpl` ausente/lançando;
- `perceptualEvaluator` lançando;
- factory sem DOM;
- `getRootNode` lançando;
- selectors estruturais residuais.

**Severidade:** NORMAL.

## 6. Fonte integral auditada

```javascript
'use strict';

const path = require('path');

const MODULE_PATH = path.resolve(
  __dirname,
  '../../../extension/content/gemini/image-quarantine.js'
);
const DOM_PATH = path.resolve(
  __dirname,
  '../../../extension/content/gemini/dom.js'
);

function loadQuarantine({ perceptualEvaluator = null } = {}) {
  let moduleApi;
  let domApi;
  jest.isolateModules(() => {
    domApi = require(DOM_PATH);
    moduleApi = require(MODULE_PATH);
  });
  return moduleApi.createImageQuarantine({
    dom: domApi,
    cryptoImpl: null,
    atobImpl: value => Buffer.from(value, 'base64').toString('binary'),
    perceptualEvaluator,
  });
}

function dataUrl(bytes, mime = 'image/png') {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('gemini/image-quarantine.js', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  test('QUA-01: SHA-256 é calculado sobre os bytes, sem depender do MIME', async () => {
    const quarantine = loadQuarantine();
    const png = dataUrl('mesmos-bytes', 'image/png');
    const webp = dataUrl('mesmos-bytes', 'image/webp');

    await expect(quarantine.computeExactHash(png)).resolves.toBe(
      await quarantine.computeExactHash(webp)
    );
    await expect(quarantine.computeExactHash(png)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  test('QUA-02: payload idêntico ao anexo é colocado em quarentena', async () => {
    const quarantine = loadQuarantine();
    const input = dataUrl('imagem-original');
    const inputHash = await quarantine.computeExactHash(input);

    await expect(quarantine.assessExtractedResult({
      candidateDataUrl: dataUrl('imagem-original'),
      inputHash,
    })).resolves.toEqual(expect.objectContaining({
      quarantined: true,
      exactMatch: true,
      reason: 'exact_payload_match',
    }));
  });

  test('QUA-03: um único byte diferente não é bloqueado', async () => {
    const quarantine = loadQuarantine();

    await expect(quarantine.assessExtractedResult({
      candidateDataUrl: dataUrl('imagem-traduzida'),
      inputDataUrl: dataUrl('imagem-original'),
    })).resolves.toEqual(expect.objectContaining({
      quarantined: false,
      exactMatch: false,
      reason: null,
    }));
  });

  test('QUA-04: similaridade perceptual é telemetria e não bloqueia payload diferente', async () => {
    const perceptualEvaluator = jest.fn(async () => ({ similar: true, distance: 0 }));
    const quarantine = loadQuarantine({ perceptualEvaluator });

    const result = await quarantine.assessExtractedResult({
      candidateDataUrl: dataUrl('resultado-diferente'),
      inputDataUrl: dataUrl('entrada'),
    });

    expect(result).toEqual(expect.objectContaining({
      quarantined: false,
      exactMatch: false,
      perceptual: { similar: true, distance: 0 },
    }));
    expect(perceptualEvaluator).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['preview do anexo', '<file-preview><img id="candidate"></file-preview>', 'attachment_preview'],
    ['compositor', '<rich-textarea><img id="candidate"></rich-textarea>', 'composer'],
    ['turno do usuário', '<div data-message-author="user"><img id="candidate"></div>', 'user_turn'],
  ])('QUA-05: classifica %s como entrada estrutural', (_label, markup, reason) => {
    document.body.innerHTML = markup;
    const quarantine = loadQuarantine();
    const image = document.getElementById('candidate');

    expect(quarantine.classifyStructuralInput(image)).toBe(reason);
    expect(quarantine.isStructurallyInput(image)).toBe(true);
  });

  test('QUA-06: preview dentro de shadow root também é identificado', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const preview = document.createElement('file-preview');
    const image = document.createElement('img');
    preview.appendChild(image);
    shadow.appendChild(preview);
    document.body.appendChild(host);

    const quarantine = loadQuarantine();
    expect(quarantine.classifyStructuralInput(image)).toBe('attachment_preview');
  });

  test('QUA-07: imagem de resposta do modelo não é confundida com preview', () => {
    document.body.innerHTML = `
      <model-response data-message-author="model">
        <div class="image-preview"><img id="candidate"></div>
      </model-response>
    `;
    const quarantine = loadQuarantine();

    expect(quarantine.classifyStructuralInput(
      document.getElementById('candidate')
    )).toBeNull();
  });

  test('QUA-08: entrada que não é data URL de imagem falha de forma explícita', async () => {
    const quarantine = loadQuarantine();

    await expect(quarantine.computeExactHash('https://example.test/image.png'))
      .rejects.toThrow('data URL de imagem válida');
  });
});
```

## 7. Mapa integral

| Linhas | Responsabilidade |
|---:|---|
| 1–14 | imports/caminhos reais |
| 15–28 | factory de quarantine para testes |
| 29–31 | helper Data URL |
| 32–36 | setup |
| 37–47 | QUA-01 |
| 48–62 | QUA-02 |
| 63–76 | QUA-03 |
| 77–92 | QUA-04 |
| 93–107 | QUA-05 |
| 108–122 | QUA-06 |
| 123–134 | QUA-07 |
| 135–139 | QUA-08 |
| posição final | newline final |

## 8. Autoauditoria do AGENTE 17

- [x] reserva exclusiva confirmada;
- [x] state próprio confirmado;
- [x] fonte e módulo real correlacionados;
- [x] assertions classificadas individualmente;
- [x] caminho Web Crypto não promovido indevidamente a prova;
- [x] fonte integral incorporada exatamente;
- [x] nenhum arquivo externo alterado;
- [x] três solicitações registradas.

**Resultado:** excelente cobertura do contrato funcional principal, mas ainda falta provar o caminho criptográfico de produção e a correção matemática do fallback.

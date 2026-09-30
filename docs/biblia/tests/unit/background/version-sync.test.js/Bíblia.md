# Bíblia técnica — tests/unit/background/version-sync.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `45927901e904e239c9d00cece98495055a8acf1d`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest unitária do contrato de versionamento/release  
> **Linhas textuais:** 51  
> **Posições documentais:** 52, contando o newline final quando presente

## 1. Papel arquitetural

Este arquivo é o gate unitário mínimo do versionamento centralizado do projeto.

Ele testa diretamente duas funções reais de `scripts/release/sync-version.js`:

- `parseNumericSemver`;
- `deriveVersionInfo`.

Também lê `.github/workflows/publish.yml` do repositório e faz um gate estático para impedir que nomes de release/documentação voltem a ser hardcoded com versão literal.

A cadeia conceitual é:

```text
package.json#version
  -> parseNumericSemver
  -> deriveVersionInfo
  -> manifestVersion / releaseTag / releaseBaseName / DOC_ARTIFACT
  -> publish.yml consome --print-env
```

No snapshot auditado:
- `package.json#version = 6.5.0`;
- `extension/manifest.json#version = 6.5`;
- `package-lock.json#version = 6.5.0`;
- `package-lock.json#packages[""].version = 6.5.0`.

Esses valores são coerentes com `deriveVersionInfo('6.5.0')`, mas a coerência atual do workspace não é provada por este arquivo; ela é responsabilidade de `version:check`/outros gates.

## 2. Descoberta pelo Jest

`jest.config.js` inclui `tests/unit/background/**/*.test.js` no projeto `background`.

`package.json` inclui esse projeto em `npm run test:unit` e oferece `test:unit:background`.

O arquivo não contém `.skip`, `.only` ou `test.todo`.

## 3. Contratos provados

### T01 — 6.5.0

Exige objeto completo:

- packageVersion `6.5.0`;
- manifestVersion/displayVersion `6.5`;
- releaseTag `v6.5.0`;
- releaseBaseName `Manga-Translator-v6.5`;
- documentação `Documentação_V6.5.md`.

Isso prova a regra especial: patch zero é omitido dos artefatos visíveis/Manifest, mas preservado na tag/package.

### T02 — patch diferente de zero

Para `6.5.1` exige:
- Manifest `6.5.1`;
- basename `Manga-Translator-v6.5.1`.

### T03 — major/minor com patch zero

Para `7.0.0` exige `7.0`, preservando dois componentes visíveis.

### T04 — SemVer não suportado

Rejeita:
- `6.5`;
- prefixo `v`;
- prerelease;
- zero à esquerda;
- major acima de 65535.

Isso prova diretamente parte importante do parser numérico e do limite de Manifest.

### T05 — gate textual do workflow

Lê `publish.yml` real e exige:
- docs canônica;
- execução de `sync-version.js --print-env`;
- uso de `${RELEASE_BASENAME}`;
- uso de `${DOC_ARTIFACT}`;
- ausência de padrões hardcoded `Manga-Translator-v<dígito>` e `Documentação_V<dígito>`.

## 4. O que o teste NÃO executa

Apesar do nome “versionamento centralizado”, este arquivo não chama:

- `collectState`;
- `getDifferences`;
- `syncWorkspace`;
- `checkWorkspace`;
- `printEnv`;
- `main`.

Portanto não prova:
- leitura/escrita real de manifest e package-lock;
- sincronização de `packages[""].version`;
- detecção de docs/workflow ausentes;
- comportamento do CLI `--check`;
- conteúdo efetivamente emitido por `--print-env`;
- falha quando package-lock não possui `packages[""]`;
- pós-condição “after.length === 0” depois da escrita.

## 5. Força e limites do gate do workflow

O último teste é um **gate estático textual**.

Ele prova presença/ausência de strings no arquivo bruto, mas não faz parse YAML nem executa o job. Em particular, a presença das strings poderia sobreviver dentro de comentário, bloco morto ou trecho semanticamente desconectado e ainda satisfazer `toContain`.

No snapshot atual, inspeção do workflow mostra uso real dos nomes derivados nos passos de criação do diretório, zip, documentação, checksum e upload. Isso é evidência estática complementar, não assertion deste arquivo.

## 6. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| `6.5.0 -> manifest 6.5` | T01 | ✅ PROVADO DIRETAMENTE |
| tag `v6.5.0` | T01 | ✅ PROVADO DIRETAMENTE |
| basename/docs 6.5 | T01 | ✅ PROVADO DIRETAMENTE |
| patch 1 preservado | T02 | ✅ PROVADO DIRETAMENTE |
| `7.0.0 -> 7.0` | T03 | ✅ PROVADO DIRETAMENTE |
| formatos inválidos principais rejeitados | T04 | ✅ PROVADO DIRETAMENTE |
| limite >65535 no major | T04 | ✅ PROVADO DIRETAMENTE |
| limite >65535 em minor/patch | não há casos focais | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `syncWorkspace` escreve manifest/lock corretamente | função não chamada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `checkWorkspace` detecta drift real | função não chamada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `--print-env` emite valores usados pelo workflow | apenas substring da invocação | 🟨 GATE ESTÁTICO / NÃO EXECUTADO |
| workflow usa variáveis em passos ativos | inspeção estática; teste só faz substring | 🟦 GATE ESTÁTICO PARCIAL |
| ausência de hardcode versionado | regex no conteúdo bruto | 🟦 GATE ESTÁTICO ESPECÍFICO |

## 7. Solicitações ao auditor

### 173-001 — TEST_REQUIRED — OPEN

O script real possui caminhos de I/O importantes sem teste neste arquivo: `collectState`, `getDifferences`, `syncWorkspace` e `checkWorkspace`.

**Necessário:** criar testes em diretório temporário, usando arquivos reais de fixture, que provem:
- drift de manifest;
- drift das duas versões do package-lock;
- docs/workflow ausentes;
- sync corrigindo os valores;
- erro quando `packages[""]` não existe;
- idempotência após sync.

**Risco:** uma regressão no código que realmente escreve/verifica o workspace pode passar mesmo com os testes de derivação verdes.

### 173-002 — GATE_STRENGTH_REVIEW — OPEN

O gate de `publish.yml` é textual e não prova semântica YAML/execução.

**Necessário:** avaliar se `verify-publish-workflow.js`/outro gate já prova os passos funcionais; se não, adicionar validação estruturada ou teste de contrato que confirme uso real das variáveis derivadas.

**Risco:** strings podem permanecer em comentários/trechos mortos e o teste continuar verde.

## 8. Fonte integral auditada

```javascript
'use strict';

const {
  parseNumericSemver,
  deriveVersionInfo,
} = require('../../../scripts/release/sync-version');

describe('versionamento centralizado', () => {
  test('6.5.0 gera Manifest 6.5 e release v6.5.0', () => {
    expect(deriveVersionInfo('6.5.0')).toEqual({
      packageVersion: '6.5.0',
      manifestVersion: '6.5',
      displayVersion: '6.5',
      releaseTag: 'v6.5.0',
      releaseBaseName: 'Manga-Translator-v6.5',
      documentationArtifact: 'Documentação_V6.5.md',
    });
  });

  test('patch diferente de zero é preservado no Manifest e nos artefatos', () => {
    expect(deriveVersionInfo('6.5.1').manifestVersion).toBe('6.5.1');
    expect(deriveVersionInfo('6.5.1').releaseBaseName).toBe('Manga-Translator-v6.5.1');
  });

  test('major/minor com patch zero mantém dois componentes visíveis', () => {
    expect(deriveVersionInfo('7.0.0').manifestVersion).toBe('7.0');
  });

  test.each(['6.5', 'v6.5.0', '6.5.0-beta.1', '06.5.0', '65536.0.0'])(
    'rejeita versão não suportada: %s',
    (version) => {
      expect(() => parseNumericSemver(version)).toThrow();
    }
  );

  test('workflow de release usa caminhos canônicos e nomes derivados', () => {
    const fs = require('fs');
    const path = require('path');
    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../../.github/workflows/publish.yml'),
      'utf8'
    );

    expect(workflow).toContain('docs/Documentação.md');
    expect(workflow).toContain('scripts/release/sync-version.js --print-env');
    expect(workflow).toContain('${RELEASE_BASENAME}');
    expect(workflow).toContain('${DOC_ARTIFACT}');
    expect(workflow).not.toMatch(/Manga-Translator-v\d/);
    expect(workflow).not.toMatch(/Documentação_V\d/);
  });
});
```

## 9. Mapa integral de linhas/posições

| Intervalo | Responsabilidade |
|---:|---|
| 1 | strict mode |
| 2 | separador |
| 3–6 | import das funções reais |
| 7 | separador |
| 8 | describe raiz |
| 9–19 | T01 — 6.5.0 e objeto completo |
| 20 | separador |
| 21–24 | T02 — patch não-zero |
| 25 | separador |
| 26–28 | T03 — patch zero em 7.0.0 |
| 29 | separador |
| 30–36 | T04 — versões rejeitadas |
| 37 | separador |
| 38–50 | T05 — leitura/gates do workflow |
| 51 | fecha describe |
| posição final | newline final |

## 10. Invariantes

1. package version canônica usa MAJOR.MINOR.PATCH numérico;
2. cada componente deve caber em 0..65535;
3. patch zero não aparece no Manifest/basename/documentação;
4. tag preserva package version completa;
5. workflow deve derivar nomes, não hardcodar versão;
6. este teste não deve ser tratado como prova de que os writes reais de sync estão corretos.

## 11. Autoauditoria do AGENTE 17

- [x] reserva #173 criada via CREATE ONLY e relida;
- [x] state próprio criado;
- [x] source SHA reconfirmado;
- [x] script real `sync-version.js` lido;
- [x] `publish.yml` real lido;
- [x] versões atuais de package/manifest/lock conferidas;
- [x] assertions diretas separadas de gates textuais;
- [x] fonte integral incorporada sem modificação;
- [x] nenhuma fixture/script/workflow externo foi alterado;
- [x] duas solicitações externas registradas.

**Resultado:** suíte válida para derivação pura e anti-hardcode textual, mas insuficiente para provar os caminhos reais de sincronização I/O.

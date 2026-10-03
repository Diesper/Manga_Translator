# Bíblia técnica — tests/unit/popup/version-ui.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `0fcb923f59efbe4705e10dc2c70567ddda939264`  
> **Agente responsável:** AGENTE 1  
> **Tipo:** teste Jest de contrato estático do versionamento da UI de opções  
> **Linhas textuais:** 21  
> **Posições documentais:** 22, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é um teste de regressão **estático** para impedir que a página de opções volte a exibir uma versão de produto hardcoded.

Ele lê diretamente, como texto UTF-8, os arquivos reais:

- `extension/options/options.html`;
- `extension/options/options.js`.

Depois verifica dois contratos:

1. o HTML contém o anchor `id="app-title"` e não contém um nome já versionado no formato `Manga Translator v<dígito>`;
2. o JavaScript contém a leitura de `chrome.runtime.getManifest`, contém o template literal `Manga Translator v${runtimeVersion}` e não contém um nome de produto com versão numérica literal.

O teste **não executa** `options.js`, não dispara `DOMContentLoaded`, não mocka `chrome.runtime.getManifest()` e não observa o DOM final. Portanto sua prova é sobre o **texto-fonte** dos arquivos, não sobre o comportamento dinâmico completo da página.

## 2. Dependências e contexto

### Dependências Node/Jest

- `fs` para ler os arquivos reais;
- `path` para resolver `../../../extension`;
- globals Jest: `describe`, `test`, `expect`.

Não usa jsdom diretamente, Chrome mock, Playwright ou helpers próprios.

### Arquivos auditados pelo teste

No snapshot atual:

- `extension/options/options.html:8` contém `<h2 id="app-title">Manga Translator</h2>`;
- `extension/options/options.js:4-8` protege a chamada a `chrome.runtime.getManifest()`;
- `options.js:9` deriva `runtimeVersion`;
- `options.js:10` obtém `#app-title`;
- `options.js:12-16` monta `Manga Translator v${runtimeVersion}`, atualiza `document.title` e, quando o elemento existe, seu `textContent`;
- `extension/manifest.json:4` contém a versão corrente `6.5`.

### Entrada no runner

- `package.json:9` inclui o projeto Jest `popup` em `test:unit`;
- `package.json:13` permite executar somente o projeto `popup`;
- `package.json:26` usa o runner CI de Jest.

## 3. Fluxo do arquivo

### 3.1 Resolução da extensão

A linha 7 calcula `extensionDir` subindo três níveis a partir do diretório do teste.

Como usa `__dirname`, a leitura não depende do cwd externo.

### 3.2 Leitura eager

As linhas 8–9 executam `readFileSync` durante a avaliação do bloco `describe`.

Consequência: se qualquer arquivo estiver ausente, inacessível ou ilegível, a própria suíte falha antes de executar as assertions internas. Isso é desejável para um teste que depende dos artefatos reais.

### 3.3 Contrato do HTML

O primeiro teste faz duas assertions:

1. `toContain('id="app-title"')` garante a presença textual exata do anchor esperado;
2. `not.toMatch(/Manga Translator v\d/)` rejeita uma versão numérica imediatamente após o prefixo de produto.

O teste não parseia HTML. Um match em comentário ou outro contexto textual também conta.

### 3.4 Contrato do JavaScript

O segundo teste exige três propriedades textuais:

1. presença de `chrome.runtime.getManifest`;
2. presença exata de `Manga Translator v${runtimeVersion}`;
3. ausência de `Manga Translator v<sequência numérica pontuada>` hardcoded.

A combinação reduz o risco de regressão para uma versão literal, mas não prova que a chamada e o template estejam conectados por fluxo de execução.

## 4. O que as regexes realmente cobrem

### HTML

```regex
/Manga Translator v\d/
```

Rejeita, por exemplo:

- `Manga Translator v6`;
- `Manga Translator v6.5`.

Não é uma regra geral de detecção de qualquer texto de versão concebível; ela protege especificamente o formato normal do produto.

### JavaScript

```regex
/Manga Translator v\d+(?:\.\d+)*/
```

Rejeita versões numéricas literais como `v6`, `v6.5`, `v6.5.1`.

O teste também exige o template dinâmico esperado, então a intenção do contrato fica explícita.

## 5. Evidência automatizada

O blob auditado foi encontrado sem alteração no commit do workflow bem-sucedido **MangaTranslator CI #36577447500**.

No job **Unit + Integration (20.x)**, ID `109437162616`, o log contém explicitamente:

`PASS popup tests/unit/popup/version-ui.test.js`

O mesmo job terminou com:

- **109** suítes aprovadas;
- **851** testes aprovados.

Assim, as assertions deste arquivo foram efetivamente executadas com sucesso para o mesmo blob auditado.

### Matriz de prova

| Propriedade | Evidência | Classificação |
|---|---|---|
| HTML real contém `id="app-title"` | assertion linha 12, suíte PASS | ✅ PROVADO DIRETAMENTE |
| HTML real não contém `Manga Translator v<dígito>` | assertion linha 13, suíte PASS | ✅ PROVADO DIRETAMENTE |
| JS real contém texto `chrome.runtime.getManifest` | linha 17, suíte PASS | ✅ PROVADO DIRETAMENTE |
| JS real contém template `Manga Translator v${runtimeVersion}` | linha 18, suíte PASS | ✅ PROVADO DIRETAMENTE |
| JS real não contém versão numérica literal no formato protegido | linha 19, suíte PASS | ✅ PROVADO DIRETAMENTE |
| `getManifest()` é realmente chamado no browser | este teste não executa `options.js` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| retorno do Manifest realmente atualiza `document.title` | não há execução dinâmica aqui | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| retorno do Manifest realmente atualiza `#app-title.textContent` | não há execução dinâmica aqui | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback sem Manifest mantém UI estável | não exercitado por este teste | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

A busca no teste de integração `tests/integration/options.ui.test.js` não encontrou assertions sobre `app-title`, `getManifest`, `runtimeVersion` ou `document.title`.

## 6. Solicitação ao auditor

### 221-001 — TEST_REQUIRED — OPEN

**Encontrado:** o contrato de versionamento da UI é protegido por inspeção textual, mas não existe prova focal encontrada de que `options.js` realmente consuma a versão retornada por `chrome.runtime.getManifest()` e a aplique ao DOM.

**Arquivo auditado:** `tests/unit/popup/version-ui.test.js`.

**Arquivo relacionado sugerido:** `tests/integration/options.ui.test.js`.

**Evidência atual:** este teste passa no CI e prova diretamente presença/ausência de strings no HTML/JS reais.

**Evidência ausente:** execução real do listener `DOMContentLoaded` com `getManifest() => { version: 'X.Y' }`, seguida de assertions em `document.title` e `#app-title.textContent`; também falta caso de fallback sem versão.

**Por que a evidência atual é insuficiente:** strings corretas podem permanecer no arquivo em código morto, comentário ou fluxo desconectado, mantendo o teste verde sem garantir a experiência da UI.

**Ação solicitada:** adicionar cenário dinâmico separado usando a implementação real da página e mock controlado da API Chrome.

**Evidência esperada:** após DOMContentLoaded, `document.title === 'Opções - Manga Translator vX.Y'` e o texto de `#app-title` corresponde; no fallback sem versão, não deve surgir texto `undefined`/vazio versionado.

**Possível regressão:** refatoração pode desconectar a leitura do Manifest da atualização visual sem quebrar este teste estático.

**Severidade:** NORMAL.

## 7. Fonte integral auditada

```js
'use strict';

const fs = require('fs');
const path = require('path');

describe('versionamento da UI', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');
  const optionsHtml = fs.readFileSync(path.join(extensionDir, 'options', 'options.html'), 'utf8');
  const optionsJs = fs.readFileSync(path.join(extensionDir, 'options', 'options.js'), 'utf8');

  test('options.html não contém versão de produto hardcoded', () => {
    expect(optionsHtml).toContain('id="app-title"');
    expect(optionsHtml).not.toMatch(/Manga Translator v\d/);
  });

  test('options.js lê a versão do Manifest em runtime', () => {
    expect(optionsJs).toContain('chrome.runtime.getManifest');
    expect(optionsJs).toContain('Manga Translator v${runtimeVersion}');
    expect(optionsJs).not.toMatch(/Manga Translator v\d+(?:\.\d+)*/);
  });
});
```

## 8. Mapa linha por linha

| Linha | Papel | Classificação |
|---:|---|---|
| 1 | strict mode do teste | ✅ executado na suíte PASS |
| 2 | separador | estrutural |
| 3 | importa `fs` | ✅ executado |
| 4 | importa `path` | ✅ executado |
| 5 | separador | estrutural |
| 6 | abre describe `versionamento da UI` | ✅ executado |
| 7 | resolve diretório real `extension` | ✅ executado |
| 8 | lê `options.html` real como UTF-8 | ✅ executado |
| 9 | lê `options.js` real como UTF-8 | ✅ executado |
| 10 | separador | estrutural |
| 11 | define teste do HTML | ✅ executado |
| 12 | exige anchor `app-title` | ✅ PROVADO DIRETAMENTE |
| 13 | rejeita versão hardcoded no HTML | ✅ PROVADO DIRETAMENTE |
| 14 | fecha teste HTML | estrutural |
| 15 | separador | estrutural |
| 16 | define teste do JS | ✅ executado |
| 17 | exige referência a `getManifest` | ✅ PROVADO DIRETAMENTE |
| 18 | exige template de versão runtime | ✅ PROVADO DIRETAMENTE |
| 19 | rejeita versão numérica literal no JS | ✅ PROVADO DIRETAMENTE |
| 20 | fecha teste JS | estrutural |
| 21 | fecha describe | estrutural |
| 22 | newline final | 🟦 verificado no blob |

## 9. Unidades semânticas

### U01 — linhas 1–4 — bootstrap

Carrega somente ferramentas Node necessárias à inspeção textual. Não carrega a extensão nem mocks, o que torna o teste rápido e de baixa complexidade.

### U02 — linhas 6–9 — fixture real

Em vez de copiar snippets para fixtures, lê os arquivos reais do produto. Isso é superior a duplicar conteúdo, porque qualquer hardcode introduzido diretamente no artefato de produção entra imediatamente no teste.

### U03 — linhas 11–14 — proteção do HTML

Garante que o ponto de atualização dinâmica existe e que o markup base não carrega versão numérica fixa.

Limite: é inspeção de string, não parsing/execução.

### U04 — linhas 16–20 — proteção do JS

Garante presença textual da fonte dinâmica e ausência da forma literal proibida.

Limite: presença de strings não prova conectividade de fluxo; isso fundamenta 221-001.

### U05 — posição 22 — newline final

O blob possui `\n` após a linha textual 21; a contagem documental é 22 posições.

## 10. Falsos positivos e falsos negativos possíveis

### Potencial falso positivo

O teste pode passar se:

- `chrome.runtime.getManifest` permanecer apenas em trecho morto;
- o template esperado permanecer em comentário/string não usada;
- o código pare de atribuir `document.title` ou `textContent`, desde que as strings protegidas permaneçam.

### Potencial falso negativo deliberado

Uma refatoração funcionalmente correta que produza a mesma UI sem conter literalmente `Manga Translator v${runtimeVersion}` quebraria o teste. Isso revela que o teste protege também uma forma de implementação textual, não apenas o resultado visual.

Esse trade-off é aceitável como gate estático, mas reforça a necessidade de teste dinâmico complementar em vez de substituir toda a prova pelo matcher textual.

## 11. Autoauditoria do AGENTE 1

- [x] reserva exclusiva confirmada;
- [x] SHA reconfirmado antes da finalização;
- [x] fonte integral reproduzida;
- [x] 21 linhas textuais + newline = 22 posições;
- [x] consumidores e arquivos lidos identificados;
- [x] execução CI do mesmo blob verificada;
- [x] assertions diretas separadas de comportamento runtime não provado;
- [x] lacuna externa registrada sem modificar teste/produção;
- [x] nenhum objeto auditado foi alterado para fabricar evidência.

**Resultado:** Bíblia concluída para `0fcb923f59efbe4705e10dc2c70567ddda939264`; a solicitação 221-001 permanece OPEN para auditor independente.

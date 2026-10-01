# Bíblia técnica — tests/helpers/load-content-gemini-module.js

> **Estado documental:** READY_FOR_AUDIT após reparo; `.state/101.json` é a fonte canônica do lifecycle  
> **SHA auditado:** `d7b72e8fd5c69ccb128269f3b59a31df2ca1ffee`  
> **Agente responsável:** AGENTE 9  
> **Tipo:** helper CommonJS de bootstrap/reload de `content_gemini.js` para Jest  
> **Linhas textuais:** **34**  
> **Posições documentais:** **35**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este helper reconstrói, dentro do processo Jest, a sequência de carregamento usada antes de avaliar `content_gemini.js`. O bootstrap real captura diretamente **nove** APIs em `globalThis`: `MangaTranslatorGeminiDom`, `...ImageQuarantine`, `...Observer`, `...Editor`, `...Attachment`, `...TemporaryChat`, `...ResultExtractor`, `...Deletion` e `...JobRunner`; se uma dessas nove APIs estiver ausente, ele lança erro. O helper executa dez `require`s porque também carrega `selectors.js` primeiro: selectors **não é um global exigido diretamente pelo bootstrap**, mas é dependência de `dom.js` e `observer.js` (que em CommonJS também possuem fallback `require('./selectors.js')`).

A segunda responsabilidade é dar aos testes uma nova avaliação de `content_gemini.js`: a linha 27 remove apenas esse arquivo do `require.cache`, então a linha 28 recria sua API exportada. Os dez módulos pré-carregados (selectors + nove providers das APIs globais) permanecem cacheados salvo reset externo. A nova avaliação do bootstrap **não é side-effect free**: seu top-level executa `chrome.storage.local.get(['debugMode'], ...)` e registra novamente `chrome.storage.onChanged.addListener(...)`. Portanto chamadas repetidas podem acumular listeners quando o mock/consumer não limpa esse registro; `manual-assist-hud.test.js`, por exemplo, chama o helper em cada `beforeEach` sem `jest.resetModules()`.

## 2. Consumidores observados

- `tests/unit/content-gemini/safe-background-delete.test.js` — carrega o módulo e testa funções reais de deletion/result extraction.
- `tests/unit/content-gemini/claim-bootstrap-keepalive.test.js` — carrega a API e chama `processGeminiJob()`.
- `tests/unit/content-gemini/manual-assist-hud.test.js` — carrega a API para testar HUD; passa `{ skipAutoProcess: true }`, argumento que o helper atual ignora.
- `tests/unit/content-gemini/plan-rpa-edge-cases.test.js` — usa o loader no fluxo RPA.
- `tests/unit/content-gemini/helpers-and-regressions-real.test.js` — usa a implementação real para regressões/helpers.
- Há testes como `rpa-flow.test.js` e `resolution-elevation.test.js` que reproduzem manualmente uma sequência semelhante de `require`, evidenciando que esta ordem é um contrato operacional, mas também indicando duplicação de infraestrutura.

## 3. Relação com `content_gemini.js`

O bootstrap real captura **nove APIs globais** logo no topo e falha se uma delas estiver ausente. `selectors.js` não é capturado diretamente por `content_gemini.js`; ele sustenta `dom.js`/`observer.js`. No final, quando detecta CommonJS (`module.exports`), o bootstrap exporta `contentGeminiApi`; o `processGeminiJob()` automático acontece somente no ramo de navegador. Isso não elimina os demais side effects do top-level: leitura de `debugMode` e registro de listener de `chrome.storage.onChanged` ainda ocorrem a cada reavaliação. Portanto `{skipAutoProcess:true}` passado por `manual-assist-hud.test.js` continua sendo um argumento ignorado, não uma opção implementada.

## 4. Evidência automatizada

| Contrato | Evidência | Classificação |
|---|---|---|
| loader normal produz API utilizável | múltiplas suítes chamam funções reais após `loadContentGeminiModule()` | 🟨 EXECUTADO INDIRETAMENTE para o loader; assertions focam APIs de produção |
| nove APIs globais precisam existir antes do bootstrap | `content_gemini.js` valida diretamente Dom/Quarantine/Observer/Editor/Attachment/TemporaryChat/ResultExtractor/Deletion/JobRunner; selectors sustenta módulos anteriores, não o bootstrap diretamente | 🟨 EXECUTADO INDIRETAMENTE |
| cache de `content_gemini.js` é removido | nenhuma assertion compara identidade/efeito de duas cargas | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| dependências pré-carregadas permanecem cacheadas | comportamento do CommonJS por inspeção; consumidores podem usar `jest.resetModules()` externamente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| reload do bootstrap repete `storage.get` e `storage.onChanged.addListener` | inspeção do top-level real + mock que preserva `_listeners` em `storageMock.clear()` | ⚠️ SEM TESTE FOCAL DE LIFECYCLE/ACUMULAÇÃO |
| paths resolvidos são corretos | requires dos consumidores passam no fluxo normal | 🟨 EXECUTADO INDIRETAMENTE |
| argumento `skipAutoProcess` tem efeito | helper não possui parâmetro; CommonJS já evita auto-start | ⚠️ NÃO EXISTE CONTRATO IMPLEMENTADO |
| erro quando submódulo falta/reordena | sem teste focal do helper | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Invariantes e riscos

1. Antes de `content_gemini.js`, as **nove APIs globais diretas** precisam estar disponíveis; `selectors.js` participa como dependência de módulos como `dom.js`/`observer.js`, não como décimo global lido diretamente pelo bootstrap.
2. O path do bootstrap deve continuar derivado de `__dirname`, tornando o helper independente do diretório de trabalho.
3. Somente o bootstrap é removido do cache por chamada; estado dos dez módulos pré-carregados (selectors + nove providers) pode sobreviver sem reset externo.
4. Reavaliar o bootstrap repete side effects de top-level, incluindo `storage.local.get` e `storage.onChanged.addListener`; consumers/mocks precisam definir política de cleanup para evitar listeners acumulados.
5. O helper não recebe opções. Passar argumentos hoje é semanticamente ignorado.
6. A ordem é codificada manualmente. Mudanças nas dependências diretas/indiretas precisam atualizar helper e testes.
7. Não há cleanup próprio de globals nem dos listeners registrados pelo bootstrap; isolamento depende do ecossistema de testes/Jest.

## 6. Solicitações ao auditor

- **101-001 — TEST_REQUIRED — ACCEPTED:** criar teste focal do helper comprovando ordem/bootstrap, paths, invalidação do cache do bootstrap e comportamento em duas cargas sucessivas.
- **101-002 — TEST_ISOLATION_REVIEW — ACCEPTED:** verificar se manter dependências pré-carregadas no cache pode vazar estado entre testes sem `jest.resetModules()`; definir contrato e regressão.
- **101-003 — API_CONTRACT_REVIEW — ACCEPTED:** resolver a chamada `loadContentGeminiModule({ skipAutoProcess: true })`: remover argumento enganoso ou implementar opção real, com teste. No estado atual CommonJS evita auto-start, mas não os demais side effects do bootstrap.
- **101-004 — MAINTAINABILITY_REVIEW — ACCEPTED:** avaliar centralizar no helper as sequências paralelas semelhantes encontradas em outras suítes, sem assumir que sejam byte a byte idênticas.
- **101-005 — TEST_ISOLATION_REVIEW — ACCEPTED:** definir/testar o lifecycle dos side effects ao reavaliar `content_gemini.js`, especialmente acumulação de `chrome.storage.onChanged` listeners entre cargas.

## 7. Fonte integral exata

```js
const path = require('path');

const CONTENT_GEMINI_PATH = path.resolve(__dirname, '../../extension/content/content_gemini.js');
const GEMINI_SELECTORS_PATH = path.resolve(__dirname, '../../extension/content/gemini/selectors.js');
const GEMINI_DOM_PATH = path.resolve(__dirname, '../../extension/content/gemini/dom.js');
const GEMINI_IMAGE_QUARANTINE_PATH = path.resolve(__dirname, '../../extension/content/gemini/image-quarantine.js');
const GEMINI_OBSERVER_PATH = path.resolve(__dirname, '../../extension/content/gemini/observer.js');
const GEMINI_EDITOR_PATH = path.resolve(__dirname, '../../extension/content/gemini/editor.js');
const GEMINI_ATTACHMENT_PATH = path.resolve(__dirname, '../../extension/content/gemini/attachment.js');
const GEMINI_TEMP_CHAT_PATH = path.resolve(__dirname, '../../extension/content/gemini/temporary-chat.js');
const GEMINI_RESULT_EXTRACTOR_PATH = path.resolve(__dirname, '../../extension/content/gemini/result-extractor.js');
const GEMINI_DELETION_PATH = path.resolve(__dirname, '../../extension/content/gemini/deletion.js');
const GEMINI_JOB_RUNNER_PATH = path.resolve(__dirname, '../../extension/content/gemini/job-runner.js');

function loadContentGeminiModule() {
    require(GEMINI_SELECTORS_PATH);
    require(GEMINI_DOM_PATH);
    require(GEMINI_IMAGE_QUARANTINE_PATH);
    require(GEMINI_OBSERVER_PATH);
    require(GEMINI_EDITOR_PATH);
    require(GEMINI_ATTACHMENT_PATH);
    require(GEMINI_TEMP_CHAT_PATH);
    require(GEMINI_RESULT_EXTRACTOR_PATH);
    require(GEMINI_DELETION_PATH);
    require(GEMINI_JOB_RUNNER_PATH);

    delete require.cache[require.resolve(CONTENT_GEMINI_PATH)];
    return require(CONTENT_GEMINI_PATH);
}

module.exports = {
    CONTENT_GEMINI_PATH,
    loadContentGeminiModule,
};
```

## 8. Auditoria linha a linha

### Linha 001

- **Código:** `const path = require('path');`
- **O que faz:** Importa `path` do Node; toda resolução abaixo parte de `__dirname` do helper e não do cwd do Jest.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Linha 002

- **Código:** linha vazia
- **O que faz:** Separa responsabilidades visuais sem efeito em runtime.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Linha 003

- **Código:** `const CONTENT_GEMINI_PATH = path.resolve(__dirname, '../../extension/content/content_gemini.js');`
- **O que faz:** Resolve caminho absoluto do bootstrap `extension/content/content_gemini.js`, que será invalidado no `require.cache` e reimportado.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 004

- **Código:** `const GEMINI_SELECTORS_PATH = path.resolve(__dirname, '../../extension/content/gemini/selectors.js');`
- **O que faz:** Resolve `selectors.js`, primeiro módulo Gemini carregado antes do bootstrap.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 005

- **Código:** `const GEMINI_DOM_PATH = path.resolve(__dirname, '../../extension/content/gemini/dom.js');`
- **O que faz:** Resolve `dom.js`, que publica a API DOM esperada em `globalThis`.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 006

- **Código:** `const GEMINI_IMAGE_QUARANTINE_PATH = path.resolve(__dirname, '../../extension/content/gemini/image-quarantine.js');`
- **O que faz:** Resolve `image-quarantine.js`, dependência de filtragem/quarentena de imagens.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 007

- **Código:** `const GEMINI_OBSERVER_PATH = path.resolve(__dirname, '../../extension/content/gemini/observer.js');`
- **O que faz:** Resolve `observer.js`, dependência de observação de DOM/estado.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 008

- **Código:** `const GEMINI_EDITOR_PATH = path.resolve(__dirname, '../../extension/content/gemini/editor.js');`
- **O que faz:** Resolve `editor.js`, dependência de interação com o editor/prompt.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 009

- **Código:** `const GEMINI_ATTACHMENT_PATH = path.resolve(__dirname, '../../extension/content/gemini/attachment.js');`
- **O que faz:** Resolve `attachment.js`, dependência de anexação de imagem.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 010

- **Código:** `const GEMINI_TEMP_CHAT_PATH = path.resolve(__dirname, '../../extension/content/gemini/temporary-chat.js');`
- **O que faz:** Resolve `temporary-chat.js`, dependência de chat temporário.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 011

- **Código:** `const GEMINI_RESULT_EXTRACTOR_PATH = path.resolve(__dirname, '../../extension/content/gemini/result-extractor.js');`
- **O que faz:** Resolve `result-extractor.js`, dependência usada para localizar/extrair imagem gerada.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 012

- **Código:** `const GEMINI_DELETION_PATH = path.resolve(__dirname, '../../extension/content/gemini/deletion.js');`
- **O que faz:** Resolve `deletion.js`, dependência do controlador de exclusão/conversa.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 013

- **Código:** `const GEMINI_JOB_RUNNER_PATH = path.resolve(__dirname, '../../extension/content/gemini/job-runner.js');`
- **O que faz:** Resolve `job-runner.js`, dependência de orquestração do job e HUD manual.
- **Como:** `path.resolve(__dirname, ...)` converte o caminho relativo ao helper em absoluto, evitando depender de `process.cwd()`.
- **Por que / risco:** Paths absolutos baseados em `__dirname` são mais portáveis que paths relativos ao cwd e reduzem falsos `MODULE_NOT_FOUND`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — caminhos são usados pelos `require` do loader; não há teste dedicado que compare cada path exportado/resolvido.

### Linha 014

- **Código:** linha vazia
- **O que faz:** Separa responsabilidades visuais sem efeito em runtime.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Linha 015

- **Código:** `function loadContentGeminiModule() {`
- **O que faz:** Declara o único loader exportado. Ele não recebe parâmetros, embora um consumidor atualmente passe um objeto opcional que é ignorado pelo JavaScript.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Linha 016

- **Código:** `    require(GEMINI_SELECTORS_PATH);`
- **O que faz:** Executa `selectors.js`; `require` também deixa o módulo no cache CommonJS.
- **Como:** O `require` CommonJS avalia `selectors.js` na primeira carga e depois reutiliza seu cache; `dom.js`/`observer.js` podem obtê-lo do global ou por fallback CommonJS.
- **Por que / risco:** A posição anterior ao restante da sequência sustenta dependências de DOM/observer. `content_gemini.js` **não** valida `MangaTranslatorGeminiSelectors` diretamente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 017

- **Código:** `    require(GEMINI_DOM_PATH);`
- **O que faz:** Executa `dom.js` antes do bootstrap para preencher a dependência global correspondente.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 018

- **Código:** `    require(GEMINI_IMAGE_QUARANTINE_PATH);`
- **O que faz:** Executa `image-quarantine.js` na sequência necessária ao conjunto de globals.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 019

- **Código:** `    require(GEMINI_OBSERVER_PATH);`
- **O que faz:** Executa `observer.js`.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 020

- **Código:** `    require(GEMINI_EDITOR_PATH);`
- **O que faz:** Executa `editor.js`.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 021

- **Código:** `    require(GEMINI_ATTACHMENT_PATH);`
- **O que faz:** Executa `attachment.js`.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 022

- **Código:** `    require(GEMINI_TEMP_CHAT_PATH);`
- **O que faz:** Executa `temporary-chat.js`.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 023

- **Código:** `    require(GEMINI_RESULT_EXTRACTOR_PATH);`
- **O que faz:** Executa `result-extractor.js`.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 024

- **Código:** `    require(GEMINI_DELETION_PATH);`
- **O que faz:** Executa `deletion.js`.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 025

- **Código:** `    require(GEMINI_JOB_RUNNER_PATH);`
- **O que faz:** Executa `job-runner.js`, completando o conjunto das nove APIs globais que o bootstrap captura diretamente; `selectors.js` é a décima dependência pré-carregada, porém indireta.
- **Como:** O `require` CommonJS avalia o módulo na primeira carga e depois reutiliza seu cache; esses módulos publicam as APIs que o bootstrap consome via `globalThis`.
- **Por que / risco:** Carregar antes do bootstrap é necessário porque `content_gemini.js` valida as APIs globais no topo; requerê-lo primeiro causaria erro de dependência ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 026

- **Código:** linha vazia
- **O que faz:** Separa responsabilidades visuais sem efeito em runtime.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 027

- **Código:** `    delete require.cache[require.resolve(CONTENT_GEMINI_PATH)];`
- **O que faz:** Remove somente `content_gemini.js` do cache do Node. Isso força uma nova avaliação do bootstrap na chamada seguinte, mas não invalida as dez dependências pré-carregadas (selectors + nove providers globais).
- **Como:** `require.resolve` obtém a chave exata usada no cache; `delete` remove a entrada apenas do bootstrap.
- **Por que / risco:** Recarregar só o bootstrap preserva estado das dependências **e** repete side effects do próprio top-level do bootstrap; sem cleanup/reset, listeners de storage podem se acumular.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 028

- **Código:** `    return require(CONTENT_GEMINI_PATH);`
- **O que faz:** Requer e retorna a nova exportação CommonJS de `content_gemini.js`; o arquivo lê as nove APIs Gemini previamente publicadas em `globalThis`.
- **Como:** O `require` seguinte reavalia o bootstrap, executa novamente seus side effects de top-level (`storage.get` e registro de listener) e devolve o novo `module.exports`.
- **Por que / risco:** Retornar a implementação real evita duplicar/mocar a API auditada, mas múltiplas cargas precisam considerar o lifecycle dos listeners adicionados pela reavaliação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — várias suítes reais chamam `loadContentGeminiModule()` e exercitam APIs retornadas, mas não há assertion focal sobre ordem/cache desta linha.

### Linha 029

- **Código:** `}`
- **O que faz:** Fecha o loader.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Linha 030

- **Código:** linha vazia
- **O que faz:** Separa responsabilidades visuais sem efeito em runtime.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Linha 031

- **Código:** `module.exports = {`
- **O que faz:** Inicia a API CommonJS do helper.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Linha 032

- **Código:** `    CONTENT_GEMINI_PATH,`
- **O que faz:** Exporta o path absoluto do bootstrap para consumidores que precisem referenciá-lo.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Linha 033

- **Código:** `    loadContentGeminiModule,`
- **O que faz:** Exporta a função `loadContentGeminiModule` usada por várias suítes unitárias.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ✅ USO DIRETO COMPROVADO — `safe-background-delete`, `claim-bootstrap-keepalive`, `manual-assist-hud`, `plan-rpa-edge-cases` e `helpers-and-regressions-real` importam o helper.

### Linha 034

- **Código:** `};`
- **O que faz:** Fecha o objeto exportado.
- **Como:** A linha participa diretamente da estrutura CommonJS deste helper e não modifica código de produção.
- **Por que / risco:** Mantém o helper pequeno e explícito; abstrações adicionais sem teste poderiam esconder a ordem crítica de carregamento.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a propriedade isolada desta linha.

### Posição 035 — newline final

- **Código:** newline terminal.
- **O que faz:** encerra o arquivo textual segundo convenção POSIX.
- **Evidência:** 🟦 integridade documental confirmada no blob auditado.

## 9. Conclusão documental

O blob `d7b72e8fd5c69ccb128269f3b59a31df2ca1ffee` foi coberto integralmente: 34 linhas textuais e o newline final. O helper é operacionalmente importante e amplamente exercitado por consumidores, mas suas propriedades próprias de cache, ordem, reload e isolamento não possuem assertions focais. A documentação distingue agora os nove globals diretos da dependência indireta de selectors e registra o side effect de listeners em reload. As cinco requests permanecem `ACCEPTED` no state canônico sem alterar testes, helpers externos ou produção.

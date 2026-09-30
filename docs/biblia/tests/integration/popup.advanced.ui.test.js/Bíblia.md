# Bíblia técnica — tests/integration/popup.advanced.ui.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** dd15edcefd5963fea83a72801b1d3c00b7e37453  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de integração do popup (jsdom + mocks Chrome stateful + HTML/JS reais)  
> **Linhas textuais:** 310  
> **Posições documentais:** 311, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/integration/popup.advanced.ui.test.js` é uma suíte de integração que carrega `extension/popup/popup.html` e `extension/popup/popup.js` reais dentro do ambiente `jsdom` do projeto e substitui somente as fronteiras externas de navegador por mocks compartilhados de `chrome.storage`, `chrome.tabs` e `chrome.runtime`.

O arquivo contém cinco casos:

1. seleção total/nenhuma e banimento em lote de 21 imagens;
2. desbanimento em lote e reintegração das 21 imagens;
3. aba Traduzidas, abertura do reader offline e emissão de `SHOW_EXISTING_FOLDER`;
4. restauração/persistência do paralelismo e emissão de `SET_DEBUG_MODE`;
5. restauração/persistência do modo Gemini `background_delete` e alternância para `temp_chat`.

A suíte não é E2E de navegador: o DOM e o código do popup são reais, porém as APIs Chrome são mocks em memória. Por isso ela prova a integração popup HTML/JS com o contrato dos mocks, mas não prova o comportamento do navegador Chromium nem a implementação do background ao receber cada mensagem.

## 2. Topologia de execução e dependências

### Jest

`jest.config.js` registra o projeto `integration` com:

- `testEnvironment: 'jsdom'`;
- `testMatch: ['<rootDir>/tests/integration/**/*.test.js']`;
- setup `tests/mocks/chrome-api.mock.js`;
- setup `tests/mocks/dom-environment.js`.

`package.json` expõe `npm run test:integration` como `jest --config jest.config.js --selectProjects integration`.

`.github/workflows/ci.yml` executa Unit + Integration em Node 20.x e 22.x e, no job amplo de validação pós-merge/dispatch, também executa `npm run test:integration` explicitamente.

### Helper de página

`tests/helpers/load-extension-page.js`:

- lê o HTML real do repositório;
- remove scripts externos do HTML escrito no jsdom;
- determina dependências anteriores ao script alvo;
- usa `jest.isolateModules`;
- carrega as dependências e `popup.js`;
- intercepta listeners de `DOMContentLoaded` quando solicitado;
- dispara esses listeners manualmente;
- oferece `flushAsyncTasks` por rodadas de `setTimeout(0)`.

A suíte sempre usa `fireDOMContentLoaded:true`, portanto testa o caminho de bootstrap da UI.

### Mock Chrome

`tests/mocks/chrome-api.mock.js` cria singletons stateful e registra hooks globais de Jest. O arquivo auditado usa:

- `getStorageMock()` para seed/leitura de `chrome.storage.local`;
- `getTabsMock()` para criar abas e inspecionar `_tabs`;
- `_registerMessageHandler` para simular respostas do content script;
- `global.chrome.runtime.sendMessage` para observar mensagens outbound.

O uso direto de `tabsMock._tabs` e `_registerMessageHandler` acopla a suíte a APIs internas do mock, não à API pública real do Chrome.

## 3. Helpers locais do arquivo

### `buildImages(host, total = 21)` — linhas 10–17

Cria fixtures determinísticas com `index`, URL `https://<host>/page-<index>.png`, largura a partir de 800 e altura a partir de 1200. Esses tamanhos mantêm as imagens acima dos filtros mínimos usados pelo popup.

O parâmetro default `total=21` não é exercitado como default: as chamadas informam explicitamente 21, 3 ou 1.

### `createActiveTab(url, title = 'Manga Page')` — linhas 23–27

Cria uma aba ativa via mock e altera seu título acessando `tabsMock._tabs`. Todos os cinco usos fornecem `'Reader Test'`, então o default `'Manga Page'` não possui prova específica nesta suíte.

### `registerPopupTabHandler` — linhas 29–54

Simula o content script associado à aba ativa:

- `GET_PAGE_IMAGES` → retorna `images` e `total`;
- `SET_SELECTED_IMAGES` → retorna sucesso;
- `START_TRANSLATION_FROM_POPUP` → opcionalmente chama `onStartTranslation` e retorna sucesso;
- `ENABLE_PAGE` / `HIGHLIGHT_IMAGE` → retorna sucesso.

Nenhum caso atual clica `btn-translate` e nenhum fornece `onStartTranslation`. Portanto o ramo `START_TRANSLATION_FROM_POPUP` existe no harness, mas não é provado por esta suíte.

## 4. Isolamento por teste

O `beforeEach` local:

1. chama `jest.resetModules()`;
2. recupera os mocks Chrome;
3. limpa `storageMock`;
4. repõe um DOM HTML mínimo.

O setup global de `chrome-api.mock.js` também executa `initChromeMocks()` antes de cada teste, limpando estado/timers transitórios sem recriar o runtime singleton. O `afterEach` local restaura spies.

A combinação evita que `popup.js` permaneça cacheado entre casos e evita que os spies de `runtime.sendMessage` dos cenários 3 e 4 vazem para os demais.

## 5. Cinco cenários e o que realmente provam

### 5.1 Seleção e banimento — linhas 68–117

Estado inicial: domínio habilitado e 21 imagens retornadas pelo content-script mock.

Assertions diretas:

- 21 cards no grid;
- contador inicial de 21 selecionadas;
- após `btn-select-none`: zero selecionadas, contador zero e botão Traduzir desabilitado;
- após `btn-select-all`: 21 selecionadas, contador 21 e botão Traduzir habilitado;
- após `btn-ban-selected`: 21 URLs persistidas em `bannedImages_reader.test`;
- grid principal vazio e mensagem `Nenhuma imagem detectada`;
- aba Banidas com 21 cards e resumo contendo `21 ban.`.

Isso prova o fluxo de seleção e banimento implementado em `popup.js`, incluindo a atualização do storage e os dois renders.

### 5.2 Desbanimento — linhas 119–168

Estado inicial: as mesmas 21 URLs já estão banidas.

Assertions diretas:

- grid principal inicia vazio;
- aba Banidas contém 21 cards;
- selecionar todas produz contador de 21;
- após `btn-unban-selected`, a chave de storage vira `[]`;
- o grid principal volta a conter 21 cards;
- todas as 21 ficam selecionadas;
- contador principal mostra 21;
- aba Banidas informa `Nenhuma imagem banida.`.

Isso atravessa o agrupamento por host da implementação real e confirma persistência + rerender.

### 5.3 Traduzidas, reader e pasta — linhas 170–228

O cenário semeia um capítulo `chap_1`, duas imagens traduzidas, dois caminhos de disco e `chap_1_dlId=77`.

Assertions diretas:

- um capítulo aparece em `#chapter-list`;
- clicar Ler Offline cria nova aba;
- URL criada é exatamente `chrome-extension://test-extension-id/reader/reader.html?id=chap_1`;
- clicar Abrir pasta emite mensagem contendo:
  - `action:'SHOW_EXISTING_FOLDER'`;
  - `anchorId:77`;
  - `safeTitle:'Chapter_10'`;
  - callback.

**Lacuna:** a produção também deriva e envia `folderPath` a partir de `chap_1_paths`, mas a assertion usa `expect.objectContaining` sem exigir esse campo. Assim, `folderPath` poderia sumir ou ser derivado incorretamente e este teste ainda passaria. Isso gera a solicitação 116-001.

### 5.4 Paralelismo e debug — linhas 230–278

Estado inicial: `maxConcurrentJobs=3` e `debugMode=false`.

Assertions diretas:

- slider e label restauram `3`;
- após input `5`, storage persiste `5` e label mostra `5`;
- clique no debug envia exatamente `{ action:'SET_DEBUG_MODE', debugOn:true }` com callback;
- texto visual contém `Debug ATIVADO`.

A suíte prova o contrato outbound do popup, mas não o efeito real do background ao receber `SET_DEBUG_MODE`, pois `runtime.sendMessage` está substituído por spy que responde sucesso.

### 5.5 Modo Gemini — linhas 279–308

Estado inicial: `geminiExecutionMode='background_delete'`.

Assertions diretas:

- o radio de exclusão segura existe;
- ele inicia marcado;
- mudança para `temp_chat` persiste `temp_chat`;
- mudança de volta persiste `background_delete`.

**Lacuna:** o terceiro radio real, `popup-gemini-mode-minimized` / valor `minimized_window`, não é exercitado por este arquivo. Há testes do modo minimizado em outras camadas, inclusive E2E/background/content, mas isso não prova especificamente o controle de configuração do popup. Isso gera 116-002.

## 6. Relação com a implementação real

No blob atual de `extension/popup/popup.js`:

- linhas 679–705 implementam `updateSelection`, select all/none e banimento;
- linhas 981–1011 implementam seleção/desbanimento das banidas;
- linhas 1148–1227 constroem itens de capítulo, criam o reader e emitem `SHOW_EXISTING_FOLDER` com `folderPath`, `safeTitle` e `anchorId`;
- linhas 1558–1583 tratam debug e paralelismo;
- linhas 1587–1610+ restauram e persistem o modo de execução Gemini, incluindo `minimized_window`.

No HTML real:

- `btn-ban-selected`, `btn-select-all`, `btn-select-none`, `btn-unban-selected`, `translated-tab`;
- `settings-parallel` e `settings-parallel-val`;
- `debug-toggle-label` / `debug-toggle-text`;
- os três radios `temp_chat`, `minimized_window` e `background_delete`.

Portanto as assertions da suíte estão conectadas a controles/handlers reais, não a uma reimplementação local do popup.

## 7. Evidência automatizada observada

Foi localizado o GitHub Actions run **36521561968**, criado em 2026-09-29, cujo commit `e720890cf34dc9437ee91f3b8172953497d69870` contém exatamente o blob auditado `dd15edcefd5963fea83a72801b1d3c00b7e37453` para este arquivo.

### Node 20.x — job 109255348388

O log registra:

- `PASS integration tests/integration/popup.advanced.ui.test.js`;
- os cinco testes deste arquivo como `✓`;
- `Test Suites: 109 passed, 109 total`;
- `Tests: 851 passed, 851 total`.

### Node 22.x — job 109255348406

O log registra o mesmo:

- suíte auditada em `PASS`;
- os cinco casos em `✓`;
- `109/109` suítes;
- `851/851` testes.

O CI Gate do mesmo run (job 109256050280) concluiu `success`.

Isso comprova execução real do mesmo conteúdo auditado em duas versões de Node.

## 8. Matriz de força da evidência

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| arquivo é coletado pelo projeto Jest `integration` | `jest.config.js` + logs CI | 🟦 GATE ESTÁTICO ESPECÍFICO + execução real |
| cinco casos deste blob foram executados e passaram em Node 20/22 | jobs 109255348388 e 109255348406 | ✅ PROVADO DIRETAMENTE |
| select none/all altera classes, contador e disabled de Traduzir | assertions 93–102 | ✅ PROVADO DIRETAMENTE |
| banir 21 persiste storage e remove do grid principal | assertions 108–110 | ✅ PROVADO DIRETAMENTE |
| aba Banidas renderiza 21 entradas após banimento | assertions 115–116 | ✅ PROVADO DIRETAMENTE |
| desbanir limpa storage e reintegra 21 selecionadas | assertions 156, 161–163, 167 | ✅ PROVADO DIRETAMENTE |
| Ler Offline cria reader para `chap_1` | assertions 217–218 | ✅ PROVADO DIRETAMENTE |
| Abrir pasta envia ação, anchorId e safeTitle | assertion 223–227 | ✅ PROVADO DIRETAMENTE |
| Abrir pasta envia `folderPath` correto | campo não está na expectation | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| paralelismo restaura 3 e persiste 5 | assertions 260–272 | ✅ PROVADO DIRETAMENTE |
| toggle debug emite `SET_DEBUG_MODE debugOn:true` e atualiza texto | assertions 273–277 | ✅ PROVADO DIRETAMENTE |
| popup restaura e persiste `background_delete` | assertions 296–307 | ✅ PROVADO DIRETAMENTE |
| popup persiste `temp_chat` | assertion 302 | ✅ PROVADO DIRETAMENTE |
| popup restaura/persiste `minimized_window` | nenhuma assertion nesta suíte nem outro teste focal do controle do popup localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| default `buildImages(..., total=21)` | todas as chamadas fornecem total | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do default |
| default `createActiveTab(..., title='Manga Page')` | todas as chamadas fornecem título | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do default |
| ramo `START_TRANSLATION_FROM_POPUP` do handler local | nenhum caso clica Traduzir e `onStartTranslation` nunca é fornecido | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 9. Solicitações ao auditor

### 116-001 — TEST_REQUIRED — OPEN — NORMAL

**Encontrado:** o caso “tab Traduzidas abre o reader e envia anchorId ao abrir pasta existente” semeia caminhos reais e a implementação de `popup.js` deriva `folderPath`, porém a expectation do teste usa `objectContaining` somente para `action`, `anchorId` e `safeTitle`.

**Arquivo auditado/relacionado:** `tests/integration/popup.advanced.ui.test.js`.

**Evidência atual:** linhas 192–196 semeiam `chap_1_paths` e `chap_1_dlId`; linhas 223–227 validam subset da mensagem. `popup.js` envia `folderPath` no mesmo objeto.

**Evidência ausente:** assertion de que `folderPath` seja exatamente `/home/user/Downloads/MangaTranslator/Chapter_10` no cenário POSIX semeado.

**Por que é necessário:** regressão na extração da pasta, separador ou inclusão do filename não falharia neste teste, embora o background receba caminho incorreto.

**Ação esperada do auditor:** em mudança separada, fortalecer a expectation para incluir `folderPath` e, se relevante, adicionar caso Windows com separador `\\`.

**Evidência esperada:** spy exigindo `folderPath` correto derivado do último path conhecido.

**Possível regressão:** botão “Abrir pasta” continua enviando ação/âncora válidas, mas aponta para diretório errado.

**Impacto:** abertura de pasta de capítulo traduzido.

**Severidade:** NORMAL.

### 116-002 — TEST_REQUIRED — OPEN — NORMAL

**Encontrado:** a UI do popup possui três modos Gemini e `popup.js` trata explicitamente `minimized_window`, mas este arquivo testa somente restauração de `background_delete` e mudanças `temp_chat -> background_delete`.

**Arquivo auditado/relacionado:** `tests/integration/popup.advanced.ui.test.js`.

**Evidência atual:** linhas 279–307; outras suítes provam comportamento do modo minimizado em background/content/E2E, mas não o radio/configuração deste popup.

**Evidência ausente:** assertion de que seed `geminiExecutionMode:'minimized_window'` marca `popup-gemini-mode-minimized` e de que um `change` nesse radio persiste `minimized_window`.

**Por que é necessário:** o modo pode continuar funcionando quando definido por outro caminho enquanto o controle específico do popup quebra silenciosamente.

**Ação esperada do auditor:** adicionar caso focal ou ampliar o cenário existente para cobrir restauração e persistência do terceiro radio.

**Evidência esperada:** `checked===true` para o radio minimizado após load e storage `geminiExecutionMode==='minimized_window'` após change.

**Possível regressão:** usuário não consegue selecionar/restaurar Janela Minimizada pelo popup apesar de a camada de execução ainda suportar o modo.

**Impacto:** configuração do modo Gemini na UI do popup.

**Severidade:** NORMAL.

## 10. Auditoria linha a linha

### Linha 001

- **Código:** `const {`
- **Função:** Inicia a desestruturação do helper de carregamento da página de extensão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 002

- **Código:** `    loadExtensionPage,`
- **Função:** Importa `loadExtensionPage`, que injeta o HTML real, carrega dependências e executa o script real do popup em isolamento Jest.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 003

- **Código:** `    flushAsyncTasks,`
- **Função:** Importa `flushAsyncTasks`, usado como barreira de macrotasks para callbacks assíncronos dos mocks e handlers do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 004

- **Código:** `} = require('../helpers/load-extension-page.js');`
- **Função:** Resolve `../helpers/load-extension-page.js`, infraestrutura compartilhada da suíte de integração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 005

- **Código:** `const {`
- **Função:** Inicia a desestruturação dos mocks Chrome reutilizados pela suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 006

- **Código:** `    getStorageMock,`
- **Função:** Importa o singleton de `chrome.storage.local` em memória.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 007

- **Código:** `    getTabsMock,`
- **Função:** Importa o singleton de `chrome.tabs`, incluindo criação de abas, mapa interno e handlers de mensagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 008

- **Código:** `} = require('../mocks/chrome-api.mock.js');`
- **Função:** Resolve `../mocks/chrome-api.mock.js`, que também registra hooks Jest de reset/cleanup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 009

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 010

- **Código:** `function buildImages(host, total = 21) {`
- **Função:** Declara `buildImages(host, total = 21)`, fábrica de fixtures de imagens; o default 21 não é usado implicitamente nesta suíte porque todas as chamadas informam `total`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a fábrica é usada, mas o valor default `total=21` não é exercitado implicitamente.

### Linha 011

- **Código:** `    return Array.from({ length: total }, (_, index) => ({`
- **Função:** Cria `total` objetos por `Array.from`, garantindo índices contíguos de 0 a total-1.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 012

- **Código:** `        index,`
- **Função:** Persiste o índice numérico no objeto de fixture, que depois vira `data-index` no grid do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 013

- **Código:** `        src: \`https://${host}/page-${index}.png\`,`
- **Função:** Gera URL HTTPS determinística por host e índice, base do ban/unban e da identidade das imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 014

- **Código:** `        width: 800 + index,`
- **Função:** Varia a largura a partir de 800 px para produzir fixtures válidas e distintas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 015

- **Código:** `        height: 1200 + index,`
- **Função:** Varia a altura a partir de 1200 px; todas ficam acima dos filtros mínimos esperados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 016

- **Código:** `    }));`
- **Função:** Fecha o literal de cada imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 017

- **Código:** `}`
- **Função:** Fecha `buildImages`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 018

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 019

- **Código:** `describe('REG-08/PU-33/PU-34/PU-35/PU-36/PU-37/PU-38/PU-39/PU-40/PU-41/PU-42/PU-43/PU-44/PU-45/PU-46/PU-47/PU-48/PU-49/PU-49b/PU-50/PU-51/PU-52/PU-53: popup.js + popup.html - fluxos avancados reais', () => {`
- **Função:** Abre o único `describe`, rotulado com REG-08 e PU-33..PU-53, agrupando cinco fluxos reais de `popup.js` + `popup.html`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 020

- **Código:** `    let storageMock;`
- **Função:** Declara referência mutável para o storage mock recuperado a cada teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 021

- **Código:** `    let tabsMock;`
- **Função:** Declara referência mutável para o tabs mock recuperado a cada teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 022

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 023

- **Código:** `    async function createActiveTab(url, title = 'Manga Page') {`
- **Função:** Declara helper que cria uma aba ativa; o valor default de título `Manga Page` não é exercitado nesta suíte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper é usado, mas todas as chamadas fornecem título explícito.

### Linha 024

- **Código:** `        const tab = await tabsMock.create({ url, active: true });`
- **Função:** Cria a aba no mock com URL e `active:true`, reproduzindo a aba de mangá ativa consultada pelo popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 025

- **Código:** `        tabsMock._tabs.get(tab.id).title = title;`
- **Função:** Acessa o mapa interno `_tabs` do mock para substituir o título da aba criada; há acoplamento deliberado à implementação do mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 026

- **Código:** `        return tab;`
- **Função:** Retorna a aba criada para registrar handlers e reutilizar seu `id`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 027

- **Código:** `    }`
- **Função:** Fecha `createActiveTab`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 028

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 029

- **Código:** `    function registerPopupTabHandler(tabId, {`
- **Função:** Declara helper que instala o responder de mensagens da aba de mangá.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 030

- **Código:** `        images = [],`
- **Função:** Parâmetro `images` recebe array de imagens; default vazio protege chamadas sem fixture.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 031

- **Código:** `        onStartTranslation = null,`
- **Função:** Parâmetro opcional `onStartTranslation` permitiria inspecionar o payload de início de tradução, mas nenhuma chamada desta suíte o fornece.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 032

- **Código:** `    } = {}) {`
- **Função:** Fecha a desestruturação com objeto default vazio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 033

- **Código:** `        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {`
- **Função:** Registra handler no tab mock para simular o content script da aba ativa.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 034

- **Código:** `            if (message.action === 'GET_PAGE_IMAGES') {`
- **Função:** Reconhece `GET_PAGE_IMAGES`, mensagem usada pelo popup para montar o grid principal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 035

- **Código:** `                sendResponse({ images, total: images.length });`
- **Função:** Responde com imagens e total coerente; as assertions do grid dependem indiretamente desta resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 036

- **Código:** `                return;`
- **Função:** Retorna após responder para não cair em outros ramos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 037

- **Código:** `            }`
- **Função:** Fecha o ramo `GET_PAGE_IMAGES`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 038

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 039

- **Código:** `            if (message.action === 'SET_SELECTED_IMAGES') {`
- **Função:** Reconhece `SET_SELECTED_IMAGES`, emissão do popup ao atualizar seleção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 040

- **Código:** `                sendResponse({ success: true });`
- **Função:** Responde sucesso; a suíte não faz assertion específica sobre os índices enviados nesse canal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 041

- **Código:** `                return;`
- **Função:** Retorna após a resposta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 042

- **Código:** `            }`
- **Função:** Fecha o ramo `SET_SELECTED_IMAGES`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 043

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 044

- **Código:** `            if (message.action === 'START_TRANSLATION_FROM_POPUP') {`
- **Função:** Reconhece `START_TRANSLATION_FROM_POPUP`; nenhum dos cinco casos clica `btn-translate`, portanto este ramo não é provado pela suíte atual.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum caso atual clica `btn-translate` nem fornece `onStartTranslation`.

### Linha 045

- **Código:** `                if (onStartTranslation) onStartTranslation(message);`
- **Função:** Chamaria `onStartTranslation(message)` quando callback fosse fornecido; a condição nunca é verdadeira nos cinco casos atuais.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum caso atual clica `btn-translate` nem fornece `onStartTranslation`.

### Linha 046

- **Código:** `                sendResponse({ success: true });`
- **Função:** Responderia sucesso ao início de tradução.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum caso atual clica `btn-translate` nem fornece `onStartTranslation`.

### Linha 047

- **Código:** `                return;`
- **Função:** Retornaria após responder.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum caso atual clica `btn-translate` nem fornece `onStartTranslation`.

### Linha 048

- **Código:** `            }`
- **Função:** Fecha o ramo de início de tradução.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum caso atual clica `btn-translate` nem fornece `onStartTranslation`.

### Linha 049

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 050

- **Código:** `            if (message.action === 'ENABLE_PAGE' || message.action === 'HIGHLIGHT_IMAGE') {`
- **Função:** Aceita `ENABLE_PAGE` e `HIGHLIGHT_IMAGE`, mensagens auxiliares do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 051

- **Código:** `                sendResponse({ success: true });`
- **Função:** Responde sucesso para essas mensagens; não há assertion focal do conteúdo/payload delas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 052

- **Código:** `            }`
- **Função:** Fecha o ramo auxiliar.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 053

- **Código:** `        });`
- **Função:** Fecha o callback registrado no tab mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 054

- **Código:** `    }`
- **Função:** Fecha `registerPopupTabHandler`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 055

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 056

- **Código:** `    beforeEach(async () => {`
- **Função:** Registra `beforeEach` assíncrono para isolamento lógico de cada cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 057

- **Código:** `        jest.resetModules();`
- **Função:** Reseta o registry de módulos Jest antes de carregar novamente `popup.js` e dependências.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 058

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Recupera a instância de storage mock criada pelo setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 059

- **Código:** `        tabsMock = getTabsMock();`
- **Função:** Recupera a instância de tabs mock criada pelo setup compartilhado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 060

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa explicitamente o storage antes de semear o estado do cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 061

- **Código:** `        document.documentElement.innerHTML = '<html><head></head><body></body></html>';`
- **Função:** Restaura um DOM mínimo; `loadExtensionPage` substituirá esse DOM pelo `popup.html` real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 062

- **Código:** `    });`
- **Função:** Fecha `beforeEach`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 063

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 064

- **Código:** `    afterEach(() => {`
- **Função:** Registra `afterEach` local.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 065

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Restaura spies/mocks criados com `jest.spyOn`, evitando vazamento entre casos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 066

- **Código:** `    });`
- **Função:** Fecha `afterEach`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 067

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — infraestrutura/helper participou da suíte verde; propriedades internas isoladas não possuem assertion focal.

### Linha 068

- **Código:** `    test('select all/none e banir 21 imagens movem tudo para a aba de banidas', async () => {`
- **Função:** Declara cenário que prova seleção total/nenhuma e banimento em lote de 21 imagens.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 069

- **Código:** `        const host = 'reader.test';`
- **Função:** Define host determinístico `reader.test` usado pela aba, chaves de storage e URLs das fixtures.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 070

- **Código:** `        const images = buildImages(host, 21);`
- **Função:** Gera 21 imagens para o primeiro cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 071

- **Código:** `        const tab = await createActiveTab(\`https://${host}/chapter-1\`, 'Reader Test');`
- **Função:** Cria aba ativa `/chapter-1` com título `Reader Test`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 072

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 073

- **Código:** `        registerPopupTabHandler(tab.id, { images });`
- **Função:** Registra o responder da aba com o conjunto de 21 imagens do cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 074

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 075

- **Código:** `        await storageMock.set({`
- **Função:** Inicia seed do storage do primeiro cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 076

- **Código:** `            enabledDomains: [host],`
- **Função:** Habilita `reader.test`, condição necessária para o popup operar sobre a aba.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 077

- **Código:** `        });`
- **Função:** Fecha o seed inicial do primeiro cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 078

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 079

- **Código:** `        await loadExtensionPage({`
- **Função:** Invoca `loadExtensionPage` para carregar `popup.html` e executar o `popup.js` real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 080

- **Código:** `            htmlPath: 'extension/popup/popup.html',`
- **Função:** Aponta para o HTML real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 081

- **Código:** `            scriptPath: 'extension/popup/popup.js',`
- **Função:** Aponta para o JavaScript real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 082

- **Código:** `            fireDOMContentLoaded: true,`
- **Função:** Solicita ao helper captura e disparo dos listeners de `DOMContentLoaded` registrados pelo popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 083

- **Código:** `        });`
- **Função:** Fecha os argumentos do carregamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 084

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 085

- **Código:** `        await flushAsyncTasks(12);`
- **Função:** Drena 12 rodadas assíncronas para concluir leitura da aba, renderização e callbacks iniciais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 086

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 087

- **Código:** `        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(21);`
- **Função:** Assertion direta: o grid principal renderiza exatamente 21 `.image-card`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 088

- **Código:** `        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');`
- **Função:** Assertion direta: todas as 21 imagens começam selecionadas e o contador reflete isso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 089

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 090

- **Código:** `        document.getElementById('btn-select-none').click();`
- **Função:** Clica o botão real `btn-select-none` do DOM carregado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 091

- **Código:** `        await flushAsyncTasks(4);`
- **Função:** Drena callbacks disparados pela remoção da seleção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 092

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 093

- **Código:** `        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(0);`
- **Função:** Assertion direta: nenhuma card mantém a classe `selected`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 094

- **Código:** `        expect(document.getElementById('selection-count').textContent).toBe('0 imagens selecionadas');`
- **Função:** Assertion direta: contador textual cai para zero.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 095

- **Código:** `        expect(document.getElementById('btn-translate').disabled).toBe(true);`
- **Função:** Assertion direta: botão Traduzir fica desabilitado quando não há seleção.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 096

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 097

- **Código:** `        document.getElementById('btn-select-all').click();`
- **Função:** Clica o botão real `btn-select-all`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 098

- **Código:** `        await flushAsyncTasks(4);`
- **Função:** Drena callbacks da seleção total.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 099

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 100

- **Código:** `        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(21);`
- **Função:** Assertion direta: as 21 cards voltam a `selected`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 101

- **Código:** `        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');`
- **Função:** Assertion direta: contador retorna a 21 selecionadas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 102

- **Código:** `        expect(document.getElementById('btn-translate').disabled).toBe(false);`
- **Função:** Assertion direta: botão Traduzir volta a habilitar.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 103

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 104

- **Código:** `        document.getElementById('btn-ban-selected').click();`
- **Função:** Clica `btn-ban-selected`, acionando o listener real de banimento do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 105

- **Código:** `        await flushAsyncTasks(12);`
- **Função:** Drena persistência assíncrona e recarga dos grids principal/banidas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 106

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 107

- **Código:** `        const data = await storageMock.get([\`bannedImages_${host}\`]);`
- **Função:** Lê a chave `bannedImages_reader.test` do storage mock após o banimento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 108

- **Código:** `        expect(data[\`bannedImages_${host}\`]).toHaveLength(21);`
- **Função:** Assertion direta: a lista banida persistida contém 21 URLs.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 109

- **Código:** `        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(0);`
- **Função:** Assertion direta: o grid principal fica vazio após excluir as banidas da visão ativa.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 110

- **Código:** `        expect(document.getElementById('image-grid').textContent).toContain('Nenhuma imagem detectada');`
- **Função:** Assertion direta: a UI exibe `Nenhuma imagem detectada` no grid principal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 111

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 112

- **Código:** `        document.querySelector('.tab-btn[data-target="banned-tab"]').click();`
- **Função:** Troca para a aba real `banned-tab` pelo botão de navegação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 113

- **Código:** `        await flushAsyncTasks(8);`
- **Função:** Drena carregamento/renderização da aba Banidas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 114

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 115

- **Código:** `        expect(document.querySelectorAll('#banned-site-list .image-card')).toHaveLength(21);`
- **Função:** Assertion direta: a aba Banidas renderiza 21 cards.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 116

- **Código:** `        expect(document.getElementById('banned-site-list').textContent).toContain('21 ban.');`
- **Função:** Assertion direta: o resumo da lista informa `21 ban.`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 117

- **Código:** `    });`
- **Função:** Fecha o primeiro `test`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 118

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 119

- **Código:** `    test('desbanir 21 imagens reintegra o grid principal e limpa a aba de banidas', async () => {`
- **Função:** Declara cenário que prova remoção em lote das 21 imagens banidas e reintegração no grid principal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 120

- **Código:** `        const host = 'reader.test';`
- **Função:** Define host determinístico `reader.test` usado pela aba, chaves de storage e URLs das fixtures.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 121

- **Código:** `        const images = buildImages(host, 21);`
- **Função:** Gera 21 imagens para o cenário de desbanimento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 122

- **Código:** `        const bannedUrls = images.map(image => image.src);`
- **Função:** Deriva array somente de URLs para pré-semear a chave de banidas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 123

- **Código:** `        const tab = await createActiveTab(\`https://${host}/chapter-2\`, 'Reader Test');`
- **Função:** Cria aba ativa `/chapter-2`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 124

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 125

- **Código:** `        registerPopupTabHandler(tab.id, { images });`
- **Função:** Registra o responder da aba com o conjunto de 21 imagens do cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 126

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 127

- **Código:** `        await storageMock.set({`
- **Função:** Inicia seed de domínio habilitado e banidas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 128

- **Código:** `            enabledDomains: [host],`
- **Função:** Habilita `reader.test`, condição necessária para o popup operar sobre a aba.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 129

- **Código:** `            [\`bannedImages_${host}\`]: bannedUrls,`
- **Função:** Pré-semeia `bannedImages_reader.test` com as 21 URLs.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 130

- **Código:** `        });`
- **Função:** Fecha o seed do segundo cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 131

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 132

- **Código:** `        await loadExtensionPage({`
- **Função:** Invoca `loadExtensionPage` para carregar `popup.html` e executar o `popup.js` real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 133

- **Código:** `            htmlPath: 'extension/popup/popup.html',`
- **Função:** Aponta para o HTML real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 134

- **Código:** `            scriptPath: 'extension/popup/popup.js',`
- **Função:** Aponta para o JavaScript real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 135

- **Código:** `            fireDOMContentLoaded: true,`
- **Função:** Solicita ao helper captura e disparo dos listeners de `DOMContentLoaded` registrados pelo popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 136

- **Código:** `        });`
- **Função:** Fecha os argumentos do carregamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 137

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 138

- **Código:** `        await flushAsyncTasks(12);`
- **Função:** Drena inicialização do popup e carregamento das imagens/banidas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 139

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 140

- **Código:** `        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(0);`
- **Função:** Assertion direta: como todas estão banidas, o grid principal inicia vazio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 141

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 142

- **Código:** `        document.querySelector('.tab-btn[data-target="banned-tab"]').click();`
- **Função:** Abre a aba Banidas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 143

- **Código:** `        await flushAsyncTasks(8);`
- **Função:** Drena renderização da lista banida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 144

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 145

- **Código:** `        expect(document.querySelectorAll('#banned-site-list .image-card')).toHaveLength(21);`
- **Função:** Assertion direta: 21 cards aparecem na lista banida.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 146

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 147

- **Código:** `        document.getElementById('btn-banned-select-all').click();`
- **Função:** Clica `btn-banned-select-all`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 148

- **Código:** `        await flushAsyncTasks(4);`
- **Função:** Drena a atualização da seleção de banidas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 149

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 150

- **Código:** `        expect(document.getElementById('banned-selection-count').textContent).toBe('21 imagens selecionadas');`
- **Função:** Assertion direta: contador de banidas selecionadas informa 21.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 151

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 152

- **Código:** `        document.getElementById('btn-unban-selected').click();`
- **Função:** Clica `btn-unban-selected`, exercitando a remoção agrupada por host.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 153

- **Código:** `        await flushAsyncTasks(12);`
- **Função:** Drena leitura/set do storage e recarga dos dois grids.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 154

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 155

- **Código:** `        const data = await storageMock.get([\`bannedImages_${host}\`]);`
- **Função:** Relê a chave de banidas do host.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 156

- **Código:** `        expect(data[\`bannedImages_${host}\`]).toEqual([]);`
- **Função:** Assertion direta: a chave persistida vira array vazio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 157

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 158

- **Código:** `        document.querySelector('.tab-btn[data-target="main-tab"]').click();`
- **Função:** Retorna à aba Principal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 159

- **Código:** `        await flushAsyncTasks(8);`
- **Função:** Drena a renderização do grid reintegrado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 160

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 161

- **Código:** `        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(21);`
- **Função:** Assertion direta: as 21 imagens reaparecem no grid principal.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 162

- **Código:** `        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(21);`
- **Função:** Assertion direta: as 21 reaparecem selecionadas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 163

- **Código:** `        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');`
- **Função:** Assertion direta: contador confirma 21 selecionadas.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 164

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 165

- **Código:** `        document.querySelector('.tab-btn[data-target="banned-tab"]').click();`
- **Função:** Volta à aba Banidas após o desbanimento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 166

- **Código:** `        await flushAsyncTasks(8);`
- **Função:** Drena renderização do estado vazio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 167

- **Código:** `        expect(document.getElementById('banned-site-list').textContent).toContain('Nenhuma imagem banida.');`
- **Função:** Assertion direta: UI informa `Nenhuma imagem banida.`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 168

- **Código:** `    });`
- **Função:** Fecha o segundo `test`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 169

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 170

- **Código:** `    test('tab Traduzidas abre o reader e envia anchorId ao abrir pasta existente', async () => {`
- **Função:** Declara cenário da aba Traduzidas: cria reader offline e solicita abertura de pasta existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 171

- **Código:** `        const host = 'reader.test';`
- **Função:** Define host determinístico `reader.test` usado pela aba, chaves de storage e URLs das fixtures.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 172

- **Código:** `        const tab = await createActiveTab(\`https://${host}/chapter-3\`, 'Reader Test');`
- **Função:** Cria aba ativa `/chapter-3`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 173

- **Código:** `        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage')`
- **Função:** Cria spy sobre `chrome.runtime.sendMessage` para observar o comando outbound do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 174

- **Código:** `            .mockImplementation((message, callback) => {`
- **Função:** Substitui a implementação do sendMessage durante o caso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 175

- **Código:** `                if (callback) callback({ ok: true });`
- **Função:** Responde `{ok:true}` quando o chamador fornece callback, permitindo o fluxo UI concluir.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 176

- **Código:** `            });`
- **Função:** Fecha a implementação do spy.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 177

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 178

- **Código:** `        registerPopupTabHandler(tab.id, { images: buildImages(host, 3) });`
- **Função:** Registra handler de aba com três imagens; este cenário não traduz, mas mantém o bootstrap do popup funcional.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 179

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 180

- **Código:** `        await storageMock.set({`
- **Função:** Inicia seed de domínio e metadados de capítulo traduzido.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 181

- **Código:** `            enabledDomains: [host],`
- **Função:** Habilita `reader.test`, condição necessária para o popup operar sobre a aba.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 182

- **Código:** `            chapterList: [{`
- **Função:** Inicia `chapterList` com um capítulo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 183

- **Código:** `                id: 'chap_1',`
- **Função:** Define id estável `chap_1`, usado nas chaves derivadas e na URL do reader.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 184

- **Código:** `                title: 'Chapter 10',`
- **Função:** Define título `Chapter 10`, origem do `safeTitle` normalizado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 185

- **Código:** `                url: \`https://${host}/chapter-3\`,`
- **Função:** Associa o capítulo à URL da aba `/chapter-3`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 186

- **Código:** `                timestamp: Date.now(),`
- **Função:** Adiciona timestamp dinâmico aceito pelo renderer; o valor específico não é assertado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 187

- **Código:** `            }],`
- **Função:** Fecha o objeto do capítulo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 188

- **Código:** `            chap_1_images: {`
- **Função:** Semeia duas imagens traduzidas legadas sob `chap_1_images`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 189

- **Código:** `                0: 'data:image/png;base64,PAGE_0',`
- **Função:** Define uma Data URL de página traduzida para o capítulo, usada como conteúdo disponível no storage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 190

- **Código:** `                1: 'data:image/png;base64,PAGE_1',`
- **Função:** Define uma Data URL de página traduzida para o capítulo, usada como conteúdo disponível no storage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 191

- **Código:** `            },`
- **Função:** Fecha o mapa de imagens traduzidas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 192

- **Código:** `            chap_1_paths: {`
- **Função:** Semeia caminhos de arquivos baixados sob `chap_1_paths`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 193

- **Código:** `                0: '/home/user/Downloads/MangaTranslator/Chapter_10/pagina_000.png',`
- **Função:** Define caminho POSIX de página salva; o popup deriva a pasta removendo o filename.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 194

- **Código:** `                1: '/home/user/Downloads/MangaTranslator/Chapter_10/pagina_001.png',`
- **Função:** Define caminho POSIX de página salva; o popup deriva a pasta removendo o filename.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 195

- **Código:** `            },`
- **Função:** Fecha o mapa de caminhos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 196

- **Código:** `            chap_1_dlId: 77,`
- **Função:** Semeia `chap_1_dlId = 77`, âncora que deve ser enviada ao background ao abrir pasta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 197

- **Código:** `        });`
- **Função:** Fecha o seed do terceiro cenário.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 198

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 199

- **Código:** `        await loadExtensionPage({`
- **Função:** Invoca `loadExtensionPage` para carregar `popup.html` e executar o `popup.js` real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 200

- **Código:** `            htmlPath: 'extension/popup/popup.html',`
- **Função:** Aponta para o HTML real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 201

- **Código:** `            scriptPath: 'extension/popup/popup.js',`
- **Função:** Aponta para o JavaScript real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 202

- **Código:** `            fireDOMContentLoaded: true,`
- **Função:** Solicita ao helper captura e disparo dos listeners de `DOMContentLoaded` registrados pelo popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 203

- **Código:** `        });`
- **Função:** Fecha os argumentos do carregamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 204

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 205

- **Código:** `        await flushAsyncTasks(12);`
- **Função:** Drena bootstrap e renderização inicial.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 206

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 207

- **Código:** `        document.querySelector('.tab-btn[data-target="translated-tab"]').click();`
- **Função:** Clica a aba `translated-tab`, disparando `loadTranslatedChapters` real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 208

- **Código:** `        await flushAsyncTasks(12);`
- **Função:** Drena leitura do storage e criação dos elementos de capítulo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 209

- **Código:** linha vazia
- **Função:** Linha vazia estrutural sem efeito em runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 210

- **Código:** `        expect(document.querySelectorAll('#chapter-list .chapter-item')).toHaveLength(1);`
- **Função:** Assertion direta: exatamente um `.chapter-item` é renderizado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 211

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 212

- **Código:** `        const tabIdsBeforeRead = new Set(tabsMock._tabs.keys());`
- **Função:** Captura ids de abas antes de clicar Ler Offline para identificar a nova aba.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 213

- **Código:** `        document.querySelector('.btn-read-chap').click();`
- **Função:** Clica `.btn-read-chap`, cujo handler real usa `chrome.tabs.create`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 214

- **Código:** `        await flushAsyncTasks(6);`
- **Função:** Drena a criação assíncrona no tabs mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 215

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 216

- **Código:** `        const readerTabId = [...tabsMock._tabs.keys()].find(id => !tabIdsBeforeRead.has(id));`
- **Função:** Descobre o id de aba criado após o clique comparando com o snapshot anterior.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 217

- **Código:** `        expect(readerTabId).toBeDefined();`
- **Função:** Assertion direta: uma nova aba realmente foi criada.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 218

- **Código:** `        expect(tabsMock._tabs.get(readerTabId).url).toBe('chrome-extension://test-extension-id/reader/reader.html?id=chap_1');`
- **Função:** Assertion direta: a nova aba aponta exatamente para `reader/reader.html?id=chap_1` na extensão mock.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 219

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 220

- **Código:** `        document.querySelector('.btn-open-chap-folder').click();`
- **Função:** Clica o botão real de abrir pasta do capítulo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 221

- **Código:** `        await flushAsyncTasks(8);`
- **Função:** Drena leitura de paths/dlId e chamada `runtime.sendMessage`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 222

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 223

- **Código:** `        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({`
- **Função:** Inicia assertion sobre a chamada observada ao runtime.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 224

- **Código:** `            action: 'SHOW_EXISTING_FOLDER',`
- **Função:** Assertion direta parcial: a ação outbound deve ser `SHOW_EXISTING_FOLDER`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 225

- **Código:** `            anchorId: 77,`
- **Função:** Assertion direta parcial: `anchorId` deve ser 77.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 226

- **Código:** `            safeTitle: 'Chapter_10',`
- **Função:** Assertion direta parcial: `safeTitle` deve ser `Chapter_10`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 227

- **Código:** `        }), expect.any(Function));`
- **Função:** Fecha `objectContaining` e exige callback; não verifica `folderPath`, embora produção o envie.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 228

- **Código:** `    });`
- **Função:** Fecha o terceiro `test`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 229

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 230

- **Código:** `    test('configuracoes atualizam paralelismo e disparam SET_DEBUG_MODE', async () => {`
- **Função:** Declara cenário que prova leitura/persistência do paralelismo e envio de `SET_DEBUG_MODE`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 231

- **Código:** `        const host = 'reader.test';`
- **Função:** Define host determinístico `reader.test` usado pela aba, chaves de storage e URLs das fixtures.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 232

- **Código:** `        const tab = await createActiveTab(\`https://${host}/chapter-4\`, 'Reader Test');`
- **Função:** Cria aba ativa `/chapter-4`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 233

- **Código:** `        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage')`
- **Função:** Cria spy de `chrome.runtime.sendMessage` para observar `SET_DEBUG_MODE`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 234

- **Código:** `            .mockImplementation((message, callback) => {`
- **Função:** Instala implementação controlada para o spy.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 235

- **Código:** `                if (callback) callback({ ok: true });`
- **Função:** Responde sucesso ao callback do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 236

- **Código:** `            });`
- **Função:** Fecha a implementação do spy.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 237

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 238

- **Código:** `        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });`
- **Função:** Registra handler de aba com uma imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 239

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 240

- **Código:** `        await storageMock.set({`
- **Função:** Inicia seed das configurações.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 241

- **Código:** `            enabledDomains: [host],`
- **Função:** Habilita `reader.test`, condição necessária para o popup operar sobre a aba.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 242

- **Código:** `            maxConcurrentJobs: 3,`
- **Função:** Semeia `maxConcurrentJobs:3`, valor que deve aparecer no slider e label.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 243

- **Código:** `            debugMode: false,`
- **Função:** Semeia `debugMode:false`, estado inicial do toggle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 244

- **Código:** `        });`
- **Função:** Fecha o seed.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 245

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 246

- **Código:** `        await loadExtensionPage({`
- **Função:** Invoca `loadExtensionPage` para carregar `popup.html` e executar o `popup.js` real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 247

- **Código:** `            htmlPath: 'extension/popup/popup.html',`
- **Função:** Aponta para o HTML real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 248

- **Código:** `            scriptPath: 'extension/popup/popup.js',`
- **Função:** Aponta para o JavaScript real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 249

- **Código:** `            fireDOMContentLoaded: true,`
- **Função:** Solicita ao helper captura e disparo dos listeners de `DOMContentLoaded` registrados pelo popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 250

- **Código:** `        });`
- **Função:** Fecha os argumentos do carregamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 251

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 252

- **Código:** `        await flushAsyncTasks(10);`
- **Função:** Drena inicialização da UI.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 253

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 254

- **Código:** `        document.getElementById('btn-options').click();`
- **Função:** Clica `btn-options`, abrindo a superfície de configurações.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 255

- **Código:** `        await flushAsyncTasks(10);`
- **Função:** Drena inicialização dos controles.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 256

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 257

- **Código:** `        const parallelSlider = document.getElementById('settings-parallel');`
- **Função:** Obtém o input range `settings-parallel`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 258

- **Código:** `        const parallelValue = document.getElementById('settings-parallel-val');`
- **Função:** Obtém o texto espelho `settings-parallel-val`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 259

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 260

- **Código:** `        expect(parallelSlider.value).toBe('3');`
- **Função:** Assertion direta: slider restaura valor `3` do storage.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 261

- **Código:** `        expect(parallelValue.textContent).toBe('3');`
- **Função:** Assertion direta: label também mostra `3`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 262

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 263

- **Código:** `        parallelSlider.value = '5';`
- **Função:** Altera programaticamente o slider para `5`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 264

- **Código:** `        parallelSlider.dispatchEvent(new Event('input', { bubbles: true }));`
- **Função:** Dispara evento real `input`, acionando o listener do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 265

- **Código:** `        await flushAsyncTasks(4);`
- **Função:** Drena o `chrome.storage.local.set` associado ao input.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 266

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 267

- **Código:** `        document.getElementById('debug-toggle-label').click();`
- **Função:** Clica a linha do toggle debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 268

- **Código:** `        await flushAsyncTasks(6);`
- **Função:** Drena o sendMessage e callback que aplica o novo estado visual.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 269

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 270

- **Código:** `        const data = await storageMock.get(['maxConcurrentJobs']);`
- **Função:** Relê `maxConcurrentJobs` do storage após o evento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 271

- **Código:** `        expect(data.maxConcurrentJobs).toBe(5);`
- **Função:** Assertion direta: storage persistiu `5`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 272

- **Código:** `        expect(parallelValue.textContent).toBe('5');`
- **Função:** Assertion direta: label do slider também mudou para `5`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 273

- **Código:** `        expect(sendMessageSpy).toHaveBeenCalledWith({`
- **Função:** Inicia assertion da mensagem enviada ao runtime.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 274

- **Código:** `            action: 'SET_DEBUG_MODE',`
- **Função:** Assertion direta: ação enviada é `SET_DEBUG_MODE`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 275

- **Código:** `            debugOn: true,`
- **Função:** Assertion direta: payload solicita `debugOn:true`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 276

- **Código:** `        }, expect.any(Function));`
- **Função:** Fecha objeto esperado e exige callback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 277

- **Código:** `        expect(document.getElementById('debug-toggle-text').textContent).toContain('Debug ATIVADO');`
- **Função:** Assertion direta: texto visual passa a conter `Debug ATIVADO`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 278

- **Código:** `    });`
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 279

- **Código:** `    test('configurações do popup exibem e salvam o modo de exclusão segura', async () => {`
- **Função:** Declara cenário de restauração e persistência do modo `background_delete` no popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 280

- **Código:** `        const host = 'reader.test';`
- **Função:** Define host determinístico `reader.test` usado pela aba, chaves de storage e URLs das fixtures.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 281

- **Código:** `        const tab = await createActiveTab(\`https://${host}/chapter-safe-mode\`, 'Reader Test');`
- **Função:** Cria aba ativa `/chapter-safe-mode`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 282

- **Código:** `        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });`
- **Função:** Registra handler de aba com uma imagem.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 283

- **Código:** `        await storageMock.set({ enabledDomains: [host], geminiExecutionMode: 'background_delete' });`
- **Função:** Semeia domínio habilitado e `geminiExecutionMode:'background_delete'`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 284

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 285

- **Código:** `        await loadExtensionPage({`
- **Função:** Invoca `loadExtensionPage` para carregar `popup.html` e executar o `popup.js` real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 286

- **Código:** `            htmlPath: 'extension/popup/popup.html',`
- **Função:** Aponta para o HTML real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 287

- **Código:** `            scriptPath: 'extension/popup/popup.js',`
- **Função:** Aponta para o JavaScript real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 288

- **Código:** `            fireDOMContentLoaded: true,`
- **Função:** Solicita ao helper captura e disparo dos listeners de `DOMContentLoaded` registrados pelo popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 289

- **Código:** `        });`
- **Função:** Fecha os argumentos do carregamento.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 290

- **Código:** `        await flushAsyncTasks(10);`
- **Função:** Drena bootstrap do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 291

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 292

- **Código:** `        document.getElementById('btn-options').click();`
- **Função:** Abre as configurações.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 293

- **Código:** `        await flushAsyncTasks(8);`
- **Função:** Drena inicialização dos radios de modo Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 294

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 295

- **Código:** `        const secureMode = document.getElementById('popup-gemini-mode-delete');`
- **Função:** Obtém o radio `popup-gemini-mode-delete`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 296

- **Código:** `        expect(secureMode).not.toBeNull();`
- **Função:** Assertion direta: o controle de exclusão segura existe no DOM.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 297

- **Código:** `        expect(secureMode.checked).toBe(true);`
- **Função:** Assertion direta: o radio de exclusão segura é restaurado como marcado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 298

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 299

- **Código:** `        document.getElementById('popup-gemini-mode-temp').checked = true;`
- **Função:** Marca manualmente o radio `temp_chat`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 300

- **Código:** `        document.getElementById('popup-gemini-mode-temp').dispatchEvent(new Event('change', { bubbles: true }));`
- **Função:** Dispara `change` no radio temporário, acionando persistência real do popup.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 301

- **Código:** `        await flushAsyncTasks(4);`
- **Função:** Drena callback de storage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 302

- **Código:** `        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('temp_chat');`
- **Função:** Assertion direta: `geminiExecutionMode` persistiu `temp_chat`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 303

- **Código:** linha vazia
- **Função:** Linha em branco usada apenas para separar blocos lógicos; não altera runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 304

- **Código:** `        secureMode.checked = true;`
- **Função:** Marca novamente o radio de exclusão segura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 305

- **Código:** `        secureMode.dispatchEvent(new Event('change', { bubbles: true }));`
- **Função:** Dispara `change` no radio `background_delete`.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 306

- **Código:** `        await flushAsyncTasks(4);`
- **Função:** Drena callback de storage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — esta instrução pertence a um dos cinco casos que o mesmo blob executou e passou; a propriedade isolada não tem assertion própria nesta linha.

### Linha 307

- **Código:** `        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('background_delete');`
- **Função:** Assertion direta: `geminiExecutionMode` volta a `background_delete`.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica deste mesmo teste passou no CI observado em Node 20 e Node 22.

### Linha 308

- **Código:** `    });`
- **Função:** Fecha o quinto `test`; o terceiro radio `minimized_window` não é exercitado.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `minimized_window` na UI do popup.

### Linha 309

- **Código:** `});`
- **Função:** Fecha o `describe` principal.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — estrutura sintática/textual confirmada no blob auditado.

### Linha 310

- **Código:** linha vazia
- **Função:** Linha em branco final anterior ao newline terminal.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — estrutura sintática/textual confirmada no blob auditado.

### Posição 311 — newline final

- **Código:** newline terminal após a linha textual 310.
- **Função:** encerra o arquivo segundo a convenção textual observada no blob.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — confirmado ao reler o conteúdo exato do SHA auditado.

## 11. Fonte integral auditada

```js
const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const {
    getStorageMock,
    getTabsMock,
} = require('../mocks/chrome-api.mock.js');

function buildImages(host, total = 21) {
    return Array.from({ length: total }, (_, index) => ({
        index,
        src: `https://${host}/page-${index}.png`,
        width: 800 + index,
        height: 1200 + index,
    }));
}

describe('REG-08/PU-33/PU-34/PU-35/PU-36/PU-37/PU-38/PU-39/PU-40/PU-41/PU-42/PU-43/PU-44/PU-45/PU-46/PU-47/PU-48/PU-49/PU-49b/PU-50/PU-51/PU-52/PU-53: popup.js + popup.html - fluxos avancados reais', () => {
    let storageMock;
    let tabsMock;

    async function createActiveTab(url, title = 'Manga Page') {
        const tab = await tabsMock.create({ url, active: true });
        tabsMock._tabs.get(tab.id).title = title;
        return tab;
    }

    function registerPopupTabHandler(tabId, {
        images = [],
        onStartTranslation = null,
    } = {}) {
        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({ images, total: images.length });
                return;
            }

            if (message.action === 'SET_SELECTED_IMAGES') {
                sendResponse({ success: true });
                return;
            }

            if (message.action === 'START_TRANSLATION_FROM_POPUP') {
                if (onStartTranslation) onStartTranslation(message);
                sendResponse({ success: true });
                return;
            }

            if (message.action === 'ENABLE_PAGE' || message.action === 'HIGHLIGHT_IMAGE') {
                sendResponse({ success: true });
            }
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('select all/none e banir 21 imagens movem tudo para a aba de banidas', async () => {
        const host = 'reader.test';
        const images = buildImages(host, 21);
        const tab = await createActiveTab(`https://${host}/chapter-1`, 'Reader Test');

        registerPopupTabHandler(tab.id, { images });

        await storageMock.set({
            enabledDomains: [host],
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(12);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(21);
        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');

        document.getElementById('btn-select-none').click();
        await flushAsyncTasks(4);

        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(0);
        expect(document.getElementById('selection-count').textContent).toBe('0 imagens selecionadas');
        expect(document.getElementById('btn-translate').disabled).toBe(true);

        document.getElementById('btn-select-all').click();
        await flushAsyncTasks(4);

        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(21);
        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');
        expect(document.getElementById('btn-translate').disabled).toBe(false);

        document.getElementById('btn-ban-selected').click();
        await flushAsyncTasks(12);

        const data = await storageMock.get([`bannedImages_${host}`]);
        expect(data[`bannedImages_${host}`]).toHaveLength(21);
        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(0);
        expect(document.getElementById('image-grid').textContent).toContain('Nenhuma imagem detectada');

        document.querySelector('.tab-btn[data-target="banned-tab"]').click();
        await flushAsyncTasks(8);

        expect(document.querySelectorAll('#banned-site-list .image-card')).toHaveLength(21);
        expect(document.getElementById('banned-site-list').textContent).toContain('21 ban.');
    });

    test('desbanir 21 imagens reintegra o grid principal e limpa a aba de banidas', async () => {
        const host = 'reader.test';
        const images = buildImages(host, 21);
        const bannedUrls = images.map(image => image.src);
        const tab = await createActiveTab(`https://${host}/chapter-2`, 'Reader Test');

        registerPopupTabHandler(tab.id, { images });

        await storageMock.set({
            enabledDomains: [host],
            [`bannedImages_${host}`]: bannedUrls,
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(12);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(0);

        document.querySelector('.tab-btn[data-target="banned-tab"]').click();
        await flushAsyncTasks(8);

        expect(document.querySelectorAll('#banned-site-list .image-card')).toHaveLength(21);

        document.getElementById('btn-banned-select-all').click();
        await flushAsyncTasks(4);

        expect(document.getElementById('banned-selection-count').textContent).toBe('21 imagens selecionadas');

        document.getElementById('btn-unban-selected').click();
        await flushAsyncTasks(12);

        const data = await storageMock.get([`bannedImages_${host}`]);
        expect(data[`bannedImages_${host}`]).toEqual([]);

        document.querySelector('.tab-btn[data-target="main-tab"]').click();
        await flushAsyncTasks(8);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(21);
        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(21);
        expect(document.getElementById('selection-count').textContent).toBe('21 imagens selecionadas');

        document.querySelector('.tab-btn[data-target="banned-tab"]').click();
        await flushAsyncTasks(8);
        expect(document.getElementById('banned-site-list').textContent).toContain('Nenhuma imagem banida.');
    });

    test('tab Traduzidas abre o reader e envia anchorId ao abrir pasta existente', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-3`, 'Reader Test');
        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage')
            .mockImplementation((message, callback) => {
                if (callback) callback({ ok: true });
            });

        registerPopupTabHandler(tab.id, { images: buildImages(host, 3) });

        await storageMock.set({
            enabledDomains: [host],
            chapterList: [{
                id: 'chap_1',
                title: 'Chapter 10',
                url: `https://${host}/chapter-3`,
                timestamp: Date.now(),
            }],
            chap_1_images: {
                0: 'data:image/png;base64,PAGE_0',
                1: 'data:image/png;base64,PAGE_1',
            },
            chap_1_paths: {
                0: '/home/user/Downloads/MangaTranslator/Chapter_10/pagina_000.png',
                1: '/home/user/Downloads/MangaTranslator/Chapter_10/pagina_001.png',
            },
            chap_1_dlId: 77,
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(12);

        document.querySelector('.tab-btn[data-target="translated-tab"]').click();
        await flushAsyncTasks(12);

        expect(document.querySelectorAll('#chapter-list .chapter-item')).toHaveLength(1);

        const tabIdsBeforeRead = new Set(tabsMock._tabs.keys());
        document.querySelector('.btn-read-chap').click();
        await flushAsyncTasks(6);

        const readerTabId = [...tabsMock._tabs.keys()].find(id => !tabIdsBeforeRead.has(id));
        expect(readerTabId).toBeDefined();
        expect(tabsMock._tabs.get(readerTabId).url).toBe('chrome-extension://test-extension-id/reader/reader.html?id=chap_1');

        document.querySelector('.btn-open-chap-folder').click();
        await flushAsyncTasks(8);

        expect(sendMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'SHOW_EXISTING_FOLDER',
            anchorId: 77,
            safeTitle: 'Chapter_10',
        }), expect.any(Function));
    });

    test('configuracoes atualizam paralelismo e disparam SET_DEBUG_MODE', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-4`, 'Reader Test');
        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage')
            .mockImplementation((message, callback) => {
                if (callback) callback({ ok: true });
            });

        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });

        await storageMock.set({
            enabledDomains: [host],
            maxConcurrentJobs: 3,
            debugMode: false,
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        await flushAsyncTasks(10);

        document.getElementById('btn-options').click();
        await flushAsyncTasks(10);

        const parallelSlider = document.getElementById('settings-parallel');
        const parallelValue = document.getElementById('settings-parallel-val');

        expect(parallelSlider.value).toBe('3');
        expect(parallelValue.textContent).toBe('3');

        parallelSlider.value = '5';
        parallelSlider.dispatchEvent(new Event('input', { bubbles: true }));
        await flushAsyncTasks(4);

        document.getElementById('debug-toggle-label').click();
        await flushAsyncTasks(6);

        const data = await storageMock.get(['maxConcurrentJobs']);
        expect(data.maxConcurrentJobs).toBe(5);
        expect(parallelValue.textContent).toBe('5');
        expect(sendMessageSpy).toHaveBeenCalledWith({
            action: 'SET_DEBUG_MODE',
            debugOn: true,
        }, expect.any(Function));
        expect(document.getElementById('debug-toggle-text').textContent).toContain('Debug ATIVADO');
    });
    test('configurações do popup exibem e salvam o modo de exclusão segura', async () => {
        const host = 'reader.test';
        const tab = await createActiveTab(`https://${host}/chapter-safe-mode`, 'Reader Test');
        registerPopupTabHandler(tab.id, { images: buildImages(host, 1) });
        await storageMock.set({ enabledDomains: [host], geminiExecutionMode: 'background_delete' });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(10);

        document.getElementById('btn-options').click();
        await flushAsyncTasks(8);

        const secureMode = document.getElementById('popup-gemini-mode-delete');
        expect(secureMode).not.toBeNull();
        expect(secureMode.checked).toBe(true);

        document.getElementById('popup-gemini-mode-temp').checked = true;
        document.getElementById('popup-gemini-mode-temp').dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);
        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('temp_chat');

        secureMode.checked = true;
        secureMode.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);
        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('background_delete');
    });
});

```

## 12. Conclusão documental

O blob `dd15edcefd5963fea83a72801b1d3c00b7e37453` foi coberto integralmente: **310 linhas textuais + posição 311 do newline final**. A execução do mesmo blob foi comprovada em Node 20 e Node 22 no run 36521561968, com os cinco testes passando em ambos.

As duas lacunas externas relevantes foram preservadas como solicitações ao auditor sem alterar o objeto auditado: falta de assertion de `folderPath` e falta de prova específica do radio `minimized_window` no popup. Elas não impedem a conclusão documental desta Bíblia.

# Bíblia técnica — tests/helpers/load-content-script.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DOCUMENTAL APROVADA  
> **SHA auditado:** `40d7c59d81a533c2f7d2b12d6c8c30bc77fb43f0`  
> **Agente responsável:** AGENTE 10  
> **Tipo:** helper de harness Jest/JSDOM para executar o content script Manga real sob estado controlado  
> **Linhas textuais:** **171**  
> **Posições documentais:** **172**, contando o newline final  
> **Tamanho textual observado:** **7509 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/helpers/load-content-script.js` é a ponte entre as suites Jest e o bundle real que o Chromium injeta em páginas de mangá.

O alvo principal, `extension/content/content_manga.js`, é um IIFE com side effects imediatos: consulta `window.location`, lê `chrome.storage.local`, registra listeners, cria/recupera UI e depende de módulos globais carregados antes dele. Portanto, simplesmente executar `require(content_manga.js)` em JSDOM não produz um ambiente determinístico.

O helper resolve esse problema em uma ordem deliberada:

1. invalida qualquer instância de content script que tenha sobrevivido no mesmo `window`;
2. remove o botão flutuante stale;
3. instala uma `window.location` previsível;
4. semeia storage antes do IIFE ler preferências;
5. cria imagens de fixture e completa as dimensões que JSDOM não calcula;
6. espelha APIs globais necessárias quando faltam no `window`;
7. limpa o guard de injeção;
8. carrega os módulos reais na mesma sequência do primeiro `content_scripts` do manifest;
9. espera, com limite, o botão sinalizar que a posição inicial foi aplicada;
10. retorna três utilitários pequenos para dirigir o content script real.

Ele **não é mock da lógica de manga**. O helper monta o ambiente; as implementações carregadas nas linhas 125–130 são os arquivos reais da extensão.

## 2. Contrato de entrada

### hostname

Default: `testmanga.com`.

É usado em três lugares diferentes:

- `window.location.hostname`;
- `window.location.href = https://<hostname>/chapter/1`;
- chave `bannedImages_<hostname>`.

A whitelist default também deriva dele.

### enabledDomains

Default nominal: `null`. Na linha 75, `enabledDomains ?? [hostname]` transforma apenas `null`/`undefined` em whitelist contendo o host.

Consequência importante: `enabledDomains: []` permanece array vazio e simula página não habilitada.

### bannedImages

Default: `[]`.

É persistido na chave específica do host antes do carregamento. Isso permite testar filtros reais sem alterar o código de produção.

### imageMinWidth / imageMinHeight

Só entram no storage se forem diferentes de `undefined`. Assim, omitir a opção deixa o content script aplicar seus defaults; passar um número explícito altera o contrato da varredura.

### floatingButtonEnabled / clickToTranslateEnabled

Também só são gravados quando explicitamente fornecidos. Isso é relevante porque `false` precisa ser preservado; a implementação usa teste contra `undefined`, não truthiness.

### domImages

Lista de descritores com:

- `src`;
- `width`;
- `height`;
- `className` opcional;
- `attributes` opcional.

Cada item vira um `<img data-testid="img-N">` no body.

## 3. Contrato de saída real

A documentação JSDoc da linha 39 declara `{ listeners, getState }`, mas esse contrato não corresponde à implementação atual.

O retorno real é:

- `sendMessage(action, extra = {})`;
- `getButton()`;
- `getMainContent()`.

Nenhuma propriedade `listeners` ou `getState` é retornada.

Essa divergência é documental no próprio código-fonte e foi registrada como **102-001**, sem alteração do arquivo auditado.

## 4. Dependências

### 4.1 Dependências Node/Jest

- `path`: monta caminhos absolutos.
- `fs`: importado na linha 16, mas **não utilizado** neste arquivo.
- `./repo-root#findRepoRoot`: percorre ancestrais até encontrar `extension/manifest.json`.
- `jest.isolateModules`: cria registry isolado para os requires.
- timers globais: polling de 10 ms e fallback de `sendMessage` de 50 ms.

### 4.2 Dependências de ambiente

O helper pressupõe:

- `window` e `document` JSDOM;
- `global.chrome.storage.local.set`;
- `global.chrome.runtime._messageListeners`, detalhe privado do mock do projeto;
- APIs Jest disponíveis globalmente;
- os módulos da extensão podendo registrar side effects no mesmo `window`.

O `jest.config.js` atual satisfaz essas premissas para `content-scripts` e `integration`: ambos usam `jsdom` e carregam `tests/mocks/chrome-api.mock.js` + `tests/mocks/dom-environment.js`.

### 4.3 Módulos reais carregados

A sequência do helper é:

1. `extension/shared/gtc-fingerprint.js`;
2. `extension/content/cm-gtc-client.js`;
3. `extension/content/cm-dom-replace.js`;
4. `extension/content/cm-chapter.js`;
5. `extension/content/cm-auto-restore.js`;
6. `extension/content/content_manga.js`.

A sequência observada no primeiro `content_scripts[].js` de `extension/manifest.json` é idêntica para o SHA atual.

Isso é importante porque esses módulos comunicam por globals no mesmo contexto. Reordená-los no helper pode criar um ambiente que não corresponde ao runtime da extensão.

## 5. Ownership de instância e reinjeção

`content_manga.js` cria `CONTENT_INSTANCE_ID`, grava esse valor em `window.__manga_translator_active_instance` e consulta igualdade por `isActiveContentInstance()`.

O helper explora esse contrato antes de alterar storage:

`window.__manga_translator_active_instance = __mt_test_reset_<tempo>_<aleatório>`.

Isso torna stale apenas os callbacks antigos que realmente consultam `isActiveContentInstance()`. A proteção não cobre todos os listeners de storage: o listener de `imageMinWidth`/`imageMinHeight` registrado por `content_manga.js` não consulta esse guard e pode continuar sendo invocado se o mock preservar listeners entre cargas.

Depois, o helper remove `#manga-translator-trigger` antigo e, somente mais tarde, apaga `__manga_translator_content_injected` para permitir a nova execução do IIFE.

A ordem é deliberada:

`invalidar ownership antigo → remover UI stale → preparar ambiente → liberar guard → carregar nova instância`.

## 6. Storage e ordem assíncrona

O `await global.chrome.storage.local.set(storageInit)` ocorre antes dos `require(...)`.

Isso evita race em que o IIFE novo consulte `enabledDomains`, banidas ou dimensões antes da fixture estar pronta.

Campos sempre gravados:

- `enabledDomains`;
- `bannedImages_<hostname>`;
- `customPrompt: 'Teste prompt'`.

Campos opcionais:

- `imageMinWidth`;
- `imageMinHeight`;
- `floatingButtonEnabled`;
- `clickToTranslateEnabled`.

O helper não limpa todo storage por conta própria. Suites normalmente fazem isso no `beforeEach`; isso preserva a possibilidade de testes semearem outras chaves antes de chamar o loader, como `btnPos`.

## 7. Construção do DOM

O helper substitui `document.body.innerHTML` pelo conjunto de imagens solicitado.

Para cada imagem:

- `data-testid` é derivado do índice original;
- `className` é opcional;
- `attributes` é serializado por interpolação;
- `width` e `height` viram atributos HTML.

Depois, define propriedades que JSDOM não calcula de uma imagem real:

- `naturalWidth`;
- `naturalHeight`;
- `complete = true`.

Essas propriedades são `configurable: true`, o que permite que casos específicos as redefinam posteriormente.

### Limite de segurança do fixture builder

`className`, nomes/valores em `attributes` e demais campos são texto fornecido pelo próprio teste e entram em `innerHTML` sem escaping.

Isso **não é uma vulnerabilidade de produção**: o helper só roda na suíte. Porém um teste com aspas/HTML em valores pode produzir DOM diferente do descritor pretendido. A Bíblia trata isso como boundary do harness, não como risco de dados do usuário.

## 8. APIs globais no JSDOM

`crypto` e `TextEncoder` são espelhados do `global` para `window` somente se:

- a referência global existe; e
- a janela ainda não possui a propriedade.

Portanto o helper não substitui uma implementação JSDOM/browser já instalada.

Isso é especialmente relevante para caminhos de fingerprint, que podem consultar APIs no namespace da página em vez do namespace Node.

Não foi localizada assertion focal que force os quatro estados (global presente/ausente × window presente/ausente); a cobertura atual é indireta pelos fluxos reais.

## 9. Inicialização e polling do botão

Depois dos requires, o helper calcula:

`shouldCreateButton = domains.includes(hostname) && floatingButtonEnabled !== false`.

Se o botão não deveria existir, o loop encerra na primeira iteração.

Se deveria existir, o helper espera até uma destas condições:

- `#manga-translator-trigger` existe e `dataset.positionReady === 'true'`;
- 250 ms se passam.

O content script real define inicialmente `positionReady='false'` e muda para `'true'` depois de aplicar estado de storage, portanto o marker tem significado concreto.

### Limite do timeout

Ao chegar a 250 ms, o helper simplesmente retorna. Ele não lança, não informa timeout e não inclui `ready` no retorno.

Em máquinas lentas ou após aumento de trabalho assíncrono, um teste pode prosseguir com botão ausente/parcialmente inicializado e falhar longe da causa. Essa lacuna está em **102-004**.

## 10. sendMessage: simulação dirigida do canal content

`sendMessage` não chama `chrome.runtime.sendMessage`. Ele dirige diretamente os listeners registrados no mock, simulando a entrega que `chrome.tabs.sendMessage` faria ao content script.

Passos:

1. lê `global.chrome.runtime._messageListeners ?? []`;
2. constrói `{ action, ...extra }`;
3. chama cada listener com:
   - payload;
   - sender `{ tab: { id: 1 } }`;
   - `resolve` como sendResponse;
4. agenda `resolve(null)` após 50 ms caso ninguém responda.

Como a Promise aceita somente a primeira resolução, o vencedor depende do tempo. Se um listener chamar `sendResponse` antes de 50 ms, essa resposta vence. Se a resposta assíncrona chegar depois de 50 ms, o fallback `resolve(null)` já terá resolvido a Promise e a resposta tardia será ignorada. O helper também não usa o valor de retorno dos listeners (`true` no contrato Chrome para manter o canal assíncrono aberto), portanto não reproduz integralmente essa semântica.

### Limite de lifecycle

O timeout de 50 ms é sempre criado, mesmo se o listener chamar `resolve` sincronamente. O handle não é guardado nem cancelado.

Isso significa que uma chamada que já terminou pode deixar um timer vivo por até 50 ms. Isoladamente é pequeno, mas o projeto possui histórico explícito de worker leaks por timers pendentes. A lacuna está registrada em **102-002**.

### Multiplicidade de listeners

Todos os listeners recebem a mesma mensagem e o mesmo callback. A primeira resolução efetiva vence. Isso reproduz o mock disponível, mas não valida que exista exatamente um listener content.

Se uma suite esquecer cleanup e acumular listeners, o helper pode esconder a causa como comportamento “first response wins”. A invalidação de instância reduz side effects antigos, mas não remove listeners do mock.

## 11. Consumers reais examinados

O helper é importado por várias suites que executam `content_manga.js` real.

### floating-button-guard-and-single-click.test.js

Evidências fortes ligadas ao helper:

- chama com `floatingButtonEnabled: false` e exige ausência de `#manga-translator-trigger`;
- usa `context.getButton()` para obter a UI real;
- usa `context.sendMessage('PROGRESS', ...)` e depois exige recuperação/estado visual;
- usa `GET_FLOATING_BUTTON_STATUS` e exige objetos de resposta;
- usa `clickToTranslateEnabled`, `bannedImages` e múltiplas `domImages`;
- usa `data-testid="img-1"`, provando a convenção de IDs de fixture;
- chama `getMainContent()` durante fluxos ativos.

### extraction-and-handlers-real.test.js

- usa hostname/whitelist e exige botão presente;
- usa `bannedImages` + `domImages` e `sendMessage('GET_PAGE_IMAGES')`;
- passa `imageMinWidth=150` e `imageMinHeight=100` e exige que 180×120 passe enquanto 180×90 seja filtrada;
- utiliza `data-testid="img-0"`;
- dirige handlers reais como START_TRANSLATION_FROM_POPUP.

Isso fornece evidência concreta de que storage seed, dimensões naturais, DOM fixture e entrega de mensagens cooperam.

### gtc-indexeddb-deep.test.js

- passa `className` e `attributes` em `domImages`;
- usa `data-testid`;
- clica `context.getMainContent()`;
- usa `context.sendMessage('UPDATE_IMAGE', ...)`, mas esse consumer **não asserta a resposta** da mensagem; ele observa efeitos/persistência posteriores. No handler real, `UPDATE_IMAGE` só envia ACK quando `expectAck === true`, opção não fornecida nesse cenário;
- em cenário com 50 imagens, verifica comportamento e texto através do mesmo loader.

### button-ui-real.test.js

- exige criação do botão e oito handles depois do helper;
- testa idempotência de ENABLE_PAGE;
- semeia `btnPos` antes de chamar o helper e confirma que o helper não apaga esse estado externo;
- usa o ambiente montado em drag/resize.

## 12. Classificação de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| loader usa módulos reais, não cópias | require dos seis arquivos reais + assertions downstream | ✅ PROVADO DIRETAMENTE no ambiente de teste |
| `getButton()` retorna o botão real | consumers inspecionam null/presença/estilo pelo retorno | ✅ PROVADO DIRETAMENTE |
| `getMainContent()` retorna o main content real | consumers clicam/leem textContent pelo retorno | ✅ PROVADO DIRETAMENTE |
| `sendMessage` entrega mensagens aos listeners e obtém algumas respostas | `GET_FLOATING_BUTTON_STATUS`, `TRANSLATE_CONTEXT_IMAGE` e `GET_PAGE_IMAGES` possuem assertions de resposta em consumers; `UPDATE_IMAGE` é disparado em consumer observado, mas sua resposta não é assertada e o cenário não envia `expectAck` | ✅ PROVADO DIRETAMENTE para dispatch e para as respostas explicitamente assertadas; 🟨 execução indireta para `UPDATE_IMAGE` |
| `domImages` cria IDs determinísticos | consumers usam `[data-testid="img-N"]` após o loader | ✅ PROVADO DIRETAMENTE |
| naturalWidth/naturalHeight refletem fixture | teste de limites 180×120/180×90 depende dessas propriedades e faz assertion de resultado | ✅ PROVADO DIRETAMENTE pelo fluxo real |
| bannedImages é semeado antes do IIFE | GET_PAGE_IMAGES e menu contextual rejeitam URLs banidas passadas ao loader | ✅ PROVADO DIRETAMENTE pelo fluxo real |
| floatingButtonEnabled=false chega ao bootstrap | consumer exige ausência do botão logo após o loader | ✅ PROVADO DIRETAMENTE |
| ordem dos seis requires coincide com manifest atual | comparação manual do branch atual | 🟦 CONTRATO ESTÁTICO OBSERVADO; sem gate automático específico |
| invalidação de instância stale neutraliza apenas handlers que consultam `isActiveContentInstance()` | helper + guard real do `content_manga.js`; listener de dimensões não usa o guard | 🟨 EXECUTADO INDIRETAMENTE para handlers guardados; ⚠️ lacuna 102-005 para listener de dimensões |
| fallback de `sendMessage` retorna null sem resposta | branch presente, mas não foi localizada assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| timeout do fallback é limpo após resposta | implementação não limpa | ⚠️ AUSÊNCIA/ROBUSTEZ — 102-002 |
| timeout de bootstrap 250 ms é tratado explicitamente | implementação retorna silenciosamente | ⚠️ AUSÊNCIA/ROBUSTEZ — 102-004 |
| branches de crypto/TextEncoder | dependência usada por fluxos, sem cases focais de presença/ausência | 🟨 EXECUTADO INDIRETAMENTE |
| JSDoc de retorno reflete API atual | não reflete | ⚠️ DOCUMENTAÇÃO STALE — 102-001 |

## 13. Casos-limite e comportamento esperado

1. **enabledDomains=[]**: página não está habilitada; `shouldCreateButton=false`.
2. **floatingButtonEnabled=false**: mesmo em domínio habilitado, loader não espera botão.
3. **hostname com dados banidos**: chave é composta literalmente como `bannedImages_<hostname>`.
4. **domImages vazio**: body fica vazio.
5. **width/height 0 ou ausentes**: natural dimensions viram 0 por `|| 0`.
6. **className vazio**: atributo class é omitido.
7. **attributes vazio**: nenhuma extensão de atributos.
8. **attributes contendo aspas/markup**: pode alterar a string HTML; entrada é test-controlled.
9. **global.crypto inexistente**: helper não cria `window.crypto`.
10. **window.crypto já existente**: helper preserva a referência existente.
11. **guard de injeção previamente true**: é removido antes dos requires.
12. **módulo required lança**: `loadContentScript` rejeita; polling e retorno não ocorrem.
13. **storage.set rejeita/lança**: requires não começam.
14. **botão nunca chega a positionReady=true**: helper retorna depois do limite sem erro explícito.
15. **nenhum runtime listener**: `sendMessage` resolve null após 50 ms.
16. **listener responde imediatamente ou antes de 50 ms**: a resposta vence, mas o timer de 50 ms continua agendado.
17. **listener responde assincronamente depois de 50 ms**: o fallback `null` vence e a resposta tardia é ignorada; o helper não prolonga a janela com base em `return true`.
18. **múltiplos listeners respondem**: primeira resolução ganha; todos foram invocados.
19. **listener lança síncronamente dentro do forEach**: se o throw ocorrer antes de qualquer `resolve`, o executor rejeita a Promise; se um listener anterior já tiver resolvido, um throw posterior não altera o settlement e a Promise permanece fulfilled. A primeira resolução/rejeição efetiva é definitiva.
20. **extra contém action**: como payload é `{ action, ...extra }`, `extra.action` pode sobrescrever o primeiro argumento. Isso é uma característica do helper e exige disciplina do caller.
21. **location precisa de propriedade não modelada**: este helper oferece apenas hostname/href/pathname; código futuro que leia origin/search/hash pode observar undefined no harness.

## 14. Invariantes

1. A reserva/documentação deste arquivo só vale para o SHA declarado.
2. Storage necessário ao bootstrap deve ser preparado antes de carregar o IIFE.
3. A instância antiga deve ser invalidada antes de mutar storage quando o mesmo window for reutilizado.
4. O guard `__manga_translator_content_injected` precisa ser removido antes da reinjeção.
5. A ordem dos módulos precisa acompanhar a ordem real do manifest.
6. `domImages` deve fornecer dimensões naturais utilizáveis pelo código real.
7. `false` explícito em preferências não pode ser perdido por truthiness.
8. Array vazio explícito de enabledDomains não deve virar `[hostname]`.
9. O helper deve continuar executando implementação real, não um mirror de `content_manga.js`.
10. `sendMessage` deve preservar `action` + campos extras. Respostas síncronas ou assíncronas que cheguem antes do fallback de 50 ms podem resolver a Promise; respostas posteriores a 50 ms perdem para `null`, e o helper não preserva a semântica de `return true` do runtime Chrome.
11. O fallback de mensagem não deve converter silêncio em Promise pendente indefinidamente.
12. Timers do harness não devem permanecer vivos além do necessário.
13. O helper não deve apagar estado adicional sem que o caller peça; alguns testes semeiam chaves antes da chamada.
14. `getButton` e `getMainContent` devem permanecer lookups, sem side effects.
15. Se o bootstrap exceder o limite, o harness deveria produzir diagnóstico suficientemente próximo da causa.
16. Alterações no manifest que mudem o bundle Manga exigem revalidar este helper.

## 15. Riscos e análise crítica

### 15.1 JSDoc incorreto

O retorno documentado não existe. Isso pode induzir novos testes a procurar APIs antigas.

### 15.2 Timer de 50 ms não cancelado

Cada `sendMessage` deixa o fallback agendado mesmo depois de resposta. O custo é pequeno, mas é conceitualmente contrário ao esforço do projeto de eliminar handles pendentes. Além disso, o timer é também um limite semântico: uma resposta assíncrona posterior a 50 ms é perdida para `null`, mesmo que o listener use o padrão de canal assíncrono do Chrome.

### 15.3 Timeout de bootstrap silencioso

O polling é bounded, o que evita hang indefinido, mas o failure mode é opaco: a função retorna um contexto aparentemente pronto.

### 15.4 Acoplamento ao internals do mock

`_messageListeners` não é API Chrome. É contrato interno de `tests/mocks/chrome-api.mock.js`. Refatorar o mock exige atualizar o helper e os consumidores.

### 15.5 Ordem duplicada do manifest

A lista de seis módulos está duplicada no helper. Hoje ela corresponde exatamente ao manifest, mas não há fonte única. Um novo módulo ou reordenação pode causar drift.

### 15.6 `fs` sem uso

A linha 16 importa `fs`, mas nenhuma expressão subsequente o referencia. Não há efeito funcional além do carregamento do builtin; é dívida pequena de manutenção.

### 15.7 Fixture HTML por interpolação

É apropriado para input controlado de testes, mas não deve ser confundido com função segura para dados arbitrários.

### 15.8 Shape parcial de location

A redefinição é suficiente para o código atual auditado, porém pode esconder incompatibilidade se produção começar a depender de campos adicionais do `Location` real.

### 15.9 `extra.action` pode sobrescrever `action`

A ordem do spread permite isso. Nenhum consumer observado passa `extra.action`, mas o contrato não impede.

## 16. Solicitações ao auditor

### 102-001 — SOURCE_DOCUMENTATION_CORRECTION — ACCEPTED

**Encontrado:** o JSDoc declara `@returns {Promise<Object>} { listeners, getState }`, enquanto a implementação retorna `sendMessage`, `getButton` e `getMainContent`.

**Evidência atual:** linhas 143–168 mostram o objeto real; consumidores importados usam as três APIs reais e nenhum dos dois nomes documentados.

**Evidência ausente:** não é uma lacuna de runtime, mas falta alinhamento da documentação inline.

**Ação solicitada:** corrigir o JSDoc em alteração separada, sem mudar o contrato runtime.

**Regressão possível:** novos testes podem ser escritos contra uma API inexistente.

**Severidade:** LOW.

### 102-002 — RESOURCE_LIFECYCLE_REVIEW — ACCEPTED

**Encontrado:** `sendMessage` sempre agenda `setTimeout(() => resolve(null), 50)`, não cancela o timeout quando um listener responde antes e não preserva a semântica de canal assíncrono baseada no retorno `true`. Assim, uma resposta que chegue depois de 50 ms é substituída por `null`.

**Evidência atual:** linhas 149–156 mostram o timer incondicional; diversos consumers obtêm respostas por listener.

**Evidência ausente:** teste que demonstre zero timers residuais após resposta imediata e teste de contrato para listener assíncrono que responde antes/depois de 50 ms, incluindo a decisão explícita sobre compatibilidade com `return true`.

**Ação solicitada:** definir o contrato assíncrono do harness. Se ele deve modelar o runtime Chrome, preservar a janela de resposta de listeners assíncronos e cancelar o fallback após settlement; em qualquer caso, adicionar regressões focais para resposta precoce, tardia e ausência de resposta.

**Evidência esperada:** resposta preservada e nenhum timer do helper restante após resolução precoce.

**Regressão possível:** handles curtos acumulados podem alongar teardown ou contribuir para warning de worker em suites intensivas.

**Severidade:** NORMAL.

### 102-003 — STATIC_CONTRACT_TEST_REQUIRED — ACCEPTED

**Encontrado:** o helper declara carregar os módulos “na ordem real do manifest”, e o branch atual realmente coincide, mas a sequência está duplicada manualmente.

**Evidência atual:** linhas 22–27/125–130 e `extension/manifest.json#content_scripts[0].js` são iguais no SHA observado.

**Evidência ausente:** gate que falhe se o manifest adicionar/reordenar/remover um módulo e o helper ficar stale.

**Ação solicitada:** adicionar verificação estática separada que compare a lista usada pelo harness com o bundle Manga canônico, ou derivar a ordem de uma fonte única se isso for arquiteturalmente aceitável.

**Regressão possível:** testes passam em ambiente com ordem/dependências diferente da extensão publicada.

**Severidade:** NORMAL.

### 102-004 — TEST_HARNESS_ROBUSTNESS — ACCEPTED

**Encontrado:** a espera do botão termina silenciosamente após 250 ms mesmo quando `shouldCreateButton` é true e `positionReady` nunca chega a true.

**Evidência atual:** linhas 134–141 possuem limite temporal, mas nenhuma checagem/throw depois do loop.

**Evidência ausente:** cenário controlado de bootstrap lento que defina explicitamente o comportamento esperado no timeout.

**Ação solicitada:** decidir se timeout deve rejeitar com diagnóstico específico, retornar estado de readiness ou permanecer best-effort; adicionar teste focal para a decisão.

**Regressão possível:** flakiness com erro distante da causa em runners lentos ou após crescimento do bootstrap.

**Severidade:** NORMAL.

### 102-005 — RESOURCE_LIFECYCLE_REVIEW — ACCEPTED

**Encontrado:** reinjetar `content_manga.js` registra novamente o listener de `imageMinWidth`/`imageMinHeight`; esse listener não consulta `isActiveContentInstance()`, enquanto o `ChromeStorageMock` preserva `_listeners` entre resets normais.

**Evidência atual:** o helper reinjeta os módulos após trocar o token de instância, mas a proteção por ownership vale somente para callbacks que efetivamente consultam o guard. O listener de dimensões permanece fora dessa proteção e pode continuar sendo invocado em cargas posteriores.

**Evidência ausente:** teste focal de duas ou mais cargas que prove contagem/cleanup bounded dos listeners ou demonstre explicitamente qual retenção é intencional.

**Ação solicitada:** definir o lifecycle canônico dos listeners de storage em alteração separada; limpar/remover listeners no harness/mock ou adicionar guard onde for arquiteturalmente correto, acompanhado de regressão de reinjeção repetida.

**Regressão possível:** callbacks/closures stale podem acumular e reagir a mudanças de dimensões em testes posteriores, reduzindo determinismo e fidelidade do harness.

**Severidade:** NORMAL.

## 17. Fonte integral auditada

~~~javascript
/**
 * load-content-script.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Configura o ambiente JSDOM para testes comportamentais do content_manga.js.
 *
 * PROBLEMA: content_manga.js é um IIFE que:
 * 1. Roda imediatamente ao ser carregado (via require)
 * 2. Registra listeners no chrome.runtime.onMessage
 * 3. Acessa window.location.hostname para verificar whitelist
 * 4. Chama chrome.storage.local.get(['enabledDomains']) assincronamente
 *
 * Esta função configura tudo na ordem certa para que os testes funcionem.
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
const { findRepoRoot } = require('./repo-root');
const ROOT = findRepoRoot(__dirname);


const GTC_FINGERPRINT_PATH = path.join(ROOT, 'extension/shared/gtc-fingerprint.js');
const CM_GTC_CLIENT_PATH = path.join(ROOT, 'extension/content/cm-gtc-client.js');
const CM_DOM_REPLACE_PATH = path.join(ROOT, 'extension/content/cm-dom-replace.js');
const CM_CHAPTER_PATH = path.join(ROOT, 'extension/content/cm-chapter.js');
const CM_AUTO_RESTORE_PATH = path.join(ROOT, 'extension/content/cm-auto-restore.js');
const CONTENT_MANGA_PATH = path.join(ROOT, 'extension/content/content_manga.js');

/**
 * Carrega o content script em ambiente JSDOM com estado controlado.
 *
 * @param {Object} options
 * @param {string}   options.hostname         - Hostname simulado (default: 'testmanga.com')
 * @param {string[]} options.enabledDomains   - Domínios na whitelist (default: [hostname])
 * @param {string[]} options.bannedImages     - URLs banidas para o hostname
 * @param {number}   options.imageMinWidth    - Largura mínima configurada para varredura
 * @param {number}   options.imageMinHeight   - Altura mínima configurada para varredura
 * @param {Array}    options.domImages        - Array de { src, width, height, className, attributes } para criar no DOM
 * @returns {Promise<Object>}  { listeners, getState }
 */
async function loadContentScript({
    hostname = 'testmanga.com',
    enabledDomains = null,
    bannedImages = [],
    imageMinWidth,
    imageMinHeight,
    floatingButtonEnabled,
    clickToTranslateEnabled,
    domImages = [],
} = {}) {
    // Invalida explicitamente qualquer instância anterior ANTES de tocar no
    // storage. Alguns testes reutilizam o mesmo window/JSDOM; sem isto, um
    // listener antigo ainda pode reagir ao clear/set do teste seguinte e
    // recriar um botão órfão antes da nova instância assumir.
    window.__manga_translator_active_instance =
        `__mt_test_reset_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const staleButton = document.getElementById('manga-translator-trigger');
    if (staleButton) staleButton.remove();

    // 1. Configura window.location
    Object.defineProperty(window, 'location', {
        value: {
            hostname,
            href: `https://${hostname}/chapter/1`,
            pathname: '/chapter/1',
        },
        writable: true,
        configurable: true,
    });

    // 2. window === window.top (garantido em JSDOM — boa prática tornar explícito)
    // Em JSDOM, window.top === window por padrão.

    // 3. Configura storage com whitelist e banidas
    const domains = enabledDomains ?? [hostname];
    const storageInit = {
        enabledDomains: domains,
        [`bannedImages_${hostname}`]: bannedImages,
        customPrompt: 'Teste prompt',
    };
    if (imageMinWidth !== undefined) storageInit.imageMinWidth = imageMinWidth;
    if (imageMinHeight !== undefined) storageInit.imageMinHeight = imageMinHeight;
    if (floatingButtonEnabled !== undefined) storageInit.floatingButtonEnabled = floatingButtonEnabled;
    if (clickToTranslateEnabled !== undefined) storageInit.clickToTranslateEnabled = clickToTranslateEnabled;
    await global.chrome.storage.local.set(storageInit);

    // 4. Constrói DOM com imagens de teste
    const imgTags = domImages.map(({ src, width, height, className = '', attributes = {} }, i) => {
        const extraAttrs = Object.entries(attributes)
            .map(([key, value]) => `${key}="${String(value)}"`)
            .join(' ');
        const classAttr = className ? ` class="${className}"` : '';
        const extra = extraAttrs ? ` ${extraAttrs}` : '';
        return `<img src="${src}" data-testid="img-${i}"${classAttr}${extra} width="${width}" height="${height}">`;
    }).join('\n');
    document.body.innerHTML = imgTags || '';

    // 5. Injeta naturalWidth/naturalHeight (JSDOM não renderiza imagens reais)
    document.querySelectorAll('img').forEach((img, i) => {
        const spec = domImages[i] || {};
        Object.defineProperty(img, 'naturalWidth',  { value: spec.width  || 0, configurable: true });
        Object.defineProperty(img, 'naturalHeight', { value: spec.height || 0, configurable: true });
        Object.defineProperty(img, 'complete',      { value: true,             configurable: true });
    });

    // 6. Espelha dependências globais da extensão no contexto de janela do JSDOM
    if (typeof global.crypto !== 'undefined' && !window.crypto) {
        Object.defineProperty(window, 'crypto', {
            value: global.crypto,
            configurable: true,
        });
    }
    if (typeof global.TextEncoder !== 'undefined' && !window.TextEncoder) {
        Object.defineProperty(window, 'TextEncoder', {
            value: global.TextEncoder,
            configurable: true,
        });
    }

    // 7. Limpa flag de idempotência para permitir re-injeção
    delete window.__manga_translator_content_injected;

    // 8. Carrega os módulos injetados pela extensão na ordem real do manifest
    jest.isolateModules(() => {
        require(GTC_FINGERPRINT_PATH);
        require(CM_GTC_CLIENT_PATH);
        require(CM_DOM_REPLACE_PATH);
        require(CM_CHAPTER_PATH);
        require(CM_AUTO_RESTORE_PATH);
        require(CONTENT_MANGA_PATH);
    });

    // 9. Aguarda a inicialização assíncrona do content script de forma determinística
    const shouldCreateButton = domains.includes(hostname) && floatingButtonEnabled !== false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 250) {
        const button = document.getElementById('manga-translator-trigger');
        if (!shouldCreateButton) break;
        if (button && button.dataset.positionReady === 'true') break;
        await new Promise(r => setTimeout(r, 10));
    }

    // 10. Retorna helpers para os testes
    return {
        /**
         * Dispara uma mensagem para o listener do content script.
         * Simula chrome.tabs.sendMessage do background ou popup.
         */
        sendMessage(action, extra = {}) {
            return new Promise((resolve) => {
                const listeners = global.chrome.runtime._messageListeners ?? [];
                const payload = { action, ...extra };
                listeners.forEach(fn => fn(payload, { tab: { id: 1 } }, resolve));
                // Se nenhum listener chamou resolve, resolve em null
                setTimeout(() => resolve(null), 50);
            });
        },

        /** Retorna o elemento DOM do botão flutuante (se existir) */
        getButton() {
            return document.getElementById('manga-translator-trigger');
        },

        /** Retorna o mainContent do botão */
        getMainContent() {
            return document.getElementById('manga-main-content');
        },
    };
}

module.exports = { loadContentScript };
~~~

## 18. Cobertura integral por posições

A fonte possui **171 linhas textuais** e LF terminal, totalizando **172 posições**. As faixas abaixo são contíguas, não se sobrepõem e cobrem **1–172** sem lacunas.

### Linhas 1–13 — Cabeçalho de contrato do helper

Explica por que o loader precisa preparar JSDOM antes de carregar o IIFE: execução imediata, listener runtime, dependência de location e leitura assíncrona de storage. É documentação operacional; não executa código.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: os consumidores dependem exatamente dessas pré-condições, mas comentários não têm assertion própria.

### Linha 14 — Separação após o cabeçalho

Linha vazia entre a documentação introdutória e os imports.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: whitespace editorial.

### Linhas 15–19 — Imports e descoberta portátil da raiz

Carrega path; também carrega fs, embora fs não seja usado no restante do arquivo; importa findRepoRoot e resolve ROOT a partir do diretório do helper. Isso evita assumir cwd fixo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: toda suíte que importa o helper precisa resolver a raiz; não há assertion focal deste arquivo para o erro de root. O import fs é código morto observado.

### Linhas 20–21 — Separação antes dos caminhos canônicos

Duas linhas vazias separam bootstrap da lista de módulos da extensão.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 22–27 — Caminhos dos seis módulos do bundle Manga

Monta caminhos absolutos para gtc-fingerprint, cm-gtc-client, cm-dom-replace, cm-chapter, cm-auto-restore e content_manga. A sequência coincide com o primeiro content_scripts.js do manifest atual.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE + 🟦 CONTRATO ESTÁTICO OBSERVADO: os módulos reais são carregados pelos testes; não foi localizado gate que compare automaticamente esta lista com manifest.json.

### Linha 28 — Separação antes da API principal

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 29–40 — JSDoc da API loadContentScript

Documenta opções de hostname, whitelist, banidas, dimensões e imagens. A linha 39 está desatualizada: declara retorno { listeners, getState }, mas a implementação retorna sendMessage, getButton e getMainContent.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a documentação; divergência registrada em 102-001.

### Linhas 41–50 — Assinatura e defaults de opções

Define função async; hostname default testmanga.com, whitelist null, banidas vazias, dimensões/preferências opcionais e domImages vazio. enabledDomains=null é tratado depois com nullish coalescing, preservando array vazio explícito.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: diversos consumidores exercitam combinações reais, inclusive floatingButtonEnabled=false, clickToTranslateEnabled=true, bannedImages e dimensões.

### Linhas 51–58 — Invalidação da instância anterior e remoção do botão stale

Antes de tocar no storage, troca `__manga_translator_active_instance` por token de teste e remove `#manga-translator-trigger` existente. Isso invalida somente callbacks da instância antiga que consultam `isActiveContentInstance()` antes de agir. O listener de dimensões (`imageMinWidth`/`imageMinHeight`) não usa esse guard; se o mock conservar `_listeners`, callbacks antigos desse listener ainda podem ser invocados após reinjeções.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: várias suítes reutilizam JSDOM e o content_manga real usa exatamente o mesmo global para ownership; não foi localizado teste focal que prove especificamente a sequência invalidação→storage.

### Linha 59 — Separação antes de location

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 60–69 — Substituição controlada de window.location

Redefine location com hostname, href HTTPS /chapter/1 e pathname /chapter/1, deixando a propriedade writable/configurable. Fornece ao IIFE os campos usados para whitelist/chapter sem navegação real do JSDOM.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: testes mudam hostname e obtêm comportamento host-specific; não há assertion exclusiva da shape completa de location.

### Linha 70 — Separação após location

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 71–72 — Premissa window.top

Registra que JSDOM já fornece window.top === window; não altera o objeto.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: comentário/premissa de ambiente.

### Linha 73 — Separação antes do storage

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 74–85 — Seed do chrome.storage.local

Deriva domains de enabledDomains ?? [hostname], grava whitelist, bannedImages_<hostname> e customPrompt. Só inclui mínimos de imagem e preferências quando o caller os fornece, evitando sobrescrever defaults com undefined; aguarda o set antes de carregar o IIFE.

**Evidência:** ✅/🟨 EVIDÊNCIA MISTA: consumidores provam efeitos concretos de bannedImages, imageMinWidth/Height e floatingButtonEnabled; a ordem await-before-require é inferida da implementação, sem teste focal isolado.

### Linha 86 — Separação antes do DOM fixture

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 87–96 — Materialização das imagens de teste

Mapeia domImages para <img>, adiciona data-testid determinístico img-N, classe opcional, atributos extras e width/height; concatena por newline e substitui document.body.innerHTML. Entradas são controladas por testes e não escapadas como HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE EM CONSUMIDORES para data-testid/imagens e dimensões usadas em assertions; ⚠️ sem teste focal para escaping de className/attributes.

### Linha 97 — Separação antes das dimensões naturais

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 98–104 — Shim de naturalWidth/naturalHeight/complete

Como JSDOM não carrega pixels, define naturalWidth/naturalHeight com os valores da fixture e complete=true, todos configuráveis. Isso faz filtros de imagem reais observarem dimensões coerentes.

**Evidência:** ✅ PROVADO DIRETAMENTE NO FLUXO: extraction-and-handlers usa dimensões fornecidas ao helper e exige filtragem 180x120 versus 180x90; vários testes selecionam as imagens por data-testid.

### Linha 105 — Separação antes dos globals

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 106–118 — Espelhamento condicional de crypto e TextEncoder

Se o global Node possui crypto/TextEncoder e a janela não possui a API, define a referência correspondente como configurável. Não substitui implementações já presentes no window.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE por fluxos de fingerprint no ambiente JSDOM; não foi localizada assertion focal que force ambos os branches de ausência/presença.

### Linha 119 — Separação antes da reinjeção

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 120–121 — Liberação do guard de idempotência

Remove __manga_translator_content_injected para que content_manga.js volte a executar dentro do isolateModules. Sem isso o IIFE poderia ser ignorado em reinjeções no mesmo window.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: suites reinicializam o módulo repetidamente; o content_manga real consulta essa flag. Não há assertion dedicada ao delete do helper.

### Linha 122 — Separação antes do carregamento real

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 123–131 — Carga isolada dos módulos reais na ordem do manifest

jest.isolateModules cria registry isolado e faz require dos seis arquivos reais na sequência canônica. Isso executa side effects/IIFEs reais sem depender do cache CommonJS da invocação anterior.

**Evidência:** ✅ PROVADO DIRETAMENTE quanto ao uso dos módulos reais pelos resultados downstream; ⚠️ não há gate automático que compare esta ordem com o manifest, lacuna 102-003.

### Linha 132 — Separação antes da espera de bootstrap

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 133–141 — Espera limitada pela inicialização do botão

Calcula se o botão deveria existir (domínio habilitado e preferência não false), então espera até 250 ms, em passos de 10 ms, pelo botão com data-position-ready=true. Para domínio/preferência que não deve criar botão, sai imediatamente.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: muitos testes chamam o helper e em seguida inspecionam botão pronto; não existe falha explícita quando 250 ms expiram, risco registrado em 102-004.

### Linha 142 — Separação antes dos helpers retornados

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linhas 143–157 — Helper sendMessage

Retorna Promise, lê a lista privada _messageListeners do mock Chrome, cria payload {action,...extra}, chama todos os listeners com sender tab.id=1 e o mesmo resolve, e agenda fallback resolve(null) após 50 ms. Primeira resolução vence; o timeout permanece agendado mesmo quando um listener responde síncrona/rapidamente.

**Evidência:** ✅ PROVADO DIRETAMENTE para dispatch e para respostas explicitamente assertadas de `GET_FLOATING_BUTTON_STATUS`, `TRANSLATE_CONTEXT_IMAGE` e `GET_PAGE_IMAGES`; 🟨 `UPDATE_IMAGE` é executado, mas o consumer observado não asserta sua resposta. ⚠️ O limite/race de 50 ms e o cleanup do timeout não possuem prova focal e permanecem em 102-002.

### Linhas 158–162 — Helper getButton

Retorna document.getElementById('manga-translator-trigger'). Não cria nem altera o botão.

**Evidência:** ✅ PROVADO DIRETAMENTE: consumidores usam context.getButton() e fazem assertions de null/presença/estilo/recuperação.

### Linhas 163–168 — Helper getMainContent

Retorna #manga-main-content. É lookup puro, usado para clicar o fluxo real e ler o estado textual do botão.

**Evidência:** ✅ PROVADO DIRETAMENTE: consumidores clicam e verificam textContent via context.getMainContent().

### Linha 169 — Fechamento de loadContentScript

Encerra a função async depois do objeto de helpers.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: necessário para parse/execução.

### Linha 170 — Separação antes do export

Linha vazia.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha 171 — Export CommonJS

Expõe loadContentScript para suites unitárias e de integração. Consumidores importam exatamente esse nome.

**Evidência:** ✅ PROVADO DIRETAMENTE pela importação e uso em múltiplas suites.

### Linha 172 — Newline final

Posição documental vazia produzida pelo LF terminal do blob.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; presença verificada diretamente no blob.

## 19. Autoauditoria documental

- Reserva relida e confirmada como **AGENTE 10** antes da escrita.
- Estado individual relido e confirmado como **IN_PROGRESS / AGENTE 10**.
- SHA do fonte reconfirmado imediatamente antes da materialização: `40d7c59d81a533c2f7d2b12d6c8c30bc77fb43f0`.
- Fonte integral inserida diretamente do blob auditado.
- Contagem confirmada: **171 linhas + newline final = 172/172 posições**.
- Faixas de cobertura: contíguas de 1 a 172, sem lacuna.
- Manifest real lido e ordem dos seis módulos comparada.
- `repo-root.js` e `jest.config.js` lidos para validar dependências de bootstrap.
- Consumers reais e assertions examinados em unit/integration.
- Evidência direta, gate estático e execução indireta foram separados.
- Quatro necessidades externas foram registradas; nenhum objeto externo foi alterado.
- Nenhum código, teste, fixture, workflow, configuração ou arquivo global foi modificado.

**Conclusão documental após reparo:** a Bíblia foi corrigida para representar honestamente a força das assertions de `UPDATE_IMAGE`, a corrida de 50 ms de `sendMessage` e o lifecycle canônico das requests. O item deve retornar a `READY_FOR_AUDIT`; somente um auditor independente pode promovê-lo novamente a `COMPLETED`.

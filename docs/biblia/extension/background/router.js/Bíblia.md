# Bíblia técnica — `extension/background/router.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `d9278e9e58e4e9583a30c16227bfd833e7203d89`  
> **Linhas textuais:** **168**  
> **Posições documentais:** **169** contando newline final  
> **Teste focal:** `tests/unit/background/router.test.js` — `d7c33bc525e1683acabff44389c5d51471cc7037`

## Papel arquitetural

`router.js` é o roteador IPC central das actions extraídas do background. Ele mantém um registry privado de definições canônicas, traduz aliases legados SCREAMING_CASE, classifica a origem, aplica allowlist/validation, constrói contexto e normaliza execução/respostas síncronas e assíncronas.

`background.js` carrega este módulo antes de todas as actions e cria um único `registeredActionRouter` com `contextFactory` rico. O adapter externo `routeRegisteredAction` primeiro verifica `resolveActionName/getAction`; depois o router executa a definição registrada.

## ACTION_MAP

O mapa contém os aliases runtime usados por START/STOP, resultados Gemini, downloads, logging, debug, claim, watchdog, progresso e dados de imagem. Duas aliases (`DOWNLOAD_CHAPTER_AND_SHOW` e `OPEN_CHAPTER_FOLDER`) apontam para a mesma action `download-chapter`.

⚠️ `resolveActionName()` **não aceita o nome canônico diretamente**. Por exemplo `resolveActionName('get-tab-id')` retorna null; só `GET_TAB_ID` resolve. Hoje os callers usam aliases legados, mas uma futura migração para nomes canônicos precisaria alterar este contrato ou os callers.

## Registry

`registerAction` exige apenas `actionDef.name` truthy e então faz `Map.set`. Um segundo módulo com o mesmo nome substitui silenciosamente a definição anterior. Não há detecção de colisão, validação de tipo do nome nem congelamento da definição.

Isso permite hot/simple registration, mas uma duplicação acidental pode trocar política de origem/validator/execute sem erro de bootstrap.

## Classificação de origem

`identifySource(sender)` usa esta ordem: sem sender → `unknown`; sender com `tab.url` → `gemini` se a **string completa** contém `gemini.google.com` ou `127.0.0.1`, caso contrário `content`; sem tab URL e `sender.id === chrome.runtime.id` → `popup`; restante → `external`.

### Fronteira de segurança permissiva

O manifesto injeta `content_manga.js` em `<all_urls>`. Como o classificador usa `String.includes` na URL inteira em vez de `new URL(...).hostname`, uma página como `https://example.invalid/?next=gemini.google.com` pode ser classificada como `gemini`. O mesmo vale para strings contendo `127.0.0.1`.

As duas actions atualmente restritas a `allowedSources:['gemini']` (`claim-gemini-job` e `refresh-job-watchdog`) possuem verificações adicionais de sender tab/job ownership, reduzindo impacto prático, mas **o gate de source isolado não é um boundary robusto por hostname**.

Não existe teste adversarial para URL com Gemini apenas em path/query/subdomínio malicioso.

## Contexto padrão e contexto runtime real

`createContext(sender)` fornece state/log globais, sender e uma facade Promise de `chrome.storage.local`. Se `MangaTranslatorLog` não existe, log vira no-op; se state não existe, usa `{}`.

No background integrado, `contextFactory` sobrescreve `state`, `log` e adiciona helpers como ownership, initialization, TabIdentity, delivery/finalize/watchdog/start/stop. O spread de `contextFactory` ocorre **depois** de `createContext`, então campos retornados pela factory têm precedência.

O teste focal confirma que sobrescrever `state` não remove `sender`, desde que a factory não retorne um campo `sender`. Tecnicamente uma factory poderia sobrescrever `sender`, porque não há proteção contra isso.

### Storage facade

A facade padrão resolve Promises via callbacks mas não inspeciona `chrome.runtime.lastError` e nunca rejeita explicitamente. Falhas de storage podem aparecer como valor undefined/resultado vazio dependendo da API/mocks. O `contextFactory` integrado do background não substitui `storage`, então actions usam essa facade padrão.

## Delegação GTC/SM

Antes do registry, mensagens `GTC_*` e `SM_*` podem ser entregues a handlers opcionais. Se o handler retorna truthy, o router retorna `true` e não continua.

No `background.js` atual, `routeRegisteredAction` chama `createMessageRouter` apenas com `contextFactory`, sem `gtcHandler` ou `smHandler`; GTC/SM continuam sendo tratados depois pelo listener principal legado. Portanto esses ramos do router existem como capacidade da API, mas não estão ligados no adapter registrado atual.

Não foi localizado teste que forneça `gtcHandler`/`smHandler` a `createMessageRouter`.

## Gate de alias/registry

Request sem action string ou alias fora de ACTION_MAP retorna false silenciosamente. Alias conhecido cujo módulo action não foi registrado gera `ACTION_NOT_FOUND` no logger e também retorna false, permitindo que o listener principal tente handlers legados subsequentes.

Isso é compatível com migração gradual, mas também significa que action obrigatória faltante não é um erro IPC explícito por si só; o bootstrap do background tenta garantir que módulos obrigatórios sejam carregados antes.

## Gate de origem

Se `meta.allowedSources` existe, o source precisa estar na lista ou a lista conter `any`. Em falha o router loga `SOURCE_DENIED`, responde `{ok:false,error:{code:'SOURCE_DENIED'}}` e retorna false, sem chamar execute.

O teste focal prova esse ordering com uma action content-only chamada por popup.

## Gate de payload

`validate(request)` roda antes da criação de contexto e execute. Retorno truthy é enviado diretamente em `error`. O teste focal prova `INVALID_PAYLOAD` e que o canal não fica aberto.

⚠️ Exceção **lançada** pelo validator não é envolvida em try/catch. Ela escapa do listener, ao contrário de exceções do execute, que são normalizadas. Não há teste focal para validator que lança.

## Execução síncrona

`meta.async === false` executa sem await, responde imediatamente e retorna false para fechar o canal. Exceções são logadas como `ACTION_ERROR` e viram `INTERNAL_ERROR`.

⚠️ Se uma action marcada sync retornar acidentalmente uma Promise, o spread `{...(result||{})}` não aguarda o valor e a resposta pode virar apenas `{ok:true}`. Não há guard que detecte Promise em action sync.

## Execução assíncrona

Todas as actions sem `async:false` entram em uma IIFE async, o listener retorna true imediatamente e a IIFE aguarda `execute`. Exceções/rejeições viram `INTERNAL_ERROR`. O teste focal prova que o canal permanece aberto até a resposta.

## Semântica do envelope `ok`

A construção é `{ ok: true, ...(result || {}) }`. Logo uma action pode devolver `{ok:false,...}` e sobrescrever o `ok:true` do router. Isso é usado por actions que retornam falhas de domínio sem lançar.

`background.js` ainda possui `sendResponseCompat` para retirar `ok:true` de alguns contratos legados (`GET_TAB_ID`, `CHECK_IF_EXTRACTION_TAB`, `REQUEST_IMAGE_DATA`, `FETCH_IMAGE_AS_BASE64`, `DOWNLOAD_IMAGE`). Essa compatibilidade não pertence ao router em si.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `tests/unit/background/router.test.js` | ✅ PROVADO DIRETAMENTE | Alias GET_TAB_ID/UNKNOWN, quatro sources básicos, sync autorizado, SOURCE_DENIED, validação, async keepAlive e merge de contextFactory. |
| action unit tests do background | ✅ PROVADO INDIRETAMENTE PELO ROUTER REAL | Cada suíte carrega router.js + action real e prova contratos específicos; isso exercita registro/dispatch, mas não cada propriedade interna isoladamente. |
| `routed-actions-legacy.test.js` | ✅ PROVADO NO BACKGROUND INTEGRADO | Actions extraídas passam pelo router e o adapter do background preserva contratos legados. |
| `background.js` | 🟨 CONSUMIDOR REAL | Carrega router antes das actions, cria contextFactory e aplica sendResponseCompat. |
| GTC/SM delegation | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO | Nenhuma suíte localizada injeta gtcHandler/smHandler na factory. |

## Lacunas e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para URL adversarial contendo `gemini.google.com`/`127.0.0.1` fora do hostname.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para sender `null` → `unknown`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `registerAction` duplicado sobrescrevendo definição.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para actionDef.name de tipo não-string.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para alias conhecido sem action registrada e log ACTION_NOT_FOUND.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para GTC/SM handler retornando true/false.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para validator lançar exceção.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para execute síncrono lançar; catch existe, mas o teste focal não isola o ramo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para execute assíncrono rejeitar.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para action sync retornar Promise por engano.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `contextFactory` lançar ou sobrescrever `sender`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para storage facade sob `runtime.lastError`.
- ⚠️ Nomes canônicos não são aceitos como request.action diretamente.
- ⚠️ Source `gemini` é classificado por substring da URL, não por hostname parseado.
- ⚠️ Registry permite overwrite silencioso de action existente.

## Segurança e privacidade

- `sender` é a principal entrada de trust boundary; classificação inadequada pode afetar gates de source.
- O router não valida payload genericamente; cada action é responsável por seu validator.
- `allowedSources:['any']` desabilita o gate por design para muitas actions; nesses casos ownership/validação deve ocorrer na própria action quando necessário.
- O contexto expõe storage local às actions registradas.
- Erros de execute retornam `e.message` ao caller; uma exceção contendo detalhe sensível poderia vazar a mensagem para o contexto solicitante. Não há sanitização central.

## Invariantes

1. Router deve ser carregado antes das actions que chamam `registerAction`.
2. Aliases runtime existentes devem continuar resolvendo para as actions canônicas corretas.
3. Gate de source deve executar antes de validate/execute.
4. Validator deve executar antes de criar efeitos da action.
5. `async:false` deve fechar o canal; action assíncrona deve retornar true.
6. Exceções de execute devem ser normalizadas como INTERNAL_ERROR.
7. `contextFactory` deve continuar podendo injetar dependências do background.
8. Sender real não deve ser substituído acidentalmente por dependências injetadas.
9. Se source `gemini` for usado como boundary de segurança, a classificação precisa corresponder ao hostname real.
10. Compatibilidade de respostas legadas continua responsabilidade do adapter `background.js`, não deste módulo.

## Fonte integral

~~~javascript
'use strict';
// background/router.js — Roteador central de mensagens do MangaTranslator
// Substitui a cadeia if/else do chrome.runtime.onMessage em background.js

(function(scope) {
  const actionRegistry = new Map();

  // Mapeamento de nomes legados (SCREAMING_CASE) para canônicos (kebab-case)
  const ACTION_MAP = {
    'START_BATCH': 'start-batch',
    'STOP_BATCH': 'stop-batch',
    'GEMINI_IMAGE_EXTRACTED': 'deliver-result',
    'GEMINI_RESULT_COMMIT': 'commit-result',
    'GEMINI_RESULT_URL': 'deliver-result-url',
    'IMAGE_READY_FROM_NEW_TAB': 'deliver-result-from-tab',
    'GEMINI_ERROR': 'report-error',
    'FETCH_IMAGE_AS_BASE64': 'fetch-image-base64',
    'CALCULATE_VISUAL_FINGERPRINT': 'calculate-visual-fingerprint',
    'DOWNLOAD_IMAGE': 'download-image',
    'DOWNLOAD_CHAPTER_AND_SHOW': 'download-chapter',
    'OPEN_CHAPTER_FOLDER': 'download-chapter',
    'EXPORT_ALL_AND_SHOW': 'export-all',
    'SHOW_EXISTING_FOLDER': 'open-existing-folder',
    'OPEN_MANGA_ROOT': 'open-manga-root',
    'FORCE_SEND_ACTIVATION': 'force-send-activation',
    'REFRESH_JOB_WATCHDOG': 'refresh-job-watchdog',
    'SET_DEBUG_MODE': 'set-debug-mode',
    'LOG_ENTRY': 'log-entry',
    'GET_TAB_ID': 'get-tab-id',
    'CLAIM_GEMINI_JOB': 'claim-gemini-job',
    'GEMINI_PROGRESS': 'relay-progress',
    'REQUEST_IMAGE_DATA': 'request-image-data',
    'CHECK_IF_EXTRACTION_TAB': 'check-extraction-tab',
  };

  function registerAction(actionDef) {
    if (!actionDef || !actionDef.name) {
      throw new Error('Ação sem nome');
    }
    actionRegistry.set(actionDef.name, actionDef);
  }

  function resolveActionName(requestAction) {
    return ACTION_MAP[requestAction] || null;
  }

  function identifySource(sender) {
    if (!sender) return 'unknown';
    if (sender.tab && sender.tab.url) {
      if (sender.tab.url.includes('gemini.google.com') ||
          sender.tab.url.includes('127.0.0.1')) {
        return 'gemini';
      }
      return 'content';
    }
    if (sender.id === chrome.runtime.id) return 'popup';
    return 'external';
  }

  function createContext(sender) {
    const log = scope.MangaTranslatorLog ? scope.MangaTranslatorLog.log : function() {};
    const state = scope.MangaTranslatorState || {};
    return {
      state,
      log,
      sender,
      storage: {
        get: (keys) => new Promise(resolve =>
          chrome.storage.local.get(keys, resolve)),
        set: (items) => new Promise(resolve =>
          chrome.storage.local.set(items, resolve)),
        remove: (keys) => new Promise(resolve =>
          chrome.storage.local.remove(keys, resolve)),
      },
    };
  }

  function createMessageRouter({ gtcHandler, smHandler, contextFactory } = {}) {
    const log = scope.MangaTranslatorLog ? scope.MangaTranslatorLog.log : function() {};

    return function onMessage(request, sender, sendResponse) {
      // 1. Delegar GTC_* ao handler existente
      if (request && typeof request.action === 'string' && request.action.startsWith('GTC_')) {
        if (gtcHandler && gtcHandler(request, sender, sendResponse)) {
          return true;
        }
      }

      // 2. Delegar SM_* ao handler existente
      if (request && typeof request.action === 'string' && request.action.startsWith('SM_')) {
        if (smHandler && smHandler(request, sender, sendResponse)) {
          return true;
        }
      }

      // 3. Resolver ação
      if (!request || typeof request.action !== 'string') return false;
      const actionName = resolveActionName(request.action);
      if (!actionName) return false;

      const actionDef = actionRegistry.get(actionName);
      if (!actionDef) {
        log('warn', 'router', 'ACTION_NOT_FOUND',
            'Ação desconhecida: ' + request.action, {});
        return false;
      }

      // 4. Validar origem
      const source = identifySource(sender);
      if (actionDef.meta && actionDef.meta.allowedSources &&
          !actionDef.meta.allowedSources.includes(source) &&
          !actionDef.meta.allowedSources.includes('any')) {
        log('warn', 'router', 'SOURCE_DENIED',
            'Origem ' + source + ' negada para ' + actionName, {});
        sendResponse({ ok: false, error: { code: 'SOURCE_DENIED' } });
        return false;
      }

      // 5. Validar payload
      if (typeof actionDef.validate === 'function') {
        const err = actionDef.validate(request);
        if (err) {
          sendResponse({ ok: false, error: err });
          return false;
        }
      }

      // 6. Contexto
      const context = {
        ...createContext(sender),
        ...(typeof contextFactory === 'function' ? contextFactory(sender) : {}),
      };

      // 7. Executar
      if (actionDef.meta && actionDef.meta.async === false) {
        try {
          const result = actionDef.execute(request, context);
          sendResponse({ ok: true, ...(result || {}) });
        } catch (e) {
          log('error', 'router', 'ACTION_ERROR', e.message, {});
          sendResponse({ ok: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
        }
        return false;
      }

      // Async
      (async () => {
        try {
          const result = await actionDef.execute(request, context);
          sendResponse({ ok: true, ...(result || {}) });
        } catch (e) {
          log('error', 'router', 'ACTION_ERROR', e.message || String(e), {});
          sendResponse({ ok: false, error: { code: 'INTERNAL_ERROR', message: e.message || String(e) } });
        }
      })();
      return true;
    };
  }

  scope.MangaTranslatorRouter = {
    createMessageRouter,
    registerAction,
    resolveActionName,
    identifySource,
    getAction: (name) => actionRegistry.get(name),
    getRegisteredActions: () => Array.from(actionRegistry.keys()),
  };
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## Rastreabilidade 169/169

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | // background/router.js — Roteador central de mensagens do MangaTranslator | Comentário do roteador: background/router.js — Roteador central de mensagens do MangaTranslator. |
| 003 | U01 | // Substitui a cadeia if/else do chrome.runtime.onMessage em background.js | Comentário do roteador: Substitui a cadeia if/else do chrome.runtime.onMessage em background.js. |
| 004 | U01 | ␠ [linha vazia] | Separador visual em U01. |
| 005 | U01 | (function(scope) { | Passo operacional de U01: (function(scope) { |
| 006 | U02 |   const actionRegistry = new Map(); | Cria registry privado de actions canônicas. |
| 007 | U02 | ␠ [linha vazia] | Separador visual em U02. |
| 008 | U02 |   // Mapeamento de nomes legados (SCREAMING_CASE) para canônicos (kebab-case) | Comentário do roteador: Mapeamento de nomes legados (SCREAMING_CASE) para canônicos (kebab-case). |
| 009 | U02 |   const ACTION_MAP = { | Passo operacional de U02: const ACTION_MAP = { |
| 010 | U02 |     'START_BATCH': 'start-batch', | Mapeia alias IPC legado para nome canônico de action. |
| 011 | U02 |     'STOP_BATCH': 'stop-batch', | Mapeia alias IPC legado para nome canônico de action. |
| 012 | U02 |     'GEMINI_IMAGE_EXTRACTED': 'deliver-result', | Mapeia alias IPC legado para nome canônico de action. |
| 013 | U02 |     'GEMINI_RESULT_COMMIT': 'commit-result', | Mapeia alias IPC legado para nome canônico de action. |
| 014 | U02 |     'GEMINI_RESULT_URL': 'deliver-result-url', | Mapeia alias IPC legado para nome canônico de action. |
| 015 | U02 |     'IMAGE_READY_FROM_NEW_TAB': 'deliver-result-from-tab', | Mapeia alias IPC legado para nome canônico de action. |
| 016 | U02 |     'GEMINI_ERROR': 'report-error', | Mapeia alias IPC legado para nome canônico de action. |
| 017 | U02 |     'FETCH_IMAGE_AS_BASE64': 'fetch-image-base64', | Mapeia alias IPC legado para nome canônico de action. |
| 018 | U02 |     'CALCULATE_VISUAL_FINGERPRINT': 'calculate-visual-fingerprint', | Mapeia alias IPC legado para nome canônico de action. |
| 019 | U02 |     'DOWNLOAD_IMAGE': 'download-image', | Mapeia alias IPC legado para nome canônico de action. |
| 020 | U02 |     'DOWNLOAD_CHAPTER_AND_SHOW': 'download-chapter', | Mapeia alias IPC legado para nome canônico de action. |
| 021 | U02 |     'OPEN_CHAPTER_FOLDER': 'download-chapter', | Mapeia alias IPC legado para nome canônico de action. |
| 022 | U02 |     'EXPORT_ALL_AND_SHOW': 'export-all', | Mapeia alias IPC legado para nome canônico de action. |
| 023 | U02 |     'SHOW_EXISTING_FOLDER': 'open-existing-folder', | Mapeia alias IPC legado para nome canônico de action. |
| 024 | U02 |     'OPEN_MANGA_ROOT': 'open-manga-root', | Mapeia alias IPC legado para nome canônico de action. |
| 025 | U02 |     'FORCE_SEND_ACTIVATION': 'force-send-activation', | Mapeia alias IPC legado para nome canônico de action. |
| 026 | U02 |     'REFRESH_JOB_WATCHDOG': 'refresh-job-watchdog', | Mapeia alias IPC legado para nome canônico de action. |
| 027 | U02 |     'SET_DEBUG_MODE': 'set-debug-mode', | Mapeia alias IPC legado para nome canônico de action. |
| 028 | U02 |     'LOG_ENTRY': 'log-entry', | Mapeia alias IPC legado para nome canônico de action. |
| 029 | U02 |     'GET_TAB_ID': 'get-tab-id', | Mapeia alias IPC legado para nome canônico de action. |
| 030 | U02 |     'CLAIM_GEMINI_JOB': 'claim-gemini-job', | Mapeia alias IPC legado para nome canônico de action. |
| 031 | U02 |     'GEMINI_PROGRESS': 'relay-progress', | Mapeia alias IPC legado para nome canônico de action. |
| 032 | U02 |     'REQUEST_IMAGE_DATA': 'request-image-data', | Mapeia alias IPC legado para nome canônico de action. |
| 033 | U02 |     'CHECK_IF_EXTRACTION_TAB': 'check-extraction-tab', | Mapeia alias IPC legado para nome canônico de action. |
| 034 | U02 |   }; | Fecha estrutura sintática de U02. |
| 035 | U02 | ␠ [linha vazia] | Separador visual em U02. |
| 036 | U03 |   function registerAction(actionDef) { | Abre API de registro. |
| 037 | U03 |     if (!actionDef \|\| !actionDef.name) { | Rejeita definição ausente ou sem nome truthy. |
| 038 | U03 |       throw new Error('Ação sem nome'); | Erro de programação para registro inválido. |
| 039 | U03 |     } | Fecha estrutura sintática de U03. |
| 040 | U03 |     actionRegistry.set(actionDef.name, actionDef); | Insere ou substitui silenciosamente action pelo nome. |
| 041 | U03 |   } | Fecha estrutura sintática de U03. |
| 042 | U03 | ␠ [linha vazia] | Separador visual em U03. |
| 043 | U04 |   function resolveActionName(requestAction) { | Abre resolução de alias. |
| 044 | U04 |     return ACTION_MAP[requestAction] \|\| null; | Resolve somente aliases presentes no mapa; canonical direto não é fallback. |
| 045 | U04 |   } | Fecha estrutura sintática de U04. |
| 046 | U04 | ␠ [linha vazia] | Separador visual em U04. |
| 047 | U05 |   function identifySource(sender) { | Abre classificação da origem. |
| 048 | U05 |     if (!sender) return 'unknown'; | Classifica ausência de sender como unknown. |
| 049 | U05 |     if (sender.tab && sender.tab.url) { | Prioriza URL da tab quando existe. |
| 050 | U05 |       if (sender.tab.url.includes('gemini.google.com') \|\| | Usa substring na URL completa para classificar Gemini. |
| 051 | U05 |           sender.tab.url.includes('127.0.0.1')) { | Também classifica localhost IPv4 por substring. |
| 052 | U05 |         return 'gemini'; | Resultado source gemini. |
| 053 | U05 |       } | Fecha estrutura sintática de U05. |
| 054 | U05 |       return 'content'; | Qualquer outra tab URL vira content. |
| 055 | U05 |     } | Fecha estrutura sintática de U05. |
| 056 | U05 |     if (sender.id === chrome.runtime.id) return 'popup'; | Sem tab URL, sender da própria extensão vira popup. |
| 057 | U05 |     return 'external'; | Demais senders viram external. |
| 058 | U05 |   } | Fecha estrutura sintática de U05. |
| 059 | U05 | ␠ [linha vazia] | Separador visual em U05. |
| 060 | U06 |   function createContext(sender) { | Cria contexto padrão para action. |
| 061 | U06 |     const log = scope.MangaTranslatorLog ? scope.MangaTranslatorLog.log : function() {}; | Obtém logger global se instalado; senão usa no-op. |
| 062 | U06 |     const state = scope.MangaTranslatorState \|\| {}; | Obtém state global se instalado; senão objeto vazio. |
| 063 | U06 |     return { | Passo operacional de U06: return { |
| 064 | U06 |       state, | Expõe state no contexto. |
| 065 | U06 |       log, | Expõe logger no contexto. |
| 066 | U06 |       sender, | Expõe sender original como boundary de confiança. |
| 067 | U06 |       storage: { | Abre facade Promise para chrome.storage.local. |
| 068 | U06 |         get: (keys) => new Promise(resolve => | Wrap callback de storage.get em Promise resolve-only. |
| 069 | U06 |           chrome.storage.local.get(keys, resolve)), | Passo operacional de U06: chrome.storage.local.get(keys, resolve)), |
| 070 | U06 |         set: (items) => new Promise(resolve => | Wrap callback de storage.set em Promise resolve-only. |
| 071 | U06 |           chrome.storage.local.set(items, resolve)), | Passo operacional de U06: chrome.storage.local.set(items, resolve)), |
| 072 | U06 |         remove: (keys) => new Promise(resolve => | Wrap callback de storage.remove em Promise resolve-only. |
| 073 | U06 |           chrome.storage.local.remove(keys, resolve)), | Passo operacional de U06: chrome.storage.local.remove(keys, resolve)), |
| 074 | U06 |       }, | Fecha estrutura sintática de U06. |
| 075 | U06 |     }; | Fecha estrutura sintática de U06. |
| 076 | U06 |   } | Fecha estrutura sintática de U06. |
| 077 | U06 | ␠ [linha vazia] | Separador visual em U06. |
| 078 | U07 |   function createMessageRouter({ gtcHandler, smHandler, contextFactory } = {}) { | Factory do listener runtime parametrizado. |
| 079 | U07 |     const log = scope.MangaTranslatorLog ? scope.MangaTranslatorLog.log : function() {}; | Obtém logger global se instalado; senão usa no-op. |
| 080 | U07 | ␠ [linha vazia] | Separador visual em U07. |
| 081 | U07 |     return function onMessage(request, sender, sendResponse) { | Cria listener compatível com chrome.runtime.onMessage. |
| 082 | U07 |       // 1. Delegar GTC_* ao handler existente | Comentário do roteador: 1. Delegar GTC_* ao handler existente. |
| 083 | U07 |       if (request && typeof request.action === 'string' && request.action.startsWith('GTC_')) { | Detecta namespace GTC antes das actions registradas. |
| 084 | U07 |         if (gtcHandler && gtcHandler(request, sender, sendResponse)) { | Delega GTC ao handler fornecido e mantém canal se handler sinaliza handled. |
| 085 | U07 |           return true; | Mantém canal onMessage aberto para sendResponse assíncrono. |
| 086 | U07 |         } | Fecha estrutura sintática de U07. |
| 087 | U07 |       } | Fecha estrutura sintática de U07. |
| 088 | U07 | ␠ [linha vazia] | Separador visual em U07. |
| 089 | U07 |       // 2. Delegar SM_* ao handler existente | Comentário do roteador: 2. Delegar SM_* ao handler existente. |
| 090 | U07 |       if (request && typeof request.action === 'string' && request.action.startsWith('SM_')) { | Detecta namespace Storage Manager. |
| 091 | U07 |         if (smHandler && smHandler(request, sender, sendResponse)) { | Delega SM ao handler fornecido. |
| 092 | U07 |           return true; | Mantém canal onMessage aberto para sendResponse assíncrono. |
| 093 | U07 |         } | Fecha estrutura sintática de U07. |
| 094 | U07 |       } | Fecha estrutura sintática de U07. |
| 095 | U07 | ␠ [linha vazia] | Separador visual em U07. |
| 096 | U08 |       // 3. Resolver ação | Comentário do roteador: 3. Resolver ação. |
| 097 | U08 |       if (!request \|\| typeof request.action !== 'string') return false; | Recusa request sem action string. |
| 098 | U08 |       const actionName = resolveActionName(request.action); | Resolve alias legado para nome canônico. |
| 099 | U08 |       if (!actionName) return false; | Action fora de ACTION_MAP não é tratada pelo registry. |
| 100 | U08 | ␠ [linha vazia] | Separador visual em U08. |
| 101 | U08 |       const actionDef = actionRegistry.get(actionName); | Busca a definição registrada. |
| 102 | U08 |       if (!actionDef) { | Detecta alias conhecido sem módulo action carregado. |
| 103 | U08 |         log('warn', 'router', 'ACTION_NOT_FOUND', | Loga registry incompleto. |
| 104 | U08 |             'Ação desconhecida: ' + request.action, {}); | Passo operacional de U08: 'Ação desconhecida: ' + request.action, {}); |
| 105 | U08 |         return false; | Fecha canal síncrono/não tratado. |
| 106 | U08 |       } | Fecha estrutura sintática de U08. |
| 107 | U08 | ␠ [linha vazia] | Separador visual em U08. |
| 108 | U09 |       // 4. Validar origem | Comentário do roteador: 4. Validar origem. |
| 109 | U09 |       const source = identifySource(sender); | Classifica sender antes do gate de allowedSources. |
| 110 | U09 |       if (actionDef.meta && actionDef.meta.allowedSources && | Ativa gate apenas quando meta contém allowlist. |
| 111 | U09 |           !actionDef.meta.allowedSources.includes(source) && | Rejeita source não explicitamente permitida. |
| 112 | U09 |           !actionDef.meta.allowedSources.includes('any')) { | `any` desativa restrição de source. |
| 113 | U09 |         log('warn', 'router', 'SOURCE_DENIED', | Loga/retorna negação de origem. |
| 114 | U09 |             'Origem ' + source + ' negada para ' + actionName, {}); | Passo operacional de U09: 'Origem ' + source + ' negada para ' + actionName, {}); |
| 115 | U09 |         sendResponse({ ok: false, error: { code: 'SOURCE_DENIED' } }); | Loga/retorna negação de origem. |
| 116 | U09 |         return false; | Fecha canal síncrono/não tratado. |
| 117 | U09 |       } | Fecha estrutura sintática de U09. |
| 118 | U09 | ␠ [linha vazia] | Separador visual em U09. |
| 119 | U10 |       // 5. Validar payload | Comentário do roteador: 5. Validar payload. |
| 120 | U10 |       if (typeof actionDef.validate === 'function') { | Executa validator opcional antes de criar contexto/executar. |
| 121 | U10 |         const err = actionDef.validate(request); | Obtém erro retornado pelo validator; throw não é capturado aqui. |
| 122 | U10 |         if (err) { | Interrompe execução quando validator retorna erro. |
| 123 | U10 |           sendResponse({ ok: false, error: err }); | Envia erro estruturado imediato. |
| 124 | U10 |           return false; | Fecha canal síncrono/não tratado. |
| 125 | U10 |         } | Fecha estrutura sintática de U10. |
| 126 | U10 |       } | Fecha estrutura sintática de U10. |
| 127 | U10 | ␠ [linha vazia] | Separador visual em U10. |
| 128 | U10 |       // 6. Contexto | Comentário do roteador: 6. Contexto. |
| 129 | U11 |       const context = { | Abre composição do contexto. |
| 130 | U11 |         ...createContext(sender), | Base contém sender/state/log/storage padrão. |
| 131 | U11 |         ...(typeof contextFactory === 'function' ? contextFactory(sender) : {}), | Dependências explícitas do caller sobrescrevem campos base, exceto quando factory não os retorna. |
| 132 | U11 |       }; | Fecha estrutura sintática de U11. |
| 133 | U11 | ␠ [linha vazia] | Separador visual em U11. |
| 134 | U11 |       // 7. Executar | Comentário do roteador: 7. Executar. |
| 135 | U11 |       if (actionDef.meta && actionDef.meta.async === false) { | Escolhe caminho síncrono apenas com meta explicitamente false. |
| 136 | U12 |         try { | Passo operacional de U12: try { |
| 137 | U12 |           const result = actionDef.execute(request, context); | Executa action síncrona sem await. |
| 138 | U12 |           sendResponse({ ok: true, ...(result \|\| {}) }); | Embrulha resultado em envelope ok:true; propriedades do result podem sobrescrever ok por spread posterior. |
| 139 | U12 |         } catch (e) { | Captura exceção do execute no caminho correspondente. |
| 140 | U12 |           log('error', 'router', 'ACTION_ERROR', e.message, {}); | Registra exceção de action. |
| 141 | U12 |           sendResponse({ ok: false, error: { code: 'INTERNAL_ERROR', message: e.message } }); | Envia erro estruturado imediato. |
| 142 | U12 |         } | Fecha estrutura sintática de U12. |
| 143 | U12 |         return false; | Fecha canal síncrono/não tratado. |
| 144 | U12 |       } | Fecha estrutura sintática de U12. |
| 145 | U12 | ␠ [linha vazia] | Separador visual em U12. |
| 146 | U12 |       // Async | Comentário do roteador: Async. |
| 147 | U12 |       (async () => { | Inicia IIFE assíncrona para action padrão. |
| 148 | U12 |         try { | Passo operacional de U12: try { |
| 149 | U12 |           const result = await actionDef.execute(request, context); | Aguarda Promise/valor da action. |
| 150 | U12 |           sendResponse({ ok: true, ...(result \|\| {}) }); | Embrulha resultado em envelope ok:true; propriedades do result podem sobrescrever ok por spread posterior. |
| 151 | U13 |         } catch (e) { | Captura exceção do execute no caminho correspondente. |
| 152 | U13 |           log('error', 'router', 'ACTION_ERROR', e.message \|\| String(e), {}); | Registra exceção de action. |
| 153 | U13 |           sendResponse({ ok: false, error: { code: 'INTERNAL_ERROR', message: e.message \|\| String(e) } }); | Envia erro estruturado imediato. |
| 154 | U13 |         } | Fecha estrutura sintática de U13. |
| 155 | U13 |       })(); | Passo operacional de U13: })(); |
| 156 | U13 |       return true; | Mantém canal onMessage aberto para sendResponse assíncrono. |
| 157 | U13 |     }; | Fecha estrutura sintática de U13. |
| 158 | U13 |   } | Fecha estrutura sintática de U13. |
| 159 | U13 | ␠ [linha vazia] | Separador visual em U13. |
| 160 | U13 |   scope.MangaTranslatorRouter = { | Publica API global do router. |
| 161 | U13 |     createMessageRouter, | Exporta factory do listener. |
| 162 | U14 |     registerAction, | Exporta registry. |
| 163 | U14 |     resolveActionName, | Exporta resolver para adapter do background/testes. |
| 164 | U14 |     identifySource, | Exporta classificador de origem. |
| 165 | U14 |     getAction: (name) => actionRegistry.get(name), | Busca a definição registrada. |
| 166 | U14 |     getRegisteredActions: () => Array.from(actionRegistry.keys()), | Expõe snapshot dos nomes registrados. |
| 167 | U14 |   }; | Fecha estrutura sintática de U14. |
| 168 | U14 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE em self/globalThis. |
| 169 | U15 | ⏎ [newline final] | Newline terminal editorial. |

## Unidades

### U01 — Cabeçalho/IIFE
Strict mode, objetivo e escopo do router.

### U02 — Registry e ACTION_MAP
Mantém actions canônicas e traduz aliases IPC legados.

### U03 — registerAction
Registra definições e rejeita ausência de nome.

### U04 — resolveActionName
Resolve apenas aliases listados.

### U05 — identifySource
Classifica sender em unknown/gemini/content/popup/external.

### U06 — createContext
Monta state/log/sender/storage padrão.

### U07 — Factory + GTC/SM
Cria listener e oferece delegação opcional a namespaces legados.

### U08 — Alias/registry
Recusa não mapeado e detecta action registrada ausente.

### U09 — Gate de origem
Aplica allowedSources.

### U10 — Gate de payload
Executa validator retornável.

### U11 — Merge de contexto
Combina contexto padrão e dependências explícitas.

### U12 — Execução síncrona
Executa sem await, normaliza sucesso/erro e fecha canal.

### U13 — Execução assíncrona
Executa em IIFE async, normaliza sucesso/erro e mantém canal.

### U14 — API pública/fechamento
Expõe factory, registry, resolver/classificador e introspecção.

### U15 — Newline final
Posição editorial para equivalência física.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 168 linhas + newline = 169/169;
- [x] ACTION_MAP/registry/source/context/gates/sync/async documentados;
- [x] testes focais lidos assertion por assertion;
- [x] adapter legado do background separado do router;
- [x] risco de classificação por substring e demais lacunas explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `d9278e9e58e4e9583a30c16227bfd833e7203d89`.

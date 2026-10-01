# Bíblia técnica — tests/mocks/chrome-api.mock.js

> **Estado documental:** 🟡 CORRIGIDA após REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `c1d9a056b7777183bfd3f540c49811335f410425`  
> **Agente responsável:** AGENTE 18  
> **Tipo:** infraestrutura Jest — mock stateful das APIs Chrome  
> **Linhas textuais:** **593**  
> **Posições documentais:** **594**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`tests/mocks/chrome-api.mock.js` é a camada de simulação compartilhada que permite carregar e exercitar módulos da extensão fora do Chromium. Ele instala `global.chrome` no ambiente Jest, mantém estado em memória entre chamadas dentro de um caso de teste e implementa versões controláveis de `chrome.storage`, `chrome.tabs`, `chrome.alarms`, `chrome.runtime`, `chrome.downloads` e `chrome.scripting`.

O arquivo não é um mock descartável criado por teste. Sua estratégia explícita é **singleton por ambiente/suíte Jest**: a primeira inicialização cria instâncias; os hooks seguintes fazem reset parcial para preservar certos listeners — em especial os registrados pelo `background.js` importado no nível do módulo.

Essa escolha é arquiteturalmente relevante. Muitos testes carregam a implementação real de `extension/background.js` por `tests/helpers/load-background-module.js`, que injeta `globalThis.chrome || global.chrome` no módulo instrumentado. Portanto, a fidelidade e o isolamento deste fixture influenciam diretamente o significado de uma grande parte da suíte.

## 2. Wiring no Jest

`jest.config.js` instala este arquivo em `setupFilesAfterEnv` nos projetos:

- `background`;
- `content-scripts`;
- `popup`;
- `reader`;
- `shared-ui`;
- `integration`.

O projeto `gtc` e o projeto `manifest` não o recebem automaticamente pela configuração observada.

Além do carregamento automático, dezenas de testes importam explicitamente os getters `getStorageMock`, `getTabsMock`, `getAlarmsMock`, `getRuntimeMock` e `getDownloadsMock` para preparar estado, registrar handlers e observar efeitos da implementação real.

## 3. Modelo de lifecycle global

### Bootstrap

A chamada top-level `initChromeMocks()` nas linhas 564–566 garante que `global.chrome` exista antes de módulos testados que usam Chrome API no momento do `require`.

### Reset antes de cada teste

O `beforeEach` chama novamente `initChromeMocks`. Quando `global.chrome` já existe, o reset:

- cancela timers pendentes de storage/tabs;
- limpa dados do storage;
- limpa apenas o Map de tabs;
- limpa alarms;
- limpa downloads e seus listeners;
- **não recria o runtime**, para preservar listeners do background.

O reset não restaura todos os campos de todos os mocks aos valores do construtor. Em particular, permanecem estruturas como registries de listeners/handlers de várias APIs e contadores incrementais. Essa assimetria é documentada como risco de isolamento em `119-002`.

### Teardown

O `afterEach` limpa timers que poderiam manter o worker Jest vivo, limpa alarms, cancela callbacks pendentes do runtime, chama `jest.clearAllTimers()`, `jest.clearAllMocks()` e zera `runtime.lastError`.

A existência dos métodos `clearTimers` e `clearMessageTimers` não é apenas preventiva: `tests/unit/background/chrome-runtime-mock-lifecycle.test.js` prova diretamente que callbacks de storage, tabs e runtime podem ser cancelados antes de atravessar o teardown.

## 4. ChromeStorageMock

### Estado

`_store` é um objeto raso. `_getStore` e `_setStore` também fazem cópia rasa; objetos aninhados continuam compartilhando referências.

### get

Suporta quatro formas de `keys`:

- `null`/`undefined` → cópia de todo o store;
- string → objeto com aquela chave, mesmo se o valor for `undefined`;
- array → objeto contendo cada chave pedida;
- objeto → usa o valor do store, ou o valor default fornecido quando a chave armazenada é estritamente `undefined`.

Callback e Promise são agendados separadamente com delay zero. Se ambos forem observados, são dois callbacks/timers distintos.

### set

Para cada chave, monta `{oldValue,newValue}`, muta o store e chama cada listener de `onChanged` com `areaName='local'`. O dispatch do listener acontece sincronicamente dentro de `set`, antes da resolução/callback agendados.

### remove e clear

`remove` aceita chave única ou array. `clear` substitui o objeto do store. No código atual, essas duas operações não chamam o registry `onChanged`; isso é uma propriedade real do mock e não deve ser confundida automaticamente com o contrato completo da API Chrome.

## 5. ChromeTabsMock

### Identidade e criação

IDs começam em 1000 e crescem monotonamente durante a vida da instância. `create` guarda `status:'loading'`, retorna imediatamente uma Promise resolvida com a tab, agenda callback para 0 ms e agenda transição para `complete` + `onUpdated` em 10 ms.

### get/remove/query

- `get` retorna tab ou null; quando usado com callback e a tab não existe, expõe `runtime.lastError` até o callback terminar.
- `remove` aceita id ou array e dispara `onRemoved` para tabs existentes.
- `query` implementa somente o filtro `active`; demais campos de `queryInfo` são ignorados.

Isso basta para muitos fluxos atuais, mas é deliberadamente uma superfície menor que a API de produção. A lacuna de fidelidade está registrada em `119-003`.

### Mensagens para tabs

Handlers de content script são associados manualmente por `_registerMessageHandler(tabId, handler)`. `sendMessage` entrega a mensagem a todos os handlers registrados e cria `sendResponse` por handler.

Quando nenhum handler existe, o mock coloca `chrome.runtime.lastError = {message:'Could not establish connection.'}`. Se há callback, o erro é limpo depois do callback agendado; sem callback, o método retorna sem caminho local de limpeza até outro lifecycle externo.

### Replacement

`_simulateReplacement`:

1. exige tab antiga existente;
2. rejeita id novo igual ao antigo;
3. rejeita colisão com tab já existente;
4. clona a tab com novo id;
5. move handlers do id antigo;
6. dispara `onReplaced(newId, oldId)`;
7. retorna a nova tab.

`tab-replacement-observability.test.js` prova diretamente transferência da tab, desaparecimento do id antigo, evento exatamente uma vez e migração do handler.

## 6. ChromeAlarmsMock

`create` aceita `when` finito ou deriva horário de `delayInMinutes`; antes de criar, limpa alarme homônimo. O timer real remove o registro e notifica todos os listeners.

`clear`, `clearAll`, `get` e `getAll` oferecem callback e Promise. `getAll` esconde `timerId`, devolvendo apenas `name` e `scheduledTime`.

`_fire(name)` é um helper de teste que cancela o timer real e entrega imediatamente o evento `onAlarm`. Ele é usado em testes de lifecycle/watchdog do background real.

A implementação não possui suporte a repetição periódica; nenhuma ocorrência de `periodInMinutes` foi localizada no corpus atual.

## 7. ChromeRuntimeMock

### sendMessage

O dispatcher mantém as seguintes regras:

- percorre todos os listeners registrados;
- `sendResponse` aceita somente a primeira resposta;
- retorno literal `true` de qualquer listener marca canal assíncrono;
- sem listener, callback recebe `undefined` com `lastError` “Receiving end does not exist”;
- com listeners mas sem resposta, um timeout sintetiza “message channel closed”;
- canal sync sem resposta usa 50 ms;
- canal marcado async usa 500 ms;
- uma resposta antes do timeout cancela seu timer.

O teste `chrome-runtime-mock-lifecycle.test.js` prova diretamente que um timeout async aberto pode ser cancelado no teardown.

### connect

Retorna um Port mínimo com `name`, `onDisconnect`, `onMessage`, `postMessage`, `disconnect` e helper `_simulateDisconnect`. Somente o registry de disconnect possui comportamento real; `onMessage/postMessage/disconnect` comuns são stubs vazios. O port é entregue imediatamente aos listeners de `onConnect`.

### install/startup

`onInstalled.addListener` tem uma particularidade de teste: além de registrar, agenda automaticamente uma chamada `{reason:'install'}`. O helper `_simulateInstall` pode ainda disparar listeners explicitamente.

`onStartup` apenas registra; `_simulateStartup` percorre e aguarda cada listener sequencialmente. Os testes de lifecycle usam esse helper para executar recuperação real do background.

## 8. ChromeDownloadsMock

### Política assíncrona

Ao contrário de Storage/Tabs/Runtime, `_schedule` usa `Promise.resolve().then(callback)` e ignora o parâmetro delay. A intenção declarada é manter ordering assíncrono sem criar handles e continuar funcionando quando a suíte ativa fake timers.

Isso significa que o “delay 10” usado na conclusão de `download` não representa 10 ms de parede: ele preserva apenas a separação por microtasks e a ordem callback-do-ID antes do evento de conclusão.

### download/search

`download` cria um registro:

- id incremental;
- URL;
- filename solicitado;
- `state:'in_progress'`;
- `exists:false`.

Depois entrega o ID e, numa microtask posterior, transforma o registro em complete/exists e prefixa o filename com `/home/user/Downloads/`, emitindo `onChanged`.

`search` implementa exatamente os filtros `id` e `filenameRegex`, ambos usados por consumidores reais da extensão.

### demais operações

- `show`: resolve sem efeito;
- `removeFile`: mantém o registro e muda `exists=false`;
- `erase`: remove somente quando `query.id` existe;
- `_simulateFailure`: força `interrupted` e emite evento — nenhum consumidor desse helper foi localizado na busca do corpus.

## 9. ChromeScriptingMock

A superfície é mínima: `executeScript` é um `jest.fn()` pré-configurado para resolver `[{result:undefined}]`. Como `jest.clearAllMocks()` limpa histórico, mas não recria a função nem troca sua implementação base, a mesma identidade do mock persiste enquanto o módulo persistir.

## 10. Evidência automatizada localizada

### Provas focais do próprio mock

`tests/unit/background/chrome-runtime-mock-lifecycle.test.js` prova diretamente:

- timers de resposta do runtime são rastreados e canceláveis;
- `storage.get(null, callback)` cria callbacks pendentes e `clearTimers` os elimina;
- `tabs.create` possui `onUpdated` atrasado que pode ser cancelado;
- a invocação agendada de `onInstalled` pode ser cancelada.

`tests/unit/background/tab-replacement-observability.test.js` prova diretamente:

- migração de id/tab;
- remoção observável do id antigo;
- preservação de url/active;
- disparo de `onReplaced(new,old)`;
- transferência do message handler.

### Execução indireta ampla

`lifecycle-alarms-real.test.js`, `message-handlers-real.test.js`, `batch-lifecycle-real.test.js`, `download-wait.test.js` e muitas outras suítes usam estes mocks para executar a implementação real do background.

Isso é evidência de que a infraestrutura participa de fluxos verdes/vermelhos da aplicação; não transforma automaticamente cada branch do mock em prova direta da semântica do próprio mock.

## 11. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| setup automático em background/content/popup/reader/shared-ui/integration | `jest.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `global.chrome` existe antes dos imports dos módulos testados | top-level init + setupFilesAfterEnv | 🟨 EXECUTADO INDIRETAMENTE |
| cancelamento de timers de `storage.get` | `chrome-runtime-mock-lifecycle.test.js` | ✅ PROVADO DIRETAMENTE |
| cancelamento do onUpdated de `tabs.create` | mesmo teste | ✅ PROVADO DIRETAMENTE |
| cancelamento do timeout de `runtime.sendMessage` | mesmo teste | ✅ PROVADO DIRETAMENTE |
| cancelamento do auto-fire agendado de `onInstalled` | mesmo teste | ✅ PROVADO DIRETAMENTE |
| replacement move tab + handler e emite evento | `tab-replacement-observability.test.js` | ✅ PROVADO DIRETAMENTE |
| Storage get/set em fluxos reais | dezenas de testes de background/popup/integration | 🟨 EXECUTADO INDIRETAMENTE |
| todas as variantes string/array/object/default de Storage.get | sem suíte focal completa | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| semântica de Storage.remove/clear/onChanged | sem teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Tabs create/get/remove/sendMessage em fluxos reais | suites de background | 🟨 EXECUTADO INDIRETAMENTE |
| Tabs.query além de `active` | mock não implementa filtros adicionais | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| branches de lastError de Tabs | alguns erros são exercitados via background | 🟨 EXECUTADO INDIRETAMENTE |
| Alarms create/getAll/_fire | lifecycle/watchdog reais | 🟨 EXECUTADO INDIRETAMENTE |
| get/clear/clearAll isoladamente | sem suíte focal completa | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Runtime sendMessage sem listener / sync sem resposta / async com resposta | cobertura focal incompleta | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Runtime connect/keep-alive | lifecycle real | 🟨 EXECUTADO INDIRETAMENTE |
| startup simulation | lifecycle real | 🟨 EXECUTADO INDIRETAMENTE |
| Downloads download/search/remove/erase | handlers reais usam a superfície | 🟨 EXECUTADO INDIRETAMENTE |
| Downloads ordering exato e failure helper | sem focal; `_simulateFailure` sem consumidor localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Scripting.executeScript default | sem teste focal do fixture | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| isolamento completo entre casos | reset é parcial e não há prova focal global | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 12. Solicitações ao auditor

### 119-001 — TEST_REQUIRED — ACCEPTED

**Encontrado:** não existe uma suíte focal abrangente do `chrome-api.mock.js`; as provas diretas localizadas cobrem lifecycle de timers e replacement, enquanto a maioria das APIs é validada apenas indiretamente por testes da extensão.

**Arquivo auditado:** `tests/mocks/chrome-api.mock.js`.

**Arquivo externo sugerido:** `tests/unit/mocks/chrome-api.mock.test.js` ou localização equivalente aprovada pelo auditor.

**Evidência atual:** `chrome-runtime-mock-lifecycle.test.js` e `tab-replacement-observability.test.js` cobrem subconjuntos específicos; demais suítes consomem os mocks como infraestrutura.

**Evidência ausente:** matriz direta de Storage, Tabs, Alarms, Runtime, Downloads e Scripting, incluindo callbacks versus Promises, ordering, lastError, add/removeListener e branches de erro.

**Por que é necessária:** um defeito no próprio mock pode alterar o significado de dezenas de testes e produzir falso verde ou falso vermelho.

**Ação solicitada:** criar suíte separada para a implementação real deste fixture, sem copiar seu comportamento esperado para outro mock.

**Evidência esperada:** assertions diretas por método/branch, com fake timers quando necessário e checks explícitos de ordering/lastError/eventos.

**Ação esperada do auditor:** definir a matriz mínima de fidelidade crítica e implementá-la fora desta Bíblia.

**Possível regressão:** mudanças no mock podem mascarar regressões de produção ou quebrar suites sem que a origem seja identificada.

**Severidade:** ALTA.

### 119-002 — ISOLATION_REVIEW — ACCEPTED

**Encontrado:** o reset de `initChromeMocks` limpa dados de storage/tabs/alarms/downloads, mas não restaura todos os registries/counters do construtor. Permanecem, entre outros, `storageMock._listeners`, `tabsMock._messageHandlers`, registries `onRemoved/onUpdated/onReplaced`, `alarmsMock._listeners`, `tabsMock._nextTabId` e IDs de download. O runtime é preservado intencionalmente; downloads listeners, ao contrário, são explicitamente zerados por histórico de leak.

**Evidência atual:** linhas 545–561 mostram exatamente os campos limpos; busca do corpus encontrou resets manuais pontuais, por exemplo `storageMock._listeners=[]` em `single-image-context-menu.test.js` e `tabs._onUpdatedListeners=[]` em `chrome-runtime-mock-lifecycle.test.js`.

**Evidência ausente:** prova global de que registries preservados nunca contaminam casos seguintes, ou lista formal de quais registries devem persistir versus ser isolados.

**Por que é necessária:** a estratégia singleton pode carregar observers/handlers de um caso para outro, tornando resultado dependente de ordem.

**Ação solicitada:** auditar cada campo stateful e classificar como “deve persistir” ou “deve resetar”; depois adicionar teste de isolamento entre casos e corrigir apenas em alteração funcional separada se necessário.

**Evidência esperada:** dois ou mais casos consecutivos que provem ausência de handlers/listeners/dados não intencionais no segundo caso, preservando somente listeners deliberados do background.

**Ação esperada do auditor:** resolver a política de lifecycle do singleton e registrar explicitamente as exceções.

**Possível regressão:** flakiness, chamadas duplicadas, listeners mortos e dependência da ordem das suítes.

**Severidade:** ALTA.

### 119-003 — MOCK_FIDELITY_REVIEW — ACCEPTED

**Encontrado:** várias superfícies são intencionalmente simplificadas: `Tabs.query` só respeita `active`; Storage `remove/clear` não notificam o registry `onChanged`; `onInstalled.addListener` agenda install automaticamente; Downloads converte “delay” em microtasks; Port tem métodos majoritariamente stubs; APIs Chrome ausentes são injetadas ad hoc por algumas suítes.

**Evidência atual:** implementação explícita nas linhas 67–79, 161–168, 359–378, 390–398 e 429–465. Consumidores reais usam filtros/semânticas que em parte excedem o modelo simplificado, por exemplo código de produção contém `tabs.query({currentWindow:true})` e `tabs.query({windowId:...})`.

**Evidência ausente:** contrato que delimite quais diferenças do Chrome real são aceitas e testes que impeçam uma suíte de depender silenciosamente de comportamento que o mock não representa.

**Por que é necessária:** um teste pode passar sob a simulação reduzida e falhar no navegador real, ou vice-versa.

**Ação solicitada:** inventariar os usos de Chrome API cobertos por Jest e comparar com a superfície necessária; ampliar somente as partes realmente usadas ou marcar cenários como dependentes de E2E.

**Evidência esperada:** tabela API real↔mock para métodos/argumentos usados pelo corpus e regressões focais para diferenças críticas.

**Ação esperada do auditor:** aceitar explicitamente simplificações seguras e solicitar correções separadas nas que afetarem comportamento testado.

**Possível regressão:** falso positivo em testes unitários/integrados por divergência entre mock e Chromium.

**Severidade:** ALTA.

## 13. Fonte integral auditada

~~~javascript
/**
 * Mock Completo da API Chrome para Testes
 *
 * Estratégia de inicialização:
 *  - As instâncias dos mocks são criadas uma única vez no nível do módulo.
 *  - `initChromeMocks()` é chamado no topo (para que requires no nível do módulo
 *    já encontrem `global.chrome` definido) e novamente em cada `beforeEach`
 *    (reset leve: limpa dados sem recriar instâncias, preservando listeners do
 *    runtime para que o background.js permaneça registrado entre os testes).
 */

// ── Storage Mock (Stateful) ────────────────────────────────────────
class ChromeStorageMock {
  constructor() {
    this._store = {};     // Estado em memória
    this._listeners = []; // onChanged listeners
    this._pendingTimers = new Set();
  }

  _schedule(callback, delay = 0) {
    const timer = setTimeout(() => {
      this._pendingTimers.delete(timer);
      callback();
    }, delay);
    this._pendingTimers.add(timer);
    return timer;
  }

  clearTimers() {
    for (const timer of this._pendingTimers) clearTimeout(timer);
    this._pendingTimers.clear();
  }

  get(keys, callback) {
    return new Promise((resolve) => {
      let result = {};

      if (keys === null || keys === undefined) {
        result = { ...this._store };
      } else if (typeof keys === 'string') {
        result[keys] = this._store[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach(k => { result[k] = this._store[k]; });
      } else if (typeof keys === 'object') {
        Object.keys(keys).forEach(k => {
          result[k] = this._store[k] !== undefined ? this._store[k] : keys[k];
        });
      }

      if (callback) this._schedule(() => callback(result), 0);
      this._schedule(() => resolve(result), 0);
    });
  }

  set(items, callback) {
    return new Promise((resolve) => {
      const changes = {};
      Object.keys(items).forEach(key => {
        changes[key] = { oldValue: this._store[key], newValue: items[key] };
        this._store[key] = items[key];
      });
      this._listeners.forEach(listener => listener(changes, 'local'));
      this._schedule(() => { if (callback) callback(); resolve(); }, 0);
    });
  }

  remove(keys, callback) {
    return new Promise((resolve) => {
      const toRemove = Array.isArray(keys) ? keys : [keys];
      toRemove.forEach(k => delete this._store[k]);
      this._schedule(() => { if (callback) callback(); resolve(); }, 0);
    });
  }

  clear(callback) {
    this._store = {};
    if (callback) this._schedule(callback, 0);
    return Promise.resolve();
  }

  _getStore() { return { ...this._store }; }
  _setStore(initialState) { this._store = { ...initialState }; }

  onChanged = {
    addListener:    (fn) => this._listeners.push(fn),
    removeListener: (fn) => { this._listeners = this._listeners.filter(l => l !== fn); },
  };
}

// ── Tabs Mock (Stateful) ───────────────────────────────────────────
class ChromeTabsMock {
  constructor() {
    this._tabs               = new Map();
    this._nextTabId          = 1000;
    this._messageHandlers     = new Map();
    this._onRemovedListeners  = [];
    this._onUpdatedListeners  = [];
    this._onReplacedListeners = [];
    this._pendingTimers        = new Set();
  }

  _schedule(callback, delay = 0) {
    const timer = setTimeout(() => {
      this._pendingTimers.delete(timer);
      callback();
    }, delay);
    this._pendingTimers.add(timer);
    return timer;
  }

  clearTimers() {
    for (const timer of this._pendingTimers) clearTimeout(timer);
    this._pendingTimers.clear();
  }

  create(options, callback) {
    const tabId = this._nextTabId++;
    const tab = {
      id:     tabId,
      url:    options.url || 'about:blank',
      active: options.active !== undefined ? options.active : true,
      status: 'loading',
      title:  '',
    };
    this._tabs.set(tabId, tab);

    this._schedule(() => {
      tab.status = 'complete';
      this._onUpdatedListeners.forEach(fn => fn(tabId, { status: 'complete' }, tab));
    }, 10);

    if (callback) this._schedule(() => callback(tab), 0);
    return Promise.resolve(tab);
  }

  get(tabId, callback) {
    const tab = this._tabs.get(tabId) || null;
    if (!tab && callback) {
      global.chrome.runtime.lastError = { message: `No tab with id: ${tabId}` };
      this._schedule(() => { callback(null); global.chrome.runtime.lastError = null; }, 0);
    } else if (callback) {
      this._schedule(() => callback(tab), 0);
    }
    return Promise.resolve(tab);
  }

  remove(tabId, callback) {
    const tabIds = Array.isArray(tabId) ? tabId : [tabId];
    tabIds.forEach(id => {
      if (this._tabs.has(id)) {
        this._tabs.delete(id);
        this._onRemovedListeners.forEach(fn => fn(id, { isWindowClosing: false }));
      } else {
        global.chrome.runtime.lastError = { message: `No tab with id: ${id}` };
      }
    });
    if (callback) this._schedule(() => { callback(); global.chrome.runtime.lastError = null; }, 0);
    return Promise.resolve();
  }

  query(queryInfo, callback) {
    let results = Array.from(this._tabs.values());
    if (queryInfo.active !== undefined) {
      results = results.filter(t => t.active === queryInfo.active);
    }
    if (callback) this._schedule(() => callback(results), 0);
    return Promise.resolve(results);
  }

  sendMessage(tabId, message, callback) {
    const handlers = this._messageHandlers.get(tabId) || [];
    if (handlers.length === 0) {
      global.chrome.runtime.lastError = { message: 'Could not establish connection.' };
      if (callback) this._schedule(() => { callback(undefined); global.chrome.runtime.lastError = null; }, 0);
      return;
    }
    handlers.forEach(handler => {
      const sendResponse = (response) => {
        if (callback) this._schedule(() => callback(response), 0);
      };
      handler(message, { tab: this._tabs.get(tabId) }, sendResponse);
    });
  }

  _registerMessageHandler(tabId, handler) {
    if (!this._messageHandlers.has(tabId)) this._messageHandlers.set(tabId, []);
    this._messageHandlers.get(tabId).push(handler);
  }

  _simulateReplacement(oldTabId, newTabId = this._nextTabId++) {
    const oldTab = this._tabs.get(oldTabId);
    if (!oldTab) throw new Error(`Cannot replace missing tab ${oldTabId}`);
    if (oldTabId === newTabId) throw new Error('Replacement tab id must differ from old tab id');
    if (this._tabs.has(newTabId)) throw new Error(`Replacement target already exists: ${newTabId}`);

    const newTab = { ...oldTab, id: newTabId };
    this._tabs.delete(oldTabId);
    this._tabs.set(newTabId, newTab);

    if (this._messageHandlers.has(oldTabId)) {
      this._messageHandlers.set(newTabId, this._messageHandlers.get(oldTabId));
      this._messageHandlers.delete(oldTabId);
    }

    this._onReplacedListeners.forEach(fn => fn(newTabId, oldTabId));
    return newTab;
  }

  onReplaced = {
    addListener:    (fn) => this._onReplacedListeners.push(fn),
    removeListener: (fn) => { this._onReplacedListeners = this._onReplacedListeners.filter(l => l !== fn); },
  };

  onRemoved = {
    addListener:    (fn) => this._onRemovedListeners.push(fn),
    removeListener: (fn) => { this._onRemovedListeners = this._onRemovedListeners.filter(l => l !== fn); },
  };

  onUpdated = {
    addListener:    (fn) => this._onUpdatedListeners.push(fn),
    removeListener: (fn) => { this._onUpdatedListeners = this._onUpdatedListeners.filter(l => l !== fn); },
  };
}

// ── Alarms Mock ────────────────────────────────────────────────────
class ChromeAlarmsMock {
  constructor() {
    this._alarms    = new Map();
    this._listeners = [];
  }

  create(name, alarmInfo = {}) {
    this.clear(name);
    const scheduledTime = Number.isFinite(alarmInfo.when)
      ? alarmInfo.when
      : Date.now() + ((alarmInfo.delayInMinutes || 0) * 60 * 1000);
    const delayMs = Math.max(0, scheduledTime - Date.now());
    const timerId = setTimeout(() => {
      const alarm = { name, scheduledTime };
      this._alarms.delete(name);
      this._listeners.forEach(fn => fn(alarm));
    }, delayMs);
    this._alarms.set(name, { name, scheduledTime, timerId });
  }

  clear(name, callback) {
    const alarm = this._alarms.get(name);
    if (alarm) { clearTimeout(alarm.timerId); this._alarms.delete(name); }
    if (callback) callback(!!alarm);
    return Promise.resolve(!!alarm);
  }

  clearAll(callback) {
    this._alarms.forEach(alarm => clearTimeout(alarm.timerId));
    this._alarms.clear();
    if (callback) callback();
    return Promise.resolve();
  }

  get(name, callback) {
    const alarm = this._alarms.get(name) || null;
    if (callback) callback(alarm);
    return Promise.resolve(alarm);
  }

  getAll(callback) {
    const alarms = Array.from(this._alarms.values())
      .map(({ name, scheduledTime }) => ({ name, scheduledTime }));
    if (callback) callback(alarms);
    return Promise.resolve(alarms);
  }

  /** Dispara manualmente um alarme pelo nome (útil em testes com fake timers). */
  _fire(name) {
    const alarm = this._alarms.get(name);
    if (alarm) {
      clearTimeout(alarm.timerId);
      this._alarms.delete(name);
      this._listeners.forEach(fn => fn({ name, scheduledTime: alarm.scheduledTime }));
    }
  }

  onAlarm = {
    addListener:    (fn) => this._listeners.push(fn),
    removeListener: (fn) => { this._listeners = this._listeners.filter(l => l !== fn); },
  };
}

// ── Runtime Mock ───────────────────────────────────────────────────
class ChromeRuntimeMock {
  constructor() {
    this._messageListeners = [];
    this._connectListeners = [];
    this._installedListeners = [];
    this._startupListeners = [];
    this.lastError         = null;
    this.id                = 'test-extension-id';
    this._pendingMessageTimers = new Set();
  }

  _scheduleMessageCallback(callback, delay) {
    const timer = setTimeout(() => {
      this._pendingMessageTimers.delete(timer);
      callback();
    }, delay);
    this._pendingMessageTimers.add(timer);
    return timer;
  }

  _clearMessageTimer(timer) {
    clearTimeout(timer);
    this._pendingMessageTimers.delete(timer);
  }

  clearMessageTimers() {
    for (const timer of this._pendingMessageTimers) clearTimeout(timer);
    this._pendingMessageTimers.clear();
  }

  sendMessage(message, callback) {
    let responded = false;
    let asyncChannelOpen = false;
    let responseTimeoutId = null;
    const sendResponse = (response) => {
      if (responseTimeoutId) {
        this._clearMessageTimer(responseTimeoutId);
        responseTimeoutId = null;
      }
      if (!responded) {
        responded = true;
        if (callback) this._scheduleMessageCallback(() => callback(response), 0);
      }
    };
    const sender = { id: this.id, tab: null };
    this._messageListeners.forEach(listener => {
      const shouldKeepAlive = listener(message, sender, sendResponse);
      if (shouldKeepAlive === true) asyncChannelOpen = true;
    });

    if (!responded && callback) {
      if (this._messageListeners.length === 0) {
        this.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
        this._scheduleMessageCallback(() => {
          callback(undefined);
          this.lastError = null;
        }, 0);
      } else {
        responseTimeoutId = this._scheduleMessageCallback(() => {
          this.lastError = { message: 'The message channel closed before a response was received.' };
          callback(undefined);
          this.lastError = null;
        }, asyncChannelOpen ? 500 : 50);
      }
    }
  }

  getURL(path) { return `chrome-extension://test-extension-id/${path}`; }

  connect(options) {
    const port = {
      name:         options?.name || '',
      _disconnectListeners: [],
      onDisconnect: {
        addListener: (fn) => port._disconnectListeners.push(fn),
        removeListener: (fn) => {
          port._disconnectListeners = port._disconnectListeners.filter(listener => listener !== fn);
        },
      },
      onMessage:    { addListener: () => {}, removeListener: () => {} },
      postMessage:  () => {},
      disconnect:   () => {},
      _simulateDisconnect: () => {
        port._disconnectListeners.forEach(fn => fn(port));
      },
    };
    this._connectListeners.forEach(fn => fn(port));
    return port;
  }

  onMessage = {
    addListener:    (fn) => this._messageListeners.push(fn),
    removeListener: (fn) => { this._messageListeners = this._messageListeners.filter(l => l !== fn); },
  };

  onConnect = {
    addListener:    (fn) => this._connectListeners.push(fn),
    removeListener: (fn) => { this._connectListeners = this._connectListeners.filter(l => l !== fn); },
  };

  onInstalled = {
    addListener:    (fn) => {
      this._installedListeners.push(fn);
      this._scheduleMessageCallback(() => fn({ reason: 'install' }), 0);
    },
    removeListener: (fn) => {
      this._installedListeners = this._installedListeners.filter(listener => listener !== fn);
    },
  };

  onStartup = {
    addListener:    (fn) => this._startupListeners.push(fn),
    removeListener: (fn) => {
      this._startupListeners = this._startupListeners.filter(listener => listener !== fn);
    },
  };

  async _simulateStartup() {
    for (const listener of this._startupListeners) {
      // eslint-disable-next-line no-await-in-loop
      await listener();
    }
  }

  async _simulateInstall(reason = 'install') {
    for (const listener of this._installedListeners) {
      // eslint-disable-next-line no-await-in-loop
      await listener({ reason });
    }
  }
}

// ── Downloads Mock ─────────────────────────────────────────────────
class ChromeDownloadsMock {
  constructor() {
    this._downloads         = new Map();
    this._nextId            = 1;
    this._onChangedListeners = [];
  }

  _schedule(callback, _delay = 0) {
    // Promise microtasks preservam assincronicidade sem criar handles de timer
    // e continuam funcionando quando a suíte ativa fake timers.
    Promise.resolve().then(callback);
    return null;
  }

  clearTimers() {
    // Compatibilidade com o reset do mock; microtasks não deixam handles vivos.
  }

  download(options, callback) {
    const id = this._nextId++;
    const download = {
      id,
      url:      options.url,
      filename: options.filename || '',
      state:    'in_progress',
      exists:   false,
    };
    this._downloads.set(id, download);

    // O callback entrega o ID antes do evento de conclusão, como no Chrome.
    // O consumidor consegue registrar onChanged/waitForDownload antes do evento.
    if (callback) this._schedule(() => callback(id), 0);

    this._schedule(() => {
      download.state    = 'complete';
      download.exists   = true;
      download.filename = `/home/user/Downloads/${download.filename}`;
      this._onChangedListeners.forEach(fn =>
        fn({ id, state: { previous: 'in_progress', current: 'complete' } })
      );
    }, 10);
    return Promise.resolve(id);
  }

  search(query, callback) {
    let results = Array.from(this._downloads.values());
    if (query.id) results = results.filter(d => d.id === query.id);
    if (query.filenameRegex) {
      const regex = new RegExp(query.filenameRegex);
      results = results.filter(d => regex.test(d.filename));
    }
    if (callback) this._schedule(() => callback(results), 0);
    return Promise.resolve(results);
  }

  show(_downloadId) { return Promise.resolve(); }

  removeFile(downloadId, callback) {
    const dl = this._downloads.get(downloadId);
    if (dl) dl.exists = false;
    if (callback) this._schedule(callback, 0);
    return Promise.resolve();
  }

  erase(query, callback) {
    if (query.id) this._downloads.delete(query.id);
    if (callback) this._schedule(callback, 0);
    return Promise.resolve();
  }

  /** Simula falha de download (útil em testes de erro). */
  _simulateFailure(downloadId) {
    const dl = this._downloads.get(downloadId);
    if (dl) {
      dl.state = 'interrupted';
      this._onChangedListeners.forEach(fn =>
        fn({ id: downloadId, state: { previous: 'in_progress', current: 'interrupted' } })
      );
    }
  }

  onChanged = {
    addListener:    (fn) => this._onChangedListeners.push(fn),
    removeListener: (fn) => { this._onChangedListeners = this._onChangedListeners.filter(l => l !== fn); },
  };
}

// ── Scripting Mock ─────────────────────────────────────────────────
const ChromeScriptingMock = {
  executeScript: jest.fn().mockResolvedValue([{ result: undefined }]),
};

// ── Instâncias (singleton por suite de testes) ─────────────────────
let storageMock, tabsMock, alarmsMock, runtimeMock, downloadsMock;

/**
 * Inicializa ou reseta o mock do Chrome.
 *
 * - Primeira chamada: cria todas as instâncias e define `global.chrome`.
 * - Chamadas subsequentes: faz reset leve dos dados (storage, tabs, alarms,
 *   downloads) sem recriar o `runtimeMock`, preservando os listeners do
 *   background.js registrados entre os testes.
 */
function initChromeMocks() {
  if (!global.chrome) {
    storageMock   = new ChromeStorageMock();
    tabsMock      = new ChromeTabsMock();
    alarmsMock    = new ChromeAlarmsMock();
    runtimeMock   = new ChromeRuntimeMock();
    downloadsMock = new ChromeDownloadsMock();

    global.chrome = {
      storage:   {
        local: storageMock,
        onChanged: storageMock.onChanged,
      },
      tabs:      tabsMock,
      alarms:    alarmsMock,
      runtime:   runtimeMock,
      downloads: downloadsMock,
      scripting: ChromeScriptingMock,
    };
  } else {
    // Reset leve — NÃO recria runtimeMock para preservar listeners do background.js
    // Cancele primeiro callbacks transitórios do caso anterior para impedir que
    // eles executem depois do reset e reativem listeners persistentes.
    storageMock.clearTimers();
    tabsMock.clearTimers();
    storageMock.clear();
    tabsMock._tabs.clear();
    alarmsMock.clearAll();
    downloadsMock.clearTimers();
    downloadsMock._downloads.clear();
    // CORREÇÃO: _onChangedListeners acumulava entre testes quando um teste registrava
    // um listener mas nunca disparava o evento que o removeria (ex: esperava download 42
    // mas o evento era para download 99). O próximo teste então herdava esse listener
    // "morto" que interferia com a contagem esperada de listeners.
    downloadsMock._onChangedListeners = [];
  }
}

// Garante que `global.chrome` exista no momento em que outros módulos são
// importados no nível do módulo (antes de qualquer beforeEach).
initChromeMocks();

// ── Hooks Jest ─────────────────────────────────────────────────────
beforeEach(() => {
  initChromeMocks();
});

afterEach(() => {
  // O último caso da suíte também pode criar alarmes de vários minutos.
  // Limpá-los apenas no beforeEach seguinte deixa o worker Jest vivo.
  storageMock?.clearTimers();
  tabsMock?.clearTimers();
  alarmsMock?.clearAll();
  runtimeMock?.clearMessageTimers();
  downloadsMock?.clearTimers();
  jest.clearAllTimers();
  jest.clearAllMocks();
  if (global.chrome?.runtime) global.chrome.runtime.lastError = null;
});

// ── Exports ────────────────────────────────────────────────────────
module.exports = {
  getStorageMock:   () => storageMock,
  getTabsMock:      () => tabsMock,
  getAlarmsMock:    () => alarmsMock,
  getRuntimeMock:   () => runtimeMock,
  getDownloadsMock: () => downloadsMock,
};
~~~

## 14. Mapa exaustivo de posições

Cada posição do blob está coberta exatamente uma vez abaixo. O mapa usa unidades semânticas contíguas em vez de repetir uma descrição genérica para cada linha de sintaxe; a fonte integral acima preserva o detalhe linha a linha.

| Linhas/posição | Função técnica | Evidência |
|---:|---|---|
| 1–10 | Cabeçalho: explica singleton por suíte, bootstrap antes dos imports e reset leve que preserva listeners do runtime. | 🟦 contrato no próprio fixture; wiring confirmado em jest.config.js |
| 11–12 | Separação visual do Storage Mock. | estrutural |
| 13–18 | ChromeStorageMock: declara store em memória, registry de onChanged e conjunto de timers pendentes. | 🟨 amplamente consumido; sem teste focal do construtor |
| 19–27 | Storage._schedule: agenda callback por setTimeout, remove o handle antes de executar e rastreia o timer. | ✅ clear/cancelamento provado por chrome-runtime-mock-lifecycle.test.js |
| 28–32 | Storage.clearTimers: cancela e esvazia todos os timers pendentes. | ✅ PROVADO DIRETAMENTE |
| 33–53 | Storage.get: suporta all/null, string, array e objeto com defaults; callback e Promise resolvem de forma assíncrona. | 🟨 get é usado extensivamente; variantes de keys não têm suíte focal completa |
| 54–65 | Storage.set: calcula old/new, muta store, dispara onChanged(local) e resolve callback/Promise via timer. | 🟨 executado por muitas suítes; sem teste focal completo de eventos |
| 66–73 | Storage.remove: remove uma ou várias chaves e resolve callback/Promise; não dispara o registry onChanged nesta implementação. | ⚠️ sem prova focal específica |
| 74–79 | Storage.clear: substitui store por objeto vazio; callback é agendado, Promise retorna resolvida imediatamente. | 🟨 usado em setup/teardown; sem prova focal de ordering |
| 80–82 | Helpers internos _getStore/_setStore fazem cópia rasa de entrada/saída para montagem direta de estados de teste. | 🟨 usados por testes reais do background |
| 83–88 | Storage.onChanged expõe add/remove sobre o registry persistente. | 🟨 consumidores reais registram listeners; sem teste focal de ciclo completo |
| 89–90 | Separação visual do Tabs Mock. | estrutural |
| 91–100 | ChromeTabsMock: maps de abas/handlers, IDs a partir de 1000, registries de eventos e timers. | 🟨 infraestrutura amplamente usada |
| 101–109 | Tabs._schedule rastreia timers como Storage._schedule. | ✅ cancelamento provado diretamente |
| 110–114 | Tabs.clearTimers cancela callbacks pendentes. | ✅ PROVADO DIRETAMENTE |
| 115–134 | Tabs.create cria tab loading, agenda status complete/onUpdated em 10 ms, callback em 0 ms e retorna Promise da tab. | 🟨 create exercitado extensivamente; cancelamento do onUpdated é prova direta |
| 135–145 | Tabs.get retorna tab/null; com callback de tab ausente expõe runtime.lastError temporariamente. | 🟨 usado em tab-replacement; branch lastError sem teste focal dedicado |
| 146–159 | Tabs.remove aceita id/lista, remove tabs existentes, dispara onRemoved e usa lastError para ausentes até callback. | 🟨 exercitado por fluxos reais; sem matriz focal |
| 160–168 | Tabs.query retorna todas as tabs e implementa somente filtro active quando fornecido. | 🟨 consumido por código real; fidelidade de filtros adicionais não provada |
| 169–183 | Tabs.sendMessage roteia para handlers registrados; ausência de handler cria runtime.lastError; handlers recebem sender.tab e sendResponse. | 🟨/✅ migração+roteamento após replacement provados; branch sem handler exercitado indiretamente |
| 184–188 | _registerMessageHandler associa handlers a um tabId e preserva múltiplos por aba. | ✅ usado diretamente no teste de replacement e muitos testes de background |
| 189–207 | _simulateReplacement valida IDs, transfere tab e handlers, dispara onReplaced e retorna a nova tab. | ✅ PROVADO DIRETAMENTE por tab-replacement-observability.test.js |
| 208–223 | Eventos Tabs onReplaced/onRemoved/onUpdated fornecem add/remove simples em arrays. | ✅ onReplaced focal; onUpdated cancel focal; onRemoved apenas indireto |
| 224–225 | Separação visual do Alarms Mock. | estrutural |
| 226–230 | ChromeAlarmsMock inicializa map de alarms e registry onAlarm. | 🟨 usado pelas suítes de lifecycle |
| 231–244 | Alarms.create substitui alarme homônimo, calcula scheduledTime por when/delayInMinutes, agenda fire e persiste timerId. | 🟨 exercitado por lifecycle/watchdog; sem teste unitário isolado |
| 245–251 | Alarms.clear cancela handle, remove entry, informa boolean por callback e Promise. | 🟨 executado pelo background; sem teste focal próprio |
| 252–258 | Alarms.clearAll cancela todos os timers, limpa map e resolve. | 🟨 usado em hooks e suites |
| 259–264 | Alarms.get retorna alarme completo ou null por callback/Promise. | 🟨 sem prova focal específica |
| 265–272 | Alarms.getAll remove timerId da visão pública e retorna name/scheduledTime. | 🟨 assertions de lifecycle inspecionam alarms |
| 273–281 | Alarms._fire dispara manualmente um alarme, cancela timer real, remove do map e notifica listeners. | 🟨 usado por lifecycle-alarms-real e batch-lifecycle-real |
| 282–287 | Alarms.onAlarm mantém registry de listeners. | 🟨 background real registra e recebe eventos |
| 288–289 | Separação visual do Runtime Mock. | estrutural |
| 290–299 | ChromeRuntimeMock inicializa registries de mensagem/conexão/install/startup, lastError, id fixo e timers de respostas. | 🟨 infraestrutura central |
| 300–308 | Runtime._scheduleMessageCallback agenda callbacks e rastreia handles. | ✅ cancelamento focal existente |
| 309–313 | Runtime._clearMessageTimer cancela um timer e remove do set. | 🟨 exercitado por sendResponse; sem assertion isolada |
| 314–318 | Runtime.clearMessageTimers cancela todas as respostas pendentes. | ✅ PROVADO DIRETAMENTE |
| 319–355 | Runtime.sendMessage despacha a todos os listeners; respeita sendResponse único, retorno true como canal assíncrono, lastError para zero listeners e timeout 50/500 ms. | 🟨 caminho de messaging usado; timeout cancelado tem prova direta, matriz completa ausente |
| 356–357 | Runtime.getURL prefixa path com chrome-extension://test-extension-id/. | ⚠️ sem teste focal localizado |
| 358–378 | Runtime.connect constrói Port simplificado, registry onDisconnect, hooks mínimos, notifica onConnect e retorna o port. | 🟨 usado pelo fluxo keep-alive/lifecycle; superfície do Port é simplificada |
| 379–383 | Runtime.onMessage registra/remove listeners. | 🟨 background real depende disso |
| 384–388 | Runtime.onConnect registra/remove listeners. | 🟨 lifecycle usa conexão keep-alive |
| 389–398 | Runtime.onInstalled registra listener e, adicionalmente, agenda invocação automática com reason install; removeListener filtra registry. | ✅ cancelamento da invocação agendada provado; sem teste focal da fidelidade semântica |
| 399–405 | Runtime.onStartup registra/remove listeners sem auto-fire. | 🟨 background real registra e testes simulam startup |
| 406–412 | _simulateStartup aguarda listeners sequencialmente. | 🟨 usado por lifecycle-alarms-real para executar background real |
| 413–420 | _simulateInstall aguarda listeners sequencialmente com reason configurável; fecha classe Runtime. | 🟨 sem suíte focal do helper |
| 421–422 | Separação visual do Downloads Mock. | estrutural |
| 423–428 | ChromeDownloadsMock inicializa map, ID incremental e registry onChanged. | 🟨 infraestrutura de download |
| 429–435 | Downloads._schedule usa microtask Promise e ignora delay para evitar handles e compatibilizar fake timers. | 🟨 ordering usado pelos testes; sem prova focal da política |
| 436–439 | Downloads.clearTimers é no-op por design porque microtasks não deixam handles canceláveis. | 🟦 comportamento explícito; sem assertion focal |
| 440–465 | Downloads.download cria registro in_progress, agenda callback do ID antes da conclusão e depois marca complete/exists/path e dispara onChanged. | 🟨 usado indiretamente por handlers reais; sem teste focal do mock |
| 466–476 | Downloads.search filtra opcionalmente por id e filenameRegex e entrega resultados por callback/Promise. | 🟨 consumidores reais usam ambos filtros; sem teste focal isolado |
| 477–479 | Downloads.show é no-op assíncrono resolvido. | ⚠️ sem teste focal |
| 480–486 | Downloads.removeFile marca exists=false sem remover metadados. | 🟨 usado por código/testes relacionados; sem focal |
| 487–493 | Downloads.erase remove por id quando presente e resolve callback/Promise. | ⚠️ sem matriz focal |
| 494–502 | _simulateFailure muda state para interrupted e emite onChanged correspondente. | ⚠️ helper sem consumidor localizado |
| 503–508 | Downloads.onChanged mantém registry de listeners. | 🟨 waitForDownload real depende do registry |
| 509–513 | ChromeScriptingMock oferece executeScript como jest.fn resolvendo [{result:undefined}]. | 🟨 usado como superfície compartilhada; sem teste focal |
| 514–516 | Declara singletons de storage/tabs/alarms/runtime/downloads por ambiente Jest. | 🟦 desenho estrutural |
| 517–525 | JSDoc de initChromeMocks formaliza criação inicial versus reset leve e preservação do runtime. | 🟦 contrato interno |
| 526–544 | Primeira inicialização cria os cinco mocks e monta global.chrome, incluindo storage.onChanged e scripting. | 🟨 executado em todo projeto configurado; sem teste focal da shape completa |
| 545–561 | Reset subsequente cancela timers, limpa stores/maps de dados e downloads listeners, mas preserva diversos registries/counters. | 🟨 reset executado em beforeEach; isolamento completo não provado |
| 562–566 | Fecha init e o executa imediatamente para garantir global.chrome antes de imports de módulos de teste. | 🟦 wiring com setupFilesAfterEnv; 🟨 executado em suites |
| 567–571 | beforeEach Jest chama initChromeMocks novamente. | 🟦 wiring automático |
| 572–584 | afterEach cancela timers/alarms/runtime messages, limpa mocks/timers Jest e runtime.lastError. | ✅ partes de timer têm testes focais; teardown completo apenas indireto |
| 585–593 | Exports expõem somente getters dos cinco mocks; classes/init não são exportados. | 🟨 dezenas de suites importam getters |
| 594 | Posição final correspondente ao newline terminal do blob. | 🟦 leitura integral do fonte |

## 15. Dependências e consumidores relevantes

### Dependências de runtime

O fixture depende apenas do ambiente Jest/Node:

- globals Jest: `jest`, `beforeEach`, `afterEach`;
- globals JS/Node: `setTimeout`, `clearTimeout`, `Promise`, `Map`, `Set`, `RegExp`;
- `global.chrome` como destino do mock.

Não há `require` de pacote npm dentro do arquivo.

### Consumidores representativos

- `tests/helpers/load-background-module.js` injeta `global.chrome` na implementação real;
- `tests/unit/background/chrome-runtime-mock-lifecycle.test.js`;
- `tests/unit/background/tab-replacement-observability.test.js`;
- `tests/unit/background/lifecycle-alarms-real.test.js`;
- `tests/unit/background/message-handlers-real.test.js`;
- `tests/unit/background/download-wait.test.js`;
- diversos testes de popup, reader, content scripts e integração localizados pela busca dos getters.

O fato de um teste importar um getter prova dependência do fixture, mas não prova todas as propriedades internas daquela API.

## 16. Invariantes e limites

1. `global.chrome` deve existir antes de módulos testados que acessam a API no import.
2. Reset não pode deixar timers que mantenham o worker Jest vivo.
3. Se listeners do runtime forem preservados, não podem ser duplicados inadvertidamente.
4. `runtime.lastError` deve ser temporário nos caminhos modelados e zerado no teardown.
5. `tabs.create` deve produzir identidade estável e evento de conclusão controlável.
6. Replacement deve migrar handlers junto com a tab.
7. Alarmes devem ser canceláveis e manualmente disparáveis para testes determinísticos.
8. `runtime.sendMessage` deve permitir resposta sync/async sem callback duplicado.
9. Ordering de download deve continuar entregando ID antes do evento complete.
10. O mock não deve ser tratado como implementação completa do Chrome; superfícies ausentes/simplificadas precisam de E2E ou contrato focal.
11. Um teste que depende de estado persistente entre casos deve tornar essa dependência explícita.
12. Esta Bíblia é válida somente para `c1d9a056b7777183bfd3f540c49811335f410425`.

## 17. Autoauditoria do AGENTE 18

- [x] reserva criada com CREATE ONLY e relida;
- [x] proprietário confirmado como AGENTE 18;
- [x] source SHA reconfirmado antes de materializar a Bíblia;
- [x] fonte integral embutida sem alteração;
- [x] 593 linhas textuais + newline = 594 posições;
- [x] mapa contíguo validado programaticamente de 1 a 594, sem gaps/overlap;
- [x] wiring de Jest e carregamento do background rastreados;
- [x] provas focais separadas de uso indireto;
- [x] lacunas de teste, isolamento e fidelidade registradas como audit_requests;
- [x] nenhum código/teste/fixture externo foi modificado.

**Resultado:** documentação individual corrigida para o blob `c1d9a056b7777183bfd3f540c49811335f410425`; 119-001, 119-002 e 119-003 estão ACCEPTED no state canônico como dívida externa não bloqueante.

> **Lifecycle pós-REAUDIT:** 119-001/002/003 permanecem tecnicamente válidas como lacunas reconhecidas, mas já foram auditadas e estão ACCEPTED; não são requests OPEN.

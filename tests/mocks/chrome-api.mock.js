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

const pendingMockTimers = new Set();

function scheduleMockTimer(callback, delay = 0) {
  const timerId = setTimeout(() => {
    pendingMockTimers.delete(timerId);
    callback();
  }, delay);
  pendingMockTimers.add(timerId);
  return timerId;
}

function clearMockTimer(timerId) {
  if (timerId === null || timerId === undefined) return;
  pendingMockTimers.delete(timerId);
  clearTimeout(timerId);
}

function clearAllMockTimers() {
  for (const timerId of Array.from(pendingMockTimers)) {
    try { clearTimeout(timerId); } catch (_error) {}
  }
  pendingMockTimers.clear();
}

// ── Storage Mock (Stateful) ────────────────────────────────────────
class ChromeStorageMock {
  constructor() {
    this._store = {};     // Estado em memória
    this._listeners = []; // onChanged listeners
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

      if (callback) scheduleMockTimer(() => callback(result), 0);
      scheduleMockTimer(() => resolve(result), 0);
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
      scheduleMockTimer(() => { if (callback) callback(); resolve(); }, 0);
    });
  }

  remove(keys, callback) {
    return new Promise((resolve) => {
      const toRemove = Array.isArray(keys) ? keys : [keys];
      toRemove.forEach(k => delete this._store[k]);
      scheduleMockTimer(() => { if (callback) callback(); resolve(); }, 0);
    });
  }

  clear(callback) {
    this._store = {};
    if (callback) scheduleMockTimer(callback, 0);
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

    scheduleMockTimer(() => {
      tab.status = 'complete';
      this._onUpdatedListeners.forEach(fn => fn(tabId, { status: 'complete' }, tab));
    }, 10);

    if (callback) scheduleMockTimer(() => callback(tab), 0);
    return Promise.resolve(tab);
  }

  get(tabId, callback) {
    const tab = this._tabs.get(tabId) || null;
    if (!tab && callback) {
      global.chrome.runtime.lastError = { message: `No tab with id: ${tabId}` };
      scheduleMockTimer(() => { callback(null); global.chrome.runtime.lastError = null; }, 0);
    } else if (callback) {
      scheduleMockTimer(() => callback(tab), 0);
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
    if (callback) scheduleMockTimer(() => { callback(); global.chrome.runtime.lastError = null; }, 0);
    return Promise.resolve();
  }

  query(queryInfo, callback) {
    let results = Array.from(this._tabs.values());
    if (queryInfo.active !== undefined) {
      results = results.filter(t => t.active === queryInfo.active);
    }
    if (callback) scheduleMockTimer(() => callback(results), 0);
    return Promise.resolve(results);
  }

  sendMessage(tabId, message, callback) {
    const handlers = this._messageHandlers.get(tabId) || [];
    if (handlers.length === 0) {
      global.chrome.runtime.lastError = { message: 'Could not establish connection.' };
      if (callback) scheduleMockTimer(() => { callback(undefined); global.chrome.runtime.lastError = null; }, 0);
      return;
    }
    handlers.forEach(handler => {
      const sendResponse = (response) => {
        if (callback) scheduleMockTimer(() => callback(response), 0);
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
    const timerId = scheduleMockTimer(() => {
      const alarm = { name, scheduledTime };
      this._alarms.delete(name);
      this._listeners.forEach(fn => fn(alarm));
    }, delayMs);
    this._alarms.set(name, { name, scheduledTime, timerId });
  }

  clear(name, callback) {
    const alarm = this._alarms.get(name);
    if (alarm) { clearMockTimer(alarm.timerId); this._alarms.delete(name); }
    if (callback) callback(!!alarm);
    return Promise.resolve(!!alarm);
  }

  clearAll(callback) {
    this._alarms.forEach(alarm => clearMockTimer(alarm.timerId));
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
      clearMockTimer(alarm.timerId);
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
  }

  sendMessage(message, callback) {
    let responded = false;
    let asyncChannelOpen = false;
    let responseTimeoutId = null;
    const sendResponse = (response) => {
      if (responseTimeoutId) {
        clearMockTimer(responseTimeoutId);
        responseTimeoutId = null;
      }
      if (!responded) {
        responded = true;
        if (callback) scheduleMockTimer(() => callback(response), 0);
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
        scheduleMockTimer(() => {
          callback(undefined);
          this.lastError = null;
        }, 0);
      } else {
        responseTimeoutId = scheduleMockTimer(() => {
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
      scheduleMockTimer(() => fn({ reason: 'install' }), 0);
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
  downloadsMock?.clearTimers();
  clearAllMockTimers();
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

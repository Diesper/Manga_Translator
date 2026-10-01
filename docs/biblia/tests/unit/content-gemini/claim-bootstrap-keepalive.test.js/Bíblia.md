# Bíblia técnica — tests/unit/content-gemini/claim-bootstrap-keepalive.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** 6e6adc2747b0974feec368fedb3652da79dc49b5  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de claim/bootstrap/keep-alive do content Gemini real  
> **Linhas textuais:** 210  
> **Posições documentais:** 211, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte valida a fronteira entre uma aba Gemini carregada e o job persistido no background. Antes de iniciar RPA, content_gemini reivindica explicitamente o job; somente um claim válido permite o job runner abrir o Port gemini-keep-alive.

O loader usado pela suíte carrega selectors, DOM, quarantine, observer, editor, attachment, temporary-chat, result-extractor, deletion, job-runner e por fim content_gemini.js reais. KEEP-02/03 atravessa o job runner real até finally/closeKeepAlive.

## 2. KEEP-01 — aba manual inerte

Sem jobId na URL e com CLAIM_GEMINI_JOB respondendo {ok:true,job:null}, processGeminiJob não abre Port, não altera o DOM e não chega a REQUEST_IMAGE_DATA. Há exatamente um claim. Isso prova a regra de não sequestrar uma aba Gemini manual.

## 3. KEEP-02/KEEP-03 — lifecycle da porta

Com URL gerenciada e claim válido, o job runner chama openKeepAlive e runtime.connect({name:'gemini-keep-alive'}). O pipeline é forçado a falhar com payload inválido; ao sair, finally chama closeKeepAlive, desconectando a porta exatamente uma vez e reportando GEMINI_ERROR.

## 4. KEEP-04 — reconexão limitada

Durante job ativo, a primeira desconexão agenda reconexão em 250 ms e abre secondPort. A desconexão da segunda porta não pode produzir terceira conexão porque keepAliveReconnectAttempted permanece verdadeiro. O teste avança mais 1000 ms e exige duas chamadas totais.

## 5. KEEP-05 — close explícito

openKeepAlive seguido imediatamente de closeKeepAlive deve resultar em uma conexão e um disconnect, sem reconexão posterior. O cenário prova estado fechado quando não existe callback de reconnect pendente.

## 6. Claim com jobId e retry

Quando a URL contém late-job e o background responde job:null nas duas primeiras tentativas, claimGeminiJob aguarda/retry e aceita o job na terceira chamada. Isso prova retry até sucesso e associação ao jobId esperado.

O título menciona 'antes de desistir', mas o caso não chega ao timeout: ele tem sucesso na terceira chamada. O caminho de timeout contínuo ainda precisa de prova específica.

## 7. Fallback legado de claim

Se sendRuntimeMessage retorna null, content_gemini marca claimUnsupported e entra em compatibilidade transitória: tenta GET_TAB_ID até cinco vezes e depois busca gemini_job_<tabId> no storage, respeitando expectedJobId. Nenhum caso focal localizado atravessa essa rota.

## 8. Keep-alive: catches e corrida de close

connectKeepAlive captura exceções de runtime.connect e retorna null; em reconnect, marca keepAliveReconnectAttempted. Além disso, um disconnect agenda callback de 250 ms que revalida keepAliveClosing/jobActive/keepAlivePort antes de reconectar. KEEP-05 fecha sem reconnect pendente; falta o caso disconnect→schedule→close antes dos 250 ms.

## 9. Cobertura externa correlata

helpers-and-regressions-real.test.js cobre o early-return de processGeminiJob para URLs presentes em deleting_urls. job-runner.test.js possui cobertura da pipeline interna com openKeepAlive/closeKeepAlive como dependências; esta suíte #175 é a que prova a integração dessas dependências com a máquina real de Port.

## 10. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob 6e6adc2747b0974feec368fedb3652da79dc49b5. Os cinco casos aparecem com ✓ em Node 20.x (109255348388) e Node 22.x (109255348406); global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 11. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| aba manual sem job fica inerte | KEEP-01 | ✅ PROVADO DIRETAMENTE |
| claim válido abre Port nomeado | KEEP-02/03 | ✅ PROVADO DIRETAMENTE |
| fim do job desconecta Port | KEEP-02/03 | ✅ PROVADO DIRETAMENTE |
| disconnect ativo reconecta uma única vez | KEEP-04 | ✅ PROVADO DIRETAMENTE |
| close explícito impede reconectar depois | KEEP-05 | ✅ PROVADO DIRETAMENTE no caso sem timer pendente |
| jobId esperado faz retry até job aparecer | último caso | ✅ PROVADO DIRETAMENTE |
| job nunca aparece até timeout → null | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| CLAIM_GEMINI_JOB indisponível → GET_TAB_ID + storage fallback | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| close entre disconnect e callback de 250 ms cancela reconnect | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| runtime.connect lança na conexão inicial/reconnect | catch real, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 12. Solicitações ao auditor

### 175-001 — TEST_REQUIRED — OPEN — HIGH

Encontrado: quando CLAIM_GEMINI_JOB é indisponível (sendRuntimeMessage retorna null), claimGeminiJob entra em fallback legado GET_TAB_ID + leitura de gemini_job_<tabId>. A suíte atual nunca retorna null no claim inicial.

Evidência ausente: CLAIM_GEMINI_JOB sem resposta, GET_TAB_ID falhando algumas vezes e depois retornando tabId, storage recebendo job compatível; exigir retorno com geminiTabId. Também provar expectedJobId divergente não aceita outro job.

Risco: compatibilidade transitória pode quebrar silenciosamente em instalações/backgrounds de versão diferente.

### 175-002 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: o caso 'retry limitado antes de desistir' obtém sucesso na terceira tentativa; não prova o timeout/desistência quando todas as respostas são {ok:true,job:null}.

Evidência ausente: fake timers ou clock controlado até timeoutMs, exigindo retorno null, número finito de claims e nenhum GET_TAB_ID fallback porque o protocolo é suportado.

Risco: loop/retry excessivo ou timeout incorreto pode passar despercebido.

### 175-003 — TEST_REQUIRED — OPEN — HIGH

Encontrado: após onDisconnect, reconnect é agendado para 250 ms. closeKeepAlive deve impedir o callback pendente de reabrir a porta, mas KEEP-05 fecha sem antes simular disconnect.

Evidência ausente: open → _simulateDisconnect → antes de 250 ms close → avançar timer; exigir uma única chamada a connect e nenhuma porta nova.

Risco: job finalizado pode reabrir keep-alive por uma corrida tardia e manter Service Worker/recursos vivos indevidamente.

### 175-004 — TEST_REQUIRED — OPEN — LOW

Encontrado: connectKeepAlive captura exceção de chrome.runtime.connect tanto na conexão inicial quanto em reconnect; nenhum caso focal força throw.

Evidência ausente: connect lançando na abertura deve retornar null sem propagar; no reconnect, uma falha deve consumir a única tentativa e não gerar loop.

Risco: mudança no catch pode propagar erro de bootstrap ou criar tempestade de reconexões.

## 13. Fonte integral auditada

```javascript
'use strict';

const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');
const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');

function setWindowLocation(pathname = '/new-chat', search = '') {
  const href = `https://gemini.test${pathname}${search}`;
  Object.defineProperty(window, 'location', {
    value: {
      pathname,
      href,
      origin: 'https://gemini.test',
      search,
    },
    configurable: true,
    writable: true,
  });
}

function createPort() {
  const disconnectListeners = [];
  const port = {
    name: 'gemini-keep-alive',
    onDisconnect: {
      addListener(fn) { disconnectListeners.push(fn); },
      removeListener(fn) {
        const index = disconnectListeners.indexOf(fn);
        if (index >= 0) disconnectListeners.splice(index, 1);
      },
    },
    disconnect: jest.fn(() => {
      disconnectListeners.slice().forEach(fn => fn(port));
    }),
    _simulateDisconnect() {
      disconnectListeners.slice().forEach(fn => fn(port));
    },
  };
  return port;
}

describe('content_gemini.js - claim bootstrap e keep-alive', () => {
  let runtime;
  let storage;
  let originalSendMessage;
  let originalConnect;
  let sentMessages;

  beforeEach(async () => {
    jest.resetModules();
    jest.useRealTimers();
    delete window.__mt_gemini_started;
    document.documentElement.innerHTML = '<head></head><body><div id="manual-sentinel">manual</div></body>';

    runtime = getRuntimeMock();
    storage = getStorageMock();
    originalSendMessage = runtime.sendMessage;
    originalConnect = runtime.connect;
    sentMessages = [];

    runtime._messageListeners = [];
    runtime._connectListeners = [];
    runtime.lastError = null;
    await storage.clear();
    setWindowLocation();
  });

  afterEach(async () => {
    runtime.sendMessage = originalSendMessage;
    runtime.connect = originalConnect;
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete window.__mt_gemini_started;
    await storage.clear();
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  function installResponder(responder) {
    runtime.sendMessage = jest.fn((message, callback) => {
      sentMessages.push(message);
      const response = responder(message);
      if (typeof callback === 'function') {
        setTimeout(() => callback(response), 0);
      }
    });
  }

  test('KEEP-01: aba Gemini manual com claim nulo fica inerte e não abre keep-alive', async () => {
    const before = document.body.innerHTML;
    const connectSpy = jest.spyOn(runtime, 'connect');

    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') return { ok: true, job: null };
      return undefined;
    });

    const mod = loadContentGeminiModule();
    await mod.processGeminiJob();

    expect(connectSpy).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe(before);
    expect(sentMessages.some(message => message.action === 'REQUEST_IMAGE_DATA')).toBe(false);
    expect(sentMessages.filter(message => message.action === 'CLAIM_GEMINI_JOB')).toHaveLength(1);
  });

  test('KEEP-02/KEEP-03: claim válido abre uma porta e o fim do job a desconecta', async () => {
    setWindowLocation('/app', '?mangatranslator=true&jobId=job-321');
    const port = createPort();
    const connectSpy = jest.spyOn(runtime, 'connect').mockImplementation(() => port);

    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') {
        return {
          ok: true,
          job: {
            jobId: 'job-321',
            batchId: 'batch-1',
            mangaTabId: 77,
            index: 5,
            prompt: 'translate',
            executionMode: 'temp_chat',
            geminiTabId: 321,
          },
        };
      }
      if (message.action === 'REQUEST_IMAGE_DATA') return { srcData: 'payload-invalido' };
      return undefined;
    });

    const mod = loadContentGeminiModule();
    await mod.processGeminiJob();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith({ name: 'gemini-keep-alive' });
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(sentMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'GEMINI_ERROR', jobId: 'job-321' }),
    ]));
  });

  test('KEEP-04: desconexão durante job ativo tenta reconectar no máximo uma vez', async () => {
    jest.useFakeTimers();
    const firstPort = createPort();
    const secondPort = createPort();
    const connectSpy = jest.spyOn(runtime, 'connect')
      .mockImplementationOnce(() => firstPort)
      .mockImplementationOnce(() => secondPort);

    const mod = loadContentGeminiModule();
    mod.openKeepAlive();
    expect(connectSpy).toHaveBeenCalledTimes(1);

    firstPort._simulateDisconnect();
    await jest.advanceTimersByTimeAsync(250);
    expect(connectSpy).toHaveBeenCalledTimes(2);

    secondPort._simulateDisconnect();
    await jest.advanceTimersByTimeAsync(1000);
    expect(connectSpy).toHaveBeenCalledTimes(2);

    mod.closeKeepAlive();
  });

  test('KEEP-05: close explícito encerra o job e não reconecta a porta', async () => {
    jest.useFakeTimers();
    const port = createPort();
    const connectSpy = jest.spyOn(runtime, 'connect').mockImplementation(() => port);

    const mod = loadContentGeminiModule();
    mod.openKeepAlive();
    mod.closeKeepAlive();

    await jest.advanceTimersByTimeAsync(1000);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });

  test('claim com jobId na URL faz retry limitado antes de desistir', async () => {
    setWindowLocation('/app', '?mangatranslator=true&jobId=late-job');

    let claimCalls = 0;
    installResponder(message => {
      if (message.action === 'CLAIM_GEMINI_JOB') {
        claimCalls += 1;
        if (claimCalls >= 3) {
          return {
            ok: true,
            job: {
              jobId: 'late-job',
              batchId: 'batch-1',
              mangaTabId: 77,
              index: 2,
              prompt: 'late',
              executionMode: 'temp_chat',
              geminiTabId: 456,
            },
          };
        }
        return { ok: true, job: null };
      }
      return undefined;
    });

    const mod = loadContentGeminiModule();
    await expect(mod.claimGeminiJob({ timeoutMs: 2500 })).resolves.toEqual(expect.objectContaining({
      jobId: 'late-job',
      geminiTabId: 456,
    }));
    expect(claimCalls).toBe(3);
  }, 5000);
});
```

## 14. Auditoria linha a linha

### Linha 001

- **Código:** `'use strict';`
- **Função:** Ativa strict mode.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 002

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 003

- **Código:** `const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa mocks de runtime/storage compartilhados.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 004

- **Código:** `const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');`
- **Função:** Importa loader que carrega todos os módulos Gemini e content_gemini.js real.
- **Contexto:** imports.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — loader carrega content_gemini.js e módulos reais.

### Linha 005

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 006

- **Código:** `function setWindowLocation(pathname = '/new-chat', search = '') {`
- **Função:** Define helper que simula pathname/search/href do Gemini para claim e bootstrap.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 007

- **Código:** `  const href = &#96;https://gemini.test${pathname}${search}&#96;;`
- **Função:** Monta URL completa coerente com pathname/query do cenário.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 008

- **Código:** `  Object.defineProperty(window, 'location', {`
- **Função:** Substitui location do JSDOM por snapshot controlado.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 009

- **Código:** `    value: {`
- **Função:** Compõe o cenário helper de localização/window, preparando ou verificando content_gemini real.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 010

- **Código:** `      pathname,`
- **Função:** Expõe pathname usado por processGeminiJob para diferenciar /app e new-chat.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 011

- **Código:** `      href,`
- **Função:** Compõe o cenário helper de localização/window, preparando ou verificando content_gemini real.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 012

- **Código:** `      origin: 'https://gemini.test',`
- **Função:** Compõe o cenário helper de localização/window, preparando ou verificando content_gemini real.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 013

- **Código:** `      search,`
- **Função:** Expõe query usada por getExpectedGeminiJobId.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 014

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 015

- **Código:** `    configurable: true,`
- **Função:** Compõe o cenário helper de localização/window, preparando ou verificando content_gemini real.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 016

- **Código:** `    writable: true,`
- **Função:** Compõe o cenário helper de localização/window, preparando ou verificando content_gemini real.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 017

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** helper de localização/window.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 018

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 019

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 020

- **Código:** `function createPort() {`
- **Função:** Cria Port simulado com listeners de disconnect e métodos de teste.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 021

- **Código:** `  const disconnectListeners = [];`
- **Função:** Mantém listeners onDisconnect registrados pelo keep-alive real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 022

- **Código:** `  const port = {`
- **Função:** Compõe o cenário mock de Port keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 023

- **Código:** `    name: 'gemini-keep-alive',`
- **Função:** Fixa o nome do Port esperado pelo background/content.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 024

- **Código:** `    onDisconnect: {`
- **Função:** Compõe o cenário mock de Port keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 025

- **Código:** `      addListener(fn) { disconnectListeners.push(fn); },`
- **Função:** Mantém listeners onDisconnect registrados pelo keep-alive real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 026

- **Código:** `      removeListener(fn) {`
- **Função:** Permite remover listener registrado.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 027

- **Código:** `        const index = disconnectListeners.indexOf(fn);`
- **Função:** Mantém listeners onDisconnect registrados pelo keep-alive real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 028

- **Código:** `        if (index >= 0) disconnectListeners.splice(index, 1);`
- **Função:** Mantém listeners onDisconnect registrados pelo keep-alive real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 029

- **Código:** `      },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 030

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 031

- **Código:** `    disconnect: jest.fn(() => {`
- **Função:** Simula close explícito do Port e dispara listeners.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 032

- **Código:** `      disconnectListeners.slice().forEach(fn => fn(port));`
- **Função:** Mantém listeners onDisconnect registrados pelo keep-alive real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 033

- **Código:** `    }),`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 034

- **Código:** `    _simulateDisconnect() {`
- **Função:** Permite simular queda externa da porta sem chamar disconnect explícito.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 035

- **Código:** `      disconnectListeners.slice().forEach(fn => fn(port));`
- **Função:** Mantém listeners onDisconnect registrados pelo keep-alive real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 036

- **Código:** `    },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 037

- **Código:** `  };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 038

- **Código:** `  return port;`
- **Função:** Compõe o cenário mock de Port keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 039

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** mock de Port keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 040

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 041

- **Código:** `describe('content_gemini.js - claim bootstrap e keep-alive', () => {`
- **Função:** Abre suíte de claim bootstrap e keep-alive do content_gemini real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 042

- **Código:** `  let runtime;`
- **Função:** Declara referência reconstruída por caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 043

- **Código:** `  let storage;`
- **Função:** Declara referência reconstruída por caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 044

- **Código:** `  let originalSendMessage;`
- **Função:** Declara referência reconstruída por caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 045

- **Código:** `  let originalConnect;`
- **Função:** Declara referência reconstruída por caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 046

- **Código:** `  let sentMessages;`
- **Função:** Declara referência reconstruída por caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 047

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 048

- **Código:** `  beforeEach(async () => {`
- **Função:** Inicia ambiente limpo: módulos, timers reais, DOM, runtime/storage e location.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 049

- **Código:** `    jest.resetModules();`
- **Função:** Força novo carregamento de content_gemini e estado interno keep-alive por caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 050

- **Código:** `    jest.useRealTimers();`
- **Função:** Usa timers reais salvo nos cenários que optam por fake timers.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 051

- **Código:** `    delete window.__mt_gemini_started;`
- **Função:** Remove sentinela global de bootstrap anterior.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 052

- **Código:** `    document.documentElement.innerHTML = '<head></head><body><div id="manual-sentinel">manual</div></body>';`
- **Função:** Mantém sentinela DOM para provar que aba manual inerte não é alterada.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 053

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 054

- **Código:** `    runtime = getRuntimeMock();`
- **Função:** Obtém runtime mock observado por sendMessage/connect.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 055

- **Código:** `    storage = getStorageMock();`
- **Função:** Obtém storage mock usado pelos módulos Gemini.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 056

- **Código:** `    originalSendMessage = runtime.sendMessage;`
- **Função:** Salva/restaura implementação original do runtime.sendMessage.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 057

- **Código:** `    originalConnect = runtime.connect;`
- **Função:** Salva/restaura runtime.connect.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 058

- **Código:** `    sentMessages = [];`
- **Função:** Coleta mensagens runtime emitidas durante o caso.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 059

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 060

- **Código:** `    runtime._messageListeners = [];`
- **Função:** Zera listeners/erro residual do runtime mock.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 061

- **Código:** `    runtime._connectListeners = [];`
- **Função:** Zera listeners/erro residual do runtime mock.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 062

- **Código:** `    runtime.lastError = null;`
- **Função:** Zera listeners/erro residual do runtime mock.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 063

- **Código:** `    await storage.clear();`
- **Função:** Limpa storage simulado entre cenários.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 064

- **Código:** `    setWindowLocation();`
- **Função:** Compõe o cenário setup/teardown, preparando ou verificando content_gemini real.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 065

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 066

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 067

- **Código:** `  afterEach(async () => {`
- **Função:** Restaura runtime/timers/spies/DOM e limpa storage.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 068

- **Código:** `    runtime.sendMessage = originalSendMessage;`
- **Função:** Salva/restaura implementação original do runtime.sendMessage.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 069

- **Código:** `    runtime.connect = originalConnect;`
- **Função:** Salva/restaura runtime.connect.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 070

- **Código:** `    jest.useRealTimers();`
- **Função:** Usa timers reais salvo nos cenários que optam por fake timers.
- **Contexto:** setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 071

- **Código:** `    jest.restoreAllMocks();`
- **Função:** Compõe o cenário estrutura final, preparando ou verificando content_gemini real.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 072

- **Código:** `    delete window.__mt_gemini_started;`
- **Função:** Remove sentinela global de bootstrap anterior.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 073

- **Código:** `    await storage.clear();`
- **Função:** Limpa storage simulado entre cenários.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 074

- **Código:** `    document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário responder de runtime, preparando ou verificando content_gemini real.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 075

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 076

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 077

- **Código:** `  function installResponder(responder) {`
- **Função:** Substitui sendMessage por responder assíncrono controlado e registra cada mensagem.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 078

- **Código:** `    runtime.sendMessage = jest.fn((message, callback) => {`
- **Função:** Compõe o cenário responder de runtime, preparando ou verificando content_gemini real.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 079

- **Código:** `      sentMessages.push(message);`
- **Função:** Registra request emitido pelo content real.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 080

- **Código:** `      const response = responder(message);`
- **Função:** Calcula resposta específica do cenário.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 081

- **Código:** `      if (typeof callback === 'function') {`
- **Função:** Compõe o cenário responder de runtime, preparando ou verificando content_gemini real.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 082

- **Código:** `        setTimeout(() => callback(response), 0);`
- **Função:** Entrega resposta assincronamente como chrome.runtime.sendMessage callback.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 083

- **Código:** `      }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 084

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 085

- **Código:** `  }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** responder de runtime.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 086

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 087

- **Código:** `  test('KEEP-01: aba Gemini manual com claim nulo fica inerte e não abre keep-alive', async () => {`
- **Função:** Declara cenário: KEEP-01 — claim nulo deixa aba inerte.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 088

- **Código:** `    const before = document.body.innerHTML;`
- **Função:** Captura DOM antes do bootstrap para provar inércia da aba manual.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 089

- **Código:** `    const connectSpy = jest.spyOn(runtime, 'connect');`
- **Função:** Espiona runtime.connect sem alterar ou substituindo o Port conforme o cenário.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 090

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 091

- **Código:** `    installResponder(message => {`
- **Função:** Compõe o cenário KEEP-01 — claim nulo deixa aba inerte, preparando ou verificando content_gemini real.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 092

- **Código:** `      if (message.action === 'CLAIM_GEMINI_JOB') return { ok: true, job: null };`
- **Função:** Observa/responde ao protocolo de reivindicação segura de job.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 093

- **Código:** `      return undefined;`
- **Função:** Compõe o cenário KEEP-01 — claim nulo deixa aba inerte, preparando ou verificando content_gemini real.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 094

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 095

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 096

- **Código:** `    const mod = loadContentGeminiModule();`
- **Função:** Carrega selectors/dom/etc. e content_gemini.js real.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — loader carrega content_gemini.js e módulos reais.

### Linha 097

- **Código:** `    await mod.processGeminiJob();`
- **Função:** Executa bootstrap/claim/runner real.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 098

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 099

- **Código:** `    expect(connectSpy).not.toHaveBeenCalled();`
- **Função:** Prova ausência do efeito indicado.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 100

- **Código:** `    expect(document.body.innerHTML).toBe(before);`
- **Função:** Prova que claim nulo não altera a aba manual.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 101

- **Código:** `    expect(sentMessages.some(message => message.action === 'REQUEST_IMAGE_DATA')).toBe(false);`
- **Função:** Detecta se o pipeline avançou até requisitar imagem.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 102

- **Código:** `    expect(sentMessages.filter(message => message.action === 'CLAIM_GEMINI_JOB')).toHaveLength(1);`
- **Função:** Observa/responde ao protocolo de reivindicação segura de job.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 103

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-01 — claim nulo deixa aba inerte.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 104

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 105

- **Código:** `  test('KEEP-02/KEEP-03: claim válido abre uma porta e o fim do job a desconecta', async () => {`
- **Função:** Declara cenário: KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 106

- **Código:** `    setWindowLocation('/app', '?mangatranslator=true&jobId=job-321');`
- **Função:** Marca URL como gerenciada pela extensão e inclui jobId esperado.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 107

- **Código:** `    const port = createPort();`
- **Função:** Cria Port observado para o fluxo keep-alive.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 108

- **Código:** `    const connectSpy = jest.spyOn(runtime, 'connect').mockImplementation(() => port);`
- **Função:** Espiona runtime.connect sem alterar ou substituindo o Port conforme o cenário.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 109

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 110

- **Código:** `    installResponder(message => {`
- **Função:** Compõe o cenário KEEP-02/03 — claim válido abre/fecha keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 111

- **Código:** `      if (message.action === 'CLAIM_GEMINI_JOB') {`
- **Função:** Observa/responde ao protocolo de reivindicação segura de job.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 112

- **Código:** `        return {`
- **Função:** Compõe o cenário KEEP-02/03 — claim válido abre/fecha keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 113

- **Código:** `          ok: true,`
- **Função:** Compõe o cenário KEEP-02/03 — claim válido abre/fecha keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 114

- **Código:** `          job: {`
- **Função:** Compõe o cenário KEEP-02/03 — claim válido abre/fecha keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 115

- **Código:** `            jobId: 'job-321',`
- **Função:** Fixa identidade do job gerenciado no sucesso.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 116

- **Código:** `            batchId: 'batch-1',`
- **Função:** Fixa lote associado ao job.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 117

- **Código:** `            mangaTabId: 77,`
- **Função:** Fixa aba leitora de origem.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 118

- **Código:** `            index: 5,`
- **Função:** Fixa índice de imagem do job.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 119

- **Código:** `            prompt: 'translate',`
- **Função:** Compõe o cenário KEEP-02/03 — claim válido abre/fecha keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 120

- **Código:** `            executionMode: 'temp_chat',`
- **Função:** Fixa modo de execução passado ao job runner.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 121

- **Código:** `            geminiTabId: 321,`
- **Função:** Fixa/observa identidade da aba Gemini reivindicada.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 122

- **Código:** `          },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 123

- **Código:** `        };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 124

- **Código:** `      }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 125

- **Código:** `      if (message.action === 'REQUEST_IMAGE_DATA') return { srcData: 'payload-invalido' };`
- **Função:** Detecta se o pipeline avançou até requisitar imagem.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 126

- **Código:** `      return undefined;`
- **Função:** Compõe o cenário KEEP-02/03 — claim válido abre/fecha keep-alive, preparando ou verificando content_gemini real.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 127

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 128

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 129

- **Código:** `    const mod = loadContentGeminiModule();`
- **Função:** Carrega selectors/dom/etc. e content_gemini.js real.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — loader carrega content_gemini.js e módulos reais.

### Linha 130

- **Código:** `    await mod.processGeminiJob();`
- **Função:** Executa bootstrap/claim/runner real.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 131

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 132

- **Código:** `    expect(connectSpy).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal do contrato de claim/keep-alive.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 133

- **Código:** `    expect(connectSpy).toHaveBeenCalledWith({ name: 'gemini-keep-alive' });`
- **Função:** Fixa o nome do Port esperado pelo background/content.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 134

- **Código:** `    expect(port.disconnect).toHaveBeenCalledTimes(1);`
- **Função:** Observa fechamento explícito da porta ao final do job.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 135

- **Código:** `    expect(sentMessages).toEqual(expect.arrayContaining([`
- **Função:** Assertion focal do contrato de claim/keep-alive.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 136

- **Código:** `      expect.objectContaining({ action: 'GEMINI_ERROR', jobId: 'job-321' }),`
- **Função:** Fixa identidade do job gerenciado no sucesso.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 137

- **Código:** `    ]));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 138

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-02/03 — claim válido abre/fecha keep-alive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 139

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 140

- **Código:** `  test('KEEP-04: desconexão durante job ativo tenta reconectar no máximo uma vez', async () => {`
- **Função:** Declara cenário: KEEP-04 — uma única reconexão.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 141

- **Código:** `    jest.useFakeTimers();`
- **Função:** Ativa relógio controlado para reconexão de 250 ms.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 142

- **Código:** `    const firstPort = createPort();`
- **Função:** Representa porta inicial que cairá durante job ativo.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 143

- **Código:** `    const secondPort = createPort();`
- **Função:** Representa única porta de reconexão permitida.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 144

- **Código:** `    const connectSpy = jest.spyOn(runtime, 'connect')`
- **Função:** Espiona runtime.connect sem alterar ou substituindo o Port conforme o cenário.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 145

- **Código:** `      .mockImplementationOnce(() => firstPort)`
- **Função:** Representa porta inicial que cairá durante job ativo.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 146

- **Código:** `      .mockImplementationOnce(() => secondPort);`
- **Função:** Representa única porta de reconexão permitida.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 147

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 148

- **Código:** `    const mod = loadContentGeminiModule();`
- **Função:** Carrega selectors/dom/etc. e content_gemini.js real.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — loader carrega content_gemini.js e módulos reais.

### Linha 149

- **Código:** `    mod.openKeepAlive();`
- **Função:** Abre keep-alive real diretamente para isolar a máquina de estados da porta.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 150

- **Código:** `    expect(connectSpy).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal do contrato de claim/keep-alive.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 151

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 152

- **Código:** `    firstPort._simulateDisconnect();`
- **Função:** Permite simular queda externa da porta sem chamar disconnect explícito.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 153

- **Código:** `    await jest.advanceTimersByTimeAsync(250);`
- **Função:** Avança exatamente o delay de reconexão configurado.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 154

- **Código:** `    expect(connectSpy).toHaveBeenCalledTimes(2);`
- **Função:** Assertion focal do contrato de claim/keep-alive.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 155

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 156

- **Código:** `    secondPort._simulateDisconnect();`
- **Função:** Permite simular queda externa da porta sem chamar disconnect explícito.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 157

- **Código:** `    await jest.advanceTimersByTimeAsync(1000);`
- **Função:** Dá tempo adicional para provar ausência de uma segunda reconexão.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 158

- **Código:** `    expect(connectSpy).toHaveBeenCalledTimes(2);`
- **Função:** Assertion focal do contrato de claim/keep-alive.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 159

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 160

- **Código:** `    mod.closeKeepAlive();`
- **Função:** Encerra explicitamente estado keep-alive e desconecta Port atual.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 161

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-04 — uma única reconexão.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 162

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 163

- **Código:** `  test('KEEP-05: close explícito encerra o job e não reconecta a porta', async () => {`
- **Função:** Declara cenário: KEEP-05 — close explícito.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 164

- **Código:** `    jest.useFakeTimers();`
- **Função:** Ativa relógio controlado para reconexão de 250 ms.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 165

- **Código:** `    const port = createPort();`
- **Função:** Cria Port observado para o fluxo keep-alive.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 166

- **Código:** `    const connectSpy = jest.spyOn(runtime, 'connect').mockImplementation(() => port);`
- **Função:** Espiona runtime.connect sem alterar ou substituindo o Port conforme o cenário.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 167

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 168

- **Código:** `    const mod = loadContentGeminiModule();`
- **Função:** Carrega selectors/dom/etc. e content_gemini.js real.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — loader carrega content_gemini.js e módulos reais.

### Linha 169

- **Código:** `    mod.openKeepAlive();`
- **Função:** Abre keep-alive real diretamente para isolar a máquina de estados da porta.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 170

- **Código:** `    mod.closeKeepAlive();`
- **Função:** Encerra explicitamente estado keep-alive e desconecta Port atual.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa API real; assertions subsequentes fixam o efeito.

### Linha 171

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 172

- **Código:** `    await jest.advanceTimersByTimeAsync(1000);`
- **Função:** Dá tempo adicional para provar ausência de uma segunda reconexão.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 173

- **Código:** `    expect(connectSpy).toHaveBeenCalledTimes(1);`
- **Função:** Assertion focal do contrato de claim/keep-alive.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 174

- **Código:** `    expect(port.disconnect).toHaveBeenCalledTimes(1);`
- **Função:** Observa fechamento explícito da porta ao final do job.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 175

- **Código:** `  });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** KEEP-05 — close explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 176

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 177

- **Código:** `  test('claim com jobId na URL faz retry limitado antes de desistir', async () => {`
- **Função:** Declara cenário: claim com jobId — retry até sucesso.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 178

- **Código:** `    setWindowLocation('/app', '?mangatranslator=true&jobId=late-job');`
- **Função:** Marca URL como gerenciada pela extensão e inclui jobId esperado.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 179

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 180

- **Código:** `    let claimCalls = 0;`
- **Função:** Declara referência reconstruída por caso.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 181

- **Código:** `    installResponder(message => {`
- **Função:** Compõe o cenário claim com jobId — retry até sucesso, preparando ou verificando content_gemini real.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 182

- **Código:** `      if (message.action === 'CLAIM_GEMINI_JOB') {`
- **Função:** Observa/responde ao protocolo de reivindicação segura de job.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 183

- **Código:** `        claimCalls += 1;`
- **Função:** Conta tentativas de CLAIM_GEMINI_JOB para provar retry.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 184

- **Código:** `        if (claimCalls >= 3) {`
- **Função:** Conta tentativas de CLAIM_GEMINI_JOB para provar retry.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 185

- **Código:** `          return {`
- **Função:** Compõe o cenário claim com jobId — retry até sucesso, preparando ou verificando content_gemini real.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 186

- **Código:** `            ok: true,`
- **Função:** Compõe o cenário claim com jobId — retry até sucesso, preparando ou verificando content_gemini real.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 187

- **Código:** `            job: {`
- **Função:** Compõe o cenário claim com jobId — retry até sucesso, preparando ou verificando content_gemini real.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 188

- **Código:** `              jobId: 'late-job',`
- **Função:** Fixa jobId esperado na URL e no job retornado.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 189

- **Código:** `              batchId: 'batch-1',`
- **Função:** Fixa lote associado ao job.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 190

- **Código:** `              mangaTabId: 77,`
- **Função:** Fixa aba leitora de origem.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 191

- **Código:** `              index: 2,`
- **Função:** Fixa índice de imagem do job.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 192

- **Código:** `              prompt: 'late',`
- **Função:** Compõe o cenário claim com jobId — retry até sucesso, preparando ou verificando content_gemini real.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 193

- **Código:** `              executionMode: 'temp_chat',`
- **Função:** Fixa modo de execução passado ao job runner.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 194

- **Código:** `              geminiTabId: 456,`
- **Função:** Fixa/observa identidade da aba Gemini reivindicada.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 195

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 196

- **Código:** `          };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 197

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 198

- **Código:** `        return { ok: true, job: null };`
- **Função:** Simula background conhecendo o protocolo mas sem job para esta aba.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 199

- **Código:** `      }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 200

- **Código:** `      return undefined;`
- **Função:** Compõe o cenário claim com jobId — retry até sucesso, preparando ou verificando content_gemini real.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 201

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 202

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 203

- **Código:** `    const mod = loadContentGeminiModule();`
- **Função:** Carrega selectors/dom/etc. e content_gemini.js real.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — loader carrega content_gemini.js e módulos reais.

### Linha 204

- **Código:** `    await expect(mod.claimGeminiJob({ timeoutMs: 2500 })).resolves.toEqual(expect.objectContaining({`
- **Função:** Executa diretamente algoritmo real de claim com timeout customizado.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 205

- **Código:** `      jobId: 'late-job',`
- **Função:** Fixa jobId esperado na URL e no job retornado.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 206

- **Código:** `      geminiTabId: 456,`
- **Função:** Fixa/observa identidade da aba Gemini reivindicada.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 207

- **Código:** `    }));`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 208

- **Código:** `    expect(claimCalls).toBe(3);`
- **Função:** Conta tentativas de CLAIM_GEMINI_JOB para provar retry.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 209

- **Código:** `  }, 5000);`
- **Função:** Compõe o cenário claim com jobId — retry até sucesso, preparando ou verificando content_gemini real.
- **Contexto:** claim com jobId — retry até sucesso.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Linha 210

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva nesta linha.

### Posição 211 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 15. Conclusão documental

Foram documentadas 210 linhas textuais e a posição 211 do newline final. A suíte prova diretamente o bootstrap seguro e a máquina de keep-alive nominal/reconnect no mesmo blob verde em Node 20/22; as quatro solicitações OPEN delimitam fallback/timeout e corridas excepcionais ainda sem caso focal.

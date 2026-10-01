# Bíblia técnica — tests/unit/background/jobs-dom-ack-staging.test.js

> **Estado documental:** ✅ AUTOAUDITORIA APROVADA PELO AGENTE 4  
> **SHA auditado:** `5db47daff53026aa778944c999d7dc922f35ecad`  
> **Agente:** AGENTE 4  
> **Tipo:** suíte Jest focal do módulo real de ACK/persistência do background  
> **Linhas textuais:** **236**  
> **Posições documentais:** **237**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte carrega diretamente `extension/background/jobs-dom-ack.js` e testa a factory `createDomAckDelivery`. O módulo é a barreira entre o background e a confirmação da página de mangá: envia `UPDATE_IMAGE`, aguarda callback/ACK, atualiza estado de persistência e, dependendo de `finalizeOnAck`, finaliza ou apenas deixa o job pronto para commit posterior.

O arquivo está no projeto Jest **background** por `tests/unit/background/**/*.test.js`. Diferentemente de um smoke com lógica copiada, aqui as decisões testadas pertencem aos bytes reais do módulo de produção.

## 2. Contrato do módulo real

`createDomAckDelivery({ updateJobState, finalizeJob, log, timeoutMs })` devolve `{deliver}`.

`deliver`:

1. marca assíncronamente `state: result_received`;
2. arma timeout (default 30 s, reduzido nos testes);
3. envia `chrome.tabs.sendMessage(mangaTabId, {action:'UPDATE_IMAGE', index, newSrc, jobId, batchId, expectAck:true})`;
4. aceita ACK comum quando não há `runtime.lastError` e `response.ok !== false`;
5. rejeita ACK explícito `ok:false`;
6. converte timeout em `ack_timeout`;
7. converte erro runtime comum no texto do erro;
8. trata “message channel closed” de forma diferente:
   - `finalizeOnAck=true` → compatibilidade `legacy_no_ack`, aceita;
   - `finalizeOnAck=false` → `ack_required_for_staging`, rejeita;
9. em sucesso, marca `dom_applied/resultPersisted`;
10. se `finalizeOnAck=true`, chama `finalizeJob(geminiTabId,mangaTabId,!ok)`;
11. resolve resumo `{ok,reason,persisted,domApplied}`.

O content script atual responde `{ok:true,persisted:true,domApplied:...}` após a Promise de persistência; falhas de persistência seguem caminho negativo. A documentação também estabelece UPDATE_IMAGE + `expectAck:true` e timeout de 30 s.

## 3. Casos cobertos diretamente

### 3.1 Staging positivo

Com `finalizeOnAck=false`, ACK `{ok:true,persisted:true,domApplied:true}`:

- resolve ok/persisted/domApplied;
- atualiza job 321 para `dom_applied`;
- marca `resultPersisted:true`;
- não finaliza o job.

### 3.2 Modo padrão/legado com ACK

Sem passar `finalizeOnAck`, o default é true e:

- ACK positivo retorna `ok:true`;
- `finalizeJob(321,77,false)` é chamado.

### 3.3 ACK negativo

Tabela cobre:

- `{ok:false, reason:'persist_failed'}` → mesmo reason;
- `{ok:false}` → `rejected_by_page`;
- staging nunca chama finalizeJob nesses casos.

### 3.4 Timeout determinístico

Com fake timers e callback ausente:

- timeoutMs=50;
- avança 51 ms;
- resolve `ok:false/reason:'ack_timeout'`;
- não finaliza staging.

### 3.5 runtime.lastError

Durante callback, `lastError.message='tab closed'`:

- resolve falha;
- preserva reason `tab closed`;
- não finaliza staging.

### 3.6 Canal fechado em staging

A string “The message channel closed before a response was received.” é reconhecida como caso legado, mas como `finalizeOnAck=false`:

- não recebe a tolerância legada;
- vira `ack_required_for_staging`;
- não finaliza.

## 4. Matriz de evidência

| Propriedade | Classificação |
|---|---|
| módulo real é carregado em isolamento | ✅ PROVADO DIRETAMENTE |
| ACK positivo em staging marca dom_applied/resultPersisted | ✅ PROVADO DIRETAMENTE |
| staging positivo não finaliza | ✅ PROVADO DIRETAMENTE |
| modo default finaliza após ACK | ✅ PROVADO DIRETAMENTE |
| ACK negativo com/sem reason | ✅ PROVADO DIRETAMENTE |
| timeout configurado | ✅ PROVADO DIRETAMENTE |
| runtime.lastError comum | ✅ PROVADO DIRETAMENTE |
| channel closed é rejeitado em staging | ✅ PROVADO DIRETAMENTE |
| payload completo enviado a chrome.tabs.sendMessage | ⚠️ SEM ASSERTION ESPECÍFICA — mocks ignoram tabId/message |
| channel closed com finalizeOnAck=true vira legacy_no_ack e sucesso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| exceção síncrona lançada por chrome.tabs.sendMessage | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| primeira transição result_received | 🟨 EXECUTADA, mas não possui assertion dedicada |
| falha/rejeição de updateJobState é tolerada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| rejeição de finalizeJob é tolerada sem rejeitar deliver | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| settled bloqueia resposta tardia/timeout após ACK | 🟨 participa do caminho, sem assertion de corrida dedicada |
| timer é limpo no settle | 🟨 participa do caminho, sem assertion direta |

## 5. Lacunas relevantes

### Payload não assertado

Todos os mocks de `sendMessage` aceitam `(_tabId, _message, callback)` e usam só o callback. Assim, uma regressão em qualquer um destes campos pode escapar desta suíte:

- `mangaTabId`;
- `action:'UPDATE_IMAGE'`;
- `index`;
- `newSrc`;
- `jobId`;
- `batchId`;
- `expectAck:true`.

### Compatibilidade legacy não fechada dos dois lados

O staging `finalizeOnAck=false` com channel closed é testado. O branch espelho `finalizeOnAck=true`, que a implementação trata como **sucesso `legacy_no_ack`**, não é testado.

### Catch síncrono não visitado

Se `chrome.tabs.sendMessage` lançar antes de registrar callback, o módulo cai no catch das linhas finais e usa message ou `send_exception`. Nenhum caso força esse branch.

### Tolerância de dependências internas

O módulo engole falhas de `updateJobState` e `finalizeJob`. Essa escolha impede que erro de bookkeeping rejeite a Promise de entrega, mas não há teste que fixe deliberadamente esse contrato.

## 6. Solicitações ao auditor

### 150-001 — ASSERTION_GAP — payload IPC

Adicionar assertion do tabId e objeto completo enviado por `chrome.tabs.sendMessage`, especialmente `expectAck:true`.

### 150-002 — TEST_REQUIRED — legacy_no_ack

Adicionar caso com “message channel closed” e `finalizeOnAck=true`, exigindo sucesso/legacy_no_ack e comportamento de finalização esperado.

### 150-003 — TEST_REQUIRED — sendMessage throw

Adicionar caso em que `chrome.tabs.sendMessage` lança sincronamente, cobrindo reason derivado da exceção e política de finalização.

### 150-004 — ROBUSTNESS_TEST — falhas de hooks

Avaliar e, se contrato intencional, testar rejeições de `updateJobState`/ `finalizeJob` para provar que são absorvidas sem Promise pendente ou falso lançamento.

## 7. Invariantes

1. Staging não pode finalizar job antes do commit posterior.
2. ACK positivo precisa marcar o estado como aplicado/persistido.
3. ACK negativo não pode ser convertido em sucesso.
4. `expectAck:true` precisa continuar no IPC UPDATE_IMAGE.
5. Timeout deve resolver a Promise e não deixá-la pendente.
6. runtime.lastError deve ser lido durante o callback Chrome.
7. “message channel closed” só é tolerado como legacy quando `finalizeOnAck=true`.
8. `settled` deve impedir dupla resolução/finalização em corridas callback/timeout.
9. Timer deve ser cancelado após settlement.
10. Esta Bíblia vale para o blob `5db47daff53026aa778944c999d7dc922f35ecad`.

## 8. Fonte integral exata

~~~javascript
'use strict';

const path = require('path');
const MODULE_PATH = path.resolve(__dirname, '../../../extension/background/jobs-dom-ack.js');

function loadModule() {
    global.self = global;
    delete global.MangaTranslatorJobsDomAck;
    jest.isolateModules(() => require(MODULE_PATH));
    return global.MangaTranslatorJobsDomAck;
}

describe('background/jobs-dom-ack durable staging', () => {
    afterEach(() => {
        jest.useRealTimers();
        delete global.MangaTranslatorJobsDomAck;
        delete global.chrome;
    });

    test('finalizeOnAck=false confirma persistência sem finalizar o job', async () => {
        const updateJobState = jest.fn().mockResolvedValue({});
        const finalizeJob = jest.fn();
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                sendMessage: jest.fn((_tabId, _message, callback) => {
                    callback({ ok: true, persisted: true, domApplied: true });
                }),
            },
        };

        const api = loadModule().createDomAckDelivery({
            updateJobState,
            finalizeJob,
            log: jest.fn(),
            timeoutMs: 100,
        });

        await expect(api.deliver({
            mangaTabId: 77,
            index: 4,
            src: 'data:image/png;base64,AA',
            jobId: 'job-4',
            batchId: 'batch-1',
            geminiTabId: 321,
            finalizeOnAck: false,
        })).resolves.toEqual(expect.objectContaining({
            ok: true,
            persisted: true,
            domApplied: true,
        }));

        expect(updateJobState).toHaveBeenCalledWith(321, expect.objectContaining({
            state: 'dom_applied',
            resultPersisted: true,
        }));
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('modo legado finalizeOnAck=true ainda finaliza após ACK', async () => {
        const finalizeJob = jest.fn().mockResolvedValue(true);
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                sendMessage: jest.fn((_tabId, _message, callback) => {
                    callback({ ok: true, persisted: true });
                }),
            },
        };

        const api = loadModule().createDomAckDelivery({
            updateJobState: jest.fn().mockResolvedValue({}),
            finalizeJob,
            log: jest.fn(),
            timeoutMs: 100,
        });

        const result = await api.deliver({
            mangaTabId: 77,
            index: 4,
            src: 'data:image/png;base64,AA',
            jobId: 'job-4',
            batchId: 'batch-1',
            geminiTabId: 321,
        });

        expect(result.ok).toBe(true);
        expect(finalizeJob).toHaveBeenCalledWith(321, 77, false);
    });

    test.each([
        [{ ok: false, reason: 'persist_failed' }, 'persist_failed'],
        [{ ok: false }, 'rejected_by_page'],
    ])('ACK negativo não finaliza em staging %#', async (ack, expectedReason) => {
        const finalizeJob = jest.fn();
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                sendMessage: jest.fn((_tabId, _message, callback) => callback(ack)),
            },
        };

        const api = loadModule().createDomAckDelivery({
            updateJobState: jest.fn().mockResolvedValue({}),
            finalizeJob,
            log: jest.fn(),
            timeoutMs: 100,
        });

        const result = await api.deliver({
            mangaTabId: 77,
            index: 4,
            src: 'data:image/png;base64,AA',
            jobId: 'job-4',
            batchId: 'batch-1',
            geminiTabId: 321,
            finalizeOnAck: false,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            reason: expectedReason,
        }));
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('timeout de ACK retorna falha e não finaliza job em staging', async () => {
        jest.useFakeTimers();
        const finalizeJob = jest.fn();
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                sendMessage: jest.fn(() => {}),
            },
        };

        const api = loadModule().createDomAckDelivery({
            updateJobState: jest.fn().mockResolvedValue({}),
            finalizeJob,
            log: jest.fn(),
            timeoutMs: 50,
        });

        const promise = api.deliver({
            mangaTabId: 77,
            index: 4,
            src: 'data:image/png;base64,AA',
            jobId: 'job-4',
            batchId: 'batch-1',
            geminiTabId: 321,
            finalizeOnAck: false,
        });

        await jest.advanceTimersByTimeAsync(51);
        await expect(promise).resolves.toEqual(expect.objectContaining({
            ok: false,
            reason: 'ack_timeout',
        }));
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('erro runtime explícito retorna falha sem contabilizar sucesso', async () => {
        const finalizeJob = jest.fn();
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                sendMessage: jest.fn((_tabId, _message, callback) => {
                    global.chrome.runtime.lastError = { message: 'tab closed' };
                    callback();
                    global.chrome.runtime.lastError = null;
                }),
            },
        };

        const api = loadModule().createDomAckDelivery({
            updateJobState: jest.fn().mockResolvedValue({}),
            finalizeJob,
            log: jest.fn(),
            timeoutMs: 100,
        });

        const result = await api.deliver({
            mangaTabId: 77,
            index: 4,
            src: 'data:image/png;base64,AA',
            jobId: 'job-4',
            batchId: 'batch-1',
            geminiTabId: 321,
            finalizeOnAck: false,
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('tab closed');
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('message channel closed não vale como ACK de persistência no staging', async () => {
        const finalizeJob = jest.fn();
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                sendMessage: jest.fn((_tabId, _message, callback) => {
                    global.chrome.runtime.lastError = {
                        message: 'The message channel closed before a response was received.',
                    };
                    callback();
                    global.chrome.runtime.lastError = null;
                }),
            },
        };

        const api = loadModule().createDomAckDelivery({
            updateJobState: jest.fn().mockResolvedValue({}),
            finalizeJob,
            log: jest.fn(),
            timeoutMs: 100,
        });

        const result = await api.deliver({
            mangaTabId: 77,
            index: 4,
            src: 'data:image/png;base64,AA',
            jobId: 'job-4',
            batchId: 'batch-1',
            geminiTabId: 321,
            finalizeOnAck: false,
        });

        expect(result).toEqual(expect.objectContaining({
            ok: false,
            reason: 'ack_required_for_staging',
        }));
        expect(finalizeJob).not.toHaveBeenCalled();
    });

});
~~~

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** <code>'use strict';</code>

**O que faz:** Ativa strict mode no arquivo de teste.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 2

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 3

**Fonte:** <code>const path = require('path');</code>

**O que faz:** Importa path para resolver o módulo real.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 4

**Fonte:** <code>const MODULE_PATH = path.resolve(__dirname, '../../../extension/background/jobs-dom-ack.js');</code>

**O que faz:** Calcula MODULE_PATH para extension/background/jobs-dom-ack.js.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 5

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 6

**Fonte:** <code>function loadModule() {</code>

**O que faz:** Declara loadModule(), helper de carregamento real.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 7

**Fonte:** <code>    global.self = global;</code>

**O que faz:** Aponta self para global para o IIFE funcionar sob Node/Jest.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 8

**Fonte:** <code>    delete global.MangaTranslatorJobsDomAck;</code>

**O que faz:** Remove namespace de carga anterior.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 9

**Fonte:** <code>    jest.isolateModules(() =&gt; require(MODULE_PATH));</code>

**O que faz:** Carrega o módulo real dentro de jest.isolateModules.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 10

**Fonte:** <code>    return global.MangaTranslatorJobsDomAck;</code>

**O que faz:** Retorna a API MangaTranslatorJobsDomAck instalada no global.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 11

**Fonte:** <code>}</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Carrega o módulo real em isolamento e expõe o namespace criado pelo IIFE. Isso evita testar uma cópia do algoritmo e reduz contaminação por cache de require.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — todos os casos chamam createDomAckDelivery do módulo real carregado por loadModule.
### Linha/posição 12

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Restaura timers reais e remove globals mutados pela suíte. Sem cleanup, fake timers ou chrome/module de um caso poderiam alterar o seguinte.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; a ausência de contaminação é necessária para estabilidade dos casos, mas não há assertion específica do cleanup.
### Linha/posição 13

**Fonte:** <code>describe('background/jobs-dom-ack durable staging', () =&gt; {</code>

**O que faz:** Abre a suíte de staging durável do ACK.

**Como e por que:** Restaura timers reais e remove globals mutados pela suíte. Sem cleanup, fake timers ou chrome/module de um caso poderiam alterar o seguinte.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; a ausência de contaminação é necessária para estabilidade dos casos, mas não há assertion específica do cleanup.
### Linha/posição 14

**Fonte:** <code>    afterEach(() =&gt; {</code>

**O que faz:** Inicia afterEach de isolamento.

**Como e por que:** Restaura timers reais e remove globals mutados pela suíte. Sem cleanup, fake timers ou chrome/module de um caso poderiam alterar o seguinte.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; a ausência de contaminação é necessária para estabilidade dos casos, mas não há assertion específica do cleanup.
### Linha/posição 15

**Fonte:** <code>        jest.useRealTimers();</code>

**O que faz:** Restaura timers reais após qualquer teste.

**Como e por que:** Restaura timers reais e remove globals mutados pela suíte. Sem cleanup, fake timers ou chrome/module de um caso poderiam alterar o seguinte.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; a ausência de contaminação é necessária para estabilidade dos casos, mas não há assertion específica do cleanup.
### Linha/posição 16

**Fonte:** <code>        delete global.MangaTranslatorJobsDomAck;</code>

**O que faz:** Remove namespace do módulo.

**Como e por que:** Restaura timers reais e remove globals mutados pela suíte. Sem cleanup, fake timers ou chrome/module de um caso poderiam alterar o seguinte.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; a ausência de contaminação é necessária para estabilidade dos casos, mas não há assertion específica do cleanup.
### Linha/posição 17

**Fonte:** <code>        delete global.chrome;</code>

**O que faz:** Remove chrome mock global.

**Como e por que:** Restaura timers reais e remove globals mutados pela suíte. Sem cleanup, fake timers ou chrome/module de um caso poderiam alterar o seguinte.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; a ausência de contaminação é necessária para estabilidade dos casos, mas não há assertion específica do cleanup.
### Linha/posição 18

**Fonte:** <code>    });</code>

**O que faz:** Fecha afterEach.

**Como e por que:** Restaura timers reais e remove globals mutados pela suíte. Sem cleanup, fake timers ou chrome/module de um caso poderiam alterar o seguinte.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; a ausência de contaminação é necessária para estabilidade dos casos, mas não há assertion específica do cleanup.
### Linha/posição 19

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 20

**Fonte:** <code>    test('finalizeOnAck=false confirma persistência sem finalizar o job', async () =&gt; {</code>

**O que faz:** Abre caso de ACK positivo em staging sem finalização.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 21

**Fonte:** <code>        const updateJobState = jest.fn().mockResolvedValue({});</code>

**O que faz:** Cria spy async updateJobState.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 22

**Fonte:** <code>        const finalizeJob = jest.fn();</code>

**O que faz:** Cria spy finalizeJob.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 23

**Fonte:** <code>        global.chrome = {</code>

**O que faz:** Instala chrome mock.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 24

**Fonte:** <code>            runtime: { lastError: null },</code>

**O que faz:** Inicializa runtime.lastError como null.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 25

**Fonte:** <code>            tabs: {</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 26

**Fonte:** <code>                sendMessage: jest.fn((_tabId, _message, callback) =&gt; {</code>

**O que faz:** Mocka tabs.sendMessage e recebe callback.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 27

**Fonte:** <code>                    callback({ ok: true, persisted: true, domApplied: true });</code>

**O que faz:** Entrega ACK positivo com persisted/domApplied verdadeiros.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 28

**Fonte:** <code>                }),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 29

**Fonte:** <code>            },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 30

**Fonte:** <code>        };</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 31

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 32

**Fonte:** <code>        const api = loadModule().createDomAckDelivery({</code>

**O que faz:** Cria API real com dependências injetadas.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 33

**Fonte:** <code>            updateJobState,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 34

**Fonte:** <code>            finalizeJob,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 35

**Fonte:** <code>            log: jest.fn(),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 36

**Fonte:** <code>            timeoutMs: 100,</code>

**O que faz:** Reduz timeout para 100 ms no teste.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 37

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 38

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 39

**Fonte:** <code>        await expect(api.deliver({</code>

**O que faz:** Invoca deliver real e começa assertion de Promise resolvida.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 40

**Fonte:** <code>            mangaTabId: 77,</code>

**O que faz:** Passa mangaTabId 77.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 41

**Fonte:** <code>            index: 4,</code>

**O que faz:** Passa index 4.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 42

**Fonte:** <code>            src: 'data:image/png;base64,AA',</code>

**O que faz:** Passa src data URL.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 43

**Fonte:** <code>            jobId: 'job-4',</code>

**O que faz:** Passa jobId job-4.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 44

**Fonte:** <code>            batchId: 'batch-1',</code>

**O que faz:** Passa batchId batch-1.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 45

**Fonte:** <code>            geminiTabId: 321,</code>

**O que faz:** Passa geminiTabId 321.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 46

**Fonte:** <code>            finalizeOnAck: false,</code>

**O que faz:** Desativa finalizeOnAck para staging.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 47

**Fonte:** <code>        })).resolves.toEqual(expect.objectContaining({</code>

**O que faz:** Exige objeto de resultado correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 48

**Fonte:** <code>            ok: true,</code>

**O que faz:** Exige ok=true.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 49

**Fonte:** <code>            persisted: true,</code>

**O que faz:** Exige persisted=true.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 50

**Fonte:** <code>            domApplied: true,</code>

**O que faz:** Exige domApplied=true.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 51

**Fonte:** <code>        }));</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 52

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 53

**Fonte:** <code>        expect(updateJobState).toHaveBeenCalledWith(321, expect.objectContaining({</code>

**O que faz:** Exige que updateJobState registre transição final do job 321.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 54

**Fonte:** <code>            state: 'dom_applied',</code>

**O que faz:** Exige state=dom_applied.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 55

**Fonte:** <code>            resultPersisted: true,</code>

**O que faz:** Exige resultPersisted=true.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 56

**Fonte:** <code>        }));</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 57

**Fonte:** <code>        expect(finalizeJob).not.toHaveBeenCalled();</code>

**O que faz:** Exige que staging não chame finalizeJob.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 58

**Fonte:** <code>    });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Modela ACK positivo em staging com finalizeOnAck=false. O objetivo é separar confirmação de persistência/DOM da finalização definitiva do job.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — resultado ok/persisted/domApplied, estado dom_applied/resultPersisted e ausência de finalizeJob possuem assertions.
### Linha/posição 59

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 60

**Fonte:** <code>    test('modo legado finalizeOnAck=true ainda finaliza após ACK', async () =&gt; {</code>

**O que faz:** Abre caso legado/default em que ACK positivo finaliza.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 61

**Fonte:** <code>        const finalizeJob = jest.fn().mockResolvedValue(true);</code>

**O que faz:** Cria finalizeJob async resolvido.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 62

**Fonte:** <code>        global.chrome = {</code>

**O que faz:** Configura a borda Chrome simulada necessária ao módulo real.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 63

**Fonte:** <code>            runtime: { lastError: null },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 64

**Fonte:** <code>            tabs: {</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 65

**Fonte:** <code>                sendMessage: jest.fn((_tabId, _message, callback) =&gt; {</code>

**O que faz:** Mocka sendMessage do caso legado.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 66

**Fonte:** <code>                    callback({ ok: true, persisted: true });</code>

**O que faz:** Retorna ACK positivo com persisted=true.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 67

**Fonte:** <code>                }),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 68

**Fonte:** <code>            },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 69

**Fonte:** <code>        };</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 70

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 71

**Fonte:** <code>        const api = loadModule().createDomAckDelivery({</code>

**O que faz:** Cria API real do caso legado.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 72

**Fonte:** <code>            updateJobState: jest.fn().mockResolvedValue({}),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 73

**Fonte:** <code>            finalizeJob,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 74

**Fonte:** <code>            log: jest.fn(),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 75

**Fonte:** <code>            timeoutMs: 100,</code>

**O que faz:** Usa timeout de 100 ms.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 76

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 77

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 78

**Fonte:** <code>        const result = await api.deliver({</code>

**O que faz:** Invoca deliver real no modo padrão.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 79

**Fonte:** <code>            mangaTabId: 77,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 80

**Fonte:** <code>            index: 4,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 81

**Fonte:** <code>            src: 'data:image/png;base64,AA',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 82

**Fonte:** <code>            jobId: 'job-4',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 83

**Fonte:** <code>            batchId: 'batch-1',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 84

**Fonte:** <code>            geminiTabId: 321,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 85

**Fonte:** <code>        });</code>

**O que faz:** Omite finalizeOnAck, portanto usa default true.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 86

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 87

**Fonte:** <code>        expect(result.ok).toBe(true);</code>

**O que faz:** Exige result.ok=true.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 88

**Fonte:** <code>        expect(finalizeJob).toHaveBeenCalledWith(321, 77, false);</code>

**O que faz:** Exige finalização do job 321 para manga tab 77 sem flag de erro.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 89

**Fonte:** <code>    });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Valida compatibilidade do modo padrão finalizeOnAck=true: ACK positivo ainda finaliza o job. Sem esse caso, uma mudança voltada a staging poderia quebrar o fluxo legado.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — result.ok e finalizeJob(321,77,false) são assertados.
### Linha/posição 90

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 91

**Fonte:** <code>    test.each([</code>

**O que faz:** Abre test.each para dois formatos de ACK negativo.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 92

**Fonte:** <code>        [{ ok: false, reason: 'persist_failed' }, 'persist_failed'],</code>

**O que faz:** Caso com reason explícito persist_failed.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 93

**Fonte:** <code>        [{ ok: false }, 'rejected_by_page'],</code>

**O que faz:** Caso sem reason, esperando fallback rejected_by_page.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 94

**Fonte:** <code>    ])('ACK negativo não finaliza em staging %#', async (ack, expectedReason) =&gt; {</code>

**O que faz:** Declara teste parametrizado e recebe ack/expectedReason.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 95

**Fonte:** <code>        const finalizeJob = jest.fn();</code>

**O que faz:** Declara a constante/fixture mostrada, usada pelo cenário corrente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 96

**Fonte:** <code>        global.chrome = {</code>

**O que faz:** Configura a borda Chrome simulada necessária ao módulo real.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 97

**Fonte:** <code>            runtime: { lastError: null },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 98

**Fonte:** <code>            tabs: {</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 99

**Fonte:** <code>                sendMessage: jest.fn((_tabId, _message, callback) =&gt; callback(ack)),</code>

**O que faz:** sendMessage devolve o ACK parametrizado.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 100

**Fonte:** <code>            },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 101

**Fonte:** <code>        };</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 102

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 103

**Fonte:** <code>        const api = loadModule().createDomAckDelivery({</code>

**O que faz:** Cria API real para o caso negativo.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 104

**Fonte:** <code>            updateJobState: jest.fn().mockResolvedValue({}),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 105

**Fonte:** <code>            finalizeJob,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 106

**Fonte:** <code>            log: jest.fn(),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 107

**Fonte:** <code>            timeoutMs: 100,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 108

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 109

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 110

**Fonte:** <code>        const result = await api.deliver({</code>

**O que faz:** Invoca deliver real.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 111

**Fonte:** <code>            mangaTabId: 77,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 112

**Fonte:** <code>            index: 4,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 113

**Fonte:** <code>            src: 'data:image/png;base64,AA',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 114

**Fonte:** <code>            jobId: 'job-4',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 115

**Fonte:** <code>            batchId: 'batch-1',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 116

**Fonte:** <code>            geminiTabId: 321,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 117

**Fonte:** <code>            finalizeOnAck: false,</code>

**O que faz:** Desativa finalização para staging.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 118

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 119

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 120

**Fonte:** <code>        expect(result).toEqual(expect.objectContaining({</code>

**O que faz:** Exige objeto de falha.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 121

**Fonte:** <code>            ok: false,</code>

**O que faz:** Exige ok=false.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 122

**Fonte:** <code>            reason: expectedReason,</code>

**O que faz:** Exige reason calculado esperado.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 123

**Fonte:** <code>        }));</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 124

**Fonte:** <code>        expect(finalizeJob).not.toHaveBeenCalled();</code>

**O que faz:** Exige ausência de finalizeJob.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 125

**Fonte:** <code>    });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Tabela dois formatos de ACK negativo e garante que staging não finalize. Parametrização reduz duplicação e fixa motivo explícito versus fallback rejected_by_page.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — ambos ACKs negativos têm reason assertado e finalizeJob proibido.
### Linha/posição 126

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 127

**Fonte:** <code>    test('timeout de ACK retorna falha e não finaliza job em staging', async () =&gt; {</code>

**O que faz:** Abre teste de timeout de ACK em staging.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 128

**Fonte:** <code>        jest.useFakeTimers();</code>

**O que faz:** Ativa fake timers Jest.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 129

**Fonte:** <code>        const finalizeJob = jest.fn();</code>

**O que faz:** Cria finalizeJob spy.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 130

**Fonte:** <code>        global.chrome = {</code>

**O que faz:** Configura a borda Chrome simulada necessária ao módulo real.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 131

**Fonte:** <code>            runtime: { lastError: null },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 132

**Fonte:** <code>            tabs: {</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 133

**Fonte:** <code>                sendMessage: jest.fn(() =&gt; {}),</code>

**O que faz:** Mocka sendMessage que deliberadamente nunca chama callback.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 134

**Fonte:** <code>            },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 135

**Fonte:** <code>        };</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 136

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 137

**Fonte:** <code>        const api = loadModule().createDomAckDelivery({</code>

**O que faz:** Cria API real para timeout.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 138

**Fonte:** <code>            updateJobState: jest.fn().mockResolvedValue({}),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 139

**Fonte:** <code>            finalizeJob,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 140

**Fonte:** <code>            log: jest.fn(),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 141

**Fonte:** <code>            timeoutMs: 50,</code>

**O que faz:** Configura timeoutMs=50.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 142

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 143

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 144

**Fonte:** <code>        const promise = api.deliver({</code>

**O que faz:** Inicia deliver e guarda Promise pendente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 145

**Fonte:** <code>            mangaTabId: 77,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 146

**Fonte:** <code>            index: 4,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 147

**Fonte:** <code>            src: 'data:image/png;base64,AA',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 148

**Fonte:** <code>            jobId: 'job-4',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 149

**Fonte:** <code>            batchId: 'batch-1',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 150

**Fonte:** <code>            geminiTabId: 321,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 151

**Fonte:** <code>            finalizeOnAck: false,</code>

**O que faz:** Mantém finalizeOnAck=false.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 152

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 153

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 154

**Fonte:** <code>        await jest.advanceTimersByTimeAsync(51);</code>

**O que faz:** Avança fake timers em 51 ms.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 155

**Fonte:** <code>        await expect(promise).resolves.toEqual(expect.objectContaining({</code>

**O que faz:** Exige que a Promise resolva em falha.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 156

**Fonte:** <code>            ok: false,</code>

**O que faz:** Exige ok=false.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 157

**Fonte:** <code>            reason: 'ack_timeout',</code>

**O que faz:** Exige reason ack_timeout.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 158

**Fonte:** <code>        }));</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 159

**Fonte:** <code>        expect(finalizeJob).not.toHaveBeenCalled();</code>

**O que faz:** Exige ausência de finalizeJob.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 160

**Fonte:** <code>    });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Usa fake timers para provar deterministamente o timeout configurável sem esperar tempo real. Isso reduz flakiness e mantém o teste rápido.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — fake timer avança além de timeoutMs e exige ack_timeout sem finalização.
### Linha/posição 161

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 162

**Fonte:** <code>    test('erro runtime explícito retorna falha sem contabilizar sucesso', async () =&gt; {</code>

**O que faz:** Abre teste de chrome.runtime.lastError explícito.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 163

**Fonte:** <code>        const finalizeJob = jest.fn();</code>

**O que faz:** Cria finalizeJob spy.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 164

**Fonte:** <code>        global.chrome = {</code>

**O que faz:** Configura a borda Chrome simulada necessária ao módulo real.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 165

**Fonte:** <code>            runtime: { lastError: null },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 166

**Fonte:** <code>            tabs: {</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 167

**Fonte:** <code>                sendMessage: jest.fn((_tabId, _message, callback) =&gt; {</code>

**O que faz:** Mocka sendMessage com manipulação de lastError dentro do callback.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 168

**Fonte:** <code>                    global.chrome.runtime.lastError = { message: 'tab closed' };</code>

**O que faz:** Define lastError tab closed no momento correto.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 169

**Fonte:** <code>                    callback();</code>

**O que faz:** Chama callback sem response.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 170

**Fonte:** <code>                    global.chrome.runtime.lastError = null;</code>

**O que faz:** Limpa lastError após callback.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 171

**Fonte:** <code>                }),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 172

**Fonte:** <code>            },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 173

**Fonte:** <code>        };</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 174

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 175

**Fonte:** <code>        const api = loadModule().createDomAckDelivery({</code>

**O que faz:** Cria API real do caso de runtime error.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 176

**Fonte:** <code>            updateJobState: jest.fn().mockResolvedValue({}),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 177

**Fonte:** <code>            finalizeJob,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 178

**Fonte:** <code>            log: jest.fn(),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 179

**Fonte:** <code>            timeoutMs: 100,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 180

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 181

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 182

**Fonte:** <code>        const result = await api.deliver({</code>

**O que faz:** Invoca deliver real.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 183

**Fonte:** <code>            mangaTabId: 77,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 184

**Fonte:** <code>            index: 4,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 185

**Fonte:** <code>            src: 'data:image/png;base64,AA',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 186

**Fonte:** <code>            jobId: 'job-4',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 187

**Fonte:** <code>            batchId: 'batch-1',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 188

**Fonte:** <code>            geminiTabId: 321,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 189

**Fonte:** <code>            finalizeOnAck: false,</code>

**O que faz:** Mantém staging sem finalização.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 190

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 191

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 192

**Fonte:** <code>        expect(result.ok).toBe(false);</code>

**O que faz:** Exige result.ok=false.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 193

**Fonte:** <code>        expect(result.reason).toBe('tab closed');</code>

**O que faz:** Exige reason exatamente tab closed.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 194

**Fonte:** <code>        expect(finalizeJob).not.toHaveBeenCalled();</code>

**O que faz:** Exige ausência de finalizeJob.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 195

**Fonte:** <code>    });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula chrome.runtime.lastError durante o callback, reproduzindo a janela correta em que Chrome expõe lastError. Isso verifica falha explícita sem contabilizar sucesso.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — lastError 'tab closed' vira falha com mesmo reason e sem finalizeJob.
### Linha/posição 196

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 197

**Fonte:** <code>    test('message channel closed não vale como ACK de persistência no staging', async () =&gt; {</code>

**O que faz:** Abre caso especial de 'message channel closed' em staging.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 198

**Fonte:** <code>        const finalizeJob = jest.fn();</code>

**O que faz:** Cria finalizeJob spy.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 199

**Fonte:** <code>        global.chrome = {</code>

**O que faz:** Configura a borda Chrome simulada necessária ao módulo real.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 200

**Fonte:** <code>            runtime: { lastError: null },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 201

**Fonte:** <code>            tabs: {</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 202

**Fonte:** <code>                sendMessage: jest.fn((_tabId, _message, callback) =&gt; {</code>

**O que faz:** Mocka sendMessage do cenário de canal fechado.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 203

**Fonte:** <code>                    global.chrome.runtime.lastError = {</code>

**O que faz:** Inicia objeto lastError.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 204

**Fonte:** <code>                        message: 'The message channel closed before a response was received.',</code>

**O que faz:** Usa a mensagem reconhecida pela regex de compatibilidade legada.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 205

**Fonte:** <code>                    };</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 206

**Fonte:** <code>                    callback();</code>

**O que faz:** Chama callback sem response.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 207

**Fonte:** <code>                    global.chrome.runtime.lastError = null;</code>

**O que faz:** Limpa lastError após callback.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 208

**Fonte:** <code>                }),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 209

**Fonte:** <code>            },</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 210

**Fonte:** <code>        };</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 211

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 212

**Fonte:** <code>        const api = loadModule().createDomAckDelivery({</code>

**O que faz:** Cria API real para o cenário.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 213

**Fonte:** <code>            updateJobState: jest.fn().mockResolvedValue({}),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 214

**Fonte:** <code>            finalizeJob,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 215

**Fonte:** <code>            log: jest.fn(),</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 216

**Fonte:** <code>            timeoutMs: 100,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 217

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 218

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 219

**Fonte:** <code>        const result = await api.deliver({</code>

**O que faz:** Invoca deliver real.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 220

**Fonte:** <code>            mangaTabId: 77,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 221

**Fonte:** <code>            index: 4,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 222

**Fonte:** <code>            src: 'data:image/png;base64,AA',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 223

**Fonte:** <code>            jobId: 'job-4',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 224

**Fonte:** <code>            batchId: 'batch-1',</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 225

**Fonte:** <code>            geminiTabId: 321,</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 226

**Fonte:** <code>            finalizeOnAck: false,</code>

**O que faz:** Desativa finalizeOnAck, forçando staging estrito.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 227

**Fonte:** <code>        });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 228

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 229

**Fonte:** <code>        expect(result).toEqual(expect.objectContaining({</code>

**O que faz:** Exige objeto de falha correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 230

**Fonte:** <code>            ok: false,</code>

**O que faz:** Exige ok=false.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 231

**Fonte:** <code>            reason: 'ack_required_for_staging',</code>

**O que faz:** Exige reason ack_required_for_staging.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 232

**Fonte:** <code>        }));</code>

**O que faz:** Executa a instrução da fixture/teste mostrada nesta linha dentro do cenário correspondente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 233

**Fonte:** <code>        expect(finalizeJob).not.toHaveBeenCalled();</code>

**O que faz:** Exige ausência de finalizeJob.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 234

**Fonte:** <code>    });</code>

**O que faz:** Fecha o bloco léxico iniciado anteriormente.

**Como e por que:** Simula a mensagem especial de canal fechado e prova que, em staging, ela não é aceita como persistência. Esse limite evita tratar ausência de ACK como confirmação.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — channel closed em staging vira ack_required_for_staging e não finaliza.
### Linha/posição 235

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa visualmente blocos lógicos e fixtures.

**Como e por que:** Fecha a suíte Jest depois dos casos.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 Estrutura Jest necessária para a suíte; sem assertion própria.
### Linha/posição 236

**Fonte:** <code>});</code>

**O que faz:** Fecha describe.

**Como e por que:** Fecha a suíte Jest depois dos casos.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** 🟨 Estrutura Jest necessária para a suíte; sem assertion própria.
### Linha/posição 237

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Representa newline final.

**Como e por que:** Preserva newline final e a identidade textual do blob.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por uma cópia local reduziria a força do teste; ignorar cleanup, callbacks ou timers controlados criaria contaminação, falso verde ou flakiness conforme o bloco.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — propriedade textual.

## 10. Análise crítica

A suíte é forte no **controle de resultados** porque carrega o módulo real, testa tanto staging quanto modo finalizador, usa fake timers para timeout e reproduz corretamente a semântica efêmera de `chrome.runtime.lastError` dentro do callback.

A maior lacuna é de **contrato de entrada/IPC**: os testes afirmam o que acontece depois do callback, mas não verificam a mensagem que causou esse callback. Isso deixa sem proteção justamente os identificadores que conectam manga tab, índice, job e batch.

A segunda lacuna é assimetria do branch legado. O código contém dois resultados para a mesma string “message channel closed”, condicionados por `finalizeOnAck`; somente o lado estrito de staging está coberto. Como compatibilidade legada costuma ser removida/refatorada ao longo do tempo, uma assertion explícita evita mudança acidental.

Por fim, o módulo opta por tolerar falhas de bookkeeping/finalize. Se isso é intencional, merece prova automatizada; se não, merece revisão de contrato. Esta Bíblia registra a lacuna sem modificar o módulo ou a suíte.

## 11. Autoauditoria — AGENTE 4

- Reserva #150 confirmada como **AGENTE 4**.
- State #150 confirmado como **IN_PROGRESS / AGENTE 4**.
- SHA reconfirmado: `5db47daff53026aa778944c999d7dc922f35ecad`.
- Módulo real `jobs-dom-ack.js`, documentação de ACK e respostas de `content_manga.js` foram investigados sem alteração.
- Fonte integral embutida exatamente.
- **237/237 posições** documentadas.
- Assertions existentes foram classificadas como prova direta apenas quando exercitam a implementação real.
- Nenhum teste/código/workflow/config externo foi alterado.
- Pendências externas serão persistidas no state.

**Conclusão documental:** a suíte fornece prova direta relevante do módulo real, com lacunas concentradas em payload IPC, compatibilidade legacy positiva e branches excepcionais.

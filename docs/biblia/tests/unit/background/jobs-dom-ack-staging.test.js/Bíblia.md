# Bíblia técnica — tests/unit/background/jobs-dom-ack-staging.test.js

> **Estado documental:** reparo corretivo local concluído; decisão distribuída final pendente  
> **SHA auditado:** `e2b86f0b991c86d2ce7bdb6ce2c4191a44bed45c`  
> **Tipo:** suíte Jest focal do protocolo real de ACK/persistência DOM  
> **Linhas textuais:** **282**  
> **Posições documentais:** **283**, contando o LF final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A suíte carrega diretamente `extension/background/jobs-dom-ack.js` e testa `createDomAckDelivery`. O módulo é a barreira entre o background e a confirmação de aplicação/persistência na página do mangá.

## 2. Contrato exercitado

`deliver` envia `UPDATE_IMAGE` para `mangaTabId`, carrega `index`, `newSrc`, `jobId`, `batchId` e `expectAck:true`, aguarda callback/timeout e converte o resultado em estado durável/finalização conforme `finalizeOnAck`.

ACK moderno só é sucesso quando `response.ok === true` **e** `response.persisted === true`. Resposta ausente ou `ok:false` sem `reason` usa o contrato canônico `ack_missing`; `ok:true` sem persistência vira `persistence_not_confirmed`.

## 3. Caso positivo de staging

Com `finalizeOnAck=false`, a suíte exige:

- destino `tabId=77`;
- payload contendo `action:'UPDATE_IMAGE'`, `index:4`, `newSrc`, `jobId:'job-4'`, `batchId:'batch-1'`, `expectAck:true`;
- ACK `{ok:true,persisted:true,domApplied:true}`;
- update de estado para `dom_applied/resultPersisted:true`;
- ausência de `finalizeJob`.

Essa assertion fecha 150-001: o teste não depende apenas de um callback artificial; ele fixa destino e identidade do IPC.

## 4. Modo legado e negativos

O modo default `finalizeOnAck=true` ainda finaliza após ACK persistente. Em staging, a tabela negativa cobre reason explícito `persist_failed` e ACK `{ok:false}` sem reason, cujo resultado esperado atual é `ack_missing`.

## 5. Timeout e erros

- Timeout sem callback → `ack_timeout`, sem finalização em staging.
- `chrome.runtime.lastError='tab closed'` → falha com o texto causal.
- `chrome.tabs.sendMessage` lançando sincronicamente → Promise resolve em `{ok:false,reason:'send-boom',persisted:false}` e não fica pendente.
- `message channel closed` em staging → `ack_required_for_staging`, sem tolerância legada.

O caso de throw síncrono fecha 150-003.

## 6. Requests superseded

150-002 e 150-004 permanecem **SUPERSEDED por 026-003**. O self-test canônico de `jobs-dom-ack` cobre compatibilidade `legacy_no_ack`, state-update/finalize failures e demais branches do módulo; esta unidade não duplica uma fila já centralizada.

## 7. Evidência executável

- `Jobs DOM ACK Selftest` run `36947199406`, job `110651903588`: self-test focal **success**.
- Na mesma revisão, projeto Jest `background` executado com `--runInBand --detectOpenHandles`: **45/45 suites, 228/228 testes**.
- O self-test canônico também fixa `ack_missing`, `persistence_not_confirmed`, falhas de update/finalize, callback tardio e compatibilidade legada.

## 8. Limites honestos

- APIs Chrome são mocks, não browser real.
- A suíte focal não pretende duplicar todos os branches do módulo já cobertos pelo self-test canônico.
- Aprovação distribuída final continua pendente; esta Bíblia registra o reparo local e a evidência correspondente.

## 9. Fonte integral exata

```js
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
        const sendMessage = jest.fn((_tabId, _message, callback) => {
            callback({ ok: true, persisted: true, domApplied: true });
        });
        global.chrome = {
            runtime: { lastError: null },
            tabs: { sendMessage },
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

        expect(sendMessage).toHaveBeenCalledWith(
            77,
            expect.objectContaining({
                action: 'UPDATE_IMAGE',
                index: 4,
                newSrc: 'data:image/png;base64,AA',
                jobId: 'job-4',
                batchId: 'batch-1',
                expectAck: true,
            }),
            expect.any(Function)
        );
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
        [{ ok: false }, 'ack_missing'],
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

    test('exceção síncrona de sendMessage resolve falha e não deixa Promise pendente', async () => {
        const finalizeJob = jest.fn();
        global.chrome = {
            runtime: { lastError: null },
            tabs: {
                sendMessage: jest.fn(() => {
                    throw new Error('send-boom');
                }),
            },
        };

        const api = loadModule().createDomAckDelivery({
            updateJobState: jest.fn().mockResolvedValue({}),
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
            ok: false,
            reason: 'send-boom',
            persisted: false,
        }));

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
```

## 10. Cobertura integral por posições

- **1–11:** strict mode, path, carregamento isolado do módulo real.
- **12–19:** suíte e cleanup global/timers.
- **20–70:** staging positivo + assertion integral do IPC.
- **71–101:** modo default/legado com ACK persistente e finalização.
- **102–137:** ACKs negativos (`persist_failed` e `ack_missing`).
- **138–172:** timeout de ACK.
- **173–207:** `runtime.lastError` explícito.
- **208–242:** exceção síncrona de `sendMessage`.
- **243–280:** channel closed rejeitado em staging.
- **281–282:** fechamento estrutural da suíte.
- **283:** posição vazia correspondente ao LF final.

**Cobertura:** 283/283 posições, contíguas, sem gap ou overlap.

## 11. Autoauditoria

- Source SHA reconfirmado: `e2b86f0b991c86d2ce7bdb6ce2c4191a44bed45c`.
- Fonte integral inserida diretamente do blob atual.
- Nenhum `.skip`, `.only`, `xit`, `xdescribe`, TODO ou FIXME usado para esconder pendência.
- 150-001 e 150-003 possuem assertions diretas na implementação real.
- Background relacionada ficou totalmente verde com detecção de handles.
- Unidade deve retornar a `READY_FOR_AUDIT`; nenhuma nota final distribuída é fabricada aqui.

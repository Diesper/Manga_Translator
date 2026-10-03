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

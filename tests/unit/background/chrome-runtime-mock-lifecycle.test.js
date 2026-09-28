const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
} = require('../../mocks/chrome-api.mock.js');

describe('Chrome API mocks: recursos assíncronos pertencem ao caso atual', () => {
    afterEach(() => {
        const runtime = getRuntimeMock();
        const tabs = getTabsMock();

        runtime._messageListeners = [];
        runtime._installedListeners = [];
        tabs._onUpdatedListeners = [];
        jest.useRealTimers();
    });

    test('descarta timeout de canal sem resposta no teardown', () => {
        jest.useFakeTimers();
        const runtime = getRuntimeMock();
        runtime._messageListeners = [() => true];
        const callback = jest.fn();

        runtime.sendMessage({ action: 'PENDING_RESPONSE' }, callback);
        expect(runtime._pendingMessageTimers.size).toBe(1);

        runtime.clearMessageTimers();
        expect(runtime._pendingMessageTimers.size).toBe(0);
        jest.advanceTimersByTime(501);
        expect(callback).not.toHaveBeenCalled();
    });

    test('descarta callbacks pendentes do storage antes que atravessem o teardown', () => {
        jest.useFakeTimers();
        const storage = getStorageMock();
        const callback = jest.fn();

        storage.get(null, callback);
        expect(storage._pendingTimers.size).toBe(2);

        storage.clearTimers();
        expect(storage._pendingTimers.size).toBe(0);
        jest.advanceTimersByTime(1);
        expect(callback).not.toHaveBeenCalled();
    });

    test('descarta onUpdated atrasado de tabs.create antes que reative listeners do background', () => {
        jest.useFakeTimers();
        const tabs = getTabsMock();
        const onUpdated = jest.fn();
        tabs.onUpdated.addListener(onUpdated);

        tabs.create({ url: 'https://example.test/page' });
        expect(tabs._pendingTimers.size).toBe(1);

        tabs.clearTimers();
        expect(tabs._pendingTimers.size).toBe(0);
        jest.advanceTimersByTime(11);
        expect(onUpdated).not.toHaveBeenCalled();

        tabs.onUpdated.removeListener(onUpdated);
    });

    test('onInstalled usa o registry do runtime e pode ser cancelado no teardown', () => {
        jest.useFakeTimers();
        const runtime = getRuntimeMock();
        const installed = jest.fn();

        runtime.onInstalled.addListener(installed);
        expect(runtime._pendingMessageTimers.size).toBe(1);

        runtime.clearMessageTimers();
        expect(runtime._pendingMessageTimers.size).toBe(0);
        jest.advanceTimersByTime(1);
        expect(installed).not.toHaveBeenCalled();

        runtime.onInstalled.removeListener(installed);
    });
});

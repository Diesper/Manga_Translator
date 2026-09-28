const { getRuntimeMock } = require('../../mocks/chrome-api.mock.js');

describe('ChromeRuntimeMock: timers de resposta pertencem ao caso atual', () => {
    afterEach(() => {
        getRuntimeMock()._messageListeners = [];
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
});

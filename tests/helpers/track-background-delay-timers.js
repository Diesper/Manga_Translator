'use strict';

// finalizeJob agenda fechamento de aba em 600 ms ou limpeza de conversa em
// 18 s. Esses timers pertencem ao contexto do caso que chamou finalizeJob.
function trackBackgroundDelayTimers() {
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const pending = new Set();

    jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay !== 600 && delay !== 18_000) {
            return realSetTimeout(callback, delay, ...args);
        }
        const timer = realSetTimeout(() => {
            pending.delete(timer);
            callback(...args);
        }, delay);
        pending.add(timer);
        return timer;
    });

    return () => {
        for (const timer of pending) realClearTimeout(timer);
        pending.clear();
    };
}

module.exports = { trackBackgroundDelayTimers };

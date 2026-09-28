'use strict';

// Recursos reais de background que usam timers deliberadamente atrasados:
// - finalizeJob: fechamento da aba em 600 ms;
// - handleMarkerAndShow: remoção do arquivo-âncora em 4 s;
// - finalizeJob: limpeza da conversa/aba em 18 s.
// Esses timers pertencem ao caso de teste que acionou o fluxo e não podem
// sobreviver ao teardown quando a suíte termina como a última de um worker.
function trackBackgroundDelayTimers() {
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const pending = new Set();

    jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay !== 600 && delay !== 4_000 && delay !== 18_000) {
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

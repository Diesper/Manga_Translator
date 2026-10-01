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
    const pending = new Map();

    jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay !== 600 && delay !== 4_000 && delay !== 18_000) {
            return realSetTimeout(callback, delay, ...args);
        }
        const timer = realSetTimeout(() => {
            pending.delete(timer);
            callback(...args);
        }, delay);
        pending.set(timer, delay);
        return timer;
    });

    const cancelTrackedBackgroundDelayTimers = () => {
        const cancelledDelays = Array.from(pending.values());
        for (const timer of pending.keys()) realClearTimeout(timer);
        pending.clear();
        return cancelledDelays;
    };

    // Expostos somente para regressões de ownership: permitem provar que o
    // recurso atrasado pertence ao caso atual sem esperar 4/18 segundos reais.
    cancelTrackedBackgroundDelayTimers.getPendingDelays = () => Array.from(pending.values());
    cancelTrackedBackgroundDelayTimers.getPendingCount = () => pending.size;

    return cancelTrackedBackgroundDelayTimers;
}

module.exports = { trackBackgroundDelayTimers };

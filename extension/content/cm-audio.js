'use strict';
(function(rootScope) {
    function createNotificationAudio({ window, sendAudioLog }) {
    let notificationAudioContext = null;
    function getNotificationAudioContext() {
        if (notificationAudioContext && notificationAudioContext.state !== 'closed') {
            return { audioCtx: notificationAudioContext, created: false };
        }
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return { audioCtx: null, created: false };
        notificationAudioContext = new AudioContextCtor();
        return { audioCtx: notificationAudioContext, created: true };
    }

    function audioErrorExtra(error) {
        return {
            errorName: error && error.name ? error.name : 'Error',
            errorMessage: error && error.message ? String(error.message).slice(0, 160) : '',
        };
    }

    function getLoggedNotificationAudioContext(trigger) {
        const result = getNotificationAudioContext();
        if (result.created) {
            sendAudioLog('info', 'AUDIO_CONTEXT_CREATED', 'Contexto de áudio criado para notificações.', {
                trigger,
                contextState: result.audioCtx.state,
            });
        }
        if (!result.audioCtx) {
            sendAudioLog('error', 'AUDIO_UNAVAILABLE', 'O navegador não disponibilizou AudioContext.', { trigger });
        }
        return result.audioCtx;
    }

    // Deve ser chamado no clique real que inicia o lote, enquanto a ativação do
    // usuário ainda é válida para a política de autoplay do navegador.
    function unlockNotificationAudio() {
        try {
            const audioCtx = getLoggedNotificationAudioContext('reader_button');
            if (!audioCtx) return;
            if (audioCtx.state === 'running') {
                sendAudioLog('success', 'AUDIO_UNLOCKED', 'Áudio já estava liberado pelo gesto do usuário.', { contextState: audioCtx.state });
            } else if (audioCtx.state === 'suspended') {
                Promise.resolve(audioCtx.resume()).then(() => {
                    if (audioCtx.state === 'running') {
                        sendAudioLog('success', 'AUDIO_UNLOCKED', 'Áudio liberado pelo gesto do usuário.', { contextState: audioCtx.state });
                    } else {
                        sendAudioLog('warn', 'AUDIO_UNLOCK_INCOMPLETE', 'A retomada terminou, mas o contexto não ficou em execução.', { contextState: audioCtx.state });
                    }
                }).catch((error) => {
                    sendAudioLog('warn', 'AUDIO_UNLOCK_FAILED', 'O navegador recusou liberar o áudio no gesto do usuário.', audioErrorExtra(error));
                });
            } else {
                sendAudioLog('warn', 'AUDIO_UNLOCK_INCOMPLETE', 'O contexto de áudio não está disponível para reprodução.', { contextState: audioCtx.state });
            }
        } catch (error) {
            sendAudioLog('error', 'AUDIO_UNLOCK_FAILED', 'Falha ao preparar o áudio de notificação.', audioErrorExtra(error));
        }
    }

    function scheduleSuccessSound(audioCtx) {
        try {
            let lastOscillator = null;
            [0, 0.18, 0.36].forEach((t, i) => {
                const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.type = 'sine'; osc.frequency.setValueAtTime([660, 880, 1100][i], audioCtx.currentTime + t);
                gain.gain.setValueAtTime(0, audioCtx.currentTime + t); gain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + t + 0.04); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.28);
                osc.start(audioCtx.currentTime + t); osc.stop(audioCtx.currentTime + t + 0.3);
                lastOscillator = osc;
            });
            if (lastOscillator) {
                lastOscillator.onended = () => {
                    sendAudioLog('success', 'AUDIO_SUCCESS_FINISHED', 'Som de conclusão terminou sem erro.', { contextState: audioCtx.state, notes: 3 });
                };
            }
            sendAudioLog('success', 'AUDIO_SUCCESS_SCHEDULED', 'Som de conclusão agendado com sucesso.', { contextState: audioCtx.state, notes: 3 });
        } catch (error) {
            sendAudioLog('error', 'AUDIO_SUCCESS_FAILED', 'Não foi possível agendar o som de conclusão.', audioErrorExtra(error));
        }
    }

    function playSuccessSound() {
        try {
            const audioCtx = getLoggedNotificationAudioContext('batch_complete');
            if (!audioCtx) return;
            if (audioCtx.state === 'running') {
                scheduleSuccessSound(audioCtx);
            } else if (audioCtx.state === 'suspended') {
                Promise.resolve(audioCtx.resume()).then(() => {
                    if (audioCtx.state === 'running') scheduleSuccessSound(audioCtx);
                    else sendAudioLog('warn', 'AUDIO_SUCCESS_SKIPPED', 'Som não foi agendado: contexto permaneceu suspenso.', { contextState: audioCtx.state });
                }).catch((error) => {
                    sendAudioLog('error', 'AUDIO_SUCCESS_FAILED', 'O navegador recusou retomar o áudio de conclusão.', audioErrorExtra(error));
                });
            } else {
                sendAudioLog('warn', 'AUDIO_SUCCESS_SKIPPED', 'Som não foi agendado: contexto indisponível.', { contextState: audioCtx.state });
            }
        } catch (error) {
            sendAudioLog('error', 'AUDIO_SUCCESS_FAILED', 'Falha inesperada ao preparar o som de conclusão.', audioErrorExtra(error));
        }
    }

        function playErrorSound() {
            try {
                const audioCtx = getLoggedNotificationAudioContext('integrated_error'); if (!audioCtx) return;
                const schedule = () => [0, 0.2].forEach((t, i) => {
                    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
                    osc.connect(gain); gain.connect(audioCtx.destination);
                    osc.type = 'sawtooth'; osc.frequency.setValueAtTime([300, 150][i], audioCtx.currentTime + t);
                    gain.gain.setValueAtTime(0, audioCtx.currentTime + t);
                    gain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + t + 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.28);
                    osc.start(audioCtx.currentTime + t); osc.stop(audioCtx.currentTime + t + 0.3);
                }); if (audioCtx.state === 'running') schedule(); else if (audioCtx.state === 'suspended') Promise.resolve(audioCtx.resume()).then(() => { if (audioCtx.state === 'running') schedule(); else sendAudioLog('warn', 'AUDIO_ERROR_SKIPPED', 'Som de erro não foi agendado: contexto permaneceu suspenso.', { contextState: audioCtx.state }); }).catch(error => sendAudioLog('warn', 'AUDIO_ERROR_FAILED', 'Não foi possível retomar o áudio de erro.', audioErrorExtra(error))); else sendAudioLog('warn', 'AUDIO_ERROR_SKIPPED', 'Som de erro não foi agendado: contexto indisponível.', { contextState: audioCtx.state });
            } catch (error) { sendAudioLog('warn', 'AUDIO_ERROR_FAILED', 'Falha ao preparar ou agendar o áudio de erro.', audioErrorExtra(error)); }
        }

    return Object.freeze({ unlockNotificationAudio, playSuccessSound, playErrorSound });
    }
    const api = Object.freeze({ createNotificationAudio });
    rootScope.MangaTranslatorAudio = api;
    if (typeof globalThis !== 'undefined') globalThis.MangaTranslatorAudio = api;
})(typeof window !== 'undefined' ? window : globalThis);

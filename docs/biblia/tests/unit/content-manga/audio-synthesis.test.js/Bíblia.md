# Bíblia técnica — `tests/unit/content-manga/audio-synthesis.test.js`

> **Schema da Bíblia:** 2
> **Índice:** 192
> **Fonte:** `tests/unit/content-manga/audio-synthesis.test.js`
> **SHA da revisão pendente:** `83326ecdb978258919a7ad39cb10b47f9ac8ecc2`
> **Posições da fonte:** 40
> **Status:** CHANGES_REQUIRED
> **Revisão:** READY_FOR_AUDIT — requer auditoria independente.

## Mudança e invariantes

O teste básico de áudio chama o controlador de produção. A função local só injeta a factory e o logger; não implementa síntese.

## Evidência e limites

A sincronização abaixo é mecânica. Não concede APPROVED nem reaproveita auditoria de outro SHA. A análise documental anterior está preservada em `.coordination/structure-review-history/192-178ad23b6ce3eb5b9ec540d664d8bc1662352691.md`. A cobertura de linhas deve receber revisão semântica independente.

## Fonte integral exata

~~~js
/**
 * audio-synthesis.test.js — STUB ORIGINAL (v3.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Versão mínima do teste de síntese de áudio.
 *
 * POR QUE ESTE ARQUIVO EXISTE JUNTO COM audio-synthesis-full.test.js?
 * Este stub cobre o caso de regressão básico: "playErrorSound não deve
 * lançar exceção quando AudioContext não está disponível". Foi o primeiro
 * teste escrito (v3.0). O arquivo full (v3.1) expande para 20+ testes,
 * mas este stub é mantido como registro histórico da cobertura mínima
 * que foi o ponto de partida.
 *
 * VEJA: audio-synthesis-full.test.js para a suíte completa.
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

require(path.join(ROOT, 'extension/content/cm-audio.js'));
function playErrorSound(factory) {
    const scope = factory ? { AudioContext: function() { return factory(); } } : window;
    globalThis.MangaTranslatorAudio.createNotificationAudio({ window: scope, sendAudioLog: jest.fn() }).playErrorSound();
}

describe('playErrorSound() — Teste Básico (stub v3.0)', () => {
    test('não lança exceção quando AudioContext falha (factory que lança)', () => {
        const failFactory = () => { throw new Error('AudioContext not allowed'); };
        expect(() => playErrorSound(failFactory)).not.toThrow();
    });

    test('não lança exceção sem factory (usa global)', () => {
        // Em ambiente Node/JSDOM sem AudioContext, deve falhar silenciosamente
        expect(() => playErrorSound()).not.toThrow();
    });
});
~~~

## Cobertura documental de linhas

- 1–40: snapshot integral da revisão acima; revisão semântica independente pendente.

/**
 * canonical-title.test.js — STUB ORIGINAL (v3.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Versão mínima do teste de canonicalTitle().
 *
 * POR QUE ESTE ARQUIVO EXISTE JUNTO COM canonical-title-full.test.js?
 * A função original em v3.0 era simples:
 *   function canonicalTitle(t) { return (t||'').replace(/^\d+\s*\|\s/,'').trim(); }
 *
 * Este stub testava apenas a regex original. O arquivo full (v3.1) testa
 * a versão com 4 regex em cascata que corrigiu BUG #12 (capítulos duplicados).
 * Manter este stub documenta o comportamento esperado MÍNIMO.
 *
 * VEJA: canonical-title-full.test.js para a suíte completa (BUG #12 Fix).
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { canonicalTitle } = require(path.join(ROOT, 'tests/helpers/extracted-functions.js'));

describe('canonicalTitle() — Teste Básico (stub v3.0)', () => {
    test('retorna string vazia para null/undefined', () => {
        expect(canonicalTitle(null)).toBe('');
        expect(canonicalTitle(undefined)).toBe('');
    });

    test('converte para lowercase', () => {
        expect(canonicalTitle('One Piece')).toBe('one piece');
    });

    test('remove espaços extras nas bordas', () => {
        expect(canonicalTitle('  Naruto  ')).toBe('naruto');
    });

    test('retorna string com no máximo 80 caracteres', () => {
        const long = 'A'.repeat(100);
        expect(canonicalTitle(long).length).toBeLessThanOrEqual(80);
    });
});

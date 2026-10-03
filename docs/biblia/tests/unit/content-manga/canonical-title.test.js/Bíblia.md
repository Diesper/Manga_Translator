# Bíblia técnica — `tests/unit/content-manga/canonical-title.test.js`

> **Schema da Bíblia:** 2
> **Índice:** 197
> **Fonte:** `tests/unit/content-manga/canonical-title.test.js`
> **SHA da revisão pendente:** `27ea51de33e3e56ed6535eae1a5dd530f8c06f67`
> **Posições da fonte:** 46
> **Status:** CHANGES_REQUIRED
> **Revisão:** READY_FOR_AUDIT — requer auditoria independente.

## Mudança e invariantes

O teste básico carrega o mesmo módulo de capítulos usado pelo manifest, sem função de normalização duplicada.

## Evidência e limites

A sincronização abaixo é mecânica. Não concede APPROVED nem reaproveita auditoria de outro SHA. A análise documental anterior está preservada em `.coordination/structure-review-history/197-b23fc11168aeabcbdcbbdcfdf01ddb0fdea25e7e.md`. A cobertura de linhas deve receber revisão semântica independente.

## Fonte integral exata

~~~js
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

require(path.join(ROOT, 'extension/content/cm-chapter.js'));
const { canonicalTitle } = globalThis.MangaTranslatorChapter;

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
~~~

## Cobertura documental de linhas

- 1–46: snapshot integral da revisão acima; revisão semântica independente pendente.

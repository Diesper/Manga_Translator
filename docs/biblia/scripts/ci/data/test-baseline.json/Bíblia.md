# Bíblia técnica — `scripts/ci/data/test-baseline.json`

> **Schema da Bíblia:** 2
> **Índice:** 70
> **Fonte:** `scripts/ci/data/test-baseline.json`
> **SHA da revisão pendente:** `0817d79101c6c3bf6f92fed5f793f0bed8746f3b`
> **Posições da fonte:** 68
> **Status:** COMPLETED
> **Revisão:** READY_FOR_AUDIT — requer auditoria independente.

## Mudança e invariantes

Referências operacionais atualizadas junto à mudança de diretórios; contratos de execução preservados.

## Evidência e limites

A sincronização abaixo é mecânica. Não concede APPROVED nem reaproveita auditoria de outro SHA. A análise documental anterior está preservada em `.coordination/structure-review-history/070-e3a7391b8faedcc4c56186dec394a61cf7c891b7.md`. A cobertura de linhas deve receber revisão semântica independente.

## Fonte integral exata

~~~js
{
  "jest": {
    "minSuites": 109,
    "minTests": 877,
    "maxSkipped": 0,
    "maxTodo": 0
  },
  "visual": {
    "minTests": 224,
    "maxSkipped": 0
  },
  "e2e": {
    "minTests": 22,
    "maxSkipped": 0,
    "maxFlaky": 0
  },
  "smoke": {
    "minFiles": 6
  },
  "coverage": {
    "minInstrumentedFiles": 57,
    "measuredBaseline": {
      "statements": 79.44,
      "branches": 71.85,
      "functions": 82.5,
      "lines": 79.44
    },
    "minimum": {
      "statements": 78,
      "branches": 71,
      "functions": 80,
      "lines": 78
    },
    "criticalMinimum": {
      "extension/background.js": {
        "statements": 55,
        "branches": 62,
        "functions": 72,
        "lines": 55
      },
      "extension/content/content_manga.js": {
        "statements": 72,
        "branches": 68,
        "functions": 71,
        "lines": 72
      },
      "extension/content/content_gemini.js": {
        "statements": 87,
        "branches": 81,
        "functions": 76,
        "lines": 87
      },
      "extension/shared/shared-ui.js": {
        "statements": 86,
        "branches": 69,
        "functions": 98,
        "lines": 86
      },
      "extension/content/gemini/job-runner.js": {
        "statements": 87,
        "branches": 64,
        "functions": 80,
        "lines": 87
      }
    }
  }
}
~~~

## Cobertura documental de linhas

- 1–68: snapshot integral da revisão acima; revisão semântica independente pendente.

# Audit results — append-only por índice

Este diretório é a fonte distribuída dos resultados de auditoria novos.

Layout:

~~~text
audit-results/
  NNN/
    primary/<resultado-unico>.json
    adversarial/<resultado-unico>.json
    reaudit/<resultado-unico>.json
~~~

Cada arquivo é imutável. Correções, retries ou nova auditoria geram outro arquivo; resultados antigos não são reescritos.

Schema:

~~~json
{
  "schema_version": 1,
  "index": 87,
  "phase": "PRIMARY",
  "auditor": "AGENTE 12",
  "file": "scripts/example.js",
  "bible": "docs/biblia/scripts/example.js/Bíblia.md",
  "source_sha": "<40-hex>",
  "verdict": "APPROVED",
  "findings": [],
  "completed_at_utc": "2026-10-01T15:00:00Z"
}
~~~

Fases válidas:

- PRIMARY
- ADVERSARIAL
- REAUDIT

Vereditos válidos:

- APPROVED
- CHANGES_REQUIRED

Regras de decisão:

- PRIMARY + ADVERSARIAL concordantes em APPROVED → APPROVED;
- PRIMARY + ADVERSARIAL concordantes em CHANGES_REQUIRED → CHANGES_REQUIRED;
- divergência → REAUDIT_REQUIRED;
- REAUDIT resolve a divergência;
- ADVERSARIAL é obrigatória para 100% dos SHAs atuais;
- REAUDIT é somente por exceção;
- PRIMARY e ADVERSARIAL devem ser independentes quando ambos registram identidade;
- REAUDIT deve ser independente dos dois anteriores.

Uma aprovação em AUDITORIA.md anterior à migração vale somente como PRIMARY legado.

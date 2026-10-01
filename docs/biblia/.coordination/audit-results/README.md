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

## Reconciliação com o estado legado

Publicar um resultado aqui **não exige** editar imediatamente `AUDITORIA.md`, `STATUS.md` ou `CHECKLIST.md`.

O caminho crítico termina quando o resultado append-only foi persistido e o lease da fase foi liberado. As projeções legadas podem ser atualizadas depois, em lote, por qualquer agente ou auditor. Isso evita um agregador único e evita serializar dezenas de auditores atrás de um mutex global.

No fechamento do PR, os dois gates precisam passar:

~~~bash
node docs/biblia/.coordination/audit-protocol.js verify
node scripts/validation/verify-bible-merge-readiness.js
~~~

## Binding de revisão documental — schema v2

Resultados novos DEVEM usar `schema_version: 2` e registrar também:

```json
"bible_sha": "<git-blob-sha de docs/biblia/<arquivo>/Bíblia.md>"
```

A unidade auditada é `SOURCE_SHA + BIBLE_SHA`. Alterar somente a Bíblia invalida PRIMARY/ADVERSARIAL/REAUDIT da revisão anterior.

Resultados históricos schema v1 permanecem válidos apenas enquanto a Bíblia for byte-a-byte igual à baseline registrada em `../audit-bible-baseline.json`. Isso preserva o trabalho em voo durante a migração sem permitir reutilização depois de uma correção documental.

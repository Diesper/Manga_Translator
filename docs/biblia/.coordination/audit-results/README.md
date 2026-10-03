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

## Binding de lifecycle — schema v3

A migração preserva resultados históricos:

- schema v1: compatibilidade condicionada à Bible baseline;
- schema v2: SOURCE_SHA + BIBLE_SHA;
- schema v3: identidade transacional completa da rodada.

Para um handoff criado **antes** de `LIFECYCLE_POLICY_EFFECTIVE_AT_UTC`, v1/v2 continuam sendo lidos pelas regras de migração já existentes.

Para qualquer `CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT` criado **depois** da ativação do lifecycle anti-loop, um resultado da rodada atual deve usar schema v3:

```json
{
  "schema_version": 3,
  "index": 87,
  "phase": "PRIMARY",
  "auditor": "AGENTE 12",
  "file": "scripts/example.js",
  "bible": "docs/biblia/scripts/example.js/Bíblia.md",
  "source_sha": "<40-hex>",
  "production_sha": "<40-hex ou null>",
  "test_sha": "<40-hex>",
  "bible_sha": "<40-hex>",
  "audit_epoch": 13,
  "handoff_id": "087-e13-...",
  "revision_id": "<64-hex SHA-256>",
  "human_approval_id": null,
  "verdict": "APPROVED",
  "findings": [],
  "completed_at_utc": "2026-10-02T07:00:00Z"
}
```

A identidade canônica passa a ser, para novas rodadas:

```text
index
+ phase
+ audit_epoch
+ handoff_id
+ production_sha
+ test_sha
+ bible_sha
+ revision_id
```

Um resultado schema v3 da rodada corrente com epoch, handoff ou revision divergentes é inválido; não é apenas ignorado.

O publicador canônico é:

```bash
npm run bible:audit:publish -- \
  --index 87 \
  --phase PRIMARY \
  --auditor "AGENTE 12" \
  --verdict APPROVED \
  --at 2026-10-02T07:00:00Z
```

Ele:

1. exige lease ativo e compatível da mesma fase/auditor/revisão;
2. exige que a fase seja a próxima fase calculada pelo pipeline;
3. monta schema v3 automaticamente quando existe handoff/epoch;
4. usa CREATE ONLY para o resultado append-only;
5. em `HUMAN_LOCKED`, exige `ALLOW_AUDIT_ONLY` válida e grava o `human_approval_id`.

Não monte manualmente um schema v3 se o publicador canônico estiver disponível.


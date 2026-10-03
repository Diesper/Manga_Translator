# Correction authorizations

Artefatos append-only emitidos somente para uma decisão distribuída final `CHANGES_REQUIRED`.

Cada token é vinculado a `index + correction_cycle + audit_epoch + handoff_id + revision_id`.
O consumo não reescreve o token: é registrado no histórico do state como `CORRECTION_TOKEN_CONSUMED`.
Token consumido, stale, duplicado ou pertencente a outra revisão é inválido.

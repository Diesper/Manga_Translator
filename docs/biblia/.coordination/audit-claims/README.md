# Audit claims — compatibilidade legada

Este diretório preserva os claims de auditoria que já estavam ativos antes da migração distribuída.

Formato legado:

~~~text
audit-claims/NNN.lock.md
~~~

Esses claims equivalem a **PRIMARY legado** e continuam sujeitos às invariantes V2 existentes.

## Novos trabalhos

Novos auditores não criam subpastas PRIMARY/ADVERSARIAL/REAUDIT aqui.

Eles usam:

~~~text
docs/biblia/.coordination/audit-leases/
  primary/NNN.lock.md
  adversarial/NNN.lock.md
  reaudit/NNN.lock.md
~~~

Isso mantém os claims já em andamento compatíveis com o validador legado e permite que o novo protocolo use leases com TTL sem depender de `PROGRESS.lock.md`.

## Regra de migração

- claim legado existente: terminar normalmente como PRIMARY;
- novo PRIMARY: usar `audit-leases/primary/`;
- ADVERSARIAL: sempre usar `audit-leases/adversarial/`;
- REAUDIT: usar `audit-leases/reaudit/` somente quando houver divergência;
- resultado de qualquer fase nova: publicar append-only em `audit-results/`;
- nunca mover ou reescrever um claim alheio apenas para convertê-lo ao formato novo.

Leia também:

- `docs/biblia/.coordination/README.md`;
- `docs/biblia/.coordination/audit-leases/README.md`;
- `docs/biblia/.coordination/audit-results/README.md`.

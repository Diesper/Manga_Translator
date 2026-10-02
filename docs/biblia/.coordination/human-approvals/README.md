# Human approvals

Aprovações humanas são append-only e devem ser criadas pelo workflow `Bible Human Approval`
no environment protegido `human-approval`.

Decisões suportadas:
- `ALLOW_ONE_CORRECTION`
- `ALLOW_AUDIT_ONLY`
- `RESET_ESCALATION`
- `PERMANENTLY_CLOSE`

`ALLOW_ONE_CORRECTION` é de uma única rodada. O consumo é registrado no state;
o artefato de aprovação original não é reescrito.

## Proteção administrativa obrigatória

O workflow usa o environment GitHub `human-approval`. Configure esse environment com **required reviewer(s) humanos** e sem bypass por agentes/apps comuns. Sem essa configuração administrativa, `workflow_dispatch` prova o caminho de criação, mas não prova sozinho que um humano revisou a decisão.

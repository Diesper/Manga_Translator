# Audit claims — auditoria paralela

Este diretório contém claims temporários de auditoria independente.

Cada claim usa:

`<ÍNDICE>.lock.md`

Exemplo:

`087.lock.md`

O claim é criado com semântica **CREATE ONLY** e existe somente enquanto um auditor está revisando um item `READY_FOR_AUDIT`.

Ele impede dois auditores de gastarem trabalho no mesmo índice, mas **não concede ownership de edição da Bíblia**.

## Regras

- somente `READY_FOR_AUDIT` pode receber claim;
- índice → no máximo 1 claim;
- auditor → no máximo 1 claim;
- claim e `.reservas/` do mesmo arquivo não podem coexistir;
- `SOURCE_SHA` precisa coincidir com `.state/<ÍNDICE>.json`;
- o auditor trabalha em modo read-only durante a análise;
- mudanças globais de conclusão exigem `../PROGRESS.lock.md`;
- após persistir e verificar o veredito, o claim deve ser removido;
- claim alheio não expira automaticamente e não pode ser roubado.

## Campos mínimos

```text
AUDITOR: AUDITOR-07
INDEX: 087
ARQUIVO: <source>
BIBLIA: <Bible path>
SOURCE_SHA: <40-hex>
CLAIMED_AT_UTC: <timestamp>
UPDATED_AT_UTC: <timestamp>
PR: #66
BRANCH: docs/project-bible
ESTADO: ACTIVE
```

Leia também `docs/biblia/.coordination/README.md`.

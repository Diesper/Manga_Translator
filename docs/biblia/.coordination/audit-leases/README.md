# Audit leases — coordenação distribuída por fase

Novos trabalhos de auditoria usam leases particionados por fase, sem `PROGRESS.lock.md`:

~~~text
audit-leases/
  primary/NNN.lock.md
  adversarial/NNN.lock.md
  reaudit/NNN.lock.md
~~~

O diretório legado `audit-claims/NNN.lock.md` permanece somente para claims PRIMARY que já estavam ativos durante a migração.

Cada lease novo deve ser criado com semântica **CREATE ONLY** e conter:

~~~text
AUDITOR: AGENTE 12
PHASE: ADVERSARIAL
INDEX: 087
ARQUIVO: <source>
BIBLIA: <Bible path>
SOURCE_SHA: <40-hex>
CLAIMED_AT_UTC: <timestamp>
UPDATED_AT_UTC: <timestamp>
LEASE_EXPIRES_AT_UTC: <timestamp futuro>
PR: #66
BRANCH: docs/project-bible
ESTADO: ACTIVE
~~~

Regras:

- no máximo um claim/lease ativo por índice;
- o lease não concede ownership editorial;
- PRIMARY, ADVERSARIAL e REAUDIT podem ser adquiridos por agentes diferentes;
- ADVERSARIAL é obrigatória para todos os SHAs;
- REAUDIT só é adquirida quando PRIMARY e ADVERSARIAL divergem;
- lease expirado não pode ser sobrescrito cegamente: reler a versão exata e usar operação condicional;
- publicar o resultado em `audit-results/` antes de remover o lease;
- nenhum lease exige lock global.

## Binding de revisão documental

Leases novos DEVEM incluir:

```text
BIBLE_SHA: <40-hex do Git blob da Bíblia atual>
```

O planner imprime `source_sha` e `bible_sha` do candidato. Um lease cujo `SOURCE_SHA` ou `BIBLE_SHA` não corresponda à versão atual é stale e não autoriza publicar resultado para a revisão nova.

Leases antigos sem `BIBLE_SHA` são aceitos somente enquanto a Bíblia coincidir com a baseline de migração.

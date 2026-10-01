# Coordenação multiagente das Bíblias

Este diretório contém mutexes temporários para recursos compartilhados e claims exclusivos de auditoria.

## Mutexes globais

- `BOOTSTRAP.lock.md`: existe apenas durante migrações estruturais exclusivas.
- `PROGRESS.lock.md`: mutex curto para `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md`, descrição do PR e infraestrutura global; **não concede ownership desses arquivos ao agente que o segura**.

Regras:

1. locks são criados com semântica **CREATE ONLY**;
2. nunca sobrescrever lock pertencente a outro agente;
3. antes de escrever recursos compartilhados, reler o branch e confirmar ownership do mutex;
4. manter `PROGRESS.lock.md` pelo menor tempo possível;
5. nunca usar force-push, reset destrutivo ou snapshot antigo para resolver concorrência;
6. `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md` e a descrição do PR são globais e não recebem proprietário permanente.

## Claims de auditoria paralela

Auditoria independente usa um mutex separado do lock de edição:

`docs/biblia/.coordination/audit-claims/<ÍNDICE>.lock.md`

Exemplo:

`docs/biblia/.coordination/audit-claims/087.lock.md`

Esse claim significa somente:

> um auditor já está revisando este índice.

Ele **não** concede autorização para editar a Bíblia, o source ou arquivos externos.

Invariantes:

- somente itens `READY_FOR_AUDIT` podem possuir audit claim;
- índice → no máximo 1 audit claim ativo;
- auditor → no máximo 1 audit claim ativo;
- audit claim e reserva de edição do mesmo arquivo não podem coexistir;
- `SOURCE_SHA` do claim deve ser idêntico ao `.state/<ÍNDICE>.json`;
- claim é **CREATE ONLY**;
- claim de outro auditor não expira automaticamente e nunca pode ser roubado;
- se o source, state ou Bíblia mudar durante a revisão, o auditor deve reler e invalidar/recomeçar a análise; não pode aprovar evidência stale;
- ao terminar, o claim deve ser removido somente depois de persistir e verificar o veredito.

Formato mínimo do claim:

```text
AUDITOR: AUDITOR-07
INDEX: 087
ARQUIVO: scripts/validation/verify-jest-worker-warning-selftest.js
BIBLIA: docs/biblia/scripts/validation/verify-jest-worker-warning-selftest.js/Bíblia.md
SOURCE_SHA: <40-hex>
CLAIMED_AT_UTC: <timestamp>
UPDATED_AT_UTC: <timestamp>
PR: #66
BRANCH: docs/project-bible
ESTADO: ACTIVE
```

## Fluxo seguro de auditoria

```text
READ LATEST
→ escolher READY_FOR_AUDIT sem claim
→ CREATE ONLY audit-claims/NNN.lock.md
→ reler claim/state/source/Bíblia
→ auditar em modo READ ONLY
→ adquirir PROGRESS.lock.md
→ reler tudo e confirmar SOURCE_SHA + claim
→ registrar veredito em AUDITORIA.md
→ atualizar somente .state/NNN.json
→ regenerar STATUS.md e CHECKLIST.md
→ verificar invariantes
→ liberar PROGRESS.lock.md
→ remover audit claim
→ reler e confirmar estado final
```

Se outro auditor ganhar o claim primeiro, escolher outro `READY_FOR_AUDIT`.

## Separação de responsabilidades

- `.reservas/...`: ownership temporário de **edição** da Bíblia/state de um arquivo.
- `.coordination/audit-claims/...`: exclusividade temporária de **auditoria read-only** de um índice.
- `.coordination/PROGRESS.lock.md`: serialização curta de **escritas globais**.

Os três mecanismos são distintos e não devem ser usados como substitutos uns dos outros.

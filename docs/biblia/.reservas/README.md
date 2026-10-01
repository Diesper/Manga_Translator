# Reservas exclusivas por arquivo

Cada Bíblia em edição ativa deve possuir exatamente uma reserva em:

`docs/biblia/.reservas/<caminho-original>.lock.md`

Cada lock identifica AGENTE, ARQUIVO, BÍBLIA, SHA_DO_FONTE_AO_RESERVAR, timestamps, PR, BRANCH e ESTADO.

## Finalidade

A reserva de `.reservas/` concede ownership temporário de **edição** para exatamente uma unidade:

`1 arquivo do corpus = 1 Bíblia + 1 .state + no máximo 1 agente editor`

Invariantes:

- arquivo → no máximo 1 proprietário de edição;
- agente → no máximo 1 arquivo em edição;
- criação de reserva é **CREATE ONLY**;
- reserva de outro agente não expira automaticamente e nunca pode ser roubada;
- `IN_PROGRESS` exige reserva correspondente;
- fora de `IN_PROGRESS`, `agent` deve ser `null`;
- arquivo `COMPLETED` não pode permanecer reservado;
- item `READY_FOR_AUDIT` não deve possuir reserva de edição.

## Auditoria não usa .reservas

Auditores independentes **não** reservam a Bíblia em `.reservas/`.

Para impedir auditorias duplicadas, usam:

`docs/biblia/.coordination/audit-claims/<ÍNDICE>.lock.md`

O audit claim não concede direito de editar a Bíblia. Se a auditoria encontrar erro documental, o veredito deve levar o item a `CHANGES_REQUIRED`; depois disso um agente editor poderá criar a reserva normal em `.reservas/`, corrigir e devolver o item a `READY_FOR_AUDIT`.

## Arquivos globais de controle — NÃO RESERVÁVEIS

Os arquivos abaixo **não pertencem a nenhum agente** e **jamais devem receber reserva/ownership em `.reservas/`**:

- `docs/biblia/STATUS.md`;
- `docs/biblia/CHECKLIST.md`;
- `docs/biblia/AUDITORIA.md`;
- corpo do PR #66.

Eles são estado compartilhado. Para alterá-los, adquirir temporariamente `docs/biblia/.coordination/PROGRESS.lock.md`, reler o HEAD, aplicar o menor delta válido, verificar e liberar o mutex.

Ter `PROGRESS.lock.md` não transforma o agente em proprietário dos arquivos globais.

# Reservas exclusivas por arquivo

Cada Bíblia em andamento deve possuir exatamente uma reserva em:

`docs/biblia/.reservas/<caminho-original>.lock.md`

Cada lock identifica AGENTE, ARQUIVO, BÍBLIA, SHA_DO_FONTE_AO_RESERVAR, timestamps, PR, BRANCH e ESTADO.


## Arquivos globais de controle — NÃO RESERVÁVEIS

Os arquivos abaixo **não pertencem a nenhum agente** e **jamais devem receber reserva/ownership em `.reservas/`**:

- `docs/biblia/STATUS.md`;
- `docs/biblia/CHECKLIST.md`;
- `docs/biblia/AUDITORIA.md`;
- corpo do PR #66.

Eles são estado compartilhado do projeto. Quando um agente precisar alterá-los, deve apenas adquirir temporariamente `docs/biblia/.coordination/PROGRESS.lock.md`, reler o estado mais recente, aplicar o menor delta necessário e liberar o mutex. **Ter o PROGRESS.lock não transforma o agente em dono de STATUS.md, CHECKLIST.md, AUDITORIA.md ou do PR.**

Invariantes:
- arquivo → no máximo 1 proprietário;
- agente → no máximo 1 arquivo;
- criação de reserva é CREATE ONLY;
- reserva de outro agente não expira automaticamente e nunca pode ser roubada;
- arquivo CONCLUÍDO não pode permanecer reservado.

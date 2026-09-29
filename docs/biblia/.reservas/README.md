# Reservas exclusivas por arquivo

Cada Bíblia em andamento deve possuir exatamente uma reserva em:

`docs/biblia/.reservas/<caminho-original>.lock.md`

Cada lock identifica AGENTE, ARQUIVO, BÍBLIA, SHA_DO_FONTE_AO_RESERVAR, timestamps, PR, BRANCH e ESTADO.

Invariantes:
- arquivo → no máximo 1 proprietário;
- agente → no máximo 1 arquivo;
- criação de reserva é CREATE ONLY;
- reserva de outro agente não expira automaticamente e nunca pode ser roubada;
- arquivo CONCLUÍDO não pode permanecer reservado.

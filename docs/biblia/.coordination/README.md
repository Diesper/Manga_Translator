# Coordenação multiagente das Bíblias

Este diretório contém locks temporários usados para serializar alterações compartilhadas.

- `BOOTSTRAP.lock.md`: existe apenas durante migrações estruturais exclusivas.
- `PROGRESS.lock.md`: mutex curto para STATUS.md, CHECKLIST.md, AUDITORIA.md, descrição do PR e infraestrutura global.

Regras:
1. locks são criados com semântica CREATE ONLY;
2. nunca sobrescrever lock pertencente a outro agente;
3. antes de escrever recursos compartilhados, reler o branch e confirmar ownership;
4. manter PROGRESS.lock.md pelo menor tempo possível;
5. nunca usar force-push para resolver concorrência.

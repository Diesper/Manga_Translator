# Audit claims — fases independentes com leases

Este diretório impede trabalho duplicado **por índice**, sem lock global.

## Layout novo

~~~text
audit-claims/
  primary/NNN.lock.md
  adversarial/NNN.lock.md
  reaudit/NNN.lock.md
~~~

Claims planos NNN.lock.md são compatibilidade temporária e equivalem a PRIMARY legado.

## Regras

- PRIMARY normalmente opera em READY_FOR_AUDIT;
- ADVERSARIAL é obrigatória para 100% e pode revisar READY_FOR_AUDIT ou COMPLETED legado ainda sem adversarial;
- REAUDIT existe somente para divergência PRIMARY × ADVERSARIAL;
- índice → no máximo um claim ativo;
- auditor → no máximo um claim ativo no modo estrito;
- claim e reserva editorial do mesmo arquivo não coexistem;
- SOURCE_SHA, ARQUIVO, BIBLIA e INDEX precisam coincidir com o state;
- claim novo deve declarar PHASE e LEASE_EXPIRES_AT_UTC;
- criação inicial é CREATE ONLY;
- lease expirado só pode ser recuperado depois de reler a versão exata e aplicar operação condicional; nunca por overwrite cego;
- claim não concede permissão para editar a Bíblia ou o source;
- nenhum claim exige PROGRESS.lock.md.

## Relação com shards

Os 80 shards virtuais são somente uma estratégia distribuída de descoberta de trabalho. Eles **não têm lock próprio** e não criam ownership.

O auditor prioriza seu shard, pode fazer work stealing e, antes de trabalhar, ainda precisa adquirir o claim/lease CREATE ONLY do índice/fase. Portanto dois agentes podem enxergar a mesma Bíblia como candidata, mas apenas um consegue reservar a unidade de trabalho.

## Campos mínimos

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

Ao terminar a análise, o auditor publica um resultado append-only em audit-results/ e remove o claim. A decisão da Bíblia é calculada deterministicamente a partir dos resultados.

# Conclusão permanente e trabalho autorizado

Esta política foi implementada por instrução direta do humano no PR 66.

- Uma unidade que já atingiu COMPLETED conserva esse status e sua data de conclusão. O campo review_status descreve revisões pendentes e completion_quality mostra VERIFIED ou WITH_CAVEATS; nenhum deles reabre a conclusão.
- Agentes priorizam as unidades abertas. Uma unidade concluída exige uma ordem humana direta por unidade e revisão, emitida no workflow Bible Human Approval com ALLOW_COMPLETED_WORK, ambiente protegido e motivo obrigatório. A ordem expira em até 24 horas, permite um ciclo de revisão e não autoriza autoauditoria pelo aprovador.
- Transições, publicação de auditoria, claims, leases, reconciliação e diferenças protegidas aplicam a mesma restrição. Diferença de SHA em COMPLETED gera ressalva; não autoriza o agente a editar ou reauditar.
- Para unidades abertas com decisão final CHANGES_REQUIRED, START_CORRECTION pode omitir token_id: o workflow canônico emite o token automaticamente para o próprio actor, usando o mesmo CAS, e o consome na mesma execução. Essa automação não contorna a proteção de COMPLETED: uma unidade já concluída continua exigindo ALLOW_COMPLETED_WORK humano válido antes da emissão/transição, e seu campo status permanece COMPLETED; apenas review_status representa o trabalho autorizado em andamento.
- WAITING_ADVERSARIAL e REAUDIT_REQUIRED são etapas públicas derivadas do pipeline. O auditor corrige o vínculo com npm run bible:audit:repair-sha -- --index N, após liberar qualquer reserva ou lease ativa. A etapa permanece visível, mas o pipeline exige evidências independentes da revisão atual antes de conceder aprovação. SHA antigo nunca vale como prova da revisão nova.
- A migração preserva eventos anteriores, resultados imutáveis e propriedade das reservas; acrescenta eventos encadeados. Não cria aprovação humana nem auditoria fictícia.

## Estrutura operacional

scripts/bible/core contém regras, scripts/bible/storage contém Git e persistência, scripts/bible/commands contém os comandos. Os testes de infraestrutura estão em tests/infra/bible. docs/biblia/.coordination conserva dados e documentação.

As escritas usam lock exclusivo por unidade, CAS, arquivo temporário com fsync e substituição atômica. Um journal registra intenção e resultado; falhas parciais bloqueiam o gate para recuperação explícita. O journal não promete atomicidade simultânea de vários arquivos.

O gate final continua exigindo evidência válida e atual, mesmo quando todas as unidades aparecem como COMPLETED. Uma conclusão com ressalvas impede a aprovação final.

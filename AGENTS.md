# Regras para agentes neste repositório

A política de auditoria vigente está em [docs/biblia/.coordination/COMPLETION_POLICY.md](docs/biblia/.coordination/COMPLETION_POLICY.md).

- Priorize as unidades ainda abertas. Consulte a fila canônica e o estado atual antes de reservar ou iniciar trabalho.
- Um arquivo que já atingiu COMPLETED não pode regredir de status. Isso inclui conclusão registrada no histórico, mesmo quando review_status contém uma pendência.
- Não edite, audite, publique resultados, reserve, modifique ou reavalie uma unidade concluída por iniciativa automática. Trabalho posterior exige ordem humana direta para aquela unidade e revisão, representada por ALLOW_COMPLETED_WORK válido no registro de aprovações do workflow protegido. Não fabrique aprovações, proveniência ou evidências.
- Ressalvas de qualidade e revisão são separadas do status COMPLETED. Elas não autorizam reabertura nem reaproveitamento de auditoria antiga para aprovar um SHA novo.
- Nas unidades abertas, diferenças de SHA não devem apagar a etapa pública WAITING_ADVERSARIAL/REAUDIT_REQUIRED. Use npm run bible:audit:repair-sha -- --index N após liberar sua reserva/lease; não remova a reserva de outro proprietário. O pipeline ainda exige provas atuais e independentes.
- Use os comandos canônicos em scripts/bible/commands e scripts npm para transições. Preserve CAS, locks por unidade, histórico encadeado, artefatos imutáveis e journals. Não reescreva eventos nem force-push para superar concorrência.
- Valide a mudança com os gates pertinentes. COMPLETED com ressalvas não equivale à aprovação final do PR.

A instalação inicial desta política no PR 66 foi solicitada diretamente pelo humano; essa instalação não constitui uma autorização geral para trabalho automático futuro em arquivos concluídos.

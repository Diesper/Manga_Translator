# Cobertura de testes da revisão funcional 2

Este documento descreve a suíte alinhada à extensão que foi validada manualmente. A revisão remove expectativas que pertenciam à reescrita descartada e acrescenta testes para os comportamentos que corrigiram o fluxo real do Gemini.

## Matriz das novas coberturas

| Área | Risco coberto | Evidência exigida pelo teste |
|---|---|---|
| Extração autenticada | `googleusercontent.com/gg-dl` falhar em conversa temporária ou janela minimizada por falta de cookie | Nos três modos, canvas falha e o próximo pedido contém `geminiSession: true`; o bridge da página só executa depois de a sessão falhar |
| Prazo do job | O watchdog consumir o tempo de preparação e expirar durante a geração | O evento `generation_started` envia uma única ação `REFRESH_JOB_WATCHDOG`; a resposta só é sucesso com `ok: true` e `refreshed: true` |
| Ordem do timeout | Abas auxiliares serem removidas antes de `finalizeJob` concluir | A limpeza fica bloqueada enquanto a Promise de finalização está pendente e remove somente as abas do job correto depois dela |
| Propriedade da resposta | Capturar a imagem enviada pelo usuário ou uma imagem órfã da página | Turno do usuário é rejeitado; resposta estrita em Shadow DOM é aceita; asset `gg-dl` órfão exige evidência anterior de geração |
| Quarentena estrutural | Preview reconstruído ou escolha manual devolver o anexo | Composer, turno do usuário e attachment preview, inclusive em Shadow DOM, são rejeitados pela detecção automática e manual |
| Quarentena exata | Gemini devolver os mesmos bytes da entrada sob outra data URL/MIME | SHA-256 é calculado sobre bytes; igualdade bloqueia `GEMINI_IMAGE_EXTRACTED` e diferença permite a entrega |
| Similaridade visual | Uma tradução legítima ser recusada por preservar a arte | Resultado perceptualmente semelhante, mas com bytes diferentes, permanece liberado; a métrica é só telemetria |
| Anexo | Considerar um container vazio ou preview ainda carregando como upload concluído | Preview precisa de imagem com URL, `complete`, dimensões naturais e ausência de spinner; sinal parcial interrompe novos disparos |
| Editor hidratado | Tentar anexar em um nó desconectado ou invisível | Fixtures de integração expõem um editor visível e estável, reproduzindo a pré-condição do runner |
| Exclusão segura | Declarar sucesso apenas porque o botão de confirmação foi clicado | O teste exige mudança do ID na URL e desaparecimento do link da sidebar; repetição confirmada é idempotente |
| Conclusão do lote | Tocar som de sucesso quando parte das imagens falhou | `completedJobs < totalJobs` produz `hasErrors: true`; a aba de mangá suprime o som e mostra conclusão com erros |

## Testes removidos ou restaurados

O teste de `FORCE_ATTACHMENT_ACTIVATION` foi removido porque essa ação fazia parte da estratégia de focar e restaurar janelas da reescrita descartada. A versão validada mantém o contexto físico do usuário durante o upload.

Os testes alterados somente para exigir `failedJobs`, Observer V3, ativação forçada e tentativas de anexo da reescrita foram restaurados ao contrato compatível com a extensão publicada. Onde a revisão funcional acrescentou uma garantia real, o teste foi atualizado em vez de restaurado.

## Execução

As suítes não foram executadas localmente nesta revisão, conforme solicitado. O GitHub Actions executa a matriz oficial em Node.js 20 e 22 após o push do commit. Verificações locais ficam limitadas a sintaxe JavaScript, integridade do diff, carga do manifest e sincronização de versão.

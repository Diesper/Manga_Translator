# Manga Translator — documentação da versão funcional

Identificação: MT-UNICO-01, revisão 2. Atualização: 27/09/2026. Pasta: `extension/`.

**Estado: aprovado pelo usuário e sustentado pelos logs manuais da revisão 2.** Foram concluídos quatro lotes com 21 imagens: sete temporárias, sete minimizadas e sete normais. Nenhum teste automatizado foi executado pelo agente. Esta atualização modifica documentação e metadados; preserva o código que foi aprovado.

## 1. Qual pasta utilizar

<code>extension/</code> contém a extensão completa para carregar ou recarregar no navegador. Esta publicação incorpora a cópia MT-UNICO-01, revisão funcional 2, aprovada manualmente pelo mantenedor. O identificador da revisão não altera a versão de produto 6.5.0.

Após atualizar o código, recarregue a extensão e reabra também mangá/Gemini, para substituir scripts já presentes nas páginas. Configurações e cache existentes permanecem.

## 2. Fluxo atual

1. A página do mangá consulta o cache e organiza as imagens que precisam passar pelo Gemini.
2. O background cria a tarefa e sua aba/janela, registra a identidade e arma o watchdog global de cinco minutos.
3. O script Gemini reivindica a tarefa correspondente e prepara a conversa conforme o modo.
4. Espera um editor editável, conectado e estável. As referências de editor/composer são renovadas entre métodos de upload.
5. Tenta anexar por input de arquivo, drop e paste, em sequência. Um sinal de anexo interrompe novas tentativas; somente a confirmação da preview carregada libera o prompt.
6. O envio é confirmado por uma transição observável da interface. O observer rejeita anexos/mensagens do usuário e procura um resultado ligado a nova autoria de modelo.
7. Ao observar início de geração, solicita uma renovação do watchdog; o background confere tarefa e aba dona antes de rearmá-lo.
8. Extrai a imagem. Assets gerados reconhecidos do Google usam canvas, SW autenticado e fetch pela página como último recurso, nessa ordem.
9. Nos modos normal/minimizado, aguarda exclusão da conversa ou registra a recuperação pendente antes da entrega final conforme o controlador existente.
10. O resultado é entregue à página para aplicação/persistência. A finalização e o encerramento do lote seguem as confirmações existentes; sucesso de lote exige que o total concluído corresponda ao total esperado.

Um resultado servido pelo cache não percorre todas essas etapas. Para avaliar mudanças futuras no fluxo Gemini, use uma imagem nova ou o recurso existente para ignorar/remover somente sua entrada de cache.

## 3. Modos de execução

| Nome utilizado | Valor interno | Comportamento relevante |
|---|---|---|
| Conversa temporária | `temp_chat` | Solicita conversa temporária e mantém a cadeia de extração autenticada para assets gerados. O tratamento existente cobre indisponibilidade do controle temporário. |
| Janela minimizada | `minimized_window` | Solicita minimização, reaplica o estado e consulta o navegador. Se a criação/verificação falhar, tenta limpar a janela criada e utiliza uma aba inativa. Aguarda a exclusão como no modo normal. |
| Conversa normal | `background_delete` | Usa conversa persistente para a tarefa e aguarda sua exclusão antes da conclusão da entrega, com recuperação quando necessário. |

O runner automático não solicita as ações que ativam fisicamente aba/janela durante recuperação do anexo ou retry de envio. Interações de foco do editor pelo DOM continuam necessárias ao preenchimento, mas não equivalem a pedir que o navegador traga a janela para a frente. O mecanismo existente de anti-throttle foi mantido.

## 4. Proteções que devem permanecer

- **Editor pronto:** existir um wrapper não basta; o editor precisa estar editável e estável.
- **Upload confirmado:** disparar eventos é tentativa. Imagem carregada com dimensões naturais positivas e sem processamento pendente é a evidência de confirmação.
- **Autoria da resposta:** rejeitar composer, turno do usuário, fontes iniciais e respostas antigas; preservar os seletores de autoria forte.
- **Shadow DOM e carregamento:** manter busca profunda, observação de raízes, mudanças de `src`/`srcset` e eventos de carga/erro.
- **Fallback de resposta restrito:** sem autoria estrita, exigir asset HTTPS gerado do Google e geração observada; blob/data órfãos não bastam.
- **Sessão de extração:** manter `geminiSession:true` para a rota autenticada e validação de host no background.
- **Exclusão verificável:** mudança da URL e desaparecimento da entrada correspondente antes de `DELETE_OK`; reconhecer solicitações repetidas já concluídas.
- **Prazo finito:** renovar uma vez por execução do runner no início observado, sem prolongamento contínuo por heartbeat.
- **Conclusão honesta:** preservar `hasErrors` e supressão do áudio de sucesso em lote com falhas.

Não houve transplante completo da extensão alternativa, nem importação da recuperação que trazia o Gemini para primeiro plano. As melhorias opcionais de contador explícito de falhas, quarentena por identidade do anexo e igualdade de payload não fazem parte desta revisão.

## 5. Extração e autenticação

Uma URL gerada reconhecida precisa usar HTTPS, host `googleusercontent.com` ou subdomínio e caminho `/gg-dl/` ou `/rd-gg-dl/`. Para esses assets, nos três modos:

`canvas → Service Worker com sessão → fetch pela página Gemini`.

O SW recebe `FETCH_IMAGE_AS_BASE64` com `geminiSession:true`. O handler existente valida o host e usa `credentials:'include'` nessa rota. Não foram adicionadas permissões ao manifest.

As rotas `data:image`, `blob:` e os caminhos históricos de outras URLs permanecem. Se toda a cadeia falhar, pode haver até quatro tentativas totais com intervalo de um segundo; a aba auxiliar continua como último fallback existente. Um aviso intermediário não representa falha terminal se uma rota seguinte conclui.

A revisão 2 teve 12 extrações concluídas no SW, sete no fetch da página como último recurso e duas no canvas. Esses números mostram que as três rotas ainda são úteis. Houve 14 avisos de falha do SW e sete eventos de nova tentativa, recuperados nas execuções observadas. Não há base para eliminar fallback/retries ou prometer que a autenticação nunca falhará.

## 6. Prazos e esperas

| Etapa | Valor vigente | Significado |
|---|---:|---|
| Estabilização do editor | Até 12 s | Exige pelo menos 750 ms com os mesmos nós e 1,5 s desde o início da espera. |
| Confirmação do upload | Até 20 s | Renovação dos alvos entre métodos; intervalo de 3,5 s entre tentativas aplicáveis. |
| Espera de resultado da geração | 4 min por padrão | Permaneceu igual; override interno existente pode alterar esse valor. |
| Watchdog global | 5 min | Armado na abertura; rearmado por mais cinco minutos no primeiro início de geração observado naquela execução. |
| Retry de extração | Até 4 tentativas | Intervalo de 1 s entre tentativas; cada rota pode ter sua própria espera de rede. |
| Espera de ID para exclusão | Até 8 s | Evita tentar excluir antes de a URL identificar a conversa. |
| Verificação após excluir | Até 6 s | Aguarda a alteração da URL e o desaparecimento da entrada do chat. |

Esses valores não devem ser somados como garantia de duração total. O watchdog limita a tarefa independentemente das esperas locais. Sem evento de geração, não há renovação e o prazo global inicial continua valendo. Ao expirar, a finalização agora é aguardada antes de continuar a limpeza das abas de extração.

## 7. Mapa de implementação

No histórico local, a revisão 2 acrescentou duas melhorias à revisão 1 em seis arquivos. Ao integrar a base main deste repositório, 15 arquivos de extension diferem: 13 com comportamento e dois somente com identificação/comentário. Os outros 43 coincidem após normalizar quebras de linha. Watchdog de cinco minutos e sua ação validada já existiam nesta base e são preservados.

| Arquivo relativo a extension | Responsabilidade na versão funcional |
|---|---|
| `background.js` | Inicialização e integração dos módulos; prazo global de cinco minutos e carregamento da ação de refresh. |
| `background/router.js` | Mapeamento de `REFRESH_JOB_WATCHDOG`. |
| `background/actions/refresh-job-watchdog.js` | Valida origem, jobId, índice e identidade canônica da aba; rearma a tarefa correspondente. |
| `background/jobs-watchdog.js` | Alarme persistido e finalização aguardada no timeout. |
| `background/jobs-lifecycle.js` | Verificação de minimização, limpeza de erro antes de existir conversa e conclusão com `hasErrors`. |
| `content_manga.js` | Propagação de falhas do lote e áudio condicionado ao sucesso. |
| `gemini/attachment.js` | Tentativas sequenciais e confirmação observável/carregada do anexo. |
| `gemini/deletion.js` | Espera de ID, exclusão verificada, reconhecimento de repetição e recuperação existente. |
| `gemini/dom.js` | Helpers de busca profunda e autoria/contexto da imagem. |
| `gemini/job-runner.js` | Editor estável, integração do pipeline, upload obrigatório, refresh e exclusão aguardada. |
| `gemini/observer.js` | Confirma envio, geração e resultado; aplica filtros de autoria e carregamento. |
| `gemini/result-extractor.js` | Cadeia autenticada reordenada somente para assets gerados reconhecidos. |
| `gemini/selectors.js` | Reconhecimento ampliado de assistant e turnos do usuário. |
| `manifest.json` | Nome de identificação MT-UNICO-01; a revisão 2 não alterou nome, permissões ou versão 6.5. |

O diff do PR registra as alterações contra main. Esta documentação descreve o conjunto funcional completo, incluindo componentes que já existiam na base. O resumo público em VALIDACAO_REVISAO_2.json registra contagens e limites da evidência sem publicar os exports brutos.

## 8. Validação manual atual

| Modo | Resultados identificados | Lotes | Exclusões confirmadas |
|---|---:|---|---:|
| Temporário | 7 | 4 + 3 imagens | Fluxo temporário |
| Minimizado | 7 | 7 imagens | 7 |
| Normal | 7 | 7 imagens | 7 |
| Total | **21** | **4 lotes completos** | **14** |

Os quatro `BATCH_DONE` informam `hasErrors:false` e `completed === total`. Todos os resultados identificados usam `new_model_turn` e `generated_google_asset`, com `structured-content-container` como tag do contexto reconhecido. O helper avalia também atributos; a tag isolada não prova autoria.

Há 21 `GEMINI_WATCHDOG_REFRESH_REQUESTED`, 21 `JOB_WATCHDOG_REFRESH` e 21 `GEMINI_WATCHDOG_REFRESH_CONFIRMED`; não há registro de falha de renovação ou de nível ERROR. Sete consultas de estado registram `minimized` e `focused:false`. Há sete reconhecimentos repetidos de exclusão já confirmada, sem contar traduções adicionais.

As exportações são acumulativas e limitadas; normal/minimizado têm 500 eventos cada. A análise remove linhas exatamente repetidas e usa prefixos de tarefas para contar resultados. Eventos anônimos simultâneos podem se repetir ou ficar fora da janela do logger, portanto não são utilizados para inventar uma correspondência por imagem.

Essa evidência confirma o fluxo nas execuções registradas. Não mede melhoria de velocidade, não demonstra expiração provocada do watchdog e não verifica automaticamente a qualidade visual. O relato do usuário confirma que a revisão funciona.

## 9. Diagnóstico e conservação

| Evento | Leitura |
|---|---|
| `GEMINI_STEP_3_OK` | O anexo confirmou; o prompt pode prosseguir. |
| `GEMINI_RESULT_ACCEPTED` | Resultado passou pelos filtros; motivo e prefixo da tarefa ajudam a atribuir o evento. |
| `GEMINI_WATCHDOG_REFRESH_CONFIRMED` | O runner recebeu confirmação do refresh validado. |
| `GEMINI_EXTRACT_STAGE` | Rota de extração e tentativa; interpretar avisos junto de conclusões posteriores. |
| `GEMINI_EXTRACT_RETRY_ALL` | Outra tentativa da cadeia completa; não é falha terminal por si só. |
| `DELETE_OK` / `DELETE_ALREADY_CONFIRMED` | Exclusão verificada / reconhecimento de repetição. |
| `BATCH_DONE` | Conferir completed, total e hasErrors. |
| `JOB_TIMEOUT` | O limite global expirou; analisar preparação, geração e refresh antes de atribuir causa. |

Em lotes paralelos, os eventos de extração ainda não possuem prefixo de tarefa. Não associe uma falha a uma imagem apenas por proximidade textual.

Mantenha esta revisão como base para mudanças futuras e altere um motivo por vez. Preserve logs e cache relevantes antes de diagnosticar regressão. Os backups e exports brutos da rodada manual permanecem locais.

Documentos associados: [README](../README.md) para instalação; [documentação canônica](Documentação.md) para arquitetura geral; [extração e prazo](MELHORIAS_EXTRACAO_E_PRAZO.md) para a última rodada; [validação manual](VALIDACAO_REVISAO_2.json) para contagens e limites. O CI deste PR é independente da validação manual e roda no GitHub.

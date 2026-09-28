# Manga Translator — documentação da versão funcional

Identificação: MT-UNICO-01, revisão 2 + hardening PR #47. Atualização: 27/09/2026 (horário local; runs finais do GitHub em 28/09 UTC). Pasta: `extension/`.

**Estado atual: a base manual da revisão 2 permanece válida e o conjunto automatizado do PR #47 está estabilizado.** A validação manual anterior concluiu quatro lotes com 21 imagens: sete temporárias, sete minimizadas e sete normais. Depois dela foram incorporadas quarentena, fila/lifecycle duráveis, staging/commit e hardening de CI. Essas mudanças posteriores são cobertas pela suíte automatizada; a evidência manual histórica não deve ser reinterpretada como se tivesse exercitado código acrescentado depois.

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
9. Compara SHA-256 dos bytes extraídos com a imagem de entrada. Payload idêntico é colocado em quarentena e não é entregue.
10. Nos modos normal/minimizado, aguarda exclusão da conversa ou registra a recuperação pendente antes da entrega final conforme o controlador existente.
11. O resultado é entregue à página para aplicação/persistência. A finalização e o encerramento do lote seguem as confirmações existentes; sucesso de lote exige que o total concluído corresponda ao total esperado.

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
- **Quarentena da entrada:** rejeitar preview de anexo também na seleção manual e bloquear igualdade SHA-256 exata antes da entrega.
- **Shadow DOM e carregamento:** manter busca profunda, observação de raízes, mudanças de `src`/`srcset` e eventos de carga/erro.
- **Fallback de resposta restrito:** sem autoria estrita, exigir asset HTTPS gerado do Google e geração observada; blob/data órfãos não bastam.
- **Sessão de extração:** manter `geminiSession:true` para a rota autenticada e validação de host no background.
- **Exclusão verificável:** mudança da URL e desaparecimento da entrada correspondente antes de `DELETE_OK`; reconhecer solicitações repetidas já concluídas.
- **Prazo finito:** renovar uma vez por execução do runner no início observado, sem prolongamento contínuo por heartbeat.
- **Conclusão honesta:** preservar `hasErrors` e supressão do áudio de sucesso em lote com falhas.

Não houve transplante completo da extensão alternativa, nem importação da recuperação que trazia o Gemini para primeiro plano. O contador explícito de falhas continua fora desta revisão. A quarentena usa contexto estrutural e igualdade exata dos bytes; similaridade perceptual permanece somente como telemetria.

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

No histórico local, a revisão 2 acrescentou duas melhorias à revisão 1 em seis arquivos. A quarentena posterior adiciona um módulo e integra quatro arquivos já alterados no fluxo Gemini. Contra a base main, o PR passa a ter 16 arquivos de `extension/` diferentes: 14 com comportamento e dois somente com identificação/comentário. Os outros 42 coincidem após normalizar quebras de linha. Watchdog de cinco minutos e sua ação validada já existiam nesta base e são preservados.

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
| `gemini/image-quarantine.js` | Classifica imagens do caminho de entrada e compara SHA-256 exato dos payloads. |
| `gemini/job-runner.js` | Editor estável, integração do pipeline, upload obrigatório, refresh, quarentena antes da entrega e exclusão aguardada. |
| `gemini/observer.js` | Confirma envio, geração e resultado; aplica filtros de autoria, carregamento e preview de anexo. |
| `gemini/result-extractor.js` | Cadeia autenticada reordenada somente para assets gerados reconhecidos. |
| `gemini/selectors.js` | Reconhecimento ampliado de assistant e turnos do usuário. |
| `manifest.json` | Nome de identificação MT-UNICO-01 e ordem de carga do módulo de quarentena; permissões e versão 6.5.0 permanecem. |

O diff do PR registra as alterações contra main. Esta documentação descreve o conjunto funcional completo, incluindo componentes que já existiam na base. O resumo público em VALIDACAO_REVISAO_2.json registra contagens e limites da evidência sem publicar os exports brutos.

### 7.1 Arquivos de runtime modificados pelo PR #47

Contra a `main` usada como base do PR, o conjunto funcional modifica diretamente estes 16 arquivos de runtime:

| Arquivo | Papel da modificação |
|---|---|
| `background.js` | Integra lifecycle, finalização e rotas do fluxo de job. |
| `background/state.js` | Estado durável único, batches pendentes e índice de jobs. |
| `background/router.js` | Registro/roteamento das ações do protocolo atual. |
| `background/jobs-dom-ack.js` | ACK/staging de aplicação do resultado no mangá. |
| `background/jobs-lifecycle.js` | Finalização, promoção de batch e cleanup por modo. |
| `background/jobs-reconciliation.js` | Reconciliação após suspensão/restart do Service Worker. |
| `background/actions/commit-result.js` | Commit após persistência/staging confirmado. |
| `background/actions/deliver-result.js` | Entrega direta preservando identidade e estado. |
| `background/actions/deliver-result-url.js` | Entrega por URL com contrato de staging/commit. |
| `background/actions/deliver-result-from-tab.js` | Entrega originada da aba com validações de ownership. |
| `background/actions/report-error.js` | Propagação de erro sem falso sucesso/contabilidade duplicada. |
| `content_manga.js` | Cleanup da extração auxiliar, ACK/retry/pagehide e integração de lote. |
| `content_gemini.js` | Bootstrap/claim e integração com o runner modular. |
| `gemini/job-runner.js` | Pipeline Gemini, staging/commit, quarentena e fallbacks. |
| `gemini/result-extractor.js` | Ownership e extração autenticada do resultado. |
| `popup.js` | Integração da UI com o estado e fluxos atuais. |

A lista acima descreve o diff funcional do PR #47; módulos não listados continuam podendo participar do fluxo porque já existiam na base.

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

Essa evidência confirma o fluxo anterior às mudanças de quarentena nas execuções registradas. Não mede melhoria de velocidade, não demonstra expiração provocada do watchdog, não verifica automaticamente a qualidade visual e não substitui o novo teste manual da quarentena. O relato do usuário confirma que a base da revisão funciona.

## 9. Diagnóstico e conservação

| Evento | Leitura |
|---|---|
| `GEMINI_STEP_3_OK` | O anexo confirmou; o prompt pode prosseguir. |
| `GEMINI_RESULT_ACCEPTED` | Resultado passou pelos filtros; motivo e prefixo da tarefa ajudam a atribuir o evento. |
| `GEMINI_WATCHDOG_REFRESH_CONFIRMED` | O runner recebeu confirmação do refresh validado. |
| `GEMINI_EXTRACT_STAGE` | Rota de extração e tentativa; inclui `jobIdPrefix`, `batchIdPrefix` e `index` para correlação por tarefa. |
| `GEMINI_EXTRACT_RETRY_ALL` | Outra tentativa da cadeia completa; não é falha terminal por si só. |
| `DELETE_OK` / `DELETE_ALREADY_CONFIRMED` | Exclusão verificada / reconhecimento de repetição. |
| `BATCH_DONE` | Conferir completed, total e hasErrors. |
| `JOB_TIMEOUT` | O limite global expirou; analisar preparação, geração e refresh antes de atribuir causa. |

Em lotes paralelos, correlacione os eventos de extração pelos campos `jobIdPrefix`, `batchIdPrefix` e `index`; não é necessário inferir a imagem apenas pela proximidade textual.

Mantenha esta revisão como base para mudanças futuras e altere um motivo por vez. Preserve logs e cache relevantes antes de diagnosticar regressão. Os backups e exports brutos da rodada manual permanecem locais.

Documentos associados: [README](../README.md) para instalação; [documentação canônica](Documentação.md) para arquitetura geral; [extração e prazo](MELHORIAS_EXTRACAO_E_PRAZO.md) para a última rodada; [validação manual](VALIDACAO_REVISAO_2.json) para contagens e limites. O CI deste PR é independente da validação manual e roda no GitHub.


## 10. Validação automatizada e regressões obrigatórias do PR #47

O estado atual não depende apenas da validação manual da revisão 2.

O contrato automatizado exige:

- Jest: **108 suítes / mínimo de 848 testes**, skipped=0 e TODO=0;
- Node 20 e Node 22;
- E2E: **21 testes**, skipped=0, flaky=0 e nenhum retry recuperando falha;
- visual/perceptual: **224 testes**;
- smoke: **6 arquivos**;
- coverage: **56 arquivos instrumentados**, com thresholds globais e críticos;
- `CI Gate` agregando todos os gates obrigatórios.

O worker Jest não pode ser encerrado à força. `run-jest-ci.js` trata o texto de force-exit como falha mesmo quando o Jest retornaria zero.

A investigação do PR #47 encontrou como causa-raiz final um timer real de **4 s** criado por `handleMarkerAndShow()` para remover `_anchor.png`. O teste `REG-WORKER-4S` prova que o timer é capturado pelo ownership do caso e cancelado no teardown.

Além das contagens, `tests/ci/regression-matrix.json` enumera regressões que não podem ser removidas silenciosamente. O `CI Contract` exige que os testes e marcadores da matriz continuem presentes. Ela cobre cleanup de extração, callbacks dos mocks Chrome, teardown do RPA, clique individual, worker warning, coverage, flaky/retry E2E e os cenários E2E essenciais.

Os diagnósticos exploratórios de worker/bisection permanecem disponíveis por `workflow_dispatch`, mas não são executados em todo push. O gate permanente continua no Jest completo.

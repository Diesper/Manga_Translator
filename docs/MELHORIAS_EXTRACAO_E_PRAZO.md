# Revisão 2 — extração autenticada e prazo limite

Implementação em 27/09/2026 na mesma pasta `extension/`. **Revisão 2 aprovada:** o usuário confirmou que funciona e os exports atualizados mostram 21 resultados aceitos nos três modos. Nenhum teste automatizado foi executado.

## 1. Motivo e escopo

Os logs anteriores mostram 11 traduções concluídas: três temporárias, três minimizadas e cinco normais. Dez extrações concluíram pela rota autenticada do Service Worker e uma pelo canvas. Os avisos do fetch pela página geralmente precediam o sucesso autenticado; três falhas HTTP foram recuperadas por novas tentativas. Os registros não expõem os status HTTP desses avisos.

O código anterior também tinha uma corrida de prazos: quatro minutos globais contados desde a abertura da aba, enquanto a espera pela geração tinha quatro minutos próprios iniciados depois da preparação. Anexar, enviar e posteriormente excluir consumiam parte do prazo global.

A mudança importa apenas as duas melhorias recomendadas. Ela não substitui o runner ou o observer pela versão alternativa e não altera upload, seletores, validação da resposta, clipboard, áudio ou contagem de falhas.

## 2. Extração autenticada

Arquivo: `gemini/result-extractor.js`.

Para uma URL HTTPS cujo host é `googleusercontent.com` ou seu subdomínio e cujo caminho contém `/gg-dl/` ou `/rd-gg-dl/`, a ordem passa a ser:

1. Canvas da imagem já existente.
2. Service Worker com `geminiSession:true`, pela ação já existente `FETCH_IMAGE_AS_BASE64`.
3. Fetch pela página Gemini, como último recurso.

Essa ordem vale nos três modos, porque a identificação do asset é independente do modo. O canvas permanece porque concluiu uma das extrações anteriores sem precisar de rede. A sessão do SW continua sujeita à validação de host já existente no background; não foram acrescentadas permissões.

Se a rota autenticada falhar, o fetch pela página ainda será tentado. Se ambos falharem, a cadeia completa continua podendo repetir até quatro tentativas, com o intervalo já existente. O fallback de aba auxiliar também permanece no fim do fluxo existente. Falhas HTTP transitórias não são resolvidas apenas por reordenar as rotas, portanto os retries foram preservados.

As rotas para `data:image`, `blob:` e URLs que não são assets gerados reconhecidos não mudaram. Em `background_delete`, a cadeia histórica de URLs não reconhecidas também permanece.

O novo evento de etapa `gemini_page_fetch_last_resort` distingue o fetch da página utilizado depois da falha autenticada nesse caminho. Um aviso de canvas seguido de sucesso em `service_worker_session` continua sendo uma extração concluída.

## 3. Prazo limite

O watchdog global passa de quatro para cinco minutos. Ao abrir a aba, ele já continua armado para evitar uma tarefa presa na preparação. Ao observar o evento `generation_started`, o runner solicita uma renovação de cinco minutos.

A solicitação é feita somente na primeira ocorrência desse evento naquela execução de `run(job)`. Não há heartbeat renovando indefinidamente o prazo. A espera terminal da geração continua com quatro minutos por padrão; renovar o watchdog não a aumenta. A margem também permite que a extração, entrega e exclusão tenham tempo após a geração, mas não garante qualquer duração arbitrária de rede/recuperação.

A nova ação foi aproveitada da referência sem importar as ações de ativação. Ela:

1. Exige `jobId` e origem Gemini pelo router.
2. Inicializa o estado, se necessário.
3. Obtém a aba remetente pelo navegador, sem confiar em um ID de aba fornecido na mensagem.
4. Localiza a tarefa no índice durável.
5. Resolve aliases de abas substituídas e confere que a remetente é a dona da tarefa.
6. Rearma somente o watchdog dessa tarefa usando os dados do índice.

O runner só registra confirmação quando a resposta possui `ok:true` e `refreshed:true`. Uma falha de comunicação ou validação produz aviso e preserva o watchdog previamente armado; a geração não é interrompida apenas porque a renovação falhou.

Se não surgir o evento de geração, não há renovação; o limite global de cinco minutos desde a abertura continua valendo. Resultados rápidos podem terminar sem precisar renovar esse prazo.

No tratamento de timeout, `finalizeJob(...)` agora é aguardado antes da continuação da limpeza das abas de extração. Isso preserva a ordem entre finalização e limpeza, aproveitando a correção pequena da referência.

## 4. Arquivos da rodada

| Arquivo | Mudança |
|---|---|
| `background.js` | Prazo de cinco minutos; carrega a nova ação nas duas formas de carregamento; disponibiliza `armWatchdog` no contexto do router. |
| `background/router.js` | Mapeia apenas `REFRESH_JOB_WATCHDOG`; não adiciona ações de ativação. |
| `background/actions/refresh-job-watchdog.js` | Novo arquivo, transplantado da referência: valida tarefa/aba e rearma seu watchdog. |
| `background/jobs-watchdog.js` | Acrescenta `await` na finalização por timeout. |
| `gemini/job-runner.js` | Solicita renovação no início observado da geração e registra solicitação, confirmação ou falha com modo e prefixo da tarefa. |
| `gemini/result-extractor.js` | Reordena apenas a cadeia dos assets gerados reconhecidos do Google. |

São cinco arquivos existentes e um novo em relação à versão aprovada. Os outros 52 arquivos da extensão permanecem idênticos. O manifest continua com o mesmo nome e versão; a revisão consta em `VARIANTE.json`.

## 5. Publicação e conferência

A pasta <code>extension/</code> corresponde à versão aprovada. As duas melhorias aqui descritas foram feitas no histórico local da revisão 2; a base main de destino já contém parte desse mecanismo. O PR preserva o contrato de versão 6.5.0/Manifest 6.5, os workflows e os componentes comuns.

Os exports brutos e backups permanecem locais. [VALIDACAO_REVISAO_2.json](VALIDACAO_REVISAO_2.json) apresenta apenas o resumo das evidências manuais. A comparação de conteúdo confere todos os 58 arquivos da extensão aprovada, descontando quebras de linha.

Não foram executados testes locais. O mantenedor autorizou o CI do GitHub, que permanece habilitado; aprovação manual não substitui nem presume resultado dos checks deste PR.

## 6. Manutenção e futuras verificações manuais

Recarregue a extensão na página de extensões do navegador e reabra as páginas para que content scripts antigos não continuem ativos. Use uma imagem nova ou ignore/remova apenas sua entrada de cache usando o recurso existente; um hit de cache não exercita upload, geração ou extração.

Confira temporário, minimizado e normal, primeiro com uma imagem e depois, se quiser, com um lote paralelo. O resultado deve continuar correto, o modo minimizado deve permanecer sem ativação física e as conversas normal/minimizada devem continuar sendo excluídas.

Nos logs da nova revisão, procure:

- `GEMINI_WATCHDOG_REFRESH_REQUESTED`: início observado e solicitação da renovação.
- `JOB_WATCHDOG_REFRESH`: background aceitou e rearmou a tarefa identificada.
- `GEMINI_WATCHDOG_REFRESH_CONFIRMED`: resposta positiva recebida pelo runner.
- `GEMINI_EXTRACT_STAGE` com `stage:service_worker_session`: extração autenticada; após falha do canvas, deve aparecer antes de eventual `gemini_page_fetch_last_resort` no caminho de asset reconhecido.
- `DELETE_OK` e `BATCH_DONE` com `hasErrors:false`: preservação da limpeza e conclusão.

Eventos de extração ainda não carregam prefixo da tarefa. Em lotes paralelos, a ordem global pode intercalar canvas/SW/page de imagens distintas; não atribua esses eventos a uma imagem apenas pela posição no texto. A renovação possui prefixo, permitindo conferir a tarefa correspondente.

Não é necessário provocar um timeout para testar o funcionamento normal. Se ocorrer uma geração lenta naturalmente, seus logs ajudarão a avaliar a margem. Um eventual `GEMINI_WATCHDOG_REFRESH_FAILED` deve ser enviado junto dos eventos anteriores; ele não significa sozinho que a tradução falhou.

## 7. Resultado da validação da revisão 2

Os três exports foram analisados conjuntamente, removendo linhas exatamente repetidas e contando tarefas pelos prefixos identificados. Temporário: sete resultados em dois lotes (quatro e três). Minimizado: sete resultados em um lote. Normal: sete resultados em um lote. Todos os quatro BATCH_DONE informam completed igual a total e hasErrors:false.

Foram registradas 21 solicitações, 21 renovações aceitas no background e 21 confirmações recebidas pelo runner, sem GEMINI_WATCHDOG_REFRESH_FAILED. Isso demonstra que o mecanismo novo foi utilizado, e não apenas incluído nos arquivos.

As extrações concluídas foram 12 pelo Service Worker com sessão, sete pelo fetch da página como último recurso e duas pelo canvas. A rota autenticada teve 14 avisos de falha e houve sete eventos de nova tentativa da cadeia; o fluxo terminou com sucesso. Portanto o fallback pela página e os retries seguem necessários. Não houve evento de nível ERROR nos exports analisados.

Há 14 DELETE_OK nos modos normal/minimizado e sete reconhecimentos de exclusão já confirmada. Sete consultas de estado registram janela minimizada e sem foco. Essas consultas comprovam o estado naquele momento; não são monitoramento contínuo da janela.

Os registros sustentam funcionamento e renovação do prazo nas execuções observadas. Não demonstram um teste de expiração após cinco minutos nem permitem quantificar ganho de velocidade contra a revisão 1. Os exports normal/minimizado têm 500 eventos cada, compatíveis com o limite do logger; ausência de evento não deve ser generalizada para histórico fora da janela exportada. A qualidade visual é confirmada pelo usuário, não por esses eventos técnicos.

Consulte VALIDACAO_REVISAO_2.json e DOCUMENTACAO_VERSAO_FUNCIONAL.md para as fontes e o estado atual consolidado.

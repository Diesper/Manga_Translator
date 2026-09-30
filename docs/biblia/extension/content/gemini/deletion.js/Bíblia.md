# Bíblia técnica — `extension/content/gemini/deletion.js`

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#B`
> **SHA auditado:** `2cec17f19e5293245b5e2f37493f0ef485b7281f`
> **Tipo:** módulo JavaScript de content script / controlador de exclusão e recovery
> **Linhas textuais:** **482**
> **Posições documentais:** **483** contando o newline final
> **PR:** `#66` — branch `docs/project-bible`

## 1. Papel arquitetural

`deletion.js` transforma a ação destrutiva de apagar uma conversa Gemini em um protocolo defensivo: identifica a conversa pela URL da própria aba, localiza a linha correspondente na sidebar, estabiliza o DOM antes dos cliques, confirma o diálogo, verifica o efeito pós-clique e mantém um journal de recovery em `chrome.storage.local` quando a exclusão precisa atravessar reload.

No Manifest MV3 ele roda no isolated world de `https://gemini.google.com/*` e do fixture local, depois dos módulos DOM/editor/result-extractor e antes de `job-runner.js` e `content_gemini.js`. O composition root instancia a factory com `document`, `window`, storage real, `sleep` e logger; o runner usa `recoverPending`, `deleteCurrentConversation` e `deleteOrScheduleRecovery`.

Para resultados já persistidos com sucesso, o background em `jobs-lifecycle.js` adiciona a URL a `deleting_urls` e só então envia `DELETE_CONVERSATION`. Assim, a conversa não é apagada antes de o resultado traduzido estar durável.

## 2. Dependências, consumers e lifecycle

- DOM: querySelector/querySelectorAll, closest, getBoundingClientRect, scrollIntoView e eventos de scroll.
- Window: location.pathname, location.reload, wheel e touchmove.
- Chrome storage: `chrome.storage.local.get/set/remove`.
- Runtime: `chrome.runtime.lastError` nos wrappers de escrita/remoção.
- Consumers: `content_gemini.js`, `job-runner.js` e o produtor de `DELETE_CONVERSATION` em `background/jobs-lifecycle.js`.
- Testes diretos: `tests/unit/content-gemini/deletion.test.js` carrega este arquivo real via require.
- Testes integrados: `rpa-flow.test.js` percorre o receiver real do composition root.

Estado efêmero: `deletionInProgress` e `lastDeletedChatId`. Estado durável: `gemini_delete_recovery_<tabId>`, contendo chatId, delivery e createdAt. O journal atual não possui TTL, versão de schema nem validação de jobId/batchId contra o job corrente.

## 3. Fluxo destrutivo seguro

A operação não considera `.click()` como sucesso. Ela recusa concorrência, respeita debugMode, obtém chatId do pathname, absorve repetição já confirmada, localiza/estabiliza a linha, abre e revalida o menu, estabiliza a confirmação e só retorna true quando o pathname deixa o chat e o anchor desaparece. Qualquer falha retorna false e o finally libera scroll lock e mutex.

## 4. Recovery após reload

Se `deleteOrScheduleRecovery` não confirma a exclusão, ele aguarda a gravação do recovery antes de recarregar. No próximo `jobRunner.run`, `recoverPending` é executado antes do keep-alive/job normal, tenta apagar novamente com scroll lock, limpa o marker e reenvia a delivery. O journal evita perder a finalização no reload, mas a correlação somente por tabId e a limpeza antes da confirmação de sendDelivery são fragilidades registradas abaixo.

## 5. Segurança e privacidade

- O chat alvo vem da URL da própria aba, não do payload de DELETE_CONVERSATION.
- O seletor de href usa substring; IDs que se contêm mutuamente podem criar colisão.
- A descoberta de Excluir é textual/global e a confirmação pode cair para todo o root quando nenhum diálogo reconhecido existe.
- DELETE_OK e DELETE_RECOVERY enviam `chatId` ao logger; o sanitizador atual de content_gemini redige URL/token/src/prompt/base64, mas não a chave chatId.
- Recovery grava a delivery inteira em storage local sem schema/TTL/minimização.
- O receiver DELETE_CONVERSATION no composition root não valida sender explicitamente e pressupõe o boundary de mensageria da extensão.

## 6. Evidência automatizada real

| Comportamento | Evidência | Classificação |
|---|---|---|
| fallback de escape | DEL-01; BGD-01 | ✅ PROVADO DIRETAMENTE |
| alvo desconectado falha estabilidade | DEL-02; BGD-07 | ✅ PROVADO DIRETAMENTE |
| debug preserva conversa e libera mutex | DEL-03 | ✅ PROVADO DIRETAMENTE |
| DOM completo, menu, confirmação e DELETE_OK | DEL-04; rpa-flow CG-44/48/49/52/53 | ✅ PROVADO DIRETAMENTE |
| idempotência após confirmação | segunda chamada de DEL-04 | ✅ PROVADO DIRETAMENTE |
| clique sem efeito não vira sucesso | DEL-05 | ✅ PROVADO DIRETAMENTE |
| exclusão concorrente é recusada | DEL-06 | ✅ PROVADO DIRETAMENTE |
| save/read/clear recovery | DEL-07 | ✅ PROVADO DIRETAMENTE |
| recovery consome marker e entrega uma vez | DEL-08 | ✅ PROVADO DIRETAMENTE para journal/delivery; scroll lock não é exercitado |
| falha salva recovery e solicita reload | DEL-09 | ✅ PROVADO DIRETAMENTE |
| recovery ausente não produz efeito | DEL-10 | ✅ PROVADO DIRETAMENTE |
| receiver DELETE_CONVERSATION em debug | rpa-flow CG-43/52/53 | ✅ PROVADO PELO COMPOSITION ROOT REAL |
| background envia DELETE_CONVERSATION pós-persistência | process-finalize-real BG-31c | ✅ PROVADO DIRETAMENTE no produtor |
| runner encerra cedo quando recovery foi tratado | RUN-02 com controller mockado | 🟨 EXECUTADO INDIRETAMENTE — prova o consumer, não deletion.js |
| ordem de carga | Manifest + load-content-gemini-module | 🟦 GATE ESTÁTICO ESPECÍFICO / harness |

## 7. Lacunas de teste e regressões possíveis

- ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — getElementText não possui consumer localizado.
- ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — ramo nativo CSS.escape.
- ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — ausência de chatId durante todo o prazo de 8 s.
- ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — storageGet/set/remove em lastError, throw e Promise rejeitada.
- ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — elemento que muda várias vezes e depois estabiliza.
- ⚠️ RISCO DE HANG — geometria que nunca estabiliza reinicia sample indefinidamente; não existe deadline absoluto.
- ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — scroll lock real, restauração e cleanup de listeners.
- ⚠️ RISCO DE TARGET ERRADO — colisão de substring de chat IDs no seletor de href.
- ⚠️ RISCO DE TARGET ERRADO — múltiplos controles Excluir/Delete não relacionados.
- ⚠️ RECOVERY STALE — chave é apenas tabId; não há comparação de jobId/batchId nem TTL.
- ⚠️ JANELA DE PERDA — clearRecovery ocorre antes de await sendDelivery; uma rejeição apaga o retry durável.
- ⚠️ PRIVACIDADE — chatId passa ao logger sem redaction específica.
- ⚠️ IDEMPOTÊNCIA NÃO DURÁVEL — lastDeletedChatId desaparece após reload/context reset.

### 7.1 Plano de testes faltantes

| Lacuna | O que a evidência atual prova | Por que ainda é insuficiente | Teste necessário | Regressão que poderia escapar |
|---|---|---|---|---|
| `getElementText` sem consumer | Busca no repositório mostra o helper apenas neste módulo. | Ausência de referências não prova o comportamento do helper nem impede futura reutilização quebrada. | Teste unitário chamando o helper com `innerText`, `textContent`, `aria-label`, `mattooltip`, `title`, `data-test-id` e `data-testid`, verificando filtragem, join, lowercase e trim. | Mudança de normalização que deixe de reconhecer labels acessíveis ou introduza texto duplicado/ruído. |
| ramo nativo de `CSS.escape` | DEL-01/BGD-01 provam somente o fallback manual quando `CSS.escape` não é usado. | O caminho preferencial pode delegar valor incorreto ou usar o objeto CSS errado sem que os testes falhem. | Injetar `scope.CSS.escape = jest.fn()`, chamar `escapeCssAttributeValue` e afirmar argumento/retorno exatos. | Browser com `CSS.escape` disponível produz seletor divergente do fallback e deixa de localizar a conversa. |
| chatId ausente durante 8 s | O fluxo normal e o caminho com chatId válido são exercitados. | Nenhum teste mantém pathname sem `/app/<id>` até expirar o deadline. | Relógio/sleep falsos avançando >8000 ms com pathname sem ID; afirmar `false`, log `DELETE_ERROR` e mutex liberado. | Loop de espera não termina, mensagem de erro muda ou mutex fica preso após timeout. |
| falhas de storage | DEL-07/08/09 cobrem get/set/remove no caminho feliz. | Não exercitam `runtime.lastError`, throw síncrono nem Promise rejeitada nas APIs de storage. | Três testes focais para `storageGet`, `storageSet` e `storageRemove` cobrindo cada modo de falha e a propagação/resolução esperada. | Reload ocorrer sem recovery durável, marker não removido ou exceção não tratada abortar cleanup. |
| layout muda continuamente | DEL-02/BGD-07 provam apenas desconexão. | Reiniciar `sample = -1` não possui deadline absoluto e pode nunca concluir. | Fake clock com `getBoundingClientRect` mudando a cada amostra; o teste deve exigir uma política futura de deadline máximo. | Promise pendente indefinidamente, scroll lock prolongado e job bloqueado. |
| scroll lock real | DEL-08 chama recovery em debugMode e retorna antes de instalar o lock. | Não há assertion em listeners `scroll/wheel/touchmove`, preservação de offsets ou cleanup. | DOM com ancestor scrollável, recovery não-debug e spies em add/removeEventListener; provocar scroll e verificar restauração + remoção no finally. | Listeners vazam, página fica impossível de rolar ou offsets mudam e o clique atinge outra linha. |
| colisão de substring do chatId | DEL-04 usa apenas um anchor de conversa. | `a[href*="<id>"]` pode casar ID que contém outro ID. | DOM com `/app/chat-1` e `/app/chat-10`; pathname `/app/chat-1`; afirmar que somente a linha exata é operada. | Exclusão da conversa errada quando IDs compartilham substring. |
| múltiplos `Excluir/Delete` | Happy path possui um menu item e um confirm button. | A busca global/fallback para root não demonstra ownership do overlay quando há outros botões destrutivos. | Montar dois menus/diálogos, um não relacionado, e afirmar que o controller escolhe exclusivamente o overlay da conversa alvo. | Clique em ação destrutiva de outra superfície da página. |
| recovery stale por tabId | DEL-07/08 provam persistência/consumo para o mesmo tabId. | Não existe validação de `jobId`, `batchId`, TTL ou schema contra o job corrente. | Persistir delivery de job A e executar recovery sob job B na mesma aba; o comportamento seguro futuro deve rejeitar/quarentenar o marker antigo. | Delivery antiga finaliza job novo, causando corrupção de ownership/contabilidade. |
| remoção antes de `sendDelivery` | DEL-08 usa `sendDelivery` que resolve. | Não cobre rejeição depois de `clearRecovery`; hoje a ordem perde o journal. | Fazer `sendDelivery` rejeitar e verificar política futura: marker deve permanecer/reaparecer até ACK durável. | Resultado/reporte pendente desaparece após reload e nunca chega ao background. |
| `chatId` em logs | Tests checam ações de log, mas não policy de redaction desse campo. | O sanitizador do composition root não classifica `chatId` como chave sensível. | Teste integrado do `sendLog` real com DELETE_OK/DELETE_RECOVERY afirmando que identificador bruto não aparece em payload persistido. | Identificador de conversa vaza para logs/exportações de diagnóstico. |
| idempotência após reload | DEL-04 prova `lastDeletedChatId` apenas na mesma instância. | O estado é memória efêmera e some em reload/context reset. | Criar controller novo após exclusão e simular reenvio de DELETE_CONVERSATION; definir/afirmar mecanismo durável ou detecção segura do estado já removido. | Segundo comando tenta operar novamente em contexto diferente ou produz falso erro após exclusão já concluída. |

## 8. Casos-limite

root/window/storage ausentes; elemento desconectado; layout que lança ou se move continuamente; chatId ausente; sidebar fechada; anchor não encontrado; row re-renderizado; nenhum botão de opções; menu/diálogo atrasados; múltiplos Deletes; clique sem efeito; mensagem duplicada; duas chamadas concorrentes; debugMode; storage falhando; recovery ausente/malformado/stale; reload indisponível; sendDelivery ausente ou rejeitando.

## 9. Invariantes

1. Nunca clicar em Excluir sem identificar a conversa pela URL da própria aba.
2. Nunca declarar sucesso somente porque o botão foi clicado.
3. Uma instância não pode executar duas deleções concorrentes.
4. Toda saída deve liberar deletionInProgress e qualquer scroll lock instalado.
5. Debug mode deve preservar a conversa.
6. Repetição do mesmo chat confirmado no mesmo contexto não deve gerar novo clique.
7. A linha e controles destrutivos precisam permanecer conectados/estáveis antes do clique.
8. Recovery deve ser persistido antes de reload.
9. JobRunner deve consumir recovery antes do job normal.
10. Resultado persistido deve preceder cleanup final disparado pelo background.
11. Recovery não deve ser confundido entre jobs; o código atual garante só tabId e deve ser fortalecido.
12. Logs não devem expor identificadores sensíveis de conversa.
13. Qualquer correção de estabilidade deve adicionar deadline absoluto sem reintroduzir clique em DOM móvel.

## 10. Análise crítica

### Espera sem deadline absoluto
O reset `sample = -1` permite exigir amostras estáveis consecutivas, mas um elemento animado continuamente pode manter a Promise viva indefinidamente. Em recovery isso também pode prolongar o scroll lock. A correção futura deveria combinar estabilidade consecutiva com deadline absoluto.

### Seleção destrutiva por heurística
A opção Excluir é descoberta globalmente e o botão de confirmação pode ser buscado no root inteiro. Texto exato, revalidação e estabilidade reduzem risco, mas não substituem ownership estrutural do overlay.

### Recovery correlacionado apenas por tabId
O record pode conter jobId/batchId dentro da delivery, mas recoverPending não valida esses IDs contra o job corrente. Um marker antigo que sobreviva pode finalizar um job posterior na mesma aba.

### Marker removido antes da delivery
A ordem atual favorece consumo at-most-once. Se sendDelivery rejeitar depois de clearRecovery, o journal já foi removido e não existe retry durável.

### chatId em logs
O logger do composition root sanitiza diversas categorias de dados, mas não reconhece chatId como chave sensível. O ID deveria ser redigido, reduzido ou hashado conforme a política do projeto.

## 11. Unidades semânticas

### U01 — linhas 1–4 — Envelope do módulo

**O que faz:** Ativa strict mode, declara a finalidade do arquivo e abre uma IIFE que isola a implementação.

**Como faz:** A IIFE recebe o objeto global como `scope`, o que permite a mesma fonte funcionar como content script clássico no browser e como CommonJS em Jest.

**Por que foi implementado assim:** O Manifest MV3 injeta scripts clássicos em ordem; manter nomes internos fechados reduz colisões sem exigir conversão isolada para ESM.

**Por que uma implementação ingênua seria pior:** Variáveis e helpers soltos no global aumentariam colisões; uma migração parcial para ESM quebraria a ordem/harness atual.

**Evidência:** 🟦 GATE/HARNESS ESPECÍFICO — Manifest e `load-content-gemini-module.js` confirmam a mesma fonte e ordem de carga.

### U02 — linhas 5–18 — Factory, dependências e estado efêmero

**O que faz:** Cria `createDeletionController` com DOM, window, storage, relógio, sleep, logger e getComputedStyle injetáveis; mantém o mutex local e memória do último chat excluído.

**Como faz:** Defaults vêm de `scope`, mas podem ser substituídos em teste. `deletionInProgress` serializa a operação no contexto e `lastDeletedChatId` absorve repetição já confirmada.

**Por que foi implementado assim:** Injeção de dependências torna polling/DOM/storage determinísticos em teste sem duplicar a implementação de produção.

**Por que uma implementação ingênua seria pior:** Acessos globais espalhados dificultariam testes; estado global entre controllers poderia causar interferência entre instâncias.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-03, DEL-04 e DEL-06 exercitam flags e lifecycle do controller real.

### U03 — linhas 19–30 — Normalização textual auxiliar

**O que faz:** `getElementText` agrega conteúdo e atributos acessíveis/test IDs, normaliza para minúsculas e remove espaços externos.

**Como faz:** Lê `innerText`, `textContent`, aria-label, mattooltip, title, data-test-id e data-testid, remove valores vazios e concatena.

**Por que foi implementado assim:** O helper foi preparado para matching de UI que muda entre texto visível e atributos de acessibilidade.

**Por que uma implementação ingênua seria pior:** Depender só de textContent perderia labels; manter helper sem consumer também aumenta superfície morta.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — busca no repositório localizou o símbolo somente neste arquivo.

### U04 — linhas 32–37 — Escape para seletor CSS

**O que faz:** Escapa o ID da conversa antes de interpolá-lo em um seletor de atributo CSS.

**Como faz:** Prefere `CSS.escape`; se indisponível, duplica barras invertidas e escapa aspas duplas.

**Por que foi implementado assim:** O chat ID entra em um seletor CSS e caracteres especiais não podem alterar a sintaxe do seletor.

**Por que uma implementação ingênua seria pior:** Interpolação crua poderia quebrar o seletor ou alterar seu significado.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-01 e BGD-01 cobrem o fallback; ⚠️ o ramo nativo `CSS.escape` não tem assertion focal.

### U05 — linhas 39–47 — Identidade da conversa e chave do recovery

**O que faz:** Extrai o ID da conversa do pathname `/app/<id>` e deriva uma chave de storage por tabId.

**Como faz:** A regex aceita letras, números, `_` e `-`; recovery usa o namespace `gemini_delete_recovery_<tabId>`.

**Por que foi implementado assim:** O alvo destrutivo deve nascer do estado da própria aba, e o journal precisa separar abas simultâneas.

**Por que uma implementação ingênua seria pior:** Aceitar chatId arbitrário do payload ampliaria spoofing; uma chave global misturaria recoveries.

**Evidência:** ✅ PROVADO DIRETAMENTE de forma integrada por DEL-04 e DEL-07; ⚠️ pathname inválido/tabId malformado não têm teste focal.

### U06 — linhas 49–60 — Leitura tolerante do storage

**O que faz:** Promisifica `storage.get` e degrada para objeto vazio quando a API não existe ou lança sincronicamente.

**Como faz:** A Promise sempre resolve; a leitura ausente é interpretada como estado não configurado.

**Por que foi implementado assim:** Debug/recovery inexistentes não devem derrubar a automação.

**Por que uma implementação ingênua seria pior:** Propagar qualquer ausência de storage interromperia cleanup; porém mascarar falhas também pode esconder perda de estado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE em DEL-03/07/08/10; ⚠️ API ausente, throw e `runtime.lastError` não têm assertion específica.

### U07 — linhas 62–78 — Persistência do recovery

**O que faz:** Promisifica `storage.set`, trata `runtime.lastError`, suporta implementação que também retorna Promise e propaga falha.

**Como faz:** O callback é observado na janela válida de lastError; uma Promise retornada pela API/mock também é encadeada.

**Por que foi implementado assim:** Reload só é seguro depois que a delivery pendente ficou durável.

**Por que uma implementação ingênua seria pior:** Fire-and-forget poderia recarregar a página antes de o journal existir.

**Evidência:** ✅ PROVADO DIRETAMENTE no caminho normal por DEL-07/DEL-09; ⚠️ lastError/throw/Promise rejeitada não têm teste focal.

### U08 — linhas 80–96 — Remoção do recovery

**O que faz:** Promisifica `storage.remove` usando o mesmo contrato de erro da persistência.

**Como faz:** Resolve quando o callback não reporta lastError e rejeita em lastError, throw ou Promise rejeitada.

**Por que foi implementado assim:** Cleanup de marker precisa ser observável para não assumir remoção que falhou.

**Por que uma implementação ingênua seria pior:** Remoção fire-and-forget poderia deixar marker antigo ser reproduzido depois.

**Evidência:** ✅ PROVADO DIRETAMENTE no caminho normal por DEL-07/DEL-08; ⚠️ ramos de falha não têm teste focal.

### U09 — linhas 98–128 — Estabilidade geométrica

**O que faz:** Exige que o elemento permaneça conectado e com retângulo estável por várias amostras antes de clicar.

**Como faz:** Compara top/left/width/height arredondados; quando a geometria muda, reinicia a contagem e espera novamente.

**Por que foi implementado assim:** Gemini re-renderiza listas/overlays; clicar em alvo móvel aumenta risco de ação na conversa errada.

**Por que uma implementação ingênua seria pior:** Clique imediato em elemento stale é inseguro; por outro lado, o reset atual não possui deadline absoluto e pode ficar preso se a UI nunca estabilizar.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-02 e BGD-07 cobrem desconexão; ⚠️ movimento contínuo e throw de layout não têm prova focal.

### U10 — linhas 130–155 — Descoberta da opção Excluir

**O que faz:** Busca `Excluir`/`Delete` em menuitems/botões e faz polling até o timeout.

**Como faz:** Varre seletores compatíveis com Material/CDK e retorna o primeiro match textual exato.

**Por que foi implementado assim:** Menus podem ser renderizados em overlay fora da linha e mudar classes entre versões.

**Por que uma implementação ingênua seria pior:** Prender-se a uma classe única seria frágil; a busca global atual, porém, pode selecionar um Delete não relacionado se a UI mudar.

**Evidência:** ✅ PROVADO DIRETAMENTE no happy path por DEL-04/CG-44; ⚠️ timeout e múltiplos matches não têm teste focal.

### U11 — linhas 157–194 — Descoberta da confirmação

**O que faz:** Procura o botão final de confirmação, preferindo containers de diálogo e excluindo o item de menu anterior.

**Como faz:** Coleta buttons/role=button, remove menuitem/descendentes do item anterior e escolhe o último match exato `Excluir`/`Delete`.

**Por que foi implementado assim:** A UI repete o mesmo texto no menu e no diálogo; separar os dois reduz reclick acidental.

**Por que uma implementação ingênua seria pior:** Selecionar o primeiro botão global poderia clicar novamente no menu; o fallback para todo o root ainda é uma heurística vulnerável a múltiplos Deletes.

**Evidência:** ✅ PROVADO DIRETAMENTE no fluxo real por DEL-04/CG-44; ⚠️ fallback sem diálogo/múltiplos matches não têm prova específica.

### U12 — linhas 196–237 — Scroll lock de recovery

**O que faz:** Congela scroll do documento e ancestrais scrolláveis enquanto uma exclusão recuperada atua na linha escolhida.

**Como faz:** Guarda scrollTop/scrollLeft, restaura em eventos de scroll, bloqueia wheel/touchmove e retorna cleanup que remove listeners.

**Por que foi implementado assim:** Após reload, scroll automático ou do usuário pode mover o alvo entre localização e clique.

**Por que uma implementação ingênua seria pior:** Sem lock, a linha pode mudar sob o RPA; sem cleanup, a página ficaria permanentemente bloqueada.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — DEL-08 usa debugMode e retorna antes de instalar o scroll lock.

### U13 — linhas 239–250 — Mutex local e bypass de debug

**O que faz:** Recusa uma segunda exclusão concorrente e preserva a conversa quando debugMode está ativo.

**Como faz:** Liga `deletionInProgress` antes dos awaits; debug retorna true sem DOM; o finally libera o mutex.

**Por que foi implementado assim:** Dois fluxos destrutivos simultâneos seriam uma race; debug precisa conservar a conversa para diagnóstico.

**Por que uma implementação ingênua seria pior:** Sem mutex, menus/diálogos poderiam ser compartilhados por duas execuções; lançar em debug quebraria finalização que espera booleano.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-03 cobre debug/finally e DEL-06 cobre concorrência.

### U14 — linhas 252–266 — Idempotência e obtenção do chat ID

**O que faz:** Absorve repetição do chat já confirmado e aguarda até 8 s pela URL da conversa quando ainda não existe ID.

**Como faz:** Compara `lastDeletedChatId`; sem ID faz polling de 250 ms; expirado o prazo, aborta.

**Por que foi implementado assim:** O background pode repetir DELETE_CONVERSATION e a navegação do Gemini pode atualizar pathname tardiamente.

**Por que uma implementação ingênua seria pior:** Repetir clique destrutivo depois de ACK duplicado é perigoso; prosseguir sem ID permitiria apagar alvo não identificado.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-04 cobre idempotência; ⚠️ expiração real dos 8 s não tem teste focal.

### U15 — linhas 268–302 — Localização da linha alvo

**O que faz:** Abre a sidebar se necessário, encontra o anchor da conversa, centraliza/estabiliza e sobe até o container da linha.

**Como faz:** Usa seletor de href por substring, até 16 tentativas de 250 ms e para a subida antes de um ancestral que contém múltiplas conversas.

**Por que foi implementado assim:** O menu pertence ao row e a sidebar/DOM podem aparecer de forma assíncrona.

**Por que uma implementação ingênua seria pior:** Buscar qualquer menu global sem ancorar na conversa aumentaria risco de apagar chat errado; correspondência por substring ainda permite colisão como `chat-1` versus `chat-10`.

**Evidência:** ✅ PROVADO DIRETAMENTE no caminho simples por DEL-04/CG-44; ⚠️ sidebar fechada, colisão de substring e lockScroll real não têm teste focal.

### U16 — linhas 304–340 — Menu da linha e item destrutivo

**O que faz:** Seleciona o botão de opções do row, abre o menu, revalida a linha e clica no item Excluir estável.

**Como faz:** Prefere aria-haspopup/aria-expanded e usa o último botão como fallback; depois exige row conectado e o mesmo anchor presente.

**Por que foi implementado assim:** Revalidação reduz race entre localizar a conversa e abrir um overlay.

**Por que uma implementação ingênua seria pior:** Usar referência stale poderia atuar em linha diferente; o fallback pelo último botão depende da estrutura visual atual.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-04 e CG-44 verificam menu/item; ⚠️ ausência de menu, lista mutante e fallback não têm assertions específicas.

### U17 — linhas 343–370 — Confirmação, verificação e cleanup

**O que faz:** Clica a confirmação somente depois de estabilizá-la e só declara sucesso quando URL mudou e o link sumiu.

**Como faz:** Faz polling por até 6 s; qualquer falha vira DELETE_ERROR/false; finally sempre libera scroll lock e mutex.

**Por que foi implementado assim:** Clique não é evidência de efeito; dois sinais independentes reduzem falso positivo.

**Por que uma implementação ingênua seria pior:** Assumir sucesso após `.click()` perderia falhas silenciosas; exigir só URL ou só DOM aceitaria estados intermediários.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-04 prova sucesso, DEL-05 prova clique sem efeito, DEL-06 prova cleanup.

### U18 — linhas 372–391 — CRUD do journal de recovery

**O que faz:** Lê, remove e grava `{chatId, delivery, createdAt}` na chave por tabId.

**Como faz:** Reutiliza wrappers de storage e captura chat/timestamp no momento da persistência.

**Por que foi implementado assim:** Recovery precisa sobreviver a reload e preservar a delivery que ainda não foi enviada.

**Por que uma implementação ingênua seria pior:** Guardar só booleano não preservaria o payload; usar memória seria perdido no reload.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-07 confere save/read/clear; ⚠️ não há schema, TTL nem binding explícito a jobId/batchId.

### U19 — linhas 393–424 — Consumo do recovery

**O que faz:** Antes do job normal, tenta deletar novamente, apaga marker, registra resultado e reenvia delivery pendente.

**Como faz:** Ausência retorna handled false; presença usa lockScroll, remove o marker e depois aguarda `sendDelivery` quando fornecido.

**Por que foi implementado assim:** Evita reexecutar o job normal depois de reload e mantém a finalização pendente.

**Por que uma implementação ingênua seria pior:** Ignorar marker duplicaria trabalho; porém apagar antes de confirmação do envio cria uma janela de perda se sendDelivery rejeitar.

**Evidência:** ✅ PROVADO DIRETAMENTE — DEL-08/DEL-10 cobrem journal/dispatch; ⚠️ DEL-08 não prova DOM/scroll lock real.

### U20 — linhas 426–453 — Delete ou agenda recovery

**O que faz:** Tenta exclusão imediata; se falhar, salva recovery e opcionalmente recarrega a página.

**Como faz:** A persistência é aguardada antes de `location.reload`, e o retorno descreve delete/recovery/reload.

**Por que foi implementado assim:** A delivery deve ficar durável antes de destruir o estado da página.

**Por que uma implementação ingênua seria pior:** Reload antes do save perderia a finalização; enviar antes de deletar quebraria a ordem de segurança nos erros background/minimized.

**Evidência:** ✅ PROVADO DIRETAMENTE para o caminho de falha por DEL-09; ⚠️ fast-path deleted:true não tem teste específico do wrapper.

### U21 — linhas 455–477 — API pública do controller

**O que faz:** Expõe helpers de seleção, deleção, recovery e observação do mutex.

**Como faz:** Retorna referências fechadas sobre as dependências/estado privados da factory.

**Por que foi implementado assim:** Composition root e testes usam a implementação real sem expor mutação direta do estado.

**Por que uma implementação ingênua seria pior:** Duplicar wrappers com lógica própria criaria drift; expor flags mutáveis permitiria quebrar invariantes.

**Evidência:** 🟨 EXECUTADO por consumers; `getElementText` e `candidateCount` permanecem sem consumidor externo localizado.

### U22 — linhas 479–483 — Publicação global/CommonJS

**O que faz:** Publica a factory no global do content script, exporta a mesma API no CommonJS e fecha a IIFE; a última posição é o newline final.

**Como faz:** Browser consome `scope.MangaTranslatorGeminiDeletion`; Jest recebe `module.exports` da mesma fonte.

**Por que foi implementado assim:** Uma única implementação evita que testes validem código diferente de produção.

**Por que uma implementação ingênua seria pior:** APIs distintas para browser/teste poderiam gerar green tests sobre comportamento divergente.

**Evidência:** 🟦 GATE/HARNESS ESPECÍFICO — Manifest injeta este módulo antes do runner/bootstrap e DEL-01…10 fazem require do mesmo arquivo.

## 12. Fonte integral auditada

```javascript
'use strict';
// gemini/deletion.js — exclusão segura/idempotente e recovery da conversa Gemini.

(function(scope) {
  function createDeletionController({
    root = scope.document || null,
    pageWindow = scope.window || null,
    storage = scope.chrome?.storage?.local || null,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    sendLog = function() {},
    now = () => Date.now(),
    getComputedStyleImpl = scope.getComputedStyle
      ? scope.getComputedStyle.bind(scope)
      : null,
  } = {}) {
    let deletionInProgress = false;
    let lastDeletedChatId = null;

    function getElementText(element) {
      if (!element) return '';
      return [
        element.innerText,
        element.textContent,
        element.getAttribute?.('aria-label'),
        element.getAttribute?.('mattooltip'),
        element.getAttribute?.('title'),
        element.getAttribute?.('data-test-id'),
        element.getAttribute?.('data-testid'),
      ].filter(Boolean).join(' ').toLowerCase().trim();
    }

    function escapeCssAttributeValue(value) {
      const input = String(value || '');
      const css = scope.CSS || pageWindow?.CSS;
      if (css && typeof css.escape === 'function') return css.escape(input);
      return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function getCurrentChatId() {
      const pathname = String(pageWindow?.location?.pathname || '');
      const match = pathname.match(/\/app\/([a-z0-9_-]+)/i);
      return match && match[1] ? match[1] : null;
    }

    function getRecoveryKey(tabId) {
      return `gemini_delete_recovery_${tabId}`;
    }

    function storageGet(keys) {
      if (!storage || typeof storage.get !== 'function') {
        return Promise.resolve({});
      }
      return new Promise(resolve => {
        try {
          storage.get(keys, data => resolve(data || {}));
        } catch (_e) {
          resolve({});
        }
      });
    }

    function storageSet(values) {
      if (!storage || typeof storage.set !== 'function') return Promise.resolve();
      return new Promise((resolve, reject) => {
        try {
          const maybe = storage.set(values, () => {
            const lastError = scope.chrome?.runtime?.lastError;
            if (lastError) reject(new Error(lastError.message || 'Falha ao persistir recovery'));
            else resolve();
          });
          if (maybe && typeof maybe.then === 'function') {
            maybe.then(resolve, reject);
          }
        } catch (error) {
          reject(error);
        }
      });
    }

    function storageRemove(keys) {
      if (!storage || typeof storage.remove !== 'function') return Promise.resolve();
      return new Promise((resolve, reject) => {
        try {
          const maybe = storage.remove(keys, () => {
            const lastError = scope.chrome?.runtime?.lastError;
            if (lastError) reject(new Error(lastError.message || 'Falha ao remover recovery'));
            else resolve();
          });
          if (maybe && typeof maybe.then === 'function') {
            maybe.then(resolve, reject);
          }
        } catch (error) {
          reject(error);
        }
      });
    }

    async function waitForElementToSettle(element, samples = 3, interval = 300) {
      if (!element || element.isConnected === false) return false;

      let previous = null;
      for (let sample = 0; sample < samples; sample += 1) {
        if (element.isConnected === false) return false;

        let rect;
        try {
          rect = element.getBoundingClientRect();
        } catch (_e) {
          return false;
        }

        const position = [
          Math.round(rect.top || 0),
          Math.round(rect.left || 0),
          Math.round(rect.width || 0),
          Math.round(rect.height || 0),
        ].join(':');

        if (previous !== null && position !== previous) {
          // Reinicia a janela de estabilidade sem criar recursão/timer extra.
          sample = -1;
        }
        previous = position;
        await sleep(interval);
      }

      return element.isConnected !== false;
    }

    function findDeleteMenuItemCandidate() {
      if (!root || typeof root.querySelectorAll !== 'function') {
        return { item: null, candidateCount: 0 };
      }

      const candidates = Array.from(root.querySelectorAll(
        'div[role="menuitem"], [role="menu"] button, .mat-mdc-menu-item, button'
      ));

      const item = candidates.find(element =>
        /^(excluir|delete)$/i.test(String(element.textContent || '').trim())
      ) || null;

      return { item, candidateCount: candidates.length };
    }

    async function waitForDeleteMenuItem(timeout = 2000, interval = 100) {
      const startedAt = now();
      do {
        const result = findDeleteMenuItemCandidate();
        if (result.item) return result.item;
        if (now() - startedAt >= timeout) return null;
        await sleep(interval);
      } while (now() - startedAt < timeout);
      return null;
    }

    function findConfirmButtonCandidate(excludeElement = null) {
      if (!root || typeof root.querySelectorAll !== 'function') {
        return { item: null, candidateCount: 0 };
      }

      const dialogs = Array.from(root.querySelectorAll(
        '[role="dialog"], mat-dialog-container, .mat-mdc-dialog-container, .cdk-overlay-pane'
      ));
      const scopes = dialogs.length > 0 ? dialogs : [root];

      const candidates = scopes.flatMap(scopeElement =>
        Array.from(scopeElement.querySelectorAll('button, [role="button"]'))
      ).filter(element =>
        element !== excludeElement &&
        !(excludeElement?.contains?.(element)) &&
        element.getAttribute?.('role') !== 'menuitem'
      );

      const matches = candidates.filter(element =>
        /^(excluir|delete)$/i.test(String(element.textContent || '').trim())
      );

      return {
        item: matches.length ? matches[matches.length - 1] : null,
        candidateCount: candidates.length,
      };
    }

    async function waitForConfirmButton(excludeElement = null, timeout = 5000, interval = 200) {
      const startedAt = now();
      do {
        const result = findConfirmButtonCandidate(excludeElement);
        if (result.item) return result.item;
        if (now() - startedAt >= timeout) return null;
        await sleep(interval);
      } while (now() - startedAt < timeout);
      return null;
    }

    function createScrollLock(rowContainer) {
      if (!pageWindow || !root) return () => {};

      const targets = [root.scrollingElement];
      if (getComputedStyleImpl) {
        for (
          let parent = rowContainer?.parentElement;
          parent && parent !== root.body;
          parent = parent.parentElement
        ) {
          try {
            const style = getComputedStyleImpl(parent);
            if (/(auto|scroll)/.test(String(style?.overflowY || ''))) {
              targets.push(parent);
            }
          } catch (_e) {}
        }
      }

      const cleanups = [...new Set(targets.filter(Boolean))].map(target => {
        const top = target.scrollTop;
        const left = target.scrollLeft;
        const restore = () => {
          target.scrollTop = top;
          target.scrollLeft = left;
        };
        target.addEventListener?.('scroll', restore, { passive: true });
        return () => target.removeEventListener?.('scroll', restore);
      });

      const preventScrollInput = event => event.preventDefault();
      pageWindow.addEventListener?.('wheel', preventScrollInput, { passive: false });
      pageWindow.addEventListener?.('touchmove', preventScrollInput, { passive: false });

      return () => {
        cleanups.forEach(cleanup => {
          try { cleanup(); } catch (_e) {}
        });
        pageWindow.removeEventListener?.('wheel', preventScrollInput);
        pageWindow.removeEventListener?.('touchmove', preventScrollInput);
      };
    }

    async function deleteCurrentConversation({ lockScroll = false } = {}) {
      if (deletionInProgress) return false;
      deletionInProgress = true;

      let releaseScrollLock = () => {};

      try {
        const debugData = await storageGet(['debugMode']);
        if (debugData.debugMode === true) {
          sendLog('info', 'DEBUG_MODE_SKIP', 'Modo debug ativo, pulando deleção da conversa');
          return true;
        }

        let chatId = getCurrentChatId();
        // O background pode repetir DELETE_CONVERSATION após o ACK.
        if (lastDeletedChatId && (!chatId || chatId === lastDeletedChatId)) {
          sendLog('info', 'DELETE_ALREADY_CONFIRMED', 'Exclusão deste contexto já foi confirmada', {});
          return true;
        }
        if (!chatId) {
          sendLog('info', 'DELETE_WAIT_CHAT_ID', 'Aguardando URL da conversa ativa antes de excluir', {});
          const started = now();
          while (!chatId && now() - started < 8000) { await sleep(250); chatId = getCurrentChatId(); }
        }
        if (!chatId) throw new Error('A URL não possui o ID da conversa ativa após aguardar 8s.');

        const escapedChatId = escapeCssAttributeValue(chatId);
        const linkSelector = `a[href*="${escapedChatId}"]`;

        const sidebarToggle = root.querySelector(
          'button[data-test-id="side-nav-toggle"], button[aria-label*="menu" i], button[aria-label*="barra lateral" i]'
        );

        if (!root.querySelector(linkSelector) && sidebarToggle) {
          sidebarToggle.click();
          await sleep(700);
        }

        let activeLink = null;
        for (let attempt = 0; attempt < 16; attempt += 1) {
          activeLink = root.querySelector(linkSelector);
          if (activeLink) break;
          await sleep(250);
        }
        if (!activeLink) {
          throw new Error('A conversa ativa não foi localizada na barra lateral.');
        }

        activeLink.scrollIntoView?.({ block: 'center', behavior: 'instant' });
        await sleep(700);
        if (!await waitForElementToSettle(activeLink)) {
          throw new Error('A conversa alvo não estabilizou na barra lateral.');
        }

        let rowContainer = activeLink;
        while (rowContainer.parentElement) {
          const parent = rowContainer.parentElement;
          if (parent.querySelectorAll('a[href*="/app/"]').length > 1) break;
          rowContainer = parent;
        }

        if (lockScroll) {
          releaseScrollLock = createScrollLock(rowContainer);
        }

        const rowButtons = Array.from(
          rowContainer.querySelectorAll('button, [role="button"]')
        ).filter(button =>
          button !== activeLink &&
          !activeLink.contains?.(button)
        );

        const menuButton = rowButtons.find(button =>
          button.hasAttribute?.('aria-haspopup') ||
          button.hasAttribute?.('aria-expanded')
        ) || rowButtons[rowButtons.length - 1];

        if (!menuButton) {
          throw new Error('Menu de opções da conversa não encontrado.');
        }

        await sleep(400);
        menuButton.click();
        await sleep(700);

        if (
          rowContainer.isConnected === false ||
          !rowContainer.querySelector(linkSelector)
        ) {
          throw new Error('A lista mudou enquanto o menu era aberto.');
        }

        const deleteItem = await waitForDeleteMenuItem(2000, 100);
        if (!deleteItem) {
          throw new Error('Opção Excluir não encontrada no menu.');
        }
        if (!await waitForElementToSettle(deleteItem, 2, 250)) {
          throw new Error('A opção Excluir não permaneceu estável no menu.');
        }

        const deleteTarget = deleteItem.closest?.('div[role="menuitem"], li, button') || deleteItem;
        deleteTarget.click();
        await sleep(800);

        const confirmButton = await waitForConfirmButton(deleteItem, 5000, 200);
        if (!confirmButton) {
          throw new Error('Confirmação da exclusão não encontrada.');
        }
        if (!await waitForElementToSettle(confirmButton, 2, 300)) {
          throw new Error('O botão de confirmação não estabilizou no diálogo.');
        }

        confirmButton.click();
        const verificationStarted = now();
        let verified = false;
        do {
          await sleep(250);
          verified = getCurrentChatId() !== chatId && !root.querySelector(linkSelector);
        } while (!verified && now() - verificationStarted < 6000);
        if (!verified) throw new Error('Exclusão não confirmada: URL ou entrada da conversa continua presente.');
        lastDeletedChatId = chatId;

        sendLog('success', 'DELETE_OK', 'Conversa excluída com segurança!', { chatId });
        return true;
      } catch (error) {
        sendLog('warn', 'DELETE_ERROR', `Erro na deleção: ${error.message}`, {});
        return false;
      } finally {
        try { releaseScrollLock(); } catch (_e) {}
        deletionInProgress = false;
      }
    }

    async function readRecovery(tabId) {
      const key = getRecoveryKey(tabId);
      const data = await storageGet([key]);
      return data[key] || null;
    }

    async function clearRecovery(tabId) {
      await storageRemove(getRecoveryKey(tabId));
    }

    async function saveRecovery(tabId, delivery) {
      const key = getRecoveryKey(tabId);
      const recovery = {
        chatId: getCurrentChatId(),
        delivery,
        createdAt: now(),
      };
      await storageSet({ [key]: recovery });
      return recovery;
    }

    async function recoverPending({ tabId, sendDelivery } = {}) {
      const recovery = await readRecovery(tabId);
      if (!recovery || !recovery.delivery) {
        return {
          handled: false,
          deleted: false,
          recovery: null,
        };
      }

      const deleted = await deleteCurrentConversation({ lockScroll: true });
      await clearRecovery(tabId);

      sendLog(
        deleted ? 'success' : 'warn',
        'DELETE_RECOVERY',
        deleted
          ? 'Conversa excluída após recarregar a aba.'
          : 'Exclusão continuou sem confirmação após a recuperação.',
        { chatId: recovery.chatId || null }
      );

      if (typeof sendDelivery === 'function') {
        await sendDelivery(recovery.delivery);
      }

      return {
        handled: true,
        deleted,
        recovery,
      };
    }

    async function deleteOrScheduleRecovery({
      tabId,
      delivery,
      reload = true,
    } = {}) {
      const deleted = await deleteCurrentConversation();
      if (deleted) {
        return {
          deleted: true,
          recoverySaved: false,
          reloadScheduled: false,
        };
      }

      await saveRecovery(tabId, delivery);

      let reloadScheduled = false;
      if (reload && pageWindow?.location && typeof pageWindow.location.reload === 'function') {
        pageWindow.location.reload();
        reloadScheduled = true;
      }

      return {
        deleted: false,
        recoverySaved: true,
        reloadScheduled,
      };
    }

    function isDeletionInProgress() {
      return deletionInProgress;
    }

    return {
      getElementText,
      escapeCssAttributeValue,
      getCurrentChatId,
      getRecoveryKey,
      waitForElementToSettle,
      findDeleteMenuItemCandidate,
      waitForDeleteMenuItem,
      findConfirmButtonCandidate,
      waitForConfirmButton,
      deleteCurrentConversation,
      readRecovery,
      saveRecovery,
      clearRecovery,
      recoverPending,
      deleteOrScheduleRecovery,
      isDeletionInProgress,
    };
  }

  const api = { createDeletionController };
  scope.MangaTranslatorGeminiDeletion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

## 13. Cobertura linha a linha — 483/483

Cada posição aponta para a mesma posição da fonte integral. A unidade indicada contém o contexto completo de o que faz, como faz, por que a arquitetura usa essa forma e por que alternativas ingênuas são piores.

### Linha 001

**Unidade:** U01 — Envelope do módulo

**Papel local:** Habilita modo estrito para evitar globals implícitos e tornar atribuições inválidas erros visíveis.

### Linha 002

**Unidade:** U01 — Envelope do módulo

**Papel local:** Registra a responsabilidade concreta do arquivo: exclusão segura/idempotente e recovery de conversa Gemini.

### Linha 003

**Unidade:** U01 — Envelope do módulo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U01; não produz efeito de runtime.

### Linha 004

**Unidade:** U01 — Envelope do módulo

**Papel local:** Abre a IIFE que isola os internals no escopo fornecido.

### Linha 005

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Declara a factory e inicia a lista de dependências configuráveis.

### Linha 006

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Usa o documento do contexto como DOM padrão e admite ausência explícita.

### Linha 007

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Usa a window da página para pathname, reload e eventos de scroll.

### Linha 008

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Seleciona chrome.storage.local como journal durável padrão.

### Linha 009

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Define sleep Promise injetável para polling e testes determinísticos.

### Linha 010

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Define logger no-op por padrão para desacoplar o módulo do sistema de logs.

### Linha 011

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Injeta o relógio para permitir deadlines controláveis.

### Linha 012

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Começa a seleção de getComputedStyle usada no reconhecimento de containers scrolláveis.

### Linha 013

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Vincula getComputedStyle ao scope correto.

### Linha 014

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Cai para null quando a API de estilo não existe.

### Linha 015

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Define ou atualiza um valor/estado que participa do fluxo de U02.

### Linha 016

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Inicializa o mutex local de exclusão.

### Linha 017

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Inicializa memória efêmera do último chat cuja exclusão foi confirmada.

### Linha 018

**Unidade:** U02 — Factory, dependências e estado efêmero

**Papel local:** Linha vazia que separa visualmente blocos da unidade U02; não produz efeito de runtime.

### Linha 019

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Declara a rotina que implementa Normalização textual auxiliar.

### Linha 020

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Retorna string vazia para elemento ausente.

### Linha 021

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Encerra o caminho atual de U03 com o valor/objeto declarado na fonte.

### Linha 022

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Parte sintática/operacional de U03 necessária para compor o comportamento descrito para Normalização textual auxiliar.

### Linha 023

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Parte sintática/operacional de U03 necessária para compor o comportamento descrito para Normalização textual auxiliar.

### Linha 024

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Parte sintática/operacional de U03 necessária para compor o comportamento descrito para Normalização textual auxiliar.

### Linha 025

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Parte sintática/operacional de U03 necessária para compor o comportamento descrito para Normalização textual auxiliar.

### Linha 026

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Parte sintática/operacional de U03 necessária para compor o comportamento descrito para Normalização textual auxiliar.

### Linha 027

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Parte sintática/operacional de U03 necessária para compor o comportamento descrito para Normalização textual auxiliar.

### Linha 028

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Parte sintática/operacional de U03 necessária para compor o comportamento descrito para Normalização textual auxiliar.

### Linha 029

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Remove campos vazios, concatena sinais textuais, converte para minúsculas e aplica trim.

### Linha 030

**Unidade:** U03 — Normalização textual auxiliar

**Papel local:** Fecha a estrutura sintática aberta pela unidade U03, preservando seus limites de escopo/expressão.

### Linha 031

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 032

**Unidade:** U04 — Escape para seletor CSS

**Papel local:** Declara a rotina que implementa Escape para seletor CSS.

### Linha 033

**Unidade:** U04 — Escape para seletor CSS

**Papel local:** Normaliza valor nulo/indefinido para string antes do escape.

### Linha 034

**Unidade:** U04 — Escape para seletor CSS

**Papel local:** Escolhe CSS do scope ou da pageWindow injetada.

### Linha 035

**Unidade:** U04 — Escape para seletor CSS

**Papel local:** Delega a CSS.escape quando a API nativa existe.

### Linha 036

**Unidade:** U04 — Escape para seletor CSS

**Papel local:** Fallback duplica barras invertidas e protege aspas duplas no seletor.

### Linha 037

**Unidade:** U04 — Escape para seletor CSS

**Papel local:** Fecha a estrutura sintática aberta pela unidade U04, preservando seus limites de escopo/expressão.

### Linha 038

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 039

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Declara a rotina que implementa Identidade da conversa e chave do recovery.

### Linha 040

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Obtém pathname sem presumir que window/location existem.

### Linha 041

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Extrai o primeiro identificador permitido depois de /app/.

### Linha 042

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Retorna o ID capturado ou null; identidade não vem do payload externo.

### Linha 043

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U05, preservando seus limites de escopo/expressão.

### Linha 044

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U05; não produz efeito de runtime.

### Linha 045

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Declara a rotina que implementa Identidade da conversa e chave do recovery.

### Linha 046

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Namespaceia recovery pelo tabId da aba Gemini.

### Linha 047

**Unidade:** U05 — Identidade da conversa e chave do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U05, preservando seus limites de escopo/expressão.

### Linha 048

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 049

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Declara a rotina que implementa Leitura tolerante do storage.

### Linha 050

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Detecta storage inexistente ou sem método get.

### Linha 051

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Modela leitura indisponível como estado vazio.

### Linha 052

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Fecha a estrutura sintática aberta pela unidade U06, preservando seus limites de escopo/expressão.

### Linha 053

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Encerra o caminho atual de U06 com o valor/objeto declarado na fonte.

### Linha 054

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Abre tratamento protegido para que falhas deste trecho sejam convertidas no contrato seguro da unidade U06.

### Linha 055

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Executa leitura callback-style e normaliza retorno falsy.

### Linha 056

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Captura throw síncrono da leitura.

### Linha 057

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Resolve leitura falha como objeto vazio.

### Linha 058

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Fecha a estrutura sintática aberta pela unidade U06, preservando seus limites de escopo/expressão.

### Linha 059

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Fecha a estrutura sintática aberta pela unidade U06, preservando seus limites de escopo/expressão.

### Linha 060

**Unidade:** U06 — Leitura tolerante do storage

**Papel local:** Fecha a estrutura sintática aberta pela unidade U06, preservando seus limites de escopo/expressão.

### Linha 061

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 062

**Unidade:** U07 — Persistência do recovery

**Papel local:** Declara a rotina que implementa Persistência do recovery.

### Linha 063

**Unidade:** U07 — Persistência do recovery

**Papel local:** Sem storage.set, resolve como no-op; isso preserva compatibilidade mas não durabilidade.

### Linha 064

**Unidade:** U07 — Persistência do recovery

**Papel local:** Encerra o caminho atual de U07 com o valor/objeto declarado na fonte.

### Linha 065

**Unidade:** U07 — Persistência do recovery

**Papel local:** Abre tratamento protegido para que falhas deste trecho sejam convertidas no contrato seguro da unidade U07.

### Linha 066

**Unidade:** U07 — Persistência do recovery

**Papel local:** Inicia storage.set e captura eventual Promise retornada.

### Linha 067

**Unidade:** U07 — Persistência do recovery

**Papel local:** Lê runtime.lastError dentro do callback da API Chrome.

### Linha 068

**Unidade:** U07 — Persistência do recovery

**Papel local:** Transforma lastError em rejeição da persistência.

### Linha 069

**Unidade:** U07 — Persistência do recovery

**Papel local:** Confirma persistência quando callback não reporta erro.

### Linha 070

**Unidade:** U07 — Persistência do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U07, preservando seus limites de escopo/expressão.

### Linha 071

**Unidade:** U07 — Persistência do recovery

**Papel local:** Detecta implementação que também retorna Promise.

### Linha 072

**Unidade:** U07 — Persistência do recovery

**Papel local:** Encadeia resolução/rejeição da Promise retornada.

### Linha 073

**Unidade:** U07 — Persistência do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U07, preservando seus limites de escopo/expressão.

### Linha 074

**Unidade:** U07 — Persistência do recovery

**Papel local:** Captura throw síncrono de storage.set.

### Linha 075

**Unidade:** U07 — Persistência do recovery

**Papel local:** Rejeita para impedir que caller suponha journal persistido.

### Linha 076

**Unidade:** U07 — Persistência do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U07, preservando seus limites de escopo/expressão.

### Linha 077

**Unidade:** U07 — Persistência do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U07, preservando seus limites de escopo/expressão.

### Linha 078

**Unidade:** U07 — Persistência do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U07, preservando seus limites de escopo/expressão.

### Linha 079

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 080

**Unidade:** U08 — Remoção do recovery

**Papel local:** Declara a rotina que implementa Remoção do recovery.

### Linha 081

**Unidade:** U08 — Remoção do recovery

**Papel local:** Sem storage.remove, cleanup vira no-op resolvido.

### Linha 082

**Unidade:** U08 — Remoção do recovery

**Papel local:** Encerra o caminho atual de U08 com o valor/objeto declarado na fonte.

### Linha 083

**Unidade:** U08 — Remoção do recovery

**Papel local:** Abre tratamento protegido para que falhas deste trecho sejam convertidas no contrato seguro da unidade U08.

### Linha 084

**Unidade:** U08 — Remoção do recovery

**Papel local:** Inicia remoção da chave de recovery.

### Linha 085

**Unidade:** U08 — Remoção do recovery

**Papel local:** Inspeciona lastError no callback de remoção.

### Linha 086

**Unidade:** U08 — Remoção do recovery

**Papel local:** Rejeita quando Chrome informa falha de remoção.

### Linha 087

**Unidade:** U08 — Remoção do recovery

**Papel local:** Parte sintática/operacional de U08 necessária para compor o comportamento descrito para Remoção do recovery.

### Linha 088

**Unidade:** U08 — Remoção do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U08, preservando seus limites de escopo/expressão.

### Linha 089

**Unidade:** U08 — Remoção do recovery

**Papel local:** Suporta implementação Promise de remove.

### Linha 090

**Unidade:** U08 — Remoção do recovery

**Papel local:** Parte sintática/operacional de U08 necessária para compor o comportamento descrito para Remoção do recovery.

### Linha 091

**Unidade:** U08 — Remoção do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U08, preservando seus limites de escopo/expressão.

### Linha 092

**Unidade:** U08 — Remoção do recovery

**Papel local:** Parte sintática/operacional de U08 necessária para compor o comportamento descrito para Remoção do recovery.

### Linha 093

**Unidade:** U08 — Remoção do recovery

**Papel local:** Parte sintática/operacional de U08 necessária para compor o comportamento descrito para Remoção do recovery.

### Linha 094

**Unidade:** U08 — Remoção do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U08, preservando seus limites de escopo/expressão.

### Linha 095

**Unidade:** U08 — Remoção do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U08, preservando seus limites de escopo/expressão.

### Linha 096

**Unidade:** U08 — Remoção do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U08, preservando seus limites de escopo/expressão.

### Linha 097

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 098

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Declara verificador assíncrono de estabilidade com três amostras de 300 ms por padrão.

### Linha 099

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Falha imediatamente para alvo ausente ou desconectado.

### Linha 100

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Linha vazia que separa visualmente blocos da unidade U09; não produz efeito de runtime.

### Linha 101

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Inicializa snapshot geométrico anterior.

### Linha 102

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Inicia a janela de amostragem de estabilidade.

### Linha 103

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Revalida conexão antes de cada leitura de layout.

### Linha 104

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Linha vazia que separa visualmente blocos da unidade U09; não produz efeito de runtime.

### Linha 105

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Declara estado local mutável usado ao longo de U09.

### Linha 106

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Abre tratamento protegido para que falhas deste trecho sejam convertidas no contrato seguro da unidade U09.

### Linha 107

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Lê getBoundingClientRect do alvo.

### Linha 108

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Parte sintática/operacional de U09 necessária para compor o comportamento descrito para Estabilidade geométrica.

### Linha 109

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Converte falha de leitura de layout em false seguro.

### Linha 110

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Fecha a estrutura sintática aberta pela unidade U09, preservando seus limites de escopo/expressão.

### Linha 111

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Linha vazia que separa visualmente blocos da unidade U09; não produz efeito de runtime.

### Linha 112

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Começa a assinatura top/left/width/height usada na comparação.

### Linha 113

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Parte sintática/operacional de U09 necessária para compor o comportamento descrito para Estabilidade geométrica.

### Linha 114

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Parte sintática/operacional de U09 necessária para compor o comportamento descrito para Estabilidade geométrica.

### Linha 115

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Parte sintática/operacional de U09 necessária para compor o comportamento descrito para Estabilidade geométrica.

### Linha 116

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Parte sintática/operacional de U09 necessária para compor o comportamento descrito para Estabilidade geométrica.

### Linha 117

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Serializa a geometria arredondada em uma chave comparável.

### Linha 118

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Linha vazia que separa visualmente blocos da unidade U09; não produz efeito de runtime.

### Linha 119

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Detecta mudança de posição ou tamanho.

### Linha 120

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Explica que a janela é reiniciada sem recursão/timer extra.

### Linha 121

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Reinicia o contador de amostras; sem deadline global, movimento contínuo pode impedir término.

### Linha 122

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Fecha a estrutura sintática aberta pela unidade U09, preservando seus limites de escopo/expressão.

### Linha 123

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Atualiza a geometria de referência.

### Linha 124

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Espera o intervalo configurado antes da próxima amostra.

### Linha 125

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Fecha a estrutura sintática aberta pela unidade U09, preservando seus limites de escopo/expressão.

### Linha 126

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Linha vazia que separa visualmente blocos da unidade U09; não produz efeito de runtime.

### Linha 127

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Só retorna sucesso se o elemento ainda está conectado no final.

### Linha 128

**Unidade:** U09 — Estabilidade geométrica

**Papel local:** Fecha a estrutura sintática aberta pela unidade U09, preservando seus limites de escopo/expressão.

### Linha 129

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 130

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Declara a rotina que implementa Descoberta da opção Excluir.

### Linha 131

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Protege execução quando root/querySelectorAll não existem.

### Linha 132

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Retorna candidato nulo e contagem zero em DOM incompatível.

### Linha 133

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Fecha a estrutura sintática aberta pela unidade U10, preservando seus limites de escopo/expressão.

### Linha 134

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Linha vazia que separa visualmente blocos da unidade U10; não produz efeito de runtime.

### Linha 135

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Materializa candidatos de menuitems e botões de vários padrões.

### Linha 136

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Define ou atualiza um valor/estado que participa do fluxo de U10.

### Linha 137

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Fecha a estrutura sintática aberta pela unidade U10, preservando seus limites de escopo/expressão.

### Linha 138

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Linha vazia que separa visualmente blocos da unidade U10; não produz efeito de runtime.

### Linha 139

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Procura o primeiro candidato com rótulo destrutivo exato.

### Linha 140

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Regex exata aceita português e inglês sem casar textos mais longos.

### Linha 141

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Parte sintática/operacional de U10 necessária para compor o comportamento descrito para Descoberta da opção Excluir.

### Linha 142

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Linha vazia que separa visualmente blocos da unidade U10; não produz efeito de runtime.

### Linha 143

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Retorna item e contagem; candidateCount não tem consumer atual.

### Linha 144

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Fecha a estrutura sintática aberta pela unidade U10, preservando seus limites de escopo/expressão.

### Linha 145

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Linha vazia que separa visualmente blocos da unidade U10; não produz efeito de runtime.

### Linha 146

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Declara a rotina que implementa Descoberta da opção Excluir.

### Linha 147

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Marca o início do deadline do item de menu.

### Linha 148

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Parte sintática/operacional de U10 necessária para compor o comportamento descrito para Descoberta da opção Excluir.

### Linha 149

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Refaz a descoberta em cada poll.

### Linha 150

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Retorna assim que a opção aparece.

### Linha 151

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Encerra com null ao atingir timeout.

### Linha 152

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Aguarda antes da próxima busca.

### Linha 153

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Parte sintática/operacional de U10 necessária para compor o comportamento descrito para Descoberta da opção Excluir.

### Linha 154

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Encerra o caminho atual de U10 com o valor/objeto declarado na fonte.

### Linha 155

**Unidade:** U10 — Descoberta da opção Excluir

**Papel local:** Fecha a estrutura sintática aberta pela unidade U10, preservando seus limites de escopo/expressão.

### Linha 156

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 157

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Declara busca da confirmação e recebe o item anterior a excluir da seleção.

### Linha 158

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Aplica uma condição de segurança/fluxo dentro de U11: if (!root || typeof root.querySelectorAll !== 'function') {

### Linha 159

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Encerra o caminho atual de U11 com o valor/objeto declarado na fonte.

### Linha 160

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Fecha a estrutura sintática aberta pela unidade U11, preservando seus limites de escopo/expressão.

### Linha 161

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Linha vazia que separa visualmente blocos da unidade U11; não produz efeito de runtime.

### Linha 162

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Localiza containers reconhecidos como diálogo Material/CDK.

### Linha 163

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Define ou atualiza um valor/estado que participa do fluxo de U11.

### Linha 164

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Fecha a estrutura sintática aberta pela unidade U11, preservando seus limites de escopo/expressão.

### Linha 165

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Prefere diálogos; sem um deles, expande a busca para root inteiro.

### Linha 166

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Linha vazia que separa visualmente blocos da unidade U11; não produz efeito de runtime.

### Linha 167

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Coleta buttons e elementos role=button.

### Linha 168

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Define ou atualiza um valor/estado que participa do fluxo de U11.

### Linha 169

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Define ou atualiza um valor/estado que participa do fluxo de U11.

### Linha 170

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Remove o próprio item de menu da lista de confirmação.

### Linha 171

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Remove descendentes do item de menu.

### Linha 172

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Descarta elementos ainda marcados como menuitem.

### Linha 173

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Fecha a estrutura sintática aberta pela unidade U11, preservando seus limites de escopo/expressão.

### Linha 174

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Linha vazia que separa visualmente blocos da unidade U11; não produz efeito de runtime.

### Linha 175

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Filtra por texto exato Excluir/Delete.

### Linha 176

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Parte sintática/operacional de U11 necessária para compor o comportamento descrito para Descoberta da confirmação.

### Linha 177

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Fecha a estrutura sintática aberta pela unidade U11, preservando seus limites de escopo/expressão.

### Linha 178

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Linha vazia que separa visualmente blocos da unidade U11; não produz efeito de runtime.

### Linha 179

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Encerra o caminho atual de U11 com o valor/objeto declarado na fonte.

### Linha 180

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Escolhe o último match; é uma heurística para a ação final do diálogo.

### Linha 181

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Retorna também a quantidade total de candidatos.

### Linha 182

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Fecha a estrutura sintática aberta pela unidade U11, preservando seus limites de escopo/expressão.

### Linha 183

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Fecha a estrutura sintática aberta pela unidade U11, preservando seus limites de escopo/expressão.

### Linha 184

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Linha vazia que separa visualmente blocos da unidade U11; não produz efeito de runtime.

### Linha 185

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Inicia polling do botão final com timeout de 5 s.

### Linha 186

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Declara um valor local necessário ao cálculo/decisão de U11.

### Linha 187

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Parte sintática/operacional de U11 necessária para compor o comportamento descrito para Descoberta da confirmação.

### Linha 188

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Refaz a busca em cada ciclo.

### Linha 189

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Retorna a confirmação assim que disponível.

### Linha 190

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Encerra com null quando o prazo acabou.

### Linha 191

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Aguarda o efeito assíncrono desta etapa antes de permitir a continuação de U11.

### Linha 192

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Parte sintática/operacional de U11 necessária para compor o comportamento descrito para Descoberta da confirmação.

### Linha 193

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Encerra o caminho atual de U11 com o valor/objeto declarado na fonte.

### Linha 194

**Unidade:** U11 — Descoberta da confirmação

**Papel local:** Fecha a estrutura sintática aberta pela unidade U11, preservando seus limites de escopo/expressão.

### Linha 195

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 196

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Declara a rotina que implementa Scroll lock de recovery.

### Linha 197

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Sem window/root retorna cleanup no-op e não instala listeners.

### Linha 198

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U12; não produz efeito de runtime.

### Linha 199

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Começa alvos de scroll pelo scrollingElement do documento.

### Linha 200

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Só procura ancestrais scrolláveis quando getComputedStyle existe.

### Linha 201

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Inicia a iteração controlada usada por U12: for (

### Linha 202

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Começa a subida pelo pai da linha alvo.

### Linha 203

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Para antes do body.

### Linha 204

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Avança um ancestral por iteração.

### Linha 205

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Parte sintática/operacional de U12 necessária para compor o comportamento descrito para Scroll lock de recovery.

### Linha 206

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Abre tratamento protegido para que falhas deste trecho sejam convertidas no contrato seguro da unidade U12.

### Linha 207

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Obtém o estilo computado do ancestral.

### Linha 208

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Reconhece overflowY auto/scroll como container móvel.

### Linha 209

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Adiciona esse ancestral aos alvos congelados.

### Linha 210

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U12, preservando seus limites de escopo/expressão.

### Linha 211

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Ignora erro de estilo de um ancestral para continuar best-effort.

### Linha 212

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U12, preservando seus limites de escopo/expressão.

### Linha 213

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U12, preservando seus limites de escopo/expressão.

### Linha 214

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U12; não produz efeito de runtime.

### Linha 215

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Deduplica alvos e cria um cleanup por elemento real.

### Linha 216

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Captura a posição vertical original.

### Linha 217

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Captura a posição horizontal original.

### Linha 218

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Declara restaurador de posição para eventos de scroll.

### Linha 219

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Restaura scrollTop.

### Linha 220

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Restaura scrollLeft.

### Linha 221

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U12, preservando seus limites de escopo/expressão.

### Linha 222

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Instala listener passivo que desfaz deslocamentos.

### Linha 223

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Retorna closure que remove exatamente esse listener.

### Linha 224

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U12, preservando seus limites de escopo/expressão.

### Linha 225

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U12; não produz efeito de runtime.

### Linha 226

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Declara handler que cancela entrada de scroll do usuário.

### Linha 227

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Bloqueia wheel com listener não-passivo para permitir preventDefault.

### Linha 228

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Bloqueia touchmove pelo mesmo motivo.

### Linha 229

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U12; não produz efeito de runtime.

### Linha 230

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Retorna cleanup composto do scroll lock.

### Linha 231

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Executa todos os cleanups de containers.

### Linha 232

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Isola falha de um cleanup para não impedir os restantes.

### Linha 233

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U12, preservando seus limites de escopo/expressão.

### Linha 234

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Remove listener global de wheel.

### Linha 235

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Remove listener global de touchmove.

### Linha 236

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U12, preservando seus limites de escopo/expressão.

### Linha 237

**Unidade:** U12 — Scroll lock de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U12, preservando seus limites de escopo/expressão.

### Linha 238

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 239

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Declara a operação destrutiva principal; lockScroll é opt-in.

### Linha 240

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Recusa imediatamente segunda exclusão concorrente.

### Linha 241

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Marca exclusão ativa antes de qualquer await.

### Linha 242

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Linha vazia que separa visualmente blocos da unidade U13; não produz efeito de runtime.

### Linha 243

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Inicializa cleanup de scroll como no-op para finally uniforme.

### Linha 244

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Linha vazia que separa visualmente blocos da unidade U13; não produz efeito de runtime.

### Linha 245

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Abre bloco protegido que converte falhas em booleano.

### Linha 246

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Lê debugMode antes de tocar no DOM.

### Linha 247

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Detecta debug explicitamente habilitado.

### Linha 248

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Registra que a conversa será preservada.

### Linha 249

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Retorna true como sucesso intencional de preservação, não como prova de remoção física.

### Linha 250

**Unidade:** U13 — Mutex local e bypass de debug

**Papel local:** Fecha a estrutura sintática aberta pela unidade U13, preservando seus limites de escopo/expressão.

### Linha 251

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 252

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Obtém o chatId da URL atual.

### Linha 253

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Documenta que o background pode repetir DELETE_CONVERSATION.

### Linha 254

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Reconhece o mesmo chat já confirmado, inclusive quando o pathname perdeu o ID.

### Linha 255

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Registra idempotência em vez de repetir clique destrutivo.

### Linha 256

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Retorna sucesso idempotente sem novo efeito.

### Linha 257

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Fecha a estrutura sintática aberta pela unidade U14, preservando seus limites de escopo/expressão.

### Linha 258

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Entra em polling apenas quando ainda não existe chatId.

### Linha 259

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Registra a espera pela URL ativa.

### Linha 260

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Marca início do prazo de 8 s.

### Linha 261

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Faz polling de 250 ms do pathname até obter ID ou expirar.

### Linha 262

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Fecha a estrutura sintática aberta pela unidade U14, preservando seus limites de escopo/expressão.

### Linha 263

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Aborta sem ID para impedir exclusão sem identidade.

### Linha 264

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Linha vazia que separa visualmente blocos da unidade U14; não produz efeito de runtime.

### Linha 265

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Escapa o ID antes da interpolação CSS.

### Linha 266

**Unidade:** U14 — Idempotência e obtenção do chat ID

**Papel local:** Monta seletor de href por substring; ancora no ID mas pode colidir com IDs que se contêm mutuamente.

### Linha 267

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 268

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Procura controles conhecidos de abertura da sidebar.

### Linha 269

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Define ou atualiza um valor/estado que participa do fluxo de U15.

### Linha 270

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U15, preservando seus limites de escopo/expressão.

### Linha 271

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U15; não produz efeito de runtime.

### Linha 272

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Só abre sidebar quando o anchor ainda não está no DOM.

### Linha 273

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Clica no toggle da sidebar.

### Linha 274

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Espera a lista ser materializada.

### Linha 275

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U15, preservando seus limites de escopo/expressão.

### Linha 276

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U15; não produz efeito de runtime.

### Linha 277

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Inicializa a referência do link alvo.

### Linha 278

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Limita a busca ativa a 16 tentativas.

### Linha 279

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Consulta anchor cujo href contém o chatId.

### Linha 280

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Sai do loop assim que encontra o alvo.

### Linha 281

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Espera 250 ms entre tentativas.

### Linha 282

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U15, preservando seus limites de escopo/expressão.

### Linha 283

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Detecta falha definitiva de localização.

### Linha 284

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Aborta antes de qualquer clique destrutivo se o anchor não aparece.

### Linha 285

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U15, preservando seus limites de escopo/expressão.

### Linha 286

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U15; não produz efeito de runtime.

### Linha 287

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Centraliza a linha para reduzir lazy rendering e geometria stale.

### Linha 288

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Espera scroll/reflow antes da verificação.

### Linha 289

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Exige estabilidade do anchor.

### Linha 290

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Aborta se a linha desconecta ou não estabiliza.

### Linha 291

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U15, preservando seus limites de escopo/expressão.

### Linha 292

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U15; não produz efeito de runtime.

### Linha 293

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Começa com o anchor como possível row container.

### Linha 294

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Sobe pelos wrappers enquanto há parent.

### Linha 295

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Inspeciona o parent atual.

### Linha 296

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Para antes de um ancestral que já agrega múltiplos chats.

### Linha 297

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Promove parent a rowContainer quando ainda representa uma conversa.

### Linha 298

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U15, preservando seus limites de escopo/expressão.

### Linha 299

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U15; não produz efeito de runtime.

### Linha 300

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Ativa scroll lock apenas quando solicitado pelo recovery.

### Linha 301

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Instala o lock e guarda a closure para finally.

### Linha 302

**Unidade:** U15 — Localização da linha alvo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U15, preservando seus limites de escopo/expressão.

### Linha 303

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 304

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Coleta botões e role=button pertencentes ao row.

### Linha 305

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Define ou atualiza um valor/estado que participa do fluxo de U16.

### Linha 306

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Inicia filtro que elimina o próprio anchor e seus descendentes.

### Linha 307

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Exclui o anchor da seleção.

### Linha 308

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Exclui botões dentro do anchor.

### Linha 309

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U16, preservando seus limites de escopo/expressão.

### Linha 310

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U16; não produz efeito de runtime.

### Linha 311

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Prefere botão semanticamente marcado como popup/expanded.

### Linha 312

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Aceita aria-haspopup como principal sinal de menu.

### Linha 313

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Aceita aria-expanded como sinal alternativo.

### Linha 314

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Sem ARIA, cai para o último botão do row, heurística dependente da estrutura.

### Linha 315

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U16; não produz efeito de runtime.

### Linha 316

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Detecta row sem botão de opções.

### Linha 317

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Aborta antes de buscar Excluir globalmente quando não há menuButton.

### Linha 318

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U16, preservando seus limites de escopo/expressão.

### Linha 319

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U16; não produz efeito de runtime.

### Linha 320

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Dá margem antes do clique.

### Linha 321

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Abre o menu da conversa candidata.

### Linha 322

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Espera overlay/menu aparecer.

### Linha 323

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U16; não produz efeito de runtime.

### Linha 324

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Revalida a linha depois do clique que pode re-renderizar a lista.

### Linha 325

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Falha se rowContainer foi desconectado.

### Linha 326

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Falha se o link alvo não pertence mais ao mesmo row.

### Linha 327

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Parte sintática/operacional de U16 necessária para compor o comportamento descrito para Menu da linha e item destrutivo.

### Linha 328

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Aborta a race para não continuar sobre UI stale.

### Linha 329

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U16, preservando seus limites de escopo/expressão.

### Linha 330

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U16; não produz efeito de runtime.

### Linha 331

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Espera até 2 s pelo item Excluir.

### Linha 332

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Detecta ausência do item destrutivo.

### Linha 333

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Aborta sem inventar fallback destrutivo.

### Linha 334

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U16, preservando seus limites de escopo/expressão.

### Linha 335

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Exige estabilidade de duas amostras para o item.

### Linha 336

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Aborta se o item não se mantém estável.

### Linha 337

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Fecha a estrutura sintática aberta pela unidade U16, preservando seus limites de escopo/expressão.

### Linha 338

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Linha vazia que separa visualmente blocos da unidade U16; não produz efeito de runtime.

### Linha 339

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Normaliza o alvo clicável para menuitem/li/button mais próximo.

### Linha 340

**Unidade:** U16 — Menu da linha e item destrutivo

**Papel local:** Clica na ação Excluir do menu.

### Linha 341

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Espera o diálogo/efeito intermediário.

### Linha 342

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 343

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Espera até 5 s pelo botão de confirmação.

### Linha 344

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Detecta ausência da confirmação.

### Linha 345

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Aborta em vez de clicar outro controle aproximado.

### Linha 346

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Fecha a estrutura sintática aberta pela unidade U17, preservando seus limites de escopo/expressão.

### Linha 347

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Exige estabilidade do botão final.

### Linha 348

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Aborta quando a confirmação não estabiliza.

### Linha 349

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Fecha a estrutura sintática aberta pela unidade U17, preservando seus limites de escopo/expressão.

### Linha 350

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Linha vazia que separa visualmente blocos da unidade U17; não produz efeito de runtime.

### Linha 351

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Executa o clique destrutivo final.

### Linha 352

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Marca início da janela de verificação de efeito.

### Linha 353

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Inicializa a flag de confirmação observada.

### Linha 354

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Abre o loop pós-clique.

### Linha 355

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Espera navegação/DOM refletirem o efeito.

### Linha 356

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Só confirma quando pathname mudou e o anchor sumiu simultaneamente.

### Linha 357

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Repete até confirmação ou prazo de 6 s.

### Linha 358

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Transforma falta de confirmação em erro, mesmo depois do clique.

### Linha 359

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Memoriza o chat confirmado para absorver mensagem duplicada no mesmo contexto.

### Linha 360

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Linha vazia que separa visualmente blocos da unidade U17; não produz efeito de runtime.

### Linha 361

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Registra DELETE_OK incluindo chatId; o sanitizador atual não redige essa chave.

### Linha 362

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Retorna true somente após confirmação observável.

### Linha 363

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Centraliza falhas no caminho de erro.

### Linha 364

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Registra DELETE_ERROR e não relança para permitir recovery/defer.

### Linha 365

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Retorna false em falha.

### Linha 366

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Abre cleanup incondicional.

### Linha 367

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Libera scroll lock best-effort mesmo após erro ou retorno.

### Linha 368

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Sempre libera o mutex local.

### Linha 369

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Fecha a estrutura sintática aberta pela unidade U17, preservando seus limites de escopo/expressão.

### Linha 370

**Unidade:** U17 — Confirmação, verificação e cleanup

**Papel local:** Fecha a estrutura sintática aberta pela unidade U17, preservando seus limites de escopo/expressão.

### Linha 371

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 372

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Declara leitura de recovery por tabId.

### Linha 373

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Deriva a chave namespaced.

### Linha 374

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Lê apenas essa chave.

### Linha 375

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Retorna o registro ou null.

### Linha 376

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U18, preservando seus limites de escopo/expressão.

### Linha 377

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U18; não produz efeito de runtime.

### Linha 378

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Declara remoção do recovery consumido.

### Linha 379

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Aguarda remoção da chave.

### Linha 380

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U18, preservando seus limites de escopo/expressão.

### Linha 381

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U18; não produz efeito de runtime.

### Linha 382

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Declara persistência antes de reload.

### Linha 383

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Deriva a chave da aba.

### Linha 384

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Abre o record durável.

### Linha 385

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Captura chatId para correlação.

### Linha 386

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Armazena a delivery inteira a reenviar.

### Linha 387

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Registra createdAt; atualmente não existe TTL que o consuma.

### Linha 388

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U18, preservando seus limites de escopo/expressão.

### Linha 389

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Persiste o record sob a chave da aba.

### Linha 390

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Retorna o mesmo objeto persistido.

### Linha 391

**Unidade:** U18 — CRUD do journal de recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U18, preservando seus limites de escopo/expressão.

### Linha 392

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 393

**Unidade:** U19 — Consumo do recovery

**Papel local:** Declara consumo de recovery no início do runner.

### Linha 394

**Unidade:** U19 — Consumo do recovery

**Papel local:** Lê marker da aba atual.

### Linha 395

**Unidade:** U19 — Consumo do recovery

**Papel local:** Distingue ausência ou record sem delivery.

### Linha 396

**Unidade:** U19 — Consumo do recovery

**Papel local:** Encerra o caminho atual de U19 com o valor/objeto declarado na fonte.

### Linha 397

**Unidade:** U19 — Consumo do recovery

**Papel local:** Sinaliza que nenhum recovery foi tratado.

### Linha 398

**Unidade:** U19 — Consumo do recovery

**Papel local:** Sinaliza que nenhuma exclusão ocorreu.

### Linha 399

**Unidade:** U19 — Consumo do recovery

**Papel local:** Expõe recovery null explicitamente.

### Linha 400

**Unidade:** U19 — Consumo do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U19, preservando seus limites de escopo/expressão.

### Linha 401

**Unidade:** U19 — Consumo do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U19, preservando seus limites de escopo/expressão.

### Linha 402

**Unidade:** U19 — Consumo do recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U19; não produz efeito de runtime.

### Linha 403

**Unidade:** U19 — Consumo do recovery

**Papel local:** Tenta exclusão novamente com scroll lock habilitado.

### Linha 404

**Unidade:** U19 — Consumo do recovery

**Papel local:** Remove o marker independentemente de a exclusão ter sido confirmada.

### Linha 405

**Unidade:** U19 — Consumo do recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U19; não produz efeito de runtime.

### Linha 406

**Unidade:** U19 — Consumo do recovery

**Papel local:** Inicia log do resultado de recovery.

### Linha 407

**Unidade:** U19 — Consumo do recovery

**Papel local:** Escolhe nível success ou warn pelo resultado.

### Linha 408

**Unidade:** U19 — Consumo do recovery

**Papel local:** Usa action_name estável DELETE_RECOVERY.

### Linha 409

**Unidade:** U19 — Consumo do recovery

**Papel local:** Seleciona a mensagem condicional.

### Linha 410

**Unidade:** U19 — Consumo do recovery

**Papel local:** Mensagem de sucesso indica exclusão após reload.

### Linha 411

**Unidade:** U19 — Consumo do recovery

**Papel local:** Mensagem de warning admite falta de confirmação.

### Linha 412

**Unidade:** U19 — Consumo do recovery

**Papel local:** Inclui chatId salvo no log sem redaction específica.

### Linha 413

**Unidade:** U19 — Consumo do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U19, preservando seus limites de escopo/expressão.

### Linha 414

**Unidade:** U19 — Consumo do recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U19; não produz efeito de runtime.

### Linha 415

**Unidade:** U19 — Consumo do recovery

**Papel local:** Só envia delivery se caller forneceu função.

### Linha 416

**Unidade:** U19 — Consumo do recovery

**Papel local:** Aguarda sendDelivery depois que o marker já foi removido; falha aqui perde retry durável.

### Linha 417

**Unidade:** U19 — Consumo do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U19, preservando seus limites de escopo/expressão.

### Linha 418

**Unidade:** U19 — Consumo do recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U19; não produz efeito de runtime.

### Linha 419

**Unidade:** U19 — Consumo do recovery

**Papel local:** Constrói o retorno de recovery consumido.

### Linha 420

**Unidade:** U19 — Consumo do recovery

**Papel local:** Marca handled true para o runner não executar o job normal.

### Linha 421

**Unidade:** U19 — Consumo do recovery

**Papel local:** Propaga se a exclusão foi confirmada.

### Linha 422

**Unidade:** U19 — Consumo do recovery

**Papel local:** Retorna o record consumido.

### Linha 423

**Unidade:** U19 — Consumo do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U19, preservando seus limites de escopo/expressão.

### Linha 424

**Unidade:** U19 — Consumo do recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U19, preservando seus limites de escopo/expressão.

### Linha 425

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 426

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Declara o orquestrador delete-ou-reload.

### Linha 427

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Recebe tabId que nomeia o journal.

### Linha 428

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Recebe delivery a preservar.

### Linha 429

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Permite desabilitar reload.

### Linha 430

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Define ou atualiza um valor/estado que participa do fluxo de U20.

### Linha 431

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Tenta deleção normal primeiro.

### Linha 432

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Entra no fast-path se houve confirmação ou bypass de debug.

### Linha 433

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Encerra o caminho atual de U20 com o valor/objeto declarado na fonte.

### Linha 434

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Informa exclusão concluída.

### Linha 435

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Confirma que recovery não foi salvo.

### Linha 436

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Confirma que reload não foi solicitado.

### Linha 437

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U20, preservando seus limites de escopo/expressão.

### Linha 438

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U20, preservando seus limites de escopo/expressão.

### Linha 439

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U20; não produz efeito de runtime.

### Linha 440

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Persiste recovery antes de qualquer reload.

### Linha 441

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U20; não produz efeito de runtime.

### Linha 442

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Inicializa flag observável de reload.

### Linha 443

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Só recarrega se solicitado e a API existe.

### Linha 444

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Dispara reload da página Gemini.

### Linha 445

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Marca reloadScheduled.

### Linha 446

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U20, preservando seus limites de escopo/expressão.

### Linha 447

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Linha vazia que separa visualmente blocos da unidade U20; não produz efeito de runtime.

### Linha 448

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Constrói retorno do caminho de fallback.

### Linha 449

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Informa falha da deleção imediata.

### Linha 450

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Confirma journal salvo.

### Linha 451

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Expõe se reload foi solicitado.

### Linha 452

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U20, preservando seus limites de escopo/expressão.

### Linha 453

**Unidade:** U20 — Delete ou agenda recovery

**Papel local:** Fecha a estrutura sintática aberta pela unidade U20, preservando seus limites de escopo/expressão.

### Linha 454

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 455

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe consulta ao mutex sem permitir mutação externa.

### Linha 456

**Unidade:** U21 — API pública do controller

**Papel local:** Retorna deletionInProgress.

### Linha 457

**Unidade:** U21 — API pública do controller

**Papel local:** Fecha a estrutura sintática aberta pela unidade U21, preservando seus limites de escopo/expressão.

### Linha 458

**Unidade:** U21 — API pública do controller

**Papel local:** Linha vazia que separa visualmente blocos da unidade U21; não produz efeito de runtime.

### Linha 459

**Unidade:** U21 — API pública do controller

**Papel local:** Abre objeto da API pública do controller.

### Linha 460

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe getElementText, hoje sem consumer externo localizado.

### Linha 461

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe escape usado por wrappers/testes.

### Linha 462

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe leitura do chatId.

### Linha 463

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe derivação da chave de recovery.

### Linha 464

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe verificação de estabilidade.

### Linha 465

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe busca do item Excluir.

### Linha 466

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe polling do item Excluir.

### Linha 467

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe busca da confirmação.

### Linha 468

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe polling da confirmação.

### Linha 469

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe a operação principal.

### Linha 470

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe leitura do recovery.

### Linha 471

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe persistência do recovery.

### Linha 472

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe cleanup do recovery.

### Linha 473

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe consumo de recovery.

### Linha 474

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe delete-ou-reload.

### Linha 475

**Unidade:** U21 — API pública do controller

**Papel local:** Expõe estado do mutex.

### Linha 476

**Unidade:** U21 — API pública do controller

**Papel local:** Fecha a estrutura sintática aberta pela unidade U21, preservando seus limites de escopo/expressão.

### Linha 477

**Unidade:** U21 — API pública do controller

**Papel local:** Fecha a estrutura sintática aberta pela unidade U21, preservando seus limites de escopo/expressão.

### Linha 478

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Linha vazia que separa visualmente blocos da unidade U22; não produz efeito de runtime.

### Linha 479

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Cria API do módulo contendo somente a factory.

### Linha 480

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Publica a API global consumida pelo composition root.

### Linha 481

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Exporta a mesma API no CommonJS para Jest.

### Linha 482

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Fecha a IIFE escolhendo self quando existe e globalThis como fallback.

### Linha 483

**Unidade:** U22 — Publicação global/CommonJS

**Papel local:** Representa o newline terminal da fonte e não executa código.

## 14. Auditoria interna antes da conclusão

- [x] SHA relido diretamente do branch.
- [x] Fonte integral incorporada sem omissões.
- [x] 483/483 posições possuem cabeçalho Linha N sequencial.
- [x] Consumers e dependências reais cruzados.
- [x] DEL-01…DEL-10 lidos com assertions reais.
- [x] rpa-flow e process-finalize-real usados somente para propriedades que realmente provam.
- [x] job-runner com controller mockado classificado como evidência de consumer, não prova direta deste módulo.
- [x] Lacunas de estabilidade, target selection, storage, stale recovery e privacidade registradas.
- [x] Nenhum código funcional alterado.

**Estado desta revisão:** pronta para validação final de integridade/ownership antes de receber selo de auditoria.

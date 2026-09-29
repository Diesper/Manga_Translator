# Bíblia técnica — `extension/content/gemini/job-runner.js`

## Identidade do arquivo

- **Arquivo:** `extension/content/gemini/job-runner.js`
- **Bíblia:** `docs/biblia/extension/content/gemini/job-runner.js/Bíblia.md`
- **SHA auditado:** `1b16fd656e82e64ef2d26977e061f87e469aa3ff`
- **Agente responsável pela auditoria:** `GPT-5.6-Sol#G`
- **Tipo:** JavaScript de runtime/content script, compatível também com CommonJS para testes.
- **Fonte:** 1472 posições de linha na leitura do blob (1471 linhas com conteúdo + newline final).
- **PR:** `#66`
- **Branch:** `docs/project-bible`
- **Estado documental desta Bíblia:** materializada sob reserva exclusiva; conclusão global depende de sincronização com AUDITORIA/STATUS/CHECKLIST sob `PROGRESS.lock.md`.


## Papel arquitetural

Este arquivo é o **orquestrador de execução de um job Gemini já reivindicado**. A fronteira é deliberada: `content_gemini.js` faz bootstrap, claim, keepalive wiring e handlers; o runner recebe o objeto `job` e coordena o ciclo operacional: recuperar deleção pendente → obter imagem original → preparar UI → opcionalmente ativar temp chat → estabilizar composer → anexar imagem → injetar prompt → instalar observer → submeter com confirmação → esperar resultado → extrair/quarentenar → persistir → commitar → limpar recursos.

Ele é carregado como content script antes de `content_gemini.js` e publica `globalThis.MangaTranslatorGeminiJobRunner`. Em Jest, o mesmo arquivo exporta CommonJS. `content_gemini.js` instancia exatamente um runner com DOM/Chrome/módulos reais e chama `jobRunner.run(job)` somente depois do claim.

## Dependências e consumidores

- **Consumidor direto:** `extension/content/content_gemini.js` (`createGeminiJobRunner`, `jobRunner.run(job)` e reexports de helpers).
- **Carregador:** `extension/manifest.json`, na sequência de módulos Gemini antes de `content/content_gemini.js`.
- **DOM:** `MangaTranslatorGeminiDom` para busca profunda, visibilidade, send button e classificação de imagens.
- **Quarentena:** `MangaTranslatorGeminiImageQuarantine` para ownership estrutural, SHA-256 e comparação final.
- **Observer:** `MangaTranslatorGeminiObserver` para confirmar geração, submit, erro e resultado.
- **Editor:** `MangaTranslatorGeminiEditor` para submit com confirmação e fallback MAIN-world.
- **Attachment:** `MangaTranslatorGeminiAttachment` para attachFile + evidência de preview.
- **Temporary chat:** `MangaTranslatorGeminiTemporaryChat`.
- **Result extractor:** injetado por `content_gemini.js`; extrai direto ou registra fallback auxiliar.
- **Deletion controller:** injetado por `content_gemini.js`; recovery e deleção segura.
- **Background via runtime:** `REQUEST_IMAGE_DATA`, `REFRESH_JOB_WATCHDOG`, `GEMINI_IMAGE_EXTRACTED`, `GEMINI_RESULT_COMMIT`, `GEMINI_RESULT_URL`, `GEMINI_ERROR`.

## Mensagens e efeitos laterais

| Mensagem/evento | Origem neste arquivo | Destino/efeito |
|---|---|---|
| `REQUEST_IMAGE_DATA` | `requestImageData` | Background encaminha ao content script do mangá e devolve data URL da página. |
| `REFRESH_JOB_WATCHDOG` | primeiro `generation_started` | Background revalida ownership e renova watchdog uma vez. |
| `GEMINI_IMAGE_EXTRACTED` | resultado direto | Staging/persistência dos bytes no leitor. |
| `GEMINI_RESULT_COMMIT` | após staging | Finalização do job, com até três tentativas e sem reenviar bytes. |
| `GEMINI_RESULT_URL` | fallback auxiliar | Registra extração por URL; requer `extractionRegistered`. |
| `GEMINI_ERROR` | erros/timeout | Propaga falha com job/batch/index/tab. |
| `MANGA_TRANSLATOR_SET_PROMPT` | antes da injeção DOM | Ponte MAIN-world para sincronizar prompt. |
| `MANGA_TRANSLATOR_TRIGGER_SEND` | fallback de submit | Solicita tentativa MAIN-world, ainda sujeita a confirmação observável. |
| `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` | mudança de modo | Ajusta mitigação de throttling no código injetado. |

## Estado, lifecycle e MV3

O arquivo não persiste estado próprio durável; mantém `activeObserver` e timers apenas enquanto a instância está viva. Isso é apropriado ao content script, mas a conclusão real do job depende do background/storage e dos ACKs de staging/commit. A lógica foi desenhada para não confiar em memória como prova de persistência: a imagem só é considerada entregue depois do ACK `staged/persisted`, e a finalização só depois de `committed`.

A suspensão de service worker MV3 pode afetar callbacks de runtime; por isso mensagens críticas retornam ACK e commit é repetível. A aba Gemini também pode trocar/hidratar DOM; por isso o runner re-resolve composer, observa Shadow DOM e não conserva referências antigas como autoridade.

## Segurança e privacidade

- A URL final é validada por esquema antes da extração; URLs Google recebem somente transformação de resolução.
- Imagens de input são bloqueadas por ownership estrutural e, quando possível, por hash exato.
- Logs de URL usam `getUrlLogMetadata`; o fluxo testado exige redaction de segredo/query. Prompt é logado por comprimento, não por conteúdo.
- O HUD manual não interpola dados do job em `innerHTML`; conteúdo dinâmico usa `textContent`.
- Eventos MAIN-world expõem ao contexto da página apenas dados necessários à automação; o host Gemini já é o destinatário funcional do prompt, mas extensões não devem adicionar segredos nesses payloads.
- Mensagens de conclusão carregam IDs de ownership; a validação final desses IDs pertence ao background.

## Evidências automatizadas inspecionadas

> Esta auditoria **não executou** as suítes. A classificação abaixo vem da leitura do teste real e de suas assertions, distinguindo prova direta de simples carregamento/ocorrência.

| Classificação | Arquivo | O que a assertion prova |
|---|---|---|
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/job-runner.test.js` | RUN-00…RUN-14 e RUN-COV-01/02 carregam o módulo real e afirmam dependências, conversão dataURL, recovery, cleanup, Shadow DOM, seleção manual, anti-throttle, watchdog, quarentena e staging/commit. |
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/rpa-flow.test.js` | Carrega os módulos Gemini reais + `content_gemini.js`; prova fluxo HTTP/blob, fallback de prompt, erro de UI, timeout, fallback MAIN-world e registro por URL. |
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/plan-rpa-edge-cases.test.js` | Prova attachment gate, editor desabilitado, seleção de botão válido, filtros de resultado, proporção extrema, HUD manual e persistência→commit antes de exclusão. |
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/resolution-elevation.test.js` | Prova elevação `=sN→=s0` dentro do fluxo que carrega o runner real. |
| ✅ PROVADO DIRETAMENTE | `tests/unit/content-gemini/safe-background-delete.test.js` | Chama o helper reexportado `shouldKeepConversationForDebug` e verifica debug true/false. |
| ✅ PROVADO DIRETAMENTE (E2E) | `tests/e2e/translation-flow.spec.js` | Exercita extensão carregada: gate de attachment nos três modos, resultado rápido, Shadow DOM/wrapper assistant, submit não confirmado e ownership do resultado. |
| 🟦 GATE ESTÁTICO ESPECÍFICO | `extension/manifest.json + scripts/validation/verify-repository-structure.js` | Ordem de carregamento coloca os módulos Gemini e `job-runner.js` antes de `content_gemini.js`; o gate estrutural referencia o arquivo. |
| 🟨 EXECUTADO INDIRETAMENTE | `tests/helpers/load-content-gemini-module.js` | Carrega explicitamente `image-quarantine`, observer, editor, attachment, temporary-chat, result-extractor, deletion e job-runner antes do bootstrap. |

## Cobertura documental linha a linha/bloco

As faixas abaixo são contíguas, cobrem **0001–1472 sem lacunas** e tratam blocos estruturalmente inseparáveis em conjunto.

### Linhas 0001–0007

**O que faz.** Ativa strict mode e documenta a fronteira arquitetural: este módulo executa um job Gemini já reivindicado, enquanto claim/bootstrap/keepalive/handlers ficam em `content_gemini.js`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A separação evita duplicar ownership do job dentro do runner. Um runner que também fizesse claim criaria duas fontes de verdade para identidade e ciclo de vida. Os comentários são parte do contrato arquitetural e batem com `content_gemini.js`, que chama `jobRunner.run(job)` após o claim.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — o carregamento real ocorre nas suítes de content-gemini, mas comentários/strict mode não têm assertion semântica própria.

### Linhas 0008–0013

**O que faz.** IIFE recebe o `scope` global e resolve `MangaTranslatorGeminiImageQuarantine`; em CommonJS tenta `require('./image-quarantine.js')` como fallback.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O padrão permite o mesmo arquivo como content script clássico e módulo CommonJS de teste. O `catch` vazio impede que a ausência do fallback derrube imediatamente o carregamento; a validação de dependências posterior falha de modo explícito se a quarentena continuar ausente.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — `job-runner.test.js` carrega o módulo real; não há assertion específica para o `catch` do require.

### Linhas 0014–0038

**O que faz.** Define `createGeminiJobRunner` com injeção explícita de DOM, window, runtime, storage e todos os módulos colaboradores; também injeta relógios/IO para testabilidade.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A DI permite simular Chrome/DOM sem reimplementar o runner e torna efeitos laterais observáveis. Defaults apontam para os globais reais no browser. Uma implementação presa diretamente aos globais tornaria isolamento, testes de erro e controle de timers muito mais frágeis.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-00 cria o runner real com combinações de dependências e as demais suítes injetam mocks reais nos pontos de fronteira.

### Linhas 0039–0049

**O que faz.** Rejeita três classes de dependências ausentes e inicializa `activeObserver` como estado por instância.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Falhar cedo evita um job parcialmente iniciado com cleanup incompleto. `activeObserver` centraliza o observer corrente para integração com seleção manual e cleanup. A arquitetura pressupõe uma execução ativa por instância; concorrência paralela no mesmo runner não é protegida localmente.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-00 cobre os três grupos de validação.

### Linhas 0051–0055

**O que faz.** Mapeia `minimized_window` e `background_delete` para anti-throttle `balanced`; demais modos usam `minimal`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Modos em segundo plano precisam de mitigação maior sem cair sempre no modo legado mais invasivo. Um único modo agressivo aumentaria interferência na página; um modo sempre mínimo aumentaria risco de throttling.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-06.

### Linhas 0057–0073

**O que faz.** Normaliza `minimal|balanced|legacy`, publica `MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE` via `CustomEvent` e degrada graciosamente sem dispatcher.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O evento cruza a fronteira para a lógica MAIN-world sem acoplar o runner a uma implementação específica. Valores desconhecidos são reduzidos a `minimal`, impedindo estados arbitrários.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-07 e RUN-07A verificam normalização, eventos e ausência de dispatcher.

### Linhas 0075–0083

**O que faz.** Adapta `chrome.storage.local.get` callback para Promise e devolve `{}` em exceção síncrona.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Isso simplifica fluxos assíncronos como debug mode e execution mode. O fallback impede quebra por mock/API indisponível, mas não observa explicitamente `runtime.lastError` do storage.

**Evidência de teste.** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — há uso indireto; falta teste do caminho de exceção e de `lastError`.

### Linhas 0085–0099

**O que faz.** Localiza o composer editável vivo atravessando DOM profundo, filtra elementos invisíveis/desabilitados e exclui contenteditables dentro de mensagens já renderizadas.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O filtro evita confundir resposta/consulta histórica com o campo de entrada. Em seguida sobe ancestrais até wrappers conhecidos e recusa editor/composer desabilitado.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — os fluxos RPA exercitam seleção; não há teste unitário isolado de todas as exclusões.

### Linhas 0101–0118

**O que faz.** Espera estabilidade do par editor/composer por pelo menos 750 ms e nunca aceita antes de 1,5 s; consulta a cada 250 ms e falha com `GEMINI_COMPOSER_NOT_READY`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A hidratação do Gemini pode substituir nós após o wrapper aparecer. Renovar referências evita enviar para nó stale. Aceitar o primeiro contenteditable seria suscetível a race de hidratação.

**Evidência de teste.** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a busca estável participa do RPA, mas o timeout/código `GEMINI_COMPOSER_NOT_READY` não aparece em teste.

### Linhas 0120–0130

**O que faz.** Captura telemetria de contexto do anexo: conectividade, tag do composer, quantidade de inputs e evidências de preview.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Esses metadados ajudam a diagnosticar métodos de upload sem registrar conteúdo sensível da imagem. Uma telemetria baseada apenas em 'sucesso/falha' perderia a etapa em que a UI divergiu.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — logs são produzidos nos testes de attachment gate; os campos do snapshot não têm assertions individuais.

### Linhas 0132–0153

**O que faz.** Valida data URL, extrai MIME, decodifica Base64, converte bytes para `Uint8Array` e cria `File`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A conversão é necessária para alimentar input/drop/paste reais. Validação explícita evita criar `File` sem MIME ou depender de APIs ausentes.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-01 e RUN-01B cobrem sucesso, formato inválido e APIs ausentes.

### Linhas 0155–0172

**O que faz.** Implementa `queryAllDeep`: prefere `domApi.findAllDeep`, filtra apenas elementos que suportam `matches`, tolera seletor inválido e cai para `querySelectorAll`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Shadow DOM aberto exige busca além do DOM plano. O fallback mantém compatibilidade onde helper profundo não encontra nada. Capturas evitam que um seletor transitório derrube o job.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — múltiplos fluxos reais dependem dele; exceções e fallback não recebem assertions dedicadas.

### Linhas 0174–0177

**O que faz.** `queryFirstDeep` reutiliza `queryAllDeep` e retorna primeiro match ou `null`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Centraliza a política de busca profunda para editor, botões e imagens, evitando divergência de seletor.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 0179–0189

**O que faz.** Coleta `shadowRoot` abertos de elementos encontrados por `findAllDeep`, removendo falsy e tolerando erro.

**Como / por que desta forma / por que uma versão ingênua seria pior.** É usado para registrar o mesmo `MutationObserver` em raízes profundas já existentes. Sem isso, inserções dentro de shadow roots poderiam nunca acordar `waitForElement`.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no efeito — RUN-04B insere editor dentro de Shadow DOM e espera resolução; o `catch` isolado não é provado.

### Linhas 0191–0244

**O que faz.** `waitForElement` resolve imediatamente se já existe; senão cria `MutationObserver`, observa root e shadow roots, acompanha novos roots, usa timeout e garante `finish` idempotente com cancelamento/desconexão.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A idempotência evita resolução dupla e observer vazando após sucesso/timeout. Observar novas shadow roots trata DOM dinâmico do Gemini.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-04 e RUN-04B; ⚠️ o caso 'MutationObserver ausente' não tem assertion específica.

### Linhas 0246–0256

**O que faz.** Delegadores para `domApi.getImageSource`, `isIgnoredGeminiImageSource` e `isModelResponseImage`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Mantêm as regras de DOM num módulo especializado e tornam o runner focado em orquestração.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 0258–0281

**O que faz.** Tenta clicar, em ordem, cartões/botões/imagens de resposta do modelo; sobe para elemento clicável e continua se um clique lança.

**Como / por que desta forma / por que uma versão ingênua seria pior.** É um fallback resiliente a variações de markup. Parar após o primeiro seletor encontrado mas não clicável seria frágil.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-COV-01 e RUN-COV-02.

### Linhas 0283–0318

**O que faz.** Classifica imagem como provável resultado: bloqueia input estrutural, sources ignoradas/preexistentes; aceita autoria explícita, padrões conhecidos de URL/blob e, como fallback, dimensões mínimas/área.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A quarentena vem antes das heurísticas positivas para impedir devolver o próprio anexo. O limiar aceita proporções extremas desde que haja área e lado mínimo.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-09 bloqueia preview; plan-rpa cobre preexistente/avatar/pequena e aceita 60x1024; E2E ownership valida clone/órfã/resultado.

### Linhas 0320–0327

**O que faz.** Critério manual é mais permissivo que o automático, mas ainda recusa input estrutural, source ignorada e imagem sem dimensões mínimas.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A intervenção humana precisa poder escolher um resultado que heurísticas automáticas rejeitariam, sem permitir selecionar o próprio anexo.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-09 e caso do painel manual em `plan-rpa-edge-cases.test.js`.

### Linhas 0329–0344

**O que faz.** Enumera todas as IMG profundas, força lazy images para eager, promove `data-src` e filtra por `isLikelyGeneratedImage`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Isso reduz falso 'nenhum resultado' quando Gemini posterga carregamento. Alterar `loading/src` é side effect deliberado de observabilidade.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — painel 'Usar última' e fluxos RPA exercitam; não há assertion sobre `loading=eager`.

### Linhas 0346–0365

**O que faz.** Registra URL manual no window, entrega ao observer ativo, atualiza HUD e emite log sanitizado via `getUrlLogMetadata`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O observer continua sendo a autoridade do resultado; a seleção manual não contorna a pipeline final. Metadados evitam logar URL assinada inteira.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-05; `rpa-flow` também verifica redaction de URL em logs de resultado.

### Linhas 0367–0385

**O que faz.** Remove painel, listener de captura e outlines/data attributes de imagens marcadas.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Cleanup explícito evita listeners duplicados e UI residual entre jobs.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — cleanup ocorre no `finally`; não há assertion completa de todos os resíduos.

### Linhas 0387–0508

**O que faz.** Cria HUD manual, registra qualquer uso como erro grave de automação, oferece 'Usar última' e modo de seleção por clique com `composedPath`, marca candidatas e remove listener/outlines após escolha.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O HUD é fallback operacional, não caminho silencioso: a telemetria denuncia necessidade de intervenção. `textContent` é usado para dados dinâmicos; o HTML inserido é estático.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-07B verifica logs de intervenção; `plan-rpa-edge-cases` verifica seleção manual e entrega do resultado.

### Linhas 0510–0595

**O que faz.** Injeta prompt no editor: foca nós, tenta API Quill, substitui filhos DOM, dispara `beforeinput/input/change`, espelha `value` quando aplicável e retorna se texto final tem tamanho mínimo.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Combina caminhos porque o Gemini muda entre wrappers/contenteditable/Quill. A verificação posterior no `run` é a barreira real. Implementação ingênua com apenas `textContent=` poderia não atualizar o estado interno do framework.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — muitos fluxos confirmam `PROMPT_INJECTED`/submit, mas `setPromptInEditor` não possui teste unitário direto; a ordem 'mutação antes de beforeinput' é compatibilidade frágil.

### Linhas 0597–0607

**O que faz.** Preserva conversa somente para erro em `background_delete` quando `debugMode` está true.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Restringe exceção de privacidade ao caso de diagnóstico; sucesso ou outros modos não herdam a preservação.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — `safe-background-delete.test.js` chama a função exportada com debug true/false.

### Linhas 0609–0620

**O que faz.** Wrapper resiliente de `runtime.sendMessage` que retorna resposta ou `null` em `lastError`/exceção.

**Como / por que desta forma / por que uma versão ingênua seria pior.** É usado na aquisição de imagem, onde ausência temporária de resposta pode ser tentada novamente.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE; faltam assertions isoladas para exceção e `lastError`.

### Linhas 0622–0633

**O que faz.** Solicita `REQUEST_IMAGE_DATA` até 5 vezes, aguardando 1 s entre falhas; retorna assim que houver `srcData` ou `null` após esgotar tentativas.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Retry trata timing entre aba Gemini e content script do mangá sem duplicar o job. O payload só é validado como imagem depois, por `assertStage`.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — falhas de payload são cobertas; não há teste específico contando cinco tentativas sem resposta.

### Linhas 0635–0654

**O que faz.** `assertStage` transforma invariantes de etapas em logs `TEST_FAIL_STEP_n` + exceção ou `TEST_PASS_STEP_n`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Padroniza diagnósticos de pipeline e impede continuar após precondição quebrada.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — RPA cobre falhas e sucessos de etapas, mas não cada log de cada step.

### Linhas 0656–0670

**O que faz.** Entrada `run`: exige job, reseta anti-throttle para minimal, obtém geminiTabId, tenta recuperação de deleção pendente antes de abrir keepalive e encerra cedo se recovery foi tratado.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Recuperação vem antes de nova automação para não sobrepor entrega antiga com job novo. Evita keepalive desnecessário nesse caminho.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-02 verifica retorno e zero open/close keepalive.

### Linhas 0672–0679

**O que faz.** Abre keepalive e registra job confirmado com jobId truncado, índice e tabId.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Mantém o content script vivo durante operação longa e evita expor ID completo no log.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE parcialmente — RUN-03 verifica open/close; conteúdo exato do debug log não é assertado.

### Linhas 0680–0704

**O que faz.** Cria scroll assist a cada 2 s para manter UI recente/imagens em viewport e `stopScrollAssist` idempotente.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A UI do Gemini pode lazy-renderizar conteúdo fora de viewport. Cleanup explícito evita timer órfão.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no cleanup — REG-12/CG-19/CG-40 verifica `clearInterval`; detalhes de scroll não têm assertion.

### Linhas 0706–0740

**O que faz.** `deliverWithSecureDeletion` diferencia modos: em temp_chat pode apagar fire-and-forget e entregar; em background/minimized pode preservar erro em debug ou exigir `deleteOrScheduleRecovery` antes da entrega final.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O contrato evita finalizar job destrutivo antes de exclusão segura nos modos que prometem limpeza. Em temp_chat, deleção eventual não bloqueia a entrega.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — safe-delete/deletion e fluxos de erro cobrem partes; falta teste unitário deste helper para todas as combinações.

### Linhas 0742–0757

**O que faz.** Segundo wrapper de runtime preserva razão de falha em objeto `{ok:false, reason}` em vez de `null`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Staging/commit precisam distinguir resposta vazia, lastError e exceção para logs/retries. Um booleano perderia diagnóstico.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 0759–0808

**O que faz.** `stageAndCommitResult` exige ACK de staging/persistência, depois envia `GEMINI_RESULT_COMMIT` até 3 vezes sem reenviar imagem; falha com códigos distintos e loga staging/commit.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Esse é o principal invariante anti-perda: bytes persistem antes de finalizar job. Retry somente do commit reduz duplicação de payload e exige idempotência do background.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-12 prova ordem e ausência de deleção antes do commit; RUN-13 bloqueia commit quando staging falha; RUN-14 prova 3 commits e apenas 1 staging. ⚠️ `RESULT_COMMIT_FAILED` após as 3 falhas não tem assertion específica.

### Linhas 0810–0850

**O que faz.** Inicia scroll assist; solicita imagem, valida presença e prefixo `data:image/`, salva em `job.srcData`, tenta SHA-256 exato via quarentena e degrada para filtro estrutural se hash falhar.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A imagem original passa a ser referência de ownership/quarentena. Hash exato fortalece a defesa, mas falha de hashing não bloqueia todo o job.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE/INDIRETAMENTE — CG-16 e CG-17 cobrem falta/payload inválido; RUN-10/11 cobrem comparação final; caminho de falha inicial do hash só é logado, sem teste dedicado.

### Linhas 0852–0865

**O que faz.** Espera editor por até 20 s e rejeita editor ausente/desabilitado.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Impede anexar/enviar para UI ainda indisponível. Um clique/envio otimista poderia atingir elemento stale/oculto.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — REG-12/CG-19/CG-40 cobre editor desabilitado e cleanup; waitForElement tem RUN-04/04B.

### Linhas 0867–0887

**O que faz.** Tenta focar editor/janela com eventos compatíveis; carrega `geminiExecutionMode` do storage quando job não traz; escolhe anti-throttle estável.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Foco é tentativa local sem ativar fisicamente tab/window; o modo de execução permanece configurável e a DI tolera diferenças de Event.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — modos são exercitados em unit/E2E; sequência exata de focus não é assertada.

### Linhas 0889–0951

**O que faz.** Para `temp_chat`, chama `temporaryChatApi.ensureActive`, traduz estados em flags, loga status, espera 1,5 s após ativação/already-active e transforma falha de verificação/exceção em warning em vez de abortar.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Conversa temporária é preferência operacional, não precondição absoluta: se indisponível, o fluxo ainda pode produzir resultado e depois decidir deleção.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE — suítes de temporary-chat testam o módulo colaborador e RPA usa o fluxo; mapeamento completo local não tem teste isolado.

### Linhas 0953–0960

**O que faz.** Renova editor/composer estáveis depois da possível mudança de UI, cria `File` da imagem e bloqueia arquivo vazio.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Evita reutilizar nó capturado antes da ativação de temp chat. O comentário explicita o motivo de race/hidratação.

**Evidência de teste.** 🟨 EXECUTADO INDIRETAMENTE; timeout de estabilidade é lacuna específica.

### Linhas 0961–1003

**O que faz.** Executa `attachmentApi.attachFile` com alvos renováveis, timeout 20 s, retry 3,5 s, máximo 3 dispatches; gera telemetria e bloqueia completamente prompt/submit se `confirmed` for falso.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O anexo precisa de evidência observável antes de enviar texto, impedindo prompt sem imagem. Não altera contexto físico da janela nessa variante.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — CG-21 e E2E `REG attachment gate` verificam STARTED→REJECTED→SUBMIT_BLOCKED e ausência de prompt/submit; caso de sucesso verifica ATTACHMENT_CONFIRMED.

### Linhas 1005–1022

**O que faz.** Escolhe prompt do job ou fallback em português; fallback vazio gera log de erro sem expor o texto completo.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Garante que o fluxo não envie mensagem vazia e evita dados sensíveis no log.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — CG-25 verifica fallback e que o log expõe só `fallbackLength`.

### Linhas 1024–1056

**O que faz.** Re-resolve editor/editable vivo, emite `MANGA_TRANSLATOR_SET_PROMPT`, injeta prompt, valida comprimento >=5 e loga somente `promptLen`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Re-resolução reduz stale nodes; evento MAIN-world permite sincronização com integração externa. A assertion local impede seguir ao submit se a UI não refletiu texto.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no efeito — RPA confirma prompt/submit e redaction; ⚠️ retorno booleano de `setPromptInEditor` é ignorado e não testado isoladamente.

### Linhas 1058–1120

**O que faz.** Congela `ignoreImages` antes do submit, cria observer real antes de enviar, atualiza HUD/logs de candidato e no primeiro `generation_started` solicita uma única renovação de watchdog.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Instalar observer antes do submit fecha a janela de corrida para respostas muito rápidas. `watchdogRefreshRequested` impede heartbeat infinito e renova o prazo a partir do começo real da geração.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-08 verifica uma única renovação e ACK; E2E resposta rápida prova que resultado imediato não se perde; ownership E2E cobre aceitação/rejeição.

### Linhas 1122–1203

**O que faz.** Publica observer global da instância, chama `editorApi.submitWithConfirmation` com até 2 tentativas, troca para anti-throttle legacy só no retry, oferece fallback MAIN-world e converte ausência de confirmação em erro específico; restaura modo estável após sucesso.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Confirmação observável evita considerar clique/keypress como envio. Retry local não ativa tab nem usa antigo `DO_SEND_NOW`.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — `rpa-flow` CG-30/39 verifica fallback MAIN-world; E2E `submit ignorado` exige `GEMINI_SUBMISSION_NOT_CONFIRMED` em tempo curto; editor-submit testa colaborador.

### Linhas 1205–1230

**O que faz.** Mostra progresso, cria HUD manual, calcula quando conversa deve ser removida, escolhe timeout configurável (default 4 min) e inicia ticker de progresso de 5 s.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Timeout injetável acelera testes; ticker melhora observabilidade sem alterar lógica de conclusão.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no timeout — CG-36 injeta 80 ms e obtém `result_timeout`; ⚠️ contador/ticker em si não tem assertion.

### Linhas 1232–1280

**O que faz.** Espera resultado no observer; traduz `GEMINI_UI_ERROR` e `GEMINI_RESULT_TIMEOUT` em entrega de erro com eventual deleção segura e sempre limpa o progress timer.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Erros conhecidos viram estados controlados; erros desconhecidos sobem ao catch geral. `finally` do timer evita vazamento mesmo em rejeição.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — CG-27/35 e CG-36. Achado: a mensagem enviada no timeout diz literalmente `Tempo limite (4 min)` mesmo quando timeout configurado é diferente.

### Linhas 1282–1307

**O que faz.** Valida esquema do resultUrl (`http|blob|data:image`), loga metadados sanitizados e eleva URLs Google `=sN` para `=s0`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Bloqueia protocolos inesperados e solicita resolução original da CDN antes da extração.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — `resolution-elevation.test.js` valida `=s1024/=s512 → =s0` e uso no fluxo; RPA cobre URLs HTTP/blob.

### Linhas 1309–1341

**O que faz.** Delegação ao `resultExtractor.extractOrAuxiliaryFallback`; no fallback registra `GEMINI_RESULT_URL` e exige ACK `extractionRegistered` antes de considerar a aba auxiliar responsável.

**Como / por que desta forma / por que uma versão ingênua seria pior.** O job Gemini permanece vivo até o background assumir explicitamente a extração; sem ACK, finalizar causaria perda de ownership.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE no sucesso — CG-30/39 verifica `GEMINI_RESULT_URL`; ⚠️ `AUXILIARY_REGISTRATION_FAILED` não possui teste específico.

### Linhas 1343–1381

**O que faz.** Para resultado extraído em data URL, executa quarentena final comparando elemento/bytes/hash do input; bloqueia match exato, tolera falha de hashing não conclusiva e só então faz staging+commit.

**Como / por que desta forma / por que uma versão ingênua seria pior.** É a última barreira contra substituir página pelo próprio input. Erro conclusivo é marcado `alreadyLogged` para evitar log duplicado.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-10 bloqueia match byte-a-byte e impede `GEMINI_IMAGE_EXTRACTED`; RUN-11 permite bytes diferentes; RUN-12–14 cobrem persistência/commit.

### Linhas 1383–1410

**O que faz.** Retorna status conforme extração direta/auxiliar; catch geral registra erro uma vez, envia `GEMINI_ERROR` com identidade completa do job/batch e retorna `{status:'error', error}`.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Converter exceções em resultado controlado deixa o bootstrap decidir continuidade sem rejeição não tratada, enquanto background recebe falha associada ao job correto.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE — RUN-03 e RUN-10/13 verificam status/código e mensagem `GEMINI_ERROR`; várias integrações exercitam.

### Linhas 1411–1441

**O que faz.** `finally` restaura anti-throttle mínimo, para observer, remove referência global, scroll/ticker externo, keepalive, HUD, listener manual e outlines restantes.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Cleanup é obrigatório porque content scripts e a página podem sobreviver a falhas. Sem ele haveria observer/timer/listener vazando para o próximo job.

**Evidência de teste.** ✅ PROVADO DIRETAMENTE parcialmente — RUN-03 verifica closeKeepAlive; REG-12 verifica clearInterval. ⚠️ não há uma assertion única cobrindo todos os resíduos do finally.

### Linhas 1444–1465

**O que faz.** Expõe API do runner: `run` e helpers testáveis/compatíveis.

**Como / por que desta forma / por que uma versão ingênua seria pior.** A superfície permite `content_gemini.js` reexportar helpers usados por suítes e compatibilidade sem duplicar implementação.

**Evidência de teste.** ✅/🟨 MISTO — vários helpers são chamados diretamente nos testes; outros apenas indiretamente.

### Linhas 1468–1471

**O que faz.** Publica `{createGeminiJobRunner}` em `scope.MangaTranslatorGeminiJobRunner` e em `module.exports` quando CommonJS.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Esse dual export é o elo entre a ordem de content scripts no Manifest e testes Node/Jest.

**Evidência de teste.** 🟦 GATE ESTÁTICO ESPECÍFICO + ✅ carga direta — Manifest lista `job-runner.js` antes de `content_gemini.js`; `job-runner.test.js` exige o módulo real.

### Linhas 1472

**O que faz.** Representa o newline final do arquivo.

**Como / por que desta forma / por que uma versão ingênua seria pior.** Preservar newline final evita divergência byte-a-byte e mantém convenções POSIX/editoriais.

**Evidência de teste.** 🟦 GATE ESTÁTICO ESPECÍFICO — verificado pela leitura do blob; não é comportamento runtime.

## Invariantes

- O runner só recebe job já reivindicado; não deve implementar claim paralelo.
- Uma instância não deve executar dois jobs simultaneamente enquanto compartilhar `activeObserver`.
- Nunca enviar prompt antes de `attachmentResult.confirmed === true`.
- Instalar o observer antes do submit para não perder resultado de resposta rápida.
- Nunca considerar clique/keypress como prova de submit; exigir confirmação observável.
- Imagem estruturalmente pertencente ao input nunca pode virar resultado automático nem manual.
- Resultado direto deve ser persistido (`staged/persisted`) antes de `GEMINI_RESULT_COMMIT`.
- Retry de commit não deve reenviar a imagem já persistida.
- Fallback auxiliar só transfere ownership após `extractionRegistered === true`.
- IDs `jobId`, `batchId`, `mangaTabId` e `index` devem acompanhar todas as mensagens que finalizam/erram o job.
- Logs não devem expor prompt completo, URL assinada completa ou bytes da imagem.
- Timers, observer, keepalive, HUD e listeners manuais devem ser removidos no término, inclusive por erro.
- Anti-throttle deve terminar em `minimal` no `finally`.
- Falha de hash de quarentena não pode desativar o filtro estrutural; match exato conclusivo deve bloquear entrega.
- Em modos destrutivos, entrega de erro deve respeitar a política de exclusão/recovery e exceção explícita de debug.

## Lacunas de teste

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `waitForStableComposer` — falta teste que mantenha composer instável até expirar e afirme `GEMINI_COMPOSER_NOT_READY`; uma regressão poderia voltar a aceitar nó stale.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `storageGet` — falta teste de exceção/`runtime.lastError`; hoje erro do storage é silenciosamente convertido em defaults.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `requestImageData` — falta assertion específica de exatamente 5 tentativas e intervalos quando nenhuma resposta contém `srcData`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `setPromptInEditor` — não há teste unitário da matriz Quill / replaceChildren / fallback manual / value; hoje a cobertura forte é pelo efeito integrado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `RESULT_COMMIT_FAILED` — RUN-14 cobre sucesso na terceira tentativa, mas não o caso de três falhas e o código final.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `AUXILIARY_REGISTRATION_FAILED` — o sucesso do fallback por URL é provado, mas ACK inválido/ausente não tem teste dedicado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `attachmentSnapshot` — logs do gate são cobertos, mas contagens `fileInputs/imageInputs/previewCount` não são verificadas diretamente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `queryAllDeep`/`collectOpenShadowRoots` — os caminhos normais de Shadow DOM são provados; os catches de seletor inválido/erro do helper não.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** `finally` — há provas parciais de keepalive e interval, porém não uma prova única de observer global, HUD, listener manual e outlines após toda classe de falha.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO:** Timeout configurável — `run` envia texto de erro `Tempo limite (4 min)` mesmo quando `__MT_GEMINI_GENERATION_TIMEOUT_MS__` altera o prazo; falta teste que exija mensagem coerente com o valor real.

## Análise crítica

| Severidade | Achado | Consequência |
|---|---|---|
| Médio | Mensagem de timeout potencialmente enganosa | Linhas 1217–1221 permitem timeout customizado, mas 1270 fixa `Tempo limite (4 min)`. Em teste/diagnóstico ou configuração futura, o texto pode não representar o prazo real. |
| Médio | Estado `activeObserver` pressupõe execução serial | A variável é por instância, não por job. Se `run` for chamado em paralelo na mesma instância, observer/cleanup de um job pode interferir no outro. A arquitetura de claim hoje evita isso; o runner não impõe a invariante. |
| Baixo/Médio | `setPromptInEditor` depende de detalhes de framework | A função tenta Quill e também muta DOM/dispara eventos; o `beforeinput` é disparado depois da mutação. Mudanças no Gemini podem exigir ajuste e faltam testes unitários por estratégia. |
| Baixo | Tratamento de storage pouco observável | `storageGet` converte exceção em `{}` e não registra `runtime.lastError`, podendo mascarar falha de storage como configuração ausente. |
| Baixo | Condição redundante na heurística de imagem | Após `if (width <= 0 || height <= 0) return false`, a condição `image.complete === false && height <= 0` não consegue ser verdadeira no fluxo restante. Não causa bug funcional, mas é dívida/ruído. |

Nenhum desses achados foi corrigido nesta tarefa porque o escopo é documentação. O ponto mais importante para manutenção é preservar a ordem **attachment confirmado → observer instalado → submit confirmado → resultado validado → staging persistido → commit**.

## Checklist de conclusão desta Bíblia

- [x] Identidade, SHA, tipo, linhas e agente registrados.
- [x] Papel arquitetural e consumidor direto documentados.
- [x] Dependências, mensagens, dados e side effects documentados.
- [x] Arquitetura MV3/lifecycle discutida.
- [x] Segurança, privacidade e ownership discutidos.
- [x] Evidências automatizadas classificadas sem confundir ocorrência com assertion.
- [x] Lacunas específicas registradas.
- [x] Invariantes registradas.
- [x] Cobertura 0001–1472 sem faixas omitidas.
- [x] Fonte integral abaixo, sem `...`, sem trecho omitido.

## Fonte integral auditada

```javascript
'use strict';
// gemini/job-runner.js — orquestração de um job Gemini já reivindicado.
//
// Este módulo recebe dependências explicitamente. Ele não faz claim e não abre
// automação por conta própria: content_gemini.js continua responsável por
// bootstrap/claim/keepalive/message handlers.

(function(scope) {
  let imageQuarantineApi = scope.MangaTranslatorGeminiImageQuarantine || null;
  if (!imageQuarantineApi && typeof require === 'function') {
    try { imageQuarantineApi = require('./image-quarantine.js'); } catch (_e) {}
  }

  function createGeminiJobRunner({
    root = scope.document || null,
    pageWindow = scope.window || null,
    runtime = scope.chrome?.runtime || null,
    storage = scope.chrome?.storage?.local || null,
    domApi = scope.MangaTranslatorGeminiDom,
    imageQuarantine = imageQuarantineApi?.createImageQuarantine?.({ dom: domApi }),
    observerApi = scope.MangaTranslatorGeminiObserver,
    editorApi = scope.MangaTranslatorGeminiEditor,
    attachmentApi = scope.MangaTranslatorGeminiAttachment,
    temporaryChatApi = scope.MangaTranslatorGeminiTemporaryChat,
    resultExtractor = null,
    deletionController = null,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    sendLog = function() {},
    getUrlLogMetadata = () => ({}),
    debugConsole = function() {},
    reportProgress = function() {},
    openKeepAlive = function() {},
    closeKeepAlive = function() {},
    FileImpl = scope.File,
    DataUrlAtob = scope.atob ? scope.atob.bind(scope) : null,
    setIntervalFn = scope.setInterval ? scope.setInterval.bind(scope) : setInterval,
    clearIntervalFn = scope.clearInterval ? scope.clearInterval.bind(scope) : clearInterval,
  } = {}) {
    if (!root || !pageWindow || !runtime || !storage) {
      throw new Error('JobRunner requer document/window/runtime/storage');
    }
    if (!domApi || !imageQuarantine || !observerApi || !editorApi || !attachmentApi || !temporaryChatApi) {
      throw new Error('JobRunner requer módulos Gemini DOM/Observer/Editor/Attachment/TemporaryChat');
    }
    if (!resultExtractor || !deletionController) {
      throw new Error('JobRunner requer resultExtractor e deletionController');
    }

    let activeObserver = null;

    function getAntiThrottleModeForExecutionMode(executionMode) {
      return executionMode === 'minimized_window' || executionMode === 'background_delete'
        ? 'balanced'
        : 'minimal';
    }

    function setAntiThrottleMode(mode) {
      const normalized = ['minimal', 'balanced', 'legacy'].includes(mode)
        ? mode
        : 'minimal';
      const CustomEventImpl = scope.CustomEvent || pageWindow.CustomEvent;
      if (typeof CustomEventImpl !== 'function' || typeof pageWindow.dispatchEvent !== 'function') {
        return normalized;
      }

      try {
        pageWindow.dispatchEvent(new CustomEventImpl(
          'MANGA_TRANSLATOR_ANTI_THROTTLE_SET_MODE',
          { detail: { mode: normalized } }
        ));
      } catch (_e) {}
      return normalized;
    }

    function storageGet(keys) {
      return new Promise(resolve => {
        try {
          storage.get(keys, data => resolve(data || {}));
        } catch (_e) {
          resolve({});
        }
      });
    }

    function selectLiveComposer() {
      const all = domApi.findAllDeep(root.body || root.documentElement || root, element =>
        element.matches?.('[contenteditable="true"]') && element.isConnected !== false &&
        domApi.isElementVisible(element) && element.getAttribute('aria-disabled') !== 'true' &&
        !element.closest?.('[data-message-author], [data-turn-role], model-response, .user-query-container')
      );
      const editable = all.find(element => element.closest?.('rich-textarea, .input-area, .chat-input-container, input-area')) || all[0];
      if (!editable) return null;
      let composer = editable;
      for (let current = editable; current; current = current.parentElement || current.getRootNode?.().host) {
        if (current.matches?.('rich-textarea, .input-area, .chat-input-container, input-area')) { composer = current; break; }
      }
      if ([editable, composer].some(element => element.disabled === true || element.getAttribute?.('aria-disabled') === 'true')) return null;
      return { editor: editable, composer };
    }

    async function waitForStableComposer(timeoutMs = 12_000) {
      const started = Date.now();
      let previousEditor = null, previousComposer = null, stableSince = 0;
      while (Date.now() - started < timeoutMs) {
        const current = selectLiveComposer();
        if (current && current.editor === previousEditor && current.composer === previousComposer) {
          if (Date.now() - stableSince >= 750 && Date.now() - started >= 1500) return current;
        } else {
          previousEditor = current?.editor || null;
          previousComposer = current?.composer || null;
          stableSince = Date.now();
        }
        await sleep(250);
      }
      const error = new Error('Editor editável do Gemini não estabilizou em 12s; envio bloqueado.');
      error.code = 'GEMINI_COMPOSER_NOT_READY';
      throw error;
    }

    function attachmentSnapshot() {
      const current = selectLiveComposer();
      const searchRoot = root.body || root.documentElement || root;
      return {
        editorConnected: current?.editor.isConnected === true,
        composerTag: current?.composer.tagName?.toLowerCase() || null,
        fileInputs: domApi.findAllDeep(searchRoot, element => element.matches?.('input[type="file"]')).length,
        imageInputs: attachmentApi.findFileInputsDeep(searchRoot).length,
        previewCount: attachmentApi.listAttachmentEvidence(root).length,
      };
    }

    function dataURLtoFile(dataurl, filename) {
      const raw = String(dataurl || '');
      const commaIndex = raw.indexOf(',');
      if (commaIndex === -1) {
        throw new Error('dataURL malformada: sem vírgula separadora');
      }

      const header = raw.slice(0, commaIndex);
      const mimeMatch = header.match(/:(.*?);/);
      if (!mimeMatch || !mimeMatch[1]) {
        throw new Error('dataURL malformada: MIME não encontrado');
      }
      if (typeof DataUrlAtob !== 'function' || typeof FileImpl !== 'function') {
        throw new Error('APIs de arquivo indisponíveis');
      }

      const binary = DataUrlAtob(raw.slice(commaIndex + 1));
      let length = binary.length;
      const bytes = new Uint8Array(length);
      while (length--) bytes[length] = binary.charCodeAt(length);
      return new FileImpl([bytes], filename, { type: mimeMatch[1] });
    }

    function queryAllDeep(selector, base = root) {
      if (!base || !selector) return [];
      const searchRoot = base.body || base.documentElement || base;

      if (typeof domApi.findAllDeep === 'function') {
        try {
          const matches = domApi.findAllDeep(searchRoot, element => {
            if (!element || element.nodeType !== 1 || typeof element.matches !== 'function') {
              return false;
            }
            try { return element.matches(selector); } catch (_e) { return false; }
          });
          if (matches.length) return matches;
        } catch (_e) {}
      }

      try { return Array.from(base.querySelectorAll?.(selector) || []); } catch (_e) { return []; }
    }

    function queryFirstDeep(selector, base = root) {
      const matches = queryAllDeep(selector, base);
      return matches.length ? matches[0] : null;
    }

    function collectOpenShadowRoots(base = root) {
      if (!base || typeof domApi.findAllDeep !== 'function') return [];
      const searchRoot = base.body || base.documentElement || base;
      try {
        return domApi.findAllDeep(searchRoot, element => Boolean(element?.shadowRoot))
          .map(element => element.shadowRoot)
          .filter(Boolean);
      } catch (_e) {
        return [];
      }
    }

    function waitForElement(selector, timeout = 20_000) {
      const existing = queryFirstDeep(selector);
      if (existing) return Promise.resolve(existing);

      const MutationObserverImpl = scope.MutationObserver || pageWindow.MutationObserver;
      if (typeof MutationObserverImpl !== 'function') {
        return Promise.resolve(null);
      }

      return new Promise(resolve => {
        let timer = null;
        let observer = null;
        let settled = false;
        const observedRoots = new WeakSet();

        const finish = element => {
          if (settled) return;
          settled = true;
          if (timer !== null) {
            try { scope.clearTimeout(timer); } catch (_e) {}
          }
          if (observer) {
            try { observer.disconnect(); } catch (_e) {}
          }
          resolve(element || null);
        };

        const observeTarget = target => {
          if (!observer || !target || observedRoots.has(target)) return;
          try {
            observer.observe(target, { childList: true, subtree: true });
            observedRoots.add(target);
          } catch (_e) {}
        };

        const observeDeepRoots = () => {
          observeTarget(root.body || root.documentElement || root);
          for (const shadowRoot of collectOpenShadowRoots()) observeTarget(shadowRoot);
        };

        timer = scope.setTimeout(
          () => finish(queryFirstDeep(selector)),
          timeout
        );

        observer = new MutationObserverImpl(() => {
          observeDeepRoots();
          const element = queryFirstDeep(selector);
          if (element) finish(element);
        });

        observeDeepRoots();
      });
    }

    function getImageSource(image) {
      return domApi.getImageSource(image);
    }

    function isIgnoredGeminiImageSource(src) {
      return domApi.isIgnoredGeminiImageSource(src);
    }

    function isModelResponseImage(image) {
      return domApi.isModelResponseImage(image);
    }

    function tryClickModelImageCards() {
      const selectors = [
        'model-response button[aria-label*="imagem" i]',
        'model-response button[aria-label*="image" i]',
        'model-response .image-card',
        'model-response [data-test-id*="image"]',
        'model-response [data-test-id*="generated-image"]',
        'model-response img',
        '[data-message-author="model"] button[aria-label*="imagem" i]',
        '[data-message-author="model"] [data-test-id*="image"]',
        '[data-message-author="model"] img',
      ];

      for (const selector of selectors) {
        const element = queryFirstDeep(selector);
        if (!element) continue;
        const target = element.closest?.('button, [role="button"]') || element;
        try {
          target.click();
          return true;
        } catch (_e) {}
      }
      return false;
    }

    function isLikelyGeneratedImage(image, ignoreImages = new Set()) {
      if (imageQuarantine.isStructurallyInput(image)) return false;
      const src = getImageSource(image);
      if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;

      if (isModelResponseImage(image)) return true;

      if (
        src.includes('gemini-result-image') ||
        src.includes('googleusercontent.com/gg-dl/') ||
        src.startsWith('blob:https://gemini.google.com/') ||
        src.startsWith('blob:http://127.0.0.1/')
      ) {
        return true;
      }

      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;

      if (
        src.includes('googleusercontent.com') &&
        !isIgnoredGeminiImageSource(src) &&
        width <= 0 &&
        height <= 0
      ) {
        return true;
      }

      if (width <= 0 || height <= 0) return false;
      if (image.complete === false && height <= 0) return false;

      const maxSide = Math.max(width, height);
      const minSide = Math.min(width, height);
      const area = width * height;
      return maxSide >= 256 && minSide >= 40 && area >= 12_000;
    }

    function isManualSelectableImage(image, ignoreImages = new Set()) {
      if (imageQuarantine.isStructurallyInput(image)) return false;
      const src = getImageSource(image);
      if (!src || ignoreImages.has(src) || isIgnoredGeminiImageSource(src)) return false;
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      return width > 0 && height > 0 && Math.max(width, height) >= 40;
    }

    function findGeneratedResultImages(ignoreImages = new Set()) {
      const images = domApi.findAllDeep(
        root.body || root.documentElement,
        element => String(element.tagName || '').toUpperCase() === 'IMG'
      );

      images.forEach(image => {
        if (image.getAttribute?.('loading') === 'lazy') {
          image.removeAttribute('loading');
          image.setAttribute('loading', 'eager');
        }
        if (image.dataset?.src) image.src = image.dataset.src;
      });

      return images.filter(image => isLikelyGeneratedImage(image, ignoreImages));
    }

    function setManualGeminiResultUrl(url, source = 'manual') {
      pageWindow.__mangaTranslatorManualGeminiResultUrl = url;

      const observer = activeObserver || pageWindow.__mangaTranslatorActiveGeminiObserver;
      if (observer && typeof observer.acceptResult === 'function') {
        observer.acceptResult(null, url);
      }

      const status = root.getElementById('mt-gemini-assist-status');
      if (status) {
        status.textContent = 'Imagem marcada. A extensão vai usar esse resultado.';
      }

      sendLog(
        'info',
        'GEMINI_MANUAL_RESULT',
        'Imagem marcada manualmente no Gemini',
        { source, ...getUrlLogMetadata(url) }
      );
    }

    function removeGeminiManualPanel() {
      const existing = root.getElementById('mt-gemini-assist');
      if (existing) existing.remove();

      if (pageWindow.__mangaTranslatorManualPickHandler) {
        root.removeEventListener(
          'click',
          pageWindow.__mangaTranslatorManualPickHandler,
          true
        );
        pageWindow.__mangaTranslatorManualPickHandler = null;
      }

      queryAllDeep('[data-mt-gemini-pickable="true"]').forEach(image => {
        image.style.outline = '';
        image.style.outlineOffset = '';
        image.removeAttribute('data-mt-gemini-pickable');
      });
    }

    function createGeminiManualPanel(job, getIgnoreImages) {
      removeGeminiManualPanel();
      pageWindow.__mangaTranslatorManualGeminiResultUrl = '';

      const logManualIntervention = source => {
        sendLog(
          'error',
          'GEMINI_MANUAL_INTERVENTION_REQUIRED',
          'ERRO GRAVE: a detecção automática falhou e o usuário precisou interagir manualmente com o resultado do Gemini.',
          {
            source,
            index: job?.index,
            executionMode: job?.executionMode,
            jobIdPrefix: String(job?.jobId || '').slice(0, 8),
          }
        );
      };

      const panel = root.createElement('div');
      panel.id = 'mt-gemini-assist';
      panel.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'width:260px',
        'background:#111',
        'color:#fff',
        'border:1px solid #333',
        'border-radius:8px',
        'box-shadow:0 10px 28px rgba(0,0,0,0.45)',
        'font-family:Arial,sans-serif',
        'font-size:12px',
        'padding:12px',
        'line-height:1.35',
      ].join(';');

      panel.innerHTML = [
        '<div style="font-weight:700;margin-bottom:4px;">Manga Translator</div>',
        '<div id="mt-gemini-assist-description" style="color:#aaa;margin-bottom:8px;"></div>',
        '<div style="display:flex;gap:6px;margin-bottom:8px;">',
        '<button id="mt-gemini-use-last" style="flex:1;background:#FF4444;color:#fff;border:none;border-radius:5px;padding:7px;cursor:pointer;font-weight:700;">Usar última</button>',
        '<button id="mt-gemini-pick" style="flex:1;background:#2b5f9c;color:#fff;border:none;border-radius:5px;padding:7px;cursor:pointer;font-weight:700;">Selecionar</button>',
        '</div>',
        '<div id="mt-gemini-assist-status" style="color:#888;">Aguardando imagem gerada.</div>',
      ].join('');

      const imageNumber = Number.isFinite(Number(job.index))
        ? Number(job.index) + 1
        : 1;
      panel.querySelector('#mt-gemini-assist-description').textContent =
        `Imagem ${imageNumber}: marque o resultado correto se a detecção automática não pegar.`;

      panel.addEventListener('click', event => event.stopPropagation());
      root.documentElement.appendChild(panel);

      panel.querySelector('#mt-gemini-use-last').addEventListener('click', () => {
        logManualIntervention('last-button');
        const images = findGeneratedResultImages(getIgnoreImages());
        const candidate = images[images.length - 1];
        if (candidate) {
          setManualGeminiResultUrl(getImageSource(candidate), 'last-button');
        } else {
          panel.querySelector('#mt-gemini-assist-status').textContent =
            'Ainda não encontrei uma imagem candidata.';
        }
      });

      panel.querySelector('#mt-gemini-pick').addEventListener('click', () => {
        logManualIntervention('pick-button');
        const status = panel.querySelector('#mt-gemini-assist-status');
        status.textContent = 'Clique diretamente na imagem correta gerada pelo Gemini.';

        queryAllDeep('img').forEach(image => {
          if (!isManualSelectableImage(image, getIgnoreImages())) return;
          image.dataset.mtGeminiPickable = 'true';
          image.style.outline = '3px solid #FF4444';
          image.style.outlineOffset = '2px';
        });

        if (pageWindow.__mangaTranslatorManualPickHandler) {
          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
        }

        pageWindow.__mangaTranslatorManualPickHandler = event => {
          const composedImage = event.composedPath?.().find(node =>
            String(node?.tagName || '').toUpperCase() === 'IMG'
          );
          const image = composedImage || event.target?.closest?.('img');
          if (!image || !isManualSelectableImage(image, getIgnoreImages())) return;

          event.preventDefault();
          event.stopPropagation();
          setManualGeminiResultUrl(getImageSource(image), 'image-click');

          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
          pageWindow.__mangaTranslatorManualPickHandler = null;

          root.querySelectorAll('[data-mt-gemini-pickable="true"]').forEach(candidate => {
            candidate.style.outline = '';
            candidate.style.outlineOffset = '';
            candidate.removeAttribute('data-mt-gemini-pickable');
          });
        };

        root.addEventListener(
          'click',
          pageWindow.__mangaTranslatorManualPickHandler,
          true
        );
      });

      return panel;
    }

    function setPromptInEditor(currentEditable, currentEditor, actualPrompt) {
      if (!currentEditable) return false;

      const prompt = String(actualPrompt || '');
      const existing = String(currentEditable.textContent || '').trim();
      if (existing === prompt.trim()) return true;

      try { currentEditable.focus?.(); } catch (_e) {}
      if (currentEditor && currentEditor !== currentEditable) {
        try { currentEditor.focus?.(); } catch (_e) {}
      }

      const FocusEventImpl = scope.FocusEvent || scope.Event;
      try {
        currentEditable.dispatchEvent(new FocusEventImpl('focus', {
          bubbles: true,
          composed: true,
        }));
        currentEditable.dispatchEvent(new FocusEventImpl('focusin', {
          bubbles: true,
          composed: true,
        }));
      } catch (_e) {}

      const quill = currentEditable.__quill ||
        currentEditor?.__quill ||
        (pageWindow.Quill &&
          typeof pageWindow.Quill.find === 'function' &&
          (pageWindow.Quill.find(currentEditable) || pageWindow.Quill.find(currentEditor)));

      if (quill) {
        try {
          if (typeof quill.setText === 'function') quill.setText(prompt, 'user');
          if (typeof quill.update === 'function') quill.update('user');
        } catch (_e) {}
      }

      const paragraph = root.createElement('p');
      paragraph.textContent = prompt;
      if (typeof currentEditable.replaceChildren === 'function') {
        currentEditable.replaceChildren(paragraph);
      } else {
        while (currentEditable.firstChild) {
          currentEditable.removeChild(currentEditable.firstChild);
        }
        currentEditable.appendChild(paragraph);
      }

      const InputEventImpl = scope.InputEvent || scope.Event;
      try {
        currentEditable.dispatchEvent(new InputEventImpl('beforeinput', {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: 'insertText',
          data: prompt,
        }));
        currentEditable.dispatchEvent(new InputEventImpl('input', {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: 'insertText',
          data: prompt,
        }));
        currentEditable.dispatchEvent(new scope.Event('input', {
          bubbles: true,
          composed: true,
        }));
        currentEditable.dispatchEvent(new scope.Event('change', {
          bubbles: true,
          composed: true,
        }));
      } catch (_e) {}

      if (currentEditor && 'value' in currentEditor) {
        try { currentEditor.value = prompt; } catch (_e) {}
        try {
          currentEditor.dispatchEvent(new scope.Event('input', {
            bubbles: true,
            composed: true,
          }));
        } catch (_e) {}
      }

      return String(currentEditable.textContent || '').trim().length >= 5;
    }

    async function shouldKeepConversationForDebug(delivery, executionMode) {
      if (
        executionMode !== 'background_delete' ||
        !delivery ||
        delivery.action !== 'GEMINI_ERROR'
      ) {
        return false;
      }
      const data = await storageGet(['debugMode']);
      return data.debugMode === true;
    }

    function sendRuntimeMessage(message) {
      return new Promise(resolve => {
        try {
          runtime.sendMessage(message, response => {
            if (runtime.lastError) resolve(null);
            else resolve(response || null);
          });
        } catch (_e) {
          resolve(null);
        }
      });
    }

    async function requestImageData(job) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await sendRuntimeMessage({
          action: 'REQUEST_IMAGE_DATA',
          mangaTabId: job.mangaTabId,
          index: job.index,
        });
        if (response?.srcData) return response;
        await sleep(1000);
      }
      return null;
    }

    function assertStage(condition, errorMessage, step, successMessage = '') {
      if (!condition) {
        const fullError = `[ERRO CRÍTICO - ETAPA ${step}] ${errorMessage}`;
        debugConsole('error', fullError);
        sendLog(
          'error',
          `TEST_FAIL_STEP_${step}`,
          errorMessage,
          { path: pageWindow.location.pathname }
        );
        throw new Error(fullError);
      }

      sendLog(
        'success',
        `TEST_PASS_STEP_${step}`,
        successMessage || `Etapa ${step} com sucesso`,
        { path: pageWindow.location.pathname }
      );
    }

    async function run(job) {
      if (!job) throw new Error('Job Gemini é obrigatório');

      setAntiThrottleMode('minimal');
      const myTabId = job.geminiTabId;
      let watchdogRefreshRequested = false;
      const recoveryResult = await deletionController.recoverPending({
        tabId: myTabId,
        sendDelivery: async delivery => {
          runtime.sendMessage(delivery);
        },
      });
      if (recoveryResult.handled) {
        return { status: 'recovery_handled', deleted: recoveryResult.deleted };
      }

      openKeepAlive();

      debugConsole('log', '[MangaTranslator Gemini] Job confirmado por claim:', {
        jobId: String(job.jobId || '').slice(0, 8),
        index: job.index,
        geminiTabId: myTabId,
      });

      let scrollInterval = null;
      let executionMode = job.executionMode || null;
      let inputImageHash = null;

      const startScrollAssist = () => {
        scrollInterval = setIntervalFn(() => {
          try {
            pageWindow.scrollTo(0, root.body.scrollHeight);
            const images = root.querySelectorAll('img');
            if (images.length > 0) {
              images[images.length - 1].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }
          } catch (_e) {}
        }, 2000);
      };

      const stopScrollAssist = () => {
        if (scrollInterval !== null) {
          try { clearIntervalFn(scrollInterval); } catch (_e) {}
          scrollInterval = null;
        }
      };

      async function deliverWithSecureDeletion(delivery, shouldDeleteConversation) {
        if (executionMode !== 'background_delete' && executionMode !== 'minimized_window') {
          if (shouldDeleteConversation) {
            deletionController.deleteCurrentConversation().catch(() => {});
          }
          runtime.sendMessage(delivery);
          return true;
        }

        if (await shouldKeepConversationForDebug(delivery, executionMode)) {
          sendLog(
            'info',
            'DEBUG_KEEP_CONVERSATION',
            'Modo debug: conversa preservada após erro de extração.',
            {}
          );
          runtime.sendMessage(delivery);
          return true;
        }

        stopScrollAssist();
        sendLog('info', 'GEMINI_DELETE_BEFORE_DELIVERY', 'Aguardando exclusão antes de finalizar o job', {
          executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
        });
        const deletion = await deletionController.deleteOrScheduleRecovery({
          tabId: myTabId,
          delivery,
        });

        if (deletion.deleted) {
          runtime.sendMessage(delivery);
          return true;
        }
        return false;
      }

      function sendRuntimeMessageAsync(message) {
        return new Promise(resolve => {
          try {
            runtime.sendMessage(message, response => {
              const lastError = runtime.lastError;
              if (lastError) {
                resolve({ ok: false, reason: lastError.message || 'runtime_error' });
                return;
              }
              resolve(response || { ok: false, reason: 'empty_response' });
            });
          } catch (error) {
            resolve({ ok: false, reason: error?.message || 'send_exception' });
          }
        });
      }

      async function stageAndCommitResult(delivery) {
        const staged = await sendRuntimeMessageAsync(delivery);
        if (!staged?.ok || staged.staged !== true || staged.persisted === false) {
          const error = new Error(`Resultado não foi persistido no leitor: ${staged?.reason || 'stage_failed'}`);
          error.code = 'RESULT_STAGE_FAILED';
          throw error;
        }

        sendLog('success', 'GEMINI_RESULT_STAGED',
          'Resultado persistido no leitor antes da exclusão/finalização do Gemini.', {
            executionMode,
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
            batchIdPrefix: String(job.batchId || '').slice(0, 8),
          });

        const commitMessage = {
          action: 'GEMINI_RESULT_COMMIT',
          mangaTabId: job.mangaTabId,
          index: job.index,
          jobId: job.jobId,
          batchId: job.batchId,
        };

        let committed = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          committed = await sendRuntimeMessageAsync(commitMessage);
          if (committed?.ok && committed.committed === true) break;
          sendLog('warn', 'GEMINI_RESULT_COMMIT_RETRY',
            'Commit pós-persistência não confirmou; repetindo sem reenviar a imagem.', {
              attempt,
              reason: committed?.reason || committed?.error?.code || 'no_ack',
              jobIdPrefix: String(job.jobId || '').slice(0, 8),
            });
          if (attempt < 3) await sleep(250 * attempt);
        }

        if (!committed?.ok || committed.committed !== true) {
          const error = new Error(`Resultado persistido, mas o commit do job falhou: ${committed?.reason || 'commit_failed'}`);
          error.code = 'RESULT_COMMIT_FAILED';
          throw error;
        }

        sendLog('success', 'GEMINI_RESULT_COMMITTED',
          'Background confirmou a finalização somente depois da persistência.', {
            executionMode,
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
            batchIdPrefix: String(job.batchId || '').slice(0, 8),
          });
        return true;
      }

      startScrollAssist();

      try {
        reportProgress('📡 OBTENDO IMAGEM...', job.mangaTabId);
        debugConsole(
          'log',
          '[MangaTranslator Gemini] Obtendo imagem da aba do mangá...',
          { index: job.index }
        );
        sendLog('info', 'GEMINI_STEP_1', 'Obtendo imagem', { index: job.index });

        const imageResponse = await requestImageData(job);
        assertStage(
          imageResponse && imageResponse.srcData,
          'Sem resposta da aba do mangá.',
          1,
          'Resposta inicial carregada com sucesso.'
        );
        assertStage(
          String(imageResponse.srcData).startsWith('data:image/'),
          'Os dados não são imagem válida.',
          1,
          'Base64 validada.'
        );
        job.srcData = imageResponse.srcData;
        try {
          inputImageHash = await imageQuarantine.computeExactHash(job.srcData);
          sendLog(
            'info',
            'GEMINI_INPUT_QUARANTINE_READY',
            'Assinatura exata da imagem de entrada calculada',
            { algorithm: 'SHA-256' }
          );
        } catch (hashError) {
          sendLog(
            'warn',
            'GEMINI_QUARANTINE_HASH_UNAVAILABLE',
            'Não foi possível calcular a assinatura inicial; o filtro estrutural permanece ativo',
            { messageLength: String(hashError?.message || '').length }
          );
        }

        reportProgress('⏳ AGUARDANDO INTERFACE...', job.mangaTabId);
        debugConsole('log', '[MangaTranslator Gemini] Aguardando interface do Gemini...');

        const editor = await waitForElement(
          'rich-textarea, .ql-editor, [contenteditable="true"]',
          20_000
        );
        assertStage(editor !== null, 'Editor não carregou.', 2, 'Editor alvo detectado');
        assertStage(
          editor.disabled !== true && editor.getAttribute?.('aria-disabled') !== 'true',
          'Editor do Gemini está desabilitado.',
          2,
          'Editor habilitado'
        );

        try {
          editor.focus?.({ preventScroll: true });
          const FocusEventImpl = scope.FocusEvent || scope.Event;
          editor.dispatchEvent(new FocusEventImpl('focus', {
            bubbles: true,
            composed: true,
          }));
          editor.dispatchEvent(new FocusEventImpl('focusin', {
            bubbles: true,
            composed: true,
          }));
          pageWindow.dispatchEvent(new scope.Event('focus'));
        } catch (_e) {}

        if (!executionMode) {
          const data = await storageGet(['geminiExecutionMode']);
          executionMode = data.geminiExecutionMode || 'temp_chat';
        }

        const steadyAntiThrottleMode = getAntiThrottleModeForExecutionMode(executionMode);
        setAntiThrottleMode(steadyAntiThrottleMode);

        let tempChatResult = { success: false };
        if (executionMode === 'temp_chat') {
          reportProgress('🔒 ATIVANDO CONVERSA TEMPORÁRIA...', job.mangaTabId);
          debugConsole('log', '[MangaTranslator Gemini] Ativando conversa temporária...');
          sendLog(
            'info',
            'GEMINI_STEP_TEMP_CHAT',
            'Ativando conversa temporária no Gemini',
            {}
          );

          try {
            const tempStatus = await temporaryChatApi.ensureActive({
              root,
              timeoutMs: 12_000,
              sleep,
            });

            tempChatResult = {
              success:
                tempStatus.status === 'already_active' ||
                tempStatus.status === 'activated_verified',
              alreadyActive: tempStatus.status === 'already_active',
              activated: tempStatus.status === 'activated_verified',
              notFound: tempStatus.status === 'unavailable',
              verificationFailed: tempStatus.status === 'verification_failed',
              status: tempStatus.status,
            };

            sendLog(
              'info',
              'GEMINI_TEMP_CHAT_STATUS',
              'Status da conversa temporária',
              { status: tempStatus.status }
            );

            if (
              tempStatus.status === 'activated_verified' ||
              tempStatus.status === 'already_active'
            ) {
              await sleep(1500);
            } else if (tempStatus.status === 'verification_failed') {
              sendLog(
                'warn',
                'GEMINI_TEMP_CHAT_VERIFY_FAILED',
                'Clique não confirmou ativação da conversa temporária',
                {}
              );
            }
          } catch (error) {
            debugConsole(
              'warn',
              '[MangaTranslator Gemini] Aviso ao ativar conversa temporária:',
              error && error.message
            );
            sendLog(
              'warn',
              'GEMINI_TEMP_CHAT_ERR',
              `Aviso ao ativar conversa temporária: ${error.message}`,
              {}
            );
          }
        }

        // O aparecimento do wrapper não comprova que o editor esteja hidratado.
        // A seleção é renovada entre métodos; nunca reutiliza nó desconectado.
        let stableComposer = await waitForStableComposer();
        const liveEditor = stableComposer.composer;
        const liveEditable = stableComposer.editor;
        reportProgress('📎 ANEXANDO IMAGEM...', job.mangaTabId);
        const file = dataURLtoFile(job.srcData, 'manga_page.png');
        assertStage(file.size > 0, 'Imagem gerada vazia.', 3, 'PNG verificado no buffer');
        let attachmentResult;
        try {
          // Variante 01 mantém a aba/janela no contexto original.
          sendLog('info', 'GEMINI_ATTACHMENT_CONTEXT', 'Contexto antes do upload', {
            variant: 'MT-UNICO-01', executionMode, ...attachmentSnapshot(),
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
          });
          sendLog('info', 'ATTACHMENT_STARTED', 'Handshake de anexo iniciado', {
            variant: 'MT-UNICO-01', executionMode,
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
          });
          attachmentResult = await attachmentApi.attachFile({
            file, editor: stableComposer.editor, editorRoot: stableComposer.composer, root,
            getEditor: () => selectLiveComposer()?.editor || null,
            getEditorRoot: () => selectLiveComposer()?.composer || null,
            timeoutMs: 20_000, retryAfterMs: 3500, maxDispatches: 3, sleep,
            // Eventos de upload continuam no content script.
            onAttempt: detail => sendLog('info', 'GEMINI_ATTACHMENT_METHOD', 'Método de upload observado', {
              variant: 'MT-UNICO-01', executionMode, ...detail, ...attachmentSnapshot(),
              jobIdPrefix: String(job.jobId || '').slice(0, 8),
            }),
          });
        } finally {
          // Nenhum contexto físico foi alterado nesta variante.
        }
        const uploadMeta = {
          variant: 'MT-UNICO-01', executionMode,
          methodsAttempted: attachmentResult.methodsAttempted,
          signalObserved: attachmentResult.signalObserved,
          evidenceType: attachmentResult.evidence?.type || null,
          ...attachmentSnapshot(),
        };
        if (!attachmentResult.confirmed) {
          sendLog('error', 'GEMINI_ATTACHMENT_NOT_CONFIRMED', 'Anexo não confirmou em 20s; prompt não enviado', uploadMeta);
          sendLog('error', 'ATTACHMENT_REJECTED', 'Handshake de anexo rejeitado', uploadMeta);
          sendLog('error', 'SUBMIT_BLOCKED_ATTACHMENT', 'Envio bloqueado: anexo não confirmado', uploadMeta);
          const attachmentError = new Error('Anexo não confirmado em 20s; prompt não enviado.');
          attachmentError.code = 'GEMINI_ATTACHMENT_NOT_CONFIRMED';
          throw attachmentError;
        }
        sendLog('success', 'GEMINI_STEP_3_OK', 'Anexo confirmado antes do prompt', uploadMeta);
        sendLog('success', 'ATTACHMENT_CONFIRMED', 'Handshake de anexo confirmado', uploadMeta);
        await sleep(1000);

        reportProgress('📤 ENVIANDO PROMPT...', job.mangaTabId);
        debugConsole('log', '[MangaTranslator Gemini] Injetando prompt e enviando...');

        const fallbackPrompt =
          'Crie uma imagem traduzindo todas as falas desta imagem para o Português. Mantenha o sentido original e apenas altere ou modifique o texto na imagem.';
        const actualPrompt =
          job.prompt && String(job.prompt).trim().length > 0
            ? job.prompt
            : fallbackPrompt;

        if (actualPrompt === fallbackPrompt && !job.prompt?.trim?.()) {
          sendLog(
            'error',
            'PROMPT_FALLBACK',
            'Prompt falhou ou está vazio. Usando emergência!',
            { fallbackLength: fallbackPrompt.length }
          );
        }

        const activeEditor =
          queryFirstDeep('rich-textarea, .ql-editor, [contenteditable="true"]') ||
          liveEditor;
        const activeEditable =
          queryFirstDeep(
            'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
          ) ||
          domApi.getEditableElement(activeEditor) ||
          liveEditable;

        const CustomEventImpl = scope.CustomEvent || pageWindow.CustomEvent;
        pageWindow.dispatchEvent(new CustomEventImpl(
          'MANGA_TRANSLATOR_SET_PROMPT',
          { detail: { prompt: actualPrompt } }
        ));
        await sleep(200);

        setPromptInEditor(activeEditable, activeEditor, actualPrompt);

        const promptLength = String(activeEditable.textContent || '').trim().length;
        assertStage(
          promptLength >= 5,
          `O prompt não foi inserido. Comprimento: ${promptLength}`,
          4,
          'Prompt injetado com sucesso.'
        );
        sendLog(
          'success',
          'PROMPT_INJECTED',
          'Prompt confirmado no DOM',
          { promptLen: promptLength }
        );
        await sleep(1000);

        const ignoreImages = new Set(
          queryAllDeep('img')
            .map(image => getImageSource(image))
            .filter(Boolean)
        );

        activeObserver = observerApi.createGeminiObserver({
          jobId: job.jobId,
          root,
          editor: activeEditable,
          getEditor: () =>
            queryFirstDeep(
              'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
            ) || activeEditable,
          ignoreImages,
          imageQuarantine,
          onStateChange: (type, detail) => {
            if (type === 'result_candidate_rejected' || type === 'result_candidate_accepted') {
              const assistStatus = root.getElementById('mt-gemini-assist-status');
              if (assistStatus) {
                assistStatus.textContent = type === 'result_candidate_accepted'
                  ? 'Imagem validada automaticamente. Extraindo resultado...'
                  : 'Imagem encontrada no DOM, mas rejeitada pela validação automática. Aguardando resultado válido...';
              }
              sendLog('info', type === 'result_candidate_rejected' ? 'GEMINI_RESULT_REJECTED' : 'GEMINI_RESULT_ACCEPTED',
                type === 'result_candidate_rejected' ? 'Candidato descartado pelo contexto da imagem' : 'Resposta do modelo validada', {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                  reason: detail?.reason, sourceType: detail?.sourceType,
                  ownerTag: detail?.ownerTag || null,
                });
            }
            if (type === 'generation_started') {
              sendLog(
                'info',
                'GEMINI_GENERATION_ACTIVE',
                'Geração observada na UI',
                { executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8), reason: detail && detail.reason }
              );
              if (!watchdogRefreshRequested) {
                watchdogRefreshRequested = true;
                const refreshMetadata = {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                };
                const reportRefresh = (response, error) => {
                  const ok = !error && response?.ok === true && response.refreshed === true;
                  sendLog(ok ? 'success' : 'warn',
                    ok ? 'GEMINI_WATCHDOG_REFRESH_CONFIRMED' : 'GEMINI_WATCHDOG_REFRESH_FAILED',
                    ok ? 'Watchdog reiniciado após o início da geração' : 'Não foi possível reiniciar o watchdog',
                    refreshMetadata);
                };
                sendLog('info', 'GEMINI_WATCHDOG_REFRESH_REQUESTED',
                  'Solicitando novo prazo de 5 min a partir do início da geração', refreshMetadata);
                try {
                  runtime.sendMessage({
                    action: 'REFRESH_JOB_WATCHDOG', jobId: job.jobId,
                  }, response => reportRefresh(response, runtime.lastError));
                } catch (error) {
                  reportRefresh(null, error);
                }
              }
            }
          },
        }).start();

        pageWindow.__mangaTranslatorActiveGeminiObserver = activeObserver;
        sendLog(
          'info',
          'GEMINI_OBSERVER_READY',
          'Observer instalado antes do submit',
          { jobIdPrefix: String(job.jobId || '').slice(0, 8) }
        );

        let submission;
        try {
          submission = await editorApi.submitWithConfirmation({
            observer: activeObserver,
            getEditor: () =>
              queryFirstDeep(
                'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"]'
              ) || activeEditable,
            getSendButton: () => domApi.findSendButton(root.body),
            maxAttempts: 2,
            confirmationTimeoutMs: 5000,
            sleep,
            onAttempt: attempt => {
              sendLog(
                'info',
                'GEMINI_SUBMIT_ATTEMPT',
                'Tentativa de submit iniciada',
                { attempt }
              );

              if (attempt === 2) {
                // Retry local; não ativa aba/janela nem dispara DO_SEND_NOW.
                setAntiThrottleMode('legacy');
                sendLog('warn', 'GEMINI_SEND_RETRY_BACKGROUND', 'Nova tentativa de envio em segundo plano', {
                  executionMode, jobIdPrefix: String(job.jobId || '').slice(0, 8),
                });
              }
            },
            mainWorldFallback: async () => {
              pageWindow.dispatchEvent(new CustomEventImpl(
                'MANGA_TRANSLATOR_TRIGGER_SEND'
              ));
              sendLog(
                'warn',
                'GEMINI_SEND_FALLBACK',
                'Fallback MAIN-world tentado; aguardando confirmação observável',
                {}
              );
              return true;
            },
          });
        } catch (submitError) {
          if (submitError?.code === 'GEMINI_SUBMISSION_NOT_CONFIRMED') {
            sendLog(
              'error',
              'GEMINI_SUBMISSION_NOT_CONFIRMED',
              'Nenhuma transição da UI confirmou o envio após duas tentativas',
              {}
            );
            const error = new Error('GEMINI_SUBMISSION_NOT_CONFIRMED');
            error.code = 'GEMINI_SUBMISSION_NOT_CONFIRMED';
            throw error;
          }
          throw submitError;
        }

        setAntiThrottleMode(steadyAntiThrottleMode);
        sendLog(
          'success',
          'GEMINI_SEND_SUCCESS',
          'Envio confirmado por transição observável da UI',
          { attempt: submission.attempt, reason: submission.reason }
        );
        debugConsole(
          'log',
          '[MangaTranslator Gemini] Envio confirmado pelo Observer V2.',
          { attempt: submission.attempt, reason: submission.reason }
        );
        assertStage(
          submission && submission.confirmed,
          'Envio não foi confirmado pela interface.',
          4,
          'Submit confirmado pela UI'
        );

        reportProgress('🧠 GEMINI PROCESSANDO...', job.mangaTabId);
        createGeminiManualPanel(job, () => ignoreImages);

        const shouldDeleteConversation =
          executionMode === 'minimized_window' ||
          executionMode === 'background_delete' ||
          (
            executionMode === 'temp_chat' &&
            tempChatResult.notFound &&
            !tempChatResult.alreadyActive
          );

        const configuredTimeout = Number(scope.__MT_GEMINI_GENERATION_TIMEOUT_MS__);
        const waitTimeoutMs =
          Number.isFinite(configuredTimeout) && configuredTimeout > 0
            ? configuredTimeout
            : 4 * 60 * 1000;

        const waitStartedAt = Date.now();
        const progressTimer = setIntervalFn(() => {
          const elapsedSeconds = Math.floor((Date.now() - waitStartedAt) / 1000);
          reportProgress(
            `🧠 GEMINI PROCESSANDO (${elapsedSeconds}s)...`,
            job.mangaTabId
          );
        }, 5000);

        let resultUrl = null;
        let resultImageElement = null;

        try {
          const observedResult = await activeObserver.waitForResult(waitTimeoutMs);
          resultUrl = observedResult && observedResult.url;
          resultImageElement = observedResult && observedResult.image;
        } catch (waitError) {
          if (waitError?.code === 'GEMINI_UI_ERROR') {
            sendLog(
              'error',
              'GEMINI_ERROR',
              'Erro visível da UI detectado pelo Observer V2',
              { messageLength: String(waitError.message || '').length }
            );
            await deliverWithSecureDeletion({
              action: 'GEMINI_ERROR',
              mangaTabId: job.mangaTabId,
              index: job.index,
              error:
                `Retornou erro interface: ${String(waitError.message || 'Erro da interface do Gemini')}`,
              jobId: job.jobId,
              batchId: job.batchId,
            }, shouldDeleteConversation);
            return { status: 'ui_error' };
          }

          if (waitError?.code === 'GEMINI_RESULT_TIMEOUT') {
            sendLog(
              'error',
              'GEMINI_TIMEOUT',
              'Timeout de geração aguardando Observer V2',
              {}
            );
            await deliverWithSecureDeletion({
              action: 'GEMINI_ERROR',
              mangaTabId: job.mangaTabId,
              index: job.index,
              error: 'Tempo limite (4 min)',
              jobId: job.jobId,
              batchId: job.batchId,
            }, shouldDeleteConversation);
            return { status: 'result_timeout' };
          }

          throw waitError;
        } finally {
          clearIntervalFn(progressTimer);
        }

        assertStage(
          resultUrl &&
            (
              resultUrl.startsWith('http') ||
              resultUrl.startsWith('blob') ||
              resultUrl.startsWith('data:image/')
            ),
          'URL Imagem inválida',
          5,
          'Mídia extraída blob'
        );

        sendLog(
          'success',
          'GEMINI_IMG_FOUND',
          'Imagem gerada!',
          getUrlLogMetadata(resultUrl)
        );
        reportProgress('📥 EXTRAINDO IMAGEM...', job.mangaTabId);

        if (
          resultUrl.includes('googleusercontent.com') &&
          /=s\d+/.test(resultUrl)
        ) {
          resultUrl = resultUrl.replace(/=s\d+[^?#]*/, '=s0');
        }

        const extraction = await resultExtractor.extractOrAuxiliaryFallback({
          resultImageElement,
          resultUrl,
          executionMode,
          maxAttempts: 4,
          retryDelayMs: 1000,
          logContext: {
            jobIdPrefix: String(job.jobId || '').slice(0, 8),
            batchIdPrefix: String(job.batchId || '').slice(0, 8),
            index: job.index,
          },
          onAuxiliaryFallback: async ({ url }) => {
            const registered = await sendRuntimeMessageAsync({
              action: 'GEMINI_RESULT_URL',
              mangaTabId: job.mangaTabId,
              index: job.index,
              url,
              jobId: job.jobId,
              batchId: job.batchId,
            });
            if (!registered?.ok || registered.extractionRegistered !== true) {
              const error = new Error(`Fallback auxiliar não foi registrado: ${registered?.reason || 'registration_failed'}`);
              error.code = 'AUXILIARY_REGISTRATION_FAILED';
              throw error;
            }
            sendLog('info', 'GEMINI_AUXILIARY_REGISTERED',
              'Aba auxiliar assumiu a extração; o job Gemini permanecerá vivo até a persistência.', {
                jobIdPrefix: String(job.jobId || '').slice(0, 8),
                batchIdPrefix: String(job.batchId || '').slice(0, 8),
              });
            return registered;
          },
        });

        if (extraction.kind === 'extracted' && extraction.dataUrl) {
          try {
            const quarantineResult = await imageQuarantine.assessExtractedResult({
              element: resultImageElement,
              candidateDataUrl: extraction.dataUrl,
              inputDataUrl: job.srcData,
              inputHash: inputImageHash,
            });
            if (quarantineResult.quarantined) {
              sendLog(
                'error',
                'GEMINI_RESULT_MATCHES_INPUT',
                'Resultado bloqueado pela quarentena de imagem',
                { reason: quarantineResult.reason, exactMatch: quarantineResult.exactMatch === true }
              );
              const quarantineError = new Error('O resultado do Gemini é idêntico à imagem de entrada.');
              quarantineError.code = 'GEMINI_RESULT_MATCHES_INPUT';
              quarantineError.alreadyLogged = true;
              throw quarantineError;
            }
          } catch (quarantineError) {
            if (quarantineError?.code === 'GEMINI_RESULT_MATCHES_INPUT') throw quarantineError;
            sendLog(
              'warn',
              'GEMINI_QUARANTINE_HASH_UNAVAILABLE',
              'A comparação exata do resultado falhou; o fluxo continuará com os filtros estruturais',
              { messageLength: String(quarantineError?.message || '').length }
            );
          }

          await stageAndCommitResult({
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: job.mangaTabId,
            index: job.index,
            src: extraction.dataUrl,
            jobId: job.jobId,
            batchId: job.batchId,
          });
        }

        return {
          status: extraction.kind === 'extracted'
            ? 'delivered_extracted'
            : 'delivered_auxiliary',
        };
      } catch (error) {
        if (!error?.alreadyLogged) {
          sendLog(
            'error',
            error?.code || 'GEMINI_ERROR',
            'Job Gemini encerrado com erro',
            {
              executionMode,
              index: job.index,
              messageLength: String(error?.message || '').length,
            }
          );
        }
        runtime.sendMessage({
          action: 'GEMINI_ERROR',
          mangaTabId: job.mangaTabId,
          index: job.index,
          error: error.message,
          jobId: job.jobId,
          batchId: job.batchId,
        });
        return { status: 'error', error };
      } finally {
        setAntiThrottleMode('minimal');

        if (activeObserver) {
          try { activeObserver.stop(); } catch (_e) {}
          activeObserver = null;
        }

        if (pageWindow.__mangaTranslatorActiveGeminiObserver) {
          delete pageWindow.__mangaTranslatorActiveGeminiObserver;
        }

        stopScrollAssist();
        closeKeepAlive();
        removeGeminiManualPanel();

        if (pageWindow.__mangaTranslatorManualPickHandler) {
          root.removeEventListener(
            'click',
            pageWindow.__mangaTranslatorManualPickHandler,
            true
          );
          delete pageWindow.__mangaTranslatorManualPickHandler;
        }

        queryAllDeep('img').forEach(image => {
          if (image.style.outline?.includes('#FF4444')) {
            image.style.outline = '';
            image.style.outlineOffset = '';
          }
        });
      }
    }

    function getActiveObserver() {
      return activeObserver;
    }

    return {
      run,
      dataURLtoFile,
      waitForElement,
      tryClickModelImageCards,
      isLikelyGeneratedImage,
      isManualSelectableImage,
      findGeneratedResultImages,
      setManualGeminiResultUrl,
      removeGeminiManualPanel,
      createGeminiManualPanel,
      setPromptInEditor,
      shouldKeepConversationForDebug,
      requestImageData,
      getAntiThrottleModeForExecutionMode,
      setAntiThrottleMode,
      getActiveObserver,
    };
  }

  const api = { createGeminiJobRunner };
  scope.MangaTranslatorGeminiJobRunner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);

```

**Fim da fonte integral.** O bloco acima corresponde ao blob `1b16fd656e82e64ef2d26977e061f87e469aa3ff`; o newline final é contabilizado como posição 1472.
# Bíblia técnica — extension/content/gemini/editor.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** **0adbd4374758095acd84eda56522a2eb2c64fb1b**  
> **Linhas textuais:** **173**  
> **Posições documentais:** **174**, contando o newline final  
> **Tipo:** JavaScript de content script / módulo IIFE com export CommonJS para testes  
> **Runtime principal:** Chromium Manifest V3, content script do Gemini no isolated world  
> **Agente responsável pela auditoria:** **GPT-5.6-Sol#E**

## 1. Identidade e papel arquitetural

Este arquivo encapsula as interações de baixo nível com o editor e com a tentativa de envio do Gemini. Ele deliberadamente não declara sucesso apenas porque um click, Enter ou fallback foi disparado. A confirmação é delegada ao Observer V2, cuja função waitForSubmission resolve somente quando existe uma transição observável da interface.

No manifest, a cadeia relevante é carregada nesta ordem: selectors.js → dom.js → image-quarantine.js → observer.js → editor.js → attachment.js → temporary-chat.js → result-extractor.js → deletion.js → job-runner.js → content_gemini.js. O bloco que contém editor.js não declara world, portanto usa o isolated world padrão do content script. Isso mantém o módulo separado do estado JavaScript privado da página; quando o fluxo precisa acionar comportamento no MAIN world, recebe mainWorldFallback do consumidor em vez de fingir que um evento local equivale a sucesso.

### Quem carrega

- extension/manifest.json injeta editor.js depois de dom.js e observer.js e antes de job-runner.js/content_gemini.js.
- Em Jest, tests/unit/content-gemini/editor-submit.test.js carrega selectors.js, dom.js, observer.js e o editor.js real via require dentro de jest.isolateModules.

### Quem consome

- extension/content/gemini/job-runner.js recebe scope.MangaTranslatorGeminiEditor e chama submitWithConfirmation no fluxo normal de job.
- extension/content/content_gemini.js lê globalThis.MangaTranslatorGeminiEditor e, no handler legado DO_SEND_NOW, usa clickSendButton ou nudgeEditor.
- Os testes unitários de job-runner usam editorApi mockado; eles provam o contrato do consumidor, não a implementação interna de editor.js.

### Dependência direta

A única dependência funcional direta é MangaTranslatorGeminiDom, especialmente domApi.isControlEnabled. No browser ela já deve existir no global; em CommonJS o módulo tenta require('./dom.js'). Se nenhuma forma estiver disponível, o carregamento falha imediatamente.

## 2. Contrato central: tentativa não é confirmação

As linhas 2–5 definem a regra que governa o arquivo inteiro: focus, nudge, click, Enter e MAIN-world fallback são somente tentativas. submitWithConfirmation só retorna confirmed:true depois que observer.waitForSubmission resolve.

Isso evita um falso positivo perigoso em uma SPA reativa como o Gemini. Um botão pode aceitar click() sem iniciar geração; um KeyboardEvent sintético pode ser ignorado; um listener pode bloquear eventos não trusted; o framework pode rerenderizar o botão entre a descoberta e a ação. Se o módulo tratasse “dispatchEvent não lançou” como “mensagem enviada”, o job avançaria para espera de resultado em estado incorreto e poderia ficar preso por minutos.

O Observer V2 confirma por evidências como:
- editor consumido;
- botão Stop visível;
- nova resposta de modelo;
- transição real do Send para estado busy.

O teste SEND-02 prova diretamente que click sem transição observável termina em GEMINI_SUBMISSION_NOT_CONFIRMED. SEND-03 prova o mesmo para fallback MAIN que retorna true mas não modifica a UI.

## 3. focusElement — linhas 14–22

### O que faz

Recebe um elemento e tenta focá-lo sem rolar a página. Retorna false se não houver elemento/focus utilizável; tenta focus({preventScroll:true}); se isso lançar, tenta focus() simples; se o segundo também falhar, retorna false.

### Como faz

O primeiro guard impede TypeError em null/objetos sem focus. O try principal usa preventScroll para não deslocar a viewport. O catch fornece compatibilidade com implementações de focus que rejeitam options.

### Por que assim

O editor e o botão Send podem depender de foco para o framework atualizar estado ou aceitar a interação. Evitar scroll reduz efeitos visuais desnecessários em automação de background.

### Por que uma implementação ingênua seria pior

Chamar focus({preventScroll:true}) sem fallback poderia quebrar em DOMs parciais/test doubles. Chamar focus() sem preventScroll pode alterar posição visível da página. Assumir que “focus não lançou” significa “document.activeElement mudou” seria incorreto; este helper só informa que a chamada foi aceita.

### Evidência

🟨 EXECUTADO INDIRETAMENTE: os fluxos SEND-01/03/04/05/06/07 chamam helpers que invocam focusElement, mas nenhuma assertion verifica activeElement, preventScroll ou o fallback focus().

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para:
- elemento sem focus;
- focus com options lançando e fallback simples funcionando;
- ambos os focus lançando;
- foco efetivo versus mero retorno sem exceção.

## 4. nudgeEditor — linhas 24–46

### O que faz

Tenta provocar o framework do editor a reavaliar o conteúdo sem adulterar disabled/aria-disabled do botão Send.

### Como faz

1. rejeita editor ausente;
2. tenta focar o editor;
3. prefere InputEvent('input') com bubbles, composed, inputType insertText e data null;
4. se InputEvent não existir usa Event('input');
5. se a construção/dispatch de InputEvent lançar, tenta Event('input');
6. em seguida tenta Event('change');
7. retorna true para editor presente, mesmo se os dispatches internos falharem e forem engolidos.

### Por que assim

O botão de envio é controlado pelo estado do framework do Gemini. Forçar button.disabled=false criaria uma aparência de habilitado sem garantir que o framework aceitou o prompt. Emitir input/change pede ao próprio framework que reconcilie seu estado.

### Evidência

✅ PROVADO DIRETAMENTE — SEND-06 instala um listener real de input que habilita o botão. O submit real chama nudgeEditor e o teste confirma sucesso na primeira tentativa e button.disabled=false. Isso demonstra que o evento input real do módulo alcança o listener e que a estratégia pode reabilitar o controle sem mutação direta feita pelo editor.js.

✅ PROVADO DIRETAMENTE — SEND-05 mantém disabled, atributo disabled e aria-disabled=true após duas tentativas; prova que editor.js não força esses flags.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para o evento change, para ausência de InputEvent, para constructor/dispatch lançando e para o caso em que todos os eventos falham mas nudgeEditor ainda retorna true.

## 5. clickSendButton — linhas 48–69

### O que faz

Recusa botão ausente/desabilitado. Em botão utilizável, foca e emite uma sequência sintética pointer/mouse antes de chamar button.click().

### Como faz

Cria opts com bubbles/cancelable/composed e view. Se PointerEvent existe, dispara pointerdown e pointerup. Se MouseEvent existe, dispara mousedown e mouseup. Depois chama click() se disponível.

### Por que assim

Interfaces modernas podem escutar mais do que o evento click. A sequência amplia compatibilidade com handlers que atualizam estado em down/up. O gate isControlEnabled impede “habilitar na marra” um controle que o Gemini considera indisponível.

### Evidência

✅ PROVADO DIRETAMENTE — SEND-01 usa botão habilitado cujo listener click limpa o editor; submitWithConfirmation retorna confirmed:true, reason editor_consumed, attempt 1. Isso prova que o caminho real clickSendButton alcança o click handler e não confunde tentativa com confirmação.

✅ PROVADO DIRETAMENTE — SEND-02 executa o mesmo caminho com botão que não gera transição e recebe GEMINI_SUBMISSION_NOT_CONFIRMED.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para:
- ordem e presença de pointerdown/mousedown/mouseup/pointerup;
- cancelamento de dispatchEvent;
- botão sem método click;
- focus falhar antes do click;
- PointerEvent/MouseEvent indisponíveis;
- qualquer etapa lançar e produzir false.

### Risco técnico

Os eventos são sintéticos e portanto não equivalem a input humano trusted. Além disso, a sequência explicitada no arquivo não possui teste que fixe sua ordem. Um framework que dependa de isTrusted ou de outra ordem de eventos pode ignorar a tentativa; o design mitiga isso porque o Observer, não o retorno do helper, decide sucesso.

## 6. pressEnter — linhas 71–88

### O que faz

Foca o editor e dispara somente KeyboardEvent keydown para Enter, com key/code e os campos legados keyCode/which iguais a 13.

### Papel

É o fallback local da primeira tentativa quando não existe botão Send habilitado após o nudge.

### Evidência

🟨 EXECUTADO INDIRETAMENTE — SEND-03/04/05 chegam à primeira tentativa com botão disabled, portanto o ramo de pressEnter é percorrido. Porém nenhum listener keydown/assertion verifica que o evento foi recebido ou que seus campos estão corretos.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para keydown, key/code/keyCode/which, falha do construtor KeyboardEvent e retorno false.

### Fragilidade

O helper não dispara keypress/keyup. Isso é intencionalmente minimalista, mas um editor que mude para listener de keyup pode deixar de responder. Novamente, a ausência de transição não vira sucesso falso.

## 7. submitWithConfirmation — linhas 90–161

Esta é a função de orquestração e o contrato mais importante do arquivo.

### 7.1 Dependências obrigatórias — linhas 100–105

- observer deve existir e expor waitForSubmission;
- getEditor e getSendButton devem ser funções;
- ausência dessas dependências gera erro imediatamente.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esses throws de validação.

### 7.2 Tentativas e callback — linhas 107–115

lastError preserva a última falha de confirmação. O loop começa em attempt=1 e continua enquanto attempt<=maxAttempts.

onAttempt é best-effort: se existir, é chamado antes de buscar editor/botão; exceções do callback são engolidas para não quebrar o envio.

✅ PROVADO DIRETAMENTE — SEND-07 captura onAttempt e exige exatamente [1, 2], além de provar término em menos de um segundo com timeout reduzido.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para onAttempt lançando.

### 7.3 Reobtenção após nudge — linhas 114–124

A cada tentativa o módulo busca editor e botão atuais. Se botão não existe ou está desabilitado, nudgeEditor(editor), espera 150 ms e busca novamente ambos.

Isso é importante em Gemini/SPA porque o framework pode substituir nós DOM. Reutilizar a referência velha depois do input seria vulnerável a stale element.

✅ PROVADO DIRETAMENTE EM EFEITO — SEND-06 mostra que nudge pode habilitar o botão antes da ação.  
🟨 PARCIAL — o teste usa o mesmo objeto button, então não prova especificamente substituição de nó e reobtenção de uma nova instância.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para rerender que troque editor/button durante os 150 ms.

### 7.4 Estratégia escalonada — linhas 126–136

A prioridade é:
1. botão Send habilitado → clickSendButton;
2. sem botão utilizável na primeira tentativa → pressEnter;
3. sem botão utilizável em tentativa posterior → mainWorldFallback, se fornecido.

MAIN world é último recurso porque pode atravessar a fronteira de isolated world e falar com lógica mais próxima da página. Seu retorno booleano ainda significa somente “tentativa disparada”.

✅ PROVADO DIRETAMENTE — SEND-03 exige que fallback seja chamado uma vez em duas tentativas e, sem transição da UI, o resultado continue sendo falha.  
✅ PROVADO DIRETAMENTE — SEND-04 faz o fallback criar Stop visível e chamar observer.inspect(); a função retorna confirmed:true, reason stop_visible, attempt 2.  
✅ PROVADO DIRETAMENTE — SEND-05 mostra que disabled permanece intacto durante esse escalonamento.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para mainWorldFallback lançando; o código converte esse caso em attempted=false e continua aguardando o observer.

### 7.5 Observer como única fonte de verdade — linhas 138–154

Após qualquer tentativa — inclusive attempted=false — o módulo chama observer.waitForSubmission(confirmationTimeoutMs).

Se resolver, retorna:
- confirmed:true;
- reason fornecido pelo observer;
- número da tentativa;
- attempted, indicando apenas se uma ação foi disparada pelo módulo/fallback.

Se rejeitar:
- guarda error em lastError;
- se error.code existe e é diferente de GEMINI_SUBMISSION_NOT_CONFIRMED, relança imediatamente;
- timeout de confirmação permite próxima tentativa.

Essa decisão tolera corrida legítima: outra bridge pode ter iniciado geração entre a preparação e a tentativa local. A contrapartida é que a função confirma uma transição observada, não causalidade exclusiva. Interação manual concorrente na mesma aba poderia teoricamente produzir a transição que satisfaz o observer.

✅ PROVADO DIRETAMENTE — SEND-01/02/03/04 demonstram a diferença entre ação disparada e confirmação observada.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para erro do observer com code diferente e para erro sem code.

### 7.6 Falha terminal — linhas 157–160

Depois de esgotar tentativas cria novo Error('GEMINI_SUBMISSION_NOT_CONFIRMED'), define code igual e encadeia lastError em cause.

✅ PROVADO DIRETAMENTE — SEND-02/03/05/07 exigem code GEMINI_SUBMISSION_NOT_CONFIRMED.

⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para error.cause e para maxAttempts=0.

## 8. Relação com Observer V2

observer.js mostra por que a arquitetura separa tentativa de confirmação:

- confirmSubmission grava state.submissionConfirmed e resolve waiters;
- nova resposta pode confirmar response_created;
- editor vazio pode confirmar editor_consumed;
- Stop visível marca generation active e confirma stop_visible;
- Send só confirma send_busy se antes foi observado habilitado e depois todos os controles ficaram indisponíveis;
- waitForSubmission usa timeout e rejeita com GEMINI_SUBMISSION_NOT_CONFIRMED quando nenhuma evidência aparece.

Isso evita considerar um botão que já nasceu disabled como evidência de envio.

## 9. Consumidor principal: job-runner.js

O job-runner instala o observer antes do submit e chama o módulo com:
- getEditor profundo e fallback activeEditable;
- domApi.findSendButton(root.body);
- maxAttempts:2;
- confirmationTimeoutMs:5000;
- sleep real/injetado;
- onAttempt que loga e, na segunda tentativa, ativa anti-throttle legacy;
- mainWorldFallback que dispara MANGA_TRANSLATOR_TRIGGER_SEND e retorna true.

Se editor.js entrega GEMINI_SUBMISSION_NOT_CONFIRMED, o runner registra o erro e relança um erro normalizado com o mesmo code. Só após confirmação ele retorna ao anti-throttle steady e registra GEMINI_SEND_SUCCESS com attempt/reason.

### Evidência do consumidor

🟨 EXECUTADO COM MOCK — tests/unit/content-gemini/job-runner.test.js fornece editorApi.submitWithConfirmation como jest.fn. Isso prova como o runner consome o contrato e reage a callbacks/estados, mas não prova a lógica interna deste arquivo.

## 10. Consumidor legado: content_gemini.js / DO_SEND_NOW

O receiver:
- evita reenviar se já há Stop visível;
- encontra editor e botão;
- usa clickSendButton se habilitado;
- caso contrário chama nudgeEditor e dispara MANGA_TRANSLATOR_TRIGGER_SEND;
- responde {ok:true, attempted}.

A Bíblia de content_gemini.js já classifica esse receiver como sem assertion direta específica. Portanto sua existência é evidência de consumo, não prova adicional de editor.js.

## 11. E2E relacionado

tests/e2e/translation-flow.spec.js contém o caso “E2E submit ignorado”, que configura um Gemini fake com ignoreSubmit=1, inicia tradução e espera surgir log GEMINI_SUBMISSION_NOT_CONFIRMED em menos de 35 s.

🟨 EXECUTADO INDIRETAMENTE / FLUXO INTEGRADO: esse teste é evidência forte de que o sistema completo termina cedo quando a UI ignora o submit, mas a assertion observa o log no background e não isola qual helper interno do editor.js produziu cada etapa. Ele complementa, não substitui, SEND-02/03/07.

## 12. API pública e exports — linhas 163–173

O objeto api exporta focusElement, nudgeEditor, clickSendButton, pressEnter e submitWithConfirmation. Ele é publicado em scope.MangaTranslatorGeminiEditor para o browser e em module.exports quando CommonJS existe.

✅ PROVADO DIRETAMENTE para CommonJS: editor-submit.test.js require(EDITOR_PATH) e chama a API retornada.  
🟦 GATE ESTÁTICO ESPECÍFICO para ordem browser: manifest.json posiciona editor.js antes dos consumidores.  
⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a atribuição global isoladamente e para ausência de module.

## 13. Segurança, privacidade e trust boundaries

Este módulo:
- não usa chrome.storage;
- não faz fetch;
- não lê cookies/tokens;
- não persiste prompt;
- não serializa conteúdo do editor;
- não registra texto do prompt.

A fronteira de confiança é o DOM do Gemini e as dependências injetadas pelo próprio content script.

Pontos importantes:
1. nunca remove disabled/aria-disabled para forçar envio;
2. não aceita o retorno de click/Enter/fallback como prova de sucesso;
3. MAIN-world fallback é fornecido externamente e tratado como tentativa;
4. observer decide sucesso por transição de UI, reduzindo spoofing acidental por retorno booleano;
5. getters fornecidos pelo consumidor não são validados além de “ser função”; exceções deles propagam.

Risco residual: transição observada pode ser causada por ação concorrente/manual, pois a confirmação prova estado da UI, não causalidade criptográfica entre job e evento.

## 14. Lifecycle e MV3

editor.js roda em content script, não no Service Worker. Portanto as regras de suspensão do worker não eliminam seu estado no meio de uma chamada enquanto a página/contexto continuar vivo.

Mesmo assim:
- navegação/fechamento da aba destrói o contexto;
- DOM do Gemini é altamente mutável;
- referências podem ficar stale após rerender;
- por isso getEditor/getSendButton são funções e são chamadas novamente após nudge;
- nenhum estado durável vive aqui;
- lastError, attempt e referências são locais à chamada;
- não existe timer de longa duração próprio além do sleep aguardado; o timeout de confirmação é gerido pelo observer.

Não há AbortSignal. Se o consumidor quiser cancelamento explícito sem destruir o contexto, este módulo não fornece mecanismo próprio.

## 15. Casos-limite

| Caso | Comportamento atual | Evidência |
|---|---|---|
| element null em focus | false | ⚠️ sem assertion |
| editor null em nudge | false | ⚠️ sem assertion |
| botão null/disabled | clickSendButton false | parcialmente percorrido em SEND-03/05 |
| InputEvent ausente | Event input | ⚠️ sem assertion |
| InputEvent lança | fallback Event input | ⚠️ sem assertion |
| change lança | erro engolido; true | ⚠️ sem assertion |
| botão desabilitado após nudge | tentativa 1 usa Enter | 🟨 ramo executado, sem assertion do keydown |
| botão continua desabilitado na tentativa 2 | MAIN fallback se existir | ✅ SEND-03/04/05 |
| fallback MAIN lança | attempted=false; ainda espera observer | ⚠️ sem assertion |
| observer confirma apesar de attempted=false | aceita confirmação | ⚠️ sem assertion específica |
| observer dá erro não-timeout com code | relança | ⚠️ sem assertion |
| maxAttempts=0 | pula loop e lança NOT_CONFIRMED com cause null | ⚠️ sem assertion |
| maxAttempts=Infinity | laço potencialmente ilimitado | ⚠️ sem validação/teste |
| timeout negativo/NaN | delegado ao observer/timer | ⚠️ sem validação/teste |
| getter lança | erro propaga | ⚠️ sem assertion |
| sleep lança | erro propaga | ⚠️ sem assertion |
| onAttempt lança | erro engolido | ⚠️ sem assertion |

## 16. Lacunas de teste

### L-01 — focusElement e fallback de focus
**Comportamento:** preventScroll, fallback simples, falhas.  
**Por que testes atuais não provam:** nenhum assert inspeciona argumentos de focus ou activeElement.  
**Teste necessário:** mock de element.focus que registre chamada, lance na primeira e funcione/falhe na segunda.  
**Regressão possível:** helper retornar valor incorreto ou perder compatibilidade com DOM parcial.

### L-02 — fallback de InputEvent e evento change
**Comportamento:** caminhos sem InputEvent/constructor falhando e change.  
**Por que não provado:** SEND-06 cobre input normal apenas.  
**Teste necessário:** remover/mockar InputEvent, escutar input/change e forçar exceção.  
**Regressão possível:** botão nunca reavaliar em ambientes específicos.

### L-03 — sequência sintética do click
**Comportamento:** pointerdown/mousedown/mouseup/pointerup/click.  
**Por que não provado:** SEND-01 só prova efeito final do click.  
**Teste necessário:** listeners registrando ordem/tipos e cenários sem PointerEvent/MouseEvent.  
**Regressão possível:** mudança de ordem quebrar handler do framework sem detecção unitária.

### L-04 — pressEnter
**Comportamento:** KeyboardEvent keydown com Enter/13.  
**Por que não provado:** ramo é percorrido, mas não existe assertion do evento.  
**Teste necessário:** listener keydown no editor validando key/code/keyCode/which/composed.  
**Regressão possível:** fallback local parar de acionar Gemini.

### L-05 — argumentos obrigatórios
**Comportamento:** throws para observer/getters ausentes.  
**Teste necessário:** casos parametrizados.  
**Regressão possível:** erro tardio menos diagnosticável.

### L-06 — erro não-timeout do observer
**Comportamento:** relançar GEMINI_UI_ERROR/OBSERVER_STOPPED imediatamente.  
**Teste necessário:** observer fake rejeitando com code distinto.  
**Regressão possível:** retry indevido mascarar erro real de UI.

### L-07 — cause final
**Comportamento:** erro terminal deve manter lastError em cause.  
**Teste necessário:** observer fake rejeitando timeout conhecido e assert identity de cause.  
**Regressão possível:** perda de diagnóstico.

### L-08 — valores anômalos de maxAttempts/timeout
**Comportamento:** não há validação.  
**Teste necessário:** 0, negativo, não inteiro, Infinity, timeout <=0/NaN.  
**Regressão possível:** laço infinito ou falha imediata difícil de diagnosticar.

### L-09 — re-render real do botão
**Comportamento:** nudge seguido de nova consulta deve aceitar novo nó.  
**Teste necessário:** getSendButton devolver botão disabled primeiro e nova instância enabled depois do sleep.  
**Regressão possível:** uso acidental de referência stale.

### L-10 — confirmação concorrente sem ação local
**Comportamento:** observer pode confirmar mesmo com attempted=false.  
**Teste necessário:** simular transição observável disparada externamente antes/durante waitForSubmission.  
**Regressão possível:** alterar sem querer a semântica tolerante a race; ou atribuir evento manual ao job.

## 17. Análise crítica

1. **Retornos de helpers são “disparado sem exceção”, não sucesso semântico.** Isso é correto, mas deve continuar explicitamente separado de confirmed.
2. **Erros best-effort são amplamente engolidos.** Bom para resiliência de UI, porém reduz diagnóstico fino.
3. **maxAttempts e confirmationTimeoutMs não são validados.** Hoje são constantes internas confiáveis no runner; se a API ganhar callers externos, isso vira risco maior.
4. **Eventos sintéticos não são trusted.** A robustez depende de o Gemini aceitar esses eventos ou do fallback/observer capturar a realidade.
5. **pressEnter é mínimo.** Só keydown; nenhuma garantia para frameworks que migrem a lógica para keyup.
6. **A sequência Pointer/Mouse não está congelada por teste.** Mudança acidental pode passar toda a suíte se button.click continuar acionando o mock simples.
7. **Confirmação observa correlação temporal, não causalidade exclusiva.** Uma ação manual concorrente pode satisfazer o observer. O sistema mitiga via ownership do job/aba em camadas externas, mas editor.js isolado não conhece jobId.
8. **Getters são uma decisão arquitetural correta.** Eles evitam manter referência stale numa SPA. Trocar por elementos capturados uma única vez seria pior.
9. **Não há persistência nem dados sensíveis neste módulo.** Isso limita superfície de privacidade.

## 18. Invariantes

1. Uma ação sintética nunca pode, por si só, ser tratada como envio confirmado.
2. observer.waitForSubmission deve continuar sendo a fonte de verdade de submit.
3. disabled e aria-disabled do Gemini não podem ser removidos/forçados por este módulo.
4. Depois de nudge, editor e botão devem ser consultados novamente.
5. MAIN-world fallback só pode representar tentativa, nunca sucesso.
6. Erros do observer diferentes de NOT_CONFIRMED não devem ser convertidos em retry silencioso.
7. O erro terminal deve manter code GEMINI_SUBMISSION_NOT_CONFIRMED.
8. O número de tentativas deve ser observável via onAttempt e respeitar maxAttempts.
9. O módulo deve continuar podendo carregar no browser via global e em testes via CommonJS.
10. MangaTranslatorGeminiDom deve existir antes da operação.
11. O módulo não deve persistir, logar ou exfiltrar conteúdo do editor.
12. Alterações futuras precisam preservar a capacidade de lidar com rerender/stale DOM.
13. A cobertura de testes não pode chamar job-runner mockado de prova da implementação real.
14. O newline final e todas as 173 linhas textuais permanecem rastreados por esta Bíblia no SHA auditado.

## 19. Matriz de evidências automatizadas

| Comportamento | Teste/evidência | O que realmente prova | Classificação |
|---|---|---|---|
| módulo real é carregável em CommonJS | editor-submit.test.js linhas 10–19 | require do editor.js real após dependências reais | ✅ PROVADO DIRETAMENTE |
| botão habilitado + UI consumida | SEND-01 linhas 71–95 | click real chega ao handler e observer confirma editor_consumed na tentativa 1 | ✅ PROVADO DIRETAMENTE |
| click sem transição não vira sucesso | SEND-02 linhas 97–118 | rejeição NOT_CONFIRMED e prompt permanece | ✅ PROVADO DIRETAMENTE |
| fallback MAIN sem transição não vira sucesso | SEND-03 linhas 120–143 | fallback chamado uma vez e ainda falha | ✅ PROVADO DIRETAMENTE |
| fallback MAIN + Stop | SEND-04 linhas 145–176 | observer confirma stop_visible na tentativa 2 | ✅ PROVADO DIRETAMENTE |
| não forçar disabled | SEND-05 linhas 178–204 | disabled/atributos permanecem | ✅ PROVADO DIRETAMENTE |
| nudge input reabilita botão | SEND-06 linhas 206–236 | listener input recebe evento e fluxo confirma | ✅ PROVADO DIRETAMENTE |
| duas tentativas | SEND-07 linhas 238–263 | onAttempt recebe [1,2] e término curto | ✅ PROVADO DIRETAMENTE |
| contrato do runner | job-runner.test.js com editorApi mockado | consumidor espera API/callbacks, não internals | 🟨 EXECUTADO COM MOCK |
| falha integrada curta | translation-flow.spec.js linhas 750–785 | sistema completo registra NOT_CONFIRMED cedo | 🟨 EXECUTADO INDIRETAMENTE |
| ordem de carregamento | manifest.json linhas 54–72 | dom/observer precedem editor, runner sucede | 🟦 GATE ESTÁTICO ESPECÍFICO |
| focus fallback | nenhum | sem assertion específica | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| pressEnter payload | nenhum | ramo pode executar, propriedades não são verificadas | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| sequência Pointer/Mouse | nenhum | efeito final do click apenas | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| error.cause | nenhum | não verificado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| non-timeout observer error | nenhum | não verificado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 20. Cobertura documental linha a linha

A tabela abaixo cobre todas as posições do SHA auditado. Linhas em branco são explicitamente contabilizadas como separadores estruturais; a posição 174 é o newline final.

| Linhas/posição | Explicação específica |
|---|---|
| 1 | Ativa strict mode para evitar semântica JS permissiva acidental. |
| 2–5 | Comentário de identidade e contrato: ações são tentativas; Observer V2 é autoridade de confirmação. |
| 6 | Linha em branco separa cabeçalho da IIFE. |
| 7–12 | IIFE recebe scope; resolve MangaTranslatorGeminiDom pelo global ou require; fail-fast se indisponível. |
| 13 | Separador estrutural. |
| 14–22 | focusElement: guard, preventScroll, fallback de compatibilidade e false em falha total. |
| 23 | Separador estrutural. |
| 24–27 | nudgeEditor: guard e foco best-effort. |
| 28–39 | tenta InputEvent input detalhado; fallback para Event quando InputEvent não existe. |
| 40–42 | fallback adicional quando construção/dispatch de input lança; falhas finais são engolidas. |
| 43 | Separador estrutural. |
| 44–46 | change best-effort e true para editor presente. |
| 47 | Separador estrutural. |
| 48–50 | clickSendButton: gate por presença/isControlEnabled e foco best-effort. |
| 51 | Separador estrutural. |
| 52–65 | sequência Pointer/Mouse/click com options composed e view. |
| 66–69 | qualquer exceção torna a tentativa false. |
| 70 | Separador estrutural. |
| 71–73 | pressEnter: guard e foco. |
| 74–84 | constrói/dispatch keydown Enter com campos modernos e legados. |
| 85–88 | false em exceção; encerra helper. |
| 89 | Separador estrutural. |
| 90–99 | assinatura de submitWithConfirmation e defaults de sleep/maxAttempts/timeout. |
| 100–102 | valida observer.waitForSubmission. |
| 103–105 | valida getters editor/send. |
| 106 | Separador estrutural. |
| 107 | inicializa lastError para encadear falha final. |
| 108 | Separador estrutural. |
| 109–112 | loop de tentativas; callback onAttempt best-effort. |
| 113 | Separador estrutural. |
| 114–115 | obtém referências DOM atuais por getters. |
| 116 | Separador estrutural. |
| 117–118 | comentário proíbe falsificar disabled e explica reavaliação. |
| 119–124 | se botão não utilizável, nudge, espera 150 ms e reobtém editor/botão. |
| 125 | Separador estrutural. |
| 126 | attempted começa false em cada tentativa. |
| 127–128 | prioridade: botão habilitado → clickSendButton. |
| 129–131 | primeira tentativa sem botão → Enter local. |
| 132–136 | tentativas posteriores podem usar MAIN fallback; retorno apenas marca tentativa disparada; erro vira false. |
| 137 | Separador estrutural. |
| 138–140 | comentário explicita race e observer como única fonte de verdade. |
| 141–148 | espera confirmação e retorna confirmed/reason/attempt/attempted. |
| 149–154 | captura falha; guarda lastError; relança erros codificados que não sejam timeout de submit. |
| 155 | encerra loop. |
| 156 | Separador estrutural. |
| 157–160 | cria erro terminal normalizado, define code/cause e lança. |
| 161 | encerra função. |
| 162 | Separador estrutural. |
| 163–169 | constrói API pública com cinco funções. |
| 170 | Separador estrutural. |
| 171 | publica API no scope browser. |
| 172 | exporta mesma API em CommonJS. |
| 173 | fecha IIFE escolhendo self quando existe, senão globalThis. |
| 174 | Newline final do arquivo; preservado na cópia integral. |

## 21. Fonte integral auditada

Abaixo está a cópia integral do blob SHA **0adbd4374758095acd84eda56522a2eb2c64fb1b**. Não há trechos omitidos.

~~~javascript
'use strict';
// gemini/editor.js — Interações de editor/submit sem falsificar estado da UI.
//
// Contrato: ações deste módulo representam TENTATIVAS. Sucesso de envio só pode
// ser declarado pelo Observer V2 após uma transição observável do Gemini.

(function(scope) {
  let domApi = scope.MangaTranslatorGeminiDom || null;
  if (!domApi && typeof require === 'function') {
    try { domApi = require('./dom.js'); } catch (_e) {}
  }
  if (!domApi) throw new Error('MangaTranslatorGeminiDom indisponível');

  function focusElement(element) {
    if (!element || typeof element.focus !== 'function') return false;
    try {
      element.focus({ preventScroll: true });
      return true;
    } catch (_e) {
      try { element.focus(); return true; } catch (_e2) { return false; }
    }
  }

  function nudgeEditor(editor) {
    if (!editor) return false;
    focusElement(editor);

    try {
      if (typeof InputEvent === 'function') {
        editor.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: false,
          composed: true,
          inputType: 'insertText',
          data: null,
        }));
      } else {
        editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
    } catch (_e) {
      try { editor.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch (_e2) {}
    }

    try { editor.dispatchEvent(new Event('change', { bubbles: true, composed: true })); } catch (_e) {}
    return true;
  }

  function clickSendButton(button) {
    if (!button || !domApi.isControlEnabled(button)) return false;
    focusElement(button);

    try {
      const opts = { bubbles: true, cancelable: true, composed: true, view: scope.window || scope };
      if (typeof PointerEvent === 'function') {
        button.dispatchEvent(new PointerEvent('pointerdown', opts));
      }
      if (typeof MouseEvent === 'function') {
        button.dispatchEvent(new MouseEvent('mousedown', opts));
        button.dispatchEvent(new MouseEvent('mouseup', opts));
      }
      if (typeof PointerEvent === 'function') {
        button.dispatchEvent(new PointerEvent('pointerup', opts));
      }
      if (typeof button.click === 'function') button.click();
      return true;
    } catch (_e) {
      return false;
    }
  }

  function pressEnter(editor) {
    if (!editor) return false;
    focusElement(editor);
    try {
      editor.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
      }));
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function submitWithConfirmation({
    observer,
    getEditor,
    getSendButton,
    mainWorldFallback,
    onAttempt,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    maxAttempts = 2,
    confirmationTimeoutMs = 5000,
  } = {}) {
    if (!observer || typeof observer.waitForSubmission !== 'function') {
      throw new Error('Observer de submit é obrigatório');
    }
    if (typeof getEditor !== 'function' || typeof getSendButton !== 'function') {
      throw new Error('getEditor/getSendButton são obrigatórios');
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (typeof onAttempt === 'function') {
        try { onAttempt(attempt); } catch (_e) {}
      }

      let editor = getEditor();
      let button = getSendButton();

      // Não altere disabled/aria-disabled. Em vez disso, provoque o framework
      // a reavaliar o conteúdo e reobtenha o controle.
      if (!button || !domApi.isControlEnabled(button)) {
        nudgeEditor(editor);
        await sleep(150);
        editor = getEditor();
        button = getSendButton();
      }

      let attempted = false;
      if (button && domApi.isControlEnabled(button)) {
        attempted = clickSendButton(button);
      } else if (attempt === 1) {
        // Fallback semântico local: Enter. Ainda é apenas uma tentativa.
        attempted = pressEnter(editor);
      } else if (typeof mainWorldFallback === 'function') {
        // MAIN world é último recurso porque pode conhecer o estado interno do
        // framework. O retorno indica somente que a tentativa foi disparada.
        try { attempted = Boolean(await mainWorldFallback()); } catch (_e) { attempted = false; }
      }

      // Mesmo que o click/Enter não possa ser disparado, uma transição já pode
      // ter ocorrido (por exemplo, outro bridge iniciou geração). O observer é
      // a única fonte de verdade.
      try {
        const confirmation = await observer.waitForSubmission(confirmationTimeoutMs);
        return {
          confirmed: true,
          reason: confirmation.reason,
          attempt,
          attempted,
        };
      } catch (error) {
        lastError = error;
        if (error && error.code && error.code !== 'GEMINI_SUBMISSION_NOT_CONFIRMED') {
          throw error;
        }
      }
    }

    const error = new Error('GEMINI_SUBMISSION_NOT_CONFIRMED');
    error.code = 'GEMINI_SUBMISSION_NOT_CONFIRMED';
    error.cause = lastError || null;
    throw error;
  }

  const api = {
    focusElement,
    nudgeEditor,
    clickSendButton,
    pressEnter,
    submitWithConfirmation,
  };

  scope.MangaTranslatorGeminiEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## 22. Verificação de integralidade

- SHA do blob lido no branch docs/project-bible: **0adbd4374758095acd84eda56522a2eb2c64fb1b**.
- A fonte possui **173 linhas textuais** e termina com newline, totalizando **174 posições documentais**.
- A tabela da seção 20 cobre 1–174 sem lacunas.
- O bloco da seção 21 foi materializado diretamente a partir do conteúdo lido do branch, sem abreviação.
- Antes da conclusão global, o SHA deverá ser relido e comparado novamente com a reserva.

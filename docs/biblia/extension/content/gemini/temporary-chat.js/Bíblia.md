# Bíblia técnica — extension/content/gemini/temporary-chat.js

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE — documentação integral pronta; fechamento global depende do mutex compartilhado  
> **SHA auditado:** `40fbc8dc6acf6ae21dc5854aae3f14bfc029e3bc`  
> **Agente responsável pela auditoria:** GPT-5.6-Sol#J  
> **Tipo:** JavaScript — content-script helper Gemini / RPA de conversa temporária  
> **Linhas textuais:** **213**  
> **Posições documentais:** **214**, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

temporary-chat.js é o boundary responsável por tentar colocar o Gemini em **Conversa Temporária** sem confundir um clique com sucesso. O contrato central é observacional: o módulo localiza o controle por semântica/atributos, determina se o modo já está ativo, executa no máximo um clique bem-sucedido por chamada de ensureActive e somente retorna activated_verified depois que um sinal posterior do DOM prova o estado ativo.

Isso é materialmente importante no Manga Translator porque temp_chat é o modo de execução padrão em várias superfícies. O job runner usa este helper antes de anexar/enviar a imagem; portanto uma confirmação falsa pode fazer conteúdo do usuário cair em uma conversa normal do Gemini e permanecer no histórico, enquanto uma sequência de cliques ingênua poderia ligar e imediatamente desligar o toggle.

## 2. Carregamento, dependências e consumidores reais

- **Loader MV3:** extension/manifest.json injeta content/gemini/temporary-chat.js na posição imediatamente anterior a result-extractor.js, deletion.js, job-runner.js e content_gemini.js.
- **Composition root:** extension/content/content_gemini.js lê globalThis.MangaTranslatorGeminiTemporaryChat, falha se a API estiver ausente e a injeta no runner como temporaryChatApi.
- **Consumidor principal:** extension/content/gemini/job-runner.js exige temporaryChatApi na guarda de dependências. Quando executionMode === 'temp_chat', chama ensureActive({ root, timeoutMs: 12_000, sleep }).
- **Interpretação do consumidor:** job-runner considera already_active e activated_verified sucesso; unavailable vira notFound; verification_failed vira flag própria e warning.
- **Fallback posterior:** no cálculo shouldDeleteConversation, o modo temp_chat só agenda exclusão quando tempChatResult.notFound é verdadeiro. verification_failed não ativa esse fallback.
- **Dependências internas:** este arquivo não importa dom.js, storage, runtime ou APIs Chrome. Ele opera apenas sobre DOM/Window/Date/timers e o scope global.
- **Testes diretos:** tests/unit/content-gemini/temporary-chat-v2.test.js e tests/unit/content-gemini/temp-chat-activator.test.js fazem require da implementação real.
- **Execução indireta:** tests/helpers/load-content-gemini-module.js, rpa-flow.test.js, resolution-elevation.test.js e os E2E carregam o módulo como parte do conjunto Gemini, mas suas assertions não isolam todas as propriedades internas aqui documentadas.
- **Teste do consumidor:** job-runner.test.js usa temporaryChatApi.ensureActive como jest.fn; isso prova o contrato de injeção/guarda do runner, não a implementação real deste arquivo.

## 3. Lifecycle, estado e MV3

O módulo não persiste nenhum estado. KEYWORDS e as funções são estáticos; clicked, sawSemanticButton e start vivem somente dentro de cada chamada de ensureActive. O estado observado pertence à página Gemini aberta na aba, não ao service worker.

A suspensão do service worker MV3 não apaga a closure do content script já carregado, mas navegação/reload destrói o contexto da página. Por isso o helper redescobre o botão a cada ciclo e não retém um Element entre iterações. O job/ownership durável permanece responsabilidade das camadas de background.

## 4. Contrato de descoberta

A descoberta é deliberadamente redundante, em três níveis:

1. procura controles clicáveis no light DOM e usa texto/ARIA/title/test-id normalizados;
2. tenta seletores data-test-id/data-testid conhecidos;
3. faz DFS recursivo por DOM e Shadow DOM aberto e exige simultaneamente semântica temporária e tag/role acionável.

Uma implementação baseada apenas em coordenadas seria mais frágil e poderia clicar em qualquer botão que ocupasse a posição antiga. Os testes TEMP-05 e o caso "não existe mais fallback posicional" afirmam explicitamente que esse mecanismo legado não existe.

## 5. Contrato de verificação de estado

isAlreadyActive usa sinais independentes em ordem:

- texto do próprio toggle oferecendo a ação inversa: desativar/turn off/disable;
- texto oferecendo ativar/turn on/enable para retorno negativo precoce;
- aria-checked, aria-pressed ou data-state;
- tokens de classe active/selected/checked;
- indicadores semânticos no DOM;
- botão de fechar conversa temporária;
- frases nativas completas em português ou inglês.

A ordem "desativar antes de ativar" é necessária porque a palavra portuguesa desativar contém ativar como substring. Uma implementação ingênua que testasse ativar primeiro marcaria como inativo exatamente o botão que prova que o modo já está ativo.

## 6. Handshake anti-double-toggle

ensureActive separa quatro situações observáveis:

- already_active: estado ativo já era comprovável antes do clique;
- activated_verified: houve um click() sem exceção e uma iteração posterior comprovou estado ativo;
- unavailable: nenhum controle semântico foi visto até o deadline;
- verification_failed: houve abort, clique sem transição comprovada ou controle observado que nunca pôde ser acionado.

Depois que clicked se torna true, a função **nunca clica novamente**. Ela só espera 250 ms e reinspeciona o DOM. Esse detalhe evita a falha clássica de toggle: clicar, a UI atrasar, clicar de novo e retornar ao estado inativo.

## 7. Semântica de triggerClick

triggerClick tenta reproduzir a sequência pointerdown → mousedown → pointerup → mouseup → click. O retângulo é usado apenas para calcular o centro dos eventos sintéticos; ausência de layout cai para coordenada zero. Cada etapa anterior a click é best-effort.

O retorno true significa somente que element.click() não lançou. Não significa que o Gemini aceitou o evento nem que o modo foi ativado. A confirmação pertence exclusivamente a isAlreadyActive dentro de ensureActive.

Todos esses eventos são sintéticos e têm isTrusted=false. Uma mudança do Gemini que passe a exigir evento confiável do usuário pode tornar o mecanismo não acionável mesmo que os listeners de teste continuem funcionando.

## 8. Segurança, privacidade e trust boundaries

- O arquivo não lê imagem, prompt, jobId, tabId nem chrome.storage; sua superfície de dados é o DOM do Gemini.
- O DOM é um boundary não confiável e mutável: textos/testids podem mudar, existir ocultos ou ser duplicados.
- Heurísticas amplas são compensadas por múltiplos sinais e por verificação pós-clique, mas ainda podem produzir falso positivo se a página exibir texto de ajuda idêntico ao banner de Temporary Chat.
- O módulo não verifica visibilidade/actionability antes de selecionar um elemento. Um controle oculto ou stale pode ser escolhido e falhar.
- **Risco de privacidade na integração:** job-runner trata verification_failed como warning e continua o fluxo. O fallback de exclusão para temp_chat é condicionado a notFound/unavailable, não a verificationFailed. Assim, uma falha de verificação pode permitir continuação em conversa normal sem o fallback de exclusão. Esta Bíblia documenta o risco; não altera código funcional.
- Se isAlreadyActive der falso positivo, a camada superior acreditará que a conversa é temporária. Por isso mudanças nas heurísticas devem ser tratadas como security/privacy-sensitive.

## 9. Evidência automatizada

| Comportamento | Evidência observada | Classificação |
|---|---|---|
| implementação real é importada isoladamente | ambos os arquivos unitários usam jest.isolateModules + require do TEMP_PATH real | ✅ PROVADO DIRETAMENTE |
| encontra por texto "conversa momentânea" | findTempChatButton(document) === btn | ✅ PROVADO DIRETAMENTE |
| encontra por aria-label "temporary chat" | assertion retorna exatamente o div role=button | ✅ PROVADO DIRETAMENTE |
| encontra data-test-id exato temp-chat-button | assertion retorna exatamente o button | ✅ PROVADO DIRETAMENTE |
| sem controle semântico retorna null/unavailable | assertions explícitas em ambas as suítes | ✅ PROVADO DIRETAMENTE |
| indicador .momentary-indicator prova ativo | isAlreadyActive(null, document) === true | ✅ PROVADO DIRETAMENTE |
| aria-checked=true prova ativo | assertion direta | ✅ PROVADO DIRETAMENTE |
| rótulo "Desativar..." prova ativo | assertion direta | ✅ PROVADO DIRETAMENTE |
| rótulo "Ativar..." é inativo | assertion direta false | ✅ PROVADO DIRETAMENTE |
| banner PT "não aparecem no seu histórico" | assertion direta true | ✅ PROVADO DIRETAMENTE |
| tela PT "só dando uma passadinha" | assertion direta true | ✅ PROVADO DIRETAMENTE |
| tela EN "Just passing through" | assertion direta true | ✅ PROVADO DIRETAMENTE |
| close control semântico prova ativo | assertion direta true | ✅ PROVADO DIRETAMENTE |
| sequência pointer/mouse/click | array de eventos é comparado exatamente com 5 eventos na ordem | ✅ PROVADO DIRETAMENTE |
| já ativo não clica | status already_active + clickSpy not called | ✅ PROVADO DIRETAMENTE |
| clique só vira sucesso após mudança observável | listener muda texto/aria/class; status esperado activated_verified | ✅ PROVADO DIRETAMENTE |
| clique sem mudança nunca vira sucesso | resultado exato verification_failed/state_not_verified | ✅ PROVADO DIRETAMENTE |
| clique não confirmado não é repetido | clickSpy toHaveBeenCalledTimes(1) | ✅ PROVADO DIRETAMENTE |
| fallback geométrico legado não existe | findButtonByPosition e createLegacyAdapter são undefined | ✅ PROVADO DIRETAMENTE |
| manifest carrega o módulo antes do runner | ordem em extension/manifest.json | 🟦 GATE ESTÁTICO ESPECÍFICO |
| content_gemini exige/injeta a API | referências globais e dependency injection no composition root | 🟨 EXECUTADO INDIRETAMENTE |
| E2E em mode=temp_chat | translation-flow executa extensão real nesse modo, mas não isola todos os sinais desta API | 🟨 EXECUTADO INDIRETAMENTE |
| job-runner aceita dependency TemporaryChat | job-runner.test usa jest.fn e testa guarda de dependências | 🟨 CONTRATO COM MOCK; NÃO PROVA ESTE MÓDULO |

### 9.1 Arquivos de prova efetivamente abertos

| Arquivo | SHA lido | Evidência conferida |
|---|---|---|
| `tests/unit/content-gemini/temporary-chat-v2.test.js` | `bdf7146fac7f...` | módulo real via `require`; TEMP-01…TEMP-05 e anti-double-toggle, com assertions de status/clique |
| `tests/unit/content-gemini/temp-chat-activator.test.js` | `f9418a4301c9...` | discovery semântico, estados PT/EN, close control, ordem dos eventos e `ensureActive` |
| `extension/content/gemini/job-runner.js` | `1b16fd656e82...` | guarda da dependência, chamada de `ensureActive`, mapeamento de status e política de exclusão |
| `extension/content/content_gemini.js` | `55bc83afe31a...` | captura global, guarda e injeção de `temporaryChatApi` |
| `extension/manifest.json` | `841fe70c1833...` | ordem real de carregamento |
| `tests/unit/content-gemini/job-runner.test.js` | `feae92421dd9...` | mock/contrato do consumidor; não usado como prova interna deste módulo |
| `tests/e2e/translation-flow.spec.js` | `db1da42c48ff...` | execução integrada em `temp_chat`; não tratada como assertion focal dos helpers |

A classificação acima deriva das assertions efetivamente lidas, não de mera ocorrência textual de símbolos.

## 10. Lacunas de teste

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para textOf(null), title e data-testid como fonte semântica isolada.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para findInTree atravessando ShadowRoot aberto, predicate lançando e acesso shadowRoot lançando.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para element.closest devolver um ancestral clicável quando a keyword está apenas em span/div interno.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para cada selector parcial data-test-id*=temp-chat, data-testid*=temp-chat e *=moment.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que isole aria-pressed=true, data-state=active e cada token de classe active/selected/checked como única evidência.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para conflito entre texto "ativar" e atributo aria-checked=true; hoje o texto negativo vence antes do atributo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para indicador/controle oculto ou stale não causar falso positivo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para falso positivo de pageText quando frases de ajuda aparecem fora do estado Temporary Chat.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para triggerClick(null), focus/getBoundingClientRect lançando, PointerEvent/MouseEvent indisponível e element.click() lançando.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que verifique clientX/clientY no centro do retângulo.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para AbortSignal retornar verification_failed/aborted.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para status control_not_actionable quando triggerClick falha repetidamente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para timeoutMs negativo/zero com um botão semântico presente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para root nulo/custom root que não implemente querySelectorAll.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para relógio Date.now regressivo ou sleep que rejeita/nunca resolve.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para a integração crítica verification_failed → job-runner continuar → shouldDeleteConversation não selecionar fallback de exclusão.

### Testes recomendados

1. Criar testes parametrizados para todas as fontes textOf e todos os selectors estruturais.
2. Criar fixture com ShadowRoot aberto contendo o toggle e comprovar findInTree/findTempChatButton.
3. Criar testes isolados de aria-pressed, data-state e classes sem rótulo de desativação.
4. Simular click() lançando e afirmar control_not_actionable, quantidade de eventos preliminares e ausência de falso sucesso.
5. Simular AbortController abortado antes e durante polling.
6. Criar teste de integração real do job-runner em que ensureActive retorna verification_failed e afirmar a política desejada de fallback de exclusão antes de enviar qualquer prompt.
7. Criar teste adversarial com banner de ajuda oculto contendo as mesmas frases e exigir que visibilidade/contexto impeçam falso positivo, caso esse seja o contrato desejado.

## 11. Casos-limite e análise crítica

- **Root nulo explícito:** findTempChatButton tentará root.querySelectorAll e lançará; ensureActive não valida root.
- **Shadow DOM fechado:** não é atravessável por JavaScript comum; o helper não pode descobrir controles exclusivamente dentro dele.
- **Slots:** DFS usa children; assignedElements de slot não recebem tratamento próprio.
- **closest fora do root:** element.closest pode subir acima de um Element-root customizado e retornar controle externo ao boundary fornecido.
- **Controle oculto:** não há getComputedStyle, offsetParent, disabled ou aria-disabled no filtro.
- **Frase global:** pageText pode conter copy explicativa sem que o modo esteja realmente ativo.
- **Texto versus atributo:** um botão com texto "Ativar" e aria-checked=true retorna false antes de avaliar aria-checked.
- **Click parcial:** se pointer/mouse events forem despachados e click() lançar, triggerClick retorna false; ensureActive pode repetir os eventos preliminares em iterações seguintes.
- **Eventos sintéticos:** nenhum evento é confiável (isTrusted); alterações do Gemini podem rejeitá-los.
- **Date.now:** relógio de parede não é monotônico; ajuste para trás pode alongar o loop.
- **sleep injetado:** rejection não é capturada e propaga ao consumidor; promise que nunca resolve trava a chamada além do timeout lógico.
- **timeoutMs=0:** o loop nem inspeciona o DOM e retorna unavailable, mesmo que um controle exista.
- **Falha de privacidade na integração:** verification_failed é distinto de unavailable, mas o fallback de exclusão do job runner só considera notFound/unavailable. Esta assimetria deve ser decidida explicitamente e testada.

## 12. Invariantes

1. Uma tentativa de click nunca deve, sozinha, produzir activated_verified.
2. already_active só pode ser retornado antes de um click bem-sucedido da chamada corrente.
3. Depois que clicked=true, a mesma chamada nunca executa outro click.
4. Cada iteração deve redescobrir o controle e revalidar o estado; Element stale não deve ser cacheado.
5. O rótulo de desativação deve ser avaliado antes do rótulo de ativação em português.
6. unavailable significa que nenhum controle semântico foi visto durante o período observado.
7. state_not_verified significa que houve click mas o estado ativo não foi comprovado até o timeout.
8. control_not_actionable significa que houve controle semântico, porém nenhuma chamada de triggerClick concluiu com true.
9. O módulo não deve tratar posição geométrica como identidade do botão.
10. O módulo não deve persistir prompt/imagem/job metadata.
11. As heurísticas de estado devem permanecer conservadoras porque um falso positivo pode afetar privacidade.
12. A API global MangaTranslatorGeminiTemporaryChat e module.exports devem referenciar a mesma implementação.
13. Mudanças no consumidor não podem converter verification_failed em sucesso silencioso.
14. Se temp_chat continuar após falha de verificação, a política de exclusão/fail-closed deve ser explicitamente coberta por teste de integração.
15. O arquivo deve continuar carregado antes de job-runner.js e content_gemini.js.

## 13. Fonte integral

```javascript
'use strict';
// gemini/temporary-chat.js — Ativação verificável de conversa temporária.

(function(scope) {
  const KEYWORDS = ['momentân', 'momentan', 'temporár', 'temporar', 'temporary'];

  function textOf(element) {
    if (!element) return '';
    return [
      element.innerText,
      element.textContent,
      element.getAttribute && element.getAttribute('aria-label'),
      element.getAttribute && element.getAttribute('title'),
      element.getAttribute && element.getAttribute('data-test-id'),
      element.getAttribute && element.getAttribute('data-testid'),
    ].filter(Boolean).join(' ').trim().toLowerCase();
  }

  function hasTemporarySemantics(element) {
    const text = textOf(element);
    return KEYWORDS.some(keyword => text.includes(keyword)) ||
      text.includes('conversa moment') ||
      text.includes('temp chat');
  }

  function findInTree(root, predicate) {
    if (!root) return null;
    try {
      if (predicate(root)) return root;
    } catch (_e) {}

    try {
      if (root.shadowRoot) {
        const found = findInTree(root.shadowRoot, predicate);
        if (found) return found;
      }
    } catch (_e) {}

    const children = root.children || [];
    for (let index = 0; index < children.length; index += 1) {
      const found = findInTree(children[index], predicate);
      if (found) return found;
    }
    return null;
  }

  function findTempChatButton(root = document) {
    const all = Array.from(root.querySelectorAll(
      'button, [role="button"], [role="switch"], a, div[tabindex], span[tabindex]'
    ));
    for (const element of all) {
      if (hasTemporarySemantics(element)) {
        return element.closest('button, [role="button"], [role="switch"], a') || element;
      }
    }

    const selectors = [
      'button[data-test-id="temp-chat-button"]',
      '[data-test-id="temp-chat-button"]',
      'button[data-test-id*="temp-chat"]',
      '[data-test-id*="temp-chat"]',
      'button[data-testid*="temp-chat"]',
      '[data-testid*="temp-chat"]',
      'button[data-test-id*="moment"]',
      '[data-test-id*="moment"]',
    ];
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (element) return element;
    }

    return findInTree(root.body || root, node => {
      if (!node || !node.getAttribute) return false;
      if (!hasTemporarySemantics(node)) return false;
      const tag = String(node.tagName || '').toLowerCase();
      const role = String(node.getAttribute('role') || '').toLowerCase();
      return tag === 'button' || role === 'button' || role === 'switch' || tag === 'a';
    });
  }

  function isAlreadyActive(button, root = document) {
    if (button) {
      const text = textOf(button);
      if (
        (text.includes('desativar') || text.includes('turn off') || text.includes('disable')) &&
        (hasTemporarySemantics(button) || text.includes('chat'))
      ) {
        return true;
      }
      if (text.includes('ativar') || text.includes('turn on') || text.includes('enable')) return false;

      if (button.getAttribute('aria-checked') === 'true') return true;
      if (button.getAttribute('aria-pressed') === 'true') return true;
      if (button.getAttribute('data-state') === 'active') return true;

      const className = String(button.className || '').toLowerCase();
      if (/(^|\s)(active|selected|checked)(\s|$)/.test(className)) return true;
    }

    const indicators = root.querySelectorAll(
      '[data-test-id*="moment"], [data-testid*="moment"], [data-test-id*="temp-chat"], [data-testid*="temp-chat"], .momentary-indicator, .temp-chat-indicator'
    );
    for (const indicator of indicators) {
      if (hasTemporarySemantics(indicator)) return true;
    }

    const closeControls = root.querySelectorAll('button[aria-label], [role="button"][aria-label]');
    for (const control of closeControls) {
      const label = String(control.getAttribute('aria-label') || '').trim().toLowerCase();
      const close = label.includes('fechar') || label.includes('close');
      const temporary = KEYWORDS.some(keyword => label.includes(keyword));
      if (close && temporary) return true;
    }

    const pageText = String(
      root.body && (root.body.innerText || root.body.textContent) || ''
    ).replace(/\s+/g, ' ').trim().toLowerCase();

    const ptPassing =
      (pageText.includes('só dando uma passadinha') || pageText.includes('so dando uma passadinha')) &&
      (pageText.includes('não aparecem nas conversas recentes') || pageText.includes('nao aparecem nas conversas recentes'));

    const ptHistory =
      (
        pageText.includes('conversas temporárias') ||
        pageText.includes('conversas temporarias') ||
        pageText.includes('conversas momentâneas') ||
        pageText.includes('conversas momentaneas')
      ) &&
      (pageText.includes('não aparecem no seu histórico') || pageText.includes('nao aparecem no seu historico'));

    const enPassing =
      pageText.includes('just passing through') &&
      (
        pageText.includes("temporary chats don’t appear in recent chats") ||
        pageText.includes("temporary chats don't appear in recent chats")
      );

    return Boolean(ptPassing || ptHistory || enPassing);
  }

  function triggerClick(element) {
    if (!element) return false;
    try { element.focus({ preventScroll: true }); } catch (_e) {}
    let rect = { left: 0, top: 0, width: 0, height: 0 };
    try { rect = element.getBoundingClientRect() || rect; } catch (_e) {}
    const clientX = rect.width > 0 ? rect.left + rect.width / 2 : 0;
    const clientY = rect.height > 0 ? rect.top + rect.height / 2 : 0;
    const options = { bubbles: true, cancelable: true, view: window, clientX, clientY };

    try { element.dispatchEvent(new PointerEvent('pointerdown', options)); } catch (_e) {}
    try { element.dispatchEvent(new MouseEvent('mousedown', options)); } catch (_e) {}
    try { element.dispatchEvent(new PointerEvent('pointerup', options)); } catch (_e) {}
    try { element.dispatchEvent(new MouseEvent('mouseup', options)); } catch (_e) {}
    try { element.click(); } catch (_e) { return false; }
    return true;
  }

  async function ensureActive({
    root = document,
    timeoutMs = 12000,
    signal = null,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = {}) {
    const start = Date.now();
    let clicked = false;
    let sawSemanticButton = false;

    while (Date.now() - start < timeoutMs) {
      if (signal && signal.aborted) {
        return { status: 'verification_failed', reason: 'aborted' };
      }

      const button = findTempChatButton(root);
      if (button) sawSemanticButton = true;

      if (isAlreadyActive(button, root)) {
        return { status: clicked ? 'activated_verified' : 'already_active' };
      }

      if (button && !clicked) {
        clicked = triggerClick(button);
        await sleep(600);
        continue;
      }

      // Depois do clique, nunca clica novamente sem certeza: somente observa a
      // transição. Isso elimina o risco de alternar ativo->inativo em loop.
      if (clicked) {
        await sleep(250);
        continue;
      }

      await sleep(500);
    }

    if (clicked) return { status: 'verification_failed', reason: 'state_not_verified' };
    if (!sawSemanticButton) return { status: 'unavailable' };
    return { status: 'verification_failed', reason: 'control_not_actionable' };
  }

  const api = {
    ensureActive,
    findInTree,
    findTempChatButton,
    isAlreadyActive,
    triggerClick,
    hasTemporarySemantics,
  };

  scope.MangaTranslatorGeminiTemporaryChat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

## 14. Mapa de unidades e cobertura

| Unidade | Posições | Responsabilidade |
|---|---:|---|
| U01 | 001–005 | Bootstrap, IIFE e vocabulário semântico |
| U02 | 006–018 | Normalização textual de elemento |
| U03 | 019–025 | Predicado de semântica temporária |
| U04 | 026–046 | DFS por DOM/Shadow DOM |
| U05 | 047–080 | Descoberta do controle |
| U06 | 081–141 | Verificação do estado ativo |
| U07 | 142–158 | Sequência de interação sintética |
| U08 | 159–201 | Handshake ensureActive, timeout e anti-toggle |
| U09 | 202–214 | API pública, exports e newline final |

A união das faixas é contínua e cobre **214/214 posições**, sem gaps nem sobreposição.

## 15. Rastreabilidade 214/214

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode antes de qualquer mutação; reduz criação acidental de globais no content script clássico. |
| 002 | U01 | // gemini/temporary-chat.js — Ativação verificável de conversa temporária. | Declara a responsabilidade do módulo: ativar conversa temporária somente quando o estado puder ser verificado. |
| 003 | U01 | ␠ [linha vazia] | Separador visual dentro de U01 (Bootstrap, IIFE e vocabulário semântico); não produz efeito colateral. |
| 004 | U01 | (function(scope) { | Abre IIFE que recebe self/globalThis e mantém símbolos internos fora do namespace global. |
| 005 | U01 |   const KEYWORDS = ['momentân', 'momentan', 'temporár', 'temporar', 'temporary']; | Define radicais semânticos PT-BR/sem acento/EN usados para reconhecer rótulos que variam com locale. |
| 006 | U02 | ␠ [linha vazia] | Separador visual dentro de U02 (Normalização textual de um elemento); não produz efeito colateral. |
| 007 | U02 |   function textOf(element) { | Declara normalizador textual único para todas as heurísticas semânticas. |
| 008 | U02 |     if (!element) return ''; | Fail-safe para elemento ausente: retorna string vazia, evitando dereference. |
| 009 | U02 |     return [ | Inicia vetor de fontes textuais/atributos que serão consolidadas. |
| 010 | U02 |       element.innerText, | Inclui innerText, refletindo texto renderizado quando disponível. |
| 011 | U02 |       element.textContent, | Inclui textContent como fallback quando innerText é ausente/incompleto. |
| 012 | U02 |       element.getAttribute && element.getAttribute('aria-label'), | Inclui aria-label somente se getAttribute existir; cobre controles acessíveis sem texto visível. |
| 013 | U02 |       element.getAttribute && element.getAttribute('title'), | Inclui title, útil para ícones/controles cujo significado está no tooltip. |
| 014 | U02 |       element.getAttribute && element.getAttribute('data-test-id'), | Inclui data-test-id na representação textual, cobrindo identificadores usados pelo Gemini. |
| 015 | U02 |       element.getAttribute && element.getAttribute('data-testid'), | Inclui variante data-testid para tolerar convenções alternativas do frontend. |
| 016 | U02 |     ].filter(Boolean).join(' ').trim().toLowerCase(); | Remove falsy, concatena, trim e lowercase; produz representação case-insensitive sem lançar por campos ausentes. |
| 017 | U02 |   } | Fecha a estrutura sintática da unidade U02 (Normalização textual de um elemento) sem alterar por si só o estado do módulo. |
| 018 | U02 | ␠ [linha vazia] | Separador visual dentro de U02 (Normalização textual de um elemento); não produz efeito colateral. |
| 019 | U03 |   function hasTemporarySemantics(element) { | Declara predicado semântico compartilhado pela descoberta do botão e pelos indicadores de estado. |
| 020 | U03 |     const text = textOf(element); | Obtém a representação normalizada uma única vez por elemento. |
| 021 | U03 |     return KEYWORDS.some(keyword => text.includes(keyword)) \|\| | Aceita qualquer radical da whitelist; os radicais toleram flexões como temporária/temporarias. |
| 022 | U03 |       text.includes('conversa moment') \|\| | Aceita a expressão portuguesa abreviada 'conversa moment...' mesmo se nenhum atributo contiver a keyword completa. |
| 023 | U03 |       text.includes('temp chat'); | Aceita a expressão inglesa compacta 'temp chat'. |
| 024 | U03 |   } | Fecha a estrutura sintática da unidade U03 (Detecção de semântica de conversa temporária) sem alterar por si só o estado do módulo. |
| 025 | U03 | ␠ [linha vazia] | Separador visual dentro de U03 (Detecção de semântica de conversa temporária); não produz efeito colateral. |
| 026 | U04 |   function findInTree(root, predicate) { | Declara DFS recursivo que atravessa árvore DOM e Shadow DOM aberto. |
| 027 | U04 |     if (!root) return null; | Raiz nula encerra a busca com null em vez de lançar. |
| 028 | U04 |     try { | Isola exceções lançadas pelo predicate para que um nó problemático não quebre toda a descoberta. |
| 029 | U04 |       if (predicate(root)) return root; | Testa primeiro a própria raiz; permite retorno imediato e reduz travessia. |
| 030 | U04 |     } catch (_e) {} | Absorve exceção do predicate; decisão é best-effort, não sucesso. |
| 031 | U04 | ␠ [linha vazia] | Separador visual dentro de U04 (Travessia recursiva de DOM/Shadow DOM); não produz efeito colateral. |
| 032 | U04 |     try { | Isola acesso/travessia de shadowRoot porque mocks ou custom elements podem lançar. |
| 033 | U04 |       if (root.shadowRoot) { | Se houver ShadowRoot aberto, ele é visitado antes dos children light-DOM. |
| 034 | U04 |         const found = findInTree(root.shadowRoot, predicate); | Recursa no ShadowRoot preservando o mesmo predicate. |
| 035 | U04 |         if (found) return found; | Propaga imediatamente o primeiro match profundo. |
| 036 | U04 |       } | Fecha a estrutura sintática da unidade U04 (Travessia recursiva de DOM/Shadow DOM) sem alterar por si só o estado do módulo. |
| 037 | U04 |     } catch (_e) {} | Absorve falha de shadowRoot e continua pelo DOM comum. |
| 038 | U04 | ␠ [linha vazia] | Separador visual dentro de U04 (Travessia recursiva de DOM/Shadow DOM); não produz efeito colateral. |
| 039 | U04 |     const children = root.children \|\| []; | Normaliza children ausente para array vazio. |
| 040 | U04 |     for (let index = 0; index < children.length; index += 1) { | Percorre children em ordem DOM determinística. |
| 041 | U04 |       const found = findInTree(children[index], predicate); | Recursa em cada filho. |
| 042 | U04 |       if (found) return found; | Propaga o primeiro match encontrado. |
| 043 | U04 |     } | Fecha a estrutura sintática da unidade U04 (Travessia recursiva de DOM/Shadow DOM) sem alterar por si só o estado do módulo. |
| 044 | U04 |     return null; | Retorna null quando toda a subárvore foi varrida sem match. |
| 045 | U04 |   } | Fecha a estrutura sintática da unidade U04 (Travessia recursiva de DOM/Shadow DOM) sem alterar por si só o estado do módulo. |
| 046 | U04 | ␠ [linha vazia] | Separador visual dentro de U04 (Travessia recursiva de DOM/Shadow DOM); não produz efeito colateral. |
| 047 | U05 |   function findTempChatButton(root = document) { | Declara a busca do controle, com document como root padrão no browser. |
| 048 | U05 |     const all = Array.from(root.querySelectorAll( | Coleta de uma vez controles light-DOM plausivelmente clicáveis. |
| 049 | U05 |       'button, [role="button"], [role="switch"], a, div[tabindex], span[tabindex]' | Whitelist inclui button, roles button/switch, links e div/span focáveis. |
| 050 | U05 |     )); | Materializa NodeList em Array para iteração estável. |
| 051 | U05 |     for (const element of all) { | Varre candidatos na ordem do documento. |
| 052 | U05 |       if (hasTemporarySemantics(element)) { | Prioriza semântica humana/ARIA antes de test-id. |
| 053 | U05 |         return element.closest('button, [role="button"], [role="switch"], a') \|\| element; | Se o match for um descendente focável, sobe para o controle clicável mais próximo; senão usa o próprio nó. |
| 054 | U05 |       } | Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo. |
| 055 | U05 |     } | Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo. |
| 056 | U05 | ␠ [linha vazia] | Separador visual dentro de U05 (Descoberta do controle de Temporary Chat); não produz efeito colateral. |
| 057 | U05 |     const selectors = [ | Inicia fallback por seletores estruturais conhecidos quando o texto não identifica o controle. |
| 058 | U05 |       'button[data-test-id="temp-chat-button"]', | Selector exato de button com data-test-id=temp-chat-button. |
| 059 | U05 |       '[data-test-id="temp-chat-button"]', | Selector exato permite o mesmo test-id em elemento não-button. |
| 060 | U05 |       'button[data-test-id*="temp-chat"]', | Aceita data-test-id contendo temp-chat em button. |
| 061 | U05 |       '[data-test-id*="temp-chat"]', | Aceita data-test-id contendo temp-chat em qualquer elemento. |
| 062 | U05 |       'button[data-testid*="temp-chat"]', | Aceita variante data-testid contendo temp-chat em button. |
| 063 | U05 |       '[data-testid*="temp-chat"]', | Aceita variante data-testid contendo temp-chat em qualquer elemento. |
| 064 | U05 |       'button[data-test-id*="moment"]', | Aceita data-test-id contendo moment em button para nomenclatura momentary/momentânea. |
| 065 | U05 |       '[data-test-id*="moment"]', | Aceita data-test-id contendo moment em qualquer elemento. |
| 066 | U05 |     ]; | Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo. |
| 067 | U05 |     for (const selector of selectors) { | Varre seletores estruturais na ordem da whitelist. |
| 068 | U05 |       const element = root.querySelector(selector); | Consulta um selector por vez no root fornecido. |
| 069 | U05 |       if (element) return element; | Retorna imediatamente o primeiro elemento estrutural encontrado. |
| 070 | U05 |     } | Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo. |
| 071 | U05 | ␠ [linha vazia] | Separador visual dentro de U05 (Descoberta do controle de Temporary Chat); não produz efeito colateral. |
| 072 | U05 |     return findInTree(root.body \|\| root, node => { | Último fallback usa DFS profunda, inclusive Shadow DOM aberto. |
| 073 | U05 |       if (!node \|\| !node.getAttribute) return false; | Rejeita nós sem getAttribute antes de consultar atributos. |
| 074 | U05 |       if (!hasTemporarySemantics(node)) return false; | Exige semântica de temporary chat no nó profundo. |
| 075 | U05 |       const tag = String(node.tagName \|\| '').toLowerCase(); | Normaliza tagName para comparação. |
| 076 | U05 |       const role = String(node.getAttribute('role') \|\| '').toLowerCase(); | Normaliza role ARIA para comparação. |
| 077 | U05 |       return tag === 'button' \|\| role === 'button' \|\| role === 'switch' \|\| tag === 'a'; | Aceita apenas superfícies efetivamente acionáveis: button, role button/switch ou link. |
| 078 | U05 |     }); | Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo. |
| 079 | U05 |   } | Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo. |
| 080 | U05 | ␠ [linha vazia] | Separador visual dentro de U05 (Descoberta do controle de Temporary Chat); não produz efeito colateral. |
| 081 | U06 |   function isAlreadyActive(button, root = document) { | Declara verificador de estado; não presume que encontrar botão significa estado ativo. |
| 082 | U06 |     if (button) { | Só avalia sinais específicos do botão quando um botão foi encontrado. |
| 083 | U06 |       const text = textOf(button); | Normaliza todo o conteúdo/atributos do botão. |
| 084 | U06 |       if ( | Inicia regra de ação inversa: rótulo de 'desativar' significa que o modo já está ativo. |
| 085 | U06 |         (text.includes('desativar') \|\| text.includes('turn off') \|\| text.includes('disable')) && | Reconhece desativar/turn off/disable antes de procurar 'ativar', importante porque 'desativar' contém 'ativar'. |
| 086 | U06 |         (hasTemporarySemantics(button) \|\| text.includes('chat')) | Exige também semântica temporária/chat para reduzir falso positivo de outro botão de desativar. |
| 087 | U06 |       ) { | Parte operacional de U06 (Verificação fail-closed do estado ativo): Confirma estado ativo por ação inversa, atributos, indicadores, close control ou assinaturas de página. |
| 088 | U06 |         return true; | Confirma ativo quando o próprio controle oferece a ação inversa de desligar. |
| 089 | U06 |       } | Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo. |
| 090 | U06 |       if (text.includes('ativar') \|\| text.includes('turn on') \|\| text.includes('enable')) return false; | Rótulo explícito de ativar/turn on/enable força false cedo; evita interpretar atributos residuais como ativo. |
| 091 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 092 | U06 |       if (button.getAttribute('aria-checked') === 'true') return true; | aria-checked=true confirma switch marcado. |
| 093 | U06 |       if (button.getAttribute('aria-pressed') === 'true') return true; | aria-pressed=true confirma toggle pressionado. |
| 094 | U06 |       if (button.getAttribute('data-state') === 'active') return true; | data-state=active confirma estado exposto por frameworks. |
| 095 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 096 | U06 |       const className = String(button.className \|\| '').toLowerCase(); | Normaliza className para procurar tokens de estado. |
| 097 | U06 |       if (/(^\|\s)(active\|selected\|checked)(\s\|$)/.test(className)) return true; | Aceita tokens inteiros active/selected/checked, evitando substring em nomes de classe maiores. |
| 098 | U06 |     } | Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo. |
| 099 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 100 | U06 |     const indicators = root.querySelectorAll( | Consulta indicadores conhecidos de temporary chat fora do botão. |
| 101 | U06 |       '[data-test-id*="moment"], [data-testid*="moment"], [data-test-id*="temp-chat"], [data-testid*="temp-chat"], .momentary-indicator, .temp-chat-indicator' | Combina data-test-id/data-testid de moment/temp-chat e classes de indicador. |
| 102 | U06 |     ); | Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo. |
| 103 | U06 |     for (const indicator of indicators) { | Varre cada indicador encontrado. |
| 104 | U06 |       if (hasTemporarySemantics(indicator)) return true; | Só considera indicador como prova se ele também tiver semântica temporária reconhecida. |
| 105 | U06 |     } | Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo. |
| 106 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 107 | U06 |     const closeControls = root.querySelectorAll('button[aria-label], [role="button"][aria-label]'); | Procura controles de fechar com aria-label, um forte indício de painel/estado temporário aberto. |
| 108 | U06 |     for (const control of closeControls) { | Varre controles de fechamento candidatos. |
| 109 | U06 |       const label = String(control.getAttribute('aria-label') \|\| '').trim().toLowerCase(); | Normaliza aria-label. |
| 110 | U06 |       const close = label.includes('fechar') \|\| label.includes('close'); | Reconhece intenção de fechar em português/inglês. |
| 111 | U06 |       const temporary = KEYWORDS.some(keyword => label.includes(keyword)); | Exige keyword de temporary/momentary no mesmo label. |
| 112 | U06 |       if (close && temporary) return true; | Confirma ativo apenas quando ambas as condições coexistem. |
| 113 | U06 |     } | Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo. |
| 114 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 115 | U06 |     const pageText = String( | Inicia fallback de texto global da página para telas nativas do Gemini sem toggle facilmente identificável. |
| 116 | U06 |       root.body && (root.body.innerText \|\| root.body.textContent) \|\| '' | Prefere innerText do body e cai para textContent; root sem body vira string vazia. |
| 117 | U06 |     ).replace(/\s+/g, ' ').trim().toLowerCase(); | Colapsa whitespace, trim e lowercase para comparação robusta de frases. |
| 118 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 119 | U06 |     const ptPassing = | Define assinatura PT da tela 'só dando uma passadinha'. |
| 120 | U06 |       (pageText.includes('só dando uma passadinha') \|\| pageText.includes('so dando uma passadinha')) && | Aceita versão acentuada e sem acento da frase principal. |
| 121 | U06 |       (pageText.includes('não aparecem nas conversas recentes') \|\| pageText.includes('nao aparecem nas conversas recentes')); | Exige simultaneamente a frase de que conversas não aparecem em recentes, reduzindo falso positivo. |
| 122 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 123 | U06 |     const ptHistory = | Define assinatura PT alternativa baseada em histórico. |
| 124 | U06 |       ( | Parte operacional de U06 (Verificação fail-closed do estado ativo): Confirma estado ativo por ação inversa, atributos, indicadores, close control ou assinaturas de página. |
| 125 | U06 |         pageText.includes('conversas temporárias') \|\| | Aceita 'conversas temporárias' acentuado. |
| 126 | U06 |         pageText.includes('conversas temporarias') \|\| | Aceita equivalente sem acento. |
| 127 | U06 |         pageText.includes('conversas momentâneas') \|\| | Aceita nomenclatura 'conversas momentâneas'. |
| 128 | U06 |         pageText.includes('conversas momentaneas') | Aceita equivalente sem acento. |
| 129 | U06 |       ) && | Parte operacional de U06 (Verificação fail-closed do estado ativo): Confirma estado ativo por ação inversa, atributos, indicadores, close control ou assinaturas de página. |
| 130 | U06 |       (pageText.includes('não aparecem no seu histórico') \|\| pageText.includes('nao aparecem no seu historico')); | Exige a segunda metade semântica 'não aparecem no seu histórico'. |
| 131 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 132 | U06 |     const enPassing = | Define assinatura equivalente em inglês. |
| 133 | U06 |       pageText.includes('just passing through') && | Exige 'just passing through'. |
| 134 | U06 |       ( | Parte operacional de U06 (Verificação fail-closed do estado ativo): Confirma estado ativo por ação inversa, atributos, indicadores, close control ou assinaturas de página. |
| 135 | U06 |         pageText.includes("temporary chats don’t appear in recent chats") \|\| | Aceita apóstrofo tipográfico em 'don’t'. |
| 136 | U06 |         pageText.includes("temporary chats don't appear in recent chats") | Aceita apóstrofo ASCII em 'don't'. |
| 137 | U06 |       ); | Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo. |
| 138 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 139 | U06 |     return Boolean(ptPassing \|\| ptHistory \|\| enPassing); | Retorna true apenas se uma assinatura completa PT/EN foi satisfeita. |
| 140 | U06 |   } | Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo. |
| 141 | U06 | ␠ [linha vazia] | Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral. |
| 142 | U07 |   function triggerClick(element) { | Declara emissor de interação; retorno true significa tentativa de click não confirmação de modo. |
| 143 | U07 |     if (!element) return false; | Elemento ausente não é acionável. |
| 144 | U07 |     try { element.focus({ preventScroll: true }); } catch (_e) {} | Tenta foco sem scroll; falha de foco não bloqueia a tentativa. |
| 145 | U07 |     let rect = { left: 0, top: 0, width: 0, height: 0 }; | Inicializa retângulo neutro para coordenadas quando layout não está disponível. |
| 146 | U07 |     try { rect = element.getBoundingClientRect() \|\| rect; } catch (_e) {} | Obtém bounding rect best-effort. |
| 147 | U07 |     const clientX = rect.width > 0 ? rect.left + rect.width / 2 : 0; | Usa centro horizontal quando há largura; caso contrário 0. |
| 148 | U07 |     const clientY = rect.height > 0 ? rect.top + rect.height / 2 : 0; | Usa centro vertical quando há altura; caso contrário 0. |
| 149 | U07 |     const options = { bubbles: true, cancelable: true, view: window, clientX, clientY }; | Cria opções de eventos bubbling/cancelable com window e coordenadas. |
| 150 | U07 | ␠ [linha vazia] | Separador visual dentro de U07 (Clique sintético defensivo); não produz efeito colateral. |
| 151 | U07 |     try { element.dispatchEvent(new PointerEvent('pointerdown', options)); } catch (_e) {} | Despacha pointerdown best-effort. |
| 152 | U07 |     try { element.dispatchEvent(new MouseEvent('mousedown', options)); } catch (_e) {} | Despacha mousedown best-effort para handlers legados. |
| 153 | U07 |     try { element.dispatchEvent(new PointerEvent('pointerup', options)); } catch (_e) {} | Despacha pointerup best-effort. |
| 154 | U07 |     try { element.dispatchEvent(new MouseEvent('mouseup', options)); } catch (_e) {} | Despacha mouseup best-effort. |
| 155 | U07 |     try { element.click(); } catch (_e) { return false; } | Executa element.click(); se esse passo lançar, informa false mesmo que eventos preliminares tenham sido emitidos. |
| 156 | U07 |     return true; | Retorna true quando click() não lançou; a confirmação real ainda será feita por ensureActive. |
| 157 | U07 |   } | Fecha a estrutura sintática da unidade U07 (Clique sintético defensivo) sem alterar por si só o estado do módulo. |
| 158 | U07 | ␠ [linha vazia] | Separador visual dentro de U07 (Clique sintético defensivo); não produz efeito colateral. |
| 159 | U08 |   async function ensureActive({ | Declara handshake assíncrono principal. |
| 160 | U08 |     root = document, | root padrão é document do content script. |
| 161 | U08 |     timeoutMs = 12000, | Timeout padrão de 12 s limita polling/verificação. |
| 162 | U08 |     signal = null, | Aceita AbortSignal opcional para cancelamento cooperativo. |
| 163 | U08 |     sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), | sleep é injetável; produção usa setTimeout e testes substituem por função imediata. |
| 164 | U08 |   } = {}) { | Permite chamada sem argumentos via objeto default vazio. |
| 165 | U08 |     const start = Date.now(); | Captura relógio de início para deadline. |
| 166 | U08 |     let clicked = false; | clicked registra se click() foi aceito sem throw; também bloqueia novos cliques após primeira tentativa. |
| 167 | U08 |     let sawSemanticButton = false; | sawSemanticButton diferencia ausência de controle de controle encontrado porém não acionável. |
| 168 | U08 | ␠ [linha vazia] | Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral. |
| 169 | U08 |     while (Date.now() - start < timeoutMs) { | Loop continua enquanto elapsed < timeout. |
| 170 | U08 |       if (signal && signal.aborted) { | Verifica cancelamento a cada iteração antes de tocar no DOM. |
| 171 | U08 |         return { status: 'verification_failed', reason: 'aborted' }; | Abort retorna falha verificável explícita, não sucesso/unavailable. |
| 172 | U08 |       } | Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo. |
| 173 | U08 | ␠ [linha vazia] | Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral. |
| 174 | U08 |       const button = findTempChatButton(root); | Redescobre o botão a cada iteração para tolerar re-render do Gemini. |
| 175 | U08 |       if (button) sawSemanticButton = true; | Memoriza que em algum momento houve um controle semântico. |
| 176 | U08 | ␠ [linha vazia] | Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral. |
| 177 | U08 |       if (isAlreadyActive(button, root)) { | Reavalia o estado em toda iteração, inclusive depois do clique. |
| 178 | U08 |         return { status: clicked ? 'activated_verified' : 'already_active' }; | Retorna already_active sem clique ou activated_verified somente se houve clique e o estado depois foi observado como ativo. |
| 179 | U08 |       } | Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo. |
| 180 | U08 | ␠ [linha vazia] | Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral. |
| 181 | U08 |       if (button && !clicked) { | Só tenta clicar quando há botão e nenhum clique bem-sucedido anterior. |
| 182 | U08 |         clicked = triggerClick(button); | Resultado de triggerClick controla se a operação entra no modo somente-observação. |
| 183 | U08 |         await sleep(600); | Após tentativa de clique bem-sucedida, aguarda 600 ms para o DOM reagir. |
| 184 | U08 |         continue; | Recomeça o loop para redescobrir controle/estado, evitando usar nó stale. |
| 185 | U08 |       } | Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo. |
| 186 | U08 | ␠ [linha vazia] | Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral. |
| 187 | U08 |       // Depois do clique, nunca clica novamente sem certeza: somente observa a | Comentário documenta invariável anti-double-toggle. |
| 188 | U08 |       // transição. Isso elimina o risco de alternar ativo->inativo em loop. | Explica por que o módulo não reclica após uma tentativa: evitar ativo→inativo por toggle. |
| 189 | U08 |       if (clicked) { | Se houve clique, entra no caminho exclusivamente observacional. |
| 190 | U08 |         await sleep(250); | Polling pós-clique usa 250 ms. |
| 191 | U08 |         continue; | Continua sem voltar ao ramo de click. |
| 192 | U08 |       } | Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo. |
| 193 | U08 | ␠ [linha vazia] | Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral. |
| 194 | U08 |       await sleep(500); | Quando ainda não encontrou/clicou, polling de descoberta usa 500 ms. |
| 195 | U08 |     } | Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo. |
| 196 | U08 | ␠ [linha vazia] | Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral. |
| 197 | U08 |     if (clicked) return { status: 'verification_failed', reason: 'state_not_verified' }; | Timeout após clique gera verification_failed/state_not_verified; jamais converte tentativa em sucesso. |
| 198 | U08 |     if (!sawSemanticButton) return { status: 'unavailable' }; | Timeout sem jamais ver controle gera unavailable, permitindo fallback de camada superior. |
| 199 | U08 |     return { status: 'verification_failed', reason: 'control_not_actionable' }; | Se viu controle mas nenhum click teve sucesso, classifica control_not_actionable. |
| 200 | U08 |   } | Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo. |
| 201 | U08 | ␠ [linha vazia] | Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral. |
| 202 | U09 |   const api = { | Constrói API pública mínima. |
| 203 | U09 |     ensureActive, | Exporta ensureActive. |
| 204 | U09 |     findInTree, | Exporta findInTree para testes/diagnóstico. |
| 205 | U09 |     findTempChatButton, | Exporta findTempChatButton. |
| 206 | U09 |     isAlreadyActive, | Exporta isAlreadyActive. |
| 207 | U09 |     triggerClick, | Exporta triggerClick. |
| 208 | U09 |     hasTemporarySemantics, | Exporta hasTemporarySemantics. |
| 209 | U09 |   }; | Fecha a estrutura sintática da unidade U09 (Superfície pública e exports) sem alterar por si só o estado do módulo. |
| 210 | U09 | ␠ [linha vazia] | Separador visual dentro de U09 (Superfície pública e exports); não produz efeito colateral. |
| 211 | U09 |   scope.MangaTranslatorGeminiTemporaryChat = api; | Publica API no namespace global esperado por content_gemini/job-runner. |
| 212 | U09 |   if (typeof module !== 'undefined' && module.exports) module.exports = api; | Também exporta via CommonJS para Jest e ferramentas Node sem duplicar implementação. |
| 213 | U09 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha IIFE escolhendo self quando disponível e globalThis como fallback. |
| 214 | U09 | ␠ [linha vazia] | Posição documental do newline final; preserva terminação POSIX do arquivo. |

## 16. Cobertura linha a linha — 214/214

### Linha 001 — U01

**Fonte:** `'use strict';`

**O que faz:** Ativa strict mode antes de qualquer mutação; reduz criação acidental de globais no content script clássico.

**Como faz:** A unidade combina strict mode, IIFE e um vocabulário PT/EN mantido dentro do closure; somente a API final é publicada no scope.

**Por que foi implementado dessa forma:** O content script é carregado como script clássico pelo Manifest V3, enquanto os testes precisam exercitar a mesma implementação sem criar um segundo adapter.

**Por que uma implementação ingênua seria pior:** Globais soltos aumentariam colisões e uma lista baseada em uma única frase/localização quebraria com pequenas mudanças de copy.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento real; a exaustividade de KEYWORDS não possui assertion isolada.

### Linha 002 — U01

**Fonte:** `// gemini/temporary-chat.js — Ativação verificável de conversa temporária.`

**O que faz:** Declara a responsabilidade do módulo: ativar conversa temporária somente quando o estado puder ser verificado.

**Como faz:** A unidade combina strict mode, IIFE e um vocabulário PT/EN mantido dentro do closure; somente a API final é publicada no scope.

**Por que foi implementado dessa forma:** O content script é carregado como script clássico pelo Manifest V3, enquanto os testes precisam exercitar a mesma implementação sem criar um segundo adapter.

**Por que uma implementação ingênua seria pior:** Globais soltos aumentariam colisões e uma lista baseada em uma única frase/localização quebraria com pequenas mudanças de copy.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento real; a exaustividade de KEYWORDS não possui assertion isolada.

### Linha 003 — U01

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U01 (Bootstrap, IIFE e vocabulário semântico); não produz efeito colateral.

**Como faz:** A unidade combina strict mode, IIFE e um vocabulário PT/EN mantido dentro do closure; somente a API final é publicada no scope.

**Por que foi implementado dessa forma:** O content script é carregado como script clássico pelo Manifest V3, enquanto os testes precisam exercitar a mesma implementação sem criar um segundo adapter.

**Por que uma implementação ingênua seria pior:** Globais soltos aumentariam colisões e uma lista baseada em uma única frase/localização quebraria com pequenas mudanças de copy.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento real; a exaustividade de KEYWORDS não possui assertion isolada.

### Linha 004 — U01

**Fonte:** `(function(scope) {`

**O que faz:** Abre IIFE que recebe self/globalThis e mantém símbolos internos fora do namespace global.

**Como faz:** A unidade combina strict mode, IIFE e um vocabulário PT/EN mantido dentro do closure; somente a API final é publicada no scope.

**Por que foi implementado dessa forma:** O content script é carregado como script clássico pelo Manifest V3, enquanto os testes precisam exercitar a mesma implementação sem criar um segundo adapter.

**Por que uma implementação ingênua seria pior:** Globais soltos aumentariam colisões e uma lista baseada em uma única frase/localização quebraria com pequenas mudanças de copy.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento real; a exaustividade de KEYWORDS não possui assertion isolada.

### Linha 005 — U01

**Fonte:** `  const KEYWORDS = ['momentân', 'momentan', 'temporár', 'temporar', 'temporary'];`

**O que faz:** Define radicais semânticos PT-BR/sem acento/EN usados para reconhecer rótulos que variam com locale.

**Como faz:** A unidade combina strict mode, IIFE e um vocabulário PT/EN mantido dentro do closure; somente a API final é publicada no scope.

**Por que foi implementado dessa forma:** O content script é carregado como script clássico pelo Manifest V3, enquanto os testes precisam exercitar a mesma implementação sem criar um segundo adapter.

**Por que uma implementação ingênua seria pior:** Globais soltos aumentariam colisões e uma lista baseada em uma única frase/localização quebraria com pequenas mudanças de copy.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo carregamento real; a exaustividade de KEYWORDS não possui assertion isolada.

### Linha 006 — U02

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U02 (Normalização textual de um elemento); não produz efeito colateral.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 007 — U02

**Fonte:** `  function textOf(element) {`

**O que faz:** Declara normalizador textual único para todas as heurísticas semânticas.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 008 — U02

**Fonte:** `    if (!element) return '';`

**O que faz:** Fail-safe para elemento ausente: retorna string vazia, evitando dereference.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 009 — U02

**Fonte:** `    return [`

**O que faz:** Inicia vetor de fontes textuais/atributos que serão consolidadas.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 010 — U02

**Fonte:** `      element.innerText,`

**O que faz:** Inclui innerText, refletindo texto renderizado quando disponível.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 011 — U02

**Fonte:** `      element.textContent,`

**O que faz:** Inclui textContent como fallback quando innerText é ausente/incompleto.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 012 — U02

**Fonte:** `      element.getAttribute && element.getAttribute('aria-label'),`

**O que faz:** Inclui aria-label somente se getAttribute existir; cobre controles acessíveis sem texto visível.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 013 — U02

**Fonte:** `      element.getAttribute && element.getAttribute('title'),`

**O que faz:** Inclui title, útil para ícones/controles cujo significado está no tooltip.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 014 — U02

**Fonte:** `      element.getAttribute && element.getAttribute('data-test-id'),`

**O que faz:** Inclui data-test-id na representação textual, cobrindo identificadores usados pelo Gemini.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 015 — U02

**Fonte:** `      element.getAttribute && element.getAttribute('data-testid'),`

**O que faz:** Inclui variante data-testid para tolerar convenções alternativas do frontend.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 016 — U02

**Fonte:** `    ].filter(Boolean).join(' ').trim().toLowerCase();`

**O que faz:** Remove falsy, concatena, trim e lowercase; produz representação case-insensitive sem lançar por campos ausentes.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 017 — U02

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática da unidade U02 (Normalização textual de um elemento) sem alterar por si só o estado do módulo.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 018 — U02

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U02 (Normalização textual de um elemento); não produz efeito colateral.

**Como faz:** textOf agrega texto renderizado, textContent e atributos acessíveis/estruturais, remove valores ausentes, concatena, faz trim e normaliza caixa.

**Por que foi implementado dessa forma:** O mesmo controle pode expor significado no texto, aria-label, title ou test-id conforme a versão do Gemini e o tipo de elemento.

**Por que uma implementação ingênua seria pior:** Ler apenas textContent perderia controles iconográficos; confiar apenas em test-id acoplaria o RPA a markup interno mutável.

**Evidência automatizada:** 🟨 EXECUTADO pelos testes de discovery; ⚠️ title/data-testid isolados e textOf(null) não têm prova focal.

### Linha 019 — U03

**Fonte:** `  function hasTemporarySemantics(element) {`

**O que faz:** Declara predicado semântico compartilhado pela descoberta do botão e pelos indicadores de estado.

**Como faz:** hasTemporarySemantics aplica KEYWORDS e duas expressões compactas sobre a saída normalizada de textOf.

**Por que foi implementado dessa forma:** Radicais toleram acentos, flexões e nomenclaturas 'temporária/momentânea/temporary' sem depender de uma frase inteira.

**Por que uma implementação ingênua seria pior:** Igualdade literal com uma única tradução geraria falso negativo após qualquer mudança de locale ou copy.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 'conversa momentânea' e aria-label 'temporary chat'; outras variantes permanecem lacunas.

### Linha 020 — U03

**Fonte:** `    const text = textOf(element);`

**O que faz:** Obtém a representação normalizada uma única vez por elemento.

**Como faz:** hasTemporarySemantics aplica KEYWORDS e duas expressões compactas sobre a saída normalizada de textOf.

**Por que foi implementado dessa forma:** Radicais toleram acentos, flexões e nomenclaturas 'temporária/momentânea/temporary' sem depender de uma frase inteira.

**Por que uma implementação ingênua seria pior:** Igualdade literal com uma única tradução geraria falso negativo após qualquer mudança de locale ou copy.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 'conversa momentânea' e aria-label 'temporary chat'; outras variantes permanecem lacunas.

### Linha 021 — U03

**Fonte:** `    return KEYWORDS.some(keyword => text.includes(keyword)) ||`

**O que faz:** Aceita qualquer radical da whitelist; os radicais toleram flexões como temporária/temporarias.

**Como faz:** hasTemporarySemantics aplica KEYWORDS e duas expressões compactas sobre a saída normalizada de textOf.

**Por que foi implementado dessa forma:** Radicais toleram acentos, flexões e nomenclaturas 'temporária/momentânea/temporary' sem depender de uma frase inteira.

**Por que uma implementação ingênua seria pior:** Igualdade literal com uma única tradução geraria falso negativo após qualquer mudança de locale ou copy.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 'conversa momentânea' e aria-label 'temporary chat'; outras variantes permanecem lacunas.

### Linha 022 — U03

**Fonte:** `      text.includes('conversa moment') ||`

**O que faz:** Aceita a expressão portuguesa abreviada 'conversa moment...' mesmo se nenhum atributo contiver a keyword completa.

**Como faz:** hasTemporarySemantics aplica KEYWORDS e duas expressões compactas sobre a saída normalizada de textOf.

**Por que foi implementado dessa forma:** Radicais toleram acentos, flexões e nomenclaturas 'temporária/momentânea/temporary' sem depender de uma frase inteira.

**Por que uma implementação ingênua seria pior:** Igualdade literal com uma única tradução geraria falso negativo após qualquer mudança de locale ou copy.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 'conversa momentânea' e aria-label 'temporary chat'; outras variantes permanecem lacunas.

### Linha 023 — U03

**Fonte:** `      text.includes('temp chat');`

**O que faz:** Aceita a expressão inglesa compacta 'temp chat'.

**Como faz:** hasTemporarySemantics aplica KEYWORDS e duas expressões compactas sobre a saída normalizada de textOf.

**Por que foi implementado dessa forma:** Radicais toleram acentos, flexões e nomenclaturas 'temporária/momentânea/temporary' sem depender de uma frase inteira.

**Por que uma implementação ingênua seria pior:** Igualdade literal com uma única tradução geraria falso negativo após qualquer mudança de locale ou copy.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 'conversa momentânea' e aria-label 'temporary chat'; outras variantes permanecem lacunas.

### Linha 024 — U03

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática da unidade U03 (Detecção de semântica de conversa temporária) sem alterar por si só o estado do módulo.

**Como faz:** hasTemporarySemantics aplica KEYWORDS e duas expressões compactas sobre a saída normalizada de textOf.

**Por que foi implementado dessa forma:** Radicais toleram acentos, flexões e nomenclaturas 'temporária/momentânea/temporary' sem depender de uma frase inteira.

**Por que uma implementação ingênua seria pior:** Igualdade literal com uma única tradução geraria falso negativo após qualquer mudança de locale ou copy.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 'conversa momentânea' e aria-label 'temporary chat'; outras variantes permanecem lacunas.

### Linha 025 — U03

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U03 (Detecção de semântica de conversa temporária); não produz efeito colateral.

**Como faz:** hasTemporarySemantics aplica KEYWORDS e duas expressões compactas sobre a saída normalizada de textOf.

**Por que foi implementado dessa forma:** Radicais toleram acentos, flexões e nomenclaturas 'temporária/momentânea/temporary' sem depender de uma frase inteira.

**Por que uma implementação ingênua seria pior:** Igualdade literal com uma única tradução geraria falso negativo após qualquer mudança de locale ou copy.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para 'conversa momentânea' e aria-label 'temporary chat'; outras variantes permanecem lacunas.

### Linha 026 — U04

**Fonte:** `  function findInTree(root, predicate) {`

**O que faz:** Declara DFS recursivo que atravessa árvore DOM e Shadow DOM aberto.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 027 — U04

**Fonte:** `    if (!root) return null;`

**O que faz:** Raiz nula encerra a busca com null em vez de lançar.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 028 — U04

**Fonte:** `    try {`

**O que faz:** Isola exceções lançadas pelo predicate para que um nó problemático não quebre toda a descoberta.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 029 — U04

**Fonte:** `      if (predicate(root)) return root;`

**O que faz:** Testa primeiro a própria raiz; permite retorno imediato e reduz travessia.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 030 — U04

**Fonte:** `    } catch (_e) {}`

**O que faz:** Absorve exceção do predicate; decisão é best-effort, não sucesso.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 031 — U04

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U04 (Travessia recursiva de DOM/Shadow DOM); não produz efeito colateral.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 032 — U04

**Fonte:** `    try {`

**O que faz:** Isola acesso/travessia de shadowRoot porque mocks ou custom elements podem lançar.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 033 — U04

**Fonte:** `      if (root.shadowRoot) {`

**O que faz:** Se houver ShadowRoot aberto, ele é visitado antes dos children light-DOM.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 034 — U04

**Fonte:** `        const found = findInTree(root.shadowRoot, predicate);`

**O que faz:** Recursa no ShadowRoot preservando o mesmo predicate.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 035 — U04

**Fonte:** `        if (found) return found;`

**O que faz:** Propaga imediatamente o primeiro match profundo.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 036 — U04

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática da unidade U04 (Travessia recursiva de DOM/Shadow DOM) sem alterar por si só o estado do módulo.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 037 — U04

**Fonte:** `    } catch (_e) {}`

**O que faz:** Absorve falha de shadowRoot e continua pelo DOM comum.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 038 — U04

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U04 (Travessia recursiva de DOM/Shadow DOM); não produz efeito colateral.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 039 — U04

**Fonte:** `    const children = root.children || [];`

**O que faz:** Normaliza children ausente para array vazio.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 040 — U04

**Fonte:** `    for (let index = 0; index < children.length; index += 1) {`

**O que faz:** Percorre children em ordem DOM determinística.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 041 — U04

**Fonte:** `      const found = findInTree(children[index], predicate);`

**O que faz:** Recursa em cada filho.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 042 — U04

**Fonte:** `      if (found) return found;`

**O que faz:** Propaga o primeiro match encontrado.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 043 — U04

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática da unidade U04 (Travessia recursiva de DOM/Shadow DOM) sem alterar por si só o estado do módulo.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 044 — U04

**Fonte:** `    return null;`

**O que faz:** Retorna null quando toda a subárvore foi varrida sem match.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 045 — U04

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática da unidade U04 (Travessia recursiva de DOM/Shadow DOM) sem alterar por si só o estado do módulo.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 046 — U04

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U04 (Travessia recursiva de DOM/Shadow DOM); não produz efeito colateral.

**Como faz:** findInTree testa a raiz, atravessa ShadowRoot aberto e depois children em DFS, isolando exceções de predicate e shadowRoot.

**Por que foi implementado dessa forma:** Controles de interfaces modernas podem estar encapsulados em Web Components e uma falha local não deve derrubar a automação inteira.

**Por que uma implementação ingênua seria pior:** querySelector no light DOM não atravessa Shadow DOM; abortar na primeira exceção transformaria um nó problemático em falha global.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para travessia por ShadowRoot e para os dois catches; o uso é coberto apenas indiretamente.

### Linha 047 — U05

**Fonte:** `  function findTempChatButton(root = document) {`

**O que faz:** Declara a busca do controle, com document como root padrão no browser.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 048 — U05

**Fonte:** `    const all = Array.from(root.querySelectorAll(`

**O que faz:** Coleta de uma vez controles light-DOM plausivelmente clicáveis.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 049 — U05

**Fonte:** `      'button, [role="button"], [role="switch"], a, div[tabindex], span[tabindex]'`

**O que faz:** Whitelist inclui button, roles button/switch, links e div/span focáveis.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 050 — U05

**Fonte:** `    ));`

**O que faz:** Materializa NodeList em Array para iteração estável.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 051 — U05

**Fonte:** `    for (const element of all) {`

**O que faz:** Varre candidatos na ordem do documento.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 052 — U05

**Fonte:** `      if (hasTemporarySemantics(element)) {`

**O que faz:** Prioriza semântica humana/ARIA antes de test-id.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 053 — U05

**Fonte:** `        return element.closest('button, [role="button"], [role="switch"], a') || element;`

**O que faz:** Se o match for um descendente focável, sobe para o controle clicável mais próximo; senão usa o próprio nó.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 054 — U05

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 055 — U05

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 056 — U05

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U05 (Descoberta do controle de Temporary Chat); não produz efeito colateral.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 057 — U05

**Fonte:** `    const selectors = [`

**O que faz:** Inicia fallback por seletores estruturais conhecidos quando o texto não identifica o controle.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 058 — U05

**Fonte:** `      'button[data-test-id="temp-chat-button"]',`

**O que faz:** Selector exato de button com data-test-id=temp-chat-button.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 059 — U05

**Fonte:** `      '[data-test-id="temp-chat-button"]',`

**O que faz:** Selector exato permite o mesmo test-id em elemento não-button.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 060 — U05

**Fonte:** `      'button[data-test-id*="temp-chat"]',`

**O que faz:** Aceita data-test-id contendo temp-chat em button.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 061 — U05

**Fonte:** `      '[data-test-id*="temp-chat"]',`

**O que faz:** Aceita data-test-id contendo temp-chat em qualquer elemento.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 062 — U05

**Fonte:** `      'button[data-testid*="temp-chat"]',`

**O que faz:** Aceita variante data-testid contendo temp-chat em button.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 063 — U05

**Fonte:** `      '[data-testid*="temp-chat"]',`

**O que faz:** Aceita variante data-testid contendo temp-chat em qualquer elemento.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 064 — U05

**Fonte:** `      'button[data-test-id*="moment"]',`

**O que faz:** Aceita data-test-id contendo moment em button para nomenclatura momentary/momentânea.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 065 — U05

**Fonte:** `      '[data-test-id*="moment"]',`

**O que faz:** Aceita data-test-id contendo moment em qualquer elemento.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 066 — U05

**Fonte:** `    ];`

**O que faz:** Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 067 — U05

**Fonte:** `    for (const selector of selectors) {`

**O que faz:** Varre seletores estruturais na ordem da whitelist.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 068 — U05

**Fonte:** `      const element = root.querySelector(selector);`

**O que faz:** Consulta um selector por vez no root fornecido.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 069 — U05

**Fonte:** `      if (element) return element;`

**O que faz:** Retorna imediatamente o primeiro elemento estrutural encontrado.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 070 — U05

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 071 — U05

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U05 (Descoberta do controle de Temporary Chat); não produz efeito colateral.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 072 — U05

**Fonte:** `    return findInTree(root.body || root, node => {`

**O que faz:** Último fallback usa DFS profunda, inclusive Shadow DOM aberto.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 073 — U05

**Fonte:** `      if (!node || !node.getAttribute) return false;`

**O que faz:** Rejeita nós sem getAttribute antes de consultar atributos.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 074 — U05

**Fonte:** `      if (!hasTemporarySemantics(node)) return false;`

**O que faz:** Exige semântica de temporary chat no nó profundo.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 075 — U05

**Fonte:** `      const tag = String(node.tagName || '').toLowerCase();`

**O que faz:** Normaliza tagName para comparação.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 076 — U05

**Fonte:** `      const role = String(node.getAttribute('role') || '').toLowerCase();`

**O que faz:** Normaliza role ARIA para comparação.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 077 — U05

**Fonte:** `      return tag === 'button' || role === 'button' || role === 'switch' || tag === 'a';`

**O que faz:** Aceita apenas superfícies efetivamente acionáveis: button, role button/switch ou link.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 078 — U05

**Fonte:** `    });`

**O que faz:** Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 079 — U05

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática da unidade U05 (Descoberta do controle de Temporary Chat) sem alterar por si só o estado do módulo.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 080 — U05

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U05 (Descoberta do controle de Temporary Chat); não produz efeito colateral.

**Como faz:** findTempChatButton tenta primeiro controles semânticos, depois test-ids conhecidos e por fim a DFS profunda exigindo tag/role acionável.

**Por que foi implementado dessa forma:** A redundância reduz dependência de um único markup, sem reintroduzir o antigo fallback por posição geométrica.

**Por que uma implementação ingênua seria pior:** Um seletor único quebra com refactor do site; coordenadas podem clicar um controle completamente diferente depois de re-layout.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para texto, aria-label, data-test-id exato e ausência; ⚠️ seletores parciais e ancestor closest não são todos isolados.

### Linha 081 — U06

**Fonte:** `  function isAlreadyActive(button, root = document) {`

**O que faz:** Declara verificador de estado; não presume que encontrar botão significa estado ativo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 082 — U06

**Fonte:** `    if (button) {`

**O que faz:** Só avalia sinais específicos do botão quando um botão foi encontrado.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 083 — U06

**Fonte:** `      const text = textOf(button);`

**O que faz:** Normaliza todo o conteúdo/atributos do botão.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 084 — U06

**Fonte:** `      if (`

**O que faz:** Inicia regra de ação inversa: rótulo de 'desativar' significa que o modo já está ativo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 085 — U06

**Fonte:** `        (text.includes('desativar') || text.includes('turn off') || text.includes('disable')) &&`

**O que faz:** Reconhece desativar/turn off/disable antes de procurar 'ativar', importante porque 'desativar' contém 'ativar'.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 086 — U06

**Fonte:** `        (hasTemporarySemantics(button) || text.includes('chat'))`

**O que faz:** Exige também semântica temporária/chat para reduzir falso positivo de outro botão de desativar.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 087 — U06

**Fonte:** `      ) {`

**O que faz:** Parte operacional de U06 (Verificação fail-closed do estado ativo): Confirma estado ativo por ação inversa, atributos, indicadores, close control ou assinaturas de página.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 088 — U06

**Fonte:** `        return true;`

**O que faz:** Confirma ativo quando o próprio controle oferece a ação inversa de desligar.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 089 — U06

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 090 — U06

**Fonte:** `      if (text.includes('ativar') || text.includes('turn on') || text.includes('enable')) return false;`

**O que faz:** Rótulo explícito de ativar/turn on/enable força false cedo; evita interpretar atributos residuais como ativo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 091 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 092 — U06

**Fonte:** `      if (button.getAttribute('aria-checked') === 'true') return true;`

**O que faz:** aria-checked=true confirma switch marcado.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 093 — U06

**Fonte:** `      if (button.getAttribute('aria-pressed') === 'true') return true;`

**O que faz:** aria-pressed=true confirma toggle pressionado.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 094 — U06

**Fonte:** `      if (button.getAttribute('data-state') === 'active') return true;`

**O que faz:** data-state=active confirma estado exposto por frameworks.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 095 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 096 — U06

**Fonte:** `      const className = String(button.className || '').toLowerCase();`

**O que faz:** Normaliza className para procurar tokens de estado.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 097 — U06

**Fonte:** `      if (/(^|\s)(active|selected|checked)(\s|$)/.test(className)) return true;`

**O que faz:** Aceita tokens inteiros active/selected/checked, evitando substring em nomes de classe maiores.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 098 — U06

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 099 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 100 — U06

**Fonte:** `    const indicators = root.querySelectorAll(`

**O que faz:** Consulta indicadores conhecidos de temporary chat fora do botão.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 101 — U06

**Fonte:** `      '[data-test-id*="moment"], [data-testid*="moment"], [data-test-id*="temp-chat"], [data-testid*="temp-chat"], .momentary-indicator, .temp-chat-indicator'`

**O que faz:** Combina data-test-id/data-testid de moment/temp-chat e classes de indicador.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 102 — U06

**Fonte:** `    );`

**O que faz:** Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 103 — U06

**Fonte:** `    for (const indicator of indicators) {`

**O que faz:** Varre cada indicador encontrado.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 104 — U06

**Fonte:** `      if (hasTemporarySemantics(indicator)) return true;`

**O que faz:** Só considera indicador como prova se ele também tiver semântica temporária reconhecida.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 105 — U06

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 106 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 107 — U06

**Fonte:** `    const closeControls = root.querySelectorAll('button[aria-label], [role="button"][aria-label]');`

**O que faz:** Procura controles de fechar com aria-label, um forte indício de painel/estado temporário aberto.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 108 — U06

**Fonte:** `    for (const control of closeControls) {`

**O que faz:** Varre controles de fechamento candidatos.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 109 — U06

**Fonte:** `      const label = String(control.getAttribute('aria-label') || '').trim().toLowerCase();`

**O que faz:** Normaliza aria-label.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 110 — U06

**Fonte:** `      const close = label.includes('fechar') || label.includes('close');`

**O que faz:** Reconhece intenção de fechar em português/inglês.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 111 — U06

**Fonte:** `      const temporary = KEYWORDS.some(keyword => label.includes(keyword));`

**O que faz:** Exige keyword de temporary/momentary no mesmo label.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 112 — U06

**Fonte:** `      if (close && temporary) return true;`

**O que faz:** Confirma ativo apenas quando ambas as condições coexistem.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 113 — U06

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 114 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 115 — U06

**Fonte:** `    const pageText = String(`

**O que faz:** Inicia fallback de texto global da página para telas nativas do Gemini sem toggle facilmente identificável.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 116 — U06

**Fonte:** `      root.body && (root.body.innerText || root.body.textContent) || ''`

**O que faz:** Prefere innerText do body e cai para textContent; root sem body vira string vazia.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 117 — U06

**Fonte:** `    ).replace(/\s+/g, ' ').trim().toLowerCase();`

**O que faz:** Colapsa whitespace, trim e lowercase para comparação robusta de frases.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 118 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 119 — U06

**Fonte:** `    const ptPassing =`

**O que faz:** Define assinatura PT da tela 'só dando uma passadinha'.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 120 — U06

**Fonte:** `      (pageText.includes('só dando uma passadinha') || pageText.includes('so dando uma passadinha')) &&`

**O que faz:** Aceita versão acentuada e sem acento da frase principal.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 121 — U06

**Fonte:** `      (pageText.includes('não aparecem nas conversas recentes') || pageText.includes('nao aparecem nas conversas recentes'));`

**O que faz:** Exige simultaneamente a frase de que conversas não aparecem em recentes, reduzindo falso positivo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 122 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 123 — U06

**Fonte:** `    const ptHistory =`

**O que faz:** Define assinatura PT alternativa baseada em histórico.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 124 — U06

**Fonte:** `      (`

**O que faz:** Parte operacional de U06 (Verificação fail-closed do estado ativo): Confirma estado ativo por ação inversa, atributos, indicadores, close control ou assinaturas de página.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 125 — U06

**Fonte:** `        pageText.includes('conversas temporárias') ||`

**O que faz:** Aceita 'conversas temporárias' acentuado.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 126 — U06

**Fonte:** `        pageText.includes('conversas temporarias') ||`

**O que faz:** Aceita equivalente sem acento.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 127 — U06

**Fonte:** `        pageText.includes('conversas momentâneas') ||`

**O que faz:** Aceita nomenclatura 'conversas momentâneas'.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 128 — U06

**Fonte:** `        pageText.includes('conversas momentaneas')`

**O que faz:** Aceita equivalente sem acento.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 129 — U06

**Fonte:** `      ) &&`

**O que faz:** Parte operacional de U06 (Verificação fail-closed do estado ativo): Confirma estado ativo por ação inversa, atributos, indicadores, close control ou assinaturas de página.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 130 — U06

**Fonte:** `      (pageText.includes('não aparecem no seu histórico') || pageText.includes('nao aparecem no seu historico'));`

**O que faz:** Exige a segunda metade semântica 'não aparecem no seu histórico'.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 131 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 132 — U06

**Fonte:** `    const enPassing =`

**O que faz:** Define assinatura equivalente em inglês.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 133 — U06

**Fonte:** `      pageText.includes('just passing through') &&`

**O que faz:** Exige 'just passing through'.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 134 — U06

**Fonte:** `      (`

**O que faz:** Parte operacional de U06 (Verificação fail-closed do estado ativo): Confirma estado ativo por ação inversa, atributos, indicadores, close control ou assinaturas de página.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 135 — U06

**Fonte:** `        pageText.includes("temporary chats don’t appear in recent chats") ||`

**O que faz:** Aceita apóstrofo tipográfico em 'don’t'.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 136 — U06

**Fonte:** `        pageText.includes("temporary chats don't appear in recent chats")`

**O que faz:** Aceita apóstrofo ASCII em 'don't'.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 137 — U06

**Fonte:** `      );`

**O que faz:** Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 138 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 139 — U06

**Fonte:** `    return Boolean(ptPassing || ptHistory || enPassing);`

**O que faz:** Retorna true apenas se uma assinatura completa PT/EN foi satisfeita.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 140 — U06

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática da unidade U06 (Verificação fail-closed do estado ativo) sem alterar por si só o estado do módulo.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 141 — U06

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U06 (Verificação fail-closed do estado ativo); não produz efeito colateral.

**Como faz:** isAlreadyActive cruza ação inversa, atributos ARIA/framework, classes, indicadores, botão de fechar e assinaturas completas de página PT/EN.

**Por que foi implementado dessa forma:** O Gemini pode representar o modo como toggle, badge, painel ou tela dedicada; a ordem desativar→ativar evita o falso substring de 'desativar'.

**Por que uma implementação ingênua seria pior:** Assumir que botão encontrado significa ativo ou confiar em um único atributo confundiria estado disponível com estado habilitado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para indicador, aria-checked, texto ativar/desativar, banners PT/EN e close control; ⚠️ aria-pressed/data-state/classes isolados faltam.

### Linha 142 — U07

**Fonte:** `  function triggerClick(element) {`

**O que faz:** Declara emissor de interação; retorno true significa tentativa de click não confirmação de modo.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 143 — U07

**Fonte:** `    if (!element) return false;`

**O que faz:** Elemento ausente não é acionável.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 144 — U07

**Fonte:** `    try { element.focus({ preventScroll: true }); } catch (_e) {}`

**O que faz:** Tenta foco sem scroll; falha de foco não bloqueia a tentativa.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 145 — U07

**Fonte:** `    let rect = { left: 0, top: 0, width: 0, height: 0 };`

**O que faz:** Inicializa retângulo neutro para coordenadas quando layout não está disponível.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 146 — U07

**Fonte:** `    try { rect = element.getBoundingClientRect() || rect; } catch (_e) {}`

**O que faz:** Obtém bounding rect best-effort.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 147 — U07

**Fonte:** `    const clientX = rect.width > 0 ? rect.left + rect.width / 2 : 0;`

**O que faz:** Usa centro horizontal quando há largura; caso contrário 0.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 148 — U07

**Fonte:** `    const clientY = rect.height > 0 ? rect.top + rect.height / 2 : 0;`

**O que faz:** Usa centro vertical quando há altura; caso contrário 0.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 149 — U07

**Fonte:** `    const options = { bubbles: true, cancelable: true, view: window, clientX, clientY };`

**O que faz:** Cria opções de eventos bubbling/cancelable com window e coordenadas.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 150 — U07

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U07 (Clique sintético defensivo); não produz efeito colateral.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 151 — U07

**Fonte:** `    try { element.dispatchEvent(new PointerEvent('pointerdown', options)); } catch (_e) {}`

**O que faz:** Despacha pointerdown best-effort.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 152 — U07

**Fonte:** `    try { element.dispatchEvent(new MouseEvent('mousedown', options)); } catch (_e) {}`

**O que faz:** Despacha mousedown best-effort para handlers legados.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 153 — U07

**Fonte:** `    try { element.dispatchEvent(new PointerEvent('pointerup', options)); } catch (_e) {}`

**O que faz:** Despacha pointerup best-effort.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 154 — U07

**Fonte:** `    try { element.dispatchEvent(new MouseEvent('mouseup', options)); } catch (_e) {}`

**O que faz:** Despacha mouseup best-effort.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 155 — U07

**Fonte:** `    try { element.click(); } catch (_e) { return false; }`

**O que faz:** Executa element.click(); se esse passo lançar, informa false mesmo que eventos preliminares tenham sido emitidos.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 156 — U07

**Fonte:** `    return true;`

**O que faz:** Retorna true quando click() não lançou; a confirmação real ainda será feita por ensureActive.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 157 — U07

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática da unidade U07 (Clique sintético defensivo) sem alterar por si só o estado do módulo.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 158 — U07

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U07 (Clique sintético defensivo); não produz efeito colateral.

**Como faz:** triggerClick tenta foco, calcula o centro do retângulo, despacha pointer/mouse down/up e finalmente chama click(), absorvendo falhas intermediárias.

**Por que foi implementado dessa forma:** Frameworks podem escutar fases diferentes; ainda assim o retorno representa somente tentativa, deixando a prova de estado para ensureActive.

**Por que uma implementação ingênua seria pior:** Um único dispatch pode não acionar a UI; tratar click sem exceção como ativação confirmada criaria falso sucesso de privacidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a ordem dos cinco eventos; ⚠️ caminhos de erro, foco e coordenadas não possuem assertions específicas.

### Linha 159 — U08

**Fonte:** `  async function ensureActive({`

**O que faz:** Declara handshake assíncrono principal.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 160 — U08

**Fonte:** `    root = document,`

**O que faz:** root padrão é document do content script.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 161 — U08

**Fonte:** `    timeoutMs = 12000,`

**O que faz:** Timeout padrão de 12 s limita polling/verificação.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 162 — U08

**Fonte:** `    signal = null,`

**O que faz:** Aceita AbortSignal opcional para cancelamento cooperativo.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 163 — U08

**Fonte:** `    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),`

**O que faz:** sleep é injetável; produção usa setTimeout e testes substituem por função imediata.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 164 — U08

**Fonte:** `  } = {}) {`

**O que faz:** Permite chamada sem argumentos via objeto default vazio.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 165 — U08

**Fonte:** `    const start = Date.now();`

**O que faz:** Captura relógio de início para deadline.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 166 — U08

**Fonte:** `    let clicked = false;`

**O que faz:** clicked registra se click() foi aceito sem throw; também bloqueia novos cliques após primeira tentativa.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 167 — U08

**Fonte:** `    let sawSemanticButton = false;`

**O que faz:** sawSemanticButton diferencia ausência de controle de controle encontrado porém não acionável.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 168 — U08

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 169 — U08

**Fonte:** `    while (Date.now() - start < timeoutMs) {`

**O que faz:** Loop continua enquanto elapsed < timeout.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 170 — U08

**Fonte:** `      if (signal && signal.aborted) {`

**O que faz:** Verifica cancelamento a cada iteração antes de tocar no DOM.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 171 — U08

**Fonte:** `        return { status: 'verification_failed', reason: 'aborted' };`

**O que faz:** Abort retorna falha verificável explícita, não sucesso/unavailable.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 172 — U08

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 173 — U08

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 174 — U08

**Fonte:** `      const button = findTempChatButton(root);`

**O que faz:** Redescobre o botão a cada iteração para tolerar re-render do Gemini.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 175 — U08

**Fonte:** `      if (button) sawSemanticButton = true;`

**O que faz:** Memoriza que em algum momento houve um controle semântico.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 176 — U08

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 177 — U08

**Fonte:** `      if (isAlreadyActive(button, root)) {`

**O que faz:** Reavalia o estado em toda iteração, inclusive depois do clique.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 178 — U08

**Fonte:** `        return { status: clicked ? 'activated_verified' : 'already_active' };`

**O que faz:** Retorna already_active sem clique ou activated_verified somente se houve clique e o estado depois foi observado como ativo.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 179 — U08

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 180 — U08

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 181 — U08

**Fonte:** `      if (button && !clicked) {`

**O que faz:** Só tenta clicar quando há botão e nenhum clique bem-sucedido anterior.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 182 — U08

**Fonte:** `        clicked = triggerClick(button);`

**O que faz:** Resultado de triggerClick controla se a operação entra no modo somente-observação.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 183 — U08

**Fonte:** `        await sleep(600);`

**O que faz:** Após tentativa de clique bem-sucedida, aguarda 600 ms para o DOM reagir.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 184 — U08

**Fonte:** `        continue;`

**O que faz:** Recomeça o loop para redescobrir controle/estado, evitando usar nó stale.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 185 — U08

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 186 — U08

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 187 — U08

**Fonte:** `      // Depois do clique, nunca clica novamente sem certeza: somente observa a`

**O que faz:** Comentário documenta invariável anti-double-toggle.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 188 — U08

**Fonte:** `      // transição. Isso elimina o risco de alternar ativo->inativo em loop.`

**O que faz:** Explica por que o módulo não reclica após uma tentativa: evitar ativo→inativo por toggle.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 189 — U08

**Fonte:** `      if (clicked) {`

**O que faz:** Se houve clique, entra no caminho exclusivamente observacional.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 190 — U08

**Fonte:** `        await sleep(250);`

**O que faz:** Polling pós-clique usa 250 ms.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 191 — U08

**Fonte:** `        continue;`

**O que faz:** Continua sem voltar ao ramo de click.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 192 — U08

**Fonte:** `      }`

**O que faz:** Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 193 — U08

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 194 — U08

**Fonte:** `      await sleep(500);`

**O que faz:** Quando ainda não encontrou/clicou, polling de descoberta usa 500 ms.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 195 — U08

**Fonte:** `    }`

**O que faz:** Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 196 — U08

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 197 — U08

**Fonte:** `    if (clicked) return { status: 'verification_failed', reason: 'state_not_verified' };`

**O que faz:** Timeout após clique gera verification_failed/state_not_verified; jamais converte tentativa em sucesso.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 198 — U08

**Fonte:** `    if (!sawSemanticButton) return { status: 'unavailable' };`

**O que faz:** Timeout sem jamais ver controle gera unavailable, permitindo fallback de camada superior.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 199 — U08

**Fonte:** `    return { status: 'verification_failed', reason: 'control_not_actionable' };`

**O que faz:** Se viu controle mas nenhum click teve sucesso, classifica control_not_actionable.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 200 — U08

**Fonte:** `  }`

**O que faz:** Fecha a estrutura sintática da unidade U08 (Handshake ensureActive e anti-double-toggle) sem alterar por si só o estado do módulo.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 201 — U08

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U08 (Handshake ensureActive e anti-double-toggle); não produz efeito colateral.

**Como faz:** ensureActive usa deadline, AbortSignal, redescoberta do botão, flags clicked/sawSemanticButton e polling com sleeps distintos antes/depois do clique.

**Por que foi implementado dessa forma:** A UI reage de forma assíncrona e pode rerenderizar; depois do primeiro click bem-sucedido a função somente observa para não inverter o toggle.

**Por que uma implementação ingênua seria pior:** Reclicar enquanto a UI está atrasada pode ligar e desligar o modo; sleep fixo seguido de sucesso aceitaria ativação que nunca ocorreu.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para already_active, activated_verified, state_not_verified, unavailable e um único clique; ⚠️ aborted/control_not_actionable faltam.

### Linha 202 — U09

**Fonte:** `  const api = {`

**O que faz:** Constrói API pública mínima.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 203 — U09

**Fonte:** `    ensureActive,`

**O que faz:** Exporta ensureActive.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 204 — U09

**Fonte:** `    findInTree,`

**O que faz:** Exporta findInTree para testes/diagnóstico.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 205 — U09

**Fonte:** `    findTempChatButton,`

**O que faz:** Exporta findTempChatButton.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 206 — U09

**Fonte:** `    isAlreadyActive,`

**O que faz:** Exporta isAlreadyActive.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 207 — U09

**Fonte:** `    triggerClick,`

**O que faz:** Exporta triggerClick.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 208 — U09

**Fonte:** `    hasTemporarySemantics,`

**O que faz:** Exporta hasTemporarySemantics.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 209 — U09

**Fonte:** `  };`

**O que faz:** Fecha a estrutura sintática da unidade U09 (Superfície pública e exports) sem alterar por si só o estado do módulo.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 210 — U09

**Fonte:** `␠ [linha vazia]`

**O que faz:** Separador visual dentro de U09 (Superfície pública e exports); não produz efeito colateral.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 211 — U09

**Fonte:** `  scope.MangaTranslatorGeminiTemporaryChat = api;`

**O que faz:** Publica API no namespace global esperado por content_gemini/job-runner.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 212 — U09

**Fonte:** `  if (typeof module !== 'undefined' && module.exports) module.exports = api;`

**O que faz:** Também exporta via CommonJS para Jest e ferramentas Node sem duplicar implementação.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 213 — U09

**Fonte:** `})(typeof self !== 'undefined' ? self : globalThis);`

**O que faz:** Fecha IIFE escolhendo self quando disponível e globalThis como fallback.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.

### Linha 214 — U09

**Fonte:** `␠ [linha vazia]`

**O que faz:** Posição documental do newline final; preserva terminação POSIX do arquivo.

**Como faz:** Um único objeto api referencia as funções e é publicado em MangaTranslatorGeminiTemporaryChat e, quando existente, module.exports.

**Por que foi implementado dessa forma:** Browser e Jest devem consumir a mesma implementação e o composition root espera exatamente o global carregado pelo manifest.

**Por que uma implementação ingênua seria pior:** Manter exports/adapters distintos permitiria drift: testes poderiam validar código diferente do executado na extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelo require do arquivo real nas suítes; 🟨 a captura/injeção pelo content_gemini é evidência de integração.


## 17. Análise por unidade — o que, como, por que e alternativa ingênua

| Unidade | O que faz | Como faz | Por que assim | Por que uma implementação ingênua seria pior |
|---|---|---|---|---|
| U01 | instala módulo isolado e vocabulário | strict + IIFE + radicais PT/EN | content scripts clássicos não usam import ESM aqui e a UI é localizada | globais soltos colidem; string exata quebra ao menor ajuste de copy/locale |
| U02 | normaliza significado de um controle | combina innerText, textContent, ARIA, title e testids | Gemini pode representar o mesmo controle por texto, ícone ou atributo | depender só de textContent perde controles acessíveis; depender só de testid acopla ao markup |
| U03 | classifica semântica temporária | busca radicais e frases compactas em texto normalizado | reduz dependência de uma tradução exata | igualdade literal falha em acentos, flexão e inglês |
| U04 | encontra nós além do light DOM | DFS recursivo com shadowRoot aberto e catches locais | web components podem encapsular controles | querySelector único não atravessa Shadow DOM; exceção de um custom element derrubaria o fluxo |
| U05 | escolhe o controle | semântica primeiro, testids depois, DFS profunda por último | privilegia significado e mantém fallbacks estruturais | coordenadas/índices clicam alvo errado após re-layout; um selector único é frágil |
| U06 | prova estado ativo | ação inversa, atributos, classes, indicadores, close controls e assinaturas de página | UI do Gemini pode variar entre toggle e tela dedicada | assumir ativo pelo simples fato de botão existir confunde "Ativar" com estado ativo |
| U07 | tenta interação | foco + pointer/mouse sequence + click | frameworks podem escutar etapas diferentes | apenas dispatchEvent ou apenas click pode não acionar listeners; tratar retorno como confirmação gera falso sucesso |
| U08 | verifica transição | deadline, AbortSignal, redescoberta, um clique, polling e statuses distintos | evita double-toggle e separa ausência, inação e transição não verificada | loop que reclica pode desligar o modo; sleep fixo seguido de "sucesso" aceita UI atrasada/falha |
| U09 | fornece API única | global browser + CommonJS sobre o mesmo objeto | runtime e Jest exercitam a mesma implementação | adapter duplicado pode divergir e testes passarem sem testar o código de produção |

## 18. Relação com o consumidor e risco crítico

No job runner, a sequência real é:

1. executionMode=temp_chat;
2. chamada a temporaryChatApi.ensureActive;
3. mapeamento para tempChatResult;
4. already_active/activated_verified recebem sucesso;
5. verification_failed gera warning, mas o processamento continua;
6. shouldDeleteConversation só inclui temp_chat quando tempChatResult.notFound é true.

Portanto, unavailable tem um caminho de compensação por exclusão, enquanto verification_failed não tem o mesmo fallback. Se a tentativa de ativação falhar sem ficar "unavailable", o fluxo pode seguir sem prova de privacidade e sem exclusão posterior automática. Não há teste específico provando que essa política é intencional ou segura.

## 19. Auditoria interna antes do fechamento

- ✅ fonte relida diretamente de docs/project-bible;
- ✅ SHA reconfirmado: 40fbc8dc6acf6ae21dc5854aae3f14bfc029e3bc;
- ✅ reserva relida e pertence a GPT-5.6-Sol#J;
- ✅ fonte integral inserida sem abreviações;
- ✅ 213 linhas textuais + newline final = 214/214 posições;
- ✅ mapa de unidades cobre todas as posições;
- ✅ papel arquitetural e consumer real conferidos;
- ✅ ordem no manifest conferida;
- ✅ injeção por content_gemini conferida;
- ✅ chamada/statuses no job-runner conferidos;
- ✅ testes diretos abertos e assertions inspecionadas;
- ✅ mocks do job-runner não foram classificados como prova interna;
- ✅ execução E2E foi classificada como indireta para propriedades internas;
- ✅ gaps receberam marca explícita de ausência de prova específica;
- ✅ invariantes documentadas;
- ✅ riscos de DOM, synthetic events, timeout e Shadow DOM documentados;
- ✅ risco de privacidade verification_failed sem fallback de exclusão destacado;
- ✅ nenhum código funcional alterado;
- ⏳ STATUS/CHECKLIST/AUDITORIA/PR aguardam seção crítica com PROGRESS.lock.md.

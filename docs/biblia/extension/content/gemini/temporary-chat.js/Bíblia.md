# Bíblia técnica — extension/content/gemini/temporary-chat.js

> **Estado:** 🟠 EM ANDAMENTO — Bíblia integral concluída; fechamento global depende do mutex compartilhado  
> **SHA auditado:** 40fbc8dc6acf6ae21dc5854aae3f14bfc029e3bc  
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

## 16. Análise por unidade — o que, como, por que e alternativa ingênua

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

## 17. Relação com o consumidor e risco crítico

No job runner, a sequência real é:

1. executionMode=temp_chat;
2. chamada a temporaryChatApi.ensureActive;
3. mapeamento para tempChatResult;
4. already_active/activated_verified recebem sucesso;
5. verification_failed gera warning, mas o processamento continua;
6. shouldDeleteConversation só inclui temp_chat quando tempChatResult.notFound é true.

Portanto, unavailable tem um caminho de compensação por exclusão, enquanto verification_failed não tem o mesmo fallback. Se a tentativa de ativação falhar sem ficar "unavailable", o fluxo pode seguir sem prova de privacidade e sem exclusão posterior automática. Não há teste específico provando que essa política é intencional ou segura.

## 18. Auditoria interna antes do fechamento

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

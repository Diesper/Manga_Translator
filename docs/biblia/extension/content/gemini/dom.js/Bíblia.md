# Bíblia técnica — `extension/content/gemini/dom.js`

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#D`  
> **SHA auditado:** `d3694ea70cdd97b64e483884895a458993791714`  
> **Tipo:** helper JavaScript de DOM para content script Gemini + módulo CommonJS de testes  
> **Linhas textuais:** **370**  
> **Posições documentais:** **371** contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`dom.js` é o adaptador de DOM compartilhado do subsistema Gemini. Ele não envia mensagens ao background, não persiste estado e não faz fetch. Sua responsabilidade é transformar um DOM altamente mutável — inclusive Shadow DOM — em decisões pequenas e reutilizáveis: visibilidade, habilitação de controles, localização de editor, origem de imagem, ownership de model/user turn e seleção de botões Send/Stop.

Essa camada é crítica porque `observer.js`, `editor.js`, `attachment.js`, `image-quarantine.js`, `job-runner.js` e `content_gemini.js` baseiam decisões de automação nesses helpers. Um falso positivo aqui pode fazer o sistema clicar controle errado, aceitar imagem do usuário como resultado, interpretar controle oculto como estado ativo ou perder uma resposta dentro de Shadow DOM.

## 2. Carregamento e dependências

No browser, `extension/manifest.json` carrega `content/gemini/selectors.js` antes de `content/gemini/dom.js`. O arquivo lê `scope.MangaTranslatorGeminiSelectors`; em CommonJS/Jest tenta `require('./selectors.js')`. Diferentemente de módulos que fazem fail-fast, se selectors não existir ele usa `{}`, o que deixa helpers dependentes de SELECTORS degradarem silenciosamente.

O helper de testes `tests/helpers/load-content-gemini-module.js` também carrega selectors antes de dom. A suíte focal `tests/unit/content-gemini/dom-modules.test.js` importa ambos dentro de `jest.isolateModules`, portanto executa a implementação real deste arquivo.

## 3. Consumidores reais no SHA auditado

| Consumidor | Uso de `dom.js` | Consequência |
|---|---|---|
| `extension/content/gemini/observer.js` | deep scan, visibilidade, enabled, image source/blacklist, user/model ownership, input area, Stop | decide submission/generation/result ownership |
| `extension/content/gemini/editor.js` | `isControlEnabled` | não força botão Send disabled |
| `extension/content/gemini/attachment.js` | `findAllDeep`, `getImageSource`, `isIgnoredGeminiImageSource` | descobre inputs/previews e confirma attachment |
| `extension/content/gemini/image-quarantine.js` | ownership estrito, user turn, input area | impede que input/preview seja entregue como resultado |
| `extension/content/gemini/job-runner.js` | deep scan, visibilidade, editor, imagens, Send | seleciona composer e resultado e dispara submit |
| `extension/content/content_gemini.js` | Stop, Send, enabled | handler `DO_SEND_NOW` |
| `getModelResponseContainer` / `isUserTurnImage` | nenhum consumidor atual localizado | APIs exportadas com risco de drift |

## 4. Contratos importantes

1. **Deep DOM:** `findAllDeep` atravessa Shadow DOM aberto; consultas normais com `querySelector` não fazem isso.
2. **Ownership forte:** resultado automático deve usar `getStrictModelResponseContainer`, não o `RESPONSE` amplo.
3. **Composer estreito:** `isInsideInputArea` não usa `chat-window`, porque esse wrapper pode conter conversa inteira.
4. **Sem mutação de disabled:** `isControlEnabled` apenas observa estado; `editor.js` tenta nudge/requery.
5. **Send heurístico:** sinais semânticos fortes vêm antes de fallback textual e geométrico.
6. **Stop visível:** controle Stop oculto não conta como geração ativa.
7. **Imagem lazy:** `getImageSource` pode promover `data-src` para `src`, então não é um getter puramente sem side effect.

## 5. Segurança, privacidade e trust boundaries

A entrada desta camada é DOM controlado pela página Gemini, não pelo código da extensão. Classes, labels, test ids e estrutura podem mudar. Por isso ownership de resultado é uma fronteira de confiança: confundir user turn/composer/attachment com model response pode vazar a própria imagem de entrada para o pipeline como se fosse saída traduzida.

O arquivo não lê credenciais nem envia dados pela rede. O risco principal é **integridade da automação**, não exfiltração direta. Heurísticas permissivas devem permanecer subordinadas a validações posteriores do Observer e da image quarantine.

## 6. Matriz de evidências automatizadas

| Comportamento | Evidência lida | Classificação |
|---|---|---|
| visível vs `display:none` / `aria-hidden` | `dom-modules.test.js` | ✅ PROVADO DIRETAMENTE |
| disabled / aria-disabled sem mutar | `dom-modules.test.js` + SEND-05/06 | ✅ DIRETO + 🟨 INTEGRAÇÃO |
| Shadow DOM em deep scan | `dom-modules.test.js` | ✅ PROVADO DIRETAMENTE |
| editor ql/contenteditable | `dom-modules.test.js` | ✅ PROVADO DIRETAMENTE |
| data-src, avatar blacklist, model ownership | `dom-modules.test.js` | ✅ PROVADO DIRETAMENTE, porém parcial nos fallbacks |
| Send ignora Stop/feedback e prefere Send message | `dom-modules.test.js` | ✅ PROVADO DIRETAMENTE |
| Stop oculto vs visível | `dom-modules.test.js` | ✅ PROVADO DIRETAMENTE |
| model ownership dentro de Shadow DOM | OBS-14/OBS-19 | 🟨 EXECUTADO INDIRETAMENTE com assertion do consumidor |
| user turn / composer quarantine | QUA-05, OBS-15 | 🟨 EXECUTADO INDIRETAMENTE |
| `getModelResponseContainer` amplo | nenhum consumidor/assertion localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `isUserTurnImage` | nenhum consumidor/assertion localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Send fallback textual | nenhum cenário que force o primeiro passe a falhar | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Send fallback geométrico | nenhum teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| visibility por offset/clientRects e exceções | nenhum teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

**Importante:** `job-runner.test.js` frequentemente injeta `domApi` mockado; essas assertions provam contratos do runner, não a implementação real de `dom.js`. Já `observer.test.js`, `image-quarantine.test.js`, `editor-submit.test.js` e fluxos que fazem `require(DOM_PATH)` fornecem execução indireta do módulo real quando a propriedade observada depende dele.

## 7. Casos-limite

- raiz nula ou matcher inválido em deep scan;
- selector CSS inválido em `findVisible`;
- Shadow DOM fechado;
- elementos desconectados;
- controles duplicados, ocultos ou disabled;
- labels em português/inglês e markup novo;
- `data-src` sem `src`;
- URL legítima contendo substring de blacklist;
- wrapper de user turn contendo model turn explícito;
- resposta sem wrapper estrito;
- composer redesenhado sem os wrappers atualmente conhecidos;
- botão sem label com ícone de seta;
- ausência de semântica, forçando fallback geométrico;
- `selectors.js` ausente, levando `SELECTORS` a `{}`.

## 8. Análise crítica

- **Risco — Send oculto:** `findSendButton` não chama `isElementVisible`; um candidato semanticamente forte, porém invisível, pode ser retornado. Consumidores checam enabled, mas enabled não implica visível.
- **Risco — fallback geométrico amplo:** a busca final usa `SELECTORS.INPUT_AREA`, que pode incluir `chat-window`; isso é mais permissivo que `isInsideInputArea` e pode selecionar controle próximo da borda de um wrapper grande.
- **Risco — getter com side effect:** `getImageSource` escreve `img.src = img.dataset.src`, potencialmente iniciando carregamento.
- **Risco — blacklist por substring:** termos como `profile` podem aparecer em URL legítima.
- **Dívida técnica:** `getModelResponseContainer` e `isUserTurnImage` estão exportados sem consumidor atual localizado.
- **Desempenho:** `findAllDeep` é DFS completo; observer/job-runner podem chamá-lo repetidamente em páginas grandes.
- **Degradação silenciosa:** ausência de selectors não lança; `findVisibleStopButton` pode simplesmente deixar de detectar geração.
- **Fallback editável permissivo:** `getEditableElement` devolve `p` ou `root` mesmo se não houver contenteditable.

## 9. Invariantes

1. Ownership automático de resultado nunca deve depender apenas de `SELECTORS.RESPONSE` amplo.
2. `isInsideInputArea` deve continuar excluindo wrappers que podem conter a conversa inteira.
3. `isControlEnabled` não deve remover/alterar disabled para “fazer funcionar”.
4. Shadow DOM aberto deve continuar pesquisável por `findAllDeep` e `closestComposed`.
5. Stop oculto não pode contar como geração ativa.
6. A blacklist de Send deve ser aplicada antes de fallbacks permissivos.
7. O fallback geométrico de Send deve permanecer último recurso.
8. Imagens de avatar/branding não podem ser aceitas como resultado por padrão.
9. Mudanças em seletores devem ser revisadas em conjunto com observer, quarantine, editor e job-runner.
10. Helpers de ownership devem preferir falso negativo recuperável a falso positivo que entregue a imagem errada.
11. Export CommonJS e global devem apontar para a mesma API.
12. Toda nova heurística de Send/ownership precisa de teste focal que force especificamente esse ramo.

## 10. Lacunas de teste

### GAP-DOM-01 — visibilidade alternativa
**Comportamento:** `visibility:hidden/collapse`, offsetWidth/offsetHeight, getClientRects e exceção de layout.  
**Por que os testes atuais não provam:** o teste focal cobre `display:none`, `aria-hidden` e retângulo positivo.  
**Teste necessário:** parametrizar cada fonte de visibilidade e um nó cujo getter lança.  
**Regressão possível:** nó oculto ser aceito ou nó visível ser descartado em browser/markup diferente.

### GAP-DOM-02 — fallback de editor
**Comportamento:** retorno de `p` e retorno do próprio root quando não há editor.  
**Teste necessário:** roots sem contenteditable, com/sem `p`.  
**Regressão possível:** prompt escrito em wrapper não editável.

### GAP-DOM-03 — blacklist completa
**Comportamento:** favicon/emoji/profile/google avatar/gstatic.  
**Teste necessário:** tabela de URLs positivas/negativas, inclusive URL legítima contendo termo ambíguo.  
**Regressão possível:** aceitar branding ou bloquear resultado legítimo.

### GAP-DOM-04 — resposta ampla
**Comportamento:** `getModelResponseContainer`.  
**Teste necessário:** diferenciar wrapper estrito de `message-content` genérico e comprovar que consumidores de ownership não usam a API ampla.  
**Regressão possível:** API ampla ser usada futuramente como prova de autoria.

### GAP-DOM-05 — `isUserTurnImage`
**Comportamento:** predicado exportado sem consumidor focal.  
**Teste necessário:** imagem em user turn, model turn e composer.  
**Regressão possível:** drift silencioso da API exportada.

### GAP-DOM-06 — Send fallback textual
**Comportamento:** segundo loop das linhas 301–313.  
**Teste necessário:** remover todos os sinais fortes e deixar apenas texto semântico.  
**Regressão possível:** fallback nunca funcionar ou escolher feedback/controle lateral.

### GAP-DOM-07 — Send fallback geométrico
**Comportamento:** linhas 315–337.  
**Teste necessário:** composer com vários botões, apenas um dentro da janela geométrica, incluindo candidato oculto.  
**Regressão possível:** clique em botão errado.

### GAP-DOM-08 — Send invisível/disabled
**Comportamento:** o helper pode retornar botão sem filtrar visibilidade/habilitação.  
**Teste necessário:** botão Send oculto depois de um visível e ordem DOM adversarial.  
**Regressão possível:** automação escolher cópia invisível e falhar no submit.

### GAP-DOM-09 — selectors ausentes
**Comportamento:** fallback silencioso para `{}`.  
**Teste necessário:** carregar `dom.js` sem selectors global/CommonJS e verificar contrato desejado.  
**Regressão possível:** Stop/model ownership desaparecerem sem erro diagnóstico.

## 11. Fonte integral

```javascript
'use strict';
// gemini/dom.js — Helpers de DOM puros/testáveis para a automação Gemini.

(function(scope) {
  let selectorsApi = scope.MangaTranslatorGeminiSelectors || null;
  if (!selectorsApi && typeof require === 'function') {
    try { selectorsApi = require('./selectors.js'); } catch (_e) {}
  }
  const SELECTORS = selectorsApi && selectorsApi.SELECTORS ? selectorsApi.SELECTORS : {};

  function isElementVisible(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.getAttribute && element.getAttribute('aria-hidden') === 'true') return false;

    let style = null;
    try {
      const view = element.ownerDocument && element.ownerDocument.defaultView;
      if (view && typeof view.getComputedStyle === 'function') {
        style = view.getComputedStyle(element);
      }
    } catch (_e) {}

    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) {
      return false;
    }

    try {
      const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
      const hasRectSize = rect && rect.width > 0 && rect.height > 0;
      const hasLayoutSize = Number(element.offsetWidth) > 0 || Number(element.offsetHeight) > 0;
      const hasClientRect = typeof element.getClientRects === 'function' && element.getClientRects().length > 0;
      return Boolean(hasRectSize || hasLayoutSize || hasClientRect);
    } catch (_e) {
      return false;
    }
  }

  function isControlEnabled(element) {
    return Boolean(element) &&
      element.disabled !== true &&
      element.getAttribute('disabled') === null &&
      element.getAttribute('aria-disabled') !== 'true';
  }

  function findVisible(selector, root) {
    const base = root || (typeof document !== 'undefined' ? document : null);
    if (!base || !selector) return null;

    const elements = findAllDeep(base, element => {
      if (!element || element.nodeType !== 1 || typeof element.matches !== 'function') {
        return false;
      }
      try {
        return element.matches(selector);
      } catch (_e) {
        return false;
      }
    });

    for (const element of elements) {
      if (isElementVisible(element)) return element;
    }
    return null;
  }

  function findAllDeep(root, matcher) {
    const list = [];
    if (!root || typeof matcher !== 'function') return list;

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 1) {
        try {
          if (matcher(node)) list.push(node);
        } catch (_e) {}
        try {
          if (node.shadowRoot) walk(node.shadowRoot);
        } catch (_e) {}
      }

      let child = node.firstChild;
      while (child) {
        walk(child);
        child = child.nextSibling;
      }
    }

    walk(root);
    return list;
  }

  function getEditableElement(root) {
    if (!root) return null;
    const editable = root.querySelector
      ? root.querySelector('.ql-editor, [contenteditable="true"]')
      : null;
    if (editable) return editable;

    if (
      root.getAttribute &&
      (
        root.getAttribute('contenteditable') === 'true' ||
        (typeof root.className === 'string' && root.className.includes('ql-editor'))
      )
    ) {
      return root;
    }

    return (root.querySelector && root.querySelector('p')) || root;
  }

  function getImageSource(img) {
    if (!img) return '';
    if (img.dataset && img.dataset.src && !img.src) img.src = img.dataset.src;
    return img.currentSrc ||
      img.src ||
      (img.dataset && img.dataset.src) ||
      (img.getAttribute && img.getAttribute('src')) ||
      '';
  }

  function isIgnoredGeminiImageSource(src) {
    const lower = String(src || '').toLowerCase();
    return !lower ||
      lower.includes('avatar') ||
      lower.includes('favicon') ||
      lower.includes('emoji') ||
      lower.includes('profile') ||
      lower.includes('googleusercontent.com/a/') ||
      lower.includes('gstatic.com/images/branding');
  }

  function closestComposed(element, selector) {
    if (!element || !selector) return null;

    let current = element;
    const visited = new Set();

    while (current && !visited.has(current)) {
      visited.add(current);

      try {
        if (current.nodeType === 1 && current.matches?.(selector)) {
          return current;
        }
      } catch (_e) {}

      if (current.parentElement) {
        current = current.parentElement;
        continue;
      }

      let rootNode = null;
      try {
        rootNode = current.getRootNode?.();
      } catch (_e) {}

      if (rootNode && rootNode.host) {
        current = rootNode.host;
        continue;
      }

      break;
    }

    return null;
  }

  function getStrictModelResponseContainer(element) {
    if (!element) return null;
    const selector = SELECTORS.MODEL_RESPONSE_STRICT || [
      'model-response',
      '[data-test-id*="model-response"]',
      '[data-testid*="model-response"]',
      '[data-message-author="model"]',
      'bard-model-response',
      'div[data-turn-role="model"]',
      'message-content.model',
      '.model-response-container',
      '.model-response-text',
    ].join(', ');

    return closestComposed(element, selector);
  }

  function getModelResponseContainer(element) {
    if (!element) return null;
    const strict = getStrictModelResponseContainer(element);
    if (strict) return strict;

    const selector = SELECTORS.RESPONSE || [
      'model-response',
      '[data-message-author="model"]',
      'div[data-turn-role="model"]',
      '.response-container',
      '.model-turn',
      '.presented-turn-content',
      'message-content',
    ].join(', ');

    return closestComposed(element, selector);
  }

  function getUserTurnContainer(element) {
    if (!element) return null;
    const selector = SELECTORS.USER_TURN || [
      '[data-message-author="user"]',
      'div[data-turn-role="user"]',
      '[data-test-id*="user-message"]',
      '[data-testid*="user-message"]',
      '.user-query-container',
      '.user-message',
    ].join(', ');
    return closestComposed(element, selector);
  }

  function isInsideInputArea(element) {
    if (!element) return false;

    // Para ownership de resultado, "chat-window" é amplo demais: em versões
    // atuais do Gemini ele pode englobar a conversa inteira, inclusive a
    // resposta gerada. Aqui aceitamos somente wrappers reais do composer.
    const selector = [
      'rich-textarea',
      '.input-area',
      '.chat-input-container',
      '.chat-input',
      'input-area',
      '[contenteditable="true"][role="textbox"]',
      '.ql-editor[contenteditable="true"]',
    ].join(', ');

    return Boolean(closestComposed(element, selector));
  }

  function isModelResponseImage(img) {
    return Boolean(getStrictModelResponseContainer(img));
  }

  function isUserTurnImage(img) {
    return Boolean(getUserTurnContainer(img));
  }

  function findSendButton(root) {
    const base = root || (typeof document !== 'undefined' ? document.body : null);
    if (!base) return null;

    const allClickables = findAllDeep(base, element => {
      if (!element || element.nodeType !== 1) return false;
      const tag = String(element.tagName || '').toLowerCase();
      const role = String(element.getAttribute('role') || '').toLowerCase();
      return tag === 'button' || role === 'button' || tag.includes('button') || tag === 'mat-icon-button';
    });

    const blacklist = [
      'feedback', 'report', 'survey', 'bug', 'cancel', 'cancelar', 'close',
      'fechar', 'dismiss', 'reject', 'mic', 'microfone', 'voice', 'audio',
      'stop', 'help', 'ajuda', 'clear', 'limpar',
    ];

    for (let index = allClickables.length - 1; index >= 0; index -= 1) {
      const btn = allClickables[index];
      const label = String(btn.getAttribute('aria-label') || '').toLowerCase().trim();
      const tooltip = String(btn.getAttribute('mattooltip') || '').toLowerCase().trim();
      const dataTooltip = String(btn.getAttribute('data-tooltip') || '').toLowerCase().trim();
      const title = String(btn.getAttribute('title') || '').toLowerCase().trim();
      const testId = String(btn.getAttribute('data-test-id') || btn.getAttribute('data-testid') || '').toLowerCase().trim();
      const className = (typeof btn.className === 'string' ? btn.className : '').toLowerCase();
      const text = String(btn.innerText || btn.textContent || '').toLowerCase().trim();

      const combined = `${label} ${tooltip} ${dataTooltip} ${title} ${testId} ${className}`;
      if (blacklist.some(bad => combined.includes(bad))) continue;

      const hasArrowIcon =
        text.includes('arrow_upward') ||
        text.includes('send') ||
        Boolean(btn.querySelector('mat-icon, svg, [data-icon-name*="send"], [data-icon-name*="arrow"]'));

      const isExact =
        label === 'enviar' ||
        label === 'enviar mensagem' ||
        label === 'enviar prompt' ||
        label === 'enviar consulta' ||
        label === 'send' ||
        label === 'send message' ||
        label === 'send prompt' ||
        tooltip === 'enviar' ||
        tooltip === 'enviar mensagem' ||
        tooltip === 'send' ||
        tooltip === 'send message' ||
        dataTooltip === 'enviar' ||
        dataTooltip === 'send' ||
        testId === 'send-button' ||
        className.includes('send-button');

      if (isExact || (hasArrowIcon && (label.includes('enviar') || label.includes('send') || label === ''))) {
        return btn;
      }
    }

    for (let index = allClickables.length - 1; index >= 0; index -= 1) {
      const btn = allClickables[index];
      const label = String(btn.getAttribute('aria-label') || '').toLowerCase().trim();
      const tooltip = String(btn.getAttribute('mattooltip') || '').toLowerCase().trim();
      const className = (typeof btn.className === 'string' ? btn.className : '').toLowerCase();
      const text = String(btn.innerText || btn.textContent || '').toLowerCase().trim();

      const combined = `${label} ${tooltip} ${className} ${text}`;
      if (blacklist.some(bad => combined.includes(bad))) continue;
      if (combined.includes('enviar') || combined.includes('send') || text.includes('arrow_upward')) {
        return btn;
      }
    }

    const doc = base.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const inputArea = doc && doc.querySelector
      ? doc.querySelector(SELECTORS.INPUT_AREA || 'rich-textarea, .input-area, chat-window, .chat-input-container')
      : null;

    if (inputArea) {
      const cRect = inputArea.getBoundingClientRect();
      for (let index = allClickables.length - 1; index >= 0; index -= 1) {
        const btn = allClickables[index];
        const bRect = btn.getBoundingClientRect();
        if (
          bRect.width >= 24 &&
          bRect.height >= 24 &&
          bRect.bottom <= cRect.bottom + 80 &&
          bRect.top >= cRect.top - 20 &&
          bRect.right <= cRect.right + 40 &&
          bRect.left >= cRect.right - 140
        ) {
          const label = String(btn.getAttribute('aria-label') || '').toLowerCase();
          if (!blacklist.some(bad => label.includes(bad))) return btn;
        }
      }
    }

    return null;
  }

  function findVisibleStopButton(root) {
    return findVisible(SELECTORS.STOP, root);
  }

  const api = {
    isElementVisible,
    isControlEnabled,
    findVisible,
    findAllDeep,
    getEditableElement,
    getImageSource,
    isIgnoredGeminiImageSource,
    closestComposed,
    getStrictModelResponseContainer,
    getModelResponseContainer,
    getUserTurnContainer,
    isInsideInputArea,
    isModelResponseImage,
    isUserTurnImage,
    findVisibleStopButton,
    findSendButton,
  };

  scope.MangaTranslatorGeminiDom = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
```

## 12. Cobertura linha a linha

### Linha 001

**Código:** `'use strict';`

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** Ativa strict mode para evitar coerções e bindings implícitos permissivos neste helper compartilhado.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 002

**Código:** `// gemini/dom.js — Helpers de DOM puros/testáveis para a automação Gemini.`

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** Comentário de manutenção: gemini/dom.js — Helpers de DOM puros/testáveis para a automação Gemini.. Registra uma restrição arquitetural sem executar código.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 003

**Código:** ␠ [linha vazia]

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** Separa visualmente blocos da unidade U01; não muda estado, retorno nem DOM.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 004

**Código:** `(function(scope) {`

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** A operação literal `(function(scope) {` implementa uma etapa de inicializa o helper DOM e resolve a tabela central de seletores.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 005

**Código:** `  let selectorsApi = scope.MangaTranslatorGeminiSelectors || null;`

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** Cria o binding `selectorsApi` com a expressão desta linha para sustentar inicializa o helper DOM e resolve a tabela central de seletores.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 006

**Código:** `  if (!selectorsApi && typeof require === 'function') {`

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** Aplica a guarda `if (!selectorsApi && typeof require === 'function')`; o ramo impede que inicializa o helper DOM e resolve a tabela central de seletores prossiga com um estado incompatível.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 007

**Código:** `    try { selectorsApi = require('./selectors.js'); } catch (_e) {}`

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** Abre uma tentativa protegida porque API DOM/browser desta unidade pode lançar em runtimes ou nós incomuns.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 008

**Código:** `  }`

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U01; não adiciona um novo side effect isolado.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 009

**Código:** `  const SELECTORS = selectorsApi && selectorsApi.SELECTORS ? selectorsApi.SELECTORS : {};`

**Unidade:** U01 — bootstrap e resolução de seletores.

**O que faz:** Cria o binding `SELECTORS` com a expressão desta linha para sustentar inicializa o helper DOM e resolve a tabela central de seletores.

**Como se encaixa:** usa global de content script ou CommonJS, com fallback para objeto vazio Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o mesmo arquivo precisa funcionar na ordem do manifest e no harness Jest. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: se selectors.js não carregar no browser, vários helpers degradam silenciosamente em vez de falhar cedo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 010

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 011

**Código:** `  function isElementVisible(element) {`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Declara o helper `isElementVisible`, ponto de entrada da unidade U02.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa `isElementVisible` com Element real, visível e oculto.

### Linha 012

**Código:** `    if (!element || element.nodeType !== 1) return false;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Aplica a guarda `if (!element || element.nodeType !== 1) return false;`; o ramo impede que decide se um nó Element é observavelmente visível prossiga com um estado incompatível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa `isElementVisible` com Element real, visível e oculto.

### Linha 013

**Código:** `    if (element.getAttribute && element.getAttribute('aria-hidden') === 'true') return false;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Aplica a guarda `if (element.getAttribute && element.getAttribute('aria-hidden') === 'true') return false;`; o ramo impede que decide se um nó Element é observavelmente visível prossiga com um estado incompatível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` verifica que `aria-hidden=true` torna o elemento invisível.

### Linha 014

**Código:** ␠ [linha vazia]

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Separa visualmente blocos da unidade U02; não muda estado, retorno nem DOM.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa `isElementVisible` com Element real, visível e oculto.

### Linha 015

**Código:** `    let style = null;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Cria o binding `style` com a expressão desta linha para sustentar decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 016

**Código:** `    try {`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Abre uma tentativa protegida porque API DOM/browser desta unidade pode lançar em runtimes ou nós incomuns.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 017

**Código:** `      const view = element.ownerDocument && element.ownerDocument.defaultView;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Cria o binding `view` com a expressão desta linha para sustentar decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 018

**Código:** `      if (view && typeof view.getComputedStyle === 'function') {`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Aplica a guarda `if (view && typeof view.getComputedStyle === 'function')`; o ramo impede que decide se um nó Element é observavelmente visível prossiga com um estado incompatível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 019

**Código:** `        style = view.getComputedStyle(element);`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Obtém o estilo computado do elemento para que display/visibility reflitam CSS aplicado, não apenas atributos inline.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 020

**Código:** `      }`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U02; não adiciona um novo side effect isolado.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 021

**Código:** `    } catch (_e) {}`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Captura a exceção da operação DOM anterior; a unidade converte a falha em fallback/resultado conservador em vez de derrubar o job.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 022

**Código:** ␠ [linha vazia]

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Separa visualmente blocos da unidade U02; não muda estado, retorno nem DOM.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 023

**Código:** `    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) {`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Aplica a guarda `if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'))`; o ramo impede que decide se um nó Element é observavelmente visível prossiga com um estado incompatível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 024

**Código:** `      return false;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Retorna `false`, materializando o contrato de decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 025

**Código:** `    }`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U02; não adiciona um novo side effect isolado.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste cobre o caminho `display:none`; `visibility:hidden/collapse` e exceções de computed style não recebem assertion isolada.

### Linha 026

**Código:** ␠ [linha vazia]

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Separa visualmente blocos da unidade U02; não muda estado, retorno nem DOM.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa `isElementVisible` com Element real, visível e oculto.

### Linha 027

**Código:** `    try {`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Abre uma tentativa protegida porque API DOM/browser desta unidade pode lançar em runtimes ou nós incomuns.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste fornece `getBoundingClientRect()` positivo e espera `true`; fallbacks por offset/clientRects não são isolados.

### Linha 028

**Código:** `      const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Cria o binding `rect` com a expressão desta linha para sustentar decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste fornece `getBoundingClientRect()` positivo e espera `true`; fallbacks por offset/clientRects não são isolados.

### Linha 029

**Código:** `      const hasRectSize = rect && rect.width > 0 && rect.height > 0;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Cria o binding `hasRectSize` com a expressão desta linha para sustentar decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste fornece `getBoundingClientRect()` positivo e espera `true`; fallbacks por offset/clientRects não são isolados.

### Linha 030

**Código:** `      const hasLayoutSize = Number(element.offsetWidth) > 0 || Number(element.offsetHeight) > 0;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Cria o binding `hasLayoutSize` com a expressão desta linha para sustentar decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste fornece `getBoundingClientRect()` positivo e espera `true`; fallbacks por offset/clientRects não são isolados.

### Linha 031

**Código:** `      const hasClientRect = typeof element.getClientRects === 'function' && element.getClientRects().length > 0;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Cria o binding `hasClientRect` com a expressão desta linha para sustentar decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste fornece `getBoundingClientRect()` positivo e espera `true`; fallbacks por offset/clientRects não são isolados.

### Linha 032

**Código:** `      return Boolean(hasRectSize || hasLayoutSize || hasClientRect);`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Retorna `Boolean(hasRectSize || hasLayoutSize || hasClientRect)`, materializando o contrato de decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste fornece `getBoundingClientRect()` positivo e espera `true`; fallbacks por offset/clientRects não são isolados.

### Linha 033

**Código:** `    } catch (_e) {`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Captura a exceção da operação DOM anterior; a unidade converte a falha em fallback/resultado conservador em vez de derrubar o job.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há cenário focal que faça leitura geométrica lançar.

### Linha 034

**Código:** `      return false;`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Retorna `false`, materializando o contrato de decide se um nó Element é observavelmente visível.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há cenário focal que faça leitura geométrica lançar.

### Linha 035

**Código:** `    }`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U02; não adiciona um novo side effect isolado.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há cenário focal que faça leitura geométrica lançar.

### Linha 036

**Código:** `  }`

**Unidade:** U02 — visibilidade de elemento.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U02; não adiciona um novo side effect isolado.

**Como se encaixa:** combina aria-hidden, computed style, retângulo, offset e client rects Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e seleção de controles não podem tratar placeholders/controles ocultos como estado real. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não cobre todos os conceitos de visibilidade do navegador, como opacity, clipping ou ancestrais fora de layout.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há cenário focal que faça leitura geométrica lançar.

### Linha 037

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 038

**Código:** `  function isControlEnabled(element) {`

**Unidade:** U03 — habilitação de controles.

**O que faz:** Declara o helper `isControlEnabled`, ponto de entrada da unidade U03.

**Como se encaixa:** consulta propriedade disabled e atributos disabled/aria-disabled Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o código deve respeitar o estado do framework em vez de forçar botão de envio. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: pressupõe um Element com getAttribute; objeto arbitrário truthy pode lançar.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` verifica habilitado, `disabled` e `aria-disabled` sem mutação; `disabled` via atributo isolado não é cenário separado.

### Linha 039

**Código:** `    return Boolean(element) &&`

**Unidade:** U03 — habilitação de controles.

**O que faz:** Retorna `Boolean(element) &&`, materializando o contrato de recusa controles disabled/aria-disabled sem mutá-los.

**Como se encaixa:** consulta propriedade disabled e atributos disabled/aria-disabled Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o código deve respeitar o estado do framework em vez de forçar botão de envio. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: pressupõe um Element com getAttribute; objeto arbitrário truthy pode lançar.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` verifica habilitado, `disabled` e `aria-disabled` sem mutação; `disabled` via atributo isolado não é cenário separado.

### Linha 040

**Código:** `      element.disabled !== true &&`

**Unidade:** U03 — habilitação de controles.

**O que faz:** A operação literal `element.disabled !== true &&` implementa uma etapa de recusa controles disabled/aria-disabled sem mutá-los.

**Como se encaixa:** consulta propriedade disabled e atributos disabled/aria-disabled Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o código deve respeitar o estado do framework em vez de forçar botão de envio. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: pressupõe um Element com getAttribute; objeto arbitrário truthy pode lançar.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` verifica habilitado, `disabled` e `aria-disabled` sem mutação; `disabled` via atributo isolado não é cenário separado.

### Linha 041

**Código:** `      element.getAttribute('disabled') === null &&`

**Unidade:** U03 — habilitação de controles.

**O que faz:** A operação literal `element.getAttribute('disabled') === null &&` implementa uma etapa de recusa controles disabled/aria-disabled sem mutá-los.

**Como se encaixa:** consulta propriedade disabled e atributos disabled/aria-disabled Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o código deve respeitar o estado do framework em vez de forçar botão de envio. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: pressupõe um Element com getAttribute; objeto arbitrário truthy pode lançar.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` verifica habilitado, `disabled` e `aria-disabled` sem mutação; `disabled` via atributo isolado não é cenário separado.

### Linha 042

**Código:** `      element.getAttribute('aria-disabled') !== 'true';`

**Unidade:** U03 — habilitação de controles.

**O que faz:** A operação literal `element.getAttribute('aria-disabled') !== 'true';` implementa uma etapa de recusa controles disabled/aria-disabled sem mutá-los.

**Como se encaixa:** consulta propriedade disabled e atributos disabled/aria-disabled Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o código deve respeitar o estado do framework em vez de forçar botão de envio. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: pressupõe um Element com getAttribute; objeto arbitrário truthy pode lançar.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` verifica habilitado, `disabled` e `aria-disabled` sem mutação; `disabled` via atributo isolado não é cenário separado.

### Linha 043

**Código:** `  }`

**Unidade:** U03 — habilitação de controles.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U03; não adiciona um novo side effect isolado.

**Como se encaixa:** consulta propriedade disabled e atributos disabled/aria-disabled Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o código deve respeitar o estado do framework em vez de forçar botão de envio. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: pressupõe um Element com getAttribute; objeto arbitrário truthy pode lançar.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` verifica habilitado, `disabled` e `aria-disabled` sem mutação; `disabled` via atributo isolado não é cenário separado.

### Linha 044

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 045

**Código:** `  function findVisible(selector, root) {`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Declara o helper `findVisible`, ponto de entrada da unidade U04.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 046

**Código:** `    const base = root || (typeof document !== 'undefined' ? document : null);`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Cria o binding `base` com a expressão desta linha para sustentar encontra o primeiro match profundo que também passa pela política de visibilidade.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 047

**Código:** `    if (!base || !selector) return null;`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Aplica a guarda `if (!base || !selector) return null;`; o ramo impede que encontra o primeiro match profundo que também passa pela política de visibilidade prossiga com um estado incompatível.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 048

**Código:** ␠ [linha vazia]

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Separa visualmente blocos da unidade U04; não muda estado, retorno nem DOM.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 049

**Código:** `    const elements = findAllDeep(base, element => {`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Cria o binding `elements` com a expressão desta linha para sustentar encontra o primeiro match profundo que também passa pela política de visibilidade.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 050

**Código:** `      if (!element || element.nodeType !== 1 || typeof element.matches !== 'function') {`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Aplica a guarda `if (!element || element.nodeType !== 1 || typeof element.matches !== 'function')`; o ramo impede que encontra o primeiro match profundo que também passa pela política de visibilidade prossiga com um estado incompatível.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 051

**Código:** `        return false;`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Retorna `false`, materializando o contrato de encontra o primeiro match profundo que também passa pela política de visibilidade.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 052

**Código:** `      }`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U04; não adiciona um novo side effect isolado.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 053

**Código:** `      try {`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Abre uma tentativa protegida porque API DOM/browser desta unidade pode lançar em runtimes ou nós incomuns.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 054

**Código:** `        return element.matches(selector);`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Retorna `element.matches(selector)`, materializando o contrato de encontra o primeiro match profundo que também passa pela política de visibilidade.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 055

**Código:** `      } catch (_e) {`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Captura a exceção da operação DOM anterior; a unidade converte a falha em fallback/resultado conservador em vez de derrubar o job.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 056

**Código:** `        return false;`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Retorna `false`, materializando o contrato de encontra o primeiro match profundo que também passa pela política de visibilidade.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 057

**Código:** `      }`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U04; não adiciona um novo side effect isolado.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 058

**Código:** `    });`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U04; não adiciona um novo side effect isolado.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 059

**Código:** ␠ [linha vazia]

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Separa visualmente blocos da unidade U04; não muda estado, retorno nem DOM.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 060

**Código:** `    for (const element of elements) {`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Inicia a iteração `for (const element of elements) {` sobre os candidatos usados por encontra o primeiro match profundo que também passa pela política de visibilidade.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 061

**Código:** `      if (isElementVisible(element)) return element;`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Aplica a guarda `if (isElementVisible(element)) return element;`; o ramo impede que encontra o primeiro match profundo que também passa pela política de visibilidade prossiga com um estado incompatível.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 062

**Código:** `    }`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U04; não adiciona um novo side effect isolado.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 063

**Código:** `    return null;`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Retorna `null`, materializando o contrato de encontra o primeiro match profundo que também passa pela política de visibilidade.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 064

**Código:** `  }`

**Unidade:** U04 — busca do primeiro elemento visível.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U04; não adiciona um novo side effect isolado.

**Como se encaixa:** usa findAllDeep, protege selector inválido em element.matches e filtra em ordem de travessia Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini usa Shadow DOM e pode manter cópias ocultas de controles. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: a busca é O(N) e retorna o primeiro visível, não necessariamente o semanticamente mais novo.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `findVisibleStopButton` chama `findVisible` e o teste de Stop prova oculto→null/visível→elemento; selector inválido e múltiplos matches não são assertions focais.

### Linha 065

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 066

**Código:** `  function findAllDeep(root, matcher) {`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Declara o helper `findAllDeep`, ponto de entrada da unidade U05.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 067

**Código:** `    const list = [];`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Cria o binding `list` com a expressão desta linha para sustentar varre árvore leve e shadow roots abertos com matcher injetado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 068

**Código:** `    if (!root || typeof matcher !== 'function') return list;`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Aplica a guarda `if (!root || typeof matcher !== 'function') return list;`; o ramo impede que varre árvore leve e shadow roots abertos com matcher injetado prossiga com um estado incompatível.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 069

**Código:** ␠ [linha vazia]

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Separa visualmente blocos da unidade U05; não muda estado, retorno nem DOM.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 070

**Código:** `    function walk(node) {`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Declara o helper `walk`, ponto de entrada da unidade U05.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 071

**Código:** `      if (!node) return;`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Aplica a guarda `if (!node) return;`; o ramo impede que varre árvore leve e shadow roots abertos com matcher injetado prossiga com um estado incompatível.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 072

**Código:** `      if (node.nodeType === 1) {`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Aplica a guarda `if (node.nodeType === 1)`; o ramo impede que varre árvore leve e shadow roots abertos com matcher injetado prossiga com um estado incompatível.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 073

**Código:** `        try {`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Abre uma tentativa protegida porque API DOM/browser desta unidade pode lançar em runtimes ou nós incomuns.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 074

**Código:** `          if (matcher(node)) list.push(node);`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Aplica a guarda `if (matcher(node)) list.push(node);`; o ramo impede que varre árvore leve e shadow roots abertos com matcher injetado prossiga com um estado incompatível.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 075

**Código:** `        } catch (_e) {}`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Captura a exceção da operação DOM anterior; a unidade converte a falha em fallback/resultado conservador em vez de derrubar o job.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 076

**Código:** `        try {`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Abre uma tentativa protegida porque API DOM/browser desta unidade pode lançar em runtimes ou nós incomuns.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 077

**Código:** `          if (node.shadowRoot) walk(node.shadowRoot);`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Aplica a guarda `if (node.shadowRoot) walk(node.shadowRoot);`; o ramo impede que varre árvore leve e shadow roots abertos com matcher injetado prossiga com um estado incompatível.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 078

**Código:** `        } catch (_e) {}`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Captura a exceção da operação DOM anterior; a unidade converte a falha em fallback/resultado conservador em vez de derrubar o job.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 079

**Código:** `      }`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U05; não adiciona um novo side effect isolado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 080

**Código:** ␠ [linha vazia]

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Separa visualmente blocos da unidade U05; não muda estado, retorno nem DOM.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 081

**Código:** `      let child = node.firstChild;`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Cria o binding `child` com a expressão desta linha para sustentar varre árvore leve e shadow roots abertos com matcher injetado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 082

**Código:** `      while (child) {`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Continua a travessia enquanto `while (child)` for verdadeira, preservando o algoritmo da unidade U05.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 083

**Código:** `        walk(child);`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** A operação literal `walk(child);` implementa uma etapa de varre árvore leve e shadow roots abertos com matcher injetado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 084

**Código:** `        child = child.nextSibling;`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** A operação literal `child = child.nextSibling;` implementa uma etapa de varre árvore leve e shadow roots abertos com matcher injetado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 085

**Código:** `      }`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U05; não adiciona um novo side effect isolado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 086

**Código:** `    }`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U05; não adiciona um novo side effect isolado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 087

**Código:** ␠ [linha vazia]

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Separa visualmente blocos da unidade U05; não muda estado, retorno nem DOM.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 088

**Código:** `    walk(root);`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** A operação literal `walk(root);` implementa uma etapa de varre árvore leve e shadow roots abertos com matcher injetado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 089

**Código:** `    return list;`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Retorna `list`, materializando o contrato de varre árvore leve e shadow roots abertos com matcher injetado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 090

**Código:** `  }`

**Unidade:** U05 — travessia profunda do DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U05; não adiciona um novo side effect isolado.

**Como se encaixa:** faz DFS recursiva, visita Element, aplica matcher e desce firstChild/nextSibling + shadowRoot Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** controles e respostas do Gemini podem estar encapsulados em Web Components. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: deep scan repetido em árvores grandes custa CPU; shadow roots fechados permanecem inacessíveis.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` cria shadow root e exige que `findAllDeep` encontre exatamente o botão interno; erros do matcher não são testados.

### Linha 091

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 092

**Código:** `  function getEditableElement(root) {`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Declara o helper `getEditableElement`, ponto de entrada da unidade U06.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 093

**Código:** `    if (!root) return null;`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Aplica a guarda `if (!root) return null;`; o ramo impede que obtém o elemento de edição interno ou um fallback compatível prossiga com um estado incompatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 094

**Código:** `    const editable = root.querySelector`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Cria o binding `editable` com a expressão desta linha para sustentar obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 095

**Código:** `      ? root.querySelector('.ql-editor, [contenteditable="true"]')`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** A operação literal `? root.querySelector('.ql-editor, [contenteditable="true"]')` implementa uma etapa de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 096

**Código:** `      : null;`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** A operação literal `: null;` implementa uma etapa de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 097

**Código:** `    if (editable) return editable;`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Aplica a guarda `if (editable) return editable;`; o ramo impede que obtém o elemento de edição interno ou um fallback compatível prossiga com um estado incompatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 098

**Código:** ␠ [linha vazia]

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Separa visualmente blocos da unidade U06; não muda estado, retorno nem DOM.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 099

**Código:** `    if (`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Aplica a guarda `if (`; o ramo impede que obtém o elemento de edição interno ou um fallback compatível prossiga com um estado incompatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 100

**Código:** `      root.getAttribute &&`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** A operação literal `root.getAttribute &&` implementa uma etapa de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 101

**Código:** `      (`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** A operação literal `(` implementa uma etapa de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 102

**Código:** `        root.getAttribute('contenteditable') === 'true' ||`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** A operação literal `root.getAttribute('contenteditable') === 'true' ||` implementa uma etapa de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 103

**Código:** `        (typeof root.className === 'string' && root.className.includes('ql-editor'))`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** A operação literal `(typeof root.className === 'string' && root.className.includes('ql-editor'))` implementa uma etapa de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 104

**Código:** `      )`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U06; não adiciona um novo side effect isolado.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 105

**Código:** `    ) {`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** A operação literal `) {` implementa uma etapa de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 106

**Código:** `      return root;`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Retorna `root`, materializando o contrato de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 107

**Código:** `    }`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U06; não adiciona um novo side effect isolado.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 108

**Código:** ␠ [linha vazia]

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Separa visualmente blocos da unidade U06; não muda estado, retorno nem DOM.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste exige resolução do `.ql-editor[contenteditable]` tanto a partir do wrapper quanto do próprio editor.

### Linha 109

**Código:** `    return (root.querySelector && root.querySelector('p')) || root;`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Retorna `(root.querySelector && root.querySelector('p')) || root`, materializando o contrato de obtém o elemento de edição interno ou um fallback compatível.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback `querySelector('p') || root` não é exercitado pela suíte focal.

### Linha 110

**Código:** `  }`

**Unidade:** U06 — resolução do editor editável.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U06; não adiciona um novo side effect isolado.

**Como se encaixa:** procura ql-editor/contenteditable, aceita o próprio root e por fim p/root Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** versões do Gemini variam entre wrapper rich-textarea, Quill e conteúdo editável direto. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: o fallback final pode devolver um root que não é realmente editável; paragraph fallback não tem assertion focal.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback `querySelector('p') || root` não é exercitado pela suíte focal.

### Linha 111

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 112

**Código:** `  function getImageSource(img) {`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** Declara o helper `getImageSource`, ponto de entrada da unidade U07.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 113

**Código:** `    if (!img) return '';`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** Aplica a guarda `if (!img) return '';`; o ramo impede que normaliza src/currentSrc/data-src de uma imagem prossiga com um estado incompatível.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 114

**Código:** `    if (img.dataset && img.dataset.src && !img.src) img.src = img.dataset.src;`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** Aplica a guarda `if (img.dataset && img.dataset.src && !img.src) img.src = img.dataset.src;`; o ramo impede que normaliza src/currentSrc/data-src de uma imagem prossiga com um estado incompatível.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 115

**Código:** `    return img.currentSrc ||`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** Retorna `img.currentSrc ||`, materializando o contrato de normaliza src/currentSrc/data-src de uma imagem.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 116

**Código:** `      img.src ||`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** A operação literal `img.src ||` implementa uma etapa de normaliza src/currentSrc/data-src de uma imagem.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 117

**Código:** `      (img.dataset && img.dataset.src) ||`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** Trata `data-src` como fonte lazy; nesta linha a URL pode ser promovida para `img.src` ou lida como fallback.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 118

**Código:** `      (img.getAttribute && img.getAttribute('src')) ||`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** A operação literal `(img.getAttribute && img.getAttribute('src')) ||` implementa uma etapa de normaliza src/currentSrc/data-src de uma imagem.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 119

**Código:** `      '';`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** A operação literal `'';` implementa uma etapa de normaliza src/currentSrc/data-src de uma imagem.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 120

**Código:** `  }`

**Unidade:** U07 — origem efetiva de imagem.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U07; não adiciona um novo side effect isolado.

**Como se encaixa:** materializa dataset.src em img.src quando necessário e então aplica precedência de fontes Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** imagens lazy podem expor URL apenas em data-src e consumidores precisam de uma identidade estável. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: um getter com assignment em img.src tem side effect e pode iniciar carregamento/requisição.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o teste usa `dataset.src` e verifica a URL retornada; precedência `currentSrc`, `getAttribute(src)` e falhas não são isoladas.

### Linha 121

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 122

**Código:** `  function isIgnoredGeminiImageSource(src) {`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** Declara o helper `isIgnoredGeminiImageSource`, ponto de entrada da unidade U08.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há assertion focal para este termo específico da blacklist.

### Linha 123

**Código:** `    const lower = String(src || '').toLowerCase();`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** Cria o binding `lower` com a expressão desta linha para sustentar filtra avatares, branding e mídia claramente não-resultante.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o mesmo teste diferencia avatar de URL normal; nem todos os termos individuais da blacklist são parametrizados.

### Linha 124

**Código:** `    return !lower ||`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** Retorna `!lower ||`, materializando o contrato de filtra avatares, branding e mídia claramente não-resultante.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o mesmo teste diferencia avatar de URL normal; nem todos os termos individuais da blacklist são parametrizados.

### Linha 125

**Código:** `      lower.includes('avatar') ||`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** A operação literal `lower.includes('avatar') ||` implementa uma etapa de filtra avatares, branding e mídia claramente não-resultante.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste verifica URL contendo `avatar` como ignorada.

### Linha 126

**Código:** `      lower.includes('favicon') ||`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** A operação literal `lower.includes('favicon') ||` implementa uma etapa de filtra avatares, branding e mídia claramente não-resultante.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há assertion focal para este termo específico da blacklist.

### Linha 127

**Código:** `      lower.includes('emoji') ||`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** A operação literal `lower.includes('emoji') ||` implementa uma etapa de filtra avatares, branding e mídia claramente não-resultante.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há assertion focal para este termo específico da blacklist.

### Linha 128

**Código:** `      lower.includes('profile') ||`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** A operação literal `lower.includes('profile') ||` implementa uma etapa de filtra avatares, branding e mídia claramente não-resultante.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há assertion focal para este termo específico da blacklist.

### Linha 129

**Código:** `      lower.includes('googleusercontent.com/a/') ||`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** A operação literal `lower.includes('googleusercontent.com/a/') ||` implementa uma etapa de filtra avatares, branding e mídia claramente não-resultante.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não há assertion focal para este termo específico da blacklist.

### Linha 130

**Código:** `      lower.includes('gstatic.com/images/branding');`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** A operação literal `lower.includes('gstatic.com/images/branding');` implementa uma etapa de filtra avatares, branding e mídia claramente não-resultante.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o mesmo teste diferencia avatar de URL normal; nem todos os termos individuais da blacklist são parametrizados.

### Linha 131

**Código:** `  }`

**Unidade:** U08 — blacklist de fontes de imagem.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U08; não adiciona um novo side effect isolado.

**Como se encaixa:** normaliza para lowercase e aplica substrings conhecidas Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** result extraction não deve escolher avatar/favicon/emoji como tradução gerada. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: substring ampla pode rejeitar URL legítima que contenha termos como profile em caminho/query.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — o mesmo teste diferencia avatar de URL normal; nem todos os termos individuais da blacklist são parametrizados.

### Linha 132

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 133

**Código:** `  function closestComposed(element, selector) {`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Declara o helper `closestComposed`, ponto de entrada da unidade U09.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 134

**Código:** `    if (!element || !selector) return null;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Aplica a guarda `if (!element || !selector) return null;`; o ramo impede que localiza ancestral que corresponda a seletor atravessando host de shadow root prossiga com um estado incompatível.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 135

**Código:** ␠ [linha vazia]

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Separa visualmente blocos da unidade U09; não muda estado, retorno nem DOM.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 136

**Código:** `    let current = element;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Cria o binding `current` com a expressão desta linha para sustentar localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 137

**Código:** `    const visited = new Set();`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Cria o binding `visited` com a expressão desta linha para sustentar localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 138

**Código:** ␠ [linha vazia]

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Separa visualmente blocos da unidade U09; não muda estado, retorno nem DOM.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 139

**Código:** `    while (current && !visited.has(current)) {`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Continua a travessia enquanto `while (current && !visited.has(current))` for verdadeira, preservando o algoritmo da unidade U09.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 140

**Código:** `      visited.add(current);`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** A operação literal `visited.add(current);` implementa uma etapa de localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 141

**Código:** ␠ [linha vazia]

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Separa visualmente blocos da unidade U09; não muda estado, retorno nem DOM.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 142

**Código:** `      try {`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Abre uma tentativa protegida porque API DOM/browser desta unidade pode lançar em runtimes ou nós incomuns.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 143

**Código:** `        if (current.nodeType === 1 && current.matches?.(selector)) {`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Aplica a guarda `if (current.nodeType === 1 && current.matches?.(selector))`; o ramo impede que localiza ancestral que corresponda a seletor atravessando host de shadow root prossiga com um estado incompatível.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 144

**Código:** `          return current;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Retorna `current`, materializando o contrato de localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 145

**Código:** `        }`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U09; não adiciona um novo side effect isolado.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 146

**Código:** `      } catch (_e) {}`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Captura a exceção da operação DOM anterior; a unidade converte a falha em fallback/resultado conservador em vez de derrubar o job.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 147

**Código:** ␠ [linha vazia]

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Separa visualmente blocos da unidade U09; não muda estado, retorno nem DOM.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 148

**Código:** `      if (current.parentElement) {`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Aplica a guarda `if (current.parentElement)`; o ramo impede que localiza ancestral que corresponda a seletor atravessando host de shadow root prossiga com um estado incompatível.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 149

**Código:** `        current = current.parentElement;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** A operação literal `current = current.parentElement;` implementa uma etapa de localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 150

**Código:** `        continue;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** A operação literal `continue;` implementa uma etapa de localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 151

**Código:** `      }`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U09; não adiciona um novo side effect isolado.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 152

**Código:** ␠ [linha vazia]

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Separa visualmente blocos da unidade U09; não muda estado, retorno nem DOM.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 153

**Código:** `      let rootNode = null;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Cria o binding `rootNode` com a expressão desta linha para sustentar localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 154

**Código:** `      try {`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Abre uma tentativa protegida porque API DOM/browser desta unidade pode lançar em runtimes ou nós incomuns.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 155

**Código:** `        rootNode = current.getRootNode?.();`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Obtém a raiz composta atual para poder saltar de um ShadowRoot ao seu host.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 156

**Código:** `      } catch (_e) {}`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Captura a exceção da operação DOM anterior; a unidade converte a falha em fallback/resultado conservador em vez de derrubar o job.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 157

**Código:** ␠ [linha vazia]

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Separa visualmente blocos da unidade U09; não muda estado, retorno nem DOM.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 158

**Código:** `      if (rootNode && rootNode.host) {`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Aplica a guarda `if (rootNode && rootNode.host)`; o ramo impede que localiza ancestral que corresponda a seletor atravessando host de shadow root prossiga com um estado incompatível.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 159

**Código:** `        current = rootNode.host;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** A operação literal `current = rootNode.host;` implementa uma etapa de localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 160

**Código:** `        continue;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** A operação literal `continue;` implementa uma etapa de localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 161

**Código:** `      }`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U09; não adiciona um novo side effect isolado.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 162

**Código:** ␠ [linha vazia]

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Separa visualmente blocos da unidade U09; não muda estado, retorno nem DOM.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 163

**Código:** `      break;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** A operação literal `break;` implementa uma etapa de localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 164

**Código:** `    }`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U09; não adiciona um novo side effect isolado.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 165

**Código:** ␠ [linha vazia]

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Separa visualmente blocos da unidade U09; não muda estado, retorno nem DOM.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 166

**Código:** `    return null;`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Retorna `null`, materializando o contrato de localiza ancestral que corresponda a seletor atravessando host de shadow root.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 167

**Código:** `  }`

**Unidade:** U09 — ancestralidade através de Shadow DOM.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U09; não adiciona um novo side effect isolado.

**Como se encaixa:** sobe parentElement; quando acaba, usa getRootNode().host; Set impede ciclo acidental Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** ownership de model/user turn precisa sobreviver à encapsulação de componentes. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não atravessa assignedSlot explicitamente e não pode escapar de closed shadow roots.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `isModelResponseImage` e OBS-14/OBS-19 percorrem este helper real, inclusive host de Shadow DOM; ciclo/erro de `getRootNode` não são cenários focais.

### Linha 168

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 169

**Código:** `  function getStrictModelResponseContainer(element) {`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** Declara o helper `getStrictModelResponseContainer`, ponto de entrada da unidade U10.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 170

**Código:** `    if (!element) return null;`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** Aplica a guarda `if (!element) return null;`; o ramo impede que identifica o contêiner forte que concede autoria de resposta ao modelo prossiga com um estado incompatível.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 171

**Código:** `    const selector = SELECTORS.MODEL_RESPONSE_STRICT || [`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** Cria o binding `selector` com a expressão desta linha para sustentar identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 172

**Código:** `      'model-response',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'model-response',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 173

**Código:** `      '[data-test-id*="model-response"]',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'[data-test-id*="model-response"]',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 174

**Código:** `      '[data-testid*="model-response"]',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'[data-testid*="model-response"]',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 175

**Código:** `      '[data-message-author="model"]',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'[data-message-author="model"]',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 176

**Código:** `      'bard-model-response',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'bard-model-response',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 177

**Código:** `      'div[data-turn-role="model"]',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'div[data-turn-role="model"]',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 178

**Código:** `      'message-content.model',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'message-content.model',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 179

**Código:** `      '.model-response-container',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'.model-response-container',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 180

**Código:** `      '.model-response-text',`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `'.model-response-text',` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 181

**Código:** `    ].join(', ');`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** A operação literal `].join(', ');` implementa uma etapa de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 182

**Código:** ␠ [linha vazia]

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** Separa visualmente blocos da unidade U10; não muda estado, retorno nem DOM.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 183

**Código:** `    return closestComposed(element, selector);`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** Retorna `closestComposed(element, selector)`, materializando o contrato de identifica o contêiner forte que concede autoria de resposta ao modelo.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 184

**Código:** `  }`

**Unidade:** U10 — ownership estrito de resposta do modelo.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U10; não adiciona um novo side effect isolado.

**Como se encaixa:** prefere SELECTORS.MODEL_RESPONSE_STRICT e usa fallback conservador de wrappers conhecidos Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Observer e quarantine precisam distinguir resultado do modelo de upload/turno do usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: mudança de markup do Gemini pode criar falso negativo; seletor amplo demais criaria falso positivo mais perigoso.

**Evidência:** **✅ PROVADO DIRETAMENTE / 🟨 INTEGRAÇÃO** — `dom-modules` prova `<model-response>` como ownership; OBS-14 e OBS-19 exercitam ownership estrito através de Shadow DOM/wrapper aninhado.

### Linha 185

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 186

**Código:** `  function getModelResponseContainer(element) {`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Declara o helper `getModelResponseContainer`, ponto de entrada da unidade U11.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 187

**Código:** `    if (!element) return null;`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Aplica a guarda `if (!element) return null;`; o ramo impede que oferece resposta mais ampla após tentar ownership estrito prossiga com um estado incompatível.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 188

**Código:** `    const strict = getStrictModelResponseContainer(element);`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Cria o binding `strict` com a expressão desta linha para sustentar oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 189

**Código:** `    if (strict) return strict;`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Aplica a guarda `if (strict) return strict;`; o ramo impede que oferece resposta mais ampla após tentar ownership estrito prossiga com um estado incompatível.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 190

**Código:** ␠ [linha vazia]

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Separa visualmente blocos da unidade U11; não muda estado, retorno nem DOM.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 191

**Código:** `    const selector = SELECTORS.RESPONSE || [`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Cria o binding `selector` com a expressão desta linha para sustentar oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 192

**Código:** `      'model-response',`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** A operação literal `'model-response',` implementa uma etapa de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 193

**Código:** `      '[data-message-author="model"]',`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** A operação literal `'[data-message-author="model"]',` implementa uma etapa de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 194

**Código:** `      'div[data-turn-role="model"]',`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** A operação literal `'div[data-turn-role="model"]',` implementa uma etapa de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 195

**Código:** `      '.response-container',`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** A operação literal `'.response-container',` implementa uma etapa de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 196

**Código:** `      '.model-turn',`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** A operação literal `'.model-turn',` implementa uma etapa de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 197

**Código:** `      '.presented-turn-content',`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** A operação literal `'.presented-turn-content',` implementa uma etapa de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 198

**Código:** `      'message-content',`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** A operação literal `'message-content',` implementa uma etapa de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 199

**Código:** `    ].join(', ');`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** A operação literal `].join(', ');` implementa uma etapa de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 200

**Código:** ␠ [linha vazia]

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Separa visualmente blocos da unidade U11; não muda estado, retorno nem DOM.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 201

**Código:** `    return closestComposed(element, selector);`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Retorna `closestComposed(element, selector)`, materializando o contrato de oferece resposta mais ampla após tentar ownership estrito.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 202

**Código:** `  }`

**Unidade:** U11 — contêiner de resposta compatível.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U11; não adiciona um novo side effect isolado.

**Como se encaixa:** retorna strict quando disponível; senão usa SELECTORS.RESPONSE/fallback compatível Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** módulos auxiliares podem precisar localizar resposta sem conceder ownership de segurança. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: API atualmente sem consumidor direto; uso futuro para ownership seria incorreto porque RESPONSE é deliberadamente mais amplo.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — não foi localizado consumidor atual de `getModelResponseContainer`; o fallback amplo não recebe assertion.

### Linha 203

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 204

**Código:** `  function getUserTurnContainer(element) {`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** Declara o helper `getUserTurnContainer`, ponto de entrada da unidade U12.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 205

**Código:** `    if (!element) return null;`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** Aplica a guarda `if (!element) return null;`; o ramo impede que acha o ancestral que representa mensagem do usuário prossiga com um estado incompatível.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 206

**Código:** `    const selector = SELECTORS.USER_TURN || [`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** Cria o binding `selector` com a expressão desta linha para sustentar acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 207

**Código:** `      '[data-message-author="user"]',`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** A operação literal `'[data-message-author="user"]',` implementa uma etapa de acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 208

**Código:** `      'div[data-turn-role="user"]',`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** A operação literal `'div[data-turn-role="user"]',` implementa uma etapa de acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 209

**Código:** `      '[data-test-id*="user-message"]',`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** A operação literal `'[data-test-id*="user-message"]',` implementa uma etapa de acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 210

**Código:** `      '[data-testid*="user-message"]',`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** A operação literal `'[data-testid*="user-message"]',` implementa uma etapa de acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 211

**Código:** `      '.user-query-container',`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** A operação literal `'.user-query-container',` implementa uma etapa de acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 212

**Código:** `      '.user-message',`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** A operação literal `'.user-message',` implementa uma etapa de acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 213

**Código:** `    ].join(', ');`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** A operação literal `].join(', ');` implementa uma etapa de acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 214

**Código:** `    return closestComposed(element, selector);`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** Retorna `closestComposed(element, selector)`, materializando o contrato de acha o ancestral que representa mensagem do usuário.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 215

**Código:** `  }`

**Unidade:** U12 — ownership de turno do usuário.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U12; não adiciona um novo side effect isolado.

**Como se encaixa:** usa SELECTORS.USER_TURN ou fallback semântico e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** quarantine/observer devem bloquear clones da entrada e mídia pertencente ao usuário. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: classes/atributos genéricos podem envolver também model turns; observer adiciona regra explícita para resolver esse caso.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 e OBS-15 executam `getUserTurnContainer` real e exigem classificação/rejeição de turno do usuário; variantes de seletor não são todas isoladas.

### Linha 216

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 217

**Código:** `  function isInsideInputArea(element) {`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Declara o helper `isInsideInputArea`, ponto de entrada da unidade U13.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 218

**Código:** `    if (!element) return false;`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Aplica a guarda `if (!element) return false;`; o ramo impede que classifica se um elemento pertence ao composer de entrada prossiga com um estado incompatível.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 219

**Código:** ␠ [linha vazia]

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Separa visualmente blocos da unidade U13; não muda estado, retorno nem DOM.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 220

**Código:** `    // Para ownership de resultado, "chat-window" é amplo demais: em versões`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Comentário de manutenção: Para ownership de resultado, "chat-window" é amplo demais: em versões. Registra uma restrição arquitetural sem executar código.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 221

**Código:** `    // atuais do Gemini ele pode englobar a conversa inteira, inclusive a`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Comentário de manutenção: atuais do Gemini ele pode englobar a conversa inteira, inclusive a. Registra uma restrição arquitetural sem executar código.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 222

**Código:** `    // resposta gerada. Aqui aceitamos somente wrappers reais do composer.`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Comentário de manutenção: resposta gerada. Aqui aceitamos somente wrappers reais do composer.. Registra uma restrição arquitetural sem executar código.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 223

**Código:** `    const selector = [`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Cria o binding `selector` com a expressão desta linha para sustentar classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 224

**Código:** `      'rich-textarea',`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** A operação literal `'rich-textarea',` implementa uma etapa de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 225

**Código:** `      '.input-area',`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** A operação literal `'.input-area',` implementa uma etapa de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 226

**Código:** `      '.chat-input-container',`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** A operação literal `'.chat-input-container',` implementa uma etapa de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 227

**Código:** `      '.chat-input',`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** A operação literal `'.chat-input',` implementa uma etapa de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 228

**Código:** `      'input-area',`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** A operação literal `'input-area',` implementa uma etapa de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 229

**Código:** `      '[contenteditable="true"][role="textbox"]',`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** A operação literal `'[contenteditable="true"][role="textbox"]',` implementa uma etapa de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 230

**Código:** `      '.ql-editor[contenteditable="true"]',`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** A operação literal `'.ql-editor[contenteditable="true"]',` implementa uma etapa de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 231

**Código:** `    ].join(', ');`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** A operação literal `].join(', ');` implementa uma etapa de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 232

**Código:** ␠ [linha vazia]

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Separa visualmente blocos da unidade U13; não muda estado, retorno nem DOM.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 233

**Código:** `    return Boolean(closestComposed(element, selector));`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Retorna `Boolean(closestComposed(element, selector))`, materializando o contrato de classifica se um elemento pertence ao composer de entrada.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 234

**Código:** `  }`

**Unidade:** U13 — detecção de área real do composer.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U13; não adiciona um novo side effect isolado.

**Como se encaixa:** usa lista local deliberadamente menor que SELECTORS.INPUT_AREA e closestComposed Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** chat-window é amplo e pode englobar a conversa inteira; aceitá-lo corromperia ownership de imagens de resultado. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: novos wrappers de composer não listados podem virar falso negativo até os seletores serem atualizados.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — QUA-05 exige `composer` para imagem em `<rich-textarea>` e OBS usa o helper na filtragem; wrappers alternativos não têm teste parametrizado.

### Linha 235

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 236

**Código:** `  function isModelResponseImage(img) {`

**Unidade:** U14 — predicado de imagem do modelo.

**O que faz:** Declara o helper `isModelResponseImage`, ponto de entrada da unidade U14.

**Como se encaixa:** delega a getStrictModelResponseContainer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** job-runner precisa de predicado simples sem duplicar seletor de autoria. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: herda falsos negativos do seletor estrito.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` chama `isModelResponseImage(img)` dentro de `<model-response>` e espera `true`.

### Linha 237

**Código:** `    return Boolean(getStrictModelResponseContainer(img));`

**Unidade:** U14 — predicado de imagem do modelo.

**O que faz:** Retorna `Boolean(getStrictModelResponseContainer(img))`, materializando o contrato de converte a existência de ownership estrito em booleano.

**Como se encaixa:** delega a getStrictModelResponseContainer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** job-runner precisa de predicado simples sem duplicar seletor de autoria. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: herda falsos negativos do seletor estrito.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` chama `isModelResponseImage(img)` dentro de `<model-response>` e espera `true`.

### Linha 238

**Código:** `  }`

**Unidade:** U14 — predicado de imagem do modelo.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U14; não adiciona um novo side effect isolado.

**Como se encaixa:** delega a getStrictModelResponseContainer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** job-runner precisa de predicado simples sem duplicar seletor de autoria. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: herda falsos negativos do seletor estrito.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `dom-modules.test.js` chama `isModelResponseImage(img)` dentro de `<model-response>` e espera `true`.

### Linha 239

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 240

**Código:** `  function isUserTurnImage(img) {`

**Unidade:** U15 — predicado de imagem do usuário.

**O que faz:** Declara o helper `isUserTurnImage`, ponto de entrada da unidade U15.

**Como se encaixa:** delega a getUserTurnContainer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** expõe API simétrica para consumidores potenciais. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não há consumidor/teste focal atual; pode sofrer drift sem ser percebido.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — a função exportada não tem consumidor/assertion focal localizada; consumidores usam `getUserTurnContainer` diretamente.

### Linha 241

**Código:** `    return Boolean(getUserTurnContainer(img));`

**Unidade:** U15 — predicado de imagem do usuário.

**O que faz:** Retorna `Boolean(getUserTurnContainer(img))`, materializando o contrato de converte ownership de user turn em booleano.

**Como se encaixa:** delega a getUserTurnContainer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** expõe API simétrica para consumidores potenciais. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não há consumidor/teste focal atual; pode sofrer drift sem ser percebido.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — a função exportada não tem consumidor/assertion focal localizada; consumidores usam `getUserTurnContainer` diretamente.

### Linha 242

**Código:** `  }`

**Unidade:** U15 — predicado de imagem do usuário.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U15; não adiciona um novo side effect isolado.

**Como se encaixa:** delega a getUserTurnContainer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** expõe API simétrica para consumidores potenciais. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não há consumidor/teste focal atual; pode sofrer drift sem ser percebido.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — a função exportada não tem consumidor/assertion focal localizada; consumidores usam `getUserTurnContainer` diretamente.

### Linha 243

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 244

**Código:** `  function findSendButton(root) {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Declara o helper `findSendButton`, ponto de entrada da unidade U16.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 245

**Código:** `    const base = root || (typeof document !== 'undefined' ? document.body : null);`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `base` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 246

**Código:** `    if (!base) return null;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (!base) return null;`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 247

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 248

**Código:** `    const allClickables = findAllDeep(base, element => {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `allClickables` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 249

**Código:** `      if (!element || element.nodeType !== 1) return false;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (!element || element.nodeType !== 1) return false;`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 250

**Código:** `      const tag = String(element.tagName || '').toLowerCase();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `tag` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 251

**Código:** `      const role = String(element.getAttribute('role') || '').toLowerCase();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `role` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 252

**Código:** `      return tag === 'button' || role === 'button' || tag.includes('button') || tag === 'mat-icon-button';`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Retorna `tag === 'button' || role === 'button' || tag.includes('button') || tag === 'mat-icon-button'`, materializando o contrato de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 253

**Código:** `    });`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 254

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 255

**Código:** `    const blacklist = [`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `blacklist` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 256

**Código:** `      'feedback', 'report', 'survey', 'bug', 'cancel', 'cancelar', 'close',`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `'feedback', 'report', 'survey', 'bug', 'cancel', 'cancelar', 'close',` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 257

**Código:** `      'fechar', 'dismiss', 'reject', 'mic', 'microfone', 'voice', 'audio',`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `'fechar', 'dismiss', 'reject', 'mic', 'microfone', 'voice', 'audio',` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 258

**Código:** `      'stop', 'help', 'ajuda', 'clear', 'limpar',`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `'stop', 'help', 'ajuda', 'clear', 'limpar',` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 259

**Código:** `    ];`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 260

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 261

**Código:** `    for (let index = allClickables.length - 1; index >= 0; index -= 1) {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Inicia a iteração `for (let index = allClickables.length - 1; index >= 0; index -= 1) {` sobre os candidatos usados por escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 262

**Código:** `      const btn = allClickables[index];`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `btn` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 263

**Código:** `      const label = String(btn.getAttribute('aria-label') || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `label` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 264

**Código:** `      const tooltip = String(btn.getAttribute('mattooltip') || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `tooltip` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 265

**Código:** `      const dataTooltip = String(btn.getAttribute('data-tooltip') || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `dataTooltip` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 266

**Código:** `      const title = String(btn.getAttribute('title') || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `title` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 267

**Código:** `      const testId = String(btn.getAttribute('data-test-id') || btn.getAttribute('data-testid') || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `testId` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 268

**Código:** `      const className = (typeof btn.className === 'string' ? btn.className : '').toLowerCase();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `className` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 269

**Código:** `      const text = String(btn.innerText || btn.textContent || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `text` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 270

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 271

**Código:** `      const combined = \`${label} ${tooltip} ${dataTooltip} ${title} ${testId} ${className}\`;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `combined` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 272

**Código:** `      if (blacklist.some(bad => combined.includes(bad))) continue;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (blacklist.some(bad => combined.includes(bad))) continue;`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 273

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 274

**Código:** `      const hasArrowIcon =`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `hasArrowIcon` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 275

**Código:** `        text.includes('arrow_upward') ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `text.includes('arrow_upward') ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 276

**Código:** `        text.includes('send') ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `text.includes('send') ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 277

**Código:** `        Boolean(btn.querySelector('mat-icon, svg, [data-icon-name*="send"], [data-icon-name*="arrow"]'));`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `Boolean(btn.querySelector('mat-icon, svg, [data-icon-name*="send"], [data-icon-name*="arrow"]'));` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 278

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 279

**Código:** `      const isExact =`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `isExact` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 280

**Código:** `        label === 'enviar' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `label === 'enviar' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 281

**Código:** `        label === 'enviar mensagem' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `label === 'enviar mensagem' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 282

**Código:** `        label === 'enviar prompt' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `label === 'enviar prompt' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 283

**Código:** `        label === 'enviar consulta' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `label === 'enviar consulta' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 284

**Código:** `        label === 'send' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `label === 'send' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 285

**Código:** `        label === 'send message' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `label === 'send message' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 286

**Código:** `        label === 'send prompt' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `label === 'send prompt' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 287

**Código:** `        tooltip === 'enviar' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `tooltip === 'enviar' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 288

**Código:** `        tooltip === 'enviar mensagem' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `tooltip === 'enviar mensagem' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 289

**Código:** `        tooltip === 'send' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `tooltip === 'send' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 290

**Código:** `        tooltip === 'send message' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `tooltip === 'send message' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 291

**Código:** `        dataTooltip === 'enviar' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `dataTooltip === 'enviar' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 292

**Código:** `        dataTooltip === 'send' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `dataTooltip === 'send' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 293

**Código:** `        testId === 'send-button' ||`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `testId === 'send-button' ||` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 294

**Código:** `        className.includes('send-button');`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `className.includes('send-button');` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 295

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 296

**Código:** `      if (isExact || (hasArrowIcon && (label.includes('enviar') || label.includes('send') || label === ''))) {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (isExact || (hasArrowIcon && (label.includes('enviar') || label.includes('send') || label === '')))`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 297

**Código:** `        return btn;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Retorna `btn`, materializando o contrato de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 298

**Código:** `      }`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 299

**Código:** `    }`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (NÚCLEO)** — o teste cria Stop, Send feedback e Send message e exige escolha do Send legítimo; variantes de label/icon/test-id não são todas isoladas.

### Linha 300

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 301

**Código:** `    for (let index = allClickables.length - 1; index >= 0; index -= 1) {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Inicia a iteração `for (let index = allClickables.length - 1; index >= 0; index -= 1) {` sobre os candidatos usados por escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 302

**Código:** `      const btn = allClickables[index];`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `btn` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 303

**Código:** `      const label = String(btn.getAttribute('aria-label') || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `label` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 304

**Código:** `      const tooltip = String(btn.getAttribute('mattooltip') || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `tooltip` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 305

**Código:** `      const className = (typeof btn.className === 'string' ? btn.className : '').toLowerCase();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `className` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 306

**Código:** `      const text = String(btn.innerText || btn.textContent || '').toLowerCase().trim();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `text` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 307

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 308

**Código:** `      const combined = \`${label} ${tooltip} ${className} ${text}\`;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `combined` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 309

**Código:** `      if (blacklist.some(bad => combined.includes(bad))) continue;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (blacklist.some(bad => combined.includes(bad))) continue;`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 310

**Código:** `      if (combined.includes('enviar') || combined.includes('send') || text.includes('arrow_upward')) {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (combined.includes('enviar') || combined.includes('send') || text.includes('arrow_upward'))`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 311

**Código:** `        return btn;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Retorna `btn`, materializando o contrato de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 312

**Código:** `      }`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 313

**Código:** `    }`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o segundo passe textual permissivo não é forçado por um cenário em que o primeiro passe falha.

### Linha 314

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 315

**Código:** `    const doc = base.ownerDocument || (typeof document !== 'undefined' ? document : null);`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `doc` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 316

**Código:** `    const inputArea = doc && doc.querySelector`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `inputArea` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 317

**Código:** `      ? doc.querySelector(SELECTORS.INPUT_AREA || 'rich-textarea, .input-area, chat-window, .chat-input-container')`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `? doc.querySelector(SELECTORS.INPUT_AREA || 'rich-textarea, .input-area, chat-window, .chat-input-container')` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 318

**Código:** `      : null;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `: null;` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 319

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 320

**Código:** `    if (inputArea) {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (inputArea)`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 321

**Código:** `      const cRect = inputArea.getBoundingClientRect();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `cRect` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 322

**Código:** `      for (let index = allClickables.length - 1; index >= 0; index -= 1) {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Inicia a iteração `for (let index = allClickables.length - 1; index >= 0; index -= 1) {` sobre os candidatos usados por escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 323

**Código:** `        const btn = allClickables[index];`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `btn` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 324

**Código:** `        const bRect = btn.getBoundingClientRect();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `bRect` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 325

**Código:** `        if (`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 326

**Código:** `          bRect.width >= 24 &&`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Captura coordenadas do composer/botão para o último fallback geométrico de seleção.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 327

**Código:** `          bRect.height >= 24 &&`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Captura coordenadas do composer/botão para o último fallback geométrico de seleção.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 328

**Código:** `          bRect.bottom <= cRect.bottom + 80 &&`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Captura coordenadas do composer/botão para o último fallback geométrico de seleção.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 329

**Código:** `          bRect.top >= cRect.top - 20 &&`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Captura coordenadas do composer/botão para o último fallback geométrico de seleção.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 330

**Código:** `          bRect.right <= cRect.right + 40 &&`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Captura coordenadas do composer/botão para o último fallback geométrico de seleção.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 331

**Código:** `          bRect.left >= cRect.right - 140`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Captura coordenadas do composer/botão para o último fallback geométrico de seleção.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 332

**Código:** `        ) {`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** A operação literal `) {` implementa uma etapa de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 333

**Código:** `          const label = String(btn.getAttribute('aria-label') || '').toLowerCase();`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Cria o binding `label` com a expressão desta linha para sustentar escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 334

**Código:** `          if (!blacklist.some(bad => label.includes(bad))) return btn;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Aplica a guarda `if (!blacklist.some(bad => label.includes(bad))) return btn;`; o ramo impede que escolhe um controle que provavelmente envia o prompt prossiga com um estado incompatível.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 335

**Código:** `        }`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 336

**Código:** `      }`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 337

**Código:** `    }`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o fallback geométrico por posição do composer não possui teste focal.

### Linha 338

**Código:** ␠ [linha vazia]

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Separa visualmente blocos da unidade U16; não muda estado, retorno nem DOM.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 339

**Código:** `    return null;`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Retorna `null`, materializando o contrato de escolhe um controle que provavelmente envia o prompt.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 340

**Código:** `  }`

**Unidade:** U16 — seleção heurística do botão Send.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U16; não adiciona um novo side effect isolado.

**Como se encaixa:** varre clickables em ordem reversa, aplica blacklist, tenta sinais semânticos fortes, fallback textual e por fim proximidade geométrica do composer Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** o Gemini muda labels/classes e precisa de redundância para automação resiliente. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: não filtra visibilidade no próprio helper; fallbacks textual/geométrico podem escolher controle incorreto quando o markup muda.

**Evidência:** **✅ PROVADO DIRETAMENTE (PARCIAL)** — `dom-modules.test.js` executa o helper e valida prioridade semântica/blacklist; visibilidade, disabled e todos os fallbacks permanecem parcialmente descobertos.

### Linha 341

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 342

**Código:** `  function findVisibleStopButton(root) {`

**Unidade:** U17 — busca de Stop visível.

**O que faz:** Declara o helper `findVisibleStopButton`, ponto de entrada da unidade U17.

**Como se encaixa:** combina SELECTORS.STOP com findVisible Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Stop visível é evidência de geração ativa e não pode ser confundido com cópia escondida. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: depende de selectors.js; tabela vazia faz retorno null silencioso.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de Stop cria cópia `display:none`, espera null, depois cria Stop visível e espera o elemento correto.

### Linha 343

**Código:** `    return findVisible(SELECTORS.STOP, root);`

**Unidade:** U17 — busca de Stop visível.

**O que faz:** Retorna `findVisible(SELECTORS.STOP, root)`, materializando o contrato de retorna somente um controle Stop que também esteja visível.

**Como se encaixa:** combina SELECTORS.STOP com findVisible Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Stop visível é evidência de geração ativa e não pode ser confundido com cópia escondida. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: depende de selectors.js; tabela vazia faz retorno null silencioso.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de Stop cria cópia `display:none`, espera null, depois cria Stop visível e espera o elemento correto.

### Linha 344

**Código:** `  }`

**Unidade:** U17 — busca de Stop visível.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U17; não adiciona um novo side effect isolado.

**Como se encaixa:** combina SELECTORS.STOP com findVisible Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** Stop visível é evidência de geração ativa e não pode ser confundido com cópia escondida. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: depende de selectors.js; tabela vazia faz retorno null silencioso.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de Stop cria cópia `display:none`, espera null, depois cria Stop visível e espera o elemento correto.

### Linha 345

**Código:** ␠ [linha vazia]

**Unidade:** U19 — newline terminal.

**O que faz:** Separa visualmente blocos da unidade U19; não muda estado, retorno nem DOM.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — nenhuma assertion focal foi associada a esta posição.

### Linha 346

**Código:** `  const api = {`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** Cria o binding `api` com a expressão desta linha para sustentar expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 347

**Código:** `    isElementVisible,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `isElementVisible,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 348

**Código:** `    isControlEnabled,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `isControlEnabled,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 349

**Código:** `    findVisible,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `findVisible,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 350

**Código:** `    findAllDeep,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `findAllDeep,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 351

**Código:** `    getEditableElement,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `getEditableElement,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 352

**Código:** `    getImageSource,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `getImageSource,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 353

**Código:** `    isIgnoredGeminiImageSource,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `isIgnoredGeminiImageSource,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 354

**Código:** `    closestComposed,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `closestComposed,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 355

**Código:** `    getStrictModelResponseContainer,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `getStrictModelResponseContainer,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 356

**Código:** `    getModelResponseContainer,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `getModelResponseContainer,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 357

**Código:** `    getUserTurnContainer,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `getUserTurnContainer,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 358

**Código:** `    isInsideInputArea,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `isInsideInputArea,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 359

**Código:** `    isModelResponseImage,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `isModelResponseImage,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 360

**Código:** `    isUserTurnImage,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `isUserTurnImage,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 361

**Código:** `    findVisibleStopButton,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `findVisibleStopButton,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 362

**Código:** `    findSendButton,`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `findSendButton,` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 363

**Código:** `  };`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U18; não adiciona um novo side effect isolado.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 364

**Código:** ␠ [linha vazia]

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** Separa visualmente blocos da unidade U18; não muda estado, retorno nem DOM.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 365

**Código:** `  scope.MangaTranslatorGeminiDom = api;`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** Publica a API no global do content script para observer/editor/job-runner e demais módulos carregados depois.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 366

**Código:** ␠ [linha vazia]

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** Separa visualmente blocos da unidade U18; não muda estado, retorno nem DOM.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 367

**Código:** `  if (typeof module !== 'undefined' && module.exports) {`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** Aplica a guarda `if (typeof module !== 'undefined' && module.exports)`; o ramo impede que expõe os helpers para outros módulos Gemini e para testes CommonJS prossiga com um estado incompatível.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 368

**Código:** `    module.exports = api;`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** Expõe a mesma API via CommonJS, permitindo que as suítes Jest executem este arquivo real.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 369

**Código:** `  }`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** Fecha a estrutura sintática em andamento da unidade U18; não adiciona um novo side effect isolado.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 370

**Código:** `})(typeof self !== 'undefined' ? self : globalThis);`

**Unidade:** U18 — API pública e exportação dual.

**O que faz:** A operação literal `})(typeof self !== 'undefined' ? self : globalThis);` implementa uma etapa de expõe os helpers para outros módulos Gemini e para testes CommonJS.

**Como se encaixa:** monta api, publica em MangaTranslatorGeminiDom e exporta module.exports quando presente Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** content scripts clássicos compartilham globals; Jest precisa de require. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: helpers exportados mas sem consumidores, como getModelResponseContainer/isUserTurnImage, podem acumular dívida técnica.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE / 🟦 WIRING** — as suítes importam o módulo real e o manifest/harness dependem da API global/CommonJS; nem cada propriedade exportada tem assertion própria.

### Linha 371

**Código:** ⏎ [newline final]

**Unidade:** U19 — newline terminal.

**O que faz:** É a posição vazia depois do newline terminal; não existe instrução JavaScript nesta posição.

**Como se encaixa:** a fonte termina em \n e split produz uma posição vazia adicional Nesta posição, a sintaxe/valor literal da linha participa desse mecanismo sem alterar o contrato para outro subsistema.

**Por que desta forma:** a auditoria do repositório exige rastreabilidade de todas as posições. Uma implementação mais ingênua aqui aumentaria o risco descrito para a unidade: nenhum risco de runtime; é apenas integridade editorial.

**Evidência:** **🟦 GATE ESTÁTICO ESPECÍFICO** — o gate compara SHA/fonte integral e conta a posição terminal.

## 13. Revisão final do Agente D

- Fonte integral incorporada a partir do blob `d3694ea70cdd97b64e483884895a458993791714`.
- 371/371 posições possuem cabeçalho `Linha NNN`.
- Consumers/dependências cruzados no branch `docs/project-bible`.
- Assertions diretas separadas de execução indireta e mocks.
- Lacunas de fallback/erro não foram promovidas a prova.
- Nenhuma alteração funcional foi feita em `extension/content/gemini/dom.js`.
- O arquivo deve permanecer **EM ANDAMENTO — REVISÃO DE QUALIDADE** até a atualização serializada de AUDITORIA/STATUS/CHECKLIST e a verificação final de SHA/ownership.

# Bíblia técnica — `extension/content/gemini/attachment.js`

> **Estado:** 🟠 MATERIALIZADA — aguardando fechamento coordenado/auditoria compartilhada  
> **SHA auditado:** `50092e4d7d71994f91236d271d3418507f10eade`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#C`  
> **Tipo:** JavaScript — content-script helper Gemini / RPA de attachment  
> **Linhas textuais:** **582**  
> **Posições documentais:** **583** contando newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`attachment.js` é o boundary de **upload observável de imagem** do pipeline Gemini. Ele não trata um evento `paste`, `drop` ou `change` como sucesso. O contrato é deliberadamente mais forte: um upload só recebe `confirmed:true` depois que surge, ou muda de identidade estrutural/mídia, uma evidência de attachment pertencente ao composer e essa evidência fica pronta.

No runtime MV3 o manifest injeta `selectors.js`, `dom.js`, quarantine/observer/editor e então este módulo antes de `job-runner.js` e `content_gemini.js`. `content_gemini.js` captura `globalThis.MangaTranslatorGeminiAttachment` e injeta essa API no job runner. O consumidor crítico chama `attachFile` antes do envio do prompt e aborta com `GEMINI_ATTACHMENT_NOT_CONFIRMED` quando a confirmação falha.

## 2. Dependências e consumidores

- **Dependência direta:** `extension/content/gemini/dom.js`.
  - `findAllDeep` permite varredura de DOM + Shadow DOM;
  - `getImageSource` normaliza source de imagens;
  - `isIgnoredGeminiImageSource` filtra avatar/favicon/emoji/branding.
- **Loader/browser:** `extension/manifest.json` injeta `content/gemini/attachment.js` antes de `job-runner.js` e `content_gemini.js`.
- **Composition root:** `extension/content/content_gemini.js` exige `MangaTranslatorGeminiAttachment` e a injeta como `attachmentApi`.
- **Consumidor principal:** `extension/content/gemini/job-runner.js`.
  - usa `findFileInputsDeep` e `listAttachmentEvidence` em snapshots diagnósticos;
  - chama `attachFile` com timeout de **20 s**, retry de **3,5 s** e máximo de **3 dispatches**;
  - impede `GEMINI_SUBMIT_ATTEMPT` quando `confirmed` é falso.
- **Testes diretos:** `tests/unit/content-gemini/attachment.test.js` importa este arquivo real via CommonJS.
- **Integração do consumidor:** `tests/unit/content-gemini/job-runner.test.js` usa mock de `attachmentApi`; prova o contrato do job runner, não a implementação interna deste arquivo.
- **Fluxo E2E:** `tests/e2e/translation-flow.spec.js` verifica o gate negativo de attachment e ausência de submit/prompt quando a confirmação não ocorre.

## 3. Lifecycle e estado

O módulo não persiste estado em `chrome.storage`. Todo estado é por tentativa e vive em closures: baseline, observer, timers, `observedEvidence`, Set de roots e Set de métodos. Essa escolha combina com o papel do content script: a durabilidade do job pertence ao background/job lifecycle; a confirmação visual precisa representar o DOM atual daquela aba.

A suspensão do service worker MV3 não apaga este estado porque ele reside no content script da aba Gemini, mas navegação/reload da aba destrói o contexto. O caller deve tratar isso como falha/retry de job, não como confirmação recuperável.

## 4. Contrato fail-closed

1. Dispatch é apenas tentativa.
2. Preview preexistente não confirma o job atual.
3. Mudança cosmética de classe/style/dimensão não basta.
4. Evidência em resposta/model turn não conta como attachment do composer.
5. Preview novo porém ainda carregando bloqueia redispatch, mas não confirma.
6. Confirmação exige mídia pronta e ausência de indicador de progresso.
7. Timeout resolve `confirmed:false`.
8. Nó de editor desconectado não recebe dispatch.
9. Após o primeiro sinal novo/alterado, outros mecanismos não são tentados para evitar duplicação.

## 5. Shadow DOM e mudanças da UI do Gemini

O arquivo evita depender de um único markup. Ele combina tags customizadas (`file-preview`, `attachment-card`), testids, classes, blob/data URLs, área de input e travessia por Shadow DOM. A robustez vem de redundância controlada + boundary de contexto, não de aceitar qualquer imagem da página.

O risco residual é inevitável: se o Gemini mudar completamente a semântica/markup do attachment, o detector pode deixar de reconhecer preview legítimo. O comportamento esperado nesse caso é falhar fechado e bloquear o prompt.

## 6. Assinatura e baseline anti-falso-positivo

`captureAttachmentBaseline` registra, por identidade de elemento, uma assinatura de:
- tipo;
- seletor descritivo;
- data-testid;
- quantidade de filhos;
- source da imagem.

Classe, style e dimensões são propositalmente excluídos porque podem variar por animação/layout tardio de um preview antigo. O teste ATT-09 comprova exatamente essa propriedade.

## 7. Confirmação concorrente e cleanup

`createAttachmentConfirmation` combina:
- `MutationObserver`;
- listeners `load`/`error`;
- polling a cada 500 ms;
- timeout total.

Todos convergem em `finish`, protegido por `settled`. O fechamento desconecta observer, cancela timers, remove listeners e resolve uma única Promise. Isso limita races e evita manter referências ao DOM depois do job.

## 8. Estratégia de dispatch

A API principal `attachFile` tenta nesta ordem:

1. `file_input`;
2. `drop`;
3. `paste`.

Antes de cada método, ela reinspeciona evidência. Se qualquer sinal novo/alterado já apareceu, mesmo incompleto, ela para de redisparar e apenas aguarda a confirmação. O teste ATT-10 prova este comportamento anti-duplicação.

O helper exportado `dispatchAttachmentAttempt` possui ordem própria paste → file_input → drop e retorna somente tentativa/métodos; ele não substitui o handshake de confirmação.

## 9. Segurança, privacidade e trust boundaries

- O arquivo manipula o `File` entregue pelo job runner, mas não persiste nem loga conteúdo/Base64.
- Não envia dados ao background diretamente.
- O boundary crítico é o DOM do Gemini: eventos sintéticos podem ser aceitos ou ignorados pelo site.
- Inputs pertencentes a turnos user/model são excluídos.
- Evidência de imagem fora do composer é rejeitada.
- O caller continua responsável por garantir que o job e a aba pertencem ao fluxo correto; este módulo não conhece `jobId`, `tabId` ou ownership de background.
- `dispatchMethodFn` é dependência injetável e, se fornecida, é um boundary de confiança: seu retorno só conta como **dispatch**, nunca como confirmação visual.

## 10. Evidência automatizada

| Cenário | Assertion observada | Classificação |
|---|---|---|
| ATT-01 — paste cria preview novo | `confirmed:true`, evidência container e `methodsAttempted` contém paste | ✅ PROVADO DIRETAMENTE |
| ATT-02 — eventos sem mudança DOM | `attempted:true`, `confirmed:false`, evidence null e paste/drop tentados | ✅ PROVADO DIRETAMENTE |
| ATT-03 — preview antigo | preview continua conectado, mas resultado permanece não confirmado | ✅ PROVADO DIRETAMENTE |
| ATT-04 — container antigo ganha mídia nova | confirma e devolve exatamente o container alterado | ✅ PROVADO DIRETAMENTE |
| ATT-05 — input[type=file] | confirma, registra `file_input` e input recebe 1 arquivo | ✅ PROVADO DIRETAMENTE |
| ATT-06 — drop | listener recebe `dataTransfer`; confirma e registra drop | ✅ PROVADO DIRETAMENTE |
| ATT-07 — não redisparar o mesmo método | contadores de paste/drop permanecem em 1 | ✅ PROVADO DIRETAMENTE |
| ATT-08 — input dentro de ShadowRoot | `findFileInputsDeep(document.body)` contém o input shadow | ✅ PROVADO DIRETAMENTE |
| ATT-09 — mudança cosmética vs mídia | classe não altera resultado; novo `src` passa a ser evidência | ✅ PROVADO DIRETAMENTE |
| ATT-09B — preview em Shadow DOM | confirma container + HTMLImageElement e blob esperado | ✅ PROVADO DIRETAMENTE |
| ATT-10 — preview pendente | só 1 tentativa; confirmação ocorre apenas depois de complete/dimensões/source válidos | ✅ PROVADO DIRETAMENTE |
| ATT-11 — imagem em model-response | `confirmed:false` e evidence null | ✅ PROVADO DIRETAMENTE |
| job-runner recebe `attachmentApi` | testes usam `jest.fn` para attachFile | 🟨 EXECUTADO POR CONTRATO/MOCK; NÃO PROVA ESTE MÓDULO |
| E2E bloqueia submit sem attachment | logs REJECTED/BLOCKED aparecem; ATTACHMENT_CONFIRMED e submit não aparecem | 🟨 EXECUTADO INDIRETAMENTE NO FLUXO |
| ordem no manifest | attachment.js aparece antes de job-runner/content_gemini | 🟦 GATE ESTÁTICO/ESTRUTURAL |

## 11. Lacunas de teste

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para falha de resolução de `domApi` e o throw `MangaTranslatorGeminiDom indisponível`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `getSearchRoot` com Document sem `body`, elemento comum e raiz custom.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para travessia `closestComposed` por múltiplos hosts Shadow DOM aninhados.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para cada variante de `accept` (`image/*`, `*/*`, lista por extensão) e exclusão de input disabled/model-turn.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para container menor que 20×20 ser descartado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para progressbar/`aria-busy`/spinner impedir `evidenceReady`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para fallback de `DataTransfer` quando o construtor nativo não existe ou lança.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para fallback de `ClipboardEvent`/`DragEvent` e falha de `Object.defineProperty`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para todos os ramos de `focusForAttachment`, inclusive `preventScroll`, fallback e evento de window.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `dispatchAttachmentAttempt({includeDrop:false})`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para caminho de `createAttachmentConfirmation` sem root/MutationObserver.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que prove remoção de todos os listeners/timers/observer após timeout, stop e sucesso.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para ShadowRoot criado **depois** da instalação do observer: roots existentes são adicionados, mas um shadow root fechado/tardio pode não ser observado diretamente.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `getEditor/getEditorRoot` retornarem nó desconectado e callback `onAttempt` receber `editor_disconnected`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `dispatchMethodFn` lançar e gerar `reason:'dispatch_failed'`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `maxDispatches=0/1/2` em combinação com métodos que retornam attempted false.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para o helper público `waitForAttachment` e para o helper agregado `dispatchAttachmentAttempt` como APIs isoladas.

### Testes recomendados

1. Criar casos unitários parametrizados de `findFileInputsDeep` cobrindo `accept`, disabled e contextos user/model.
2. Injetar implementações que fazem throw em DataTransfer/ClipboardEvent/DragEvent e comprovar os fallbacks.
3. Instrumentar MutationObserver/timers/listeners e afirmar cleanup em sucesso, timeout e `stop()`.
4. Simular re-render que desconecta editor entre métodos e afirmar `editor_disconnected` sem consumo de `maxDispatches`.
5. Simular progressbar ativo seguido de remoção para provar que sinal pendente bloqueia redispatch mas só confirma após prontidão.

## 12. Casos-limite e análise crítica

- **Root nulo / MutationObserver ausente:** falha imediatamente sem tentativa.
- **Preview antigo:** baseline impede confirmação.
- **Preview novo incompleto:** gera `signalObserved:true` e bloqueia duplicação, mas aguarda prontidão.
- **Imagem de resposta/model:** boundary de contexto rejeita.
- **Input file rejeita assignment:** exceção é absorvida; outro método pode ser tentado.
- **Editor re-renderizado:** getters permitem renovar os nós.
- **Timeout:** retorna falso e limpa recursos.
- **Shadow DOM tardio:** possível fragilidade; observer cobre shadow roots já encontrados. O polling profundo ainda pode localizar conteúdo acessível, reduzindo o risco, mas não elimina closed shadow roots.
- **Seletores heurísticos:** são deliberadamente amplos; o boundary de contexto e readiness compensam parte do risco de falso positivo.
- **`seen` é por identidade de container, não por imagem interna:** adequado para deduplicação, mas múltiplas imagens no mesmo container são representadas pela primeira imagem encontrada.
- **`dispatchAttachmentAttempt` não é usado pela API principal `attachFile`:** manter dois caminhos de dispatch aumenta superfície de drift; testes hoje concentram-se em `attachFile`.
- **Fallback de DataTransfer:** pode não satisfazer setter nativo de `input.files`; o comentário e catch reconhecem isso e não o tratam como sucesso.
- **MV3:** a lógica não depende da memória do service worker; o efeito é local à aba Gemini. Reinício/navegação da aba invalida o handshake e deve falhar/reiniciar em camada superior.

## 13. Invariantes

1. Nenhum dispatch isolado pode ser interpretado como confirmação.
2. O baseline precisa ser capturado antes do primeiro mecanismo de upload.
3. Evidência preexistente sem mudança estrutural/mídia nunca confirma o novo attachment.
4. Evidência de turno user/model nunca confirma attachment do composer.
5. `confirmed:true` exige `evidenceReady`.
6. Sinal novo porém pendente impede mecanismos adicionais para evitar duplicação.
7. Cada método da sequência principal é considerado no máximo uma vez por chamada.
8. `maxDispatches` conta somente dispatches realmente efetuados.
9. Editor/composer desconectado não consome dispatch.
10. Timeout/stop/sucesso passam pelo mesmo cleanup idempotente.
11. Observer/timers/listeners não devem sobreviver ao handshake encerrado.
12. O global `MangaTranslatorGeminiAttachment` e `module.exports` devem apontar para a mesma implementação.
13. O job runner deve continuar bloqueando o submit quando `confirmed` for falso.
14. Alterações futuras em seletores precisam preservar o boundary de contexto e a exclusão de imagens de resposta.
15. Nenhum payload de imagem deve ser persistido/logado por este módulo.

## 14. Fonte integral

~~~javascript
'use strict';
// gemini/attachment.js — Upload de imagem com confirmação observável.
//
// Regra central: disparar paste/change/drop significa apenas TENTATIVA.
// Attachment só é confirmado quando surge (ou muda) evidência visual/DOM
// posterior ao baseline capturado antes do upload.

(function(scope) {
  let domApi = scope.MangaTranslatorGeminiDom || null;
  if (!domApi && typeof require === 'function') {
    try { domApi = require('./dom.js'); } catch (_e) {}
  }
  if (!domApi) throw new Error('MangaTranslatorGeminiDom indisponível');

  function getSearchRoot(root) {
    return root && (root.body || root.documentElement || root);
  }

  function closestComposed(element, selector) {
    for (let current = element; current; current = current.parentElement || current.getRootNode?.().host) {
      if (current.matches?.(selector)) return current;
    }
    return null;
  }
  const COMPOSER = 'rich-textarea, .input-area, .chat-input-container, .chat-input, input-area, [contenteditable="true"][role="textbox"], .ql-editor[contenteditable="true"]';
  const USER_OR_MODEL = 'model-response, bard-model-response, [data-message-author], [data-turn-role], .user-query-container, .user-message, .model-response-container';
  const ATTACHMENT = 'file-preview, attachment-card, [data-test-id*="attachment"], [data-testid*="attachment"], [data-test-id*="preview"], [data-testid*="preview"], .file-preview, .attachment-preview, .image-preview, .attachment-container';
  function isAttachmentContext(element) {
    if (closestComposed(element, USER_OR_MODEL)) return false;
    return Boolean(closestComposed(element, COMPOSER) || closestComposed(element, ATTACHMENT));
  }
  function findFileInputsDeep(root) {
    return domApi.findAllDeep(root, element => {
      if (String(element.tagName || '').toUpperCase() !== 'INPUT' ||
          String(element.type || element.getAttribute?.('type') || '').toLowerCase() !== 'file' ||
          element.disabled || closestComposed(element, USER_OR_MODEL)) return false;
      const accept = String(element.accept || element.getAttribute?.('accept') || '').trim().toLowerCase();
      return !accept || accept.includes('image/') || accept.includes('*/*') ||
        /\.(?:png|jpe?g|webp|gif|bmp|avif)(?:\s*,|$)/.test(accept);
    }).sort((a, b) => Number(Boolean(closestComposed(b, COMPOSER))) - Number(Boolean(closestComposed(a, COMPOSER))));
  }
  function evidenceReady(evidence) {
    const img = evidence?.img;
    if (!img || !domApi.getImageSource(img) || img.complete === false ||
        Number(img.naturalWidth || 0) <= 0 || Number(img.naturalHeight || 0) <= 0) return false;
    const attachmentRoot = closestComposed(evidence.el, ATTACHMENT) || evidence.el;
    return !domApi.findAllDeep(attachmentRoot, element =>
      element.matches?.('[aria-busy="true"], [role="progressbar"], mat-progress-spinner')
    ).length;
  }

  function listAttachmentEvidence(root) {
    const searchRoot = getSearchRoot(root);
    if (!searchRoot) return [];

    const evidence = [];
    const seen = new Set();

    const containers = domApi.findAllDeep(searchRoot, element => {
      const tag = String(element.tagName || '').toLowerCase();
      const tid = String(
        element.getAttribute?.('data-test-id') ||
        element.getAttribute?.('data-testid') ||
        ''
      ).toLowerCase();
      const className = typeof element.className === 'string'
        ? element.className.toLowerCase()
        : '';

      return tag === 'file-preview' ||
        tag === 'attachment-card' ||
        tid.includes('attachment') ||
        tid.includes('preview') ||
        className.includes('file-preview') ||
        className.includes('attachment-preview') ||
        className.includes('image-preview') ||
        className.includes('attachment-container');
    });

    for (const container of containers) {
      if (!isAttachmentContext(container)) continue;
      let rect = null;
      try { rect = container.getBoundingClientRect(); } catch (_e) {}
      if (!rect || rect.width <= 20 || rect.height <= 20) continue;

      const img = domApi.findAllDeep(container, element => String(element.tagName || '').toUpperCase() === 'IMG')[0] || null;
      evidence.push({
        el: container,
        img,
        type: 'container',
        selector: String(container.tagName || '').toLowerCase(),
      });
      seen.add(container);
    }

    const images = domApi.findAllDeep(searchRoot, element =>
      String(element.tagName || '').toUpperCase() === 'IMG'
    );

    for (const img of images) {
      if (seen.has(img) || !isAttachmentContext(img)) continue;
      const src = domApi.getImageSource(img);

      if (src.startsWith('blob:') || (src.startsWith('data:image/') && src.length > 500)) {
        evidence.push({
          el: img,
          img,
          type: 'blob-img',
          selector: src.startsWith('blob:') ? 'img[src^="blob:"]' : 'img[src^="data:image/"]',
        });
        seen.add(img);
        continue;
      }

      const parentArea = img.closest
        ? img.closest('rich-textarea, .input-area, .chat-input, input-area')
        : null;

      if (parentArea && !domApi.isIgnoredGeminiImageSource(src)) {
        const width = Number(img.naturalWidth || img.width || 0);
        const height = Number(img.naturalHeight || img.height || 0);
        if (width > 20 && height > 20) {
          evidence.push({
            el: img,
            img,
            type: 'input-img',
            selector: 'input-area img',
          });
          seen.add(img);
        }
      }
    }

    return evidence;
  }

  function evidenceSignature(evidence) {
    if (!evidence || !evidence.el) return '';
    const element = evidence.el;
    const image = evidence.img || (
      element.querySelector ? element.querySelector('img') : null
    );

    const imageSource = image ? domApi.getImageSource(image) : '';
    const dataTestId = String(
      element.getAttribute?.('data-test-id') ||
      element.getAttribute?.('data-testid') ||
      ''
    );
    const childCount = Number(element.childElementCount || 0);

    // A assinatura ignora classe/style/dimensões: esses valores podem mudar
    // apenas por animação, layout tardio ou carregamento de uma preview antiga.
    // Confirmação exige mudança estrutural ou de identidade da mídia.
    return [
      evidence.type || '',
      evidence.selector || '',
      dataTestId,
      childCount,
      imageSource,
    ].join('|');
  }

  function captureAttachmentBaseline(root) {
    const signatures = new Map();
    for (const evidence of listAttachmentEvidence(root)) {
      signatures.set(evidence.el, evidenceSignature(evidence));
    }
    return { signatures };
  }

  function isEvidenceNewOrChanged(evidence, baseline) {
    if (!baseline || !(baseline.signatures instanceof Map)) return true;
    if (!baseline.signatures.has(evidence.el)) return true;
    return baseline.signatures.get(evidence.el) !== evidenceSignature(evidence);
  }

  function findAttachmentThumbnailDeep(root, baseline = null) {
    const evidence = listAttachmentEvidence(root);
    if (!baseline) return evidence[0] || null;
    return evidence.find(item => isEvidenceNewOrChanged(item, baseline)) || null;
  }

  function buildDataTransfer(file) {
    const DataTransferImpl = scope.DataTransfer;
    if (typeof DataTransferImpl === 'function') {
      try {
        const transfer = new DataTransferImpl();
        transfer.items.add(file);
        return transfer;
      } catch (_e) {}
    }

    // Fallback testável para runtimes sem DataTransfer. Ele continua útil para
    // eventos sintéticos; assignment em input.files pode rejeitá-lo e é tratado
    // como uma tentativa falha, nunca como sucesso.
    const files = [file];
    const items = [];
    items.add = item => {
      if (!files.includes(item)) files.push(item);
      return item;
    };
    return { files, items };
  }

  function createClipboardEvent(transfer) {
    if (typeof scope.ClipboardEvent === 'function') {
      try {
        return new scope.ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clipboardData: transfer,
        });
      } catch (_e) {}
    }

    const event = new scope.Event('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    try {
      Object.defineProperty(event, 'clipboardData', {
        value: transfer,
        configurable: true,
      });
    } catch (_e) {}
    return event;
  }

  function createDropEvent(transfer) {
    if (typeof scope.DragEvent === 'function') {
      try {
        return new scope.DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: transfer,
        });
      } catch (_e) {}
    }

    const event = new scope.Event('drop', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    try {
      Object.defineProperty(event, 'dataTransfer', {
        value: transfer,
        configurable: true,
      });
    } catch (_e) {}
    return event;
  }

  function focusForAttachment({ editor, editorRoot, windowRef = scope.window || scope }) {
    let attempted = false;

    for (const element of new Set([editor, editorRoot].filter(Boolean))) {
      try {
        element.focus?.({ preventScroll: true });
        attempted = true;
      } catch (_e) {
        try { element.focus?.(); attempted = true; } catch (_e2) {}
      }

      for (const type of ['focus', 'focusin']) {
        try {
          const FocusEventImpl = scope.FocusEvent || scope.Event;
          element.dispatchEvent(new FocusEventImpl(type, {
            bubbles: true,
            composed: true,
          }));
          attempted = true;
        } catch (_e) {}
      }
    }

    try {
      windowRef?.dispatchEvent?.(new scope.Event('focus'));
      attempted = true;
    } catch (_e) {}

    return attempted;
  }

  function dispatchPaste({ editor, editorRoot, root, transfer }) {
    let attempted = false;
    const targets = [editor || editorRoot];

    for (const target of targets) {
      if (!target || typeof target.dispatchEvent !== 'function') continue;
      try {
        target.dispatchEvent(createClipboardEvent(transfer));
        attempted = true;
      } catch (_e) {}
    }
    return attempted;
  }

  function assignFileInputs({ root, transfer }) {
    let attempted = false;
    const searchRoot = getSearchRoot(root);

    for (const input of findFileInputsDeep(searchRoot).slice(0, 1)) {
      try {
        input.files = transfer.files;
        input.dispatchEvent(new scope.Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new scope.Event('change', { bubbles: true, composed: true }));
        attempted = true;
      } catch (_e) {}
    }

    return attempted;
  }

  function dispatchDrop({ editorRoot, transfer }) {
    if (!editorRoot || typeof editorRoot.dispatchEvent !== 'function') return false;
    try {
      editorRoot.dispatchEvent(createDropEvent(transfer));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function dispatchAttachmentAttempt({
    editor,
    editorRoot,
    root,
    transfer,
    includeDrop = true,
  }) {
    const methods = [];
    let attempted = false;

    if (dispatchPaste({ editor, editorRoot, root, transfer })) {
      attempted = true;
      methods.push('paste');
    }
    if (assignFileInputs({ root, transfer })) {
      attempted = true;
      methods.push('file_input');
    }
    if (includeDrop && dispatchDrop({ editorRoot, transfer })) {
      attempted = true;
      methods.push('drop');
    }

    return { attempted, methods };
  }

  function createAttachmentConfirmation({
    root,
    baseline = captureAttachmentBaseline(root),
    timeoutMs = 15000,
    MutationObserverImpl = scope.MutationObserver,
    setTimeoutFn = scope.setTimeout?.bind(scope) || setTimeout,
    clearTimeoutFn = scope.clearTimeout?.bind(scope) || clearTimeout,
  } = {}) {
    if (!root || typeof MutationObserverImpl !== 'function') {
      const promise = Promise.resolve({ confirmed: false, evidence: null });
      return {
        promise,
        inspect: () => null,
        stop: () => false,
      };
    }

    let settled = false;
    let observer = null;
    let timer = null;
    let resolvePromise = null;
    let observedEvidence = null;
    let pollTimer = null;
    const eventRoots = new Set();

    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    const finish = result => {
      if (settled) return false;
      settled = true;
      if (observer) {
        try { observer.disconnect(); } catch (_e) {}
        observer = null;
      }
      if (timer !== null) {
        try { clearTimeoutFn(timer); } catch (_e) {}
        timer = null;
      }
      for (const target of eventRoots) {
        target.removeEventListener?.('load', inspect, true);
        target.removeEventListener?.('error', inspect, true);
      }
      eventRoots.clear();
      if (pollTimer !== null) clearTimeoutFn(pollTimer);
      resolvePromise({ ...result, signalObserved: Boolean(observedEvidence) });
      return true;
    };

    const inspect = () => {
      if (settled) return null;
      const candidates = listAttachmentEvidence(root).filter(item => isEvidenceNewOrChanged(item, baseline));
      const evidence = candidates.find(evidenceReady) || candidates[0];
      if (!evidence) return null;
      observedEvidence = evidence;
      if (evidenceReady(evidence)) finish({ confirmed: true, evidence });
      return evidence;
    };

    const observeRoot = getSearchRoot(root);
    observer = new MutationObserverImpl(inspect);
    observer.observe(observeRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'src',
        'data-src',
        'class',
        'style',
        'aria-hidden',
        'data-test-id',
        'data-testid',
      ],
    });

    for (const target of [observeRoot, ...domApi.findAllDeep(observeRoot, element => Boolean(element.shadowRoot)).map(element => element.shadowRoot)]) {
      if (target !== observeRoot) observer.observe(target, { childList: true, subtree: true, attributes: true });
      target.addEventListener?.('load', inspect, true);
      target.addEventListener?.('error', inspect, true);
      eventRoots.add(target);
    }

    timer = setTimeoutFn(
      () => finish({ confirmed: false, evidence: null }),
      timeoutMs
    );

    const poll = () => {
      if (settled) return;
      inspect();
      if (!settled) pollTimer = setTimeoutFn(poll, 500);
    };
    pollTimer = setTimeoutFn(poll, 500);

    // O baseline foi capturado antes; esta inspeção imediata só aceita algo
    // novo/alterado, nunca um thumbnail antigo.
    inspect();

    return {
      promise,
      inspect,
      hasSignal: () => Boolean(observedEvidence),
      stop() {
        return finish({ confirmed: false, evidence: null });
      },
    };
  }

  function waitForAttachment(options = {}) {
    return createAttachmentConfirmation(options).promise;
  }

  async function attachFile({
    file,
    editor,
    editorRoot = editor,
    getEditor = null,
    getEditorRoot = null,
    dispatchMethodFn = null,
    onAttempt = null,
    root = scope.document,
    timeoutMs = 15000,
    retryAfterMs = 2500,
    maxDispatches = 3,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    MutationObserverImpl = scope.MutationObserver,
    setTimeoutFn = scope.setTimeout?.bind(scope) || setTimeout,
    clearTimeoutFn = scope.clearTimeout?.bind(scope) || clearTimeout,
  } = {}) {
    if (!file || !editor || !root || typeof MutationObserverImpl !== 'function') {
      return {
        confirmed: false,
        attempted: false,
        evidence: null,
        methodsAttempted: [],
      };
    }

    const baseline = captureAttachmentBaseline(root);
    const confirmation = createAttachmentConfirmation({
      root,
      baseline,
      timeoutMs,
      MutationObserverImpl,
      setTimeoutFn,
      clearTimeoutFn,
    });

    focusForAttachment({ editor, editorRoot });

    const transfer = buildDataTransfer(file);
    const methodsAttempted = new Set();

    let attempted = false;
    const methods = [
      ['file_input', () => assignFileInputs({ root, transfer })],
      ['drop', () => dispatchDrop({ editorRoot, transfer })],
      ['paste', () => dispatchPaste({ editor, editorRoot, root, transfer })],
    ];
    let dispatchCount = 0;
    for (const [method, dispatch] of methods) {
      if (dispatchCount >= maxDispatches) break;
      confirmation.inspect();
      // Uma preview pendente é sinal de upload em andamento, não autorização
      // para repetir a imagem por outro mecanismo.
      if (confirmation.hasSignal()) break;
      const currentEditor = typeof getEditor === 'function' ? getEditor() : editor;
      const currentRoot = typeof getEditorRoot === 'function' ? getEditorRoot() : editorRoot;
      if (!currentEditor || !currentRoot || currentEditor.isConnected === false || currentRoot.isConnected === false) {
        onAttempt?.({ method, attempted: false, reason: 'editor_disconnected' });
        continue;
      }
      editor = currentEditor;
      editorRoot = currentRoot;
      focusForAttachment({ editor, editorRoot });
      let dispatched = false;
      let reason = null;
      try {
        const result = typeof dispatchMethodFn === 'function' ? await dispatchMethodFn(method) : dispatch();
        dispatched = typeof result === 'object' ? result?.attempted === true : result === true;
        reason = typeof result === 'object' ? result?.reason || null : null;
      } catch (_e) { reason = 'dispatch_failed'; }
      onAttempt?.({ method, attempted: dispatched, reason, world: dispatchMethodFn ? 'MAIN' : 'ISOLATED' });
      if (!dispatched) continue;
      attempted = true;
      dispatchCount += 1;
      methodsAttempted.add(method);
      confirmation.inspect();
      const early = await Promise.race([
        confirmation.promise.then(result => ({ kind: 'result', result })),
        sleep(retryAfterMs).then(() => ({ kind: 'next' })),
      ]);
      if (early.kind === 'result') {
        return { ...early.result, attempted, methodsAttempted: Array.from(methodsAttempted) };
      }
      confirmation.inspect();
      if (confirmation.hasSignal()) break;
    }

    const result = await confirmation.promise;
    return {
      ...result,
      attempted,
      methodsAttempted: Array.from(methodsAttempted),
    };
  }

  const api = {
    findFileInputsDeep,
    listAttachmentEvidence,
    captureAttachmentBaseline,
    findAttachmentThumbnailDeep,
    buildDataTransfer,
    focusForAttachment,
    dispatchPaste,
    assignFileInputs,
    dispatchDrop,
    dispatchAttachmentAttempt,
    createAttachmentConfirmation,
    waitForAttachment,
    attachFile,
  };

  scope.MangaTranslatorGeminiAttachment = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
~~~

## 15. Rastreabilidade 583/583

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa modo estrito para este script antes de qualquer declaração, reduzindo coerções/atribuições globais acidentais. |
| 002 | U01 | // gemini/attachment.js — Upload de imagem com confirmação observável. | Comentário de contrato/manutenção: gemini/attachment.js — Upload de imagem com confirmação observável.. |
| 003 | U01 | // | Comentário de contrato/manutenção: linha de comentário vazia usada para separar a explicação adjacente. |
| 004 | U01 | // Regra central: disparar paste/change/drop significa apenas TENTATIVA. | Comentário de contrato/manutenção: Regra central: disparar paste/change/drop significa apenas TENTATIVA.. |
| 005 | U01 | // Attachment só é confirmado quando surge (ou muda) evidência visual/DOM | Comentário de contrato/manutenção: Attachment só é confirmado quando surge (ou muda) evidência visual/DOM. |
| 006 | U01 | // posterior ao baseline capturado antes do upload. | Comentário de contrato/manutenção: posterior ao baseline capturado antes do upload.. |
| 007 | U01 | ␠ [linha vazia] | Separador visual dentro de U01; não altera estado, mas delimita o bloco "Modo estrito, IIFE e resolução da dependência DOM". |
| 008 | U01 | (function(scope) { | Abre a IIFE e injeta a superfície global (`self`/`globalThis`) usada tanto no content script quanto em testes. |
| 009 | U01 |   let domApi = scope.MangaTranslatorGeminiDom \|\| null; | Resolve primeiro `MangaTranslatorGeminiDom` já carregado pelo manifest, sem import ESM em content script clássico. |
| 010 | U01 |   if (!domApi && typeof require === 'function') { | Habilita fallback CommonJS somente quando `require` existe, mantendo compatibilidade com Jest sem afetar o browser. |
| 011 | U01 |     try { domApi = require('./dom.js'); } catch (_e) {} | Carrega `dom.js` real no ambiente CommonJS; o `catch` vazio permite que o fail-fast posterior produza erro único e estável. |
| 012 | U01 |   } | Fecha/continua a estrutura sintática de U01 sem alterar o contrato descrito para a unidade. |
| 013 | U01 |   if (!domApi) throw new Error('MangaTranslatorGeminiDom indisponível'); | Falha cedo antes de instalar a API se a dependência DOM profunda não pôde ser resolvida. |
| 014 | U01 | ␠ [linha vazia] | Separador visual dentro de U01; não altera estado, mas delimita o bloco "Modo estrito, IIFE e resolução da dependência DOM". |
| 015 | U02 |   function getSearchRoot(root) { | Declara normalizador de raiz usado por buscas e observação; aceita Document, Element ou raiz já normalizada. |
| 016 | U02 |     return root && (root.body \|\| root.documentElement \|\| root); | Prefere `body`, depois `documentElement`, e por fim a própria raiz para funcionar com Document e elementos/shadow roots. |
| 017 | U02 |   } | Fecha/continua a estrutura sintática de U02 sem alterar o contrato descrito para a unidade. |
| 018 | U02 | ␠ [linha vazia] | Separador visual dentro de U02; não altera estado, mas delimita o bloco "Raiz de busca e ancestralidade composta". |
| 019 | U02 |   function closestComposed(element, selector) { | Declara busca de ancestral que atravessa host de Shadow DOM, requisito para classificar contexto do composer. |
| 020 | U02 |     for (let current = element; current; current = current.parentElement \|\| current.getRootNode?.().host) { | Sobe por parentElement e, ao cruzar um ShadowRoot, continua pelo `host`; optional chaining evita quebra em nós incompletos. |
| 021 | U02 |       if (current.matches?.(selector)) return current; | Aceita o primeiro ancestral que corresponda ao seletor sem assumir que todo nó implementa `matches`. |
| 022 | U02 |     } | Fecha/continua a estrutura sintática de U02 sem alterar o contrato descrito para a unidade. |
| 023 | U02 |     return null; | Retorna deste ponto de U02 o valor `null;`, encerrando o ramo sem introduzir confirmação implícita. |
| 024 | U02 |   } | Fecha/continua a estrutura sintática de U02 sem alterar o contrato descrito para a unidade. |
| 025 | U03 |   const COMPOSER = 'rich-textarea, .input-area, .chat-input-container, .chat-input, input-area, [contenteditable="true"][role="textbox"], .ql-editor[contenteditable="true"]'; | Lista superfícies de composição conhecidas do Gemini/Quill usadas para priorizar controles pertencentes ao editor. |
| 026 | U03 |   const USER_OR_MODEL = 'model-response, bard-model-response, [data-message-author], [data-turn-role], .user-query-container, .user-message, .model-response-container'; | Lista containers de turnos user/model que devem ser excluídos da detecção de anexos do composer. |
| 027 | U03 |   const ATTACHMENT = 'file-preview, attachment-card, [data-test-id*="attachment"], [data-testid*="attachment"], [data-test-id*="preview"], [data-testid*="preview"], .file-preview, .attachment-preview, .image-preview, .attachment-container'; | Lista tags/classes/testids observados para previews de arquivo; é deliberadamente redundante para tolerar variações de UI. |
| 028 | U03 |   function isAttachmentContext(element) { | Declara boundary que impede evidência em mensagem histórica/model response de contar como attachment atual. |
| 029 | U03 |     if (closestComposed(element, USER_OR_MODEL)) return false; | Rejeita imediatamente qualquer elemento aninhado em turno user/model, fechando o principal falso positivo. |
| 030 | U03 |     return Boolean(closestComposed(element, COMPOSER) \|\| closestComposed(element, ATTACHMENT)); | Aceita somente elemento ligado ao composer ou a um container reconhecido de anexo. |
| 031 | U03 |   } | Fecha/continua a estrutura sintática de U03 sem alterar o contrato descrito para a unidade. |
| 032 | U03 |   function findFileInputsDeep(root) { | Declara descoberta profunda de file inputs candidatos ao upload. |
| 033 | U03 |     return domApi.findAllDeep(root, element => { | Retorna deste ponto de U03 o valor `domApi.findAllDeep(root, element => {`, encerrando o ramo sem introduzir confirmação implícita. |
| 034 | U03 |       if (String(element.tagName \|\| '').toUpperCase() !== 'INPUT' \|\| | Restringe candidato a `<input>` real, normalizando tagName para caixa alta. |
| 035 | U03 |           String(element.type \|\| element.getAttribute?.('type') \|\| '').toLowerCase() !== 'file' \|\| | Confirma tipo `file` por propriedade ou atributo para cobrir DOM real e mocks. |
| 036 | U03 |           element.disabled \|\| closestComposed(element, USER_OR_MODEL)) return false; | Rejeita imediatamente qualquer elemento aninhado em turno user/model, fechando o principal falso positivo. |
| 037 | U03 |       const accept = String(element.accept \|\| element.getAttribute?.('accept') \|\| '').trim().toLowerCase(); | Normaliza o atributo `accept` para decidir se o input pode receber a imagem da página. |
| 038 | U03 |       return !accept \|\| accept.includes('image/') \|\| accept.includes('*/*') \|\| | Aceita filtro explícito de MIME de imagem. |
| 039 | U03 |         /\.(?:png\|jpe?g\|webp\|gif\|bmp\|avif)(?:\s*,\|$)/.test(accept); | Aceita listas por extensão comuns de imagem quando o site não usa MIME no `accept`. |
| 040 | U03 |     }).sort((a, b) => Number(Boolean(closestComposed(b, COMPOSER))) - Number(Boolean(closestComposed(a, COMPOSER)))); | Ordena candidatos para que input relacionado ao composer venha antes de um input global secundário. |
| 041 | U03 |   } | Fecha/continua a estrutura sintática de U03 sem alterar o contrato descrito para a unidade. |
| 042 | U04 |   function evidenceReady(evidence) { | Declara o predicado que separa 'sinal observado' de 'attachment realmente pronto'. |
| 043 | U04 |     const img = evidence?.img; | Extrai imagem associada de forma nula-segura; sem `<img>` a evidência ainda não confirma. |
| 044 | U04 |     if (!img \|\| !domApi.getImageSource(img) \|\| img.complete === false \|\| | Recusa imagem cuja carga ainda está explicitamente incompleta. |
| 045 | U04 |         Number(img.naturalWidth \|\| 0) <= 0 \|\| Number(img.naturalHeight \|\| 0) <= 0) return false; | Exige dimensões naturais positivas para evitar confirmar placeholder/imagem ainda não decodificada. |
| 046 | U04 |     const attachmentRoot = closestComposed(evidence.el, ATTACHMENT) \|\| evidence.el; | Escolhe o container de attachment mais próximo para procurar indicadores locais de carregamento. |
| 047 | U04 |     return !domApi.findAllDeep(attachmentRoot, element => | Retorna deste ponto de U04 o valor `!domApi.findAllDeep(attachmentRoot, element =>`, encerrando o ramo sem introduzir confirmação implícita. |
| 048 | U04 |       element.matches?.('[aria-busy="true"], [role="progressbar"], mat-progress-spinner') | Recusa confirmação enquanto houver busy/progress/spinner no attachment, preservando ordem upload→submit. |
| 049 | U04 |     ).length; | Parte sintática/operacional de U04 — "Prontidão da evidência visual": `).length;`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 050 | U04 |   } | Fecha/continua a estrutura sintática de U04 sem alterar o contrato descrito para a unidade. |
| 051 | U04 | ␠ [linha vazia] | Separador visual dentro de U04; não altera estado, mas delimita o bloco "Prontidão da evidência visual". |
| 052 | U05 |   function listAttachmentEvidence(root) { | Declara coletor central de evidências usado por baseline, inspect e diagnóstico. |
| 053 | U05 |     const searchRoot = getSearchRoot(root); | Normaliza a raiz antes de varrer DOM e shadow roots. |
| 054 | U05 |     if (!searchRoot) return []; | Retorna coleção vazia, não exceção, quando a raiz inexiste; callers podem permanecer fail-closed. |
| 055 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 056 | U05 |     const evidence = []; | Inicializa lista ordenada de sinais encontrados. |
| 057 | U05 |     const seen = new Set(); | Mantém identidade de nós já contabilizados para não duplicar evidência como container e imagem. |
| 058 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 059 | U05 |     const containers = domApi.findAllDeep(searchRoot, element => { | Varre profundamente todos os elementos e aplica heurística de container de attachment. |
| 060 | U05 |       const tag = String(element.tagName \|\| '').toLowerCase(); | Normaliza tagName do candidato para comparação case-insensitive. |
| 061 | U05 |       const tid = String( | Normaliza `data-test-id`/`data-testid`, cobrindo variantes do atributo usadas pela UI. |
| 062 | U05 |         element.getAttribute?.('data-test-id') \|\| | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 063 | U05 |         element.getAttribute?.('data-testid') \|\| | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 064 | U05 |         '' | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `''`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 065 | U05 |       ).toLowerCase(); | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `).toLowerCase();`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 066 | U05 |       const className = typeof element.className === 'string' | Lê classes somente quando representadas como string, evitando pressupor SVG/DOMToken peculiar. |
| 067 | U05 |         ? element.className.toLowerCase() | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `? element.className.toLowerCase()`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 068 | U05 |         : ''; | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `: '';`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 069 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 070 | U05 |       return tag === 'file-preview' \|\| | Reconhece tags customizadas semanticamente fortes de preview/anexo. |
| 071 | U05 |         tag === 'attachment-card' \|\| | Reconhece tags customizadas semanticamente fortes de preview/anexo. |
| 072 | U05 |         tid.includes('attachment') \|\| | Reconhece testids de attachment/preview como sinal estrutural alternativo. |
| 073 | U05 |         tid.includes('preview') \|\| | Reconhece testids de attachment/preview como sinal estrutural alternativo. |
| 074 | U05 |         className.includes('file-preview') \|\| | Reconhece famílias de classe de preview/anexo quando tags/testids variam. |
| 075 | U05 |         className.includes('attachment-preview') \|\| | Reconhece famílias de classe de preview/anexo quando tags/testids variam. |
| 076 | U05 |         className.includes('image-preview') \|\| | Reconhece famílias de classe de preview/anexo quando tags/testids variam. |
| 077 | U05 |         className.includes('attachment-container'); | Reconhece famílias de classe de preview/anexo quando tags/testids variam. |
| 078 | U05 |     }); | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 079 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 080 | U05 |     for (const container of containers) { | Avalia cada container candidato antes de transformá-lo em evidência. |
| 081 | U05 |       if (!isAttachmentContext(container)) continue; | Descarta container fora do boundary do composer/attachment, inclusive respostas do modelo. |
| 082 | U05 |       let rect = null; | Declara estado local mutável de U05, limitado ao closure desta operação: `let rect = null;`. |
| 083 | U05 |       try { rect = container.getBoundingClientRect(); } catch (_e) {} | Mede visibilidade aproximada do container em bloco protegido porque mocks/nós podem lançar. |
| 084 | U05 |       if (!rect \|\| rect.width <= 20 \|\| rect.height <= 20) continue; | Descarta caixas minúsculas, reduzindo ícones/placeholders confundidos com preview. |
| 085 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 086 | U05 |       const img = domApi.findAllDeep(container, element => String(element.tagName \|\| '').toUpperCase() === 'IMG')[0] \|\| null; | Procura a primeira imagem inclusive dentro de Shadow DOM do próprio preview. |
| 087 | U05 |       evidence.push({ | Materializa evidência de container com nó, imagem associada, tipo e seletor para diagnóstico. |
| 088 | U05 |         el: container, | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `el: container,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 089 | U05 |         img, | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `img,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 090 | U05 |         type: 'container', | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `type: 'container',`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 091 | U05 |         selector: String(container.tagName \|\| '').toLowerCase(), | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `selector: String(container.tagName // '').toLowerCase(),`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 092 | U05 |       }); | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 093 | U05 |       seen.add(container); | Marca container já representado para deduplicação posterior. |
| 094 | U05 |     } | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 095 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 096 | U05 |     const images = domApi.findAllDeep(searchRoot, element => | Inicia segunda passagem por imagens para casos sem container reconhecido. |
| 097 | U05 |       String(element.tagName \|\| '').toUpperCase() === 'IMG' | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `String(element.tagName // '').toUpperCase() === 'IMG'`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 098 | U05 |     ); | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `);`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 099 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 100 | U05 |     for (const img of images) { | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `for (const img of images) {`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 101 | U05 |       if (seen.has(img) \|\| !isAttachmentContext(img)) continue; | Evita duplicação e aplica novamente o boundary de contexto ao candidato de imagem. |
| 102 | U05 |       const src = domApi.getImageSource(img); | `dom.js` normaliza currentSrc/src/data-src antes da classificação da imagem. |
| 103 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 104 | U05 |       if (src.startsWith('blob:') \|\| (src.startsWith('data:image/') && src.length > 500)) { | Trata blob URL e data:image suficientemente grande como fortes sinais de mídia local anexada. |
| 105 | U05 |         evidence.push({ | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `evidence.push({`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 106 | U05 |           el: img, | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `el: img,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 107 | U05 |           img, | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `img,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 108 | U05 |           type: 'blob-img', | Rotula evidência de imagem sem container como `blob-img` para telemetria/diagnóstico. |
| 109 | U05 |           selector: src.startsWith('blob:') ? 'img[src^="blob:"]' : 'img[src^="data:image/"]', | Trata blob URL e data:image suficientemente grande como fortes sinais de mídia local anexada. |
| 110 | U05 |         }); | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 111 | U05 |         seen.add(img); | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `seen.add(img);`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 112 | U05 |         continue; | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `continue;`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 113 | U05 |       } | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 114 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 115 | U05 |       const parentArea = img.closest | Procura ancestral de área de input para uma terceira heurística restrita ao composer. |
| 116 | U05 |         ? img.closest('rich-textarea, .input-area, .chat-input, input-area') | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `? img.closest('rich-textarea, .input-area, .chat-input, input-area')`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 117 | U05 |         : null; | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `: null;`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 118 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 119 | U05 |       if (parentArea && !domApi.isIgnoredGeminiImageSource(src)) { | Aceita imagem da área de input somente se `dom.js` não a classificar como avatar/branding/emoji. |
| 120 | U05 |         const width = Number(img.naturalWidth \|\| img.width \|\| 0); | Exige dimensões naturais positivas para evitar confirmar placeholder/imagem ainda não decodificada. |
| 121 | U05 |         const height = Number(img.naturalHeight \|\| img.height \|\| 0); | Exige dimensões naturais positivas para evitar confirmar placeholder/imagem ainda não decodificada. |
| 122 | U05 |         if (width > 20 && height > 20) { | Exige imagem maior que ícone para criar evidência `input-img`. |
| 123 | U05 |           evidence.push({ | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `evidence.push({`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 124 | U05 |             el: img, | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `el: img,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 125 | U05 |             img, | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `img,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 126 | U05 |             type: 'input-img', | Rotula imagem útil da área de input quando não há container estrutural melhor. |
| 127 | U05 |             selector: 'input-area img', | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `selector: 'input-area img',`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 128 | U05 |           }); | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 129 | U05 |           seen.add(img); | Parte sintática/operacional de U05 — "Coleta profunda de evidências de attachment": `seen.add(img);`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 130 | U05 |         } | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 131 | U05 |       } | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 132 | U05 |     } | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 133 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 134 | U05 |     return evidence; | Retorna a coleção de evidências na ordem containers primeiro, imagens fallback depois. |
| 135 | U05 |   } | Fecha/continua a estrutura sintática de U05 sem alterar o contrato descrito para a unidade. |
| 136 | U05 | ␠ [linha vazia] | Separador visual dentro de U05; não altera estado, mas delimita o bloco "Coleta profunda de evidências de attachment". |
| 137 | U06 |   function evidenceSignature(evidence) { | Declara assinatura estável usada para detectar mudança relevante desde o baseline. |
| 138 | U06 |     if (!evidence \|\| !evidence.el) return ''; | Representa evidência inválida por assinatura vazia sem lançar. |
| 139 | U06 |     const element = evidence.el; | Fixa o nó cuja identidade servirá como chave do baseline. |
| 140 | U06 |     const image = evidence.img \|\| ( | Declara dado local de U06 usado na sequência do contrato: `const image = evidence.img \|\| (`. |
| 141 | U06 |       element.querySelector ? element.querySelector('img') : null | Usa imagem já conhecida ou fallback DOM local quando o coletor não a forneceu. |
| 142 | U06 |     ); | Parte sintática/operacional de U06 — "Assinatura, baseline e detecção de mudança": `);`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 143 | U06 | ␠ [linha vazia] | Separador visual dentro de U06; não altera estado, mas delimita o bloco "Assinatura, baseline e detecção de mudança". |
| 144 | U06 |     const imageSource = image ? domApi.getImageSource(image) : ''; | Inclui identidade da mídia na assinatura, permitindo detectar preview reutilizado com nova imagem. |
| 145 | U06 |     const dataTestId = String( | Inclui testid estrutural normalizado na assinatura. |
| 146 | U06 |       element.getAttribute?.('data-test-id') \|\| | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 147 | U06 |       element.getAttribute?.('data-testid') \|\| | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 148 | U06 |       '' | Parte sintática/operacional de U06 — "Assinatura, baseline e detecção de mudança": `''`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 149 | U06 |     ); | Parte sintática/operacional de U06 — "Assinatura, baseline e detecção de mudança": `);`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 150 | U06 |     const childCount = Number(element.childElementCount \|\| 0); | Inclui quantidade de filhos como indício de mudança estrutural do mesmo container. |
| 151 | U06 | ␠ [linha vazia] | Separador visual dentro de U06; não altera estado, mas delimita o bloco "Assinatura, baseline e detecção de mudança". |
| 152 | U06 |     // A assinatura ignora classe/style/dimensões: esses valores podem mudar | Comentário de contrato/manutenção: A assinatura ignora classe/style/dimensões: esses valores podem mudar. |
| 153 | U06 |     // apenas por animação, layout tardio ou carregamento de uma preview antiga. | Comentário de contrato/manutenção: apenas por animação, layout tardio ou carregamento de uma preview antiga.. |
| 154 | U06 |     // Confirmação exige mudança estrutural ou de identidade da mídia. | Comentário de contrato/manutenção: Confirmação exige mudança estrutural ou de identidade da mídia.. |
| 155 | U06 |     return [ | Inicia vetor de componentes deliberadamente estáveis da assinatura. |
| 156 | U06 |       evidence.type \|\| '', | Inclui categoria de evidência na assinatura. |
| 157 | U06 |       evidence.selector \|\| '', | Inclui seletor descritivo na assinatura. |
| 158 | U06 |       dataTestId, | Inclui identificador de teste do container para detectar mudança de identidade estrutural. |
| 159 | U06 |       childCount, | Inclui mudança de filhos, permitindo reconhecer preview que ganhou mídia. |
| 160 | U06 |       imageSource, | Inclui URL/data source da imagem, principal identidade da mídia atual. |
| 161 | U06 |     ].join('\|'); | Serializa os componentes com delimitador estável para comparação simples no Map. |
| 162 | U06 |   } | Fecha/continua a estrutura sintática de U06 sem alterar o contrato descrito para a unidade. |
| 163 | U06 | ␠ [linha vazia] | Separador visual dentro de U06; não altera estado, mas delimita o bloco "Assinatura, baseline e detecção de mudança". |
| 164 | U06 |   function captureAttachmentBaseline(root) { | Declara snapshot pré-upload das assinaturas atuais. |
| 165 | U06 |     const signatures = new Map(); | Usa Map por identidade de elemento para distinguir nó novo de nó reutilizado. |
| 166 | U06 |     for (const evidence of listAttachmentEvidence(root)) { | Captura toda evidência visível antes do primeiro dispatch. |
| 167 | U06 |       signatures.set(evidence.el, evidenceSignature(evidence)); | Armazena a assinatura original daquele nó para comparação posterior. |
| 168 | U06 |     } | Fecha/continua a estrutura sintática de U06 sem alterar o contrato descrito para a unidade. |
| 169 | U06 |     return { signatures }; | Encapsula o Map em objeto extensível sem expor outro estado mutável. |
| 170 | U06 |   } | Fecha/continua a estrutura sintática de U06 sem alterar o contrato descrito para a unidade. |
| 171 | U06 | ␠ [linha vazia] | Separador visual dentro de U06; não altera estado, mas delimita o bloco "Assinatura, baseline e detecção de mudança". |
| 172 | U06 |   function isEvidenceNewOrChanged(evidence, baseline) { | Declara comparação entre evidência atual e baseline. |
| 173 | U06 |     if (!baseline \|\| !(baseline.signatures instanceof Map)) return true; | Sem baseline válido, trata evidência como nova; callers sem baseline usam comportamento permissivo explícito. |
| 174 | U06 |     if (!baseline.signatures.has(evidence.el)) return true; | Nó inexistente no snapshot é definitivamente novo. |
| 175 | U06 |     return baseline.signatures.get(evidence.el) !== evidenceSignature(evidence); | Nó antigo só conta quando sua assinatura estrutural/mídia realmente mudou. |
| 176 | U06 |   } | Fecha/continua a estrutura sintática de U06 sem alterar o contrato descrito para a unidade. |
| 177 | U06 | ␠ [linha vazia] | Separador visual dentro de U06; não altera estado, mas delimita o bloco "Assinatura, baseline e detecção de mudança". |
| 178 | U06 |   function findAttachmentThumbnailDeep(root, baseline = null) { | Declara consulta conveniente pela primeira evidência ou primeira evidência nova/alterada. |
| 179 | U06 |     const evidence = listAttachmentEvidence(root); | Declara dado local de U06 usado na sequência do contrato: `const evidence = listAttachmentEvidence(root);`. |
| 180 | U06 |     if (!baseline) return evidence[0] \|\| null; | Sem baseline retorna primeira evidência disponível; com baseline exige novidade. |
| 181 | U06 |     return evidence.find(item => isEvidenceNewOrChanged(item, baseline)) \|\| null; | Seleciona o primeiro sinal que passou pelo comparador anti-thumbnail-antigo. |
| 182 | U06 |   } | Fecha/continua a estrutura sintática de U06 sem alterar o contrato descrito para a unidade. |
| 183 | U06 | ␠ [linha vazia] | Separador visual dentro de U06; não altera estado, mas delimita o bloco "Assinatura, baseline e detecção de mudança". |
| 184 | U07 |   function buildDataTransfer(file) { | Declara criação do payload transferível do arquivo. |
| 185 | U07 |     const DataTransferImpl = scope.DataTransfer; | Obtém construtor do próprio scope para funcionar em janela real e harness injetado. |
| 186 | U07 |     if (typeof DataTransferImpl === 'function') { | Só tenta construção nativa quando o runtime fornece construtor chamável. |
| 187 | U07 |       try { | Boundary de exceção best-effort dentro de U07; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 188 | U07 |         const transfer = new DataTransferImpl(); | Cria DataTransfer nativo dentro de try porque algumas implementações expõem construtor não utilizável. |
| 189 | U07 |         transfer.items.add(file); | Insere o arquivo no DataTransfer nativo exatamente uma vez. |
| 190 | U07 |         return transfer; | Retorna payload nativo completo para paste/drop/input. |
| 191 | U07 |       } catch (_e) {} | Boundary de exceção best-effort dentro de U07; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 192 | U07 |     } | Fecha/continua a estrutura sintática de U07 sem alterar o contrato descrito para a unidade. |
| 193 | U07 | ␠ [linha vazia] | Separador visual dentro de U07; não altera estado, mas delimita o bloco "Construção de DataTransfer". |
| 194 | U07 |     // Fallback testável para runtimes sem DataTransfer. Ele continua útil para | Comentário de contrato/manutenção: Fallback testável para runtimes sem DataTransfer. Ele continua útil para. |
| 195 | U07 |     // eventos sintéticos; assignment em input.files pode rejeitá-lo e é tratado | Comentário de contrato/manutenção: eventos sintéticos; assignment em input.files pode rejeitá-lo e é tratado. |
| 196 | U07 |     // como uma tentativa falha, nunca como sucesso. | Comentário de contrato/manutenção: como uma tentativa falha, nunca como sucesso.. |
| 197 | U07 |     const files = [file]; | Fallback mantém coleção mínima contendo o arquivo original. |
| 198 | U07 |     const items = []; | Fallback cria coleção `items` separada para simular API de DataTransfer. |
| 199 | U07 |     items.add = item => { | Implementa `items.add` mínimo e idempotente por identidade para o ambiente sem DataTransfer. |
| 200 | U07 |       if (!files.includes(item)) files.push(item); | Evita inserir o mesmo objeto de arquivo duas vezes no fallback. |
| 201 | U07 |       return item; | Retorna deste ponto de U07 o valor `item;`, encerrando o ramo sem introduzir confirmação implícita. |
| 202 | U07 |     }; | Fecha/continua a estrutura sintática de U07 sem alterar o contrato descrito para a unidade. |
| 203 | U07 |     return { files, items }; | Expõe shape mínimo que os dispatchers deste módulo consomem. |
| 204 | U07 |   } | Fecha/continua a estrutura sintática de U07 sem alterar o contrato descrito para a unidade. |
| 205 | U07 | ␠ [linha vazia] | Separador visual dentro de U07; não altera estado, mas delimita o bloco "Construção de DataTransfer". |
| 206 | U08 |   function createClipboardEvent(transfer) { | Declara fábrica de evento paste com payload transferível. |
| 207 | U08 |     if (typeof scope.ClipboardEvent === 'function') { | Prefere ClipboardEvent nativo quando disponível. |
| 208 | U08 |       try { | Boundary de exceção best-effort dentro de U08; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 209 | U08 |         return new scope.ClipboardEvent('paste', { | Cria paste real, bubbling/cancelable/composed, anexando `clipboardData`. |
| 210 | U08 |           bubbles: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `bubbles: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 211 | U08 |           cancelable: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `cancelable: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 212 | U08 |           composed: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `composed: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 213 | U08 |           clipboardData: transfer, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `clipboardData: transfer,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 214 | U08 |         }); | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 215 | U08 |       } catch (_e) {} | Boundary de exceção best-effort dentro de U08; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 216 | U08 |     } | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 217 | U08 | ␠ [linha vazia] | Separador visual dentro de U08; não altera estado, mas delimita o bloco "Fábricas de eventos paste/drop". |
| 218 | U08 |     const event = new scope.Event('paste', { | Fallback cria Event genérico de paste quando ClipboardEvent não pode ser construído. |
| 219 | U08 |       bubbles: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `bubbles: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 220 | U08 |       cancelable: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `cancelable: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 221 | U08 |       composed: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `composed: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 222 | U08 |     }); | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 223 | U08 |     try { | Boundary de exceção best-effort dentro de U08; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 224 | U08 |       Object.defineProperty(event, 'clipboardData', { | Injeta `clipboardData` somente no fallback para preservar contrato dos handlers. |
| 225 | U08 |         value: transfer, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `value: transfer,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 226 | U08 |         configurable: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `configurable: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 227 | U08 |       }); | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 228 | U08 |     } catch (_e) {} | Boundary de exceção best-effort dentro de U08; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 229 | U08 |     return event; | Retorna deste ponto de U08 o valor `event;`, encerrando o ramo sem introduzir confirmação implícita. |
| 230 | U08 |   } | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 231 | U08 | ␠ [linha vazia] | Separador visual dentro de U08; não altera estado, mas delimita o bloco "Fábricas de eventos paste/drop". |
| 232 | U08 |   function createDropEvent(transfer) { | Declara fábrica equivalente para evento drop. |
| 233 | U08 |     if (typeof scope.DragEvent === 'function') { | Prefere DragEvent nativo quando disponível. |
| 234 | U08 |       try { | Boundary de exceção best-effort dentro de U08; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 235 | U08 |         return new scope.DragEvent('drop', { | Cria drop real com `dataTransfer` e propagação composed. |
| 236 | U08 |           bubbles: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `bubbles: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 237 | U08 |           cancelable: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `cancelable: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 238 | U08 |           composed: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `composed: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 239 | U08 |           dataTransfer: transfer, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `dataTransfer: transfer,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 240 | U08 |         }); | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 241 | U08 |       } catch (_e) {} | Boundary de exceção best-effort dentro de U08; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 242 | U08 |     } | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 243 | U08 | ␠ [linha vazia] | Separador visual dentro de U08; não altera estado, mas delimita o bloco "Fábricas de eventos paste/drop". |
| 244 | U08 |     const event = new scope.Event('drop', { | Fallback cria Event genérico de drop. |
| 245 | U08 |       bubbles: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `bubbles: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 246 | U08 |       cancelable: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `cancelable: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 247 | U08 |       composed: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `composed: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 248 | U08 |     }); | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 249 | U08 |     try { | Boundary de exceção best-effort dentro de U08; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 250 | U08 |       Object.defineProperty(event, 'dataTransfer', { | Injeta payload `dataTransfer` no fallback para handlers de drop. |
| 251 | U08 |         value: transfer, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `value: transfer,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 252 | U08 |         configurable: true, | Parte sintática/operacional de U08 — "Fábricas de eventos paste/drop": `configurable: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 253 | U08 |       }); | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 254 | U08 |     } catch (_e) {} | Boundary de exceção best-effort dentro de U08; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 255 | U08 |     return event; | Retorna deste ponto de U08 o valor `event;`, encerrando o ramo sem introduzir confirmação implícita. |
| 256 | U08 |   } | Fecha/continua a estrutura sintática de U08 sem alterar o contrato descrito para a unidade. |
| 257 | U08 | ␠ [linha vazia] | Separador visual dentro de U08; não altera estado, mas delimita o bloco "Fábricas de eventos paste/drop". |
| 258 | U09 |   function focusForAttachment({ editor, editorRoot, windowRef = scope.window \|\| scope }) { | Declara preparação de foco antes de qualquer tentativa de upload. |
| 259 | U09 |     let attempted = false; | Inicializa indicador de que ao menos uma operação de foco/evento foi tentada. |
| 260 | U09 | ␠ [linha vazia] | Separador visual dentro de U09; não altera estado, mas delimita o bloco "Foco defensivo antes do upload". |
| 261 | U09 |     for (const element of new Set([editor, editorRoot].filter(Boolean))) { | Deduplica editor e composer quando ambos referenciam o mesmo nó. |
| 262 | U09 |       try { | Boundary de exceção best-effort dentro de U09; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 263 | U09 |         element.focus?.({ preventScroll: true }); | Tenta foco sem deslocar a página, reduzindo interferência visual no RPA. |
| 264 | U09 |         attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 265 | U09 |       } catch (_e) { | Boundary de exceção best-effort dentro de U09; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 266 | U09 |         try { element.focus?.(); attempted = true; } catch (_e2) {} | Fallback para assinatura de focus simples quando `preventScroll` não é suportado. |
| 267 | U09 |       } | Fecha/continua a estrutura sintática de U09 sem alterar o contrato descrito para a unidade. |
| 268 | U09 | ␠ [linha vazia] | Separador visual dentro de U09; não altera estado, mas delimita o bloco "Foco defensivo antes do upload". |
| 269 | U09 |       for (const type of ['focus', 'focusin']) { | Emite ambos os sinais de foco usados por frameworks para atualizar estado interno. |
| 270 | U09 |         try { | Boundary de exceção best-effort dentro de U09; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 271 | U09 |           const FocusEventImpl = scope.FocusEvent \|\| scope.Event; | Usa FocusEvent quando existe, caso contrário Event, preservando execução em JSDOM. |
| 272 | U09 |           element.dispatchEvent(new FocusEventImpl(type, { | Parte sintática/operacional de U09 — "Foco defensivo antes do upload": `element.dispatchEvent(new FocusEventImpl(type, {`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 273 | U09 |             bubbles: true, | Parte sintática/operacional de U09 — "Foco defensivo antes do upload": `bubbles: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 274 | U09 |             composed: true, | Parte sintática/operacional de U09 — "Foco defensivo antes do upload": `composed: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 275 | U09 |           })); | Parte sintática/operacional de U09 — "Foco defensivo antes do upload": `}));`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 276 | U09 |           attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 277 | U09 |         } catch (_e) {} | Boundary de exceção best-effort dentro de U09; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 278 | U09 |       } | Fecha/continua a estrutura sintática de U09 sem alterar o contrato descrito para a unidade. |
| 279 | U09 |     } | Fecha/continua a estrutura sintática de U09 sem alterar o contrato descrito para a unidade. |
| 280 | U09 | ␠ [linha vazia] | Separador visual dentro de U09; não altera estado, mas delimita o bloco "Foco defensivo antes do upload". |
| 281 | U09 |     try { | Boundary de exceção best-effort dentro de U09; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 282 | U09 |       windowRef?.dispatchEvent?.(new scope.Event('focus')); | Também sinaliza foco na janela para fluxos que dependem do contexto ativo. |
| 283 | U09 |       attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 284 | U09 |     } catch (_e) {} | Boundary de exceção best-effort dentro de U09; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 285 | U09 | ␠ [linha vazia] | Separador visual dentro de U09; não altera estado, mas delimita o bloco "Foco defensivo antes do upload". |
| 286 | U09 |     return attempted; | Informa apenas se alguma ação de foco foi tentada; não declara que o browser concedeu foco real. |
| 287 | U09 |   } | Fecha/continua a estrutura sintática de U09 sem alterar o contrato descrito para a unidade. |
| 288 | U09 | ␠ [linha vazia] | Separador visual dentro de U09; não altera estado, mas delimita o bloco "Foco defensivo antes do upload". |
| 289 | U10 |   function dispatchPaste({ editor, editorRoot, root, transfer }) { | Declara tentativa de paste no editor atual. |
| 290 | U10 |     let attempted = false; | Inicializa indicador de que ao menos uma operação de foco/evento foi tentada. |
| 291 | U10 |     const targets = [editor \|\| editorRoot]; | Escolhe editor prioritariamente e usa composer apenas como fallback. |
| 292 | U10 | ␠ [linha vazia] | Separador visual dentro de U10; não altera estado, mas delimita o bloco "Dispatch isolado: paste, file input e drop". |
| 293 | U10 |     for (const target of targets) { | Parte sintática/operacional de U10 — "Dispatch isolado: paste, file input e drop": `for (const target of targets) {`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 294 | U10 |       if (!target \|\| typeof target.dispatchEvent !== 'function') continue; | Ignora alvo inválido/desconectado sem transformar erro de DOM em sucesso. |
| 295 | U10 |       try { | Boundary de exceção best-effort dentro de U10; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 296 | U10 |         target.dispatchEvent(createClipboardEvent(transfer)); | Despacha paste contendo o arquivo; retorno do listener não é usado como confirmação. |
| 297 | U10 |         attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 298 | U10 |       } catch (_e) {} | Boundary de exceção best-effort dentro de U10; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 299 | U10 |     } | Fecha/continua a estrutura sintática de U10 sem alterar o contrato descrito para a unidade. |
| 300 | U10 |     return attempted; | Retorna deste ponto de U10 o valor `attempted;`, encerrando o ramo sem introduzir confirmação implícita. |
| 301 | U10 |   } | Fecha/continua a estrutura sintática de U10 sem alterar o contrato descrito para a unidade. |
| 302 | U10 | ␠ [linha vazia] | Separador visual dentro de U10; não altera estado, mas delimita o bloco "Dispatch isolado: paste, file input e drop". |
| 303 | U10 |   function assignFileInputs({ root, transfer }) { | Declara tentativa via o melhor `input[type=file]` descoberto. |
| 304 | U10 |     let attempted = false; | Inicializa indicador de que ao menos uma operação de foco/evento foi tentada. |
| 305 | U10 |     const searchRoot = getSearchRoot(root); | Normaliza a raiz antes de varrer DOM e shadow roots. |
| 306 | U10 | ␠ [linha vazia] | Separador visual dentro de U10; não altera estado, mas delimita o bloco "Dispatch isolado: paste, file input e drop". |
| 307 | U10 |     for (const input of findFileInputsDeep(searchRoot).slice(0, 1)) { | Limita a um único input para reduzir risco de anexos duplicados em controles paralelos. |
| 308 | U10 |       try { | Boundary de exceção best-effort dentro de U10; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 309 | U10 |         input.files = transfer.files; | Tenta atribuir FileList/coleção do transfer; pode lançar em runtimes que exigem FileList nativo. |
| 310 | U10 |         input.dispatchEvent(new scope.Event('input', { bubbles: true, composed: true })); | Notifica frameworks sobre mudança do valor do input antes do change. |
| 311 | U10 |         input.dispatchEvent(new scope.Event('change', { bubbles: true, composed: true })); | Dispara change, evento tradicional observado pelo uploader do site. |
| 312 | U10 |         attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 313 | U10 |       } catch (_e) {} | Boundary de exceção best-effort dentro de U10; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 314 | U10 |     } | Fecha/continua a estrutura sintática de U10 sem alterar o contrato descrito para a unidade. |
| 315 | U10 | ␠ [linha vazia] | Separador visual dentro de U10; não altera estado, mas delimita o bloco "Dispatch isolado: paste, file input e drop". |
| 316 | U10 |     return attempted; | Retorna deste ponto de U10 o valor `attempted;`, encerrando o ramo sem introduzir confirmação implícita. |
| 317 | U10 |   } | Fecha/continua a estrutura sintática de U10 sem alterar o contrato descrito para a unidade. |
| 318 | U10 | ␠ [linha vazia] | Separador visual dentro de U10; não altera estado, mas delimita o bloco "Dispatch isolado: paste, file input e drop". |
| 319 | U10 |   function dispatchDrop({ editorRoot, transfer }) { | Declara tentativa de drop diretamente no composer. |
| 320 | U10 |     if (!editorRoot \|\| typeof editorRoot.dispatchEvent !== 'function') return false; | Recusa drop quando não há alvo despachável. |
| 321 | U10 |     try { | Boundary de exceção best-effort dentro de U10; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 322 | U10 |       editorRoot.dispatchEvent(createDropEvent(transfer)); | Despacha drop com DataTransfer no composer sem interpretar o retorno como confirmação. |
| 323 | U10 |       return true; | Retorna deste ponto de U10 o valor `true;`, encerrando o ramo sem introduzir confirmação implícita. |
| 324 | U10 |     } catch (_e) { | Boundary de exceção best-effort dentro de U10; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 325 | U10 |       return false; | Retorna deste ponto de U10 o valor `false;`, encerrando o ramo sem introduzir confirmação implícita. |
| 326 | U10 |     } | Fecha/continua a estrutura sintática de U10 sem alterar o contrato descrito para a unidade. |
| 327 | U10 |   } | Fecha/continua a estrutura sintática de U10 sem alterar o contrato descrito para a unidade. |
| 328 | U10 | ␠ [linha vazia] | Separador visual dentro de U10; não altera estado, mas delimita o bloco "Dispatch isolado: paste, file input e drop". |
| 329 | U11 |   function dispatchAttachmentAttempt({ | Declara helper que tenta os três mecanismos e registra quais foram realmente despachados. |
| 330 | U11 |     editor, | Recebe editor atual onde paste pode ser despachado. |
| 331 | U11 |     editorRoot, | Parte sintática/operacional de U11 — "Tentativa agregada exportada": `editorRoot,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 332 | U11 |     root, | Parte sintática/operacional de U11 — "Tentativa agregada exportada": `root,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 333 | U11 |     transfer, | Parte sintática/operacional de U11 — "Tentativa agregada exportada": `transfer,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 334 | U11 |     includeDrop = true, | Parte sintática/operacional de U11 — "Tentativa agregada exportada": `includeDrop = true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 335 | U11 |   }) { | Parte sintática/operacional de U11 — "Tentativa agregada exportada": `}) {`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 336 | U11 |     const methods = []; | Acumula nomes de mecanismos tentados para observabilidade. |
| 337 | U11 |     let attempted = false; | Inicializa indicador de que ao menos uma operação de foco/evento foi tentada. |
| 338 | U11 | ␠ [linha vazia] | Separador visual dentro de U11; não altera estado, mas delimita o bloco "Tentativa agregada exportada". |
| 339 | U11 |     if (dispatchPaste({ editor, editorRoot, root, transfer })) { | Registra `paste` somente quando o dispatch foi executado. |
| 340 | U11 |       attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 341 | U11 |       methods.push('paste'); | Adiciona marcador paste à telemetria da tentativa agregada. |
| 342 | U11 |     } | Fecha/continua a estrutura sintática de U11 sem alterar o contrato descrito para a unidade. |
| 343 | U11 |     if (assignFileInputs({ root, transfer })) { | Tenta input de arquivo independentemente de paste, sem chamar isso de confirmação. |
| 344 | U11 |       attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 345 | U11 |       methods.push('file_input'); | Registra uso do input de arquivo. |
| 346 | U11 |     } | Fecha/continua a estrutura sintática de U11 sem alterar o contrato descrito para a unidade. |
| 347 | U11 |     if (includeDrop && dispatchDrop({ editorRoot, transfer })) { | Permite desabilitar drop explicitamente e registra somente quando despachado. |
| 348 | U11 |       attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 349 | U11 |       methods.push('drop'); | Registra uso do mecanismo drop. |
| 350 | U11 |     } | Fecha/continua a estrutura sintática de U11 sem alterar o contrato descrito para a unidade. |
| 351 | U11 | ␠ [linha vazia] | Separador visual dentro de U11; não altera estado, mas delimita o bloco "Tentativa agregada exportada". |
| 352 | U11 |     return { attempted, methods }; | Retorna tentativa + lista de métodos; ausência de `confirmed` evita semântica enganosa. |
| 353 | U11 |   } | Fecha/continua a estrutura sintática de U11 sem alterar o contrato descrito para a unidade. |
| 354 | U11 | ␠ [linha vazia] | Separador visual dentro de U11; não altera estado, mas delimita o bloco "Tentativa agregada exportada". |
| 355 | U12 |   function createAttachmentConfirmation({ | Declara handshake observável, separado do dispatch que inicia o upload. |
| 356 | U12 |     root, | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `root,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 357 | U12 |     baseline = captureAttachmentBaseline(root), | Por padrão captura snapshot imediatamente na criação, antes de observar mudanças. |
| 358 | U12 |     timeoutMs = 15000, | Define timeout padrão de 15 s; o jobRunner usa 20 s explicitamente. |
| 359 | U12 |     MutationObserverImpl = scope.MutationObserver, | Permite injeção do observer em testes e usa implementação real no browser. |
| 360 | U12 |     setTimeoutFn = scope.setTimeout?.bind(scope) \|\| setTimeout, | Injeta scheduler de timeout mantendo binding correto do scope. |
| 361 | U12 |     clearTimeoutFn = scope.clearTimeout?.bind(scope) \|\| clearTimeout, | Injeta cancelador correspondente para cleanup determinístico. |
| 362 | U12 |   } = {}) { | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `} = {}) {`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 363 | U12 |     if (!root \|\| typeof MutationObserverImpl !== 'function') { | Sem raiz/observer não tenta fingir sucesso: devolve confirmação resolvida como falsa. |
| 364 | U12 |       const promise = Promise.resolve({ confirmed: false, evidence: null }); | Materializa resultado fail-closed imediato para ambiente sem capacidade de observação. |
| 365 | U12 |       return { | Retorna deste ponto de U12 o valor `{`, encerrando o ramo sem introduzir confirmação implícita. |
| 366 | U12 |         promise, | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `promise,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 367 | U12 |         inspect: () => null, | No modo incapaz, inspect nunca inventa evidência. |
| 368 | U12 |         stop: () => false, | No modo incapaz, stop sinaliza que não havia handshake ativo para finalizar. |
| 369 | U12 |       }; | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 370 | U12 |     } | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 371 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 372 | U12 |     let settled = false; | Guard idempotente impede dupla resolução por observer, timer, load ou stop concorrentes. |
| 373 | U12 |     let observer = null; | Mantém referência para desconectar MutationObserver no encerramento. |
| 374 | U12 |     let timer = null; | Mantém timeout principal para cancelamento. |
| 375 | U12 |     let resolvePromise = null; | Armazena resolver da Promise compartilhada pelo handshake. |
| 376 | U12 |     let observedEvidence = null; | Registra primeiro/último sinal novo mesmo ainda não pronto; isso bloqueia redispatch em attachFile. |
| 377 | U12 |     let pollTimer = null; | Mantém timer de polling periódico separado do timeout total. |
| 378 | U12 |     const eventRoots = new Set(); | Rastreia raízes onde listeners load/error foram instalados para removê-los depois. |
| 379 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 380 | U12 |     const promise = new Promise(resolve => { | Cria Promise única resolvida apenas por `finish`. |
| 381 | U12 |       resolvePromise = resolve; | Captura resolver no closure do handshake. |
| 382 | U12 |     }); | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 383 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 384 | U12 |     const finish = result => { | Centraliza transição terminal e todo cleanup, retornando false em segunda tentativa de encerramento. |
| 385 | U12 |       if (settled) return false; | Impede resolução/cleanup duplicado sob corrida entre timeout, observer e stop. |
| 386 | U12 |       settled = true; | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `settled = true;`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 387 | U12 |       if (observer) { | Guarda concreta de U12: `if (observer) {`; restringe a execução ao estado previsto pelo contrato da unidade. |
| 388 | U12 |         try { observer.disconnect(); } catch (_e) {} | Desconecta observação DOM assim que há resultado terminal. |
| 389 | U12 |         observer = null; | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `observer = null;`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 390 | U12 |       } | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 391 | U12 |       if (timer !== null) { | Guarda concreta de U12: `if (timer !== null) {`; restringe a execução ao estado previsto pelo contrato da unidade. |
| 392 | U12 |         try { clearTimeoutFn(timer); } catch (_e) {} | Cancela timeout total quando confirmação/stop acontece antes. |
| 393 | U12 |         timer = null; | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `timer = null;`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 394 | U12 |       } | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 395 | U12 |       for (const target of eventRoots) { | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `for (const target of eventRoots) {`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 396 | U12 |         target.removeEventListener?.('load', inspect, true); | Remove listeners de load registrados em cada raiz observada. |
| 397 | U12 |         target.removeEventListener?.('error', inspect, true); | Remove listeners de error correspondentes, evitando vazamento por job. |
| 398 | U12 |       } | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 399 | U12 |       eventRoots.clear(); | Libera referências às raízes após remover listeners. |
| 400 | U12 |       if (pollTimer !== null) clearTimeoutFn(pollTimer); | Cancela polling pendente no mesmo encerramento. |
| 401 | U12 |       resolvePromise({ ...result, signalObserved: Boolean(observedEvidence) }); | Resolve incluindo `signalObserved`, diferenciando 'nenhum sinal' de 'preview apareceu mas não ficou pronto'. |
| 402 | U12 |       return true; | Retorna deste ponto de U12 o valor `true;`, encerrando o ramo sem introduzir confirmação implícita. |
| 403 | U12 |     }; | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 404 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 405 | U12 |     const inspect = () => { | Declara inspeção síncrona reaproveitada por observer, listeners, polling e attachFile. |
| 406 | U12 |       if (settled) return null; | Após término, inspect não toca novamente no DOM nem altera resultado. |
| 407 | U12 |       const candidates = listAttachmentEvidence(root).filter(item => isEvidenceNewOrChanged(item, baseline)); | Recalcula evidências e mantém apenas nós novos ou estruturalmente alterados desde baseline. |
| 408 | U12 |       const evidence = candidates.find(evidenceReady) \|\| candidates[0]; | Prefere evidência pronta, mas retém sinal pendente para impedir redispatch duplicado. |
| 409 | U12 |       if (!evidence) return null; | Sem mudança relevante, permanece aguardando sem mudar estado. |
| 410 | U12 |       observedEvidence = evidence; | Memoriza sinal mesmo antes da prontidão; `hasSignal` usa este estado como anti-duplicação. |
| 411 | U12 |       if (evidenceReady(evidence)) finish({ confirmed: true, evidence }); | Somente evidência nova/alterada **e pronta** resolve `confirmed:true`. |
| 412 | U12 |       return evidence; | Retorna a coleção de evidências na ordem containers primeiro, imagens fallback depois. |
| 413 | U12 |     }; | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 414 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 415 | U12 |     const observeRoot = getSearchRoot(root); | Escolhe nó observável real a partir de Document/Element fornecido. |
| 416 | U12 |     observer = new MutationObserverImpl(inspect); | Liga todas as mutações relevantes ao mesmo verificador de estado. |
| 417 | U12 |     observer.observe(observeRoot, { | Observa inserção/remoção e atributos relevantes no subtree principal. |
| 418 | U12 |       childList: true, | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `childList: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 419 | U12 |       subtree: true, | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `subtree: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 420 | U12 |       attributes: true, | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `attributes: true,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 421 | U12 |       attributeFilter: [ | Restringe atributos observados a campos capazes de refletir mídia/visibilidade/identidade do preview. |
| 422 | U12 |         'src', | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 423 | U12 |         'data-src', | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 424 | U12 |         'class', | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `'class',`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 425 | U12 |         'style', | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `'style',`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 426 | U12 |         'aria-hidden', | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 427 | U12 |         'data-test-id', | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 428 | U12 |         'data-testid', | Inclui atributo relevante na whitelist do observer para detectar transição do preview. |
| 429 | U12 |       ], | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `],`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 430 | U12 |     }); | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 431 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 432 | U12 |     for (const target of [observeRoot, ...domApi.findAllDeep(observeRoot, element => Boolean(element.shadowRoot)).map(element => element.shadowRoot)]) { | Descobre shadow roots já existentes e também os observa explicitamente. |
| 433 | U12 |       if (target !== observeRoot) observer.observe(target, { childList: true, subtree: true, attributes: true }); | Adiciona observação em cada ShadowRoot encontrado, pois MutationObserver da árvore externa não atravessa essa fronteira. |
| 434 | U12 |       target.addEventListener?.('load', inspect, true); | Escuta load em captura para reavaliar imagem que ficou pronta sem mutação estrutural adicional. |
| 435 | U12 |       target.addEventListener?.('error', inspect, true); | Escuta error para reavaliar/terminar por timeout sem assumir que mídia quebrada confirmou. |
| 436 | U12 |       eventRoots.add(target); | Registra a raiz para cleanup posterior dos listeners. |
| 437 | U12 |     } | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 438 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 439 | U12 |     timer = setTimeoutFn( | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `timer = setTimeoutFn(`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 440 | U12 |       () => finish({ confirmed: false, evidence: null }), | Timeout encerra fail-closed com evidence nula, mesmo que dispatch tenha ocorrido. |
| 441 | U12 |       timeoutMs | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `timeoutMs`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 442 | U12 |     ); | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `);`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 443 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 444 | U12 |     const poll = () => { | Declara fallback de polling para mudanças não capturadas pelo observer/listeners. |
| 445 | U12 |       if (settled) return; | Guarda concreta de U12: `if (settled) return;`; restringe a execução ao estado previsto pelo contrato da unidade. |
| 446 | U12 |       inspect(); | Executa inspeção imediata; como baseline já existe, somente novidade/mudança pode ser aceita. |
| 447 | U12 |       if (!settled) pollTimer = setTimeoutFn(poll, 500); | Agenda inspeções a cada 500 ms enquanto não settled. |
| 448 | U12 |     }; | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 449 | U12 |     pollTimer = setTimeoutFn(poll, 500); | Agenda inspeções a cada 500 ms enquanto não settled. |
| 450 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 451 | U12 |     // O baseline foi capturado antes; esta inspeção imediata só aceita algo | Comentário de contrato/manutenção: O baseline foi capturado antes; esta inspeção imediata só aceita algo. |
| 452 | U12 |     // novo/alterado, nunca um thumbnail antigo. | Comentário de contrato/manutenção: novo/alterado, nunca um thumbnail antigo.. |
| 453 | U12 |     inspect(); | Executa inspeção imediata; como baseline já existe, somente novidade/mudança pode ser aceita. |
| 454 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 455 | U12 |     return { | Retorna deste ponto de U12 o valor `{`, encerrando o ramo sem introduzir confirmação implícita. |
| 456 | U12 |       promise, | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `promise,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 457 | U12 |       inspect, | Parte sintática/operacional de U12 — "Handshake observável de confirmação": `inspect,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 458 | U12 |       hasSignal: () => Boolean(observedEvidence), | Expõe presença de qualquer sinal novo para o orquestrador interromper novos dispatches antes da confirmação. |
| 459 | U12 |       stop() { | Expõe cancelamento explícito que passa pelo mesmo cleanup idempotente. |
| 460 | U12 |         return finish({ confirmed: false, evidence: null }); | Retorna deste ponto de U12 o valor `finish({ confirmed: false, evidence: null });`, encerrando o ramo sem introduzir confirmação implícita. |
| 461 | U12 |       }, | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 462 | U12 |     }; | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 463 | U12 |   } | Fecha/continua a estrutura sintática de U12 sem alterar o contrato descrito para a unidade. |
| 464 | U12 | ␠ [linha vazia] | Separador visual dentro de U12; não altera estado, mas delimita o bloco "Handshake observável de confirmação". |
| 465 | U13 |   function waitForAttachment(options = {}) { | Declara wrapper Promise-only do handshake. |
| 466 | U13 |     return createAttachmentConfirmation(options).promise; | Reutiliza exatamente o mesmo mecanismo de confirmação, sem segundo critério. |
| 467 | U13 |   } | Fecha/continua a estrutura sintática de U13 sem alterar o contrato descrito para a unidade. |
| 468 | U13 | ␠ [linha vazia] | Separador visual dentro de U13; não altera estado, mas delimita o bloco "Wrapper waitForAttachment". |
| 469 | U14 |   async function attachFile({ | Declara API principal de upload confirmável usada pelo jobRunner. |
| 470 | U14 |     file, | Recebe o `File` concreto criado a partir da página do mangá. |
| 471 | U14 |     editor, | Recebe editor atual onde paste pode ser despachado. |
| 472 | U14 |     editorRoot = editor, | Usa editor como raiz padrão quando o caller não fornece composer separado. |
| 473 | U14 |     getEditor = null, | Permite renovar editor entre tentativas após re-render do Gemini. |
| 474 | U14 |     getEditorRoot = null, | Permite renovar composer entre tentativas pelo mesmo motivo. |
| 475 | U14 |     dispatchMethodFn = null, | Permite um dispatcher externo/injetado por método; quando ausente usa dispatchers do isolated world. |
| 476 | U14 |     onAttempt = null, | Callback de observabilidade recebe cada método, sucesso de dispatch, motivo e world. |
| 477 | U14 |     root = scope.document, | Usa documento do content script como raiz padrão da evidência. |
| 478 | U14 |     timeoutMs = 15000, | Define timeout padrão de 15 s; o jobRunner usa 20 s explicitamente. |
| 479 | U14 |     retryAfterMs = 2500, | Define janela padrão de observação antes de tentar mecanismo seguinte. |
| 480 | U14 |     maxDispatches = 3, | Limita tentativas efetivamente despachadas ao máximo de três mecanismos. |
| 481 | U14 |     sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), | Permite injetar espera determinística nos testes e usar setTimeout em produção. |
| 482 | U14 |     MutationObserverImpl = scope.MutationObserver, | Permite injeção do observer em testes e usa implementação real no browser. |
| 483 | U14 |     setTimeoutFn = scope.setTimeout?.bind(scope) \|\| setTimeout, | Injeta scheduler de timeout mantendo binding correto do scope. |
| 484 | U14 |     clearTimeoutFn = scope.clearTimeout?.bind(scope) \|\| clearTimeout, | Injeta cancelador correspondente para cleanup determinístico. |
| 485 | U14 |   } = {}) { | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `} = {}) {`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 486 | U14 |     if (!file \|\| !editor \|\| !root \|\| typeof MutationObserverImpl !== 'function') { | Valida pré-condições e capacidade de observação; entrada inválida retorna falha sem side effects. |
| 487 | U14 |       return { | Retorna deste ponto de U14 o valor `{`, encerrando o ramo sem introduzir confirmação implícita. |
| 488 | U14 |         confirmed: false, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `confirmed: false,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 489 | U14 |         attempted: false, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `attempted: false,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 490 | U14 |         evidence: null, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `evidence: null,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 491 | U14 |         methodsAttempted: [], | Falha de pré-condição declara explicitamente que nenhum mecanismo foi tentado. |
| 492 | U14 |       }; | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 493 | U14 |     } | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 494 | U14 | ␠ [linha vazia] | Separador visual dentro de U14; não altera estado, mas delimita o bloco "Orquestração attachFile e anti-duplicação". |
| 495 | U14 |     const baseline = captureAttachmentBaseline(root); | Por padrão captura snapshot imediatamente na criação, antes de observar mudanças. |
| 496 | U14 |     const confirmation = createAttachmentConfirmation({ | Arma observer/timeout antes do primeiro dispatch para não perder preview muito rápido. |
| 497 | U14 |       root, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `root,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 498 | U14 |       baseline, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `baseline,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 499 | U14 |       timeoutMs, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `timeoutMs,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 500 | U14 |       MutationObserverImpl, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `MutationObserverImpl,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 501 | U14 |       setTimeoutFn, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `setTimeoutFn,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 502 | U14 |       clearTimeoutFn, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `clearTimeoutFn,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 503 | U14 |     }); | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 504 | U14 | ␠ [linha vazia] | Separador visual dentro de U14; não altera estado, mas delimita o bloco "Orquestração attachFile e anti-duplicação". |
| 505 | U14 |     focusForAttachment({ editor, editorRoot }); | Prepara foco inicial antes de construir/usar mecanismos de upload. |
| 506 | U14 | ␠ [linha vazia] | Separador visual dentro de U14; não altera estado, mas delimita o bloco "Orquestração attachFile e anti-duplicação". |
| 507 | U14 |     const transfer = buildDataTransfer(file); | Constrói payload único reutilizado pelos métodos deste attachment. |
| 508 | U14 |     const methodsAttempted = new Set(); | Deduplica nomes de métodos efetivamente usados na resposta final. |
| 509 | U14 | ␠ [linha vazia] | Separador visual dentro de U14; não altera estado, mas delimita o bloco "Orquestração attachFile e anti-duplicação". |
| 510 | U14 |     let attempted = false; | Inicializa indicador de que ao menos uma operação de foco/evento foi tentada. |
| 511 | U14 |     const methods = [ | Define ordem explícita `file_input`, depois `drop`, depois `paste` para esta API principal. |
| 512 | U14 |       ['file_input', () => assignFileInputs({ root, transfer })], | Primeiro tenta input nativo, geralmente caminho mais direto quando o controle existe. |
| 513 | U14 |       ['drop', () => dispatchDrop({ editorRoot, transfer })], | Segundo tenta drop no composer se o input não iniciou evidência. |
| 514 | U14 |       ['paste', () => dispatchPaste({ editor, editorRoot, root, transfer })], | Paste é último fallback da sequência principal. |
| 515 | U14 |     ]; | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 516 | U14 |     let dispatchCount = 0; | Conta somente dispatches que retornaram `attempted:true`, não métodos ignorados. |
| 517 | U14 |     for (const [method, dispatch] of methods) { | Itera mecanismos em ordem estável, no máximo uma vez por entrada do array. |
| 518 | U14 |       if (dispatchCount >= maxDispatches) break; | Respeita limite configurado antes de iniciar método adicional. |
| 519 | U14 |       confirmation.inspect(); | Reinspeciona DOM imediatamente antes/depois do dispatch para reduzir janela de corrida. |
| 520 | U14 |       // Uma preview pendente é sinal de upload em andamento, não autorização | Comentário de contrato/manutenção: Uma preview pendente é sinal de upload em andamento, não autorização. |
| 521 | U14 |       // para repetir a imagem por outro mecanismo. | Comentário de contrato/manutenção: para repetir a imagem por outro mecanismo.. |
| 522 | U14 |       if (confirmation.hasSignal()) break; | Interrompe métodos adicionais assim que surge preview novo/alterado, mesmo ainda carregando. |
| 523 | U14 |       const currentEditor = typeof getEditor === 'function' ? getEditor() : editor; | Renova referência ao editor via getter quando caller forneceu seletor live. |
| 524 | U14 |       const currentRoot = typeof getEditorRoot === 'function' ? getEditorRoot() : editorRoot; | Renova referência ao composer correspondente antes do método atual. |
| 525 | U14 |       if (!currentEditor \|\| !currentRoot \|\| currentEditor.isConnected === false \|\| currentRoot.isConnected === false) { | Recusa despachar em nó explicitamente desconectado; reporta motivo em vez de contar tentativa. |
| 526 | U14 |         onAttempt?.({ method, attempted: false, reason: 'editor_disconnected' }); | Telemetria distingue ausência/re-render do editor de falha do mecanismo de upload. |
| 527 | U14 |         continue; | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `continue;`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 528 | U14 |       } | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 529 | U14 |       editor = currentEditor; | Substitui referência stale pelo editor live selecionado para esta tentativa. |
| 530 | U14 |       editorRoot = currentRoot; | Substitui raiz stale pelo composer live correspondente. |
| 531 | U14 |       focusForAttachment({ editor, editorRoot }); | Prepara foco inicial antes de construir/usar mecanismos de upload. |
| 532 | U14 |       let dispatched = false; | Inicializa resultado do método atual como não despachado. |
| 533 | U14 |       let reason = null; | Inicializa diagnóstico opcional do dispatcher externo. |
| 534 | U14 |       try { | Boundary de exceção best-effort dentro de U14; uma falha desta integração não deve ser confundida com confirmação de upload. |
| 535 | U14 |         const result = typeof dispatchMethodFn === 'function' ? await dispatchMethodFn(method) : dispatch(); | Escolhe dispatcher injetado assíncrono quando presente; caso contrário executa implementação isolada específica do método. |
| 536 | U14 |         dispatched = typeof result === 'object' ? result?.attempted === true : result === true; | Normaliza retorno booleano ou objeto do dispatcher em um único `dispatched` estrito. |
| 537 | U14 |         reason = typeof result === 'object' ? result?.reason \|\| null : null; | Propaga motivo estruturado apenas quando dispatcher externo o forneceu. |
| 538 | U14 |       } catch (_e) { reason = 'dispatch_failed'; } | Converte exceção do dispatcher em falha observável sem abortar imediatamente os próximos fallbacks. |
| 539 | U14 |       onAttempt?.({ method, attempted: dispatched, reason, world: dispatchMethodFn ? 'MAIN' : 'ISOLATED' }); | Telemetria identifica se método veio do dispatcher injetado ou do content script isolated world. |
| 540 | U14 |       if (!dispatched) continue; | Método que não conseguiu dispatch não consome contador nem entra em `methodsAttempted`. |
| 541 | U14 |       attempted = true; | Marca que ao menos um mecanismo realmente foi disparado. |
| 542 | U14 |       dispatchCount += 1; | Consome uma unidade do limite somente após dispatch real. |
| 543 | U14 |       methodsAttempted.add(method); | Registra método efetivamente despachado uma única vez. |
| 544 | U14 |       confirmation.inspect(); | Reinspeciona DOM imediatamente antes/depois do dispatch para reduzir janela de corrida. |
| 545 | U14 |       const early = await Promise.race([ | Espera o primeiro entre confirmação terminal e janela de retry antes de considerar fallback seguinte. |
| 546 | U14 |         confirmation.promise.then(result => ({ kind: 'result', result })), | Converte resolução do handshake em resultado discriminado `kind:'result'`. |
| 547 | U14 |         sleep(retryAfterMs).then(() => ({ kind: 'next' })), | Abre janela de observação sem bloquear o timeout global da confirmação. |
| 548 | U14 |       ]); | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `]);`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 549 | U14 |       if (early.kind === 'result') { | Se confirmação/timeout encerrou durante a janela, retorna imediatamente sem novo mecanismo. |
| 550 | U14 |         return { ...early.result, attempted, methodsAttempted: Array.from(methodsAttempted) }; | Retorna resultado terminal acrescentando histórico real de tentativas. |
| 551 | U14 |       } | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 552 | U14 |       confirmation.inspect(); | Reinspeciona DOM imediatamente antes/depois do dispatch para reduzir janela de corrida. |
| 553 | U14 |       if (confirmation.hasSignal()) break; | Interrompe métodos adicionais assim que surge preview novo/alterado, mesmo ainda carregando. |
| 554 | U14 |     } | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 555 | U14 | ␠ [linha vazia] | Separador visual dentro de U14; não altera estado, mas delimita o bloco "Orquestração attachFile e anti-duplicação". |
| 556 | U14 |     const result = await confirmation.promise; | Depois do loop, aguarda handshake já armado até confirmação ou timeout total. |
| 557 | U14 |     return { | Retorna deste ponto de U14 o valor `{`, encerrando o ramo sem introduzir confirmação implícita. |
| 558 | U14 |       ...result, | Mescla `confirmed/evidence/signalObserved` com telemetria dos dispatches na resposta final. |
| 559 | U14 |       attempted, | Parte sintática/operacional de U14 — "Orquestração attachFile e anti-duplicação": `attempted,`; sua semântica é delimitada pelo contrato da unidade e não representa sucesso de upload por si só. |
| 560 | U14 |       methodsAttempted: Array.from(methodsAttempted), | Converte Set em array serializável preservando ordem dos métodos usados. |
| 561 | U14 |     }; | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 562 | U14 |   } | Fecha/continua a estrutura sintática de U14 sem alterar o contrato descrito para a unidade. |
| 563 | U14 | ␠ [linha vazia] | Separador visual dentro de U14; não altera estado, mas delimita o bloco "Orquestração attachFile e anti-duplicação". |
| 564 | U15 |   const api = { | Inicia superfície pública compartilhada por browser e CommonJS. |
| 565 | U15 |     findFileInputsDeep, | Exporta `findFileInputsDeep` como parte explícita da API de attachment. |
| 566 | U15 |     listAttachmentEvidence, | Exporta `listAttachmentEvidence` como parte explícita da API de attachment. |
| 567 | U15 |     captureAttachmentBaseline, | Exporta `captureAttachmentBaseline` como parte explícita da API de attachment. |
| 568 | U15 |     findAttachmentThumbnailDeep, | Exporta `findAttachmentThumbnailDeep` como parte explícita da API de attachment. |
| 569 | U15 |     buildDataTransfer, | Exporta `buildDataTransfer` como parte explícita da API de attachment. |
| 570 | U15 |     focusForAttachment, | Exporta `focusForAttachment` como parte explícita da API de attachment. |
| 571 | U15 |     dispatchPaste, | Exporta `dispatchPaste` como parte explícita da API de attachment. |
| 572 | U15 |     assignFileInputs, | Exporta `assignFileInputs` como parte explícita da API de attachment. |
| 573 | U15 |     dispatchDrop, | Exporta `dispatchDrop` como parte explícita da API de attachment. |
| 574 | U15 |     dispatchAttachmentAttempt, | Exporta `dispatchAttachmentAttempt` como parte explícita da API de attachment. |
| 575 | U15 |     createAttachmentConfirmation, | Exporta `createAttachmentConfirmation` como parte explícita da API de attachment. |
| 576 | U15 |     waitForAttachment, | Exporta `waitForAttachment` como parte explícita da API de attachment. |
| 577 | U15 |     attachFile, | Exporta `attachFile` como parte explícita da API de attachment. |
| 578 | U15 |   }; | Fecha/continua a estrutura sintática de U15 sem alterar o contrato descrito para a unidade. |
| 579 | U15 | ␠ [linha vazia] | Separador visual dentro de U15; não altera estado, mas delimita o bloco "API pública e export dual browser/CommonJS". |
| 580 | U15 |   scope.MangaTranslatorGeminiAttachment = api; | Publica a API global consumida por `content_gemini.js`/`job-runner.js` no content script. |
| 581 | U15 |   if (typeof module !== 'undefined' && module.exports) module.exports = api; | No CommonJS exporta o mesmo objeto real, permitindo que `attachment.test.js` execute esta implementação. |
| 582 | U15 | })(typeof self !== 'undefined' ? self : globalThis); | Fecha a IIFE escolhendo `self` quando disponível e `globalThis` como fallback. |
| 583 | U16 | ␠ [linha vazia] | Newline terminal da fonte; preserva a equivalência editorial e fecha a rastreabilidade 583/583. |

## 16. Análise por unidade

### U01 — linhas 1–14 — Modo estrito, IIFE e resolução da dependência DOM

**O que faz:** Inicializa o módulo em escopo isolado, obtém `MangaTranslatorGeminiDom` do global ou de CommonJS e falha cedo se a dependência não existir.

**Como faz:** `'use strict'` endurece semântica; a IIFE recebe `self/globalThis`; `domApi` usa global primeiro e `require('./dom.js')` apenas quando disponível.

**Por que foi implementado dessa forma:** O mesmo arquivo precisa funcionar como content script clássico carregado pelo manifest e como módulo CommonJS nos testes, sem duplicar implementação.

**Por que uma implementação ingênua seria pior:** Depender somente de `require` quebraria no browser; depender somente de global tornaria o teste unitário mais frágil; prosseguir sem DOM API produziria erro tardio no upload.

### U02 — linhas 15–24 — Raiz de busca e ancestralidade composta

**O que faz:** Normaliza a raiz de consulta e sobe por `parentElement` ou host de Shadow DOM.

**Como faz:** `getSearchRoot` prefere `body`, depois `documentElement`; `closestComposed` testa `matches` e atravessa `getRootNode().host` quando necessário.

**Por que foi implementado dessa forma:** Gemini usa componentes com Shadow DOM e wrappers variáveis; busca DOM rasa perderia elementos relevantes.

**Por que uma implementação ingênua seria pior:** Usar apenas `closest()`/`parentElement` não atravessaria fronteiras de shadow root e poderia confundir contexto de composer/resposta.

### U03 — linhas 25–41 — Seletores de contexto e descoberta de input[type=file]

**O que faz:** Define os seletores de composer, mensagens e anexos; filtra inputs de arquivo utilizáveis e preferencialmente relacionados ao composer.

**Como faz:** Exclui elementos dentro de turnos user/model, rejeita inputs desabilitados e aceita `accept` vazio, `image/*`, `*/*` ou extensões de imagem conhecidas; ordena composer-first.

**Por que foi implementado dessa forma:** O upload deve atuar no composer atual, não em controles pertencentes a mensagens históricas ou superfícies irrelevantes.

**Por que uma implementação ingênua seria pior:** Selecionar o primeiro `input[type=file]` da página pode anexar no componente errado ou interagir com UI de resposta/histórico.

### U04 — linhas 42–51 — Prontidão da evidência visual

**O que faz:** Decide se uma evidência de anexo já está suficientemente carregada para confirmar.

**Como faz:** Exige `img`, source não vazio, `complete !== false`, dimensões naturais positivas e ausência de `aria-busy`, progressbar ou spinner dentro do attachment.

**Por que foi implementado dessa forma:** A simples criação do container pode significar upload ainda pendente; confirmação precoce permitiria enviar prompt antes da imagem estar pronta.

**Por que uma implementação ingênua seria pior:** Tratar qualquer preview como sucesso cria corrida entre upload e submit e pode gerar respostas sem a página de mangá anexada.

### U05 — linhas 52–136 — Coleta profunda de evidências de attachment

**O que faz:** Varre DOM/Shadow DOM em busca de containers e imagens que possam representar o anexo do composer.

**Como faz:** Usa `domApi.findAllDeep`, deduplica com `Set`, exige contexto de attachment, tamanho visual mínimo para containers e aceita imagens blob/data ou imagens úteis dentro da área de input.

**Por que foi implementado dessa forma:** A UI do Gemini muda entre tags, data-testid, classes e Shadow DOM; múltiplos sinais observáveis tornam o detector resiliente sem aceitar imagens de resposta.

**Por que uma implementação ingênua seria pior:** Um seletor único ou busca só por `<img>` teria muitos falsos negativos; aceitar qualquer imagem teria falsos positivos com avatar/resposta/model output.

### U06 — linhas 137–183 — Assinatura, baseline e detecção de mudança

**O que faz:** Representa cada evidência por identidade estrutural/mídia e compara o estado atual com um baseline capturado antes do upload.

**Como faz:** A assinatura usa tipo, seletor, data-testid, quantidade de filhos e image source; ignora classe/style/dimensões; o baseline é `Map` por elemento.

**Por que foi implementado dessa forma:** Animações/layout tardio de preview antigo não podem ser confundidos com o upload atual; mudança de mídia/estrutura é um sinal mais forte.

**Por que uma implementação ingênua seria pior:** Comparar classe/style criaria confirmação espúria; comparar só presença do elemento aceitaria thumbnail antigo já existente.

### U07 — linhas 184–205 — Construção de DataTransfer

**O que faz:** Cria o envelope de arquivo usado por paste/drop/input e fornece fallback testável quando `DataTransfer` real não existe.

**Como faz:** Tenta `new scope.DataTransfer()` e `items.add(file)`; em fallback mantém arrays `files/items` com `items.add` mínimo.

**Por que foi implementado dessa forma:** Browser real usa `DataTransfer`; JSDOM e alguns runtimes de teste podem não oferecer implementação nativa.

**Por que uma implementação ingênua seria pior:** Mockar fora do módulo esconderia o comportamento de fallback; considerar o fallback garantia de assignment em `input.files` seria incorreto, por isso falha continua sendo tratada como tentativa.

### U08 — linhas 206–257 — Fábricas de eventos paste/drop

**O que faz:** Produz ClipboardEvent/DragEvent reais quando disponíveis e eventos genéricos com propriedades injetadas quando necessário.

**Como faz:** Tenta construtores especializados com `bubbles/cancelable/composed`; no fallback cria `Event` e define `clipboardData`/`dataTransfer` via `Object.defineProperty` best-effort.

**Por que foi implementado dessa forma:** O mesmo fluxo precisa funcionar em browsers e no ambiente de testes, inclusive atravessando Shadow DOM via eventos composed.

**Por que uma implementação ingênua seria pior:** Usar apenas Event simples sem payload impediria handlers do Gemini de ler o arquivo; exigir construtor especializado quebraria em runtimes incompletos.

### U09 — linhas 258–288 — Foco defensivo antes do upload

**O que faz:** Tenta focar editor e raiz do composer, emite focus/focusin e sinaliza focus também à janela.

**Como faz:** Deduplica alvos com `Set`, tenta `focus({preventScroll:true})`, cai para `focus()`, despacha FocusEvent/Event e captura falhas individualmente.

**Por que foi implementado dessa forma:** Handlers de paste/drop podem depender do foco real/observado; falhas de um mecanismo não devem impedir os demais mecanismos de upload.

**Por que uma implementação ingênua seria pior:** Um único `focus()` sem fallback falharia silenciosamente em WebViews/implementações parciais; propagar exceção abortaria upload por detalhe de foco.

### U10 — linhas 289–328 — Dispatch isolado: paste, file input e drop

**O que faz:** Implementa os três mecanismos concretos de tentativa de upload no isolated world.

**Como faz:** Paste despacha ClipboardEvent no editor; file input seleciona o melhor input profundo, atribui `transfer.files` e emite input/change; drop despacha DragEvent na raiz do composer.

**Por que foi implementado dessa forma:** Gemini pode aceitar mecanismos diferentes conforme versão/estado da UI; fallback ordenado aumenta robustez sem declarar sucesso por dispatch.

**Por que uma implementação ingênua seria pior:** Depender de um único método tornaria o RPA sensível a mudança de implementação; disparar todos sem observar sinal pode anexar a mesma imagem várias vezes.

### U11 — linhas 329–354 — Tentativa agregada exportada

**O que faz:** Agrupa paste, file input e drop e retorna quais métodos foram efetivamente despachados.

**Como faz:** Acumula `attempted` e nomes em array, respeitando `includeDrop`.

**Por que foi implementado dessa forma:** Fornece helper reutilizável/diagnóstico sem confundir tentativa com confirmação.

**Por que uma implementação ingênua seria pior:** Retornar apenas booleano perderia rastreabilidade de qual mecanismo atuou; chamar isso de sucesso quebraria o contrato central do arquivo.

### U12 — linhas 355–464 — Handshake observável de confirmação

**O que faz:** Cria uma confirmação cancelável que observa mutações, eventos load/error, polling e timeout até surgir evidência nova/alterada e pronta.

**Como faz:** Captura baseline, instala `MutationObserver` na raiz e shadow roots existentes, registra listeners, faz polling a cada 500 ms e centraliza cleanup/resolução em `finish` idempotente.

**Por que foi implementado dessa forma:** Nem toda atualização de preview dispara a mesma mutação no mesmo nó; combinar observer, load/error e polling reduz misses sem confirmar estado antigo.

**Por que uma implementação ingênua seria pior:** Só MutationObserver pode perder mudanças internas/Shadow DOM tardias; só polling aumenta latência; sem cleanup timers/listeners poderiam vazar após cada job.

### U13 — linhas 465–468 — Wrapper waitForAttachment

**O que faz:** Expõe somente a Promise do handshake para consumidores que não precisam de inspect/stop.

**Como faz:** Delega integralmente a `createAttachmentConfirmation(options).promise`.

**Por que foi implementado dessa forma:** Mantém API simples para espera passiva sem duplicar lógica.

**Por que uma implementação ingênua seria pior:** Reimplementar espera em outro helper criaria dois critérios de confirmação divergentes.

### U14 — linhas 469–563 — Orquestração attachFile e anti-duplicação

**O que faz:** Executa o fluxo completo: valida entradas, captura baseline, arma confirmação, foca, cria transfer e tenta file_input → drop → paste com revalidação do composer entre métodos.

**Como faz:** Antes de cada dispatch chama `confirmation.inspect`; se já houver qualquer sinal novo (`hasSignal`) interrompe redisparo; usa getters para renovar editor/composer; limita `maxDispatches`; espera confirmação ou janela de retry via `Promise.race`.

**Por que foi implementado dessa forma:** Uma preview pendente prova que algum mecanismo começou a agir, mas ainda não prova prontidão; parar novos dispatches evita duplicar a imagem enquanto a confirmação aguarda carregamento.

**Por que uma implementação ingênua seria pior:** Repetir métodos até `confirmed` poderia anexar a mesma página 2–3 vezes; reutilizar nó desconectado falharia após re-render do Gemini; enviar prompt sem `confirmed` viola o fail-closed.

### U15 — linhas 564–582 — API pública e export dual browser/CommonJS

**O que faz:** Expõe helpers no global `MangaTranslatorGeminiAttachment`, exporta a mesma API em CommonJS e fecha a IIFE.

**Como faz:** Monta objeto `api`, atribui ao `scope` e, quando `module.exports` existe, referencia o mesmo objeto.

**Por que foi implementado dessa forma:** Manifest/content_gemini consomem global; Jest importa CommonJS; uma única implementação evita drift.

**Por que uma implementação ingênua seria pior:** APIs distintas por ambiente poderiam fazer testes passarem sobre código diferente do executado no browser.

### U16 — linhas 583–583 — Newline final

**O que faz:** Representa a posição terminal vazia causada pelo newline final do arquivo.

**Como faz:** A fonte termina em `\n`, então `split('\n')` produz uma 583ª posição vazia.

**Por que foi implementado dessa forma:** A Bíblia rastreia todas as posições físicas/editoriais, inclusive terminador.

**Por que uma implementação ingênua seria pior:** Ignorar a posição terminal quebraria a contagem 583/583 usada pela auditoria.

## 17. Auditoria interna antes do fechamento

- [x] Fonte integral copiada do blob `50092e4d7d71994f91236d271d3418507f10eade`.
- [x] 582 linhas textuais + newline final = 583/583 posições rastreadas.
- [x] Dependência `dom.js`, ordem do manifest, composition root e job-runner verificados.
- [x] `attachment.test.js` lido com assertions ATT-01 a ATT-11.
- [x] Testes do job-runner classificados como contrato/mock quando não executam esta implementação.
- [x] E2E classificado conservadoramente como integração do gate fail-closed.
- [x] Lacunas específicas registradas.
- [x] Shadow DOM, timers, observer, eventos e cleanup analisados.
- [x] Segurança/privacidade/trust boundaries analisados.
- [x] Nenhum código funcional alterado.
- [x] Reserva relida e pertencente a `GPT-5.6-Sol#C`.
- [x] SHA do fonte continua igual ao SHA reservado.

**Veredito interno do agente:** conteúdo documental completo para o SHA `50092e4d7d71994f91236d271d3418507f10eade`; a promoção para `✅ CONCLUÍDO` depende da seção crítica compartilhada (AUDITORIA/STATUS/CHECKLIST) após liberação segura da coordenação global.

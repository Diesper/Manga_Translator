# Bíblia técnica — tests/unit/content-gemini/rpa-flow.test.js

> **Estado documental:** 🟡 CORRIGIDA após PRIMARY+ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** 4bcd24983325106d82be04e2c547a99df1a74fd5  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest/JSDOM de fluxo RPA real do Gemini  
> **Linhas textuais:** 739  
> **Posições documentais:** 740, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é um teste de integração dentro do projeto Jest `content-scripts`. Ela não reimplementa o RPA: resolve e carrega os módulos reais `content_gemini.js`, `selectors.js`, `dom.js`, `observer.js`, `editor.js`, `attachment.js`, `temporary-chat.js`, `result-extractor.js`, `deletion.js` e `job-runner.js`. As fronteiras de navegador, DOM, storage, rede e background são simuladas para tornar os fluxos determinísticos.

O arquivo concentra dez cenários RPA de ponta a ponta no JSDOM: caminho feliz HTTP, blob local, prompt de emergência, falha ao buscar imagem de origem, aba manual sem job, fallback MAIN-world, erro visível da UI, timeout do Observer V2 e os dois caminhos de `DELETE_CONVERSATION`.

## 2. Fronteiras reais e simuladas

| Elemento | Tratamento nesta suíte | Consequência probatória |
|---|---|---|
| módulos `extension/content/**` | carregados por `require` real dentro de `jest.isolateModules` | comportamento dos módulos é executado, não copiado |
| `chrome.runtime.sendMessage` | mock compartilhado + responders por `action` | IPC de saída é observável; background real não executa |
| `chrome.storage` | mock compartilhado | descoberta/ownership do job usa a API esperada, mas persistência física do Chrome não é exercitada |
| DOM Gemini | fixture JSDOM com geometria explícita | seletores, observers e interações reais executam sobre DOM sintético |
| rede/fetch | mock apenas no cenário blob | decisão do extractor é real; transporte externo não é |
| timers | timers reais do Jest/JSDOM e polling do harness | prova inclui ordenação assíncrona, mas não latência real do navegador |
| MAIN-world | evento `MANGA_TRANSLATOR_TRIGGER_SEND` | prova o contrato do bridge por evento, não um isolated-world do Chrome real |

## 3. Harness e isolamento

As linhas 17–233 constroem a infraestrutura local: URL sintética, polyfills mínimos de JSDOM, fixture de imagem de resposta, geometria visível, editor com paste/drop/submit, polling e dispatcher de mensagens. Nenhum desses helpers substitui a lógica de produção carregada em `loadScript`.

O `beforeEach` (244–269) reseta cache CommonJS, runtime, storage, DOM e spies. O `afterEach` (271–303) para o Observer V2 ativo, percorre o registry de observers, aguarda `processPromise`, restaura runtime/fetch e limpa storage/DOM. Esse teardown é materialmente importante porque a matriz de regressão contém `REG-RPA-PROMISE-TEARDOWN`.

## 4. Carregamento da pilha real

`loadScript` (305–357) cria o job canônico `gemini_job_<tabId>`, instala responders de IPC, carrega os nove módulos auxiliares e `content_gemini.js` em isolamento e, por padrão, chama `processGeminiJob()`. Portanto, um cenário verde prova que a composição desses módulos consegue percorrer o caminho configurado; isso não transforma cada passo intermediário em prova direta.

## 5. Cenários e força das assertions

### 5.1 CG-09/15/18/20/22/26/31/38 — HTTP e envio exato

O cenário 359–415 cria editor com botão `aria-label="send message"`, entrega imagem de origem e recebe data URL do background. As assertions 397–414 provam diretamente: URL exata enviada a `FETCH_IMAGE_AS_BASE64`; entrega `GEMINI_IMAGE_EXTRACTED` com `mangaTabId/index/src`; log `GEMINI_SEND_SUCCESS`; metadados redigidos de URL; e ausência do token/prompt privado na serialização dos logs.

Os passos de anexo, injeção do prompt, confirmação visual do submit e observação do resultado são **executados indiretamente** porque são necessários para alcançar as assertions finais, mas não recebem assertion individual nesta suíte.

### 5.2 CG-37 — blob local

As linhas 417–450 provam diretamente que a URL `blob:generated-result` é lida por `fetch`, que `FETCH_IMAGE_AS_BASE64` não é chamado e que o resultado final é um `data:image/png;base64,...` entregue com ownership correto.

### 5.3 CG-25 — prompt de emergência

As linhas 452–493 provam diretamente a emissão de `PROMPT_FALLBACK`, a presença de `fallbackLength`, a ausência do campo sensível `fallbackPrompt` e a conclusão do job com `GEMINI_IMAGE_EXTRACTED`. A suíte **não** compara o texto de emergência efetivamente inserido no editor; essa lacuna origina 187-001.

### 5.4 CG-16 — imagem de origem ausente

As linhas 495–513 exigem `GEMINI_ERROR` para o mesmo `mangaTabId/index` e mensagem contendo “Sem resposta da aba do mangá”. Isso é prova direta do branch terminal observado.

### 5.5 CG-12/13 — aba manual sem job

As linhas 515–545 iniciam sem `gemini_job_321` e com job alheio em `999`. Após `advance(800)`, as assertions provam que **até esse ponto observado** o job corrente não foi criado, o job alheio permaneceu intacto e nenhuma solicitação de imagem ou erro foi emitida. O claim manual real pode permanecer ativo por até ~5 s; o `afterEach` aguarda `processPromise`, mas não repete essas assertions depois do término.

### 5.6 CG-30/39 — fallback MAIN-world

As linhas 547–585 tornam o envio por Enter insuficiente, observam `MANGA_TRANSLATOR_TRIGGER_SEND`, forçam falha da extração HTTP e esperam `GEMINI_RESULT_URL`. As assertions provam URL/ownership do fallback, um único trigger MAIN-world e log `GEMINI_SEND_FALLBACK`.

### 5.7 CG-27/35 — erro visível da UI

As linhas 587–630 criam `role="alert"` visível. As assertions provam `GEMINI_ERROR` e log de nível `error`. O cenário termina ao observar o primeiro erro e não aguarda explicitamente o resultado terminal de `processPromise`; ele também não verifica ausência de entrega tardia de imagem/URL. Essa lacuna origina 187-002.

### 5.8 CG-36 — timeout do Observer V2

As linhas 632–667 reduzem o timeout interno para 80 ms, aguardam exatamente o erro “Tempo limite (4 min)”, provam que `processPromise` existe, exigem `{status:'result_timeout'}`, verificam log `GEMINI_TIMEOUT` e exigem que a lista de `GEMINI_ERROR` contenha apenas o erro esperado. Este é o caso mais forte da suíte para terminalidade e teardown assíncrono.

### 5.9 CG-43/52/53 — delete em debug

As linhas 669–692 enviam `DELETE_CONVERSATION` sem iniciar job. Provam canal mantido vivo, resposta `{ok:true}` e log `DEBUG_MODE_SKIP`.

### 5.10 CG-44/48/49/52/53 — delete normal

As linhas 694–738 montam sidebar/menu/confirmação e instrumentam três cliques. O mock do botão de confirmação remove a conversa e muda o pathname; a implementação real precisa percorrer o DOM e observar a confirmação para responder. As assertions provam keepAlive, `{ok:true}`, cliques em opções/item/confirmação e log `DELETE_OK`.

## 6. Matriz de evidência

| Contrato | Evidência local | Classificação |
|---|---|---|
| HTTP remoto usa `FETCH_IMAGE_AS_BASE64` e entrega data URL | 397–406 | ✅ PROVADO DIRETAMENTE |
| logs não vazam token assinado nem prompt privado | 411–414 | ✅ PROVADO DIRETAMENTE |
| submit exato/attachment/prompt intermediários do caminho feliz | necessários para atingir 397–414 | 🟨 EXECUTADO INDIRETAMENTE |
| blob usa fetch local e evita fallback background | 442–449 | ✅ PROVADO DIRETAMENTE |
| fallback de prompt é ativado e logado sem texto sensível | 482–492 | ✅ PROVADO DIRETAMENTE |
| conteúdo exato do prompt de emergência injetado | não comparado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| falta de imagem de origem termina em erro correlacionado | 507–512 | ✅ PROVADO DIRETAMENTE |
| nos primeiros 800 ms observados, aba manual não toma job de outra aba | 537–544 | ✅ PROVADO DIRETAMENTE nesse intervalo; o claim pode continuar até ~5 s e não há reassertion terminal após `processPromise` |
| MAIN-world + `GEMINI_RESULT_URL` | 574–584 | ✅ PROVADO DIRETAMENTE |
| erro visual gera delivery/log de erro | 616–629 | ✅ PROVADO DIRETAMENTE |
| erro visual impede qualquer entrega tardia | não afirmado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| timeout resulta em `result_timeout` e um único `GEMINI_ERROR` | 649–666 | ✅ PROVADO DIRETAMENTE |
| DELETE em debug responde ok e registra skip | 686–691 | ✅ PROVADO DIRETAMENTE |
| DELETE normal percorre os três cliques e confirma | 729–737 | ✅ PROVADO DIRETAMENTE |
| afterEach realmente deixa zero observers/timers pendentes | estabilidade global da suíte/worker | 🟨 EXECUTADO INDIRETAMENTE |

## 7. Consumidores, wiring e CI

`jest.config.js` inclui `tests/unit/content-gemini/**/*.test.js` no projeto `content-scripts` com ambiente JSDOM e os mocks compartilhados de Chrome/DOM. `package.json#test:unit:content`, `test:ci` e `test:coverage` alcançam esse projeto; a CI executa `npm run test:ci` em Node 20.x e 22.x e também o caminho de coverage.

O blob atual 4bcd24983325106d82be04e2c547a99df1a74fd5 é o mesmo que existia no commit `e720890cf34dc9437ee91f3b8172953497d69870`. No run **36521561968**, `rpa-flow.test.js` passou em Node 20.x (job **109255348388**) e Node 22.x (job **109255348406**). Os dois jobs reportaram **109/109 suítes e 851/851 testes**; o CI Gate **109256050280** também terminou com sucesso. Isso prova execução real da suíte naquele blob, mas não substitui as classificações granulares acima.

A matriz `scripts/ci/data/regression-matrix.json` registra `REG-RPA-PROMISE-TEARDOWN`, apontando especificamente para o título CG-36 e `expect(await processPromise)`. Logo, a presença desse marcador é ainda protegida por gate estático/CI, enquanto a semântica do resultado continua sendo provada pela assertion Jest.

## 8. Dependências relevantes

- `tests/mocks/chrome-api.mock.js`: runtime/storage compartilhados.
- `tests/mocks/dom-environment.js`: setup JSDOM do projeto content-scripts.
- `extension/content/content_gemini.js`: bootstrap, tabId e listener `DELETE_CONVERSATION`.
- `extension/content/gemini/job-runner.js`: request da imagem, prompt fallback, submit, observer, extração e deliveries.
- `extension/content/gemini/observer.js`: detecção de resultado, erro e timeout.
- `extension/content/gemini/editor.js`: edição/submissão.
- `extension/content/gemini/attachment.js`: injeção/confirmação do anexo.
- `extension/content/gemini/result-extractor.js`: blob/HTTP/data URL e fallbacks.
- `extension/content/gemini/deletion.js`: deleção segura e debug skip.
- `extension/content/gemini/temporary-chat.js`, `selectors.js`, `dom.js`: suporte ao ambiente e seleção do DOM.

Suítes irmãs como `job-runner.test.js`, `observer.test.js`, `attachment.test.js`, `deletion.test.js`, `editor-submit.test.js`, `safe-background-delete.test.js`, `helpers-and-regressions-real.test.js` e `plan-rpa-edge-cases.test.js` também executam no mesmo projeto e passaram no run citado; elas complementam branches que esta suíte RPA não precisa afirmar como prova local.

## 9. Cobertura por intervalos

| Linhas | Responsabilidade |
|---|---|
| 1–15 | imports, caminhos canônicos dos módulos reais e flag de coverage |
| 16–27 | fixture de URL da página Gemini |
| 28–93 | polyfills controlados de APIs DOM ausentes no JSDOM |
| 94–107 | fixture de imagem gerada dentro de model-response |
| 108–115 | fixture de geometria/visibilidade |
| 116–189 | editor Gemini sintético, paste/drop e modos de envio |
| 190–197 | helpers assíncronos de avanço |
| 198–208 | polling com timeout explícito |
| 209–212 | filtro de mensagens por action |
| 213–234 | dispatcher do listener chrome.runtime e semântica keepAlive |
| 235–243 | escopo da suíte e variáveis compartilhadas |
| 244–270 | beforeEach: isolamento de módulos, runtime, storage e DOM |
| 271–304 | afterEach: parada de observers, espera do runner e limpeza |
| 305–358 | loadScript: prepara job/storage, injeta responders e carrega módulos reais |
| 359–416 | CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction |
| 417–451 | CG-37: resultado blob convertido localmente sem fallback background |
| 452–494 | CG-25: prompt de emergência e metadados redigidos |
| 495–514 | CG-16: ausência de imagem de origem vira GEMINI_ERROR |
| 515–546 | CG-12/13: aba Gemini manual não reivindica job alheio |
| 547–586 | CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL |
| 587–631 | CG-27/35: erro visível da UI vira entrega de erro |
| 632–668 | CG-36: timeout do Observer V2 e término result_timeout |
| 669–693 | CG-43/52/53: DELETE_CONVERSATION em debug |
| 694–739 | CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação |
| 740 | newline final do blob |

A seção 12 abaixo expande todas as 740 posições individualmente.

## 10. Solicitações ao auditor

### 187-001 — TEST_REQUIRED — ACCEPTED — NORMAL

**Encontrado:** CG-25 prova o log `PROMPT_FALLBACK`, seu comprimento redigido e o sucesso posterior, mas nunca compara o texto de emergência que realmente chega ao editor.

**Evidência atual:** linhas 482–492 garantem ativação/redaction e delivery final.

**Evidência ausente:** assertion sobre o conteúdo efetivamente injetado/submetido quando `job.prompt` é vazio/whitespace.

**Necessário:** em alteração separada, observar o editor/submit usando a implementação real e exigir o texto canônico de fallback ou um contrato exportado equivalente, sem duplicar a string no teste de modo frágil.

**Risco:** o fallback pode continuar logando sucesso enquanto envia texto errado, vazio ou incompleto.

### 187-002 — TEST_REQUIRED — ACCEPTED — NORMAL

**Encontrado:** CG-27/35 termina assim que encontra o primeiro `GEMINI_ERROR`; não aguarda `processPromise` e não verifica ausência posterior de `GEMINI_IMAGE_EXTRACTED`/`GEMINI_RESULT_URL`.

**Evidência atual:** linhas 616–629 provam o erro e seu log.

**Evidência ausente:** terminalidade/exclusividade do erro visível.

**Necessário:** adicionar cenário focal que aguarde o runner terminar e afirme que, após o erro de UI, nenhuma entrega de sucesso/fallback ocorre.

**Risco:** regressão de race pode produzir erro e, em seguida, resultado tardio para o mesmo job.

### 187-003 — TEST_INFRA_REQUIRED — ACCEPTED — NORMAL

**Encontrado:** `afterEach` para observer ativo, registry e `processPromise`, mas a limpeza dos observers/timers é inferida pela estabilidade global; só CG-36 possui assertion direta sobre a Promise.

**Evidência atual:** run 36521561968 passa em Node 20/22 e o CI Gate/worker warning gate está verde; a matriz preserva `REG-RPA-PROMISE-TEARDOWN`.

**Evidência ausente:** assertion focal de que observers registrados recebem `stop()` e de que o teardown não deixa recurso periódico pendente quando um cenário termina logo após a mensagem esperada.

**Necessário:** criar teste/harness separado de infraestrutura do teardown ou expor métrica controlada dos observers, sem enfraquecer o cleanup atual.

**Risco:** worker leak pode reaparecer apenas em determinada ordem de execução e ser detectado tardiamente pelo gate global.

## 11. Fonte integral auditada

```javascript
const path = require('path');

const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');

const CONTENT_GEMINI_PATH = path.resolve(__dirname, '../../../extension/content/content_gemini.js');
const GEMINI_SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');
const GEMINI_DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');
const GEMINI_OBSERVER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/observer.js');
const GEMINI_EDITOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/editor.js');
const GEMINI_ATTACHMENT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/attachment.js');
const GEMINI_TEMP_CHAT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/temporary-chat.js');
const GEMINI_RESULT_EXTRACTOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/result-extractor.js');
const GEMINI_DELETION_PATH = path.resolve(__dirname, '../../../extension/content/gemini/deletion.js');
const GEMINI_JOB_RUNNER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/job-runner.js');
const COVERAGE_MODE = process.env.COVERAGE_MODE === '1';

function setWindowLocation(pathname = '/app/chat-1') {
    Object.defineProperty(window, 'location', {
        value: {
            pathname,
            href: `https://gemini.test${pathname}`,
        },
        configurable: true,
        writable: true,
    });
}

function installMissingDomApis() {
    if (typeof window.HTMLElement !== 'undefined' && typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {
        Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
            value: jest.fn(),
            configurable: true,
            writable: true,
        });
    }

    if (typeof window.PointerEvent !== 'function') {
        window.PointerEvent = window.MouseEvent;
    }
    if (typeof global.PointerEvent !== 'function') {
        global.PointerEvent = window.PointerEvent;
    }

    if (typeof window.DataTransfer !== 'function') {
        class MockDataTransfer {
            constructor() {
                const items = [];
                items.add = (item) => items.push(item);
                this.items = items;
                this._data = new Map();
            }

            setData(type, value) {
                this._data.set(type, value);
            }

            getData(type) {
                return this._data.get(type) || '';
            }
        }

        window.DataTransfer = MockDataTransfer;
    }
    if (typeof global.DataTransfer !== 'function') {
        global.DataTransfer = window.DataTransfer;
    }

    if (typeof window.ClipboardEvent !== 'function') {
        class MockClipboardEvent extends window.Event {
            constructor(type, init = {}) {
                super(type, init);
                this.clipboardData = init.clipboardData || null;
            }
        }

        window.ClipboardEvent = MockClipboardEvent;
    }
    if (typeof global.ClipboardEvent !== 'function') {
        global.ClipboardEvent = window.ClipboardEvent;
    }

    if (typeof window.InputEvent !== 'function') {
        window.InputEvent = window.Event;
    }
    if (typeof global.InputEvent !== 'function') {
        global.InputEvent = window.InputEvent;
    }

    if (typeof global.atob !== 'function') {
        global.atob = (value) => Buffer.from(value, 'base64').toString('binary');
    }
}

function appendGeneratedImage(src) {
    const img = document.createElement('img');
    img.src = src;
    img.scrollIntoView = jest.fn();
    Object.defineProperty(img, 'naturalWidth', { value: 1024, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 1536, configurable: true });
    Object.defineProperty(img, 'complete', { value: true, configurable: true });
    const response = document.createElement('model-response');
    response.setAttribute('data-message-author', 'model');
    response.appendChild(img);
    document.body.appendChild(response);
    return img;
}

function makeVisible(element, width = 160, height = 48) {
    element.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0, right: width, bottom: height,
        width, height, toJSON() { return this; },
    });
    return element;
}

function mountGeminiEditor({ sendMode = 'exact', onSubmit } = {}) {
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"><p></p></div><div class="momentary-indicator">conversa momentânea</div>';

    const editor = document.querySelector('.ql-editor');
    makeVisible(editor, 640, 120);
    editor.focus = jest.fn();
    editor.scrollIntoView = jest.fn();

    editor.addEventListener('paste', (event) => {
        const clipboardData = event.clipboardData;
        const pastedText = clipboardData && typeof clipboardData.getData === 'function'
            ? clipboardData.getData('text/plain')
            : '';

        if (pastedText) {
            const pTag = editor.querySelector('p') || editor;
            pTag.textContent = pastedText;
            return;
        }

        if (clipboardData && clipboardData.items && clipboardData.items.length > 0) {
            let preview = document.querySelector('file-preview');
            if (!preview) {
                preview = document.createElement('file-preview');
                const thumbImg = document.createElement('img');
                thumbImg.src = 'blob:https://gemini.test/mock-attachment';
                Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });
                Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });
                Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });
                makeVisible(preview, 120, 90);
                preview.appendChild(thumbImg);
                document.body.appendChild(preview);
            }
        }
    });
    editor.addEventListener('drop', (event) => {
        const transfer = event.dataTransfer;
        if (!transfer?.items?.length || document.querySelector('file-preview')) return;
        const preview = document.createElement('file-preview');
        const thumbImg = document.createElement('img');
        thumbImg.src = 'blob:https://gemini.test/mock-attachment';
        Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });
        Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });
        Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });
        makeVisible(preview, 120, 90);
        preview.appendChild(thumbImg);
        document.body.appendChild(preview);
    });

    editor.addEventListener('keydown', (event) => {
        if (sendMode === 'enter' && event.key === 'Enter') {
            onSubmit();
        }
    });

    let sendButton = null;
    if (sendMode !== 'enter') {
        sendButton = document.createElement('button');
        if (sendMode === 'exact') {
            sendButton.setAttribute('aria-label', 'send message');
        } else {
            sendButton.setAttribute('aria-label', 'enviar agora');
        }
        sendButton.click = jest.fn(() => {
            editor.textContent = '';
            onSubmit();
        });
        makeVisible(sendButton, 40, 40);
        document.body.appendChild(sendButton);
    }

    return { editor, sendButton };
}

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function advance(ms = 0) {
    await delay(ms);
}

async function waitFor(predicate, { timeout = 8000, step = 50 } = {}) {
    let elapsed = 0;
    while (elapsed <= timeout) {
        const result = await predicate();
        if (result) return result;
        await advance(step);
        elapsed += step;
    }
    throw new Error('Timeout aguardando condicao');
}

function collectActions(messages, action) {
    return messages.filter(message => message && message.action === action);
}

function dispatchContentMessage(runtimeMock, request, sender = { tab: null }) {
    return new Promise((resolve) => {
        const listeners = runtimeMock._messageListeners || [];
        if (listeners.length === 0) {
            resolve({ keepAlive: false, response: undefined });
            return;
        }

        let settled = false;
        let keepAlive = false;
        const sendResponse = (response) => {
            settled = true;
            resolve({ keepAlive, response });
        };

        keepAlive = listeners[listeners.length - 1](request, sender, sendResponse);
        if (keepAlive === false && !settled) {
            resolve({ keepAlive, response: undefined });
        }
    });
}

describe('content_gemini.js - RPA real do Gemini', () => {
    let runtimeMock;
    let storageMock;
    let originalSendMessage;
    let originalFetch;
    let sentMessages;
    let consoleErrorSpy;
    let processPromise;

    beforeEach(async () => {
        jest.resetModules();
        delete window.__mt_gemini_started;

        installMissingDomApis();
        jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
            x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,
            width: 160, height: 48, toJSON() { return this; },
        }));
        setWindowLocation('/app/chat-1');

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        originalSendMessage = runtimeMock.sendMessage;
        originalFetch = global.fetch;

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        sentMessages = [];
        processPromise = null;
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        document.documentElement.innerHTML = '<head></head><body></body>';
        await storageMock.clear();
    });

    afterEach(async () => {
        // Alguns cenários encerram assim que observam a mensagem esperada, enquanto
        // o fluxo assíncrono real ainda pode manter o Observer V2 vivo. Pare todos
        // os observers registrados antes de desmontar o DOM para não deixar timers
        // periódicos/waiters presos no worker Jest.
        const activeObserver = window.__mangaTranslatorActiveGeminiObserver;
        if (activeObserver && typeof activeObserver.stop === 'function') {
            try { activeObserver.stop(); } catch (_error) {}
        }
        delete window.__mangaTranslatorActiveGeminiObserver;

        const observerRegistry = window.__mtGeminiObservers;
        if (observerRegistry && typeof observerRegistry === 'object') {
            for (const observer of Object.values(observerRegistry)) {
                if (observer && typeof observer.stop === 'function') {
                    try { observer.stop(); } catch (_error) {}
                }
            }
        }
        delete window.__mtGeminiObservers;

        // The runner can still be unwinding after the expected message. Wait
        // for it before the next test replaces the shared runtime mock.
        if (processPromise) await processPromise.catch(() => {});

        delete window.__mt_gemini_started;
        delete globalThis.__MT_GEMINI_GENERATION_TIMEOUT_MS__;
        runtimeMock.sendMessage = originalSendMessage;
        global.fetch = originalFetch;
        jest.restoreAllMocks();
        await storageMock.clear();
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    async function loadScript({
        tabId = 321,
        pathname = '/app/chat-1',
        job = {
            mangaTabId: 77,
            index: 5,
            prompt: 'Traduzir tudo para PT-BR',
        },
        storage = {},
        responders = {},
        autoProcess = true,
    } = {}) {
        setWindowLocation(pathname);

        if (job) {
            const normalizedJob = {
                jobId: `job-${tabId}`,
                batchId: 'batch-test',
                ...job,
            };
            await storageMock.set({
                [`gemini_job_${tabId}`]: normalizedJob,
                ...storage,
            });
        } else {
            await storageMock.set(storage);
        }

        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);
            const responder = responders[message.action];
            if (typeof callback === 'function') {
                callback(responder ? responder(message) : undefined);
            }
        });

        jest.isolateModules(() => {
            require(GEMINI_SELECTORS_PATH);
            require(GEMINI_DOM_PATH);
            require(GEMINI_OBSERVER_PATH);
            require(GEMINI_EDITOR_PATH);
            require(GEMINI_ATTACHMENT_PATH);
            require(GEMINI_TEMP_CHAT_PATH);
            require(GEMINI_RESULT_EXTRACTOR_PATH);
            require(GEMINI_DELETION_PATH);
            require(GEMINI_JOB_RUNNER_PATH);
            const contentGemini = require(CONTENT_GEMINI_PATH);
            if (autoProcess) processPromise = contentGemini.processGeminiJob();
        });

        await advance(0);
        await advance(0);
    }

    test('CG-09/CG-15/CG-18/CG-20/CG-22/CG-26/CG-31/CG-38: processa job com botao exato e extracao HTTP via background', async () => {
        mountGeminiEditor({
            sendMode: 'exact',
            onSubmit: () => {
                setTimeout(() => {
                    appendGeneratedImage('https://cdn.gemini.test/result-001.png?token=signed-secret');
                }, 1300);
            },
        });

        await loadScript({
            storage: { debugMode: true },
            job: {
                mangaTabId: 77,
                index: 5,
                prompt: 'prompt-private-text',
            },
            responders: {
                GET_TAB_ID: () => ({ tabId: 321 }),
                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
                FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),
            },
        });

        await waitFor(() => collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0]);

        const extracted = collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0];
        const fetchCall = collectActions(sentMessages, 'FETCH_IMAGE_AS_BASE64')[0];
        const exactLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_SEND_SUCCESS'
        );
        const imageFoundLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_IMG_FOUND'
        );
        const promptLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'PROMPT_INJECTED'
        );

        expect(fetchCall).toEqual(expect.objectContaining({
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.gemini.test/result-001.png?token=signed-secret',
        }));
        expect(extracted).toEqual(expect.objectContaining({
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: 77,
            index: 5,
            src: 'data:image/png;base64,UkVTVUxU',
        }));
        expect(exactLog).toEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'GEMINI_SEND_SUCCESS',
        }));
        expect(imageFoundLog.extra).toEqual({ urlKind: '[redacted]', host: 'cdn.gemini.test', hasQuery: true });
        expect(JSON.stringify(imageFoundLog)).not.toContain('signed-secret');
        expect(promptLog.extra).toEqual({ promptLen: '[redacted]' });
        expect(JSON.stringify(promptLog)).not.toContain('prompt-private-text');
    });

    test('CG-37: processa resultado blob sem usar o fallback do background', async () => {
        mountGeminiEditor({
            sendMode: 'exact',
            onSubmit: () => {
                setTimeout(() => {
                    appendGeneratedImage('blob:generated-result');
                }, 1300);
            },
        });

        global.fetch = jest.fn(async (url) => ({
            blob: async () => new Blob(['BLOB_OK'], { type: 'image/png' }),
        }));

        await loadScript({
            storage: { debugMode: true },
            responders: {
                GET_TAB_ID: () => ({ tabId: 321 }),
                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            },
        });

        await waitFor(() => collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0]);

        const extracted = collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0];
        expect(global.fetch).toHaveBeenCalledWith('blob:generated-result');
        expect(collectActions(sentMessages, 'FETCH_IMAGE_AS_BASE64')).toHaveLength(0);
        expect(extracted).toEqual(expect.objectContaining({
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: 77,
            index: 5,
            src: expect.stringMatching(/^data:image\/png;base64,/),
        }));
    });

    test('CG-25: usa o prompt de emergencia quando o job chega sem prompt valido', async () => {
        mountGeminiEditor({
            sendMode: 'exact',
            onSubmit: () => {
                setTimeout(() => {
                    appendGeneratedImage('https://cdn.gemini.test/result-fallback-prompt.png');
                }, 1300);
            },
        });

        await loadScript({
            storage: { debugMode: true },
            job: {
                mangaTabId: 77,
                index: 8,
                prompt: '   ',
            },
            responders: {
                GET_TAB_ID: () => ({ tabId: 321 }),
                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
                FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UFJPTVBUX09L' }),
            },
        });

        await waitFor(() => collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0]);

        const promptFallbackLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'PROMPT_FALLBACK'
        );

        expect(promptFallbackLog).toEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'PROMPT_FALLBACK',
        }));
        expect(promptFallbackLog.extra).toEqual(expect.objectContaining({ fallbackLength: expect.any(Number) }));
        expect(promptFallbackLog.extra).not.toHaveProperty('fallbackPrompt');
        expect(collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0]).toEqual(expect.objectContaining({
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: 77,
            index: 8,
        }));
    });

    test('CG-16: envia GEMINI_ERROR quando a aba de manga nao devolve a imagem', async () => {
        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';

        await loadScript({
            responders: {
                GET_TAB_ID: () => ({ tabId: 321 }),
                REQUEST_IMAGE_DATA: () => undefined,
            },
        });

        await waitFor(() => collectActions(sentMessages, 'GEMINI_ERROR')[0]);

        expect(collectActions(sentMessages, 'GEMINI_ERROR')[0]).toEqual(expect.objectContaining({
            action: 'GEMINI_ERROR',
            mangaTabId: 77,
            index: 5,
            error: expect.stringContaining('Sem resposta da aba do mangá'),
        }));
    });

    test('CG-12/CG-13: nao reivindica job de outra aba ao abrir Gemini manualmente', async () => {
        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';

        await loadScript({
            job: null,
            storage: {
                gemini_job_999: {
                    mangaTabId: 77,
                    index: 12,
                    prompt: 'Traducao orfa',
                    geminiTabId: 999,
                },
            },
            responders: {
                GET_TAB_ID: () => ({ tabId: 321 }),
                REQUEST_IMAGE_DATA: () => undefined,
            },
        });

        await advance(800);

        const data = await storageMock.get(null);
        expect(data.gemini_job_321).toBeUndefined();
        expect(data.gemini_job_999).toEqual(expect.objectContaining({
            mangaTabId: 77,
            index: 12,
            prompt: 'Traducao orfa',
        }));
        expect(collectActions(sentMessages, 'REQUEST_IMAGE_DATA')).toHaveLength(0);
        expect(collectActions(sentMessages, 'GEMINI_ERROR')).toHaveLength(0);
    });

    test('CG-30/CG-39: usa fallback MAIN-world e GEMINI_RESULT_URL quando a extracao HTTP falha', async () => {
        mountGeminiEditor({ sendMode: 'enter', onSubmit: () => {} });
        const triggerSend = jest.fn(() => {
            const editor = document.querySelector('.ql-editor');
            if (editor) editor.textContent = '';
            setTimeout(() => {
                appendGeneratedImage('https://cdn.gemini.test/result-fallback.png');
            }, 1300);
        });
        window.addEventListener('MANGA_TRANSLATOR_TRIGGER_SEND', triggerSend, { once: true });

        await loadScript({
            storage: { debugMode: true },
            responders: {
                GET_TAB_ID: () => ({ tabId: 321 }),
                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
                FETCH_IMAGE_AS_BASE64: () => ({}),
            },
        });

        await waitFor(() => collectActions(sentMessages, 'GEMINI_RESULT_URL')[0], { timeout: 35000 });

        const fallback = collectActions(sentMessages, 'GEMINI_RESULT_URL')[0];
        const fallbackLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_SEND_FALLBACK'
        );

        expect(fallback).toEqual(expect.objectContaining({
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 77,
            index: 5,
            url: 'https://cdn.gemini.test/result-fallback.png',
        }));
        expect(triggerSend).toHaveBeenCalledTimes(1);
        expect(fallbackLog).toEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'GEMINI_SEND_FALLBACK',
        }));
    }, 40000);

    test('CG-27/CG-35: detecta erro da UI e encaminha GEMINI_ERROR', async () => {
        mountGeminiEditor({
            sendMode: 'fuzzy',
            onSubmit: () => {
                const alert = document.createElement('div');
                alert.setAttribute('role', 'alert');
                alert.innerText = 'Falha do Gemini';
                // O Observer V2 exige visibilidade real. JSDOM não calcula
                // layout, então a fixture precisa representar um alerta que
                // ocuparia espaço na página em vez de enfraquecer a regra de produção.
                alert.getBoundingClientRect = () => ({
                    x: 0, y: 0, top: 0, left: 0,
                    right: 320, bottom: 48, width: 320, height: 48,
                    toJSON() { return this; },
                });
                document.body.appendChild(alert);
            },
        });

        await loadScript({
            storage: { debugMode: true },
            responders: {
                GET_TAB_ID: () => ({ tabId: 321 }),
                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            },
        });

        await waitFor(() => collectActions(sentMessages, 'GEMINI_ERROR')[0]);

        expect(collectActions(sentMessages, 'GEMINI_ERROR')[0]).toEqual(expect.objectContaining({
            action: 'GEMINI_ERROR',
            mangaTabId: 77,
            index: 5,
            error: expect.stringContaining('Retornou erro interface'),
        }));
        const errorLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_ERROR'
        );
        expect(errorLog).toEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'GEMINI_ERROR',
            level: 'error',
        }));
    });

    test('CG-36: encerra com GEMINI_ERROR quando o Observer V2 estoura o timeout de geração', async () => {
        mountGeminiEditor({
            sendMode: 'exact',
            onSubmit: () => {},
        });
        globalThis.__MT_GEMINI_GENERATION_TIMEOUT_MS__ = 80;

        await loadScript({
            storage: { debugMode: true },
            responders: {
                GET_TAB_ID: () => ({ tabId: 321 }),
                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),
            },
        });

        const timeoutError = await waitFor(() => collectActions(sentMessages, 'GEMINI_ERROR')
            .find(message => message.error === 'Tempo limite (4 min)'), { timeout: COVERAGE_MODE ? 30000 : 12000 });
        expect(processPromise).toBeInstanceOf(Promise);
        expect(await processPromise).toEqual(expect.objectContaining({ status: 'result_timeout' }));

        const timeoutLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_TIMEOUT'
        );

        expect(timeoutError).toEqual(expect.objectContaining({
            action: 'GEMINI_ERROR',
            mangaTabId: 77,
            index: 5,
            error: 'Tempo limite (4 min)',
        }));
        expect(timeoutLog).toEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'GEMINI_TIMEOUT',
        }));
        expect(collectActions(sentMessages, 'GEMINI_ERROR')).toEqual([timeoutError]);
    });

    test('CG-43/CG-52/CG-53: handler DELETE_CONVERSATION responde ok em modo debug', async () => {
        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';

        await loadScript({
            job: null,
            autoProcess: false,
            storage: { debugMode: true },
            responders: {
                GET_TAB_ID: () => undefined,
            },
        });

        const result = await dispatchContentMessage(runtimeMock, { action: 'DELETE_CONVERSATION' });
        const debugLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'DEBUG_MODE_SKIP'
        );

        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual({ ok: true });
        expect(debugLog).toEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'DEBUG_MODE_SKIP',
        }));
    });

    test('CG-44/CG-48/CG-49/CG-52/CG-53: handler DELETE_CONVERSATION percorre o DOM e confirma a exclusao', async () => {
        document.body.innerHTML = `
            <div id="conversation-row">
                <a href="/app/chat-1">Conversa atual</a>
                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>
            </div>
            <div id="delete-item" role="menuitem">Excluir</div>
            <button id="confirm-delete">Excluir</button>
        `;

        const optionsBtn = document.getElementById('options-btn');
        const deleteItem = document.getElementById('delete-item');
        const confirmBtn = document.getElementById('confirm-delete');

        optionsBtn.scrollIntoView = jest.fn();
        optionsBtn.click = jest.fn();
        deleteItem.click = jest.fn();
        confirmBtn.click = jest.fn(() => {
            document.getElementById('conversation-row')?.remove();
            window.location.pathname = '/app';
        });

        await loadScript({
            job: null,
            autoProcess: false,
            responders: {
                GET_TAB_ID: () => undefined,
            },
        });

        const result = await dispatchContentMessage(runtimeMock, { action: 'DELETE_CONVERSATION' });
        const deleteOkLog = sentMessages.find(message =>
            message && message.action === 'LOG_ENTRY' && message.action_name === 'DELETE_OK'
        );

        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual({ ok: true });
        expect(optionsBtn.click).toHaveBeenCalled();
        expect(deleteItem.click).toHaveBeenCalled();
        expect(confirmBtn.click).toHaveBeenCalled();
        expect(deleteOkLog).toEqual(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'DELETE_OK',
        }));
    });
});
```

## 12. Auditoria linha a linha

### Linha 1

- **Código:** `const path = require('path');`
- **Função:** Importa path para resolver, de forma independente do diretório corrente, os arquivos reais carregados pela suíte.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 2

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 3

- **Código:** `const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');`
- **Função:** Obtém os mocks compartilhados de chrome.runtime e chrome.storage usados para observar mensagens e persistência sem substituir a implementação Gemini.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 4

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 5

- **Código:** `const CONTENT_GEMINI_PATH = path.resolve(__dirname, '../../../extension/content/content_gemini.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 6

- **Código:** `const GEMINI_SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 7

- **Código:** `const GEMINI_DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 8

- **Código:** `const GEMINI_OBSERVER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/observer.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 9

- **Código:** `const GEMINI_EDITOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/editor.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 10

- **Código:** `const GEMINI_ATTACHMENT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/attachment.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 11

- **Código:** `const GEMINI_TEMP_CHAT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/temporary-chat.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 12

- **Código:** `const GEMINI_RESULT_EXTRACTOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/result-extractor.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 13

- **Código:** `const GEMINI_DELETION_PATH = path.resolve(__dirname, '../../../extension/content/gemini/deletion.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 14

- **Código:** `const GEMINI_JOB_RUNNER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/job-runner.js');`
- **Função:** Fixa o caminho do módulo real que será requerido dentro de jest.isolateModules; a suíte não copia sua implementação.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 15

- **Código:** `const COVERAGE_MODE = process.env.COVERAGE_MODE === '1';`
- **Função:** Detecta execução sob coverage para ampliar apenas o prazo de espera do cenário de timeout, sem mudar o contrato esperado.
- **Contexto:** imports, caminhos canônicos dos módulos reais e flag de coverage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 16

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 17

- **Código:** `function setWindowLocation(pathname = '/app/chat-1') {`
- **Função:** Declara o helper de teste que sustenta fixture de URL da página Gemini.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 18

- **Código:** `    Object.defineProperty(window, 'location', {`
- **Função:** Participa de fixture de URL da página Gemini; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 19

- **Código:** `        value: {`
- **Função:** Participa de fixture de URL da página Gemini; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 20

- **Código:** `            pathname,`
- **Função:** Participa de fixture de URL da página Gemini; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 21

- **Código:** `            href: \`https://gemini.test${pathname}\`,`
- **Função:** Participa de fixture de URL da página Gemini; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 22

- **Código:** `        },`
- **Função:** Participa de fixture de URL da página Gemini; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 23

- **Código:** `        configurable: true,`
- **Função:** Participa de fixture de URL da página Gemini; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 24

- **Código:** `        writable: true,`
- **Função:** Participa de fixture de URL da página Gemini; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 25

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de fixture de URL da página Gemini, preservando o escopo e a sequência do cenário.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 26

- **Código:** `}`
- **Função:** Fecha o bloco sintático de fixture de URL da página Gemini, preservando o escopo e a sequência do cenário.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 27

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** fixture de URL da página Gemini.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 28

- **Código:** `function installMissingDomApis() {`
- **Função:** Declara o helper de teste que sustenta polyfills controlados de APIs DOM ausentes no JSDOM.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 29

- **Código:** `    if (typeof window.HTMLElement !== 'undefined' && typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {`
- **Função:** Substitui scrollIntoView por spy/no-op compatível com JSDOM, preservando a chamada observável sem layout real.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 30

- **Código:** `        Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {`
- **Função:** Substitui scrollIntoView por spy/no-op compatível com JSDOM, preservando a chamada observável sem layout real.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 31

- **Código:** `            value: jest.fn(),`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 32

- **Código:** `            configurable: true,`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 33

- **Código:** `            writable: true,`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 34

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 35

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 36

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 37

- **Código:** `    if (typeof window.PointerEvent !== 'function') {`
- **Função:** Instala compatibilidade de PointerEvent usada pelas rotas reais de interação quando o JSDOM não oferece a API.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 38

- **Código:** `        window.PointerEvent = window.MouseEvent;`
- **Função:** Instala compatibilidade de PointerEvent usada pelas rotas reais de interação quando o JSDOM não oferece a API.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 39

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 40

- **Código:** `    if (typeof global.PointerEvent !== 'function') {`
- **Função:** Instala compatibilidade de PointerEvent usada pelas rotas reais de interação quando o JSDOM não oferece a API.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 41

- **Código:** `        global.PointerEvent = window.PointerEvent;`
- **Função:** Instala compatibilidade de PointerEvent usada pelas rotas reais de interação quando o JSDOM não oferece a API.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 42

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 43

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 44

- **Código:** `    if (typeof window.DataTransfer !== 'function') {`
- **Função:** Modela DataTransfer mínimo para paste/drop de arquivo e transporte de dados no harness.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 45

- **Código:** `        class MockDataTransfer {`
- **Função:** Modela DataTransfer mínimo para paste/drop de arquivo e transporte de dados no harness.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 46

- **Código:** `            constructor() {`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 47

- **Código:** `                const items = [];`
- **Função:** Declara dado intermediário usado em polyfills controlados de APIs DOM ausentes no JSDOM; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 48

- **Código:** `                items.add = (item) => items.push(item);`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 49

- **Código:** `                this.items = items;`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 50

- **Código:** `                this._data = new Map();`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 51

- **Código:** `            }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 52

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 53

- **Código:** `            setData(type, value) {`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 54

- **Código:** `                this._data.set(type, value);`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 55

- **Código:** `            }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 56

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 57

- **Código:** `            getData(type) {`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 58

- **Código:** `                return this._data.get(type) || '';`
- **Função:** Retorna o valor/envelope esperado pelo helper que sustenta polyfills controlados de APIs DOM ausentes no JSDOM.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 59

- **Código:** `            }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 60

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 61

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 62

- **Código:** `        window.DataTransfer = MockDataTransfer;`
- **Função:** Modela DataTransfer mínimo para paste/drop de arquivo e transporte de dados no harness.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 63

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 64

- **Código:** `    if (typeof global.DataTransfer !== 'function') {`
- **Função:** Modela DataTransfer mínimo para paste/drop de arquivo e transporte de dados no harness.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 65

- **Código:** `        global.DataTransfer = window.DataTransfer;`
- **Função:** Modela DataTransfer mínimo para paste/drop de arquivo e transporte de dados no harness.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 66

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 67

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 68

- **Código:** `    if (typeof window.ClipboardEvent !== 'function') {`
- **Função:** Modela ClipboardEvent mínimo para a injeção real de conteúdo via eventos.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 69

- **Código:** `        class MockClipboardEvent extends window.Event {`
- **Função:** Modela ClipboardEvent mínimo para a injeção real de conteúdo via eventos.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 70

- **Código:** `            constructor(type, init = {}) {`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 71

- **Código:** `                super(type, init);`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 72

- **Código:** `                this.clipboardData = init.clipboardData || null;`
- **Função:** Participa de polyfills controlados de APIs DOM ausentes no JSDOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 73

- **Código:** `            }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 74

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 75

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 76

- **Código:** `        window.ClipboardEvent = MockClipboardEvent;`
- **Função:** Modela ClipboardEvent mínimo para a injeção real de conteúdo via eventos.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 77

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 78

- **Código:** `    if (typeof global.ClipboardEvent !== 'function') {`
- **Função:** Modela ClipboardEvent mínimo para a injeção real de conteúdo via eventos.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 79

- **Código:** `        global.ClipboardEvent = window.ClipboardEvent;`
- **Função:** Modela ClipboardEvent mínimo para a injeção real de conteúdo via eventos.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 80

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 81

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 82

- **Código:** `    if (typeof window.InputEvent !== 'function') {`
- **Função:** Garante construtor InputEvent disponível para as rotas reais de edição.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 83

- **Código:** `        window.InputEvent = window.Event;`
- **Função:** Garante construtor InputEvent disponível para as rotas reais de edição.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 84

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 85

- **Código:** `    if (typeof global.InputEvent !== 'function') {`
- **Função:** Garante construtor InputEvent disponível para as rotas reais de edição.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 86

- **Código:** `        global.InputEvent = window.InputEvent;`
- **Função:** Garante construtor InputEvent disponível para as rotas reais de edição.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 87

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 88

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 89

- **Código:** `    if (typeof global.atob !== 'function') {`
- **Função:** Disponibiliza decodificação base64 usada pelo pipeline de anexos quando o ambiente global não a fornece.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 90

- **Código:** `        global.atob = (value) => Buffer.from(value, 'base64').toString('binary');`
- **Função:** Disponibiliza decodificação base64 usada pelo pipeline de anexos quando o ambiente global não a fornece.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 91

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 92

- **Código:** `}`
- **Função:** Fecha o bloco sintático de polyfills controlados de APIs DOM ausentes no JSDOM, preservando o escopo e a sequência do cenário.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — compatibilidade de ambiente usada condicionalmente; não há assertion focal para cada polyfill.

### Linha 93

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polyfills controlados de APIs DOM ausentes no JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 94

- **Código:** `function appendGeneratedImage(src) {`
- **Função:** Declara o helper de teste que sustenta fixture de imagem gerada dentro de model-response.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 95

- **Código:** `    const img = document.createElement('img');`
- **Função:** Cria elemento de imagem que representa saída visual do modelo ou thumbnail da fixture.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 96

- **Código:** `    img.src = src;`
- **Função:** Participa de fixture de imagem gerada dentro de model-response; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 97

- **Código:** `    img.scrollIntoView = jest.fn();`
- **Função:** Substitui scrollIntoView por spy/no-op compatível com JSDOM, preservando a chamada observável sem layout real.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 98

- **Código:** `    Object.defineProperty(img, 'naturalWidth', { value: 1024, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 99

- **Código:** `    Object.defineProperty(img, 'naturalHeight', { value: 1536, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 100

- **Código:** `    Object.defineProperty(img, 'complete', { value: true, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 101

- **Código:** `    const response = document.createElement('model-response');`
- **Função:** Cria o contêiner semântico que o observer real reconhece como resposta do modelo.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 102

- **Código:** `    response.setAttribute('data-message-author', 'model');`
- **Função:** Marca a resposta como pertencente ao modelo para satisfazer a política real de ownership da imagem.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 103

- **Código:** `    response.appendChild(img);`
- **Função:** Participa de fixture de imagem gerada dentro de model-response; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 104

- **Código:** `    document.body.appendChild(response);`
- **Função:** Participa de fixture de imagem gerada dentro de model-response; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 105

- **Código:** `    return img;`
- **Função:** Retorna o valor/envelope esperado pelo helper que sustenta fixture de imagem gerada dentro de model-response.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 106

- **Código:** `}`
- **Função:** Fecha o bloco sintático de fixture de imagem gerada dentro de model-response, preservando o escopo e a sequência do cenário.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 107

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** fixture de imagem gerada dentro de model-response.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 108

- **Código:** `function makeVisible(element, width = 160, height = 48) {`
- **Função:** Declara o helper de teste que sustenta fixture de geometria/visibilidade.
- **Contexto:** fixture de geometria/visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 109

- **Código:** `    element.getBoundingClientRect = () => ({`
- **Função:** Fornece geometria não nula porque JSDOM não calcula layout; isso permite exercitar os guards reais de visibilidade.
- **Contexto:** fixture de geometria/visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 110

- **Código:** `        x: 0, y: 0, top: 0, left: 0, right: width, bottom: height,`
- **Função:** Participa de fixture de geometria/visibilidade; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de geometria/visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 111

- **Código:** `        width, height, toJSON() { return this; },`
- **Função:** Participa de fixture de geometria/visibilidade; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** fixture de geometria/visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 112

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de fixture de geometria/visibilidade, preservando o escopo e a sequência do cenário.
- **Contexto:** fixture de geometria/visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 113

- **Código:** `    return element;`
- **Função:** Retorna o valor/envelope esperado pelo helper que sustenta fixture de geometria/visibilidade.
- **Contexto:** fixture de geometria/visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 114

- **Código:** `}`
- **Função:** Fecha o bloco sintático de fixture de geometria/visibilidade, preservando o escopo e a sequência do cenário.
- **Contexto:** fixture de geometria/visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 115

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** fixture de geometria/visibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 116

- **Código:** `function mountGeminiEditor({ sendMode = 'exact', onSubmit } = {}) {`
- **Função:** Declara o helper de teste que sustenta editor Gemini sintético, paste/drop e modos de envio.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 117

- **Código:** `    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"><p></p></div><div class="momentary-indicator">conversa momentânea</div>';`
- **Função:** Monta/localiza o editor compatível com os seletores reais usados pelo RPA.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 118

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 119

- **Código:** `    const editor = document.querySelector('.ql-editor');`
- **Função:** Monta/localiza o editor compatível com os seletores reais usados pelo RPA.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 120

- **Código:** `    makeVisible(editor, 640, 120);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 121

- **Código:** `    editor.focus = jest.fn();`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 122

- **Código:** `    editor.scrollIntoView = jest.fn();`
- **Função:** Substitui scrollIntoView por spy/no-op compatível com JSDOM, preservando a chamada observável sem layout real.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 123

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 124

- **Código:** `    editor.addEventListener('paste', (event) => {`
- **Função:** Simula a reação do editor ao paste: texto vira conteúdo editável e arquivo cria preview observável.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 125

- **Código:** `        const clipboardData = event.clipboardData;`
- **Função:** Declara dado intermediário usado em editor Gemini sintético, paste/drop e modos de envio; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 126

- **Código:** `        const pastedText = clipboardData && typeof clipboardData.getData === 'function'`
- **Função:** Declara dado intermediário usado em editor Gemini sintético, paste/drop e modos de envio; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 127

- **Código:** `            ? clipboardData.getData('text/plain')`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 128

- **Código:** `            : '';`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 129

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 130

- **Código:** `        if (pastedText) {`
- **Função:** Aplica um guard do harness em editor Gemini sintético, paste/drop e modos de envio para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 131

- **Código:** `            const pTag = editor.querySelector('p') || editor;`
- **Função:** Declara dado intermediário usado em editor Gemini sintético, paste/drop e modos de envio; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 132

- **Código:** `            pTag.textContent = pastedText;`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 133

- **Código:** `            return;`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 134

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 135

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 136

- **Código:** `        if (clipboardData && clipboardData.items && clipboardData.items.length > 0) {`
- **Função:** Aplica um guard do harness em editor Gemini sintético, paste/drop e modos de envio para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 137

- **Código:** `            let preview = document.querySelector('file-preview');`
- **Função:** Obtém o nó da fixture que a implementação real deve localizar/interagir.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 138

- **Código:** `            if (!preview) {`
- **Função:** Aplica um guard do harness em editor Gemini sintético, paste/drop e modos de envio para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 139

- **Código:** `                preview = document.createElement('file-preview');`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 140

- **Código:** `                const thumbImg = document.createElement('img');`
- **Função:** Cria elemento de imagem que representa saída visual do modelo ou thumbnail da fixture.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 141

- **Código:** `                thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 142

- **Código:** `                Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 143

- **Código:** `                Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 144

- **Código:** `                Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 145

- **Código:** `                makeVisible(preview, 120, 90);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 146

- **Código:** `                preview.appendChild(thumbImg);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 147

- **Código:** `                document.body.appendChild(preview);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 148

- **Código:** `            }`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 149

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 150

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 151

- **Código:** `    editor.addEventListener('drop', (event) => {`
- **Função:** Simula a rota alternativa de drop de arquivo, criando preview somente se ainda não existir.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 152

- **Código:** `        const transfer = event.dataTransfer;`
- **Função:** Declara dado intermediário usado em editor Gemini sintético, paste/drop e modos de envio; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 153

- **Código:** `        if (!transfer?.items?.length || document.querySelector('file-preview')) return;`
- **Função:** Obtém o nó da fixture que a implementação real deve localizar/interagir.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 154

- **Código:** `        const preview = document.createElement('file-preview');`
- **Função:** Declara dado intermediário usado em editor Gemini sintético, paste/drop e modos de envio; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 155

- **Código:** `        const thumbImg = document.createElement('img');`
- **Função:** Cria elemento de imagem que representa saída visual do modelo ou thumbnail da fixture.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 156

- **Código:** `        thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 157

- **Código:** `        Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 158

- **Código:** `        Object.defineProperty(thumbImg, 'naturalWidth', { value: 80, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 159

- **Código:** `        Object.defineProperty(thumbImg, 'naturalHeight', { value: 80, configurable: true });`
- **Função:** Define metadados de imagem que fazem a fixture se comportar como asset carregado e dimensionalmente válido.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 160

- **Código:** `        makeVisible(preview, 120, 90);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 161

- **Código:** `        preview.appendChild(thumbImg);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 162

- **Código:** `        document.body.appendChild(preview);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 163

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 164

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 165

- **Código:** `    editor.addEventListener('keydown', (event) => {`
- **Função:** Permite ao modo enter observar a tecla Enter como submit na fixture.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 166

- **Código:** `        if (sendMode === 'enter' && event.key === 'Enter') {`
- **Função:** Aplica um guard do harness em editor Gemini sintético, paste/drop e modos de envio para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 167

- **Código:** `            onSubmit();`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 168

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 169

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 170

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 171

- **Código:** `    let sendButton = null;`
- **Função:** Declara dado intermediário usado em editor Gemini sintético, paste/drop e modos de envio; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 172

- **Código:** `    if (sendMode !== 'enter') {`
- **Função:** Aplica um guard do harness em editor Gemini sintético, paste/drop e modos de envio para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 173

- **Código:** `        sendButton = document.createElement('button');`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 174

- **Código:** `        if (sendMode === 'exact') {`
- **Função:** Aplica um guard do harness em editor Gemini sintético, paste/drop e modos de envio para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 175

- **Código:** `            sendButton.setAttribute('aria-label', 'send message');`
- **Função:** Controla se o botão casa exatamente ou apenas de forma aproximada com os seletores de envio.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 176

- **Código:** `        } else {`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 177

- **Código:** `            sendButton.setAttribute('aria-label', 'enviar agora');`
- **Função:** Controla se o botão casa exatamente ou apenas de forma aproximada com os seletores de envio.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 178

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 179

- **Código:** `        sendButton.click = jest.fn(() => {`
- **Função:** Instrumenta o clique para permitir que a implementação real dispare submit e para tornar a interação verificável.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 180

- **Código:** `            editor.textContent = '';`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 181

- **Código:** `            onSubmit();`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 182

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 183

- **Código:** `        makeVisible(sendButton, 40, 40);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 184

- **Código:** `        document.body.appendChild(sendButton);`
- **Função:** Participa de editor Gemini sintético, paste/drop e modos de envio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 185

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 186

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 187

- **Código:** `    return { editor, sendButton };`
- **Função:** Retorna o valor/envelope esperado pelo helper que sustenta editor Gemini sintético, paste/drop e modos de envio.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 188

- **Código:** `}`
- **Função:** Fecha o bloco sintático de editor Gemini sintético, paste/drop e modos de envio, preservando o escopo e a sequência do cenário.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 189

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** editor Gemini sintético, paste/drop e modos de envio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 190

- **Código:** `function delay(ms = 0) {`
- **Função:** Declara o helper de teste que sustenta helpers assíncronos de avanço.
- **Contexto:** helpers assíncronos de avanço.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 191

- **Código:** `    return new Promise(resolve => setTimeout(resolve, ms));`
- **Função:** Converte callback/evento assíncrono em Promise controlada pelo teste.
- **Contexto:** helpers assíncronos de avanço.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 192

- **Código:** `}`
- **Função:** Fecha o bloco sintático de helpers assíncronos de avanço, preservando o escopo e a sequência do cenário.
- **Contexto:** helpers assíncronos de avanço.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 193

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** helpers assíncronos de avanço.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 194

- **Código:** `async function advance(ms = 0) {`
- **Função:** Declara o helper de teste que sustenta helpers assíncronos de avanço.
- **Contexto:** helpers assíncronos de avanço.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 195

- **Código:** `    await delay(ms);`
- **Função:** Participa de helpers assíncronos de avanço; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** helpers assíncronos de avanço.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 196

- **Código:** `}`
- **Função:** Fecha o bloco sintático de helpers assíncronos de avanço, preservando o escopo e a sequência do cenário.
- **Contexto:** helpers assíncronos de avanço.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 197

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** helpers assíncronos de avanço.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 198

- **Código:** `async function waitFor(predicate, { timeout = 8000, step = 50 } = {}) {`
- **Função:** Declara o helper de teste que sustenta polling com timeout explícito.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 199

- **Código:** `    let elapsed = 0;`
- **Função:** Declara dado intermediário usado em polling com timeout explícito; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 200

- **Código:** `    while (elapsed <= timeout) {`
- **Função:** Implementa polling limitado; evita espera infinita do próprio harness.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 201

- **Código:** `        const result = await predicate();`
- **Função:** Declara dado intermediário usado em polling com timeout explícito; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 202

- **Código:** `        if (result) return result;`
- **Função:** Aplica um guard do harness em polling com timeout explícito para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 203

- **Código:** `        await advance(step);`
- **Função:** Participa de polling com timeout explícito; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 204

- **Código:** `        elapsed += step;`
- **Função:** Participa de polling com timeout explícito; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 205

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de polling com timeout explícito, preservando o escopo e a sequência do cenário.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 206

- **Código:** `    throw new Error('Timeout aguardando condicao');`
- **Função:** Falha o teste de forma explícita quando a ação esperada não surge dentro do prazo.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 207

- **Código:** `}`
- **Função:** Fecha o bloco sintático de polling com timeout explícito, preservando o escopo e a sequência do cenário.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 208

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** polling com timeout explícito.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 209

- **Código:** `function collectActions(messages, action) {`
- **Função:** Declara o helper de teste que sustenta filtro de mensagens por action.
- **Contexto:** filtro de mensagens por action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 210

- **Código:** `    return messages.filter(message => message && message.action === action);`
- **Função:** Seleciona somente mensagens com a action pedida, reduzindo a verificação a um contrato IPC específico.
- **Contexto:** filtro de mensagens por action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 211

- **Código:** `}`
- **Função:** Fecha o bloco sintático de filtro de mensagens por action, preservando o escopo e a sequência do cenário.
- **Contexto:** filtro de mensagens por action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 212

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** filtro de mensagens por action.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 213

- **Código:** `function dispatchContentMessage(runtimeMock, request, sender = { tab: null }) {`
- **Função:** Declara o helper de teste que sustenta dispatcher do listener chrome.runtime e semântica keepAlive.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 214

- **Código:** `    return new Promise((resolve) => {`
- **Função:** Converte callback/evento assíncrono em Promise controlada pelo teste.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 215

- **Código:** `        const listeners = runtimeMock._messageListeners || [];`
- **Função:** Lê o registry do mock para invocar o listener real que content_gemini registrou.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 216

- **Código:** `        if (listeners.length === 0) {`
- **Função:** Aplica um guard do harness em dispatcher do listener chrome.runtime e semântica keepAlive para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 217

- **Código:** `            resolve({ keepAlive: false, response: undefined });`
- **Função:** Preserva o booleano retornado pelo listener para provar a semântica de canal assíncrono.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 218

- **Código:** `            return;`
- **Função:** Participa de dispatcher do listener chrome.runtime e semântica keepAlive; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 219

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de dispatcher do listener chrome.runtime e semântica keepAlive, preservando o escopo e a sequência do cenário.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 220

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 221

- **Código:** `        let settled = false;`
- **Função:** Declara dado intermediário usado em dispatcher do listener chrome.runtime e semântica keepAlive; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 222

- **Código:** `        let keepAlive = false;`
- **Função:** Preserva o booleano retornado pelo listener para provar a semântica de canal assíncrono.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 223

- **Código:** `        const sendResponse = (response) => {`
- **Função:** Captura a resposta assíncrona do listener e resolve o envelope usado pelas assertions de DELETE_CONVERSATION.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 224

- **Código:** `            settled = true;`
- **Função:** Participa de dispatcher do listener chrome.runtime e semântica keepAlive; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 225

- **Código:** `            resolve({ keepAlive, response });`
- **Função:** Preserva o booleano retornado pelo listener para provar a semântica de canal assíncrono.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 226

- **Código:** `        };`
- **Função:** Fecha o bloco sintático de dispatcher do listener chrome.runtime e semântica keepAlive, preservando o escopo e a sequência do cenário.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 227

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 228

- **Código:** `        keepAlive = listeners[listeners.length - 1](request, sender, sendResponse);`
- **Função:** Captura a resposta assíncrona do listener e resolve o envelope usado pelas assertions de DELETE_CONVERSATION.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 229

- **Código:** `        if (keepAlive === false && !settled) {`
- **Função:** Preserva o booleano retornado pelo listener para provar a semântica de canal assíncrono.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 230

- **Código:** `            resolve({ keepAlive, response: undefined });`
- **Função:** Preserva o booleano retornado pelo listener para provar a semântica de canal assíncrono.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 231

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de dispatcher do listener chrome.runtime e semântica keepAlive, preservando o escopo e a sequência do cenário.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 232

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de dispatcher do listener chrome.runtime e semântica keepAlive, preservando o escopo e a sequência do cenário.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 233

- **Código:** `}`
- **Função:** Fecha o bloco sintático de dispatcher do listener chrome.runtime e semântica keepAlive, preservando o escopo e a sequência do cenário.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 234

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** dispatcher do listener chrome.runtime e semântica keepAlive.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 235

- **Código:** `describe('content_gemini.js - RPA real do Gemini', () => {`
- **Função:** Agrupa os cenários que exercitam o RPA real do content script Gemini.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 236

- **Código:** `    let runtimeMock;`
- **Função:** Declara dado intermediário usado em escopo da suíte e variáveis compartilhadas; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 237

- **Código:** `    let storageMock;`
- **Função:** Declara dado intermediário usado em escopo da suíte e variáveis compartilhadas; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 238

- **Código:** `    let originalSendMessage;`
- **Função:** Declara dado intermediário usado em escopo da suíte e variáveis compartilhadas; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 239

- **Código:** `    let originalFetch;`
- **Função:** Declara dado intermediário usado em escopo da suíte e variáveis compartilhadas; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 240

- **Código:** `    let sentMessages;`
- **Função:** Declara dado intermediário usado em escopo da suíte e variáveis compartilhadas; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 241

- **Código:** `    let consoleErrorSpy;`
- **Função:** Silencia console.error esperado nos cenários negativos mantendo a emissão capturada pelo Jest.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 242

- **Código:** `    let processPromise;`
- **Função:** Declara dado intermediário usado em escopo da suíte e variáveis compartilhadas; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 243

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** escopo da suíte e variáveis compartilhadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 244

- **Código:** `    beforeEach(async () => {`
- **Função:** Inicializa isolamento por caso para impedir vazamento de módulos, DOM, storage e mensagens entre testes.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 245

- **Código:** `        jest.resetModules();`
- **Função:** Descarta o cache CommonJS para que cada teste carregue instâncias novas dos módulos reais.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 246

- **Código:** `        delete window.__mt_gemini_started;`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 247

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 248

- **Código:** `        installMissingDomApis();`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 249

- **Código:** `        jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({`
- **Função:** Fornece geometria não nula porque JSDOM não calcula layout; isso permite exercitar os guards reais de visibilidade.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 250

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 251

- **Código:** `            width: 160, height: 48, toJSON() { return this; },`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 252

- **Código:** `        }));`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 253

- **Código:** `        setWindowLocation('/app/chat-1');`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 254

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 255

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 256

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 257

- **Código:** `        originalSendMessage = runtimeMock.sendMessage;`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 258

- **Código:** `        originalFetch = global.fetch;`
- **Função:** Substitui somente a fronteira de rede; a decisão de usar fetch e converter o blob continua pertencendo ao módulo real.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 259

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 260

- **Código:** `        runtimeMock._messageListeners = [];`
- **Função:** Lê o registry do mock para invocar o listener real que content_gemini registrou.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 261

- **Código:** `        runtimeMock._connectListeners = [];`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 262

- **Código:** `        runtimeMock.lastError = null;`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 263

- **Código:** `        sentMessages = [];`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 264

- **Código:** `        processPromise = null;`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 265

- **Código:** `        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});`
- **Função:** Silencia console.error esperado nos cenários negativos mantendo a emissão capturada pelo Jest.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 266

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 267

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Participa de beforeEach: isolamento de módulos, runtime, storage e DOM; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 268

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa persistência simulada para impedir que jobs/flags de um caso contaminem o seguinte.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 269

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de beforeEach: isolamento de módulos, runtime, storage e DOM, preservando o escopo e a sequência do cenário.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 270

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** beforeEach: isolamento de módulos, runtime, storage e DOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 271

- **Código:** `    afterEach(async () => {`
- **Função:** Executa teardown explícito dos recursos assíncronos criados pelo RPA real.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 272

- **Código:** `        // Alguns cenários encerram assim que observam a mensagem esperada, enquanto`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 273

- **Código:** `        // o fluxo assíncrono real ainda pode manter o Observer V2 vivo. Pare todos`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 274

- **Código:** `        // os observers registrados antes de desmontar o DOM para não deixar timers`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 275

- **Código:** `        // periódicos/waiters presos no worker Jest.`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 276

- **Código:** `        const activeObserver = window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Declara dado intermediário usado em afterEach: parada de observers, espera do runner e limpeza; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 277

- **Código:** `        if (activeObserver && typeof activeObserver.stop === 'function') {`
- **Função:** Aplica um guard do harness em afterEach: parada de observers, espera do runner e limpeza para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 278

- **Código:** `            try { activeObserver.stop(); } catch (_error) {}`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 279

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de afterEach: parada de observers, espera do runner e limpeza, preservando o escopo e a sequência do cenário.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 280

- **Código:** `        delete window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 281

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 282

- **Código:** `        const observerRegistry = window.__mtGeminiObservers;`
- **Função:** Declara dado intermediário usado em afterEach: parada de observers, espera do runner e limpeza; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 283

- **Código:** `        if (observerRegistry && typeof observerRegistry === 'object') {`
- **Função:** Aplica um guard do harness em afterEach: parada de observers, espera do runner e limpeza para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 284

- **Código:** `            for (const observer of Object.values(observerRegistry)) {`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 285

- **Código:** `                if (observer && typeof observer.stop === 'function') {`
- **Função:** Aplica um guard do harness em afterEach: parada de observers, espera do runner e limpeza para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 286

- **Código:** `                    try { observer.stop(); } catch (_error) {}`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 287

- **Código:** `                }`
- **Função:** Fecha o bloco sintático de afterEach: parada de observers, espera do runner e limpeza, preservando o escopo e a sequência do cenário.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 288

- **Código:** `            }`
- **Função:** Fecha o bloco sintático de afterEach: parada de observers, espera do runner e limpeza, preservando o escopo e a sequência do cenário.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 289

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de afterEach: parada de observers, espera do runner e limpeza, preservando o escopo e a sequência do cenário.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 290

- **Código:** `        delete window.__mtGeminiObservers;`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 291

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 292

- **Código:** `        // The runner can still be unwinding after the expected message. Wait`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 293

- **Código:** `        // for it before the next test replaces the shared runtime mock.`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 294

- **Código:** `        if (processPromise) await processPromise.catch(() => {});`
- **Função:** Aplica um guard do harness em afterEach: parada de observers, espera do runner e limpeza para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 295

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 296

- **Código:** `        delete window.__mt_gemini_started;`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 297

- **Código:** `        delete globalThis.__MT_GEMINI_GENERATION_TIMEOUT_MS__;`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 298

- **Código:** `        runtimeMock.sendMessage = originalSendMessage;`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 299

- **Código:** `        global.fetch = originalFetch;`
- **Função:** Substitui somente a fronteira de rede; a decisão de usar fetch e converter o blob continua pertencendo ao módulo real.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 300

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 301

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa persistência simulada para impedir que jobs/flags de um caso contaminem o seguinte.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 302

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Participa de afterEach: parada de observers, espera do runner e limpeza; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 303

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de afterEach: parada de observers, espera do runner e limpeza, preservando o escopo e a sequência do cenário.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 304

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** afterEach: parada de observers, espera do runner e limpeza.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — teardown participa da estabilidade da suíte/worker, mas a maioria dos efeitos de limpeza não tem assertion linha a linha.

### Linha 305

- **Código:** `    async function loadScript({`
- **Função:** Declara o helper de teste que sustenta loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 306

- **Código:** `        tabId = 321,`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 307

- **Código:** `        pathname = '/app/chat-1',`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 308

- **Código:** `        job = {`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 309

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 310

- **Código:** `            index: 5,`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 311

- **Código:** `            prompt: 'Traduzir tudo para PT-BR',`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 312

- **Código:** `        },`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 313

- **Código:** `        storage = {},`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 314

- **Código:** `        responders = {},`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 315

- **Código:** `        autoProcess = true,`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 316

- **Código:** `    } = {}) {`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 317

- **Código:** `        setWindowLocation(pathname);`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 318

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 319

- **Código:** `        if (job) {`
- **Função:** Aplica um guard do harness em loadScript: prepara job/storage, injeta responders e carrega módulos reais para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 320

- **Código:** `            const normalizedJob = {`
- **Função:** Declara dado intermediário usado em loadScript: prepara job/storage, injeta responders e carrega módulos reais; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 321

- **Código:** `                jobId: \`job-${tabId}\`,`
- **Função:** Completa a identidade mínima do job para exercitar correlação e ownership na pilha real.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 322

- **Código:** `                batchId: 'batch-test',`
- **Função:** Completa a identidade mínima do job para exercitar correlação e ownership na pilha real.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 323

- **Código:** `                ...job,`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 324

- **Código:** `            };`
- **Função:** Fecha o bloco sintático de loadScript: prepara job/storage, injeta responders e carrega módulos reais, preservando o escopo e a sequência do cenário.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 325

- **Código:** `            await storageMock.set({`
- **Função:** Materializa no storage o job/estado que a implementação real descobrirá pelo tabId.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 326

- **Código:** `                [\`gemini_job_${tabId}\`]: normalizedJob,`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 327

- **Código:** `                ...storage,`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 328

- **Código:** `            });`
- **Função:** Fecha o bloco sintático de loadScript: prepara job/storage, injeta responders e carrega módulos reais, preservando o escopo e a sequência do cenário.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 329

- **Código:** `        } else {`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 330

- **Código:** `            await storageMock.set(storage);`
- **Função:** Materializa no storage o job/estado que a implementação real descobrirá pelo tabId.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 331

- **Código:** `        }`
- **Função:** Fecha o bloco sintático de loadScript: prepara job/storage, injeta responders e carrega módulos reais, preservando o escopo e a sequência do cenário.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 332

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 333

- **Código:** `        runtimeMock.sendMessage = jest.fn((message, callback) => {`
- **Função:** Intercepta IPC de saída, guarda cada mensagem e fornece respostas por action sem mockar o código Gemini.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 334

- **Código:** `            sentMessages.push(message);`
- **Função:** Registra a ordem e o payload das mensagens emitidas pela implementação real.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 335

- **Código:** `            const responder = responders[message.action];`
- **Função:** Seleciona a resposta simulada do background com base na action real emitida.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 336

- **Código:** `            if (typeof callback === 'function') {`
- **Função:** Aplica um guard do harness em loadScript: prepara job/storage, injeta responders e carrega módulos reais para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 337

- **Código:** `                callback(responder ? responder(message) : undefined);`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 338

- **Código:** `            }`
- **Função:** Fecha o bloco sintático de loadScript: prepara job/storage, injeta responders e carrega módulos reais, preservando o escopo e a sequência do cenário.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 339

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de loadScript: prepara job/storage, injeta responders e carrega módulos reais, preservando o escopo e a sequência do cenário.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 340

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 341

- **Código:** `        jest.isolateModules(() => {`
- **Função:** Carrega a pilha real em registro de módulos isolado, evitando estado global herdado de outro caso.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 342

- **Código:** `            require(GEMINI_SELECTORS_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 343

- **Código:** `            require(GEMINI_DOM_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 344

- **Código:** `            require(GEMINI_OBSERVER_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 345

- **Código:** `            require(GEMINI_EDITOR_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 346

- **Código:** `            require(GEMINI_ATTACHMENT_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 347

- **Código:** `            require(GEMINI_TEMP_CHAT_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 348

- **Código:** `            require(GEMINI_RESULT_EXTRACTOR_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 349

- **Código:** `            require(GEMINI_DELETION_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 350

- **Código:** `            require(GEMINI_JOB_RUNNER_PATH);`
- **Função:** Carrega o módulo real correspondente e registra suas APIs/globais antes de iniciar o job.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 351

- **Código:** `            const contentGemini = require(CONTENT_GEMINI_PATH);`
- **Função:** Declara dado intermediário usado em loadScript: prepara job/storage, injeta responders e carrega módulos reais; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 352

- **Código:** `            if (autoProcess) processPromise = contentGemini.processGeminiJob();`
- **Função:** Inicia o runner real e preserva a Promise para permitir sincronização/teardown e, em CG-36, assertion do resultado terminal.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 353

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de loadScript: prepara job/storage, injeta responders e carrega módulos reais, preservando o escopo e a sequência do cenário.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 354

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 355

- **Código:** `        await advance(0);`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 356

- **Código:** `        await advance(0);`
- **Função:** Participa de loadScript: prepara job/storage, injeta responders e carrega módulos reais; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 357

- **Código:** `    }`
- **Função:** Fecha o bloco sintático de loadScript: prepara job/storage, injeta responders e carrega módulos reais, preservando o escopo e a sequência do cenário.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 358

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** loadScript: prepara job/storage, injeta responders e carrega módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 359

- **Código:** `    test('CG-09/CG-15/CG-18/CG-20/CG-22/CG-26/CG-31/CG-38: processa job com botao exato e extracao HTTP via background', async () => {`
- **Função:** Abre o cenário CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 360

- **Código:** `        mountGeminiEditor({`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 361

- **Código:** `            sendMode: 'exact',`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 362

- **Código:** `            onSubmit: () => {`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 363

- **Código:** `                setTimeout(() => {`
- **Função:** Agenda comportamento assíncrono realista para que o polling/observer de produção precise aguardar a transição.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 364

- **Código:** `                    appendGeneratedImage('https://cdn.gemini.test/result-001.png?token=signed-secret');`
- **Função:** Insere resultado do modelo depois do submit para que o Observer V2 real precise descobri-lo.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 365

- **Código:** `                }, 1300);`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 366

- **Código:** `            },`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 367

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 368

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 369

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 370

- **Código:** `            storage: { debugMode: true },`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 371

- **Código:** `            job: {`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 372

- **Código:** `                mangaTabId: 77,`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 373

- **Código:** `                index: 5,`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 374

- **Código:** `                prompt: 'prompt-private-text',`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 375

- **Código:** `            },`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 376

- **Código:** `            responders: {`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 377

- **Código:** `                GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 378

- **Código:** `                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 379

- **Código:** `                FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UkVTVUxU' }),`
- **Função:** Emula a conversão remota via background e permite verificar quando essa rota deve ou não ser usada.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 380

- **Código:** `            },`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 381

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 382

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 383

- **Código:** `        await waitFor(() => collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0]);`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 384

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 385

- **Código:** `        const extracted = collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0];`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 386

- **Código:** `        const fetchCall = collectActions(sentMessages, 'FETCH_IMAGE_AS_BASE64')[0];`
- **Função:** Emula a conversão remota via background e permite verificar quando essa rota deve ou não ser usada.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 387

- **Código:** `        const exactLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 388

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_SEND_SUCCESS'`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 389

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 390

- **Código:** `        const imageFoundLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 391

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_IMG_FOUND'`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 392

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 393

- **Código:** `        const promptLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 394

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'PROMPT_INJECTED'`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 395

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 396

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 397

- **Código:** `        expect(fetchCall).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; se a condição mudar, este teste falha.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 398

- **Código:** `            action: 'FETCH_IMAGE_AS_BASE64',`
- **Função:** Emula a conversão remota via background e permite verificar quando essa rota deve ou não ser usada.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 399

- **Código:** `            url: 'https://cdn.gemini.test/result-001.png?token=signed-secret',`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 400

- **Código:** `        }));`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 401

- **Código:** `        expect(extracted).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; se a condição mudar, este teste falha.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 402

- **Código:** `            action: 'GEMINI_IMAGE_EXTRACTED',`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 403

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 404

- **Código:** `            index: 5,`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 405

- **Código:** `            src: 'data:image/png;base64,UkVTVUxU',`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 406

- **Código:** `        }));`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 407

- **Código:** `        expect(exactLog).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; se a condição mudar, este teste falha.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 408

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 409

- **Código:** `            action_name: 'GEMINI_SEND_SUCCESS',`
- **Função:** Seleciona o log de confirmação observável do envio.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 410

- **Código:** `        }));`
- **Função:** Participa de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 411

- **Código:** `        expect(imageFoundLog.extra).toEqual({ urlKind: '[redacted]', host: 'cdn.gemini.test', hasQuery: true });`
- **Função:** Compõe assertion direta do cenário CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; se a condição mudar, este teste falha.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 412

- **Código:** `        expect(JSON.stringify(imageFoundLog)).not.toContain('signed-secret');`
- **Função:** Compõe assertion direta do cenário CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; se a condição mudar, este teste falha.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 413

- **Código:** `        expect(promptLog.extra).toEqual({ promptLen: '[redacted]' });`
- **Função:** Compõe assertion direta do cenário CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; se a condição mudar, este teste falha.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 414

- **Código:** `        expect(JSON.stringify(promptLog)).not.toContain('prompt-private-text');`
- **Função:** Compõe assertion direta do cenário CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction; se a condição mudar, este teste falha.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 415

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 416

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-09/15/18/20/22/26/31/38: caminho feliz HTTP, envio exato e redaction.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 417

- **Código:** `    test('CG-37: processa resultado blob sem usar o fallback do background', async () => {`
- **Função:** Abre o cenário CG-37: resultado blob convertido localmente sem fallback background; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 418

- **Código:** `        mountGeminiEditor({`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 419

- **Código:** `            sendMode: 'exact',`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 420

- **Código:** `            onSubmit: () => {`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 421

- **Código:** `                setTimeout(() => {`
- **Função:** Agenda comportamento assíncrono realista para que o polling/observer de produção precise aguardar a transição.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 422

- **Código:** `                    appendGeneratedImage('blob:generated-result');`
- **Função:** Insere resultado do modelo depois do submit para que o Observer V2 real precise descobri-lo.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 423

- **Código:** `                }, 1300);`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 424

- **Código:** `            },`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 425

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-37: resultado blob convertido localmente sem fallback background, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 426

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 427

- **Código:** `        global.fetch = jest.fn(async (url) => ({`
- **Função:** Substitui somente a fronteira de rede; a decisão de usar fetch e converter o blob continua pertencendo ao módulo real.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 428

- **Código:** `            blob: async () => new Blob(['BLOB_OK'], { type: 'image/png' }),`
- **Função:** Fornece bytes de imagem sintéticos para provar a conversão local de blob em data URL.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 429

- **Código:** `        }));`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 430

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 431

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 432

- **Código:** `            storage: { debugMode: true },`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 433

- **Código:** `            responders: {`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 434

- **Código:** `                GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 435

- **Código:** `                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 436

- **Código:** `            },`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 437

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-37: resultado blob convertido localmente sem fallback background, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 438

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 439

- **Código:** `        await waitFor(() => collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0]);`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 440

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 441

- **Código:** `        const extracted = collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0];`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 442

- **Código:** `        expect(global.fetch).toHaveBeenCalledWith('blob:generated-result');`
- **Função:** Compõe assertion direta do cenário CG-37: resultado blob convertido localmente sem fallback background; se a condição mudar, este teste falha.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 443

- **Código:** `        expect(collectActions(sentMessages, 'FETCH_IMAGE_AS_BASE64')).toHaveLength(0);`
- **Função:** Emula a conversão remota via background e permite verificar quando essa rota deve ou não ser usada.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 444

- **Código:** `        expect(extracted).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-37: resultado blob convertido localmente sem fallback background; se a condição mudar, este teste falha.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 445

- **Código:** `            action: 'GEMINI_IMAGE_EXTRACTED',`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 446

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 447

- **Código:** `            index: 5,`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 448

- **Código:** `            src: expect.stringMatching(/^data:image\/png;base64,/),`
- **Função:** Compõe assertion direta do cenário CG-37: resultado blob convertido localmente sem fallback background; se a condição mudar, este teste falha.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 449

- **Código:** `        }));`
- **Função:** Participa de CG-37: resultado blob convertido localmente sem fallback background; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 450

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-37: resultado blob convertido localmente sem fallback background, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 451

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-37: resultado blob convertido localmente sem fallback background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 452

- **Código:** `    test('CG-25: usa o prompt de emergencia quando o job chega sem prompt valido', async () => {`
- **Função:** Abre o cenário CG-25: prompt de emergência e metadados redigidos; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 453

- **Código:** `        mountGeminiEditor({`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 454

- **Código:** `            sendMode: 'exact',`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 455

- **Código:** `            onSubmit: () => {`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 456

- **Código:** `                setTimeout(() => {`
- **Função:** Agenda comportamento assíncrono realista para que o polling/observer de produção precise aguardar a transição.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 457

- **Código:** `                    appendGeneratedImage('https://cdn.gemini.test/result-fallback-prompt.png');`
- **Função:** Insere resultado do modelo depois do submit para que o Observer V2 real precise descobri-lo.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 458

- **Código:** `                }, 1300);`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 459

- **Código:** `            },`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 460

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-25: prompt de emergência e metadados redigidos, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 461

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 462

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 463

- **Código:** `            storage: { debugMode: true },`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 464

- **Código:** `            job: {`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 465

- **Código:** `                mangaTabId: 77,`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 466

- **Código:** `                index: 8,`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 467

- **Código:** `                prompt: '   ',`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 468

- **Código:** `            },`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 469

- **Código:** `            responders: {`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 470

- **Código:** `                GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 471

- **Código:** `                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 472

- **Código:** `                FETCH_IMAGE_AS_BASE64: () => ({ dataUrl: 'data:image/png;base64,UFJPTVBUX09L' }),`
- **Função:** Emula a conversão remota via background e permite verificar quando essa rota deve ou não ser usada.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 473

- **Código:** `            },`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 474

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-25: prompt de emergência e metadados redigidos, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 475

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 476

- **Código:** `        await waitFor(() => collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0]);`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 477

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 478

- **Código:** `        const promptFallbackLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-25: prompt de emergência e metadados redigidos; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 479

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'PROMPT_FALLBACK'`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 480

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-25: prompt de emergência e metadados redigidos, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 481

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 482

- **Código:** `        expect(promptFallbackLog).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-25: prompt de emergência e metadados redigidos; se a condição mudar, este teste falha.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 483

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 484

- **Código:** `            action_name: 'PROMPT_FALLBACK',`
- **Função:** Seleciona o log que comprova a ativação do fallback de prompt sem expor o texto sensível.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 485

- **Código:** `        }));`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 486

- **Código:** `        expect(promptFallbackLog.extra).toEqual(expect.objectContaining({ fallbackLength: expect.any(Number) }));`
- **Função:** Compõe assertion direta do cenário CG-25: prompt de emergência e metadados redigidos; se a condição mudar, este teste falha.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 487

- **Código:** `        expect(promptFallbackLog.extra).not.toHaveProperty('fallbackPrompt');`
- **Função:** Compõe assertion direta do cenário CG-25: prompt de emergência e metadados redigidos; se a condição mudar, este teste falha.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 488

- **Código:** `        expect(collectActions(sentMessages, 'GEMINI_IMAGE_EXTRACTED')[0]).toEqual(expect.objectContaining({`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 489

- **Código:** `            action: 'GEMINI_IMAGE_EXTRACTED',`
- **Função:** Observa/valida a entrega final de imagem extraída de volta ao fluxo do mangá.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 490

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 491

- **Código:** `            index: 8,`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 492

- **Código:** `        }));`
- **Função:** Participa de CG-25: prompt de emergência e metadados redigidos; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 493

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-25: prompt de emergência e metadados redigidos, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 494

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-25: prompt de emergência e metadados redigidos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 495

- **Código:** `    test('CG-16: envia GEMINI_ERROR quando a aba de manga nao devolve a imagem', async () => {`
- **Função:** Abre o cenário CG-16: ausência de imagem de origem vira GEMINI_ERROR; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 496

- **Código:** `        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';`
- **Função:** Monta/localiza o editor compatível com os seletores reais usados pelo RPA.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 497

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 498

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-16: ausência de imagem de origem vira GEMINI_ERROR; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 499

- **Código:** `            responders: {`
- **Função:** Participa de CG-16: ausência de imagem de origem vira GEMINI_ERROR; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 500

- **Código:** `                GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 501

- **Código:** `                REQUEST_IMAGE_DATA: () => undefined,`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 502

- **Código:** `            },`
- **Função:** Participa de CG-16: ausência de imagem de origem vira GEMINI_ERROR; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 503

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-16: ausência de imagem de origem vira GEMINI_ERROR, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 504

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 505

- **Código:** `        await waitFor(() => collectActions(sentMessages, 'GEMINI_ERROR')[0]);`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 506

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 507

- **Código:** `        expect(collectActions(sentMessages, 'GEMINI_ERROR')[0]).toEqual(expect.objectContaining({`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 508

- **Código:** `            action: 'GEMINI_ERROR',`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 509

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de CG-16: ausência de imagem de origem vira GEMINI_ERROR; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 510

- **Código:** `            index: 5,`
- **Função:** Participa de CG-16: ausência de imagem de origem vira GEMINI_ERROR; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 511

- **Código:** `            error: expect.stringContaining('Sem resposta da aba do mangá'),`
- **Função:** Compõe assertion direta do cenário CG-16: ausência de imagem de origem vira GEMINI_ERROR; se a condição mudar, este teste falha.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 512

- **Código:** `        }));`
- **Função:** Participa de CG-16: ausência de imagem de origem vira GEMINI_ERROR; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 513

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-16: ausência de imagem de origem vira GEMINI_ERROR, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 514

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-16: ausência de imagem de origem vira GEMINI_ERROR.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 515

- **Código:** `    test('CG-12/CG-13: nao reivindica job de outra aba ao abrir Gemini manualmente', async () => {`
- **Função:** Abre o cenário CG-12/13: aba Gemini manual não reivindica job alheio; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 516

- **Código:** `        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';`
- **Função:** Monta/localiza o editor compatível com os seletores reais usados pelo RPA.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 517

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 518

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 519

- **Código:** `            job: null,`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 520

- **Código:** `            storage: {`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 521

- **Código:** `                gemini_job_999: {`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 522

- **Código:** `                    mangaTabId: 77,`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 523

- **Código:** `                    index: 12,`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 524

- **Código:** `                    prompt: 'Traducao orfa',`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 525

- **Código:** `                    geminiTabId: 999,`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 526

- **Código:** `                },`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 527

- **Código:** `            },`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 528

- **Código:** `            responders: {`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 529

- **Código:** `                GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 530

- **Código:** `                REQUEST_IMAGE_DATA: () => undefined,`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 531

- **Código:** `            },`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 532

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-12/13: aba Gemini manual não reivindica job alheio, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 533

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 534

- **Código:** `        await advance(800);`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 535

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 536

- **Código:** `        const data = await storageMock.get(null);`
- **Função:** Declara dado intermediário usado em CG-12/13: aba Gemini manual não reivindica job alheio; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 537

- **Código:** `        expect(data.gemini_job_321).toBeUndefined();`
- **Função:** Compõe assertion direta do cenário CG-12/13: aba Gemini manual não reivindica job alheio; se a condição mudar, este teste falha.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 538

- **Código:** `        expect(data.gemini_job_999).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-12/13: aba Gemini manual não reivindica job alheio; se a condição mudar, este teste falha.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 539

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 540

- **Código:** `            index: 12,`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 541

- **Código:** `            prompt: 'Traducao orfa',`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 542

- **Código:** `        }));`
- **Função:** Participa de CG-12/13: aba Gemini manual não reivindica job alheio; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 543

- **Código:** `        expect(collectActions(sentMessages, 'REQUEST_IMAGE_DATA')).toHaveLength(0);`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 544

- **Código:** `        expect(collectActions(sentMessages, 'GEMINI_ERROR')).toHaveLength(0);`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 545

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-12/13: aba Gemini manual não reivindica job alheio, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 546

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-12/13: aba Gemini manual não reivindica job alheio.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 547

- **Código:** `    test('CG-30/CG-39: usa fallback MAIN-world e GEMINI_RESULT_URL quando a extracao HTTP falha', async () => {`
- **Função:** Abre o cenário CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 548

- **Código:** `        mountGeminiEditor({ sendMode: 'enter', onSubmit: () => {} });`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 549

- **Código:** `        const triggerSend = jest.fn(() => {`
- **Função:** Declara dado intermediário usado em CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 550

- **Código:** `            const editor = document.querySelector('.ql-editor');`
- **Função:** Monta/localiza o editor compatível com os seletores reais usados pelo RPA.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 551

- **Código:** `            if (editor) editor.textContent = '';`
- **Função:** Aplica um guard do harness em CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL para só simular a capacidade/ramo quando a condição correspondente ocorre.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 552

- **Código:** `            setTimeout(() => {`
- **Função:** Agenda comportamento assíncrono realista para que o polling/observer de produção precise aguardar a transição.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 553

- **Código:** `                appendGeneratedImage('https://cdn.gemini.test/result-fallback.png');`
- **Função:** Insere resultado do modelo depois do submit para que o Observer V2 real precise descobri-lo.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 554

- **Código:** `            }, 1300);`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 555

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 556

- **Código:** `        window.addEventListener('MANGA_TRANSLATOR_TRIGGER_SEND', triggerSend, { once: true });`
- **Função:** Escuta o evento MAIN-world disparado pela implementação para simular o submit que o mundo isolado não consegue efetuar diretamente.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 557

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 558

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 559

- **Código:** `            storage: { debugMode: true },`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 560

- **Código:** `            responders: {`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 561

- **Código:** `                GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 562

- **Código:** `                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 563

- **Código:** `                FETCH_IMAGE_AS_BASE64: () => ({}),`
- **Função:** Emula a conversão remota via background e permite verificar quando essa rota deve ou não ser usada.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 564

- **Código:** `            },`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 565

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 566

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 567

- **Código:** `        await waitFor(() => collectActions(sentMessages, 'GEMINI_RESULT_URL')[0], { timeout: 35000 });`
- **Função:** Observa/valida o fallback que registra apenas a URL do resultado quando a extração direta falha.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 568

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 569

- **Código:** `        const fallback = collectActions(sentMessages, 'GEMINI_RESULT_URL')[0];`
- **Função:** Observa/valida o fallback que registra apenas a URL do resultado quando a extração direta falha.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 570

- **Código:** `        const fallbackLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 571

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_SEND_FALLBACK'`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 572

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 573

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 574

- **Código:** `        expect(fallback).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; se a condição mudar, este teste falha.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 575

- **Código:** `            action: 'GEMINI_RESULT_URL',`
- **Função:** Observa/valida o fallback que registra apenas a URL do resultado quando a extração direta falha.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 576

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 577

- **Código:** `            index: 5,`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 578

- **Código:** `            url: 'https://cdn.gemini.test/result-fallback.png',`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 579

- **Código:** `        }));`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 580

- **Código:** `        expect(triggerSend).toHaveBeenCalledTimes(1);`
- **Função:** Compõe assertion direta do cenário CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; se a condição mudar, este teste falha.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 581

- **Código:** `        expect(fallbackLog).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; se a condição mudar, este teste falha.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 582

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 583

- **Código:** `            action_name: 'GEMINI_SEND_FALLBACK',`
- **Função:** Seleciona o log de elevação para MAIN-world quando a rota primária de envio não confirma.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 584

- **Código:** `        }));`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 585

- **Código:** `    }, 40000);`
- **Função:** Participa de CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 586

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-30/39: fallback MAIN-world e registro GEMINI_RESULT_URL.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 587

- **Código:** `    test('CG-27/CG-35: detecta erro da UI e encaminha GEMINI_ERROR', async () => {`
- **Função:** Abre o cenário CG-27/35: erro visível da UI vira entrega de erro; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 588

- **Código:** `        mountGeminiEditor({`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 589

- **Código:** `            sendMode: 'fuzzy',`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 590

- **Código:** `            onSubmit: () => {`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 591

- **Código:** `                const alert = document.createElement('div');`
- **Função:** Declara dado intermediário usado em CG-27/35: erro visível da UI vira entrega de erro; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 592

- **Código:** `                alert.setAttribute('role', 'alert');`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 593

- **Código:** `                alert.innerText = 'Falha do Gemini';`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 594

- **Código:** `                // O Observer V2 exige visibilidade real. JSDOM não calcula`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 595

- **Código:** `                // layout, então a fixture precisa representar um alerta que`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 596

- **Código:** `                // ocuparia espaço na página em vez de enfraquecer a regra de produção.`
- **Função:** Registra a intenção operacional do harness/cleanup para evitar interpretar o comportamento apenas pela sintaxe.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 597

- **Código:** `                alert.getBoundingClientRect = () => ({`
- **Função:** Fornece geometria não nula porque JSDOM não calcula layout; isso permite exercitar os guards reais de visibilidade.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 598

- **Código:** `                    x: 0, y: 0, top: 0, left: 0,`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 599

- **Código:** `                    right: 320, bottom: 48, width: 320, height: 48,`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 600

- **Código:** `                    toJSON() { return this; },`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 601

- **Código:** `                });`
- **Função:** Fecha o bloco sintático de CG-27/35: erro visível da UI vira entrega de erro, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 602

- **Código:** `                document.body.appendChild(alert);`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 603

- **Código:** `            },`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 604

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-27/35: erro visível da UI vira entrega de erro, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 605

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 606

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 607

- **Código:** `            storage: { debugMode: true },`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 608

- **Código:** `            responders: {`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 609

- **Código:** `                GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 610

- **Código:** `                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 611

- **Código:** `            },`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 612

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-27/35: erro visível da UI vira entrega de erro, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 613

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 614

- **Código:** `        await waitFor(() => collectActions(sentMessages, 'GEMINI_ERROR')[0]);`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 615

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 616

- **Código:** `        expect(collectActions(sentMessages, 'GEMINI_ERROR')[0]).toEqual(expect.objectContaining({`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 617

- **Código:** `            action: 'GEMINI_ERROR',`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 618

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 619

- **Código:** `            index: 5,`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 620

- **Código:** `            error: expect.stringContaining('Retornou erro interface'),`
- **Função:** Compõe assertion direta do cenário CG-27/35: erro visível da UI vira entrega de erro; se a condição mudar, este teste falha.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 621

- **Código:** `        }));`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 622

- **Código:** `        const errorLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-27/35: erro visível da UI vira entrega de erro; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 623

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_ERROR'`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 624

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-27/35: erro visível da UI vira entrega de erro, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 625

- **Código:** `        expect(errorLog).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-27/35: erro visível da UI vira entrega de erro; se a condição mudar, este teste falha.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 626

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 627

- **Código:** `            action_name: 'GEMINI_ERROR',`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 628

- **Código:** `            level: 'error',`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 629

- **Código:** `        }));`
- **Função:** Participa de CG-27/35: erro visível da UI vira entrega de erro; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 630

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-27/35: erro visível da UI vira entrega de erro, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 631

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-27/35: erro visível da UI vira entrega de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 632

- **Código:** `    test('CG-36: encerra com GEMINI_ERROR quando o Observer V2 estoura o timeout de geração', async () => {`
- **Função:** Abre o cenário CG-36: timeout do Observer V2 e término result_timeout; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 633

- **Código:** `        mountGeminiEditor({`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 634

- **Código:** `            sendMode: 'exact',`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 635

- **Código:** `            onSubmit: () => {},`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 636

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-36: timeout do Observer V2 e término result_timeout, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 637

- **Código:** `        globalThis.__MT_GEMINI_GENERATION_TIMEOUT_MS__ = 80;`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 638

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 639

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 640

- **Código:** `            storage: { debugMode: true },`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 641

- **Código:** `            responders: {`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 642

- **Código:** `                GET_TAB_ID: () => ({ tabId: 321 }),`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 643

- **Código:** `                REQUEST_IMAGE_DATA: () => ({ srcData: 'data:image/png;base64,QUJDRA==' }),`
- **Função:** Emula o IPC que entrega ao Gemini a imagem de origem do mangá, ou deliberadamente não responde no cenário de erro.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 644

- **Código:** `            },`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 645

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-36: timeout do Observer V2 e término result_timeout, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 646

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 647

- **Código:** `        const timeoutError = await waitFor(() => collectActions(sentMessages, 'GEMINI_ERROR')`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 648

- **Código:** `            .find(message => message.error === 'Tempo limite (4 min)'), { timeout: COVERAGE_MODE ? 30000 : 12000 });`
- **Função:** Detecta execução sob coverage para ampliar apenas o prazo de espera do cenário de timeout, sem mudar o contrato esperado.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 649

- **Código:** `        expect(processPromise).toBeInstanceOf(Promise);`
- **Função:** Compõe assertion direta do cenário CG-36: timeout do Observer V2 e término result_timeout; se a condição mudar, este teste falha.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 650

- **Código:** `        expect(await processPromise).toEqual(expect.objectContaining({ status: 'result_timeout' }));`
- **Função:** Compõe assertion direta do cenário CG-36: timeout do Observer V2 e término result_timeout; se a condição mudar, este teste falha.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 651

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 652

- **Código:** `        const timeoutLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-36: timeout do Observer V2 e término result_timeout; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 653

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_TIMEOUT'`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 654

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-36: timeout do Observer V2 e término result_timeout, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 655

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 656

- **Código:** `        expect(timeoutError).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-36: timeout do Observer V2 e término result_timeout; se a condição mudar, este teste falha.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 657

- **Código:** `            action: 'GEMINI_ERROR',`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 658

- **Código:** `            mangaTabId: 77,`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 659

- **Código:** `            index: 5,`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 660

- **Código:** `            error: 'Tempo limite (4 min)',`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 661

- **Código:** `        }));`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 662

- **Código:** `        expect(timeoutLog).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-36: timeout do Observer V2 e término result_timeout; se a condição mudar, este teste falha.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 663

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 664

- **Código:** `            action_name: 'GEMINI_TIMEOUT',`
- **Função:** Seleciona o log terminal produzido quando o Observer V2 excede o prazo.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 665

- **Código:** `        }));`
- **Função:** Participa de CG-36: timeout do Observer V2 e término result_timeout; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 666

- **Código:** `        expect(collectActions(sentMessages, 'GEMINI_ERROR')).toEqual([timeoutError]);`
- **Função:** Observa/valida a entrega terminal de erro para o job corrente.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 667

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-36: timeout do Observer V2 e término result_timeout, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 668

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-36: timeout do Observer V2 e término result_timeout.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 669

- **Código:** `    test('CG-43/CG-52/CG-53: handler DELETE_CONVERSATION responde ok em modo debug', async () => {`
- **Função:** Abre o cenário CG-43/52/53: DELETE_CONVERSATION em debug; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 670

- **Código:** `        document.body.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';`
- **Função:** Monta/localiza o editor compatível com os seletores reais usados pelo RPA.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 671

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 672

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-43/52/53: DELETE_CONVERSATION em debug; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 673

- **Código:** `            job: null,`
- **Função:** Participa de CG-43/52/53: DELETE_CONVERSATION em debug; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 674

- **Código:** `            autoProcess: false,`
- **Função:** Participa de CG-43/52/53: DELETE_CONVERSATION em debug; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 675

- **Código:** `            storage: { debugMode: true },`
- **Função:** Participa de CG-43/52/53: DELETE_CONVERSATION em debug; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 676

- **Código:** `            responders: {`
- **Função:** Participa de CG-43/52/53: DELETE_CONVERSATION em debug; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 677

- **Código:** `                GET_TAB_ID: () => undefined,`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 678

- **Código:** `            },`
- **Função:** Participa de CG-43/52/53: DELETE_CONVERSATION em debug; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 679

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-43/52/53: DELETE_CONVERSATION em debug, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 680

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 681

- **Código:** `        const result = await dispatchContentMessage(runtimeMock, { action: 'DELETE_CONVERSATION' });`
- **Função:** Declara dado intermediário usado em CG-43/52/53: DELETE_CONVERSATION em debug; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 682

- **Código:** `        const debugLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-43/52/53: DELETE_CONVERSATION em debug; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 683

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'DEBUG_MODE_SKIP'`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 684

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-43/52/53: DELETE_CONVERSATION em debug, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 685

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 686

- **Código:** `        expect(result.keepAlive).toBe(true);`
- **Função:** Preserva o booleano retornado pelo listener para provar a semântica de canal assíncrono.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 687

- **Código:** `        expect(result.response).toEqual({ ok: true });`
- **Função:** Compõe assertion direta do cenário CG-43/52/53: DELETE_CONVERSATION em debug; se a condição mudar, este teste falha.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 688

- **Código:** `        expect(debugLog).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-43/52/53: DELETE_CONVERSATION em debug; se a condição mudar, este teste falha.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 689

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 690

- **Código:** `            action_name: 'DEBUG_MODE_SKIP',`
- **Função:** Seleciona a telemetria que prova que deleção foi suprimida por debug.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 691

- **Código:** `        }));`
- **Função:** Participa de CG-43/52/53: DELETE_CONVERSATION em debug; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 692

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-43/52/53: DELETE_CONVERSATION em debug, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 693

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-43/52/53: DELETE_CONVERSATION em debug.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 694

- **Código:** `    test('CG-44/CG-48/CG-49/CG-52/CG-53: handler DELETE_CONVERSATION percorre o DOM e confirma a exclusao', async () => {`
- **Função:** Abre o cenário CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; o título associa o caso aos IDs de regressão CG correspondentes.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 695

- **Código:** `        document.body.innerHTML = \``
- **Função:** Define DOM mínimo controlado que será consumido pelos seletores reais do módulo sob teste.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 696

- **Código:** `            <div id="conversation-row">`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 697

- **Código:** `                <a href="/app/chat-1">Conversa atual</a>`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 698

- **Código:** `                <button id="options-btn" aria-haspopup="menu" aria-label="opções">...</button>`
- **Função:** Controla se o botão casa exatamente ou apenas de forma aproximada com os seletores de envio.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 699

- **Código:** `            </div>`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 700

- **Código:** `            <div id="delete-item" role="menuitem">Excluir</div>`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 701

- **Código:** `            <button id="confirm-delete">Excluir</button>`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 702

- **Código:** `        \`;`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 703

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 704

- **Código:** `        const optionsBtn = document.getElementById('options-btn');`
- **Função:** Obtém o nó da fixture que a implementação real deve localizar/interagir.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 705

- **Código:** `        const deleteItem = document.getElementById('delete-item');`
- **Função:** Obtém o nó da fixture que a implementação real deve localizar/interagir.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 706

- **Código:** `        const confirmBtn = document.getElementById('confirm-delete');`
- **Função:** Obtém o nó da fixture que a implementação real deve localizar/interagir.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 707

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 708

- **Código:** `        optionsBtn.scrollIntoView = jest.fn();`
- **Função:** Substitui scrollIntoView por spy/no-op compatível com JSDOM, preservando a chamada observável sem layout real.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 709

- **Código:** `        optionsBtn.click = jest.fn();`
- **Função:** Instrumenta o clique para permitir que a implementação real dispare submit e para tornar a interação verificável.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 710

- **Código:** `        deleteItem.click = jest.fn();`
- **Função:** Instrumenta o clique para permitir que a implementação real dispare submit e para tornar a interação verificável.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 711

- **Código:** `        confirmBtn.click = jest.fn(() => {`
- **Função:** Instrumenta o clique para permitir que a implementação real dispare submit e para tornar a interação verificável.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 712

- **Código:** `            document.getElementById('conversation-row')?.remove();`
- **Função:** Obtém o nó da fixture que a implementação real deve localizar/interagir.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 713

- **Código:** `            window.location.pathname = '/app';`
- **Função:** Controla/observa a navegação simulada necessária para identificação ou confirmação de exclusão.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 714

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 715

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 716

- **Código:** `        await loadScript({`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 717

- **Código:** `            job: null,`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 718

- **Código:** `            autoProcess: false,`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 719

- **Código:** `            responders: {`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 720

- **Código:** `                GET_TAB_ID: () => undefined,`
- **Função:** Emula a resposta do background que informa a identidade da aba Gemini ao content script.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 721

- **Código:** `            },`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 722

- **Código:** `        });`
- **Função:** Fecha o bloco sintático de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 723

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 724

- **Código:** `        const result = await dispatchContentMessage(runtimeMock, { action: 'DELETE_CONVERSATION' });`
- **Função:** Declara dado intermediário usado em CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 725

- **Código:** `        const deleteOkLog = sentMessages.find(message =>`
- **Função:** Declara dado intermediário usado em CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; seu valor alimenta a fixture, o fluxo real ou uma assertion posterior.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 726

- **Código:** `            message && message.action === 'LOG_ENTRY' && message.action_name === 'DELETE_OK'`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 727

- **Código:** `        );`
- **Função:** Fecha o bloco sintático de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 728

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos; não altera o runtime.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 729

- **Código:** `        expect(result.keepAlive).toBe(true);`
- **Função:** Preserva o booleano retornado pelo listener para provar a semântica de canal assíncrono.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 730

- **Código:** `        expect(result.response).toEqual({ ok: true });`
- **Função:** Compõe assertion direta do cenário CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; se a condição mudar, este teste falha.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 731

- **Código:** `        expect(optionsBtn.click).toHaveBeenCalled();`
- **Função:** Compõe assertion direta do cenário CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; se a condição mudar, este teste falha.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 732

- **Código:** `        expect(deleteItem.click).toHaveBeenCalled();`
- **Função:** Compõe assertion direta do cenário CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; se a condição mudar, este teste falha.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 733

- **Código:** `        expect(confirmBtn.click).toHaveBeenCalled();`
- **Função:** Compõe assertion direta do cenário CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; se a condição mudar, este teste falha.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 734

- **Código:** `        expect(deleteOkLog).toEqual(expect.objectContaining({`
- **Função:** Compõe assertion direta do cenário CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; se a condição mudar, este teste falha.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 735

- **Código:** `            action: 'LOG_ENTRY',`
- **Função:** Localiza ou valida telemetria emitida pela implementação real, sem ler console interno.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 736

- **Código:** `            action_name: 'DELETE_OK',`
- **Função:** Seleciona a telemetria de exclusão confirmada da conversa corrente.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 737

- **Código:** `        }));`
- **Função:** Participa de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação; configura, aciona ou encerra o estado necessário para que a implementação real seja exercitada sem substituir sua lógica.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** ✅ PROVADO DIRETAMENTE — pertence ao bloco de assertions que falha se o efeito observado divergir.

### Linha 738

- **Código:** `    });`
- **Função:** Fecha o bloco sintático de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Linha 739

- **Código:** `});`
- **Função:** Fecha o bloco sintático de CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação, preservando o escopo e a sequência do cenário.
- **Contexto:** CG-44/48/49/52/53: exclusão normal pelo DOM e confirmação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a linha participa de cenário executado, sem assertion exclusiva sobre ela.

### Posição 740 — newline final

- **Código:** newline final após a linha 739.
- **Função:** Encerra o arquivo em formato POSIX e integra o blob auditado 4bcd24983325106d82be04e2c547a99df1a74fd5.
- **Contexto:** integridade estática do arquivo.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — `source.endsWith("\\n") === true` no blob lido para esta Bíblia.

## 13. Conclusão documental

Foram cobertas individualmente as 739 linhas textuais e a posição 740 do newline final. O arquivo é uma suíte RPA de composição real, com dez cenários e 38 ocorrências de `expect(`; suas assertions fortes foram separadas dos passos apenas executados no caminho. As três lacunas externas permanecem OPEN em `.state/187.json` e não foram “corrigidas” para fabricar evidência.

**Autoauditoria do AGENTE 26:** fonte integral incorporada a partir do mesmo blob auditado; ownership confirmado pela reserva; nenhuma alteração feita em código, testes, fixtures, workflows, `STATUS.md`, `CHECKLIST.md` ou `AUDITORIA.md`.

> **Escopo CG-12/13 pós-adversarial:** o teste prova não apropriação do job alheio no snapshot após 800 ms; não congela o estado terminal de toda a janela de claim de ~5 s. 187-001/002/003 estão ACCEPTED.

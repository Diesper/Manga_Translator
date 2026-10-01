# Bíblia técnica — tests/unit/content-gemini/safe-background-delete.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `cf85ff00f7cc7638ef8e0c61bba1ddd45e07648e`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest autêntica via facade CommonJS do content_gemini  
> **Linhas textuais:** 285  
> **Posições documentais:** 286, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte carrega `extension/content/content_gemini.js` real por meio de `loadContentGeminiModule()`.

O helper de carga inicializa os módulos reais:

- selectors;
- DOM;
- image quarantine;
- observer;
- editor;
- attachment;
- temporary chat;
- result extractor;
- deletion;
- job runner.

Depois importa o facade CommonJS real de `content_gemini.js`.

Portanto as funções chamadas por #188 delegam aos módulos reais e não a mirrors locais.

## 2. Escopo efetivo

Apesar do nome “safe-background-delete”, a maior parte desta suíte cobre a **extração segura da imagem no modo background_delete**, não a automação de exclusão da conversa.

Ela testa diretamente:

- escaping de chatId;
- conversão de imagem renderizada por canvas;
- bridge MAIN-world por requestId;
- fallback de extração;
- timeout;
- Service Worker autenticado;
- classificação/log das etapas;
- retry da cadeia completa;
- política de preservar conversa em debug.

A exclusão real por menu/confirm/recovery é coberta principalmente por `tests/unit/content-gemini/deletion.test.js`.

## 3. BGD-01 — escape de seletor

Sem `CSS.escape`, a API real `escapeCssAttributeValue()`:

- preserva string simples;
- escapa aspas;
- escapa barra invertida.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 4. BGD-02/BGD-03 — canvas

BGD-02 instala canvas controlado e prova:

- imagem pronta;
- `drawImage(image,0,0)`;
- retorno do `toDataURL()`.

BGD-03 prova que imagem `complete=false` rejeita antes de tentar canvas.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 5. BGD-04/BGD-05/BGD-08/BGD-09 — bridge MAIN-world

A bridge real usa `MANGA_TRANSLATOR_FETCH_IMAGE` e recebe `MANGA_TRANSLATOR_FETCH_IMAGE_RESULT` correlacionado por `requestId`.

A suíte prova:

- sucesso com requestId correto;
- propagação de erro da página;
- resposta de requestId estranho é ignorada;
- timeout sem resposta rejeita.

Isso protege contra mistura de respostas simultâneas.

## 6. Limitação de BGD-09

O nome do caso diz “expira e remove o listener”.

A assertion, porém, verifica apenas:

```text
rejects.toThrow('Tempo limite...')
```

Não existe spy/assertion em `removeEventListener`.

O source real executa cleanup no `finish()`, mas esta propriedade específica não é provada diretamente pelo teste.

## 7. BGD-06/BGD-10 — fallback sem aba auxiliar

BGD-06 força falha do primeiro caminho passando imagem nula e usa a bridge MAIN da própria aba.

BGD-10 configura falha da página e exige resultado pelo Service Worker com:

```js
{
  action: 'FETCH_IMAGE_AS_BASE64',
  geminiSession: true
}
```

Isso prova que a rota privilegiada pede contexto Gemini ao background.

## 8. BGD-07 — estabilidade da linha

A suíte chama o helper real de deletion `waitForElementToSettle()`.

Uma linha é removida durante a espera e o resultado deve ser `false`.

Isso prova uma das barreiras contra clicar em elemento que mudou/desapareceu.

Não prova o fluxo completo de exclusão.

## 9. BGD-11 — preservação em debug

`shouldKeepConversationForDebug()` é a função real do job runner.

A suíte prova que retorna true somente quando coexistem:

- `executionMode === 'background_delete'`;
- delivery `GEMINI_ERROR`;
- `debugMode === true`.

Também prova os negativos:
- debug desligado;
- delivery de imagem;
- modo temp_chat.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 10. BGD-12 — telemetria das rotas

Com falha nas rotas diretas, a suíte inspeciona mensagens `LOG_ENTRY/GEMINI_EXTRACT_STAGE` e exige metadata contendo host, stage, attempt e failureKind.

No cenário exercitado aparecem:

- canvas → unknown;
- gemini_page_fetch → http;
- service_worker_session → network.

Isso prova diagnóstico granular da cadeia real.

## 11. BGD-13 — retry completo

A primeira tentativa no Service Worker falha e a segunda retorna Data URL.

A suíte exige:

- duas chamadas ao SW;
- recuperação bem-sucedida;
- log `GEMINI_EXTRACT_RETRY_ALL`.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 12. BGD-14 — claim de “último recurso”

O teste chama:

```js
extractResultImageWithRetry(...)
```

e não:

```js
extractOrAuxiliaryFallback(...)
```

O primeiro método apenas repete a cadeia direta e, ao esgotar tentativas, rejeita.

O callback/rota auxiliar pertence a `extractOrAuxiliaryFallback()`.

Logo BGD-14 prova que a cadeia direta é repetida antes da rejeição final, mas **não prova que um último recurso auxiliar é permitido somente depois dessas tentativas**.

## 13. Exclusão real fora do escopo efetivo de #188

`deletion.test.js` executa diretamente o controller real e cobre:

- debug skip;
- menu + confirmação;
- verificação pós-click;
- idempotência `DELETE_ALREADY_CONFIRMED`;
- concorrência;
- recovery durável;
- retry/reload.

Assim, a lacuna de escopo de #188 é principalmente de nomenclatura/claim, não ausência global de cobertura de deletion.

## 14. Job runner e ordem segura

O job runner real contém `deliverWithSecureDeletion()` e, em background_delete/minimized_window, pode usar `deleteOrScheduleRecovery()` antes da entrega.

Esta suíte não executa esse fluxo completo.

O arquivo `job-runner.test.js` possui testes do pipeline com deletionController mockado; a prova da automação de exclusão em si pertence a `deletion.test.js`.

## 15. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| content_gemini facade real | helper de carga | ✅ PROVADO DIRETAMENTE |
| escape sem CSS.escape | BGD-01 | ✅ PROVADO DIRETAMENTE |
| canvas de imagem pronta | BGD-02 | ✅ PROVADO DIRETAMENTE |
| imagem não pronta rejeita | BGD-03 | ✅ PROVADO DIRETAMENTE |
| bridge MAIN requestId correto | BGD-04 | ✅ PROVADO DIRETAMENTE |
| erro MAIN propaga | BGD-05 | ✅ PROVADO DIRETAMENTE |
| fallback para MAIN | BGD-06 | ✅ PROVADO DIRETAMENTE |
| linha removida não estabiliza | BGD-07 | ✅ PROVADO DIRETAMENTE |
| resposta de outro requestId ignorada | BGD-08 | ✅ PROVADO DIRETAMENTE |
| timeout da bridge | BGD-09 | ✅ PROVADO DIRETAMENTE |
| listener é removido no timeout | sem spy específico | 🟨 EXECUTADO PELA IMPLEMENTAÇÃO, SEM ASSERTION FOCAL |
| SW com geminiSession | BGD-10 | ✅ PROVADO DIRETAMENTE |
| debug preserva conversa apenas no erro/background_delete | BGD-11 | ✅ PROVADO DIRETAMENTE |
| logs por etapa/failureKind | BGD-12 | ✅ PROVADO DIRETAMENTE |
| retry completo recupera transitório | BGD-13 | ✅ PROVADO DIRETAMENTE |
| cadeia repete antes de rejeitar | BGD-14 | ✅ PROVADO DIRETAMENTE |
| fallback auxiliar só depois dos retries | BGD-14 não chama essa API | ⚠️ NÃO PROVADO |
| exclusão real menu/confirm | outra suíte | 🟨 PROVADO EM OUTRA SUÍTE |
| deleteOrScheduleRecovery antes de delivery | não exercitado aqui | ⚠️ NÃO PROVADO NESTE ARQUIVO |

## 16. Solicitações ao auditor

### 188-001 — TEST_SCOPE_REVIEW — OPEN

**Encontrado:** o nome da suíte “safe-background-delete” sugere validação da exclusão segura, mas #188 não chama `deleteCurrentConversation()` nem `deleteOrScheduleRecovery()`.

**Evidência atual:** extração e debug são fortemente provados; deletion real tem suíte própria.

**Ação solicitada:** renomear/descrever o arquivo como cadeia de extração do modo background_delete, ou adicionar explicitamente o fluxo secure-deletion se ele deve fazer parte deste escopo.

**Evidência esperada:** nome e matriz de cobertura não induzem a concluir que a exclusão real é testada aqui.

**Risco:** avaliação de cobertura pode contar o mesmo requisito de deletion sem prova neste arquivo.

**Severidade:** NORMAL.

### 188-002 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** BGD-09 afirma que o timeout remove listener, mas só verifica a rejeição.

**Evidência atual:** o source real possui cleanup em `finish()`.

**Ação solicitada:** spy em `window.removeEventListener` ou instrumentação equivalente para exigir remoção do listener após timeout.

**Evidência esperada:** listener de resultado é removido exatamente no encerramento da request.

**Risco:** vazamento de listeners pode passar com a suíte verde.

**Severidade:** NORMAL.

### 188-003 — STALE_TEST_CONTRACT — OPEN

**Encontrado:** BGD-14 declara repetir a cadeia antes de “permitir o último recurso”, mas chama apenas `extractResultImageWithRetry()`, que não executa fallback auxiliar.

**Evidência atual:** múltiplas tentativas diretas antes da rejeição são provadas.

**Ação solicitada:** renomear o caso para “repete cadeia direta antes de falhar” ou testar `extractOrAuxiliaryFallback()` com callback de fallback e ordenar explicitamente as chamadas.

**Evidência esperada:** se o claim de fallback permanecer, o teste comprova que ele só ocorre após esgotar as tentativas diretas.

**Risco:** falsa confiança sobre a ordem do último fallback.

**Severidade:** HIGH.

## 17. Fonte integral auditada

```js
const { loadContentGeminiModule } = require('../../helpers/load-content-gemini-module.js');
const { getStorageMock } = require('../../mocks/chrome-api.mock.js');

function installImageMetrics(image, { width = 32, height = 48, complete = true } = {}) {
    Object.defineProperties(image, {
        naturalWidth: { value: width, configurable: true },
        naturalHeight: { value: height, configurable: true },
        complete: { value: complete, configurable: true },
    });
    return image;
}

describe('content_gemini.js - modo background_delete', () => {
    let originalCreateElement;
    let originalCss;

    beforeEach(() => {
        jest.resetModules();
        originalCreateElement = document.createElement.bind(document);
        originalCss = global.CSS;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(() => {
        if (originalCss === undefined) delete global.CSS;
        else global.CSS = originalCss;
        jest.restoreAllMocks();
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('BGD-01: escapa chatId sem depender de CSS.escape', () => {
        delete global.CSS;
        const mod = loadContentGeminiModule();

        expect(mod.escapeCssAttributeValue('chat-1')).toBe('chat-1');
        expect(mod.escapeCssAttributeValue('chat"1\\x')).toBe('chat\\"1\\\\x');
    });

    test('BGD-02: converte a imagem já renderizada para Data URL pelo canvas', async () => {
        const canvasContext = { drawImage: jest.fn() };
        jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (String(tagName).toLowerCase() === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext: () => canvasContext,
                    toDataURL: () => 'data:image/png;base64,Q0FOVkFT',
                };
            }
            return originalCreateElement(tagName);
        });
        const mod = loadContentGeminiModule();
        const image = installImageMetrics(document.createElement('img'));

        await expect(mod.imageElementToDataUrl(image)).resolves.toBe('data:image/png;base64,Q0FOVkFT');
        expect(canvasContext.drawImage).toHaveBeenCalledWith(image, 0, 0);
    });

    test('BGD-03: imagem não pronta não tenta canvas', async () => {
        const mod = loadContentGeminiModule();
        const image = installImageMetrics(document.createElement('img'), { complete: false });

        await expect(mod.imageElementToDataUrl(image)).rejects.toThrow('ainda não está pronta');
    });

    test('BGD-04: ponte MAIN resolve Data URL autenticada pelo requestId correto', async () => {
        const mod = loadContentGeminiModule();
        const listener = event => {
            const { requestId } = event.detail;
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId, dataUrl: 'data:image/png;base64,TUFJTg==' },
            }));
        };
        window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', listener);

        await expect(mod.fetchImageThroughGeminiPage('https://lh3.googleusercontent.com/image')).resolves
            .toBe('data:image/png;base64,TUFJTg==');

        window.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', listener);
    });

    test('BGD-05: ponte MAIN rejeita erro da página sem abrir aba auxiliar', async () => {
        const mod = loadContentGeminiModule();
        const listener = event => {
            const { requestId } = event.detail;
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId, error: 'HTTP 403' },
            }));
        };
        window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', listener);

        await expect(mod.fetchImageThroughGeminiPage('https://lh3.googleusercontent.com/image')).rejects
            .toThrow('HTTP 403');

        window.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', listener);
    });

    test('BGD-06: quando canvas falha, usa a ponte MAIN na própria aba', async () => {
        const mod = loadContentGeminiModule();
        const listener = event => {
            const { requestId } = event.detail;
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId, dataUrl: 'data:image/png;base64,RkFMTEJBQ0s=' },
            }));
        };
        window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', listener);

        await expect(mod.extractImageInGeminiTab(null, 'https://lh3.googleusercontent.com/image')).resolves
            .toBe('data:image/png;base64,RkFMTEJBQ0s=');

        window.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', listener);
    });

    test('BGD-07: estabilidade falha quando a linha é removida durante a espera', async () => {
        const mod = loadContentGeminiModule();
        const row = document.createElement('a');
        row.getBoundingClientRect = () => ({ top: 10, left: 10, width: 100, height: 20 });
        document.body.appendChild(row);
        setTimeout(() => row.remove(), 2);

        await expect(mod.waitForElementToSettle(row, 3, 5)).resolves.toBe(false);
    });

    test('BGD-08: ponte MAIN ignora resposta de outra requisição antes de aceitar a correta', async () => {
        const mod = loadContentGeminiModule();
        const listener = event => {
            const { requestId } = event.detail;
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId: 'outra-requisicao', dataUrl: 'data:image/png;base64,RVJSQURP' },
            }));
            setTimeout(() => window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId, dataUrl: 'data:image/png;base64,Q0VSVE8=' },
            })), 2);
        };
        window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', listener);

        await expect(mod.fetchImageThroughGeminiPage('https://lh3.googleusercontent.com/image')).resolves
            .toBe('data:image/png;base64,Q0VSVE8=');

        window.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', listener);
    });

    test('BGD-09: ponte MAIN expira e remove o listener quando não há resposta', async () => {
        const mod = loadContentGeminiModule();

        await expect(mod.fetchImageThroughGeminiPage('https://lh3.googleusercontent.com/image', 1)).rejects
            .toThrow('Tempo limite ao extrair imagem na página Gemini');
    });

    test('BGD-10: após falha da página Gemini, usa Service Worker autenticado sem abrir aba', async () => {
        const originalSendMessage = chrome.runtime.sendMessage;
        chrome.runtime.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'FETCH_IMAGE_AS_BASE64') {
                callback({ dataUrl: 'data:image/png;base64,U0VSVklDRVdPUktFUg==' });
            }
        });
        const mod = loadContentGeminiModule();
        const pageListener = event => {
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId: event.detail.requestId, error: 'Failed to fetch' },
            }));
        };
        window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', pageListener);

        await expect(mod.extractImageInGeminiTab(null, 'https://lh3.googleusercontent.com/image')).resolves
            .toBe('data:image/png;base64,U0VSVklDRVdPUktFUg==');
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            action: 'FETCH_IMAGE_AS_BASE64',
            geminiSession: true,
        }), expect.any(Function));

        window.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', pageListener);
        chrome.runtime.sendMessage = originalSendMessage;
    });

    test('BGD-11: preserva conversa após erro somente no background_delete com Debug ativo', async () => {
        const storage = getStorageMock();
        const mod = loadContentGeminiModule();
        const delivery = { action: 'GEMINI_ERROR', error: 'Falha de extração' };

        await storage.set({ debugMode: true });
        await expect(mod.shouldKeepConversationForDebug(delivery, 'background_delete')).resolves.toBe(true);

        await storage.set({ debugMode: false });
        await expect(mod.shouldKeepConversationForDebug(delivery, 'background_delete')).resolves.toBe(false);
        await storage.set({ debugMode: true });
        await expect(mod.shouldKeepConversationForDebug({ action: 'GEMINI_IMAGE_EXTRACTED' }, 'background_delete')).resolves.toBe(false);
        await expect(mod.shouldKeepConversationForDebug(delivery, 'temp_chat')).resolves.toBe(false);
    });

    test('BGD-12: registra host, etapa e causa quando as três rotas diretas falham', async () => {
        const originalSendMessage = chrome.runtime.sendMessage;
        chrome.runtime.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'FETCH_IMAGE_AS_BASE64') {
                callback({ error: 'Failed to fetch' });
            } else if (callback) {
                callback();
            }
        });
        const mod = loadContentGeminiModule();
        const pageListener = event => {
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId: event.detail.requestId, error: 'HTTP 403' },
            }));
        };
        window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', pageListener);

        await expect(mod.extractImageInGeminiTab(null, 'https://lh3.googleusercontent.com/image', 1)).rejects
            .toThrow('Failed to fetch');

        const stageLogs = chrome.runtime.sendMessage.mock.calls
            .map(([message]) => message)
            .filter(message => message.action === 'LOG_ENTRY' && message.action_name === 'GEMINI_EXTRACT_STAGE');
        expect(stageLogs).toEqual(expect.arrayContaining([
            expect.objectContaining({ extra: expect.objectContaining({ host: 'lh3.googleusercontent.com', stage: 'canvas', attempt: 1, failureKind: 'unknown' }) }),
            expect.objectContaining({ extra: expect.objectContaining({ host: 'lh3.googleusercontent.com', stage: 'gemini_page_fetch', attempt: 1, failureKind: 'http' }) }),
            expect.objectContaining({ extra: expect.objectContaining({ host: 'lh3.googleusercontent.com', stage: 'service_worker_session', attempt: 1, failureKind: 'network' }) }),
        ]));

        window.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', pageListener);
        chrome.runtime.sendMessage = originalSendMessage;
    });

    test('BGD-13: repete a cadeia inteira uma vez e recupera uma falha transitória', async () => {
        const originalSendMessage = chrome.runtime.sendMessage;
        let serviceWorkerCalls = 0;
        chrome.runtime.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'FETCH_IMAGE_AS_BASE64') {
                serviceWorkerCalls += 1;
                callback(serviceWorkerCalls === 1
                    ? { error: 'Failed to fetch' }
                    : { dataUrl: 'data:image/png;base64,UkVDVVBFUkFETw==' });
            } else if (callback) {
                callback();
            }
        });
        const mod = loadContentGeminiModule();
        const pageListener = event => {
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId: event.detail.requestId, error: 'Failed to fetch' },
            }));
        };
        window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', pageListener);

        await expect(mod.extractResultImageWithRetry(null, 'https://lh3.googleusercontent.com/image', 'background_delete', 2, 0)).resolves
            .toBe('data:image/png;base64,UkVDVVBFUkFETw==');
        expect(serviceWorkerCalls).toBe(2);
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
            action: 'LOG_ENTRY',
            action_name: 'GEMINI_EXTRACT_RETRY_ALL',
            extra: expect.objectContaining({ host: 'lh3.googleusercontent.com', attempt: 1 }),
        }), expect.any(Function));

        window.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', pageListener);
        chrome.runtime.sendMessage = originalSendMessage;
    });

    test('BGD-14: repete a cadeia direta antes de permitir o último recurso', async () => {
        const originalSendMessage = chrome.runtime.sendMessage;
        let serviceWorkerCalls = 0;
        chrome.runtime.sendMessage = jest.fn((message, callback) => {
            if (message.action === 'FETCH_IMAGE_AS_BASE64') {
                serviceWorkerCalls += 1;
                callback({ error: 'Failed to fetch' });
            } else if (callback) {
                callback();
            }
        });
        const mod = loadContentGeminiModule();
        const pageListener = event => {
            window.dispatchEvent(new CustomEvent('MANGA_TRANSLATOR_FETCH_IMAGE_RESULT', {
                detail: { requestId: event.detail.requestId, error: 'Failed to fetch' },
            }));
        };
        window.addEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', pageListener);

        await expect(mod.extractResultImageWithRetry(null, 'https://lh3.googleusercontent.com/image', 'background_delete', undefined, 0)).rejects
            .toThrow('Failed to fetch');
        expect(serviceWorkerCalls).toBeGreaterThan(1);

        window.removeEventListener('MANGA_TRANSLATOR_FETCH_IMAGE', pageListener);
        chrome.runtime.sendMessage = originalSendMessage;
    });
});

```

## 18. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–13 | imports, helper de métricas e describe |
| 14–29 | setup/cleanup |
| 31–40 | BGD-01 |
| 41–59 | BGD-02 |
| 60–66 | BGD-03 |
| 67–83 | BGD-04 |
| 84–100 | BGD-05 |
| 101–117 | BGD-06 |
| 118–128 | BGD-07 |
| 129–150 | BGD-08 |
| 151–157 | BGD-09 |
| 158–185 | BGD-10 |
| 186–202 | BGD-11 |
| 203–236 | BGD-12 |
| 237–269 | BGD-13 |
| 270–284 | BGD-14 |
| 285 | fecha describe |
| posição 286 | newline final |

## 19. Autoauditoria do AGENTE 17

- [x] reserva #188 criada e relida;
- [x] state próprio criado;
- [x] helper de carga verificado;
- [x] facade e módulos reais inspecionados;
- [x] deletion.test.js e job-runner.test.js consultados;
- [x] fonte integral incorporada;
- [x] 285 linhas + newline = 286 posições;
- [x] escopo real separado do nome amplo da suíte;
- [x] três solicitações persistíveis identificadas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #188 é uma suíte autêntica e forte da extração do modo background_delete e do predicado de debug; ela não é, por si só, o gate da exclusão segura completa.

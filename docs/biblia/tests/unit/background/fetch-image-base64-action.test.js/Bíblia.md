# Bíblia técnica — `tests/unit/background/fetch-image-base64-action.test.js`

> **Estado documental:** ✅ CONCLUÍDA — AGENTE 10  
> **SHA auditado:** `1246da7bd3992499b1a21a4a00dc32b83f9486c3`  
> **Arquivo testado diretamente:** `extension/background/actions/fetch-image-base64.js` — SHA `4a4825c36fdbe630e80dd7fba1341bdc7a06aecf`  
> **Router real:** `extension/background/router.js` — SHA `d9278e9e58e4e9583a30c16227bfd833e7203d89`  
> **Linhas textuais:** **268**  
> **Posições documentais:** **269**, contando o newline terminal após a linha textual vazia final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Este arquivo é a suíte focal da action de background `fetch-image-base64`, usada pelo alias legado `FETCH_IMAGE_AS_BASE64`. O teste não reimplementa a action: ele resolve e executa **`router.js` e `fetch-image-base64.js` reais** dentro de `jest.isolateModules`, cria o listener por `createMessageRouter({})` e observa o contrato que um caller de `chrome.runtime.onMessage` receberia.

A suíte cobre quatro fronteiras importantes ao mesmo tempo:

1. **roteamento legado → action canônica**;
2. **validação síncrona do payload**, que deve responder sem manter o canal vivo;
3. **execução assíncrona**, que retorna `true`/keepAlive enquanto fetch/FileReader estão pendentes;
4. **trust boundary da sessão Gemini**, que só inclui credenciais para asset `googleusercontent.com` quando o sender também é uma aba `https://gemini.google.com/...`.

O arquivo é descoberto pelo projeto Jest `background`, pois `jest.config.js` usa `tests/unit/background/**/*.test.js`. `package.json#test:unit:background` seleciona esse projeto e o runner canônico de CI (`npm run test:ci`) também o inclui no inventário Jest.

## 2. Evidência de execução do próprio teste

Existe execução real do **mesmo blob SHA** desta suíte no GitHub Actions:

- commit: `3ce36e62c062acf505a09ac4e4d9edd4bdac1f6f`;
- SHA desta suíte naquele commit: `1246da7bd3992499b1a21a4a00dc32b83f9486c3`, idêntico ao atual;
- workflow: **MangaTranslator CI #245**, run `35669398870`;
- job Node 20: `106562567286`, concluído com `success`;
- log: `PASS background unit/background/fetch-image-base64-action.test.js`;
- os **11 casos** da suíte foram listados individualmente como aprovados.

O run atual do PR observado durante esta auditoria, **#2937**, ainda estava `pending`; portanto ele **não** foi usado como prova de sucesso.

Classificação da execução histórica do arquivo: **✅ PROVADO DIRETAMENTE** de que estes 11 testes, com exatamente este blob, executaram e passaram naquele snapshot. Isso não transforma caminhos não exercitados em prova.

## 3. Harness e fidelidade ao runtime

### 3.1 `dispatch`

O helper reproduz a assimetria essencial do listener Chrome:

- validação síncrona pode chamar `sendResponse` antes de o retorno booleano do listener estar disponível;
- action assíncrona retorna `true` primeiro e chama `sendResponse` depois.

Por isso `sendResponse` apenas resolve se `keepAlive !== undefined`; após a chamada do listener, o helper resolve imediatamente quando já existe resposta ou o retorno é `false`. Essa dupla condição é importante para distinguir os testes de payload inválido (`keepAlive:false`) dos testes que entram no executor assíncrono (`keepAlive:true`).

### 3.2 `loadAction`

O loader:

- mapeia `self` para `global`;
- injeta apenas o logger mínimo;
- remove router antigo;
- usa `jest.isolateModules`;
- requer **router real primeiro** e **action real depois**;
- devolve o namespace `MangaTranslatorRouter` efetivamente registrado.

Assim, mudanças reais em `ACTION_MAP`, `registerAction`, `validate`, `allowedSources` ou `execute` podem quebrar a suíte. Ela não usa helper que copie a lógica da action.

### 3.3 `MockFileReader`

O mock é deliberadamente pequeno: converte o `blob.type` em Data URL determinística e chama `onloadend` em outro tick. Ele prova que o caminho feliz aguarda `FileReader`, mas **não** prova `reader.onerror`, `reader.error`, resultado `null` ou outras peculiaridades de um FileReader de navegador.

## 4. Matriz dos 11 cenários

| Cenário | O que executa/prova | Classificação |
|---|---|---|
| HTTP comum feliz | router/action reais; `ok:true`; Data URL; AbortSignal; `credentials:'omit'`; `cache:'no-store'` | ✅ PROVADO DIRETAMENTE |
| googleusercontent + sender Gemini | sessão autenticada aceita; `credentials:'include'`; Data URL | ✅ PROVADO DIRETAMENTE |
| geminiSession em host não-Google | validação rejeita antes do fetch | ✅ PROVADO DIRETAMENTE |
| googleusercontent vindo de sender não-Gemini | executor rejeita; router converte em INTERNAL_ERROR; fetch não ocorre | ✅ PROVADO DIRETAMENTE |
| exatamente 50 MiB | limite é inclusivo: 50 MiB passa | ✅ PROVADO DIRETAMENTE |
| 50 MiB + 1 byte | tamanho excedente vira INTERNAL_ERROR com mensagem específica | ✅ PROVADO DIRETAMENTE |
| URL sintaticamente inválida | `INVALID_PAYLOAD`, `keepAlive:false`, zero fetch | ✅ PROVADO DIRETAMENTE |
| protocolo `data:` | protocolo fora de HTTP(S) é rejeitado antes do fetch | ✅ PROVADO DIRETAMENTE |
| Content-Type `text/html` | rejeita antes de chamar `response.blob()` | ✅ PROVADO DIRETAMENTE |
| HTTP 404 | resposta não-ok vira `INTERNAL_ERROR / HTTP 404` | ✅ PROVADO DIRETAMENTE |
| fetch pendente por 30 s | timer virtual dispara `AbortController.abort()`; signal muda para aborted; rejeição chega como INTERNAL_ERROR | ✅ PROVADO DIRETAMENTE |

## 5. O que a suíte prova sobre o router

A suíte também fornece prova direta, no contexto desta action, de que:

- `FETCH_IMAGE_AS_BASE64` resolve para `fetch-image-base64`;
- erros de `validate` retornam `ok:false` e **não** mantêm o canal vivo;
- exceções/rejeições de `execute` são capturadas pelo ramo async e convertidas para `{ok:false,error:{code:'INTERNAL_ERROR',message}}`;
- sucesso assíncrono é envolvido em `{ok:true,...result}`.

Ela **não** deve ser citada como prova geral de todos os branches do router: GTC/SM delegation, action inexistente, popup/external source, `contextFactory`, storage facade e actions `async:false` pertencem a outras suítes/gaps.

## 6. Trust boundaries e riscos observados

### 6.1 Credenciais Gemini

A suíte é forte na dupla condição documentada hoje:

- host precisa ser `googleusercontent.com` ou subdomínio;
- sender precisa casar estritamente com `https://gemini.google.com/` no executor.

Entretanto, a validação geral permite `http:` e `https:`; não existe nesta suíte caso `geminiSession:true` com `http://*.googleusercontent.com`. Isso merece revisão separada porque a action então solicita `credentials:'include'` sobre URL não-HTTPS. HSTS/cookies Secure podem mitigar no navegador, mas a política não está explicitamente provada pelo código ou pelo teste.

### 6.2 MIME versus Blob

O teste de MIME prova que header não-`image/` é rejeitado antes de `blob()`. Nos caminhos felizes, header e `blob.type` são coerentes. Não há cenário focal para resposta declarada como imagem cujo Blob tenha tipo vazio/incompatível; a Data URL é construída pelo FileReader a partir do Blob.

### 6.3 Limite de tamanho

O boundary 50 MiB está muito bem provado, inclusive byte exato. Porém o limite só é aplicado **depois** de `await response.blob()`; esta suíte não prova limitação de memória/download durante transferência nem uso de `Content-Length`. Isso é uma característica da implementação, não falha da assertion de boundary.

### 6.4 FileReader

Nenhum cenário força `FileReader.onerror`. A action contém branch de rejeição específico, mas o mock só chama `onloadend`. Portanto esse tratamento permanece sem prova focal nesta suíte.

## 7. Solicitações ao auditor

### 145-001 — TEST_REQUIRED — OPEN

**Encontrado:** a action possui caminho `FileReader.onerror`, mas o MockFileReader desta suíte nunca o dispara.

**Evidência atual:** o caminho `onloadend` é provado pelos testes felizes; nenhum teste cria `reader.error` ou falha de leitura.

**Necessário:** adicionar em alteração de teste separada um FileReader controlado que dispare `onerror` e verificar a resposta roteada, incluindo fallback `Falha ao ler imagem` quando `reader.error` estiver ausente.

**Risco:** regressão no tratamento de leitura pode ficar invisível enquanto fetch/MIME/tamanho continuam verdes.

### 145-002 — SECURITY_REVIEW — OPEN

**Encontrado:** `geminiSession:true` exige host googleusercontent e sender Gemini, mas `validate` permite também protocolo `http:`.

**Evidência atual:** esta suíte prova HTTPS googleusercontent autenticado, host não-Google e sender fora do Gemini; não prova/rejeita HTTP googleusercontent autenticado.

**Necessário:** decidir explicitamente se sessão autenticada deve exigir HTTPS. Se sim, alterar a action em trabalho funcional separado e adicionar regressão usando a implementação real.

**Risco:** a implementação pode tentar um fetch `credentials:'include'` em URL HTTP; proteções do navegador/HSTS não devem ser presumidas como contrato interno.

### 145-003 — TEST_REQUIRED — OPEN

**Encontrado:** `meta.allowedSources=['content','gemini']` pertence à action real, mas esta suíte só usa senders de abas classificadas nesses dois grupos.

**Evidência atual:** os testes exercitam content e Gemini; nenhuma assertion focal deste arquivo prova que popup/external recebem `SOURCE_DENIED` para `FETCH_IMAGE_AS_BASE64`.

**Necessário:** adicionar cenários de origem negada ou referenciar explicitamente prova focal equivalente que use esta action registrada.

**Risco:** drift em `allowedSources` específico da action pode não quebrar os casos atuais.

### 145-004 — TEST_REQUIRED — OPEN

**Encontrado:** os fluxos felizes mantêm header `image/png` e `blob.type='image/png'`; não há cenário de header de imagem com Blob de tipo vazio/incompatível nem FileReader retornando valor não-string.

**Evidência atual:** validação de header não-imagem é direta, mas coerência header→Blob→Data URL é assumida pelo mock.

**Necessário:** confirmar o contrato esperado do browser e, se relevante, adicionar casos reais/controlados para Blob type/result.

**Risco:** uma mudança no caminho de conversão pode devolver Data URL com MIME inesperado sem quebrar a suíte atual.

## 8. Invariantes documentados

1. A suíte deve continuar carregando os módulos de produção reais, não mirrors.
2. `ROUTER_PATH` deve ser carregado antes de `ACTION_PATH`.
3. Cada teste começa com registry/module cache isolado.
4. Globals alterados devem ser restaurados/removidos no `afterEach`.
5. Payload inválido deve falhar antes de `fetch` e retornar `keepAlive:false`.
6. Entrar em `execute` async deve manter `keepAlive:true`.
7. HTTP comum nunca deve incluir credenciais.
8. Sessão Gemini aceita deve incluir credenciais somente sob a dupla condição de host + sender.
9. 50 MiB exatos são aceitos; qualquer byte acima é rejeitado.
10. Content-Type não-imagem não deve materializar Blob.
11. Resposta HTTP não-ok deve ser rejeitada antes da conversão.
12. Aos 30.000 ms o signal deve ser abortado.
13. A suíte não deve usar rede real.
14. Passar estes testes não prova caminhos explicitamente listados como gaps.

## 9. Fonte integral auditada

```js
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(
    __dirname,
    '../../../extension/background/actions/fetch-image-base64.js'
);

function dispatch(listener, request, sender) {
    return new Promise(resolve => {
        let keepAlive;
        let response;

        const sendResponse = result => {
            response = result;
            if (keepAlive !== undefined) resolve({ keepAlive, response });
        };

        keepAlive = listener(request, sender, sendResponse);
        if (response !== undefined || keepAlive === false) {
            resolve({ keepAlive, response });
        }
    });
}

function loadAction() {
    global.self = global;
    global.MangaTranslatorLog = { log: jest.fn() };
    delete global.MangaTranslatorRouter;

    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(ACTION_PATH);
    });

    return global.MangaTranslatorRouter;
}

describe('background/actions/fetch-image-base64.js', () => {
    let originalFetch;
    let originalFileReader;

    class MockFileReader {
        readAsDataURL(blob) {
            this.result = `data:${blob.type};base64,SU1BR0U=`;
            setTimeout(() => this.onloadend(), 0);
        }
    }

    beforeEach(() => {
        jest.resetModules();
        jest.useRealTimers();
        originalFetch = global.fetch;
        originalFileReader = global.FileReader;
        global.FileReader = MockFileReader;
    });

    afterEach(() => {
        jest.useRealTimers();
        global.fetch = originalFetch;
        global.FileReader = originalFileReader;
        delete global.MangaTranslatorLog;
        delete global.MangaTranslatorRouter;
        delete global.MangaTranslatorState;
    });

    test('busca uma imagem HTTP e devolve dataUrl no formato legado', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: jest.fn(() => 'image/png') },
            blob: jest.fn().mockResolvedValue({ size: 1024, type: 'image/png' }),
        });
        const router = loadAction();

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.example/page.png',
        }, { tab: { id: 17, url: 'https://reader.example/chapter' } });

        expect(result).toEqual({
            keepAlive: true,
            response: { ok: true, dataUrl: 'data:image/png;base64,SU1BR0U=' },
        });
        expect(global.fetch).toHaveBeenCalledWith(
            'https://cdn.example/page.png',
            expect.objectContaining({
                signal: expect.any(AbortSignal),
                credentials: 'omit',
                cache: 'no-store',
            })
        );
    });

    test('busca asset googleusercontent com credenciais somente quando vem da aba Gemini', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: jest.fn(() => 'image/png') },
            blob: jest.fn().mockResolvedValue({ size: 1024, type: 'image/png' }),
        });
        const router = loadAction();

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://lh3.googleusercontent.com/generated-image',
            geminiSession: true,
        }, { tab: { id: 17, url: 'https://gemini.google.com/app/chat-1' } });

        expect(result.response).toEqual(expect.objectContaining({ ok: true, dataUrl: expect.any(String) }));
        expect(global.fetch).toHaveBeenCalledWith(
            'https://lh3.googleusercontent.com/generated-image',
            expect.objectContaining({ credentials: 'include', cache: 'no-store' })
        );
    });

    test.each([
        ['host não Google', 'https://example.test/image.png', 'https://gemini.google.com/app/chat-1', 'Asset autenticado deve ser googleusercontent.com'],
        ['origem fora do Gemini', 'https://lh3.googleusercontent.com/image.png', 'https://reader.example/chapter', 'Sessão Gemini permitida somente para a aba Gemini'],
    ])('rejeita sessão autenticada para %s', async (_name, url, senderUrl, message) => {
        global.fetch = jest.fn();
        const router = loadAction();
        const result = await dispatch(router.createMessageRouter({}), {
            action: 'FETCH_IMAGE_AS_BASE64', url, geminiSession: true,
        }, { tab: { id: 18, url: senderUrl } });

        expect(result.response).toEqual(expect.objectContaining({
            ok: false,
            error: expect.objectContaining({ message }),
        }));
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test.each([
        ['aceita exatamente 50 MB', 50 * 1024 * 1024, true],
        ['rejeita mais de 50 MB', (50 * 1024 * 1024) + 1, false],
    ])('%s', async (_name, size, shouldSucceed) => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: jest.fn(() => 'image/png') },
            blob: jest.fn().mockResolvedValue({ size, type: 'image/png' }),
        });
        const router = loadAction();

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.example/page.png',
        }, { tab: { id: 22, url: 'https://reader.example/chapter' } });

        if (shouldSucceed) {
            expect(result).toEqual({
                keepAlive: true,
                response: { ok: true, dataUrl: 'data:image/png;base64,SU1BR0U=' },
            });
            return;
        }

        expect(result).toEqual({
            keepAlive: true,
            response: {
                ok: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Imagem muito grande (>50MB)',
                },
            },
        });
    });

    test.each([
        ['URL inválida', 'not a url', 'URL inválida'],
        ['protocolo não permitido', 'data:image/png;base64,AA==', 'Protocolo inválido'],
    ])('rejeita %s antes do fetch', async (_name, url, message) => {
        global.fetch = jest.fn();
        const router = loadAction();

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'FETCH_IMAGE_AS_BASE64',
            url,
        }, { tab: { id: 18, url: 'https://reader.example/chapter' } });

        expect(result).toEqual({
            keepAlive: false,
            response: {
                ok: false,
                error: { code: 'INVALID_PAYLOAD', message },
            },
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejeita uma resposta que nao declara content-type de imagem', async () => {
        const blob = jest.fn();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: jest.fn(() => 'text/html') },
            blob,
        });
        const router = loadAction();

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.example/not-image',
        }, { tab: { id: 19, url: 'https://reader.example/chapter' } });

        expect(result).toEqual({
            keepAlive: true,
            response: {
                ok: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Content-Type inválido: text/html',
                },
            },
        });
        expect(blob).not.toHaveBeenCalled();
    });

    test('rejeita uma resposta HTTP sem sucesso', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 404,
            headers: { get: jest.fn() },
        });
        const router = loadAction();

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.example/missing.png',
        }, { tab: { id: 20, url: 'https://reader.example/chapter' } });

        expect(result.response).toEqual({
            ok: false,
            error: { code: 'INTERNAL_ERROR', message: 'HTTP 404' },
        });
    });

    test('aborta o fetch apos 30 segundos', async () => {
        jest.useFakeTimers();
        let signal;
        global.fetch = jest.fn((_url, options) => {
            signal = options.signal;
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new Error('Abortado')));
            });
        });
        const router = loadAction();
        const resultPromise = dispatch(router.createMessageRouter({}), {
            action: 'FETCH_IMAGE_AS_BASE64',
            url: 'https://cdn.example/slow.png',
        }, { tab: { id: 21, url: 'https://reader.example/chapter' } });

        expect(signal.aborted).toBe(false);
        jest.advanceTimersByTime(30_000);

        await expect(resultPromise).resolves.toEqual({
            keepAlive: true,
            response: {
                ok: false,
                error: { code: 'INTERNAL_ERROR', message: 'Abortado' },
            },
        });
        expect(signal.aborted).toBe(true);
    });
});

```

## 10. Mapa linha por linha

| Linha | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 1 | U01 | `const path = require('path');` | Importa `path`, única dependência Node usada para localizar módulos reais. |
| 2 | U01 | `␠ [linha vazia]` | Separador visual dentro de **Imports e caminhos da implementação real**; sem efeito de runtime. |
| 3 | U01 | `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');` | Resolve o caminho absoluto do `extension/background/router.js` real. |
| 4 | U01 | `const ACTION_PATH = path.resolve(` | Constrói o caminho absoluto do `fetch-image-base64.js` real, evitando mirror local. |
| 5 | U01 | `    __dirname,` | Constrói o caminho absoluto do `fetch-image-base64.js` real, evitando mirror local. |
| 6 | U01 | `    '../../../extension/background/actions/fetch-image-base64.js'` | Constrói o caminho absoluto do `fetch-image-base64.js` real, evitando mirror local. |
| 7 | U01 | `);` | Constrói o caminho absoluto do `fetch-image-base64.js` real, evitando mirror local. |
| 8 | U01 | `␠ [linha vazia]` | Separador visual dentro de **Imports e caminhos da implementação real**; sem efeito de runtime. |
| 9 | U02 | `function dispatch(listener, request, sender) {` | Declara helper que adapta callback/keepAlive do listener Chrome para Promise observável pelo Jest. |
| 10 | U02 | `    return new Promise(resolve => {` | Cria Promise que só resolve quando resposta e semântica de keepAlive estiverem determinadas. |
| 11 | U02 | `        let keepAlive;` | Reserva o valor retornado pelo listener (`true` para async; `false` para resposta síncrona). |
| 12 | U02 | `        let response;` | Reserva a resposta capturada por `sendResponse`. |
| 13 | U02 | `␠ [linha vazia]` | Separador visual dentro de **Helper dispatch e semântica keepAlive**; sem efeito de runtime. |
| 14 | U02 | `        const sendResponse = result => {` | Define callback `sendResponse` usado pelo router real. |
| 15 | U02 | `            response = result;` | Armazena o payload respondido pelo router. |
| 16 | U02 | `            if (keepAlive !== undefined) resolve({ keepAlive, response });` | Resolve imediatamente quando o listener já retornou e o callback chega depois. |
| 17 | U02 | `        };` | Fecha estrutura sintática pertencente a **Helper dispatch e semântica keepAlive**. |
| 18 | U02 | `␠ [linha vazia]` | Separador visual dentro de **Helper dispatch e semântica keepAlive**; sem efeito de runtime. |
| 19 | U02 | `        keepAlive = listener(request, sender, sendResponse);` | Invoca o listener real com request/sender/callback e captura o booleano de keepAlive. |
| 20 | U02 | `        if (response !== undefined \|\| keepAlive === false) {` | Cobre a ordem inversa: resposta síncrona pode chegar antes de `listener` retornar; resolve após conhecer keepAlive. |
| 21 | U02 | `            resolve({ keepAlive, response });` | Cobre a ordem inversa: resposta síncrona pode chegar antes de `listener` retornar; resolve após conhecer keepAlive. |
| 22 | U02 | `        }` | Cobre a ordem inversa: resposta síncrona pode chegar antes de `listener` retornar; resolve após conhecer keepAlive. |
| 23 | U02 | `    });` | Fecha estrutura sintática pertencente a **Helper dispatch e semântica keepAlive**. |
| 24 | U02 | `}` | Fecha estrutura sintática pertencente a **Helper dispatch e semântica keepAlive**. |
| 25 | U02 | `␠ [linha vazia]` | Separador visual dentro de **Helper dispatch e semântica keepAlive**; sem efeito de runtime. |
| 26 | U03 | `function loadAction() {` | Declara loader que prepara globals e carrega módulos reais em isolamento Jest. |
| 27 | U03 | `    global.self = global;` | Faz `self` apontar para `global`, reproduzindo o namespace esperado pela IIFE de produção. |
| 28 | U03 | `    global.MangaTranslatorLog = { log: jest.fn() };` | Injeta logger mock para satisfazer dependência do router sem alterar lógica da action. |
| 29 | U03 | `    delete global.MangaTranslatorRouter;` | Remove registry/router anterior para impedir vazamento entre testes. |
| 30 | U03 | `␠ [linha vazia]` | Separador visual dentro de **Carregamento isolado do router/action reais**; sem efeito de runtime. |
| 31 | U03 | `    jest.isolateModules(() => {` | Abre `jest.isolateModules`, garantindo registry/module cache novo por carregamento. |
| 32 | U03 | `        require(ROUTER_PATH);` | Executa o `router.js` real. |
| 33 | U03 | `        require(ACTION_PATH);` | Executa o `fetch-image-base64.js` real, que registra sua action no router. |
| 34 | U03 | `    });` | Fecha estrutura sintática pertencente a **Carregamento isolado do router/action reais**. |
| 35 | U03 | `␠ [linha vazia]` | Separador visual dentro de **Carregamento isolado do router/action reais**; sem efeito de runtime. |
| 36 | U03 | `    return global.MangaTranslatorRouter;` | Retorna o router real já contendo a action registrada. |
| 37 | U03 | `}` | Fecha estrutura sintática pertencente a **Carregamento isolado do router/action reais**. |
| 38 | U03 | `␠ [linha vazia]` | Separador visual dentro de **Carregamento isolado do router/action reais**; sem efeito de runtime. |
| 39 | U04 | `describe('background/actions/fetch-image-base64.js', () => {` | Abre a suíte focal da action de produção. |
| 40 | U04 | `    let originalFetch;` | Reserva o global original para restauração após cada cenário. |
| 41 | U04 | `    let originalFileReader;` | Reserva o global original para restauração após cada cenário. |
| 42 | U04 | `␠ [linha vazia]` | Separador visual dentro de **Harness, FileReader mock e cleanup**; sem efeito de runtime. |
| 43 | U04 | `    class MockFileReader {` | Declara FileReader mínimo usado para exercitar `readAsDataURL` sem DOM real. |
| 44 | U04 | `        readAsDataURL(blob) {` | Implementa o método chamado pela action real. |
| 45 | U04 | `            this.result = \`data:${blob.type};base64,SU1BR0U=\`;` | Produz Data URL determinística preservando `blob.type`. |
| 46 | U04 | `            setTimeout(() => this.onloadend(), 0);` | Dispara `onloadend` assíncronamente para provar que a action aguarda a leitura. |
| 47 | U04 | `        }` | Fecha estrutura sintática pertencente a **Harness, FileReader mock e cleanup**. |
| 48 | U04 | `    }` | Fecha estrutura sintática pertencente a **Harness, FileReader mock e cleanup**. |
| 49 | U04 | `␠ [linha vazia]` | Separador visual dentro de **Harness, FileReader mock e cleanup**; sem efeito de runtime. |
| 50 | U04 | `    beforeEach(() => {` | Abre setup de isolamento por teste. |
| 51 | U04 | `        jest.resetModules();` | Reseta cache CommonJS do Jest antes de recarregar router/action. |
| 52 | U04 | `        jest.useRealTimers();` | Garante timers reais como baseline; somente o caso de timeout usa fake timers. |
| 53 | U04 | `        originalFetch = global.fetch;` | Captura global original para restauração confiável. |
| 54 | U04 | `        originalFileReader = global.FileReader;` | Captura global original para restauração confiável. |
| 55 | U04 | `        global.FileReader = MockFileReader;` | Instala o MockFileReader usado pela implementação real. |
| 56 | U04 | `    });` | Fecha estrutura sintática pertencente a **Harness, FileReader mock e cleanup**. |
| 57 | U04 | `␠ [linha vazia]` | Separador visual dentro de **Harness, FileReader mock e cleanup**; sem efeito de runtime. |
| 58 | U04 | `    afterEach(() => {` | Abre cleanup pós-teste. |
| 59 | U04 | `        jest.useRealTimers();` | Restaura timers reais, evitando vazamento do cenário de timeout. |
| 60 | U04 | `        global.fetch = originalFetch;` | Restaura globals nativos/modificados pelo cenário. |
| 61 | U04 | `        global.FileReader = originalFileReader;` | Restaura globals nativos/modificados pelo cenário. |
| 62 | U04 | `        delete global.MangaTranslatorLog;` | Remove namespace global injetado/carregado para isolar a próxima execução. |
| 63 | U04 | `        delete global.MangaTranslatorRouter;` | Remove namespace global injetado/carregado para isolar a próxima execução. |
| 64 | U04 | `        delete global.MangaTranslatorState;` | Remove namespace global injetado/carregado para isolar a próxima execução. |
| 65 | U04 | `    });` | Fecha estrutura sintática pertencente a **Harness, FileReader mock e cleanup**. |
| 66 | U04 | `␠ [linha vazia]` | Separador visual dentro de **Harness, FileReader mock e cleanup**; sem efeito de runtime. |
| 67 | U05 | `    test('busca uma imagem HTTP e devolve dataUrl no formato legado', async () => {` | Abre cenário Jest de **HTTP feliz e credenciais omitidas**; o nome do teste documenta o comportamento esperado. |
| 68 | U05 | `        global.fetch = jest.fn().mockResolvedValue({` | Substitui `fetch` por resposta controlada para exercitar a implementação real sem rede. |
| 69 | U05 | `            ok: true,` | Parte concreta de **HTTP feliz e credenciais omitidas**: `ok: true,`. |
| 70 | U05 | `            status: 200,` | Parte concreta de **HTTP feliz e credenciais omitidas**: `status: 200,`. |
| 71 | U05 | `            headers: { get: jest.fn(() => 'image/png') },` | Configura/verifica MIME relevante para **HTTP feliz e credenciais omitidas**. |
| 72 | U05 | `            blob: jest.fn().mockResolvedValue({ size: 1024, type: 'image/png' }),` | Configura tamanho do Blob para testar o limite de 50 MiB. |
| 73 | U05 | `        });` | Fecha estrutura sintática pertencente a **HTTP feliz e credenciais omitidas**. |
| 74 | U05 | `        const router = loadAction();` | Carrega router e action reais no registry isolado. |
| 75 | U05 | `␠ [linha vazia]` | Separador visual dentro de **HTTP feliz e credenciais omitidas**; sem efeito de runtime. |
| 76 | U05 | `        const result = await dispatch(router.createMessageRouter({}), {` | Envia a requisição através do `createMessageRouter` real e captura keepAlive + resposta. |
| 77 | U05 | `            action: 'FETCH_IMAGE_AS_BASE64',` | Usa o alias legado real que `router.js` mapeia para `fetch-image-base64`. |
| 78 | U05 | `            url: 'https://cdn.example/page.png',` | Define a URL de entrada do cenário de **HTTP feliz e credenciais omitidas**. |
| 79 | U05 | `        }, { tab: { id: 17, url: 'https://reader.example/chapter' } });` | Define identidade/URL do sender usada pelo router/action para validar a origem. |
| 80 | U05 | `␠ [linha vazia]` | Separador visual dentro de **HTTP feliz e credenciais omitidas**; sem efeito de runtime. |
| 81 | U05 | `        expect(result).toEqual({` | Inicia assertion direta sobre o efeito observável de **HTTP feliz e credenciais omitidas**. |
| 82 | U05 | `            keepAlive: true,` | Parte concreta de **HTTP feliz e credenciais omitidas**: `keepAlive: true,`. |
| 83 | U05 | `            response: { ok: true, dataUrl: 'data:image/png;base64,SU1BR0U=' },` | Parte concreta de **HTTP feliz e credenciais omitidas**: `response: { ok: true, dataUrl: 'data:image/png;base64,SU1BR0U=' },`. |
| 84 | U05 | `        });` | Fecha estrutura sintática pertencente a **HTTP feliz e credenciais omitidas**. |
| 85 | U05 | `        expect(global.fetch).toHaveBeenCalledWith(` | Inicia assertion direta sobre o efeito observável de **HTTP feliz e credenciais omitidas**. |
| 86 | U05 | `            'https://cdn.example/page.png',` | Parte concreta de **HTTP feliz e credenciais omitidas**: `'https://cdn.example/page.png',`. |
| 87 | U05 | `            expect.objectContaining({` | Parte concreta de **HTTP feliz e credenciais omitidas**: `expect.objectContaining({`. |
| 88 | U05 | `                signal: expect.any(AbortSignal),` | Exige que o fetch receba um `AbortSignal` real. |
| 89 | U05 | `                credentials: 'omit',` | Exige `credentials:'omit'` no fluxo HTTP comum. |
| 90 | U05 | `                cache: 'no-store',` | Exige bypass de cache HTTP via `cache:'no-store'`. |
| 91 | U05 | `            })` | Fecha estrutura sintática pertencente a **HTTP feliz e credenciais omitidas**. |
| 92 | U05 | `        );` | Fecha estrutura sintática pertencente a **HTTP feliz e credenciais omitidas**. |
| 93 | U05 | `    });` | Fecha estrutura sintática pertencente a **HTTP feliz e credenciais omitidas**. |
| 94 | U05 | `␠ [linha vazia]` | Separador visual dentro de **HTTP feliz e credenciais omitidas**; sem efeito de runtime. |
| 95 | U06 | `    test('busca asset googleusercontent com credenciais somente quando vem da aba Gemini', async () => {` | Abre cenário Jest de **Googleusercontent autenticado vindo do Gemini**; o nome do teste documenta o comportamento esperado. |
| 96 | U06 | `        global.fetch = jest.fn().mockResolvedValue({` | Substitui `fetch` por resposta controlada para exercitar a implementação real sem rede. |
| 97 | U06 | `            ok: true,` | Parte concreta de **Googleusercontent autenticado vindo do Gemini**: `ok: true,`. |
| 98 | U06 | `            status: 200,` | Parte concreta de **Googleusercontent autenticado vindo do Gemini**: `status: 200,`. |
| 99 | U06 | `            headers: { get: jest.fn(() => 'image/png') },` | Configura/verifica MIME relevante para **Googleusercontent autenticado vindo do Gemini**. |
| 100 | U06 | `            blob: jest.fn().mockResolvedValue({ size: 1024, type: 'image/png' }),` | Configura tamanho do Blob para testar o limite de 50 MiB. |
| 101 | U06 | `        });` | Fecha estrutura sintática pertencente a **Googleusercontent autenticado vindo do Gemini**. |
| 102 | U06 | `        const router = loadAction();` | Carrega router e action reais no registry isolado. |
| 103 | U06 | `␠ [linha vazia]` | Separador visual dentro de **Googleusercontent autenticado vindo do Gemini**; sem efeito de runtime. |
| 104 | U06 | `        const result = await dispatch(router.createMessageRouter({}), {` | Envia a requisição através do `createMessageRouter` real e captura keepAlive + resposta. |
| 105 | U06 | `            action: 'FETCH_IMAGE_AS_BASE64',` | Usa o alias legado real que `router.js` mapeia para `fetch-image-base64`. |
| 106 | U06 | `            url: 'https://lh3.googleusercontent.com/generated-image',` | Define a URL de entrada do cenário de **Googleusercontent autenticado vindo do Gemini**. |
| 107 | U06 | `            geminiSession: true,` | Ativa explicitamente o caminho de sessão Gemini autenticada. |
| 108 | U06 | `        }, { tab: { id: 17, url: 'https://gemini.google.com/app/chat-1' } });` | Define identidade/URL do sender usada pelo router/action para validar a origem. |
| 109 | U06 | `␠ [linha vazia]` | Separador visual dentro de **Googleusercontent autenticado vindo do Gemini**; sem efeito de runtime. |
| 110 | U06 | `        expect(result.response).toEqual(expect.objectContaining({ ok: true, dataUrl: expect.any(String) }));` | Inicia assertion direta sobre o efeito observável de **Googleusercontent autenticado vindo do Gemini**. |
| 111 | U06 | `        expect(global.fetch).toHaveBeenCalledWith(` | Inicia assertion direta sobre o efeito observável de **Googleusercontent autenticado vindo do Gemini**. |
| 112 | U06 | `            'https://lh3.googleusercontent.com/generated-image',` | Parte concreta de **Googleusercontent autenticado vindo do Gemini**: `'https://lh3.googleusercontent.com/generated-image',`. |
| 113 | U06 | `            expect.objectContaining({ credentials: 'include', cache: 'no-store' })` | Exige `credentials:'include'` somente no cenário autenticado aceito. |
| 114 | U06 | `        );` | Fecha estrutura sintática pertencente a **Googleusercontent autenticado vindo do Gemini**. |
| 115 | U06 | `    });` | Fecha estrutura sintática pertencente a **Googleusercontent autenticado vindo do Gemini**. |
| 116 | U06 | `␠ [linha vazia]` | Separador visual dentro de **Googleusercontent autenticado vindo do Gemini**; sem efeito de runtime. |
| 117 | U07 | `    test.each([` | Abre cenário Jest de **Rejeições de sessão autenticada**; o nome do teste documenta o comportamento esperado. |
| 118 | U07 | `        ['host não Google', 'https://example.test/image.png', 'https://gemini.google.com/app/chat-1', 'Asset autenticado deve ser googleusercontent.com'],` | Parte concreta de **Rejeições de sessão autenticada**: `['host não Google', 'https://example.test/image.png', 'https://gemini.google.com/app/chat-1', 'Asset autenticado deve ser googleusercontent.com'],`. |
| 119 | U07 | `        ['origem fora do Gemini', 'https://lh3.googleusercontent.com/image.png', 'https://reader.example/chapter', 'Sessão Gemini permitida somente para a aba Gemini'],` | Parte concreta de **Rejeições de sessão autenticada**: `['origem fora do Gemini', 'https://lh3.googleusercontent.com/image.png', 'https://reader.example/chapter', 'Sessão Gemini permitida somente para a aba Gemini'],`. |
| 120 | U07 | `    ])('rejeita sessão autenticada para %s', async (_name, url, senderUrl, message) => {` | Define a URL de entrada do cenário de **Rejeições de sessão autenticada**. |
| 121 | U07 | `        global.fetch = jest.fn();` | Instala spy de `fetch` para provar que validações rejeitam antes de qualquer acesso de rede. |
| 122 | U07 | `        const router = loadAction();` | Carrega router e action reais no registry isolado. |
| 123 | U07 | `        const result = await dispatch(router.createMessageRouter({}), {` | Envia a requisição através do `createMessageRouter` real e captura keepAlive + resposta. |
| 124 | U07 | `            action: 'FETCH_IMAGE_AS_BASE64', url, geminiSession: true,` | Usa o alias legado real que `router.js` mapeia para `fetch-image-base64`. |
| 125 | U07 | `        }, { tab: { id: 18, url: senderUrl } });` | Define identidade/URL do sender usada pelo router/action para validar a origem. |
| 126 | U07 | `␠ [linha vazia]` | Separador visual dentro de **Rejeições de sessão autenticada**; sem efeito de runtime. |
| 127 | U07 | `        expect(result.response).toEqual(expect.objectContaining({` | Inicia assertion direta sobre o efeito observável de **Rejeições de sessão autenticada**. |
| 128 | U07 | `            ok: false,` | Parte concreta de **Rejeições de sessão autenticada**: `ok: false,`. |
| 129 | U07 | `            error: expect.objectContaining({ message }),` | Parte concreta de **Rejeições de sessão autenticada**: `error: expect.objectContaining({ message }),`. |
| 130 | U07 | `        }));` | Fecha estrutura sintática pertencente a **Rejeições de sessão autenticada**. |
| 131 | U07 | `        expect(global.fetch).not.toHaveBeenCalled();` | Inicia assertion direta sobre o efeito observável de **Rejeições de sessão autenticada**. |
| 132 | U07 | `    });` | Fecha estrutura sintática pertencente a **Rejeições de sessão autenticada**. |
| 133 | U07 | `␠ [linha vazia]` | Separador visual dentro de **Rejeições de sessão autenticada**; sem efeito de runtime. |
| 134 | U08 | `    test.each([` | Abre cenário Jest de **Limite exato de 50 MiB**; o nome do teste documenta o comportamento esperado. |
| 135 | U08 | `        ['aceita exatamente 50 MB', 50 * 1024 * 1024, true],` | Parte concreta de **Limite exato de 50 MiB**: `['aceita exatamente 50 MB', 50 * 1024 * 1024, true],`. |
| 136 | U08 | `        ['rejeita mais de 50 MB', (50 * 1024 * 1024) + 1, false],` | Parte concreta de **Limite exato de 50 MiB**: `['rejeita mais de 50 MB', (50 * 1024 * 1024) + 1, false],`. |
| 137 | U08 | `    ])('%s', async (_name, size, shouldSucceed) => {` | Configura tamanho do Blob para testar o limite de 50 MiB. |
| 138 | U08 | `        global.fetch = jest.fn().mockResolvedValue({` | Substitui `fetch` por resposta controlada para exercitar a implementação real sem rede. |
| 139 | U08 | `            ok: true,` | Parte concreta de **Limite exato de 50 MiB**: `ok: true,`. |
| 140 | U08 | `            status: 200,` | Parte concreta de **Limite exato de 50 MiB**: `status: 200,`. |
| 141 | U08 | `            headers: { get: jest.fn(() => 'image/png') },` | Configura/verifica MIME relevante para **Limite exato de 50 MiB**. |
| 142 | U08 | `            blob: jest.fn().mockResolvedValue({ size, type: 'image/png' }),` | Configura tamanho do Blob para testar o limite de 50 MiB. |
| 143 | U08 | `        });` | Fecha estrutura sintática pertencente a **Limite exato de 50 MiB**. |
| 144 | U08 | `        const router = loadAction();` | Carrega router e action reais no registry isolado. |
| 145 | U08 | `␠ [linha vazia]` | Separador visual dentro de **Limite exato de 50 MiB**; sem efeito de runtime. |
| 146 | U08 | `        const result = await dispatch(router.createMessageRouter({}), {` | Envia a requisição através do `createMessageRouter` real e captura keepAlive + resposta. |
| 147 | U08 | `            action: 'FETCH_IMAGE_AS_BASE64',` | Usa o alias legado real que `router.js` mapeia para `fetch-image-base64`. |
| 148 | U08 | `            url: 'https://cdn.example/page.png',` | Define a URL de entrada do cenário de **Limite exato de 50 MiB**. |
| 149 | U08 | `        }, { tab: { id: 22, url: 'https://reader.example/chapter' } });` | Define identidade/URL do sender usada pelo router/action para validar a origem. |
| 150 | U08 | `␠ [linha vazia]` | Separador visual dentro de **Limite exato de 50 MiB**; sem efeito de runtime. |
| 151 | U08 | `        if (shouldSucceed) {` | Separa as expectativas do caso 50 MiB exatos e >50 MiB usando o mesmo corpo parametrizado. |
| 152 | U08 | `            expect(result).toEqual({` | Inicia assertion direta sobre o efeito observável de **Limite exato de 50 MiB**. |
| 153 | U08 | `                keepAlive: true,` | Parte concreta de **Limite exato de 50 MiB**: `keepAlive: true,`. |
| 154 | U08 | `                response: { ok: true, dataUrl: 'data:image/png;base64,SU1BR0U=' },` | Parte concreta de **Limite exato de 50 MiB**: `response: { ok: true, dataUrl: 'data:image/png;base64,SU1BR0U=' },`. |
| 155 | U08 | `            });` | Fecha estrutura sintática pertencente a **Limite exato de 50 MiB**. |
| 156 | U08 | `            return;` | Encerra o ramo positivo de **Limite exato de 50 MiB** para não executar a assertion negativa. |
| 157 | U08 | `        }` | Fecha estrutura sintática pertencente a **Limite exato de 50 MiB**. |
| 158 | U08 | `␠ [linha vazia]` | Separador visual dentro de **Limite exato de 50 MiB**; sem efeito de runtime. |
| 159 | U08 | `        expect(result).toEqual({` | Inicia assertion direta sobre o efeito observável de **Limite exato de 50 MiB**. |
| 160 | U08 | `            keepAlive: true,` | Parte concreta de **Limite exato de 50 MiB**: `keepAlive: true,`. |
| 161 | U08 | `            response: {` | Parte concreta de **Limite exato de 50 MiB**: `response: {`. |
| 162 | U08 | `                ok: false,` | Parte concreta de **Limite exato de 50 MiB**: `ok: false,`. |
| 163 | U08 | `                error: {` | Parte concreta de **Limite exato de 50 MiB**: `error: {`. |
| 164 | U08 | `                    code: 'INTERNAL_ERROR',` | Parte concreta de **Limite exato de 50 MiB**: `code: 'INTERNAL_ERROR',`. |
| 165 | U08 | `                    message: 'Imagem muito grande (>50MB)',` | Parte concreta de **Limite exato de 50 MiB**: `message: 'Imagem muito grande (>50MB)',`. |
| 166 | U08 | `                },` | Fecha estrutura sintática pertencente a **Limite exato de 50 MiB**. |
| 167 | U08 | `            },` | Fecha estrutura sintática pertencente a **Limite exato de 50 MiB**. |
| 168 | U08 | `        });` | Fecha estrutura sintática pertencente a **Limite exato de 50 MiB**. |
| 169 | U08 | `    });` | Fecha estrutura sintática pertencente a **Limite exato de 50 MiB**. |
| 170 | U08 | `␠ [linha vazia]` | Separador visual dentro de **Limite exato de 50 MiB**; sem efeito de runtime. |
| 171 | U09 | `    test.each([` | Abre cenário Jest de **Validação de URL/protocolo antes do fetch**; o nome do teste documenta o comportamento esperado. |
| 172 | U09 | `        ['URL inválida', 'not a url', 'URL inválida'],` | Parte concreta de **Validação de URL/protocolo antes do fetch**: `['URL inválida', 'not a url', 'URL inválida'],`. |
| 173 | U09 | `        ['protocolo não permitido', 'data:image/png;base64,AA==', 'Protocolo inválido'],` | Parte concreta de **Validação de URL/protocolo antes do fetch**: `['protocolo não permitido', 'data:image/png;base64,AA==', 'Protocolo inválido'],`. |
| 174 | U09 | `    ])('rejeita %s antes do fetch', async (_name, url, message) => {` | Define a URL de entrada do cenário de **Validação de URL/protocolo antes do fetch**. |
| 175 | U09 | `        global.fetch = jest.fn();` | Instala spy de `fetch` para provar que validações rejeitam antes de qualquer acesso de rede. |
| 176 | U09 | `        const router = loadAction();` | Carrega router e action reais no registry isolado. |
| 177 | U09 | `␠ [linha vazia]` | Separador visual dentro de **Validação de URL/protocolo antes do fetch**; sem efeito de runtime. |
| 178 | U09 | `        const result = await dispatch(router.createMessageRouter({}), {` | Envia a requisição através do `createMessageRouter` real e captura keepAlive + resposta. |
| 179 | U09 | `            action: 'FETCH_IMAGE_AS_BASE64',` | Usa o alias legado real que `router.js` mapeia para `fetch-image-base64`. |
| 180 | U09 | `            url,` | Parte concreta de **Validação de URL/protocolo antes do fetch**: `url,`. |
| 181 | U09 | `        }, { tab: { id: 18, url: 'https://reader.example/chapter' } });` | Define identidade/URL do sender usada pelo router/action para validar a origem. |
| 182 | U09 | `␠ [linha vazia]` | Separador visual dentro de **Validação de URL/protocolo antes do fetch**; sem efeito de runtime. |
| 183 | U09 | `        expect(result).toEqual({` | Inicia assertion direta sobre o efeito observável de **Validação de URL/protocolo antes do fetch**. |
| 184 | U09 | `            keepAlive: false,` | Parte concreta de **Validação de URL/protocolo antes do fetch**: `keepAlive: false,`. |
| 185 | U09 | `            response: {` | Parte concreta de **Validação de URL/protocolo antes do fetch**: `response: {`. |
| 186 | U09 | `                ok: false,` | Parte concreta de **Validação de URL/protocolo antes do fetch**: `ok: false,`. |
| 187 | U09 | `                error: { code: 'INVALID_PAYLOAD', message },` | Parte concreta de **Validação de URL/protocolo antes do fetch**: `error: { code: 'INVALID_PAYLOAD', message },`. |
| 188 | U09 | `            },` | Fecha estrutura sintática pertencente a **Validação de URL/protocolo antes do fetch**. |
| 189 | U09 | `        });` | Fecha estrutura sintática pertencente a **Validação de URL/protocolo antes do fetch**. |
| 190 | U09 | `        expect(global.fetch).not.toHaveBeenCalled();` | Inicia assertion direta sobre o efeito observável de **Validação de URL/protocolo antes do fetch**. |
| 191 | U09 | `    });` | Fecha estrutura sintática pertencente a **Validação de URL/protocolo antes do fetch**. |
| 192 | U09 | `␠ [linha vazia]` | Separador visual dentro de **Validação de URL/protocolo antes do fetch**; sem efeito de runtime. |
| 193 | U10 | `    test('rejeita uma resposta que nao declara content-type de imagem', async () => {` | Abre cenário Jest de **Content-Type não-imagem**; o nome do teste documenta o comportamento esperado. |
| 194 | U10 | `        const blob = jest.fn();` | Parte concreta de **Content-Type não-imagem**: `const blob = jest.fn();`. |
| 195 | U10 | `        global.fetch = jest.fn().mockResolvedValue({` | Substitui `fetch` por resposta controlada para exercitar a implementação real sem rede. |
| 196 | U10 | `            ok: true,` | Parte concreta de **Content-Type não-imagem**: `ok: true,`. |
| 197 | U10 | `            status: 200,` | Parte concreta de **Content-Type não-imagem**: `status: 200,`. |
| 198 | U10 | `            headers: { get: jest.fn(() => 'text/html') },` | Configura/verifica MIME relevante para **Content-Type não-imagem**. |
| 199 | U10 | `            blob,` | Parte concreta de **Content-Type não-imagem**: `blob,`. |
| 200 | U10 | `        });` | Fecha estrutura sintática pertencente a **Content-Type não-imagem**. |
| 201 | U10 | `        const router = loadAction();` | Carrega router e action reais no registry isolado. |
| 202 | U10 | `␠ [linha vazia]` | Separador visual dentro de **Content-Type não-imagem**; sem efeito de runtime. |
| 203 | U10 | `        const result = await dispatch(router.createMessageRouter({}), {` | Envia a requisição através do `createMessageRouter` real e captura keepAlive + resposta. |
| 204 | U10 | `            action: 'FETCH_IMAGE_AS_BASE64',` | Usa o alias legado real que `router.js` mapeia para `fetch-image-base64`. |
| 205 | U10 | `            url: 'https://cdn.example/not-image',` | Define a URL de entrada do cenário de **Content-Type não-imagem**. |
| 206 | U10 | `        }, { tab: { id: 19, url: 'https://reader.example/chapter' } });` | Define identidade/URL do sender usada pelo router/action para validar a origem. |
| 207 | U10 | `␠ [linha vazia]` | Separador visual dentro de **Content-Type não-imagem**; sem efeito de runtime. |
| 208 | U10 | `        expect(result).toEqual({` | Inicia assertion direta sobre o efeito observável de **Content-Type não-imagem**. |
| 209 | U10 | `            keepAlive: true,` | Parte concreta de **Content-Type não-imagem**: `keepAlive: true,`. |
| 210 | U10 | `            response: {` | Parte concreta de **Content-Type não-imagem**: `response: {`. |
| 211 | U10 | `                ok: false,` | Parte concreta de **Content-Type não-imagem**: `ok: false,`. |
| 212 | U10 | `                error: {` | Parte concreta de **Content-Type não-imagem**: `error: {`. |
| 213 | U10 | `                    code: 'INTERNAL_ERROR',` | Parte concreta de **Content-Type não-imagem**: `code: 'INTERNAL_ERROR',`. |
| 214 | U10 | `                    message: 'Content-Type inválido: text/html',` | Parte concreta de **Content-Type não-imagem**: `message: 'Content-Type inválido: text/html',`. |
| 215 | U10 | `                },` | Fecha estrutura sintática pertencente a **Content-Type não-imagem**. |
| 216 | U10 | `            },` | Fecha estrutura sintática pertencente a **Content-Type não-imagem**. |
| 217 | U10 | `        });` | Fecha estrutura sintática pertencente a **Content-Type não-imagem**. |
| 218 | U10 | `        expect(blob).not.toHaveBeenCalled();` | Inicia assertion direta sobre o efeito observável de **Content-Type não-imagem**. |
| 219 | U10 | `    });` | Fecha estrutura sintática pertencente a **Content-Type não-imagem**. |
| 220 | U10 | `␠ [linha vazia]` | Separador visual dentro de **Content-Type não-imagem**; sem efeito de runtime. |
| 221 | U11 | `    test('rejeita uma resposta HTTP sem sucesso', async () => {` | Abre cenário Jest de **Resposta HTTP não-ok**; o nome do teste documenta o comportamento esperado. |
| 222 | U11 | `        global.fetch = jest.fn().mockResolvedValue({` | Substitui `fetch` por resposta controlada para exercitar a implementação real sem rede. |
| 223 | U11 | `            ok: false,` | Parte concreta de **Resposta HTTP não-ok**: `ok: false,`. |
| 224 | U11 | `            status: 404,` | Configura/verifica propagação da resposta HTTP 404 como INTERNAL_ERROR. |
| 225 | U11 | `            headers: { get: jest.fn() },` | Parte concreta de **Resposta HTTP não-ok**: `headers: { get: jest.fn() },`. |
| 226 | U11 | `        });` | Fecha estrutura sintática pertencente a **Resposta HTTP não-ok**. |
| 227 | U11 | `        const router = loadAction();` | Carrega router e action reais no registry isolado. |
| 228 | U11 | `␠ [linha vazia]` | Separador visual dentro de **Resposta HTTP não-ok**; sem efeito de runtime. |
| 229 | U11 | `        const result = await dispatch(router.createMessageRouter({}), {` | Envia a requisição através do `createMessageRouter` real e captura keepAlive + resposta. |
| 230 | U11 | `            action: 'FETCH_IMAGE_AS_BASE64',` | Usa o alias legado real que `router.js` mapeia para `fetch-image-base64`. |
| 231 | U11 | `            url: 'https://cdn.example/missing.png',` | Define a URL de entrada do cenário de **Resposta HTTP não-ok**. |
| 232 | U11 | `        }, { tab: { id: 20, url: 'https://reader.example/chapter' } });` | Define identidade/URL do sender usada pelo router/action para validar a origem. |
| 233 | U11 | `␠ [linha vazia]` | Separador visual dentro de **Resposta HTTP não-ok**; sem efeito de runtime. |
| 234 | U11 | `        expect(result.response).toEqual({` | Inicia assertion direta sobre o efeito observável de **Resposta HTTP não-ok**. |
| 235 | U11 | `            ok: false,` | Parte concreta de **Resposta HTTP não-ok**: `ok: false,`. |
| 236 | U11 | `            error: { code: 'INTERNAL_ERROR', message: 'HTTP 404' },` | Configura/verifica propagação da resposta HTTP 404 como INTERNAL_ERROR. |
| 237 | U11 | `        });` | Fecha estrutura sintática pertencente a **Resposta HTTP não-ok**. |
| 238 | U11 | `    });` | Fecha estrutura sintática pertencente a **Resposta HTTP não-ok**. |
| 239 | U11 | `␠ [linha vazia]` | Separador visual dentro de **Resposta HTTP não-ok**; sem efeito de runtime. |
| 240 | U12 | `    test('aborta o fetch apos 30 segundos', async () => {` | Abre cenário Jest de **Timeout/AbortController de 30 s**; o nome do teste documenta o comportamento esperado. |
| 241 | U12 | `        jest.useFakeTimers();` | Troca para relógio virtual para testar 30 s sem espera real. |
| 242 | U12 | `        let signal;` | Reserva referência ao AbortSignal recebido pelo mock de fetch. |
| 243 | U12 | `        global.fetch = jest.fn((_url, options) => {` | Parte concreta de **Timeout/AbortController de 30 s**: `global.fetch = jest.fn((_url, options) => {`. |
| 244 | U12 | `            signal = options.signal;` | Captura o signal passado pela action para assertions de abort. |
| 245 | U12 | `            return new Promise((_resolve, reject) => {` | Parte concreta de **Timeout/AbortController de 30 s**: `return new Promise((_resolve, reject) => {`. |
| 246 | U12 | `                signal.addEventListener('abort', () => reject(new Error('Abortado')));` | Faz o mock rejeitar quando a action realmente aborta o signal. |
| 247 | U12 | `            });` | Fecha estrutura sintática pertencente a **Timeout/AbortController de 30 s**. |
| 248 | U12 | `        });` | Fecha estrutura sintática pertencente a **Timeout/AbortController de 30 s**. |
| 249 | U12 | `        const router = loadAction();` | Carrega router e action reais no registry isolado. |
| 250 | U12 | `        const resultPromise = dispatch(router.createMessageRouter({}), {` | Envia a requisição através do `createMessageRouter` real e captura keepAlive + resposta. |
| 251 | U12 | `            action: 'FETCH_IMAGE_AS_BASE64',` | Usa o alias legado real que `router.js` mapeia para `fetch-image-base64`. |
| 252 | U12 | `            url: 'https://cdn.example/slow.png',` | Define a URL de entrada do cenário de **Timeout/AbortController de 30 s**. |
| 253 | U12 | `        }, { tab: { id: 21, url: 'https://reader.example/chapter' } });` | Define identidade/URL do sender usada pelo router/action para validar a origem. |
| 254 | U12 | `␠ [linha vazia]` | Separador visual dentro de **Timeout/AbortController de 30 s**; sem efeito de runtime. |
| 255 | U12 | `        expect(signal.aborted).toBe(false);` | Inicia assertion direta sobre o efeito observável de **Timeout/AbortController de 30 s**. |
| 256 | U12 | `        jest.advanceTimersByTime(30_000);` | Avança exatamente 30.000 ms e dispara o timeout da implementação. |
| 257 | U12 | `␠ [linha vazia]` | Separador visual dentro de **Timeout/AbortController de 30 s**; sem efeito de runtime. |
| 258 | U12 | `        await expect(resultPromise).resolves.toEqual({` | Inicia assertion direta sobre o efeito observável de **Timeout/AbortController de 30 s**. |
| 259 | U12 | `            keepAlive: true,` | Parte concreta de **Timeout/AbortController de 30 s**: `keepAlive: true,`. |
| 260 | U12 | `            response: {` | Parte concreta de **Timeout/AbortController de 30 s**: `response: {`. |
| 261 | U12 | `                ok: false,` | Parte concreta de **Timeout/AbortController de 30 s**: `ok: false,`. |
| 262 | U12 | `                error: { code: 'INTERNAL_ERROR', message: 'Abortado' },` | Parte concreta de **Timeout/AbortController de 30 s**: `error: { code: 'INTERNAL_ERROR', message: 'Abortado' },`. |
| 263 | U12 | `            },` | Fecha estrutura sintática pertencente a **Timeout/AbortController de 30 s**. |
| 264 | U12 | `        });` | Fecha estrutura sintática pertencente a **Timeout/AbortController de 30 s**. |
| 265 | U12 | `        expect(signal.aborted).toBe(true);` | Inicia assertion direta sobre o efeito observável de **Timeout/AbortController de 30 s**. |
| 266 | U12 | `    });` | Fecha estrutura sintática pertencente a **Timeout/AbortController de 30 s**. |
| 267 | U12 | `});` | Fecha estrutura sintática pertencente a **Timeout/AbortController de 30 s**. |
| 268 | U13 | `␠ [linha vazia]` | Separador visual dentro de **Fechamento editorial**; sem efeito de runtime. |

| 269 | U13 | `⏎ [newline final]` | Terminador físico final do blob; completa a contagem documental 269/269. |

## 11. Análise por unidade

### U01 — linhas 1–8 — Imports e caminhos reais

Resolve os dois módulos de produção por caminho absoluto a partir da própria suíte. Isso é importante porque a evidência depende dos bytes reais do router/action; um helper que copiasse `validate` ou `execute` poderia ficar verde enquanto produção diverge.

### U02 — linhas 9–25 — Adaptação do listener Chrome

Converte o contrato callback + retorno booleano em Promise sem perder a ordem temporal. O design suporta tanto resposta síncrona durante a chamada do listener quanto resposta assíncrona após retorno `true`.

### U03 — linhas 26–38 — Carregamento isolado

Recria namespace global e cache de módulos por cenário. O router precisa existir antes da action porque a própria action falha ao registrar se `MangaTranslatorRouter.registerAction` não existir.

### U04 — linhas 39–66 — Harness e cleanup

Define a suíte, o mock assíncrono de FileReader e restauração de timers/globals. O cleanup reduz acoplamento entre cenários e evita falso positivo por registry/fetch/FileReader herdado.

### U05 — linhas 67–94 — HTTP feliz

Prova o contrato legado completo: alias → router → execute → fetch → Blob → FileReader → resposta. As assertions fixam `credentials:'omit'`, `cache:'no-store'` e presença de AbortSignal.

### U06 — linhas 95–116 — Sessão Gemini feliz

Prova o único cenário em que credenciais são incluídas: URL googleusercontent + sender estritamente Gemini. O teste mantém o restante da resposta feliz igual ao fluxo comum.

### U07 — linhas 117–133 — Trust boundary negativa

Dois vetores são separados: host errado falha em `validate`; sender errado passa a validação de host, mas falha no início de `execute`. Em ambos, `fetch` não ocorre.

### U08 — linhas 134–170 — Boundary de 50 MiB

O teste parametrizado fixa a desigualdade real da action: `blob.size > MAX_IMAGE_BYTES`. Exatamente 50 MiB passa; 50 MiB + 1 falha.

### U09 — linhas 171–192 — URL/protocolo

Demonstra erro síncrono de payload. A diferença de `keepAlive:false` em relação aos erros do executor é parte importante do contrato roteado.

### U10 — linhas 193–220 — MIME

Prova que o header precisa começar com `image/` e, se não começar, `response.blob` nem é chamado.

### U11 — linhas 221–239 — HTTP status

Prova que `response.ok=false` prevalece antes de MIME/Blob e que status 404 aparece na mensagem roteada.

### U12 — linhas 240–267 — Timeout

Usa relógio virtual e um fetch que só rejeita em `abort`. Assim, a suíte prova causalmente que avançar 30 s aciona o AbortController e produz a resposta de erro esperada.

### U13 — linha 268 + posição 269 — Fechamento físico

A linha textual final é vazia e o blob termina com newline. A Bíblia contabiliza ambos sem inventar comportamento.

## 12. Autoauditoria do AGENTE 10

- [x] reserva ativa foi relida no branch e identifica **AGENTE 10**;
- [x] o SHA da reserva coincide com o fonte atual;
- [x] estado individual #145 foi materializado porque estava ausente;
- [x] fonte integral incorporada sem modificar o teste;
- [x] 268 linhas textuais + newline terminal = 269/269 posições;
- [x] router e action reais foram lidos;
- [x] Jest config, package scripts e CI foram cruzados;
- [x] execução histórica do **mesmo blob** foi confirmada no run #245/job #106562567286;
- [x] 11 cenários positivos/negativos foram classificados apenas pelo que realmente provam;
- [x] gaps de FileReader, HTTPS autenticado, origem negada e coerência Blob/DataURL foram persistidos como solicitações externas;
- [x] nenhum código, teste, fixture, workflow ou configuração funcional foi alterado para fabricar evidência.

**Resultado:** ✅ Bíblia concluída para `1246da7bd3992499b1a21a4a00dc32b83f9486c3`. As solicitações ao auditor permanecem abertas e não impedem a conclusão documental desta unidade.

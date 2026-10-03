# Bíblia técnica — tests/unit/background/calculate-visual-fingerprint-action.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `f51a0b629ac17be3eda349333192b9480494a07e`  
> **Agente responsável:** AGENTE 24  
> **Tipo:** teste unitário focal da action real `calculate-visual-fingerprint` e do roteamento correspondente  
> **Linhas textuais:** 204  
> **Posições documentais:** 205, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`tests/unit/background/calculate-visual-fingerprint-action.test.js` é uma suíte Jest do projeto `background` que carrega **a implementação real** de:

- `extension/background/router.js`;
- `extension/background/actions/calculate-visual-fingerprint.js`.

Diferentemente de uma simulação que replique a lógica do handler, este arquivo mocka somente as fronteiras de plataforma — `fetch`, `createImageBitmap`, `OffscreenCanvas` e a API `MangaTranslatorGtcFingerprint` — e deixa o roteador e a action reais decidirem validação, sequência de processamento, envelope da resposta, crop central, cleanup e logging.

O teste, portanto, fornece evidência forte para o **glue/orquestração real da action**. Ele não prova matematicamente os algoritmos dHash/wHash/pHash/regional porque essas funções são substituídas por spies/sentinelas; a correção algorítmica pertence às suítes de `gtc-fingerprint.js`.

## 2. Como a implementação real é carregada

### Caminhos

- `ROUTER_PATH` resolve `extension/background/router.js`;
- `ACTION_PATH` resolve `extension/background/actions/calculate-visual-fingerprint.js`.

### `loadAction(logger)`

O bootstrap:

1. faz `global.self = global`, fornecendo o scope esperado pelas IIFEs;
2. injeta `global.MangaTranslatorLog = { log: logger }`;
3. remove qualquer router global anterior;
4. executa `jest.isolateModules`;
5. requer o router real;
6. requer a action real, que chama `registerAction`;
7. devolve `global.MangaTranslatorRouter`.

Assim, as mensagens de teste percorrem `createMessageRouter`, `ACTION_MAP`, descoberta da action registrada, criação de contexto e `execute` reais.

## 3. Contrato do helper `dispatch`

O helper transforma o padrão callback/return-value de `chrome.runtime.onMessage` em Promise observável.

Ele captura separadamente:

- `keepAlive`: retorno síncrono do listener;
- `response`: argumento de `sendResponse`.

A resolução cobre dois formatos:

- resposta assíncrona: `sendResponse` resolve depois que `keepAlive` já foi capturado;
- resposta síncrona ou listener que devolve `false`: o helper resolve imediatamente após a invocação.

Para esta action, o router segue o caminho assíncrono e devolve `true`, por isso todos os quatro casos comprovam `keepAlive: true`.

## 4. Relação com o router real

O router real contém o mapping:

`CALCULATE_VISUAL_FINGERPRINT -> calculate-visual-fingerprint`.

A action se registra sob `calculate-visual-fingerprint` e declara `allowedSources: ['any']`.

Os testes usam sender com `tab.url` de conteúdo comum. O fato de a mensagem chegar à action, produzir resposta e manter o canal aberto comprova a integração do mapping, registro da action e execução assíncrona para esse sender.

A suíte não é um teste exaustivo de `router.js`; apenas exerce a fatia necessária à action.

## 5. Contrato da action real exercitado

### 5.1 Guard de URL

A action tenta `new URL(url)` e depois exige protocolo `http:` ou `https:`.

A suíte prova diretamente o segundo guard com:

- `data:image/png;base64,AAA`;
- `chrome-extension://example-id/asset.png`.

Em ambos:

- resposta final é `{ ok:false, error:'URL inválida para fingerprint visual' }`;
- `fetch` não é chamado.

O branch de **falha de parsing** de `new URL` não possui caso focal nesta suíte.

### 5.2 Fetch e decodificação

No caminho verde, a action executa:

`fetch(url, { credentials:'omit', cache:'no-store' })`.

A assertion das linhas 120–123 comprova exatamente essas opções.

Depois, a implementação real chama `resp.blob()` e `createImageBitmap(blob)`. O teste permite e observa o segundo indiretamente pelo restante do pipeline, mas não possui assertions específicas para falha HTTP, rejeição do fetch, falha de `blob()` ou falha de `createImageBitmap`.

### 5.3 Pixel sample 8×8

A action cria canvas 8×8, coleta RGBA e serializa cada byte em dois dígitos hex.

Com o mock determinístico, a suíte prova que a resposta contém `pixelSample` com **512 caracteres hexadecimais**:

8 × 8 × 4 canais × 2 caracteres = 512.

A assertion verifica formato/comprimento, não a sequência hexadecimal completa.

### 5.4 dHash 9×8

Quando a API oferece `calculateDHash`, a action cria canvas 9×8, lê pixels e encaminha `id9.data`.

A suíte injeta `calculateDHash -> 'dhash'` e comprova a preservação de `dHash:'dhash'` na resposta.

Ela não afirma o conteúdo exato entregue ao algoritmo nem a correção matemática do dHash.

### 5.5 wHash/pHash principal 32×32

A API injetada oferece ambos os métodos. A action cria canvas 32×32 e chama as duas funções.

Retornos sentinela:

- `w-main`;
- `p-main`.

São diretamente observados no response.

### 5.6 center-crop visual-v4

O bitmap mock possui 800×1200.

A action calcula:

- `side = 800`;
- `cropX = 0`;
- `cropY = 200`;
- destino 32×32.

A linha 128 verifica uma chamada `drawImage` que contém os argumentos `[0, 200, 800, 800, 0, 0, 32, 32]`. Como wHash/pHash retornam valores diferentes na segunda chamada, as assertions também comprovam `wHashCrop:'w-crop'` e `pHashCrop:'p-crop'`.

Isso é prova direta do caminho retangular de crop central. O branch quadrado/zero-dimension, que deve omitir crop, não possui teste focal neste arquivo.

### 5.7 hashes regionais 48×48

A action chama `calculateRegionalHashes` quando o método existe e inclui o resultado na resposta. A sentinela `{ topLeft:'tl' }` é preservada diretamente.

A matemática regional real não é objeto desta suíte.

### 5.8 cleanup de `ImageBitmap`

Há duas provas complementares:

- sucesso: a action chama `bitmap.close()`, zera `bitmap` e o spy registra **uma** chamada;
- falha após bitmap existir: `calculateWHash` lança; o `catch` cria a resposta de erro e o `finally` fecha o bitmap exatamente uma vez.

Essa combinação prova tanto o cleanup explícito do caminho verde quanto o cleanup defensivo do caminho excepcional.

### 5.9 logging

Caminho verde:

- nível `info`;
- componente `bg`;
- código `VISUAL_FP_OK`.

Caminho de falha no hash:

- nível `warn`;
- componente `bg`;
- código `VISUAL_FP_FAIL`;
- mensagem contém `wHash indisponivel`.

Os metadados exatos do log não são integralmente fixados; o teste usa `expect.any(Object)`.

## 6. Descoberta e execução

### Jest

`jest.config.js` define o projeto:

- `displayName: 'background'`;
- ambiente `node`;
- `testMatch: tests/unit/background/**/*.test.js`;
- setup `tests/mocks/chrome-api.mock.js`.

Logo este arquivo pertence diretamente ao projeto background.

### package.json

- `test:unit:background` seleciona o projeto background;
- `test:unit` inclui background;
- `test:ci` usa o runner canônico de Jest;
- `test:coverage` usa o mesmo runner em coverage.

## 7. Evidência de CI do mesmo blob

Foi localizado o workflow **MangaTranslator CI #36577447500** em que o blob desta suíte era exatamente `f51a0b629ac17be3eda349333192b9480494a07e`, idêntico ao auditado.

O arquivo aparece nominalmente como PASS em:

- **Unit + Integration (20.x)** — job `109437162616`;
- **Unit + Integration (22.x)** — job `109437162754`;
- **Code Coverage** — job `109437162502`;
- **Windows Portability** — job `109437162789` (nas execuções Jest observadas dentro do job).

Nos jobs Linux Node 20/22 o run reportou 109 suites e 851 testes aprovados.

A execução de CI prova que a suíte real é descoberta, carrega seus módulos e passa nesses ambientes. A força probatória de cada comportamento continua determinada pelas assertions específicas descritas acima.

## 8. Evidência correlata fora deste arquivo

Há cobertura parcialmente redundante em `tests/unit/background/message-handlers-real.test.js` e `tests/unit/background/test_bg59.test.js`, que também despacham `CALCULATE_VISUAL_FINGERPRINT` pela infraestrutura real.

Em particular, `message-handlers-real.test.js` comprova um caminho positivo pelo background carregado e um caso de rejeição de data URL.

Essa redundância reforça os caminhos já testados, mas a busca realizada não encontrou caso focal para:

- `resp.ok === false`;
- fetch rejeitado;
- erro de `blob()`;
- erro de `createImageBitmap`;
- ausência total de `MangaTranslatorGtcFingerprint`;
- branch de bitmap quadrado sem center-crop.

## 9. Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| caminho do router/action aponta para implementação real | linhas 3–7 + require 31–32 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| mapping legado chega à action real | dispatch com `CALCULATE_VISUAL_FINGERPRINT` e resposta real | ✅ PROVADO DIRETAMENTE |
| canal assíncrono permanece aberto | `keepAlive:true` nos quatro casos | ✅ PROVADO DIRETAMENTE |
| HTTPS usa fetch com credentials omit/no-store | linhas 120–123 | ✅ PROVADO DIRETAMENTE |
| pixel sample possui 512 chars hex | linha 111 | ✅ PROVADO DIRETAMENTE |
| dHash é propagado | linha 112 | ✅ PROVADO DIRETAMENTE |
| wHash/pHash principais são propagados | linhas 113–114 | ✅ PROVADO DIRETAMENTE |
| center-crop 800×1200 usa região 0,200,800,800 | linhas 124–130 | ✅ PROVADO DIRETAMENTE |
| wHashCrop/pHashCrop são propagados | linhas 115–116 | ✅ PROVADO DIRETAMENTE |
| regional hashes são propagados | linha 117 | ✅ PROVADO DIRETAMENTE |
| bitmap fecha no sucesso | linha 131 | ✅ PROVADO DIRETAMENTE |
| log de sucesso usa VISUAL_FP_OK | linha 132 | ✅ PROVADO DIRETAMENTE |
| data URL é rejeitada sem fetch | linhas 144–148 | ✅ PROVADO DIRETAMENTE |
| chrome-extension URL é rejeitada sem fetch | linhas 160–164 | ✅ PROVADO DIRETAMENTE |
| erro de hash vira resposta ok:false com mensagem original | linhas 191–194 | ✅ PROVADO DIRETAMENTE |
| bitmap fecha quando hash lança | linha 195 | ✅ PROVADO DIRETAMENTE |
| falha de hash registra VISUAL_FP_FAIL | linhas 196–202 | ✅ PROVADO DIRETAMENTE |
| `new URL` lança para entrada malformada/ausente | implementação possui branch, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| HTTP status não-ok gera erro `HTTP <status>...` | implementação possui branch, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| rejeição de fetch/blob/createImageBitmap é convertida em falha/log | catch genérico existe, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| API de fingerprint ausente retorna somente pixelSample + hashes nulos | branch existe, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| bitmap quadrado não cria center-crop | branch existe, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| matemática de dHash/wHash/pHash/regional | funções estão mockadas nesta suíte | 🟨 EXECUTADO INDIRETAMENTE / PROVADO EM SUÍTES PRÓPRIAS |

## 10. Solicitação ao auditor

### 133-001 — TEST_REQUIRED — OPEN

**Encontrado:** a suíte prova com boa especificidade os caminhos principal, protocolo inválido e exceção durante wHash, mas múltiplos branches reais da action não possuem assertion focal localizada.

**Arquivo auditado:** `tests/unit/background/calculate-visual-fingerprint-action.test.js`.

**Arquivo externo relacionado:** a própria suíte de teste; qualquer alteração deverá ocorrer em processo de auditoria separado, não durante esta Bíblia.

**Implementação relacionada:** `extension/background/actions/calculate-visual-fingerprint.js`.

**Evidência atual:** execução do handler real; success visual-v4, data/chrome-extension inválidos e exceção após bitmap criado são diretamente testados. O mesmo blob passa em Node 20/22, coverage e Windows.

**Evidência ausente:** casos isolados para URL que falha no parsing, `resp.ok=false`, fetch/blob/createImageBitmap rejeitados, API de fingerprint ausente/parcial e imagem quadrada que não deve produzir hashes de crop.

**Por que a evidência atual é insuficiente:** o catch/fallback é compartilhado, mas cada falha acontece em momento diferente e impõe propriedades distintas — por exemplo, não pode haver `close` antes de bitmap existir, enquanto o branch quadrado deve terminar com sucesso e crops nulos.

**Ação solicitada:** adicionar casos focais usando a implementação real já carregada por esta suíte, variando apenas os mocks das fronteiras de plataforma. Evitar duplicar a lógica da action.

**Evidência esperada:** assertions específicas de response/log/cleanup e ausência/presença das chamadas relevantes para cada branch.

**Possível regressão:** erro HTTP/decode/plataforma ou mudança de dimensão pode produzir resposta/log/cleanup incorretos sem falhar os testes atuais.

**Impacto:** robustez do fallback visual no Service Worker e diagnóstico de falhas de imagem.

**Severidade:** NORMAL.

## 11. Fonte integral auditada

~~~js
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(
    __dirname,
    '../../../extension/background/actions/calculate-visual-fingerprint.js'
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

function loadAction(logger) {
    global.self = global;
    global.MangaTranslatorLog = { log: logger };
    delete global.MangaTranslatorRouter;

    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(ACTION_PATH);
    });

    return global.MangaTranslatorRouter;
}

describe('calculate-visual-fingerprint action', () => {
    let originalFetch;
    let originalSelf;
    let originalCreateImageBitmap;
    let originalOffscreenCanvas;

    beforeEach(() => {
        jest.resetModules();
        originalFetch = global.fetch;
        originalSelf = global.self;
        originalCreateImageBitmap = global.createImageBitmap;
        originalOffscreenCanvas = global.OffscreenCanvas;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        global.self = originalSelf;
        global.createImageBitmap = originalCreateImageBitmap;
        global.OffscreenCanvas = originalOffscreenCanvas;
        delete global.MangaTranslatorGtcFingerprint;
        delete global.MangaTranslatorLog;
        delete global.MangaTranslatorRouter;
    });

    test('preserves the visual-v4 response, including center-crop hashes', async () => {
        const close = jest.fn();
        const drawCalls = [];
        const fpApi = {
            calculateDHash: jest.fn(() => 'dhash'),
            calculateWHash: jest.fn()
                .mockReturnValueOnce('w-main')
                .mockReturnValueOnce('w-crop'),
            calculatePHash: jest.fn()
                .mockReturnValueOnce('p-main')
                .mockReturnValueOnce('p-crop'),
            calculateRegionalHashes: jest.fn(() => ({ topLeft: 'tl' })),
        };

        class MockOffscreenCanvas {
            constructor(width, height) {
                this.width = width;
                this.height = height;
            }

            getContext() {
                return {
                    drawImage: (...args) => drawCalls.push({ width: this.width, height: this.height, args }),
                    getImageData: () => ({
                        data: Uint8ClampedArray.from(
                            { length: this.width * this.height * 4 },
                            (_value, index) => index % 256
                        ),
                    }),
                };
            }
        }

        global.fetch = jest.fn(async () => ({ ok: true, blob: async () => ({}) }));
        global.createImageBitmap = jest.fn(async () => ({ width: 800, height: 1200, close }));
        global.OffscreenCanvas = MockOffscreenCanvas;
        global.MangaTranslatorGtcFingerprint = fpApi;
        const logger = jest.fn();
        const router = loadAction(logger);

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'CALCULATE_VISUAL_FINGERPRINT',
            url: 'https://cdn.example.test/page.png',
        }, { tab: { id: 8, url: 'https://reader.example.test/chapter' } });

        expect(result).toEqual({
            keepAlive: true,
            response: {
                ok: true,
                pixelSample: expect.stringMatching(/^[0-9a-f]{512}$/),
                dHash: 'dhash',
                wHash: 'w-main',
                pHash: 'p-main',
                wHashCrop: 'w-crop',
                pHashCrop: 'p-crop',
                regionalHashes: { topLeft: 'tl' },
            },
        });
        expect(global.fetch).toHaveBeenCalledWith('https://cdn.example.test/page.png', {
            credentials: 'omit',
            cache: 'no-store',
        });
        expect(drawCalls).toEqual(expect.arrayContaining([
            expect.objectContaining({
                width: 32,
                height: 32,
                args: expect.arrayContaining([0, 200, 800, 800, 0, 0, 32, 32]),
            }),
        ]));
        expect(close).toHaveBeenCalledTimes(1);
        expect(logger).toHaveBeenCalledWith('info', 'bg', 'VISUAL_FP_OK', expect.any(String), expect.any(Object));
    });

    test('rejects data URLs without fetching them', async () => {
        global.fetch = jest.fn();
        const router = loadAction(jest.fn());

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'CALCULATE_VISUAL_FINGERPRINT',
            url: 'data:image/png;base64,AAA',
        }, { tab: { id: 8, url: 'https://reader.example.test/chapter' } });

        expect(result).toEqual({
            keepAlive: true,
            response: { ok: false, error: 'URL inválida para fingerprint visual' },
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects non-HTTP(S) URLs without fetching them', async () => {
        global.fetch = jest.fn();
        const router = loadAction(jest.fn());

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'CALCULATE_VISUAL_FINGERPRINT',
            url: 'chrome-extension://example-id/asset.png',
        }, { tab: { id: 8, url: 'https://reader.example.test/chapter' } });

        expect(result).toEqual({
            keepAlive: true,
            response: { ok: false, error: 'URL inválida para fingerprint visual' },
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('closes the ImageBitmap when a fingerprint calculation fails', async () => {
        const close = jest.fn();
        const hashFailure = new Error('wHash indisponivel');
        global.fetch = jest.fn(async () => ({ ok: true, blob: async () => ({}) }));
        global.createImageBitmap = jest.fn(async () => ({ width: 800, height: 1200, close }));
        global.OffscreenCanvas = class {
            getContext() {
                return {
                    drawImage: jest.fn(),
                    getImageData: () => ({ data: new Uint8ClampedArray(32) }),
                };
            }
        };
        global.MangaTranslatorGtcFingerprint = {
            calculateWHash: jest.fn(() => { throw hashFailure; }),
        };
        const logger = jest.fn();
        const router = loadAction(logger);

        const result = await dispatch(router.createMessageRouter({}), {
            action: 'CALCULATE_VISUAL_FINGERPRINT',
            url: 'https://cdn.example.test/page.png',
        }, { tab: { id: 8, url: 'https://reader.example.test/chapter' } });

        expect(result).toEqual({
            keepAlive: true,
            response: { ok: false, error: 'wHash indisponivel' },
        });
        expect(close).toHaveBeenCalledTimes(1);
        expect(logger).toHaveBeenCalledWith(
            'warn',
            'bg',
            'VISUAL_FP_FAIL',
            expect.stringContaining('wHash indisponivel'),
            expect.any(Object)
        );
    });
});
~~~

## 12. Cobertura posição por posição

A tabela a seguir cobre todas as **205 posições** do blob. “Prova direta” significa que existe assertion específica no próprio teste; linhas de setup podem estar apenas executadas como pré-condição.

| Posição | Papel | Evidência |
|---:|---|---|
| 1 | Importa o módulo built-in path; é a única dependência Node declarada diretamente pelo teste. | — |
| 2 | Separador visual; sem efeito de runtime. | — |
| 3 | Resolve o caminho absoluto do roteador real extension/background/router.js a partir de __dirname. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 4 | Inicia a resolução multilinha do caminho da action real auditada indiretamente pelo teste. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 5 | Parte estrutural ou executável do bloco corrente: __dirname, | — |
| 6 | Aponta para extension/background/actions/calculate-visual-fingerprint.js, implementação real carregada pela suíte. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 7 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 8 | Separador visual; sem efeito de runtime. | — |
| 9 | Declara dispatch, adaptador Promise para o contrato callback/keepAlive de chrome.runtime.onMessage. | — |
| 10 | Cria Promise que só conclui quando o listener responde ou sinaliza caminho síncrono encerrado. | — |
| 11 | Reserva o valor de retorno síncrono keepAlive do listener. | — |
| 12 | Reserva a resposta entregue a sendResponse. | — |
| 13 | Define callback sendResponse injetado no roteador real. | — |
| 14 | Memoriza a resposta produzida pelo handler/roteador. | — |
| 15 | Se o retorno síncrono já foi capturado, resolve com keepAlive e response. | — |
| 16 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 17 | Separador visual; sem efeito de runtime. | — |
| 18 | Executa o listener real com request, sender e callback controlado pelo teste. | 🟨 EXECUTADO INDIRETAMENTE |
| 19 | Também resolve imediatamente se já houve resposta síncrona ou se o listener devolveu false. | — |
| 20 | Parte estrutural ou executável do bloco corrente: resolve({ keepAlive, response }); | — |
| 21 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 22 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 23 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 24 | Separador visual; sem efeito de runtime. | — |
| 25 | Declara loadAction, bootstrap que carrega roteador e action reais em isolamento Jest. | 🟨 EXECUTADO INDIRETAMENTE |
| 26 | Faz self apontar para global, reproduzindo o scope esperado pelas IIFEs de background. | — |
| 27 | Injeta MangaTranslatorLog com o spy fornecido para o contexto real do router. | — |
| 28 | Remove registro global anterior do router para impedir reaproveitamento entre cargas. | — |
| 29 | Separador visual; sem efeito de runtime. | — |
| 30 | isolateModules força um registry de módulos isolado para esta carga. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 31 | Carrega o router real, criando MangaTranslatorRouter e registry de actions. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 32 | Carrega a action real; a IIFE registra calculate-visual-fingerprint no router. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 33 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 34 | Separador visual; sem efeito de runtime. | — |
| 35 | Retorna o MangaTranslatorRouter real já contendo a action registrada. | 🟨 EXECUTADO INDIRETAMENTE |
| 36 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 37 | Separador visual; sem efeito de runtime. | — |
| 38 | Abre a suíte Jest focal da action calculate-visual-fingerprint. | 🟨 EXECUTADO INDIRETAMENTE |
| 39 | Reserva fetch original para restauração após cada teste. | — |
| 40 | Reserva self original. | — |
| 41 | Reserva createImageBitmap original. | — |
| 42 | Reserva OffscreenCanvas original. | — |
| 43 | Separador visual; sem efeito de runtime. | — |
| 44 | beforeEach prepara isolamento e captura os globals de plataforma. | 🟨 EXECUTADO INDIRETAMENTE |
| 45 | resetModules evita cache de require entre casos. | — |
| 46 | Captura fetch antes dos stubs. | — |
| 47 | Captura self antes do bootstrap. | — |
| 48 | Captura createImageBitmap antes dos stubs. | — |
| 49 | Captura OffscreenCanvas antes dos stubs. | — |
| 50 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 51 | Separador visual; sem efeito de runtime. | — |
| 52 | afterEach restaura os globals mutados pela suíte. | 🟨 EXECUTADO INDIRETAMENTE |
| 53 | Restaura fetch. | — |
| 54 | Restaura self. | — |
| 55 | Restaura createImageBitmap. | — |
| 56 | Restaura OffscreenCanvas. | — |
| 57 | Remove a API de fingerprint injetada pelo teste. | — |
| 58 | Remove o logger global injetado. | — |
| 59 | Remove o router global carregado. | — |
| 60 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 61 | Separador visual; sem efeito de runtime. | — |
| 62 | Caso principal: executa a action real no caminho de sucesso visual-v4 com crop central. | 🟨 EXECUTADO INDIRETAMENTE |
| 63 | Cria spy close do ImageBitmap para provar liberação de recurso. | — |
| 64 | Acumula chamadas drawImage dos canvases simulados. | — |
| 65 | Define API de fingerprint simulada; a orquestração que a chama é a implementação real. | — |
| 66 | dHash mock retorna valor sentinela dhash. | — |
| 67 | wHash mock é configurado para distinguir canvas principal de center-crop. | — |
| 68 | Primeira chamada wHash representa imagem 32×32 completa. | — |
| 69 | Segunda chamada wHash representa crop central 32×32. | — |
| 70 | pHash recebe configuração análoga. | — |
| 71 | Primeira chamada pHash representa frame completo. | — |
| 72 | Segunda chamada pHash representa crop central. | — |
| 73 | Regional hashes retorna sentinela para provar preservação no response. | — |
| 74 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 75 | Separador visual; sem efeito de runtime. | — |
| 76 | Define OffscreenCanvas simulado com dimensões observáveis. | — |
| 77 | Construtor registra width/height solicitados pela action real. | — |
| 78 | Parte estrutural ou executável do bloco corrente: this.width = width; | — |
| 79 | Parte estrutural ou executável do bloco corrente: this.height = height; | — |
| 80 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 81 | Separador visual; sem efeito de runtime. | — |
| 82 | getContext fornece as duas primitivas usadas pela action. | — |
| 83 | Retorna/resolve o valor indicado: return { | — |
| 84 | drawImage registra dimensões do canvas e argumentos para inspeção posterior. | — |
| 85 | getImageData devolve pixels determinísticos para qualquer canvas. | — |
| 86 | Cria Uint8ClampedArray deterministicamente. | — |
| 87 | Tamanho depende exatamente da área do canvas × 4 canais. | — |
| 88 | Padrão index % 256 torna o pixelSample estável quanto a comprimento/formato. | — |
| 89 | Parte estrutural ou executável do bloco corrente: ), | — |
| 90 | Parte estrutural ou executável do bloco corrente: }), | — |
| 91 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 92 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 93 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 94 | Separador visual; sem efeito de runtime. | — |
| 95 | Stub de fetch retorna resposta HTTP ok e blob assíncrono. | 🟨 EXECUTADO INDIRETAMENTE |
| 96 | createImageBitmap retorna bitmap 800×1200 com close observável. | 🟨 EXECUTADO INDIRETAMENTE |
| 97 | Instala OffscreenCanvas simulado. | 🟨 EXECUTADO INDIRETAMENTE |
| 98 | Injeta fpApi usada diretamente pela action real através de scope.MangaTranslatorGtcFingerprint. | 🟨 EXECUTADO INDIRETAMENTE |
| 99 | Cria logger spy. | 🟨 EXECUTADO INDIRETAMENTE |
| 100 | Carrega router + action reais via loadAction. | 🟨 EXECUTADO INDIRETAMENTE |
| 101 | Separador visual; sem efeito de runtime. | — |
| 102 | Despacha mensagem pelo createMessageRouter real. | 🟨 EXECUTADO INDIRETAMENTE |
| 103 | Usa o nome legado CALCULATE_VISUAL_FINGERPRINT, exercitando ACTION_MAP do router. | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 104 | Fornece URL HTTPS válida. | — |
| 105 | Fornece sender de content tab; a action declara allowedSources:any. | — |
| 106 | Separador visual; sem efeito de runtime. | — |
| 107 | Assertion composta do envelope completo retornado pelo router. | ✅ PROVADO DIRETAMENTE |
| 108 | Prova keepAlive true para a action assíncrona. | ✅ PROVADO DIRETAMENTE |
| 109 | Abre o objeto response esperado. | — |
| 110 | Prova que o router acrescenta ok:true ao resultado bem-sucedido da action. | ✅ PROVADO DIRETAMENTE |
| 111 | Prova pixelSample hexadecimal com 512 chars (8×8×4 bytes × 2 hex chars). | ✅ PROVADO DIRETAMENTE |
| 112 | Prova propagação do dHash produzido pela API injetada. | ✅ PROVADO DIRETAMENTE |
| 113 | Prova wHash do frame principal. | ✅ PROVADO DIRETAMENTE |
| 114 | Prova pHash do frame principal. | ✅ PROVADO DIRETAMENTE |
| 115 | Prova wHash do crop central. | ✅ PROVADO DIRETAMENTE |
| 116 | Prova pHash do crop central. | ✅ PROVADO DIRETAMENTE |
| 117 | Prova regionalHashes retornado pela action. | ✅ PROVADO DIRETAMENTE |
| 118 | Parte estrutural ou executável do bloco corrente: }, | — |
| 119 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 120 | Assertion direta dos argumentos de fetch usados pela implementação real. | ✅ PROVADO DIRETAMENTE |
| 121 | Prova credentials:'omit'. | ✅ PROVADO DIRETAMENTE |
| 122 | Prova cache:'no-store'. | ✅ PROVADO DIRETAMENTE |
| 123 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 124 | Inspeciona chamadas drawImage registradas para encontrar a operação de crop. | ✅ PROVADO DIRETAMENTE |
| 125 | Exige uma chamada compatível com as propriedades especificadas. | — |
| 126 | Exige canvas de saída 32 pixels de largura. | ✅ PROVADO DIRETAMENTE |
| 127 | Exige canvas de saída 32 pixels de altura. | ✅ PROVADO DIRETAMENTE |
| 128 | Exige os parâmetros de crop central do bitmap 800×1200: y=200, lado 800, destino 32×32. | ✅ PROVADO DIRETAMENTE |
| 129 | Parte estrutural ou executável do bloco corrente: }), | — |
| 130 | Parte estrutural ou executável do bloco corrente: ])); | — |
| 131 | Prova close chamado exatamente uma vez no caminho de sucesso. | ✅ PROVADO DIRETAMENTE |
| 132 | Prova log informativo VISUAL_FP_OK emitido pela action real via contexto do router. | ✅ PROVADO DIRETAMENTE |
| 133 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 134 | Separador visual; sem efeito de runtime. | — |
| 135 | Caso negativo para data URL: valida rejeição antes de qualquer fetch. | 🟨 EXECUTADO INDIRETAMENTE |
| 136 | fetch spy começa sem implementação; qualquer chamada quebraria a propriedade esperada. | 🟨 EXECUTADO INDIRETAMENTE |
| 137 | Carrega action real com logger descartável. | 🟨 EXECUTADO INDIRETAMENTE |
| 138 | Separador visual; sem efeito de runtime. | — |
| 139 | Despacha CALCULATE_VISUAL_FINGERPRINT real. | 🟨 EXECUTADO INDIRETAMENTE |
| 140 | Parte estrutural ou executável do bloco corrente: action: 'CALCULATE_VISUAL_FINGERPRINT', | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 141 | Usa data URL, parseável mas com protocolo não permitido. | — |
| 142 | Parte estrutural ou executável do bloco corrente: }, { tab: { id: 8, url: 'https://reader.example.test/chapter' } }); | — |
| 143 | Separador visual; sem efeito de runtime. | — |
| 144 | Assertion do envelope retornado. | ✅ PROVADO DIRETAMENTE |
| 145 | Prova keepAlive true apesar de o execute resolver cedo. | ✅ PROVADO DIRETAMENTE |
| 146 | Prova resposta ok:false e mensagem exata de URL inválida. | ✅ PROVADO DIRETAMENTE |
| 147 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 148 | Prova que o guard de protocolo ocorre antes de fetch. | ✅ PROVADO DIRETAMENTE |
| 149 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 150 | Separador visual; sem efeito de runtime. | — |
| 151 | Caso negativo equivalente para protocolo chrome-extension. | 🟨 EXECUTADO INDIRETAMENTE |
| 152 | Instala fetch spy. | 🟨 EXECUTADO INDIRETAMENTE |
| 153 | Carrega action real. | 🟨 EXECUTADO INDIRETAMENTE |
| 154 | Separador visual; sem efeito de runtime. | — |
| 155 | Despacha pelo router real. | 🟨 EXECUTADO INDIRETAMENTE |
| 156 | Parte estrutural ou executável do bloco corrente: action: 'CALCULATE_VISUAL_FINGERPRINT', | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 157 | Fornece URL chrome-extension válida sintaticamente, porém não HTTP(S). | — |
| 158 | Parte estrutural ou executável do bloco corrente: }, { tab: { id: 8, url: 'https://reader.example.test/chapter' } }); | — |
| 159 | Separador visual; sem efeito de runtime. | — |
| 160 | Assertion do envelope. | ✅ PROVADO DIRETAMENTE |
| 161 | Parte estrutural ou executável do bloco corrente: keepAlive: true, | ✅ PROVADO DIRETAMENTE |
| 162 | Prova mesma resposta de URL inválida. | ✅ PROVADO DIRETAMENTE |
| 163 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 164 | Prova ausência de fetch. | ✅ PROVADO DIRETAMENTE |
| 165 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 166 | Separador visual; sem efeito de runtime. | — |
| 167 | Caso de falha após criação do bitmap: prova finally/cleanup da implementação real. | 🟨 EXECUTADO INDIRETAMENTE |
| 168 | Spy usado para contar close do bitmap após exceção. | — |
| 169 | Erro sentinela disparado pelo cálculo de wHash. | — |
| 170 | fetch bem-sucedido permite alcançar a etapa de bitmap. | 🟨 EXECUTADO INDIRETAMENTE |
| 171 | createImageBitmap retorna bitmap retangular com close observável. | 🟨 EXECUTADO INDIRETAMENTE |
| 172 | OffscreenCanvas mínimo para chegar ao cálculo de hash. | 🟨 EXECUTADO INDIRETAMENTE |
| 173 | Parte estrutural ou executável do bloco corrente: getContext() { | — |
| 174 | Retorna/resolve o valor indicado: return { | — |
| 175 | drawImage é mockado, sem necessidade de pixels reais. | — |
| 176 | getImageData devolve buffer suficiente para o caminho até o mock de wHash. | — |
| 177 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 178 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 179 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 180 | Injeta fpApi parcial contendo somente calculateWHash. | 🟨 EXECUTADO INDIRETAMENTE |
| 181 | calculateWHash lança o erro sentinela, entrando no catch da action após bitmap existir. | 🟨 EXECUTADO INDIRETAMENTE |
| 182 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 183 | Cria logger spy. | 🟨 EXECUTADO INDIRETAMENTE |
| 184 | Carrega router/action reais. | 🟨 EXECUTADO INDIRETAMENTE |
| 185 | Separador visual; sem efeito de runtime. | — |
| 186 | Despacha a mensagem real. | 🟨 EXECUTADO INDIRETAMENTE |
| 187 | Parte estrutural ou executável do bloco corrente: action: 'CALCULATE_VISUAL_FINGERPRINT', | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 188 | URL HTTPS válida garante que o erro vem do hash, não do guard inicial. | — |
| 189 | Parte estrutural ou executável do bloco corrente: }, { tab: { id: 8, url: 'https://reader.example.test/chapter' } }); | — |
| 190 | Separador visual; sem efeito de runtime. | — |
| 191 | Assertion do envelope de falha. | ✅ PROVADO DIRETAMENTE |
| 192 | Prova keepAlive true. | ✅ PROVADO DIRETAMENTE |
| 193 | Prova propagação de e.message como string de erro na resposta. | ✅ PROVADO DIRETAMENTE |
| 194 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 195 | Prova close exatamente uma vez no caminho excepcional, via finally. | ✅ PROVADO DIRETAMENTE |
| 196 | Inicia assertion do log de warning. | ✅ PROVADO DIRETAMENTE |
| 197 | Exige nível warn. | ✅ PROVADO DIRETAMENTE |
| 198 | Exige componente bg. | ✅ PROVADO DIRETAMENTE |
| 199 | Exige código VISUAL_FP_FAIL. | ✅ PROVADO DIRETAMENTE |
| 200 | Exige que a mensagem contenha o erro original. | ✅ PROVADO DIRETAMENTE |
| 201 | Aceita metadata adicional, preservando foco no contrato observado. | ✅ PROVADO DIRETAMENTE |
| 202 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 203 | Fecha a estrutura/expressão imediatamente anterior. | — |
| 204 | Fecha a suíte. | — |
| 205 | Newline final do blob; posição documental explicitamente contabilizada. | 🟦 GATE ESTÁTICO ESPECÍFICO |

## 13. Unidades semânticas

### U01 — posições 1–7 — resolução dos módulos reais

Define caminhos absolutos para router e action. Essa unidade impede que o caso seja confundido com uma cópia local da implementação.

### U02 — posições 9–23 — adaptador de dispatch

Modela apenas o protocolo de callback/keepAlive necessário para observar o router. Não implementa lógica de fingerprint.

### U03 — posições 25–36 — bootstrap isolado

Configura scope/log, carrega o router real e registra a action real em um registry novo por caso.

### U04 — posições 38–60 — isolamento de globals

Captura e restaura as APIs de plataforma alteradas pela suíte, minimizando vazamento entre testes.

### U05 — posições 62–133 — caminho visual-v4 positivo

Exercita fetch, bitmap retangular, amostras 8×8/9×8/32×32/48×48, crop central, retorno completo, cleanup e log de sucesso.

### U06 — posições 135–149 — rejeição de data URL

Prova que protocolo não HTTP(S) é recusado antes da rede.

### U07 — posições 151–165 — rejeição de chrome-extension URL

Reforça que uma URL sintaticamente válida não basta: o protocolo deve pertencer à allowlist explícita.

### U08 — posições 167–203 — falha durante fingerprint

Força erro depois da criação do bitmap, prova resposta de falha, observabilidade e fechamento no `finally`.

### U09 — posição 205 — newline final

O blob termina em newline e a posição é registrada para garantir cobertura integral e correspondência ao SHA.

## 14. Invariantes comprovados

1. A suíte chama a action real através do router real.
2. A mensagem legacy `CALCULATE_VISUAL_FINGERPRINT` é resolvida para a action registrada.
3. A action assíncrona mantém o canal aberto.
4. URLs de protocolo proibido não alcançam fetch.
5. O fetch bem-sucedido usa política `credentials:'omit'` e `cache:'no-store'`.
6. O formato de pixelSample observado é 512 chars hex.
7. O resultado visual-v4 preserva hashes principais, center-crop e regional.
8. Um bitmap 800×1200 usa crop central 800×800 iniciando em y=200.
9. Bitmap é fechado uma única vez no sucesso observado.
10. Bitmap é fechado uma única vez quando cálculo de hash lança.
11. Erro interno capturado é devolvido como string em `response.error`.
12. Sucesso e falha emitem códigos de log distintos.

## 15. O que esta suíte não prova

Ela não prova isoladamente:

- correção matemática de dHash/wHash/pHash/regional;
- capacidade real do navegador de `OffscreenCanvas` ou `createImageBitmap`;
- comportamento da rede externa;
- políticas CORS além dos argumentos passados ao fetch;
- formato real do Blob recebido;
- os branches listados em 133-001;
- consumidores de `CALCULATE_VISUAL_FINGERPRINT` no content script;
- matching posterior do cache perceptual.

Essas fronteiras devem ser lidas junto das suítes próprias de fingerprint, IPC/content e dos testes de integração/visual.

## 16. Autoauditoria do AGENTE 24

- [x] reserva exclusiva #133 criada com semântica CREATE ONLY;
- [x] reserva relida e proprietário confirmado como AGENTE 24;
- [x] `.state/133.json` criado como IN_PROGRESS para o mesmo arquivo/agente;
- [x] SHA do fonte reconfirmado: `f51a0b629ac17be3eda349333192b9480494a07e`;
- [x] blob comparado com a execução histórica do CI e confirmado idêntico;
- [x] fonte integral incorporada sem alterações;
- [x] 204 linhas textuais + newline = 205 posições documentadas;
- [x] router e action reais lidos integralmente para validar causalidade das assertions;
- [x] execução nominal do mesmo blob localizada em Node 20, Node 22, coverage e Windows;
- [x] algoritmo mockado separado da orquestração real;
- [x] lacunas externas registradas como solicitação persistente ao auditor;
- [x] nenhum código-fonte, teste, fixture, workflow ou configuração foi alterado para fabricar prova;
- [x] STATUS.md, CHECKLIST.md e AUDITORIA.md permaneceram fora do escopo de escrita.

**Resultado:** documentação concluída para o blob `f51a0b629ac17be3eda349333192b9480494a07e`; a solicitação 133-001 permanece OPEN e não impede a conclusão documental.

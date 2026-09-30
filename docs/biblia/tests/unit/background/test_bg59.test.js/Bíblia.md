# Bíblia técnica — tests/unit/background/test_bg59.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA TÉCNICA APROVADA  
> **SHA auditado:** ae96b142717418e4071fd160b6c521412da03090  
> **Agente responsável:** AGENTE 2  
> **Tipo:** Jest unit/integration-like de background real / fingerprint visual  
> **Linhas textuais:** **162**  
> **Posições documentais:** **163**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é um teste Jest do projeto `background` que valida o contrato BG-59 através do **composition root real** `extension/background.js`. Ele não chama diretamente uma cópia do handler: `loadBackgroundModule(BACKGROUND_PATH)` lê e executa o background real, que requer `background/router.js` e `background/actions/calculate-visual-fingerprint.js`; depois `dispatchToBackground` envia a mensagem pelo listener runtime registrado.

O cenário controla somente as fronteiras que não existem no Node: Chrome APIs, `fetch`, `createImageBitmap`, `OffscreenCanvas` e a API de hash. Assim, ele prova principalmente **wiring + contrato de resposta + geometria do center-crop**, não a matemática interna de dHash/wHash/pHash.

## 2. Caminho real exercitado

`dispatchToBackground(runtimeMock, request)`
→ listener global de `background.js`
→ `routeRegisteredAction`
→ router resolve `CALCULATE_VISUAL_FINGERPRINT`
→ action `calculate-visual-fingerprint`
→ valida URL HTTP(S)
→ `fetch(url, {credentials:'omit', cache:'no-store'})`
→ Blob
→ ImageBitmap 800×1200
→ canvases 8×8 / 9×8 / 32×32 / crop 32×32 / 48×48
→ API `MangaTranslatorGtcFingerprint`
→ response com pixelSample e hashes
→ `bitmap.close()`
→ callback runtime assíncrono.

O alias é registrado em `extension/background/router.js` como `CALCULATE_VISUAL_FINGERPRINT → calculate-visual-fingerprint`.

## 3. Harness e dependências

### Chrome mocks

O teste usa factories de `tests/mocks/chrome-api.mock.js` para runtime, storage, tabs, downloads e alarms. Antes da carga, as coleções de listeners são zeradas e o storage é limpo.

### Loader do background

`tests/helpers/load-background-module.js`:

1. lê `background.js` do disco;
2. anexa getters/setters/exports de teste;
3. executa o fonte instrumentado via `new Function`;
4. fornece `chrome`, `fetch`, `FileReader` e `require`.

A instrumentação não substitui a action BG-59; no caminho Node, o próprio background executa `require('./background/actions/calculate-visual-fingerprint.js')`.

### Dispatcher

`dispatchToBackground` exige exatamente um listener do background, chama-o com `sendResponse` e retorna `{keepAlive,response}`. Isso torna a assertion `keepAlive === true` relevante para o contrato assíncrono do Chrome runtime.

## 4. Doubles visuais

O teste instala:

- `fetch` bem-sucedido retornando Blob PNG simbólico;
- `createImageBitmap` retornando bitmap 800×1200;
- `MockOffscreenCanvas` que registra `drawImage` e fabrica bytes RGBA;
- `MangaTranslatorGtcFingerprint` com funções Jest de retorno controlado.

A estratégia separa duas responsabilidades:

- este arquivo prova que o action **chama e transporta** hashes corretamente;
- os testes de `extension/shared/gtc-fingerprint.js` devem provar o **algoritmo** real dos hashes.

## 5. Provas diretas do cenário

| Propriedade | Assertion | Classificação |
|---|---|---|
| canal runtime permanece aberto | `result.keepAlive === true` | ✅ PROVADO DIRETAMENTE |
| resposta é sucesso | `response.ok === true` | ✅ PROVADO DIRETAMENTE |
| pixelSample é hexadecimal | regex | ✅ PROVADO DIRETAMENTE |
| pixelSample tem 512 chars | `toHaveLength(512)` | ✅ PROVADO DIRETAMENTE |
| dHash é propagado | valor exato fake | ✅ PROVADO DIRETAMENTE |
| wHash/pHash full frame | valores exatos fake | ✅ PROVADO DIRETAMENTE |
| wHash/pHash center crop | valores distintos fake | ✅ PROVADO DIRETAMENTE |
| regionalHashes são propagados | mapa de quadrantes | ✅ PROVADO DIRETAMENTE |
| fetch usa URL recebida | `toHaveBeenCalledWith` | ✅ PROVADO DIRETAMENTE |
| fetch omite credenciais | `credentials:'omit'` | ✅ PROVADO DIRETAMENTE |
| fetch evita cache | `cache:'no-store'` | ✅ PROVADO DIRETAMENTE |
| dHash chamado 1× | cardinalidade | ✅ PROVADO DIRETAMENTE |
| wHash chamado 2× | cardinalidade | ✅ PROVADO DIRETAMENTE |
| pHash chamado 2× | cardinalidade | ✅ PROVADO DIRETAMENTE |
| regional chamado 1× | cardinalidade | ✅ PROVADO DIRETAMENTE |
| crop retrato 800×1200 → 800×800 em y=200 → 32×32 | argumentos drawImage | ✅ PROVADO DIRETAMENTE |
| bitmap é fechado no sucesso | `closeBitmap` chamado | ✅ PROVADO DIRETAMENTE |

## 6. O que este arquivo não prova sozinho

### Algoritmo real dos hashes

As funções `calculateDHash/WHash/PHash/RegionalHashes` são mocks. Portanto, este teste não pode ser usado como prova matemática da implementação em `gtc-fingerprint.js`.

### Ramos de erro

Este arquivo tem um único cenário feliz. Entretanto, o projeto possui `tests/unit/background/calculate-visual-fingerprint-action.test.js`, que executa o action real e cobre:

- data URL rejeitada sem fetch;
- protocolo não HTTP(S) rejeitado;
- cleanup de ImageBitmap quando cálculo de hash lança;
- log `VISUAL_FP_OK` no sucesso;
- log `VISUAL_FP_FAIL` na falha.

`message-handlers-real.test.js` também possui casos BG-59 pelo background real, incluindo URL inválida.

Por isso a ausência desses casos **neste arquivo** não é classificada como lacuna do projeto.

## 7. Segurança e privacidade

A assertion de fetch protege duas escolhas importantes:

- `credentials:'omit'`: cookies/credenciais não são enviados à CDN da imagem;
- `cache:'no-store'`: o fingerprint não reutiliza resposta stale do cache.

A action aceita somente protocolos HTTP/HTTPS, mas essa validação negativa é provada pela suíte focal do action, não por #172.

O teste usa URL fictícia `cdn.reader.test`; nenhuma rede real é acessada porque fetch é mockado.

## 8. Center-crop visual-v4

Para bitmap retrato 800×1200:

- `side = min(800,1200) = 800`;
- `cropX = 0`;
- `cropY = floor((1200-800)/2) = 200`;
- crop = `(0,200,800,800)`;
- destino = `32×32`.

O matcher procura a chamada contendo exatamente `[0,200,800,800,0,0,32,32]`. Isso prova que hashes crop usam a região quadrada central e não simplesmente o frame inteiro redimensionado.

## 9. Nomenclatura de versão

Há uma inconsistência observável entre artefatos:

- o título do teste diz **visual-v4**;
- o comentário do action diz **visual-v3/v4**;
- os logs `VISUAL_FP_OK` / `VISUAL_FP_FAIL` dizem **visual-v3**.

O payload já contém campos de crop associados ao contrato mais novo. A inconsistência é documental/operacional, não falha funcional demonstrada por este teste, mas merece decisão canônica.

## 10. Solicitação ao auditor

### 172-001 — CONTRACT_NAMING_REVIEW — OPEN

**Arquivos relacionados:** `tests/unit/background/test_bg59.test.js`, `extension/background/actions/calculate-visual-fingerprint.js`

**Achado:** o teste nomeia a resposta como visual-v4, o comentário do action como visual-v3/v4 e as mensagens de log como visual-v3.

**Evidência atual:** strings literais no fonte auditado e no action real.

**Evidência ausente:** definição única/documentada de qual versão identifica o contrato que inclui `wHashCrop` e `pHashCrop`.

**Por que importa:** logs de produção e testes podem usar nomes diferentes para o mesmo contrato, dificultando triagem e futuras migrações.

**Ação solicitada:** definir nomenclatura canônica e alinhar comentários/logs/test titles em alteração separada, sem mudar o payload por acidente.

**Regressão possível:** diagnóstico ambíguo ou migração baseada na versão nominal errada.

**Severidade:** LOW.

## 11. Invariantes

1. A action pública `CALCULATE_VISUAL_FINGERPRINT` deve continuar roteável pelo background real.
2. Mensagens async devem manter `keepAlive=true`.
3. URL HTTP(S) válida deve ser buscada exatamente uma vez pelo action.
4. Fetch deve continuar com `credentials:'omit'`.
5. Fetch deve continuar com `cache:'no-store'`.
6. pixelSample de 8×8 RGBA deve continuar sendo hex de 512 caracteres.
7. dHash deve usar o caminho dedicado de hash.
8. wHash e pHash devem produzir full-frame e crop quando a imagem não é quadrada.
9. Para 800×1200, center-crop deve continuar 0,200,800,800.
10. Hashes regionais devem ser preservados no response.
11. ImageBitmap deve ser fechado no caminho feliz e em falha após criação.
12. O teste de wiring não deve ser confundido com prova do algoritmo de hash.
13. Globals/mocks devem ser restaurados no afterEach.
14. O SHA desta Bíblia só é válido enquanto o fonte for `ae96b142717418e4071fd160b6c521412da03090`.

## 12. Fonte integral

~~~javascript
const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getDownloadsMock,
    getAlarmsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const {
    BACKGROUND_PATH,
    dispatchToBackground,
    flush,
} = require('../../helpers/background-test-utils.js');

describe('BG-59: CALCULATE_VISUAL_FINGERPRINT real no background', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let downloadsMock;
    let alarmsMock;
    let originalFetch;
    let originalSelf;
    let originalCreateImageBitmap;
    let originalOffscreenCanvas;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        downloadsMock = getDownloadsMock();
        alarmsMock = getAlarmsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock._installedListeners = [];
        runtimeMock._startupListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();

        global.chrome = {
            storage: { local: storageMock },
            tabs: tabsMock,
            alarms: alarmsMock,
            runtime: runtimeMock,
            downloads: downloadsMock,
            scripting: global.chrome?.scripting,
        };

        originalFetch = global.fetch;
        originalSelf = global.self;
        originalCreateImageBitmap = global.createImageBitmap;
        originalOffscreenCanvas = global.OffscreenCanvas;
    });

    afterEach(async () => {
        global.fetch = originalFetch;
        global.self = originalSelf;
        global.createImageBitmap = originalCreateImageBitmap;
        global.OffscreenCanvas = originalOffscreenCanvas;
        alarmsMock.clearAll();
        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        await storageMock.clear();
        jest.restoreAllMocks();
    });

    test('fica no projeto background, usa o handler real e retorna hashes visual-v4 de center-crop', async () => {
        const closeBitmap = jest.fn();
        const drawCalls = [];
        const makePixels = (length) => Uint8ClampedArray.from({ length }, (_value, index) => index % 256);
        const fpApi = {
            calculateDHash: jest.fn(() => 'dhash-16-hex'),
            calculateWHash: jest.fn()
                .mockReturnValueOnce('w-main'.padEnd(64, '0'))
                .mockReturnValueOnce('w-crop'.padEnd(64, '1')),
            calculatePHash: jest.fn()
                .mockReturnValueOnce('p-main'.padEnd(64, '2'))
                .mockReturnValueOnce('p-crop'.padEnd(64, '3')),
            calculateRegionalHashes: jest.fn(() => ({
                topLeft: 'tl',
                topRight: 'tr',
                bottomLeft: 'bl',
                bottomRight: 'br',
            })),
        };

        class MockOffscreenCanvas {
            constructor(width, height) {
                this.width = width;
                this.height = height;
            }

            getContext() {
                return {
                    drawImage: jest.fn((...args) => {
                        drawCalls.push({
                            canvas: `${this.width}x${this.height}`,
                            args,
                        });
                    }),
                    getImageData: jest.fn(() => ({
                        data: makePixels(this.width * this.height * 4),
                    })),
                };
            }
        }

        global.self = { MangaTranslatorGtcFingerprint: fpApi };
        global.fetch = jest.fn(async () => ({
            ok: true,
            blob: async () => new Blob(['image-bytes'], { type: 'image/png' }),
        }));
        global.createImageBitmap = jest.fn(async () => ({
            width: 800,
            height: 1200,
            close: closeBitmap,
        }));
        global.OffscreenCanvas = MockOffscreenCanvas;

        loadBackgroundModule(BACKGROUND_PATH);
        await flush(8);

        const result = await dispatchToBackground(runtimeMock, {
            action: 'CALCULATE_VISUAL_FINGERPRINT',
            url: 'https://cdn.reader.test/page-001.png',
        });

        expect(result.keepAlive).toBe(true);
        expect(result.response).toEqual(expect.objectContaining({
            ok: true,
            pixelSample: expect.stringMatching(/^[0-9a-f]+$/),
            dHash: 'dhash-16-hex',
            wHash: 'w-main'.padEnd(64, '0'),
            pHash: 'p-main'.padEnd(64, '2'),
            wHashCrop: 'w-crop'.padEnd(64, '1'),
            pHashCrop: 'p-crop'.padEnd(64, '3'),
            regionalHashes: {
                topLeft: 'tl',
                topRight: 'tr',
                bottomLeft: 'bl',
                bottomRight: 'br',
            },
        }));
        expect(result.response.pixelSample).toHaveLength(512);
        expect(global.fetch).toHaveBeenCalledWith('https://cdn.reader.test/page-001.png', {
            credentials: 'omit',
            cache: 'no-store',
        });
        expect(fpApi.calculateDHash).toHaveBeenCalledTimes(1);
        expect(fpApi.calculateWHash).toHaveBeenCalledTimes(2);
        expect(fpApi.calculatePHash).toHaveBeenCalledTimes(2);
        expect(fpApi.calculateRegionalHashes).toHaveBeenCalledTimes(1);
        expect(drawCalls).toEqual(expect.arrayContaining([
            expect.objectContaining({
                canvas: '32x32',
                args: expect.arrayContaining([0, 200, 800, 800, 0, 0, 32, 32]),
            }),
        ]));
        expect(closeBitmap).toHaveBeenCalled();
    });
});
~~~

O blob auditado possui newline final. A posição documental **163** representa esse terminador após a linha textual 162.

## 13. Cobertura documental linha a linha

### Linha 1

**Fonte:** `const {`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Executa `const {`.

**Como faz:** Participa do bloco `Imports dos mocks/helpers usados para carregar e despachar ao background real.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 2

**Fonte:** `    getRuntimeMock,`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa factories de mocks Chrome compartilhados.

**Como faz:** Desestrutura helpers de `chrome-api.mock.js`.

**Por que existe assim:** Reusa infraestrutura padronizada dos testes de background.

**Risco/regressão:** Mudança de contrato dos mocks afeta este harness.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 3

**Fonte:** `    getStorageMock,`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa factories de mocks Chrome compartilhados.

**Como faz:** Desestrutura helpers de `chrome-api.mock.js`.

**Por que existe assim:** Reusa infraestrutura padronizada dos testes de background.

**Risco/regressão:** Mudança de contrato dos mocks afeta este harness.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 4

**Fonte:** `    getTabsMock,`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa factories de mocks Chrome compartilhados.

**Como faz:** Desestrutura helpers de `chrome-api.mock.js`.

**Por que existe assim:** Reusa infraestrutura padronizada dos testes de background.

**Risco/regressão:** Mudança de contrato dos mocks afeta este harness.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 5

**Fonte:** `    getDownloadsMock,`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa factories de mocks Chrome compartilhados.

**Como faz:** Desestrutura helpers de `chrome-api.mock.js`.

**Por que existe assim:** Reusa infraestrutura padronizada dos testes de background.

**Risco/regressão:** Mudança de contrato dos mocks afeta este harness.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 6

**Fonte:** `    getAlarmsMock,`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa factories de mocks Chrome compartilhados.

**Como faz:** Desestrutura helpers de `chrome-api.mock.js`.

**Por que existe assim:** Reusa infraestrutura padronizada dos testes de background.

**Risco/regressão:** Mudança de contrato dos mocks afeta este harness.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 7

**Fonte:** `} = require('../../mocks/chrome-api.mock.js');`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Executa `} = require('../../mocks/chrome-api.mock.js');`.

**Como faz:** Participa do bloco `Imports dos mocks/helpers usados para carregar e despachar ao background real.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 8

**Fonte:** `const { loadBackgroundModule } = require('../../helpers/load-background-module.js');`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa loader que executa `extension/background.js` real em módulo instrumentado.

**Como faz:** O helper lê o fonte, acrescenta apenas getters/setters/exports de teste e executa via `new Function`.

**Por que existe assim:** Permite testar o composition root sem copiar seu handler.

**Risco/regressão:** Instrumentação é harness; assertions ainda passam pelo listener real do background.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 9

**Fonte:** `const {`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Executa `const {`.

**Como faz:** Participa do bloco `Imports dos mocks/helpers usados para carregar e despachar ao background real.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 10

**Fonte:** `    BACKGROUND_PATH,`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa caminho do background, dispatcher do listener e helper de flush.

**Como faz:** Desestrutura `background-test-utils.js`.

**Por que existe assim:** Padroniza carga e IPC assíncrono no teste.

**Risco/regressão:** Se o helper divergir do runtime, a integração pode perder representatividade.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 11

**Fonte:** `    dispatchToBackground,`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa caminho do background, dispatcher do listener e helper de flush.

**Como faz:** Desestrutura `background-test-utils.js`.

**Por que existe assim:** Padroniza carga e IPC assíncrono no teste.

**Risco/regressão:** Se o helper divergir do runtime, a integração pode perder representatividade.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 12

**Fonte:** `    flush,`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Importa caminho do background, dispatcher do listener e helper de flush.

**Como faz:** Desestrutura `background-test-utils.js`.

**Por que existe assim:** Padroniza carga e IPC assíncrono no teste.

**Risco/regressão:** Se o helper divergir do runtime, a integração pode perder representatividade.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 13

**Fonte:** `} = require('../../helpers/background-test-utils.js');`

**Contexto:** Imports dos mocks/helpers usados para carregar e despachar ao background real.

**O que faz:** Executa `} = require('../../helpers/background-test-utils.js');`.

**Como faz:** Participa do bloco `Imports dos mocks/helpers usados para carregar e despachar ao background real.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 14

**Fonte:** `(linha vazia)`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 15

**Fonte:** `describe('BG-59: CALCULATE_VISUAL_FINGERPRINT real no background', () => {`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara a suíte BG-59 para fingerprint visual no background.

**Como faz:** Agrupa setup/cleanup e o cenário principal no Jest.

**Por que existe assim:** Nomeia explicitamente o contrato sob prova.

**Risco/regressão:** Título usa `real` e deve continuar coerente com o loader efetivamente usado.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 16

**Fonte:** `    let runtimeMock;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 17

**Fonte:** `    let storageMock;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 18

**Fonte:** `    let tabsMock;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 19

**Fonte:** `    let downloadsMock;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 20

**Fonte:** `    let alarmsMock;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 21

**Fonte:** `    let originalFetch;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 22

**Fonte:** `    let originalSelf;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 23

**Fonte:** `    let originalCreateImageBitmap;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 24

**Fonte:** `    let originalOffscreenCanvas;`

**Contexto:** Describe BG-59 e referências globais preservadas pelo harness.

**O que faz:** Declara referência mutável do harness.

**Como faz:** Será preenchida no beforeEach e restaurada/limpa no afterEach.

**Por que existe assim:** Evita compartilhar estado acidental entre execuções.

**Risco/regressão:** Referência mal restaurada pode contaminar outros testes no mesmo worker.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 25

**Fonte:** `(linha vazia)`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 26

**Fonte:** `    beforeEach(async () => {`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Registra preparação assíncrona antes de cada teste.

**Como faz:** Reseta módulos, cria mocks e salva globals originais.

**Por que existe assim:** Isola o cenário de caches e mutações globais.

**Risco/regressão:** Setup incompleto pode produzir falsos positivos/negativos.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 27

**Fonte:** `        jest.resetModules();`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Limpa o registry de módulos do Jest.

**Como faz:** Força nova carga do background/actions.

**Por que existe assim:** Evita estado singleton de execução anterior.

**Risco/regressão:** Necessário porque background registra listeners/actions em globals.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 28

**Fonte:** `        runtimeMock = getRuntimeMock();`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Instancia mock específico da API Chrome.

**Como faz:** Obtém objeto novo/limpável da infraestrutura compartilhada.

**Por que existe assim:** Reproduz storage/tabs/runtime/downloads/alarms necessários ao background.

**Risco/regressão:** Fidelidade depende do mock compartilhado.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 29

**Fonte:** `        storageMock = getStorageMock();`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Instancia mock específico da API Chrome.

**Como faz:** Obtém objeto novo/limpável da infraestrutura compartilhada.

**Por que existe assim:** Reproduz storage/tabs/runtime/downloads/alarms necessários ao background.

**Risco/regressão:** Fidelidade depende do mock compartilhado.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 30

**Fonte:** `        tabsMock = getTabsMock();`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Instancia mock específico da API Chrome.

**Como faz:** Obtém objeto novo/limpável da infraestrutura compartilhada.

**Por que existe assim:** Reproduz storage/tabs/runtime/downloads/alarms necessários ao background.

**Risco/regressão:** Fidelidade depende do mock compartilhado.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 31

**Fonte:** `        downloadsMock = getDownloadsMock();`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Instancia mock específico da API Chrome.

**Como faz:** Obtém objeto novo/limpável da infraestrutura compartilhada.

**Por que existe assim:** Reproduz storage/tabs/runtime/downloads/alarms necessários ao background.

**Risco/regressão:** Fidelidade depende do mock compartilhado.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 32

**Fonte:** `        alarmsMock = getAlarmsMock();`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Instancia mock específico da API Chrome.

**Como faz:** Obtém objeto novo/limpável da infraestrutura compartilhada.

**Por que existe assim:** Reproduz storage/tabs/runtime/downloads/alarms necessários ao background.

**Risco/regressão:** Fidelidade depende do mock compartilhado.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 33

**Fonte:** `(linha vazia)`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 34

**Fonte:** `        runtimeMock._messageListeners = [];`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Zera coleção interna de listeners do runtime mock.

**Como faz:** Substitui array pela coleção vazia.

**Por que existe assim:** Garante exatamente os listeners registrados nesta carga do background.

**Risco/regressão:** É acoplamento deliberado à API de teste do mock.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 35

**Fonte:** `        runtimeMock._connectListeners = [];`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Zera coleção interna de listeners do runtime mock.

**Como faz:** Substitui array pela coleção vazia.

**Por que existe assim:** Garante exatamente os listeners registrados nesta carga do background.

**Risco/regressão:** É acoplamento deliberado à API de teste do mock.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 36

**Fonte:** `        runtimeMock._installedListeners = [];`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Zera coleção interna de listeners do runtime mock.

**Como faz:** Substitui array pela coleção vazia.

**Por que existe assim:** Garante exatamente os listeners registrados nesta carga do background.

**Risco/regressão:** É acoplamento deliberado à API de teste do mock.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 37

**Fonte:** `        runtimeMock._startupListeners = [];`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Zera coleção interna de listeners do runtime mock.

**Como faz:** Substitui array pela coleção vazia.

**Por que existe assim:** Garante exatamente os listeners registrados nesta carga do background.

**Risco/regressão:** É acoplamento deliberado à API de teste do mock.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 38

**Fonte:** `        runtimeMock.lastError = null;`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Limpa `runtime.lastError` do mock.

**Como faz:** Define null antes da carga.

**Por que existe assim:** Evita erro stale afetar callbacks Chrome.

**Risco/regressão:** Necessário para determinismo.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 39

**Fonte:** `        await storageMock.clear();`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Limpa storage mock.

**Como faz:** Aguarda operação Promise.

**Por que existe assim:** Evita estado persistido entre testes.

**Risco/regressão:** Falha aqui aborta o hook assíncrono.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 40

**Fonte:** `(linha vazia)`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 41

**Fonte:** `        global.chrome = {`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Instala objeto Chrome composto no global Node.

**Como faz:** Liga storage/tabs/alarms/runtime/downloads e preserva scripting pré-existente.

**Por que existe assim:** Dá ao background real a superfície de APIs esperada.

**Risco/regressão:** Ausência de API necessária faz a carga ou o fluxo falhar.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 42

**Fonte:** `            storage: { local: storageMock },`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Executa `storage: { local: storageMock },`.

**Como faz:** Participa do bloco `beforeEach: reset de módulos, mocks Chrome, storage e globals.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 43

**Fonte:** `            tabs: tabsMock,`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Executa `tabs: tabsMock,`.

**Como faz:** Participa do bloco `beforeEach: reset de módulos, mocks Chrome, storage e globals.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 44

**Fonte:** `            alarms: alarmsMock,`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Executa `alarms: alarmsMock,`.

**Como faz:** Participa do bloco `beforeEach: reset de módulos, mocks Chrome, storage e globals.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 45

**Fonte:** `            runtime: runtimeMock,`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Executa `runtime: runtimeMock,`.

**Como faz:** Participa do bloco `beforeEach: reset de módulos, mocks Chrome, storage e globals.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 46

**Fonte:** `            downloads: downloadsMock,`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Executa `downloads: downloadsMock,`.

**Como faz:** Participa do bloco `beforeEach: reset de módulos, mocks Chrome, storage e globals.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 47

**Fonte:** `            scripting: global.chrome?.scripting,`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Preserva o mock `scripting` previamente instalado pelo setup compartilhado.

**Como faz:** Usa optional chaining sobre `global.chrome`.

**Por que existe assim:** Evita perder uma API criada por setupFilesAfterEnv.

**Risco/regressão:** É dependência implícita do setup Jest.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 48

**Fonte:** `        };`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 49

**Fonte:** `(linha vazia)`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 50

**Fonte:** `        originalFetch = global.fetch;`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Captura global original para restauração.

**Como faz:** Salva referência antes de instalar doubles do cenário.

**Por que existe assim:** Evita vazar mocks para outros testes.

**Risco/regressão:** Restauração correspondente é obrigatória no afterEach.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 51

**Fonte:** `        originalSelf = global.self;`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Captura global original para restauração.

**Como faz:** Salva referência antes de instalar doubles do cenário.

**Por que existe assim:** Evita vazar mocks para outros testes.

**Risco/regressão:** Restauração correspondente é obrigatória no afterEach.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 52

**Fonte:** `        originalCreateImageBitmap = global.createImageBitmap;`

**Contexto:** beforeEach: reset de módulos, mocks Chrome, storage e globals.

**O que faz:** Captura global original para restauração.

**Como faz:** Salva referência antes de instalar doubles do cenário.

**Por que existe assim:** Evita vazar mocks para outros testes.

**Risco/regressão:** Restauração correspondente é obrigatória no afterEach.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 53

**Fonte:** `        originalOffscreenCanvas = global.OffscreenCanvas;`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Captura global original para restauração.

**Como faz:** Salva referência antes de instalar doubles do cenário.

**Por que existe assim:** Evita vazar mocks para outros testes.

**Risco/regressão:** Restauração correspondente é obrigatória no afterEach.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 54

**Fonte:** `    });`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 55

**Fonte:** `(linha vazia)`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 56

**Fonte:** `    afterEach(async () => {`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Registra cleanup do cenário.

**Como faz:** Restaura globals, esvazia mocks/storage e restaura spies.

**Por que existe assim:** Mantém isolamento no worker Jest.

**Risco/regressão:** Falha durante cleanup pode deixar contaminação.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 57

**Fonte:** `        global.fetch = originalFetch;`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Restaura um global substituído no cenário.

**Como faz:** Reatribui a referência salva no beforeEach.

**Por que existe assim:** Remove efeitos colaterais do harness.

**Risco/regressão:** Sem isso outros testes poderiam observar doubles de BG-59.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 58

**Fonte:** `        global.self = originalSelf;`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Restaura um global substituído no cenário.

**Como faz:** Reatribui a referência salva no beforeEach.

**Por que existe assim:** Remove efeitos colaterais do harness.

**Risco/regressão:** Sem isso outros testes poderiam observar doubles de BG-59.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 59

**Fonte:** `        global.createImageBitmap = originalCreateImageBitmap;`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Restaura um global substituído no cenário.

**Como faz:** Reatribui a referência salva no beforeEach.

**Por que existe assim:** Remove efeitos colaterais do harness.

**Risco/regressão:** Sem isso outros testes poderiam observar doubles de BG-59.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 60

**Fonte:** `        global.OffscreenCanvas = originalOffscreenCanvas;`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Restaura um global substituído no cenário.

**Como faz:** Reatribui a referência salva no beforeEach.

**Por que existe assim:** Remove efeitos colaterais do harness.

**Risco/regressão:** Sem isso outros testes poderiam observar doubles de BG-59.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 61

**Fonte:** `        alarmsMock.clearAll();`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Limpa estado interno de um mock Chrome.

**Como faz:** Esvazia alarms/tabs/downloads registrados.

**Por que existe assim:** Evita recursos simulados stale.

**Risco/regressão:** Depende dos helpers privados do mock de teste.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 62

**Fonte:** `        tabsMock._tabs.clear();`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Limpa estado interno de um mock Chrome.

**Como faz:** Esvazia alarms/tabs/downloads registrados.

**Por que existe assim:** Evita recursos simulados stale.

**Risco/regressão:** Depende dos helpers privados do mock de teste.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 63

**Fonte:** `        downloadsMock._downloads.clear();`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Limpa estado interno de um mock Chrome.

**Como faz:** Esvazia alarms/tabs/downloads registrados.

**Por que existe assim:** Evita recursos simulados stale.

**Risco/regressão:** Depende dos helpers privados do mock de teste.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 64

**Fonte:** `        await storageMock.clear();`

**Contexto:** afterEach: restauração de globals/mocks e limpeza.

**O que faz:** Limpa storage mock.

**Como faz:** Aguarda operação Promise.

**Por que existe assim:** Evita estado persistido entre testes.

**Risco/regressão:** Falha aqui aborta o hook assíncrono.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 65

**Fonte:** `        jest.restoreAllMocks();`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Restaura spies/mocks Jest.

**Como faz:** Invoca cleanup global de jest.fn/spies restauráveis.

**Por que existe assim:** Reduz contaminação entre testes.

**Risco/regressão:** Não substitui restauração manual dos globals.

**Evidência:** 🟨 EXECUTADO PELO HARNESS — preparação/cleanup exercitado a cada caso.

### Linha 66

**Fonte:** `    });`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 67

**Fonte:** `(linha vazia)`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 68

**Fonte:** `    test('fica no projeto background, usa o handler real e retorna hashes visual-v4 de center-crop', async () => {`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Registra o cenário feliz de integração BG-59.

**Como faz:** Executa um dispatch real através de `background.js` com dependências visuais controladas.

**Por que existe assim:** Prova wiring, payload visual-v4, center-crop, fetch seguro e cleanup no sucesso.

**Risco/regressão:** Não cobre neste arquivo os ramos de erro/URL inválida; suíte focal do action os cobre.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 69

**Fonte:** `        const closeBitmap = jest.fn();`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Cria spy do `ImageBitmap.close`.

**Como faz:** Usa mock Jest para observar cleanup.

**Por que existe assim:** Permite provar liberação do bitmap no caminho feliz.

**Risco/regressão:** Só prova que foi chamado, não exatamente uma vez neste arquivo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 70

**Fonte:** `        const drawCalls = [];`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Cria coletor das chamadas de desenho.

**Como faz:** Array recebe metadados de cada `drawImage`.

**Por que existe assim:** Permite inspecionar geometria do center-crop.

**Risco/regressão:** Não valida pixel real porque canvas é mockado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 71

**Fonte:** `        const makePixels = (length) => Uint8ClampedArray.from({ length }, (_value, index) => index % 256);`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Define gerador determinístico de bytes RGBA.

**Como faz:** Preenche Uint8ClampedArray com `index % 256`.

**Por que existe assim:** Produz pixelSample hex reproduzível sem decodificação real.

**Risco/regressão:** Não representa conteúdo visual real; o foco é plumbing/shape.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 72

**Fonte:** `        const fpApi = {`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Cria API de fingerprint controlada.

**Como faz:** Fornece funções Jest para dHash/wHash/pHash/regional.

**Por que existe assim:** Isola o action e permite verificar número/ordem de chamadas.

**Risco/regressão:** Não prova matemática dos hashes reais; isso pertence aos testes de `gtc-fingerprint.js`.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 73

**Fonte:** `            calculateDHash: jest.fn(() => 'dhash-16-hex'),`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Configura/prova uso de dHash.

**Como faz:** Mock retorna marcador conhecido ou assertion verifica chamada.

**Por que existe assim:** Confirma wiring do campo dHash no action.

**Risco/regressão:** Formato do dHash real não é calculado neste teste.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 74

**Fonte:** `            calculateWHash: jest.fn()`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Configura/prova duas chamadas de wHash.

**Como faz:** `mockReturnValueOnce` diferencia full-frame e center-crop.

**Por que existe assim:** Confirma que resposta preserva ambos os hashes.

**Risco/regressão:** Algoritmo real permanece mockado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 75

**Fonte:** `                .mockReturnValueOnce('w-main'.padEnd(64, '0'))`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `.mockReturnValueOnce('w-main'.padEnd(64, '0'))`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 76

**Fonte:** `                .mockReturnValueOnce('w-crop'.padEnd(64, '1')),`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `.mockReturnValueOnce('w-crop'.padEnd(64, '1')),`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 77

**Fonte:** `            calculatePHash: jest.fn()`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Configura/prova duas chamadas de pHash.

**Como faz:** Valores distintos marcam frame completo e crop.

**Por que existe assim:** Confirma wiring dos dois campos pHash.

**Risco/regressão:** Algoritmo real permanece mockado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 78

**Fonte:** `                .mockReturnValueOnce('p-main'.padEnd(64, '2'))`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `.mockReturnValueOnce('p-main'.padEnd(64, '2'))`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 79

**Fonte:** `                .mockReturnValueOnce('p-crop'.padEnd(64, '3')),`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `.mockReturnValueOnce('p-crop'.padEnd(64, '3')),`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 80

**Fonte:** `            calculateRegionalHashes: jest.fn(() => ({`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Configura/prova chamada de hashes regionais.

**Como faz:** Retorna quadrantes conhecidos.

**Por que existe assim:** Confirma transporte de `regionalHashes`.

**Risco/regressão:** Não valida cálculo real dos quadrantes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 81

**Fonte:** `                topLeft: 'tl',`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `topLeft: 'tl',`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 82

**Fonte:** `                topRight: 'tr',`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `topRight: 'tr',`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 83

**Fonte:** `                bottomLeft: 'bl',`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `bottomLeft: 'bl',`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 84

**Fonte:** `                bottomRight: 'br',`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `bottomRight: 'br',`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 85

**Fonte:** `            })),`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Executa `})),`.

**Como faz:** Participa do bloco `Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 86

**Fonte:** `        };`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 87

**Fonte:** `(linha vazia)`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 88

**Fonte:** `        class MockOffscreenCanvas {`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Declara canvas offscreen controlado para o action.

**Como faz:** Registra dimensões e fornece contexto 2D fake.

**Por que existe assim:** Permite verificar resize/crop sem browser real.

**Risco/regressão:** Não prova comportamento nativo do OffscreenCanvas.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 89

**Fonte:** `            constructor(width, height) {`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Armazena dimensões solicitadas pelo action.

**Como faz:** Copia width/height para a instância fake.

**Por que existe assim:** Permite gerar pixels/registrar qual canvas foi usado.

**Risco/regressão:** Sem validação de tipos além do caller.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 90

**Fonte:** `                this.width = width;`

**Contexto:** Preparação do cenário feliz: APIs de fingerprint e OffscreenCanvas controlados.

**O que faz:** Armazena dimensões solicitadas pelo action.

**Como faz:** Copia width/height para a instância fake.

**Por que existe assim:** Permite gerar pixels/registrar qual canvas foi usado.

**Risco/regressão:** Sem validação de tipos além do caller.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 91

**Fonte:** `                this.height = height;`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Armazena dimensões solicitadas pelo action.

**Como faz:** Copia width/height para a instância fake.

**Por que existe assim:** Permite gerar pixels/registrar qual canvas foi usado.

**Risco/regressão:** Sem validação de tipos além do caller.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 92

**Fonte:** `            }`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 93

**Fonte:** `(linha vazia)`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 94

**Fonte:** `            getContext() {`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Implementa contexto 2D mínimo do canvas fake.

**Como faz:** Retorna `drawImage` e `getImageData`.

**Por que existe assim:** Satisfaz a superfície exata consumida pelo action.

**Risco/regressão:** Qualquer nova API canvas usada pelo action exigirá ampliar o fake.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 95

**Fonte:** `                return {`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Executa `return {`.

**Como faz:** Participa do bloco `Instalação dos globals de browser/fetch/bitmap/canvas.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 96

**Fonte:** `                    drawImage: jest.fn((...args) => {`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Instrumenta `drawImage`.

**Como faz:** Registra canvas e argumentos em `drawCalls`.

**Por que existe assim:** Permite provar center-crop `0,200,800,800 → 32x32`.

**Risco/regressão:** Não renderiza pixels reais.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 97

**Fonte:** `                        drawCalls.push({`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Executa `drawCalls.push({`.

**Como faz:** Participa do bloco `Instalação dos globals de browser/fetch/bitmap/canvas.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 98

**Fonte:** `                            canvas: \`${this.width}x${this.height}\`,`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Armazena dimensões solicitadas pelo action.

**Como faz:** Copia width/height para a instância fake.

**Por que existe assim:** Permite gerar pixels/registrar qual canvas foi usado.

**Risco/regressão:** Sem validação de tipos além do caller.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 99

**Fonte:** `                            args,`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Executa `args,`.

**Como faz:** Participa do bloco `Instalação dos globals de browser/fetch/bitmap/canvas.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 100

**Fonte:** `                        });`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 101

**Fonte:** `                    }),`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Executa `}),`.

**Como faz:** Participa do bloco `Instalação dos globals de browser/fetch/bitmap/canvas.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 102

**Fonte:** `                    getImageData: jest.fn(() => ({`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Fabrica ImageData-like determinístico.

**Como faz:** Tamanho deriva das dimensões do canvas.

**Por que existe assim:** Alimenta pixelSample e funções de hash mockadas.

**Risco/regressão:** Sem validação de canais alpha/cores reais.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 103

**Fonte:** `                        data: makePixels(this.width * this.height * 4),`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Define gerador determinístico de bytes RGBA.

**Como faz:** Preenche Uint8ClampedArray com `index % 256`.

**Por que existe assim:** Produz pixelSample hex reproduzível sem decodificação real.

**Risco/regressão:** Não representa conteúdo visual real; o foco é plumbing/shape.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 104

**Fonte:** `                    })),`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Executa `})),`.

**Como faz:** Participa do bloco `Instalação dos globals de browser/fetch/bitmap/canvas.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 105

**Fonte:** `                };`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 106

**Fonte:** `            }`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 107

**Fonte:** `        }`

**Contexto:** Instalação dos globals de browser/fetch/bitmap/canvas.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 108

**Fonte:** `(linha vazia)`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 109

**Fonte:** `        global.self = { MangaTranslatorGtcFingerprint: fpApi };`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Expõe a API de fingerprint no mesmo namespace usado pelo action.

**Como faz:** Define `MangaTranslatorGtcFingerprint` em `self`.

**Por que existe assim:** Reproduz wiring do service worker.

**Risco/regressão:** Usa fake API, não a implementação real do algoritmo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 110

**Fonte:** `        global.fetch = jest.fn(async () => ({`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Substitui fetch por resposta HTTP simulada bem-sucedida.

**Como faz:** Retorna objeto `ok:true` com Blob PNG.

**Por que existe assim:** Evita rede e permite verificar opções do fetch.

**Risco/regressão:** Não testa HTTP real neste unitário.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 111

**Fonte:** `            ok: true,`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Executa `ok: true,`.

**Como faz:** Participa do bloco `Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 112

**Fonte:** `            blob: async () => new Blob(['image-bytes'], { type: 'image/png' }),`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Produz Blob de imagem controlado.

**Como faz:** Usa bytes simbólicos com type image/png.

**Por que existe assim:** Fornece entrada para `createImageBitmap` fake.

**Risco/regressão:** Conteúdo não é decodificado de verdade.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 113

**Fonte:** `        }));`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Executa `}));`.

**Como faz:** Participa do bloco `Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 114

**Fonte:** `        global.createImageBitmap = jest.fn(async () => ({`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Substitui decodificação por bitmap 800×1200 controlado.

**Como faz:** Retorna width/height e `close` spy.

**Por que existe assim:** Fixa geometria necessária ao center-crop vertical.

**Risco/regressão:** Não exercita decoder nativo.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 115

**Fonte:** `            width: 800,`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Executa `width: 800,`.

**Como faz:** Participa do bloco `Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 116

**Fonte:** `            height: 1200,`

**Contexto:** Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.

**O que faz:** Executa `height: 1200,`.

**Como faz:** Participa do bloco `Carga de background.js real e dispatch da action CALCULATE_VISUAL_FINGERPRINT.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 117

**Fonte:** `            close: closeBitmap,`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Executa `close: closeBitmap,`.

**Como faz:** Participa do bloco `Assertion do payload visual-v4 retornado pelo handler real.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 118

**Fonte:** `        }));`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Executa `}));`.

**Como faz:** Participa do bloco `Assertion do payload visual-v4 retornado pelo handler real.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 119

**Fonte:** `        global.OffscreenCanvas = MockOffscreenCanvas;`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Instala `MockOffscreenCanvas` como API global.

**Como faz:** O action criará os canvases por esse construtor.

**Por que existe assim:** Permite observar todos os resizes/crops.

**Risco/regressão:** É double controlado do browser.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 120

**Fonte:** `(linha vazia)`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 121

**Fonte:** `        loadBackgroundModule(BACKGROUND_PATH);`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Carrega `extension/background.js` real.

**Como faz:** O loader executa o fonte e seus requires/actions em ambiente mockado.

**Por que existe assim:** Prova composição/router/listener além do action isolado.

**Risco/regressão:** Loader acrescenta instrumentação de teste, mas não substitui o handler.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 122

**Fonte:** `        await flush(8);`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Drena algumas viradas do event loop após a carga.

**Como faz:** Executa oito rounds de delay(0).

**Por que existe assim:** Permite inicializações assíncronas do background estabilizarem.

**Risco/regressão:** É sincronização de harness, não assertion de estado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 123

**Fonte:** `(linha vazia)`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 124

**Fonte:** `        const result = await dispatchToBackground(runtimeMock, {`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Despacha mensagem pelo listener real registrado no runtime mock.

**Como faz:** Invoca `CALCULATE_VISUAL_FINGERPRINT` com URL HTTP.

**Por que existe assim:** Exercita resolução do router e action pelo composition root.

**Risco/regressão:** Sender default é `{tab:null}`; este action permite source any.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 125

**Fonte:** `            action: 'CALCULATE_VISUAL_FINGERPRINT',`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Seleciona a action pública do contrato runtime.

**Como faz:** Usa alias resolvido pelo router para `calculate-visual-fingerprint`.

**Por que existe assim:** Prova compatibilidade da action string consumida por clients.

**Risco/regressão:** Renomear alias quebraria o teste e os consumers.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 126

**Fonte:** `            url: 'https://cdn.reader.test/page-001.png',`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Fornece URL HTTPS válida de imagem.

**Como faz:** É passada ao action para fetch controlado.

**Por que existe assim:** Prova que o caminho aceita HTTP(S) e usa exatamente a URL recebida.

**Risco/regressão:** Validação de URL inválida é coberta em suíte focal separada.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 127

**Fonte:** `        });`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 128

**Fonte:** `(linha vazia)`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Linha vazia editorial.

**Como faz:** Separa blocos sem operação runtime.

**Por que existe assim:** Melhora legibilidade.

**Risco/regressão:** Sem risco funcional próprio.

**Evidência:** ⚠️ SEM ASSERTION PRÓPRIA — linha editorial/comentário.

### Linha 129

**Fonte:** `        expect(result.keepAlive).toBe(true);`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Prova que o router mantém canal assíncrono aberto.

**Como faz:** Exige `keepAlive === true`.

**Por que existe assim:** Necessário porque execute é async e responde depois do callback.

**Risco/regressão:** Regressão para false poderia perder a resposta em runtime Chrome.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 130

**Fonte:** `        expect(result.response).toEqual(expect.objectContaining({`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Inicia assertion estrutural do payload de resposta.

**Como faz:** Usa `objectContaining` para exigir campos centrais.

**Por que existe assim:** Prova contrato público preservado pelo background real.

**Risco/regressão:** Campos adicionais não quebram esta assertion.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 131

**Fonte:** `            ok: true,`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Exige sucesso explícito no payload.

**Como faz:** Compara `ok:true`.

**Por que existe assim:** Distingue resposta normal de `{ok:false,error}`.

**Risco/regressão:** O router/action adiciona sucesso ao retorno final.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 132

**Fonte:** `            pixelSample: expect.stringMatching(/^[0-9a-f]+$/),`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Exige pixelSample hexadecimal.

**Como faz:** Regex aceita somente caracteres hex.

**Por que existe assim:** Prova serialização dos 8×8 RGBA em string hex.

**Risco/regressão:** Comprimento exato é provado em assertion separada.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 133

**Fonte:** `            dHash: 'dhash-16-hex',`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Exige valor de hash correspondente no payload.

**Como faz:** Compara marcador previamente configurado no fpApi.

**Por que existe assim:** Prova associação entre chamada e campo de resposta.

**Risco/regressão:** Não valida o algoritmo matemático do hash real.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 134

**Fonte:** `            wHash: 'w-main'.padEnd(64, '0'),`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Exige valor de hash correspondente no payload.

**Como faz:** Compara marcador previamente configurado no fpApi.

**Por que existe assim:** Prova associação entre chamada e campo de resposta.

**Risco/regressão:** Não valida o algoritmo matemático do hash real.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 135

**Fonte:** `            pHash: 'p-main'.padEnd(64, '2'),`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Exige valor de hash correspondente no payload.

**Como faz:** Compara marcador previamente configurado no fpApi.

**Por que existe assim:** Prova associação entre chamada e campo de resposta.

**Risco/regressão:** Não valida o algoritmo matemático do hash real.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 136

**Fonte:** `            wHashCrop: 'w-crop'.padEnd(64, '1'),`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Exige valor de hash correspondente no payload.

**Como faz:** Compara marcador previamente configurado no fpApi.

**Por que existe assim:** Prova associação entre chamada e campo de resposta.

**Risco/regressão:** Não valida o algoritmo matemático do hash real.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 137

**Fonte:** `            pHashCrop: 'p-crop'.padEnd(64, '3'),`

**Contexto:** Assertion do payload visual-v4 retornado pelo handler real.

**O que faz:** Exige valor de hash correspondente no payload.

**Como faz:** Compara marcador previamente configurado no fpApi.

**Por que existe assim:** Prova associação entre chamada e campo de resposta.

**Risco/regressão:** Não valida o algoritmo matemático do hash real.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 138

**Fonte:** `            regionalHashes: {`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Exige objeto de hashes regionais no payload.

**Como faz:** Compara quadrantes retornados pelo fpApi fake.

**Por que existe assim:** Prova que o action não descarta o mapa regional.

**Risco/regressão:** Cobertura matemática é externa.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 139

**Fonte:** `                topLeft: 'tl',`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Executa `topLeft: 'tl',`.

**Como faz:** Participa do bloco `Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 140

**Fonte:** `                topRight: 'tr',`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Executa `topRight: 'tr',`.

**Como faz:** Participa do bloco `Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 141

**Fonte:** `                bottomLeft: 'bl',`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Executa `bottomLeft: 'bl',`.

**Como faz:** Participa do bloco `Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 142

**Fonte:** `                bottomRight: 'br',`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Executa `bottomRight: 'br',`.

**Como faz:** Participa do bloco `Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 143

**Fonte:** `            },`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 144

**Fonte:** `        }));`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Executa `}));`.

**Como faz:** Participa do bloco `Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 145

**Fonte:** `        expect(result.response.pixelSample).toHaveLength(512);`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Prova comprimento exato 512 do sample.

**Como faz:** 8×8×4 bytes × 2 hex chars = 512.

**Por que existe assim:** Protege formato esperado pelo consumidor.

**Risco/regressão:** Não valida distribuição dos pixels.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 146

**Fonte:** `        expect(global.fetch).toHaveBeenCalledWith('https://cdn.reader.test/page-001.png', {`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Prova chamada de fetch com URL exata.

**Como faz:** Matcher também verifica opções do objeto seguinte.

**Por que existe assim:** Confirma boundary de rede do action.

**Risco/regressão:** Falha se URL for reescrita inesperadamente.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 147

**Fonte:** `            credentials: 'omit',`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Exige fetch sem credenciais.

**Como faz:** Compara opção `credentials:'omit'`.

**Por que existe assim:** Evita enviar cookies/credenciais a CDN de imagem no fingerprint.

**Risco/regressão:** Propriedade de segurança/privacidade diretamente assertada.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 148

**Fonte:** `            cache: 'no-store',`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Exige bypass de cache HTTP no fetch.

**Como faz:** Compara `cache:'no-store'`.

**Por que existe assim:** Reduz risco de fingerprint usar imagem stale.

**Risco/regressão:** Pode aumentar tráfego; é contrato atual.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 149

**Fonte:** `        });`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 150

**Fonte:** `        expect(fpApi.calculateDHash).toHaveBeenCalledTimes(1);`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Configura/prova uso de dHash.

**Como faz:** Mock retorna marcador conhecido ou assertion verifica chamada.

**Por que existe assim:** Confirma wiring do campo dHash no action.

**Risco/regressão:** Formato do dHash real não é calculado neste teste.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 151

**Fonte:** `        expect(fpApi.calculateWHash).toHaveBeenCalledTimes(2);`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Configura/prova duas chamadas de wHash.

**Como faz:** `mockReturnValueOnce` diferencia full-frame e center-crop.

**Por que existe assim:** Confirma que resposta preserva ambos os hashes.

**Risco/regressão:** Algoritmo real permanece mockado.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 152

**Fonte:** `        expect(fpApi.calculatePHash).toHaveBeenCalledTimes(2);`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Configura/prova duas chamadas de pHash.

**Como faz:** Valores distintos marcam frame completo e crop.

**Por que existe assim:** Confirma wiring dos dois campos pHash.

**Risco/regressão:** Algoritmo real permanece mockado.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 153

**Fonte:** `        expect(fpApi.calculateRegionalHashes).toHaveBeenCalledTimes(1);`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Configura/prova chamada de hashes regionais.

**Como faz:** Retorna quadrantes conhecidos.

**Por que existe assim:** Confirma transporte de `regionalHashes`.

**Risco/regressão:** Não valida cálculo real dos quadrantes.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 154

**Fonte:** `        expect(drawCalls).toEqual(expect.arrayContaining([`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Compõe assertion da geometria de draw.

**Como faz:** Procura ao menos uma chamada compatível no coletor.

**Por que existe assim:** Prova que center-crop aconteceu entre outras renders.

**Risco/regressão:** Não exige ordem completa de todas as drawCalls.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 155

**Fonte:** `            expect.objectContaining({`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Compõe assertion da geometria de draw.

**Como faz:** Procura ao menos uma chamada compatível no coletor.

**Por que existe assim:** Prova que center-crop aconteceu entre outras renders.

**Risco/regressão:** Não exige ordem completa de todas as drawCalls.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 156

**Fonte:** `                canvas: '32x32',`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Exige canvas destino 32×32 para crop.

**Como faz:** Compara string capturada pelo fake.

**Por que existe assim:** Alinha com entrada esperada de wHash/pHash.

**Risco/regressão:** Canvas de outras escalas não é focalmente assertado aqui.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 157

**Fonte:** `                args: expect.arrayContaining([0, 200, 800, 800, 0, 0, 32, 32]),`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Compõe assertion da geometria de draw.

**Como faz:** Procura ao menos uma chamada compatível no coletor.

**Por que existe assim:** Prova que center-crop aconteceu entre outras renders.

**Risco/regressão:** Não exige ordem completa de todas as drawCalls.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 158

**Fonte:** `            }),`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Executa `}),`.

**Como faz:** Participa do bloco `Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 159

**Fonte:** `        ]));`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Executa `]));`.

**Como faz:** Participa do bloco `Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.`.

**Por que existe assim:** Prepara, aciona ou valida o cenário BG-59.

**Risco/regressão:** Interpretação depende das linhas adjacentes.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 160

**Fonte:** `        expect(closeBitmap).toHaveBeenCalled();`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Prova cleanup do ImageBitmap no sucesso.

**Como faz:** Exige que `close()` tenha sido chamado.

**Por que existe assim:** Evita retenção do recurso decodificado.

**Risco/regressão:** Este teste não exige cardinalidade exata; suíte focal exige uma vez.

**Evidência:** ✅ PRODUZ PROVA DIRETA — assertion focal sobre o fluxo carregado/despachado.

### Linha 161

**Fonte:** `    });`

**Contexto:** Assertions de fetch, chamadas de hash, center-crop e cleanup do ImageBitmap.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Linha 162

**Fonte:** `});`

**Contexto:** Fechamento estrutural do describe.

**O que faz:** Delimitador estrutural.

**Como faz:** Fecha bloco/chamada/objeto adjacente.

**Por que existe assim:** Mantém escopo sintático.

**Risco/regressão:** Sem comportamento isolado.

**Evidência:** 🟨 EXECUTADO DIRETAMENTE NO CENÁRIO — setup/ação que alimenta as assertions, sem prova isolada da linha.

### Posição 163 — newline final

**Fonte:** terminador LF após a linha 162.

**Contexto:** identidade textual do blob.

**O que faz:** encerra o arquivo texto.

**Como faz:** o blob termina em `\n`.

**Por que existe assim:** mantém formato canônico e compatibilidade editorial.

**Risco/regressão:** nenhum efeito funcional isolado.

**Evidência:** 🟦 INSPEÇÃO ESTÁTICA DO BLOB.

## 14. Autoauditoria documental

- SHA do fonte reconfirmado antes da escrita: **sim**.
- Fonte integral incorporada: **sim**.
- 162/162 linhas textuais documentadas: **sim**.
- newline final documentado como posição 163: **sim**.
- action real inspecionado: **sim**.
- router/background composition root inspecionados: **sim**.
- loader/dispatcher inspecionados: **sim**.
- suíte focal complementar inspecionada: **sim**.
- algoritmo real de fingerprint distinguido dos mocks deste teste: **sim**.
- solicitação externa registrada sem alterar fonte/testes: **1 OPEN**.

### Conclusão

#172 prova de forma direta o wiring do BG-59 através do background real, inclusive payload visual-v4, center-crop, opções de fetch e cleanup no sucesso. As lacunas de erro são cobertas por outras suítes reais; a única pendência registrada é a nomenclatura inconsistente visual-v3/v4.

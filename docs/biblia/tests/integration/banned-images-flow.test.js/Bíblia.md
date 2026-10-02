# Bíblia técnica — tests/integration/banned-images-flow.test.js

> **Estado documental:** reparo corretivo materializado; decisão distribuída final pendente  
> **SHA auditado:** `3e750df20bdfb54c56202916191ef04eeafc9e9e`  
> **Índice do corpus:** 106  
> **Tipo:** integração Jest real popup → storage → content script  
> **Linhas textuais:** **261**  
> **Posições documentais:** **262**, contando o LF final  
> **Tamanho textual observado:** **9023 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte protege BUG #9 + INCONS #2 usando implementações reais. A versão anterior reimplementava ban/listagem em `simulate*`; essa duplicação foi removida.

O fluxo atual é:

`popup.js real` → `chrome.storage.local[bannedImages_<host>]` → `content_manga.js real`/`cm-dom-replace.js real`.

O teste usa helpers de harness apenas para montar JSDOM/mocks e carregar os módulos reais; não existe cópia local da regra de elegibilidade, ban, unban ou índice.

## 2. Dependências diretas e blobs revalidados

- `tests/helpers/load-extension-page.js`: `c2325598f10b3ef9dd656a4e87db8569748e66b0`.
- `tests/helpers/load-content-script.js`: `0b52224bd7063db9b6bb683d827217d8f2fda69c`.
- `tests/mocks/chrome-api.mock.js`: `c1d9a056b7777183bfd3f540c49811335f410425`.
- `extension/popup/popup.js`: `300cfe9a9c81814443c9d52a17915d851408748b`.
- `extension/content/content_manga.js`: `a8b3698019f6f22027f09f544f15c0563a9f6515`.
- `extension/content/cm-dom-replace.js`: `d3fc72032dbddc81eae8fadc5e4da89b13a3bb79`.
- `extension/manifest.json`: `841fe70c183350e4110bc8ff57ab69b157169c36`.
- `jest.config.js`: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.
- `package.json`: `5b5c328f6139eeff920dc65a78014a6c5b6db3a6`.
- `.github/workflows/ci.yml`: `9ce62e2b116e2204d1689edf9d302e6ee0cf8c3a`.
- `.github/workflows/banned-images-flow-selftest.yml`: `45c9934a621935bbddc7a5bf385425001e9941ea`.

Os dois bindings que bloquearam as auditorias PRIMARY/ADVERSARIAL anteriores (`package.json` e `ci.yml`) foram reabertos na revisão atual e os scripts/steps citados permanecem presentes.

## 3. Wiring Jest/CI

`package.json` mantém `test:integration = jest --config jest.config.js --selectProjects integration` e `test:ci = node scripts/ci/run-jest-ci.js`.

`jest.config.js` inclui `tests/integration/**/*.test.js` no projeto `integration` com JSDOM e mocks globais.

O workflow focal executa:

1. somente `tests/integration/banned-images-flow.test.js` via `--runTestsByPath`, `--runInBand` e `--detectOpenHandles`;
2. depois toda a suíte `integration` via `npm run test:integration -- --runInBand`.

## 4. Produção real do ban

`banWithRealPopup()` cria uma aba ativa no mock e usa `loadExtensionPage` para carregar `extension/popup/popup.html` + `extension/popup/popup.js` reais.

O handler de tab do teste fornece somente a imagem detectada; a lógica que seleciona o card, responde ao clique `#btn-ban-selected`, calcula a chave e grava `chrome.storage.local` é a implementação real do popup.

Após o clique, o teste lê a chave exata `bannedImages_reader.test` e exige `['https://reader.test/page-0.png']`.

## 5. Consumo real pelo content script

`loadRealContentUsingPopupState()` lê o valor exato produzido pelo popup e o fornece ao helper real do content script sem transformar URLs ou índices. `loadContentScript` semeia o mesmo mock de storage com esse valor e carrega a ordem real do Manifest.

Essa passagem pelo argumento `bannedImages` é uma operação do harness; o teste protege o contrato de nome/formato da chave com assertion explícita antes da carga. O filtro e a preservação de índice são executados somente por `content_manga.js`/`cm-dom-replace.js` reais.

## 6. GET_PAGE_IMAGES e índices DOM

O DOM contém quatro imagens válidas. A imagem de índice DOM 0 é a URL banida pelo popup.

`GET_PAGE_IMAGES` real deve devolver exatamente índices 1, 2 e 3, incluindo o banner 960×480. Assim, o teste prova simultaneamente:

- a banida não volta;
- a lista nominal completa contém as três imagens restantes;
- os índices não são recompactados após remover o item anterior;
- width/height correspondem ao DOM real.

Isso fecha diretamente o desvio apontado em 106-002.

## 7. Botão flutuante e START_BATCH

O segundo teste carrega o mesmo estado produzido pelo popup, clica `#manga-main-content` real e aguarda uma mensagem `START_BATCH` enviada pelo content script.

A assertion exige `images = [{index:1},{index:2},{index:3}]` e proíbe `{index:0}`. As respostas de cache/fingerprint do background são stubs vazios apenas para permitir chegar ao batch; seleção/filtragem/índices permanecem lógica real do content script.

Isso fecha a integração popup → storage → auto-seleção que faltava em 106-001.

## 8. Isolamento por host

O terceiro teste produz um ban em `reader.test`, confirma que `bannedImages_outromanga.test` está ausente e carrega o content script real em `outromanga.test` com lista vazia.

A mesma URL permanece elegível no host B e a chave do host A continua intacta.

## 9. Audit requests

### 106-001 — RESOLVED

A suíte não é mais um modelo sintético. Popup real grava a chave; content script real consome o estado e o botão real produz `START_BATCH`. Run focal e suíte de integração estão verdes.

### 106-002 — RESOLVED

O caso nominal exige a lista exata das três imagens remanescentes, incluindo o banner, e prova preservação dos índices DOM 1/2/3 após banir o índice 0.

## 10. Evidência executável

- Workflow: `.github/workflows/banned-images-flow-selftest.yml` SHA `45c9934a621935bbddc7a5bf385425001e9941ea`.
- Run: `36945155749`, job `110645467215`, conclusão `success`.
- Focal: **1/1 suíte, 3/3 testes**, `--runTestsByPath`, `--runInBand`, `--detectOpenHandles`.
- Regressão relacionada: **13/13 suítes, 89/89 testes** do projeto `integration`.
- Nenhum snapshot.

## 11. Regressão contra BASE

`main`/revisão anterior do #106 tinha `simulateGetPageImages`, `simulateBanImages` e `simulateUnbanImages`. Essas funções locais foram removidas, assim como o import morto `fs` e o comentário contraditório que reconhecia o banner válido sem assertá-lo.

A mudança é apenas de teste/validação; nenhum código de produção foi alterado para satisfazer a suíte.

## 12. Casos adversariais e limites

- O popup recebe a lista inicial de imagens por um handler de `tabs.sendMessage` do harness; isso é necessário porque não existe aba Chromium real no Jest. A lógica de ban posterior é o popup real.
- O background/cache é stubado no teste de botão para evitar dependência de infraestrutura externa; a lista enviada a `START_BATCH` é produzida pelo content script real.
- O teste não afirma equivalência de um navegador completo; afirma integração das implementações reais dentro do ambiente Jest/JSDOM suportado pelo repositório.
- O valor gravado pelo popup é assertado antes de ser repassado ao helper, impedindo que erro de nome/formato da chave seja mascarado.

## 13. Fonte integral exata

```js
/**
 * banned-images-flow.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração real do contrato de banimento:
 * popup real -> chrome.storage -> content script real.
 *
 * Protege BUG #9 + INCONS #2 sem reimplementar as regras de produção.
 */

const crypto = require('crypto');
const { TextEncoder } = require('util');

const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const { loadContentScript } = require('../helpers/load-content-script.js');
const {
    getStorageMock,
    getTabsMock,
    getRuntimeMock,
} = require('../mocks/chrome-api.mock.js');

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

describe('Fluxo real de banimento — popup -> storage -> content script', () => {
    const HOSTNAME = 'reader.test';
    const BAN_KEY = `bannedImages_${HOSTNAME}`;

    const BANNED_IMAGE = {
        index: 0,
        src: `https://${HOSTNAME}/page-0.png`,
        width: 800,
        height: 1200,
    };

    const DOM_IMAGES = [
        { src: BANNED_IMAGE.src, width: 800, height: 1200 },
        { src: `https://${HOSTNAME}/page-1.png`, width: 810, height: 1210 },
        { src: `https://${HOSTNAME}/page-2.png`, width: 820, height: 1220 },
        { src: `https://${HOSTNAME}/banner.png`, width: 960, height: 480 },
    ];

    let storageMock;
    let tabsMock;
    let runtimeMock;
    let sentMessages;

    async function waitFor(assertion, { timeout = 2500, interval = 10 } = {}) {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
            const result = await assertion();
            if (result) return result;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        throw new Error('Timeout aguardando condição da integração de banimento');
    }

    async function createActiveTab(url) {
        const tab = await tabsMock.create({ url, active: true });
        tabsMock._tabs.get(tab.id).title = 'Reader Test';
        return tab;
    }

    function registerPopupTabHandler(tabId, images) {
        tabsMock._registerMessageHandler(tabId, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({ images, total: images.length });
                return;
            }
            if (
                message.action === 'SET_SELECTED_IMAGES'
                || message.action === 'ENABLE_PAGE'
                || message.action === 'HIGHLIGHT_IMAGE'
            ) {
                sendResponse({ success: true });
            }
        });
    }

    function installRuntimeResponder() {
        sentMessages = [];
        jest.spyOn(runtimeMock, 'sendMessage').mockImplementation((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'GTC_QUERY_MANY') {
                if (callback) setTimeout(() => callback({ ok: true, entriesByHash: {} }), 0);
                return;
            }
            if (message.action === 'GTC_QUERY_BY_DHASH') {
                if (callback) setTimeout(() => callback({ ok: true, entriesByDHash: {} }), 0);
                return;
            }
            if (message.action === 'GTC_QUERY_PERCEPTUAL_V2') {
                if (callback) setTimeout(() => callback({ ok: true, entriesByQueryId: {} }), 0);
                return;
            }
            if (message.action === 'CALCULATE_VISUAL_FINGERPRINT') {
                if (callback) setTimeout(() => callback({ ok: false, error: 'sem fingerprint no teste focal' }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    }

    async function banWithRealPopup() {
        const tab = await createActiveTab(`https://${HOSTNAME}/chapter-1`);
        registerPopupTabHandler(tab.id, [BANNED_IMAGE]);

        await storageMock.set({ enabledDomains: [HOSTNAME] });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(12);

        expect(document.querySelectorAll('#image-grid .image-card')).toHaveLength(1);
        expect(document.querySelectorAll('#image-grid .image-card.selected')).toHaveLength(1);

        document.getElementById('btn-ban-selected').click();
        await flushAsyncTasks(12);

        const data = await storageMock.get([BAN_KEY]);
        expect(data[BAN_KEY]).toEqual([BANNED_IMAGE.src]);
        return data[BAN_KEY];
    }

    async function loadRealContentUsingPopupState() {
        const bannedFromPopup = await banWithRealPopup();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        installRuntimeResponder();

        return loadContentScript({
            hostname: HOSTNAME,
            bannedImages: bannedFromPopup,
            domImages: DOM_IMAGES,
        });
    }

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        runtimeMock = getRuntimeMock();

        await storageMock.clear();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        delete window.__manga_translator_content_injected;
        delete window.__manga_translator_active_instance;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    test('popup real grava a chave consumida por GET_PAGE_IMAGES real e preserva índices DOM', async () => {
        const context = await loadRealContentUsingPopupState();

        const response = await context.sendMessage('GET_PAGE_IMAGES');

        expect(response).toEqual({
            images: [
                {
                    index: 1,
                    src: DOM_IMAGES[1].src,
                    width: DOM_IMAGES[1].width,
                    height: DOM_IMAGES[1].height,
                },
                {
                    index: 2,
                    src: DOM_IMAGES[2].src,
                    width: DOM_IMAGES[2].width,
                    height: DOM_IMAGES[2].height,
                },
                {
                    index: 3,
                    src: DOM_IMAGES[3].src,
                    width: DOM_IMAGES[3].width,
                    height: DOM_IMAGES[3].height,
                },
            ],
            total: 3,
        });

        const persisted = await storageMock.get([BAN_KEY]);
        expect(persisted[BAN_KEY]).toEqual([BANNED_IMAGE.src]);
    });

    test('botão flutuante real envia START_BATCH sem a URL banida pelo popup', async () => {
        await loadRealContentUsingPopupState();

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(
            () => sentMessages.find(message => message.action === 'START_BATCH')
        );

        expect(startBatch.images).toEqual([
            { index: 1 },
            { index: 2 },
            { index: 3 },
        ]);
        expect(startBatch.images).not.toContainEqual({ index: 0 });
    });

    test('ban produzido no host A não afeta o content script real do host B', async () => {
        await banWithRealPopup();

        const otherHost = 'outromanga.test';
        const otherKey = `bannedImages_${otherHost}`;
        const otherState = await storageMock.get([otherKey]);
        expect(otherState[otherKey]).toBeUndefined();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;

        const context = await loadContentScript({
            hostname: otherHost,
            bannedImages: [],
            domImages: [
                { src: BANNED_IMAGE.src, width: 800, height: 1200 },
            ],
        });

        expect(await context.sendMessage('GET_PAGE_IMAGES')).toEqual({
            images: [
                {
                    index: 0,
                    src: BANNED_IMAGE.src,
                    width: 800,
                    height: 1200,
                },
            ],
            total: 1,
        });

        const hostAState = await storageMock.get([BAN_KEY]);
        expect(hostAState[BAN_KEY]).toEqual([BANNED_IMAGE.src]);
    });
});
```

## 14. Cobertura integral por posições

- **1–29:** propósito, imports, helpers carregados e setup de crypto/TextEncoder.
- **30–52:** describe, constantes, fixtures e estado dos mocks.
- **53–62:** polling `waitFor` bounded.
- **63–68:** criação da aba ativa.
- **69–84:** responder mínimo de mensagens do popup.
- **85–109:** responder de runtime para cache/fingerprint/batch.
- **110–133:** ban com popup real e assertion da chave persistida.
- **134–148:** carga do content script com o estado exato produzido pelo popup.
- **149–175:** setup/teardown por teste.
- **176–208:** prova `GET_PAGE_IMAGES` real e índices DOM preservados.
- **209–225:** prova `START_BATCH` real via botão flutuante.
- **226–261:** isolamento por hostname.
- **262:** posição vazia do LF final.

**Cobertura:** 262/262 posições, contíguas e sem overlap.

## 15. Autoauditoria pós-correção

- Fonte integral: byte-a-byte exata com `3e750df20bdfb54c56202916191ef04eeafc9e9e` (exceto LF terminal fora do fence).
- `.skip`, `.only`, `xit`, `xdescribe`, TODO/FIXME: nenhum.
- Três testes exercitam implementações reais; nenhuma função `simulate*` permanece.
- Package/workflow SHAs stale foram revalidados nos blobs atuais.
- 106-001 e 106-002 possuem prova executável verde.
- A unidade deve voltar para auditoria PRIMARY + ADVERSARIAL independente; esta correção não autoatribui decisão distribuída final.

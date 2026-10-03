# Bíblia técnica — tests/unit/content-manga/button-ui-real.test.js

> **Estado documental:** 🟡 CORRIGIDA após PRIMARY+ADVERSARIAL — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `a82baea685c1b325e8b21a9a914ef405a142ef97`  
> **Agente responsável:** AGENTE 7  
> **Tipo:** suíte Jest unitária/comportamental que carrega a implementação real de `content_manga.js` em JSDOM  
> **Linhas textuais:** 440  
> **Posições documentais:** 441, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Este arquivo é a suíte focal do botão flutuante e de suas interações básicas no content script de mangá.

Ele não contém uma implementação espelho do botão. Em vez disso, chama `loadContentScript()`, que carrega, via `jest.isolateModules()`, a cadeia real de módulos de conteúdo e por fim `extension/content/content_manga.js`. Assim, as assertions desta suíte exercitam a implementação real do runtime JavaScript, porém dentro de um ambiente JSDOM com APIs do Chrome e geometria de layout simuladas.

A suíte cobre quatro grupos principais:

1. criação/estrutura do botão flutuante;
2. mensagens `ENABLE_PAGE` e `SET_SELECTED_IMAGES`;
3. restauração/persistência de `btnPos`;
4. drag, proteção contra clique pós-drag e resize.

Ela é uma prova unitária forte da lógica de DOM/estado do content script, mas **não é um teste de renderização em Chromium real**.

## 2. Dependências reais

### 2.1 Node/Jest

- `path`: resolve os helpers a partir da raiz do repositório;
- `crypto.webcrypto`: exposto em `global.crypto` para dependências do content script;
- `TextEncoder`: exposto em `global.TextEncoder`;
- `fs`: importado na linha 2, mas não consumido por esta suíte.

### 2.2 Helpers do projeto

- `tests/helpers/repo-root.js`: encontra a raiz subindo diretórios até localizar `extension/manifest.json`;
- `tests/helpers/load-content-script.js`: prepara JSDOM, storage, imagens e carrega os módulos reais na ordem da extensão;
- `tests/mocks/chrome-api.mock.js`: fornece os mocks de `chrome.runtime`, `chrome.storage.local` e demais APIs.

### 2.3 Implementação realmente exercitada

O helper carrega, nesta ordem:

1. `extension/shared/gtc-fingerprint.js`;
2. `extension/content/cm-gtc-client.js`;
3. `extension/content/cm-dom-replace.js`;
4. `extension/content/cm-chapter.js`;
5. `extension/content/cm-auto-restore.js`;
6. `extension/content/content_manga.js`.

Portanto, quando esta suíte cria o botão, envia `ENABLE_PAGE`, altera seleção ou dispara eventos de mouse, o código de produção executado é o real do content script.

## 3. Ambiente de execução e limites

O projeto Jest `content-scripts` usa `testEnvironment: 'jsdom'` e inclui `tests/unit/content-manga/**/*.test.js`.

O `package.json` inclui esse projeto em `npm run test:unit` e o runner `scripts/ci/run-jest-ci.js` também inventaria os testes unitários/integrados no fluxo `npm run test:ci`.

Limites importantes:

- JSDOM não faz layout real;
- `offsetWidth`, `offsetHeight` e `getBoundingClientRect()` são artificialmente definidos por `defineButtonMetrics()` nos testes de drag/resize;
- eventos de mouse são sintéticos;
- `chrome.storage.local` e `chrome.runtime` são mocks do projeto;
- logo, o que fica diretamente provado é a **lógica JavaScript e as mutações DOM/style**, não pixel rendering, hit-testing ou peculiaridades de um Chromium real.

## 4. Helpers locais

### 4.1 `delay(ms)` — linhas 18–20

Cria uma Promise baseada em `setTimeout`. É usada para permitir que callbacks assíncronos do mock terminem antes das assertions.

### 4.2 `waitFor(assertion, ...)` — linhas 22–30

Faz polling a cada 10 ms por até 2 s, usando `performance.now()`. Retorna quando a função recebida produz valor truthy e falha explicitamente em timeout.

O helper é utilizado na persistência de `btnPos`, onde o write de storage pode ocorrer depois do `mouseup`.

### 4.3 `getContentListener(runtimeMock)` — linhas 32–38

Exige exatamente um listener de `chrome.runtime.onMessage`.

Invariante local:

```text
runtimeMock._messageListeners.length === 1
```

Se houver zero ou mais de um listener, o teste falha antes de simular a mensagem. Isso protege contra re-injeção/duplicação de listener no ambiente da suíte.

### 4.4 `dispatchToContent(...)` — linhas 40–55

Invoca diretamente o listener real do content script com um `sendResponse` controlado.

O retorno registrado possui:

- `keepAlive`: valor booleano retornado pelo listener;
- `response`: payload passado a `sendResponse`.

Para handlers síncronos, a Promise resolve imediatamente. Para um handler que devolva `true`, a Promise depende de o handler chamar `sendResponse`.

### 4.5 `defineButtonMetrics(btn)` — linhas 57–74

Substitui propriedades de geometria que JSDOM não calcula:

- `offsetWidth`;
- `offsetHeight`;
- `getBoundingClientRect()`.

A geometria deriva de `btn.style`, com defaults de 220×48. Isso permite testar a matemática de drag/resize da implementação real sem depender de layout nativo.

## 5. Lifecycle da suíte

### 5.1 `beforeEach` — linhas 80–91

Antes de cada caso:

- reseta módulos Jest;
- obtém runtime/storage mocks;
- zera listeners de mensagens/conexões;
- zera `runtime.lastError`;
- limpa storage;
- remove flags globais de injeção/fingerprint;
- recria `<head>` e `<body>`.

Objetivo: impedir que instâncias anteriores do IIFE ou estado de storage contaminem o próximo caso.

### 5.2 `afterEach` — linhas 93–99

Depois de cada caso:

- restaura spies/mocks Jest;
- limpa storage novamente;
- remove flags globais;
- restaura o DOM mínimo.

A suíte, portanto, assume independência entre os testes.

## 6. Cenários e provas diretas

### 6.1 Estrutura do botão — linhas 101–113

Carrega o content script real e prova:

- existência de `#manga-error-style`;
- existência de `#manga-translator-trigger`;
- existência de oito elementos `.manga-rsz`;
- drawer de erro posicionado com `bottom: 100%`.

**Classificação:** ✅ PROVADO DIRETAMENTE — implementação real em JSDOM.

A assertion de oito handles prova quantidade, mas não prova sozinha que o conjunto de direções seja exatamente `n,s,e,w,ne,nw,sw,se`.

### 6.2 `ENABLE_PAGE` idempotente — linhas 115–129

Com o botão já presente:

1. confirma exatamente um botão;
2. envia `ENABLE_PAGE`;
3. exige `{ success: true }`;
4. confirma que continua existindo exatamente um botão.

Isso prova a guarda de duplicação de `createTranslatorButton()` no caminho em que a página já está habilitada.

**Classificação:** ✅ PROVADO DIRETAMENTE para idempotência com botão existente.

Não prova a transição `ENABLE_PAGE` quando o botão está ausente.

### 6.3 Restauração de `btnPos` — linhas 131–153

Pré-carrega:

- top 33 px;
- left 44 px;
- width 260 px;
- height 72 px.

Depois da inicialização real, verifica os quatro estilos.

**Classificação:** ✅ PROVADO DIRETAMENTE — implementação real + storage mock.

### 6.4 Clamp de altura persistida e texto em linha única — linhas 155–178

Pré-carrega `height: 1200px` e `width: 90px`.

A implementação real limita a altura salva a `BUTTON_MAX_HEIGHT = 96` e o teste exige:

- `height === '96px'`;
- `whiteSpace === 'nowrap'`;
- `textOverflow === 'ellipsis'`;
- label contendo `TRADUZIR PÁGINAS`.

**Classificação:** ✅ PROVADO DIRETAMENTE para clamp de altura e estilos inline.

A largura visual mínima final em browser não é medida aqui; JSDOM não realiza layout CSS real.

### 6.5 `SET_SELECTED_IMAGES` — linhas 180–196

Envia dois índices ao handler real.

Prova:

- resposta `{ success: true }`;
- label alterado para conter `TRADUZIR 2 PÁGINAS`.

**Classificação:** ✅ PROVADO DIRETAMENTE.

### 6.6 Drag + persistência — linhas 198–239

Fluxo:

1. carrega a UI;
2. instala métricas sintéticas;
3. `mousedown` em (10,20);
4. `mousemove` para (60,90);
5. `mouseup`;
6. aguarda `btnPos.left === '50px'`;
7. verifica posição DOM e objeto persistido.

A matemática esperada é:

- Δx = +50;
- Δy = +70;
- left = 50 px;
- top = 70 px.

Storage esperado:

```json
{
  "top": "70px",
  "left": "50px",
  "width": "220px",
  "height": ""
}
```

**Classificação:** ✅ PROVADO DIRETAMENTE para lógica JS e write no storage mock.

### 6.7 Movimento ≤2 px não persiste — linhas 241–270

Move de (10,10) para (11,12), portanto variações ≤2 px.

Depois do `mouseup`, espera 50 ms e exige que `btnPos` continue ausente.

Isso corresponde ao gate da implementação que persiste somente quando alguma diferença é `> 2`.

**Classificação:** ✅ PROVADO DIRETAMENTE.

### 6.8 Clique após drag >5 px não inicia lote — linhas 272–308

Espiona `chrome.runtime.sendMessage`, faz drag de (10,10) para (40,40), emite `mouseup` e em seguida um `click` no mesmo ponto final.

Depois de 100 ms exige que nenhuma chamada tenha `action === 'START_BATCH'`.

Isso prova a guarda:

```js
if (Math.abs(e.clientX - dragStartX) > 5 ||
    Math.abs(e.clientY - dragStartY) > 5) return;
```

**Classificação:** ✅ PROVADO DIRETAMENTE — comportamento negativo da implementação real, com runtime mock.

### 6.9 Resize leste — linhas 310–356

Parte de 220×48.

Primeiro movimento:

- x 100 → 150;
- largura esperada 270 px.

Segundo movimento extremo para x=-500:

- largura não pode cair abaixo do mínimo;
- assertion exige 130 px.

Prova `BUTTON_MIN_WIDTH = 130` no branch leste.

**Classificação:** ✅ PROVADO DIRETAMENTE.

### 6.10 Resize oeste — linhas 358–390

Parte de left=100, width=220.

Mover a borda oeste +30 px deve:

- reduzir width para 190 px;
- mover left para 130 px.

Isso prova que a borda oposta permanece ancorada ao reduzir pela esquerda.

**Classificação:** ✅ PROVADO DIRETAMENTE.

### 6.11 Resize sul e sudeste — linhas 392–439

Primeiro, tenta reduzir a altura abaixo do mínimo via handle `s`; exige 48 px.

Depois usa `se` e move +40/+40:

- width = 260 px;
- height = 88 px.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 7. Relação com a implementação real

Os testes correspondem diretamente a trechos de `createTranslatorButton()` em `extension/content/content_manga.js`:

- early-return quando o botão já existe;
- construção do drawer/static part/main content;
- criação dos oito handles;
- listeners de `mousedown/mousemove/mouseup`;
- limiar de persistência de 2 px;
- limiar de clique pós-drag de 5 px;
- mínimos 130×48;
- máximo de altura 96;
- restauração assíncrona de `btnPos`;
- handlers `SET_SELECTED_IMAGES` e `ENABLE_PAGE`.

A suíte usa o conteúdo real do arquivo, não uma cópia dessas funções.

## 8. Matriz de evidência

| Propriedade | Evidência neste arquivo | Classificação |
|---|---|---|
| botão é criado | DOM após `loadContentScript` | ✅ PROVADO DIRETAMENTE |
| style de erro é criado | `#manga-error-style` | ✅ PROVADO DIRETAMENTE |
| existem 8 handles | `querySelectorAll('.manga-rsz')` | ✅ PROVADO DIRETAMENTE |
| conjunto exato de direções dos 8 handles | apenas contagem; quatro direções exercitadas | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| drawer fica acima do botão | style.bottom == 100% | ✅ PROVADO DIRETAMENTE |
| `ENABLE_PAGE` não duplica botão existente | contagem 1 → mensagem → contagem 1 | ✅ PROVADO DIRETAMENTE |
| `ENABLE_PAGE` recria/cria quando ausente | cenário não existe aqui | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `btnPos` válido é restaurado | quatro styles | ✅ PROVADO DIRETAMENTE |
| altura persistida >96 é limitada | 1200 → 96 | ✅ PROVADO DIRETAMENTE |
| texto do botão não quebra em coluna | nowrap + ellipsis | ✅ PROVADO DIRETAMENTE |
| seleção de 2 páginas atualiza label | mensagem real + textContent | ✅ PROVADO DIRETAMENTE |
| drag altera posição e persiste | DOM + storage | ✅ PROVADO DIRETAMENTE |
| movimento ≤2 não persiste | storage continua vazio | ✅ PROVADO DIRETAMENTE |
| drag >5 bloqueia início de lote | ausência de START_BATCH | ✅ PROVADO DIRETAMENTE |
| resize leste | width 270 e mínimo 130 | ✅ PROVADO DIRETAMENTE |
| resize oeste | width + left compensado | ✅ PROVADO DIRETAMENTE |
| resize sul | mínimo vertical 48 | ✅ PROVADO DIRETAMENTE |
| resize sudeste | width/height simultâneos | ✅ PROVADO DIRETAMENTE |
| resize norte | sem cenário | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| resize nordeste | sem cenário | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| resize noroeste | sem cenário | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| resize sudoeste | sem cenário | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| cap superior de resize em 96/viewport | não exercitado por resize | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| rendering real em Chromium | esta suíte executa somente em JSDOM; não há browser Chromium aqui | ⚠️ NÃO PROVADO NESTA SUÍTE / fora do escopo da evidência JSDOM |

## 9. Invariantes observáveis

1. deve haver exatamente um listener de conteúdo durante `dispatchToContent`;
2. `createTranslatorButton()` não duplica `#manga-translator-trigger`;
3. persistência de posição/tamanho ocorre somente quando delta >2 px;
4. um click separado de seu `mousedown` por >5 px em X ou Y não inicia tradução;
5. largura nunca deve cair abaixo de 130 px pelos branches exercitados;
6. altura nunca deve cair abaixo de 48 px;
7. altura persistida acima de 96 px é limitada a 96 px;
8. handle oeste precisa ajustar `left` ao mudar a largura;
9. `SET_SELECTED_IMAGES` deve refletir a cardinalidade no texto;
10. storage e DOM são zerados entre casos.

## 10. Casos-limite cobertos

- estado persistido com altura absurdamente grande;
- movimento mínimo de 1×2 px;
- drag grande seguido de click;
- resize leste extremamente negativo;
- resize sul extremamente negativo;
- resize diagonal;
- chamada repetida de `ENABLE_PAGE`.

## 11. Casos-limite não provados por esta suíte

- todos os handles norte/cantos;
- resize acima do máximo vertical;
- viewport muito pequeno durante resize;
- pointer/touch events;
- botão criado por `ENABLE_PAGE` quando estava ausente;
- botão com `floatingButtonEnabled=false` no momento de `ENABLE_PAGE`;
- perda/recriação automática pelo watchdog;
- layout real, CSS computed style e hit-testing em Chromium.

Alguns desses comportamentos possuem cobertura em outras suítes, especialmente `floating-button-guard-and-single-click.test.js`; isso não transforma ausência de assertion neste arquivo em prova local.

## 12. Solicitações ao auditor

### 195-001 — TEST_REQUIRED — ACCEPTED

**Encontrado:** os testes de resize exercitam somente `e`, `w`, `s` e `se`. Os handles `n`, `ne`, `nw` e `sw` são apenas contados indiretamente pelo total de oito.

**Evidência atual:** linhas 310–439 validam leste, oeste, sul e sudeste; a implementação real possui branches baseados em `d.includes('n'|'s'|'e'|'w')`.

**Evidência ausente:** top compensation no norte, combinação norte+oeste/leste, sudoeste, conjunto exato de `data-dir` e cap superior de altura durante resize.

**Necessário:** adicionar, em alteração separada, cenários focais usando o mesmo content script real para `n/ne/nw/sw`, além de assertion do conjunto exato das oito direções e do limite superior de altura.

**Risco:** uma regressão em metade das direções pode permanecer verde enquanto a contagem de handles continua sendo oito.

**Severidade:** NORMAL.

### 195-002 — TEST_REQUIRED — ACCEPTED

**Encontrado:** o caso de `ENABLE_PAGE` começa com o botão já criado e prova apenas idempotência.

**Evidência atual:** linhas 115–129 confirmam 1 botão antes e depois de `ENABLE_PAGE`.

**Evidência ausente:** transição em que a página/listener existe, o botão está ausente e `ENABLE_PAGE` precisa realmente criá-lo; também não há prova local do comportamento com `floatingButtonEnabled=false`.

**Necessário:** adicionar teste separado que parta de estado sem botão e prove o comportamento decidido do handler real ao receber `ENABLE_PAGE`, sem copiar a lógica.

**Risco:** o caminho de criação por mensagem pode quebrar e o teste atual continuar verde por já existir botão antes da mensagem.

**Severidade:** NORMAL.

### 195-003 — TRACEABILITY_REVIEW — ACCEPTED

**Encontrado:** o `describe` declara coletivamente `CM-29` até `CM-50`, mas nenhum caso individual identifica qual marker está provando; busca no repositório encontrou esses markers somente no título desta suíte.

**Evidência atual:** há assertions reais e fortes para diversos comportamentos, porém não existe relação verificável marker → teste/assertion.

**Evidência ausente:** mapa explícito dos 22 IDs para os cenários correspondentes, inclusive indicação de IDs hoje sem prova específica.

**Necessário:** documentar o mapeamento ou mover os markers para os testes que realmente os provam; markers não sustentados devem ser reclassificados.

**Risco:** a presença do título agregado pode ser interpretada como cobertura integral de CM-29…CM-50 mesmo que um comportamento histórico específico deixe de ser exercitado.

**Severidade:** NORMAL.

## 13. Cobertura documental por linhas

| Faixa | Conteúdo e função |
|---|---|
| 1–4 | imports Node: path, fs, crypto, TextEncoder |
| 5–7 | resolução da raiz do repositório |
| 8–13 | instalação de crypto/TextEncoder globais |
| 14–16 | imports de loader e mocks |
| 17–20 | helper `delay` |
| 21–30 | polling `waitFor` e timeout |
| 31–38 | validação do listener único |
| 39–55 | dispatcher de mensagens para o listener real |
| 56–74 | geometria sintética do botão |
| 75–79 | abertura da suíte e variáveis compartilhadas |
| 80–91 | preparação isolada de cada teste |
| 92–99 | limpeza pós-teste |
| 100–113 | estrutura inicial do botão |
| 114–129 | idempotência de `ENABLE_PAGE` |
| 130–153 | restauração normal de `btnPos` |
| 154–178 | clamp de altura e estilos de texto |
| 179–196 | `SET_SELECTED_IMAGES` |
| 197–239 | drag e persistência |
| 240–270 | limiar de 2 px para persistência |
| 271–308 | proteção contra click após drag |
| 309–356 | resize leste e largura mínima |
| 357–390 | resize oeste e compensação de left |
| 391–439 | resize sul e sudeste |
| 440 | fechamento do `describe` |
| 441 | newline final do arquivo |

As faixas são contíguas e cobrem todas as posições do fonte auditado.

## 14. Fonte integral auditada

```js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { TextEncoder } = require('util');

const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = 2000, interval = 10 } = {}) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condicao');
}

function getContentListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    if (listeners.length !== 1) {
        throw new Error(`Esperava 1 listener do content_manga, recebi ${listeners.length}`);
    }
    return listeners[0];
}

function dispatchToContent(runtimeMock, request, sender = { tab: { id: 1 } }) {
    return new Promise((resolve) => {
        let settled = false;
        let keepAlive = false;

        const sendResponse = (response) => {
            settled = true;
            resolve({ keepAlive, response });
        };

        keepAlive = getContentListener(runtimeMock)(request, sender, sendResponse);
        if (keepAlive !== true && !settled) {
            resolve({ keepAlive, response: undefined });
        }
    });
}

function defineButtonMetrics(btn) {
    Object.defineProperty(btn, 'offsetWidth', {
        get: () => parseFloat(btn.style.width) || 220,
        configurable: true,
    });
    Object.defineProperty(btn, 'offsetHeight', {
        get: () => parseFloat(btn.style.height) || 48,
        configurable: true,
    });
    btn.getBoundingClientRect = () => ({
        left: parseFloat(btn.style.left) || 0,
        top: parseFloat(btn.style.top) || 0,
        width: parseFloat(btn.style.width) || 220,
        height: parseFloat(btn.style.height) || 48,
        right: (parseFloat(btn.style.left) || 0) + (parseFloat(btn.style.width) || 220),
        bottom: (parseFloat(btn.style.top) || 0) + (parseFloat(btn.style.height) || 48),
    });
}

describe('CM-29/CM-30/CM-31/CM-32/CM-33/CM-34/CM-35/CM-36/CM-37/CM-38/CM-39/CM-40/CM-41/CM-42/CM-43/CM-44/CM-45/CM-46/CM-47/CM-48/CM-49/CM-50: content_manga.js - botao e interacoes reais', () => {
    let runtimeMock;
    let storageMock;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('createTranslatorButton cria style, botao e os 8 handles de resize', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        expect(document.getElementById('manga-error-style')).toBeTruthy();
        expect(document.getElementById('manga-translator-trigger')).toBeTruthy();
        expect(document.querySelectorAll('.manga-rsz')).toHaveLength(8);
        expect(document.getElementById('manga-error-drawer-container').style.bottom).toBe('100%');
    });

    test('ENABLE_PAGE e idempotente e nao duplica o botao', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        expect(document.querySelectorAll('#manga-translator-trigger')).toHaveLength(1);

        const result = await dispatchToContent(runtimeMock, { action: 'ENABLE_PAGE' });

        expect(result.response).toEqual({ success: true });
        expect(document.querySelectorAll('#manga-translator-trigger')).toHaveLength(1);
    });

    test('aplica btnPos salvo no storage quando a pagina inicializa', async () => {
        await storageMock.set({
            btnPos: {
                top: '33px',
                left: '44px',
                width: '260px',
                height: '72px',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const btn = document.getElementById('manga-translator-trigger');
        expect(btn.style.top).toBe('33px');
        expect(btn.style.left).toBe('44px');
        expect(btn.style.width).toBe('260px');
        expect(btn.style.height).toBe('72px');
    });

    test('limita altura salva exagerada do botao flutuante e impede texto quebrando em coluna', async () => {
        await storageMock.set({
            btnPos: {
                top: '10px',
                left: '20px',
                width: '90px',
                height: '1200px',
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const btn = document.getElementById('manga-translator-trigger');
        const mainContent = document.getElementById('manga-main-content');
        expect(btn.style.height).toBe('96px');
        expect(mainContent.style.whiteSpace).toBe('nowrap');
        expect(mainContent.style.textOverflow).toBe('ellipsis');
        expect(mainContent.innerHTML).toContain('TRADUZIR PÁGINAS');
    });

    test('SET_SELECTED_IMAGES atualiza o texto do botao para a contagem recebida', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                { src: 'http://localhost/page-1.png', width: 800, height: 1200 },
            ],
        });

        const result = await dispatchToContent(runtimeMock, {
            action: 'SET_SELECTED_IMAGES',
            indices: [0, 1],
        });

        expect(result.response).toEqual({ success: true });
        expect(document.getElementById('manga-main-content').textContent).toContain('TRADUZIR 2 PÁGINAS');
    });

    test('drag do botao move a posicao e persiste btnPos no storage', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const btn = document.getElementById('manga-translator-trigger');
        const mainContent = document.getElementById('manga-main-content');
        defineButtonMetrics(btn);

        mainContent.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 10,
            clientY: 20,
        }));

        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 60,
            clientY: 90,
        }));

        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        await waitFor(async () => {
            const data = await storageMock.get(['btnPos']);
            return data.btnPos && data.btnPos.left === '50px';
        });

        const data = await storageMock.get(['btnPos']);
        expect(btn.style.left).toBe('50px');
        expect(btn.style.top).toBe('70px');
        expect(data.btnPos).toEqual({
            top: '70px',
            left: '50px',
            width: '220px',
            height: '',
        });
    });

    test('movimento de ate 2px nao persiste btnPos no storage', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const btn = document.getElementById('manga-translator-trigger');
        const mainContent = document.getElementById('manga-main-content');
        defineButtonMetrics(btn);

        mainContent.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 10,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 11,
            clientY: 12,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        await delay(50);

        const data = await storageMock.get(['btnPos']);
        expect(data.btnPos).toBeUndefined();
    });

    test('clique apos arrastar mais de 5px nao inicia traducao', async () => {
        const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const btn = document.getElementById('manga-translator-trigger');
        const mainContent = document.getElementById('manga-main-content');
        defineButtonMetrics(btn);

        mainContent.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 10,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 40,
            clientY: 40,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        mainContent.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            clientX: 40,
            clientY: 40,
        }));

        await delay(100);

        expect(sendMessageSpy.mock.calls.some(([message]) =>
            message && message.action === 'START_BATCH'
        )).toBe(false);
    });

    test('resize east aumenta a largura e respeita a largura minima', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const btn = document.getElementById('manga-translator-trigger');
        btn.style.left = '0px';
        btn.style.top = '0px';
        btn.style.width = '220px';
        btn.style.height = '48px';
        defineButtonMetrics(btn);

        const eastHandle = document.querySelector('.manga-rsz[data-dir="e"]');

        eastHandle.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 100,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 150,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        expect(btn.style.width).toBe('270px');

        eastHandle.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 150,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: -500,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        expect(parseFloat(btn.style.width)).toBe(130);
    });

    test('resize west reduz largura e desloca left para compensar', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const btn = document.getElementById('manga-translator-trigger');
        btn.style.left = '100px';
        btn.style.top = '0px';
        btn.style.width = '220px';
        btn.style.height = '48px';
        defineButtonMetrics(btn);

        const westHandle = document.querySelector('.manga-rsz[data-dir="w"]');

        westHandle.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 100,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 130,
            clientY: 10,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        expect(btn.style.width).toBe('190px');
        expect(btn.style.left).toBe('130px');
    });

    test('resize south respeita altura minima de 48px e diagonal se altera largura e altura', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const btn = document.getElementById('manga-translator-trigger');
        btn.style.left = '0px';
        btn.style.top = '0px';
        btn.style.width = '220px';
        btn.style.height = '48px';
        defineButtonMetrics(btn);

        const southHandle = document.querySelector('.manga-rsz[data-dir="s"]');
        southHandle.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 20,
            clientY: 48,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 20,
            clientY: -500,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        expect(parseFloat(btn.style.height)).toBe(48);

        const seHandle = document.querySelector('.manga-rsz[data-dir="se"]');
        seHandle.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 220,
            clientY: 48,
        }));
        document.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 260,
            clientY: 88,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        expect(btn.style.width).toBe('260px');
        expect(btn.style.height).toBe('88px');
    });
});
```

## 15. Conclusão

A suíte #195 é uma prova comportamental real e relevante da lógica do botão flutuante: ela carrega o content script verdadeiro, possui assertions específicas e cobre criação, estado, persistência, drag e quatro direções de resize.

A principal limitação probatória não é autenticidade da implementação, e sim **cobertura incompleta de alguns branches** e o fato de a geometria ser simulada sob JSDOM.

As três solicitações ao auditor registradas acima estão **ACCEPTED** no state canônico: permanecem lacunas/dívida externa reconhecida, mas não requests OPEN. Elas não transformam a execução JSDOM em prova de rendering Chromium.

> **Correção pós-adversarial:** 195-001/002/003 estão ACCEPTED; a suíte prova lógica JavaScript/mutações DOM sob JSDOM, mas rendering, layout, hit-testing e pixel behavior em Chromium real permanecem explicitamente NÃO PROVADOS por este arquivo.

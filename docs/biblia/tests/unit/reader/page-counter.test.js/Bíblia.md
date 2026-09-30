# Bíblia técnica — tests/unit/reader/page-counter.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `cec252ffefc25ee643b0227926ec6780a59ac272`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest/jsdom do contador real do reader  
> **Linhas textuais:** 169  
> **Posições documentais:** 170, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte testa o contador de página e a barra de progresso de `extension/reader/reader.js` carregando `reader.html` e `reader.js` reais.

Ela valida o caminho principal baseado em `IntersectionObserver`, inclusive o estado agregado de razões de visibilidade entre callbacks.

## 2. Harness

O teste substitui `window.IntersectionObserver` por um mock que captura os callbacks registrados.

O reader real cria:
1. observer de contador;
2. observer de lazy load;
3. observer de unload.

Como o observer do contador é criado no topo do módulo, `observerCallbacks[0]` corresponde ao callback auditado.

Cada teste limpa storage/DOM e injeta capítulo próprio.

## 3. Inicialização e progresso

Com 5 páginas:

- são criados 5 `.reader-page-wrap`;
- contador começa em `1 / 5`;
- barra começa em `20%`.

Quando página 3 tem maior ratio:
- contador vira `3 / 5`;
- barra vira `60%`.

Quando página 5 domina:
- contador vira `5 / 5`;
- barra vira `100%`.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 4. Empate

Com duas páginas em ratio 0.5, o resultado permanece `1 / 2`.

Isso corresponde ao código real:

```js
if (ratio > maxRatio)
```

e não `>=`.

A primeira entrada que estabelece o máximo permanece vencedora no empate.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 5. Estado global entre callbacks

O teste mais importante da suíte prova que o callback do IntersectionObserver não é tratado como snapshot completo.

Primeiro:
- página 9 = 0.6;
- página 10 = 0.9;
- contador = `10 / 10`.

Depois chega callback contendo apenas página 9 com 0.7.

O contador permanece `10 / 10`, porque `pageVisibilityRatios` mantém a razão 0.9 da página 10 até receber atualização explícita dela.

Isso protege contra callbacks parciais do browser.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 6. Capítulo vazio

Com zero imagens:
- contador = `0 / 0`;
- aparece `Nenhuma imagem salva neste capítulo.`.

O HTML inicial define a barra em `width:0%`, e o branch vazio retorna antes de `updateCounter`.

A suíte não faz assertion explícita da largura da barra nesse caso.

## 7. Caminho de scroll/resize fora do escopo atual

Além do IntersectionObserver, `reader.js` possui:

- `updateCounterFromViewportCenter()`;
- `scheduleCounterFromViewport()`;
- listeners de `scroll` e `resize`;
- seleção da página visível cujo centro está mais próximo do centro da viewport.

Nenhum teste localizado chama esse caminho com `getBoundingClientRect()` controlado.

Assim, esta suíte não prova o fallback de sincronização por viewport.

## 8. isIntersecting=false

O observer real faz:

```js
pageVisibilityRatios.set(
  idx,
  entry.isIntersecting === false ? 0 : entry.intersectionRatio
)
```

A suíte usa `isIntersecting:true` no teste global e omite o campo em outros casos.

Não há caso em que uma página dominante recebe `isIntersecting:false` e deve perder sua posição.

## 9. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| reader real carregado | loadExtensionPage | ✅ PROVADO DIRETAMENTE |
| cria N wrappers | teste 1 | ✅ PROVADO DIRETAMENTE |
| inicializa 1/N | teste 1 | ✅ PROVADO DIRETAMENTE |
| barra inicial 20% em 1/5 | teste 1 | ✅ PROVADO DIRETAMENTE |
| escolhe maior ratio | teste 1 | ✅ PROVADO DIRETAMENTE |
| atualiza 3/5 → 60% | teste 1 | ✅ PROVADO DIRETAMENTE |
| atualiza 5/5 → 100% | teste 1 | ✅ PROVADO DIRETAMENTE |
| empate mantém primeiro | teste 2 | ✅ PROVADO DIRETAMENTE |
| callbacks parciais preservam estado global | teste 3 | ✅ PROVADO DIRETAMENTE |
| capítulo vazio mostra 0/0 + mensagem | teste 4 | ✅ PROVADO DIRETAMENTE |
| isIntersecting=false zera ratio anterior | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback scroll/resize pelo centro da viewport | sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| barra vazia permanece 0% | HTML garante inicialmente; sem assertion | 🟨 EVIDÊNCIA ESTRUTURAL |

## 10. Solicitações ao auditor

### 223-001 — TEST_REQUIRED — OPEN

**Encontrado:** o caminho `updateCounterFromViewportCenter()/scheduleCounterFromViewport` não possui teste focal localizado.

**Evidência atual:** IntersectionObserver é amplamente coberto.

**Evidência ausente:** eventos `scroll/resize`, coalescência por `requestAnimationFrame` e seleção por centro da viewport.

**Ação solicitada:** criar teste contra reader real controlando `getBoundingClientRect`, `innerHeight` e RAF.

**Evidência esperada:** página cujo centro está mais próximo da viewport atualiza contador; wrappers fora da viewport são ignorados.

**Risco:** fallback por scroll/resize pode regredir com toda a suíte atual verde.

**Severidade:** NORMAL.

### 223-002 — TEST_REQUIRED — OPEN

**Encontrado:** não há caso em que uma página anteriormente dominante recebe `isIntersecting:false`.

**Evidência atual:** persistência entre callbacks parciais é provada.

**Evidência ausente:** remoção explícita da dominância via ratio efetivo zero.

**Ação solicitada:** simular winner anterior saindo da viewport e outra página permanecendo visível.

**Evidência esperada:** contador migra para a próxima maior razão.

**Risco:** regressão na limpeza de ratios pode deixar contador preso em página fora da viewport.

**Severidade:** NORMAL.

### 223-003 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** capítulo vazio verifica `0 / 0` e mensagem, mas não a barra `read-progress-fill`.

**Evidência atual:** CSS inicial define 0%.

**Ação solicitada:** adicionar assertion `fillEl.style.width === '0%'` ou equivalente computado, se esse estado visual fizer parte do contrato.

**Risco:** baixo; uma mudança futura pode mostrar progresso residual visualmente incorreto.

**Severidade:** LOW.

## 11. Fonte integral auditada

```js
/**
 * page-counter.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa o contador de páginas e a barra de leitura em tempo real do reader.js real.
 */

const { loadExtensionPage, flushAsyncTasks } = require('../../helpers/load-extension-page.js');
const { getStorageMock } = require('../../mocks/chrome-api.mock.js');

describe('RD-20/RD-21/RD-22: reader.js - Contador de Página e Progresso Real', () => {
    let storageMock;
    let observerCallbacks;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        await storageMock.clear();
        localStorage.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';

        observerCallbacks = [];
        window.IntersectionObserver = jest.fn().mockImplementation((cb) => {
            observerCallbacks.push(cb);
            return {
                observe: jest.fn(),
                unobserve: jest.fn(),
                disconnect: jest.fn(),
            };
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('inicializa contador 1 / N e atualiza via callback real do IntersectionObserver', async () => {
        await storageMock.set({
            chapterList: [{ id: 'chap_count', title: 'Chapter Counter' }],
            chap_count_images: {
                0: 'data:image/png;base64,P0',
                1: 'data:image/png;base64,P1',
                2: 'data:image/png;base64,P2',
                3: 'data:image/png;base64,P3',
                4: 'data:image/png;base64,P4',
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_count',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(6);

        const counterEl = document.getElementById('page-counter');
        const fillEl = document.getElementById('read-progress-fill');
        const pageWraps = document.querySelectorAll('.reader-page-wrap');

        expect(pageWraps).toHaveLength(5);
        expect(counterEl.textContent).toBe('1 / 5');
        expect(fillEl.style.width).toBe('20%');
        const counterObserverCallback = observerCallbacks[0];
        expect(typeof counterObserverCallback).toBe('function');

        // Simula scroll: página 3 (índice 2) fica mais visível
        counterObserverCallback([
            { target: pageWraps[0], intersectionRatio: 0.1 },
            { target: pageWraps[2], intersectionRatio: 0.85 },
            { target: pageWraps[1], intersectionRatio: 0.3 },
        ]);

        expect(counterEl.textContent).toBe('3 / 5');
        expect(fillEl.style.width).toBe('60%');

        // Simula scroll até a última página (índice 4)
        counterObserverCallback([
            { target: pageWraps[4], intersectionRatio: 0.95 },
        ]);

        expect(counterEl.textContent).toBe('5 / 5');
        expect(fillEl.style.width).toBe('100%');
    });

    test('quando múltiplos itens têm mesmo ratio, seleciona o primeiro com ratio > maxRatio', async () => {
        await storageMock.set({
            chapterList: [{ id: 'chap_equal', title: 'Equal Ratios' }],
            chap_equal_images: {
                0: 'data:image/png;base64,P0',
                1: 'data:image/png;base64,P1',
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_equal',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(6);

        const counterEl = document.getElementById('page-counter');
        const pageWraps = document.querySelectorAll('.reader-page-wrap');
        const counterObserverCallback = observerCallbacks[0];
        expect(typeof counterObserverCallback).toBe('function');

        counterObserverCallback([
            { target: pageWraps[0], intersectionRatio: 0.5 },
            { target: pageWraps[1], intersectionRatio: 0.5 },
        ]);

        expect(counterEl.textContent).toBe('1 / 2');
    });

    test('mantem a pagina globalmente mais visivel quando callback seguinte traz apenas outra pagina', async () => {
        await storageMock.set({
            chapterList: [{ id: 'chap_visibility', title: 'Visibility' }],
            chap_visibility_images: Object.fromEntries(
                Array.from({ length: 10 }, (_unused, index) => [index, `data:image/png;base64,P${index}`])
            ),
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_visibility',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(6);

        const counterEl = document.getElementById('page-counter');
        const pageWraps = document.querySelectorAll('.reader-page-wrap');
        const counterObserverCallback = observerCallbacks[0];

        counterObserverCallback([
            { target: pageWraps[8], intersectionRatio: 0.6, isIntersecting: true },
            { target: pageWraps[9], intersectionRatio: 0.9, isIntersecting: true },
        ]);
        expect(counterEl.textContent).toBe('10 / 10');

        // O navegador pode emitir um callback subsequente contendo apenas a
        // página 9, mesmo enquanto a página 10 segue mais visível.
        counterObserverCallback([
            { target: pageWraps[8], intersectionRatio: 0.7, isIntersecting: true },
        ]);

        expect(counterEl.textContent).toBe('10 / 10');
    });

    test('trata capítulo com 0 imagens exibindo 0 / 0', async () => {
        await storageMock.set({
            chapterList: [{ id: 'chap_empty', title: 'Empty' }],
            chap_empty_images: {},
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_empty',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(6);

        const counterEl = document.getElementById('page-counter');
        const emptyMsg = document.getElementById('empty-msg');
        expect(counterEl.textContent).toBe('0 / 0');
        expect(emptyMsg.textContent).toContain('Nenhuma imagem salva');
    });
});
```

## 12. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–5 | cabeçalho |
| 7–8 | imports |
| 10–29 | describe/setup do IntersectionObserver |
| 31–33 | cleanup |
| 35–82 | inicialização + mudanças 1/5 → 3/5 → 5/5 |
| 84–111 | empate |
| 113–147 | persistência global entre callbacks |
| 149–168 | capítulo vazio |
| 169 | fecha describe |
| posição 170 | newline final |

## 13. Autoauditoria do AGENTE 17

- [x] reserva #223 criada e relida;
- [x] state próprio criado;
- [x] reader.js e reader.html reais inspecionados;
- [x] fonte integral incorporada;
- [x] 169 linhas + newline = 170 posições;
- [x] estado global de IntersectionObserver classificado corretamente;
- [x] caminho scroll/resize não foi promovido a prova;
- [x] três solicitações persistíveis identificadas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #223 prova de forma forte o contador baseado em IntersectionObserver, inclusive callbacks parciais; faltam o caminho de viewport/scroll e a saída explícita de um winner.

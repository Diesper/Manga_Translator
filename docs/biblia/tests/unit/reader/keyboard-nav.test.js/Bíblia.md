# Bíblia técnica — tests/unit/reader/keyboard-nav.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `0d64775426e24655f8fedcfaf0c7051b7996b3ff`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest/jsdom do reader real  
> **Linhas textuais:** 136  
> **Posições documentais:** 137, contando newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte testa a navegação por teclado do leitor offline carregando **`extension/reader/reader.html` e `extension/reader/reader.js` reais** por meio de `loadExtensionPage`.

Não há mirror local da lógica de teclado.

O contrato coberto é:
- ArrowRight/ArrowDown → scroll para frente em 88% da viewport;
- ArrowLeft/ArrowUp → scroll para trás em 88%;
- `f/F` → alternância fullscreen;
- Home → topo;
- End → final;
- tecla não mapeada → nenhum scroll.

## 2. Setup

A suíte:
- limpa storage/localStorage;
- substitui `window.scrollBy` e `scrollTo` por spies;
- fixa `window.innerHeight=800`;
- mocka `requestFullscreen` e `exitFullscreen`;
- injeta um capítulo realista com duas imagens;
- carrega reader.html + reader.js;
- drena tasks assíncronas.

Isso garante que o listener de teclado executado é o registrado pelo reader real.

## 3. Evidência por cenário

### Setas para frente

ArrowRight:
- chama `preventDefault`;
- chama `scrollBy({top:704, behavior:'smooth'})`.

ArrowDown:
- prova o mesmo deslocamento de +704.

### Setas para trás

ArrowLeft:
- chama `preventDefault`;
- chama `scrollBy({top:-704, behavior:'smooth'})`.

ArrowUp:
- prova o mesmo deslocamento negativo.

### Fullscreen

Com `document.fullscreenElement=null`, `f` chama `document.documentElement.requestFullscreen()`.

Com `fullscreenElement=document.documentElement`, `F` chama `document.exitFullscreen()`.

### Home/End

Home chama:
```js
window.scrollTo({top:0, behavior:'smooth'})
```

End chama:
```js
window.scrollTo({top:document.body.scrollHeight, behavior:'smooth'})
```

### Tecla não mapeada

`a`:
- não chama `preventDefault`;
- não chama `scrollBy`;
- não chama `scrollTo`.

## 4. Relação com reader.js

O bloco real de `reader.js` nas linhas atuais 103–123 implementa exatamente os branches testados.

A suíte portanto constitui prova direta do runtime JSDOM do reader.

## 5. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| reader real carregado | loadExtensionPage | ✅ PROVADO DIRETAMENTE |
| ArrowRight +88% | teste 1 | ✅ PROVADO DIRETAMENTE |
| ArrowDown +88% | teste 1 | ✅ PROVADO DIRETAMENTE |
| ArrowLeft -88% | teste 2 | ✅ PROVADO DIRETAMENTE |
| ArrowUp -88% | teste 2 | ✅ PROVADO DIRETAMENTE |
| requestFullscreen em f | teste 3 | ✅ PROVADO DIRETAMENTE |
| exitFullscreen em F | teste 3 | ✅ PROVADO DIRETAMENTE |
| Home topo | teste 4 | ✅ PROVADO DIRETAMENTE |
| End final | teste 4 | ✅ PROVADO DIRETAMENTE |
| tecla não mapeada não scrolla | teste 5 | ✅ PROVADO DIRETAMENTE |
| preventDefault em ArrowDown/ArrowUp/Home/End | implementação faz, mas suíte não verifica todos individualmente | 🟨 EXECUTADO SEM ASSERTION FOCAL |
| rejeição de requestFullscreen/exitFullscreen | implementação absorve com catch vazio; teste só resolve | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| API fullscreen ausente | não coberto | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| comportamento com foco em input/textarea/contenteditable | não coberto | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Solicitações ao auditor

### 222-001 — TEST_REQUIRED — OPEN

**Encontrado:** fullscreen é testado apenas com Promises resolvidas.

**Evidência atual:** request/exit corretos são chamados.

**Evidência ausente:** Promise rejeitada e API inexistente.

**Ação solicitada:** adicionar casos em que `requestFullscreen`/`exitFullscreen` rejeitam e, se browser sem API for considerado suportado, caso com método ausente.

**Risco:** uma rejeição ou API ausente pode produzir erro não observado ou comportamento diferente do esperado.

**Severidade:** NORMAL.

### 222-002 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** `preventDefault` é assertado em ArrowRight e ArrowLeft, mas não explicitamente em ArrowDown, ArrowUp, Home e End.

**Evidência atual:** scroll correto prova que os branches são executados.

**Evidência ausente:** preservação da prevenção do comportamento nativo em todos os atalhos.

**Ação solicitada:** fortalecer assertions de `defaultPrevented/preventDefault` para todos os atalhos que chamam `preventDefault`.

**Risco:** mudança futura pode manter o scroll customizado e reintroduzir simultaneamente o scroll nativo.

**Severidade:** LOW.

### 222-003 — UX_CONTRACT_REVIEW — OPEN

**Encontrado:** o listener global não filtra `input`, `textarea`, `select` ou `contenteditable`.

**Evidência atual:** reader atual é essencialmente de leitura e a suíte não cria controles editáveis.

**Evidência ausente:** decisão explícita se atalhos devem continuar ativos quando o foco estiver em controle editável presente/futuro.

**Ação solicitada:** revisar o contrato de foco; se atalhos devem ser suspensos em edição, implementar/testar em mudança separada.

**Risco:** futuros campos de busca/anotação podem perder teclas de navegação/edição.

**Severidade:** LOW.

## 7. Fonte integral auditada

```js
/**
 * keyboard-nav.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa a navegação por teclado do leitor offline usando reader.html e reader.js reais.
 */

const { loadExtensionPage, flushAsyncTasks } = require('../../helpers/load-extension-page.js');
const { getStorageMock } = require('../../mocks/chrome-api.mock.js');

describe('RD-14/RD-15/RD-16/RD-17/RD-18: reader.js - Navegação por Teclado Real', () => {
    let storageMock;
    let scrollBySpy;
    let scrollToSpy;
    let requestFullscreenSpy;
    let exitFullscreenSpy;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        await storageMock.clear();
        localStorage.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';

        scrollBySpy = jest.fn();
        scrollToSpy = jest.fn();
        window.scrollBy = scrollBySpy;
        window.scrollTo = scrollToSpy;
        window.innerHeight = 800;

        requestFullscreenSpy = jest.fn().mockResolvedValue();
        exitFullscreenSpy = jest.fn().mockResolvedValue();
        Element.prototype.requestFullscreen = requestFullscreenSpy;
        document.exitFullscreen = exitFullscreenSpy;
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            writable: true,
            value: null,
        });

        await storageMock.set({
            chapterList: [{ id: 'chap_nav', title: 'Test Nav' }],
            chap_nav_images: {
                0: 'data:image/png;base64,P0',
                1: 'data:image/png;base64,P1',
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/reader/reader.html',
            scriptPath: 'extension/reader/reader.js',
            url: 'https://extension.test/reader.html?id=chap_nav',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(6);
    });

    afterEach(() => {
        delete Element.prototype.requestFullscreen;
        delete document.exitFullscreen;
        jest.restoreAllMocks();
    });

    test('ArrowRight e ArrowDown avançam o scroll em 88% do viewport', () => {
        const eventRight = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
        const preventDefaultRight = jest.spyOn(eventRight, 'preventDefault');
        document.dispatchEvent(eventRight);

        expect(preventDefaultRight).toHaveBeenCalled();
        expect(scrollBySpy).toHaveBeenCalledWith({
            top: 800 * 0.88,
            behavior: 'smooth',
        });

        scrollBySpy.mockClear();
        const eventDown = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
        document.dispatchEvent(eventDown);

        expect(scrollBySpy).toHaveBeenCalledWith({
            top: 800 * 0.88,
            behavior: 'smooth',
        });
    });

    test('ArrowLeft e ArrowUp recuam o scroll em 88% do viewport', () => {
        const eventLeft = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
        const preventDefaultLeft = jest.spyOn(eventLeft, 'preventDefault');
        document.dispatchEvent(eventLeft);

        expect(preventDefaultLeft).toHaveBeenCalled();
        expect(scrollBySpy).toHaveBeenCalledWith({
            top: -(800 * 0.88),
            behavior: 'smooth',
        });

        scrollBySpy.mockClear();
        const eventUp = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
        document.dispatchEvent(eventUp);

        expect(scrollBySpy).toHaveBeenCalledWith({
            top: -(800 * 0.88),
            behavior: 'smooth',
        });
    });

    test('f ou F alterna tela cheia (requestFullscreen / exitFullscreen)', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
        expect(requestFullscreenSpy).toHaveBeenCalled();
        expect(exitFullscreenSpy).not.toHaveBeenCalled();

        requestFullscreenSpy.mockClear();
        document.fullscreenElement = document.documentElement;

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F' }));
        expect(exitFullscreenSpy).toHaveBeenCalled();
        expect(requestFullscreenSpy).not.toHaveBeenCalled();
    });

    test('Home rola para o topo e End rola para o final', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', cancelable: true }));
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

        scrollToSpy.mockClear();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', cancelable: true }));
        expect(scrollToSpy).toHaveBeenCalledWith({ top: document.body.scrollHeight, behavior: 'smooth' });
    });

    test('teclas não mapeadas não provocam scroll', () => {
        const eventA = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
        const preventDefaultA = jest.spyOn(eventA, 'preventDefault');
        document.dispatchEvent(eventA);

        expect(preventDefaultA).not.toHaveBeenCalled();
        expect(scrollBySpy).not.toHaveBeenCalled();
        expect(scrollToSpy).not.toHaveBeenCalled();
    });
});
```

## 8. Mapa integral por faixas

| Linhas | Papel |
|---:|---|
| 1–5 | cabeçalho |
| 7–8 | imports |
| 10–15 | describe e spies |
| 17–55 | beforeEach + reader real |
| 57–61 | cleanup |
| 63–82 | ArrowRight/ArrowDown |
| 83–102 | ArrowLeft/ArrowUp |
| 103–116 | fullscreen |
| 117–125 | Home/End |
| 126–135 | tecla não mapeada |
| 136 | fecha describe |
| posição 137 | newline final |

## 9. Autoauditoria do AGENTE 17

- [x] reserva #222 criada e relida;
- [x] state próprio criado;
- [x] reader.js real inspecionado;
- [x] helper de carregamento inspecionado;
- [x] fonte integral incorporada;
- [x] 136 linhas + newline = 137 posições;
- [x] assertions diretas separadas de branches apenas executados;
- [x] três solicitações externas registradas;
- [x] nenhum arquivo externo modificado.

**Resultado:** #222 prova diretamente os atalhos principais do reader real; faltam apenas branches de falha/robustez e decisões de UX de foco.

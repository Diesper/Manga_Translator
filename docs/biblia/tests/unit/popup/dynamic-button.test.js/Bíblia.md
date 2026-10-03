# Bíblia técnica — tests/unit/popup/dynamic-button.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `4f4dea1b48976a089fdb9f15a2d2579c34823ae7`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** teste Jest/jsdom do botão dinâmico do popup  
> **Linhas textuais:** 90  
> **Posições documentais:** 91, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte valida o comportamento do botão principal de tradução do popup conforme a seleção de imagens muda: estado inicial com duas imagens, seleção zero via “Nenhuma” e seleção unitária por clique em card.

Diferentemente de stubs que testam helpers extraídos, este arquivo usa `loadExtensionPage` para carregar:
- `extension/popup/popup.html` real;
- scripts anteriores ao alvo declarados no HTML;
- `extension/popup/popup.js` real;
- `DOMContentLoaded` controlado.

Assim, as assertions do botão exercitam a implementação real do popup dentro de JSDOM, com Chrome APIs simuladas.

## 2. Harness e dependências

Imports:
- `loadExtensionPage` e depois `flushAsyncTasks` de `tests/helpers/load-extension-page.js`;
- `getStorageMock` e `getTabsMock` de `tests/mocks/chrome-api.mock.js`.

`beforeEach`:
1. reseta módulos Jest;
2. recupera storage/tabs mocks;
3. limpa storage;
4. restaura DOM mínimo.

`afterEach` restaura mocks Jest.

O teste cria uma aba ativa `https://manga.test/ch1`, registra handler de mensagens e responde:
- `GET_PAGE_IMAGES` com duas páginas 800×1200;
- `SET_SELECTED_IMAGES` e `HIGHLIGHT_IMAGE` com sucesso.

Depois habilita `manga.test` no storage e carrega a página real do popup.

## 3. Implementação real relacionada

Em `extension/popup/popup.js`:

- `renderMainGrid()` limpa seleção, adiciona todos os índices e cria cada `.image-card.selected`;
- o click do card alterna presença do índice em `selectedIndices` e chama `updateSelection()`;
- `updateSelection()` define:
  - texto singular/plural de `#selection-count`;
  - `Traduzir N Página(s)` quando N > 0;
  - `Traduzir Selecionadas` quando N = 0;
  - `btnTranslate.disabled = (n === 0)`;
  - envia `SET_SELECTED_IMAGES`;
- `btn-select-none` remove todos os índices/classes e chama `updateSelection()`.

O teste usa exatamente esses elementos e eventos reais.

## 4. Cenário e assertions

### Fase A — estado inicial

Após oito rodadas de tasks:
- `btn-translate` existe;
- `selection-count` existe;
- contador contém “2 imagens selecionadas”;
- CTA é exatamente “Traduzir 2 Páginas”;
- botão não está disabled.

Essas assertions provam que as duas imagens retornadas pelo mock foram incorporadas ao estado de seleção do popup.

### Fase B — selecionar nenhuma

O teste procura `#btn-select-none`. **Somente se o elemento existir**, clica e então exige:
- “0 imagens selecionadas”;
- texto “Traduzir Selecionadas”;
- `disabled === true`.

O comportamento, quando o elemento existe, é provado diretamente. Porém a guarda `if (btnSelectNone)` permite que ausência do botão pule todas essas assertions.

### Fase C — selecionar uma por card

O teste procura o primeiro `.image-card`. **Somente se existir**, clica e exige:
- “1 imagem selecionada”;
- “Traduzir 1 Página”;
- botão habilitado.

Novamente, a ação real é testada, mas o `if (firstCard)` torna essa parte opcional do ponto de vista do runner.

## 5. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| usa HTML/JS reais do popup | `loadExtensionPage` linhas 51–55 | ✅ PROVADO DIRETAMENTE |
| duas imagens inicializam seleção | linhas 64–68 | ✅ PROVADO DIRETAMENTE |
| CTA inicial plural e habilitado | linhas 66–68 | ✅ PROVADO DIRETAMENTE |
| “Nenhuma” leva seleção a zero | linhas 71–77, **se elemento existir** | 🟨 EXECUTADO CONDICIONALMENTE / guarda pode pular |
| zero desabilita CTA | linha 76, sob mesma guarda | 🟨 EXECUTADO CONDICIONALMENTE |
| clique em card leva seleção a um | linhas 80–87, **se card existir** | 🟨 EXECUTADO CONDICIONALMENTE |
| singular “1 imagem/Página” | linhas 84–85, sob mesma guarda | 🟨 EXECUTADO CONDICIONALMENTE |
| mensagem `SET_SELECTED_IMAGES` contém índices corretos após cada transição | handler responde, mas chamada/args não são assertados | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| botão “Nenhuma” existe | não há expect; ausência é tolerada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| pelo menos um card existe | não há expect explícito; fase inicial implica estado, mas DOM pode divergir | ⚠️ SEM ASSERTION DIRETA |

## 6. Solicitações ao auditor

### 217-001 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** as duas transições centrais do teste são protegidas por `if (btnSelectNone)` e `if (firstCard)`.

**Evidência atual:** quando esses elementos existem, as assertions executam lógica real do popup. Se um deles desaparecer por regressão de HTML/renderização, o bloco correspondente é silenciosamente pulado e o teste pode continuar verde.

**Evidência ausente:** assertions obrigatórias de existência antes do clique.

**Ação solicitada:** em alteração de teste separada, substituir as guardas por assertions, por exemplo `expect(btnSelectNone).not.toBeNull()` e `expect(firstCard).not.toBeNull()`, e executar os cliques incondicionalmente após essas provas.

**Evidência esperada:** remoção do botão “Nenhuma” ou falha na criação de cards torna o teste vermelho.

**Possível regressão:** UI perde controle/card e a suíte deixa de executar justamente as assertions de seleção zero/um.

**Impacto:** confiabilidade do gate do botão dinâmico.

**Severidade:** HIGH.

### 217-002 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** o handler mock aceita `SET_SELECTED_IMAGES`, mas o teste não registra nem verifica os índices enviados nas transições 2→0→1.

**Evidência atual:** texto/disabled do DOM são validados.

**Evidência ausente:** prova do protocolo popup→content script para a seleção efetiva.

**Ação solicitada:** se esse protocolo fizer parte do contrato de UI #2, registrar mensagens recebidas e exigir arrays `[0,1]`, `[]` e o índice final apropriado.

**Evidência esperada:** mudança que atualize o DOM mas envie seleção stale ao content script falha.

**Possível regressão:** UI pode parecer correta enquanto tradução opera sobre índices incorretos.

**Impacto:** coerência entre seleção visual e seleção usada pelo fluxo.

**Severidade:** NORMAL.

## 7. Fonte integral auditada

```js
/**
 * dynamic-button.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa o comportamento do botão de tradução com contagem dinâmica (UI #2)
 * usando a página real carregada via loadExtensionPage.
 */

const { loadExtensionPage } = require('../../helpers/load-extension-page.js');
const { getStorageMock, getTabsMock } = require('../../mocks/chrome-api.mock.js');

describe('popup.js - Botão de Tradução Dinâmico Real', () => {
    let storageMock;
    let tabsMock;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('atualiza texto e estado disabled do botão btn-translate conforme a seleção real no DOM', async () => {
        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        tabsMock._registerMessageHandler(activeTab.id, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({
                    images: [
                        { index: 0, src: 'https://manga.test/p1.png', width: 800, height: 1200 },
                        { index: 1, src: 'https://manga.test/p2.png', width: 800, height: 1200 },
                    ],
                });
            } else if (message.action === 'SET_SELECTED_IMAGES' || message.action === 'HIGHLIGHT_IMAGE') {
                sendResponse({ success: true });
            }
        });

        await storageMock.set({
            enabledDomains: ['manga.test'],
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });

        const { flushAsyncTasks } = require('../../helpers/load-extension-page.js');
        await flushAsyncTasks(8);

        const btnTranslate = document.getElementById('btn-translate');
        const selectionCount = document.getElementById('selection-count');
        expect(btnTranslate).not.toBeNull();
        expect(selectionCount).not.toBeNull();

        // Inicialmente todas estão selecionadas por padrão (2 imagens)
        expect(selectionCount.textContent).toMatch(/2 imagens selecionadas/);
        expect(btnTranslate.textContent).toBe('Traduzir 2 Páginas');
        expect(btnTranslate.disabled).toBe(false);

        // Deseleciona todas via botão "Nenhuma"
        const btnSelectNone = document.getElementById('btn-select-none');
        if (btnSelectNone) {
            btnSelectNone.click();
            expect(selectionCount.textContent).toMatch(/0 imagens selecionadas/);
            expect(btnTranslate.textContent).toBe('Traduzir Selecionadas');
            expect(btnTranslate.disabled).toBe(true);
        }

        // Seleciona uma imagem clicando no seu card
        const firstCard = document.querySelector('#image-grid .image-card');
        if (firstCard) {
            firstCard.click();
            expect(selectionCount.textContent).toMatch(/1 imagem selecionada/);
            expect(btnTranslate.textContent).toBe('Traduzir 1 Página');
            expect(btnTranslate.disabled).toBe(false);
        }
    });
});

```

## 8. Mapa integral de linhas/posições

| Linhas | Responsabilidade | Evidência |
|---:|---|---|
| 1–6 | cabeçalho/objetivo | documental |
| 7 | separador | estrutural |
| 8–9 | imports helper + mocks | executados |
| 10 | separador | estrutural |
| 11–14 | describe/refs | estrutural |
| 15–21 | beforeEach | isolamento |
| 22 | separador | estrutural |
| 23–25 | afterEach | cleanup |
| 26 | separador | estrutural |
| 27 | abre teste | cenário único |
| 28–33 | cria/ativa aba | fixture |
| 34 | separador | estrutural |
| 35–47 | handler das mensagens | mock controlado |
| 48 | separador | estrutural |
| 49–51 | domínio habilitado | precondição |
| 52 | separador | estrutural |
| 53–57 | carrega popup real | ✅ implementação real |
| 58 | separador | estrutural |
| 59–60 | drena tasks | sincronização |
| 61 | separador | estrutural |
| 62–65 | obtém e exige elementos principais | ✅ |
| 66–68 | estado inicial 2 selecionadas | ✅ |
| 69 | separador | estrutural |
| 70–78 | fase “Nenhuma” | 🟨 guardada por existência |
| 79 | separador | estrutural |
| 80–88 | fase um card | 🟨 guardada por existência |
| 89 | fecha teste | estrutural |
| 90 | fecha describe | estrutural |
| posição 91 | newline final | blob confirmado |

## 9. Invariantes e limites

Provado diretamente:
1. com duas imagens válidas, popup real chega ao estado inicial esperado;
2. quando os alvos condicionais existem, os eventos mudam texto/disabled corretamente.

Não provado:
- navegador Chromium real;
- persistência da seleção após fechar/reabrir;
- argumentos de `SET_SELECTED_IMAGES`;
- acessibilidade/teclado;
- comportamento com N > 2;
- existência obrigatória de `btn-select-none` e card durante as fases condicionais.

## 10. Autoauditoria do AGENTE 17

- [x] reserva #217 criada via CREATE ONLY e relida;
- [x] state próprio criado;
- [x] source SHA reconfirmado;
- [x] popup real relacionado foi inspecionado;
- [x] fonte integral incorporada;
- [x] 90 linhas textuais + newline = 91 posições;
- [x] assertions obrigatórias separadas das condicionais;
- [x] duas lacunas registradas como audit_requests;
- [x] nenhum arquivo externo alterado.

**Resultado:** o arquivo prova o estado inicial do botão dinâmico com implementação real e exercita as transições 0/1 quando seus elementos existem; as guardas condicionais impedem tratar essas duas fases como gate obrigatório contra desaparecimento dos elementos.

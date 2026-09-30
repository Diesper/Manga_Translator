# Bíblia técnica — tests/unit/popup/progress-panel.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `d93235bdd142f5c29a8e4663e25b097953655061`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte consumer-level do popup real  
> **Linhas textuais:** **297**  
> **Posições documentais:** **298**, contando o newline terminal

## 1. Papel arquitetural

A suíte carrega `popup.html` e `popup.js` reais e protege o painel de progresso inline do popup. Ela cobre indicador global no header, início visual após Traduzir, polling de `mt_state`/`mt_popup_state`, conclusão, cancelamento disparado pelo botão Parar e isolamento de posição para lotes ainda na fila.

O cenário FIFO é particularmente importante: quando A está ativo globalmente e G ainda está queued, o popup de G deve mostrar sua própria posição local e não os contadores de A.

## 2. Implementação real correlata

`extension/popup/popup.js` — SHA `300cfe9a9c81814443c9d52a17915d851408748b` — usa `START_TRANSLATION_FROM_POPUP`, abre `progress-panel`, inicia polling a cada 800ms, consulta primeiro `GET_FLOATING_BUTTON_STATUS` da aba local e só então cruza `mt_state`/`mt_popup_state`.

Branches reais relevantes:
- local `queued`: posição da própria aba, 0%;
- local `complete`: fecha interval, mostra 100% e agenda `window.close`;
- local `cancelled`: limpa interval e mostra cancelado;
- popup state `cancelled`: idem;
- global/popup progress: calcula processed/pct/Gemini/cache;
- allDone: remove `mt_popup_state`, cria botão Fechar e agenda autoclose;
- stop: envia `STOP_TRANSLATION_FROM_POPUP`, fecha em `ok:true`, mostra toast em falha.

## 3. Harness

- mocks Chrome reais do projeto para storage/tabs/runtime;
- handlers registrados por aba simulam o content script;
- `loadExtensionPage` executa o popup real;
- o teste de polling intercepta `setInterval` para chamar o callback determinística e manualmente.

## 4. Cenários diretamente provados

### Indicador no header
Com `activeJobsCount:2` no startup, dot e label recebem classe `visible`.

### Progresso
Após click em Traduzir com duas páginas: painel ativa, texto inicial é 0/2 e barra 0%. Em storage intermediário 1/2, polling leva a 50% e `1 / 2 Gemini`. Em complete, texto vira conclusão e botão Fechar existe.

### Stop local
Click em Parar envia exatamente `STOP_TRANSLATION_FROM_POPUP` para a aba ativa e fecha quando response é `ok:true`.

### FIFO
Com G em queuePosition 6 e A globalmente ativo, o painel mostra `Posição #6`, não mostra `7 / 10`, e mantém 0%.

## 5. Matriz de evidência

| Contrato | Classificação |
|---|---|
| header indicator com activeJobsCount > 0 | ✅ PROVADO DIRETAMENTE |
| painel inicial 0/total | ✅ PROVADO DIRETAMENTE |
| polling intermediário 50%/Gemini | ✅ PROVADO DIRETAMENTE |
| conclusão por popup state complete cria close button | ✅ PROVADO DIRETAMENTE |
| `mt_popup_state` é removido na conclusão | branch real, não assertado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| barra chega a 100% no allDone | implícito pelo cálculo, não assertado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| click do close button restaura tabs/fecha | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| autoclose 1500ms | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| stop `ok:true` envia à aba ativa e fecha | ✅ PROVADO DIRETAMENTE |
| stop falha mostra toast e mantém popup | não há caso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| local queued protege contadores contra batch global | ✅ PROVADO DIRETAMENTE |
| local complete | branch real, não há caso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| local cancelled | branch real, não há caso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| popupState cancelled | branch real, não há caso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Invariantes

1. O popup da aba deve priorizar estado local da própria página antes do estado global do batch promovido.
2. Lote queued nunca deve herdar percentual/contadores de outro lote.
3. Cancelar pelo popup deve afetar somente o lote pertencente à aba ativa.
4. Progress interval deve ser encerrado em complete/cancelled/stop.
5. Estado popup temporário deve ser removido ao concluir.
6. UI deve distinguir queued, processing, complete, cancelled e completed-with-errors.

## 7. Riscos e lacunas

**Branches terminais incompletos.** A suíte prova `popupStatus=complete`, mas não local complete/cancelled, popup cancelled nem concluded-with-errors.

**Cleanup não assertado.** `clearInterval`, remoção de `mt_popup_state`, restauração das tabs e autoclose não são verificados.

**Stop negativo pode congelar o painel.** O listener executa `clearInterval(pollProgress)` antes de enviar STOP. Se `response.ok !== true`, mostra toast e retorna sem reiniciar o polling; a tradução pode continuar enquanto a UI deixa de atualizar.

**START_TRANSLATION lastError é mascarado.** `sendMessageToTab` trata `chrome.runtime.lastError` especificamente para START_TRANSLATION_FROM_POPUP como callback `{ok:true}` e continua abrindo o painel. O teste não força esse erro; é necessário confirmar se essa política é intencional.

## 8. Solicitações ao auditor

### 219-001 — TEST_REQUIRED — OPEN

**Encontrado:** branches local `complete`, local `cancelled` e `mt_popup_state.status=cancelled` não são exercitados.

**Necessário:** parametrizar estados terminais e validar texto/subtexto/barra/clearInterval/autoclose quando aplicável.

**Risco:** um caminho terminal específico pode deixar polling ativo ou UI incorreta.

**Severidade:** NORMAL.

### 219-002 — TEST_ASSERTION_QUALITY — OPEN

**Encontrado:** cenário de conclusão verifica texto e existência do botão, mas não `mt_popup_state` removido, 100%, click do botão Fechar, restauração de tabs ou autoclose.

**Necessário:** ampliar assertions de cleanup/lifecycle usando fake timers e leitura do storage.

**Risco:** estado temporário/timers podem sobreviver à conclusão sem quebrar o teste.

**Severidade:** NORMAL.

### 219-003 — BUG_REVIEW — OPEN

**Encontrado:** stop só cobre `ok:true`. Na implementação real, `clearInterval(pollProgress)` ocorre antes do request; se STOP falhar, o código mostra toast e retorna sem reiniciar o polling.

**Evidência atual:** popup.js linhas 827–836; não existe teste com `ok:false`/undefined.

**Necessário:** definir recuperação do polling em falha de cancelamento e adicionar cenário que prove que a UI continua acompanhando o lote se ele permaneceu ativo.

**Risco:** painel congela enquanto a tradução continua em background.

**Severidade:** HIGH.

### 219-004 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** `sendMessageToTab` converte `runtime.lastError` de `START_TRANSLATION_FROM_POPUP` em callback `{ok:true}`, fazendo o fluxo visual prosseguir mesmo sem content script responder.

**Evidência atual:** popup.js linhas 509–521; teste #219 não força runtime.lastError. O E2E de translation-flow, em contraste, trata runtime.lastError como `ok:false` ao enviar essa action diretamente.

**Necessário:** auditor deve confirmar a intenção dessa exceção. Se não for deliberada, corrigir a política e adicionar teste de start failure; se deliberada, documentar a razão e estado subsequente esperado.

**Risco:** painel pode informar tradução iniciada enquanto o content script não recebeu o comando.

**Severidade:** HIGH.

## 9. Fonte integral exata

```js
/**
 * progress-panel.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa o painel de progresso inline e o indicador de atividade do popup
 * usando a página real carregada via loadExtensionPage.
 */

const { loadExtensionPage, flushAsyncTasks } = require('../../helpers/load-extension-page.js');
const { getStorageMock, getTabsMock, getRuntimeMock } = require('../../mocks/chrome-api.mock.js');

describe('popup.js - Painel de Progresso Inline Real', () => {
    let storageMock;
    let tabsMock;
    let runtimeMock;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        runtimeMock = getRuntimeMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('UI #7: indicador no header fica visível quando activeJobsCount > 0 na inicialização', async () => {
        await storageMock.set({
            mt_state: { activeJobsCount: 2, completedJobs: 0 },
            enabledDomains: ['manga.test'],
        });

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        tabsMock._registerMessageHandler(activeTab.id, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({ images: [] });
            }
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        const dot = document.getElementById('translating-dot');
        const label = document.getElementById('translating-label');
        expect(dot.classList.contains('visible')).toBe(true);
        expect(label.classList.contains('visible')).toBe(true);
    });

    test('exibe painel de progresso com valores iniciais e atualiza via polling do storage', async () => {
        let pollCallback = null;
        jest.spyOn(window, 'setInterval').mockImplementation((cb, ms) => {
            pollCallback = cb;
            return 999;
        });

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
            } else if (message.action === 'START_TRANSLATION_FROM_POPUP') {
                sendResponse({ started: true });
            } else if (message.action === 'GET_FLOATING_BUTTON_STATUS') {
                sendResponse({
                    success: true,
                    translating: true,
                    batchId: 'batch-popup-progress',
                    batchStatus: 'processing',
                    queuePosition: null,
                });
            }
        });

        await storageMock.set({
            enabledDomains: ['manga.test'],
            mt_state: { isProcessing: false, activeJobsCount: 0 },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        const progressPanel = document.getElementById('progress-panel');
        const progressText = document.getElementById('progress-text');
        const progressFill = document.getElementById('progress-bar-fill');
        const progressSub = document.getElementById('progress-sub');
        const btnTranslate = document.getElementById('btn-translate');

        expect(progressPanel.classList.contains('active')).toBe(false);

        // Clica em Traduzir
        btnTranslate.click();
        await flushAsyncTasks(8);

        // Painel deve estar ativo com estado inicial
        expect(progressPanel.classList.contains('active')).toBe(true);
        expect(progressText.textContent).toBe('Traduzindo páginas...');
        expect(progressSub.textContent).toBe('0 / 2 páginas');
        expect(progressFill.style.width).toBe('0%');
        expect(typeof pollCallback).toBe('function');

        // Simula progresso intermediário no storage
        await storageMock.set({
            mt_state: {
                isProcessing: true,
                totalJobs: 2,
                completedJobs: 1,
                activeJobsCount: 1,
                jobQueue: [],
            },
            mt_popup_state: {
                status: 'processing',
                geminiTotal: 2,
                cacheHits: 0,
            },
        });

        // Executa callback de polling
        pollCallback();
        await flushAsyncTasks(8);

        expect(progressFill.style.width).toBe('50%');
        expect(progressSub.textContent).toContain('1 / 2 Gemini');

        // Simula conclusão
        await storageMock.set({
            mt_state: {
                isProcessing: false,
                totalJobs: 2,
                completedJobs: 2,
                activeJobsCount: 0,
                jobQueue: [],
            },
            mt_popup_state: {
                status: 'complete',
                geminiTotal: 2,
                cacheHits: 0,
            },
        });

        pollCallback();
        await flushAsyncTasks(8);

        expect(progressText.textContent).toBe('✅ Tradução concluída!');
        const closeBtn = progressPanel.querySelector('.progress-close-btn');
        expect(closeBtn).not.toBeNull();
    });

    test('botão de parar cancela somente o lote da aba ativa via content script', async () => {
        const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
        const tabSendSpy = jest.spyOn(chrome.tabs, 'sendMessage');

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        tabsMock._registerMessageHandler(activeTab.id, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({
                    images: [{ index: 0, src: 'https://manga.test/p1.png', width: 800, height: 1200 }],
                });
            } else if (message.action === 'START_TRANSLATION_FROM_POPUP') {
                sendResponse({ started: true });
            } else if (message.action === 'STOP_TRANSLATION_FROM_POPUP') {
                sendResponse({ ok: true, batchId: 'batch-queued-b' });
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
        await flushAsyncTasks(8);

        document.getElementById('btn-translate').click();
        await flushAsyncTasks(8);

        const stopBtn = document.getElementById('btn-progress-stop');
        expect(stopBtn).not.toBeNull();
        stopBtn.click();
        await flushAsyncTasks(4);

        expect(tabSendSpy).toHaveBeenCalledWith(
            activeTab.id,
            { action: 'STOP_TRANSLATION_FROM_POPUP' },
            expect.any(Function)
        );
        expect(closeSpy).toHaveBeenCalled();
    });

    test('painel mostra posição do lote da aba quando B/C/D/... ainda aguardam na FIFO', async () => {
        let pollCallback = null;
        jest.spyOn(window, 'setInterval').mockImplementation((cb) => {
            pollCallback = cb;
            return 1001;
        });

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch-queued',
            active: true,
            title: 'Manga Queued',
        });
        tabsMock._activeTabId = activeTab.id;

        tabsMock._registerMessageHandler(activeTab.id, (message, _sender, sendResponse) => {
            if (message.action === 'GET_PAGE_IMAGES') {
                sendResponse({
                    images: [{ index: 0, src: 'https://manga.test/p1.png', width: 800, height: 1200 }],
                });
            } else if (message.action === 'START_TRANSLATION_FROM_POPUP') {
                sendResponse({ ok: true });
            } else if (message.action === 'GET_FLOATING_BUTTON_STATUS') {
                sendResponse({
                    success: true,
                    translating: true,
                    batchId: 'batch-g',
                    batchStatus: 'queued',
                    queuePosition: 6,
                });
            }
        });

        await storageMock.set({
            enabledDomains: ['manga.test'],
            // A está ativo globalmente; o popup de G não pode exibir os contadores de A.
            mt_state: {
                isProcessing: true,
                currentBatchId: 'batch-a',
                totalJobs: 10,
                completedJobs: 7,
                activeJobsCount: 1,
                jobQueue: [{ index: 9 }],
            },
            mt_popup_state: {
                status: 'queued',
                queuePosition: 6,
                geminiTotal: 1,
                cacheHits: 0,
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        document.getElementById('btn-translate').click();
        await flushAsyncTasks(8);
        expect(typeof pollCallback).toBe('function');

        pollCallback();
        await flushAsyncTasks(8);

        expect(document.getElementById('progress-text').textContent)
            .toBe('⏳ Aguardando na fila...');
        expect(document.getElementById('progress-sub').textContent)
            .toContain('Posição #6');
        expect(document.getElementById('progress-sub').textContent)
            .not.toContain('7 / 10');
        expect(document.getElementById('progress-bar-fill').style.width).toBe('0%');
    });
});
```

## 10. Cobertura documental por linha/posição

Faixas contíguas cobrindo **1–298**; 298 é newline terminal.

### Posições 1–10 — cabeçalho/imports
Define painel real e carrega helpers/mocks. **Evidência:** 🟦 estrutural.

### Posições 11–28 — setup/cleanup
Inicializa mocks, limpa storage/DOM, restaura spies. **Evidência:** 🟨 harness.

### Posições 29–60 — indicador header
Prova dot/label visíveis quando activeJobsCount > 0. **Evidência:** ✅.

### Posições 61–173 — progress inicial/intermediário/conclusão
Intercepta poller, simula start/storage e prova 0%, 50% e conclusão. **Evidência:** ✅ para claims assertados; cleanup parcial não.

### Posições 174–223 — stop do lote da aba
Prova envio da action à aba ativa e close em resposta positiva. **Evidência:** ✅.

### Posições 224–296 — estado queued/FIFO
Prova posição #6 local e ausência de contadores do lote A. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 297 — fechamento
Fecha describe raiz. **Evidência:** 🟨 estrutural.

### Posição 298 — newline terminal
Terminador textual.

## 11. Autoauditoria documental

- SHA reconfirmado.
- Fonte integral embutida.
- **298/298 posições** cobertas.
- Provas do popup real separadas de branches apenas lidos.
- Nenhum arquivo externo foi alterado.
- Nenhuma execução de Jest foi alegada nesta sessão.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com quatro solicitações externas abertas.

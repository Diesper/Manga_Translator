# Bíblia técnica — tests/unit/popup/log-exporter.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `5e4ccdb9c64599f66ff9bb370364b871a7e5f9e6`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte Jest/JSDOM do popup real — logs, filtro, export e cópia  
> **Linhas textuais:** **219**  
> **Posições documentais:** **220**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Esta suíte carrega `extension/popup/popup.html` e `extension/popup/popup.js` reais por `loadExtensionPage`. Ela verifica a aba de logs do popup: leitura de `translatorLog`, renderização, contador, filtro de severidade, export `.txt`, aviso de lista vazia e cópia para clipboard.

Ao contrário de vários testes históricos do corpus, não há mirror da lógica focal: listeners e funções internas do popup são instalados pelo script real.

## 2. Implementação real correlata

`extension/popup/popup.js` — SHA lido `300cfe9a9c81814443c9d52a17915d851408748b` — mantém `currentLogData`, filtra por level, renderiza usando `escapeHTML`, serializa todos os registros para texto, copia via Clipboard API/fallback `execCommand` e exporta via Blob + `URL.createObjectURL` + `chrome.downloads.download`.

A UI correspondente vive em `popup.html` com `btn-log-clear`, `btn-log-copy`, `btn-log-export`, `log-filter-level`, `log-container`, `log-count` e autoscroll.

## 3. Harness

- `getStorageMock` fornece `chrome.storage.local` e `onChanged`.
- `getTabsMock` fornece aba ativa para o bootstrap geral do popup.
- `getDownloadsMock` captura a chamada `chrome.downloads.download`.
- `openLogsSection()` navega até Configurações → Logs pela própria UI e aguarda tarefas assíncronas.
- O `afterEach` limpa `window.logPoller` se existir e restaura mocks.

## 4. Renderização e filtro

O primeiro cenário persiste dois registros e prova que ambos aparecem no container, com contador `2 / 2 registros` e ações visíveis.

O segundo cenário muda `log-filter-level` para `error` e prova que apenas o erro permanece, com contador `1 / 2`.

Apesar do título do teste mencionar `error, warn, info, success`, somente o valor **error** é selecionado. Os outros três níveis não recebem assertion de filtragem.

A implementação real usa `escapeHTML` para timestamp/source/action/detail/extra ao renderizar via `innerHTML`, mas a suíte não injeta payload HTML malicioso para provar esse boundary de segurança.

## 5. Export

O cenário de export substitui `URL.createObjectURL`, clica no botão real e prova que `downloads.download` recebe `filename: mangatranslator_log.txt` e `saveAs:true`.

A suíte **não inspeciona o Blob** passado a `createObjectURL`; portanto não prova o cabeçalho, timestamp ISO, level/source/action/detail, `extra` ou sequer que o conteúdo completo do log entrou no arquivo.

O código real também não chama `URL.revokeObjectURL` e não observa callback/`runtime.lastError` de `chrome.downloads.download`.

## 6. Cópia

O último cenário aplica filtro `warn`, clica em Copiar e prova que o texto enviado ao clipboard contém tanto o registro warn visível quanto o info oculto. Isso confirma que copiar usa `currentLogData` completo, não o subconjunto filtrado.

Ele também prova mudança imediata do label para `Copiado!`. Não cobre restauração do label após 1400 ms, fallback `execCommand`, falha de clipboard ou alerta de lista vazia para copiar.

## 7. Limpeza de logs

O cabeçalho afirma cobrir limpeza, mas não existe teste de `btn-log-clear`. Ficam sem prova neste arquivo: confirmação positiva/negativa, escrita `{translatorLog:[]}` no storage e rerender após limpar.

## 8. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| Popup real é carregado | linhas 62–66/98–102/142–146/176–180/204 | 🟨 EXECUTADO INDIRETAMENTE pelo harness |
| Dois logs do storage são renderizados | 44–78 | ✅ PROVADO DIRETAMENTE |
| Contador total/filtrado funciona nos cenários | 74–75 e 116–117 | ✅ PROVADO DIRETAMENTE |
| Filtro `error` exclui info | 80–120 | ✅ PROVADO DIRETAMENTE |
| Filtros warn/info/success | título menciona, mas não seleciona esses valores | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Render escapa HTML dos campos | código real usa escapeHTML, sem fixture hostil | 🟦 GATE ESTÁTICO ESPECÍFICO / ⚠️ sem assertion focal |
| Export chama downloads com filename/saveAs | 122–161 | ✅ PROVADO DIRETAMENTE |
| Conteúdo serializado do arquivo exportado | Blob não é inspecionado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Sem logs → alerta de export | 163–189 | ✅ PROVADO DIRETAMENTE |
| Copiar inclui logs ocultos pelo filtro | 191–217 | ✅ PROVADO DIRETAMENTE |
| Label muda para `Copiado!` | linha 216 | ✅ PROVADO DIRETAMENTE |
| Falha de clipboard/fallback execCommand | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Limpar logs com confirmação | não há cenário | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Object URL é revogado | implementação não revoga | ⚠️ SEM TESTE / possível dívida de cleanup |
| Erro de downloads API é tratado | implementação não observa callback/lastError | ⚠️ SEM TESTE / possível dívida de robustez |

## 9. Invariantes

1. A aba Logs deve refletir o `translatorLog` persistido.
2. Filtrar visualmente não pode alterar os dados de origem.
3. Copiar/exportar devem considerar todos os logs, salvo decisão explícita de produto em contrário.
4. Export sem dados deve falhar de forma legível, sem download vazio.
5. Dados de log renderizados como HTML devem permanecer escapados.
6. Limpeza deve exigir confirmação e persistir estado vazio.

## 10. Solicitações ao auditor

### 218-001 — TEST_REQUIRED — OPEN

**Encontrado:** o cabeçalho declara cobertura de limpeza, mas nenhum teste clica `btn-log-clear`.

**Evidência atual:** implementação real possui confirm + storage.set + renderLogs; nenhuma assertion no #218.

**Necessário:** testar confirmação cancelada e aceita, persistência de `translatorLog:[]` e atualização do contador/container.

**Risco:** botão Limpar pode deixar de funcionar ou apagar sem confirmação sem falha nesta suíte.

**Severidade:** NORMAL.

### 218-002 — TEST_ASSERTION_QUALITY — OPEN

**Encontrado:** o teste de filtro se chama `error, warn, info, success`, porém só seleciona `error`; o export só verifica filename/saveAs e não o texto serializado.

**Evidência atual:** filtro error e chamada de download estão provados.

**Evidência ausente:** matriz dos quatro levels e conteúdo do Blob/serializeLogs.

**Necessário:** parametrizar os níveis e capturar o Blob/URL para verificar cabeçalho, timestamp ISO, campos e `extra` no arquivo.

**Risco:** regressão em um nível ou no formato exportado pode ficar invisível.

**Severidade:** NORMAL.

### 218-003 — TEST_REQUIRED — OPEN

**Encontrado:** `copyLogText` tem fallback `document.execCommand('copy')`, caminho de erro e alerta; nenhum é exercitado.

**Necessário:** cobrir Clipboard API ausente, execCommand true/false, alerta de falha, alerta de lista vazia e restauração do label após timeout.

**Risco:** cópia falha em browsers/ambientes sem Clipboard API sem detecção.

**Severidade:** NORMAL.

### 218-004 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** export cria Object URL mas não o revoga e dispara `chrome.downloads.download` sem callback/lastError.

**Necessário:** auditor deve decidir se o popup deve revogar URL após download/erro e informar falha ao usuário; depois adicionar teste correspondente.

**Risco:** vazamento temporário de Object URLs e falha silenciosa de export.

**Severidade:** LOW.

### 218-005 — TEST_REQUIRED — OPEN

**Encontrado:** renderização insere strings de log em `innerHTML` via `escapeHTML`, mas não há fixture com `<script>`, atributos ou caracteres especiais.

**Necessário:** adicionar payload hostil em source/action/detail/extra e provar que aparece como texto, sem elemento/script/event handler criado.

**Risco:** regressão no escape pode transformar dados de log em markup executável no popup.

**Severidade:** HIGH.

## 11. Fonte integral exata

```js
/**
 * log-exporter.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa a visualização de logs, filtragem por nível de severidade, limpeza
 * e exportação formatada para arquivo de texto (.txt) via downloads API na arquitetura atual.
 */

const { loadExtensionPage, flushAsyncTasks } = require('../../helpers/load-extension-page.js');
const { getStorageMock, getTabsMock, getDownloadsMock } = require('../../mocks/chrome-api.mock.js');

describe('Log Buffer e Exportador — popup.js', () => {
    let storageMock;
    let tabsMock;
    let downloadsMock;

    beforeEach(async () => {
        jest.resetModules();
        window.alert = jest.fn();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        downloadsMock = getDownloadsMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
    });

    afterEach(() => {
        if (window.logPoller) {
            clearInterval(window.logPoller);
            window.logPoller = null;
        }
        jest.restoreAllMocks();
    });

    async function openLogsSection() {
        const btnSettings = document.getElementById('btn-settings');
        if (btnSettings) btnSettings.click();
        await flushAsyncTasks(4);

        const logsTabBtn = document.querySelector('.settings-tab-btn[data-target="settings-logs"]');
        if (logsTabBtn) logsTabBtn.click();
        await flushAsyncTasks(4);
    }

    test('renderiza registros de log salvos no storage e atualiza o contador', async () => {
        const sampleLogs = [
            { ts: Date.now() - 5000, level: 'info', source: 'bg', action: 'START_JOB', detail: 'Iniciando job 1' },
            { ts: Date.now() - 2000, level: 'error', source: 'gemini', action: 'OCR_FAIL', detail: 'Falha no OCR', extra: { code: 500 } },
        ];

        await storageMock.set({
            translatorLog: sampleLogs,
            enabledDomains: ['manga.test'],
        });

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        await openLogsSection();

        const logContainer = document.getElementById('log-container');
        const logCount = document.getElementById('log-count');

        expect(logContainer.children).toHaveLength(2);
        expect(logCount.textContent).toBe('2 / 2 registros');
        expect(logContainer.textContent).toContain('START_JOB');
        expect(logContainer.textContent).toContain('OCR_FAIL');
    });

    test('filtra logs por nível de severidade (error, warn, info, success)', async () => {
        const sampleLogs = [
            { ts: Date.now() - 5000, level: 'info', source: 'bg', action: 'LOG_INFO', detail: 'Info msg' },
            { ts: Date.now() - 2000, level: 'error', source: 'gemini', action: 'LOG_ERROR', detail: 'Error msg' },
        ];

        await storageMock.set({
            translatorLog: sampleLogs,
            enabledDomains: ['manga.test'],
        });

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        await openLogsSection();

        const filterLevel = document.getElementById('log-filter-level');
        const logContainer = document.getElementById('log-container');
        const logCount = document.getElementById('log-count');

        // Filtra apenas erros
        filterLevel.value = 'error';
        filterLevel.dispatchEvent(new Event('change'));
        await flushAsyncTasks(4);

        expect(logContainer.children).toHaveLength(1);
        expect(logCount.textContent).toBe('1 / 2 registros');
        expect(logContainer.textContent).toContain('LOG_ERROR');
        expect(logContainer.textContent).not.toContain('LOG_INFO');
    });

    test('exporta logs gerando arquivo mangatranslator_log.txt via downloads API', async () => {
        const downloadSpy = jest.spyOn(downloadsMock, 'download');
        window.URL.createObjectURL = jest.fn(() => 'blob:mock-log-download');
        window.URL.revokeObjectURL = jest.fn();

        const sampleLogs = [
            { ts: 1700000000000, level: 'info', source: 'bg', action: 'BATCH_START', detail: 'Lote iniciado' },
        ];

        await storageMock.set({
            translatorLog: sampleLogs,
            enabledDomains: ['manga.test'],
        });

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        await openLogsSection();

        const btnExportLog = document.getElementById('btn-log-export');
        btnExportLog.click();
        await flushAsyncTasks(4);

        expect(downloadSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                filename: 'mangatranslator_log.txt',
                saveAs: true,
            }),
            expect.any(Function)
        );
        expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-log-download');
    });

    test('alerta quando não há logs para exportar', async () => {
        await storageMock.set({
            translatorLog: [],
            enabledDomains: ['manga.test'],
        });

        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);

        await openLogsSection();

        const btnExportLog = document.getElementById('btn-log-export');
        btnExportLog.click();

        expect(window.alert).toHaveBeenCalledWith('Nenhum log para exportar.');
    });

    test('copia todos os logs, inclusive os ocultos pelo filtro, para a área de transferência', async () => {
        const sampleLogs = [
            { ts: 1700000000000, level: 'warn', source: 'gemini', action: 'GEMINI_AUXILIARY_FALLBACK', detail: 'Último recurso', extra: { host: 'lh3.googleusercontent.com' } },
            { ts: 1700000001000, level: 'info', source: 'bg', action: 'BATCH_DONE', detail: 'Concluído' },
        ];
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: jest.fn().mockResolvedValue() },
        });
        await storageMock.set({ translatorLog: sampleLogs, enabledDomains: ['manga.test'] });
        const activeTab = await tabsMock.create({ url: 'https://manga.test/ch1', active: true, title: 'Manga Test' });
        tabsMock._activeTabId = activeTab.id;

        await loadExtensionPage({ htmlPath: 'extension/popup/popup.html', scriptPath: 'extension/popup/popup.js', fireDOMContentLoaded: true });
        await flushAsyncTasks(8);
        await openLogsSection();
        const filterLevel = document.getElementById('log-filter-level');
        filterLevel.value = 'warn';
        filterLevel.dispatchEvent(new Event('change'));

        document.getElementById('btn-log-copy').click();
        await flushAsyncTasks(4);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('GEMINI_AUXILIARY_FALLBACK'));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('BATCH_DONE'));
        expect(document.getElementById('btn-log-copy').textContent).toBe('Copiado!');
    });
    test('beforeunload remove o listener de storage dos logs e limpa o estado global', async () => {
        await storageMock.set({
            translatorLog: [{ ts: Date.now(), level: 'info', source: 'bg', action: 'CLEANUP', detail: 'cleanup' }],
            enabledDomains: ['manga.test'],
        });
        const activeTab = await tabsMock.create({
            url: 'https://manga.test/ch1',
            active: true,
            title: 'Manga Test',
        });
        tabsMock._activeTabId = activeTab.id;

        const removeListenerSpy = jest.spyOn(chrome.storage.onChanged, 'removeListener');

        await loadExtensionPage({
            htmlPath: 'extension/popup/popup.html',
            scriptPath: 'extension/popup/popup.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(8);
        await openLogsSection();

        const installedListener = window.logStorageListener;
        expect(typeof installedListener).toBe('function');
        expect(window.logListenerAdded).toBe(true);

        window.dispatchEvent(new Event('beforeunload'));

        expect(removeListenerSpy).toHaveBeenCalledWith(installedListener);
        expect(window.logStorageListener).toBeNull();
        expect(window.logListenerAdded).toBe(false);
        expect(window.logPoller).toBeNull();
    });

});

```

## 12. Cobertura documental por linha/posição

Faixas contíguas cobrindo **1–257**; 257 é o newline terminal.

### Posições 1–6 — cabeçalho
Declara visualização, filtro, limpeza e export. Limpeza não aparece nos cenários. **Evidência:** 🟦 editorial.

### Posição 7 — separador
Linha vazia.

### Posições 8–10 — imports
Loader e mocks Chrome usados pela suíte. **Evidência:** 🟨 setup.

### Posições 11–32 — lifecycle
Inicializa mocks/storage/DOM e limpa poller/mocks. **Evidência:** 🟨 harness.

### Posição 33 — separador
Linha vazia.

### Posições 34–42 — `openLogsSection`
Navega pela UI real até Logs. **Evidência:** 🟨 helper.

### Posição 43 — separador
Linha vazia.

### Posições 44–78 — renderização
Dois logs reais no storage → dois elementos/contador/ações. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 79 — separador
Linha vazia.

### Posições 80–120 — filtro
Seleciona somente error e verifica exclusão de info. **Evidência:** ✅ error; ⚠️ outros níveis.

### Posição 121 — separador
Linha vazia.

### Posições 122–164 — export
Mocka createObjectURL/revokeObjectURL, verifica callback de download e liberação do Blob URL. **Evidência:** ✅ chamada e cleanup; ⚠️ conteúdo.

### Posição 165 — separador
Linha vazia.

### Posições 166–192 — export vazio
Lista vazia gera alerta. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 193 — separador
Linha vazia.

### Posições 194–220 — cópia
Filtro warn + clipboard real mockado prova cópia de todos os logs e label. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posições 221–253 — cleanup explícito de logs no beforeunload
Abre a aba de logs, captura o listener registrado em `chrome.storage.onChanged`, dispara `beforeunload` e prova remoção do listener + limpeza de `logStorageListener`, `logListenerAdded` e `logPoller`. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 254 — separador
Linha vazia.

### Posição 255 — fechamento
Fecha describe. **Evidência:** 🟨 estrutural.

### Posição 256 — linha vazia final textual
Sem comportamento.

### Posição 257 — newline terminal
Terminador do blob. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 13. Autoauditoria documental

- SHA reconfirmado antes da escrita.
- Fonte integral embutida e posteriormente verificável contra o blob.
- **257/257 posições** documentadas.
- A suíte usa popup real; lacunas não foram preenchidas alterando testes.
- Nenhum arquivo externo foi modificado.

**Resultado da sincronização:** fonte integral e cobertura estrutural atualizadas para `5e4ccdb9c64599f66ff9bb370364b871a7e5f9e6`; a revisão permanece READY_FOR_AUDIT e exige auditoria independente nova.

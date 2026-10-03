# Bíblia técnica — tests/integration/options.ui.test.js

> **Estado:** ✅ CONCLUÍDO DOCUMENTALMENTE PELO AGENTE 5  
> **SHA auditado:** `33c34c89f7131ade147ea65b5f5015b79917b708`  
> **Agente responsável:** AGENTE 5  
> **Tipo:** teste de integração Jest/JSDOM da página de opções  
> **Linhas textuais:** **350**  
> **Posições documentais:** **351**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/integration/options.ui.test.js` é a principal prova de integração da tela `extension/options/options.html` com `extension/options/options.js` no projeto Jest `integration`. A suíte não reimplementa os handlers da página: `loadExtensionPage` injeta o HTML real no JSDOM, carrega primeiro as dependências declaradas no próprio HTML — atualmente `../shared/shared-ui.js` — e então requer o script real `options.js`, disparando `DOMContentLoaded`.

O arquivo valida oito famílias de comportamento: restauração/renderização de preferências e sites, salvamento do prompt, revogação de domínio, revogação quando ainda há imagem persistida, agrupamento/bloqueio de imagens por host, fluxo Refazer, modo Gemini `background_delete`/temporário e controles de interação. O estado Chrome é substituído por `ChromeStorageMock`, portanto as provas são diretas sobre **lógica/DOM do código real**, mas não equivalem a um navegador Chromium real nem a todos os receptores runtime reais.

## 2. Wiring de execução

- `jest.config.js` inclui `<rootDir>/tests/integration/**/*.test.js` no project `integration` com ambiente `jsdom` e os setups Chrome/DOM.
- `package.json#test:integration` seleciona explicitamente o project `integration`.
- `package.json#test:ci` delega ao runner auditável `scripts/ci/run-jest-ci.js`, que inclui unit + integration no inventário.
- O workflow `.github/workflows/ci.yml` executa `npm run test:ci` no job `unit-and-integration` e também no job de portabilidade Windows.
- O teste não aparece como entrada própria na matriz de regressões; sua inclusão é pelo inventário Jest do diretório integration.

**Classificação do wiring:** 🟦 GATE ESTÁTICO ESPECÍFICO para o `testMatch`/scripts; 🟨 EXECUTADO INDIRETAMENTE para a participação efetiva em runs de CI não reexecutadas pelo agente documental.

## 3. Dependências reais e simulações

| Dependência | Papel no teste | Natureza da evidência |
|---|---|---|
| `tests/helpers/load-extension-page.js` | lê HTML real, remove tags externas do DOM, carrega scripts anteriores e `options.js`, captura/dispara DOMContentLoaded | helper real de teste |
| `extension/options/options.html` | fornece textarea, botões, radios, painéis, ARIA e textos | artefato real sob teste |
| `extension/options/options.js` | registra listeners, lê/grava storage e renderiza sites/imagens | implementação real sob teste |
| `extension/shared/shared-ui.js` | `loadRestoreEntries`, bloqueios, Refazer, IPC e helpers | implementação real carregada pelo HTML |
| `tests/mocks/chrome-api.mock.js` | fornece `chrome.storage`, `chrome.runtime` e outros serviços | simulação stateful, não Chrome real |
| JSDOM | DOM/eventos/layout parcial | simulação de browser |
| `window.confirm` | revogação de site | spy sempre `true` no setup |

## 4. Matriz dos oito cenários

| Linhas | Cenário | Propriedade realmente provada | Classificação |
|---:|---|---|---|
| 22–52 | prompt + sites + gaveta | leitura do prompt, dois domínios, metadado/fallback, overflow, expand/collapse e ARIA | ✅ PROVADO DIRETAMENTE |
| 54–71 | salvar prompt | `customPrompt` persistido e feedback | ✅ PROVADO DIRETAMENTE |
| 73–95 | revogar site | domínio removido, lista rerenderizada e feedback, com confirmação aceita | ✅ PROVADO DIRETAMENTE |
| 97–131 | revogar com imagem salva | domínio/meta somem mesmo com restore legado presente | ✅ PROVADO DIRETAMENTE |
| 133–193 | agrupar/bloquear imagem | host correto, isolamento entre capítulos e bloqueio apenas da URL escolhida | ✅ PROVADO DIRETAMENTE |
| 195–262 | Refazer | purga local seletiva + emissão de `GTC_DELETE_BY_CLEAN_URL` | ✅ local/IPC; ⚠️ receptor GTC é mockado |
| 263–287 | modo Gemini | restaura `background_delete`, alterna/persiste temp e delete | ✅ PROVADO DIRETAMENTE |
| 289–347 | controles interação | estrutura/labels/ARIA + restauração/persistência de 3 preferências | ✅ PROVADO DIRETAMENTE |

## 5. Cruzamento com a implementação

### 5.1 Prompt e preferências

`options.js` lê `customPrompt`, `defaultPrompt`, `autoRestoreEnabled`, `geminiExecutionMode`, `floatingButtonEnabled`, `clickToTranslateEnabled` e `redoConfirmEnabled` no carregamento. O teste cobre diretamente o prompt e três controles de interação, além de dois valores de `geminiExecutionMode`.

### 5.2 Sites e imagens

`renderSites()` lê `enabledDomains`, `autoRestoreDisabledSites`, `autoRestoreBlockedImages` e `chapterList`; depois `loadRestoreEntries()` tenta o storage manager e recorre a restoreMap/restoreMeta legado para capítulos ainda sem entradas novas. As fixtures do arquivo auditado exercitam fortemente o **fallback legado**, agrupamento por `host` e o rerender após alterações.

### 5.3 Refazer

O clique em `.options-image-redo-btn` delega a `deleteSavedTranslationForEntry` de `shared-ui.js`. Esse helper:
1. controla duplicidade por `cleanUrl`;
2. pede confirmação salvo preferência desativada;
3. solicita `SM_DELETE_CLEAN_URL`;
4. remove resíduos legados e bloqueio;
5. emite `GTC_DELETE_BY_CLEAN_URL`;
6. chama refresh/status.

Neste teste, `redoConfirmEnabled=false` desvia do modal e o spy de runtime responde artificialmente. O teste portanto prova a transformação local e a mensagem emitida, não o efeito real do handler GTC. Há prova separada em `tests/unit/gtc/indexeddb.test.js` para o receptor e em `tests/unit/shared-ui/redo-confirmation.test.js` para confirmação/cancelamento.

## 6. Invariantes preservadas pela suíte

1. cada caso começa com módulos, storage e DOM limpos;
2. o HTML e o script usados são os arquivos reais da extensão;
3. nomes de site usam `siteMeta.title` quando disponível e hostname como fallback;
4. revogar domínio remove autorização e metadado visual mesmo se existirem traduções salvas;
5. imagens são agrupadas pelo host correto e um bloqueio não contamina outro host;
6. Refazer remove somente a entrada selecionada dos resíduos legados;
7. a imagem irmã preservada continua disponível;
8. Refazer emite a invalidação GTC usando a `cleanUrl`;
9. `background_delete` é restaurável/persistível e o retorno a `temp_chat` também;
10. os controles de interação restauram e persistem suas preferências;
11. `redo-confirm-enabled` pertence ao painel de Sites Permitidos, não ao painel de Interação;
12. o painel de sites preserva associação ARIA com seu título.

## 7. Limitações, casos-limite e riscos

- **Browser simulado:** JSDOM não prova comportamento visual/políticas de um Chromium real.
- **Chrome API simulada:** storage/runtime são mocks; contratos de serialização, lastError e timing reais podem divergir.
- **Confirmação de revogação:** o setup sempre retorna `true`; o branch `confirm(...) === false` não é exercitado.
- **Refazer:** o runtime é espionado; o teste comprova a mensagem, não a exclusão GTC composta. A implementação receptora tem teste unitário separado.
- **Storage moderno:** os fixtures de imagem desta suíte usam restoreMap/restoreMeta legados; o caminho de entries retornadas pelo storage manager não é o foco destes casos.
- **Sincronização assíncrona:** `flushAsyncTasks(N)` usa rodadas de timers zero, uma heurística de drenagem adequada ao mock atual, mas acoplada à profundidade assíncrona.
- **Seletores:** a revogação simples usa `#sites-list button` e posição zero, menos semântico que selecionar explicitamente o botão `Revogar`.
- **Cobertura parcial de controles:** há elementos/branches de `options.js` sem interação focal nesta suíte, detalhados em `113-001`.

## 8. Solicitações ao auditor

### 113-001 — TEST_REQUIRED — OPEN

- **Encontrado:** A suíte cobre oito fluxos importantes, mas não exerce focalmente vários controles implementados exclusivamente/centralmente em options.js: restaurar prompt padrão, autoRestoreEnabled global, checkbox Auto por site/autoRestoreDisabledSites, botões de atualizar e limpar bloqueios, modo minimized_window, ativação da gaveta por teclado e cancelamento da revogação.
- **Arquivo relacionado:** `tests/integration/options.ui.test.js`
- **Evidência atual:** O arquivo auditado contém casos para carregar/salvar prompt, renderizar/revogar sites, agrupar/bloquear imagem, Refazer, background_delete/temp_chat e preferências de interação. Busca no repositório localizou os seletores btn-clear-auto-blocks e btn-refresh-auto-images apenas em options.html/options.js e não encontrou cenário de options.ui para minimized_window ou autoRestoreDisabledSites.
- **Evidência ausente:** Assertions específicas executando options.js real para cada controle/branch citado, incluindo persistência e comportamento de cancelamento.
- **Por que importa:** Esses branches podem regredir sem quebrar os oito cenários atuais, apesar de fazerem parte da tela de opções.
- **Ação solicitada:** Adicionar casos de integração separados em alteração futura, usando loadExtensionPage e a implementação real, para cada família de controle ainda não exercitada.
- **Evidência esperada:** Cada interação deve alterar (ou preservar no cancelamento) o storage/DOM esperado e emitir o feedback correspondente.
- **Ação esperada do auditor:** Confirmar a lacuna e priorizar os controles de maior impacto sem modificar retroativamente esta Bíblia.
- **Possível regressão:** Preferências podem deixar de restaurar/persistir, ações de limpeza podem falhar ou uma interação de teclado/cancelamento pode deixar de funcionar sem falha nesta suíte.
- **Impacto:** Cobertura funcional incompleta da página de opções.
- **Severidade:** NORMAL

### 113-002 — INTEGRATION_TEST_REQUIRED — OPEN

- **Encontrado:** No caso 'botao Refazer...', chrome.runtime.sendMessage é substituído por spy que devolve sucesso para todas as mensagens; assim o caso prova a emissão de GTC_DELETE_BY_CLEAN_URL, mas não a composição real options/shared-ui → runtime handler GTC → remoção no repositório.
- **Arquivo relacionado:** `tests/integration/options.ui.test.js`
- **Evidência atual:** As linhas 198-200 mockam sendMessage; as linhas 257-260 verificam a mensagem. Separadamente, tests/unit/gtc/indexeddb.test.js prova diretamente o handler GTC_DELETE_BY_CLEAN_URL e tests/unit/shared-ui/redo-confirmation.test.js prova o helper de Refazer, mas não há neste arquivo uma execução composta do handler real.
- **Evidência ausente:** Um teste de integração que conecte a ação da UI ao runtime handler real ou a uma camada IPC realista e confira que a entrada GTC deixou de existir.
- **Por que importa:** Provas separadas de emissor e receptor não detectam necessariamente quebra de wiring entre as duas pontas.
- **Ação solicitada:** Criar, em alteração separada, cenário de integração IPC/UI que dispare Refazer pela página de opções e valide remoção real no repositório GTC.
- **Evidência esperada:** Após o clique, query no repositório/handler real não encontra mais a cleanUrl, mantendo também as assertions locais já existentes.
- **Ação esperada do auditor:** Verificar se a cobertura composta já existe em outro teste não indexado; se não existir, adicionar o cenário em trabalho separado.
- **Possível regressão:** Mudança de registro do handler, roteamento ou assinatura da mensagem pode deixar emissor e receptor unitariamente verdes, mas o fluxo real quebrado.
- **Impacto:** Confiança end-to-end do botão Refazer sobre o cache global.
- **Severidade:** NORMAL

## 9. Fonte integral exata

```js
const {
    loadExtensionPage,
    flushAsyncTasks,
} = require('../helpers/load-extension-page.js');
const { getStorageMock } = require('../mocks/chrome-api.mock.js');

describe('OP-01/OP-02/OP-03/OP-04/OP-05/OP-06/OP-07/OP-08/OP-09/OP-10/OP-11/OP-12/OP-13/OP-14/OP-15: options.js + options.html - integracao real', () => {
    let storageMock;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        await storageMock.clear();
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
        jest.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('carrega prompt salvo e renderiza os sites permitidos com HTML real', async () => {
        await storageMock.set({
            customPrompt: 'Prompt customizado de teste',
            enabledDomains: ['reader.test', 'mirror.test'],
            'siteMeta_reader.test': { title: 'Reader Oficial' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/options/options.html',
            scriptPath: 'extension/options/options.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(4);

        expect(document.getElementById('prompt').value).toBe('Prompt customizado de teste');

        const siteItems = [...document.querySelectorAll('#sites-list .options-site-item')];
        expect(siteItems).toHaveLength(2);
        expect(siteItems[0].textContent).toContain('Reader Oficial (reader.test)');
        expect(siteItems[1].textContent).toContain('mirror.test (mirror.test)');
        expect(siteItems[0].textContent).toContain('Imagens específicas');
        expect(window.getComputedStyle(document.getElementById('sites-list')).overflowY).toBe('auto');

        expect(siteItems[0].classList.contains('open')).toBe(false);
        siteItems[0].querySelector('.options-site-main').click();
        await flushAsyncTasks(4);
        const openedSite = [...document.querySelectorAll('#sites-list .options-site-item')][0];
        expect(openedSite.classList.contains('open')).toBe(true);
        expect(openedSite.querySelector('.options-site-main').getAttribute('aria-expanded')).toBe('true');
        expect(openedSite.querySelector('.options-site-images').style.overflowY).toBe('auto');
    });

    test('salva o prompt editado e mostra feedback de sucesso', async () => {
        await loadExtensionPage({
            htmlPath: 'extension/options/options.html',
            scriptPath: 'extension/options/options.js',
            fireDOMContentLoaded: true,
        });

        const prompt = document.getElementById('prompt');
        const saveButton = document.getElementById('btn-save');

        prompt.value = 'Novo prompt QA';
        saveButton.click();
        await flushAsyncTasks();

        const data = await storageMock.get(['customPrompt']);
        expect(data.customPrompt).toBe('Novo prompt QA');
        expect(document.getElementById('status').textContent).toContain('Salvo com sucesso');
    });

    test('revoga permissao de um site e re-renderiza a lista', async () => {
        await storageMock.set({
            enabledDomains: ['reader.test', 'mirror.test'],
            'siteMeta_reader.test': { title: 'Reader Oficial' },
            'siteMeta_mirror.test': { title: 'Mirror Hub' },
        });

        await loadExtensionPage({
            htmlPath: 'extension/options/options.html',
            scriptPath: 'extension/options/options.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(4);

        const buttons = [...document.querySelectorAll('#sites-list button')];
        buttons[0].click();
        await flushAsyncTasks(6);

        const data = await storageMock.get(['enabledDomains']);
        expect(data.enabledDomains).toEqual(['mirror.test']);
        expect(document.querySelectorAll('#sites-list button')).toHaveLength(1);
        expect(document.getElementById('status').textContent).toContain('Permissão revogada');
    });

    test('revogar site remove a gaveta mesmo quando o dominio ainda tem imagem salva', async () => {
        const cleanUrl = 'https://reader.test/persistida.png';
        await storageMock.set({
            enabledDomains: ['reader.test'],
            'siteMeta_reader.test': { title: 'Reader Oficial' },
            chapterList: [{
                id: 'chap_options_remove',
                title: 'Capítulo Persistido',
                url: 'https://reader.test/cap',
                timestamp: 1710000000000,
            }],
            chap_options_remove_restoreMap: {
                [cleanUrl]: 'data:image/png;base64,UkVBREVS',
            },
            chap_options_remove_restoreMeta: {
                [cleanUrl]: { host: 'reader.test', sourceUrl: cleanUrl, index: 0, updatedAt: 1710000000000 },
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/options/options.html',
            scriptPath: 'extension/options/options.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(6);

        document.querySelector('#sites-list .options-site-item button').click();
        await flushAsyncTasks(8);

        const data = await storageMock.get(['enabledDomains', 'siteMeta_reader.test']);
        expect(data.enabledDomains).toEqual([]);
        expect(data['siteMeta_reader.test']).toBeUndefined();
        expect(document.querySelectorAll('#sites-list .options-site-item')).toHaveLength(0);
        expect(document.getElementById('sites-list').textContent).toContain('Nenhum site permitido');
    });

    test('agrupa imagens especificas por site e bloqueia somente a imagem escolhida', async () => {
        const readerUrl = 'https://reader.test/p1.png';
        const mirrorUrl = 'https://mirror.test/p2.png';
        await storageMock.set({
            enabledDomains: ['reader.test', 'mirror.test'],
            chapterList: [
                {
                    id: 'chap_reader',
                    title: 'Capítulo Reader',
                    url: 'https://reader.test/cap',
                    timestamp: 1710000000000,
                },
                {
                    id: 'chap_mirror',
                    title: 'Capítulo Mirror',
                    url: 'https://mirror.test/cap',
                    timestamp: 1710000000000,
                },
            ],
            chap_reader_restoreMap: {
                [readerUrl]: 'data:image/png;base64,READER',
            },
            chap_reader_restoreMeta: {
                [readerUrl]: { host: 'reader.test', sourceUrl: readerUrl, index: 0, updatedAt: 1710000002000 },
            },
            chap_mirror_restoreMap: {
                [mirrorUrl]: 'data:image/png;base64,MIRROR',
            },
            chap_mirror_restoreMeta: {
                [mirrorUrl]: { host: 'mirror.test', sourceUrl: mirrorUrl, index: 1, updatedAt: 1710000001000 },
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/options/options.html',
            scriptPath: 'extension/options/options.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(6);

        const siteItems = [...document.querySelectorAll('#sites-list .options-site-item')];
        const readerSite = siteItems.find(item => item.textContent.includes('reader.test'));
        const mirrorSite = siteItems.find(item => item.textContent.includes('mirror.test'));

        expect(readerSite.querySelectorAll('.options-image-item')).toHaveLength(1);
        expect(readerSite.textContent).toContain('Capítulo Reader');
        expect(readerSite.textContent).not.toContain('Capítulo Mirror');
        expect(mirrorSite.querySelectorAll('.options-image-item')).toHaveLength(1);
        expect(mirrorSite.textContent).toContain('Capítulo Mirror');

        readerSite.querySelector('.options-image-block-btn').click();
        await flushAsyncTasks(6);

        const data = await storageMock.get(['autoRestoreBlockedImages']);
        expect(data.autoRestoreBlockedImages[readerUrl]).toEqual(expect.objectContaining({
            cleanUrl: readerUrl,
            host: 'reader.test',
            chapterTitle: 'Capítulo Reader',
        }));
        expect(data.autoRestoreBlockedImages[mirrorUrl]).toBeUndefined();
    });

    test('botao Refazer nas opcoes apaga restoreMap, imagens, paths e cache GTC da imagem', async () => {
        const cleanUrl = 'https://reader.test/wrong.png';
        const keepUrl = 'https://reader.test/keep.png';
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage').mockImplementation((message, callback) => {
            if (callback) setTimeout(() => callback({ ok: true, deleted: 1 }), 0);
        });

        await storageMock.set({
            enabledDomains: ['reader.test'],
            redoConfirmEnabled: false,
            chapterList: [{
                id: 'chap_options_redo',
                title: 'Capítulo Options Refazer',
                url: 'https://reader.test/cap',
                timestamp: 1710000000000,
            }],
            chap_options_redo_images: {
                0: 'data:image/png;base64,ERRADA',
                1: 'data:image/png;base64,CERTA',
            },
            chap_options_redo_paths: {
                0: 'C:\\Downloads\\errada.png',
                1: 'C:\\Downloads\\certa.png',
            },
            chap_options_redo_restoreMap: {
                [cleanUrl]: 'data:image/png;base64,ERRADA',
                [keepUrl]: 'data:image/png;base64,CERTA',
            },
            chap_options_redo_restoreMeta: {
                [cleanUrl]: { host: 'reader.test', sourceUrl: cleanUrl, index: 0, updatedAt: 1710000002000 },
                [keepUrl]: { host: 'reader.test', sourceUrl: keepUrl, index: 1, updatedAt: 1710000001000 },
            },
            autoRestoreBlockedImages: {
                [cleanUrl]: { cleanUrl, host: 'reader.test' },
            },
        });

        await loadExtensionPage({
            htmlPath: 'extension/options/options.html',
            scriptPath: 'extension/options/options.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(6);

        document.querySelector('.options-image-redo-btn').click();
        await flushAsyncTasks(10);

        const data = await storageMock.get([
            'chap_options_redo_images',
            'chap_options_redo_paths',
            'chap_options_redo_restoreMap',
            'chap_options_redo_restoreMeta',
            'autoRestoreBlockedImages',
        ]);

        expect(data.chap_options_redo_restoreMap[cleanUrl]).toBeUndefined();
        expect(data.chap_options_redo_restoreMap[keepUrl]).toBe('data:image/png;base64,CERTA');
        expect(data.chap_options_redo_restoreMeta[cleanUrl]).toBeUndefined();
        expect(data.chap_options_redo_images[0]).toBeUndefined();
        expect(data.chap_options_redo_images[1]).toBe('data:image/png;base64,CERTA');
        expect(data.chap_options_redo_paths[0]).toBeUndefined();
        expect(data.autoRestoreBlockedImages[cleanUrl]).toBeUndefined();
        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'GTC_DELETE_BY_CLEAN_URL', cleanUrl }),
            expect.any(Function)
        );
        expect(document.querySelectorAll('.options-image-item')).toHaveLength(1);
    });
    test('modo de exclusão segura é restaurado e persistido nas opções', async () => {
        await storageMock.set({ geminiExecutionMode: 'background_delete' });

        await loadExtensionPage({
            htmlPath: 'extension/options/options.html',
            scriptPath: 'extension/options/options.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(4);

        const secureMode = document.getElementById('gemini-mode-delete');
        expect(secureMode).not.toBeNull();
        expect(secureMode.checked).toBe(true);

        document.getElementById('gemini-mode-temp').checked = true;
        document.getElementById('gemini-mode-temp').dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);
        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('temp_chat');

        secureMode.checked = true;
        secureMode.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(4);
        expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('background_delete');
        expect(document.getElementById('gemini-mode-status').textContent).toContain('Exclusão Segura');
    });

    test('controles de interação restauram preferências e persistem alterações', async () => {
        await storageMock.set({
            floatingButtonEnabled: false,
            clickToTranslateEnabled: true,
            redoConfirmEnabled: false,
        });

        await loadExtensionPage({
            htmlPath: 'extension/options/options.html',
            scriptPath: 'extension/options/options.js',
            fireDOMContentLoaded: true,
        });
        await flushAsyncTasks(5);

        const floating = document.getElementById('floating-button-enabled');
        const single = document.getElementById('click-to-translate-enabled');
        const redo = document.getElementById('redo-confirm-enabled');

        expect(single.closest('label').textContent).toContain('Clique direito para traduzir uma única imagem');
        expect(single.closest('label').textContent).toContain('Traduzir esta imagem');

        const enabledSitesPanel = document.getElementById('enabled-sites-panel');
        const enabledSitesTitle = document.getElementById('enabled-sites-title');
        const sitesList = document.getElementById('sites-list');
        expect(document.querySelectorAll('#redo-confirm-enabled')).toHaveLength(1);
        expect(enabledSitesPanel).not.toBeNull();
        expect(enabledSitesTitle).not.toBeNull();
        expect(enabledSitesTitle.textContent.trim()).toBe('Sites Permitidos');
        expect(enabledSitesPanel.getAttribute('aria-labelledby')).toBe('enabled-sites-title');
        expect(enabledSitesPanel.contains(redo)).toBe(true);
        expect(enabledSitesPanel.contains(sitesList)).toBe(true);
        expect(redo.closest('#enabled-sites-panel')).toBe(enabledSitesPanel);
        expect(redo.closest('label').textContent).toContain('Confirmar ao apertar o botão de refazer a imagem');
        expect(floating.checked).toBe(false);
        expect(single.checked).toBe(true);
        expect(redo.checked).toBe(false);

        floating.checked = true;
        floating.dispatchEvent(new Event('change', { bubbles: true }));
        single.checked = false;
        single.dispatchEvent(new Event('change', { bubbles: true }));
        redo.checked = true;
        redo.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAsyncTasks(5);

        const data = await storageMock.get([
            'floatingButtonEnabled',
            'clickToTranslateEnabled',
            'redoConfirmEnabled',
        ]);
        expect(data).toEqual(expect.objectContaining({
            floatingButtonEnabled: true,
            clickToTranslateEnabled: false,
            redoConfirmEnabled: true,
        }));
        const interactionPanel = floating.closest('div[style*="background:#242424"]');
        expect(interactionPanel?.querySelector('h3')?.textContent).toContain('Interação na página');
        expect(interactionPanel?.contains(redo)).toBe(false);
    });

});

```

## 10. Cobertura documental por faixas contíguas

As faixas abaixo cobrem **todas as 351 posições** em ordem, sem lacunas nem sobreposição. Cada faixa preserva seu papel, mecanismo, motivação e força de evidência; o bloco integral acima é a referência byte a byte do SHA auditado.

### Posições 1–5 — Dependências do teste

**Fonte coberta:**

```text
1: const {
2:     loadExtensionPage,
3:     flushAsyncTasks,
4: } = require('../helpers/load-extension-page.js');
5: const { getStorageMock } = require('../mocks/chrome-api.mock.js');
```

**O que faz / como faz / por que existe:** Importa o carregador de página real e o mock stateful de storage. O helper reconstrói o HTML real, carrega scripts anteriores do documento e requer `options.js`; o mock fornece a superfície `chrome.*` controlada. Isso mantém a implementação de UI real sob teste sem exigir navegador Chromium.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para a ligação aos helpers + 🟨 EXECUTADO INDIRETAMENTE no fluxo Jest.

### Posições 6 — Separação textual

**Fonte coberta:**

```text
6: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia entre imports e suíte.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 7–20 — Escopo da suíte e isolamento por caso

**Fonte coberta:**

```text
7: describe('OP-01/OP-02/OP-03/OP-04/OP-05/OP-06/OP-07/OP-08/OP-09/OP-10/OP-11/OP-12/OP-13/OP-14/OP-15: options.js + options.html - integracao real', () => {
8:     let storageMock;
9: ␤ [linha vazia]
10:     beforeEach(async () => {
11:         jest.resetModules();
12:         storageMock = getStorageMock();
13:         await storageMock.clear();
14:         document.documentElement.innerHTML = '<html><head></head><body></body></html>';
15:         jest.spyOn(window, 'confirm').mockReturnValue(true);
16:     });
17: ␤ [linha vazia]
18:     afterEach(() => {
19:         jest.restoreAllMocks();
20:     });
```

**O que faz / como faz / por que existe:** Declara a suíte OP-01..OP-15, obtém o storage singleton em cada caso, limpa dados/DOM, força `window.confirm` a aceitar revogações e restaura spies depois. `jest.resetModules()` permite recarregar scripts da extensão em cada teste.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; o isolamento é pré-condição observável dos oito casos, mas não há assertion dedicada ao próprio setup.

### Posições 21 — Separação textual

**Fonte coberta:**

```text
21: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia antes do primeiro cenário.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 22–52 — Cenário: carregar prompt, sites e gaveta

**Fonte coberta:**

```text
22:     test('carrega prompt salvo e renderiza os sites permitidos com HTML real', async () => {
23:         await storageMock.set({
24:             customPrompt: 'Prompt customizado de teste',
25:             enabledDomains: ['reader.test', 'mirror.test'],
26:             'siteMeta_reader.test': { title: 'Reader Oficial' },
27:         });
28: ␤ [linha vazia]
29:         await loadExtensionPage({
30:             htmlPath: 'extension/options/options.html',
31:             scriptPath: 'extension/options/options.js',
32:             fireDOMContentLoaded: true,
33:         });
34:         await flushAsyncTasks(4);
35: ␤ [linha vazia]
36:         expect(document.getElementById('prompt').value).toBe('Prompt customizado de teste');
37: ␤ [linha vazia]
38:         const siteItems = [...document.querySelectorAll('#sites-list .options-site-item')];
39:         expect(siteItems).toHaveLength(2);
40:         expect(siteItems[0].textContent).toContain('Reader Oficial (reader.test)');
41:         expect(siteItems[1].textContent).toContain('mirror.test (mirror.test)');
42:         expect(siteItems[0].textContent).toContain('Imagens específicas');
43:         expect(window.getComputedStyle(document.getElementById('sites-list')).overflowY).toBe('auto');
44: ␤ [linha vazia]
45:         expect(siteItems[0].classList.contains('open')).toBe(false);
46:         siteItems[0].querySelector('.options-site-main').click();
47:         await flushAsyncTasks(4);
48:         const openedSite = [...document.querySelectorAll('#sites-list .options-site-item')][0];
49:         expect(openedSite.classList.contains('open')).toBe(true);
50:         expect(openedSite.querySelector('.options-site-main').getAttribute('aria-expanded')).toBe('true');
51:         expect(openedSite.querySelector('.options-site-images').style.overflowY).toBe('auto');
52:     });
```

**O que faz / como faz / por que existe:** Prepara prompt, dois domínios e metadado de um site; carrega `options.html/options.js` reais; verifica valor do textarea, dois itens, fallback de nome, título de imagens, overflow vertical, estado fechado inicial e mudança para `open`/`aria-expanded=true` após clique. Exercita `renderSites()` real e o estado `expandedOptionSites`.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para DOM/renderização da página real em JSDOM com Chrome API simulada.

### Posições 53 — Separação textual

**Fonte coberta:**

```text
53: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia entre cenários.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 54–71 — Cenário: salvar prompt

**Fonte coberta:**

```text
54:     test('salva o prompt editado e mostra feedback de sucesso', async () => {
55:         await loadExtensionPage({
56:             htmlPath: 'extension/options/options.html',
57:             scriptPath: 'extension/options/options.js',
58:             fireDOMContentLoaded: true,
59:         });
60: ␤ [linha vazia]
61:         const prompt = document.getElementById('prompt');
62:         const saveButton = document.getElementById('btn-save');
63: ␤ [linha vazia]
64:         prompt.value = 'Novo prompt QA';
65:         saveButton.click();
66:         await flushAsyncTasks();
67: ␤ [linha vazia]
68:         const data = await storageMock.get(['customPrompt']);
69:         expect(data.customPrompt).toBe('Novo prompt QA');
70:         expect(document.getElementById('status').textContent).toContain('Salvo com sucesso');
71:     });
```

**O que faz / como faz / por que existe:** Carrega a página, altera `#prompt`, clica `#btn-save`, aguarda callbacks e verifica `customPrompt` no storage e feedback 'Salvo com sucesso'. Exercita o listener real de `options.js` que chama `chrome.storage.local.set`.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para persistência via implementação real contra o mock stateful e feedback DOM.

### Posições 72 — Separação textual

**Fonte coberta:**

```text
72: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia entre cenários.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 73–95 — Cenário: revogar um site

**Fonte coberta:**

```text
73:     test('revoga permissao de um site e re-renderiza a lista', async () => {
74:         await storageMock.set({
75:             enabledDomains: ['reader.test', 'mirror.test'],
76:             'siteMeta_reader.test': { title: 'Reader Oficial' },
77:             'siteMeta_mirror.test': { title: 'Mirror Hub' },
78:         });
79: ␤ [linha vazia]
80:         await loadExtensionPage({
81:             htmlPath: 'extension/options/options.html',
82:             scriptPath: 'extension/options/options.js',
83:             fireDOMContentLoaded: true,
84:         });
85:         await flushAsyncTasks(4);
86: ␤ [linha vazia]
87:         const buttons = [...document.querySelectorAll('#sites-list button')];
88:         buttons[0].click();
89:         await flushAsyncTasks(6);
90: ␤ [linha vazia]
91:         const data = await storageMock.get(['enabledDomains']);
92:         expect(data.enabledDomains).toEqual(['mirror.test']);
93:         expect(document.querySelectorAll('#sites-list button')).toHaveLength(1);
94:         expect(document.getElementById('status').textContent).toContain('Permissão revogada');
95:     });
```

**O que faz / como faz / por que existe:** Popula dois domínios, carrega a UI, aciona o primeiro botão de revogação com confirmação previamente aceita e verifica remoção de `reader.test`, rerender para um único botão e mensagem de revogação.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o caminho confirmado da revogação; ⚠️ não prova o caminho de cancelamento.

### Posições 96 — Separação textual

**Fonte coberta:**

```text
96: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia entre cenários.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 97–131 — Cenário: revogação apesar de imagem persistida

**Fonte coberta:**

```text
97:     test('revogar site remove a gaveta mesmo quando o dominio ainda tem imagem salva', async () => {
98:         const cleanUrl = 'https://reader.test/persistida.png';
99:         await storageMock.set({
100:             enabledDomains: ['reader.test'],
101:             'siteMeta_reader.test': { title: 'Reader Oficial' },
102:             chapterList: [{
103:                 id: 'chap_options_remove',
104:                 title: 'Capítulo Persistido',
105:                 url: 'https://reader.test/cap',
106:                 timestamp: 1710000000000,
107:             }],
108:             chap_options_remove_restoreMap: {
109:                 [cleanUrl]: 'data:image/png;base64,UkVBREVS',
110:             },
111:             chap_options_remove_restoreMeta: {
112:                 [cleanUrl]: { host: 'reader.test', sourceUrl: cleanUrl, index: 0, updatedAt: 1710000000000 },
113:             },
114:         });
115: ␤ [linha vazia]
116:         await loadExtensionPage({
117:             htmlPath: 'extension/options/options.html',
118:             scriptPath: 'extension/options/options.js',
119:             fireDOMContentLoaded: true,
120:         });
121:         await flushAsyncTasks(6);
122: ␤ [linha vazia]
123:         document.querySelector('#sites-list .options-site-item button').click();
124:         await flushAsyncTasks(8);
125: ␤ [linha vazia]
126:         const data = await storageMock.get(['enabledDomains', 'siteMeta_reader.test']);
127:         expect(data.enabledDomains).toEqual([]);
128:         expect(data['siteMeta_reader.test']).toBeUndefined();
129:         expect(document.querySelectorAll('#sites-list .options-site-item')).toHaveLength(0);
130:         expect(document.getElementById('sites-list').textContent).toContain('Nenhum site permitido');
131:     });
```

**O que faz / como faz / por que existe:** Cria capítulo legado com restoreMap/restoreMeta para o domínio, revoga o único site e comprova que `enabledDomains` fica vazio, `siteMeta_reader.test` é removido, a gaveta some e a lista mostra 'Nenhum site permitido'. A imagem persistida não mantém autorização visual do domínio.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento de revogação da UI e storage legado simulado.

### Posições 132 — Separação textual

**Fonte coberta:**

```text
132: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia entre cenários.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 133–193 — Cenário: agrupar e bloquear imagem específica

**Fonte coberta:**

```text
133:     test('agrupa imagens especificas por site e bloqueia somente a imagem escolhida', async () => {
134:         const readerUrl = 'https://reader.test/p1.png';
135:         const mirrorUrl = 'https://mirror.test/p2.png';
136:         await storageMock.set({
137:             enabledDomains: ['reader.test', 'mirror.test'],
138:             chapterList: [
139:                 {
140:                     id: 'chap_reader',
141:                     title: 'Capítulo Reader',
142:                     url: 'https://reader.test/cap',
143:                     timestamp: 1710000000000,
144:                 },
145:                 {
146:                     id: 'chap_mirror',
147:                     title: 'Capítulo Mirror',
148:                     url: 'https://mirror.test/cap',
149:                     timestamp: 1710000000000,
150:                 },
151:             ],
152:             chap_reader_restoreMap: {
153:                 [readerUrl]: 'data:image/png;base64,READER',
154:             },
155:             chap_reader_restoreMeta: {
156:                 [readerUrl]: { host: 'reader.test', sourceUrl: readerUrl, index: 0, updatedAt: 1710000002000 },
157:             },
158:             chap_mirror_restoreMap: {
159:                 [mirrorUrl]: 'data:image/png;base64,MIRROR',
160:             },
161:             chap_mirror_restoreMeta: {
162:                 [mirrorUrl]: { host: 'mirror.test', sourceUrl: mirrorUrl, index: 1, updatedAt: 1710000001000 },
163:             },
164:         });
165: ␤ [linha vazia]
166:         await loadExtensionPage({
167:             htmlPath: 'extension/options/options.html',
168:             scriptPath: 'extension/options/options.js',
169:             fireDOMContentLoaded: true,
170:         });
171:         await flushAsyncTasks(6);
172: ␤ [linha vazia]
173:         const siteItems = [...document.querySelectorAll('#sites-list .options-site-item')];
174:         const readerSite = siteItems.find(item => item.textContent.includes('reader.test'));
175:         const mirrorSite = siteItems.find(item => item.textContent.includes('mirror.test'));
176: ␤ [linha vazia]
177:         expect(readerSite.querySelectorAll('.options-image-item')).toHaveLength(1);
178:         expect(readerSite.textContent).toContain('Capítulo Reader');
179:         expect(readerSite.textContent).not.toContain('Capítulo Mirror');
180:         expect(mirrorSite.querySelectorAll('.options-image-item')).toHaveLength(1);
181:         expect(mirrorSite.textContent).toContain('Capítulo Mirror');
182: ␤ [linha vazia]
183:         readerSite.querySelector('.options-image-block-btn').click();
184:         await flushAsyncTasks(6);
185: ␤ [linha vazia]
186:         const data = await storageMock.get(['autoRestoreBlockedImages']);
187:         expect(data.autoRestoreBlockedImages[readerUrl]).toEqual(expect.objectContaining({
188:             cleanUrl: readerUrl,
189:             host: 'reader.test',
190:             chapterTitle: 'Capítulo Reader',
191:         }));
192:         expect(data.autoRestoreBlockedImages[mirrorUrl]).toBeUndefined();
193:     });
```

**O que faz / como faz / por que existe:** Monta dois capítulos/hosts com restoreMap/restoreMeta legados, carrega a página, localiza cada grupo por hostname, exige uma imagem no grupo correto e nenhuma mistura de títulos, clica `options-image-block-btn` do reader e verifica entrada estruturada somente para `readerUrl` em `autoRestoreBlockedImages`.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para fallback legado, agrupamento por host e bloqueio seletivo usando a implementação real de shared-ui/options no JSDOM.

### Posições 194 — Separação textual

**Fonte coberta:**

```text
194: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia entre cenários.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 195–262 — Cenário: Refazer e purga local

**Fonte coberta:**

```text
195:     test('botao Refazer nas opcoes apaga restoreMap, imagens, paths e cache GTC da imagem', async () => {
196:         const cleanUrl = 'https://reader.test/wrong.png';
197:         const keepUrl = 'https://reader.test/keep.png';
198:         const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage').mockImplementation((message, callback) => {
199:             if (callback) setTimeout(() => callback({ ok: true, deleted: 1 }), 0);
200:         });
201: ␤ [linha vazia]
202:         await storageMock.set({
203:             enabledDomains: ['reader.test'],
204:             redoConfirmEnabled: false,
205:             chapterList: [{
206:                 id: 'chap_options_redo',
207:                 title: 'Capítulo Options Refazer',
208:                 url: 'https://reader.test/cap',
209:                 timestamp: 1710000000000,
210:             }],
211:             chap_options_redo_images: {
212:                 0: 'data:image/png;base64,ERRADA',
213:                 1: 'data:image/png;base64,CERTA',
214:             },
215:             chap_options_redo_paths: {
216:                 0: 'C:\\Downloads\\errada.png',
217:                 1: 'C:\\Downloads\\certa.png',
218:             },
219:             chap_options_redo_restoreMap: {
220:                 [cleanUrl]: 'data:image/png;base64,ERRADA',
221:                 [keepUrl]: 'data:image/png;base64,CERTA',
222:             },
223:             chap_options_redo_restoreMeta: {
224:                 [cleanUrl]: { host: 'reader.test', sourceUrl: cleanUrl, index: 0, updatedAt: 1710000002000 },
225:                 [keepUrl]: { host: 'reader.test', sourceUrl: keepUrl, index: 1, updatedAt: 1710000001000 },
226:             },
227:             autoRestoreBlockedImages: {
228:                 [cleanUrl]: { cleanUrl, host: 'reader.test' },
229:             },
230:         });
231: ␤ [linha vazia]
232:         await loadExtensionPage({
233:             htmlPath: 'extension/options/options.html',
234:             scriptPath: 'extension/options/options.js',
235:             fireDOMContentLoaded: true,
236:         });
237:         await flushAsyncTasks(6);
238: ␤ [linha vazia]
239:         document.querySelector('.options-image-redo-btn').click();
240:         await flushAsyncTasks(10);
241: ␤ [linha vazia]
242:         const data = await storageMock.get([
243:             'chap_options_redo_images',
244:             'chap_options_redo_paths',
245:             'chap_options_redo_restoreMap',
246:             'chap_options_redo_restoreMeta',
247:             'autoRestoreBlockedImages',
248:         ]);
249: ␤ [linha vazia]
250:         expect(data.chap_options_redo_restoreMap[cleanUrl]).toBeUndefined();
251:         expect(data.chap_options_redo_restoreMap[keepUrl]).toBe('data:image/png;base64,CERTA');
252:         expect(data.chap_options_redo_restoreMeta[cleanUrl]).toBeUndefined();
253:         expect(data.chap_options_redo_images[0]).toBeUndefined();
254:         expect(data.chap_options_redo_images[1]).toBe('data:image/png;base64,CERTA');
255:         expect(data.chap_options_redo_paths[0]).toBeUndefined();
256:         expect(data.autoRestoreBlockedImages[cleanUrl]).toBeUndefined();
257:         expect(sendSpy).toHaveBeenCalledWith(
258:             expect.objectContaining({ action: 'GTC_DELETE_BY_CLEAN_URL', cleanUrl }),
259:             expect.any(Function)
260:         );
261:         expect(document.querySelectorAll('.options-image-item')).toHaveLength(1);
262:     });
```

**O que faz / como faz / por que existe:** Cria duas imagens no mesmo capítulo, desativa confirmação e substitui `chrome.runtime.sendMessage` por spy de sucesso. Após clicar Refazer, verifica remoção apenas da URL errada em restoreMap/restoreMeta/images/paths/blockedImages, preservação da imagem correta, emissão de `GTC_DELETE_BY_CLEAN_URL` e rerender com uma imagem. O helper real `deleteSavedTranslationForEntry` é exercitado; o receptor runtime real não é.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para purga local e emissão IPC; 🟨/⚠️ para remoção GTC end-to-end porque o runtime é mockado. Há prova direta separada do handler em `tests/unit/gtc/indexeddb.test.js`.

### Posições 263–287 — Cenário: modo de exclusão segura

**Fonte coberta:**

```text
263:     test('modo de exclusão segura é restaurado e persistido nas opções', async () => {
264:         await storageMock.set({ geminiExecutionMode: 'background_delete' });
265: ␤ [linha vazia]
266:         await loadExtensionPage({
267:             htmlPath: 'extension/options/options.html',
268:             scriptPath: 'extension/options/options.js',
269:             fireDOMContentLoaded: true,
270:         });
271:         await flushAsyncTasks(4);
272: ␤ [linha vazia]
273:         const secureMode = document.getElementById('gemini-mode-delete');
274:         expect(secureMode).not.toBeNull();
275:         expect(secureMode.checked).toBe(true);
276: ␤ [linha vazia]
277:         document.getElementById('gemini-mode-temp').checked = true;
278:         document.getElementById('gemini-mode-temp').dispatchEvent(new Event('change', { bubbles: true }));
279:         await flushAsyncTasks(4);
280:         expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('temp_chat');
281: ␤ [linha vazia]
282:         secureMode.checked = true;
283:         secureMode.dispatchEvent(new Event('change', { bubbles: true }));
284:         await flushAsyncTasks(4);
285:         expect((await storageMock.get(['geminiExecutionMode'])).geminiExecutionMode).toBe('background_delete');
286:         expect(document.getElementById('gemini-mode-status').textContent).toContain('Exclusão Segura');
287:     });
```

**O que faz / como faz / por que existe:** Pré-carrega `background_delete`, confirma que o radio correspondente restaura checked, alterna para `temp_chat` e de volta para `background_delete`, verificando storage e texto 'Exclusão Segura'.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para restauração/persistência de `background_delete` e `temp_chat`; ⚠️ `minimized_window` não é exercitado aqui.

### Posições 288 — Separação textual

**Fonte coberta:**

```text
288: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia entre cenários.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 289–347 — Cenário: controles de interação e estrutura HTML

**Fonte coberta:**

```text
289:     test('controles de interação restauram preferências e persistem alterações', async () => {
290:         await storageMock.set({
291:             floatingButtonEnabled: false,
292:             clickToTranslateEnabled: true,
293:             redoConfirmEnabled: false,
294:         });
295: ␤ [linha vazia]
296:         await loadExtensionPage({
297:             htmlPath: 'extension/options/options.html',
298:             scriptPath: 'extension/options/options.js',
299:             fireDOMContentLoaded: true,
300:         });
301:         await flushAsyncTasks(5);
302: ␤ [linha vazia]
303:         const floating = document.getElementById('floating-button-enabled');
304:         const single = document.getElementById('click-to-translate-enabled');
305:         const redo = document.getElementById('redo-confirm-enabled');
306: ␤ [linha vazia]
307:         expect(single.closest('label').textContent).toContain('Clique direito para traduzir uma única imagem');
308:         expect(single.closest('label').textContent).toContain('Traduzir esta imagem');
309: ␤ [linha vazia]
310:         const enabledSitesPanel = document.getElementById('enabled-sites-panel');
311:         const enabledSitesTitle = document.getElementById('enabled-sites-title');
312:         const sitesList = document.getElementById('sites-list');
313:         expect(document.querySelectorAll('#redo-confirm-enabled')).toHaveLength(1);
314:         expect(enabledSitesPanel).not.toBeNull();
315:         expect(enabledSitesTitle).not.toBeNull();
316:         expect(enabledSitesTitle.textContent.trim()).toBe('Sites Permitidos');
317:         expect(enabledSitesPanel.getAttribute('aria-labelledby')).toBe('enabled-sites-title');
318:         expect(enabledSitesPanel.contains(redo)).toBe(true);
319:         expect(enabledSitesPanel.contains(sitesList)).toBe(true);
320:         expect(redo.closest('#enabled-sites-panel')).toBe(enabledSitesPanel);
321:         expect(redo.closest('label').textContent).toContain('Confirmar ao apertar o botão de refazer a imagem');
322:         expect(floating.checked).toBe(false);
323:         expect(single.checked).toBe(true);
324:         expect(redo.checked).toBe(false);
325: ␤ [linha vazia]
326:         floating.checked = true;
327:         floating.dispatchEvent(new Event('change', { bubbles: true }));
328:         single.checked = false;
329:         single.dispatchEvent(new Event('change', { bubbles: true }));
330:         redo.checked = true;
331:         redo.dispatchEvent(new Event('change', { bubbles: true }));
332:         await flushAsyncTasks(5);
333: ␤ [linha vazia]
334:         const data = await storageMock.get([
335:             'floatingButtonEnabled',
336:             'clickToTranslateEnabled',
337:             'redoConfirmEnabled',
338:         ]);
339:         expect(data).toEqual(expect.objectContaining({
340:             floatingButtonEnabled: true,
341:             clickToTranslateEnabled: false,
342:             redoConfirmEnabled: true,
343:         }));
344:         const interactionPanel = floating.closest('div[style*="background:#242424"]');
345:         expect(interactionPanel?.querySelector('h3')?.textContent).toContain('Interação na página');
346:         expect(interactionPanel?.contains(redo)).toBe(false);
347:     });
```

**O que faz / como faz / por que existe:** Pré-carrega preferências de botão flutuante, clique para traduzir e confirmação de refazer; verifica texto explicativo, unicidade e localização de `redo-confirm-enabled` dentro de `enabled-sites-panel`, ARIA do painel, estados checked e separação do painel 'Interação na página'. Depois dispara três `change` e exige persistência dos novos valores.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para estrutura HTML real, valores restaurados e persistência das três preferências usando options.js real.

### Posições 348 — Separação textual

**Fonte coberta:**

```text
348: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia antes do fechamento da suíte.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 349 — Fechamento da suíte

**Fonte coberta:**

```text
349: });
```

**O que faz / como faz / por que existe:** Fecha o callback `describe`; não adiciona novo comportamento.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE como parte da sintaxe da suíte.

### Posições 350 — Linha textual vazia final

**Fonte coberta:**

```text
350: ␤ [linha vazia]
```

**O que faz / como faz / por que existe:** Linha vazia preservada antes do newline final do blob.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 351 — Newline final

**Fonte coberta:**

```text
␤ [newline final]
```

**O que faz / como faz / por que existe:** Posição documental que representa o `\n` final após a linha textual 350.

**Por que uma implementação ingênua seria pior:** substituir este bloco por mocks adicionais, seletores menos específicos ou assertions apenas de “não lançou” reduziria a capacidade de detectar regressões no contrato DOM/storage observado; para linhas apenas estruturais, a importância é preservar a composição sintática e a rastreabilidade do caso.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- SHA reconfirmado antes da escrita: `33c34c89f7131ade147ea65b5f5015b79917b708`.
- Fonte integral embutida exatamente como o blob auditado.
- Cobertura documental: **351/351 posições**, em faixas contíguas verificadas programaticamente.
- O arquivo tem **350 linhas textuais + newline final**.
- Wiring cruzado com `jest.config.js`, `package.json` e workflow.
- Implementações reais cruzadas com `options.html`, `options.js`, `shared-ui.js`, helper de carregamento e mock Chrome.
- A prova do GTC foi deliberadamente limitada ao que este teste realmente demonstra; a prova separada do receptor foi identificada, sem promover composição simulada a end-to-end.
- Lacunas externas foram registradas em `.state/113.json` como solicitações, sem alteração de código/testes externos.
- Nenhum arquivo global de coordenação foi modificado pelo AGENTE 5.

**Resultado da autoauditoria do AGENTE 5:** ✅ APROVADA para fidelidade documental do SHA auditado.

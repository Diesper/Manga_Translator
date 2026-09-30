# Bíblia técnica — tests/unit/content-manga/floating-button-guard-and-single-click.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DOCUMENTAL APROVADA  
> **SHA auditado:** 8e8aacd0fc54aa15166cb8e0eaf6d21379a8d088  
> **Agente responsável:** AGENTE 21  
> **Índice do corpus:** 204  
> **Tipo:** suíte Jest/JSDOM do watchdog do botão flutuante e tradução individual por contexto  
> **Linhas textuais:** **410**  
> **Posições documentais:** **411**, contando o newline final  
> **Tamanho textual observado:** **18752 caracteres**

## 1. Papel arquitetural

Esta suíte executa content_manga.js real e cobre duas áreas sensíveis de UI:

1. saúde/autocura do botão flutuante;
2. tradução individual iniciada pela imagem selecionada no menu de contexto.

Ela prova preferências persistentes, MutationObserver/autocura, recuperação de invisibilidade, clamp de viewport, status público do botão, preservação do clique esquerdo nativo, escolha por clique direito, revalidação de elegibilidade e bloqueio durante tradução ativa.

## 2. Produção confrontada

Fonte real: extension/content/content_manga.js, SHA a8b3698019f6f22027f09f544f15c0563a9f6515.

Trechos principais:

- clampFloatingButtonToViewport: cerca das linhas 920–962;
- restoreIntegratedErrorDrawer: 964–991;
- ensureFloatingButtonHealth: 993–1041;
- startButtonGuard: 1043–1055;
- startTranslationButtonWatchdog: 1057–1067;
- setFloatingButtonEnabled: 1075–1089;
- getSingleImageCandidate: 1540–1554;
- resolveContextMenuImage/startSingleImageTranslation: 1588–1640;
- contextmenu capture/lifecycle: 1642–1673;
- TRANSLATE_CONTEXT_IMAGE: 2699–2701;
- DISABLE_PAGE/SET/GET_FLOATING_BUTTON_VISIBILITY: 2717–2740.

## 3. Harness

A suíte usa loadContentScript real, runtime/storage mock e viewport fixo 1024×768.

delay/waitFor lidam com observers/callbacks assíncronos.

logMessages filtra LOG_ENTRY por action_name, permitindo provar não apenas DOM, mas observabilidade específica.

beforeEach reseta módulos, listeners, storage, flags, DOM e dimensões.

afterEach cancela eventual UI auxiliar, despacha pagehide, restaura mocks e limpa o ambiente.

fs é importado na linha 2 e não é utilizado.

## 4. Matriz dos 15 testes

| Caso | Linhas | Propriedade | Classificação |
|---|---:|---|---|
| visibilidade persistente off | 68–76 | não cria botão | ✅ PROVADO DIRETAMENTE |
| toggle off/on | 78–99 | remove/recria sem falso MISSING; logs user disable/enable | ✅ PROVADO DIRETAMENTE |
| remoção externa | 101–116 | detecta, loga MISSING e RECOVERED, cria novo nó | ✅ PROVADO DIRETAMENTE |
| PROGRESS com invisibilidade | 118–138 | restaura display/opacity/texto e log de hidden | ✅ PROVADO DIRETAMENTE |
| posição offscreen | 140–161 | clamp e persistência de btnPos | ✅ PROVADO DIRETAMENTE |
| GET status | 163–187 | distingue enabled/expected/present antes/depois de ocultar | ✅ PROVADO DIRETAMENTE |
| clique esquerdo | 189–204 | não é interceptado nem inicia tradução | ✅ PROVADO DIRETAMENTE |
| clique direito/ação | 206–237 | menu nativo permanece; só imagem escolhida inicia | ✅ PROVADO DIRETAMENTE |
| inelegíveis | 239–259 | pequena/banida/traduzida recusadas | ✅ PROVADO DIRETAMENTE |
| DOM muda | 261–297 | índice é recalculado no momento da ação | ✅ PROVADO DIRETAMENTE |
| site desativado | 299–311 | botão some sem falso MISSING/autocura | ✅ PROVADO DIRETAMENTE |
| remoção em lote | 313–344 | botão recuperado conserva estado de tradução e logs graves | ✅ PROVADO DIRETAMENTE |
| imagem removida | 346–363 | ação aborta sem START_BATCH | ✅ PROVADO DIRETAMENTE |
| tradução já ativa | 365–387 | segundo fluxo é bloqueado | ✅ PROVADO DIRETAMENTE |
| banida após contexto | 390–409 | revalidação no momento da ação recusa | ✅ PROVADO DIRETAMENTE |

## 5. Preferência de visibilidade

Com floatingButtonEnabled=false desde o loader, o botão não existe.

No toggle via storage:

- false remove;
- ausência intencional não gera FLOATING_BUTTON_MISSING;
- FLOATING_BUTTON_DISABLED_BY_USER aparece;
- true recria;
- FLOATING_BUTTON_ENABLED_BY_USER aparece.

Isso distingue ausência legítima de falha.

## 6. Autocura do DOM

Ao remover manualmente o botão em site habilitado, MutationObserver/startButtonGuard detecta ausência e chama ensureFloatingButtonHealth.

A suíte exige novo elemento e logs MISSING + RECOVERED.

Quando a página é desabilitada via DISABLE_PAGE, buttonShouldExist passa a false; remoção não deve disparar autocura nem MISSING.

Esses dois testes juntos provam que a recuperação depende do contrato de existência esperado, não apenas de ausência física.

## 7. Botão invisível e PROGRESS

O teste força display:none!important e opacity:0!important sem remover o nó.

PROGRESS chama ensureFloatingButtonHealth('progress_message') antes de atualizar a UI.

A suíte prova:

- display volta a flex;
- opacity volta a 1;
- texto PROGRESS aparece;
- log FLOATING_BUTTON_HIDDEN ou variante DURING_TRANSLATION é emitido.

Isso prova recuperação de invisibilidade acionada por mensagem de progresso.

Não prova, isoladamente, o timer periódico translation_watchdog sem nova mensagem; ver 204-001.

## 8. Clamp de viewport

Com btnPos top=-600px e left=5000px, produção corrige para a viewport 1024×768.

As assertions cobrem:

- left <= 1024-220;
- top >= 8;
- log FLOATING_BUTTON_OFFSCREEN;
- btnPos corrigido persistido em storage.

**Classificação:** ✅ PROVADO DIRETAMENTE.

## 9. GET_FLOATING_BUTTON_STATUS

Antes de ocultar:

- success=true;
- enabled=true;
- expected=true;
- present=true.

Depois de SET_FLOATING_BUTTON_VISIBILITY false:

- enabled=false;
- expected=false;
- present=false.

O teste não afirma translating/batchId/batchStatus/queuePosition retornados pelo mesmo handler.

Esses campos possuem cobertura em #202 para fila/status por outras superfícies, mas não são prova direta deste caso.

## 10. Clique esquerdo e contexto nativo

Mesmo com clickToTranslateEnabled=true, dispatchEvent de click esquerdo retorna true, não cria UI auxiliar e não envia START_BATCH.

No contextmenu, dispatchEvent também retorna true, mostrando que o listener não chama preventDefault.

A tradução individual é iniciada depois por TRANSLATE_CONTEXT_IMAGE, que resolve a imagem memorizada/src e executa startSingleImageTranslation.

## 11. Revalidação da imagem

getSingleImageCandidate verifica no momento da ação:

- conexão no DOM;
- dataset.translated;
- dimensões mínimas;
- URL banida;
- backdrop/aria-hidden;
- índice atual no NodeList.

A suíte cobre:

- pequena;
- banida;
- translated;
- removida entre contexto e comando;
- banida depois do contexto;
- mudança do DOM antes do comando, recalculando índice 1→2.

Isso reduz risco de agir em referência stale.

## 12. Concorrência de tradução individual

Se isTranslating já é true, startSingleImageTranslation retorna translation_in_progress e emite SINGLE_IMAGE_TRANSLATION_BLOCKED.

A suíte inicia lote normal, tenta contexto na segunda imagem e prova o bloqueio.

Isso impede segundo fluxo local concorrente.

## 13. Recuperação durante tradução ativa

O teste inicia tradução, remove botão e envia PROGRESS para forçar health check.

O botão recriado deve:

- conter STOP;
- não voltar a TRADUZIR PÁGINAS;
- gerar FLOATING_BUTTON_MISSING_DURING_TRANSLATION;
- gerar FLOATING_BUTTON_RECOVERED.

A assertion é deliberadamente tolerante a progresso mais novo do pipeline.

Ela prova preservação de estado de tradução no recovery acionado pelo fluxo observado.

## 14. Lacunas de prova

| Contrato | Estado | Classificação |
|---|---|---|
| watchdog periódico de 1s recupera botão invisível sem PROGRESS/mutação | não localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| drawer de erro pendente é restaurada ao recriar botão | restoreIntegratedErrorDrawer existe, sem caso focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| TRANSLATE_CONTEXT_IMAGE com feature disabled | branch retorna disabled, sem teste localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| TRANSLATE_CONTEXT_IMAGE com página disabled | branch retorna page_disabled, sem teste localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| pagehide persisted/bfcache preserva listeners/estado | branch específico não localizado em testes | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| hidden attr / visibility:hidden isoladamente | branch coberto estruturalmente pela mesma função, mas não cada mecanismo | 🟨 EXECUTADO INDIRETAMENTE pela prova de hidden geral |

## 15. Solicitações ao auditor

### 204-001 — TEST_REQUIRED — OPEN

**Encontrado:** startTranslationButtonWatchdog chama health check a cada 1000ms durante tradução, mas os testes recuperam por MutationObserver ou por mensagem PROGRESS.

**Evidência atual:** remoção externa é autocurada pelo guard; invisibilidade é recuperada após PROGRESS.

**Evidência ausente:** nó ainda conectado porém invisível durante tradução, sem mensagens novas, recuperado exclusivamente pelo tick periódico.

**Ação solicitada:** iniciar lote, ocultar botão por style sem remover do DOM, não enviar PROGRESS, aguardar/avançar >1s e verificar restauração + log com reason translation_watchdog.

**Possível regressão:** botão pode permanecer invisível se o fluxo de progresso parar de emitir mensagens.

**Impacto:** recuperabilidade durante lote ativo.

**Severidade:** HIGH.

### 204-002 — TEST_REQUIRED — OPEN

**Encontrado:** createTranslatorButton chama restoreIntegratedErrorDrawer, mas nenhuma assertion localizada prova que erro pendente sobrevive à remoção/recriação do botão.

**Evidência atual:** #201 prova drawer de erro normal; #204 prova recriação do botão normal e durante tradução.

**Evidência ausente:** composição SHOW_ERROR_INTEGRATED → remoção externa → recovery, preservando hasError, collapsed e conteúdo.

**Ação solicitada:** criar erro real, remover botão, aguardar recovery e verificar que drawer/texto/estado pendente são restaurados.

**Possível regressão:** autocura do botão pode apagar a informação de erro que motivou investigação do usuário.

**Impacto:** diagnóstico e continuidade da UI após falha do DOM.

**Severidade:** HIGH.

### 204-003 — TEST_REQUIRED — OPEN

**Encontrado:** startSingleImageTranslation possui respostas disabled e page_disabled, mas os testes focam inelegibilidade e translation_in_progress.

**Evidência atual:** feature habilitada + página habilitada funciona; DISABLE_PAGE prova remoção do botão, mas não a API TRANSLATE_CONTEXT_IMAGE após disable.

**Evidência ausente:** ação de contexto com clickToTranslateEnabled=false e ação após DISABLE_PAGE.

**Ação solicitada:** adicionar dois casos de contrato do handler real, esperando reason disabled e page_disabled e nenhum START_BATCH.

**Possível regressão:** comando de menu pode iniciar tradução apesar de feature/site desabilitados.

**Impacto:** respeito às preferências e estado da página.

**Severidade:** NORMAL.

Nenhum arquivo externo foi alterado pelo AGENTE 21.

## 16. Gates

jest.config.js inclui tests/unit/content-manga/**/*.test.js no projeto content-scripts JSDOM.

run-jest-ci.js mantém inventário de .test.js e falha se esperado não executado.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO.

## 17. Invariantes

1. botão não deve existir quando visibilidade ou página não o permitem;
2. ausência inesperada em estado esperado deve autocurar;
3. ausência intencional não pode gerar falso MISSING;
4. invisibilidade deve ser tratada como falha de saúde;
5. posição recuperada deve ser persistida;
6. clique esquerdo não deve iniciar tradução individual;
7. contextmenu não deve suprimir menu nativo;
8. imagem deve ser revalidada no momento da ação;
9. índice deve ser recalculado após mutação DOM;
10. segundo fluxo individual não pode iniciar durante lote ativo;
11. botão recriado durante lote não pode regressar para estado idle;
12. esta Bíblia vale somente para SHA 8e8aacd0fc54aa15166cb8e0eaf6d21379a8d088.

## 18. Fonte integral auditada

~~~javascript
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
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        const value = await assertion();
        if (value) return value;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condição');
}

function logMessages(spy, actionName) {
    return spy.mock.calls
        .map(([message]) => message)
        .filter(message => message && message.action === 'LOG_ENTRY' && (!actionName || message.action_name === actionName));
}

describe('content_manga — watchdog do botão flutuante e clique individual', () => {
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
        Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
    });

    afterEach(async () => {
        const cancel = document.getElementById('manga-single-image-cancel');
        if (cancel) cancel.click();
        window.dispatchEvent(new Event('pagehide'));
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('não cria botão quando a visibilidade persistente está desligada', async () => {
        await loadContentScript({
            hostname: 'reader.test',
            floatingButtonEnabled: false,
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        expect(document.getElementById('manga-translator-trigger')).toBeNull();
    });

    test('toggle de visibilidade remove e recria o botão sem registrar falso MISSING', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');

        await loadContentScript({
            hostname: 'reader.test',
            floatingButtonEnabled: true,
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        expect(document.getElementById('manga-translator-trigger')).not.toBeNull();

        await storageMock.set({ floatingButtonEnabled: false });
        await waitFor(() => !document.getElementById('manga-translator-trigger'));

        expect(logMessages(sendSpy, 'FLOATING_BUTTON_MISSING')).toHaveLength(0);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_DISABLED_BY_USER').length).toBeGreaterThanOrEqual(1);

        await storageMock.set({ floatingButtonEnabled: true });
        await waitFor(() => document.getElementById('manga-translator-trigger'));

        expect(logMessages(sendSpy, 'FLOATING_BUTTON_ENABLED_BY_USER').length).toBeGreaterThanOrEqual(1);
    });

    test('remoção externa do DOM gera erro e autocura o botão', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');

        await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const original = document.getElementById('manga-translator-trigger');
        original.remove();

        const recovered = await waitFor(() => document.getElementById('manga-translator-trigger'));
        expect(recovered).not.toBe(original);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_MISSING').length).toBeGreaterThanOrEqual(1);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_RECOVERED').length).toBeGreaterThanOrEqual(1);
    });

    test('PROGRESS recupera botão invisível e registra erro de visibilidade', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const btn = context.getButton();
        btn.style.setProperty('display', 'none', 'important');
        btn.style.setProperty('opacity', '0', 'important');

        await context.sendMessage('PROGRESS', { text: 'TRADUZINDO 1/1' });
        await waitFor(() => context.getButton().style.display === 'flex');

        expect(context.getButton().style.opacity).toBe('1');
        expect(context.getMainContent().textContent).toContain('TRADUZINDO 1/1');
        expect(
            logMessages(sendSpy, 'FLOATING_BUTTON_HIDDEN').length
            + logMessages(sendSpy, 'FLOATING_BUTTON_HIDDEN_DURING_TRANSLATION').length
        ).toBeGreaterThanOrEqual(1);
    });

    test('posição salva fora do viewport é corrigida e persistida', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        await storageMock.set({
            btnPos: { top: '-600px', left: '5000px', width: '220px', height: '48px' },
        });

        await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const btn = document.getElementById('manga-translator-trigger');
        await waitFor(() => parseFloat(btn.style.left) < 1000 && parseFloat(btn.style.top) >= 0);

        expect(parseFloat(btn.style.left)).toBeLessThanOrEqual(1024 - 220);
        expect(parseFloat(btn.style.top)).toBeGreaterThanOrEqual(8);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_OFFSCREEN').length).toBeGreaterThanOrEqual(1);

        const stored = await storageMock.get(['btnPos']);
        expect(parseFloat(stored.btnPos.left)).toBeLessThanOrEqual(1024 - 220);
        expect(parseFloat(stored.btnPos.top)).toBeGreaterThanOrEqual(8);
    });

    test('GET_FLOATING_BUTTON_STATUS diferencia habilitado, presente e ocultado', async () => {
        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const before = await context.sendMessage('GET_FLOATING_BUTTON_STATUS');
        expect(before).toEqual(expect.objectContaining({
            success: true,
            enabled: true,
            expected: true,
            present: true,
        }));

        await context.sendMessage('SET_FLOATING_BUTTON_VISIBILITY', { enabled: false });
        await waitFor(() => !document.getElementById('manga-translator-trigger'));

        const after = await context.sendMessage('GET_FLOATING_BUTTON_STATUS');
        expect(after).toEqual(expect.objectContaining({
            success: true,
            enabled: false,
            expected: false,
            present: false,
        }));
    });

    test('clique esquerdo continua pertencendo ao site mesmo com tradução individual ativada', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const img = document.querySelector('img');
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        expect(img.dispatchEvent(event)).toBe(true);
        await delay(20);

        expect(sendSpy.mock.calls.some(([message]) => message && message.action === 'START_BATCH')).toBe(false);
        expect(document.getElementById('manga-single-image-action')).toBeNull();
    });

    test('clique direito mantém o menu nativo e a ação traduz somente a imagem escolhida', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [
                { src: 'https://reader.test/p1.png', width: 800, height: 1200 },
                { src: 'https://reader.test/p2.png', width: 800, height: 1200 },
            ],
        });

        const target = document.querySelector('[data-testid="img-1"]');
        const nativeMenuEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
        expect(target.dispatchEvent(nativeMenuEvent)).toBe(true);

        const response = await context.sendMessage('TRANSLATE_CONTEXT_IMAGE', { srcUrl: target.src });
        expect(response).toEqual({ ok: true, index: 1 });

        const requestLog = await waitFor(() => {
            const logs = logMessages(sendSpy, 'SINGLE_IMAGE_TRANSLATION_REQUEST');
            return logs.length ? logs[logs.length - 1] : null;
        });
        expect(requestLog.extra.index).toBe(1);
        expect(requestLog.extra.cleanUrl).toContain('/p2.png');

        await waitFor(() => sendSpy.mock.calls.some(([message]) =>
            message && message.action === 'START_BATCH'
        ));
        const main = context.getMainContent();
        if (main) main.click();
        await delay(20);
    });

    test('menu de contexto rejeita imagem pequena, banida ou já traduzida', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            bannedImages: ['https://reader.test/banned.png'],
            domImages: [
                { src: 'https://reader.test/small.png', width: 80, height: 80 },
                { src: 'https://reader.test/banned.png', width: 800, height: 1200 },
                { src: 'https://reader.test/translated.png', width: 800, height: 1200, attributes: { 'data-translated': 'true' } },
            ],
        });

        for (const img of document.querySelectorAll('img')) {
            img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
            const response = await context.sendMessage('TRANSLATE_CONTEXT_IMAGE', { srcUrl: img.src });
            expect(response).toEqual({ ok: false, reason: 'image_ineligible' });
        }

        expect(sendSpy.mock.calls.some(([message]) => message && message.action === 'START_BATCH')).toBe(false);
    });

    test('ação do menu de contexto recalcula o índice quando o DOM muda antes da escolha', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [
                { src: 'https://reader.test/p1.png', width: 800, height: 1200 },
                { src: 'https://reader.test/p2.png', width: 800, height: 1200 },
            ],
        });

        const target = document.querySelector('[data-testid="img-1"]');
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));

        const inserted = document.createElement('img');
        inserted.src = 'https://reader.test/inserted.png';
        Object.defineProperty(inserted, 'naturalWidth', { value: 800, configurable: true });
        Object.defineProperty(inserted, 'naturalHeight', { value: 1200, configurable: true });
        document.body.insertBefore(inserted, document.body.firstChild);

        const response = await context.sendMessage('TRANSLATE_CONTEXT_IMAGE', { srcUrl: target.src });
        expect(response).toEqual({ ok: true, index: 2 });

        const requestLog = await waitFor(() => {
            const logs = logMessages(sendSpy, 'SINGLE_IMAGE_TRANSLATION_REQUEST');
            return logs.length ? logs[logs.length - 1] : null;
        });
        expect(requestLog.extra.index).toBe(2);
        expect(requestLog.extra.cleanUrl).toContain('/p2.png');

        await waitFor(() => sendSpy.mock.calls.some(([message]) =>
            message && message.action === 'START_BATCH'
        ));
        const main = context.getMainContent();
        if (main) main.click();
        await delay(20);
    });

    test('desativar o site remove o botão sem autocura', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        await context.sendMessage('DISABLE_PAGE');
        await waitFor(() => !document.getElementById('manga-translator-trigger'));
        await delay(30);

        expect(logMessages(sendSpy, 'FLOATING_BUTTON_MISSING')).toHaveLength(0);
    });

    test('remoção durante lote ativo registra erro grave e recria com o progresso mais recente', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            domImages: [{ src: 'https://reader.test/p1.png', width: 800, height: 1200 }],
        });

        const startPromise = context.sendMessage('START_TRANSLATION_FROM_POPUP', { indices: [0] });
        await delay(5);
        const oldButton = context.getButton();
        expect(oldButton).not.toBeNull();
        oldButton.remove();

        await context.sendMessage('PROGRESS', { text: 'TRADUZINDO 1/1 — TESTE' });
        const recovered = await waitFor(() => {
            const button = context.getButton();
            return button && button !== oldButton ? button : null;
        });

        // O pipeline pode emitir um progresso ainda mais novo depois da mensagem
        // manual usada para forçar a recuperação. O contrato é que o botão
        // recriado continue refletindo estado de tradução, nunca volte a
        // "TRADUZIR PÁGINAS".
        const recoveredText = context.getMainContent().textContent;
        expect(recoveredText).toContain('STOP');
        expect(recoveredText).not.toContain('TRADUZIR PÁGINAS');
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_MISSING_DURING_TRANSLATION').length).toBeGreaterThanOrEqual(1);
        expect(logMessages(sendSpy, 'FLOATING_BUTTON_RECOVERED').length).toBeGreaterThanOrEqual(1);

        await context.sendMessage('BATCH_COMPLETE', { hasErrors: false });
        await startPromise;
    });

    test('imagem removida entre clique e confirmação aborta sem iniciar tradução — agora via clique direito', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [{ src: 'https://reader.test/remove-before-action.png', width: 800, height: 1200 }],
        });

        sendSpy.mockClear();
        const img = document.querySelector('img');
        img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
        img.remove();

        const response = await context.sendMessage('TRANSLATE_CONTEXT_IMAGE', { srcUrl: 'https://reader.test/remove-before-action.png' });
        expect(response).toEqual({ ok: false, reason: 'image_ineligible' });
        expect(logMessages(sendSpy, 'SINGLE_IMAGE_TRANSLATION_ABORTED').length).toBeGreaterThanOrEqual(1);
        expect(sendSpy.mock.calls.some(([message]) => message && message.action === 'START_BATCH')).toBe(false);
    });

    test('ação de clique direito durante tradução ativa não abre segundo fluxo', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [
                { src: 'https://reader.test/p1.png', width: 800, height: 1200 },
                { src: 'https://reader.test/p2.png', width: 800, height: 1200 },
            ],
        });

        context.sendMessage('START_TRANSLATION_FROM_POPUP', { indices: [0] });
        await delay(5);

        const target = document.querySelector('[data-testid="img-1"]');
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
        const response = await context.sendMessage('TRANSLATE_CONTEXT_IMAGE', { srcUrl: target.src });

        expect(response).toEqual({ ok: false, reason: 'translation_in_progress' });
        expect(logMessages(sendSpy, 'SINGLE_IMAGE_TRANSLATION_BLOCKED').length).toBeGreaterThanOrEqual(1);

        await context.sendMessage('BATCH_COMPLETE', { hasErrors: false });
    });


    test('banir a imagem depois do clique direito faz a ação revalidar e recusar a tradução', async () => {
        const sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
        const context = await loadContentScript({
            hostname: 'reader.test',
            clickToTranslateEnabled: true,
            domImages: [{ src: 'https://reader.test/becomes-banned.png', width: 800, height: 1200 }],
        });

        const img = document.querySelector('img');
        img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));

        await storageMock.set({
            'bannedImages_reader.test': ['https://reader.test/becomes-banned.png'],
        });

        const response = await context.sendMessage('TRANSLATE_CONTEXT_IMAGE', { srcUrl: img.src });
        expect(response).toEqual({ ok: false, reason: 'image_ineligible' });
        expect(sendSpy.mock.calls.some(([message]) => message && message.action === 'START_BATCH')).toBe(false);
    });

});
~~~

O blob termina com newline LF.

## 19. Cobertura posição a posição

### Linhas 1–16
Imports, root, globals e harness. fs não é usado. **Evidência:** 🟨 bootstrap.

### Linhas 17–29
delay/waitFor com Date.now. **Evidência:** ✅ usado em observers/callbacks.

### Linhas 30–36
logMessages filtra telemetria runtime. **Evidência:** ✅ usado em assertions de saúde/single image.

### Linhas 38–42
Abrem suíte e mocks. **Evidência:** 🟨 estrutura.

### Linhas 44–57
beforeEach limpa módulos/listeners/storage/DOM e fixa viewport. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 59–66
afterEach fecha UI auxiliar, pagehide e limpa ambiente. **Evidência:** 🟨.

### Linhas 68–76
Floating disabled no bootstrap: botão ausente. **Evidência:** ✅.

### Linhas 78–99
Toggle storage off/on, ausência sem falso MISSING e logs explícitos. **Evidência:** ✅.

### Linhas 101–116
Remove nó manualmente e espera novo botão + MISSING/RECOVERED. **Evidência:** ✅.

### Linhas 118–138
Torna nó invisível, envia PROGRESS e prova restauração visual/log. **Evidência:** ✅.

### Linhas 140–161
Posição inválida é clampada e persistida. **Evidência:** ✅.

### Linhas 163–187
Status antes/depois de SET visibility false. **Evidência:** ✅ para enabled/expected/present.

### Linhas 189–204
Clique esquerdo permanece do site; nenhum batch nem ação auxiliar. **Evidência:** ✅.

### Linhas 206–237
Contextmenu nativo + comando traduz apenas p2/index1, com log cleanUrl. **Evidência:** ✅.

### Linhas 239–259
Três classes inelegíveis recusadas; nenhum START_BATCH. **Evidência:** ✅.

### Linhas 261–297
Insere imagem antes do alvo e prova recálculo para índice2. **Evidência:** ✅.

### Linhas 299–311
DISABLE_PAGE remove botão e não gera MISSING. **Evidência:** ✅.

### Linhas 313–344
Durante lote, remove botão, força recovery por PROGRESS e prova estado STOP + logs de gravidade/recovery. **Evidência:** ✅.

### Linhas 346–363
Imagem removida após contexto é revalidada/abortada. **Evidência:** ✅.

### Linhas 365–387
Context action durante tradução retorna translation_in_progress e log BLOCKED. **Evidência:** ✅.

### Linhas 388–389
Separação estrutural.

### Linhas 390–409
Imagem banida entre contexto e comando é recusada. **Evidência:** ✅.

### Linha 410
Fecha describe. **Evidência:** 🟨.

### Posição 411
Posição vazia do LF terminal.

## 20. Análise crítica

1. A suíte cobre falhas reais do botão que eram difíceis de observar apenas por UI.
2. Telemetria é assertada junto com autocura, aumentando diagnóstico.
3. O caso de posição valida DOM e persistência.
4. A tradução individual foi desenhada para contexto nativo, e o teste confirma não interceptar clique esquerdo/contextmenu.
5. Revalidação tardia cobre DOM removido, ban recém-aplicado e índice deslocado.
6. O watchdog periódico em si ainda não é isolado dos outros gatilhos de health check.
7. A restauração da drawer de erro após recriação merece caso combinado.
8. Os dois primeiros guards de startSingleImageTranslation ainda não têm casos focais.
9. fs é import morto.
10. A suíte executa a implementação real via loader.

## 21. Autoauditoria documental

- reserva exclusiva confirmada para **AGENTE 21**;
- SHA reconfirmado: **8e8aacd0fc54aa15166cb8e0eaf6d21379a8d088**;
- fonte integral embutida exatamente;
- **410 linhas textuais + newline final = 411/411 posições**;
- 15 testes/43 expectations mapeados;
- produção confrontada em health, watchdog, clamp, context image e handlers;
- buscas por watchdog, restore drawer e disabled/page_disabled feitas antes dos pedidos;
- nenhum arquivo externo foi alterado.

**Conclusão documental:** Bíblia completa; pode ser marcada **COMPLETED** com 204-001..003 OPEN.

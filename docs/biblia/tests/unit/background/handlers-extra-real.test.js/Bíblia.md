# Bíblia técnica — tests/unit/background/handlers-extra-real.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 8  
> **SHA auditado:** 2089f42642fc3b16856b0d39ea4f824e6e8dec08  
> **Índice:** 148  
> **Linhas textuais:** 181 — **posições:** 182 com newline final  
> **PR:** #66 — **branch:** docs/project-bible

## 1. Papel da suíte

Esta suíte carrega o `extension/background.js` real contra os mocks compartilhados de Chrome e prova quatro regressões de alto nível: inicialização do `defaultPrompt`, persistência/broadcast de `SET_DEBUG_MODE`, reutilização de `anchorId` em `SHOW_EXISTING_FOLDER` e retenção dos 500 logs mais recentes.

Diferentemente de testes de actions isoladas, ela atravessa o listener real registrado pelo background. O helper `getBackgroundListener` exige cardinalidade exatamente 1; portanto listeners duplicados de mensagem são tratados como falha de isolamento.

## 2. Implementações relacionadas

`extension/background.js` estava em `667c05eb2d7adfca16a79d3e706c39a1e9398b72`. Seu `onInstalled` (linhas 649–653) grava `DEFAULT_TRANSLATION_PROMPT` quando `defaultPrompt` está ausente. O logger central limita `translatorLog` a 500 entradas (linha 421).

`set-debug-mode.js` estava em `92e4149b1bba2f8d0a4ce3d6881539565801776d`: valida booleano, persiste em storage e envia `DEBUG_MODE_CHANGED` a todas as tabs.

`open-existing-folder.js` estava em `59ef82cbf960e360eb404fbd969067f017021607`: tenta anchorId existente, depois busca por path e por fim chama `handleMarkerAndShow`.

`log-entry.js` estava em `d57e1a25531beca36510928564ffd855f607881b`: valida campos opcionais e encaminha a entrada ao logger do contexto.

## 3. Semântica do mock de onInstalled

O `chrome-api.mock.js` auditado (`c1d9a056b7777183bfd3f540c49811335f410425`) implementa `onInstalled.addListener` adicionando o callback e **agendando imediatamente** `fn({reason:'install'})`. Assim, simplesmente carregar background.js provoca uma instalação simulada.

Isso explica por que o teste de defaultPrompt não chama `_simulateInstall`. Contudo, o comportamento difere da API Chrome real, em que registrar um listener não dispara o evento. O mock também possui `_simulateInstall`, mas a busca no repositório não encontrou consumidores atuais desse método.

## 4. Evidência automatizada

| Comportamento | Evidência | Classificação |
|---|---|---|
| background registra exatamente um listener de mensagens nesta fixture | `getBackgroundListener` exige length===1 em cada dispatch | ✅ PROVADO DIRETAMENTE nos três testes de mensagem |
| instalação inicial grava prompt default útil | storage é limpo, background é carregado, mock auto-dispara install e assertions verificam string/conteúdo/tamanho | ✅ PROVADO DIRETAMENTE sob a semântica do mock |
| SET_DEBUG_MODE persiste true | relê storage e exige `debugMode===true` | ✅ PROVADO DIRETAMENTE |
| SET_DEBUG_MODE broadcasta a todas as tabs abertas | duas tabs com handlers distintos recebem `DEBUG_MODE_CHANGED` | ✅ PROVADO DIRETAMENTE |
| anchorId válido é reutilizado | fixture de download existente + assertion show(44) | ✅ PROVADO DIRETAMENTE |
| anchorId válido não cria novo download | spy de downloads.download exige zero chamadas | ✅ PROVADO DIRETAMENTE |
| logger mantém exatamente 500 de 505 entradas | waitFor 500 + endpoints log-5/log-504 | ✅ PROVADO DIRETAMENTE |
| payload inválido de SET_DEBUG_MODE | coberto em `actions-low-risk.test.js`, não neste arquivo | ✅ PROVADO DIRETAMENTE por suíte externa |
| fallback/marker de SHOW_EXISTING_FOLDER | coberto em `open-existing-folder-action.test.js` e regex-escape; não neste caso | ✅ PROVADO DIRETAMENTE por suítes externas relevantes |
| preservação de prompt customizado já existente | nenhuma assertion focal localizada no material consultado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Isolamento e cleanup

O setup zera `_messageListeners` e `_connectListeners`, porém não zera `_installedListeners` nem `_startupListeners`. Isso contrasta com várias suítes background (`helpers-real`, `lifecycle-alarms-real`, `process-finalize-real`, entre outras), que limpam explicitamente os quatro arrays.

Como cada require de background registra onInstalled/onStartup, esses arrays podem crescer ao longo dos quatro testes. O mock de onInstalled também cria timer ao registrar; este arquivo não chama `clearMessageTimers` no teardown.

## 6. Análise crítica

1. A prova de onInstalled depende de uma semântica especial do mock que auto-dispara instalação.
2. Installed/startup listeners não são limpos aqui; há potencial de estado residual dentro do singleton runtimeMock.
3. O teste do prompt cobre somente storage inicialmente vazio.
4. O caso de debug é forte para duas tabs, mas não testa erro de sendMessage; a action deliberadamente ignora lastError de broadcast.
5. O caso de anchor cobre o caminho rápido; fallback já possui evidência em suítes especializadas.
6. O teste de logs é serial (505 dispatches aguardados), então prova cap/ordem, não concorrência/batching; outras suítes de helper/performance cobrem bursts.
7. `waitFor` dá timeout focal de 4 s ao flush de logs, mas os outros flushes usam número fixo de ticks.
8. `dispatchToBackground` trata corretamente retorno false sem response, reduzindo risco de Promise pendente para handlers síncronos.

## 7. Solicitações ao auditor

### 148-001 — TEST_ISOLATION_REVIEW — OPEN

Este arquivo não limpa `_installedListeners`, `_startupListeners` nem timers pendentes do runtime mock, enquanto várias suítes irmãs limpam installed/startup explicitamente. Auditar e padronizar reset para impedir estado residual entre casos. **Severidade: HIGH.**

### 148-002 — MOCK_SEMANTICS_REVIEW — OPEN

`onInstalled.addListener` no mock auto-dispara instalação, diferente do Chrome real, apesar de existir `_simulateInstall`. Decidir se a simulação deve ser explícita e atualizar testes separadamente se necessário. **Severidade: NORMAL.**

### 148-003 — TEST_REQUIRED — OPEN

Adicionar prova de que um `defaultPrompt` já personalizado não é sobrescrito por onInstalled; o branch `if (!data.defaultPrompt)` existe no background, mas esta suíte só parte de storage vazio. **Severidade: NORMAL.**

## 8. Invariantes

1. O background real deve continuar sendo carregado em módulo isolado.
2. Cada dispatch deve encontrar exatamente um runtime.onMessage listener.
3. Instalação em storage vazio deve persistir prompt default não trivial.
4. SET_DEBUG_MODE deve persistir e broadcastar a todas as tabs.
5. Anchor existente deve ser mostrado sem criar download novo.
6. O logger deve reter somente os 500 registros mais recentes e preservar ordem.
7. Evidência de fallback/debug inválido proveniente de outras suítes deve permanecer distinguida desta unidade.
8. O SHA desta Bíblia vale apenas para `2089f42642fc3b16856b0d39ea4f824e6e8dec08`.

## 9. Fonte integral auditada

~~~javascript
const path = require('path');

const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getDownloadsMock,
    getAlarmsMock,
} = require('../../mocks/chrome-api.mock.js');

const BACKGROUND_PATH = path.resolve(__dirname, '../../../extension/background.js');

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function flush(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        await delay(0);
    }
}

async function waitFor(assertion, { timeout = 4000, interval = 10 } = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condição assíncrona');
}

function getBackgroundListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    if (listeners.length !== 1) {
        throw new Error(`Esperava 1 listener do background, recebi ${listeners.length}`);
    }
    return listeners[0];
}

function dispatchToBackground(runtimeMock, request, sender = { tab: null }) {
    return new Promise((resolve) => {
        let settled = false;
        let keepAlive = false;

        const sendResponse = (response) => {
            settled = true;
            resolve({ keepAlive, response });
        };

        keepAlive = getBackgroundListener(runtimeMock)(request, sender, sendResponse);
        if (keepAlive === false && !settled) {
            resolve({ keepAlive, response: undefined });
        }
    });
}

describe('background.js - handlers extras e regressions reais', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let downloadsMock;
    let alarmsMock;

    beforeEach(async () => {
        jest.resetModules();

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        downloadsMock = getDownloadsMock();
        alarmsMock = getAlarmsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;

        await storageMock.clear();

        jest.isolateModules(() => {
            require(BACKGROUND_PATH);
        });

        await flush(10);
    });

    afterEach(async () => {
        alarmsMock.clearAll();
        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        await storageMock.clear();
    });

    test('onInstalled define o defaultPrompt no storage local', async () => {
        const data = await storageMock.get(['defaultPrompt']);

        expect(typeof data.defaultPrompt).toBe('string');
        expect(data.defaultPrompt).toContain('Objetivo primário');
        expect(data.defaultPrompt.length).toBeGreaterThan(100);
    });

    test('SET_DEBUG_MODE persiste o estado e faz broadcast para todas as tabs abertas', async () => {
        const firstTab = await tabsMock.create({ url: 'https://reader.test/a', active: true });
        const secondTab = await tabsMock.create({ url: 'https://reader.test/b', active: false });
        const firstMessages = [];
        const secondMessages = [];

        tabsMock._registerMessageHandler(firstTab.id, (message, _sender, sendResponse) => {
            firstMessages.push(message);
            sendResponse({ ok: true });
        });
        tabsMock._registerMessageHandler(secondTab.id, (message, _sender, sendResponse) => {
            secondMessages.push(message);
            sendResponse({ ok: true });
        });

        const result = await dispatchToBackground(runtimeMock, {
            action: 'SET_DEBUG_MODE',
            debugOn: true,
        });

        await flush(8);

        expect(result.response).toEqual({ ok: true });

        const data = await storageMock.get(['debugMode']);
        expect(data.debugMode).toBe(true);
        expect(firstMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });
        expect(secondMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });
    });

    test('SHOW_EXISTING_FOLDER reutiliza anchorId valido sem fazer novo download', async () => {
        downloadsMock._downloads.set(44, {
            id: 44,
            url: 'data:image/png;base64,MARKER',
            filename: '/home/user/Downloads/MangaTranslator/Chapter_10/_anchor.png',
            state: 'complete',
            exists: true,
        });

        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();
        const downloadSpy = jest.spyOn(downloadsMock, 'download');

        const result = await dispatchToBackground(runtimeMock, {
            action: 'SHOW_EXISTING_FOLDER',
            folderPath: '/home/user/Downloads/MangaTranslator/Chapter_10',
            safeTitle: 'Chapter_10',
            anchorId: 44,
        });

        await flush(6);

        expect(result.response).toEqual({ ok: true });
        expect(showSpy).toHaveBeenCalledWith(44);
        expect(downloadSpy).not.toHaveBeenCalled();
    });

    test('LOG_ENTRY mantém somente os 500 registros mais recentes', async () => {
        for (let index = 0; index < 505; index++) {
            // eslint-disable-next-line no-await-in-loop
            await dispatchToBackground(runtimeMock, {
                action: 'LOG_ENTRY',
                level: 'info',
                source: 'test',
                action_name: 'SPAM',
                detail: `log-${index}`,
                extra: { index },
            });
        }

        const logs = await waitFor(async () => {
            const data = await storageMock.get(['translatorLog']);
            const entries = data.translatorLog || [];
            return entries.length === 500 ? entries : null;
        });

        expect(logs).toHaveLength(500);
        expect(logs[0]).toEqual(expect.objectContaining({ detail: 'log-5' }));
        expect(logs[499]).toEqual(expect.objectContaining({ detail: 'log-504' }));
    });
});
~~~

## 10. Cobertura posição por posição

### Linha 001

- **Conteúdo:** `const path = require('path');`
- **Papel:** Importa path para resolver o background real.

### Linha 002

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 003

- **Conteúdo:** `const {`
- **Papel:** Abre a desestruturação dos factories de mocks compartilhados.

### Linha 004

- **Conteúdo:** `    getRuntimeMock,`
- **Papel:** Importa getRuntimeMock.

### Linha 005

- **Conteúdo:** `    getStorageMock,`
- **Papel:** Importa getStorageMock.

### Linha 006

- **Conteúdo:** `    getTabsMock,`
- **Papel:** Importa getTabsMock.

### Linha 007

- **Conteúdo:** `    getDownloadsMock,`
- **Papel:** Importa getDownloadsMock.

### Linha 008

- **Conteúdo:** `    getAlarmsMock,`
- **Papel:** Importa getAlarmsMock.

### Linha 009

- **Conteúdo:** `} = require('../../mocks/chrome-api.mock.js');`
- **Papel:** Fecha o require do mock Chrome compartilhado.

### Linha 010

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 011

- **Conteúdo:** `const BACKGROUND_PATH = path.resolve(__dirname, '../../../extension/background.js');`
- **Papel:** Resolve extension/background.js real a partir do diretório do teste.

### Linha 012

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 013

- **Conteúdo:** `function delay(ms = 0) {`
- **Papel:** Declara delay assíncrono baseado em setTimeout.

### Linha 014

- **Conteúdo:** `    return new Promise(resolve => setTimeout(resolve, ms));`
- **Papel:** Retorna Promise resolvida após ms.

### Linha 015

- **Conteúdo:** `}`
- **Papel:** Fecha delay.

### Linha 016

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 017

- **Conteúdo:** `async function flush(rounds = 6) {`
- **Papel:** Declara flush com seis rounds default.

### Linha 018

- **Conteúdo:** `    for (let i = 0; i < rounds; i++) {`
- **Papel:** Repete rounds vezes.

### Linha 019

- **Conteúdo:** `        await delay(0);`
- **Papel:** Aguarda um tick zero em cada round para drenar callbacks agendados.

### Linha 020

- **Conteúdo:** `    }`
- **Papel:** Fecha loop.

### Linha 021

- **Conteúdo:** `}`
- **Papel:** Fecha flush.

### Linha 022

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 023

- **Conteúdo:** `async function waitFor(assertion, { timeout = 4000, interval = 10 } = {}) {`
- **Papel:** Declara waitFor com timeout 4s e polling 10ms.

### Linha 024

- **Conteúdo:** `    const startedAt = Date.now();`
- **Papel:** Captura início para deadline.

### Linha 025

- **Conteúdo:** `    while (Date.now() - startedAt < timeout) {`
- **Papel:** Repete até timeout.

### Linha 026

- **Conteúdo:** `        const result = await assertion();`
- **Papel:** Executa a assertion/predicate assíncrona.

### Linha 027

- **Conteúdo:** `        if (result) return result;`
- **Papel:** Retorna imediatamente quando predicate produz valor truthy.

### Linha 028

- **Conteúdo:** `        await delay(interval);`
- **Papel:** Aguarda intervalo antes de tentar novamente.

### Linha 029

- **Conteúdo:** `    }`
- **Papel:** Fecha loop.

### Linha 030

- **Conteúdo:** `    throw new Error('Timeout aguardando condição assíncrona');`
- **Papel:** Falha explicitamente ao estourar timeout.

### Linha 031

- **Conteúdo:** `}`
- **Papel:** Fecha waitFor.

### Linha 032

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 033

- **Conteúdo:** `function getBackgroundListener(runtimeMock) {`
- **Papel:** Declara helper que exige exatamente um listener de mensagens do background.

### Linha 034

- **Conteúdo:** `    const listeners = runtimeMock._messageListeners || [];`
- **Papel:** Lê _messageListeners do runtime mock.

### Linha 035

- **Conteúdo:** `    if (listeners.length !== 1) {`
- **Papel:** Valida cardinalidade igual a um.

### Linha 036

- **Conteúdo:** `        throw new Error(\`Esperava 1 listener do background, recebi ${listeners.length}\`);`
- **Papel:** Lança diagnóstico com cardinalidade real se o isolamento falhar.

### Linha 037

- **Conteúdo:** `    }`
- **Papel:** Fecha validação.

### Linha 038

- **Conteúdo:** `    return listeners[0];`
- **Papel:** Retorna o único listener.

### Linha 039

- **Conteúdo:** `}`
- **Papel:** Fecha helper.

### Linha 040

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 041

- **Conteúdo:** `function dispatchToBackground(runtimeMock, request, sender = { tab: null }) {`
- **Papel:** Declara dispatchToBackground para simular chrome.runtime.onMessage diretamente.

### Linha 042

- **Conteúdo:** `    return new Promise((resolve) => {`
- **Papel:** Abre Promise de resposta.

### Linha 043

- **Conteúdo:** `        let settled = false;`
- **Papel:** Controla se sendResponse já foi chamado.

### Linha 044

- **Conteúdo:** `        let keepAlive = false;`
- **Papel:** Inicializa keepAlive como false.

### Linha 045

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 046

- **Conteúdo:** `        const sendResponse = (response) => {`
- **Papel:** Declara sendResponse capturado.

### Linha 047

- **Conteúdo:** `            settled = true;`
- **Papel:** Marca a Promise como respondida.

### Linha 048

- **Conteúdo:** `            resolve({ keepAlive, response });`
- **Papel:** Resolve com keepAlive e payload.

### Linha 049

- **Conteúdo:** `        };`
- **Papel:** Fecha sendResponse.

### Linha 050

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 051

- **Conteúdo:** `        keepAlive = getBackgroundListener(runtimeMock)(request, sender, sendResponse);`
- **Papel:** Invoca o único listener real com request/sender e captura retorno síncrono.

### Linha 052

- **Conteúdo:** `        if (keepAlive === false && !settled) {`
- **Papel:** Trata listener síncrono que retorna false sem resposta.

### Linha 053

- **Conteúdo:** `            resolve({ keepAlive, response: undefined });`
- **Papel:** Resolve sem payload nesse caso.

### Linha 054

- **Conteúdo:** `        }`
- **Papel:** Fecha fallback.

### Linha 055

- **Conteúdo:** `    });`
- **Papel:** Fecha Promise.

### Linha 056

- **Conteúdo:** `}`
- **Papel:** Fecha dispatch.

### Linha 057

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 058

- **Conteúdo:** `describe('background.js - handlers extras e regressions reais', () => {`
- **Papel:** Abre a suíte de regressões reais do background.

### Linha 059

- **Conteúdo:** `    let runtimeMock;`
- **Papel:** Declara referência ao runtime mock.

### Linha 060

- **Conteúdo:** `    let storageMock;`
- **Papel:** Declara storage mock.

### Linha 061

- **Conteúdo:** `    let tabsMock;`
- **Papel:** Declara tabs mock.

### Linha 062

- **Conteúdo:** `    let downloadsMock;`
- **Papel:** Declara downloads mock.

### Linha 063

- **Conteúdo:** `    let alarmsMock;`
- **Papel:** Declara alarms mock.

### Linha 064

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 065

- **Conteúdo:** `    beforeEach(async () => {`
- **Papel:** Inicia beforeEach assíncrono.

### Linha 066

- **Conteúdo:** `        jest.resetModules();`
- **Papel:** Limpa registry de módulos Jest.

### Linha 067

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 068

- **Conteúdo:** `        runtimeMock = getRuntimeMock();`
- **Papel:** Obtém singleton runtime mock.

### Linha 069

- **Conteúdo:** `        storageMock = getStorageMock();`
- **Papel:** Obtém singleton storage mock.

### Linha 070

- **Conteúdo:** `        tabsMock = getTabsMock();`
- **Papel:** Obtém tabs mock.

### Linha 071

- **Conteúdo:** `        downloadsMock = getDownloadsMock();`
- **Papel:** Obtém downloads mock.

### Linha 072

- **Conteúdo:** `        alarmsMock = getAlarmsMock();`
- **Papel:** Obtém alarms mock.

### Linha 073

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 074

- **Conteúdo:** `        runtimeMock._messageListeners = [];`
- **Papel:** Zera apenas listeners de mensagem.

### Linha 075

- **Conteúdo:** `        runtimeMock._connectListeners = [];`
- **Papel:** Zera apenas listeners de conexão.

### Linha 076

- **Conteúdo:** `        runtimeMock.lastError = null;`
- **Papel:** Limpa runtime.lastError.

### Linha 077

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 078

- **Conteúdo:** `        await storageMock.clear();`
- **Papel:** Limpa storage antes de carregar background.

### Linha 079

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 080

- **Conteúdo:** `        jest.isolateModules(() => {`
- **Papel:** Isola requires do background.

### Linha 081

- **Conteúdo:** `            require(BACKGROUND_PATH);`
- **Papel:** Carrega extension/background.js real.

### Linha 082

- **Conteúdo:** `        });`
- **Papel:** Fecha isolateModules.

### Linha 083

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 084

- **Conteúdo:** `        await flush(10);`
- **Papel:** Aguarda callbacks assíncronos, inclusive auto-fire de onInstalled no mock.

### Linha 085

- **Conteúdo:** `    });`
- **Papel:** Fecha beforeEach.

### Linha 086

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 087

- **Conteúdo:** `    afterEach(async () => {`
- **Papel:** Inicia afterEach.

### Linha 088

- **Conteúdo:** `        alarmsMock.clearAll();`
- **Papel:** Limpa alarms.

### Linha 089

- **Conteúdo:** `        tabsMock._tabs.clear();`
- **Papel:** Limpa mapa de tabs.

### Linha 090

- **Conteúdo:** `        downloadsMock._downloads.clear();`
- **Papel:** Limpa mapa de downloads.

### Linha 091

- **Conteúdo:** `        await storageMock.clear();`
- **Papel:** Limpa storage.

### Linha 092

- **Conteúdo:** `    });`
- **Papel:** Fecha afterEach; installed/startup listeners e timers do runtime não são limpos aqui.

### Linha 093

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 094

- **Conteúdo:** `    test('onInstalled define o defaultPrompt no storage local', async () => {`
- **Papel:** Abre teste de instalação/defaultPrompt.

### Linha 095

- **Conteúdo:** `        const data = await storageMock.get(['defaultPrompt']);`
- **Papel:** Lê defaultPrompt do storage após bootstrap.

### Linha 096

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 097

- **Conteúdo:** `        expect(typeof data.defaultPrompt).toBe('string');`
- **Papel:** Prova que defaultPrompt persistido é string.

### Linha 098

- **Conteúdo:** `        expect(data.defaultPrompt).toContain('Objetivo primário');`
- **Papel:** Prova marcador semântico 'Objetivo primário'.

### Linha 099

- **Conteúdo:** `        expect(data.defaultPrompt.length).toBeGreaterThan(100);`
- **Papel:** Prova que prompt default não é trivial (>100 chars).

### Linha 100

- **Conteúdo:** `    });`
- **Papel:** Fecha teste de onInstalled.

### Linha 101

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 102

- **Conteúdo:** `    test('SET_DEBUG_MODE persiste o estado e faz broadcast para todas as tabs abertas', async () => {`
- **Papel:** Abre teste de SET_DEBUG_MODE persistência + broadcast.

### Linha 103

- **Conteúdo:** `        const firstTab = await tabsMock.create({ url: 'https://reader.test/a', active: true });`
- **Papel:** Cria primeira tab ativa.

### Linha 104

- **Conteúdo:** `        const secondTab = await tabsMock.create({ url: 'https://reader.test/b', active: false });`
- **Papel:** Cria segunda tab inativa.

### Linha 105

- **Conteúdo:** `        const firstMessages = [];`
- **Papel:** Coleta mensagens da primeira tab.

### Linha 106

- **Conteúdo:** `        const secondMessages = [];`
- **Papel:** Coleta mensagens da segunda tab.

### Linha 107

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 108

- **Conteúdo:** `        tabsMock._registerMessageHandler(firstTab.id, (message, _sender, sendResponse) => {`
- **Papel:** Registra handler da primeira tab.

### Linha 109

- **Conteúdo:** `            firstMessages.push(message);`
- **Papel:** Acumula mensagem recebida.

### Linha 110

- **Conteúdo:** `            sendResponse({ ok: true });`
- **Papel:** Responde ok ao sender.

### Linha 111

- **Conteúdo:** `        });`
- **Papel:** Fecha handler da primeira tab.

### Linha 112

- **Conteúdo:** `        tabsMock._registerMessageHandler(secondTab.id, (message, _sender, sendResponse) => {`
- **Papel:** Registra handler da segunda tab.

### Linha 113

- **Conteúdo:** `            secondMessages.push(message);`
- **Papel:** Acumula segunda mensagem.

### Linha 114

- **Conteúdo:** `            sendResponse({ ok: true });`
- **Papel:** Responde ok.

### Linha 115

- **Conteúdo:** `        });`
- **Papel:** Fecha segundo handler.

### Linha 116

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 117

- **Conteúdo:** `        const result = await dispatchToBackground(runtimeMock, {`
- **Papel:** Despacha request real ao listener do background.

### Linha 118

- **Conteúdo:** `            action: 'SET_DEBUG_MODE',`
- **Papel:** Seleciona action legada SET_DEBUG_MODE.

### Linha 119

- **Conteúdo:** `            debugOn: true,`
- **Papel:** Define debugOn true.

### Linha 120

- **Conteúdo:** `        });`
- **Papel:** Fecha request.

### Linha 121

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 122

- **Conteúdo:** `        await flush(8);`
- **Papel:** Drena callbacks de broadcast.

### Linha 123

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 124

- **Conteúdo:** `        expect(result.response).toEqual({ ok: true });`
- **Papel:** Prova resposta ok.

### Linha 125

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 126

- **Conteúdo:** `        const data = await storageMock.get(['debugMode']);`
- **Papel:** Relê debugMode persistido.

### Linha 127

- **Conteúdo:** `        expect(data.debugMode).toBe(true);`
- **Papel:** Prova persistência true.

### Linha 128

- **Conteúdo:** `        expect(firstMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });`
- **Papel:** Prova broadcast na primeira tab.

### Linha 129

- **Conteúdo:** `        expect(secondMessages).toContainEqual({ action: 'DEBUG_MODE_CHANGED', debugOn: true });`
- **Papel:** Prova broadcast na segunda tab.

### Linha 130

- **Conteúdo:** `    });`
- **Papel:** Fecha teste de debug.

### Linha 131

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 132

- **Conteúdo:** `    test('SHOW_EXISTING_FOLDER reutiliza anchorId valido sem fazer novo download', async () => {`
- **Papel:** Abre teste de reutilização de anchorId.

### Linha 133

- **Conteúdo:** `        downloadsMock._downloads.set(44, {`
- **Papel:** Insere download marcador conhecido no mock.

### Linha 134

- **Conteúdo:** `            id: 44,`
- **Papel:** Define id 44.

### Linha 135

- **Conteúdo:** `            url: 'data:image/png;base64,MARKER',`
- **Papel:** Define URL data do marcador.

### Linha 136

- **Conteúdo:** `            filename: '/home/user/Downloads/MangaTranslator/Chapter_10/_anchor.png',`
- **Papel:** Define filename absoluto do anchor.

### Linha 137

- **Conteúdo:** `            state: 'complete',`
- **Papel:** Marca download complete.

### Linha 138

- **Conteúdo:** `            exists: true,`
- **Papel:** Marca arquivo como existente.

### Linha 139

- **Conteúdo:** `        });`
- **Papel:** Fecha fixture do download.

### Linha 140

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 141

- **Conteúdo:** `        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();`
- **Papel:** Espiona downloads.show.

### Linha 142

- **Conteúdo:** `        const downloadSpy = jest.spyOn(downloadsMock, 'download');`
- **Papel:** Espiona downloads.download para provar ausência de novo download.

### Linha 143

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 144

- **Conteúdo:** `        const result = await dispatchToBackground(runtimeMock, {`
- **Papel:** Despacha SHOW_EXISTING_FOLDER.

### Linha 145

- **Conteúdo:** `            action: 'SHOW_EXISTING_FOLDER',`
- **Papel:** Define action.

### Linha 146

- **Conteúdo:** `            folderPath: '/home/user/Downloads/MangaTranslator/Chapter_10',`
- **Papel:** Fornece folderPath realista.

### Linha 147

- **Conteúdo:** `            safeTitle: 'Chapter_10',`
- **Papel:** Fornece safeTitle.

### Linha 148

- **Conteúdo:** `            anchorId: 44,`
- **Papel:** Fornece anchorId 44.

### Linha 149

- **Conteúdo:** `        });`
- **Papel:** Fecha request.

### Linha 150

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 151

- **Conteúdo:** `        await flush(6);`
- **Papel:** Drena callbacks.

### Linha 152

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 153

- **Conteúdo:** `        expect(result.response).toEqual({ ok: true });`
- **Papel:** Prova resposta ok.

### Linha 154

- **Conteúdo:** `        expect(showSpy).toHaveBeenCalledWith(44);`
- **Papel:** Prova show(44).

### Linha 155

- **Conteúdo:** `        expect(downloadSpy).not.toHaveBeenCalled();`
- **Papel:** Prova que nenhum novo download foi iniciado.

### Linha 156

- **Conteúdo:** `    });`
- **Papel:** Fecha teste de anchor.

### Linha 157

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 158

- **Conteúdo:** `    test('LOG_ENTRY mantém somente os 500 registros mais recentes', async () => {`
- **Papel:** Abre teste de retenção dos 500 logs mais recentes.

### Linha 159

- **Conteúdo:** `        for (let index = 0; index < 505; index++) {`
- **Papel:** Gera 505 entradas sequenciais.

### Linha 160

- **Conteúdo:** `            // eslint-disable-next-line no-await-in-loop`
- **Papel:** Suprime lint para await deliberado no loop.

### Linha 161

- **Conteúdo:** `            await dispatchToBackground(runtimeMock, {`
- **Papel:** Despacha cada LOG_ENTRY e aguarda resposta.

### Linha 162

- **Conteúdo:** `                action: 'LOG_ENTRY',`
- **Papel:** Seleciona action LOG_ENTRY.

### Linha 163

- **Conteúdo:** `                level: 'info',`
- **Papel:** Define level info.

### Linha 164

- **Conteúdo:** `                source: 'test',`
- **Papel:** Define source test.

### Linha 165

- **Conteúdo:** `                action_name: 'SPAM',`
- **Papel:** Define action_name SPAM.

### Linha 166

- **Conteúdo:** `                detail: \`log-${index}\`,`
- **Papel:** Define detail indexado log-N.

### Linha 167

- **Conteúdo:** `                extra: { index },`
- **Papel:** Inclui extra indexado.

### Linha 168

- **Conteúdo:** `            });`
- **Papel:** Fecha request.

### Linha 169

- **Conteúdo:** `        }`
- **Papel:** Fecha loop após 505 entradas.

### Linha 170

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 171

- **Conteúdo:** `        const logs = await waitFor(async () => {`
- **Papel:** Inicia polling pelo flush do logger.

### Linha 172

- **Conteúdo:** `            const data = await storageMock.get(['translatorLog']);`
- **Papel:** Lê translatorLog do storage.

### Linha 173

- **Conteúdo:** `            const entries = data.translatorLog || [];`
- **Papel:** Normaliza ausência para array vazio.

### Linha 174

- **Conteúdo:** `            return entries.length === 500 ? entries : null;`
- **Papel:** Só conclui waitFor quando houver exatamente 500 registros.

### Linha 175

- **Conteúdo:** `        });`
- **Papel:** Fecha waitFor.

### Linha 176

- **Conteúdo:** _linha em branco_
- **Papel:** Linha em branco que separa blocos lógicos do teste.

### Linha 177

- **Conteúdo:** `        expect(logs).toHaveLength(500);`
- **Papel:** Prova limite de 500.

### Linha 178

- **Conteúdo:** `        expect(logs[0]).toEqual(expect.objectContaining({ detail: 'log-5' }));`
- **Papel:** Prova que o primeiro retido é log-5, descartando 0..4.

### Linha 179

- **Conteúdo:** `        expect(logs[499]).toEqual(expect.objectContaining({ detail: 'log-504' }));`
- **Papel:** Prova que o último é log-504.

### Linha 180

- **Conteúdo:** `    });`
- **Papel:** Fecha teste de log.

### Linha 181

- **Conteúdo:** `});`
- **Papel:** Fecha describe.

### Linha 182

- **Conteúdo:** _newline final após a linha 181_
- **Papel:** Posição terminal: newline final.

## 11. Autoauditoria documental

- Fonte integral e SHA reconfirmados.
- 181 linhas textuais + newline = **182/182 posições**.
- Headings `Linha 001` → `Linha 182` sequenciais.
- Background, três actions e chrome-api.mock foram cruzados em leitura.
- Cobertura externa foi distinguida da prova produzida por este arquivo.
- Nenhum teste/mock/código funcional foi alterado.
- Solicitações 148-001..003 permanecem OPEN.

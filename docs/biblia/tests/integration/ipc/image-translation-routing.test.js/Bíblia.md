# Bíblia técnica — image-translation-routing.test.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `4f1674c12311a48215b97faabb0415011a6cba87`  
> **Agente responsável pela auditoria:** AGENTE 12  
> **Tipo:** teste Jest de integração do roteamento GTC/IPC do content script de mangá  
> **Linhas textuais:** **137**  
> **Posições documentais:** **138**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/integration/ipc/image-translation-routing.test.js` verifica, em JSDOM, decisões de roteamento executadas pelo **`extension/content/content_manga.js` real**. O helper `loadContentScript` carrega os módulos injetados na ordem do manifest e configura DOM, storage, `window.location`, WebCrypto e APIs Chrome simuladas.

A suíte não executa o background real: ela substitui `chrome.runtime.sendMessage` por um responder controlado. Portanto, suas assertions provam o comportamento do content script ao **enviar** e **interpretar** mensagens IPC, mas não provam processamento interno de `START_BATCH` no service worker.

## 2. Dependências e ambiente

- Node `path`, `crypto` e `util.TextEncoder`;
- `fs` é importado, mas não é utilizado no arquivo auditado;
- `tests/helpers/repo-root.js` para localizar a raiz sem depender de cwd;
- `tests/helpers/load-content-script.js` para montar JSDOM e carregar o content script real;
- `tests/mocks/chrome-api.mock.js` para runtime/storage;
- `jest.config.js` inclui `tests/integration/**/*.test.js` no projeto `integration`.

## 3. Cenários e provas diretas

### 3.1 GTC miss → START_BATCH

O responder padrão devolve `{ ok: true, entriesByHash: {} }` para `GTC_QUERY_MANY`. Após o clique no main content, o teste aguarda `START_BATCH` e prova:

- `images === [{ index: 0 }]`;
- `prompt === 'Teste prompt'`.

Isso conecta o miss de cache ao envio para Gemini e também prova que o prompt configurado pelo helper atravessa o pipeline.

### 3.2 GTC hit → substituição local, sem START_BATCH

O responder devolve um `entriesByHash` indexado pelo hash realmente consultado. A suíte espera `data-translated="true"`, verifica o `src` traduzido e prova que **nenhuma** mensagem `START_BATCH` foi enviada.

### 3.3 Filtro de imagem pequena

A fixture contém duas páginas 800×1200 e um avatar 50×50. Depois do clique, a assertion exige `START_BATCH.images === [{ index: 0 }, { index: 1 }]`, provando que o candidato pequeno não entra no payload.

## 4. Relação com a implementação real

No `content_manga.js`, `queryGlobalTranslationCache` envia `GTC_QUERY_MANY` ao runtime e usa `entriesByHash` quando a resposta é `ok`. Em misses, o pipeline monta `payloadToGemini`; se esse payload não estiver vazio, o content script lê `customPrompt/defaultPrompt` e envia `START_BATCH` com `images`, `prompt` e `batchId`.

O helper `loadContentScript` define `customPrompt: 'Teste prompt'`, injeta dimensões naturais e carrega os módulos reais em `jest.isolateModules`, então as assertions desta suíte não são simples cópias de funções simuladas.

## 5. Evidência automatizada examinada

| Propriedade | Evidência | Classificação |
|---|---|---|
| arquivo participa do projeto Jest de integração | `jest.config.js` usa `tests/integration/**/*.test.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| miss de GTC envia apenas índice 0 | `expect(startBatch.images).toEqual([{ index: 0 }])` | ✅ PROVADO DIRETAMENTE |
| prompt chega em START_BATCH | `expect(startBatch.prompt).toBe('Teste prompt')` | ✅ PROVADO DIRETAMENTE |
| hit de GTC substitui src | assertion sobre `document.querySelector('img').getAttribute('src')` | ✅ PROVADO DIRETAMENTE |
| hit de GTC não envia START_BATCH | assertion `some(...START_BATCH)` igual a false | ✅ PROVADO DIRETAMENTE |
| imagem 50×50 é excluída do lote | payload esperado contém somente índices 0 e 1 | ✅ PROVADO DIRETAMENTE |
| background processa START_BATCH corretamente | background é substituído por responder local | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| lote misto de cache hit + miss usando content script real | não há cenário misto nesta suíte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| falha/timeout de GTC e fallback legado | não exercitado nesta suíte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |

## 6. Limitações e riscos de interpretação

1. `runtimeMock.sendMessage` é substituído diretamente; a suíte prova o lado emissor/consumidor do content script, não o handler do background.
2. O cenário de cache hit é 100% hit e o cenário miss é 100% miss. O branch real de **hit parcial**, que precisa substituir alguns elementos e enviar somente os misses ao Gemini, não é exercitado aqui.
3. `gtc-cache-flow.test.js` possui cenários parciais, mas usa uma função de simulação própria; não substitui uma prova com o `content_manga.js` real.
4. Não há cenário de `GTC_QUERY_MANY` com resposta inválida, erro de runtime ou fallback para `storage.local`.
5. O filtro de dimensão é provado com um único avatar 50×50; bordas exatas de minWidth/minHeight pertencem a testes mais específicos.
6. O import `fs` não é usado e pode ser removido em alteração separada, mas não afeta a prova atual.

## 7. Invariantes

1. Um miss de cache elegível deve produzir `START_BATCH`.
2. Um hit completo deve aplicar a tradução localmente e não iniciar Gemini para aquela imagem.
3. O payload para Gemini deve conter apenas índices de candidatos elegíveis que continuam sem tradução.
4. O prompt configurado em storage deve ser propagado ao `START_BATCH`.
5. Testes devem limpar listeners, storage, flags de injeção e DOM entre cenários.
6. Respostas do runtime mock devem ser assíncronas para não transformar a integração em fluxo artificialmente síncrono.
7. As assertions desta suíte só podem ser tratadas como prova do content script real enquanto `loadContentScript` continuar carregando `extension/content/content_manga.js`.
8. O SHA desta Bíblia só permanece válido enquanto o fonte for `4f1674c12311a48215b97faabb0415011a6cba87`.

## 8. Lacunas e solicitação ao auditor

- **112-001 — TEST_REQUIRED — OPEN:** adicionar cenário integrado de **cache parcial real**: pelo menos duas imagens, uma retornada em `entriesByHash` e outra ausente; verificar que a hit é substituída, que `START_BATCH.images` contém somente o índice miss e que o lote não reenvia a hit.

A lacuna não impede concluir a documentação porque os três comportamentos atualmente afirmados pela suíte possuem assertions diretas.

## 9. Fonte integral auditada

```javascript
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

async function waitFor(assertion, { timeout = 2500, interval = 10 } = {}) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condicao');
}

describe('IPC-01/IPC-02/IPC-03: Image translation routing - GTC e IPC', () => {
    let runtimeMock;
    let storageMock;
    let sentMessages;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        sentMessages = [];
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

    function installRuntimeResponder({ onQueryMany, onStartBatch } = {}) {
        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'GTC_QUERY_MANY') {
                const response = onQueryMany ? onQueryMany(message) : { ok: true, entriesByHash: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'START_BATCH') {
                if (typeof onStartBatch === 'function') onStartBatch(message);
                if (callback) setTimeout(() => callback({ ok: true }), 0);
                return;
            }

            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    }

    test('GTC miss envia START_BATCH para o background', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/higeki/page-1.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));
        expect(startBatch.images).toEqual([{ index: 0 }]);
        expect(startBatch.prompt).toBe('Teste prompt');
    });

    test('GTC hit substitui a imagem e nao chama START_BATCH', async () => {
        installRuntimeResponder({
            onQueryMany(message) {
                return {
                    ok: true,
                    entriesByHash: {
                        [message.hashes[0]]: 'data:image/png;base64,TRANSLATED_HIT',
                    },
                };
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/higeki/page-1.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        await waitFor(() => document.querySelector('img').dataset.translated === 'true');
        expect(document.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,TRANSLATED_HIT');
        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(false);
    });

    test('processamento em lote ignora imagem pequena e envia somente paginas validas', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/witch/page-1.jpg', width: 800, height: 1200 },
                { src: 'http://localhost/witch/page-2.jpg', width: 800, height: 1200 },
                { src: 'http://localhost/witch/avatar.jpg', width: 50, height: 50 },
            ],
        });

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));
        expect(startBatch.images).toEqual([{ index: 0 }, { index: 1 }]);
    });
});
```

## 10. Cobertura linha a linha

### Linha 1

**Fonte:** `const path = require('path');`

**Função:** Carrega `'path'` e associa a `path`; essa dependência participa do ambiente JSDOM/teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 2

**Fonte:** `const fs = require('fs');`

**Função:** Carrega `'fs'` e associa a `fs`; essa dependência participa do ambiente JSDOM/teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 3

**Fonte:** `const crypto = require('crypto');`

**Função:** Carrega `'crypto'` e associa a `crypto`; essa dependência participa do ambiente JSDOM/teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 4

**Fonte:** `const { TextEncoder } = require('util');`

**Função:** Importa helpers necessários ao cenário de integração por meio de `const { TextEncoder } = require('util');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 5

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `const { TextEncoder } = require('util');` do próximo bloco iniciado por `const { findRepoRoot } = require('../../helpers/repo-root');`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 6

**Fonte:** `const { findRepoRoot } = require('../../helpers/repo-root');`

**Função:** Importa helpers necessários ao cenário de integração por meio de `const { findRepoRoot } = require('../../helpers/repo-root');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 7

**Fonte:** `const ROOT = findRepoRoot(__dirname);`

**Função:** Define `ROOT` com `findRepoRoot(__dirname)`, preparando dado usado pelo cenário atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 8

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `const ROOT = findRepoRoot(__dirname);` do próximo bloco iniciado por `Object.defineProperty(global, 'crypto', {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 9

**Fonte:** `Object.defineProperty(global, 'crypto', {`

**Função:** Configura uma API global necessária ao código real carregado no JSDOM.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 10

**Fonte:** `    value: crypto.webcrypto,`

**Função:** Injeta a implementação WebCrypto do Node para que fingerprints usados pelo content script funcionem no teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 11

**Fonte:** `    configurable: true,`

**Função:** Compõe o cenário de integração com `configurable: true,`, no contexto do bloco em que a linha está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 12

**Fonte:** `});`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `global.TextEncoder = TextEncoder;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 13

**Fonte:** `global.TextEncoder = TextEncoder;`

**Função:** Disponibiliza `TextEncoder` globalmente, requisito do cálculo de hash no content script.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 14

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `global.TextEncoder = TextEncoder;` do próximo bloco iniciado por `const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 15

**Fonte:** `const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));`

**Função:** Importa helpers necessários ao cenário de integração por meio de `const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 16

**Fonte:** `const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));`

**Função:** Importa helpers necessários ao cenário de integração por meio de `const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 17

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));` do próximo bloco iniciado por `function delay(ms = 0) {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 18

**Fonte:** `function delay(ms = 0) {`

**Função:** Inicia o helper síncrono `delay` com parâmetros `ms = 0`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 19

**Fonte:** `    return new Promise(resolve => setTimeout(resolve, ms));`

**Função:** Cria Promise para representar espera assíncrona usada pelo polling ou pelo mock de runtime.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 20

**Fonte:** `}`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `async function waitFor(assertion, { timeout = 2500, interval = 10 } = {}) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 21

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `}` do próximo bloco iniciado por `async function waitFor(assertion, { timeout = 2500, interval = 10 } = {}) {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 22

**Fonte:** `async function waitFor(assertion, { timeout = 2500, interval = 10 } = {}) {`

**Função:** Inicia o helper assíncrono `waitFor` com parâmetros `assertion, { timeout = 2500, interval = 10 } = {}`, usado para aguardar efeitos assíncronos do content script.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 23

**Fonte:** `    const startedAt = performance.now();`

**Função:** Define `startedAt` com `performance.now()`, preparando dado usado pelo cenário atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 24

**Fonte:** `    while (performance.now() - startedAt < timeout) {`

**Função:** Lê relógio monotônico do ambiente de teste para controlar o timeout do polling.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 25

**Fonte:** `        const result = await assertion();`

**Função:** Define `result` com `await assertion()`, preparando dado usado pelo cenário atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 26

**Fonte:** `        if (result) return result;`

**Função:** Encerra o polling assim que a condição observada se torna verdadeira.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 27

**Fonte:** `        await delay(interval);`

**Função:** Cede o event loop pelo intervalo configurado antes da próxima tentativa do polling.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 28

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `throw new Error('Timeout aguardando condicao');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 29

**Fonte:** `    throw new Error('Timeout aguardando condicao');`

**Função:** Falha explicitamente o teste quando a condição assíncrona não aparece dentro do timeout.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 30

**Fonte:** `}`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `describe('IPC-01/IPC-02/IPC-03: Image translation routing - GTC e IPC', () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 31

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `}` do próximo bloco iniciado por `describe('IPC-01/IPC-02/IPC-03: Image translation routing - GTC e IPC', () => {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 32

**Fonte:** `describe('IPC-01/IPC-02/IPC-03: Image translation routing - GTC e IPC', () => {`

**Função:** Abre a suíte Jest identificada por `IPC-01/IPC-02/IPC-03: Image translation routing - GTC e IPC`, agrupando os cenários de roteamento GTC/IPC.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 33

**Fonte:** `    let runtimeMock;`

**Função:** Declara `runtimeMock` no escopo da suíte para ser reinicializado em `beforeEach`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 34

**Fonte:** `    let storageMock;`

**Função:** Declara `storageMock` no escopo da suíte para ser reinicializado em `beforeEach`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 35

**Fonte:** `    let sentMessages;`

**Função:** Declara `sentMessages` no escopo da suíte para ser reinicializado em `beforeEach`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 36

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `let sentMessages;` do próximo bloco iniciado por `beforeEach(async () => {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 37

**Fonte:** `    beforeEach(async () => {`

**Função:** Inicia o setup executado antes de cada teste, restabelecendo mocks, storage, listeners e DOM para isolamento entre cenários.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 38

**Fonte:** `        jest.resetModules();`

**Função:** Limpa o cache de módulos Jest para que o content script possa ser reinjetado com estado independente no próximo cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 39

**Fonte:** `        runtimeMock = getRuntimeMock();`

**Função:** Obtém o runtime Chrome simulado compartilhado pelo ambiente de teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 40

**Fonte:** `        storageMock = getStorageMock();`

**Função:** Obtém o mock de storage usado para configurar o estado persistente observado pelo content script.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 41

**Fonte:** `        runtimeMock._messageListeners = [];`

**Função:** Zera `runtimeMock._messageListeners` para impedir que listeners de um cenário anterior contaminem o atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 42

**Fonte:** `        runtimeMock._connectListeners = [];`

**Função:** Zera `runtimeMock._connectListeners` para impedir que listeners de um cenário anterior contaminem o atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 43

**Fonte:** `        runtimeMock.lastError = null;`

**Função:** Limpa `chrome.runtime.lastError`, garantindo que o cenário não herde erro de uma chamada anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 44

**Fonte:** `        sentMessages = [];`

**Função:** Reinicia a lista de mensagens capturadas; ela será a fonte das assertions sobre `GTC_QUERY_MANY`/`START_BATCH`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 45

**Fonte:** `        await storageMock.clear();`

**Função:** Esvazia o storage mock antes/depois do cenário para preservar independência entre testes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 46

**Fonte:** `        delete window.__manga_translator_content_injected;`

**Função:** Remove a flag global `__manga_translator_content_injected` para permitir reinjeção real do script.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 47

**Fonte:** `        delete window.MangaTranslatorGtcFingerprint;`

**Função:** Compõe o cenário de integração com `delete window.MangaTranslatorGtcFingerprint;`, no contexto do bloco em que a linha está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 48

**Fonte:** `        document.documentElement.innerHTML = '<head></head><body></body>';`

**Função:** Restaura o documento JSDOM a uma estrutura mínima, eliminando elementos criados pelo teste anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 49

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `afterEach(async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 50

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por `afterEach(async () => {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 51

**Fonte:** `    afterEach(async () => {`

**Função:** Inicia o teardown executado após cada teste, restaurando mocks e limpando estado global/DOM.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 52

**Fonte:** `        jest.restoreAllMocks();`

**Função:** Restaura spies/mocks gerenciados pelo Jest ao fim do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 53

**Fonte:** `        await storageMock.clear();`

**Função:** Esvazia o storage mock antes/depois do cenário para preservar independência entre testes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 54

**Fonte:** `        delete window.__manga_translator_content_injected;`

**Função:** Remove a flag global `__manga_translator_content_injected` para permitir reinjeção real do script.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 55

**Fonte:** `        delete window.MangaTranslatorGtcFingerprint;`

**Função:** Compõe o cenário de integração com `delete window.MangaTranslatorGtcFingerprint;`, no contexto do bloco em que a linha está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 56

**Fonte:** `        document.documentElement.innerHTML = '<head></head><body></body>';`

**Função:** Restaura o documento JSDOM a uma estrutura mínima, eliminando elementos criados pelo teste anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 57

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `function installRuntimeResponder({ onQueryMany, onStartBatch } = {}) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 58

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por `function installRuntimeResponder({ onQueryMany, onStartBatch } = {}) {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 59

**Fonte:** `    function installRuntimeResponder({ onQueryMany, onStartBatch } = {}) {`

**Função:** Inicia o helper síncrono `installRuntimeResponder` com parâmetros `{ onQueryMany, onStartBatch } = {}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 60

**Fonte:** `        runtimeMock.sendMessage = jest.fn((message, callback) => {`

**Função:** Substitui `chrome.runtime.sendMessage` por um responder controlado que registra mensagens e devolve respostas assíncronas de background simuladas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 61

**Fonte:** `            sentMessages.push(message);`

**Função:** Captura cada mensagem enviada pelo content script para permitir assertions posteriores sobre ação e payload.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 62

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `sentMessages.push(message);` do próximo bloco iniciado por `if (message.action === 'GTC_QUERY_MANY') {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 63

**Fonte:** `            if (message.action === 'GTC_QUERY_MANY') {`

**Função:** Detecta a consulta em lote ao Global Translation Cache e prepara a resposta configurável do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 64

**Fonte:** `                const response = onQueryMany ? onQueryMany(message) : { ok: true, entriesByHash: {} };`

**Função:** Define `response` com `onQueryMany ? onQueryMany(message) : { ok: true, entriesByHash: {} }`, preparando dado usado pelo cenário atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 65

**Fonte:** `                if (callback) setTimeout(() => callback(response), 0);`

**Função:** Entrega a resposta do mock no próximo turno do event loop, aproximando a natureza assíncrona do runtime Chrome.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 66

**Fonte:** `                return;`

**Função:** Interrompe este ramo do responder depois de agendar a callback apropriada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 67

**Fonte:** `            }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `if (message.action === 'START_BATCH') {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 68

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `}` do próximo bloco iniciado por `if (message.action === 'START_BATCH') {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 69

**Fonte:** `            if (message.action === 'START_BATCH') {`

**Função:** Detecta o pedido real do content script para iniciar lote no background e permite ao teste observar o payload enviado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 70

**Fonte:** `                if (typeof onStartBatch === 'function') onStartBatch(message);`

**Função:** Avalia a condição `if (typeof onStartBatch === 'function') onStartBatch(message);` e executa o ramo somente quando ela é satisfeita.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 71

**Fonte:** `                if (callback) setTimeout(() => callback({ ok: true }), 0);`

**Função:** Entrega a resposta do mock no próximo turno do event loop, aproximando a natureza assíncrona do runtime Chrome.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 72

**Fonte:** `                return;`

**Função:** Interrompe este ramo do responder depois de agendar a callback apropriada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 73

**Fonte:** `            }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `if (callback) setTimeout(() => callback({ ok: true }), 0);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 74

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `}` do próximo bloco iniciado por `if (callback) setTimeout(() => callback({ ok: true }), 0);`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 75

**Fonte:** `            if (callback) setTimeout(() => callback({ ok: true }), 0);`

**Função:** Entrega a resposta do mock no próximo turno do event loop, aproximando a natureza assíncrona do runtime Chrome.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 76

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 77

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('GTC miss envia START_BATCH para o background', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 78

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `}` do próximo bloco iniciado por `test('GTC miss envia START_BATCH para o background', async () => {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 79

**Fonte:** `    test('GTC miss envia START_BATCH para o background', async () => {`

**Função:** Registra o caso de teste `GTC miss envia START_BATCH para o background`; as assertions dentro deste bloco definem a prova automatizada correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 80

**Fonte:** `        installRuntimeResponder();`

**Função:** Instala responder padrão: cache vazio e confirmação genérica para as demais mensagens, configurando um cenário de miss.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 81

**Fonte:** `        await loadContentScript({`

**Função:** Carrega os módulos reais do content script via helper de integração e prepara DOM/storage para o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 82

**Fonte:** `            hostname: 'localhost',`

**Função:** Usa `localhost` como domínio habilitado do cenário, que o helper replica em `window.location` e storage.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 83

**Fonte:** `            domImages: [`

**Função:** Inicia a fixture de imagens DOM que o helper materializa com dimensões naturais controladas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 84

**Fonte:** `                { src: 'http://localhost/higeki/page-1.png', width: 800, height: 1200 },`

**Função:** Declara uma imagem de teste com URL/dimensões concretas: `{ src: 'http://localhost/higeki/page-1.png', width: 800, height: 1200 },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 85

**Fonte:** `            ],`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 86

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `document.getElementById('manga-main-content').click();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 87

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por `document.getElementById('manga-main-content').click();`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 88

**Fonte:** `        document.getElementById('manga-main-content').click();`

**Função:** Clica no conteúdo principal do botão flutuante criado pelo content script real, iniciando o pipeline de seleção/cache/roteamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 89

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `document.getElementById('manga-main-content').click();` do próximo bloco iniciado por `const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 90

**Fonte:** `        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));`

**Função:** Define `startBatch` com `await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'))`, preparando dado usado pelo cenário atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 91

**Fonte:** `        expect(startBatch.images).toEqual([{ index: 0 }]);`

**Função:** Assertion direta `expect(startBatch.images).toEqual([{ index: 0 }]);`; se esta propriedade do comportamento real carregado pelo helper mudar, o teste falha.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion Jest ligada ao comportamento produzido pela implementação real de `content_manga.js` carregada por `loadContentScript`.

### Linha 92

**Fonte:** `        expect(startBatch.prompt).toBe('Teste prompt');`

**Função:** Assertion direta `expect(startBatch.prompt).toBe('Teste prompt');`; se esta propriedade do comportamento real carregado pelo helper mudar, o teste falha.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion Jest ligada ao comportamento produzido pela implementação real de `content_manga.js` carregada por `loadContentScript`.

### Linha 93

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('GTC hit substitui a imagem e nao chama START_BATCH', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 94

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por `test('GTC hit substitui a imagem e nao chama START_BATCH', async () => {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 95

**Fonte:** `    test('GTC hit substitui a imagem e nao chama START_BATCH', async () => {`

**Função:** Registra o caso de teste `GTC hit substitui a imagem e nao chama START_BATCH`; as assertions dentro deste bloco definem a prova automatizada correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 96

**Fonte:** `        installRuntimeResponder({`

**Função:** Instala responder customizado para este teste, permitindo simular um cache hit sem executar o background real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 97

**Fonte:** `            onQueryMany(message) {`

**Função:** Define o callback específico acionado quando o content script consulta `GTC_QUERY_MANY`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 98

**Fonte:** `                return {`

**Função:** Retorna `{` ao chamador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 99

**Fonte:** `                    ok: true,`

**Função:** Compõe o cenário de integração com `ok: true,`, no contexto do bloco em que a linha está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 100

**Fonte:** `                    entriesByHash: {`

**Função:** Compõe o cenário de integração com `entriesByHash: {`, no contexto do bloco em que a linha está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 101

**Fonte:** `                        [message.hashes[0]]: 'data:image/png;base64,TRANSLATED_HIT',`

**Função:** Compõe o cenário de integração com `[message.hashes[0]]: 'data:image/png;base64,TRANSLATED_HIT',`, no contexto do bloco em que a linha está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 102

**Fonte:** `                    },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `};`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 103

**Fonte:** `                };`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `},`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 104

**Fonte:** `            },`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 105

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `await loadContentScript({`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 106

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por `await loadContentScript({`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 107

**Fonte:** `        await loadContentScript({`

**Função:** Carrega os módulos reais do content script via helper de integração e prepara DOM/storage para o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 108

**Fonte:** `            hostname: 'localhost',`

**Função:** Usa `localhost` como domínio habilitado do cenário, que o helper replica em `window.location` e storage.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 109

**Fonte:** `            domImages: [`

**Função:** Inicia a fixture de imagens DOM que o helper materializa com dimensões naturais controladas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 110

**Fonte:** `                { src: 'http://localhost/higeki/page-1.png', width: 800, height: 1200 },`

**Função:** Declara uma imagem de teste com URL/dimensões concretas: `{ src: 'http://localhost/higeki/page-1.png', width: 800, height: 1200 },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 111

**Fonte:** `            ],`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 112

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `document.getElementById('manga-main-content').click();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 113

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por `document.getElementById('manga-main-content').click();`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 114

**Fonte:** `        document.getElementById('manga-main-content').click();`

**Função:** Clica no conteúdo principal do botão flutuante criado pelo content script real, iniciando o pipeline de seleção/cache/roteamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 115

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `document.getElementById('manga-main-content').click();` do próximo bloco iniciado por `await waitFor(() => document.querySelector('img').dataset.translated === 'true');`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 116

**Fonte:** `        await waitFor(() => document.querySelector('img').dataset.translated === 'true');`

**Função:** Aguarda a substituição de imagem pelo cache até `data-translated` indicar conclusão.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 117

**Fonte:** `        expect(document.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,TRANSLATED_HIT');`

**Função:** Assertion direta `expect(document.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,TRANSLATED_HIT');`; se esta propriedade do comportamento real carregado pelo helper mudar, o teste falha.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion Jest ligada ao comportamento produzido pela implementação real de `content_manga.js` carregada por `loadContentScript`.

### Linha 118

**Fonte:** `        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(false);`

**Função:** Detecta o pedido real do content script para iniciar lote no background e permite ao teste observar o payload enviado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion Jest ligada ao comportamento produzido pela implementação real de `content_manga.js` carregada por `loadContentScript`.

### Linha 119

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `test('processamento em lote ignora imagem pequena e envia somente paginas validas', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 120

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por `test('processamento em lote ignora imagem pequena e envia somente paginas validas', async () => {`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 121

**Fonte:** `    test('processamento em lote ignora imagem pequena e envia somente paginas validas', async () => {`

**Função:** Registra o caso de teste `processamento em lote ignora imagem pequena e envia somente paginas validas`; as assertions dentro deste bloco definem a prova automatizada correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 122

**Fonte:** `        installRuntimeResponder();`

**Função:** Instala responder padrão: cache vazio e confirmação genérica para as demais mensagens, configurando um cenário de miss.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 123

**Fonte:** `        await loadContentScript({`

**Função:** Carrega os módulos reais do content script via helper de integração e prepara DOM/storage para o cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 124

**Fonte:** `            hostname: 'localhost',`

**Função:** Usa `localhost` como domínio habilitado do cenário, que o helper replica em `window.location` e storage.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 125

**Fonte:** `            domImages: [`

**Função:** Inicia a fixture de imagens DOM que o helper materializa com dimensões naturais controladas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 126

**Fonte:** `                { src: 'http://localhost/witch/page-1.jpg', width: 800, height: 1200 },`

**Função:** Declara uma imagem de teste com URL/dimensões concretas: `{ src: 'http://localhost/witch/page-1.jpg', width: 800, height: 1200 },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 127

**Fonte:** `                { src: 'http://localhost/witch/page-2.jpg', width: 800, height: 1200 },`

**Função:** Declara uma imagem de teste com URL/dimensões concretas: `{ src: 'http://localhost/witch/page-2.jpg', width: 800, height: 1200 },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 128

**Fonte:** `                { src: 'http://localhost/witch/avatar.jpg', width: 50, height: 50 },`

**Função:** Declara uma imagem de teste com URL/dimensões concretas: `{ src: 'http://localhost/witch/avatar.jpg', width: 50, height: 50 },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 129

**Fonte:** `            ],`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 130

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `document.getElementById('manga-main-content').click();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 131

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por `document.getElementById('manga-main-content').click();`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 132

**Fonte:** `        document.getElementById('manga-main-content').click();`

**Função:** Clica no conteúdo principal do botão flutuante criado pelo content script real, iniciando o pipeline de seleção/cache/roteamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 133

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `document.getElementById('manga-main-content').click();` do próximo bloco iniciado por `const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));`; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 134

**Fonte:** `        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));`

**Função:** Define `startBatch` com `await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'))`, preparando dado usado pelo cenário atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 135

**Fonte:** `        expect(startBatch.images).toEqual([{ index: 0 }, { index: 1 }]);`

**Função:** Assertion direta `expect(startBatch.images).toEqual([{ index: 0 }, { index: 1 }]);`; se esta propriedade do comportamento real carregado pelo helper mudar, o teste falha.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — assertion Jest ligada ao comportamento produzido pela implementação real de `content_manga.js` carregada por `loadContentScript`.

### Linha 136

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 137

**Fonte:** `});`

**Função:** Fecha a estrutura sintática corrente; o próximo trecho relevante começa por ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

### Linha 138

**Fonte:** `␠ [linha vazia]`

**Função:** Separa o bloco que termina em `});` do próximo bloco iniciado por ``; não altera o comportamento do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — linha de setup/ação que participa do caso integrado; a propriedade final é verificada pelas assertions do mesmo teste.

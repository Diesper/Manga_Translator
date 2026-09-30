# Bíblia técnica — tests/unit/content-gemini/resolution-elevation.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** a8ef465959d231766ee41b9397183b7cb6b53e36  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest de elevação de URL de resolução Google CDN  
> **Linhas textuais:** 314  
> **Posições documentais:** 315, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

A suíte verifica a regra que eleva URLs de imagens geradas no Google User Content de variantes limitadas (=s512, =s1024 etc.) para =s0 antes de FETCH_IMAGE_AS_BASE64, buscando a qualidade original.

Ela contém dois tipos de prova muito diferentes: um teste puro que reimplementa a regex localmente e uma integração que executa content_gemini/job-runner reais.

## 2. Regra de produção

No job-runner real, após encontrar resultUrl, se a string contém googleusercontent.com e combina /=s\d+/, executa replace(/=s\d+[^?#]*/, '=s0'). Só depois chama resultExtractor, cujo caminho direto pode solicitar FETCH_IMAGE_AS_BASE64.

A integração desta suíte usa https://lh3.googleusercontent.com/drive-storage/SAMPLE_MANGA=s1024-rw e exige request com SAMPLE_MANGA=s0.

## 3. Primeiro teste: espelho local

O teste de matriz define sua própria função elevateUrl com a mesma condição/regex. Ele cobre s1024, s512-rw, s2048 com query, s1200 com fragmento, example.com e blob. Porém, por não importar/usar a função de produção, essas seis assertions podem permanecer verdes mesmo se o job-runner mudar ou remover a elevação.

Classificação: 🟦 GATE LOCAL para a especificação pretendida, não prova direta do código de produção.

## 4. Segundo teste: integração real

O cenário monta editor/attachment/Send, persiste gemini_job_99, carrega todos os módulos reais e executa processGeminiJob. Quando a resposta criada usa =s1024-rw, a mensagem FETCH_IMAGE_AS_BASE64 deve levar =s0. A resposta base64 também aparece em GEMINI_IMAGE_EXTRACTED.

Classificação: ✅ PROVADO DIRETAMENTE para uma variante real de URL.

## 5. Limitações da matriz real

Query string, fragmento, s512, s2048, URLs não-Google e blob só são exercitados pela função espelho. A integração não parametriza o pipeline para esses casos.

Além disso, a condição de produção usa String.includes('googleusercontent.com'), não parsing de hostname. Isso também corresponde a domínios cujo nome apenas contém essa substring. Se a intenção é restringir ao host Google real, o contrato deve ser explicitado.

## 6. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob a8ef465959d231766ee41b9397183b7cb6b53e36. Node 20.x (109255348388): ambos os casos ✓, arquivo ~6.655 s. Node 22.x (109255348406): ambos ✓, ~6.639 s. Global 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

## 7. Matriz de evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| s1024-rw real vira s0 antes de fetch | integração processGeminiJob | ✅ PROVADO DIRETAMENTE |
| base64 retornado segue para GEMINI_IMAGE_EXTRACTED | integração | ✅ PROVADO DIRETAMENTE |
| s512/s2048/query/fragment | função local espelho | 🟦 GATE LOCAL |
| example.com/blob permanecem inalterados | função local espelho | 🟦 GATE LOCAL |
| apenas hostname Google legítimo é alterado | produção usa includes de substring | ⚠️ CONTRATO NÃO PROVADO/AMBÍGUO |

## 8. Solicitações ao auditor

### 185-001 — TEST_STRENGTH_REVIEW — OPEN — HIGH

Encontrado: o primeiro teste reimplementa elevateUrl dentro do próprio teste em vez de chamar código de produção.

Ação pedida: extrair a normalização de URL para helper exportável ou testar o caminho real parametrizado. Remover duplicação da regex no teste.

Evidência esperada: a matriz s512/s1024/s2048/query/fragment/non-Google falha se e somente se a implementação real mudar.

Risco: espelho local e produção podem divergir mantendo CI verde.

### 185-002 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: a integração real cobre somente =s1024-rw sem query/hash.

Ação pedida: parametrizar integração/helper real para s512-rw, s2048?query, s1200#fragment, URL sem =sN, blob e host não-Google.

Evidência esperada: preservação correta de query/fragment e ausência de alteração fora do contrato.

Risco: regex pode remover sufixo demais ou alterar URL indevida sem ser detectada.

### 185-003 — CONTRACT_REVIEW — OPEN — LOW

Encontrado: produção decide domínio com resultUrl.includes('googleusercontent.com'), não valida hostname via URL parser.

Ação pedida: definir se o contrato aceita qualquer string contendo o token ou apenas googleusercontent.com/subdomínios. Se for host-specific, usar parsing e adicionar casos evilgoogleusercontent.com/googleusercontent.com.evil.

Risco: normalização pode ser aplicada a host não pretendido.

## 9. Fonte integral auditada

```javascript
/**
 * resolution-elevation.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa a elevação automática da resolução das imagens do Google CDN para =s0
 * (qualidade máxima original sem recompressão) no RPA do content_gemini.js.
 */

const path = require('path');
const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');

const CONTENT_GEMINI_PATH = path.resolve(__dirname, '../../../extension/content/content_gemini.js');
const GEMINI_SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');
const GEMINI_DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');
const GEMINI_OBSERVER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/observer.js');
const GEMINI_EDITOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/editor.js');
const GEMINI_ATTACHMENT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/attachment.js');
const GEMINI_TEMP_CHAT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/temporary-chat.js');
const GEMINI_RESULT_EXTRACTOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/result-extractor.js');
const GEMINI_DELETION_PATH = path.resolve(__dirname, '../../../extension/content/gemini/deletion.js');
const GEMINI_JOB_RUNNER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/job-runner.js');

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeout = 8000, step = 50 } = {}) {
    let elapsed = 0;
    while (elapsed <= timeout) {
        const result = await predicate();
        if (result) return result;
        await delay(step);
        elapsed += step;
    }
    throw new Error('Timeout aguardando condicao');
}

function initMocks() {
    if (typeof window.PointerEvent !== 'function') {
        window.PointerEvent = window.MouseEvent;
    }
    if (typeof global.PointerEvent !== 'function') {
        global.PointerEvent = window.PointerEvent;
    }

    if (typeof window.DataTransfer !== 'function') {
        class MockDataTransfer {
            constructor() {
                const items = [];
                items.add = (item) => items.push(item);
                this.items = items;
                this._data = new Map();
            }
            setData(type, value) { this._data.set(type, value); }
            getData(type) { return this._data.get(type) || ''; }
        }
        window.DataTransfer = MockDataTransfer;
    }
    if (typeof global.DataTransfer !== 'function') {
        global.DataTransfer = window.DataTransfer;
    }

    if (typeof window.ClipboardEvent !== 'function') {
        class MockClipboardEvent extends window.Event {
            constructor(type, init = {}) {
                super(type, init);
                this.clipboardData = init.clipboardData || null;
            }
        }
        window.ClipboardEvent = MockClipboardEvent;
    }
    if (typeof global.ClipboardEvent !== 'function') {
        global.ClipboardEvent = window.ClipboardEvent;
    }

    if (typeof window.InputEvent !== 'function') {
        window.InputEvent = window.Event;
    }
    if (typeof global.InputEvent !== 'function') {
        global.InputEvent = window.InputEvent;
    }

    if (typeof global.atob !== 'function') {
        global.atob = (value) => Buffer.from(value, 'base64').toString('binary');
    }
}

function appendGeneratedImage(src) {
    const img = document.createElement('img');
    img.src = src;
    img.scrollIntoView = jest.fn();
    Object.defineProperty(img, 'naturalWidth', { value: 1024, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 1536, configurable: true });
    Object.defineProperty(img, 'complete', { value: true, configurable: true });
    const response = document.createElement('model-response');
    response.setAttribute('data-message-author', 'model');
    response.appendChild(img);
    document.body.appendChild(response);
    return img;
}

function mountGeminiEditor({ onSubmit } = {}) {
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"><p></p></div><div class="momentary-indicator">conversa momentânea</div>';

    const editor = document.querySelector('.ql-editor');
    editor.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 120,
        width: 640, height: 120, toJSON() { return this; },
    });
    editor.focus = jest.fn();
    editor.scrollIntoView = jest.fn();

    editor.addEventListener('paste', (event) => {
        const clipboardData = event.clipboardData;
        if (clipboardData && clipboardData.items && clipboardData.items.length > 0) {
            let preview = document.querySelector('file-preview');
            if (!preview) {
                preview = document.createElement('file-preview');
                const thumbImg = document.createElement('img');
                thumbImg.src = 'blob:https://gemini.test/mock-attachment';
                Object.defineProperty(thumbImg, 'naturalWidth', { value: 50, configurable: true });
                Object.defineProperty(thumbImg, 'naturalHeight', { value: 50, configurable: true });
                Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });
                preview.getBoundingClientRect = () => ({
                    x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,
                    width: 120, height: 90, toJSON() { return this; },
                });
                preview.appendChild(thumbImg);
                document.body.appendChild(preview);
            }
        }
    });
    editor.addEventListener('drop', (event) => {
        const transfer = event.dataTransfer;
        if (!transfer?.items?.length || document.querySelector('file-preview')) return;
        const preview = document.createElement('file-preview');
        const thumbImg = document.createElement('img');
        thumbImg.src = 'blob:https://gemini.test/mock-attachment';
        Object.defineProperty(thumbImg, 'naturalWidth', { value: 50, configurable: true });
        Object.defineProperty(thumbImg, 'naturalHeight', { value: 50, configurable: true });
        Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });
        preview.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,
            width: 120, height: 90, toJSON() { return this; },
        });
        preview.appendChild(thumbImg);
        document.body.appendChild(preview);
    });

    const sendButton = document.createElement('button');
    sendButton.setAttribute('aria-label', 'send message');
    sendButton.click = jest.fn(() => {
        editor.textContent = '';
        onSubmit();
    });
    sendButton.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0, right: 40, bottom: 40,
        width: 40, height: 40, toJSON() { return this; },
    });
    document.body.appendChild(sendButton);

    return { editor, sendButton };
}

describe('Elevação de Resolução CDN (=s0) — content_gemini.js', () => {
    let runtimeMock;
    let storageMock;
    let sentMessages = [];
    let processPromise = null;

    beforeEach(async () => {
        jest.resetModules();
        initMocks();
        jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
            x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,
            width: 160, height: 48, toJSON() { return this; },
        }));
        Element.prototype.scrollIntoView = jest.fn();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        sentMessages = [];
        processPromise = null;
        await storageMock.clear();
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        const activeObserver = window.__mangaTranslatorActiveGeminiObserver;
        if (activeObserver && typeof activeObserver.stop === 'function') {
            try { activeObserver.stop(); } catch (_error) {}
        }
        delete window.__mangaTranslatorActiveGeminiObserver;

        const observerRegistry = window.__mtGeminiObservers;
        if (observerRegistry && typeof observerRegistry === 'object') {
            for (const observer of Object.values(observerRegistry)) {
                if (observer && typeof observer.stop === 'function') {
                    try { observer.stop(); } catch (_error) {}
                }
            }
        }
        delete window.__mtGeminiObservers;

        if (processPromise) await processPromise.catch(() => {});

        jest.restoreAllMocks();
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('eleva URLs do Google User Content substituindo parâmetros =s1024, =s512 por =s0', () => {
        function elevateUrl(url) {
            if (url.includes('googleusercontent.com') && /=s\d+/.test(url)) {
                return url.replace(/=s\d+[^?#]*/, '=s0');
            }
            return url;
        }

        const cases = [
            {
                input: 'https://lh3.googleusercontent.com/drive-storage/AJ6_test=s1024',
                expected: 'https://lh3.googleusercontent.com/drive-storage/AJ6_test=s0',
            },
            {
                input: 'https://lh3.googleusercontent.com/fife/ABX_test=s512-rw',
                expected: 'https://lh3.googleusercontent.com/fife/ABX_test=s0',
            },
            {
                input: 'https://lh3.googleusercontent.com/fife/ABX_test=s2048?authuser=0',
                expected: 'https://lh3.googleusercontent.com/fife/ABX_test=s0?authuser=0',
            },
            {
                input: 'https://lh3.googleusercontent.com/img=s1200-c-rj-v1-e365#frag',
                expected: 'https://lh3.googleusercontent.com/img=s0#frag',
            },
            {
                input: 'https://example.com/cdn/image=s1024.png',
                expected: 'https://example.com/cdn/image=s1024.png',
            },
            {
                input: 'blob:https://gemini.google.com/1234-5678',
                expected: 'blob:https://gemini.google.com/1234-5678',
            },
        ];

        cases.forEach(({ input, expected }) => {
            expect(elevateUrl(input)).toBe(expected);
        });
    });

    test('processGeminiJob solicita FETCH_IMAGE_AS_BASE64 com a URL elevada para =s0', async () => {
        const cdnUrlLowRes = 'https://lh3.googleusercontent.com/drive-storage/SAMPLE_MANGA=s1024-rw';
        const expectedElevatedUrl = 'https://lh3.googleusercontent.com/drive-storage/SAMPLE_MANGA=s0';

        mountGeminiEditor({
            onSubmit: () => {
                setTimeout(() => {
                    appendGeneratedImage(cdnUrlLowRes);
                }, 1300);
            },
        });

        const tabId = 99;
        delete window.location;
        window.location = new URL(`https://gemini.google.com/app?mangatranslator=true&tabId=${tabId}`);

        await storageMock.set({
            [`gemini_job_${tabId}`]: {
                jobId: 'job-resolution',
                batchId: 'batch-test',
                mangaTabId: 10,
                index: 0,
                prompt: 'Traduza o texto mantendo balões.',
                geminiExecutionMode: 'temp_chat',
            },
            debugMode: true,
        });

        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);
            if (message.action === 'GET_TAB_ID') {
                if (callback) callback({ tabId });
            } else if (message.action === 'REQUEST_IMAGE_DATA') {
                if (callback) callback({ srcData: 'data:image/png;base64,QUJDRA==' });
            } else if (message.action === 'FETCH_IMAGE_AS_BASE64') {
                if (callback) callback({ dataUrl: 'data:image/png;base64,UkVTVUxUX0VMRVZBVEVE' });
            } else {
                if (callback) callback(undefined);
            }
        });

        jest.isolateModules(() => {
            require(GEMINI_SELECTORS_PATH);
            require(GEMINI_DOM_PATH);
            require(GEMINI_OBSERVER_PATH);
            require(GEMINI_EDITOR_PATH);
            require(GEMINI_ATTACHMENT_PATH);
            require(GEMINI_TEMP_CHAT_PATH);
            require(GEMINI_RESULT_EXTRACTOR_PATH);
            require(GEMINI_DELETION_PATH);
            require(GEMINI_JOB_RUNNER_PATH);
            const contentGemini = require(CONTENT_GEMINI_PATH);
            processPromise = contentGemini.processGeminiJob();
        });

        await waitFor(() => sentMessages.find(m => m.action === 'FETCH_IMAGE_AS_BASE64'));

        const fetchCall = sentMessages.find(m => m.action === 'FETCH_IMAGE_AS_BASE64');
        expect(fetchCall).toBeDefined();
        expect(fetchCall.url).toBe(expectedElevatedUrl);

        const extractedMsg = sentMessages.find(m => m.action === 'GEMINI_IMAGE_EXTRACTED');
        expect(extractedMsg).toBeDefined();
        expect(extractedMsg.src).toBe('data:image/png;base64,UkVTVUxUX0VMRVZBVEVE');
    });
});
```

## 10. Auditoria linha a linha

### Linha 001

- **Código:** `/**`
- **Função:** Comentário de intenção: elevação de resolução para =s0.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 002

- **Código:** ` * resolution-elevation.test.js`
- **Função:** Comentário de intenção: elevação de resolução para =s0.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 003

- **Código:** ` * ─────────────────────────────────────────────────────────────────────────────`
- **Função:** Comentário de intenção: elevação de resolução para =s0.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 004

- **Código:** ` * Testa a elevação automática da resolução das imagens do Google CDN para =s0`
- **Função:** Comentário de intenção: elevação de resolução para =s0.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 005

- **Código:** ` * (qualidade máxima original sem recompressão) no RPA do content_gemini.js.`
- **Função:** Comentário de intenção: elevação de resolução para =s0.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 006

- **Código:** ` */`
- **Função:** Comentário de intenção: elevação de resolução para =s0.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 007

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 008

- **Código:** `const path = require('path');`
- **Função:** Importa path.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 009

- **Código:** `const { getRuntimeMock, getStorageMock } = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa mocks runtime/storage.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 010

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 011

- **Código:** `const CONTENT_GEMINI_PATH = path.resolve(__dirname, '../../../extension/content/content_gemini.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 012

- **Código:** `const GEMINI_SELECTORS_PATH = path.resolve(__dirname, '../../../extension/content/gemini/selectors.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 013

- **Código:** `const GEMINI_DOM_PATH = path.resolve(__dirname, '../../../extension/content/gemini/dom.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 014

- **Código:** `const GEMINI_OBSERVER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/observer.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 015

- **Código:** `const GEMINI_EDITOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/editor.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 016

- **Código:** `const GEMINI_ATTACHMENT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/attachment.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 017

- **Código:** `const GEMINI_TEMP_CHAT_PATH = path.resolve(__dirname, '../../../extension/content/gemini/temporary-chat.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 018

- **Código:** `const GEMINI_RESULT_EXTRACTOR_PATH = path.resolve(__dirname, '../../../extension/content/gemini/result-extractor.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 019

- **Código:** `const GEMINI_DELETION_PATH = path.resolve(__dirname, '../../../extension/content/gemini/deletion.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 020

- **Código:** `const GEMINI_JOB_RUNNER_PATH = path.resolve(__dirname, '../../../extension/content/gemini/job-runner.js');`
- **Função:** Resolve content_gemini e módulos Gemini reais.
- **Contexto:** comentário/imports/paths.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 021

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 022

- **Código:** `function delay(ms = 0) {`
- **Função:** Helper de espera real do teste.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 023

- **Código:** `    return new Promise(resolve => setTimeout(resolve, ms));`
- **Função:** Compõe o cenário delay/waitFor.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 024

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 025

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 026

- **Código:** `async function waitFor(predicate, { timeout = 8000, step = 50 } = {}) {`
- **Função:** Poll helper para efeitos assíncronos do pipeline.
- **Contexto:** delay/waitFor.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa content/job-runner reais.

### Linha 027

- **Código:** `    let elapsed = 0;`
- **Função:** Compõe o cenário delay/waitFor.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 028

- **Código:** `    while (elapsed <= timeout) {`
- **Função:** Compõe o cenário delay/waitFor.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 029

- **Código:** `        const result = await predicate();`
- **Função:** Compõe o cenário delay/waitFor.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 030

- **Código:** `        if (result) return result;`
- **Função:** Compõe o cenário delay/waitFor.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 031

- **Código:** `        await delay(step);`
- **Função:** Compõe o cenário delay/waitFor.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 032

- **Código:** `        elapsed += step;`
- **Função:** Compõe o cenário delay/waitFor.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 033

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 034

- **Código:** `    throw new Error('Timeout aguardando condicao');`
- **Função:** Compõe o cenário delay/waitFor.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 035

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 036

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** delay/waitFor.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 037

- **Código:** `function initMocks() {`
- **Função:** Instala APIs DOM necessárias ao RPA no JSDOM.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 038

- **Código:** `    if (typeof window.PointerEvent !== 'function') {`
- **Função:** Faz fallback para MouseEvent.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 039

- **Código:** `        window.PointerEvent = window.MouseEvent;`
- **Função:** Faz fallback para MouseEvent.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 040

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 041

- **Código:** `    if (typeof global.PointerEvent !== 'function') {`
- **Função:** Faz fallback para MouseEvent.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 042

- **Código:** `        global.PointerEvent = window.PointerEvent;`
- **Função:** Faz fallback para MouseEvent.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 043

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 044

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 045

- **Código:** `    if (typeof window.DataTransfer !== 'function') {`
- **Função:** Instala DataTransfer mínimo para attachment.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 046

- **Código:** `        class MockDataTransfer {`
- **Função:** Instala DataTransfer mínimo para attachment.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 047

- **Código:** `            constructor() {`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 048

- **Código:** `                const items = [];`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 049

- **Código:** `                items.add = (item) => items.push(item);`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 050

- **Código:** `                this.items = items;`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 051

- **Código:** `                this._data = new Map();`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 052

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 053

- **Código:** `            setData(type, value) { this._data.set(type, value); }`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 054

- **Código:** `            getData(type) { return this._data.get(type) || ''; }`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 055

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 056

- **Código:** `        window.DataTransfer = MockDataTransfer;`
- **Função:** Instala DataTransfer mínimo para attachment.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 057

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 058

- **Código:** `    if (typeof global.DataTransfer !== 'function') {`
- **Função:** Instala DataTransfer mínimo para attachment.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 059

- **Código:** `        global.DataTransfer = window.DataTransfer;`
- **Função:** Instala DataTransfer mínimo para attachment.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 060

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 061

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 062

- **Código:** `    if (typeof window.ClipboardEvent !== 'function') {`
- **Função:** Instala ClipboardEvent mínimo.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 063

- **Código:** `        class MockClipboardEvent extends window.Event {`
- **Função:** Instala ClipboardEvent mínimo.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 064

- **Código:** `            constructor(type, init = {}) {`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 065

- **Código:** `                super(type, init);`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 066

- **Código:** `                this.clipboardData = init.clipboardData || null;`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 067

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 068

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 069

- **Código:** `        window.ClipboardEvent = MockClipboardEvent;`
- **Função:** Instala ClipboardEvent mínimo.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 070

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 071

- **Código:** `    if (typeof global.ClipboardEvent !== 'function') {`
- **Função:** Instala ClipboardEvent mínimo.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 072

- **Código:** `        global.ClipboardEvent = window.ClipboardEvent;`
- **Função:** Instala ClipboardEvent mínimo.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 073

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 074

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 075

- **Código:** `    if (typeof window.InputEvent !== 'function') {`
- **Função:** Garante InputEvent.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 076

- **Código:** `        window.InputEvent = window.Event;`
- **Função:** Garante InputEvent.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 077

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 078

- **Código:** `    if (typeof global.InputEvent !== 'function') {`
- **Função:** Garante InputEvent.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 079

- **Código:** `        global.InputEvent = window.InputEvent;`
- **Função:** Garante InputEvent.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 080

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 081

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 082

- **Código:** `    if (typeof global.atob !== 'function') {`
- **Função:** Fornece atob via Buffer.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 083

- **Código:** `        global.atob = (value) => Buffer.from(value, 'base64').toString('binary');`
- **Função:** Fornece atob via Buffer.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 084

- **Código:** `    }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 085

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 086

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 087

- **Código:** `function appendGeneratedImage(src) {`
- **Função:** Cria resultado de model-response com dimensões válidas.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 088

- **Código:** `    const img = document.createElement('img');`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 089

- **Código:** `    img.src = src;`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 090

- **Código:** `    img.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 091

- **Código:** `    Object.defineProperty(img, 'naturalWidth', { value: 1024, configurable: true });`
- **Função:** Compõe o cenário polyfills JSDOM.
- **Contexto:** polyfills JSDOM.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 092

- **Código:** `    Object.defineProperty(img, 'naturalHeight', { value: 1536, configurable: true });`
- **Função:** Compõe o cenário estrutura final.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 093

- **Código:** `    Object.defineProperty(img, 'complete', { value: true, configurable: true });`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 094

- **Código:** `    const response = document.createElement('model-response');`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 095

- **Código:** `    response.setAttribute('data-message-author', 'model');`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 096

- **Código:** `    response.appendChild(img);`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 097

- **Código:** `    document.body.appendChild(response);`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 098

- **Código:** `    return img;`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 099

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 100

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 101

- **Código:** `function mountGeminiEditor({ onSubmit } = {}) {`
- **Função:** Monta editor, preview do attachment e Send para executar RPA real.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 102

- **Código:** `    document.body.innerHTML = '<div class="ql-editor" contenteditable="true"><p></p></div><div class="momentary-indicator">conversa momentânea</div>';`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 103

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 104

- **Código:** `    const editor = document.querySelector('.ql-editor');`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 105

- **Código:** `    editor.getBoundingClientRect = () => ({`
- **Função:** Compõe o cenário fixture imagem gerada.
- **Contexto:** fixture imagem gerada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 106

- **Código:** `        x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 120,`
- **Função:** Compõe o cenário estrutura final.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 107

- **Código:** `        width: 640, height: 120, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 108

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 109

- **Código:** `    editor.focus = jest.fn();`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 110

- **Código:** `    editor.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 111

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 112

- **Código:** `    editor.addEventListener('paste', (event) => {`
- **Função:** Simula criação da preview ao colar a imagem.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 113

- **Código:** `        const clipboardData = event.clipboardData;`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 114

- **Código:** `        if (clipboardData && clipboardData.items && clipboardData.items.length > 0) {`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 115

- **Código:** `            let preview = document.querySelector('file-preview');`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 116

- **Código:** `            if (!preview) {`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 117

- **Código:** `                preview = document.createElement('file-preview');`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 118

- **Código:** `                const thumbImg = document.createElement('img');`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 119

- **Código:** `                thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 120

- **Código:** `                Object.defineProperty(thumbImg, 'naturalWidth', { value: 50, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 121

- **Código:** `                Object.defineProperty(thumbImg, 'naturalHeight', { value: 50, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 122

- **Código:** `                Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 123

- **Código:** `                preview.getBoundingClientRect = () => ({`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 124

- **Código:** `                    x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 125

- **Código:** `                    width: 120, height: 90, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 126

- **Código:** `                });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 127

- **Código:** `                preview.appendChild(thumbImg);`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 128

- **Código:** `                document.body.appendChild(preview);`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 129

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 130

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 131

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 132

- **Código:** `    editor.addEventListener('drop', (event) => {`
- **Função:** Simula fallback drop.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 133

- **Código:** `        const transfer = event.dataTransfer;`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 134

- **Código:** `        if (!transfer?.items?.length || document.querySelector('file-preview')) return;`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 135

- **Código:** `        const preview = document.createElement('file-preview');`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 136

- **Código:** `        const thumbImg = document.createElement('img');`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 137

- **Código:** `        thumbImg.src = 'blob:https://gemini.test/mock-attachment';`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 138

- **Código:** `        Object.defineProperty(thumbImg, 'naturalWidth', { value: 50, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 139

- **Código:** `        Object.defineProperty(thumbImg, 'naturalHeight', { value: 50, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 140

- **Código:** `        Object.defineProperty(thumbImg, 'complete', { value: true, configurable: true });`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 141

- **Código:** `        preview.getBoundingClientRect = () => ({`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 142

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 90,`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 143

- **Código:** `            width: 120, height: 90, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 144

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 145

- **Código:** `        preview.appendChild(thumbImg);`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 146

- **Código:** `        document.body.appendChild(preview);`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 147

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 148

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 149

- **Código:** `    const sendButton = document.createElement('button');`
- **Função:** Cria controle Send que limpa editor e chama onSubmit.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 150

- **Código:** `    sendButton.setAttribute('aria-label', 'send message');`
- **Função:** Cria controle Send que limpa editor e chama onSubmit.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 151

- **Código:** `    sendButton.click = jest.fn(() => {`
- **Função:** Cria controle Send que limpa editor e chama onSubmit.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 152

- **Código:** `        editor.textContent = '';`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 153

- **Código:** `        onSubmit();`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 154

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 155

- **Código:** `    sendButton.getBoundingClientRect = () => ({`
- **Função:** Cria controle Send que limpa editor e chama onSubmit.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 156

- **Código:** `        x: 0, y: 0, top: 0, left: 0, right: 40, bottom: 40,`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 157

- **Código:** `        width: 40, height: 40, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 158

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 159

- **Código:** `    document.body.appendChild(sendButton);`
- **Função:** Cria controle Send que limpa editor e chama onSubmit.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 160

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 161

- **Código:** `    return { editor, sendButton };`
- **Função:** Cria controle Send que limpa editor e chama onSubmit.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 162

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 163

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 164

- **Código:** `describe('Elevação de Resolução CDN (=s0) — content_gemini.js', () => {`
- **Função:** Abre suíte de elevação CDN.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 165

- **Código:** `    let runtimeMock;`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 166

- **Código:** `    let storageMock;`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 167

- **Código:** `    let sentMessages = [];`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 168

- **Código:** `    let processPromise = null;`
- **Função:** Mantém Promise do pipeline para teardown.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 169

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 170

- **Código:** `    beforeEach(async () => {`
- **Função:** Reseta módulos, mocks, DOM e storage.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 171

- **Código:** `        jest.resetModules();`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 172

- **Código:** `        initMocks();`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 173

- **Código:** `        jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 174

- **Código:** `            x: 0, y: 0, top: 0, left: 0, right: 160, bottom: 48,`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 175

- **Código:** `            width: 160, height: 48, toJSON() { return this; },`
- **Função:** Compõe o cenário fixture editor/attachment/send.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 176

- **Código:** `        }));`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** fixture editor/attachment/send.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 177

- **Código:** `        Element.prototype.scrollIntoView = jest.fn();`
- **Função:** Compõe o cenário estrutura final.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 178

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 179

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 180

- **Código:** `        sentMessages = [];`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 181

- **Código:** `        processPromise = null;`
- **Função:** Mantém Promise do pipeline para teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 182

- **Código:** `        await storageMock.clear();`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 183

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 184

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 185

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 186

- **Código:** `    afterEach(async () => {`
- **Função:** Para observers, aguarda processPromise e restaura ambiente.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 187

- **Código:** `        const activeObserver = window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 188

- **Código:** `        if (activeObserver && typeof activeObserver.stop === 'function') {`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 189

- **Código:** `            try { activeObserver.stop(); } catch (_error) {}`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 190

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 191

- **Código:** `        delete window.__mangaTranslatorActiveGeminiObserver;`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 192

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 193

- **Código:** `        const observerRegistry = window.__mtGeminiObservers;`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 194

- **Código:** `        if (observerRegistry && typeof observerRegistry === 'object') {`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 195

- **Código:** `            for (const observer of Object.values(observerRegistry)) {`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 196

- **Código:** `                if (observer && typeof observer.stop === 'function') {`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 197

- **Código:** `                    try { observer.stop(); } catch (_error) {}`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 198

- **Código:** `                }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 199

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 200

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 201

- **Código:** `        delete window.__mtGeminiObservers;`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 202

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 203

- **Código:** `        if (processPromise) await processPromise.catch(() => {});`
- **Função:** Mantém Promise do pipeline para teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 204

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 205

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 206

- **Código:** `        document.documentElement.innerHTML = '<head></head><body></body>';`
- **Função:** Compõe o cenário suite/setup/teardown.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 207

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** suite/setup/teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 208

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 209

- **Código:** `    test('eleva URLs do Google User Content substituindo parâmetros =s1024, =s512 por =s0', () => {`
- **Função:** Declara cenário: teste local espelho de elevateUrl.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 210

- **Código:** `        function elevateUrl(url) {`
- **Função:** Define uma cópia local da regra de elevação; não chama produção.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 211

- **Código:** `            if (url.includes('googleusercontent.com') && /=s\d+/.test(url)) {`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 212

- **Código:** `                return url.replace(/=s\d+[^?#]*/, '=s0');`
- **Função:** Espelha regex que substitui =sN e sufixos por =s0.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 213

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 214

- **Código:** `            return url;`
- **Função:** Compõe o cenário teste local espelho de elevateUrl.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 215

- **Código:** `        }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 216

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 217

- **Código:** `        const cases = [`
- **Função:** Monta matriz de URLs do teste local.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 218

- **Código:** `            {`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 219

- **Código:** `                input: 'https://lh3.googleusercontent.com/drive-storage/AJ6_test=s1024',`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 220

- **Código:** `                expected: 'https://lh3.googleusercontent.com/drive-storage/AJ6_test=s0',`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 221

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 222

- **Código:** `            {`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 223

- **Código:** `                input: 'https://lh3.googleusercontent.com/fife/ABX_test=s512-rw',`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 224

- **Código:** `                expected: 'https://lh3.googleusercontent.com/fife/ABX_test=s0',`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 225

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 226

- **Código:** `            {`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 227

- **Código:** `                input: 'https://lh3.googleusercontent.com/fife/ABX_test=s2048?authuser=0',`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 228

- **Código:** `                expected: 'https://lh3.googleusercontent.com/fife/ABX_test=s0?authuser=0',`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 229

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 230

- **Código:** `            {`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 231

- **Código:** `                input: 'https://lh3.googleusercontent.com/img=s1200-c-rj-v1-e365#frag',`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 232

- **Código:** `                expected: 'https://lh3.googleusercontent.com/img=s0#frag',`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 233

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 234

- **Código:** `            {`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 235

- **Código:** `                input: 'https://example.com/cdn/image=s1024.png',`
- **Função:** Define URL de entrada da matriz.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 236

- **Código:** `                expected: 'https://example.com/cdn/image=s1024.png',`
- **Função:** Define URL esperada da matriz.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 237

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 238

- **Código:** `            {`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 239

- **Código:** `                input: 'blob:https://gemini.google.com/1234-5678',`
- **Função:** Define URL de entrada da matriz.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 240

- **Código:** `                expected: 'blob:https://gemini.google.com/1234-5678',`
- **Função:** Define URL esperada da matriz.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 241

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 242

- **Código:** `        ];`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 243

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 244

- **Código:** `        cases.forEach(({ input, expected }) => {`
- **Função:** Executa assertions sobre a função espelho local.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 245

- **Código:** `            expect(elevateUrl(input)).toBe(expected);`
- **Função:** Assertion focal.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas apenas sobre a função espelho local.

### Linha 246

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 247

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** teste local espelho de elevateUrl.
- **Evidência:** 🟦 GATE LOCAL — não executa a regra de produção.

### Linha 248

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 249

- **Código:** `    test('processGeminiJob solicita FETCH_IMAGE_AS_BASE64 com a URL elevada para =s0', async () => {`
- **Função:** Declara cenário: integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa content/job-runner reais.

### Linha 250

- **Código:** `        const cdnUrlLowRes = 'https://lh3.googleusercontent.com/drive-storage/SAMPLE_MANGA=s1024-rw';`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 251

- **Código:** `        const expectedElevatedUrl = 'https://lh3.googleusercontent.com/drive-storage/SAMPLE_MANGA=s0';`
- **Função:** Espelha a condição produção: domínio textual + parâmetro =sN.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 252

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 253

- **Código:** `        mountGeminiEditor({`
- **Função:** Monta composer realista.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 254

- **Código:** `            onSubmit: () => {`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 255

- **Código:** `                setTimeout(() => {`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 256

- **Código:** `                    appendGeneratedImage(cdnUrlLowRes);`
- **Função:** Define URL googleusercontent de baixa resolução usada na integração real.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 257

- **Código:** `                }, 1300);`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 258

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 259

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 260

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 261

- **Código:** `        const tabId = 99;`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 262

- **Código:** `        delete window.location;`
- **Função:** Configura aba Gemini gerenciada.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 263

- **Código:** `        window.location = new URL(&#96;https://gemini.google.com/app?mangatranslator=true&tabId=${tabId}&#96;);`
- **Função:** Configura aba Gemini gerenciada.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 264

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 265

- **Código:** `        await storageMock.set({`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 266

- **Código:** `            [&#96;gemini_job_${tabId}&#96;]: {`
- **Função:** Persiste job para claim legacy no content real.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 267

- **Código:** `                jobId: 'job-resolution',`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 268

- **Código:** `                batchId: 'batch-test',`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 269

- **Código:** `                mangaTabId: 10,`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 270

- **Código:** `                index: 0,`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 271

- **Código:** `                prompt: 'Traduza o texto mantendo balões.',`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 272

- **Código:** `                geminiExecutionMode: 'temp_chat',`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 273

- **Código:** `            },`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 274

- **Código:** `            debugMode: true,`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 275

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 276

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 277

- **Código:** `        runtimeMock.sendMessage = jest.fn((message, callback) => {`
- **Função:** Intercepta mensagens do content real para responder/provar protocolo.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 278

- **Código:** `            sentMessages.push(message);`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 279

- **Código:** `            if (message.action === 'GET_TAB_ID') {`
- **Função:** Responde tab id usado no fallback legacy.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 280

- **Código:** `                if (callback) callback({ tabId });`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 281

- **Código:** `            } else if (message.action === 'REQUEST_IMAGE_DATA') {`
- **Função:** Entrega imagem de entrada ao runner.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 282

- **Código:** `                if (callback) callback({ srcData: 'data:image/png;base64,QUJDRA==' });`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 283

- **Código:** `            } else if (message.action === 'FETCH_IMAGE_AS_BASE64') {`
- **Função:** Captura URL final solicitada para extração base64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 284

- **Código:** `                if (callback) callback({ dataUrl: 'data:image/png;base64,UkVTVUxUX0VMRVZBVEVE' });`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 285

- **Código:** `            } else {`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 286

- **Código:** `                if (callback) callback(undefined);`
- **Função:** Compõe o cenário integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 287

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 288

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 289

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 290

- **Código:** `        jest.isolateModules(() => {`
- **Função:** Carrega cadeia real de módulos em isolamento.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 291

- **Código:** `            require(GEMINI_SELECTORS_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 292

- **Código:** `            require(GEMINI_DOM_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 293

- **Código:** `            require(GEMINI_OBSERVER_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 294

- **Código:** `            require(GEMINI_EDITOR_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 295

- **Código:** `            require(GEMINI_ATTACHMENT_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 296

- **Código:** `            require(GEMINI_TEMP_CHAT_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 297

- **Código:** `            require(GEMINI_RESULT_EXTRACTOR_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 298

- **Código:** `            require(GEMINI_DELETION_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 299

- **Código:** `            require(GEMINI_JOB_RUNNER_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 300

- **Código:** `            const contentGemini = require(CONTENT_GEMINI_PATH);`
- **Função:** Carrega módulo Gemini real necessário ao processGeminiJob.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução.

### Linha 301

- **Código:** `            processPromise = contentGemini.processGeminiJob();`
- **Função:** Mantém Promise do pipeline para teardown.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa content/job-runner reais.

### Linha 302

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 303

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 304

- **Código:** `        await waitFor(() => sentMessages.find(m => m.action === 'FETCH_IMAGE_AS_BASE64'));`
- **Função:** Captura URL final solicitada para extração base64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** ✅ PROVADO DIRETAMENTE — atravessa content/job-runner reais.

### Linha 305

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 306

- **Código:** `        const fetchCall = sentMessages.find(m => m.action === 'FETCH_IMAGE_AS_BASE64');`
- **Função:** Captura URL final solicitada para extração base64.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 307

- **Código:** `        expect(fetchCall).toBeDefined();`
- **Função:** Recupera request FETCH_IMAGE_AS_BASE64 para assertion exata.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 308

- **Código:** `        expect(fetchCall.url).toBe(expectedElevatedUrl);`
- **Função:** Define URL =s0 esperada no request ao background.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 309

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 310

- **Código:** `        const extractedMsg = sentMessages.find(m => m.action === 'GEMINI_IMAGE_EXTRACTED');`
- **Função:** Recupera GEMINI_IMAGE_EXTRACTED enviado após fetch.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 311

- **Código:** `        expect(extractedMsg).toBeDefined();`
- **Função:** Recupera GEMINI_IMAGE_EXTRACTED enviado após fetch.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 312

- **Código:** `        expect(extractedMsg.src).toBe('data:image/png;base64,UkVTVUxUX0VMRVZBVEVE');`
- **Função:** Recupera GEMINI_IMAGE_EXTRACTED enviado após fetch.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal.

### Linha 313

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** integração processGeminiJob → FETCH_IMAGE_AS_BASE64.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Linha 314

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático.
- **Contexto:** estrutura final.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem assertion exclusiva.

### Posição 315 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 11. Conclusão documental

Foram documentadas 314 linhas textuais e a posição 315 do newline final. A integração real prova a elevação s1024-rw→s0; a matriz mais ampla foi corretamente reclassificada como espelho local e gerou solicitações para fortalecer a prova de produção.

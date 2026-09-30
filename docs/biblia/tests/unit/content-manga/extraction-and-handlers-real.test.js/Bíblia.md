# Bíblia técnica — tests/unit/content-manga/extraction-and-handlers-real.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DOCUMENTAL APROVADA  
> **SHA auditado:** 038961e8228c7b5f1a87023a739ad5f33288423b  
> **Agente responsável:** AGENTE 21  
> **Índice do corpus:** 203  
> **Tipo:** suíte Jest/JSDOM de modo de extração auxiliar e handlers reais do content_manga  
> **Linhas textuais:** **815**  
> **Posições documentais:** **816**, contando o newline final  
> **Tamanho textual observado:** **34703 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é uma das provas comportamentais mais amplas de extension/content/content_manga.js.

Ela cobre duas superfícies independentes:

1. **modo de extração auxiliar** — quando a aba é googleusercontent/google.com ou possui hash #manga-translator-extraction, validando handshake com o background, carregamento da imagem, canvas/fallback, ACK persistido, retries e cleanup;
2. **handlers reais do modo leitor** — UPDATE_IMAGE, GET_PAGE_IMAGES, REQUEST_IMAGE_DATA, START_TRANSLATION_FROM_POPUP, BATCH_COMPLETE, SHOW_ERROR_INTEGRATED e HIGHLIGHT_IMAGE.

A implementação real é carregada por require/isolateModules ou pelo helper loadContentScript; não há cópia das funções sob teste.

## 2. Implementação de produção confrontada

Fonte: extension/content/content_manga.js, SHA a8b3698019f6f22027f09f544f15c0563a9f6515.

### Extração auxiliar

- linhas 695–700: detectam host legado ou hash marcado;
- 701–731: criam estado de lifecycle, sets de timers/intervals e pagehide cleanup;
- 733–745: consultam CHECK_IF_EXTRACTION_TAB e repetem mapeamento em aba marcada;
- 746–751: aguardam imagem até MAX_ATTEMPTS;
- 753–797: gerenciam até três passagens e ACK/retry;
- 798–813: tentam canvas e, em falha, FETCH_IMAGE_AS_BASE64;
- 815–859: tratam imagem carregada/incompleta, eventos, polling e safety timeout de 20s;
- 868–873: excluem hosts de extração do modo leitor normal.

### Handlers

- UPDATE_IMAGE inicia na linha 2546;
- guard STALE_UPDATE: 2555–2560;
- persistência/ACK: culmina em 2648–2657;
- BATCH_COMPLETE: 2660–2667, incluindo STALE_COMPLETE;
- SHOW_ERROR_INTEGRATED: 2668–2670;
- GET_PAGE_IMAGES: 2702–2708;
- START_TRANSLATION_FROM_POPUP: 2795–2821;
- HIGHLIGHT_IMAGE: 2822–2829;
- REQUEST_IMAGE_DATA: 2830–2857.

## 3. Bootstrap e dependências

O arquivo usa path, crypto e TextEncoder para reproduzir o ambiente de extensão. fs é importado na linha 2, mas não é utilizado no SHA auditado.

CONTENT_MANGA_PATH, CM_GTC_CLIENT_PATH e CM_DOM_REPLACE_PATH permitem carregar explicitamente a sequência mínima da aba auxiliar.

loadContentScript é usado para o modo leitor completo.

Os mocks de runtime/storage são reais dentro do harness Jest e recebem/resetam listeners do content script.

## 4. Helpers locais

### delay / waitFor

Polling assíncrono com performance.now, timeout padrão de 2s e intervalo de 10ms. Vários testes aumentam para 3s quando existe retry de 700ms.

### setWindowLocation

Substitui window.location por objeto controlado contendo hostname, href, pathname, hash e origin. É essencial para escolher entre modo auxiliar e leitor.

### getContentListener

Exige exatamente um listener do content_manga. Essa cardinalidade detecta contaminação por instâncias duplicadas.

### dispatchToContent

Invoca o listener real com sendResponse e registra o booleano keepAlive.

Ele permite provar contratos síncronos e assíncronos de REQUEST_IMAGE_DATA.

### defineImageState

Configura src, naturalWidth, naturalHeight, complete e scrollIntoView em imagens JSDOM, permitindo simular imagem pronta ou incompleta.

## 5. Setup/teardown

beforeEach:

- resetModules;
- preserva sendMessage/getContext originais;
- zera listeners e lastError;
- limpa storage e flags;
- zera DOM.

afterEach é particularmente importante nesta suíte:

- despacha pagehide;
- restaura runtime.sendMessage;
- restaura HTMLCanvasElement.getContext;
- restoreAllMocks;
- limpa storage/flags/DOM.

O pagehide força o cleanup real do modo auxiliar e reduz timers/listeners órfãos entre casos.

## 6. loadExtractionScript

Esse helper:

1. configura URL candidata;
2. constrói DOM opcional;
3. captura mensagens runtime;
4. responde CHECK_IF_EXTRACTION_TAB;
5. responde FETCH_IMAGE_AS_BASE64;
6. responde IMAGE_READY_FROM_NEW_TAB;
7. carrega cm-gtc-client, cm-dom-replace e content_manga em isolateModules;
8. espera duas macrotasks iniciais.

A lógica de retry/lifecycle continua sendo da produção; o helper apenas simula respostas externas.

## 7. Matriz de 25 casos

### Grupo de extração auxiliar

| Caso | Linhas | Propriedade | Classificação |
|---|---:|---|---|
| ACK persistido | 180–196 | uma entrega, sem retry tardio >700ms | ✅ PROVADO DIRETAMENTE |
| ACK negativo→retry→ACK | 198–223 | entrega idêntica é repetida e para após persistência | ✅ PROVADO DIRETAMENTE |
| cleanup remove pagehide listener | 225–239 | após sucesso, pagehide não cria nova entrega | ✅ PROVADO DIRETAMENTE |
| pagehide cancela retry | 241–255 | ACK negativo agenda retry, descarte impede segunda entrega | ✅ PROVADO DIRETAMENTE |
| pagehide cancela remapeamento | 257–267 | aba marcada não faz nova CHECK após descarte | ✅ PROVADO DIRETAMENTE |
| safety timeout | 269–291 | timer 20s limpa polling/listeners e impede entrega posterior | ✅ PROVADO DIRETAMENTE |
| imagem já pronta | 293–314 | mapping + IMAGE_READY imediato com IDs e canvas data URL | ✅ PROVADO DIRETAMENTE |
| mapping falso | 316–330 | não extrai nem faz fetch fallback | ✅ PROVADO DIRETAMENTE |
| google.com comum | 332–339 | sem marca auxiliar mantém modo leitor/botão | ✅ PROVADO DIRETAMENTE |
| hash marcado fora Google | 341–364 | host arbitrário marcado executa extração | ✅ PROVADO DIRETAMENTE |
| mapping ainda não persistido | 366–400 | repete CHECK até obter mapping e entrega com jobId/batchId | ✅ PROVADO DIRETAMENTE |
| espera evento load | 402–437 | nenhuma entrega antes do load; uma depois | ✅ PROVADO DIRETAMENTE |
| canvas CORS→fetch | 439–467 | usa FETCH_IMAGE_AS_BASE64 e entrega dataUrl retornada | ✅ PROVADO DIRETAMENTE |
| falha transitória→retry | 469–499 | retry de fetch ocorre e entrega quando tentativa posterior recupera | ✅ PROVADO DIRETAMENTE |

### Grupo de handlers reais

| Caso | Linhas | Propriedade | Classificação |
|---|---:|---|---|
| UPDATE_IMAGE | 503–555 | substitui DOM, marca translated, persiste chapter/restore e envia GTC_SAVE | ✅ PROVADO DIRETAMENTE |
| GET_PAGE_IMAGES filtros | 557–584 | exclui banida, pequena e translated | ✅ PROVADO DIRETAMENTE |
| limites configurados | 586–605 | usa imageMinWidth/Height definidos | ✅ PROVADO DIRETAMENTE |
| limites dinâmicos | 607–622 | storage novo é aplicado sem reload | ✅ PROVADO DIRETAMENTE |
| REQUEST canvas | 624–639 | retorna data URL síncrona e keepAlive=false | ✅ PROVADO DIRETAMENTE |
| REQUEST CORS | 641–675 | fallback runtime, keepAlive=true e retorno assíncrono | ✅ PROVADO DIRETAMENTE |
| REQUEST sem imagem | 677–691 | retorna Image not found e keepAlive=false | ✅ PROVADO DIRETAMENTE |
| START popup | 693–718 | índices [0,2] tornam-se START_BATCH + prompt | ✅ PROVADO DIRETAMENTE |
| BATCH_COMPLETE | 720–751 | força conclusão, restaura botão e toast de sucesso | ✅ PROVADO DIRETAMENTE |
| SHOW_ERROR | 753–777 | abre drawer, marca erro/collapsed e mostra texto | ✅ PROVADO DIRETAMENTE |
| HIGHLIGHT | 779–813 | aplica outline/scroll e depois remove estilos/transição | ✅ PROVADO DIRETAMENTE |

## 8. Protocolo de ACK da aba auxiliar

deliverImage marca imageDelivered=true antes de enviar IMAGE_READY_FROM_NEW_TAB.

Somente ACK com ok=true e persisted diferente de false encerra o lifecycle.

ACK negativo:

- reabre imageDelivered=false;
- loga AUXILIARY_RESULT_ACK_FAILED;
- agenda nova passagem em 700ms, respeitando MAX_EXTRACTION_PASSES.

Os dois primeiros testes provam tanto a ausência de retry após ACK persistido quanto a repetição após ACK negativo.

A equality entre deliveries()[1] e deliveries()[0] prova que o retry conserva o mesmo payload, não apenas a quantidade.

## 9. Cleanup e descarte

finishExtraction é idempotente e limpa:

- todos extractionTimeouts;
- todos extractionIntervals;
- waiters de imagem;
- listener pagehide.

O #203 prova quatro facetas:

1. sucesso remove o listener;
2. pagehide cancela retry agendado;
3. pagehide cancela remapeamento da aba marcada;
4. safety timeout limpa polling/load/error listeners.

Isso é evidência direta relevante contra worker/timer leaks no modo auxiliar.

## 10. Mapeamento da aba auxiliar

Host legado usa no máximo uma consulta de mapping; aba marcada usa MAX_MAPPING_CHECKS=20 e retry de 100ms.

O teste de mapping tardio força duas respostas false antes da resposta válida e exige pelo menos três CHECK_IF_EXTRACTION_TAB.

O teste de descarte demonstra que o retry de mapping para se a página for descarregada.

A suíte não leva o mapping marcado até o limite de 20 falhas; esse branch terminal permanece sem prova focal.

## 11. Carregamento da imagem

Se img.complete e naturalHeight != 0, sendImage roda imediatamente.

Caso contrário, produção instala:

- load listener;
- error listener;
- polling de 100ms;
- safety timeout de 20s.

O teste de load prova o caminho de resolução positiva.

O teste de safety invoca diretamente o callback do timer de 20s encontrado pelo spy e exige clearInterval + remoção dos dois listeners + nenhuma entrega mesmo se load for disparado depois.

## 12. Canvas e fallback

No modo auxiliar, canvas é primeira tentativa.

SecurityError no drawImage direciona a FETCH_IMAGE_AS_BASE64.

O teste de fallback prova URL correta e data URL entregue.

O teste transitório responde primeiro error e depois data URL; fetchCalls > 1 prova repetição da cadeia.

A suíte não leva três passagens de extração consecutivas a falhar até AUXILIARY_EXTRACT_FAILED por MAX_EXTRACTION_PASSES; isso vira solicitação 203-003.

## 13. UPDATE_IMAGE

O teste marca a imagem original com mangaIndex=0 e origHash=abc123hash.

Após UPDATE_IMAGE:

- src recebe data URL traduzida;
- dataset.translated=true;
- storage *_images salva índice 0;
- storage *_restoreMap associa URL original→data URL;
- GTC_SAVE carrega hash, translatedDataUrl e cleanUrl.

Isso prova a integração DOM + persistência + cache global para caminho feliz.

Limites:

- não fornece batchId;
- não usa expectAck=true;
- não força persistTranslatedPage a rejeitar.

Logo não prova STALE_UPDATE nem ACK persist_failed.

## 14. GET_PAGE_IMAGES

A primeira prova combina três filtros:

- URL banida;
- dataset.translated;
- dimensões abaixo do mínimo.

A segunda prova usa limites custom 150×100.

A terceira altera storage depois do content script já carregado e prova que a imagem antes rejeitada passa a ser retornada sem reload.

Isso é forte evidência de atualização dinâmica de imageMinDimensions.

## 15. REQUEST_IMAGE_DATA

### Canvas normal

Com mangaIndex=0, retorna TEST_CANVAS diretamente.

A função do listener retorna false; o helper registra keepAlive=false.

### CORS

getContext/drawImage lança SecurityError.

A implementação envia FETCH_IMAGE_AS_BASE64 e retorna true para manter o canal de resposta vivo.

A suíte confirma mensagem exata e srcData assíncrono.

### Imagem ausente

Índice 99 retorna imediatamente error=Image not found e keepAlive=false.

Não há caso focal em que FETCH_IMAGE_AS_BASE64 responda sem dataUrl; o código retornaria error=Failed.

## 16. START/BATCH_COMPLETE/error/highlight

START_TRANSLATION_FROM_POPUP prova que seleção [0,2] é preservada até START_BATCH.

BATCH_COMPLETE usa implementação real e prova retorno visual a TRADUZIR 1 PÁGINA + toast Tradução Concluída!.

SHOW_ERROR_INTEGRATED duplica parte da cobertura do #201, confirmando drawer básica.

HIGHLIGHT_IMAGE prova tanto aplicação do destaque/scroll quanto remoção após timeout de transição de 420ms.

## 17. Evidência estática de execução

jest.config.js inclui tests/unit/content-manga/**/*.test.js no projeto content-scripts/JSDOM.

scripts/ci/run-jest-ci.js inventaria tests unit/integration e falha se arquivo esperado não aparecer no relatório.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO para descoberta/execução, separado das assertions comportamentais.

## 18. Lacunas comprovadas

| Comportamento | Estado | Classificação |
|---|---|---|
| STALE_UPDATE é rejeitado sem aplicar/persistir resultado antigo | branch existe, busca não localizou teste positivo do descarte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| STALE_COMPLETE não encerra lote atual | branch existe, nenhum teste localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| três falhas de extração esgotam passagens | só há falha transitória seguida de sucesso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| UPDATE_IMAGE persist failure retorna ACK persist_failed | branch existe, nenhum teste localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| REQUEST_IMAGE_DATA fallback retorna error Failed sem dataUrl | branch existe, não focalizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| mapping marcado expira após 20 CHECKs | não focalizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| caminho error event de imagem incompleta | listener é limpo no safety, mas evento error funcional não é testado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 19. Solicitações ao auditor

### 203-001 — TEST_REQUIRED — OPEN

**Encontrado:** UPDATE_IMAGE contém guard de batchId stale antes de aplicar DOM/persistir, mas o teste de UPDATE_IMAGE não envia batchId e a busca não encontrou prova focal do descarte.

**Contexto:** auditoria de tests/unit/content-manga/extraction-and-handlers-real.test.js.

**Arquivo relacionado:** este teste; produção content_manga.js linhas 2555–2560.

**Evidência atual:** caminho feliz aplica imagem, storage e GTC_SAVE.

**Evidência ausente:** lote corrente estabelecido + UPDATE_IMAGE de outro batchId, idealmente com expectAck=true.

**Por que insuficiente:** resultado atrasado de lote antigo não pode sobrescrever página do lote atual.

**Ação solicitada:** adicionar teste real que configure batch atual, envie UPDATE_IMAGE stale e verifique DOM/storage inalterados, ausência de GTC_SAVE e ACK {ok:false, reason:'stale_batch'}.

**Evidência esperada:** rejeição integral antes de side effects.

**Possível regressão:** página pode receber tradução pertencente a outro lote.

**Impacto:** integridade entre lotes.

**Severidade:** HIGH.

### 203-002 — TEST_REQUIRED — OPEN

**Encontrado:** BATCH_COMPLETE possui guard STALE_COMPLETE, mas o teste atual envia BATCH_COMPLETE sem batchId.

**Contexto:** auditoria do #203.

**Arquivo relacionado:** este teste; produção linhas 2660–2667.

**Evidência atual:** conclusão válida sem batchId restaura UI e mostra toast.

**Evidência ausente:** batch atual A + BATCH_COMPLETE de batch B verificando que A não conclui.

**Por que insuficiente:** uma conclusão atrasada não deve zerar contadores/status do lote ativo.

**Ação solicitada:** adicionar cenário stale com batchId divergente usando implementação real.

**Evidência esperada:** UI permanece traduzindo, lote atual preservado e log STALE_COMPLETE emitido.

**Possível regressão:** lote ativo pode ser encerrado prematuramente por mensagem antiga.

**Impacto:** isolamento e accounting de batches.

**Severidade:** HIGH.

### 203-003 — TEST_REQUIRED — OPEN

**Encontrado:** modo auxiliar permite MAX_EXTRACTION_PASSES=3 e chama AUXILIARY_EXTRACT_FAILED ao esgotar, mas só há prova de falha transitória seguida de sucesso.

**Contexto:** auditoria do #203.

**Arquivo relacionado:** este teste; produção linhas 788–812.

**Evidência atual:** ACK negativo agenda retry; falha do fetch uma vez recupera na tentativa posterior; pagehide cancela retry.

**Evidência ausente:** canvas falha e FETCH_IMAGE_AS_BASE64 falha nas três passagens até cleanup terminal.

**Por que insuficiente:** o branch de exaustão é responsável por encerrar timers/lifecycle sem loop infinito.

**Ação solicitada:** simular falha persistente, avançar/aguardar os três retries e provar contagem finita, log AUXILIARY_EXTRACT_FAILED e ausência de novas chamadas depois do finish.

**Evidência esperada:** exatamente número esperado de passagens e lifecycle encerrado.

**Possível regressão:** aba auxiliar pode ficar repetindo indefinidamente ou encerrar sem observabilidade.

**Impacto:** recursos, estabilidade e diagnóstico.

**Severidade:** NORMAL.

### 203-004 — TEST_REQUIRED — OPEN

**Encontrado:** persistTranslatedPage pode rejeitar durante UPDATE_IMAGE; a produção loga PERSIST_FAIL e, com expectAck=true, devolve persist_failed.

**Contexto:** auditoria do #203.

**Arquivo relacionado:** este teste; produção linhas 2648–2657 e módulo de chapter persistence.

**Evidência atual:** caminho de persistência bem-sucedida é diretamente provado.

**Evidência ausente:** rejeição real/controlada da persistência e contrato de ACK de falha.

**Por que insuficiente:** background depende do ACK para saber se o resultado foi realmente persistido.

**Ação solicitada:** adicionar teste que force falha da persistência sem substituir a função sob teste e verifique ACK/log/estado.

**Evidência esperada:** {ok:false, reason:'persist_failed'}, PERSIST_FAIL e comportamento DOM/accounting documentado.

**Possível regressão:** background pode considerar resultado seguro quando storage falhou ou entrar em retry incorreto.

**Impacto:** durabilidade e coordenação content/background.

**Severidade:** HIGH.

Nenhum arquivo externo foi alterado pelo AGENTE 21.

## 20. Invariantes

1. ACK só encerra extração quando confirma persistência.
2. Retry não pode sobreviver a pagehide/finishExtraction.
3. Mapping de aba marcada pode aparecer com atraso sem perder a extração.
4. Host google.com não marcado ainda pode operar como leitor quando habilitado.
5. Hash marcado deve ativar extração mesmo fora de Google.
6. Imagem incompleta não pode ser enviada antes de load/poll válido.
7. Safety timeout deve remover waiters.
8. Canvas CORS deve ter fallback runtime.
9. UPDATE_IMAGE feliz deve sincronizar DOM, chapter state, restore map e GTC.
10. GET_PAGE_IMAGES deve respeitar bans, tradução prévia e limites dinâmicos.
11. REQUEST_IMAGE_DATA deve sinalizar keepAlive corretamente em resposta assíncrona.
12. START popup deve preservar índices solicitados.
13. BATCH_COMPLETE válido deve restaurar UI.
14. Highlight off deve limpar estilos transitórios.
15. Esta Bíblia vale somente para SHA 038961e8228c7b5f1a87023a739ad5f33288423b.

## 21. Fonte integral auditada

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

const CONTENT_MANGA_PATH = path.join(ROOT, 'extension/content/content_manga.js');
const CM_GTC_CLIENT_PATH = path.join(ROOT, 'extension/content/cm-gtc-client.js');
const CM_DOM_REPLACE_PATH = path.join(ROOT, 'extension/content/cm-dom-replace.js');
const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = 2000, interval = 10 } = {}) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeout) {
        const result = await assertion();
        if (result) return result;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condicao');
}

function setWindowLocation(hostname, pathname = '/chapter/1', hash = '') {
    Object.defineProperty(window, 'location', {
        value: {
            hostname,
            href: `https://${hostname}${pathname}${hash}`,
            pathname,
            hash,
            origin: `https://${hostname}`,
        },
        configurable: true,
        writable: true,
    });
}

function getContentListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    if (listeners.length !== 1) {
        throw new Error(`Esperava 1 listener do content_manga, recebi ${listeners.length}`);
    }
    return listeners[0];
}

function dispatchToContent(runtimeMock, request, sender = { tab: { id: 1 } }) {
    return new Promise((resolve) => {
        let settled = false;
        let keepAlive = false;

        const sendResponse = (response) => {
            settled = true;
            resolve({ keepAlive, response });
        };

        keepAlive = getContentListener(runtimeMock)(request, sender, sendResponse);
        if (keepAlive !== true && !settled) {
            resolve({ keepAlive, response: undefined });
        }
    });
}

function defineImageState(img, {
    src = 'https://lh3.googleusercontent.com/generated.png',
    width = 800,
    height = 1200,
    complete = true,
} = {}) {
    if (src !== null) img.src = src;
    img.scrollIntoView = jest.fn();
    Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true, writable: true });
    Object.defineProperty(img, 'complete', { value: complete, configurable: true, writable: true });
}

describe('CM-21/CM-22/CM-23/CM-24/CM-25/CM-26/CM-27/CM-28/CM-99/CM-100/CM-102/CM-103/CM-104/CM-107/CM-108/CM-109/CM-110/CM-111/CM-112/CM-113/CM-114/CM-115: content_manga.js - modo extracao e handlers reais', () => {
    let runtimeMock;
    let storageMock;
    let originalRuntimeSendMessage;
    let originalGetContext;

    beforeEach(async () => {
        jest.resetModules();

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        originalRuntimeSendMessage = runtimeMock.sendMessage;
        originalGetContext = window.HTMLCanvasElement.prototype.getContext;

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;

        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        window.dispatchEvent(new Event('pagehide'));
        runtimeMock.sendMessage = originalRuntimeSendMessage;
        Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
            value: originalGetContext,
            configurable: true,
            writable: true,
        });
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    async function loadExtractionScript({
        extractionResponse = { isExtractionTab: true, mangaTabId: 77, index: 3, geminiTabId: 999 },
        fetchFallbackResponse = { dataUrl: 'data:image/png;base64,RkFMTEJBQ0s=' },
        deliveryResponse = { ok: true, persisted: true },
        hostname = 'lh3.googleusercontent.com',
        hash = '',
        buildDom,
    } = {}) {
        setWindowLocation(hostname, '/proxy/result', hash);
        if (typeof buildDom === 'function') buildDom();

        const sentMessages = [];
        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'CHECK_IF_EXTRACTION_TAB') {
                const response = typeof extractionResponse === 'function'
                    ? extractionResponse(message)
                    : extractionResponse;
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'FETCH_IMAGE_AS_BASE64') {
                const response = typeof fetchFallbackResponse === 'function'
                    ? fetchFallbackResponse(message)
                    : fetchFallbackResponse;
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'IMAGE_READY_FROM_NEW_TAB') {
                const response = typeof deliveryResponse === 'function'
                    ? deliveryResponse(message)
                    : deliveryResponse;
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (callback) setTimeout(() => callback(undefined), 0);
        });

        jest.isolateModules(() => {
            require(CM_GTC_CLIENT_PATH);
            require(CM_DOM_REPLACE_PATH);
            require(CONTENT_MANGA_PATH);
        });

        await delay(0);
        await delay(0);
        return sentMessages;
    }

    describe('modo extracao em googleusercontent', () => {
        test('ACK persistido encerra a entrega sem retry tardio', async () => {
            const sentMessages = await loadExtractionScript({
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });

            const deliveries = () => sentMessages.filter(message =>
                message.action === 'IMAGE_READY_FROM_NEW_TAB'
            );
            await waitFor(() => deliveries().length === 1);
            await delay(850); // maior que o retry de 700 ms

            expect(deliveries()).toHaveLength(1);
        });

        test('ACK não confirmado repete a entrega e para após persistência', async () => {
            let acknowledgements = 0;
            const sentMessages = await loadExtractionScript({
                deliveryResponse: () => {
                    acknowledgements++;
                    return acknowledgements === 1
                        ? { ok: false, persisted: false, reason: 'not_persisted' }
                        : { ok: true, persisted: true };
                },
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });

            const deliveries = () => sentMessages.filter(message =>
                message.action === 'IMAGE_READY_FROM_NEW_TAB'
            );
            await waitFor(() => deliveries().length === 2, { timeout: 3000 });
            await delay(850);

            expect(deliveries()).toHaveLength(2);
            expect(acknowledgements).toBe(2);
            expect(deliveries()[1]).toEqual(deliveries()[0]);
        });

        test('cleanup remove o listener de descarte após ACK persistido', async () => {
            const removeListener = jest.spyOn(window, 'removeEventListener');
            const sentMessages = await loadExtractionScript({
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });
            await waitFor(() => sentMessages.some(message => message.action === 'IMAGE_READY_FROM_NEW_TAB'));
            await waitFor(() => removeListener.mock.calls.some(([type]) => type === 'pagehide'));
            window.dispatchEvent(new Event('pagehide'));
            await delay(750);
            expect(sentMessages.filter(message => message.action === 'IMAGE_READY_FROM_NEW_TAB')).toHaveLength(1);
        });

        test('descarte cancela retry agendado por ACK negativo', async () => {
            const sentMessages = await loadExtractionScript({
                deliveryResponse: { ok: false, persisted: false },
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });
            await waitFor(() => sentMessages.some(message => message.action === 'LOG_ENTRY' &&
                message.action_name === 'AUXILIARY_EXTRACT_RETRY'));
            window.dispatchEvent(new Event('pagehide'));
            await delay(750);
            expect(sentMessages.filter(message => message.action === 'IMAGE_READY_FROM_NEW_TAB')).toHaveLength(1);
        });

        test('descarte cancela a nova consulta de mapeamento da aba marcada', async () => {
            const sentMessages = await loadExtractionScript({
                hostname: 'cdn.example',
                hash: '#manga-translator-extraction',
                extractionResponse: { isExtractionTab: false },
            });
            expect(sentMessages.filter(message => message.action === 'CHECK_IF_EXTRACTION_TAB')).toHaveLength(1);
            window.dispatchEvent(new Event('pagehide'));
            await delay(150);
            expect(sentMessages.filter(message => message.action === 'CHECK_IF_EXTRACTION_TAB')).toHaveLength(1);
        });

        test('prazo de segurança remove polling e listeners da imagem incompleta', async () => {
            let img;
            const scheduleTimer = jest.spyOn(global, 'setTimeout');
            const clearPolling = jest.spyOn(global, 'clearInterval');
            const sentMessages = await loadExtractionScript({
                buildDom: () => {
                    img = document.createElement('img');
                    defineImageState(img, { src: null, complete: false, height: 0 });
                    document.body.appendChild(img);
                },
            });
            const removeImageListener = jest.spyOn(img, 'removeEventListener');
            const safety = scheduleTimer.mock.calls.find(([, delayMs]) => delayMs === 20000);
            expect(safety).toBeDefined();
            safety[0]();
            await delay(0);
            expect(clearPolling).toHaveBeenCalled();
            expect(removeImageListener.mock.calls.filter(([type]) => type === 'load')).toHaveLength(1);
            expect(removeImageListener.mock.calls.filter(([type]) => type === 'error')).toHaveLength(1);
            img.dispatchEvent(new Event('load'));
            await delay(0);
            expect(sentMessages.filter(message => message.action === 'IMAGE_READY_FROM_NEW_TAB')).toHaveLength(0);
        });

        test('envia IMAGE_READY_FROM_NEW_TAB imediatamente quando a imagem ja esta carregada', async () => {
            const sentMessages = await loadExtractionScript({
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });

            await waitFor(() => sentMessages.find(message => message.action === 'IMAGE_READY_FROM_NEW_TAB'));

            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'CHECK_IF_EXTRACTION_TAB',
            }));
            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'IMAGE_READY_FROM_NEW_TAB',
                mangaTabId: 77,
                index: 3,
                geminiTabId: 999,
                src: 'data:image/png;base64,TEST_CANVAS',
            }));
        });

        test('nao inicia extracao quando CHECK_IF_EXTRACTION_TAB retorna falso', async () => {
            const sentMessages = await loadExtractionScript({
                extractionResponse: { isExtractionTab: false },
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });

            await delay(50);

            expect(sentMessages.filter(message => message.action === 'IMAGE_READY_FROM_NEW_TAB')).toHaveLength(0);
            expect(sentMessages.filter(message => message.action === 'FETCH_IMAGE_AS_BASE64')).toHaveLength(0);
        });

        test('google.com comum mantém o modo leitor quando não é aba auxiliar marcada', async () => {
            const context = await loadContentScript({
                hostname: 'www.google.com',
                enabledDomains: ['www.google.com'],
            });

            expect(context.getButton()).not.toBeNull();
        });

        test('aba auxiliar marcada funciona em host não-Google', async () => {
            const sentMessages = await loadExtractionScript({
                hostname: '127.0.0.1',
                hash: '#manga-translator-extraction',
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, {
                        src: 'http://127.0.0.1:3999/gemini-result-image',
                        complete: true,
                        height: 900,
                    });
                    document.body.appendChild(img);
                },
            });

            await waitFor(() => sentMessages.find(message => message.action === 'IMAGE_READY_FROM_NEW_TAB'));

            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'IMAGE_READY_FROM_NEW_TAB',
                mangaTabId: 77,
                index: 3,
                geminiTabId: 999,
            }));
        });

        test('aba auxiliar marcada repete o lookup se o mapeamento ainda não foi persistido', async () => {
            let checks = 0;
            const sentMessages = await loadExtractionScript({
                hostname: 'cdn.example',
                hash: '#manga-translator-extraction',
                extractionResponse: () => {
                    checks++;
                    if (checks < 3) return { isExtractionTab: false };
                    return {
                        isExtractionTab: true,
                        mangaTabId: 77,
                        index: 3,
                        geminiTabId: 999,
                        jobId: 'job-delayed',
                        batchId: 'batch-delayed',
                    };
                },
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });

            await waitFor(() => sentMessages.find(message => message.action === 'IMAGE_READY_FROM_NEW_TAB'));

            expect(checks).toBeGreaterThanOrEqual(3);
            expect(sentMessages.filter(message => message.action === 'CHECK_IF_EXTRACTION_TAB').length)
                .toBeGreaterThanOrEqual(3);
            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'IMAGE_READY_FROM_NEW_TAB',
                jobId: 'job-delayed',
                batchId: 'batch-delayed',
            }));
        });

        test('aguarda o evento load quando a imagem ainda esta carregando', async () => {
            let img;
            const currentJobId = 'job-await-load';
            const sentMessages = await loadExtractionScript({
                extractionResponse: {
                    isExtractionTab: true,
                    mangaTabId: 77,
                    index: 3,
                    geminiTabId: 999,
                    jobId: currentJobId,
                    batchId: 'batch-await-load',
                },
                buildDom: () => {
                    img = document.createElement('img');
                    // Sem src: evita que o JSDOM dispare "error" de recurso antes
                    // do load manual que este teste quer validar.
                    defineImageState(img, { src: null, complete: false, height: 0 });
                    document.body.appendChild(img);
                },
            });

            const deliveriesForCurrentJob = () => sentMessages.filter(message =>
                message.action === 'IMAGE_READY_FROM_NEW_TAB' &&
                message.jobId === currentJobId
            );

            expect(deliveriesForCurrentJob()).toHaveLength(0);

            Object.defineProperty(img, 'naturalHeight', { value: 1200, configurable: true, writable: true });
            Object.defineProperty(img, 'complete', { value: true, configurable: true, writable: true });
            img.dispatchEvent(new Event('load'));

            await waitFor(() => deliveriesForCurrentJob()[0]);

            expect(deliveriesForCurrentJob()).toHaveLength(1);
        });

        test('faz fallback para FETCH_IMAGE_AS_BASE64 quando o canvas falha na aba de extracao', async () => {
            Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
                value: jest.fn(() => ({
                    drawImage: () => { throw new DOMException('Canvas blocked', 'SecurityError'); },
                })),
                configurable: true,
                writable: true,
            });

            const sentMessages = await loadExtractionScript({
                fetchFallbackResponse: { dataUrl: 'data:image/png;base64,RkFMTEJBQ0tfT0s=' },
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });

            await waitFor(() => sentMessages.find(message => message.action === 'IMAGE_READY_FROM_NEW_TAB'));

            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'FETCH_IMAGE_AS_BASE64',
                url: 'https://lh3.googleusercontent.com/generated.png',
            }));
            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'IMAGE_READY_FROM_NEW_TAB',
                src: 'data:image/png;base64,RkFMTEJBQ0tfT0s=',
            }));
        });

        test('repete a cadeia da aba auxiliar após falha transitória antes de entregar a imagem', async () => {
            Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
                value: jest.fn(() => ({
                    drawImage: () => { throw new DOMException('Canvas blocked', 'SecurityError'); },
                })),
                configurable: true,
                writable: true,
            });
            let fetchCalls = 0;
            const sentMessages = await loadExtractionScript({
                fetchFallbackResponse: () => {
                    fetchCalls += 1;
                    return fetchCalls > 1
                        ? { dataUrl: 'data:image/png;base64,UkVDVVBFUkFETw==' }
                        : { error: 'Failed to fetch' };
                },
                buildDom: () => {
                    const img = document.createElement('img');
                    defineImageState(img, { complete: true, height: 900 });
                    document.body.appendChild(img);
                },
            });

            await waitFor(() => sentMessages.find(message => message.action === 'IMAGE_READY_FROM_NEW_TAB'), { timeout: 3000 });

            expect(fetchCalls).toBeGreaterThan(1);
            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'IMAGE_READY_FROM_NEW_TAB',
                src: 'data:image/png;base64,UkVDVVBFUkFETw==',
            }));
        });
    });

    describe('handlers onMessage reais', () => {
        test('UPDATE_IMAGE substitui a imagem, salva estado do capitulo e envia GTC_SAVE', async () => {
            const sentMessages = [];
            await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                ],
            });

            const originalImg = document.querySelector('[data-testid="img-0"]');
            originalImg.dataset.mangaIndex = '0';
            originalImg.dataset.origHash = 'abc123hash';

            runtimeMock.sendMessage = jest.fn((message, callback) => {
                sentMessages.push(message);
                if (message.action === 'GTC_SAVE' && callback) {
                    setTimeout(() => callback({ ok: true }), 0);
                    return;
                }
                if (message.action === 'LOG_ENTRY' && callback) {
                    setTimeout(() => callback({ ok: true }), 0);
                    return;
                }
                if (callback) setTimeout(() => callback({ ok: true }), 0);
            });

            await dispatchToContent(runtimeMock, {
                action: 'UPDATE_IMAGE',
                index: 0,
                newSrc: 'data:image/png;base64,VFJBTlNMQVRFRA==',
            });

            await waitFor(async () => {
                const data = await storageMock.get(null);
                return Object.keys(data).some(key => key.endsWith('_images'));
            }, { timeout: 3000 });

            const updatedImg = document.querySelector('[data-testid="img-0"]');
            const data = await storageMock.get(null);
            const imageKey = Object.keys(data).find(key => key.endsWith('_images'));
            const restoreKey = Object.keys(data).find(key => key.endsWith('_restoreMap'));

            expect(updatedImg.getAttribute('src')).toBe('data:image/png;base64,VFJBTlNMQVRFRA==');
            expect(updatedImg.dataset.translated).toBe('true');
            expect(data[imageKey]).toEqual({ 0: 'data:image/png;base64,VFJBTlNMQVRFRA==' });
            expect(data[restoreKey]).toEqual({ 'http://localhost/page-0.png': 'data:image/png;base64,VFJBTlNMQVRFRA==' });
            expect(sentMessages).toContainEqual(expect.objectContaining({
                action: 'GTC_SAVE',
                hash: 'abc123hash',
                translatedDataUrl: 'data:image/png;base64,VFJBTlNMQVRFRA==',
                cleanUrl: 'http://localhost/page-0.png',
            }));
        });

        test('GET_PAGE_IMAGES exclui banidas, pequenas e ja traduzidas', async () => {
            const context = await loadContentScript({
                hostname: 'localhost',
                bannedImages: ['http://localhost/page-1.png'],
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                    { src: 'http://localhost/page-1.png', width: 800, height: 1200 },
                    { src: 'http://localhost/page-2.png', width: 800, height: 1200 },
                    { src: 'http://localhost/page-3.png', width: 120, height: 120 },
                ],
            });

            document.querySelector('[data-testid="img-2"]').dataset.translated = 'true';

            const response = await context.sendMessage('GET_PAGE_IMAGES');

            expect(response).toEqual({
                images: [
                    {
                        index: 0,
                        src: 'http://localhost/page-0.png',
                        width: 800,
                        height: 1200,
                    },
                ],
                total: 1,
            });
        });

        test('GET_PAGE_IMAGES respeita os limites de tamanho configurados pelo usuário', async () => {
            const context = await loadContentScript({
                hostname: 'localhost',
                imageMinWidth: 150,
                imageMinHeight: 100,
                domImages: [
                    { src: 'http://localhost/page-menor.png', width: 180, height: 120 },
                    { src: 'http://localhost/page-baixa.png', width: 180, height: 90 },
                ],
            });

            const response = await context.sendMessage('GET_PAGE_IMAGES');

            expect(response.images).toHaveLength(1);
            expect(response.images[0]).toMatchObject({
                src: 'http://localhost/page-menor.png',
                width: 180,
                height: 120,
            });
        });

        test('GET_PAGE_IMAGES aplica novos limites sem recarregar o content script', async () => {
            const context = await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-pequena.png', width: 180, height: 120 },
                ],
            });

            expect((await context.sendMessage('GET_PAGE_IMAGES')).images).toHaveLength(0);

            await storageMock.set({ imageMinWidth: 150, imageMinHeight: 100 });

            expect((await context.sendMessage('GET_PAGE_IMAGES')).images).toEqual([
                expect.objectContaining({ src: 'http://localhost/page-pequena.png' }),
            ]);
        });

        test('REQUEST_IMAGE_DATA devolve base64 direto quando o canvas funciona', async () => {
            await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                ],
            });

            document.querySelector('[data-testid="img-0"]').dataset.mangaIndex = '0';
            const result = await dispatchToContent(runtimeMock, { action: 'REQUEST_IMAGE_DATA', index: 0 });

            expect(result.keepAlive).toBe(false);
            expect(result.response).toEqual({
                srcData: 'data:image/png;base64,TEST_CANVAS',
            });
        });

        test('REQUEST_IMAGE_DATA usa FETCH_IMAGE_AS_BASE64 quando o canvas sofre bloqueio CORS', async () => {
            Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
                value: jest.fn(() => ({
                    drawImage: () => { throw new DOMException('Canvas blocked', 'SecurityError'); },
                })),
                configurable: true,
                writable: true,
            });

            await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                ],
            });

            document.querySelector('[data-testid="img-0"]').dataset.mangaIndex = '0';
            runtimeMock.sendMessage = jest.fn((message, callback) => {
                if (message.action === 'FETCH_IMAGE_AS_BASE64' && callback) {
                    setTimeout(() => callback({ dataUrl: 'data:image/png;base64,RkVUQ0hFRF9PSw==' }), 0);
                }
            });

            const result = await dispatchToContent(runtimeMock, { action: 'REQUEST_IMAGE_DATA', index: 0 });
            await waitFor(() => result.response);

            expect(result.keepAlive).toBe(true);
            expect(runtimeMock.sendMessage).toHaveBeenCalledWith(
                { action: 'FETCH_IMAGE_AS_BASE64', url: 'http://localhost/page-0.png' },
                expect.any(Function)
            );
            expect(result.response).toEqual({
                srcData: 'data:image/png;base64,RkVUQ0hFRF9PSw==',
            });
        });

        test('REQUEST_IMAGE_DATA responde erro quando a imagem nao existe no DOM', async () => {
            await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                ],
            });

            const result = await dispatchToContent(runtimeMock, { action: 'REQUEST_IMAGE_DATA', index: 99 });

            expect(result.keepAlive).toBe(false);
            expect(result.response).toEqual({
                error: 'Image not found',
            });
        });

        test('START_TRANSLATION_FROM_POPUP usa os indices recebidos e dispara START_BATCH', async () => {
            const sendMessageSpy = jest.spyOn(global.chrome.runtime, 'sendMessage');
            const context = await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                    { src: 'http://localhost/page-1.png', width: 800, height: 1200 },
                    { src: 'http://localhost/page-2.png', width: 800, height: 1200 },
                ],
            });

            await context.sendMessage('START_TRANSLATION_FROM_POPUP', { indices: [0, 2] });

            await waitFor(() => sendMessageSpy.mock.calls.some(([message]) =>
                message && message.action === 'START_BATCH'
            ), { timeout: 3000 });

            expect(sendMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'START_BATCH',
                    images: [{ index: 0 }, { index: 2 }],
                    prompt: 'Teste prompt',
                }),
                expect.any(Function)
            );
        });

        test('BATCH_COMPLETE força a conclusao do lote e restaura o texto do botao', async () => {
            const context = await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                ],
            });

            runtimeMock.sendMessage = jest.fn((message, callback) => {
                if (message.action === 'GTC_QUERY_MANY' && callback) {
                    setTimeout(() => callback({ ok: true, entriesByHash: {} }), 0);
                    return;
                }
                if (message.action === 'START_BATCH' && callback) {
                    setTimeout(() => callback({ ok: true }), 0);
                    return;
                }
                if (message.action === 'LOG_ENTRY' && callback) {
                    setTimeout(() => callback({ ok: true }), 0);
                    return;
                }
                if (callback) setTimeout(() => callback({ ok: true }), 0);
            });

            await context.sendMessage('START_TRANSLATION_FROM_POPUP', { indices: [0] });
            await waitFor(() => context.getMainContent().textContent.includes('TRADUZINDO'), { timeout: 3000 });

            await dispatchToContent(runtimeMock, { action: 'BATCH_COMPLETE' });

            await waitFor(() => context.getMainContent().textContent.includes('TRADUZIR 1 PÁGINA'), { timeout: 3000 });
            expect(document.body.textContent).toContain('Tradução Concluída!');
        });

        test('SHOW_ERROR_INTEGRATED abre a gaveta de erro e marca o botao com erro pendente', async () => {
            await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                ],
            });

            const btn = document.getElementById('manga-translator-trigger');
            const errorLine = document.getElementById('manga-error-line');
            const content = document.getElementById('manga-error-collapsible-content');

            await dispatchToContent(runtimeMock, {
                action: 'SHOW_ERROR_INTEGRATED',
                errorMsg: 'Falha ao processar a imagem',
                imgIndex: 7,
                isDebug: false,
            });

            expect(errorLine.style.display).toBe('flex');
            expect(btn.dataset.hasError).toBe('true');
            expect(btn.dataset.collapsed).toBe('false');
            expect(content.textContent).toContain('IMAGEM 7');
            expect(content.textContent).toContain('Falha ao processar a imagem');
        });

        test('HIGHLIGHT_IMAGE aplica destaque e depois remove o destaque ao desmarcar', async () => {
            await loadContentScript({
                hostname: 'localhost',
                domImages: [
                    { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                ],
            });

            const img = document.querySelector('[data-testid="img-0"]');
            img.dataset.mangaIndex = '0';
            window.scrollTo.mockClear();

            const onResult = await dispatchToContent(runtimeMock, {
                action: 'HIGHLIGHT_IMAGE',
                index: 0,
                highlight: true,
            });

            expect(onResult.response).toEqual({ success: true });
            expect(img.style.outline).toContain('4px solid');
            expect(window.scrollTo).toHaveBeenCalled();

            await dispatchToContent(runtimeMock, {
                action: 'HIGHLIGHT_IMAGE',
                index: 0,
                highlight: false,
            });

            await delay(450);

            expect(img.style.outline).toBe('');
            expect(img.style.boxShadow).toBe('');
            expect(img.style.transition).toBe('');
        });
    });
});

~~~

O blob termina com newline LF.

## 22. Cobertura posição a posição

### Linhas 1–18 — imports e caminhos
Carregam módulos nativos, root, globals, paths da produção e harness. fs permanece sem uso. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 19–31 — delay/waitFor
Polling real com timeout e erro explícito. **Evidência:** ✅ usado por cenários assíncronos.

### Linhas 32–45 — location helper
Constrói window.location controlado, incluindo hash que diferencia aba marcada. **Evidência:** ✅ usado no loader auxiliar.

### Linhas 46–55 — listener helper
Exige um único listener e retorna-o. **Evidência:** ✅ todos os dispatchToContent dependem disso.

### Linhas 56–73 — dispatch helper
Captura resposta síncrona/assíncrona e keepAlive. **Evidência:** ✅ prova contratos REQUEST_IMAGE_DATA e outros handlers.

### Linhas 74–85 — defineImageState
Define dimensões/complete/src e scrollIntoView mockado. **Evidência:** ✅ base dos testes de extração.

### Linhas 87–91 — suite/estado
Abrem describe principal e variáveis do harness. **Evidência:** 🟨 estrutura Jest.

### Linhas 93–110 — beforeEach
Reset de módulos/runtime/storage/flags/DOM e preservação dos originais. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 112–126 — afterEach
Despacha pagehide e restaura sendMessage/canvas/mocks/storage/DOM. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; relevante contra leaks.

### Linhas 128–177 — loadExtractionScript
Configura URL/DOM, respostas runtime e carrega módulos reais da aba auxiliar. **Evidência:** ✅ usado pelos 14 cenários de extração.

### Linha 178
Separação estrutural.

### Linhas 179–196 — ACK persistido
Uma entrega e nenhuma segunda depois de 850ms. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linhas 197–223 — ACK negativo e retry
Primeiro ACK falha, segundo persiste; payload repetido exatamente. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linhas 224–239 — cleanup de listener
Espiona removeEventListener/pagehide e confirma ausência de retry após cleanup. **Evidência:** ✅.

### Linhas 240–255 — descarte cancela retry
Espera log de retry, despacha pagehide e prova uma única entrega. **Evidência:** ✅.

### Linhas 256–267 — descarte cancela remapeamento
Aba marcada com mapping false faz um CHECK; pagehide impede outro após 150ms. **Evidência:** ✅.

### Linhas 268–291 — prazo de segurança
Captura timeout 20000, invoca-o, verifica clearInterval/removal load+error e zero entrega após load tardio. **Evidência:** ✅.

### Linhas 292–314 — imagem pronta
Entrega imediata após mapping, com mangaTabId/index/geminiTabId e data URL canvas. **Evidência:** ✅.

### Linhas 315–330 — mapping false em host legado
Sem IMAGE_READY e sem FETCH. **Evidência:** ✅.

### Linhas 331–339 — google.com leitor normal
loadContentScript cria botão em host Google não marcado/habilitado. **Evidência:** ✅.

### Linhas 340–364 — hash marcado fora Google
127.0.0.1 marcado executa extração e preserva IDs. **Evidência:** ✅.

### Linhas 365–400 — mapping tardio
Duas negativas, terceira positiva; CHECK repetido e jobId/batchId entregues. **Evidência:** ✅.

### Linhas 401–437 — espera load
Sem entrega inicial; load manual com imagem válida gera uma entrega. **Evidência:** ✅.

### Linhas 438–467 — canvas bloqueado
SecurityError direciona FETCH_IMAGE_AS_BASE64 e data URL retornada é entregue. **Evidência:** ✅.

### Linhas 468–499 — falha transitória
Primeiro fallback falha, nova passagem recupera; fetchCalls >1 e entrega recuperada. **Evidência:** ✅.

### Linhas 500–502 — fechamento/abertura de grupos
Fecham extração e abrem handlers. **Evidência:** 🟨 estrutura Jest.

### Linhas 503–555 — UPDATE_IMAGE
Aplica nova src, translated, persiste chapter/restore e envia GTC_SAVE com hash/URL. **Evidência:** ✅ PROVADO DIRETAMENTE no caminho feliz.

### Linhas 556–584 — GET_PAGE_IMAGES filtros
Banida, traduzida e pequena são excluídas; só índice 0 permanece. **Evidência:** ✅.

### Linhas 585–605 — limites custom
150×100 aceita 180×120 e rejeita 180×90. **Evidência:** ✅.

### Linhas 606–622 — limites dinâmicos
Mesma instância muda resultado após storage.set. **Evidência:** ✅.

### Linhas 623–639 — REQUEST canvas
Retorno direto TEST_CANVAS e keepAlive false. **Evidência:** ✅.

### Linhas 640–675 — REQUEST CORS
SecurityError, mensagem fallback, keepAlive true e srcData assíncrono. **Evidência:** ✅.

### Linhas 676–691 — REQUEST inexistente
Retorna Image not found, keepAlive false. **Evidência:** ✅.

### Linhas 692–718 — START popup
Índices 0/2 e prompt chegam ao START_BATCH. **Evidência:** ✅.

### Linhas 719–751 — BATCH_COMPLETE
Inicia tradução real, envia completion, espera texto normal e toast. **Evidência:** ✅ para completion válido sem batchId.

### Linhas 752–777 — SHOW_ERROR
Abre drawer e afirma estado/texto básico. **Evidência:** ✅.

### Linhas 778–813 — HIGHLIGHT
Highlight true aplica outline/scroll; false e 450ms removem outline, shadow e transition. **Evidência:** ✅.

### Linhas 814–815
Fecham describes. **Evidência:** 🟨 estrutura Jest.

### Posição 816
Posição vazia do LF terminal; integra o blob exato.

## 23. Análise crítica

1. A suíte usa implementação real tanto no modo auxiliar quanto no modo leitor.
2. Cleanup é testado em múltiplas dimensões, reduzindo risco de timer/listener leak.
3. O protocolo de ACK tem casos positivo e retry, não apenas quantidade de mensagens.
4. A entrada marcada fora de Google prova que a arquitetura não depende do host legado.
5. UPDATE_IMAGE feliz é forte, mas staleness/erro de persistência continuam sem prova.
6. BATCH_COMPLETE feliz não prova seu guard de lote antigo.
7. O fallback de REQUEST_IMAGE_DATA prova sucesso, não resposta de fallback ausente.
8. O limite MAX_EXTRACTION_PASSES terminal não é focalizado.
9. O test de safety chama callback capturado do timer em vez de aguardar 20s, mantendo velocidade sem reimplementar cleanup.
10. fs é import morto.

## 24. Autoauditoria documental

- reserva exclusiva confirmada para **AGENTE 21**;
- SHA reconfirmado: **038961e8228c7b5f1a87023a739ad5f33288423b**;
- fonte integral embutida diretamente do blob;
- **815 linhas textuais + newline final = 816/816 posições**;
- produção confrontada no modo auxiliar, UPDATE_IMAGE e message handlers;
- buscas por STALE_UPDATE, STALE_COMPLETE, AUXILIARY_EXTRACT_FAILED e PERSIST_FAIL feitas antes de registrar gaps;
- 25 testes e 58 expectations mapeados;
- caminhos felizes e guards ausentes foram classificados separadamente;
- nenhum arquivo externo foi modificado.

**Conclusão documental:** Bíblia completa para o estado observado. Pode ser marcada **COMPLETED** mantendo 203-001 a 203-004 OPEN.

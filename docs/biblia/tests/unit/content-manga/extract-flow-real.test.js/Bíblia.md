# Bíblia técnica — tests/unit/content-manga/extract-flow-real.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DOCUMENTAL APROVADA  
> **SHA auditado:** 1bbc481d426bf7471eb655cf514e20d2b323902b  
> **Agente responsável:** AGENTE 21  
> **Índice do corpus:** 202  
> **Tipo:** suíte Jest/JSDOM do fluxo real extractAndSendImages e pipeline GTC  
> **Linhas textuais:** **550**  
> **Posições documentais:** **551**, contando o newline final  
> **Tamanho textual observado:** **21973 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte executa extension/content/content_manga.js real por meio de tests/helpers/load-content-script.js e cobre o início de tradução a partir do botão/popup, seleção automática, serialização FIFO, cancelamento por ownership local, proteção contra reentrada, prompt, geração de batchId sem crypto, ausência de páginas válidas e três caminhos relevantes do cache global de tradução.

O arquivo contém **11 testes** e não reimplementa extractAndSendImages.

Seu valor probatório principal está em atravessar o listener/DOM/storage/runtime mock com a implementação real carregada em JSDOM.

## 2. Implementação de produção relacionada

A implementação confrontada é extension/content/content_manga.js, SHA a8b3698019f6f22027f09f544f15c0563a9f6515.

Pontos centrais:

- generateContentId: linhas 52–63;
- clique principal/seleção automática/cancelamento: linhas 1349–1386;
- extractAndSendImages: inicia na linha 1841;
- bloqueio de reentrada local: 1842–1849;
- geração paralela de fingerprints: 1893–1936;
- lookup SHA-256: 1938–1965;
- lookup dHash: 1967–2011;
- consulta perceptual strict: 2032–2048;
- consulta center-crop: 2073–2091;
- consulta relaxed: 2093–2117;
- decisão final/cache/Gemini: 2133–2323;
- zero páginas/cache completo: 2359–2371;
- criação e envio de START_BATCH: 2383–2392;
- resposta queued/FIFO: 2393–2424;
- compatibilidade batch_busy: 2427–2448;
- processamento normal de resposta START_BATCH: 2450–2460;
- status/cancelamento do popup: 2729–2794;
- bloqueio START_TRANSLATION_FROM_POPUP em aba ocupada: 2795–2821.

## 3. Harness e dependências

O arquivo usa path, crypto e TextEncoder para preparar o ambiente. fs é importado na linha 2, mas não é utilizado no SHA auditado.

findRepoRoot resolve ROOT; loadContentScript carrega o content script real; getRuntimeMock/getStorageMock fornecem Chrome API controlável.

delay e waitFor implementam polling temporal real de até 2500 ms. Isso é apropriado porque vários callbacks do mock usam setTimeout(..., 0) e a pipeline real contém Promises.

## 4. Isolamento entre testes

beforeEach:

- resetModules;
- reseta arrays de listeners;
- limpa lastError;
- zera sentMessages;
- limpa storage;
- apaga flags globais;
- reconstrói o DOM.

afterEach:

- restoreAllMocks;
- limpa storage/flags/DOM.

A suíte não ativa fake timers. O polling usa tempo real do Jest/JSDOM.

## 5. installRuntimeResponder

O helper substitui runtimeMock.sendMessage por jest.fn e registra toda mensagem em sentMessages.

Responde de forma assíncrona aos protocolos:

- GTC_QUERY_MANY;
- GTC_QUERY_BY_DHASH;
- GTC_QUERY_PERCEPTUAL_V2;
- GTC_QUERY_BY_PERCEPTUAL;
- GTC_QUERY_BY_PERCEPTUAL_CROP;
- GTC_QUERY_BY_PERCEPTUAL_RELAXED;
- CALCULATE_VISUAL_FINGERPRINT;
- START_BATCH;
- fallback genérico.

O teste controla respostas do backend sem copiar a lógica de decisão do content_manga: a decisão de qual protocolo chamar e o que fazer com a resposta permanece na implementação real.

## 6. Matriz dos 11 casos

| Teste | Linhas | Propriedade diretamente provada | Classificação |
|---|---:|---|---|
| auto-seleção | 140–160 | banida e pequenas são excluídas; índices 0/3 e prompt chegam ao START_BATCH | ✅ PROVADO DIRETAMENTE |
| FIFO queued | 162–194 | resposta queued mantém tradução local, UI NA FILA #3 e mt_popup_state queued | ✅ PROVADO DIRETAMENTE |
| cancelamento do queued pelo botão | 196–233 | STOP_BATCH usa batchId pertencente à aba e não activeBatchId global | ✅ PROVADO DIRETAMENTE |
| STOP_TRANSLATION_FROM_POPUP | 235–287 | cancela somente batch local, limpa status local e storage para cancelled | ✅ PROVADO DIRETAMENTE |
| segunda solicitação local | 289–328 | reentrada retorna local_batch_busy, preserva batchId, não cria segundo START_BATCH e loga bloqueio | ✅ PROVADO DIRETAMENTE |
| sem prompts | 330–345 | START_BATCH recebe prompt vazio | ✅ PROVADO DIRETAMENTE |
| sem crypto | 347–369 | com global/window.crypto indefinidos ainda é gerado batchId válido e o lote inicia | ✅ PROVADO DIRETAMENTE no comportamento integrado |
| sem páginas válidas | 371–385 | mostra toast e não envia START_BATCH | ✅ PROVADO DIRETAMENTE |
| cache SHA completo | 387–419 | duas imagens recebem cache e START_BATCH não ocorre | ✅ PROVADO DIRETAMENTE |
| hit center-crop | 421–485 | após misses anteriores, crop aplica tradução; strict+crop são consultados; relaxed e START_BATCH não | ✅ PROVADO DIRETAMENTE |
| hit relaxed regional | 487–549 | strict→crop→relaxed, cache aplicado, sem START_BATCH e log regional emitido | ✅ PROVADO DIRETAMENTE |

## 7. Auto-seleção e filtro

O primeiro teste monta quatro imagens:

- índice 0: elegível;
- índice 1: dimensão válida, mas explicitamente banida;
- índice 2: pequena;
- índice 3: elegível.

Ao clicar no conteúdo principal sem seleção prévia, produção chama getScanEligibleImages, adiciona os índices elegíveis e passa o conjunto a extractAndSendImages.

A assertion exige START_BATCH.images exatamente [{ index:0 }, { index:3 }].

Também exige prompt "Teste prompt", vindo do storage inicial do loader.

**Evidência:** ✅ PROVADO DIRETAMENTE.

## 8. FIFO e ownership de batch

### Aceite em fila

O mock de START_BATCH devolve queued=true, queuePosition=3 e activeBatchId=batch-a.

A implementação deve preservar seu batchId local, mostrar NA FILA (#3) e persistir:

- status queued;
- queuePosition 3;
- completed false.

O teste confirma tudo isso e confirma que START_BATCH realmente foi emitido.

### Cancelamento por botão

Com queuePosition=4, o segundo clique no botão entra no branch isTranslating e envia STOP_BATCH com o batchId local retornado/gerado.

A assertion prova que esse id é diferente de batch-a.

### Cancelamento pelo popup

STOP_TRANSLATION_FROM_POPUP:

- responde ok true com o batchId local;
- envia um único STOP_BATCH;
- não usa batch-a;
- zera translating/batchId/queuePosition;
- define batchStatus cancelled;
- persiste status cancelled em mt_popup_state.

**Evidência:** ✅ PROVADO DIRETAMENTE.

## 9. Bloqueio de reentrada local

Enquanto a aba possui lote queued, START_TRANSLATION_FROM_POPUP é enviado novamente.

A implementação real deve:

- responder ok=false;
- reason=local_batch_busy;
- retornar o batchId já existente;
- manter somente um START_BATCH;
- emitir LOG_ENTRY com BATCH_LOCAL_REENTRY_BLOCKED.

O teste verifica as quatro propriedades.

Isso protege contra sobrescrita do ownership local e lote duplicado na mesma aba.

**Evidência:** ✅ PROVADO DIRETAMENTE.

## 10. Prompt vazio

O loader normalmente coloca customPrompt="Teste prompt".

O caso remove customPrompt e defaultPrompt do storage após carregar o content script e antes do clique.

A produção lê ambas as chaves no momento de enviar START_BATCH e usa fallback "".

A assertion exige prompt vazio.

**Evidência:** ✅ PROVADO DIRETAMENTE.

## 11. Geração de batchId sem crypto

O teste salva descriptors de global.crypto e window.crypto, redefine ambos para undefined e restaura no finally.

Depois carrega o stack real e inicia tradução.

A assertion exige formato de três segmentos alfanuméricos.

Há uma nuance de atribuição de responsabilidade:

content_manga.generateContentId primeiro delega a window.MangaTranslatorGtcFingerprint.generateId quando disponível. O loader carrega extension/shared/gtc-fingerprint.js antes do content_manga. Esse helper também possui fallback sem crypto baseado em Date.now, contador e Math.random.

Portanto o teste prova diretamente que **o sistema integrado continua gerando batchId sem crypto**, mas não prova isoladamente os branches internos de fallback das linhas 56–62 de content_manga, pois a delegação ao helper precede esses branches.

**Classificação:** ✅ PROVADO DIRETAMENTE para o contrato integrado; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para o fallback privado de content_manga quando o helper generateId está ausente.

## 12. Nenhuma página válida

Duas imagens abaixo do mínimo são montadas.

O clique leva payloadToGemini a zero e instantCacheHits a zero.

A produção:

- encerra isTranslating;
- restaura UI;
- cria toast "Nenhuma página de mangá detectada ou selecionada.";
- não envia START_BATCH.

O teste verifica o texto do toast e ausência de START_BATCH.

**Evidência:** ✅ PROVADO DIRETAMENTE.

## 13. Cache completo por SHA-256

onQueryMany devolve uma entrada para cada hash consultado.

Após o clique, a suíte espera até as duas imagens terem dataset.translated=true e então exige:

- src da imagem 0 = Q0FDSEVf0;
- src da imagem 1 = Q0FDSEVf1;
- nenhum START_BATCH;
- UI volta a TRADUZIR 2 PÁGINAS.

Esse caso prova o short-circuit de lote 100% cacheado: a pipeline não abre Gemini quando todos os itens já foram satisfeitos.

**Evidência:** ✅ PROVADO DIRETAMENTE.

## 14. Pipeline visual-v4: center-crop

Para imagem remota, CALCULATE_VISUAL_FINGERPRINT retorna SHA/dHash/wHash/pHash/crop/regionais controlados.

O responder perceptual V2 retorna miss para modos diferentes de crop e hit no mode crop.

A suíte exige:

- src final = cropDataUrl;
- CALCULATE_VISUAL_FINGERPRINT, GTC_QUERY_MANY, GTC_QUERY_BY_DHASH e GTC_QUERY_PERCEPTUAL_V2 foram chamados;
- existem consultas V2 strict e crop;
- não existe consulta relaxed;
- não existe START_BATCH.

Isso prova a prioridade strict → crop e o short-circuit após hit crop.

**Evidência:** ✅ PROVADO DIRETAMENTE.

## 15. Pipeline visual-v4: relaxed com confirmação regional

O último caso retorna hit apenas em mode relaxed, confidence 0.75 e regionalHashes iguais aos do fingerprint local.

A suíte exige:

- src final = relaxedDataUrl;
- consultas strict, crop e relaxed ocorreram;
- nenhum START_BATCH;
- existe LOG_ENTRY GTC_F5C_REGIONAL_RESULT.

Como os hashes regionais são idênticos e a imagem é aplicada, o caminho de confirmação positiva está diretamente exercitado.

**Evidência:** ✅ PROVADO DIRETAMENTE para confirmação positiva.

## 16. Ordem de prioridade de cache observada

O código real declara prioridade:

SHA-256 > dHash > perceptual strict > crop > relaxed > Gemini.

A suíte prova diretamente:

- SHA hit completo;
- misses acumulados até crop e crop hit;
- misses acumulados até relaxed e relaxed hit.

Ela não contém um caso focal de dHash hit nem um caso focal de perceptual strict hit neste arquivo.

Esses branches podem existir em outras suítes; esta Bíblia não os promove a prova deste arquivo.

## 17. Evidências e lacunas

| Comportamento | Evidência | Classificação |
|---|---|---|
| filtro de banidas/pequenas | teste 1 | ✅ PROVADO DIRETAMENTE |
| queued/FIFO sem abortar local | teste 2 | ✅ PROVADO DIRETAMENTE |
| stop usa batch local | testes 3/4 | ✅ PROVADO DIRETAMENTE |
| reentrada local bloqueada | teste 5 | ✅ PROVADO DIRETAMENTE |
| prompt vazio | teste 6 | ✅ PROVADO DIRETAMENTE |
| geração integrada sem crypto | teste 7 | ✅ PROVADO DIRETAMENTE |
| fallback privado content_manga sem helper | não isolado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| zero páginas | teste 8 | ✅ PROVADO DIRETAMENTE |
| lote 100% cache | teste 9 | ✅ PROVADO DIRETAMENTE |
| lote parcialmente cacheado e parcialmente Gemini | não localizado por marker GTC_PARTIAL_HIT | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| crop hit após strict miss | teste 10 | ✅ PROVADO DIRETAMENTE |
| relaxed hit + regional PASS | teste 11 | ✅ PROVADO DIRETAMENTE |
| relaxed hit + regional FAIL → Gemini | não localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| STOP_TRANSLATION background runtime error | não localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| resposta legacy batch_busy | branch inspecionado, sem caso focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| descoberta pelo projeto Jest | jest.config.js | 🟦 GATE ESTÁTICO ESPECÍFICO |
| inclusão no inventário CI | run-jest-ci.js | 🟦 GATE ESTÁTICO ESPECÍFICO |

## 18. Solicitações ao auditor

### 202-001 — TEST_REQUIRED — OPEN

**Encontrado:** a suíte cobre zero cache e 100% cache, mas não foi localizado cenário misto em que parte das imagens é resolvida pelo cache e o restante é enviado ao Gemini.

**Contexto:** auditoria de tests/unit/content-manga/extract-flow-real.test.js.

**Arquivo relacionado:** tests/unit/content-manga/extract-flow-real.test.js; produção extension/content/content_manga.js linhas 2374–2392.

**Evidência atual:** teste de cache completo prova short-circuit sem START_BATCH; testes sem cache provam START_BATCH.

**Evidência ausente:** lote com instantCacheHits > 0 e payloadToGemini > 0, incluindo índices corretos, geminiTotal/cacheHits no estado e START_BATCH somente para misses.

**Por que insuficiente:** o branch GTC_PARTIAL_HIT combina os dois subsistemas e pode regressar sem quebrar extremos 0%/100%.

**Ação solicitada:** adicionar teste real com duas ou mais imagens, responder cache hit para subconjunto e miss para o restante.

**Evidência esperada:** imagem cacheada aplicada imediatamente; START_BATCH contém somente índices miss; mt_popup_state/cacheHits/geminiTotal coerentes.

**Possível regressão:** imagem já cacheada pode ser reenviada ao Gemini, miss pode ser omitido ou contadores podem divergir.

**Impacto:** eficiência, custo e consistência de lotes híbridos.

**Severidade:** HIGH.

### 202-002 — TEST_REQUIRED — OPEN

**Encontrado:** o teste relaxed cobre confirmação regional positiva, mas não o branch em que confirmWithRegionalHashes rejeita o hit e a imagem deve seguir para Gemini.

**Contexto:** auditoria de tests/unit/content-manga/extract-flow-real.test.js.

**Arquivo relacionado:** este teste; produção content_manga.js linhas 2275–2293.

**Evidência atual:** teste 11 usa hashes regionais iguais e prova aplicação do hit relaxed.

**Evidência ausente:** hashes regionais incompatíveis, log de falha e payload Gemini resultante.

**Por que insuficiente:** confirmação regional existe justamente para impedir falso positivo perceptual; testar só PASS não prova a barreira de segurança de matching.

**Ação solicitada:** adicionar hit relaxed com regionalHashes incompatíveis e verificar que tradução cacheada não é aplicada e START_BATCH recebe o índice.

**Evidência esperada:** GTC_F5C_REGIONAL_RESULT de falha, imagem original preservada até Gemini e START_BATCH contendo o índice rejeitado.

**Possível regressão:** falso positivo de cache pode substituir uma página por tradução de outra imagem visualmente parecida.

**Impacto:** correção de conteúdo traduzido.

**Severidade:** HIGH.

### 202-003 — TEST_REQUIRED — OPEN

**Encontrado:** STOP_TRANSLATION_FROM_POPUP cobre sucesso, mas não a falha de chrome.runtime.sendMessage via runtime.lastError.

**Contexto:** auditoria de tests/unit/content-manga/extract-flow-real.test.js.

**Arquivo relacionado:** este teste; produção content_manga.js linhas 2741–2765.

**Evidência atual:** teste 4 prova cancelamento bem-sucedido e limpeza de estado.

**Evidência ausente:** branch background_stop_failed e preservação correta do estado local quando o background não confirma o stop.

**Por que insuficiente:** limpar estado local após falha de stop poderia deixar um lote rodando no background sem ownership visível; não limpar quando deveria também pode travar UI.

**Ação solicitada:** simular runtime.lastError no STOP_BATCH disparado pelo popup e verificar response de erro e estado local coerente.

**Evidência esperada:** ok=false/reason=background_stop_failed, log BATCH_LOCAL_STOP_FAILED e nenhuma falsa transição para cancelled.

**Possível regressão:** divergência entre estado da aba e lote real do background.

**Impacto:** confiabilidade de cancelamento e diagnóstico.

**Severidade:** NORMAL.

Nenhum arquivo externo foi modificado pelo AGENTE 21.

## 19. Código morto e detalhes de harness

fs é importado e não usado.

As funções legacy onQueryPerceptual/onQueryPerceptualCrop/onQueryPerceptualRelaxed permanecem no responder, mas os testes visual-v4 atuais exercitam GTC_QUERY_PERCEPTUAL_V2. Isso mantém compatibilidade de mock com protocolos antigos sem constituir prova de que eles são usados pela pipeline atual.

waitFor mede performance.now e usa polling de 10 ms. Uma falha de condição termina como erro "Timeout aguardando condicao", o que impede silêncio em assincronismo travado.

## 20. Invariantes

1. Uma aba não pode aceitar segundo lote local enquanto isTranslating estiver true.
2. O batchId usado para STOP deve pertencer à aba, não ao lote global ativo.
3. Resposta queued deve preservar o lote local e sua posição.
4. START_BATCH deve conter apenas imagens que realmente precisam do Gemini.
5. Prompt deve cair para string vazia se custom/default estiverem ausentes.
6. Ausência de crypto não pode impedir geração de batchId integrado.
7. Nenhuma página elegível não pode abrir lote vazio.
8. Lote 100% cache não pode abrir START_BATCH.
9. Hit em fase anterior deve impedir fases posteriores desnecessárias.
10. Relaxed hit deve passar pela confirmação regional quando hashes regionais existirem.
11. A Bíblia vale apenas para SHA 1bbc481d426bf7471eb655cf514e20d2b323902b.

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

describe('CM-14/CM-15/CM-16/CM-17/CM-18/CM-19/CM-20/CM-51/CM-52/CM-53/CM-54/CM-75/CM-76/CM-77/CM-78/CM-79/CM-80/CM-81: content_manga.js - extractAndSendImages real', () => {
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

    function installRuntimeResponder({
        onQueryMany,
        onQueryDHash,
        onQueryPerceptual,
        onQueryPerceptualCrop,
        onQueryPerceptualRelaxed,
        onQueryPerceptualV2,
        onCalculateVisualFingerprint,
        onStartBatch,
    } = {}) {
        runtimeMock.sendMessage = jest.fn((message, callback) => {
            sentMessages.push(message);

            if (message.action === 'GTC_QUERY_MANY') {
                const response = onQueryMany
                    ? onQueryMany(message)
                    : { ok: true, entriesByHash: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'GTC_QUERY_BY_DHASH') {
                const response = onQueryDHash
                    ? onQueryDHash(message)
                    : { ok: true, entriesByDHash: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'GTC_QUERY_PERCEPTUAL_V2') {
                const response = onQueryPerceptualV2
                    ? onQueryPerceptualV2(message)
                    : { ok: true, entriesByQueryId: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'GTC_QUERY_BY_PERCEPTUAL') {
                const response = onQueryPerceptual
                    ? onQueryPerceptual(message)
                    : { ok: true, entriesByPerceptual: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'GTC_QUERY_BY_PERCEPTUAL_CROP') {
                const response = onQueryPerceptualCrop
                    ? onQueryPerceptualCrop(message)
                    : { ok: true, entriesByPerceptualCrop: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'GTC_QUERY_BY_PERCEPTUAL_RELAXED') {
                const response = onQueryPerceptualRelaxed
                    ? onQueryPerceptualRelaxed(message)
                    : { ok: true, entriesByPerceptualRelaxed: {} };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'CALCULATE_VISUAL_FINGERPRINT') {
                const response = onCalculateVisualFingerprint
                    ? onCalculateVisualFingerprint(message)
                    : { ok: false, error: 'sem mock de fingerprint visual' };
                if (callback) setTimeout(() => callback(response), 0);
                return;
            }

            if (message.action === 'START_BATCH') {
                const response = typeof onStartBatch === 'function'
                    ? onStartBatch(message)
                    : null;
                if (callback) setTimeout(() => callback(response || { ok: true }), 0);
                return;
            }

            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });
    }

    test('auto-selecao exclui banidas e pequenas e envia START_BATCH apenas com indices validos', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            bannedImages: ['http://localhost/page-1.png'],
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                { src: 'http://localhost/page-1.png', width: 800, height: 1200 },
                { src: 'http://localhost/page-2.png', width: 120, height: 180 },
                { src: 'http://localhost/page-3.png', width: 900, height: 1300 },
            ],
        });

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));

        expect(startBatch.images).toEqual([{ index: 0 }, { index: 3 }]);
        expect(startBatch.prompt).toBe('Teste prompt');
        await waitFor(() => document.getElementById('manga-main-content').textContent.includes('TRADUZINDO'));
    });

    test('lote aceito em FIFO mostra posição na fila sem abortar a tradução local', async () => {
        installRuntimeResponder({
            onStartBatch(message) {
                return {
                    ok: true,
                    batchId: message.batchId,
                    queued: true,
                    queuePosition: 3,
                    activeBatchId: 'batch-a',
                };
            },
        });
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        await waitFor(() =>
            document.getElementById('manga-main-content').textContent.includes('NA FILA (#3)')
        );

        const popupState = await storageMock.get(['mt_popup_state']);
        expect(popupState.mt_popup_state).toEqual(expect.objectContaining({
            status: 'queued',
            queuePosition: 3,
            completed: false,
        }));
        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(true);
    });

    test('lote enfileirado cancela pelo seu batchId sem atingir o lote global ativo', async () => {
        installRuntimeResponder({
            onStartBatch(message) {
                return {
                    ok: true,
                    batchId: message.batchId,
                    queued: true,
                    queuePosition: 4,
                    activeBatchId: 'batch-a',
                };
            },
        });
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const mainContent = document.getElementById('manga-main-content');
        mainContent.click();

        const startBatch = await waitFor(() =>
            sentMessages.find(message => message.action === 'START_BATCH')
        );
        await waitFor(() => mainContent.textContent.includes('NA FILA (#4)'));

        mainContent.click();

        const stopBatch = await waitFor(() =>
            sentMessages.find(message => message.action === 'STOP_BATCH')
        );
        expect(stopBatch).toEqual({
            action: 'STOP_BATCH',
            batchId: startBatch.batchId,
        });
        expect(stopBatch.batchId).not.toBe('batch-a');
    });

    test('STOP_TRANSLATION_FROM_POPUP cancela somente o batchId pertencente à aba atual', async () => {
        installRuntimeResponder({
            onStartBatch(message) {
                return {
                    ok: true,
                    batchId: message.batchId,
                    queued: true,
                    queuePosition: 5,
                    activeBatchId: 'batch-a',
                };
            },
        });
        const context = await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();
        const startBatch = await waitFor(() =>
            sentMessages.find(message => message.action === 'START_BATCH')
        );
        await waitFor(() =>
            document.getElementById('manga-main-content').textContent.includes('NA FILA (#5)')
        );

        const response = await context.sendMessage('STOP_TRANSLATION_FROM_POPUP');

        expect(response).toEqual(expect.objectContaining({
            ok: true,
            batchId: startBatch.batchId,
        }));
        const stopMessages = sentMessages.filter(message => message.action === 'STOP_BATCH');
        expect(stopMessages).toEqual([{
            action: 'STOP_BATCH',
            batchId: startBatch.batchId,
        }]);
        expect(stopMessages[0].batchId).not.toBe('batch-a');

        const status = await context.sendMessage('GET_FLOATING_BUTTON_STATUS');
        expect(status).toEqual(expect.objectContaining({
            translating: false,
            batchId: null,
            batchStatus: 'cancelled',
            queuePosition: null,
        }));

        const popupState = await storageMock.get(['mt_popup_state']);
        expect(popupState.mt_popup_state).toEqual(expect.objectContaining({
            status: 'cancelled',
        }));
    });

    test('segunda solicitação na mesma aba não sobrescreve batchId nem cria outro START_BATCH', async () => {
        installRuntimeResponder({
            onStartBatch(message) {
                return {
                    ok: true,
                    batchId: message.batchId,
                    queued: true,
                    queuePosition: 2,
                    activeBatchId: 'batch-a',
                };
            },
        });
        const context = await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();
        const firstStart = await waitFor(() =>
            sentMessages.find(message => message.action === 'START_BATCH')
        );
        await waitFor(() =>
            document.getElementById('manga-main-content').textContent.includes('NA FILA (#2)')
        );

        const second = await context.sendMessage('START_TRANSLATION_FROM_POPUP', { indices: [0] });

        expect(second).toEqual(expect.objectContaining({
            ok: false,
            reason: 'local_batch_busy',
            batchId: firstStart.batchId,
        }));
        expect(sentMessages.filter(message => message.action === 'START_BATCH')).toHaveLength(1);
        expect(sentMessages.some(message =>
            message.action === 'LOG_ENTRY' &&
            message.action_name === 'BATCH_LOCAL_REENTRY_BLOCKED'
        )).toBe(true);
    });

    test('quando storage nao tem prompts envia START_BATCH com prompt vazio', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });
        await storageMock.remove(['customPrompt', 'defaultPrompt']);

        document.getElementById('manga-main-content').click();

        const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));
        expect(startBatch.images).toEqual([{ index: 0 }]);
        expect(startBatch.prompt).toBe('');
    });

    test('em contexto sem crypto ainda gera batchId e inicia o lote', async () => {
        const globalCryptoDescriptor = Object.getOwnPropertyDescriptor(global, 'crypto');
        const windowCryptoDescriptor = Object.getOwnPropertyDescriptor(window, 'crypto');
        Object.defineProperty(global, 'crypto', { value: undefined, configurable: true });
        Object.defineProperty(window, 'crypto', { value: undefined, configurable: true });
        try {
            installRuntimeResponder();
            await loadContentScript({
                hostname: 'localhost',
                domImages: [{ src: 'http://localhost/page-0.png', width: 800, height: 1200 }],
            });

            document.getElementById('manga-main-content').click();

            const startBatch = await waitFor(() => sentMessages.find(message => message.action === 'START_BATCH'));
            expect(startBatch.batchId).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
        } finally {
            if (globalCryptoDescriptor) Object.defineProperty(global, 'crypto', globalCryptoDescriptor);
            else delete global.crypto;
            if (windowCryptoDescriptor) Object.defineProperty(window, 'crypto', windowCryptoDescriptor);
            else delete window.crypto;
        }
    });

    test('quando nao ha paginas validas mostra toast e nao envia START_BATCH', async () => {
        installRuntimeResponder();
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/small-0.png', width: 32, height: 32 },
                { src: 'http://localhost/small-1.png', width: 120, height: 180 },
            ],
        });

        document.getElementById('manga-main-content').click();

        await waitFor(() => document.body.textContent.includes('Nenhuma página de mangá detectada ou selecionada.'));
        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(false);
    });

    test('quando o lote inteiro vem do cache aplica as imagens e nao abre START_BATCH', async () => {
        installRuntimeResponder({
            onQueryMany(message) {
                return {
                    ok: true,
                    entriesByHash: Object.fromEntries(
                        message.hashes.map((hash, index) => [hash, `data:image/png;base64,Q0FDSEVf${index}`])
                    ),
                };
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
                { src: 'http://localhost/page-1.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        await waitFor(() => {
            const translated = Array.from(document.querySelectorAll('img')).filter(img => img.dataset.translated === 'true');
            return translated.length === 2;
        });

        const translatedImages = Array.from(document.querySelectorAll('img'));
        expect(translatedImages[0].getAttribute('src')).toBe('data:image/png;base64,Q0FDSEVf0');
        expect(translatedImages[1].getAttribute('src')).toBe('data:image/png;base64,Q0FDSEVf1');
        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(false);
        expect(document.getElementById('manga-main-content').textContent).toContain('TRADUZIR 2 PÁGINAS');
    });

    test('visual-v4: hit center-crop aplica cache depois de SHA/dHash/perceptual strict miss', async () => {
        const cropDataUrl = 'data:image/png;base64,Q1JPUF9ISVQ=';
        installRuntimeResponder({
            onCalculateVisualFingerprint() {
                return {
                    ok: true,
                    pixelSample: 'ab'.repeat(256),
                    dHash: 'd'.repeat(16),
                    wHash: 'a'.repeat(64),
                    pHash: 'b'.repeat(64),
                    wHashCrop: 'c'.repeat(64),
                    pHashCrop: 'e'.repeat(64),
                    regionalHashes: {
                        topLeft: '0'.repeat(16),
                        topRight: '1'.repeat(16),
                        bottomLeft: '2'.repeat(16),
                        bottomRight: '3'.repeat(16),
                    },
                };
            },
            onQueryPerceptualV2(message) {
                if (message.mode !== 'crop') return { ok: true, entriesByQueryId: {} };
                const queryId = message.queries[0].queryId;
                return {
                    ok: true,
                    entriesByQueryId: {
                        [queryId]: {
                            translatedDataUrl: cropDataUrl,
                            confidence: 1,
                            reason: 'crop_test',
                            wDist: 0,
                            pDist: 0,
                        },
                    },
                };
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'https://cdn.remote.test/page-0.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');

        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe(cropDataUrl);
        expect(sentMessages.map(message => message.action)).toEqual(expect.arrayContaining([
            'CALCULATE_VISUAL_FINGERPRINT',
            'GTC_QUERY_MANY',
            'GTC_QUERY_BY_DHASH',
            'GTC_QUERY_PERCEPTUAL_V2',
        ]));
        expect(sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'GTC_QUERY_PERCEPTUAL_V2', mode: 'strict' }),
            expect.objectContaining({ action: 'GTC_QUERY_PERCEPTUAL_V2', mode: 'crop' }),
        ]));
        expect(sentMessages.some(message =>
            message.action === 'GTC_QUERY_PERCEPTUAL_V2' && message.mode === 'relaxed'
        )).toBe(false);
        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(false);
    });

    test('visual-v4: hit relaxed aplica cache apos crop miss e passa por confirmacao regional', async () => {
        const relaxedDataUrl = 'data:image/png;base64,UkVMQVhFRF9ISVQ=';
        const regional = {
            topLeft: '0'.repeat(16),
            topRight: '1'.repeat(16),
            bottomLeft: '2'.repeat(16),
            bottomRight: '3'.repeat(16),
        };

        installRuntimeResponder({
            onCalculateVisualFingerprint() {
                return {
                    ok: true,
                    pixelSample: 'cd'.repeat(256),
                    dHash: '1'.repeat(16),
                    wHash: '2'.repeat(64),
                    pHash: '3'.repeat(64),
                    wHashCrop: '4'.repeat(64),
                    pHashCrop: '5'.repeat(64),
                    regionalHashes: regional,
                };
            },
            onQueryPerceptualV2(message) {
                if (message.mode !== 'relaxed') return { ok: true, entriesByQueryId: {} };
                const queryId = message.queries[0].queryId;
                return {
                    ok: true,
                    entriesByQueryId: {
                        [queryId]: {
                            translatedDataUrl: relaxedDataUrl,
                            confidence: 0.75,
                            reason: 'relaxed_test',
                            wDist: 44,
                            pDist: 40,
                            regionalHashes: regional,
                        },
                    },
                };
            },
        });

        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'https://cdn.remote.test/page-1.png', width: 800, height: 1200 },
            ],
        });

        document.getElementById('manga-main-content').click();

        await waitFor(() => document.querySelector('[data-testid="img-0"]').dataset.translated === 'true');

        expect(document.querySelector('[data-testid="img-0"]').getAttribute('src')).toBe(relaxedDataUrl);
        expect(sentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'GTC_QUERY_PERCEPTUAL_V2', mode: 'strict' }),
            expect.objectContaining({ action: 'GTC_QUERY_PERCEPTUAL_V2', mode: 'crop' }),
            expect.objectContaining({ action: 'GTC_QUERY_PERCEPTUAL_V2', mode: 'relaxed' }),
        ]));
        expect(sentMessages.some(message => message.action === 'START_BATCH')).toBe(false);
        expect(sentMessages.some(message =>
            message.action === 'LOG_ENTRY' && message.action_name === 'GTC_F5C_REGIONAL_RESULT'
        )).toBe(true);
    });
});
~~~

O blob termina com newline LF.

## 22. Cobertura posição a posição

### Linhas 1–16 — bootstrap e imports
Carregam módulos nativos, raiz, globals de crypto/TextEncoder e harness. fs não é usado. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 17–30 — delay/waitFor
Implementam polling assíncrono com timeout. **Evidência:** ✅ waitFor é usado repetidamente; delay é usado por waitFor.

### Linhas 31–35 — suite e variáveis
Abrem describe e declaram runtime/storage/sentMessages. **Evidência:** 🟨 estrutura Jest.

### Linhas 36–48 — beforeEach
Resetam módulos, listeners, erro runtime, mensagens, storage, flags e DOM. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 49–56 — afterEach
Restauram mocks, storage, flags e DOM. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 57–138 — installRuntimeResponder
Mocka runtime.sendMessage, registra todas as mensagens e permite callbacks específicos por protocolo. Os callbacks são agendados com setTimeout 0. **Evidência:** ✅ usado por todos os testes para observar a implementação real.

### Linha 139
Separação estrutural.

### Linhas 140–160 — auto-seleção
Monta banida/pequena/elegíveis, clica botão e exige índices 0/3 + prompt. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 161
Separação.

### Linhas 162–194 — FIFO queued
Responde fila #3, espera UI, verifica storage e START_BATCH. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 195
Separação.

### Linhas 196–233 — cancelamento queued pelo botão
Obtém START_BATCH local, espera fila #4, clica novamente e exige STOP_BATCH com id próprio, diferente de batch-a. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 234
Separação.

### Linhas 235–287 — STOP_TRANSLATION_FROM_POPUP
Cria fila #5, chama API do loader e verifica resposta, STOP_BATCH único, status runtime e mt_popup_state cancelled. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 288
Separação.

### Linhas 289–328 — reentrada local
Tenta START_TRANSLATION_FROM_POPUP durante lote queued; exige local_batch_busy, mesmo batchId, um START_BATCH e log BATCH_LOCAL_REENTRY_BLOCKED. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 329
Separação.

### Linhas 330–345 — ausência de prompts
Remove custom/default e verifica prompt "". **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 346
Separação.

### Linhas 347–369 — sem crypto
Desabilita crypto global/window em bloco try/finally, carrega a stack e exige batchId com fallback. **Evidência:** ✅ contrato integrado; ⚠️ não isola fallback privado de content_manga.

### Linha 370
Separação.

### Linhas 371–385 — nenhuma página válida
Usa imagens pequenas, espera toast e exige ausência de START_BATCH. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 386
Separação.

### Linhas 387–419 — cache completo
Mocka GTC_QUERY_MANY com hit para todos, espera translated=true, verifica src, ausência de START_BATCH e reset do texto do botão. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 420
Separação.

### Linhas 421–485 — visual-v4 center-crop
Fornece fingerprint completo, responde apenas ao mode crop, espera aplicação e verifica sequência de protocolos, ausência de relaxed e ausência de Gemini. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 486
Separação.

### Linhas 487–549 — visual-v4 relaxed
Fornece fingerprint + regionais, responde hit apenas no mode relaxed, espera aplicação e exige strict/crop/relaxed, nenhum START_BATCH e log regional. **Evidência:** ✅ PROVADO DIRETAMENTE para PASS regional.

### Linha 550
Fecha describe. **Evidência:** 🟨 estrutura Jest.

### Posição 551
Posição vazia decorrente do LF terminal; integra o blob auditado.

## 23. Análise crítica

1. A suíte cobre fluxo real, não uma cópia.
2. A proteção de ownership de batch é bem assertada em botão e popup.
3. A fila FIFO é testada como estado, UI e storage, não apenas callback.
4. O teste sem crypto é válido como contrato integrado, mas não deve ser citado como prova do fallback interno privado de content_manga.
5. Cache completo e dois caminhos perceptuais são fortes, porém falta lote híbrido.
6. A confirmação regional só tem caso positivo.
7. O branch de falha do stop remoto permanece sem prova.
8. O caminho legacy batch_busy está presente no código, mas não possui caso focal nesta suíte.
9. dHash hit e strict hit não são casos positivos focais aqui.
10. O gate de inventário Jest protege a execução da suíte, não substitui assertions comportamentais.

## 24. Autoauditoria documental

- reserva exclusiva confirmada: **AGENTE 21**;
- source SHA reconfirmado: **1bbc481d426bf7471eb655cf514e20d2b323902b**;
- fonte integral embutida diretamente do blob;
- **550 linhas textuais + newline final = 551/551 posições**;
- content_manga.js real confrontado nos trechos de click, extractAndSendImages, GTC phases, START_BATCH e STOP_TRANSLATION;
- extension/shared/gtc-fingerprint.js confrontado para interpretar corretamente o teste sem crypto;
- buscas de GTC_PARTIAL_HIT, regional FAIL e background_stop_failed realizadas antes de registrar lacunas;
- assertions classificadas sem promover comportamento não exercitado;
- nenhum arquivo fora da Bíblia/state/reserva foi modificado.

**Conclusão documental:** Bíblia completa para o estado observado. Pode ser marcada **COMPLETED** mantendo 202-001, 202-002 e 202-003 OPEN.

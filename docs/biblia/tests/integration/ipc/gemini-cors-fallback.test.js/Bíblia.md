# Bíblia técnica — tests/integration/ipc/gemini-cors-fallback.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `1f5a1236139d85640cb5fa24590f434859155c62`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** teste Jest de integração nominal / simulação IPC de fallback de imagem  
> **Linhas textuais:** **315**  
> **Posições documentais:** **316**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Este arquivo pertence ao projeto Jest `integration` e modela o fallback usado quando a extração de uma imagem por Canvas falha. Ele possui duas implementações locais — `extractImageWithFallback` e `createFetchImageHandler` — e testa as respostas dessas cópias com doubles injetados.

Apesar do nome, do diretório e do cabeçalho declararem uma integração IPC entre content script e background, **o arquivo não importa nem executa a implementação de produção do consumidor, do router ou de `background/actions/fetch-image-base64.js`**. Portanto, sua força probatória principal é a semântica das implementações espelho contidas no próprio teste.

A implementação atual de produção foi cruzada em leitura: `extension/content/gemini/result-extractor.js` envia `FETCH_IMAGE_AS_BASE64` e espera `response.dataUrl`; `extension/background/router.js` converte a action legada para `fetch-image-base64`; `extension/background/actions/fetch-image-base64.js` retorna `{ dataUrl }` e aplica validação de URL/origem, MIME, tamanho e timeout. Esses fatos servem para detectar drift do teste, não para promover a simulação a integração real.

## 2. Dependências, ambiente e consumidores

### Dependências diretas

- Node `path`, usado para carregar o mock por caminho absoluto.
- `tests/helpers/repo-root.js`, via `findRepoRoot(__dirname)`, para localizar a raiz.
- `tests/mocks/chrome-api.mock.js`, do qual `getRuntimeMock` é efetivamente usado.
- APIs globais de Jest (`describe`, `test`, `expect`, `jest.fn`) e `DOMException` do ambiente `jsdom`.
- `setTimeout` real em esperas artificiais de 10 ms e 20 ms.

### Dependências declaradas mas não usadas

- `fs` é importado na linha 44 e nunca referenciado.
- `getStorageMock` é desestruturado na linha 50 e nunca referenciado.

### Descoberta e execução

- `jest.config.js` inclui `tests/integration/**/*.test.js` no projeto `integration`, com `jsdom` e os setups de Chrome/DOM.
- `package.json#test:integration` seleciona exclusivamente esse projeto.
- `scripts/ci/run-jest-ci.js` compara o inventário real de `.test.js` com a união unit+integration e falha se houver arquivo não descoberto.

Esses pontos provam o wiring de descoberta; nesta auditoria documental o AGENTE 25 **não executou** a suíte e não transforma mera inclusão no inventário em prova de sucesso runtime.

### Implementações de produção correlatas, lidas apenas para comparação

- `extension/background/actions/fetch-image-base64.js` — SHA `4a4825c36fdbe630e80dd7fba1341bdc7a06aecf`.
- `extension/background/router.js` — SHA `d9278e9e58e4e9583a30c16227bfd833e7203d89`.
- `extension/background.js` — SHA `667c05eb2d7adfca16a79d3e706c39a1e9398b72`.
- `extension/content/gemini/result-extractor.js` — SHA `a3efd499a0b090f12701533a96f2602bf29bbcbb`.
- `extension/content/content_gemini.js` — SHA `55bc83afe31a10c53f39799717f2f221b6919029`.

## 3. Fluxo real deste arquivo

1. Localiza a raiz do repositório e obtém o singleton `ChromeRuntimeMock`.
2. Define `extractImageWithFallback`, que chama um `canvasExtractor` injetado.
3. Se o valor de Canvas é uma Data URL, devolve `{ base64, source: 'canvas' }`.
4. Qualquer rejeição ou retorno inválido cai em `sendMessage` injetado com a action legada.
5. A cópia local considera sucesso quando a resposta possui `response.base64`; ausência desse campo vira `{ base64: null, source: 'fetch_failed' }`.
6. Define `createFetchImageHandler`, uma cópia de handler síncrono que delega a uma `fetchFactory`, responde `{ base64 }` e retorna `true` para o action esperado.
7. Os testes exercitam happy path de Canvas, fallback, falha total, retorno síncrono do handler e invocação manual de listeners armazenados no mock.

## 4. Contratos modelados e diferenças para produção

| Tema | Contrato no teste #109 | Contrato observado na produção atual | Consequência documental |
|---|---|---|---|
| Campo de resposta | `base64` | `dataUrl` | mirror está divergente |
| Sessão Gemini | action + URL | rota Gemini acrescenta `geminiSession: true` | teste não modela restrição privilegiada |
| Handler | função local `createFetchImageHandler` | router registra action `fetch-image-base64` | teste não prova registro real |
| Validação | somente nome da action | URL/protocolo/origem/MIME/tamanho/timeout | branches reais são ignorados pelo mirror |
| IPC mock | manipula `_messageListeners` diretamente | consumidor chama `runtime.sendMessage` | keep-alive do mock é contornado no último cenário |
| Falha | `{ base64:null,error }` | compatibilidade de background entrega `{ error }` | formato local não é o formato legado real |
| Conteúdo Gemini | URL `gemini.google.com/generated-image-123.png` | rota autenticada aceita asset `googleusercontent.com` vindo da aba Gemini | fixture não representa a restrição atual |

## 5. Evidência automatizada

| Comportamento | Evidência existente | Classificação |
|---|---|---|
| Arquivo pertence ao projeto Jest `integration` | `jest.config.js` + gate de inventário de `run-jest-ci.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Mirror retorna Canvas sem chamar fallback | assertions linhas 131–133 | ✅ PROVADO DIRETAMENTE |
| Rejeição do Canvas chama action+URL e recebe `base64` no mirror | linhas 153–158 | ✅ PROVADO DIRETAMENTE, **somente do mirror** |
| Canvas vazio também cai no fallback local | linhas 193–194 | ✅ PROVADO DIRETAMENTE, **somente do mirror** |
| Falha local produz `fetch_failed` + null | linhas 211–212 | ✅ PROVADO DIRETAMENTE, **somente do mirror** |
| Handler local responde sucesso e retorna booleano `true` | linhas 233–236 | ✅ PROVADO DIRETAMENTE, **somente do mirror** |
| Handler local ignora action diferente | linhas 250–252 | ✅ PROVADO DIRETAMENTE, **somente do mirror** |
| Handler local serializa erro em `{base64:null,error}` | linhas 268–271 | ✅ PROVADO DIRETAMENTE, **somente do mirror** |
| Lista privada de listeners recebe invocação manual | linhas 297–312 | ✅ PROVADO DIRETAMENTE para a chamada manual; não prova `runtime.sendMessage` |
| Action real busca e retorna `dataUrl` | `tests/unit/background/fetch-image-base64-action.test.js` importa router/action reais e possui assertions focais | ✅ PROVADO DIRETAMENTE por teste externo |
| Background real mantém canal aberto e compatibiliza sucesso/erro legado | `tests/unit/background/plan-missing-handlers-real.test.js` carrega background real | ✅ PROVADO DIRETAMENTE por teste externo |
| Result extractor real escala para `FETCH_IMAGE_AS_BASE64` com `geminiSession:true` | `tests/unit/content-gemini/result-extractor.test.js`, cenário EXT-04 | ✅ PROVADO DIRETAMENTE por teste externo |
| Cadeia única real result-extractor → runtime → router/action → callback | não é composta por este arquivo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste teste |
| A falha do fetch não deixa o **job real** travado | o arquivo só resolve seu helper local para null; `finalizeJob` não é chamado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Invariantes locais

1. O caminho Canvas deve evitar `sendMessage` quando produz Data URL válida.
2. Qualquer erro do extrator local é tratado como motivo para fallback; o helper não limita o catch a `SecurityError`.
3. Retorno Canvas vazio ou sem prefixo `data:` também força fallback.
4. O mirror do fallback sempre usa a action `FETCH_IMAGE_AS_BASE64`.
5. O mirror considera somente `response.base64` como sucesso.
6. O handler local deve retornar `false` para action não reconhecida e `true` para a esperada.
7. A Promise interna do handler não altera o tipo do retorno externo.
8. Os cenários do runtime mock reutilizam o singleton exportado pelo setup.

## 7. Casos-limite, resíduos e riscos

**Mirror drift já materializado.** O teste protege um payload `{base64}` que não corresponde ao `{dataUrl}` de produção. Isso permite falso verde: o teste pode passar enquanto o contrato real muda ou quebra.

**Integração nominal, não composição real.** Nenhum módulo de produção do producer/consumer/router/action é carregado por este arquivo. Os testes diretos externos são melhores evidências para esses componentes.

**Uso de API privada do mock.** O último cenário faz `runtimeMock._messageListeners.push(handler)` e depois `forEach(listener => listener(...))`; assim não usa `runtimeMock.sendMessage`, não testa o timeout do canal, e não verifica a semântica `shouldKeepAlive === true` implementada pelo próprio mock.

**Catch amplo.** A função local chama o fallback para qualquer erro de Canvas, embora o texto enfatize CORS/SecurityError.

**Claim de job sem prova.** Resolver o helper local com null demonstra que aquela Promise encerra, mas não demonstra que o lifecycle de job real finaliza, limpa recursos ou deixa de aguardar outras operações.

**Comentários contraditórios.** Linhas 234–235 dizem corretamente que o handler é síncrono e retorna booleano; linhas 284–285 ainda afirmam que `return true` é uma Promise de async function. O código e a assertion são coerentes com o primeiro comentário.

**Cabeçalho historicamente deslocado.** Linha 8 cita `content_manga.js` enquanto o restante da narrativa de Canvas descreve `content_gemini.js`; ambas as áreas hoje possuem usos da action, mas o cenário modelado não carrega nenhuma das duas.

**Imports mortos.** `fs` e `getStorageMock` adicionam ruído e não contribuem para o teste.

**Esperas temporais artificiais.** Os 10/20 ms tornam o teste dependente do event loop apesar de o handler local poder ser sincronizado por uma Promise controlável.

## 8. Solicitações ao auditor

### 109-001 — TEST_CORRECTION — OPEN

**Encontrado:** o teste denominado integração IPC usa implementações espelho locais e um contrato de resposta `{base64}` divergente do contrato real `{dataUrl}`. O cenário final chama `_messageListeners` diretamente em vez de `runtimeMock.sendMessage`.

**Evidência atual:** as assertions são fortes para as funções locais; testes externos (`fetch-image-base64-action.test.js`, `plan-missing-handlers-real.test.js` e `result-extractor.test.js`) exercitam os componentes reais separadamente.

**Evidência ausente:** este arquivo não prova uma cadeia composta usando consumidor real, dispatch real do router/action e callback real com `dataUrl`, nem as restrições atuais de `geminiSession`.

**Necessário:** auditor externo deve decidir entre reescrever este teste para compor implementações reais ou reduzir/retirar as alegações de integração e eliminar o mirror redundante. Se mantido como integração, deve usar `dataUrl`, `geminiSession` quando aplicável e a API pública `runtimeMock.sendMessage`.

**Risco:** falso verde da suíte de integração após regressão no IPC real, porque as cópias locais podem continuar passando independentemente da produção.

**Severidade:** HIGH.

### 109-002 — TEST_REQUIRED — OPEN

**Encontrado:** o cenário de falha total afirma que o job não trava, mas somente verifica que `extractImageWithFallback` resolve `{ base64:null, source:'fetch_failed' }`.

**Evidência atual:** a Promise local termina e retorna null.

**Evidência ausente:** nenhuma assertion do arquivo invoca o lifecycle/finalização real do job ou observa seu estado após falha de extração.

**Necessário:** localizar ou adicionar, em trabalho externo autorizado, uma prova consumer-level que force falha da rota de imagem e verifique settlement/finalização/cleanup do job; alternativamente estreitar a afirmação deste teste para não alegar propriedade não exercitada.

**Risco:** regressão de lifecycle pode coexistir com este teste verde.

**Severidade:** NORMAL.

## 9. Fonte integral exata

O bloco abaixo foi incorporado do blob SHA auditado, sem correção do objeto auditado.

```js
/**
 * gemini-cors-fallback.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste de integração IPC: fluxo de extração de imagem com fallback CORS.
 *
 * POSIÇÃO: tests/integration/ipc/
 * Motivo da pasta "ipc": este teste cobre a comunicação inter-processo entre
 * content_manga.js (aba do mangá) e background.js via chrome.runtime.sendMessage,
 * especificamente o fluxo FETCH_IMAGE_AS_BASE64 que é o fallback para CORS.
 *
 * CONTEXTO DO PROBLEMA:
 * O content_gemini.js extrai a imagem traduzida do Gemini via Canvas API:
 *
 *   const canvas = document.createElement('canvas');
 *   const ctx = canvas.getContext('2d');
 *   ctx.drawImage(img, 0, 0);
 *   const base64 = canvas.toDataURL('image/png');  // ← PODE LANÇAR SecurityError
 *
 * O Canvas é "contaminado" (tainted) quando a imagem vem de um domínio diferente
 * sem CORS headers adequados. O Gemini serve imagens de googleusercontent.com,
 * e dependendo do contexto, toDataURL() lança:
 *   SecurityError: Failed to execute 'toDataURL' on 'HTMLCanvasElement':
 *   Tainted canvases may not be exported.
 *
 * FLUXO DE FALLBACK:
 * Quando Canvas lança SecurityError, o content_gemini.js envia:
 *   chrome.runtime.sendMessage({ action: 'FETCH_IMAGE_AS_BASE64', url: imgSrc })
 *
 * O background.js faz fetch() do URL no contexto do Service Worker
 * (que não tem restrições de CORS para extensões com <all_urls>), converte
 * para base64 via FileReader/ArrayBuffer, e retorna para o content script.
 *
 * Este teste verifica:
 * 1. O handler FETCH_IMAGE_AS_BASE64 existe no background e responde
 * 2. O fallback é acionado quando Canvas lança SecurityError
 * 3. O resultado final (base64) é idêntico seja via Canvas ou via fetch
 * 4. Falha de fetch também é tratada (imagem retorna null, job não trava)
 *
 * INTEGRAÇÃO IPC TESTADA:
 * content_gemini.js → (sendMessage FETCH_IMAGE_AS_BASE64) → background.js → (fetch + base64) → content_gemini.js
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

// ── Implementação espelho do fluxo de extração com CORS fallback ─────────────

/**
 * Simula a extração de imagem do content_gemini.js:
 * 1. Tenta Canvas (pode lançar SecurityError)
 * 2. Fallback: envia FETCH_IMAGE_AS_BASE64 para o background
 */
async function extractImageWithFallback(imgSrc, canvasExtractor, sendMessage) {
    // Tentativa primária: Canvas
    try {
        const base64 = await canvasExtractor(imgSrc);
        if (base64 && base64.startsWith('data:')) return { base64, source: 'canvas' };
        throw new Error('Canvas retornou string vazia ou inválida');
    } catch (corsErr) {
        // Fallback: FETCH_IMAGE_AS_BASE64 via background
        return new Promise((resolve) => {
            sendMessage({ action: 'FETCH_IMAGE_AS_BASE64', url: imgSrc }, (response) => {
                if (response && response.base64) {
                    resolve({ base64: response.base64, source: 'fetch' });
                } else {
                    resolve({ base64: null, source: 'fetch_failed' });
                }
            });
        });
    }
}

/**
 * Simula o handler FETCH_IMAGE_AS_BASE64 do background.js.
 * Em produção, usa fetch() + FileReader. Aqui, usa uma factory injetável.
 */
/**
 * createFetchImageHandler — espelho do handler FETCH_IMAGE_AS_BASE64 do background.js.
 *
 * CORRECAO: funcao era declarada como `async function`, o que faz qualquer
 * `return false` retornar Promise<false> em vez de false booleano.
 * O Chrome IPC verifica o retorno SINCRONAMENTE para decidir se o canal
 * fica aberto: `return false` fecha o canal, `return true` mantém aberto.
 * Com async, SEMPRE retornava uma Promise (truthy), nunca fechava o canal.
 *
 * Solucao: funcao sincrona + Promise interna sem await no escopo externo.
 * Assim `return false` e `return true` sao valores booleans reais.
 */
function createFetchImageHandler(fetchFactory) {
    return function handleFetchImageAsBase64(request, sender, sendResponse) {
        if (request.action !== 'FETCH_IMAGE_AS_BASE64') return false;

        // Lógica async encapsulada: não polui o return value externo
        (async () => {
            try {
                const base64 = await fetchFactory(request.url);
                sendResponse({ base64 });
            } catch (err) {
                sendResponse({ base64: null, error: err.message });
            }
        })();

        return true; // Síncrono — mantém o canal IPC aberto para resposta assíncrona
    };
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe('FETCH_IMAGE_AS_BASE64 — Fallback CORS (Integração IPC)', () => {

    const MOCK_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const GEMINI_IMG_URL = 'https://gemini.google.com/generated-image-123.png';

    describe('Cenário 1: Canvas funciona (sem CORS) — fallback NÃO acionado', () => {
        test('extrai imagem via Canvas quando não há SecurityError', async () => {
            const canvasExtractor = jest.fn().mockResolvedValue(MOCK_BASE64);
            const sendMessage = jest.fn(); // Não deve ser chamado

            const result = await extractImageWithFallback(
                GEMINI_IMG_URL,
                canvasExtractor,
                sendMessage
            );

            expect(result.source).toBe('canvas');
            expect(result.base64).toBe(MOCK_BASE64);
            expect(sendMessage).not.toHaveBeenCalled();
        });
    });

    describe('Cenário 2: Canvas lança SecurityError — fallback via FETCH', () => {
        test('aciona FETCH_IMAGE_AS_BASE64 quando Canvas lança SecurityError', async () => {
            const canvasExtractor = jest.fn().mockRejectedValue(
                new DOMException('Tainted canvases may not be exported.', 'SecurityError')
            );

            const sendMessage = jest.fn().mockImplementation((msg, cb) => {
                cb({ base64: MOCK_BASE64 });
            });

            const result = await extractImageWithFallback(
                GEMINI_IMG_URL,
                canvasExtractor,
                sendMessage
            );

            expect(result.source).toBe('fetch');
            expect(result.base64).toBe(MOCK_BASE64);
            expect(sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'FETCH_IMAGE_AS_BASE64', url: GEMINI_IMG_URL }),
                expect.any(Function)
            );
        });

        test('base64 resultante é idêntico ao que Canvas retornaria', async () => {
            // Simula: Canvas falha, fetch retorna o mesmo conteúdo
            const canvasExtractor = jest.fn().mockRejectedValue(
                new Error('SecurityError')
            );
            const sendMessage = jest.fn().mockImplementation((msg, cb) => {
                cb({ base64: MOCK_BASE64 }); // Mesmo conteúdo que Canvas retornaria
            });

            const result = await extractImageWithFallback(
                GEMINI_IMG_URL,
                canvasExtractor,
                sendMessage
            );

            expect(result.base64).toBe(MOCK_BASE64);
        });
    });

    describe('Cenário 3: Canvas retorna string vazia — fallback acionado', () => {
        test('string vazia no Canvas aciona o fallback', async () => {
            const canvasExtractor = jest.fn().mockResolvedValue(''); // Canvas vazio
            const sendMessage = jest.fn().mockImplementation((msg, cb) => {
                cb({ base64: MOCK_BASE64 });
            });

            const result = await extractImageWithFallback(
                GEMINI_IMG_URL,
                canvasExtractor,
                sendMessage
            );

            expect(result.source).toBe('fetch');
            expect(result.base64).toBe(MOCK_BASE64);
        });
    });

    describe('Cenário 4: Falha total (Canvas + Fetch falham) — job não deve travar', () => {
        test('retorna { base64: null } sem lançar exceção', async () => {
            const canvasExtractor = jest.fn().mockRejectedValue(new Error('SecurityError'));
            const sendMessage = jest.fn().mockImplementation((msg, cb) => {
                cb({ base64: null, error: 'fetch failed: 403 Forbidden' });
            });

            const result = await extractImageWithFallback(
                GEMINI_IMG_URL,
                canvasExtractor,
                sendMessage
            );

            expect(result.source).toBe('fetch_failed');
            expect(result.base64).toBeNull();
            // O job não deve ficar pendente — null é um resultado válido que
            // indica falha a ser tratada pelo finalizeJob()
        });
    });

    describe('Handler do background: FETCH_IMAGE_AS_BASE64', () => {
        test('handler responde com base64 quando fetch tem sucesso', async () => {
            const fetchFactory = jest.fn().mockResolvedValue(MOCK_BASE64);
            const handler = createFetchImageHandler(fetchFactory);
            const sendResponse = jest.fn();

            const shouldKeepOpen = handler(
                { action: 'FETCH_IMAGE_AS_BASE64', url: GEMINI_IMG_URL },
                { tab: { id: 1 } },
                sendResponse
            );

            // Aguarda a Promise interna do handler
            await new Promise(r => setTimeout(r, 10));

            expect(sendResponse).toHaveBeenCalledWith({ base64: MOCK_BASE64 });
            // CORREÇÃO: handler agora é síncrono e retorna o booleano true (não Promise).
            // "return true" é o valor booleano que sinaliza ao Chrome que a resposta é assíncrona.
            expect(shouldKeepOpen).toBe(true);
        });

        test('handler ignora mensagens de outros tipos (retorna false)', async () => {
            const fetchFactory = jest.fn();
            const handler = createFetchImageHandler(fetchFactory);
            const sendResponse = jest.fn();

            const result = handler(
                { action: 'OUTRO_ACTION', url: GEMINI_IMG_URL },
                {},
                sendResponse
            );

            expect(result).toBe(false);
            expect(fetchFactory).not.toHaveBeenCalled();
            expect(sendResponse).not.toHaveBeenCalled();
        });

        test('handler responde com null quando fetch falha', async () => {
            const fetchFactory = jest.fn().mockRejectedValue(new Error('Network error'));
            const handler = createFetchImageHandler(fetchFactory);
            const sendResponse = jest.fn();

            handler(
                { action: 'FETCH_IMAGE_AS_BASE64', url: GEMINI_IMG_URL },
                {},
                sendResponse
            );

            await new Promise(r => setTimeout(r, 10));

            expect(sendResponse).toHaveBeenCalledWith({
                base64: null,
                error: 'Network error',
            });
        });

        test('handler retorna true (return true) para manter canal IPC aberto', async () => {
            const fetchFactory = jest.fn().mockResolvedValue(MOCK_BASE64);
            const handler = createFetchImageHandler(fetchFactory);

            const returnVal = handler(
                { action: 'FETCH_IMAGE_AS_BASE64', url: GEMINI_IMG_URL },
                {},
                jest.fn()
            );

            // "return true" é um Promise (async function), que é truthy
            // Isso mantém o canal de mensagens aberto para a resposta assíncrona
            expect(returnVal).toBeTruthy();
        });
    });

    describe('Integração com ChromeRuntimeMock', () => {
        test('listener registrado no runtime recebe e processa FETCH_IMAGE_AS_BASE64', async () => {
            const runtimeMock = getRuntimeMock();
            const fetchFactory = jest.fn().mockResolvedValue(MOCK_BASE64);
            const handler = createFetchImageHandler(fetchFactory);
            const sendResponse = jest.fn();

            // Registra o handler como faria o background.js
            runtimeMock._messageListeners.push(handler);

            // Envia mensagem como faria o content_gemini.js
            runtimeMock._messageListeners.forEach(listener => {
                listener(
                    { action: 'FETCH_IMAGE_AS_BASE64', url: GEMINI_IMG_URL },
                    { tab: { id: 5 } },
                    sendResponse
                );
            });

            await new Promise(r => setTimeout(r, 20));

            expect(fetchFactory).toHaveBeenCalledWith(GEMINI_IMG_URL);
            expect(sendResponse).toHaveBeenCalledWith({ base64: MOCK_BASE64 });
        });
    });
});
```

## 10. Cobertura documental por linha/posição

As faixas seguintes são contíguas, sem sobreposição, e cobrem **1–316**; a posição 316 representa o newline terminal.

### Posições 1–4 — identidade e escopo declarado
Docblock identifica o arquivo e o chama de teste de integração IPC/fallback CORS. É metadado explicativo, não comportamento executável. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a classificação editorial.

### Posições 5–10 — localização e primeira alegação de IPC
Explicam a pasta `ipc` e afirmam comunicação entre `content_manga.js` e `background.js`. A alegação não é realizada pela própria suíte, que não importa esses módulos. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a cadeia declarada.

### Posições 11–24 — narrativa de Canvas/CORS
Descrevem o problema de canvas tainted e `SecurityError`, incluindo um pseudotrecho de `toDataURL`. A suíte injeta uma rejeição `DOMException` em 139–141, mas não executa Canvas real cross-origin. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE como condição simulada.

### Posições 25–32 — narrativa de fallback
Descrevem `sendMessage`, fetch do Service Worker e conversão para base64. Produção realmente possui a action, porém o formato atual retornado é `dataUrl`, e o action real usa `FileReader` sobre Blob, não uma rota ArrayBuffer mostrada aqui. **Evidência:** ⚠️ SEM PROVA DIRETA neste arquivo; cruzamento externo confirma o componente real.

### Posições 33–41 — objetivos declarados
Enumeram quatro propriedades e desenham uma cadeia end-to-end. As assertions deste arquivo cobrem equivalentes locais, mas não carregam a cadeia real. A expressão ‘job não trava’ excede o que é observado. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para as alegações de integração real.

### Posição 42 — separador
Linha vazia entre docblock e imports. Sem efeito runtime. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 43–50 — imports, raiz e mock
`path` é usado para requerer o mock, `findRepoRoot` ancora `ROOT`, e `getRuntimeMock` é usado no último cenário. `fs` e `getStorageMock` são resíduos não usados. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE para setup; imports mortos não possuem assertion focal.

### Posições 51–58 — declaração do primeiro mirror
Comentário de seção e JSDoc deixam explícito que `extractImageWithFallback` é uma simulação. Isso é crucial para não confundir a função local com a produção. **Evidência:** 🟦 GATE ESTÁTICO/ESTRUTURAL somente quanto à presença do próprio código; conteúdo editorial não é assertion.

### Posições 59–77 — `extractImageWithFallback`
Implementa Canvas injetado, valida prefixo `data:`, captura qualquer falha, envia action legada e resolve sucesso apenas com `response.base64`. Linhas 131–133, 153–158, 176, 193–194 e 211–212 afirmam seus principais ramos. **Evidência:** ✅ PROVADO DIRETAMENTE para a função local.

### Posições 78–94 — documentação do mirror de handler
Explicam que o handler é síncrono por fora e assíncrono internamente para preservar retorno booleano. A explicação aqui concorda com o código; a nota posterior em 284–285 está stale. **Evidência:** ✅ PROVADO DIRETAMENTE pelas assertions 236 e 250 para os retornos locais.

### Posições 95–111 — `createFetchImageHandler`
Factory devolve handler; rejeita actions diferentes, inicia IIFE async, chama `fetchFactory`, responde sucesso/erro e retorna `true`. É uma implementação espelho e não registra a action no router real. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror por 219–287.

### Posições 112–118 — abertura da suíte e fixtures
Separam testes, abrem `describe` e definem Data URL/URL fake reutilizadas. A URL de Gemini não representa o host autenticado `googleusercontent.com` exigido pela produção atual. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE como fixture da suíte.

### Posições 119–135 — cenário 1: Canvas funciona
Mock de Canvas resolve a Data URL; `sendMessage` permanece spy não chamado; assertions exigem source `canvas`, payload e ausência de fallback. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posições 136–159 — cenário 2a: SecurityError
Canvas rejeita com `DOMException(SecurityError)`; callback fake devolve `base64`; assertions verificam source, valor e shape da mensagem local action+URL. Não verifica `geminiSession`. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror; ⚠️ para o contrato real completo.

### Posições 160–178 — cenário 2b: igualdade do payload
Força erro genérico chamado SecurityError e devolve o mesmo Data URL pelo callback; a única assertion é igualdade do valor final. Isso não compara duas execuções reais de Canvas versus fetch. **Evidência:** ✅ PROVADO DIRETAMENTE da igualdade da fixture local; 🟨 para equivalência de rotas reais.

### Posições 179–196 — cenário 3: Canvas vazio
Valor vazio é invalidado pela função local, callback fake entrega Data URL e assertions exigem fallback/sucesso. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posições 197–216 — cenário 4: falha total
Canvas rejeita e callback entrega erro/null; assertions comprovam que o helper local resolve `fetch_failed` e null. Comentário final extrapola para `finalizeJob`, que não é chamado. **Evidência:** ✅ PROVADO DIRETAMENTE para settlement local; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para lifecycle do job.

### Posições 217–237 — handler local: sucesso
Factory resolve Data URL; handler é chamado diretamente; após espera de 10 ms, assertions exigem resposta `{base64}` e retorno `true`. **Evidência:** ✅ PROVADO DIRETAMENTE para o handler espelho.

### Posições 238–253 — handler local: action ignorada
Invoca action desconhecida e exige `false`, ausência de fetch e ausência de resposta. `async` no callback de teste é desnecessário, mas não muda a propriedade observada. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posições 254–272 — handler local: erro de fetch
Factory rejeita, IIFE captura, aguarda 10 ms e assertion exige `{base64:null,error:'Network error'}`. Produção atual entrega erro através do envelope/router de forma diferente. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror; ⚠️ para payload de produção.

### Posições 273–287 — teste do keep-alive
Chama o handler local e verifica somente truthiness. Como o handler atual retorna booleano `true`, o teste passa; os comentários 284–285 que o chamam de Promise estão incorretos. **Evidência:** ✅ PROVADO DIRETAMENTE que o retorno é truthy; o teste anterior 236 é mais específico (`toBe(true)`).

### Posições 288–313 — cenário com `ChromeRuntimeMock`
Obtém o singleton, injeta o handler diretamente no array privado, itera manualmente listeners e exige chamada à factory/resposta. Não usa `runtimeMock.sendMessage`, portanto não atravessa a lógica do mock que inspeciona `shouldKeepAlive === true` e agenda timeout/callback. **Evidência:** ✅ PROVADO DIRETAMENTE para dispatch manual; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para IPC público neste cenário.

### Posições 314–315 — fechamento estrutural
Fecham `test`, `describe` interno e `describe` raiz. Sem contrato independente além da sintaxe. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE quando Jest parseia a suíte.

### Posição 316 — newline final
Terminador textual final do arquivo, sem efeito runtime. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- SHA do fonte reconfirmado imediatamente antes da materialização: `1f5a1236139d85640cb5fa24590f434859155c62`.
- Fonte integral incorporada diretamente do blob auditado.
- 315 linhas textuais + newline final = **316/316 posições**.
- Faixas de cobertura são contíguas: 1–4, 5–10, 11–24, 25–32, 33–41, 42, 43–50, 51–58, 59–77, 78–94, 95–111, 112–118, 119–135, 136–159, 160–178, 179–196, 197–216, 217–237, 238–253, 254–272, 273–287, 288–313, 314–315, 316.
- Assertions do próprio arquivo foram separadas de testes externos da implementação real.
- O teste não foi executado por este agente; nenhuma classificação depende de alegar execução inexistente.
- Duas necessidades externas foram registradas como `audit_requests` em vez de modificar o objeto auditado.
- `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md`, código e testes permanecem fora do escopo de escrita do AGENTE 25.

**Resultado da autoauditoria:** ✅ APROVADO para conclusão documental, com solicitações externas abertas que não bloqueiam a Bíblia.

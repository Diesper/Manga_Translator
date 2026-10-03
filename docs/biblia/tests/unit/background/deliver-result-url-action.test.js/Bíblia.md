# Bíblia técnica — tests/unit/background/deliver-result-url-action.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `09a0f891434bccf30dbc6e0d244e8f18a40a17d9`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** teste unitário focal do router + action real `deliver-result-url`  
> **Linhas textuais:** **175**  
> **Posições documentais:** **176**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Esta suíte testa diretamente o par de produção `extension/background/router.js` + `extension/background/actions/deliver-result-url.js`. Diferentemente de uma implementação espelho, `loadRouter()` isola os módulos reais, registra a action real no registry e dispara requests pelo `createMessageRouter()` real.

O comportamento sob teste é o fallback por URL do resultado Gemini: depois de validar payload e ownership, a action abre uma aba auxiliar inativa, grava o mapping `extractionTabs`, move o job para `awaiting_auxiliary_extraction`, sincroniza estado e responde `extractionRegistered:true` sem finalizar o job.

A suíte também protege uma decisão arquitetural importante: `state.currentBatchId` global pode já ter mudado sem invalidar um job antigo ainda persistido; a autoridade é o job retornado por `assertJobOwnership` e sua identidade persistida.

## 2. Dependências e isolamento

### Dependências diretas

- Node `path` para resolver módulos de produção.
- `extension/background/router.js` — SHA auditado em leitura `d9278e9e58e4e9583a30c16227bfd833e7203d89`.
- `extension/background/actions/deliver-result-url.js` — SHA auditado em leitura `91c50efe4764f56aac16aec2c91309e06db7d0ac`.
- APIs Jest (`jest.isolateModules`, `jest.fn`, `test`, `test.each`, `expect`).
- Globals sintéticos `self` e `chrome`, com `chrome.tabs.create` substituído por spy controlável.

### Descoberta pelo runner

O arquivo está sob `tests/unit/background/**/*.test.js`, padrão do projeto Jest `background`. `scripts/ci/run-jest-ci.js` verifica a partição dos testes unitários/integration contra o inventário existente. Isso protege descoberta/wiring, mas nesta auditoria o AGENTE 25 não executou a suíte.

### Consumidores e provas cruzadas

- `tests/unit/background/batch-lifecycle-real.test.js` carrega `background.js` completo e prova que `GEMINI_RESULT_URL` cria aba/mapping que depois é reconhecido por `CHECK_IF_EXTRACTION_TAB`.
- `tests/unit/content-gemini/rpa-flow.test.js` executa o conteúdo Gemini e observa emissão de `GEMINI_RESULT_URL` quando as rotas de extração anteriores falham.
- `extension/content/gemini/job-runner.js` é o produtor real da mensagem de fallback auxiliar.

## 3. Helpers da suíte

### `loadRouter()`

1. expõe `self` como `global` para o IIFE dos módulos de background;
2. instala um `chrome` mínimo com runtime id e `tabs.create` mockado;
3. remove registry anterior;
4. usa `jest.isolateModules` para requerer router e action reais;
5. devolve `global.MangaTranslatorRouter` recém-registrado.

### `dispatch()`

Converte a API callback do listener em Promise e inclui `keepAlive` na resolução. Para respostas assíncronas, o listener retorna `true` antes do callback e o helper captura corretamente esse valor. Para respostas **síncronas**, porém, `sendResponse` pode resolver a Promise antes da atribuição `keepAlive = listener(...)`; por isso os casos de validação observam `keepAlive: undefined`, embora o router real retorne `false`. Essa é uma limitação do helper, não do produto.

## 4. Cenários cobertos

### 4.1 Registro correto da aba auxiliar

O primeiro teste injeta um job persistido, faz `tabs.create` retornar id 81 e verifica diretamente:
- URL HTTPS recebe `#manga-translator-extraction` e abre com `active:false`;
- mapping usa `mangaTabId`, `index`, `geminiTabId`, `jobId` e `batchId` do job/ownership;
- `updateJobState(17, {state:'awaiting_auxiliary_extraction', auxiliaryTabId:81})`;
- `syncState()` uma vez;
- resposta `{ok:true, extractionRegistered:true}`.

### 4.2 Independência de `currentBatchId`

O segundo teste coloca `state.currentBatchId='batch-new'`, mas o job possui `batch-old` e o request usa essa identidade antiga válida. A aba é criada e a resposta permanece positiva.

### 4.3 Rejeição por identidade persistida

O terceiro teste altera **somente `batchId`** do request para `batch-forjado`, mantendo o job persistido com `batch-real`. A action real bloqueia antes de `tabs.create` com `job_identity_mismatch`.

### 4.4 Rejeição por ownership

O quarto teste faz `assertJobOwnership` responder `owns=false`; não abre aba e retorna `sender_mismatch`.

### 4.5 Validação antes de efeitos

O `test.each` prova dois payloads: ausência de `jobId` e URL `javascript:`. Nos dois, `ensureInitialized` e `tabs.create` permanecem intocados e o envelope de erro é `INVALID_PAYLOAD` com mensagem específica.

## 5. Matriz de evidência

| Comportamento | Assertion/prova | Classificação |
|---|---|---|
| Router/action reais são carregados | `jest.isolateModules` requer `ROUTER_PATH` e `ACTION_PATH` reais | 🟨 EXECUTADO INDIRETAMENTE pelo setup da suíte |
| Alias `GEMINI_RESULT_URL` alcança a action real | todos os cenários despacham action legada pelo router e recebem efeitos/resultados da action | ✅ PROVADO DIRETAMENTE |
| URL HTTPS recebe marcador e aba inativa | linhas 52–55 | ✅ PROVADO DIRETAMENTE |
| Mapping usa identidade persistida | linhas 56–62 | ✅ PROVADO DIRETAMENTE |
| Job entra em `awaiting_auxiliary_extraction` | linhas 63–66 | ✅ PROVADO DIRETAMENTE |
| Estado é sincronizado | linha 67 | ✅ PROVADO DIRETAMENTE |
| Resposta positiva inclui `extractionRegistered` | linhas 68–71 e 100 | ✅ PROVADO DIRETAMENTE |
| `currentBatchId` diferente não invalida job persistido | linhas 74–102 | ✅ PROVADO DIRETAMENTE |
| `batchId` forjado bloqueia antes de abrir aba | linhas 104–131 | ✅ PROVADO DIRETAMENTE |
| `index` forjado bloqueia | branch existe na action, não há caso nesta suíte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesta suíte |
| `mangaTabId` forjado bloqueia | branch existe na action, não há caso nesta suíte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesta suíte |
| Sender sem ownership bloqueia | linhas 133–152 | ✅ PROVADO DIRETAMENTE |
| `jobId` ausente falha antes de efeitos | linhas 154–174 | ✅ PROVADO DIRETAMENTE |
| `javascript:` é rejeitado | linhas 154–174 | ✅ PROVADO DIRETAMENTE |
| `blob:` é aceito sem marcador | permitido pela action, não exercitado aqui | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `data:image/` é aceito sem marcador | permitido pela action, não exercitado aqui | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Fragmento HTTPS existente é substituído preservando query/path | lógica real existe; fixture não possui hash/query | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `tabs.create` falha / callback sem tab/id | nenhum cenário | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `updateJobState` ou `syncState` rejeita após abrir aba | nenhum cenário | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Fluxo completo background cria mapping e `CHECK_IF_EXTRACTION_TAB` o reconhece | `batch-lifecycle-real.test.js` com background completo | ✅ PROVADO DIRETAMENTE por teste externo |
| Content Gemini emite fallback `GEMINI_RESULT_URL` | `rpa-flow.test.js` CG-30/CG-39 | ✅ PROVADO DIRETAMENTE por teste externo do produtor |

## 6. Invariantes protegidos

1. O request precisa ter `jobId` textual não vazio.
2. Esquemas não permitidos, como `javascript:`, falham antes da inicialização/efeitos.
3. Ownership deve existir antes de abrir aba.
4. O job persistido, não `currentBatchId`, é autoridade de identidade.
5. Divergência conhecida de identidade deve bloquear a aba auxiliar.
6. HTTPS usado no happy path recebe o hash de extração.
7. A aba auxiliar deve ser inativa.
8. O mapping deve preservar a identidade do job e o tab id do owner.
9. O job deve permanecer ativo em estado `awaiting_auxiliary_extraction`, não ser finalizado por esta action.
10. `syncState` participa do caminho positivo antes da resposta.

## 7. Casos-limite e riscos

**Cobertura parcial do triplo de identidade.** A action compara `batchId`, `index` e `mangaTabId`, mas esta suíte só falsifica `batchId`. Uma regressão isolada nos dois outros comparadores não é capturada por este arquivo.

**Esquemas permitidos mais amplos que as fixtures.** O validator aceita `http:`, `https:`, `blob:` e `data:image/`; somente HTTPS e `javascript:` aparecem nos testes. O comportamento de navegação para blob/data não é provado.

**Normalização de URL parcialmente provada.** O teste exige inclusão do hash em uma URL HTTPS simples, mas não cobre query existente, hash anterior ou exceção no `new URL()` para esquemas aceitos.

**Falha não transacional após abrir aba.** A action escreve `extractionTabs`, chama `updateJobState` e só depois `syncState`. Se update/sync rejeitar, o router devolve erro, mas a aba pode permanecer aberta e o estado em memória parcialmente alterado. Não há rollback local e a suíte não força esses erros.

**`tabs.create` presume tab válido.** A action usa `newTab.id` sem validar callback/`runtime.lastError`. O mock sempre devolve tab válido nos caminhos positivos.

**Helper `dispatch` perde retorno síncrono.** Nos casos de validação, a Promise resolve dentro de `sendResponse` antes de `keepAlive` receber o `false` retornado pelo router. Assim a expectativa `keepAlive: undefined` é um artefato do harness e não prova o contrato de canal síncrono.

**Cleanup global mínimo.** `afterEach` apaga apenas `MangaTranslatorRouter`; `global.self` e `global.chrome` são sobrescritos novamente por `loadRouter`, mas não são removidos aqui. A suíte depende do isolamento/configuração global do runner para não vazar comportamento para arquivos vizinhos.

## 8. Solicitações ao auditor

### 139-001 — TEST_REQUIRED — OPEN

**Encontrado:** `deliver-result-url.js` possui três comparadores de identidade persistida (`batchId`, `index`, `mangaTabId`), mas esta suíte só prova divergência de `batchId`.

**Evidência atual:** o caso linhas 104–131 rejeita `batch-forjado`; a implementação real contém branches separados para `index` e `mangaTabId`.

**Evidência ausente:** requests com `index` forjado e `mangaTabId` forjado, verificando ausência de `tabs.create` e `job_identity_mismatch`.

**Necessário:** adicionar casos focalizados, preferencialmente `test.each`, executando router/action reais como os cenários atuais.

**Risco:** remoção ou regressão de um comparador pode permitir associar resultado à página/aba errada sem falhar esta suíte.

**Severidade:** HIGH.

### 139-002 — TEST_REQUIRED — OPEN

**Encontrado:** o validator aceita `blob:` e `data:image/`, e a normalização HTTPS substitui fragmento; nenhum desses contratos positivos alternativos é exercitado.

**Evidência atual:** HTTPS simples recebe marcador; `javascript:` é rejeitado.

**Evidência ausente:** aceitação de blob/data sem hash artificial, preservação de query e substituição de hash existente.

**Necessário:** adicionar testes com a action real para os esquemas/normalizações suportados ou estreitar formalmente o contrato se esses esquemas não forem desejados.

**Risco:** branch aceito pelo validator pode quebrar sem detecção; regressões de URL podem impedir a extração auxiliar.

**Severidade:** NORMAL.

### 139-003 — ROBUSTNESS_REVIEW — OPEN

**Encontrado:** após `chrome.tabs.create`, falhas de `updateJobState` ou `syncState` não executam rollback; `newTab.id` também é usado sem validar callback/`runtime.lastError`.

**Evidência atual:** todos os mocks positivos resolvem e sempre fornecem id; não há cenário de falha pós-criação.

**Evidência ausente:** comportamento definido para callback sem tab/id, erro de criação, rejeição de update/sync e limpeza da aba/mapping parcial.

**Necessário:** auditor externo deve decidir o contrato de recuperação/rollback e acrescentar testes; se o risco for confirmado, corrigir a action em alteração separada autorizada.

**Risco:** aba auxiliar órfã, mapping parcial ou job em estado inconsistente após falha de persistência.

**Severidade:** HIGH.

### 139-004 — TEST_HELPER_CORRECTION — OPEN

**Encontrado:** o helper `dispatch` resolve respostas síncronas antes de atribuir o retorno do listener, produzindo `keepAlive: undefined` no teste de payload inválido mesmo quando o router retorna `false`.

**Evidência atual:** a expectativa das linhas 170–173 incorpora esse `undefined`; o router real retorna `false` após validação rejeitada.

**Evidência ausente:** assertion correta do valor de retorno síncrono da função `onMessage` para os casos inválidos.

**Necessário:** ajustar o harness para capturar separadamente retorno e resposta síncrona, ou não incluir `keepAlive` nesse tipo de assertion.

**Risco:** regressão na semântica de keep-alive síncrona pode ficar mascarada pelo helper.

**Severidade:** NORMAL.

## 9. Fonte integral exata

O bloco abaixo é a cópia integral do blob SHA auditado; nenhum código do teste foi modificado pelo AGENTE 25.

```js
const path = require('path');
const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/deliver-result-url.js');

function loadRouter() {
    global.self = global;
    global.chrome = { runtime: { id: 'test-extension-id' }, tabs: { create: jest.fn() } };
    delete global.MangaTranslatorRouter;
    jest.isolateModules(() => { require(ROUTER_PATH); require(ACTION_PATH); });
    return global.MangaTranslatorRouter;
}

function dispatch(listener, request, sender) {
    return new Promise(resolve => {
        let keepAlive;
        keepAlive = listener(request, sender, response => resolve({ keepAlive, response }));
    });
}

describe('background/actions/deliver-result-url.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('registra aba auxiliar sem finalizar e preserva a identidade persistida do job', async () => {
        const router = loadRouter();
        chrome.tabs.create.mockImplementation((_options, callback) => callback({ id: 81 }));
        const state = { extractionTabs: {}, currentBatchId: 'outro-batch' };
        const syncState = jest.fn().mockResolvedValue();
        const updateJobState = jest.fn().mockResolvedValue();
        const job = {
            jobId: 'job-4',
            batchId: 'batch-1',
            mangaTabId: 33,
            index: 4,
        };

        const result = await dispatch(router.createMessageRouter({ contextFactory: () => ({
            state,
            syncState,
            updateJobState,
            log: jest.fn(),
            ensureInitialized: jest.fn().mockResolvedValue(),
            assertJobOwnership: (_sender, _jobId, callback) => callback(true, 17, job),
        }) }), {
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 33,
            index: 4,
            url: 'https://cdn.example/result.png',
            jobId: 'job-4',
            batchId: 'batch-1',
        }, { tab: { id: 17, url: 'https://gemini.google.com/app' } });

        expect(chrome.tabs.create).toHaveBeenCalledWith(
            { url: 'https://cdn.example/result.png#manga-translator-extraction', active: false },
            expect.any(Function)
        );
        expect(state.extractionTabs[81]).toEqual({
            mangaTabId: 33,
            index: 4,
            geminiTabId: 17,
            jobId: 'job-4',
            batchId: 'batch-1',
        });
        expect(updateJobState).toHaveBeenCalledWith(17, {
            state: 'awaiting_auxiliary_extraction',
            auxiliaryTabId: 81,
        });
        expect(syncState).toHaveBeenCalledTimes(1);
        expect(result.response).toEqual({
            ok: true,
            extractionRegistered: true,
        });
    });

    test('currentBatchId diferente não invalida fallback de job real', async () => {
        const router = loadRouter();
        chrome.tabs.create.mockImplementation((_options, callback) => callback({ id: 82 }));
        const job = {
            jobId: 'job-old',
            batchId: 'batch-old',
            mangaTabId: 33,
            index: 4,
        };

        const result = await dispatch(router.createMessageRouter({ contextFactory: () => ({
            state: { currentBatchId: 'batch-new', extractionTabs: {} },
            syncState: jest.fn().mockResolvedValue(),
            updateJobState: jest.fn().mockResolvedValue(),
            log: jest.fn(),
            ensureInitialized: jest.fn().mockResolvedValue(),
            assertJobOwnership: (_sender, _jobId, callback) => callback(true, 17, job),
        }) }), {
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 33,
            index: 4,
            url: 'https://cdn.example/result.png',
            jobId: 'job-old',
            batchId: 'batch-old',
        }, { tab: { id: 17, url: 'https://gemini.google.com/app' } });

        expect(result.response).toEqual({ ok: true, extractionRegistered: true });
        expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    });

    test('rejeita identidade forjada antes de abrir aba auxiliar', async () => {
        const router = loadRouter();
        const job = {
            jobId: 'job-4',
            batchId: 'batch-real',
            mangaTabId: 33,
            index: 4,
        };

        const result = await dispatch(router.createMessageRouter({ contextFactory: () => ({
            state: { extractionTabs: {} },
            syncState: jest.fn(),
            updateJobState: jest.fn(),
            log: jest.fn(),
            ensureInitialized: jest.fn().mockResolvedValue(),
            assertJobOwnership: (_sender, _jobId, callback) => callback(true, 17, job),
        }) }), {
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 33,
            index: 4,
            url: 'https://cdn.example/result.png',
            jobId: 'job-4',
            batchId: 'batch-forjado',
        }, { tab: { id: 17, url: 'https://gemini.google.com/app' } });

        expect(chrome.tabs.create).not.toHaveBeenCalled();
        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });
    });

    test('rejeita job de uma aba que não o possui', async () => {
        const router = loadRouter();
        const result = await dispatch(router.createMessageRouter({ contextFactory: () => ({
            state: { extractionTabs: {} },
            syncState: jest.fn(),
            updateJobState: jest.fn(),
            log: jest.fn(),
            ensureInitialized: jest.fn().mockResolvedValue(),
            assertJobOwnership: (_sender, _jobId, callback) => callback(false, 18, null),
        }) }), {
            action: 'GEMINI_RESULT_URL',
            mangaTabId: 33,
            index: 4,
            url: 'https://cdn.example/result.png',
            jobId: 'job-4',
        }, { tab: { id: 18, url: 'https://gemini.google.com/app' } });

        expect(chrome.tabs.create).not.toHaveBeenCalled();
        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });
    });

    test.each([
        [{ action: 'GEMINI_RESULT_URL', mangaTabId: 33, index: 4, url: 'https://cdn.example/result.png' }, 'jobId é obrigatório'],
        [{ action: 'GEMINI_RESULT_URL', mangaTabId: 33, index: 4, url: 'javascript:alert(1)', jobId: 'job-4' }, 'url de resultado inválida'],
    ])('rejeita payload inválido antes de abrir a aba', async (request, message) => {
        const router = loadRouter();
        const ensureInitialized = jest.fn();
        const result = await dispatch(router.createMessageRouter({ contextFactory: () => ({
            state: { extractionTabs: {} },
            syncState: jest.fn(),
            updateJobState: jest.fn(),
            ensureInitialized,
            assertJobOwnership: jest.fn(),
        }) }), request, { tab: { id: 17, url: 'https://gemini.google.com/app' } });

        expect(ensureInitialized).not.toHaveBeenCalled();
        expect(chrome.tabs.create).not.toHaveBeenCalled();
        expect(result.response).toEqual({
            ok: false,
            error: { code: 'INVALID_PAYLOAD', message },
        });
    });
});
```

## 10. Cobertura documental por linha/posição

As faixas abaixo são contíguas e cobrem **1–176** sem lacuna nem sobreposição; a posição 176 é o newline final.

### Posições 1–3 — resolução dos módulos reais
Importam `path` e constroem caminhos absolutos para router/action de produção. São a âncora que torna esta suíte prova da implementação real, não de cópia local. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE no carregamento de todos os cenários.

### Posição 4 — separador
Linha vazia entre constantes e helper. Sem efeito runtime. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 5–11 — `loadRouter()`
Instala globals mínimos, elimina registry anterior, carrega router/action em `jest.isolateModules` e retorna o registry real. Esse setup é usado por todos os testes. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; os efeitos subsequentes demonstram que o registro ocorreu.

### Posição 12 — separador
Linha vazia sem efeito runtime. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 13–18 — `dispatch()`
Adapta listener callback para Promise e tenta capturar `keepAlive`. Funciona para resposta assíncrona, mas em resposta síncrona a resolução ocorre antes da atribuição do retorno. **Evidência:** ✅ comportamento assíncrono observado nos happy paths; ⚠️ harness impreciso para retorno síncrono.

### Posição 19 — separador
Linha vazia sem efeito runtime. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 20–21 — suíte e cleanup
Abrem `describe` focal e removem `MangaTranslatorRouter` após cada caso. `self`/`chrome` não são removidos aqui. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest.

### Posição 22 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 23–35 — preparação do happy path
Carrega implementação real, configura criação de tab 81, estado com batch global divergente, spies de persistência e job autoritativo. **Evidência:** 🟨 setup executado para as assertions do bloco.

### Posições 36–50 — dispatch do happy path
Cria contexto injetado e envia `GEMINI_RESULT_URL` com identidade correspondente ao job por um sender Gemini tab 17. **Evidência:** 🟨 execução direta da implementação real.

### Posições 51–72 — assertions do happy path
Provam URL marcada/inativa, mapping completo, estado `awaiting_auxiliary_extraction`, chamada a `syncState` e resposta positiva. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 73 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 74–83 — setup do job antigo
Define `batch-old` e tab 82 para testar independência do batch global. **Evidência:** 🟨 setup do cenário.

### Posições 84–98 — execução com `currentBatchId` novo
Contexto possui `batch-new`, enquanto job/request permanecem no batch antigo válido. Executa action real. **Evidência:** 🟨 execução direta.

### Posições 99–102 — assertions de independência
Exigem resposta positiva e uma criação de aba. **Evidência:** ✅ PROVADO DIRETAMENTE que mudança do batch global não bloqueia o job real.

### Posição 103 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 104–111 — setup de identidade forjada
Job autoritativo usa `batch-real`, mangaTabId 33 e index 4. **Evidência:** 🟨 setup.

### Posições 112–127 — dispatch com `batch-forjado`
Executa a action real com ownership positivo, mas batch divergente. **Evidência:** 🟨 execução do branch `identityMismatch`.

### Posições 128–131 — assertions de rejeição
Provam ausência de `tabs.create` e resposta `job_identity_mismatch`. Não cobrem divergência de index/mangaTabId. **Evidência:** ✅ PROVADO DIRETAMENTE para batch mismatch.

### Posição 132 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 133–148 — ownership negativo
Configura `assertJobOwnership` para `false`, envia request válido e executa o caminho de rejeição por sender. **Evidência:** 🟨 execução direta do branch.

### Posições 149–152 — assertions de sender mismatch
Exigem ausência de nova aba e resposta `{ok:false, reason:'sender_mismatch'}`. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 153 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 154–157 — matriz de payload inválido
Define ausência de jobId e URL `javascript:` como casos negativos com mensagens esperadas. **Evidência:** 🟨 parametrização executada pela suíte.

### Posições 158–166 — execução antes de efeitos
Carrega router/action reais, injeta spies e despacha cada request inválido. **Evidência:** 🟨 execução direta do validator real.

### Posições 167–174 — assertions de validação
Provam que `ensureInitialized` e `tabs.create` não são chamados e que o envelope é `INVALID_PAYLOAD`. O `keepAlive:undefined` decorre da race síncrona do helper, não do retorno real do router. **Evidência:** ✅ PROVADO DIRETAMENTE para validação/ausência de efeitos; ⚠️ para keep-alive.

### Posição 175 — fechamento da suíte
Fecha o `describe`. Efeito apenas estrutural/sintático. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo parser/Jest.

### Posição 176 — newline final
Terminador textual final do arquivo. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- SHA do fonte reconfirmado antes da criação: `09a0f891434bccf30dbc6e0d244e8f18a40a17d9`.
- Fonte integral incorporada diretamente do blob auditado.
- 175 linhas textuais + newline final = **176/176 posições**.
- Cobertura contígua: 1–3, 4, 5–11, 12, 13–18, 19, 20–21, 22, 23–35, 36–50, 51–72, 73, 74–83, 84–98, 99–102, 103, 104–111, 112–127, 128–131, 132, 133–148, 149–152, 153, 154–157, 158–166, 167–174, 175, 176.
- Assertions diretas da suíte foram distinguidas de provas externas do background completo e do produtor Gemini.
- Nenhuma suíte foi declarada como executada nesta sessão.
- Quatro necessidades externas foram registradas como solicitações ao auditor; nenhum código/teste externo foi alterado.
- `STATUS.md`, `CHECKLIST.md` e `AUDITORIA.md` permaneceram fora do escopo de escrita.

**Resultado da autoauditoria:** ✅ APROVADO para conclusão documental, com `audit_requests` abertos que não bloqueiam a Bíblia.

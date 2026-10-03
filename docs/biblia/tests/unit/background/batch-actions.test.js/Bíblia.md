# Bíblia técnica — tests/unit/background/batch-actions.test.js

> **Estado documental:** ✅ CONCLUÍDO — autoauditoria técnica aprovada pelo AGENTE 13  
> **Arquivo auditado:** `tests/unit/background/batch-actions.test.js`  
> **SHA auditado:** `113344a0e8dbb334fbd14eeb9e241b165a95cdfb`  
> **Agente:** AGENTE 13  
> **PR:** #66  
> **Branch:** `docs/project-bible`  
> **Linhas textuais:** **58**  
> **Posições documentais:** **59**, contando o newline final  
> **Natureza:** teste unitário Jest da camada de roteamento/ações de batch do background

## 1. Identidade e finalidade

Este arquivo verifica o contrato de duas ações de background — `START_BATCH` e `STOP_BATCH` — através do **router real** e das **implementações reais dos wrappers de ação**:

- `extension/background/router.js`;
- `extension/background/actions/start-batch.js`;
- `extension/background/actions/stop-batch.js`.

O teste **não executa o lifecycle completo de batch**. Em ambos os casos, a dependência de domínio final é injetada por `contextFactory` como `jest.fn()`:

- `startBatch` é mockado;
- `stopBatch` é mockado.

Portanto, este arquivo prova diretamente o contrato entre:

`mensagem → resolução pelo router → validação da action → delegação ao contexto → envelope sendResponse`

mas não prova persistência, criação/remoção de tabs, filas, watchdogs ou storage do lifecycle real. Esses efeitos aparecem em suíte separada, especialmente `tests/unit/background/batch-lifecycle-real.test.js`.

## 2. Dependências lidas e validadas

### 2.1 Router real

Arquivo: `extension/background/router.js`  
SHA observado: `d9278e9e58e4e9583a30c16227bfd833e7203d89`

Pontos relevantes observados:

- `ACTION_MAP` traduz `START_BATCH` para `start-batch`;
- `ACTION_MAP` traduz `STOP_BATCH` para `stop-batch`;
- `createMessageRouter` resolve a action;
- executa `validate(request)` antes da action;
- em erro de validação chama `sendResponse({ ok: false, error })`;
- para ações assíncronas aguarda `actionDef.execute`;
- responde `{ ok: true, ...result }`;
- retorna `true` no caminho assíncrono.

### 2.2 Action real `start-batch`

Arquivo: `extension/background/actions/start-batch.js`  
SHA observado: `b0ef70bf1c23f97c3fd8c9a1c82483f712b96dc3`

Contrato observado:

- exige `request.images` como array;
- rejeita imagem ausente/falsy;
- exige `Number.isInteger(image.index)`;
- retorna `INVALID_PAYLOAD` para índices inválidos;
- delega por `context.startBatch(request, context.sender)`.

### 2.3 Action real `stop-batch`

Arquivo: `extension/background/actions/stop-batch.js`  
SHA observado: `e552d0a911092c5cd7e457fbe262d366c413f0c1`

Contrato observado:

- `batchId` é opcional;
- quando fornecido, deve ser string;
- número é rejeitado com `INVALID_PAYLOAD`;
- delega o request inteiro por `context.stopBatch(request)`.

### 2.4 Descoberta pelo Jest

Arquivo: `jest.config.js`  
SHA observado: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`

O projeto Jest `background` possui:

`testMatch: ['<rootDir>/tests/unit/background/**/*.test.js']`

Logo este arquivo pertence nominalmente ao projeto Jest `background`.

### 2.5 Scripts npm

Arquivo: `package.json`  
SHA observado: `33e0b91d1a6f1790124b700d2ce331f80d2b7095`

Caminhos relevantes:

- `test:unit` seleciona o projeto `background`;
- `test:unit:background` executa explicitamente o projeto `background`;
- `test:ci` chama `scripts/ci/run-jest-ci.js`;
- `test:coverage` usa o mesmo runner com coverage.

### 2.6 Wiring de CI

Arquivo: `.github/workflows/ci.yml`  
SHA observado: `ebee75820db9bfab618bf3c3016065c5bc857ed7`

O job `unit-and-integration` executa `npm run test:ci`; outros fluxos também chamam `npm run test:unit`.

No momento desta auditoria, runs do PR estavam sendo cancelados/reenfileirados por commits concorrentes no branch. Por isso esta Bíblia **não afirma um run verde atual específico** para o SHA documental criado por este agente.

## 3. Papel arquitetural do teste

O arquivo é um teste de **fronteira de roteamento**, não um teste de lifecycle completo.

Ele verifica quatro propriedades centrais:

1. `START_BATCH` válido produz resposta assíncrona positiva;
2. o wrapper de `START_BATCH` delega ao `startBatch` injetado com sender;
3. `START_BATCH` com `index` string é rejeitado;
4. `STOP_BATCH` válido delega o request exato e número em `batchId` é rejeitado.

Essa separação é importante porque o router e as actions são módulos reais, enquanto as funções finais de domínio são doubles.

## 4. Setup e isolamento

### `loadRouter()`

A função:

- define `global.self = global`;
- substitui `global.chrome` por um objeto mínimo com `runtime.id`;
- remove `global.MangaTranslatorRouter`;
- usa `jest.isolateModules`;
- exige o router real;
- exige as duas actions reais;
- devolve `global.MangaTranslatorRouter`.

Consequência: cada chamada reexecuta a inicialização desses módulos em registry isolado.

Limite: o cleanup explícito da suíte remove apenas `global.MangaTranslatorRouter`; `global.self` e `global.chrome` não são restaurados neste arquivo. Como ambos os testes chamam `loadRouter()` novamente e Jest isola ambientes por arquivo, não foi observado aqui um bug funcional comprovado, mas é uma dependência de isolamento do runner.

## 5. Helper `dispatch()`

O helper converte o callback `sendResponse` em Promise.

No caminho assíncrono:

1. `listener(...)` retorna `true`;
2. `keepAlive` recebe `true`;
3. posteriormente `sendResponse` resolve a Promise;
4. o objeto resolvido contém `keepAlive: true`.

No caminho síncrono de payload inválido há uma sutileza:

- o router chama `sendResponse` **antes** de retornar `false`;
- o callback de `dispatch` monta `{ keepAlive, response }` enquanto `keepAlive` ainda não recebeu o retorno do listener;
- portanto esse helper não é adequado para provar diretamente o valor de retorno síncrono `false`.

Os testes de erro verificam apenas `invalid.response`, então não fazem alegação incorreta sobre `keepAlive`; porém o contrato de retorno síncrono fica sem prova focal neste arquivo.

## 6. Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| arquivo pertence ao projeto Jest background | `jest.config.js` inclui `tests/unit/background/**/*.test.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| módulos router/start/stop reais são requeridos | `loadRouter()` executado em ambos os testes | 🟨 EXECUTADO INDIRETAMENTE |
| `START_BATCH` válido responde `ok: true` e `batchId` | assertion exata da linha 38 usando router/action reais | ✅ PROVADO DIRETAMENTE |
| `START_BATCH` mantém conexão assíncrona | linha 38 exige `keepAlive: true` | ✅ PROVADO DIRETAMENTE |
| wrapper chama `startBatch` com `images` e `sender` | linha 39 | ✅ PROVADO DIRETAMENTE |
| wrapper preserva explicitamente `prompt`, `mangaTabId` e `action` | assertion usa `objectContaining` apenas para `images` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `START_BATCH` rejeita `index: '2'` | linhas 41-42 | ✅ PROVADO DIRETAMENTE |
| `START_BATCH` rejeita `images` ausente/não-array | implementation real possui branch, mas este teste não o visita | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `START_BATCH` rejeita item null/missing index | implementation real possui branch, mas este teste não o visita | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `STOP_BATCH` válido responde `ok: true` | linha 52 | ✅ PROVADO DIRETAMENTE |
| `STOP_BATCH` delega request exato | linha 53 | ✅ PROVADO DIRETAMENTE |
| `STOP_BATCH` rejeita `batchId` numérico | linhas 55-56 | ✅ PROVADO DIRETAMENTE |
| `STOP_BATCH` aceita ausência de `batchId` | branch real permite, mas este arquivo não possui caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| retorno síncrono `false` do router em payload inválido | helper não captura corretamente esse retorno durante callback síncrono | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| efeitos reais do lifecycle de START/STOP | funções finais são `jest.fn()` neste arquivo | 🟨 EXECUTADO INDIRETAMENTE em suíte separada, não provado por este teste |
| ausência de `.skip/.only/test.todo` | arquivo atual não contém esses padrões; policy global existe | 🟦 GATE ESTÁTICO ESPECÍFICO |

## 7. Relação com `batch-lifecycle-real.test.js`

A suíte `tests/unit/background/batch-lifecycle-real.test.js`, SHA observado `1368df4b1fdb85d8ad1f593f78decd16a3175c98`, cobre efeitos que este teste propositalmente não cobre.

Exemplos observados:

- `START_BATCH` cria lote e atualiza `mt_state`;
- cria/persiste `gemini_job`;
- cria tab Gemini;
- `STOP_BATCH` remove tabs/jobs/watchdogs;
- STOP seletivo preserva lote atual ao parar lote antigo.

Essas assertions não devem ser atribuídas a `batch-actions.test.js`. Elas apenas mostram que existe uma camada complementar de prova para o lifecycle real.

## 8. Lacunas e riscos

### 8.1 Helper não prova retorno síncrono de erro

O desenho atual de `dispatch` resolve o objeto de resultado dentro de `sendResponse`. Para branches que chamam `sendResponse` sincronamente, `keepAlive` ainda está indefinido no instante da resolução.

Impacto:

- o teste prova a resposta `INVALID_PAYLOAD`;
- não prova que o router retorna `false` no branch de validação;
- uma regressão no retorno síncrono poderia permanecer invisível para estes casos.

### 8.2 START_BATCH usa assertion parcial na delegação

A linha 39 exige apenas:

- `images: [{ index: 2 }]`;
- o `sender`.

Ela não exige explicitamente que o objeto repassado contenha `prompt: 'Traduzir'`, `mangaTabId: 17` e `action: 'START_BATCH'`.

Como a implementação atual repassa o request inteiro, o comportamento existe; porém a assertion não o congela como contrato.

### 8.3 Casos negativos incompletos

Para `START_BATCH`, não há cenários focais neste arquivo para:

- `images` ausente;
- `images` não-array;
- item `null`;
- item sem `index`;
- índice `NaN`/float.

Para `STOP_BATCH`, não há caso focal que prove explicitamente a aceitação de `batchId` ausente.

### 8.4 Título do START_BATCH pode induzir interpretação ampla

O nome do teste diz “delega para lifecycle reidratado”, mas o objeto `startBatch` é `jest.fn()`, não o lifecycle real.

A interpretação correta é:

- o router/action wrapper delega para a dependência contextual com contrato esperado;
- o lifecycle real é provado em outra suíte.

## 9. Solicitações ao auditor registradas no state

### 131-001 — TEST_QUALITY — NORMAL

Rever o helper `dispatch` ou adicionar teste separado capaz de observar corretamente o retorno síncrono do listener quando `sendResponse` é chamado antes do retorno.

Evidência desejada:

- payload inválido;
- assertion da resposta `INVALID_PAYLOAD`;
- assertion direta de que o listener retorna `false`.

### 131-002 — TEST_REQUIRED — NORMAL

Fortalecer a prova de delegação de `START_BATCH`.

Evidência desejada:

- `startBatch` chamado uma vez;
- primeiro argumento exatamente compatível com o request esperado, incluindo `action`, `images`, `prompt` e `mangaTabId`;
- segundo argumento igual ao sender.

### 131-003 — TEST_REQUIRED — LOW

Adicionar casos negativos/limítrofes independentes para branches de validação ainda não cobertos neste arquivo.

Prioridades:

- `images` ausente/não-array;
- item null/sem index;
- `batchId` ausente aceito em STOP_BATCH.

## 10. Invariantes documentados

1. O teste deve continuar carregando o router real.
2. O teste deve continuar carregando as actions reais de START/STOP.
3. `START_BATCH` válido deve retornar `ok: true` e propagar `batchId`.
4. A action `start-batch` deve encaminhar `sender`.
5. Índice não inteiro deve ser rejeitado.
6. `STOP_BATCH` válido deve delegar o request correspondente.
7. `batchId` fornecido como número deve ser rejeitado.
8. Nenhum resultado deste arquivo deve ser usado como prova dos efeitos internos do lifecycle mockado.
9. A classificação de evidência deve separar assertion direta, wiring estático e execução indireta.
10. Esta Bíblia vale para o SHA `113344a0e8dbb334fbd14eeb9e241b165a95cdfb`.

## 11. Fonte integral auditada

~~~javascript
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const START_ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/start-batch.js');
const STOP_ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/stop-batch.js');

function loadRouter() {
    global.self = global;
    global.chrome = { runtime: { id: 'test-extension-id' } };
    delete global.MangaTranslatorRouter;
    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(START_ACTION_PATH);
        require(STOP_ACTION_PATH);
    });
    return global.MangaTranslatorRouter;
}

function dispatch(listener, request, sender) {
    return new Promise(resolve => {
        let keepAlive;
        keepAlive = listener(request, sender, response => resolve({ keepAlive, response }));
    });
}

describe('background/actions batch', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('START_BATCH delega para lifecycle reidratado e valida índices', async () => {
        const router = loadRouter();
        const startBatch = jest.fn().mockResolvedValue({ batchId: 'batch-1' });
        const listener = router.createMessageRouter({ contextFactory: () => ({ startBatch }) });
        const sender = { tab: { id: 17, url: 'https://reader.test/chapter' } };

        const success = await dispatch(listener, {
            action: 'START_BATCH', images: [{ index: 2 }], prompt: 'Traduzir', mangaTabId: 17,
        }, sender);
        expect(success).toEqual({ keepAlive: true, response: { ok: true, batchId: 'batch-1' } });
        expect(startBatch).toHaveBeenCalledWith(expect.objectContaining({ images: [{ index: 2 }] }), sender);

        const invalid = await dispatch(listener, { action: 'START_BATCH', images: [{ index: '2' }] }, sender);
        expect(invalid.response).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_PAYLOAD' }) });
    });

    test('STOP_BATCH delega o batch alvo sem aceitar identificador inválido', async () => {
        const router = loadRouter();
        const stopBatch = jest.fn().mockResolvedValue({});
        const listener = router.createMessageRouter({ contextFactory: () => ({ stopBatch }) });
        const sender = { tab: { id: 17, url: 'https://reader.test/chapter' } };

        const success = await dispatch(listener, { action: 'STOP_BATCH', batchId: 'batch-a' }, sender);
        expect(success).toEqual({ keepAlive: true, response: { ok: true } });
        expect(stopBatch).toHaveBeenCalledWith({ action: 'STOP_BATCH', batchId: 'batch-a' });

        const invalid = await dispatch(listener, { action: 'STOP_BATCH', batchId: 4 }, sender);
        expect(invalid.response).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_PAYLOAD' }) });
    });
});
~~~

## 12. Cobertura documental por posição

A fonte possui 58 linhas textuais e newline terminal; portanto há 59 posições documentais. As faixas abaixo são contíguas, sem lacunas e sem overlap.

### Posições 1–5 — import e caminhos absolutos dos módulos reais

**Fonte:**

~~~text
1: const path = require('path');
2: [vazia]
3: const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
4: const START_ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/start-batch.js');
5: const STOP_ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/stop-batch.js');
~~~

**O que faz:** importa `path` e calcula caminhos absolutos para router e actions reais.

**Como faz:** usa `path.resolve(__dirname, ...)`, evitando depender do cwd do processo.

**Por que importa:** reduz risco de um runner executar Jest a partir de cwd diferente e carregar caminho incorreto.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelos dois testes; não há assertion isolada dos paths.

### Posição 6 — separador visual

Linha vazia sem efeito de runtime.

### Posições 7–17 — `loadRouter()`

**Fonte:**

~~~text
7: function loadRouter() {
8:     global.self = global;
9:     global.chrome = { runtime: { id: 'test-extension-id' } };
10:     delete global.MangaTranslatorRouter;
11:     jest.isolateModules(() => {
12:         require(ROUTER_PATH);
13:         require(START_ACTION_PATH);
14:         require(STOP_ACTION_PATH);
15:     });
16:     return global.MangaTranslatorRouter;
17: }
~~~

**O que faz:** prepara globals mínimos e carrega fresh router/actions reais.

**Como faz:** remove export global anterior e usa `jest.isolateModules` para executar requires em registry isolado.

**Contrato:** as actions registram-se no router carregado nesta chamada.

**Limite:** não restaura `global.self`/`global.chrome`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; os testes seguintes só funcionam se o registro real das actions ocorrer.

### Posição 18 — separador visual

Linha vazia.

### Posições 19–24 — helper `dispatch()`

**Fonte:**

~~~text
19: function dispatch(listener, request, sender) {
20:     return new Promise(resolve => {
21:         let keepAlive;
22:         keepAlive = listener(request, sender, response => resolve({ keepAlive, response }));
23:     });
24: }
~~~

**O que faz:** adapta callback para Promise e tenta capturar retorno do listener.

**Como faz:** atribui a `keepAlive` o valor retornado por `listener`; callback resolve a Promise.

**Caso assíncrono:** captura corretamente `true`.

**Caso síncrono:** callback pode executar antes da atribuição e observar `undefined`.

**Evidência:** ✅ DIRETA para `keepAlive: true` em respostas assíncronas; ⚠️ sem prova focal do retorno síncrono.

### Posição 25 — separador visual

Linha vazia.

### Posições 26–28 — suíte e cleanup

**Fonte:**

~~~text
26: describe('background/actions batch', () => {
27:     afterEach(() => delete global.MangaTranslatorRouter);
28: [vazia]
~~~

**O que faz:** agrupa os dois casos e remove o router global após cada teste.

**Como faz:** Jest executa `afterEach`.

**Limite:** cleanup não restaura todos os globals modificados por `loadRouter`.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle do Jest.

### Posições 29–33 — setup do caso START_BATCH

**Fonte:**

~~~text
29:     test('START_BATCH delega para lifecycle reidratado e valida índices', async () => {
30:         const router = loadRouter();
31:         const startBatch = jest.fn().mockResolvedValue({ batchId: 'batch-1' });
32:         const listener = router.createMessageRouter({ contextFactory: () => ({ startBatch }) });
33:         const sender = { tab: { id: 17, url: 'https://reader.test/chapter' } };
~~~

**O que faz:** cria router real, dependência mockada e sender determinístico.

**Como faz:** `contextFactory` injeta somente `startBatch` sobre o contexto normal do router.

**Importante:** “lifecycle reidratado” não significa lifecycle real aqui; `startBatch` é mock.

**Evidência:** 🟨 setup executado; assertions aparecem nos blocos seguintes.

### Posição 34 — separador visual

Linha vazia.

### Posições 35–39 — START_BATCH válido

**Fonte:**

~~~text
35:         const success = await dispatch(listener, {
36:             action: 'START_BATCH', images: [{ index: 2 }], prompt: 'Traduzir', mangaTabId: 17,
37:         }, sender);
38:         expect(success).toEqual({ keepAlive: true, response: { ok: true, batchId: 'batch-1' } });
39:         expect(startBatch).toHaveBeenCalledWith(expect.objectContaining({ images: [{ index: 2 }] }), sender);
~~~

**O que faz:** envia request válido com action legada em SCREAMING_CASE.

**Prova 1:** linha 38 exige conexão assíncrona e envelope de resposta exato.

**Prova 2:** linha 39 exige que a dependência receba objeto contendo `images` esperado e sender exato.

**Limite:** `objectContaining` não fixa os demais campos do request.

**Evidência:** ✅ PROVADO DIRETAMENTE para as propriedades assertadas.

### Posição 40 — separador visual

Linha vazia.

### Posições 41–43 — START_BATCH inválido

**Fonte:**

~~~text
41:         const invalid = await dispatch(listener, { action: 'START_BATCH', images: [{ index: '2' }] }, sender);
42:         expect(invalid.response).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_PAYLOAD' }) });
43:     });
~~~

**O que faz:** envia índice string.

**Como falha:** `Number.isInteger('2')` é falso na action real.

**Assertion:** exige resposta `ok: false` e `INVALID_PAYLOAD`.

**Limite:** não verifica mensagem exata nem retorno síncrono do listener.

**Evidência:** ✅ PROVADO DIRETAMENTE para code/envelope parcial.

### Posição 44 — separador visual

Linha vazia.

### Posições 45–49 — setup do caso STOP_BATCH

**Fonte:**

~~~text
45:     test('STOP_BATCH delega o batch alvo sem aceitar identificador inválido', async () => {
46:         const router = loadRouter();
47:         const stopBatch = jest.fn().mockResolvedValue({});
48:         const listener = router.createMessageRouter({ contextFactory: () => ({ stopBatch }) });
49:         const sender = { tab: { id: 17, url: 'https://reader.test/chapter' } };
~~~

**O que faz:** repete isolamento com dependência `stopBatch` mockada.

**Evidência:** 🟨 setup executado; a prova direta está nas assertions seguintes.

### Posição 50 — separador visual

Linha vazia.

### Posições 51–53 — STOP_BATCH válido

**Fonte:**

~~~text
51:         const success = await dispatch(listener, { action: 'STOP_BATCH', batchId: 'batch-a' }, sender);
52:         expect(success).toEqual({ keepAlive: true, response: { ok: true } });
53:         expect(stopBatch).toHaveBeenCalledWith({ action: 'STOP_BATCH', batchId: 'batch-a' });
~~~

**O que faz:** envia batchId string.

**Assertion da resposta:** prova envelope `ok: true` e retorno assíncrono `true`.

**Assertion da delegação:** prova argumento exato do mock.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 54 — separador visual

Linha vazia.

### Posições 55–57 — STOP_BATCH inválido

**Fonte:**

~~~text
55:         const invalid = await dispatch(listener, { action: 'STOP_BATCH', batchId: 4 }, sender);
56:         expect(invalid.response).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_PAYLOAD' }) });
57:     });
~~~

**O que faz:** envia batchId numérico.

**Como falha:** action real exige string quando `batchId !== undefined`.

**Assertion:** exige `ok: false` e code `INVALID_PAYLOAD`.

**Limite:** não verifica mensagem exata nem retorno `false`.

**Evidência:** ✅ PROVADO DIRETAMENTE para a rejeição observada.

### Posições 58–59 — fechamento da suíte e newline final

**Fonte:**

~~~text
58: });
59: [newline final]
~~~

**O que faz:** encerra o `describe`; posição 59 representa o newline terminal preservado no blob.

**Evidência:** 🟦 GATE ESTRUTURAL/documental; sem comportamento independente.

## 13. Autoauditoria documental

Checklist executado pelo AGENTE 13:

- SHA da fonte relido após aquisição da reserva: **confere**;
- reserva relida: **AGENTE 13**;
- state relido: **IN_PROGRESS / AGENTE 13**;
- fonte integral incorporada: **sim**;
- 58 linhas textuais + newline final: **59/59 posições documentadas**;
- faixas de cobertura: **contíguas, sem lacunas**;
- implementações reais relacionadas lidas: **router/start/stop**;
- configuração Jest lida: **sim**;
- package scripts lidos: **sim**;
- wiring de CI lido: **sim**;
- suíte complementar de lifecycle real lida: **sim**;
- assertions parciais não promovidas a prova mais forte: **sim**;
- lifecycle mockado não apresentado como lifecycle real: **sim**;
- lacunas estruturais registradas em `audit_requests`: **sim**;
- nenhum código/teste/config/workflow externo modificado: **sim**.

**Veredito da autoauditoria:** ✅ APROVADO para conclusão documental deste arquivo, preservando as solicitações OPEN no state.

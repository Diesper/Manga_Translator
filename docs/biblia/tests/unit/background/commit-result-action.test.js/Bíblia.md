# Bíblia técnica — tests/unit/background/commit-result-action.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DOCUMENTAL APROVADA  
> **SHA auditado:** `1a185784edd118aeee377d7e3f1ed4a9c8375914`  
> **Agente responsável:** AGENTE 10  
> **Tipo:** teste unitário da action real `background/actions/commit-result.js` através do router real  
> **Linhas textuais:** **230**  
> **Posições documentais:** **231**, contando o newline final  
> **Tamanho textual observado:** **7871 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte verifica o ponto de commit explícito do protocolo de resultado Gemini.

A cadeia testada é real nas duas camadas principais:

`request GEMINI_RESULT_COMMIT → router.js real → commit-result.js real → dependências injetadas/spies`.

Ao contrário de testes mirror, a suite carrega os arquivos de produção `router.js` e `actions/commit-result.js` em `jest.isolateModules`.

Ela não carrega todo `background.js`; operações externas são substituídas por funções controladas no `contextFactory`:

- `ensureInitialized`;
- `assertJobOwnership`;
- `updateJobState`;
- `finalizeJob`;
- `log`;
- em um caso, `storage.get`.

Esse desenho isola a política da action sem reimplementar a action.

## 2. Contrato da action real

No SHA auditado, `commit-result.js`:

1. valida `jobId` string não vazia;
2. espera `ensureInitialized()`;
3. obtém `senderTabId`;
4. converte callback de `assertJobOwnership` em Promise;
5. se não houver ownership/job:
   - tenta reconhecer retry por journal `gemini_finalized_<tab>`;
   - aceita somente marker:
     - não expirado;
     - mesmo jobId;
     - `fromError === false`;
   - se não aceitar, retorna `job_not_live`;
6. se houver job e request.batchId conflitar com job.batchId, retorna `job_identity_mismatch`;
7. exige `job.resultPersisted === true` **OU** `job.state === 'dom_applied'`;
8. atualiza o job para `result_committed`;
9. loga `RESULT_COMMIT_ACCEPTED`;
10. chama `finalizeJob(geminiTabId, mangaTabId, false)`;
11. retorna `{ committed: true }`;
12. router acrescenta `ok: true` à resposta de sucesso.

## 3. Loader e isolamento

`loadRouter()`:

- aponta `self` para global;
- cria apenas `chrome.runtime.id`;
- remove `MangaTranslatorRouter` anterior;
- carrega router primeiro;
- carrega action depois, permitindo que `registerAction` exista;
- devolve o registry real.

O cleanup remove o registry após cada teste.

Isso prova a action registrada, não uma cópia.

## 4. dispatch e keepAlive

O helper de teste captura o valor retornado pelo listener e a resposta callback.

Como actions assíncronas do router entram no branch async, o listener retorna `true`, mantendo o canal Chrome aberto enquanto a Promise interna roda.

A suíte usa principalmente `result.response`; ela **não possui assertion focal sobre `keepAlive === true`**.

Isso não invalida as assertions de política da action, mas deixa o contrato do canal IPC sem prova específica nesta suíte.

## 5. Caso positivo: commit normal

Fixture:

- ownership: true;
- gemini tab canônica fornecida pelo ownership: 321;
- jobId: job-1;
- batchId: batch-1;
- mangaTabId: 77;
- state: dom_applied;
- resultPersisted: true.

Assertions:

- `updateJobState(321, { state: 'result_committed', ... })`;
- `finalizeJob(321, 77, false)`;
- response `{ ok: true, committed: true }`.

### O que este caso prova diretamente

- action real é registrada e resolvida por GEMINI_RESULT_COMMIT;
- ownership tab id 321 é usado;
- transição para result_committed ocorre antes da finalização no fluxo;
- mangaTabId do job chega a finalize;
- `fromError=false`;
- router envelopa retorno com `ok:true`.

### O que ele não isola

O job satisfaz **as duas** condições de prontidão ao mesmo tempo:

- `resultPersisted === true`;
- `state === 'dom_applied'`.

Como produção aceita se qualquer uma delas for suficiente, o caso positivo não prova cada braço isoladamente.

Essa lacuna é **136-001**.

## 6. Commits prematuros

A matriz negativa cobre:

1. `resultPersisted=false`, `state='result_received'`;
2. `resultPersisted=undefined`, `state='opening'`.

Para ambos:

- ownership é válido;
- response precisa ser `{ ok:false, reason:'result_not_persisted' }`;
- updateJobState não pode ser chamado;
- finalizeJob não pode ser chamado.

**Classificação:** ✅ PROVADO DIRETAMENTE.

Isso protege o requisito central: um job comum sem ACK de persistência não pode liberar o slot.

## 7. Proteção contra batch forjado

O teste mantém jobId correto e persistence true, mas envia `batch-forjado` para job persistido com `batch-real`.

A action real:

- detecta divergência;
- responde `job_identity_mismatch`;
- não finaliza.

**Classificação:** ✅ PROVADO DIRETAMENTE.

Limite: o teste não cobre ausência de `batchId` no request ou ausência de `job.batchId`; a implementação só compara quando ambos são truthy.

## 8. Ownership negativo

O caso retorna:

`callback(false, 999, null)`.

A suíte prova resposta final `job_not_live` e ausência de finalize.

Como o `contextFactory` não fornece storage nesse teste, o context base do router oferece um wrapper de storage que, ao ser chamado com o `global.chrome` mínimo da suite, não encontra `chrome.storage`. A lookup cai no catch interno da action e o fluxo continua para rejeição.

A suite não faz assertion específica em:

- `RESULT_COMMIT_JOURNAL_LOOKUP_FAILED`;
- `RESULT_COMMIT_REJECTED`.

Por isso a proteção “ownership ausente → rejeição” é direta, mas a telemetria/failure-mode do journal é apenas executada de forma indireta nesse cenário.

## 9. Validação do payload

O teste sem jobId não fornece `contextFactory`, porque `validate` roda antes da construção/execução do contexto.

Resposta exigida:

~~~text
ok: false
error.code: INVALID_PAYLOAD
error.message: jobId é obrigatório
~~~

**Classificação:** ✅ PROVADO DIRETAMENTE.

Não há caso para:

- jobId vazio;
- jobId whitespace;
- jobId número/objeto.

A implementação real rejeita esses valores, mas esta suíte cobre apenas ausência.

## 10. Retry idempotente por journal durável

Quando ownership retorna false, a action pode aceitar a repetição se houver marker válido.

O teste configura:

- tab 321;
- `gemini_finalized_321`;
- mesmo `jobId='job-1'`;
- `fromError=false`;
- `expiresAt = now + 60_000`.

Assertions:

- `ok:true`;
- `committed:true`;
- `alreadyCommitted:true`;
- finalizeJob **não** é chamado novamente;
- log `RESULT_COMMIT_ALREADY_FINALIZED`.

Isso prova a idempotência positiva do retry.

## 11. Matriz negativa do journal ausente

A action real só aceita marker se **quatro** componentes cooperarem:

- marker existe;
- não expirou;
- jobId coincide;
- fromError é estritamente false.

A suíte prova somente a combinação positiva completa.

Não há assertion focal para:

- marker ausente;
- marker expirado;
- marker com outro jobId;
- marker `fromError=true`;
- `storage.get` rejeitando com verificação do log `RESULT_COMMIT_JOURNAL_LOOKUP_FAILED`.

Isso é relevante porque essas condições são as fronteiras que impedem um retry sem ownership de ser reconhecido indevidamente.

Lacuna: **136-002**.

## 12. Seleção de IDs para finalização

Produção escolhe:

`ownership.tabId ?? senderTabId ?? job.geminiTabId`.

E escolhe manga tab:

`job.mangaTabId ?? request.mangaTabId`.

Os casos atuais usam `ownership.tabId=321` e, no sucesso, `job.mangaTabId=77`.

Logo, ficam sem prova específica:

- fallback para senderTabId;
- fallback para job.geminiTabId;
- fallback para request.mangaTabId.

Uma regressão nessa ordem pode encaminhar update/finalize para tab incorreta em casos de dados parciais.

Lacuna: **136-003**.

## 13. Relação com jobs-dom-ack

O módulo real `background/jobs-dom-ack.js` grava, em ACK positivo:

- `state: 'dom_applied'`;
- `resultPersisted: true`;
- timestamp de persistência.

Esse caminho normal explica por que o caso positivo possui as duas flags.

Entretanto, `commit-result.js` deliberadamente usa condição OR de compatibilidade:

`resultPersisted === true || state === 'dom_applied'`.

A documentação precisa refletir a condição real, não inferir que ambas são obrigatórias pelo fixture atual.

## 14. Segurança e integridade

Esta action é uma fronteira de integridade entre:

- resultado entregue ao DOM/storage;
- liberação/finalização do job;
- retry IPC potencialmente duplicado.

Proteções comprovadas:

- jobId obrigatório;
- ownership;
- batch mismatch;
- estado/persistência mínima;
- journal idempotente válido.

Proteções parcialmente comprovadas:

- rejeições do journal;
- matrix completa de prontidão;
- fallbacks de IDs.

Nenhum dado sensível é manipulado diretamente pelo teste; o risco principal é liberar um job errado ou cedo demais.

## 15. Classificação de evidência

| Comportamento | Classificação |
|---|---|
| router/action reais são carregados | ✅ PROVADO DIRETAMENTE |
| commit válido muda state para result_committed | ✅ PROVADO DIRETAMENTE |
| commit válido finaliza tab 321/manga 77 | ✅ PROVADO DIRETAMENTE |
| falta de persistência nos dois cenários negativos rejeita | ✅ PROVADO DIRETAMENTE |
| batch divergente rejeita | ✅ PROVADO DIRETAMENTE |
| ownership false rejeita | ✅ PROVADO DIRETAMENTE |
| jobId ausente gera INVALID_PAYLOAD | ✅ PROVADO DIRETAMENTE |
| marker válido torna retry idempotente | ✅ PROVADO DIRETAMENTE |
| marker expirado é rejeitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| marker de outro job é rejeitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| marker fromError=true é rejeitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| falha de journal é logada e rejeitada | 🟨 EXECUTADA INDIRETAMENTE em um cenário, sem assertion do log |
| dom_applied sozinho autoriza | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| resultPersisted=true sozinho autoriza | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallback de tab IDs | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| keepAlive do router | 🟨 EXECUTADO, sem assertion focal |

## 16. Solicitações ao auditor

### 136-001 — TEST_REQUIRED — OPEN

**Encontrado:** o caso positivo usa simultaneamente `resultPersisted=true` e `state='dom_applied'`, enquanto a implementação aceita qualquer um isoladamente.

**Evidência atual:** dois negativos em que ambos os critérios falham e um positivo em que ambos passam.

**Evidência ausente:** casos `resultPersisted=true/state!=dom_applied` e `resultPersisted=false/state=dom_applied`.

**Ação solicitada:** ampliar a suíte em alteração separada com matriz completa de prontidão.

**Regressão possível:** operador booleano ou compatibilidade de estados muda sem falhar esta suíte.

**Impacto:** finalização prematura ou rejeição indevida de commit válido.

**Severidade:** NORMAL.

### 136-002 — TEST_REQUIRED — OPEN

**Encontrado:** o journal idempotente possui apenas caso positivo.

**Evidência atual:** marker válido, futuro, mesmo job e fromError=false retorna alreadyCommitted.

**Evidência ausente:** expired, wrong jobId, fromError=true e storage.get rejeitado com log específico.

**Ação solicitada:** adicionar casos negativos focais usando a action real.

**Evidência esperada:** todos permanecem `job_not_live`, não finalizam e a falha de storage gera `RESULT_COMMIT_JOURNAL_LOOKUP_FAILED`.

**Regressão possível:** marker inválido pode autorizar retry sem ownership.

**Impacto:** integridade/idempotência do protocolo de commit.

**Severidade:** HIGH.

### 136-003 — TEST_REQUIRED — OPEN

**Encontrado:** a seleção `ownership.tabId ?? senderTabId ?? job.geminiTabId` e `job.mangaTabId ?? request.mangaTabId` só é testada pelos primeiros operandos presentes.

**Evidência atual:** sucesso usa ownership.tabId=321 e job.mangaTabId=77.

**Evidência ausente:** fallbacks quando esses campos estão ausentes.

**Ação solicitada:** adicionar casos de fallback e verificar argumentos exatos de updateJobState/finalizeJob.

**Regressão possível:** job correto pode ser atualizado/finalizado na aba errada em snapshots parciais.

**Impacto:** roteamento do lifecycle do job.

**Severidade:** NORMAL.

## 17. Fonte integral auditada

~~~javascript
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/commit-result.js');

function loadRouter() {
    global.self = global;
    global.chrome = { runtime: { id: 'test-extension-id' } };
    delete global.MangaTranslatorRouter;
    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(ACTION_PATH);
    });
    return global.MangaTranslatorRouter;
}

function dispatch(listener, request, sender) {
    return new Promise(resolve => {
        let keepAlive;
        keepAlive = listener(request, sender, response => resolve({ keepAlive, response }));
    });
}

describe('background/actions/commit-result.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('finaliza somente job com persistência já confirmada', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn().mockResolvedValue(true);
        const updateJobState = jest.fn().mockResolvedValue({});
        const job = {
            jobId: 'job-1',
            batchId: 'batch-1',
            mangaTabId: 77,
            index: 2,
            state: 'dom_applied',
            resultPersisted: true,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 321, job),
                    updateJobState,
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                mangaTabId: 77,
                index: 2,
                jobId: 'job-1',
                batchId: 'batch-1',
            },
            { tab: { id: 321, url: 'https://gemini.google.com/app/chat' } }
        );

        expect(updateJobState).toHaveBeenCalledWith(321, expect.objectContaining({
            state: 'result_committed',
        }));
        expect(finalizeJob).toHaveBeenCalledWith(321, 77, false);
        expect(result.response).toEqual({ ok: true, committed: true });
    });

    test.each([
        [{ resultPersisted: false, state: 'result_received' }, 'result_not_persisted'],
        [{ resultPersisted: undefined, state: 'opening' }, 'result_not_persisted'],
    ])('recusa commit prematuro %#', async (jobPatch, expectedReason) => {
        const router = loadRouter();
        const finalizeJob = jest.fn();
        const updateJobState = jest.fn();
        const job = {
            jobId: 'job-1',
            batchId: 'batch-1',
            mangaTabId: 77,
            index: 2,
            ...jobPatch,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 321, job),
                    updateJobState,
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                jobId: 'job-1',
                batchId: 'batch-1',
            },
            { tab: { id: 321 } }
        );

        expect(result.response).toEqual({ ok: false, reason: expectedReason });
        expect(updateJobState).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('recusa batch forjado mesmo com jobId correto', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();
        const job = {
            jobId: 'job-1',
            batchId: 'batch-real',
            mangaTabId: 77,
            resultPersisted: true,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 321, job),
                    updateJobState: jest.fn(),
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                jobId: 'job-1',
                batchId: 'batch-forjado',
            },
            { tab: { id: 321 } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('recusa commit de remetente que não possui o job', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(false, 999, null),
                    updateJobState: jest.fn(),
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                jobId: 'job-1',
                batchId: 'batch-1',
            },
            { tab: { id: 999 } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'job_not_live' });
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('validação exige jobId', async () => {
        const router = loadRouter();
        const result = await dispatch(
            router.createMessageRouter({}),
            { action: 'GEMINI_RESULT_COMMIT' },
            { tab: { id: 321 } }
        );

        expect(result.response).toEqual({
            ok: false,
            error: { code: 'INVALID_PAYLOAD', message: 'jobId é obrigatório' },
        });
    });

    test('retry após commit já finalizado é reconhecido pelo journal durável', async () => {
        const router = loadRouter();
        const now = Date.now();
        const log = jest.fn();
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(false, 321, null),
                    updateJobState: jest.fn(),
                    finalizeJob,
                    log,
                    storage: {
                        get: jest.fn().mockResolvedValue({
                            gemini_finalized_321: {
                                jobId: 'job-1',
                                fromError: false,
                                expiresAt: now + 60_000,
                            },
                        }),
                    },
                }),
            }),
            {
                action: 'GEMINI_RESULT_COMMIT',
                jobId: 'job-1',
                batchId: 'batch-1',
            },
            { tab: { id: 321 } }
        );

        expect(result.response).toEqual({
            ok: true,
            committed: true,
            alreadyCommitted: true,
        });
        expect(finalizeJob).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            'info',
            'bg',
            'RESULT_COMMIT_ALREADY_FINALIZED',
            expect.any(String),
            expect.any(Object)
        );
    });

});
~~~

## 18. Cobertura integral por posições

O blob possui **230 linhas textuais + newline final = 231 posições**. As faixas seguintes cobrem 1–231 sem lacunas.

### Linhas 1–5 — Paths para router e action reais

Resolve extension/background/router.js e actions/commit-result.js a partir da suíte.

**Evidência:** ✅ PROVADO DIRETAMENTE: esses paths são required pelo loader.

### Linhas 6–15 — loadRouter

Instala self/global e chrome.runtime.id mínimo, limpa registry anterior, usa jest.isolateModules e carrega router + action reais; retorna MangaTranslatorRouter.

**Evidência:** ✅ PROVADO DIRETAMENTE: todos os testes dependem do action registrado real.

### Linhas 16–23 — dispatch

Adapta callback sendResponse/boolean keepAlive para Promise de {keepAlive,response}.

**Evidência:** ✅ PROVADO DIRETAMENTE por todos os casos da suíte.

### Linhas 24–26 — Suite e cleanup

Agrupa action e remove MangaTranslatorRouter após cada teste.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 27–38 — Fixture de commit aceito

Cria job job-1/batch-1, mangaTabId 77, state dom_applied e resultPersisted=true, com spies para update/finalize.

**Evidência:** ✅ Fixture do caso positivo.

### Linhas 39–59 — Dispatch do commit aceito

Cria router com ensureInitialized, ownership positivo e spies; envia GEMINI_RESULT_COMMIT de sender Gemini tab 321.

**Evidência:** ✅ Executa router/action reais.

### Linhas 60–66 — Assertions do commit aceito

Prova update state para result_committed, finalizeJob(321,77,false) e resposta ok/committed.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### Linhas 67–81 — Matriz de commits prematuros

Cobre resultPersisted=false/state=result_received e resultPersisted undefined/state=opening.

**Evidência:** ✅ Fixture paramétrica dos negativos.

### Linhas 82–105 — Execução/assertions prematuras

Ownership permanece válido; ação real deve responder result_not_persisted e não atualizar/finalizar.

**Evidência:** ✅ PROVADO DIRETAMENTE para duas combinações negativas.

### Linhas 106–115 — Fixture batch forjado

Job possui batch-real e persistência true.

**Evidência:** ✅ Fixture.

### Linhas 116–138 — Batch mismatch

Envia batch-forjado e prova reason job_identity_mismatch e ausência de finalize.

**Evidência:** ✅ PROVADO DIRETAMENTE.

### Linhas 139–165 — Ownership negativo

assertJobOwnership retorna false/999/null; ação rejeita job_not_live e não finaliza.

**Evidência:** ✅ PROVADO DIRETAMENTE para ausência de ownership; journal inválido/erro não é explicitamente assertado neste caso.

### Linhas 166–179 — Validação sem jobId

Executa router real sem context customizado e exige INVALID_PAYLOAD com mensagem exata.

**Evidência:** ✅ PROVADO DIRETAMENTE para validate(jobId ausente).

### Linhas 180–205 — Fixture de retry idempotente

Ownership false, marker gemini_finalized_321 com jobId correto, fromError=false e expiresAt futuro; storage.get mockado.

**Evidência:** ✅ Fixture do único caso positivo de journal.

### Linhas 206–228 — Assertions do retry

Envia commit, exige alreadyCommitted=true, ausência de finalize e log RESULT_COMMIT_ALREADY_FINALIZED.

**Evidência:** ✅ PROVADO DIRETAMENTE para marker válido.

### Linhas 229–230 — Fechamento da suite

Linhas finais do describe.

**Evidência:** 🟨 Executado estruturalmente.

### Linha 231 — Newline final

LF terminal do blob.

**Evidência:** ⚠️ Sem comportamento runtime.

## 19. Autoauditoria documental

- owner confirmado: **AGENTE 10**;
- state confirmado: **IN_PROGRESS / AGENTE 10**;
- SHA reconfirmado: `1a185784edd118aeee377d7e3f1ed4a9c8375914`;
- source integral embutido diretamente do blob;
- **231/231 posições** documentadas;
- `router.js` real lido integralmente;
- `commit-result.js` real lido integralmente;
- buscas por journal/estado/batch foram feitas no branch/repositório;
- evidência de outras suites foi tratada separadamente, sem fabricar prova;
- três lacunas persistidas para auditoria;
- nenhum código/teste externo foi alterado.

**Conclusão documental:** esta é uma suíte forte porque executa action e router reais. Ela prova o caminho nominal, prematuridade básica, batch mismatch, ownership, validação e retry idempotente positivo; as matrizes negativas/fallbacks não cobertas permanecem explicitamente registradas.

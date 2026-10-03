# Bíblia técnica — tests/unit/background/deliver-result-from-tab-action.test.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE RESPONSÁVEL  
> **SHA auditado:** 263cb827e30468c377c5b1eb5863e90bd6cf26b0  
> **Agente responsável:** AGENTE 19  
> **Índice do corpus:** 138  
> **Tipo:** suíte Jest unitária focal de action + router reais  
> **Linhas textuais:** 264  
> **Posições documentais:** 265, contando o newline final  
> **Implementação principal exercitada:** extension/background/actions/deliver-result-from-tab.js — SHA 59543c1359669ced02a1d05c251b272abaad6709  
> **Router exercitado:** extension/background/router.js — SHA d9278e9e58e4e9583a30c16227bfd833e7203d89  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Esta suíte é a prova unitária focal do protocolo IMAGE_READY_FROM_NEW_TAB. Em vez de copiar funções da action, ela carrega extension/background/router.js e extension/background/actions/deliver-result-from-tab.js reais dentro de jest.isolateModules, constrói um contexto controlado e envia mensagens pelo listener criado por createMessageRouter.

O teste cobre uma fronteira importante: a action recebe o resultado extraído por uma aba auxiliar, cruza sender.tab.id com state.extractionTabs, confirma ownership do job Gemini, exige staging/persistência e só então faz cleanup/finalização.

A suíte não executa um navegador real. chrome.tabs.remove, storage/state helpers e lifecycle helpers são mocks injetados. Portanto ela é forte para decisões e argumentos da action, mas não prova os efeitos reais desses colaboradores além das chamadas explicitamente observadas.

## 2. Estrutura do harness

### Caminhos da implementação real

As linhas 1–3 resolvem paths relativos ao local da suíte. Isso garante que o código carregado seja o router/action versionados no repositório, mas torna o arquivo dependente de permanecer em tests/unit/background ou de manter profundidade equivalente.

### loadRouter

loadRouter faz quatro trabalhos:

1. aponta self para global para compatibilizar as IIFEs da extensão;
2. instala um chrome mínimo com runtime.id, runtime.lastError e tabs.remove mockado;
3. apaga MangaTranslatorRouter antes da carga;
4. usa jest.isolateModules para carregar router e action reais e então devolve o router registrado.

O mock de tabs.remove chama o callback imediatamente, modelando somente o caminho de remoção bem-sucedida. Ele não simula runtime.lastError nem exceções.

### dispatch

dispatch converte sendResponse em Promise e devolve um objeto conceitual { keepAlive, response }.

Existe uma sutileza: keepAlive só recebe o retorno de listener depois que listener termina. Se sendResponse for chamado sincronicamente durante a validação, o callback pode resolver a Promise enquanto keepAlive ainda é undefined. Nenhum teste atual faz assertion sobre keepAlive, então isso não invalida as provas existentes, mas impede usar este helper como prova fiel do return boolean síncrono sem ajuste.

## 3. Inventário dos casos executáveis

| Caso | Linhas | Comportamento alvo | Assertions principais |
|---|---:|---|---|
| Sucesso completo | 29–92 | staging aceito, cleanup e finalize | argumentos de staging, tabs.remove, mapping removido, finalize args, resposta final |
| currentBatchId divergente | 94–139 | batch global não invalida job auxiliar legítimo | response.ok e committed |
| Falha de persistência | 141–191 | preserva aba/mapping/job para retry | resposta de falha, zero remove, mapping presente, zero finalize |
| jobId forjado | 193–233 | mapping do sender rejeita jobId divergente | zero remove/sync/finalize e sender_mismatch |
| payload sem jobId | 235–263 via test.each | validação antes de reidratar | zero ensureInitialized/remove e INVALID_PAYLOAD |
| src HTTP | 235–263 via test.each | exige Data URL de imagem | zero ensureInitialized/remove e INVALID_PAYLOAD |

Há quatro chamadas test(...) simples e uma test.each com duas linhas de dados, totalizando seis casos Jest executados.

## 4. O que é provado diretamente

### Staging usa identidade interna e não finaliza no ACK

No cenário de sucesso, a assertion toHaveBeenCalledWith sobre deliverResultToManga prova diretamente:

- finalizeOnAck=false;
- geminiTabId=17;
- jobId=job-4.

Ela usa objectContaining. Logo não afirma os demais campos mangaTabId, index, src ou batchId.

### Cleanup básico e finalização

O sucesso prova diretamente:

- chrome.tabs.remove recebe tab 82;
- state.extractionTabs[82] deixa de existir;
- finalizeJob recebe (17, 33, false);
- resposta final contém ok/staged/persisted/committed true.

O título diz “só então finaliza”, mas não existe assertion de ordem de chamadas. Também não existe expect(syncState). Assim, a suíte prova que esses efeitos ocorreram no caminho que terminou verde; não prova diretamente a ordem remove → syncState → finalize.

### Independência de currentBatchId

O segundo teste coloca currentBatchId=batch-atual enquanto mapping/job têm batch-antigo e prova diretamente que a resposta permanece ok e committed. Isso demonstra que a divergência do lote global, isoladamente, não invalida o job auxiliar.

### Retry após falha de staging

Quando deliverResultToManga retorna {ok:false, reason:persist_failed}, a suíte prova diretamente:

- resposta {ok:false, reason:persist_failed};
- nenhuma chamada a tabs.remove;
- mapping da tab 84 permanece;
- finalizeJob não é chamado.

Não há expect(syncState). O código real retorna antes dessa chamada, mas essa ausência é apenas inferida pela execução do branch, não afirmada por este teste.

### JobId incompatível com mapping

Com mapping job-4 e request job-forjado, prova diretamente:

- zero tabs.remove;
- zero syncState;
- zero finalizeJob;
- response.reason=sender_mismatch.

O mock assertJobOwnership existe, mas não há expect(...).not.toHaveBeenCalled(); portanto a curta-circuitagem antes de ownership não é uma propriedade diretamente afirmada pela suíte.

### Payload inválido antes de reidratação

test.each prova para dois payloads:

1. src Data URL sem jobId → INVALID_PAYLOAD / “jobId é obrigatório”;
2. jobId válido + src HTTP → INVALID_PAYLOAD / “src de resultado inválido”.

Para ambos, ensureInitialized e tabs.remove não são chamados.

## 5. O que a suíte não prova

A leitura da implementação real e das assertions atuais mostra lacunas específicas:

- não prova a ordem temporal entre staging, tabs.remove, syncState e finalizeJob;
- não afirma que syncState foi chamado no sucesso;
- não cobre ownership.owns=false nem ownership.job ausente depois de mapping válido;
- não cobre identityMismatch individual por batchId, index ou mangaTabId;
- o caso job-forjado falha antes de identityMismatch e não serve de prova para esse branch;
- não cobre fallbacks nullish dos campos do job para mapping;
- não cobre staged null/undefined, {ok:true,persisted:false} e {ok:true} sem persisted;
- não cobre chrome.runtime.lastError em tabs.remove;
- não cobre tabs.remove lançando;
- não cobre syncState rejeitando;
- não cobre finalizeJob rejeitando;
- não afirma logs/metadata;
- não cobre sender sem tab ou mapping ausente como casos isolados;
- não verifica keepAlive do router;
- não prova integração real com Chrome, storage ou lifecycle; esses colaboradores são mocks.

## 6. Evidência de execução real da própria suíte

O blob 263cb827e30468c377c5b1eb5863e90bd6cf26b0 estava presente no commit b6ad13fce47adcab3fcd10281f28848f7b4ce50f.

Na GitHub Actions MangaTranslator CI #36577447500:

- Unit + Integration (20.x), job 109437162616: PASS background tests/unit/background/deliver-result-from-tab-action.test.js;
- Unit + Integration (22.x), job 109437162754: PASS da mesma suíte;
- Windows Portability, job 109437162789: PASS da mesma suíte.

Nos jobs Node 20/22, o run encerrou com 109 suites e 851 testes aprovados. O job Windows também registrou a suíte como PASS.

Como as assertions desta suíte executam router/action reais, uma assertion específica que passou é classificada como ✅ PROVADO DIRETAMENTE para a propriedade que ela verifica. Linhas de setup/execução sem expect correspondente permanecem 🟨 EXECUTADO INDIRETAMENTE.

## 7. Matriz de força das provas

| Propriedade | Assertion/execução | Classificação |
|---|---|---|
| action real é carregada pelo router real | require de ROUTER_PATH/ACTION_PATH; suíte PASS em CI | 🟨 EXECUTADO INDIRETAMENTE |
| staging recebe finalizeOnAck=false | expect objectContaining | ✅ PROVADO DIRETAMENTE |
| staging recebe geminiTabId=17 e jobId=job-4 | expect objectContaining | ✅ PROVADO DIRETAMENTE |
| aba 82 é solicitada para remoção após sucesso | toHaveBeenCalledWith | ✅ PROVADO DIRETAMENTE |
| mapping 82 é removido no sucesso | toBeUndefined | ✅ PROVADO DIRETAMENTE |
| finalizeJob recebe 17,33,false | toHaveBeenCalledWith | ✅ PROVADO DIRETAMENTE |
| resposta completa staged/persisted/committed | toEqual | ✅ PROVADO DIRETAMENTE |
| currentBatchId divergente não invalida | ok=true + committed=true | ✅ PROVADO DIRETAMENTE |
| staging falho preserva aba | remove not called | ✅ PROVADO DIRETAMENTE |
| staging falho preserva mapping | toBeDefined | ✅ PROVADO DIRETAMENTE |
| staging falho não finaliza | finalize not called | ✅ PROVADO DIRETAMENTE |
| jobId incompatível não remove/sync/finaliza | três not-to-have-been-called | ✅ PROVADO DIRETAMENTE |
| jobId incompatível retorna sender_mismatch | toEqual | ✅ PROVADO DIRETAMENTE |
| jobId ausente falha antes de ensureInitialized | test.each + not called + erro exato | ✅ PROVADO DIRETAMENTE |
| src HTTP falha antes de ensureInitialized | test.each + not called + erro exato | ✅ PROVADO DIRETAMENTE |
| syncState ocorre no sucesso | caminho real passa por ele, sem expect | 🟨 EXECUTADO INDIRETAMENTE |
| ordem staging → remove → sync → finalize | título sugere; nenhuma assertion de ordem | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ownership negativo | nenhum caso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| mismatch batch/index/mangaTabId | nenhum caso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| falha de remove/sync/finalize | nenhum caso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| keepAlive true/false do router | helper captura, testes não afirmam | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 8. Solicitações ao auditor

### 138-001 — TEST_ASSERTION_STRENGTH — OPEN

**Encontrado:** o teste de sucesso é nomeado “persiste resultado auxiliar, remove aba auxiliar e só então finaliza”, mas suas assertions verificam apenas que staging/remove/finalize ocorreram. syncState nem sequer possui expect.

**Arquivo auditado/relacionado:** tests/unit/background/deliver-result-from-tab-action.test.js.

**Evidência atual:** deliverResultToManga, tabs.remove, state mapping e finalizeJob possuem assertions individuais.

**Evidência ausente:** assertion de ordem entre deliverResultToManga, remoção/mutação, syncState e finalizeJob; assertion de que syncState foi chamado.

**Por que é necessária:** uma regressão que finalize antes de sincronizar o cleanup poderia satisfazer todas as assertions atuais apesar de contrariar o protocolo descrito pelo próprio nome do teste.

**Ação esperada:** fortalecer a suíte em alteração separada, usando invocationCallOrder, um ledger compartilhado ou mocks que registrem a sequência real.

**Evidência esperada:** assertion explícita de que staging conclui antes do cleanup/sync e de que finalize ocorre depois de syncState.

**Possível regressão:** finalização prematura pode deixar mapping durável stale ou tornar recovery inconsistente.

**Severidade:** NORMAL.

### 138-002 — TEST_REQUIRED — OPEN

**Encontrado:** os guards de ownership negativo e identityMismatch não possuem casos focais. O caso jobId forjado retorna em um guard anterior e não prova batchId/index/mangaTabId divergentes.

**Arquivo auditado/relacionado:** tests/unit/background/deliver-result-from-tab-action.test.js.

**Evidência atual:** ownership positivo é usado em três fluxos; mismatch de request.jobId versus mapping é provado.

**Evidência ausente:** owns=false, job=null, batchId divergente, index divergente e mangaTabId divergente após mapping/jobId válidos.

**Ação esperada:** adicionar casos usando router/action reais e afirmar reason, ausência de staging/cleanup/finalize e logs quando relevante.

**Evidência esperada:** assertions diretas para sender_mismatch de ownership e job_identity_mismatch nas três dimensões.

**Possível regressão:** mapping stale/corrompido pode deixar de ser rejeitado sem falhar os testes atuais.

**Severidade:** NORMAL.

### 138-003 — TEST_REQUIRED — OPEN

**Encontrado:** falhas durante cleanup/finalização e shapes limítrofes do ACK de staging não são exercitados.

**Evidência ausente:** staged undefined/null, {ok:true,persisted:false}, {ok:true} sem persisted, chrome.runtime.lastError/tabs.remove falho, syncState rejeitado e finalizeJob rejeitado.

**Ação esperada:** adicionar testes separados que mantenham a implementação real e controlem somente colaboradores externos.

**Evidência esperada:** assertions sobre resposta, mapping, finalize e política de retry/erro para cada falha.

**Possível regressão:** erro de infraestrutura pode ser convertido em sucesso parcial, aba órfã ou estado incoerente sem regressão detectada.

**Severidade:** NORMAL.

### 138-004 — TEST_HARNESS_REVIEW — OPEN

**Encontrado:** dispatch pretende devolver keepAlive, porém atribui keepAlive somente depois de chamar listener. Em respostas síncronas, sendResponse pode resolver a Promise antes da atribuição, deixando result.keepAlive undefined embora o listener retorne false.

**Evidência atual:** nenhum caso faz assertion sobre result.keepAlive.

**Ação esperada:** decidir se o helper deve realmente testar o return boolean. Se sim, ajustar o harness e adicionar assertions separadas para validação síncrona (false) e execução assíncrona (true).

**Possível regressão:** futuras assertions podem interpretar incorretamente undefined ou deixar de detectar quebra do contrato keepAlive do router.

**Severidade:** NORMAL.

Nenhuma dessas solicitações autoriza AGENTE 19 a editar a suíte. Elas ficam registradas no state correspondente e não bloqueiam a conclusão documental.

## 9. Fonte integral auditada

~~~js
const path = require('path');
const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/deliver-result-from-tab.js');

function loadRouter() {
    global.self = global;
    global.chrome = {
        runtime: { id: 'test-extension-id', lastError: null },
        tabs: { remove: jest.fn((_id, callback) => callback?.()) },
    };
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

describe('background/actions/deliver-result-from-tab.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('persiste resultado auxiliar, remove aba auxiliar e só então finaliza', async () => {
        const router = loadRouter();
        const state = {
            currentBatchId: 'batch-novo',
            extractionTabs: {
                82: {
                    mangaTabId: 33,
                    index: 4,
                    geminiTabId: 17,
                    jobId: 'job-4',
                    batchId: 'batch-1',
                },
            },
        };
        const job = {
            mangaTabId: 33,
            index: 4,
            geminiTabId: 17,
            jobId: 'job-4',
            batchId: 'batch-1',
        };
        const deliverResultToManga = jest.fn().mockResolvedValue({
            ok: true,
            persisted: true,
        });
        const finalizeJob = jest.fn().mockResolvedValue(true);
        const syncState = jest.fn().mockResolvedValue();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state,
                    syncState,
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                    finalizeJob,
                }),
            }),
            {
                action: 'IMAGE_READY_FROM_NEW_TAB',
                src: 'data:image/png;base64,AA',
                jobId: 'job-4',
            },
            { tab: { id: 82, url: 'https://cdn.example/result.png' } }
        );

        expect(deliverResultToManga).toHaveBeenCalledWith(expect.objectContaining({
            finalizeOnAck: false,
            geminiTabId: 17,
            jobId: 'job-4',
        }));
        expect(chrome.tabs.remove).toHaveBeenCalledWith(82, expect.any(Function));
        expect(state.extractionTabs[82]).toBeUndefined();
        expect(finalizeJob).toHaveBeenCalledWith(17, 33, false);
        expect(result.response).toEqual({
            ok: true,
            staged: true,
            persisted: true,
            committed: true,
        });
    });

    test('não considera currentBatchId global para invalidar job auxiliar real', async () => {
        const router = loadRouter();
        const state = {
            currentBatchId: 'batch-atual',
            extractionTabs: {
                83: {
                    mangaTabId: 33,
                    index: 4,
                    geminiTabId: 17,
                    jobId: 'job-4',
                    batchId: 'batch-antigo',
                },
            },
        };
        const job = {
            mangaTabId: 33,
            index: 4,
            geminiTabId: 17,
            jobId: 'job-4',
            batchId: 'batch-antigo',
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state,
                    syncState: jest.fn().mockResolvedValue(),
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga: jest.fn().mockResolvedValue({ ok: true, persisted: true }),
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                    finalizeJob: jest.fn().mockResolvedValue(true),
                }),
            }),
            {
                action: 'IMAGE_READY_FROM_NEW_TAB',
                src: 'data:image/png;base64,AA',
                jobId: 'job-4',
            },
            { tab: { id: 83, url: 'https://cdn.example/result.png' } }
        );

        expect(result.response.ok).toBe(true);
        expect(result.response.committed).toBe(true);
    });

    test('falha de persistência mantém aba auxiliar e job vivos para retry', async () => {
        const router = loadRouter();
        const state = {
            extractionTabs: {
                84: {
                    mangaTabId: 33,
                    index: 4,
                    geminiTabId: 17,
                    jobId: 'job-4',
                    batchId: 'batch-1',
                },
            },
        };
        const job = {
            mangaTabId: 33,
            index: 4,
            geminiTabId: 17,
            jobId: 'job-4',
            batchId: 'batch-1',
        };
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state,
                    syncState: jest.fn().mockResolvedValue(),
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga: jest.fn().mockResolvedValue({
                        ok: false,
                        reason: 'persist_failed',
                    }),
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                    finalizeJob,
                }),
            }),
            {
                action: 'IMAGE_READY_FROM_NEW_TAB',
                src: 'data:image/png;base64,AA',
                jobId: 'job-4',
            },
            { tab: { id: 84, url: 'https://cdn.example/result.png' } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'persist_failed' });
        expect(chrome.tabs.remove).not.toHaveBeenCalled();
        expect(state.extractionTabs[84]).toBeDefined();
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('rejeita job diferente do mapeamento sem remover ou finalizar a aba', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();
        const syncState = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {
                        extractionTabs: {
                            82: {
                                mangaTabId: 33,
                                index: 4,
                                geminiTabId: 17,
                                jobId: 'job-4',
                                batchId: 'batch-1',
                            },
                        },
                    },
                    syncState,
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga: jest.fn(),
                    assertJobOwnership: jest.fn(),
                    finalizeJob,
                    log: jest.fn(),
                }),
            }),
            {
                action: 'IMAGE_READY_FROM_NEW_TAB',
                src: 'data:image/png;base64,AA',
                jobId: 'job-forjado',
                geminiTabId: 99,
            },
            { tab: { id: 82, url: 'https://cdn.example/result.png' } }
        );

        expect(chrome.tabs.remove).not.toHaveBeenCalled();
        expect(syncState).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });
    });

    test.each([
        [{ action: 'IMAGE_READY_FROM_NEW_TAB', src: 'data:image/png;base64,AA' }, 'jobId é obrigatório'],
        [{ action: 'IMAGE_READY_FROM_NEW_TAB', src: 'https://cdn.example/result.png', jobId: 'job-4' }, 'src de resultado inválido'],
    ])('rejeita payload inválido antes de reidratar', async (request, message) => {
        const router = loadRouter();
        const ensureInitialized = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: { extractionTabs: {} },
                    ensureInitialized,
                    syncState: jest.fn(),
                    assertJobOwnership: jest.fn(),
                    finalizeJob: jest.fn(),
                    deliverResultToManga: jest.fn(),
                }),
            }),
            request,
            { tab: { id: 82, url: 'https://cdn.example/result.png' } }
        );

        expect(ensureInitialized).not.toHaveBeenCalled();
        expect(chrome.tabs.remove).not.toHaveBeenCalled();
        expect(result.response).toEqual({
            ok: false,
            error: { code: 'INVALID_PAYLOAD', message },
        });
    });
});
~~~

## 10. Mapa linha por linha

| Linha | Unidade | Fonte | Papel | Evidência |\n|---:|---|---|---|---|\n| 001 | U01 | <code>const path = require('path');</code> | Importa o built-in path, usado para apontar o teste diretamente ao router e à action reais. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 002 | U01 | <code>const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');</code> | Resolve ROUTER_PATH a partir do diretório desta suíte; torna o teste sensível à posição tests/unit/background. | 🟦 caminho estático específico |\n| 003 | U01 | <code>const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/deliver-result-from-tab.js');</code> | Resolve ACTION_PATH para a implementação real deliver-result-from-tab.js, sem duplicar sua lógica. | 🟦 caminho estático específico |\n| 004 | U02 | <code>␠ [linha vazia]</code> | Separador visual dentro de Harness loadRouter e ambiente Chrome mínimo; sem efeito runtime isolado. | estrutural |\n| 005 | U02 | <code>function loadRouter() {</code> | Declara o helper que recria o router/action para cada cenário. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 006 | U02 | <code>    global.self = global;</code> | Faz self apontar para global para que as IIFEs da extensão registrem símbolos no harness Node. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 007 | U02 | <code>    global.chrome = {</code> | Inicia um chrome mínimo próprio da suíte, substituindo o mock global do projeto para este cenário. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 008 | U02 | <code>        runtime: { id: 'test-extension-id', lastError: null },</code> | Fornece runtime.id e lastError nulo esperados pelo router/action. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 009 | U02 | <code>        tabs: { remove: jest.fn((_id, callback) =&gt; callback?.()) },</code> | Mocka tabs.remove e chama imediatamente seu callback, modelando remoção bem-sucedida sem navegador real. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 010 | U02 | <code>    };</code> | Fecha estrutura sintática de Harness loadRouter e ambiente Chrome mínimo; sem comportamento isolado adicional. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 011 | U02 | <code>    delete global.MangaTranslatorRouter;</code> | Remove eventual MangaTranslatorRouter global antes de carregar módulos, evitando reutilização explícita do símbolo. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 012 | U02 | <code>    jest.isolateModules(() =&gt; {</code> | Abre jest.isolateModules para obter registry/module cache isolados por chamada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 013 | U02 | <code>        require(ROUTER_PATH);</code> | Carrega a implementação real do router central. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 014 | U02 | <code>        require(ACTION_PATH);</code> | Carrega a implementação real da action, que se registra no router recém-carregado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 015 | U02 | <code>    });</code> | Fecha estrutura sintática pertencente a Harness loadRouter e ambiente Chrome mínimo; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 016 | U02 | <code>    return global.MangaTranslatorRouter;</code> | Retorna o MangaTranslatorRouter real registrado no global do harness. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 017 | U02 | <code>}</code> | Fecha estrutura sintática pertencente a Harness loadRouter e ambiente Chrome mínimo; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 018 | U03 | <code>␠ [linha vazia]</code> | Separador visual dentro de Helper dispatch e captura da resposta; sem efeito runtime isolado. | estrutural |\n| 019 | U03 | <code>function dispatch(listener, request, sender) {</code> | Declara helper que adapta o listener callback-based do router para Promise. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 020 | U03 | <code>    return new Promise(resolve =&gt; {</code> | Cria Promise resolvida quando sendResponse for chamado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 021 | U03 | <code>        let keepAlive;</code> | Declara a variável destinada a capturar o booleano retornado pelo listener. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 022 | U03 | <code>        keepAlive = listener(request, sender, response =&gt; resolve({ keepAlive, response }));</code> | Invoca o listener real e resolve com keepAlive + response; em resposta síncrona, keepAlive ainda pode estar undefined. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 023 | U03 | <code>    });</code> | Fecha estrutura sintática pertencente a Helper dispatch e captura da resposta; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 024 | U03 | <code>}</code> | Fecha estrutura sintática pertencente a Helper dispatch e captura da resposta; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 025 | U04 | <code>␠ [linha vazia]</code> | Separador visual dentro de Suite e cleanup do router global; sem efeito runtime isolado. | estrutural |\n| 026 | U04 | <code>describe('background/actions/deliver-result-from-tab.js', () =&gt; {</code> | Agrupa os testes sob o nome da implementação real auditada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 027 | U04 | <code>    afterEach(() =&gt; delete global.MangaTranslatorRouter);</code> | Após cada caso remove apenas MangaTranslatorRouter; self/chrome são reatribuídos por cada loadRouter. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 028 | U04 | <code>␠ [linha vazia]</code> | Separador visual dentro de Suite e cleanup do router global; sem efeito runtime isolado. | estrutural |\n| 029 | U05 | <code>    test('persiste resultado auxiliar, remove aba auxiliar e só então finaliza', async () =&gt; {</code> | Declara o cenário de sucesso cujo título também afirma uma ordem temporal de finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 030 | U05 | <code>        const router = loadRouter();</code> | Carrega router/action reais isolados para Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 031 | U05 | <code>        const state = {</code> | Inicia fixture mutável de estado para Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 032 | U05 | <code>            currentBatchId: 'batch-novo',</code> | Define o batch global no cenário Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 033 | U05 | <code>            extractionTabs: {</code> | Define ou consulta o mapping de aba auxiliar no cenário Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 034 | U05 | <code>                82: {</code> | Compõe o setup ou fluxo controlado de Sucesso: staging, cleanup e finalização; a instrução exata está preservada e é interpretada no contexto da unidade U05. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 035 | U05 | <code>                    mangaTabId: 33,</code> | Define identidade mangaTabId na fixture de Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 036 | U05 | <code>                    index: 4,</code> | Define índice da imagem na fixture de Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 037 | U05 | <code>                    geminiTabId: 17,</code> | Define identidade da aba Gemini na fixture de Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 038 | U05 | <code>                    jobId: 'job-4',</code> | Define identidade jobId no cenário Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 039 | U05 | <code>                    batchId: 'batch-1',</code> | Define identidade batchId no cenário Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 040 | U05 | <code>                },</code> | Fecha estrutura sintática pertencente a Sucesso: staging, cleanup e finalização; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 041 | U05 | <code>            },</code> | Fecha estrutura sintática pertencente a Sucesso: staging, cleanup e finalização; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 042 | U05 | <code>        };</code> | Fecha estrutura sintática de Sucesso: staging, cleanup e finalização; sem comportamento isolado adicional. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 043 | U05 | <code>        const job = {</code> | Inicia fixture do job owned para Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 044 | U05 | <code>            mangaTabId: 33,</code> | Define identidade mangaTabId na fixture de Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 045 | U05 | <code>            index: 4,</code> | Define índice da imagem na fixture de Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 046 | U05 | <code>            geminiTabId: 17,</code> | Define identidade da aba Gemini na fixture de Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 047 | U05 | <code>            jobId: 'job-4',</code> | Define identidade jobId no cenário Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 048 | U05 | <code>            batchId: 'batch-1',</code> | Define identidade batchId no cenário Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 049 | U05 | <code>        };</code> | Fecha estrutura sintática de Sucesso: staging, cleanup e finalização; sem comportamento isolado adicional. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 050 | U05 | <code>        const deliverResultToManga = jest.fn().mockResolvedValue({</code> | Cria mock de staging do resultado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 051 | U05 | <code>            ok: true,</code> | Faz o staging responder ok=true. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 052 | U05 | <code>            persisted: true,</code> | Faz o staging declarar persisted=true. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 053 | U05 | <code>        });</code> | Fecha estrutura sintática pertencente a Sucesso: staging, cleanup e finalização; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 054 | U05 | <code>        const finalizeJob = jest.fn().mockResolvedValue(true);</code> | Cria finalizeJob assíncrono bem-sucedido e rastreável. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 055 | U05 | <code>        const syncState = jest.fn().mockResolvedValue();</code> | Cria syncState assíncrono rastreável, embora este teste não faça expect sobre ele. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 056 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de Sucesso: staging, cleanup e finalização; sem efeito runtime isolado. | estrutural |\n| 057 | U05 | <code>        const result = await dispatch(</code> | Dispara o fluxo real através do listener criado pelo router. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 058 | U05 | <code>            router.createMessageRouter({</code> | Cria listener real do router com o contexto controlado de Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 059 | U05 | <code>                contextFactory: () =&gt; ({</code> | Injeta dependências controladas no contexto do router real para Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 060 | U05 | <code>                    state,</code> | Compõe o setup ou fluxo controlado de Sucesso: staging, cleanup e finalização; a instrução exata está preservada e é interpretada no contexto da unidade U05. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 061 | U05 | <code>                    syncState,</code> | Configura/observa sincronização de estado em Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 062 | U05 | <code>                    ensureInitialized: jest.fn().mockResolvedValue(),</code> | Cria mock rastreável usado no cenário Sucesso: staging, cleanup e finalização; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 063 | U05 | <code>                    deliverResultToManga,</code> | Configura/observa o colaborador de staging em Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 064 | U05 | <code>                    log: jest.fn(),</code> | Cria mock rastreável usado no cenário Sucesso: staging, cleanup e finalização; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 065 | U05 | <code>                    assertJobOwnership: (_sender, _jobId, callback) =&gt;</code> | Define assertJobOwnership callback-based para conceder ownership do job fixture. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 066 | U05 | <code>                        callback(true, 17, job),</code> | Retorna owns=true, tabId=17 e o job fixture à action real. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 067 | U05 | <code>                    finalizeJob,</code> | Configura/observa a finalização do job em Sucesso: staging, cleanup e finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 068 | U05 | <code>                }),</code> | Compõe o setup ou fluxo controlado de Sucesso: staging, cleanup e finalização; a instrução exata está preservada e é interpretada no contexto da unidade U05. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 069 | U05 | <code>            }),</code> | Compõe o setup ou fluxo controlado de Sucesso: staging, cleanup e finalização; a instrução exata está preservada e é interpretada no contexto da unidade U05. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 070 | U05 | <code>            {</code> | Fecha estrutura sintática pertencente a Sucesso: staging, cleanup e finalização; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 071 | U05 | <code>                action: 'IMAGE_READY_FROM_NEW_TAB',</code> | Usa o nome legado IMAGE_READY_FROM_NEW_TAB, exercitando o ACTION_MAP do router. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 072 | U05 | <code>                src: 'data:image/png;base64,AA',</code> | Fornece Data URL aceito pela validação da action. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 073 | U05 | <code>                jobId: 'job-4',</code> | Fornece jobId coerente com mapping/job. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 074 | U05 | <code>            },</code> | Fecha estrutura sintática pertencente a Sucesso: staging, cleanup e finalização; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 075 | U05 | <code>            { tab: { id: 82, url: 'https://cdn.example/result.png' } }</code> | Define sender.tab.id=82, chave usada para localizar extractionTabs. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 076 | U05 | <code>        );</code> | Fecha estrutura sintática pertencente a Sucesso: staging, cleanup e finalização; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 077 | U05 | <code>␠ [linha vazia]</code> | Separador visual dentro de Sucesso: staging, cleanup e finalização; sem efeito runtime isolado. | estrutural |\n| 078 | U05 | <code>        expect(deliverResultToManga).toHaveBeenCalledWith(expect.objectContaining({</code> | Inicia assertion direta sobre argumentos enviados a deliverResultToManga. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 079 | U05 | <code>            finalizeOnAck: false,</code> | Prova diretamente que staging usa finalizeOnAck=false. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 080 | U05 | <code>            geminiTabId: 17,</code> | Prova diretamente que o geminiTabId passado ao staging é 17. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 081 | U05 | <code>            jobId: 'job-4',</code> | Prova diretamente que o jobId passado ao staging é job-4. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 082 | U05 | <code>        }));</code> | Compõe o setup ou fluxo controlado de Sucesso: staging, cleanup e finalização; a instrução exata está preservada e é interpretada no contexto da unidade U05. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 083 | U05 | <code>        expect(chrome.tabs.remove).toHaveBeenCalledWith(82, expect.any(Function));</code> | Prova diretamente que a action solicita remoção da aba auxiliar 82. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 084 | U05 | <code>        expect(state.extractionTabs[82]).toBeUndefined();</code> | Prova diretamente que o mapping 82 foi removido do estado em memória. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 085 | U05 | <code>        expect(finalizeJob).toHaveBeenCalledWith(17, 33, false);</code> | Prova diretamente argumentos de finalizeJob: tab 17, manga tab 33 e fromError=false. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 086 | U05 | <code>        expect(result.response).toEqual({</code> | Inicia assertion direta da resposta final devolvida pelo router. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 087 | U05 | <code>            ok: true,</code> | Confirma envelope ok=true acrescentado pelo router. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 088 | U05 | <code>            staged: true,</code> | Confirma staged=true. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 089 | U05 | <code>            persisted: true,</code> | Confirma persisted=true. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 090 | U05 | <code>            committed: true,</code> | Confirma committed=true. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 091 | U05 | <code>        });</code> | Fecha estrutura sintática pertencente a Sucesso: staging, cleanup e finalização; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 092 | U05 | <code>    });</code> | Fecha estrutura sintática pertencente a Sucesso: staging, cleanup e finalização; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 093 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de Independência de currentBatchId global; sem efeito runtime isolado. | estrutural |\n| 094 | U06 | <code>    test('não considera currentBatchId global para invalidar job auxiliar real', async () =&gt; {</code> | Declara cenário onde currentBatchId global difere do batchId do mapping/job legítimo. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 095 | U06 | <code>        const router = loadRouter();</code> | Carrega router/action reais isolados para Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 096 | U06 | <code>        const state = {</code> | Inicia fixture mutável de estado para Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 097 | U06 | <code>            currentBatchId: 'batch-atual',</code> | Define currentBatchId=batch-atual para criar deliberadamente divergência global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 098 | U06 | <code>            extractionTabs: {</code> | Define ou consulta o mapping de aba auxiliar no cenário Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 099 | U06 | <code>                83: {</code> | Compõe o setup ou fluxo controlado de Independência de currentBatchId global; a instrução exata está preservada e é interpretada no contexto da unidade U06. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 100 | U06 | <code>                    mangaTabId: 33,</code> | Define identidade mangaTabId na fixture de Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 101 | U06 | <code>                    index: 4,</code> | Define índice da imagem na fixture de Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 102 | U06 | <code>                    geminiTabId: 17,</code> | Define identidade da aba Gemini na fixture de Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 103 | U06 | <code>                    jobId: 'job-4',</code> | Define identidade jobId no cenário Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 104 | U06 | <code>                    batchId: 'batch-antigo',</code> | Mantém batchId=batch-antigo no mapping legítimo. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 105 | U06 | <code>                },</code> | Fecha estrutura sintática pertencente a Independência de currentBatchId global; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 106 | U06 | <code>            },</code> | Fecha estrutura sintática pertencente a Independência de currentBatchId global; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 107 | U06 | <code>        };</code> | Fecha estrutura sintática de Independência de currentBatchId global; sem comportamento isolado adicional. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 108 | U06 | <code>        const job = {</code> | Inicia fixture do job owned para Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 109 | U06 | <code>            mangaTabId: 33,</code> | Define identidade mangaTabId na fixture de Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 110 | U06 | <code>            index: 4,</code> | Define índice da imagem na fixture de Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 111 | U06 | <code>            geminiTabId: 17,</code> | Define identidade da aba Gemini na fixture de Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 112 | U06 | <code>            jobId: 'job-4',</code> | Define identidade jobId no cenário Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 113 | U06 | <code>            batchId: 'batch-antigo',</code> | Mantém batchId=batch-antigo no job owned, coerente com mapping e divergente do currentBatchId. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 114 | U06 | <code>        };</code> | Fecha estrutura sintática de Independência de currentBatchId global; sem comportamento isolado adicional. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 115 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de Independência de currentBatchId global; sem efeito runtime isolado. | estrutural |\n| 116 | U06 | <code>        const result = await dispatch(</code> | Executa a action real no cenário de batch global divergente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 117 | U06 | <code>            router.createMessageRouter({</code> | Cria listener real do router com o contexto controlado de Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 118 | U06 | <code>                contextFactory: () =&gt; ({</code> | Injeta dependências controladas no contexto do router real para Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 119 | U06 | <code>                    state,</code> | Compõe o setup ou fluxo controlado de Independência de currentBatchId global; a instrução exata está preservada e é interpretada no contexto da unidade U06. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 120 | U06 | <code>                    syncState: jest.fn().mockResolvedValue(),</code> | Cria mock rastreável usado no cenário Independência de currentBatchId global; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 121 | U06 | <code>                    ensureInitialized: jest.fn().mockResolvedValue(),</code> | Cria mock rastreável usado no cenário Independência de currentBatchId global; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 122 | U06 | <code>                    deliverResultToManga: jest.fn().mockResolvedValue({ ok: true, persisted: true }),</code> | Mock de staging aceita e declara persistência. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 123 | U06 | <code>                    log: jest.fn(),</code> | Cria mock rastreável usado no cenário Independência de currentBatchId global; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 124 | U06 | <code>                    assertJobOwnership: (_sender, _jobId, callback) =&gt;</code> | Configura ownership positivo do job antigo. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 125 | U06 | <code>                        callback(true, 17, job),</code> | Entrega job owned do batch-antigo. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 126 | U06 | <code>                    finalizeJob: jest.fn().mockResolvedValue(true),</code> | Cria mock rastreável usado no cenário Independência de currentBatchId global; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 127 | U06 | <code>                }),</code> | Compõe o setup ou fluxo controlado de Independência de currentBatchId global; a instrução exata está preservada e é interpretada no contexto da unidade U06. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 128 | U06 | <code>            }),</code> | Compõe o setup ou fluxo controlado de Independência de currentBatchId global; a instrução exata está preservada e é interpretada no contexto da unidade U06. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 129 | U06 | <code>            {</code> | Fecha estrutura sintática pertencente a Independência de currentBatchId global; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 130 | U06 | <code>                action: 'IMAGE_READY_FROM_NEW_TAB',</code> | Roteia novamente IMAGE_READY_FROM_NEW_TAB. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 131 | U06 | <code>                src: 'data:image/png;base64,AA',</code> | Define o payload de imagem/URL usado por Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 132 | U06 | <code>                jobId: 'job-4',</code> | Define identidade jobId no cenário Independência de currentBatchId global. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 133 | U06 | <code>            },</code> | Fecha estrutura sintática pertencente a Independência de currentBatchId global; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 134 | U06 | <code>            { tab: { id: 83, url: 'https://cdn.example/result.png' } }</code> | Usa sender tab 83 correspondente ao mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 135 | U06 | <code>        );</code> | Fecha estrutura sintática pertencente a Independência de currentBatchId global; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 136 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de Independência de currentBatchId global; sem efeito runtime isolado. | estrutural |\n| 137 | U06 | <code>        expect(result.response.ok).toBe(true);</code> | Assertion direta: resposta continua ok apesar do currentBatchId global diferente. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 138 | U06 | <code>        expect(result.response.committed).toBe(true);</code> | Assertion direta: resposta continua committed apesar do currentBatchId global diferente. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 139 | U06 | <code>    });</code> | Fecha estrutura sintática pertencente a Independência de currentBatchId global; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 140 | U06 | <code>␠ [linha vazia]</code> | Separador visual dentro de Independência de currentBatchId global; sem efeito runtime isolado. | estrutural |\n| 141 | U07 | <code>    test('falha de persistência mantém aba auxiliar e job vivos para retry', async () =&gt; {</code> | Declara cenário de ACK/staging não persistido, destinado a provar preservação para retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 142 | U07 | <code>        const router = loadRouter();</code> | Carrega router/action reais isolados para Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 143 | U07 | <code>        const state = {</code> | Inicia fixture mutável de estado para Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 144 | U07 | <code>            extractionTabs: {</code> | Define ou consulta o mapping de aba auxiliar no cenário Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 145 | U07 | <code>                84: {</code> | Compõe o setup ou fluxo controlado de Falha de persistência preserva retry; a instrução exata está preservada e é interpretada no contexto da unidade U07. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 146 | U07 | <code>                    mangaTabId: 33,</code> | Define identidade mangaTabId na fixture de Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 147 | U07 | <code>                    index: 4,</code> | Define índice da imagem na fixture de Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 148 | U07 | <code>                    geminiTabId: 17,</code> | Define identidade da aba Gemini na fixture de Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 149 | U07 | <code>                    jobId: 'job-4',</code> | Define identidade jobId no cenário Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 150 | U07 | <code>                    batchId: 'batch-1',</code> | Define identidade batchId no cenário Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 151 | U07 | <code>                },</code> | Fecha estrutura sintática pertencente a Falha de persistência preserva retry; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 152 | U07 | <code>            },</code> | Fecha estrutura sintática pertencente a Falha de persistência preserva retry; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 153 | U07 | <code>        };</code> | Fecha estrutura sintática de Falha de persistência preserva retry; sem comportamento isolado adicional. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 154 | U07 | <code>        const job = {</code> | Inicia fixture do job owned para Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 155 | U07 | <code>            mangaTabId: 33,</code> | Define identidade mangaTabId na fixture de Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 156 | U07 | <code>            index: 4,</code> | Define índice da imagem na fixture de Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 157 | U07 | <code>            geminiTabId: 17,</code> | Define identidade da aba Gemini na fixture de Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 158 | U07 | <code>            jobId: 'job-4',</code> | Define identidade jobId no cenário Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 159 | U07 | <code>            batchId: 'batch-1',</code> | Define identidade batchId no cenário Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 160 | U07 | <code>        };</code> | Fecha estrutura sintática de Falha de persistência preserva retry; sem comportamento isolado adicional. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 161 | U07 | <code>        const finalizeJob = jest.fn();</code> | Cria finalizeJob sem resolução pré-programada para verificar que não será chamado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 162 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de Falha de persistência preserva retry; sem efeito runtime isolado. | estrutural |\n| 163 | U07 | <code>        const result = await dispatch(</code> | Executa o fluxo real no cenário de staging falho. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 164 | U07 | <code>            router.createMessageRouter({</code> | Cria listener real do router com o contexto controlado de Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 165 | U07 | <code>                contextFactory: () =&gt; ({</code> | Injeta dependências controladas no contexto do router real para Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 166 | U07 | <code>                    state,</code> | Compõe o setup ou fluxo controlado de Falha de persistência preserva retry; a instrução exata está preservada e é interpretada no contexto da unidade U07. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 167 | U07 | <code>                    syncState: jest.fn().mockResolvedValue(),</code> | Cria mock rastreável usado no cenário Falha de persistência preserva retry; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 168 | U07 | <code>                    ensureInitialized: jest.fn().mockResolvedValue(),</code> | Cria mock rastreável usado no cenário Falha de persistência preserva retry; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 169 | U07 | <code>                    deliverResultToManga: jest.fn().mockResolvedValue({</code> | Configura o mock de deliverResultToManga para falhar. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 170 | U07 | <code>                        ok: false,</code> | Retorna ok=false do staging. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 171 | U07 | <code>                        reason: 'persist_failed',</code> | Fornece razão persist_failed a ser propagada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 172 | U07 | <code>                    }),</code> | Compõe o setup ou fluxo controlado de Falha de persistência preserva retry; a instrução exata está preservada e é interpretada no contexto da unidade U07. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 173 | U07 | <code>                    log: jest.fn(),</code> | Cria mock rastreável usado no cenário Falha de persistência preserva retry; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 174 | U07 | <code>                    assertJobOwnership: (_sender, _jobId, callback) =&gt;</code> | Configura a fronteira de ownership usada pela action real em Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 175 | U07 | <code>                        callback(true, 17, job),</code> | Compõe o setup ou fluxo controlado de Falha de persistência preserva retry; a instrução exata está preservada e é interpretada no contexto da unidade U07. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 176 | U07 | <code>                    finalizeJob,</code> | Configura/observa a finalização do job em Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 177 | U07 | <code>                }),</code> | Compõe o setup ou fluxo controlado de Falha de persistência preserva retry; a instrução exata está preservada e é interpretada no contexto da unidade U07. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 178 | U07 | <code>            }),</code> | Compõe o setup ou fluxo controlado de Falha de persistência preserva retry; a instrução exata está preservada e é interpretada no contexto da unidade U07. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 179 | U07 | <code>            {</code> | Fecha estrutura sintática pertencente a Falha de persistência preserva retry; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 180 | U07 | <code>                action: 'IMAGE_READY_FROM_NEW_TAB',</code> | Define a ação legada enviada ao router em Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 181 | U07 | <code>                src: 'data:image/png;base64,AA',</code> | Define o payload de imagem/URL usado por Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 182 | U07 | <code>                jobId: 'job-4',</code> | Define identidade jobId no cenário Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 183 | U07 | <code>            },</code> | Fecha estrutura sintática pertencente a Falha de persistência preserva retry; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 184 | U07 | <code>            { tab: { id: 84, url: 'https://cdn.example/result.png' } }</code> | Define sender.tab sintético usado para ancorar o mapping em Falha de persistência preserva retry. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 185 | U07 | <code>        );</code> | Fecha estrutura sintática pertencente a Falha de persistência preserva retry; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 186 | U07 | <code>␠ [linha vazia]</code> | Separador visual dentro de Falha de persistência preserva retry; sem efeito runtime isolado. | estrutural |\n| 187 | U07 | <code>        expect(result.response).toEqual({ ok: false, reason: 'persist_failed' });</code> | Prova diretamente a resposta de falha persist_failed. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 188 | U07 | <code>        expect(chrome.tabs.remove).not.toHaveBeenCalled();</code> | Prova diretamente que a aba auxiliar não é removida após falha de staging. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 189 | U07 | <code>        expect(state.extractionTabs[84]).toBeDefined();</code> | Prova diretamente que extractionTabs[84] permanece para retry. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 190 | U07 | <code>        expect(finalizeJob).not.toHaveBeenCalled();</code> | Prova diretamente que finalizeJob não é chamado após falha de staging. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 191 | U07 | <code>    });</code> | Fecha estrutura sintática pertencente a Falha de persistência preserva retry; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 192 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de JobId incompatível é rejeitado pelo mapping; sem efeito runtime isolado. | estrutural |\n| 193 | U08 | <code>    test('rejeita job diferente do mapeamento sem remover ou finalizar a aba', async () =&gt; {</code> | Declara cenário de jobId do request divergente do mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 194 | U08 | <code>        const router = loadRouter();</code> | Carrega router/action reais isolados para JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 195 | U08 | <code>        const finalizeJob = jest.fn();</code> | Cria finalizeJob rastreável para provar ausência de finalização. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 196 | U08 | <code>        const syncState = jest.fn();</code> | Cria syncState rastreável para provar ausência de persistência do cleanup. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 197 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de JobId incompatível é rejeitado pelo mapping; sem efeito runtime isolado. | estrutural |\n| 198 | U08 | <code>        const result = await dispatch(</code> | Executa o fluxo real com request forjado. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 199 | U08 | <code>            router.createMessageRouter({</code> | Cria listener real do router com o contexto controlado de JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 200 | U08 | <code>                contextFactory: () =&gt; ({</code> | Injeta dependências controladas no contexto do router real para JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 201 | U08 | <code>                    state: {</code> | Compõe o setup ou fluxo controlado de JobId incompatível é rejeitado pelo mapping; a instrução exata está preservada e é interpretada no contexto da unidade U08. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 202 | U08 | <code>                        extractionTabs: {</code> | Define ou consulta o mapping de aba auxiliar no cenário JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 203 | U08 | <code>                            82: {</code> | Compõe o setup ou fluxo controlado de JobId incompatível é rejeitado pelo mapping; a instrução exata está preservada e é interpretada no contexto da unidade U08. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 204 | U08 | <code>                                mangaTabId: 33,</code> | Define identidade mangaTabId na fixture de JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 205 | U08 | <code>                                index: 4,</code> | Define índice da imagem na fixture de JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 206 | U08 | <code>                                geminiTabId: 17,</code> | Define identidade da aba Gemini na fixture de JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 207 | U08 | <code>                                jobId: 'job-4',</code> | Mapping autoritativo contém jobId job-4. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 208 | U08 | <code>                                batchId: 'batch-1',</code> | Define identidade batchId no cenário JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 209 | U08 | <code>                            },</code> | Fecha estrutura sintática pertencente a JobId incompatível é rejeitado pelo mapping; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 210 | U08 | <code>                        },</code> | Fecha estrutura sintática pertencente a JobId incompatível é rejeitado pelo mapping; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 211 | U08 | <code>                    },</code> | Fecha estrutura sintática pertencente a JobId incompatível é rejeitado pelo mapping; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 212 | U08 | <code>                    syncState,</code> | Configura/observa sincronização de estado em JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 213 | U08 | <code>                    ensureInitialized: jest.fn().mockResolvedValue(),</code> | Cria mock rastreável usado no cenário JobId incompatível é rejeitado pelo mapping; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 214 | U08 | <code>                    deliverResultToManga: jest.fn(),</code> | Cria mock rastreável usado no cenário JobId incompatível é rejeitado pelo mapping; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 215 | U08 | <code>                    assertJobOwnership: jest.fn(),</code> | Fornece assertJobOwnership mock, mas não há expect explícito de que permaneça sem chamada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 216 | U08 | <code>                    finalizeJob,</code> | Configura/observa a finalização do job em JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 217 | U08 | <code>                    log: jest.fn(),</code> | Cria mock rastreável usado no cenário JobId incompatível é rejeitado pelo mapping; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 218 | U08 | <code>                }),</code> | Compõe o setup ou fluxo controlado de JobId incompatível é rejeitado pelo mapping; a instrução exata está preservada e é interpretada no contexto da unidade U08. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 219 | U08 | <code>            }),</code> | Compõe o setup ou fluxo controlado de JobId incompatível é rejeitado pelo mapping; a instrução exata está preservada e é interpretada no contexto da unidade U08. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 220 | U08 | <code>            {</code> | Fecha estrutura sintática pertencente a JobId incompatível é rejeitado pelo mapping; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 221 | U08 | <code>                action: 'IMAGE_READY_FROM_NEW_TAB',</code> | Define a ação legada enviada ao router em JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 222 | U08 | <code>                src: 'data:image/png;base64,AA',</code> | Define o payload de imagem/URL usado por JobId incompatível é rejeitado pelo mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 223 | U08 | <code>                jobId: 'job-forjado',</code> | Request envia jobId job-forjado, diferente do mapping. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 224 | U08 | <code>                geminiTabId: 99,</code> | Request também envia geminiTabId=99; esse campo não é autoridade, mas o teste falha antes por jobId. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 225 | U08 | <code>            },</code> | Fecha estrutura sintática pertencente a JobId incompatível é rejeitado pelo mapping; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 226 | U08 | <code>            { tab: { id: 82, url: 'https://cdn.example/result.png' } }</code> | Sender continua sendo tab 82, cujo mapping contém job-4. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 227 | U08 | <code>        );</code> | Fecha estrutura sintática pertencente a JobId incompatível é rejeitado pelo mapping; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 228 | U08 | <code>␠ [linha vazia]</code> | Separador visual dentro de JobId incompatível é rejeitado pelo mapping; sem efeito runtime isolado. | estrutural |\n| 229 | U08 | <code>        expect(chrome.tabs.remove).not.toHaveBeenCalled();</code> | Prova diretamente que não há remoção da aba no mismatch. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 230 | U08 | <code>        expect(syncState).not.toHaveBeenCalled();</code> | Prova diretamente que syncState não é chamado no mismatch. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 231 | U08 | <code>        expect(finalizeJob).not.toHaveBeenCalled();</code> | Prova diretamente que finalizeJob não é chamado no mismatch. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 232 | U08 | <code>        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });</code> | Prova diretamente reason=sender_mismatch. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 233 | U08 | <code>    });</code> | Fecha estrutura sintática pertencente a JobId incompatível é rejeitado pelo mapping; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 234 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de Validação parametrizada de payload; sem efeito runtime isolado. | estrutural |\n| 235 | U09 | <code>    test.each([</code> | Declara matriz parametrizada de payloads inválidos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 236 | U09 | <code>        [{ action: 'IMAGE_READY_FROM_NEW_TAB', src: 'data:image/png;base64,AA' }, 'jobId é obrigatório'],</code> | Caso 1 omite jobId mantendo src Data URL válido; espera mensagem jobId é obrigatório. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 237 | U09 | <code>        [{ action: 'IMAGE_READY_FROM_NEW_TAB', src: 'https://cdn.example/result.png', jobId: 'job-4' }, 'src de resultado inválido'],</code> | Caso 2 usa src HTTP com jobId válido; espera mensagem src de resultado inválido. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 238 | U09 | <code>    ])('rejeita payload inválido antes de reidratar', async (request, message) =&gt; {</code> | Executa o mesmo corpo de teste para cada uma das duas entradas inválidas. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 239 | U09 | <code>        const router = loadRouter();</code> | Carrega router/action reais isolados para Validação parametrizada de payload. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 240 | U09 | <code>        const ensureInitialized = jest.fn();</code> | Cria ensureInitialized rastreável para provar que validação barra reidratação. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 241 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de Validação parametrizada de payload; sem efeito runtime isolado. | estrutural |\n| 242 | U09 | <code>        const result = await dispatch(</code> | Despacha cada request inválido pelo router/action reais. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 243 | U09 | <code>            router.createMessageRouter({</code> | Cria listener real do router com o contexto controlado de Validação parametrizada de payload. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 244 | U09 | <code>                contextFactory: () =&gt; ({</code> | Injeta dependências controladas no contexto do router real para Validação parametrizada de payload. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 245 | U09 | <code>                    state: { extractionTabs: {} },</code> | Fornece estado vazio; não deve ser consultado para avançar a action após validação falha. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 246 | U09 | <code>                    ensureInitialized,</code> | Injeta o mock ensureInitialized observado pela assertion. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 247 | U09 | <code>                    syncState: jest.fn(),</code> | Cria mock rastreável usado no cenário Validação parametrizada de payload; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 248 | U09 | <code>                    assertJobOwnership: jest.fn(),</code> | Cria mock rastreável usado no cenário Validação parametrizada de payload; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 249 | U09 | <code>                    finalizeJob: jest.fn(),</code> | Cria mock rastreável usado no cenário Validação parametrizada de payload; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 250 | U09 | <code>                    deliverResultToManga: jest.fn(),</code> | Cria mock rastreável usado no cenário Validação parametrizada de payload; chamadas só contam como prova quando há expect correspondente. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 251 | U09 | <code>                }),</code> | Compõe o setup ou fluxo controlado de Validação parametrizada de payload; a instrução exata está preservada e é interpretada no contexto da unidade U09. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 252 | U09 | <code>            }),</code> | Compõe o setup ou fluxo controlado de Validação parametrizada de payload; a instrução exata está preservada e é interpretada no contexto da unidade U09. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 253 | U09 | <code>            request,</code> | Passa o request corrente de test.each. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 254 | U09 | <code>            { tab: { id: 82, url: 'https://cdn.example/result.png' } }</code> | Usa sender tab sintético; origem é aceita, mas payload falha antes da execução. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 255 | U09 | <code>        );</code> | Fecha estrutura sintática pertencente a Validação parametrizada de payload; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 256 | U09 | <code>␠ [linha vazia]</code> | Separador visual dentro de Validação parametrizada de payload; sem efeito runtime isolado. | estrutural |\n| 257 | U09 | <code>        expect(ensureInitialized).not.toHaveBeenCalled();</code> | Prova diretamente que ensureInitialized não foi chamado para payload inválido. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 258 | U09 | <code>        expect(chrome.tabs.remove).not.toHaveBeenCalled();</code> | Prova diretamente que a aba não foi removida para payload inválido. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 259 | U09 | <code>        expect(result.response).toEqual({</code> | Inicia assertion do envelope de erro. | ✅ PROVADO DIRETAMENTE quando a suíte passa |\n| 260 | U09 | <code>            ok: false,</code> | Confirma ok=false. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 261 | U09 | <code>            error: { code: 'INVALID_PAYLOAD', message },</code> | Confirma code INVALID_PAYLOAD e mensagem específica parametrizada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 262 | U09 | <code>        });</code> | Fecha estrutura sintática pertencente a Validação parametrizada de payload; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 263 | U09 | <code>    });</code> | Fecha estrutura sintática pertencente a Validação parametrizada de payload; não constitui assertion isolada. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 264 | U10 | <code>});</code> | Fecha o describe da suíte. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 265 | U11 | <code>␠ [linha vazia]</code> | Posição editorial do newline terminal; não executa código. | 🟦 verificação documental |\n

## 11. Unidades semânticas

### U01 — linhas 1–3 — caminhos reais

Importa somente path e resolve router/action por caminho físico. É um gate estrutural específico de que o teste mira os arquivos reais, não stubs copiados.

### U02 — linhas 4–17 — loadRouter

Constrói ambiente global mínimo, mocka apenas Chrome necessário, isola cache de módulos e carrega router + action reais em cada cenário. O registry nasce de uma nova avaliação do router.

### U03 — linhas 18–24 — dispatch

Adapta sendResponse a Promise. A variável keepAlive é útil para ações assíncronas porque o callback ocorre depois do retorno; para respostas síncronas há a race de atribuição documentada em 138-004.

### U04 — linhas 25–28 — suite e cleanup

Define describe focal e remove MangaTranslatorRouter após cada caso. O chrome/self global não é explicitamente removido, mas loadRouter os reatribui antes de cada execução desta suíte.

### U05 — linhas 29–92 — caminho de sucesso

Monta mapping/job coerentes, staging persistido e finalização bem-sucedida. As assertions provam argumentos centrais, remoção/mapping/finalize e resposta. Não provam a ordem temporal declarada no título.

### U06 — linhas 93–140 — currentBatchId

Cria divergência deliberada entre batch global e batch antigo do mapping/job. O sucesso direto impede reintroduzir uma validação simplista baseada apenas no currentBatchId global.

### U07 — linhas 141–191 — retry após persistência falha

Controla o staging para falhar com persist_failed e afirma que recursos necessários ao retry permanecem vivos.

### U08 — linhas 192–233 — mismatch request↔mapping

Mantém sender/mapping válidos mas injeta jobId forjado no request. O teste prova o guard inicial de mapping; não alcança ownership nem identityMismatch.

### U09 — linhas 234–263 — payload inválido

Duas entradas compartilham o mesmo corpo de assertions. A validação do router/action acontece antes de ensureInitialized e do cleanup.

### U10 — linha 264 — fechamento

Fecha o describe; não adiciona comportamento próprio.

### U11 — posição 265 — newline

Registra o terminador final do blob para cobertura física completa.

## 12. Dependências e isolamento

Dependências diretas da suíte:

- Node path;
- Jest globals: describe, test, expect, jest.fn, jest.isolateModules;
- router real;
- action real.

Dependências substituídas por mocks:

- chrome.tabs.remove;
- ensureInitialized;
- syncState;
- deliverResultToManga;
- assertJobOwnership;
- finalizeJob;
- log.

Isso significa que o teste é unitário/focal: integra router e action, mas não integra a persistência, tabs API ou lifecycle reais.

## 13. Trust boundaries testadas

A suíte cobre parcialmente duas fronteiras de confiança:

1. payload externo: jobId e src passam por validate;
2. sender/mapping: request.jobId deve coincidir com mapping da sender tab.

Ela não cobre diretamente a terceira fronteira completa mapping↔job persisted (identityMismatch), apesar de fornecer ownership positivo nos caminhos verdes.

O request forjado inclui geminiTabId=99, mas como jobId também diverge, esse caso não prova isoladamente que geminiTabId do request é ignorado quando jobId coincide.

## 14. Invariantes documentais do teste

1. a suíte deve carregar implementações reais por require;
2. cada caso chama loadRouter e recebe registry isolado;
3. sucesso requer Data URL + jobId coerente;
4. finalizeOnAck=false é assertion direta;
5. falha de staging não pode remover a aba;
6. falha de staging não pode apagar mapping;
7. falha de staging não pode finalizar o job;
8. mismatch de jobId não pode sincronizar/finalizar;
9. payload inválido deve falhar antes de ensureInitialized;
10. currentBatchId global divergente não pode, sozinho, bloquear job legítimo;
11. o arquivo não prova ordem temporal só por nomear o teste;
12. mocks sem expect correspondente não devem ser promovidos a prova direta.

## 15. Autoauditoria — AGENTE 19

- [x] reserva exclusiva #138 criada com CREATE ONLY;
- [x] ownership relido e confirmado como AGENTE 19;
- [x] state #138 criado separadamente;
- [x] SHA do fonte reconfirmado;
- [x] 264 linhas textuais + newline = 265 posições;
- [x] fonte integral incorporada diretamente do blob;
- [x] router e action reais inspecionados;
- [x] seis casos Jest inventariados;
- [x] assertions diretas separadas de mera execução;
- [x] execução do mesmo blob confirmada em Linux Node 20/22 e Windows;
- [x] lacunas transformadas em solicitações persistentes ao auditor;
- [x] nenhum código, teste, fixture, workflow ou configuração foi alterado.

**Resultado documental:** a suíte fornece prova direta forte para seus seis cenários atuais, mas não para ordem temporal, ownership/identity mismatch avançados, falhas de cleanup/finalize nem keepAlive. Essas lacunas permanecem explícitas em 138-001 a 138-004.

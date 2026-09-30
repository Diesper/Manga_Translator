# Bíblia técnica — tests/unit/background/deliver-result-action.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 23  
> **SHA auditado:** 654194bf502f3a2c4c21feae64e256bb0ecc49eb  
> **Agente responsável:** AGENTE 23  
> **Índice do corpus:** 137  
> **Tipo:** teste unitário Jest da action real `deliver-result` através do roteador real  
> **Linhas textuais:** **253**  
> **Posições documentais:** **254**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible  
> **Escopo de escrita respeitado:** somente esta Bíblia, a reserva e o state #137; fontes, testes, mocks, workflows e documentos de outros arquivos permaneceram somente leitura.

## 1. Papel arquitetural

Este arquivo é o **teste direto principal** de `extension/background/actions/deliver-result.js`. Diferentemente de uma simulação local da regra, ele carrega:

1. `extension/background/router.js` real;
2. `extension/background/actions/deliver-result.js` real;
3. registra a action no registry real;
4. despacha o alias legado real `GEMINI_IMAGE_EXTRACTED` pelo listener produzido por `createMessageRouter`.

As dependências laterais da action são injetadas por `contextFactory`: inicialização, ownership, delivery e log. Isso permite isolar as guardas da action sem simular sua implementação.

O contrato funcional protegido é a primeira metade do protocolo de duas fases **stage → commit**: validar a mensagem/job, entregar o resultado ao leitor com `finalizeOnAck:false`, exigir staging/persistência bem-sucedidos e só então responder `staged:true,persisted:true`. A finalização do job ocorre em outra action (`commit-result`) e não pertence a este arquivo.

## 2. Dependências e ambiente

### 2.1 `path`

Dependência Node.js usada somente para construir caminhos absolutos de `router.js` e `deliver-result.js`.

### 2.2 `router.js` real

SHA observado: **d9278e9e58e4e9583a30c16227bfd833e7203d89**.

Pontos relevantes:

- `ACTION_MAP.GEMINI_IMAGE_EXTRACTED = 'deliver-result'`;
- resolve source pelo sender;
- executa `validate` antes de construir/executar contexto;
- mescla `contextFactory` sobre `createContext`;
- actions assíncronas retornam `true` para manter o canal;
- resultados são envelopados por `{ok:true,...result}`, permitindo que `result.ok=false` prevaleça;
- exceções assíncronas viram `INTERNAL_ERROR`.

### 2.3 `deliver-result.js` real

SHA observado: **3653bd10c2a0e65c14eb139f906feeafb30411a5**.

A action:

- valida `src` string não vazia;
- valida `jobId` string não vazia após trim;
- aguarda `ensureInitialized`;
- consulta `assertJobOwnership(sender,jobId)`;
- rejeita ausência de ownership/job;
- compara `batchId`, `index` e `mangaTabId` quando aplicável;
- usa metadados persistidos do job por `??`;
- usa `ownership.tabId` como `geminiTabId`;
- chama `deliverResultToManga(... finalizeOnAck:false)`;
- falha para `!staged.ok` ou `persisted === false`;
- em sucesso retorna `{staged:true,persisted:true}`.

### 2.4 `jobs-dom-ack.js` real

SHA observado: **07b4197a206f85559f2e843d74c71d4858734be7**.

É o helper por trás de `deliverResultToManga` no background. Seu retorno normal sempre contém `ok`, `reason`, `persisted` e `domApplied`. Com `finalizeOnAck:false`, erro de canal fechado não é aceito como ACK durável.

### 2.5 Harness Jest

`jest.config.js`, SHA **f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc**, inclui `tests/unit/background/**/*.test.js` no projeto `background`, ambiente Node, com `chrome-api.mock.js` em `setupFilesAfterEnv`.

O próprio arquivo substitui `global.chrome` por um stub mínimo dentro de `loadRouter`; os caminhos exercitados não usam `chrome.storage` porque as dependências da action são injetadas.

## 3. Wiring em scripts e CI

`package.json`, SHA **33e0b91d1a6f1790124b700d2ce331f80d2b7095**:

- `test:unit:background` seleciona o projeto background;
- `test:unit` inclui background;
- `test:ci` chama o runner de inventário Jest.

`.github/workflows/ci.yml`, SHA **ebee75820db9bfab618bf3c3016065c5bc857ed7**, executa `npm run test:ci` no job Unit + Integration em Node 20.x e 22.x.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO para descoberta pelo projeto Jest; 🟨 EXECUTADO INDIRETAMENTE no pipeline configurado. Esta auditoria não reivindica uma execução nova de Jest.

## 4. Mecânica do harness local

### 4.1 `loadRouter`

Cada teste carrega registry novo com `jest.isolateModules`. Isso é importante porque a action registra a si própria por side effect de módulo.

O stub `global.chrome.runtime.id` permite ao roteador existir, mas não simula a infraestrutura de delivery. O comportamento da action é real; somente seus colaboradores são controlados.

### 4.2 `dispatch`

O helper encapsula o callback `sendResponse` em Promise e captura o valor de retorno do listener como `keepAlive`.

Nuance: para validação síncrona, `sendResponse` é chamado antes de `listener(...)` retornar; por isso a Promise resolve com `keepAlive:undefined`. Para execução assíncrona, a atribuição já recebeu `true`, e o resultado observado contém `keepAlive:true`.

## 5. Cenários e força probatória

### 5.1 Happy path durável

✅ **PROVADO DIRETAMENTE**

O teste executa a action real, prova uma chamada a `ensureInitialized`, exige os principais argumentos de `deliverResultToManga`, incluindo `geminiTabId:17` e `finalizeOnAck:false`, e exige o envelope final completo.

Limite: não assertam o log `RESULT_STAGED_DURABLY` nem a ordem absoluta de invocação por `invocationCallOrder`; a ausência de delivery nos ramos de rejeição, porém, prova que as guardas antecedem staging nesses casos.

### 5.2 Job persistido de lote anterior

✅ **PROVADO DIRETAMENTE**

Com `state.currentBatchId='batch-novo'` e job owned em `batch-antigo`, a action real faz staging e retorna sucesso. Isso protege a decisão arquitetural de não usar `currentBatchId` global como autoridade para invalidar job ainda persistido.

### 5.3 Identidade forjada

✅ **PROVADO DIRETAMENTE**

Três iterações independentes falsificam:

- `batchId`;
- `index`;
- `mangaTabId`.

Todas exigem `job_identity_mismatch`, zero chamadas de staging e log `RESULT_JOB_IDENTITY_MISMATCH`.

### 5.4 Falha de ACK/persistência

✅ **PROVADO DIRETAMENTE para a rejeição global**; ⚠️ **SEM PROVA ESPECÍFICA do diagnóstico de cada fixture**.

As fixtures `{ok:false,reason:'persist_failed'}`, `{ok:true,persisted:false,reason:'persist_failed'}` e `null` chegam à action real e todas terminam com `response.ok=false`.

Como a única assertion é o booleano, o caso não prova:

- qual `reason` voltou;
- se `RESULT_STAGE_FAILED` foi emitido;
- se o log de sucesso ficou ausente.

### 5.5 Ownership negativo

✅ **PROVADO DIRETAMENTE**

`assertJobOwnership` retorna `false,17,null`; a action real responde `sender_mismatch` e `deliverResultToManga` não é chamado.

Limite: não há cenário separado `owns=true, job=null`, embora a mesma guarda de produção o rejeite.

### 5.6 Payload inválido

✅ **PROVADO DIRETAMENTE**

Ausência de `src` e ausência de `jobId` produzem exatamente `INVALID_PAYLOAD` com mensagens específicas. O retorno síncrono é observável como `keepAlive:undefined`.

Lacunas: string vazia para `src`, jobId whitespace, tipos errados e conteúdo não-imagem não têm caso focal neste arquivo.

## 6. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| alias `GEMINI_IMAGE_EXTRACTED` alcança a action real | dispatch usa router real + registry real | ✅ PROVADO DIRETAMENTE |
| action é assíncrona e mantém canal | happy path exige `keepAlive:true` | ✅ PROVADO DIRETAMENTE |
| `ensureInitialized` participa do happy path | spy chamado exatamente uma vez | ✅ PROVADO DIRETAMENTE |
| ownership negativo impede staging | motivo + `not.toHaveBeenCalled` | ✅ PROVADO DIRETAMENTE |
| batch forjado é rejeitado | caso parametrizado | ✅ PROVADO DIRETAMENTE |
| index forjado é rejeitado | caso parametrizado | ✅ PROVADO DIRETAMENTE |
| mangaTabId forjado é rejeitado | caso parametrizado | ✅ PROVADO DIRETAMENTE |
| `currentBatchId` diferente não invalida job owned | caso focal | ✅ PROVADO DIRETAMENTE |
| staging recebe `finalizeOnAck:false` | assertion de argumentos | ✅ PROVADO DIRETAMENTE |
| `ownership.tabId` vira `geminiTabId` | assertion exige 17 | ✅ PROVADO DIRETAMENTE |
| retorno positivo é staged/persisted | igualdade exata do envelope | ✅ PROVADO DIRETAMENTE |
| `ok:false` do helper falha | tabela negativa | ✅ PROVADO DIRETAMENTE |
| `persisted:false` falha | tabela negativa | ✅ PROVADO DIRETAMENTE |
| `null` falha | tabela negativa | ✅ PROVADO DIRETAMENTE |
| motivo/log de cada falha de staging | somente `response.ok` é assertado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `owns=true,job=null` | sem fixture focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fallbacks nullish dos metadados do job | sem fixture focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| rejeição de Promise das dependências | sem fixture focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `{ok:true}` sem `persisted` | sem fixture focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| logs sender/stage/sucesso | somente identity log é assertado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| src é Data URL/imagem válida | suíte só prova presença | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| descoberta pelo projeto background | `jest.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| execução no CI configurado | workflow → `test:ci` | 🟨 EXECUTADO INDIRETAMENTE |

## 7. Relação com a Bíblia da implementação

A Bíblia já existente de `extension/background/actions/deliver-result.js` foi lida em modo somente leitura. Ela identifica este #137 como teste direto principal e classifica lacunas equivalentes: formato/tamanho de `src`, falhas das dependências, fallbacks nullish, resposta parcial do helper, logs e campos falsy.

Esta Bíblia do teste não transforma essas lacunas em falhas comprovadas. Ela registra exatamente quais branches a suíte atual prova e quais continuam sem assertion focal.

## 8. Segurança e trust boundaries

A action possui `allowedSources:['any']`; logo, a classe de source do router não é a barreira final. A autoridade operacional vem de:

1. `jobId`;
2. `assertJobOwnership(context.sender,jobId)`;
3. comparação com identidade persistida;
4. uso de campos do job como canônicos;
5. ACK/persistência do reader.

O teste cobre ownership negativo e falsificação dos três campos de identidade com sender Gemini. Não cobre sender classificado como content/popup tentando apresentar job que, por erro externo, fosse considerado owned.

O Base64 sintético não contém dados reais do usuário. Logs do action truncam jobId/batchId e não logam o `src`.

## 9. Casos-limite

- `src:''`: produção rejeita, mas este teste só cobre ausência;
- `src:'   '`: produção aceita; sem teste;
- `jobId:'   '`: produção rejeita; sem teste;
- `index:0`: `Number.isInteger(0)` participa da comparação, sem caso;
- `mangaTabId:0`: a guarda truthy não compara; sem caso;
- `batchId:''`: a guarda não compara; sem caso;
- job sem `index/mangaTabId/batchId`: a action usa request por fallback `??`; sem caso;
- request sem esses três campos, job com valores: os valores persistidos prevalecem; sem caso;
- `owns=true` com job nulo: retorna sender_mismatch pela implementação, sem caso;
- `deliverResultToManga -> {ok:true}`: aceito pela action atual porque `persisted !== false`; sem caso;
- `deliverResultToManga` rejeita Promise: router converte em `INTERNAL_ERROR`; sem caso desta suíte;
- `ensureInitialized` rejeita: idem;
- callback de ownership nunca chamado: a Promise da action fica pendente; sem timeout local e sem teste;
- multiple callback de ownership: Promise resolve apenas a primeira chamada; sem teste;
- log de identity mismatch não verifica metadados detalhados, apenas existência de objeto.

## 10. Análise crítica

1. **Boa fidelidade:** a action e o roteador são reais; não há cópia local da lógica sob teste.
2. **Boa cobertura de identidade:** os três eixos críticos têm casos independentes.
3. **Boa prova fail-closed de ownership:** nenhuma entrega ocorre quando ownership falha.
4. **Boa proteção de arquitetura de lotes:** `currentBatchId` global divergente é explicitamente aceito quando o job persistido é legítimo.
5. **Boa prova do protocolo de duas fases:** `finalizeOnAck:false` é diretamente exigido.
6. **Assertions negativas de staging são largas demais:** somente o booleano é fixado.
7. **Logs operacionais estão parcialmente descobertos:** apenas mismatch de identidade é testado.
8. **Fallbacks e exceções não são exercitados:** são branches relevantes para compatibilidade/robustez.
9. **Validação de src é mínima por design atual:** o teste não discute strings arbitrárias.
10. **A semântica de ausência de `persisted` merece contrato explícito:** o helper real materializa o campo, mas a action é permissiva a objeto parcial.
11. **O helper `dispatch` registra corretamente a diferença síncrono/assíncrono**, mas seu `keepAlive:undefined` no validation path é consequência temporal do wrapper, não valor retornado pelo listener (que retorna `false` depois do callback). A assertion ainda detecta a resposta síncrona esperada.
12. **Nenhuma prova foi fabricada nesta auditoria:** código e testes externos permaneceram read-only.

## 11. Solicitações ao auditor

### 137-001 — TEST_REQUIRED — OPEN

- **Arquivo alvo:** `tests/unit/background/deliver-result-action.test.js`
- **Encontrado ao auditar:** grupo “não marca staging quando ACK/persistência falha”.
- **Achado:** as três fixtures negativas (`ok:false`, `persisted:false`, `null`) verificam somente `result.response.ok === false`.
- **Evidência atual:** a implementação real da action é executada e retorna falha em todos os três casos.
- **Evidência ausente:** razão exata de cada caso, emissão de `RESULT_STAGE_FAILED`, ausência de `RESULT_STAGED_DURABLY` e payload de diagnóstico.
- **Por que a evidência atual é insuficiente:** o teste continuaria verde se diferentes falhas passassem a colapsar em um motivo genérico ou se o log operacional esperado fosse perdido.
- **Ação solicitada:** fortalecer cada linha de `test.each` com `expectedReason` e assertions do log de falha; no happy path, assertar o log de sucesso separadamente.
- **Evidência esperada:** `persist_failed` preservado nos dois casos que o fornecem, `stage_failed` para `null`, `RESULT_STAGE_FAILED` em falha e `RESULT_STAGED_DURABLY` apenas em sucesso.
- **Regressão possível:** diagnósticos/razões usados para troubleshooting podem degradar sem quebrar a suíte.
- **Impacto:** observabilidade e precisão do contrato de erro.
- **Severidade:** NORMAL.

### 137-002 — CONTRACT_REVIEW — OPEN

- **Arquivo alvo:** `tests/unit/background/deliver-result-action.test.js` e, se a decisão exigir endurecimento, `extension/background/actions/deliver-result.js`.
- **Encontrado ao auditar:** guarda `!staged?.ok || staged.persisted === false`.
- **Achado:** não existe cenário para `deliverResultToManga -> {ok:true}` sem campo `persisted`; a action atual aceitaria esse objeto e devolveria `persisted:true`.
- **Evidência atual:** o helper real `jobs-dom-ack.js` sempre materializa um campo booleano `persisted` no retorno normal; o teste cobre `persisted:true`, `persisted:false`, `ok:false` e `null`.
- **Evidência ausente:** decisão executável sobre o contrato caso uma implementação futura/malformada do helper omita `persisted`.
- **Por que importa:** a action se descreve como staging durável; aceitar sucesso parcial é seguro apenas enquanto o contrato do helper for invariável.
- **Ação solicitada:** decidir se ausência de `persisted` deve ser fail-closed. Em qualquer decisão, adicionar teste focal que fixe o comportamento; se fail-closed for o contrato desejado, endurecer a action em alteração autorizada separada.
- **Evidência esperada:** assertion explícita para `{ok:true}` sem `persisted`, coerente com o contrato escolhido.
- **Regressão possível:** drift entre helper e action pode transformar ACK incompleto em confirmação durável.
- **Impacto:** integridade do protocolo stage→commit.
- **Severidade:** HIGH.

### 137-003 — TEST_REQUIRED — OPEN

- **Arquivo alvo:** `tests/unit/background/deliver-result-action.test.js`
- **Encontrado ao auditar:** branches existentes em `deliver-result.js` sem cenário focal.
- **Achado:** não há teste específico para fallbacks `job.mangaTabId ?? request.mangaTabId`, `job.index ?? request.index`, `job.batchId ?? request.batchId`; nem para `ensureInitialized` rejeitando, `deliverResultToManga` rejeitando Promise, `owns=true/job=null`, IDs falsy/zero ou logs `SENDER_MISMATCH` e `RESULT_STAGED_DURABLY`.
- **Evidência atual:** happy path, currentBatchId divergente, três mismatches, ownership negativo conjunto, três retornos negativos do staging e dois payloads ausentes.
- **Evidência ausente:** assertions branch-específicas para os caminhos listados acima.
- **Ação solicitada:** adicionar cenários focais executando a action real pelo mesmo roteador e separando cada fallback/falha relevante.
- **Evidência esperada:** argumentos exatos enviados ao staging quando o job omite metadados; envelope `INTERNAL_ERROR` para rejeições; ownership `owns=true/job=null` rejeitado; comportamento explícito para zero/falsy; logs esperados.
- **Regressão possível:** branches raros podem mudar sem sinal nesta suíte principal.
- **Impacto:** cobertura contratual da action; não invalida os caminhos já diretamente provados.
- **Severidade:** NORMAL.

### 137-004 — VALIDATION_REVIEW — OPEN

- **Arquivo alvo:** `extension/background/actions/deliver-result.js`
- **Encontrado ao auditar:** validação de payload exercitada pelas linhas 237–252 do teste.
- **Achado:** `src` é aceito se for qualquer string não vazia; não há validação local de `data:image/`, MIME, tamanho ou esquema.
- **Evidência atual:** o teste prova apenas rejeição de `src` ausente; o consumer normal usa Data URL, e ownership/identidade continuam protegendo o destino.
- **Evidência ausente:** contrato explícito que decida se esta fronteira deve rejeitar strings não-imagem e limites anormais.
- **Ação solicitada:** revisar a fronteira de confiança; se formato/tamanho forem invariantes de segurança/robustez, adicionar validação na implementação em mudança separada e testes diretos. Se a validação pertencer exclusivamente ao produtor, documentar esse contrato e adicionar teste que prove a precondição no produtor.
- **Evidência esperada:** comportamento definido para string arbitrária, whitespace, esquema não-data e payload excessivo.
- **Regressão possível:** um remetente que satisfaça ownership pode encaminhar conteúdo inesperado ao leitor.
- **Impacto:** robustez da entrada; não há evidência nesta auditoria de exploração concreta.
- **Severidade:** NORMAL.


## 12. Invariantes documentais e operacionais

1. `loadRouter` deve continuar carregando router + action reais.
2. O alias `GEMINI_IMAGE_EXTRACTED` deve continuar resolvendo para `deliver-result`.
3. Payload inválido deve ser rejeitado antes do executor.
4. A inicialização deve anteceder a validação de ownership no executor real.
5. Ownership negativo nunca pode chamar staging.
6. Mismatch de batch/index/mangaTabId deve falhar antes do staging.
7. `currentBatchId` global não deve invalidar job owned/persistido por si só.
8. Campos persistidos do job prevalecem quando definidos.
9. `ownership.tabId` é a fonte de `geminiTabId`.
10. Esta fase usa `finalizeOnAck:false`.
11. `ok:false`, `persisted:false` e ausência total de resultado devem falhar.
12. Sucesso retorna `staged:true,persisted:true`.
13. Esta suíte não prova internamente o delivery DOM; isso pertence a `jobs-dom-ack-staging.test.js`.
14. Esta suíte não prova o commit posterior; isso pertence ao consumer/job-runner.
15. O SHA desta Bíblia deixa de representar o arquivo se a fonte mudar.

## 13. Fonte integral auditada

~~~javascript
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/deliver-result.js');

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

describe('background/actions/deliver-result.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('faz staging somente depois de validar ownership e identidade persistida', async () => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn().mockResolvedValue({
            ok: true,
            persisted: true,
            domApplied: true,
        });
        const ensureInitialized = jest.fn().mockResolvedValue();

        const job = {
            jobId: 'job-4',
            batchId: 'batch-1',
            mangaTabId: 31,
            index: 4,
            geminiTabId: 17,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: { currentBatchId: 'outro-batch' },
                    ensureInitialized,
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                }),
            }),
            {
                action: 'GEMINI_IMAGE_EXTRACTED',
                mangaTabId: 31,
                index: 4,
                src: 'data:image/png;base64,AA',
                jobId: 'job-4',
                batchId: 'batch-1',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(ensureInitialized).toHaveBeenCalledTimes(1);
        expect(deliverResultToManga).toHaveBeenCalledWith(expect.objectContaining({
            mangaTabId: 31,
            index: 4,
            geminiTabId: 17,
            jobId: 'job-4',
            batchId: 'batch-1',
            finalizeOnAck: false,
        }));
        expect(result).toEqual({
            keepAlive: true,
            response: { ok: true, staged: true, persisted: true },
        });
    });

    test('currentBatchId diferente não invalida job real ainda persistido', async () => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn().mockResolvedValue({ ok: true, persisted: true });
        const job = {
            jobId: 'job-antigo',
            batchId: 'batch-antigo',
            mangaTabId: 31,
            index: 9,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: { currentBatchId: 'batch-novo' },
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                }),
            }),
            {
                action: 'GEMINI_IMAGE_EXTRACTED',
                mangaTabId: 31,
                index: 9,
                src: 'data:image/png;base64,AA',
                jobId: 'job-antigo',
                batchId: 'batch-antigo',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response).toEqual({ ok: true, staged: true, persisted: true });
        expect(deliverResultToManga).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['batch', { batchId: 'batch-forjado' }],
        ['index', { index: 999 }],
        ['mangaTabId', { mangaTabId: 999 }],
    ])('rejeita identidade forjada no campo %s', async (_field, patch) => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn();
        const log = jest.fn();
        const job = {
            jobId: 'job-4',
            batchId: 'batch-real',
            mangaTabId: 31,
            index: 4,
        };

        const request = {
            action: 'GEMINI_IMAGE_EXTRACTED',
            mangaTabId: 31,
            index: 4,
            src: 'data:image/png;base64,AA',
            jobId: 'job-4',
            batchId: 'batch-real',
            ...patch,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log,
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                }),
            }),
            request,
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });
        expect(deliverResultToManga).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            'error',
            'bg',
            'RESULT_JOB_IDENTITY_MISMATCH',
            expect.any(String),
            expect.any(Object)
        );
    });

    test.each([
        { ok: false, reason: 'persist_failed' },
        { ok: true, persisted: false, reason: 'persist_failed' },
        null,
    ])('não marca staging quando ACK/persistência falha (%p)', async staged => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn().mockResolvedValue(staged);
        const job = {
            jobId: 'job-4',
            batchId: 'batch-1',
            mangaTabId: 31,
            index: 4,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                }),
            }),
            {
                action: 'GEMINI_IMAGE_EXTRACTED',
                mangaTabId: 31,
                index: 4,
                src: 'data:image/png;base64,AA',
                jobId: 'job-4',
                batchId: 'batch-1',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response.ok).toBe(false);
    });

    test('não entrega job de outro remetente', async () => {
        const router = loadRouter();
        const deliverResultToManga = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    deliverResultToManga,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(false, 17, null),
                }),
            }),
            {
                action: 'GEMINI_IMAGE_EXTRACTED',
                mangaTabId: 31,
                index: 4,
                src: 'data:image/png;base64,AA',
                jobId: 'job-de-outra-aba',
                batchId: 'batch-antigo',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });
        expect(deliverResultToManga).not.toHaveBeenCalled();
    });

    test.each([
        [{ action: 'GEMINI_IMAGE_EXTRACTED', mangaTabId: 31, jobId: 'job-4' }, 'src da imagem é obrigatório'],
        [{ action: 'GEMINI_IMAGE_EXTRACTED', mangaTabId: 31, src: 'data:image/png;base64,AA' }, 'jobId é obrigatório'],
    ])('rejeita payload inválido antes de executar efeitos', async (request, message) => {
        const router = loadRouter();
        const result = await dispatch(
            router.createMessageRouter({}),
            request,
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result).toEqual({
            keepAlive: undefined,
            response: { ok: false, error: { code: 'INVALID_PAYLOAD', message } },
        });
    });
});
~~~

## 14. Análise posicional linha a linha

### Linha 001

- **Conteúdo:** `const path = require('path');`
- **Papel:** Importa `path`, usado para resolver os módulos reais da action e do roteador.

### Linha 002

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de bootstrap dos módulos reais; sem efeito em runtime.

### Linha 003

- **Conteúdo:** `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`
- **Papel:** Resolve o caminho absoluto de `extension/background/router.js`, implementação real exercitada pela suíte.

### Linha 004

- **Conteúdo:** `const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/deliver-result.js');`
- **Papel:** Resolve o caminho absoluto de `extension/background/actions/deliver-result.js`, objeto principal sob teste.

### Linha 005

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de bootstrap dos módulos reais; sem efeito em runtime.

### Linha 006

- **Conteúdo:** `function loadRouter() {`
- **Papel:** Abre `loadRouter`, factory que instala um ambiente mínimo e recarrega os módulos reais isoladamente.

### Linha 007

- **Conteúdo:** `    global.self = global;`
- **Papel:** Faz `self` apontar para o global Node, compatibilizando as IIFEs da extensão.

### Linha 008

- **Conteúdo:** `    global.chrome = { runtime: { id: 'test-extension-id' } };`
- **Papel:** Substitui `global.chrome` por um stub mínimo contendo apenas `runtime.id`; suficiente porque os caminhos testados recebem dependências via `contextFactory`.

### Linha 009

- **Conteúdo:** `    delete global.MangaTranslatorRouter;`
- **Papel:** Remove registro anterior do roteador para impedir reutilização entre carregamentos isolados.

### Linha 010

- **Conteúdo:** `    jest.isolateModules(() => {`
- **Papel:** Abre `jest.isolateModules`, criando registry de módulos isolado para cada chamada.

### Linha 011

- **Conteúdo:** `        require(ROUTER_PATH);`
- **Papel:** Executa o arquivo real `router.js` e registra `MangaTranslatorRouter` no global.

### Linha 012

- **Conteúdo:** `        require(ACTION_PATH);`
- **Papel:** Executa a action real `deliver-result.js`; seu `registerAction` alimenta o registry real criado na linha anterior.

### Linha 013

- **Conteúdo:** `    });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de bootstrap dos módulos reais.

### Linha 014

- **Conteúdo:** `    return global.MangaTranslatorRouter;`
- **Papel:** Retorna a API real do roteador carregado.

### Linha 015

- **Conteúdo:** `}`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de bootstrap dos módulos reais.

### Linha 016

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de adaptador dispatch; sem efeito em runtime.

### Linha 017

- **Conteúdo:** `function dispatch(listener, request, sender) {`
- **Papel:** Declara `dispatch`, adaptador Promise para o listener callback-based retornado por `createMessageRouter`.

### Linha 018

- **Conteúdo:** `    return new Promise(resolve => {`
- **Papel:** Retorna valor do helper/callback na seção de adaptador dispatch: return new Promise(resolve => {

### Linha 019

- **Conteúdo:** `        let keepAlive;`
- **Papel:** Declara `keepAlive`; em respostas síncronas ele ainda estará `undefined` quando o callback resolver.

### Linha 020

- **Conteúdo:** `        keepAlive = listener(request, sender, response => resolve({ keepAlive, response }));`
- **Papel:** Invoca o listener real e captura simultaneamente valor de retorno (`true` para action async) e payload de `sendResponse`.

### Linha 021

- **Conteúdo:** `    });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de adaptador dispatch.

### Linha 022

- **Conteúdo:** `}`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de adaptador dispatch.

### Linha 023

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de happy path de staging; sem efeito em runtime.

### Linha 024

- **Conteúdo:** `describe('background/actions/deliver-result.js', () => {`
- **Papel:** Abre a suíte focada em `deliver-result.js`.

### Linha 025

- **Conteúdo:** `    afterEach(() => delete global.MangaTranslatorRouter);`
- **Papel:** Limpa apenas `global.MangaTranslatorRouter` após cada caso; `loadRouter` reinstala `self/chrome` em cada teste.

### Linha 026

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de happy path de staging; sem efeito em runtime.

### Linha 027

- **Conteúdo:** `    test('faz staging somente depois de validar ownership e identidade persistida', async () => {`
- **Papel:** Abre happy path que combina ownership válido, identidade persistida coerente e staging durável.

### Linha 028

- **Conteúdo:** `        const router = loadRouter();`
- **Papel:** Carrega roteador + action reais.

### Linha 029

- **Conteúdo:** `        const deliverResultToManga = jest.fn().mockResolvedValue({`
- **Papel:** Cria mock de `deliverResultToManga` que resolve ACK positivo.

### Linha 030

- **Conteúdo:** `            ok: true,`
- **Papel:** Marca o resultado do helper como `ok:true`.

### Linha 031

- **Conteúdo:** `            persisted: true,`
- **Papel:** Marca confirmação explícita de persistência.

### Linha 032

- **Conteúdo:** `            domApplied: true,`
- **Papel:** Marca aplicação DOM positiva; a action não usa este campo diretamente.

### Linha 033

- **Conteúdo:** `        });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de happy path de staging.

### Linha 034

- **Conteúdo:** `        const ensureInitialized = jest.fn().mockResolvedValue();`
- **Papel:** Cria spy de `ensureInitialized`, resolvendo com sucesso.

### Linha 035

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de happy path de staging; sem efeito em runtime.

### Linha 036

- **Conteúdo:** `        const job = {`
- **Papel:** Inicia job persistido sintético usado como autoridade.

### Linha 037

- **Conteúdo:** `            jobId: 'job-4',`
- **Papel:** Define jobId canônico.

### Linha 038

- **Conteúdo:** `            batchId: 'batch-1',`
- **Papel:** Define batchId persistido.

### Linha 039

- **Conteúdo:** `            mangaTabId: 31,`
- **Papel:** Define aba de mangá persistida.

### Linha 040

- **Conteúdo:** `            index: 4,`
- **Papel:** Define índice persistido.

### Linha 041

- **Conteúdo:** `            geminiTabId: 17,`
- **Papel:** Inclui geminiTabId no objeto job; a action, porém, usa `ownership.tabId` retornado separadamente.

### Linha 042

- **Conteúdo:** `        };`
- **Papel:** Participa da construção de happy path de staging; conteúdo exato: `};`.

### Linha 043

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de happy path de staging; sem efeito em runtime.

### Linha 044

- **Conteúdo:** `        const result = await dispatch(`
- **Papel:** Dispara a mensagem através do roteador real.

### Linha 045

- **Conteúdo:** `            router.createMessageRouter({`
- **Papel:** Cria listener real com `contextFactory` controlada.

### Linha 046

- **Conteúdo:** `                contextFactory: () => ({`
- **Papel:** Participa da construção de happy path de staging; conteúdo exato: `contextFactory: () => ({`.

### Linha 047

- **Conteúdo:** `                    state: { currentBatchId: 'outro-batch' },`
- **Papel:** Define `currentBatchId` deliberadamente diferente, provando que essa variável global não governa a validade deste job.

### Linha 048

- **Conteúdo:** `                    ensureInitialized,`
- **Papel:** Injeta `ensureInitialized` observável.

### Linha 049

- **Conteúdo:** `                    deliverResultToManga,`
- **Papel:** Injeta `deliverResultToManga` observável.

### Linha 050

- **Conteúdo:** `                    log: jest.fn(),`
- **Papel:** Injeta logger mockado neste happy path; o log de sucesso não é assertado.

### Linha 051

- **Conteúdo:** `                    assertJobOwnership: (_sender, _jobId, callback) =>`
- **Papel:** Injeta implementação callback-based de `assertJobOwnership`.

### Linha 052

- **Conteúdo:** `                        callback(true, 17, job),`
- **Papel:** Retorna ownership positivo, tabId Gemini 17 e o job persistido.

### Linha 053

- **Conteúdo:** `                }),`
- **Papel:** Participa da construção de happy path de staging; conteúdo exato: `}),`.

### Linha 054

- **Conteúdo:** `            }),`
- **Papel:** Participa da construção de happy path de staging; conteúdo exato: `}),`.

### Linha 055

- **Conteúdo:** `            {`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de happy path de staging.

### Linha 056

- **Conteúdo:** `                action: 'GEMINI_IMAGE_EXTRACTED',`
- **Papel:** Usa alias legado real `GEMINI_IMAGE_EXTRACTED`; o roteador deve mapeá-lo a `deliver-result`.

### Linha 057

- **Conteúdo:** `                mangaTabId: 31,`
- **Papel:** Envia mangaTabId coerente com o job.

### Linha 058

- **Conteúdo:** `                index: 4,`
- **Papel:** Envia índice coerente.

### Linha 059

- **Conteúdo:** `                src: 'data:image/png;base64,AA',`
- **Papel:** Envia uma pequena Data URL sintética.

### Linha 060

- **Conteúdo:** `                jobId: 'job-4',`
- **Papel:** Envia jobId coerente.

### Linha 061

- **Conteúdo:** `                batchId: 'batch-1',`
- **Papel:** Envia batchId coerente.

### Linha 062

- **Conteúdo:** `            },`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de happy path de staging.

### Linha 063

- **Conteúdo:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Papel:** Fornece sender tab Gemini; a action aceita qualquer source classificada, mas ownership continua sendo a barreira efetiva.

### Linha 064

- **Conteúdo:** `        );`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de happy path de staging.

### Linha 065

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de happy path de staging; sem efeito em runtime.

### Linha 066

- **Conteúdo:** `        expect(ensureInitialized).toHaveBeenCalledTimes(1);`
- **Papel:** Prova que a action chamou a inicialização exatamente uma vez antes de completar o fluxo.

### Linha 067

- **Conteúdo:** `        expect(deliverResultToManga).toHaveBeenCalledWith(expect.objectContaining({`
- **Papel:** Inicia assertion dos argumentos usados no staging.

### Linha 068

- **Conteúdo:** `            mangaTabId: 31,`
- **Papel:** Exige mangaTabId canônico.

### Linha 069

- **Conteúdo:** `            index: 4,`
- **Papel:** Exige índice canônico.

### Linha 070

- **Conteúdo:** `            geminiTabId: 17,`
- **Papel:** Exige geminiTabId vindo de ownership.tabId.

### Linha 071

- **Conteúdo:** `            jobId: 'job-4',`
- **Papel:** Exige jobId recebido.

### Linha 072

- **Conteúdo:** `            batchId: 'batch-1',`
- **Papel:** Exige batchId canônico.

### Linha 073

- **Conteúdo:** `            finalizeOnAck: false,`
- **Papel:** Exige `finalizeOnAck:false`, propriedade central do protocolo stage→commit.

### Linha 074

- **Conteúdo:** `        }));`
- **Papel:** Participa da construção de happy path de staging; conteúdo exato: `}));`.

### Linha 075

- **Conteúdo:** `        expect(result).toEqual({`
- **Papel:** Inicia assertion da resposta final observável do listener.

### Linha 076

- **Conteúdo:** `            keepAlive: true,`
- **Papel:** Exige `keepAlive:true`, comprovando caminho assíncrono do roteador.

### Linha 077

- **Conteúdo:** `            response: { ok: true, staged: true, persisted: true },`
- **Papel:** Exige envelope final `{ok:true,staged:true,persisted:true}`.

### Linha 078

- **Conteúdo:** `        });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de happy path de staging.

### Linha 079

- **Conteúdo:** `    });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de happy path de staging.

### Linha 080

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de job persistido de lote anterior; sem efeito em runtime.

### Linha 081

- **Conteúdo:** `    test('currentBatchId diferente não invalida job real ainda persistido', async () => {`
- **Papel:** Abre caso focal para independência de `state.currentBatchId`.

### Linha 082

- **Conteúdo:** `        const router = loadRouter();`
- **Papel:** Declara dado/spy usado em job persistido de lote anterior: const router = loadRouter();

### Linha 083

- **Conteúdo:** `        const deliverResultToManga = jest.fn().mockResolvedValue({ ok: true, persisted: true });`
- **Papel:** Mocka staging positivo/persistido.

### Linha 084

- **Conteúdo:** `        const job = {`
- **Papel:** Inicia job persistido de lote antigo.

### Linha 085

- **Conteúdo:** `            jobId: 'job-antigo',`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `jobId: 'job-antigo',`.

### Linha 086

- **Conteúdo:** `            batchId: 'batch-antigo',`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `batchId: 'batch-antigo',`.

### Linha 087

- **Conteúdo:** `            mangaTabId: 31,`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `mangaTabId: 31,`.

### Linha 088

- **Conteúdo:** `            index: 9,`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `index: 9,`.

### Linha 089

- **Conteúdo:** `        };`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `};`.

### Linha 090

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de job persistido de lote anterior; sem efeito em runtime.

### Linha 091

- **Conteúdo:** `        const result = await dispatch(`
- **Papel:** Declara dado/spy usado em job persistido de lote anterior: const result = await dispatch(

### Linha 092

- **Conteúdo:** `            router.createMessageRouter({`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `router.createMessageRouter({`.

### Linha 093

- **Conteúdo:** `                contextFactory: () => ({`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `contextFactory: () => ({`.

### Linha 094

- **Conteúdo:** `                    state: { currentBatchId: 'batch-novo' },`
- **Papel:** Define `currentBatchId` como lote novo, divergente do job.

### Linha 095

- **Conteúdo:** `                    ensureInitialized: jest.fn().mockResolvedValue(),`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `ensureInitialized: jest.fn().mockResolvedValue(),`.

### Linha 096

- **Conteúdo:** `                    deliverResultToManga,`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `deliverResultToManga,`.

### Linha 097

- **Conteúdo:** `                    log: jest.fn(),`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `log: jest.fn(),`.

### Linha 098

- **Conteúdo:** `                    assertJobOwnership: (_sender, _jobId, callback) =>`
- **Papel:** Injeta ownership positivo do job antigo.

### Linha 099

- **Conteúdo:** `                        callback(true, 17, job),`
- **Papel:** Resolve o callback de ownership em job persistido de lote anterior: callback(true, 17, job),

### Linha 100

- **Conteúdo:** `                }),`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `}),`.

### Linha 101

- **Conteúdo:** `            }),`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `}),`.

### Linha 102

- **Conteúdo:** `            {`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de job persistido de lote anterior.

### Linha 103

- **Conteúdo:** `                action: 'GEMINI_IMAGE_EXTRACTED',`
- **Papel:** Despacha o alias real.

### Linha 104

- **Conteúdo:** `                mangaTabId: 31,`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `mangaTabId: 31,`.

### Linha 105

- **Conteúdo:** `                index: 9,`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `index: 9,`.

### Linha 106

- **Conteúdo:** `                src: 'data:image/png;base64,AA',`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `src: 'data:image/png;base64,AA',`.

### Linha 107

- **Conteúdo:** `                jobId: 'job-antigo',`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `jobId: 'job-antigo',`.

### Linha 108

- **Conteúdo:** `                batchId: 'batch-antigo',`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `batchId: 'batch-antigo',`.

### Linha 109

- **Conteúdo:** `            },`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de job persistido de lote anterior.

### Linha 110

- **Conteúdo:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Papel:** Participa da construção de job persistido de lote anterior; conteúdo exato: `{ tab: { id: 17, url: 'https://gemini.google.com/app' } }`.

### Linha 111

- **Conteúdo:** `        );`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de job persistido de lote anterior.

### Linha 112

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de job persistido de lote anterior; sem efeito em runtime.

### Linha 113

- **Conteúdo:** `        expect(result.response).toEqual({ ok: true, staged: true, persisted: true });`
- **Papel:** Exige sucesso apesar da divergência de `currentBatchId` global.

### Linha 114

- **Conteúdo:** `        expect(deliverResultToManga).toHaveBeenCalledTimes(1);`
- **Papel:** Exige que o staging tenha sido realmente chamado uma vez.

### Linha 115

- **Conteúdo:** `    });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de job persistido de lote anterior.

### Linha 116

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de rejeição de identidade forjada; sem efeito em runtime.

### Linha 117

- **Conteúdo:** `    test.each([`
- **Papel:** Abre tabela de três falsificações de identidade.

### Linha 118

- **Conteúdo:** `        ['batch', { batchId: 'batch-forjado' }],`
- **Papel:** Caso 1 altera somente `batchId`.

### Linha 119

- **Conteúdo:** `        ['index', { index: 999 }],`
- **Papel:** Caso 2 altera somente `index`.

### Linha 120

- **Conteúdo:** `        ['mangaTabId', { mangaTabId: 999 }],`
- **Papel:** Caso 3 altera somente `mangaTabId`.

### Linha 121

- **Conteúdo:** `    ])('rejeita identidade forjada no campo %s', async (_field, patch) => {`
- **Papel:** Declara teste parametrizado; cada linha deve provocar a mesma guarda de identidade.

### Linha 122

- **Conteúdo:** `        const router = loadRouter();`
- **Papel:** Declara dado/spy usado em rejeição de identidade forjada: const router = loadRouter();

### Linha 123

- **Conteúdo:** `        const deliverResultToManga = jest.fn();`
- **Papel:** Spy de delivery permite provar ausência de efeito externo em cada mismatch.

### Linha 124

- **Conteúdo:** `        const log = jest.fn();`
- **Papel:** Spy de log permite verificar o diagnóstico específico.

### Linha 125

- **Conteúdo:** `        const job = {`
- **Papel:** Inicia job persistido canônico.

### Linha 126

- **Conteúdo:** `            jobId: 'job-4',`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `jobId: 'job-4',`.

### Linha 127

- **Conteúdo:** `            batchId: 'batch-real',`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `batchId: 'batch-real',`.

### Linha 128

- **Conteúdo:** `            mangaTabId: 31,`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `mangaTabId: 31,`.

### Linha 129

- **Conteúdo:** `            index: 4,`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `index: 4,`.

### Linha 130

- **Conteúdo:** `        };`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `};`.

### Linha 131

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de rejeição de identidade forjada; sem efeito em runtime.

### Linha 132

- **Conteúdo:** `        const request = {`
- **Papel:** Monta request base válido.

### Linha 133

- **Conteúdo:** `            action: 'GEMINI_IMAGE_EXTRACTED',`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `action: 'GEMINI_IMAGE_EXTRACTED',`.

### Linha 134

- **Conteúdo:** `            mangaTabId: 31,`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `mangaTabId: 31,`.

### Linha 135

- **Conteúdo:** `            index: 4,`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `index: 4,`.

### Linha 136

- **Conteúdo:** `            src: 'data:image/png;base64,AA',`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `src: 'data:image/png;base64,AA',`.

### Linha 137

- **Conteúdo:** `            jobId: 'job-4',`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `jobId: 'job-4',`.

### Linha 138

- **Conteúdo:** `            batchId: 'batch-real',`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `batchId: 'batch-real',`.

### Linha 139

- **Conteúdo:** `            ...patch,`
- **Papel:** Aplica exatamente um patch forjado por iteração.

### Linha 140

- **Conteúdo:** `        };`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `};`.

### Linha 141

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de rejeição de identidade forjada; sem efeito em runtime.

### Linha 142

- **Conteúdo:** `        const result = await dispatch(`
- **Papel:** Declara dado/spy usado em rejeição de identidade forjada: const result = await dispatch(

### Linha 143

- **Conteúdo:** `            router.createMessageRouter({`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `router.createMessageRouter({`.

### Linha 144

- **Conteúdo:** `                contextFactory: () => ({`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `contextFactory: () => ({`.

### Linha 145

- **Conteúdo:** `                    state: {},`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `state: {},`.

### Linha 146

- **Conteúdo:** `                    ensureInitialized: jest.fn().mockResolvedValue(),`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `ensureInitialized: jest.fn().mockResolvedValue(),`.

### Linha 147

- **Conteúdo:** `                    deliverResultToManga,`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `deliverResultToManga,`.

### Linha 148

- **Conteúdo:** `                    log,`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `log,`.

### Linha 149

- **Conteúdo:** `                    assertJobOwnership: (_sender, _jobId, callback) =>`
- **Papel:** Ownership continua positivo; a rejeição deve vir exclusivamente da identidade divergente.

### Linha 150

- **Conteúdo:** `                        callback(true, 17, job),`
- **Papel:** Resolve o callback de ownership em rejeição de identidade forjada: callback(true, 17, job),

### Linha 151

- **Conteúdo:** `                }),`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `}),`.

### Linha 152

- **Conteúdo:** `            }),`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `}),`.

### Linha 153

- **Conteúdo:** `            request,`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `request,`.

### Linha 154

- **Conteúdo:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Papel:** Participa da construção de rejeição de identidade forjada; conteúdo exato: `{ tab: { id: 17, url: 'https://gemini.google.com/app' } }`.

### Linha 155

- **Conteúdo:** `        );`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de rejeição de identidade forjada.

### Linha 156

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de rejeição de identidade forjada; sem efeito em runtime.

### Linha 157

- **Conteúdo:** `        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });`
- **Papel:** Exige motivo específico `job_identity_mismatch`.

### Linha 158

- **Conteúdo:** `        expect(deliverResultToManga).not.toHaveBeenCalled();`
- **Papel:** Prova que nenhuma entrega ao leitor ocorre para identidade divergente.

### Linha 159

- **Conteúdo:** `        expect(log).toHaveBeenCalledWith(`
- **Papel:** Inicia assertion do log específico.

### Linha 160

- **Conteúdo:** `            'error',`
- **Papel:** Exige severidade `error`.

### Linha 161

- **Conteúdo:** `            'bg',`
- **Papel:** Exige componente `bg`.

### Linha 162

- **Conteúdo:** `            'RESULT_JOB_IDENTITY_MISMATCH',`
- **Papel:** Exige código `RESULT_JOB_IDENTITY_MISMATCH`.

### Linha 163

- **Conteúdo:** `            expect.any(String),`
- **Papel:** Aceita texto humano variável.

### Linha 164

- **Conteúdo:** `            expect.any(Object)`
- **Papel:** Aceita objeto de metadados, sem validar campos individuais.

### Linha 165

- **Conteúdo:** `        );`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de rejeição de identidade forjada.

### Linha 166

- **Conteúdo:** `    });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de rejeição de identidade forjada.

### Linha 167

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de falhas de ACK/persistência; sem efeito em runtime.

### Linha 168

- **Conteúdo:** `    test.each([`
- **Papel:** Abre tabela de retornos defeituosos do staging.

### Linha 169

- **Conteúdo:** `        { ok: false, reason: 'persist_failed' },`
- **Papel:** Caso: helper retorna `ok:false` com razão `persist_failed`.

### Linha 170

- **Conteúdo:** `        { ok: true, persisted: false, reason: 'persist_failed' },`
- **Papel:** Caso: helper retorna `ok:true`, mas `persisted:false` explicitamente.

### Linha 171

- **Conteúdo:** `        null,`
- **Papel:** Caso: helper retorna `null`.

### Linha 172

- **Conteúdo:** `    ])('não marca staging quando ACK/persistência falha (%p)', async staged => {`
- **Papel:** Declara teste parametrizado para falha de ACK/persistência.

### Linha 173

- **Conteúdo:** `        const router = loadRouter();`
- **Papel:** Declara dado/spy usado em falhas de ACK/persistência: const router = loadRouter();

### Linha 174

- **Conteúdo:** `        const deliverResultToManga = jest.fn().mockResolvedValue(staged);`
- **Papel:** Mocka `deliverResultToManga` com cada valor da tabela.

### Linha 175

- **Conteúdo:** `        const job = {`
- **Papel:** Declara dado/spy usado em falhas de ACK/persistência: const job = {

### Linha 176

- **Conteúdo:** `            jobId: 'job-4',`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `jobId: 'job-4',`.

### Linha 177

- **Conteúdo:** `            batchId: 'batch-1',`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `batchId: 'batch-1',`.

### Linha 178

- **Conteúdo:** `            mangaTabId: 31,`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `mangaTabId: 31,`.

### Linha 179

- **Conteúdo:** `            index: 4,`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `index: 4,`.

### Linha 180

- **Conteúdo:** `        };`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `};`.

### Linha 181

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de falhas de ACK/persistência; sem efeito em runtime.

### Linha 182

- **Conteúdo:** `        const result = await dispatch(`
- **Papel:** Dispara fluxo real da action/roteador.

### Linha 183

- **Conteúdo:** `            router.createMessageRouter({`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `router.createMessageRouter({`.

### Linha 184

- **Conteúdo:** `                contextFactory: () => ({`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `contextFactory: () => ({`.

### Linha 185

- **Conteúdo:** `                    state: {},`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `state: {},`.

### Linha 186

- **Conteúdo:** `                    ensureInitialized: jest.fn().mockResolvedValue(),`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `ensureInitialized: jest.fn().mockResolvedValue(),`.

### Linha 187

- **Conteúdo:** `                    deliverResultToManga,`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `deliverResultToManga,`.

### Linha 188

- **Conteúdo:** `                    log: jest.fn(),`
- **Papel:** Logger é mockado, mas não é inspecionado neste grupo.

### Linha 189

- **Conteúdo:** `                    assertJobOwnership: (_sender, _jobId, callback) =>`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `assertJobOwnership: (_sender, _jobId, callback) =>`.

### Linha 190

- **Conteúdo:** `                        callback(true, 17, job),`
- **Papel:** Resolve o callback de ownership em falhas de ACK/persistência: callback(true, 17, job),

### Linha 191

- **Conteúdo:** `                }),`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `}),`.

### Linha 192

- **Conteúdo:** `            }),`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `}),`.

### Linha 193

- **Conteúdo:** `            {`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de falhas de ACK/persistência.

### Linha 194

- **Conteúdo:** `                action: 'GEMINI_IMAGE_EXTRACTED',`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `action: 'GEMINI_IMAGE_EXTRACTED',`.

### Linha 195

- **Conteúdo:** `                mangaTabId: 31,`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `mangaTabId: 31,`.

### Linha 196

- **Conteúdo:** `                index: 4,`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `index: 4,`.

### Linha 197

- **Conteúdo:** `                src: 'data:image/png;base64,AA',`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `src: 'data:image/png;base64,AA',`.

### Linha 198

- **Conteúdo:** `                jobId: 'job-4',`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `jobId: 'job-4',`.

### Linha 199

- **Conteúdo:** `                batchId: 'batch-1',`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `batchId: 'batch-1',`.

### Linha 200

- **Conteúdo:** `            },`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de falhas de ACK/persistência.

### Linha 201

- **Conteúdo:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Papel:** Participa da construção de falhas de ACK/persistência; conteúdo exato: `{ tab: { id: 17, url: 'https://gemini.google.com/app' } }`.

### Linha 202

- **Conteúdo:** `        );`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de falhas de ACK/persistência.

### Linha 203

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de falhas de ACK/persistência; sem efeito em runtime.

### Linha 204

- **Conteúdo:** `        expect(result.response.ok).toBe(false);`
- **Papel:** Assertion verifica apenas `response.ok === false`; não fixa razão nem `RESULT_STAGE_FAILED` por caso.

### Linha 205

- **Conteúdo:** `    });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de falhas de ACK/persistência.

### Linha 206

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de ownership negativo; sem efeito em runtime.

### Linha 207

- **Conteúdo:** `    test('não entrega job de outro remetente', async () => {`
- **Papel:** Abre caso de ownership negativo.

### Linha 208

- **Conteúdo:** `        const router = loadRouter();`
- **Papel:** Declara dado/spy usado em ownership negativo: const router = loadRouter();

### Linha 209

- **Conteúdo:** `        const deliverResultToManga = jest.fn();`
- **Papel:** Spy de delivery serve para provar fail-closed.

### Linha 210

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de ownership negativo; sem efeito em runtime.

### Linha 211

- **Conteúdo:** `        const result = await dispatch(`
- **Papel:** Declara dado/spy usado em ownership negativo: const result = await dispatch(

### Linha 212

- **Conteúdo:** `            router.createMessageRouter({`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `router.createMessageRouter({`.

### Linha 213

- **Conteúdo:** `                contextFactory: () => ({`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `contextFactory: () => ({`.

### Linha 214

- **Conteúdo:** `                    state: {},`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `state: {},`.

### Linha 215

- **Conteúdo:** `                    ensureInitialized: jest.fn().mockResolvedValue(),`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `ensureInitialized: jest.fn().mockResolvedValue(),`.

### Linha 216

- **Conteúdo:** `                    deliverResultToManga,`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `deliverResultToManga,`.

### Linha 217

- **Conteúdo:** `                    log: jest.fn(),`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `log: jest.fn(),`.

### Linha 218

- **Conteúdo:** `                    assertJobOwnership: (_sender, _jobId, callback) =>`
- **Papel:** Implementa ownership negativo.

### Linha 219

- **Conteúdo:** `                        callback(false, 17, null),`
- **Papel:** Retorna `owns=false`; job nulo.

### Linha 220

- **Conteúdo:** `                }),`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `}),`.

### Linha 221

- **Conteúdo:** `            }),`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `}),`.

### Linha 222

- **Conteúdo:** `            {`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de ownership negativo.

### Linha 223

- **Conteúdo:** `                action: 'GEMINI_IMAGE_EXTRACTED',`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `action: 'GEMINI_IMAGE_EXTRACTED',`.

### Linha 224

- **Conteúdo:** `                mangaTabId: 31,`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `mangaTabId: 31,`.

### Linha 225

- **Conteúdo:** `                index: 4,`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `index: 4,`.

### Linha 226

- **Conteúdo:** `                src: 'data:image/png;base64,AA',`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `src: 'data:image/png;base64,AA',`.

### Linha 227

- **Conteúdo:** `                jobId: 'job-de-outra-aba',`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `jobId: 'job-de-outra-aba',`.

### Linha 228

- **Conteúdo:** `                batchId: 'batch-antigo',`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `batchId: 'batch-antigo',`.

### Linha 229

- **Conteúdo:** `            },`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de ownership negativo.

### Linha 230

- **Conteúdo:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Papel:** Participa da construção de ownership negativo; conteúdo exato: `{ tab: { id: 17, url: 'https://gemini.google.com/app' } }`.

### Linha 231

- **Conteúdo:** `        );`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de ownership negativo.

### Linha 232

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de ownership negativo; sem efeito em runtime.

### Linha 233

- **Conteúdo:** `        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });`
- **Papel:** Exige motivo `sender_mismatch`.

### Linha 234

- **Conteúdo:** `        expect(deliverResultToManga).not.toHaveBeenCalled();`
- **Papel:** Prova que ownership negativo impede staging.

### Linha 235

- **Conteúdo:** `    });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de ownership negativo.

### Linha 236

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de validação de payload; sem efeito em runtime.

### Linha 237

- **Conteúdo:** `    test.each([`
- **Papel:** Abre tabela de payloads inválidos.

### Linha 238

- **Conteúdo:** `        [{ action: 'GEMINI_IMAGE_EXTRACTED', mangaTabId: 31, jobId: 'job-4' }, 'src da imagem é obrigatório'],`
- **Papel:** Caso sem `src`; espera mensagem específica.

### Linha 239

- **Conteúdo:** `        [{ action: 'GEMINI_IMAGE_EXTRACTED', mangaTabId: 31, src: 'data:image/png;base64,AA' }, 'jobId é obrigatório'],`
- **Papel:** Caso sem `jobId`; espera mensagem específica.

### Linha 240

- **Conteúdo:** `    ])('rejeita payload inválido antes de executar efeitos', async (request, message) => {`
- **Papel:** Declara teste parametrizado de validação pré-efeitos.

### Linha 241

- **Conteúdo:** `        const router = loadRouter();`
- **Papel:** Declara dado/spy usado em validação de payload: const router = loadRouter();

### Linha 242

- **Conteúdo:** `        const result = await dispatch(`
- **Papel:** Declara dado/spy usado em validação de payload: const result = await dispatch(

### Linha 243

- **Conteúdo:** `            router.createMessageRouter({}),`
- **Papel:** Cria roteador sem `contextFactory`; se a validação não barrasse, faltariam as dependências do executor.

### Linha 244

- **Conteúdo:** `            request,`
- **Papel:** Participa da construção de validação de payload; conteúdo exato: `request,`.

### Linha 245

- **Conteúdo:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Papel:** Participa da construção de validação de payload; conteúdo exato: `{ tab: { id: 17, url: 'https://gemini.google.com/app' } }`.

### Linha 246

- **Conteúdo:** `        );`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de validação de payload.

### Linha 247

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual na seção de validação de payload; sem efeito em runtime.

### Linha 248

- **Conteúdo:** `        expect(result).toEqual({`
- **Papel:** Inicia assertion do retorno síncrono de validação.

### Linha 249

- **Conteúdo:** `            keepAlive: undefined,`
- **Papel:** Exige `keepAlive:undefined`: o callback síncrono resolve antes da atribuição do retorno do listener.

### Linha 250

- **Conteúdo:** `            response: { ok: false, error: { code: 'INVALID_PAYLOAD', message } },`
- **Papel:** Exige envelope exato `INVALID_PAYLOAD` com a mensagem da linha parametrizada.

### Linha 251

- **Conteúdo:** `        });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de validação de payload.

### Linha 252

- **Conteúdo:** `    });`
- **Papel:** Fecha ou continua a estrutura sintática corrente na seção de validação de payload.

### Linha 253

- **Conteúdo:** `});`
- **Papel:** Fecha a suíte.

### Linha 254

- **Conteúdo:** _linha em branco_
- **Papel:** Posição documental do newline final; não contém código executável.


## 15. Autoauditoria documental

- **SHA da fonte reconfirmado antes da materialização:** sim — `654194bf502f3a2c4c21feae64e256bb0ecc49eb`.
- **Reserva reconfirmada:** sim — `AGENTE 23`.
- **Fonte integral embutida:** sim.
- **Cobertura:** 253 linhas textuais + newline final = **254/254 posições**.
- **Headings posicionais:** Linha 001 → Linha 254, sem lacunas.
- **Implementação real lida:** `deliver-result.js`.
- **Router real lido:** `router.js`.
- **Helper operacional lido:** `jobs-dom-ack.js`.
- **Bíblia da implementação lida em read-only:** sim.
- **Wiring lido:** `jest.config.js`, `package.json`, `.github/workflows/ci.yml`.
- **Classificação conservadora:** sim; assertions booleanas amplas não foram promovidas a prova de razão/log.
- **Arquivos externos modificados para produzir prova:** nenhum.
- **Solicitações ao auditor:** 137-001 a 137-004.
- **Linhas desta Bíblia:** 1864.
- **STATUS/CHECKLIST/AUDITORIA globais:** não modificados.
- **Estado documental individual:** concluído e autoauditado no escopo do AGENTE 23.

# Bíblia técnica — tests/unit/background/report-error-action.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** 507406dfbbc285a981b725408eb1e507e18268c8  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest do router + action real de reporte de erro  
> **Linhas textuais:** 176  
> **Posições documentais:** 177, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

tests/unit/background/report-error-action.test.js valida a action real extension/background/actions/report-error.js por meio do router real. O contrato é de segurança e contabilidade: uma aba pode reportar falha apenas para o job que realmente possui, a identidade recebida não pode contradizer o registro persistido e somente depois dessas validações o erro é mostrado no leitor e o job é finalizado como falha.

A suíte isola deliberadamente assertJobOwnership e finalizeJob como boundaries. Assim ela é prova direta da política da action e dos argumentos enviados a esses boundaries, não uma reimplementação da action.

## 2. Contrato real de report-error

A action aceita qualquer classe de origem no metadata allowedSources:['any'], mas não aceita qualquer identidade: o ownership é validado explicitamente por assertJobOwnership(context.sender, jobId,...).

Antes da execução, o validator exige jobId string não vazia após trim; error string não vazia após trim; e error.length <= 4096. Após ensureInitialized, a action recupera o job pertencente ao sender. Sem ownership retorna sender_mismatch. Com ownership, compara os campos opcionais recebidos com os persistidos: batchId, index e mangaTabId. Qualquer divergência aplicável retorna job_identity_mismatch.

Somente então lê debugMode, envia SHOW_ERROR_INTEGRATED e aguarda finalizeJob(tabId, mangaTabId, true).

## 3. Job persistido versus lote corrente

O primeiro caso injeta currentBatchId='batch-novo', mas o job autorizado ainda pertence a batch-1. A action não descarta o erro por comparar contra o lote corrente; ela usa a identidade do job persistido.

As assertions provam envio à aba 31 com jobId job-4, batchId batch-1 e isDebug true, seguido de finalizeJob(17,31,true). Isso congela a regra de que finalização tardia deve ser resolvida pela identidade persistida, não pela posição atual da fila.

## 4. Divergência de identidade

O segundo caso mantém ownership válido, mas envia batch-forjado enquanto o job persistido contém batch-real. O resultado deve ser job_identity_mismatch; nenhuma mensagem e nenhuma finalização podem ocorrer.

Isso prova diretamente a ramificação por batchId. O código também possui comparações independentes para index e mangaTabId; essas duas ramificações não têm caso focal equivalente nesta suíte e são registradas abaixo.

## 5. Falha de ownership

O terceiro caso faz assertJobOwnership responder false,18,null. A suíte exige ausência de tabs.sendMessage, ausência de finalizeJob e reason sender_mismatch.

Classificação: ✅ PROVADO DIRETAMENTE. A action não confia apenas no jobId fornecido pelo request.

## 6. Validação parametrizada

O test.each gera três execuções reais: ausência de jobId; erro somente whitespace; e erro com 4097 caracteres. Em todas, ensureInitialized, notificação e finalizeJob devem permanecer intocados. Isso prova também a ordem do router: validação ocorre antes de efeitos da action.

No CI, essas três entradas aparecem separadamente, somando seis casos efetivos para o arquivo.

## 7. Prova integrada complementar já existente

O cenário BG-77 de tests/unit/background/process-finalize-real.test.js carrega o background real, tenta staging com a aba do mangá inexistente e depois envia GEMINI_ERROR. Mesmo sem a aba do mangá, o erro retorna ok=true, libera o slot, remove gemini_job_1900 e fecha a aba Gemini sem incrementar sucesso.

Essa evidência cobre o risco de falha no destinatário de SHOW_ERROR_INTEGRATED sem exigir uma solicitação duplicada nesta Bíblia.

## 8. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob 507406dfbbc285a981b725408eb1e507e18268c8 auditado aqui.

- Node 20.x — job 109255348388: PASS do arquivo; 3 casos individuais + 3 entradas do test.each com ✓; global 109/109 suítes e 851/851 testes.
- Node 22.x — job 109255348406: o mesmo conjunto de seis execuções passou; global 109/109 suítes e 851/851 testes.
- CI Gate — job 109256050280: sucesso.

## 9. Matriz de força da evidência

| Contrato | Evidência | Classificação |
|---|---|---|
| erro do job persistido após currentBatchId mudar | caso 1 | ✅ PROVADO DIRETAMENTE |
| debug true chega à UI | SHOW_ERROR_INTEGRATED.isDebug=true | ✅ PROVADO DIRETAMENTE |
| finalização usa tab owner + manga persistida + fromError=true | finalizeJob(17,31,true) | ✅ PROVADO DIRETAMENTE |
| batchId divergente é rejeitado | caso 2 | ✅ PROVADO DIRETAMENTE |
| ownership inválido bloqueia efeitos | caso 3 | ✅ PROVADO DIRETAMENTE |
| jobId ausente / erro whitespace / >4096 rejeitados antes da execução | test.each | ✅ PROVADO DIRETAMENTE |
| index divergente isoladamente | branch real sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| mangaTabId divergente isoladamente | branch real sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| request sem campos opcionais usa identidade persistida | operadores ?? reais, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| 4096 exatos aceitos / jobId whitespace-only rejeitado | boundaries sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| manga tab ausente ainda permite finalização por erro | BG-77 externo | ✅ PROVADO DIRETAMENTE |

## 10. Solicitações ao auditor

### 163-001 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: identityMismatch possui três comparações independentes; a suíte focal prova apenas divergência de batchId.

Evidência ausente: caso com batch correto e index divergente; e caso separado com batch/index corretos mas mangaTabId divergente. Ambos devem exigir job_identity_mismatch e zero efeitos.

Risco: uma regressão pode enfraquecer uma dimensão de identidade sem quebrar o teste atual.

### 163-002 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: destinatário, índice e batch usam dados persistidos com fallback para request. O caso atual fornece valores iguais nos dois lados.

Evidência ausente: request contendo apenas jobId + error, com job completo devolvido pelo ownership, exigindo notificação/finalização usando manga/index/batch persistidos; preferencialmente com debugMode=false para congelar também esse valor.

Risco: a implementação pode voltar a confiar em campos redundantes do request ou perder metadados quando o runner envia identidade mínima.

### 163-003 — TEST_REQUIRED — OPEN — LOW

Encontrado: o validator define boundaries ainda não congelados: jobId somente whitespace deve falhar após trim e erro com exatamente 4096 caracteres deve ser aceito.

Evidência ausente: jobId='   ' → INVALID_PAYLOAD e erro de 4096 caracteres → passagem pelo validator até uma etapa seguinte controlada.

Risco: alteração de operador/trim pode deslocar o limite ou permitir identidade vazia.

## 11. Fonte integral auditada

```javascript
const path = require('path');
const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/report-error.js');

function loadRouter() {
    global.self = global;
    global.chrome = {
        runtime: { id: 'test-extension-id', lastError: null },
        tabs: { sendMessage: jest.fn((_id, _message, callback) => callback?.()) },
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

describe('background/actions/report-error.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('encaminha e finaliza erro do job persistido mesmo se currentBatchId mudou', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn().mockResolvedValue(true);
        const job = {
            jobId: 'job-4',
            batchId: 'batch-1',
            mangaTabId: 31,
            index: 4,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: { currentBatchId: 'batch-novo' },
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    finalizeJob,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                    storage: { get: jest.fn().mockResolvedValue({ debugMode: true }) },
                }),
            }),
            {
                action: 'GEMINI_ERROR',
                mangaTabId: 31,
                index: 4,
                error: 'Falhou',
                jobId: 'job-4',
                batchId: 'batch-1',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
            31,
            expect.objectContaining({
                action: 'SHOW_ERROR_INTEGRATED',
                isDebug: true,
                jobId: 'job-4',
                batchId: 'batch-1',
            }),
            expect.any(Function)
        );
        expect(finalizeJob).toHaveBeenCalledWith(17, 31, true);
        expect(result.response).toEqual({ ok: true });
    });

    test('rejeita erro cuja identidade diverge do job persistido', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();
        const job = {
            jobId: 'job-4',
            batchId: 'batch-real',
            mangaTabId: 31,
            index: 4,
        };

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    finalizeJob,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(true, 17, job),
                    storage: { get: jest.fn() },
                }),
            }),
            {
                action: 'GEMINI_ERROR',
                mangaTabId: 31,
                index: 4,
                error: 'Falhou',
                jobId: 'job-4',
                batchId: 'batch-forjado',
            },
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
    });

    test('não notifica nem finaliza quando ownership falha', async () => {
        const router = loadRouter();
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized: jest.fn().mockResolvedValue(),
                    finalizeJob,
                    log: jest.fn(),
                    assertJobOwnership: (_sender, _jobId, callback) =>
                        callback(false, 18, null),
                    storage: { get: jest.fn() },
                }),
            }),
            {
                action: 'GEMINI_ERROR',
                mangaTabId: 31,
                index: 4,
                error: 'Falhou',
                jobId: 'job-4',
            },
            { tab: { id: 18, url: 'https://gemini.google.com/app' } }
        );

        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });
    });

    test.each([
        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: 'Falhou' }, 'jobId é obrigatório'],
        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: '   ', jobId: 'job-4' }, 'erro inválido'],
        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: 'x'.repeat(4097), jobId: 'job-4' }, 'erro inválido'],
    ])('rejeita payload inválido antes de reidratar ou finalizar', async (request, message) => {
        const router = loadRouter();
        const ensureInitialized = jest.fn();
        const finalizeJob = jest.fn();

        const result = await dispatch(
            router.createMessageRouter({
                contextFactory: () => ({
                    state: {},
                    ensureInitialized,
                    finalizeJob,
                    assertJobOwnership: jest.fn(),
                    storage: { get: jest.fn() },
                }),
            }),
            request,
            { tab: { id: 17, url: 'https://gemini.google.com/app' } }
        );

        expect(ensureInitialized).not.toHaveBeenCalled();
        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(finalizeJob).not.toHaveBeenCalled();
        expect(result.response).toEqual({
            ok: false,
            error: { code: 'INVALID_PAYLOAD', message },
        });
    });
});
```

## 12. Auditoria linha a linha

### Linha 001

- **Código:** `const path = require('path');`
- **Função:** Importa path para resolver os módulos reais da extensão a partir da suíte.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 002

- **Código:** `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`
- **Função:** Resolve o caminho absoluto do router real que fará mapping, validação, contexto e normalização das respostas.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 003

- **Código:** `const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/report-error.js');`
- **Função:** Resolve o caminho absoluto da action real report-error.js auditada pelo teste.
- **Contexto:** paths dos módulos reais.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 004

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 005

- **Código:** `function loadRouter() {`
- **Função:** Define loader que monta ambiente global mínimo e registra novamente a action real em um router isolado.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 006

- **Código:** `    global.self = global;`
- **Função:** Emula o escopo esperado pelas IIFEs da extensão sob Jest/Node.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 007

- **Código:** `    global.chrome = {`
- **Função:** Instala API Chrome mínima; tabs.sendMessage é spy observável para a notificação integrada.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 008

- **Código:** `        runtime: { id: 'test-extension-id', lastError: null },`
- **Função:** Fornece id da extensão e lastError ao router/action.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 009

- **Código:** `        tabs: { sendMessage: jest.fn((_id, _message, callback) => callback?.()) },`
- **Função:** Modela envio para a aba do mangá e executa callback imediatamente, permitindo observar o payload.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 010

- **Código:** `    };`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 011

- **Código:** `    delete global.MangaTranslatorRouter;`
- **Função:** Remove registry global anterior para impedir vazamento entre carregamentos.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 012

- **Código:** `    jest.isolateModules(() => {`
- **Função:** Carrega router/action em registry Jest isolado, repetindo o registerAction por cenário.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 013

- **Código:** `        require(ROUTER_PATH);`
- **Função:** Carrega o router central real antes da action.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 014

- **Código:** `        require(ACTION_PATH);`
- **Função:** Executa o módulo real de report-error e registra sua definição no router.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução — conecta explicitamente a suíte aos módulos reais.

### Linha 015

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 016

- **Código:** `    return global.MangaTranslatorRouter;`
- **Função:** Entrega o router real carregado ao cenário.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 017

- **Código:** `}`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** loader isolado do router + report-error.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 018

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 019

- **Código:** `function dispatch(listener, request, sender) {`
- **Função:** Encapsula a chamada do listener real para aguardar a resposta callback como Promise.
- **Contexto:** helper de dispatch.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 020

- **Código:** `    return new Promise(resolve => {`
- **Função:** Converte o protocolo callback do runtime em resultado awaitável no teste.
- **Contexto:** helper de dispatch.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 021

- **Código:** `        let keepAlive;`
- **Função:** Reserva o valor booleano retornado pelo router para que o helper possa devolvê-lo junto da resposta.
- **Contexto:** helper de dispatch.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 022

- **Código:** `        keepAlive = listener(request, sender, response => resolve({ keepAlive, response }));`
- **Função:** Dispara o listener real com request/sender e captura a política de keep-alive.
- **Contexto:** helper de dispatch.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa router/action reais; as assertions subsequentes fixam os efeitos.

### Linha 023

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** helper de dispatch.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 024

- **Código:** `}`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** helper de dispatch.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 025

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 026

- **Código:** `describe('background/actions/report-error.js', () => {`
- **Função:** Abre a suíte específica da action real report-error.
- **Contexto:** suite e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 027

- **Código:** `    afterEach(() => delete global.MangaTranslatorRouter);`
- **Função:** Remove registry global anterior para impedir vazamento entre carregamentos.
- **Contexto:** suite e teardown.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 028

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 029

- **Código:** `    test('encaminha e finaliza erro do job persistido mesmo se currentBatchId mudou', async () => {`
- **Função:** Declara o cenário: sucesso com job persistido após troca de currentBatchId.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 030

- **Código:** `        const router = loadRouter();`
- **Função:** Carrega router + action reais para este cenário.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 031

- **Código:** `        const finalizeJob = jest.fn().mockResolvedValue(true);`
- **Função:** Cria boundary observável da finalização; a suíte verifica se report-error a chama ou bloqueia.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 032

- **Código:** `        const job = {`
- **Função:** Monta o job persistido que assertJobOwnership devolverá como identidade canônica/autorizada.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 033

- **Código:** `            jobId: 'job-4',`
- **Função:** Fixa o identificador do job usado na validação e ownership.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 034

- **Código:** `            batchId: 'batch-1',`
- **Função:** Fixa o batch persistido no cenário de sucesso.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 035

- **Código:** `            mangaTabId: 31,`
- **Função:** Fixa a aba do mangá associada ao job/request e usada no envio de erro/finalização.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 036

- **Código:** `            index: 4,`
- **Função:** Fixa o índice de imagem esperado no job e no payload.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 037

- **Código:** `        };`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 038

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 039

- **Código:** `        const result = await dispatch(`
- **Função:** Envia GEMINI_ERROR pelo router real e aguarda a resposta normalizada.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa router/action reais; as assertions subsequentes fixam os efeitos.

### Linha 040

- **Código:** `            router.createMessageRouter({`
- **Função:** Cria o listener do router real com contexto controlado pelo teste.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 041

- **Código:** `                contextFactory: () => ({`
- **Função:** Injeta dependências/estado necessários à action sem substituir a própria action.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 042

- **Código:** `                    state: { currentBatchId: 'batch-novo' },`
- **Função:** Simula que outro lote já virou corrente; o erro ainda deve ser atribuído ao job persistido antigo.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 043

- **Código:** `                    ensureInitialized: jest.fn().mockResolvedValue(),`
- **Função:** Fornece o gate de reidratação que a action aguarda antes de consultar ownership.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 044

- **Código:** `                    finalizeJob,`
- **Função:** Compõe o bloco sucesso com job persistido após troca de currentBatchId, preparando, executando ou observando a action real.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 045

- **Código:** `                    log: jest.fn(),`
- **Função:** Fornece logger; esta suíte não usa seu conteúdo como assertion focal.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 046

- **Código:** `                    assertJobOwnership: (_sender, _jobId, callback) =>`
- **Função:** Simula o boundary de ownership retornando posse/tab/job controlados para isolar a lógica da action.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 047

- **Código:** `                        callback(true, 17, job),`
- **Função:** Autoriza o sender e devolve tabId canônico 17 + job persistido.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 048

- **Código:** `                    storage: { get: jest.fn().mockResolvedValue({ debugMode: true }) },`
- **Função:** Configura debug ativo; o cenário exige que esse booleano chegue à notificação integrada.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 049

- **Código:** `                }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 050

- **Código:** `            }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 051

- **Código:** `            {`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 052

- **Código:** `                action: 'GEMINI_ERROR',`
- **Função:** Usa o nome legado que o router mapeia para a action canônica report-error.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 053

- **Código:** `                mangaTabId: 31,`
- **Função:** Fixa a aba do mangá associada ao job/request e usada no envio de erro/finalização.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 054

- **Código:** `                index: 4,`
- **Função:** Fixa o índice de imagem esperado no job e no payload.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 055

- **Código:** `                error: 'Falhou',`
- **Função:** Fornece texto de erro válido a ser encaminhado à UI integrada.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 056

- **Código:** `                jobId: 'job-4',`
- **Função:** Fixa o identificador do job usado na validação e ownership.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 057

- **Código:** `                batchId: 'batch-1',`
- **Função:** Fixa o batch persistido no cenário de sucesso.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 058

- **Código:** `            },`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 059

- **Código:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Função:** Representa a aba remetente que o stub de ownership reconhece como dona no cenário.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 060

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 061

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 062

- **Código:** `        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(`
- **Função:** Assertion focal sobre presença/ausência da notificação à aba do mangá.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 063

- **Código:** `            31,`
- **Função:** Compõe o bloco sucesso com job persistido após troca de currentBatchId, preparando, executando ou observando a action real.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 064

- **Código:** `            expect.objectContaining({`
- **Função:** Compõe o bloco sucesso com job persistido após troca de currentBatchId, preparando, executando ou observando a action real.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 065

- **Código:** `                action: 'SHOW_ERROR_INTEGRATED',`
- **Função:** Exige a action de UI usada para apresentar a falha no leitor.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 066

- **Código:** `                isDebug: true,`
- **Função:** Prova propagação do modo debug lido do storage.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 067

- **Código:** `                jobId: 'job-4',`
- **Função:** Fixa o identificador do job usado na validação e ownership.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 068

- **Código:** `                batchId: 'batch-1',`
- **Função:** Fixa o batch persistido no cenário de sucesso.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 069

- **Código:** `            }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 070

- **Código:** `            expect.any(Function)`
- **Função:** Compõe o bloco sucesso com job persistido após troca de currentBatchId, preparando, executando ou observando a action real.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 071

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 072

- **Código:** `        expect(finalizeJob).toHaveBeenCalledWith(17, 31, true);`
- **Função:** Assertion focal sobre a finalização do job após notificação ou sobre seu bloqueio em caminhos rejeitados.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 073

- **Código:** `        expect(result.response).toEqual({ ok: true });`
- **Função:** Verifica o payload final devolvido pelo router/action.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 074

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** sucesso com job persistido após troca de currentBatchId.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 075

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 076

- **Código:** `    test('rejeita erro cuja identidade diverge do job persistido', async () => {`
- **Função:** Declara o cenário: rejeição por identidade divergente.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 077

- **Código:** `        const router = loadRouter();`
- **Função:** Carrega router + action reais para este cenário.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 078

- **Código:** `        const finalizeJob = jest.fn();`
- **Função:** Cria boundary observável da finalização; a suíte verifica se report-error a chama ou bloqueia.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 079

- **Código:** `        const job = {`
- **Função:** Monta o job persistido que assertJobOwnership devolverá como identidade canônica/autorizada.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 080

- **Código:** `            jobId: 'job-4',`
- **Função:** Fixa o identificador do job usado na validação e ownership.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 081

- **Código:** `            batchId: 'batch-real',`
- **Função:** Fixa o batch real para contrastá-lo com o batch forjado recebido.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 082

- **Código:** `            mangaTabId: 31,`
- **Função:** Fixa a aba do mangá associada ao job/request e usada no envio de erro/finalização.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 083

- **Código:** `            index: 4,`
- **Função:** Fixa o índice de imagem esperado no job e no payload.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 084

- **Código:** `        };`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 085

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 086

- **Código:** `        const result = await dispatch(`
- **Função:** Envia GEMINI_ERROR pelo router real e aguarda a resposta normalizada.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa router/action reais; as assertions subsequentes fixam os efeitos.

### Linha 087

- **Código:** `            router.createMessageRouter({`
- **Função:** Cria o listener do router real com contexto controlado pelo teste.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 088

- **Código:** `                contextFactory: () => ({`
- **Função:** Injeta dependências/estado necessários à action sem substituir a própria action.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 089

- **Código:** `                    state: {},`
- **Função:** Compõe o bloco rejeição por identidade divergente, preparando, executando ou observando a action real.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 090

- **Código:** `                    ensureInitialized: jest.fn().mockResolvedValue(),`
- **Função:** Fornece o gate de reidratação que a action aguarda antes de consultar ownership.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 091

- **Código:** `                    finalizeJob,`
- **Função:** Compõe o bloco rejeição por identidade divergente, preparando, executando ou observando a action real.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 092

- **Código:** `                    log: jest.fn(),`
- **Função:** Fornece logger; esta suíte não usa seu conteúdo como assertion focal.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 093

- **Código:** `                    assertJobOwnership: (_sender, _jobId, callback) =>`
- **Função:** Simula o boundary de ownership retornando posse/tab/job controlados para isolar a lógica da action.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 094

- **Código:** `                        callback(true, 17, job),`
- **Função:** Autoriza o sender e devolve tabId canônico 17 + job persistido.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 095

- **Código:** `                    storage: { get: jest.fn() },`
- **Função:** Injeta leitura de storage usada pela action após validar ownership/identidade.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 096

- **Código:** `                }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 097

- **Código:** `            }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 098

- **Código:** `            {`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 099

- **Código:** `                action: 'GEMINI_ERROR',`
- **Função:** Usa o nome legado que o router mapeia para a action canônica report-error.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 100

- **Código:** `                mangaTabId: 31,`
- **Função:** Fixa a aba do mangá associada ao job/request e usada no envio de erro/finalização.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 101

- **Código:** `                index: 4,`
- **Função:** Fixa o índice de imagem esperado no job e no payload.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 102

- **Código:** `                error: 'Falhou',`
- **Função:** Fornece texto de erro válido a ser encaminhado à UI integrada.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 103

- **Código:** `                jobId: 'job-4',`
- **Função:** Fixa o identificador do job usado na validação e ownership.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 104

- **Código:** `                batchId: 'batch-forjado',`
- **Função:** Fornece batch diferente do job persistido para exercitar o ramo job_identity_mismatch.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 105

- **Código:** `            },`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 106

- **Código:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Função:** Representa a aba remetente que o stub de ownership reconhece como dona no cenário.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 107

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 108

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 109

- **Código:** `        expect(result.response).toEqual({ ok: false, reason: 'job_identity_mismatch' });`
- **Função:** Verifica o payload final devolvido pelo router/action.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 110

- **Código:** `        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();`
- **Função:** Assertion focal sobre presença/ausência da notificação à aba do mangá.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 111

- **Código:** `        expect(finalizeJob).not.toHaveBeenCalled();`
- **Função:** Assertion focal sobre a finalização do job após notificação ou sobre seu bloqueio em caminhos rejeitados.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 112

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por identidade divergente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 113

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 114

- **Código:** `    test('não notifica nem finaliza quando ownership falha', async () => {`
- **Função:** Declara o cenário: rejeição por ownership.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 115

- **Código:** `        const router = loadRouter();`
- **Função:** Carrega router + action reais para este cenário.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 116

- **Código:** `        const finalizeJob = jest.fn();`
- **Função:** Cria boundary observável da finalização; a suíte verifica se report-error a chama ou bloqueia.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 117

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 118

- **Código:** `        const result = await dispatch(`
- **Função:** Envia GEMINI_ERROR pelo router real e aguarda a resposta normalizada.
- **Contexto:** rejeição por ownership.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa router/action reais; as assertions subsequentes fixam os efeitos.

### Linha 119

- **Código:** `            router.createMessageRouter({`
- **Função:** Cria o listener do router real com contexto controlado pelo teste.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 120

- **Código:** `                contextFactory: () => ({`
- **Função:** Injeta dependências/estado necessários à action sem substituir a própria action.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 121

- **Código:** `                    state: {},`
- **Função:** Compõe o bloco rejeição por ownership, preparando, executando ou observando a action real.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 122

- **Código:** `                    ensureInitialized: jest.fn().mockResolvedValue(),`
- **Função:** Fornece o gate de reidratação que a action aguarda antes de consultar ownership.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 123

- **Código:** `                    finalizeJob,`
- **Função:** Compõe o bloco rejeição por ownership, preparando, executando ou observando a action real.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 124

- **Código:** `                    log: jest.fn(),`
- **Função:** Fornece logger; esta suíte não usa seu conteúdo como assertion focal.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 125

- **Código:** `                    assertJobOwnership: (_sender, _jobId, callback) =>`
- **Função:** Simula o boundary de ownership retornando posse/tab/job controlados para isolar a lógica da action.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 126

- **Código:** `                        callback(false, 18, null),`
- **Função:** Simula falha de ownership, sem job persistido, para provar bloqueio antes de efeitos.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 127

- **Código:** `                    storage: { get: jest.fn() },`
- **Função:** Injeta leitura de storage usada pela action após validar ownership/identidade.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 128

- **Código:** `                }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 129

- **Código:** `            }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 130

- **Código:** `            {`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 131

- **Código:** `                action: 'GEMINI_ERROR',`
- **Função:** Usa o nome legado que o router mapeia para a action canônica report-error.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 132

- **Código:** `                mangaTabId: 31,`
- **Função:** Fixa a aba do mangá associada ao job/request e usada no envio de erro/finalização.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 133

- **Código:** `                index: 4,`
- **Função:** Fixa o índice de imagem esperado no job e no payload.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 134

- **Código:** `                error: 'Falhou',`
- **Função:** Fornece texto de erro válido a ser encaminhado à UI integrada.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 135

- **Código:** `                jobId: 'job-4',`
- **Função:** Fixa o identificador do job usado na validação e ownership.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 136

- **Código:** `            },`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 137

- **Código:** `            { tab: { id: 18, url: 'https://gemini.google.com/app' } }`
- **Função:** Representa remetente que o stub de ownership rejeita.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 138

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 139

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 140

- **Código:** `        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();`
- **Função:** Assertion focal sobre presença/ausência da notificação à aba do mangá.
- **Contexto:** rejeição por ownership.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 141

- **Código:** `        expect(finalizeJob).not.toHaveBeenCalled();`
- **Função:** Assertion focal sobre a finalização do job após notificação ou sobre seu bloqueio em caminhos rejeitados.
- **Contexto:** rejeição por ownership.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 142

- **Código:** `        expect(result.response).toEqual({ ok: false, reason: 'sender_mismatch' });`
- **Função:** Verifica o payload final devolvido pelo router/action.
- **Contexto:** rejeição por ownership.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 143

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 144

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 145

- **Código:** `    test.each([`
- **Função:** Declara o cenário: rejeição por ownership.
- **Contexto:** rejeição por ownership.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 146

- **Código:** `        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: 'Falhou' }, 'jobId é obrigatório'],`
- **Função:** Fixa a aba do mangá associada ao job/request e usada no envio de erro/finalização.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 147

- **Código:** `        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: '   ', jobId: 'job-4' }, 'erro inválido'],`
- **Função:** Fixa o identificador do job usado na validação e ownership.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 148

- **Código:** `        [{ action: 'GEMINI_ERROR', mangaTabId: 31, index: 4, error: 'x'.repeat(4097), jobId: 'job-4' }, 'erro inválido'],`
- **Função:** Fixa o identificador do job usado na validação e ownership.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 149

- **Código:** `    ])('rejeita payload inválido antes de reidratar ou finalizar', async (request, message) => {`
- **Função:** Compõe o bloco validação parametrizada de payload, preparando, executando ou observando a action real.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 150

- **Código:** `        const router = loadRouter();`
- **Função:** Carrega router + action reais para este cenário.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 151

- **Código:** `        const ensureInitialized = jest.fn();`
- **Função:** Fornece o gate de reidratação que a action aguarda antes de consultar ownership.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 152

- **Código:** `        const finalizeJob = jest.fn();`
- **Função:** Cria boundary observável da finalização; a suíte verifica se report-error a chama ou bloqueia.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 153

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 154

- **Código:** `        const result = await dispatch(`
- **Função:** Envia GEMINI_ERROR pelo router real e aguarda a resposta normalizada.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** ✅ PROVADO DIRETAMENTE — executa router/action reais; as assertions subsequentes fixam os efeitos.

### Linha 155

- **Código:** `            router.createMessageRouter({`
- **Função:** Cria o listener do router real com contexto controlado pelo teste.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 156

- **Código:** `                contextFactory: () => ({`
- **Função:** Injeta dependências/estado necessários à action sem substituir a própria action.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 157

- **Código:** `                    state: {},`
- **Função:** Compõe o bloco validação parametrizada de payload, preparando, executando ou observando a action real.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 158

- **Código:** `                    ensureInitialized,`
- **Função:** Fornece o gate de reidratação que a action aguarda antes de consultar ownership.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 159

- **Código:** `                    finalizeJob,`
- **Função:** Compõe o bloco validação parametrizada de payload, preparando, executando ou observando a action real.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 160

- **Código:** `                    assertJobOwnership: jest.fn(),`
- **Função:** Simula o boundary de ownership retornando posse/tab/job controlados para isolar a lógica da action.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 161

- **Código:** `                    storage: { get: jest.fn() },`
- **Função:** Injeta leitura de storage usada pela action após validar ownership/identidade.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 162

- **Código:** `                }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 163

- **Código:** `            }),`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 164

- **Código:** `            request,`
- **Função:** Compõe o bloco validação parametrizada de payload, preparando, executando ou observando a action real.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 165

- **Código:** `            { tab: { id: 17, url: 'https://gemini.google.com/app' } }`
- **Função:** Representa a aba remetente que o stub de ownership reconhece como dona no cenário.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 166

- **Código:** `        );`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 167

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos e não produz efeito em runtime.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 168

- **Código:** `        expect(ensureInitialized).not.toHaveBeenCalled();`
- **Função:** Fornece o gate de reidratação que a action aguarda antes de consultar ownership.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 169

- **Código:** `        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();`
- **Função:** Assertion focal sobre presença/ausência da notificação à aba do mangá.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 170

- **Código:** `        expect(finalizeJob).not.toHaveBeenCalled();`
- **Função:** Assertion focal sobre a finalização do job após notificação ou sobre seu bloqueio em caminhos rejeitados.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 171

- **Código:** `        expect(result.response).toEqual({`
- **Função:** Verifica o payload final devolvido pelo router/action.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion focal do próprio cenário.

### Linha 172

- **Código:** `            ok: false,`
- **Função:** Compõe o bloco validação parametrizada de payload, preparando, executando ou observando a action real.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 173

- **Código:** `            error: { code: 'INVALID_PAYLOAD', message },`
- **Função:** Exige código estruturado de erro do validator.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 174

- **Código:** `        });`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 175

- **Código:** `    });`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** validação parametrizada de payload.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Linha 176

- **Código:** `});`
- **Função:** Fecha/organiza o bloco sintático iniciado anteriormente.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de cenário verde sem prova exclusiva nesta linha.

### Posição 177 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato textual POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — o conteúdo recuperado termina em `\n`.

## 13. Conclusão documental

A Bíblia preserva a fonte integral e documenta as 176 linhas textuais mais a posição 177 do newline final. O blob foi reencontrado no CI em Node 20 e Node 22, com seis execuções efetivas desta suíte passando.

As lacunas abertas não contradizem as provas existentes: elas delimitam branches independentes de identidade, precedência dos dados persistidos e boundaries do validator que ainda não possuem assertion focal.

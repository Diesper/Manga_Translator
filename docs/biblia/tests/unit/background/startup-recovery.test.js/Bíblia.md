# Bíblia técnica — tests/unit/background/startup-recovery.test.js

> **Estado documental:** ✅ CONCLUÍDA — com alerta de validade do teste  
> **SHA auditado:** 649829ac36bb9428c9458c615365970349b741a1  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest histórica de recovery; atualmente não executa a implementação de produção  
> **Linhas textuais:** 111  
> **Posições documentais:** 112, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Conclusão principal da auditoria

Apesar do nome startup-recovery.test.js e dos comentários afirmarem que a suíte testa onStartup de background.js, **o arquivo não importa nem carrega background.js**. Ele usa apenas storage mock, constrói manualmente um objeto corrected e define um createStopBatchHandler local.

Por isso, o CI verde desta suíte prova que as operações JavaScript locais e o mock de storage funcionam; não prova o recovery do Service Worker nem STOP_BATCH de produção.

## 2. Divergência semântica com o código atual

O primeiro caso diz que deve resetar isProcessing para false mesmo com jobQueue contendo trabalho. O onStartup atual faz restoreState, reconciliation e depois recomputa isProcessing como Boolean(currentBatch ainda pendente OR jobQueue.length>0 OR activeJobsCount>0).

Assim, se a fila permanece com um job, o contrato atual tende a manter isProcessing=true e chamar processNextJob, não forçar false. A linha corrected = {..., isProcessing:false, activeJobsCount:0} é uma correção histórica fabricada pelo teste e não representa mais o algoritmo atual.

## 3. STOP_BATCH local não é prova de syncState

createStopBatchHandler só verifica request.action, chama sendResponse({ok:true}) e retorna true. Ele não altera isProcessing, não chama syncState e não manipula jobs. O último teste, apesar do título, verifica apenas que sendResponse recebeu ok:true.

A produção real de STOP_BATCH está coberta em batch-lifecycle-real.test.js, que despacha pelo background real e exige mt_state com isProcessing:false, currentBatchId:null, activeJobsCount:0 e limpeza de tabs/jobs/watchdogs.

## 4. Cobertura real externa existente

lifecycle-alarms-real.test.js simula runtime.onStartup no background real. BG-68/BG-69 prova fila vazia com isProcessing:false, activeJobsCount:0, extractionTabs limpo e nenhuma nova tab. BG-69b cobre lote já concluído. process-finalize-real também usa onStartup para reconciliação de finalização durável.

Portanto o problema principal deste arquivo é **qualidade e veracidade do teste local**, não ausência total de cobertura de produção no repositório.

## 5. Quatro casos efetivos

1. O primeiro grava/le mt_state e constrói corrected manualmente. Não chama production startup.

2. O segundo demonstra que {isProcessing:true,activeJobsCount:0} é uma combinação possível em JavaScript. É uma tautologia sem ligação com runtime state.

3. O terceiro grava/le estado vazio e confirma valores que ele próprio armazenou.

4. O quarto invoca um mirror STOP_BATCH local que apenas responde ok; não prova zerar isProcessing.

## 6. Evidência CI exata

O run 36521561968, commit e720890cf34dc9437ee91f3b8172953497d69870, contém exatamente o blob 649829ac36bb9428c9458c615365970349b741a1. Os quatro casos aparecem com ✓ em Node 20.x (109255348388) e Node 22.x (109255348406); ambos fecham 109/109 suítes e 851/851 testes. CI Gate 109256050280: sucesso.

**Interpretação obrigatória:** CI verde aqui é evidência de execução do arquivo, não evidência do onStartup/STOP_BATCH real.

## 7. Matriz de evidência

| Afirmação | O que o arquivo realmente prova | Classificação |
|---|---|---|
| storage pode conter isProcessing=true/activeJobsCount=2 | set/get do mock | ✅ PROVADO DIRETAMENTE — mock |
| objeto local pode ser reescrito para false/0 | spread literal local | ✅ PROVADO DIRETAMENTE — local |
| onStartup real força false com jobQueue não vazia | background não é carregado; contrato atual difere | ⚠️ NÃO PROVADO / SEMÂNTICA DESATUALIZADA |
| isProcessing e contador são campos independentes | objetos literais | ✅ PROVADO DIRETAMENTE — tautologia local |
| fila vazia preserva false | apenas storage mock | ⚠️ NÃO PROVA PRODUÇÃO neste arquivo |
| STOP_BATCH real zera isProcessing via syncState | mirror não altera estado | ⚠️ NÃO PROVADO neste arquivo |
| startup real com fila vazia | lifecycle-alarms-real externo | ✅ PROVADO DIRETAMENTE — externo |
| STOP_BATCH real limpa estado | batch-lifecycle-real externo | ✅ PROVADO DIRETAMENTE — externo |

## 8. Solicitações ao auditor

### 168-001 — TEST_REWRITE_REQUIRED — OPEN — HIGH

Encontrado: o teste principal de recovery não executa background.js e sua expectativa histórica de isProcessing=false com jobQueue não vazia diverge do onStartup atual, que recomputa isProcessing=true quando há trabalho a continuar.

Ação solicitada: substituir a construção manual corrected por cenário com loadBackgroundModule + runtimeMock._simulateStartup, definindo explicitamente o estado esperado segundo a regra atual (fila corrente, currentBatchId, completionClaimedBatchId, jobIndex/reconciliation).

Evidência esperada: assertions no mt_state persistido e no __getState após startup real, incluindo se processNextJob deve ou não ser acionado.

Risco: a suíte pode permanecer verde enquanto documentação e expectativas contam uma história oposta ao código de produção.

### 168-002 — TEST_REWRITE_REQUIRED — OPEN — HIGH

Encontrado: o teste STOP_BATCH usa createStopBatchHandler local que apenas responde ok e não toca isProcessing/syncState, apesar do título dizer que prova o reset.

Ação solicitada: remover o mirror ou convertê-lo em dispatch ao background real; exigir state pós-STOP. Como batch-lifecycle-real já prova esse fluxo, também é aceitável eliminar este caso redundante e referenciar a cobertura canônica.

Risco: falso senso de cobertura sobre uma transição crítica de lote.

### 168-003 — TEST_MAINTENANCE — OPEN — LOW

Encontrado: fs e getRuntimeMock são importados mas não usados; o comentário histórico de 'CORRECAO' descreve algoritmo antigo e deve ser atualizado junto da reescrita.

Ação solicitada: remover imports mortos e reescrever cabeçalho para explicar a semântica atual/referenciar as suítes reais.

Risco: manutenção confusa e leitores tratando comentário histórico como contrato vigente.

## 9. Fonte integral auditada

```javascript
/**
 * startup-recovery.test.js
 * Testa o recovery de estado no onStartup do background.js (MELHORIA #3).
 *
 * PROBLEMA ORIGINAL: restoreState() podia restaurar isProcessing=true do
 * storage, mas onStartup zerava apenas activeJobsCount, deixando
 * isProcessing como true. Isso causava inconsistencia de estado.
 *
 * CORRECAO: isProcessing = false adicionado junto com activeJobsCount = 0
 * no handler de onStartup.
 *
 * CORRECAO DO TESTE (v3.2):
 * O beforeEach original usava jest.useFakeTimers() globalmente. O problema:
 * ChromeStorageMock usa setTimeout(..., 0) internamente. Com fake timers,
 * esses timeouts NUNCA disparam, as Promises de storageMock.set/get NUNCA
 * resolvem, todos os testes async travavam com "Exceeded timeout".
 * Solucao: remover jest.useFakeTimers() global.
 *
 * O teste STOP_BATCH usava runtimeMock._messageListeners mas background.js
 * nunca e carregado -> lista vazia -> sendResponse nunca chamado.
 * Corrigido com mirror handler local.
 */

const path = require('path');
const fs   = require('fs');
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock, getRuntimeMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

function createStopBatchHandler() {
    return function handleStopBatch(request, sender, sendResponse) {
        if (request.action !== 'STOP_BATCH') return false;
        sendResponse({ ok: true });
        return true;
    };
}

describe('onStartup Recovery — isProcessing Reset (MELHORIA #3)', () => {

    test('deve resetar isProcessing para false mesmo que storage tenha isProcessing=true', async () => {
        const storageMock = getStorageMock();

        await storageMock.set({
            mt_state: {
                jobQueue: [{ mangaTabId: 1, index: 0, prompt: 'test' }],
                isProcessing: true,
                stopRequested: false,
                activeMangaTabId: 1,
                extractionTabs: {},
                totalJobs: 1,
                completedJobs: 0,
                activeJobsCount: 2,
            }
        });

        const state = await storageMock.get(['mt_state']);
        expect(state.mt_state.isProcessing).toBe(true);
        expect(state.mt_state.activeJobsCount).toBe(2);

        const corrected = {
            ...state.mt_state,
            isProcessing: false,
            activeJobsCount: 0,
        };

        expect(corrected.isProcessing).toBe(false);
        expect(corrected.activeJobsCount).toBe(0);
        expect(corrected.jobQueue.length).toBe(1);
    });

    test('isProcessing e activeJobsCount sao semanticamente independentes', () => {
        const incompleteReset = { isProcessing: true, activeJobsCount: 0 };
        expect(incompleteReset.isProcessing && incompleteReset.activeJobsCount === 0).toBe(true);

        const completeReset = { isProcessing: false, activeJobsCount: 0 };
        expect(completeReset.isProcessing).toBe(false);
        expect(completeReset.activeJobsCount).toBe(0);
    });

    test('nao deve modificar isProcessing se jobQueue e activeJobsCount sao zero', async () => {
        const storageMock = getStorageMock();

        await storageMock.set({
            mt_state: {
                jobQueue: [],
                isProcessing: false,
                activeJobsCount: 0,
                stopRequested: false,
            }
        });

        const state = await storageMock.get(['mt_state']);
        expect(state.mt_state.isProcessing).toBe(false);
        expect(state.mt_state.jobQueue.length).toBe(0);
    });

    test('STOP_BATCH tambem deve zerar isProcessing implicitamente via syncState', async () => {
        const storageMock = getStorageMock();
        const sendResponse = jest.fn();

        await storageMock.set({
            mt_state: { jobQueue: [], isProcessing: true, activeJobsCount: 0 }
        });

        const handler = createStopBatchHandler();
        handler({ action: 'STOP_BATCH' }, { tab: { id: 1 } }, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });
});
```

## 10. Auditoria linha a linha

### Linha 001

- **Código:** `/**`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 002

- **Código:** ` * startup-recovery.test.js`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 003

- **Código:** ` * Testa o recovery de estado no onStartup do background.js (MELHORIA #3).`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 004

- **Código:** ` *`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 005

- **Código:** ` * PROBLEMA ORIGINAL: restoreState() podia restaurar isProcessing=true do`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 006

- **Código:** ` * storage, mas onStartup zerava apenas activeJobsCount, deixando`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 007

- **Código:** ` * isProcessing como true. Isso causava inconsistencia de estado.`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 008

- **Código:** ` *`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 009

- **Código:** ` * CORRECAO: isProcessing = false adicionado junto com activeJobsCount = 0`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 010

- **Código:** ` * no handler de onStartup.`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 011

- **Código:** ` *`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 012

- **Código:** ` * CORRECAO DO TESTE (v3.2):`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 013

- **Código:** ` * O beforeEach original usava jest.useFakeTimers() globalmente. O problema:`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 014

- **Código:** ` * ChromeStorageMock usa setTimeout(..., 0) internamente. Com fake timers,`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 015

- **Código:** ` * esses timeouts NUNCA disparam, as Promises de storageMock.set/get NUNCA`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — prova o mock de storage, não o recovery de produção.

### Linha 016

- **Código:** ` * resolvem, todos os testes async travavam com "Exceeded timeout".`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 017

- **Código:** ` * Solucao: remover jest.useFakeTimers() global.`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 018

- **Código:** ` *`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 019

- **Código:** ` * O teste STOP_BATCH usava runtimeMock._messageListeners mas background.js`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 020

- **Código:** ` * nunca e carregado -> lista vazia -> sendResponse nunca chamado.`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 021

- **Código:** ` * Corrigido com mirror handler local.`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** comentário histórico do teste.
- **Evidência:** ⚠️ DOCUMENTAÇÃO HISTÓRICA — não deve ser tratada como prova do comportamento atual.

### Linha 022

- **Código:** ` */`
- **Função:** Comentário histórico que descreve a intenção original; nesta revisão parte dele não corresponde mais ao contrato atual de produção.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 023

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 024

- **Código:** `const path = require('path');`
- **Função:** Importa fs, mas não há uso no arquivo auditado.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 025

- **Código:** `const fs   = require('fs');`
- **Função:** Importa findRepoRoot para descobrir a raiz do repositório.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 026

- **Código:** `const { findRepoRoot } = require('../../helpers/repo-root');`
- **Função:** Calcula ROOT a partir de __dirname.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 027

- **Código:** `const ROOT = findRepoRoot(__dirname);`
- **Função:** Compõe o cenário imports sem carregar a implementação real do background.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 028

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** imports.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 029

- **Código:** `const { getStorageMock, getRuntimeMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));`
- **Função:** Obtém storage simulado; isso testa persistência do mock, não o handler onStartup.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 030

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** mirror local de STOP_BATCH.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 031

- **Código:** `function createStopBatchHandler() {`
- **Função:** Define handler local que imita somente uma resposta ok de STOP_BATCH; não é a implementação do background.
- **Contexto:** mirror local de STOP_BATCH.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO DE PRODUÇÃO — lógica criada dentro do próprio teste.

### Linha 032

- **Código:** `    return function handleStopBatch(request, sender, sendResponse) {`
- **Função:** Compõe o cenário mirror local de STOP_BATCH sem carregar a implementação real do background.
- **Contexto:** mirror local de STOP_BATCH.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 033

- **Código:** `        if (request.action !== 'STOP_BATCH') return false;`
- **Função:** Filtra action no mirror local.
- **Contexto:** mirror local de STOP_BATCH.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 034

- **Código:** `        sendResponse({ ok: true });`
- **Função:** Mirror responde ok sem alterar isProcessing/storage/syncState.
- **Contexto:** mirror local de STOP_BATCH.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 035

- **Código:** `        return true;`
- **Função:** Compõe o cenário mirror local de STOP_BATCH sem carregar a implementação real do background.
- **Contexto:** mirror local de STOP_BATCH.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 036

- **Código:** `    };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 037

- **Código:** `}`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 038

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 039

- **Código:** `describe('onStartup Recovery — isProcessing Reset (MELHORIA #3)', () => {`
- **Função:** Abre suíte chamada onStartup Recovery, embora não carregue background.js.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 040

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 041

- **Código:** `    test('deve resetar isProcessing para false mesmo que storage tenha isProcessing=true', async () => {`
- **Função:** Declara cenário: teste local de reset fabricado.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 042

- **Código:** `        const storageMock = getStorageMock();`
- **Função:** Obtém storage simulado; isso testa persistência do mock, não o handler onStartup.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 043

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 044

- **Código:** `        await storageMock.set({`
- **Função:** Persiste fixture mt_state no mock.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — prova o mock de storage, não o recovery de produção.

### Linha 045

- **Código:** `            mt_state: {`
- **Função:** Compõe o cenário teste local de reset fabricado sem carregar a implementação real do background.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 046

- **Código:** `                jobQueue: [{ mangaTabId: 1, index: 0, prompt: 'test' }],`
- **Função:** Fixture contém trabalho pendente, condição que no código atual faz isProcessing ser recomputado como true após startup.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 047

- **Código:** `                isProcessing: true,`
- **Função:** Configura flag antiga true no snapshot armazenado.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 048

- **Código:** `                stopRequested: false,`
- **Função:** Parte da fixture local armazenada.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 049

- **Código:** `                activeMangaTabId: 1,`
- **Função:** Compõe o cenário teste local de reset fabricado sem carregar a implementação real do background.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 050

- **Código:** `                extractionTabs: {},`
- **Função:** Compõe o cenário teste local de reset fabricado sem carregar a implementação real do background.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 051

- **Código:** `                totalJobs: 1,`
- **Função:** Compõe o cenário teste local de reset fabricado sem carregar a implementação real do background.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 052

- **Código:** `                completedJobs: 0,`
- **Função:** Compõe o cenário teste local de reset fabricado sem carregar a implementação real do background.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 053

- **Código:** `                activeJobsCount: 2,`
- **Função:** Configura contador antigo não zero, mas nenhum reconcile real é executado.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 054

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 055

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 056

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 057

- **Código:** `        const state = await storageMock.get(['mt_state']);`
- **Função:** Relê o mesmo snapshot do mock para assertions locais.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — prova o mock de storage, não o recovery de produção.

### Linha 058

- **Código:** `        expect(state.mt_state.isProcessing).toBe(true);`
- **Função:** Prova somente o conteúdo gravado/lido no mock.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 059

- **Código:** `        expect(state.mt_state.activeJobsCount).toBe(2);`
- **Função:** Prova somente o conteúdo gravado/lido no mock.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 060

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 061

- **Código:** `        const corrected = {`
- **Função:** Cria manualmente um objeto corrigido no próprio teste; não chama código de produção.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO DE PRODUÇÃO — lógica criada dentro do próprio teste.

### Linha 062

- **Código:** `            ...state.mt_state,`
- **Função:** Copia fixture do mock para o objeto local corrected.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 063

- **Código:** `            isProcessing: false,`
- **Função:** Força manualmente false no objeto local; hoje isso contradiz o startup real quando jobQueue permanece não vazia.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 064

- **Código:** `            activeJobsCount: 0,`
- **Função:** Força manualmente zero no objeto local, sem reconcile real.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 065

- **Código:** `        };`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 066

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 067

- **Código:** `        expect(corrected.isProcessing).toBe(false);`
- **Função:** Assertion sobre objeto construído pelo próprio teste, não sobre background.js.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 068

- **Código:** `        expect(corrected.activeJobsCount).toBe(0);`
- **Função:** Assertion sobre objeto construído pelo próprio teste, não sobre background.js.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 069

- **Código:** `        expect(corrected.jobQueue.length).toBe(1);`
- **Função:** Assertion sobre objeto construído pelo próprio teste, não sobre background.js.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 070

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** teste local de reset fabricado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 071

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 072

- **Código:** `    test('isProcessing e activeJobsCount sao semanticamente independentes', () => {`
- **Função:** Declara cenário: demonstração semântica local.
- **Contexto:** demonstração semântica local.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 073

- **Código:** `        const incompleteReset = { isProcessing: true, activeJobsCount: 0 };`
- **Função:** Configura flag antiga true no snapshot armazenado.
- **Contexto:** demonstração semântica local.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 074

- **Código:** `        expect(incompleteReset.isProcessing && incompleteReset.activeJobsCount === 0).toBe(true);`
- **Função:** Cria exemplo JavaScript puro para demonstrar independência booleana.
- **Contexto:** demonstração semântica local.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 075

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** demonstração semântica local.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 076

- **Código:** `        const completeReset = { isProcessing: false, activeJobsCount: 0 };`
- **Função:** Força manualmente false no objeto local; hoje isso contradiz o startup real quando jobQueue permanece não vazia.
- **Contexto:** demonstração semântica local.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 077

- **Código:** `        expect(completeReset.isProcessing).toBe(false);`
- **Função:** Cria segundo exemplo local, novamente sem produção.
- **Contexto:** demonstração semântica local.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 078

- **Código:** `        expect(completeReset.activeJobsCount).toBe(0);`
- **Função:** Cria segundo exemplo local, novamente sem produção.
- **Contexto:** demonstração semântica local.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 079

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** demonstração semântica local.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 080

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 081

- **Código:** `    test('nao deve modificar isProcessing se jobQueue e activeJobsCount sao zero', async () => {`
- **Função:** Declara cenário: storage vazio sem produção.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 082

- **Código:** `        const storageMock = getStorageMock();`
- **Função:** Obtém storage simulado; isso testa persistência do mock, não o handler onStartup.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 083

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 084

- **Código:** `        await storageMock.set({`
- **Função:** Persiste fixture mt_state no mock.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — prova o mock de storage, não o recovery de produção.

### Linha 085

- **Código:** `            mt_state: {`
- **Função:** Compõe o cenário storage vazio sem produção sem carregar a implementação real do background.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 086

- **Código:** `                jobQueue: [],`
- **Função:** Fixture de storage sem fila ativa.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 087

- **Código:** `                isProcessing: false,`
- **Função:** Força manualmente false no objeto local; hoje isso contradiz o startup real quando jobQueue permanece não vazia.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 088

- **Código:** `                activeJobsCount: 0,`
- **Função:** Força manualmente zero no objeto local, sem reconcile real.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 089

- **Código:** `                stopRequested: false,`
- **Função:** Parte da fixture local armazenada.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 090

- **Código:** `            }`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 091

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 092

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 093

- **Código:** `        const state = await storageMock.get(['mt_state']);`
- **Função:** Relê o mesmo snapshot do mock para assertions locais.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — prova o mock de storage, não o recovery de produção.

### Linha 094

- **Código:** `        expect(state.mt_state.isProcessing).toBe(false);`
- **Função:** Prova somente o conteúdo gravado/lido no mock.
- **Contexto:** storage vazio sem produção.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 095

- **Código:** `        expect(state.mt_state.jobQueue.length).toBe(0);`
- **Função:** Prova somente o conteúdo gravado/lido no mock.
- **Contexto:** storage vazio sem produção.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 096

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** storage vazio sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 097

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 098

- **Código:** `    test('STOP_BATCH tambem deve zerar isProcessing implicitamente via syncState', async () => {`
- **Função:** Declara cenário: STOP_BATCH mirror sem produção.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 099

- **Código:** `        const storageMock = getStorageMock();`
- **Função:** Obtém storage simulado; isso testa persistência do mock, não o handler onStartup.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 100

- **Código:** `        const sendResponse = jest.fn();`
- **Função:** Cria spy para o mirror STOP_BATCH local.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 101

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 102

- **Código:** `        await storageMock.set({`
- **Função:** Persiste fixture mt_state no mock.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — prova o mock de storage, não o recovery de produção.

### Linha 103

- **Código:** `            mt_state: { jobQueue: [], isProcessing: true, activeJobsCount: 0 }`
- **Função:** Configura flag antiga true no snapshot armazenado.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 104

- **Código:** `        });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 105

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 106

- **Código:** `        const handler = createStopBatchHandler();`
- **Função:** Obtém o handler local definido no teste; não runtime listener do background.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO DE PRODUÇÃO — lógica criada dentro do próprio teste.

### Linha 107

- **Código:** `        handler({ action: 'STOP_BATCH' }, { tab: { id: 1 } }, sendResponse);`
- **Função:** Invoca mirror local diretamente.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 108

- **Código:** *(linha vazia)*
- **Função:** Separa blocos lógicos sem efeito em runtime.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 109

- **Código:** `        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));`
- **Função:** Prova apenas que o mirror respondeu ok.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** ✅ PROVADO DIRETAMENTE — mas somente sobre fixture/mirror local, não sobre background.js.

### Linha 110

- **Código:** `    });`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** STOP_BATCH mirror sem produção.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Linha 111

- **Código:** `});`
- **Função:** Fecha/organiza bloco sintático anterior.
- **Contexto:** estrutura.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — linha verde no CI, porém sem execução do background real.

### Posição 112 — newline final

- **Código:** newline final após a última linha textual.
- **Função:** encerra o arquivo em formato POSIX e integra o blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — a fonte termina em `\n`.

## 11. Conclusão documental

Foram documentadas 111 linhas textuais e a posição 112 do newline final. O arquivo passa no CI, mas sua força probatória sobre produção é explicitamente limitada: a cobertura canônica de startup/STOP_BATCH vive em suítes que carregam o background real. As solicitações 168-001/002 devem corrigir a discrepância para que o nome e as assertions deste arquivo voltem a refletir o sistema atual.

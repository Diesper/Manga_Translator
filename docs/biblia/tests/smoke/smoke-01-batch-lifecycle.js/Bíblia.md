# Bíblia técnica — tests/smoke/smoke-01-batch-lifecycle.js

> **Estado documental:** ✅ AUTOAUDITORIA APROVADA PELO AGENTE 4  
> **SHA auditado:** `c412ccaac3c01de93b0a6362747525c48d79a765`  
> **Agente responsável:** AGENTE 4  
> **Tipo:** smoke test Node.js autônomo de lifecycle, predominantemente baseado em simulações locais  
> **Linhas textuais:** **134**  
> **Posições documentais:** **135**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural real

`tests/smoke/smoke-01-batch-lifecycle.js` é um script Node autônomo descoberto dinamicamente por `tests/smoke/run-smoke.js`, porque seu nome corresponde a `/^smoke-\d+.*\.js$/`. O runner ordena esses arquivos, cria um processo Node para cada um e reprova se qualquer subprocesso retornar status diferente de zero. `package.json#test:smoke` chama esse runner, e o workflow possui job **Smoke Tests** que executa `npm run test:smoke`. O baseline exige pelo menos **6 arquivos smoke**.

O arquivo declara cobrir cinco ideias: ownership, índice durável, STOP_BATCH isolado, ACK rápido e limite de concorrência. A auditoria mostra, porém, que ele **não carrega a implementação de produção** para esses contratos. Ele recria pequenos algoritmos locais e testa essas cópias. Portanto:

- as assertions são provas diretas da **simulação deste arquivo**;
- elas não devem ser usadas como prova direta de `jobs-lifecycle.js`, `state.js`, `jobs-dom-ack.js` ou do handler real de STOP_BATCH;
- alguns comportamentos reais são cobertos de forma mais forte em suítes unitárias que carregam os módulos/background reais;
- existe uma divergência concreta e atual entre a simulação de ownership e a produção.

O GitHub Actions run **#2290**, criado para o commit que iniciou este state, foi cancelado pela alta taxa de novos commits no branch antes de produzir jobs; por isso esta Bíblia **não afirma** que o SHA atual teve um run Smoke completo e verde durante esta auditoria.

## 2. Dependências e execução

### 2.1 Dependência direta

A única dependência importada é o built-in Node `assert`. Todo o restante é declarado dentro do próprio arquivo:

- `mockStorage`;
- `mockChrome`;
- cópia local de `assertJobOwnership`;
- array local `jobIndex`;
- cópias locais de `indexAddJob`, `indexRemoveJob`, `indexJobsOfBatch`;
- `deliverResultSimulated` com `setTimeout(20)`;
- fila/contador locais para concorrência.

### 2.2 Descoberta pelo runner

`tests/smoke/run-smoke.js`:

1. lê o diretório `tests/smoke`;
2. mantém arquivos que casam com `smoke-\d+.*.js`;
3. ordena;
4. exige pelo menos `baseline.smoke.minFiles = 6`;
5. faz `spawnSync(process.execPath, [arquivo])`;
6. reprova se houver erro de spawn ou status não zero.

Isso garante **wiring estrutural/dinâmico** quando `test:smoke` é executado, mas não transforma cópias locais em testes da implementação real.

## 3. Comparação com a implementação real

### 3.1 Ownership — divergência confirmada

O smoke local contém:

`if (!jobId) { callback(true, tabId); return; }`

e a assertion rotulada “retrocompatibilidade” exige `true` para `jobId = null`.

A implementação real atual em `extension/background/jobs-lifecycle.js` contém:

`if (!jobId || senderTabId === null) return { owns: false, tabId: senderTabId, job: null };`

Portanto o contrato do smoke está **invertido** nesse caso. A documentação atual também afirma que a aba remetente deve possuir o `jobId` correspondente.

Além disso, a produção resolve aliases/canonical tab id e migração de identidade após TAB_REPLACED; o smoke não modela esses caminhos.

### 3.2 Índice “durável”

A implementação real de `extension/background/state.js` mantém `jobIndex` dentro do sistema de estado e participa da persistência/sincronização do worker. As três funções locais do smoke copiam parte da manipulação de array, mas:

- o `jobIndex` do smoke existe só em memória;
- o teste não chama `state.js`;
- não serializa/recarrega `mt_state`;
- não testa suspensão/recriação do Service Worker;
- `indexRemoveJob` do smoke nem preserva o retorno booleano existente na produção.

Logo, “índice durável” no log é uma descrição forte demais para o que é realmente testado.

### 3.3 STOP_BATCH

O smoke não dispara mensagem `STOP_BATCH`. Ele apenas:

1. filtra `jobIndex` local por `batch-A`;
2. chama diretamente `indexRemoveJob` para essas entradas;
3. verifica que B permaneceu.

Em contraste, `tests/unit/background/batch-lifecycle-real.test.js` carrega o background real e possui teste focal em que STOP_BATCH de lote antigo remove somente A e preserva tab, journal, watchdog, fila e `jobIndex` de B. `plan-missing-handlers-real.test.js` também prova remoção seletiva de lote pendente e limites/FIFO no fluxo real.

### 3.4 ACK

`deliverResultSimulated` não importa `jobs-dom-ack.js`, não chama `chrome.tabs.sendMessage` e não observa `chrome.runtime.lastError`. Ele fabrica uma resposta após 20 ms.

A implementação real:

- envia `UPDATE_IMAGE`;
- usa `expectAck: true`;
- controla `finalizeOnAck`;
- atualiza estado;
- trata `runtime.lastError`;
- possui timeout padrão de 30 s;
- diferencia `ack`, `ack_timeout`, rejeição da página e compatibilidade legada.

`tests/unit/background/jobs-dom-ack-staging.test.js` chama o módulo real e cobre ACK, staging sem finalização, timeout e erros. `message-handlers-real.test.js` também verifica mensagens reais com `expectAck: true`.

### 3.5 Concorrência

O smoke fixa `maxConcurrentJobs = 3` localmente e executa uma única chamada de `dispatchNext`. A produção lê `maxConcurrentJobs` de `chrome.storage.local`, atualiza `state._cachedMaxCon` e usa o estado de lifecycle para decidir dispatch.

Testes reais como `plan-missing-handlers-real.test.js`, `process-finalize-real.test.js` e `performance.test.js` exercitam o background/limite em contextos mais próximos do contrato real.

## 4. Evidência automatizada — classificação correta

| Comportamento alegado | O que este arquivo realmente prova | Classificação |
|---|---|---|
| aba local com registro e jobId correspondente retorna true | prova a cópia local de `assertJobOwnership` | ✅ PROVADO DIRETAMENTE — **somente simulação** |
| aba local sem registro retorna false | prova a cópia local | ✅ PROVADO DIRETAMENTE — **somente simulação** |
| jobId ausente é aceito | prova a regra local, mas contradiz produção atual | ✅ local + ⚠️ CONTRATO DIVERGENTE |
| jobIndex local separa A/B | prova filtros do array local | ✅ PROVADO DIRETAMENTE — **não durabilidade** |
| “STOP_BATCH” preserva B | não há STOP_BATCH real; há remoção manual local | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| ACK real não espera 1,5 s | mede apenas `setTimeout(20)` e payload fabricado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| maxConcurrentJobs real limita lifecycle | verifica apenas while local com limite literal 3 | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| módulo real de ACK | existe prova em `jobs-dom-ack-staging.test.js`, externa a este smoke | ✅ PROVADO DIRETAMENTE **na suíte externa**, não por este arquivo |
| STOP_BATCH real preserva outro lote | existe prova em testes background reais | ✅ PROVADO DIRETAMENTE **na suíte externa**, não por este arquivo |
| execução atual deste SHA na CI | run #2290 foi cancelado antes dos jobs | ⚠️ NÃO CONFIRMADO neste run |

## 5. Casos-limite e riscos

1. **Contrato de segurança obsoleto:** linha 29/51–53 aceita `jobId` ausente, enquanto produção rejeita.
2. **Falso verde por cópia:** uma regressão no código real não precisa alterar nenhuma função local deste smoke; o teste pode continuar verde.
3. **“Durável” sem persistência:** nenhuma suspensão, reload ou storage real participa do cenário.
4. **STOP_BATCH sem roteador:** tabs, watchdogs, journals, pendingBatches e contadores não participam.
5. **ACK artificial:** não existe mensagem real nem confirmação de DOM/persistência.
6. **Relógio de parede:** `elapsed < 500` pode falhar em runner sob carga e, inversamente, continuar verde mesmo que a implementação real reintroduza atraso.
7. **Flag morta:** `ackReceivedImmediately` recebe `true`, mas nunca é lida/assertada.
8. **Concorrência de uma única onda:** não há conclusão de job, liberação de slot nem segunda onda.
9. **Cópia incompleta do índice:** `indexRemoveJob` local não retorna booleano como produção.
10. **Branch sender sem tab:** existe na função local, mas nenhuma assertion específica o visita.

## 6. Solicitações ao auditor

Persistidas em `docs/biblia/.state/123.json`.

### 123-001 — TEST_CONTRACT_MISMATCH — HIGH

O smoke afirma e exige que `jobId = null` seja aceito; `jobs-lifecycle.js` real rejeita `!jobId`. Ação esperada: remover/atualizar a expectativa obsoleta e, preferencialmente, testar a implementação real de ownership em vez de cópia local.

### 123-002 — TEST_QUALITY — HIGH

Índice “durável”, STOP_BATCH, ACK e concorrência são simulações locais. Ação esperada: reestruturar este smoke para carregar módulos reais/harnesses existentes ou reduzir explicitamente seu escopo a sanity checks sem alegar prova de produção.

### 123-003 — FLAKINESS_REVIEW — NORMAL

O ACK usa `setTimeout(20)` + `Date.now()` + limiar `<500 ms`. Ação esperada: substituir medição de relógio por fake timers/controle determinístico ou pelo módulo real; remover a flag nunca assertada.

## 7. Invariantes documentais e de manutenção

1. Este arquivo é um smoke Node autônomo e deve continuar terminando com status não zero quando uma assertion falhar.
2. O runner deve continuar descobrindo o nome `smoke-01-*.js` quando `test:smoke` roda.
3. Nenhuma assertion local deve ser descrita como prova do código de produção sem import/load/spawn da implementação real.
4. Regras de segurança de ownership não devem ser duplicadas de forma divergente.
5. Se o smoke mantiver simulações, os nomes/logs devem deixar claro o escopo algorítmico local.
6. Teste de timing deve evitar dependência desnecessária de scheduler real.
7. O contrato de STOP_BATCH só é provado quando o handler/router/background real é exercitado.
8. “Durabilidade” exige prova de estado persistido/restaurado, não somente array local.
9. Concorrência real exige ligação a `maxConcurrentJobs`, estado ativo e liberação/continuação de slots.
10. Esta Bíblia vale para o blob `c412ccaac3c01de93b0a6362747525c48d79a765`.

## 8. Fonte integral exata

~~~javascript
/**
 * smoke-01-batch-lifecycle.js
 * Cobre: Limite de concorrência, ACK sem atraso fixo, índice durável,
 * rejeição de remetente estranho, STOP_BATCH isolado.
 */
'use strict';

const assert = require('assert');

console.log('[smoke-01] 1. Testando assertJobOwnership (rejeição de remetente estranho)...');

const mockStorage = {};
const mockChrome = {
    storage: {
        local: {
            get: (keys, cb) => {
                const res = {};
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(k => { if (k in mockStorage) res[k] = mockStorage[k]; });
                if (cb) cb(res);
                return Promise.resolve(res);
            }
        }
    }
};

function assertJobOwnership(sender, jobId, callback) {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    if (!jobId) { callback(true, tabId); return; }
    if (tabId === null) { callback(false, tabId); return; }
    mockChrome.storage.local.get([`gemini_job_${tabId}`], (data) => {
        const job = data && data[`gemini_job_${tabId}`];
        if (!job) { callback(false, tabId); return; }
        callback(job.jobId === jobId, tabId);
    });
}

// Configura o job da aba 10
mockStorage['gemini_job_10'] = { jobId: 'uuid-valido-10', batchId: 'batch-A' };

// Teste 1.1: Aba legítima deve ser aceita
assertJobOwnership({ tab: { id: 10 } }, 'uuid-valido-10', (owns) => {
    assert.strictEqual(owns, true, 'Dono legítimo deve ser aceito');
});

// Teste 1.2: Aba estranha tentando reivindicar o jobId deve ser rejeitada
assertJobOwnership({ tab: { id: 99 } }, 'uuid-valido-10', (owns) => {
    assert.strictEqual(owns, false, 'Remetente estranho deve ser rejeitado');
});

// Teste 1.3: Mensagem legada (sem jobId) deve ser aceita para retrocompatibilidade
assertJobOwnership({ tab: { id: 10 } }, null, (owns) => {
    assert.strictEqual(owns, true, 'Mensagem legada sem jobId deve ser aceita');
});
console.log('  -> assertJobOwnership OK');

console.log('[smoke-01] 2. Testando índice durável e STOP_BATCH isolado por batchId...');

let jobIndex = [];
function indexAddJob(entry) {
    jobIndex = jobIndex.filter(j => j && j.geminiTabId !== entry.geminiTabId);
    jobIndex.push(entry);
}
function indexRemoveJob(geminiTabId) {
    jobIndex = jobIndex.filter(j => j && j.geminiTabId !== geminiTabId);
}
function indexJobsOfBatch(batchId) {
    if (!batchId) return jobIndex.slice();
    return jobIndex.filter(j => j && j.batchId === batchId);
}

// Adiciona jobs de dois lotes distintos (batch-A e batch-B)
indexAddJob({ geminiTabId: 10, jobId: 'job-1', batchId: 'batch-A' });
indexAddJob({ geminiTabId: 11, jobId: 'job-2', batchId: 'batch-A' });
indexAddJob({ geminiTabId: 20, jobId: 'job-3', batchId: 'batch-B' });

assert.strictEqual(jobIndex.length, 3);
assert.strictEqual(indexJobsOfBatch('batch-A').length, 2);
assert.strictEqual(indexJobsOfBatch('batch-B').length, 1);

// Simula STOP_BATCH apenas para batch-A
const targetBatchId = 'batch-A';
const stoppedJobs = indexJobsOfBatch(targetBatchId);
stoppedJobs.forEach(j => indexRemoveJob(j.geminiTabId));

// Garante que o batch-B NÃO foi afetado
assert.strictEqual(jobIndex.length, 1, 'Apenas jobs do lote cancelado devem ser removidos');
assert.strictEqual(jobIndex[0].geminiTabId, 20);
assert.strictEqual(jobIndex[0].batchId, 'batch-B');
console.log('  -> Índice durável e STOP_BATCH isolado OK');

console.log('[smoke-01] 3. Testando handshake ACK sem delay fixo de 1.5s...');

let ackReceivedImmediately = false;
const startTime = Date.now();

function deliverResultSimulated(onAck) {
    // Simula envio de UPDATE_IMAGE com expectAck: true
    // O content script responde imediatamente com { ok: true, domApplied: true }
    setTimeout(() => {
        onAck({ ok: true, domApplied: true });
    }, 20);
}

deliverResultSimulated((resp) => {
    const elapsed = Date.now() - startTime;
    assert.strictEqual(resp.ok, true);
    assert.strictEqual(resp.domApplied, true);
    assert(elapsed < 500, `ACK deve resolver imediatamente em vez de esperar 1.5s (levou ${elapsed}ms)`);
    ackReceivedImmediately = true;
    console.log(`  -> Handshake ACK resolvido em ${elapsed}ms (sem atraso fixo de 1,5 s)`);

    console.log('[smoke-01] 4. Testando respeito ao limite de concorrência...');
    const maxConcurrentJobs = 3;
    let activeCount = 0;
    const dispatched = [];
    const queue = [1, 2, 3, 4, 5, 6, 7];

    function dispatchNext() {
        while (activeCount < maxConcurrentJobs && queue.length > 0) {
            const item = queue.shift();
            activeCount++;
            dispatched.push(item);
        }
    }

    dispatchNext();
    assert.strictEqual(activeCount, 3, 'Deve despachar no máximo maxConcurrentJobs');
    assert.strictEqual(dispatched.length, 3);
    assert.strictEqual(queue.length, 4);
    console.log('  -> Limite de concorrência respeitado OK');

    console.log('✅ smoke-01-batch-lifecycle passou com sucesso.');
});
~~~

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** <code>/**</code>

**O que faz:** Abre o comentário de cabeçalho do smoke.

**Como e por que:** Mantém o objetivo declarado do smoke visível para revisão. Uma descrição vaga seria pior porque esconderia quais contratos o arquivo pretende representar; neste caso, porém, a declaração precisa ser confrontada com o fato de que várias provas são apenas simulações locais.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — comentário/documentação do próprio teste.
### Linha/posição 2

**Fonte:** <code> * smoke-01-batch-lifecycle.js</code>

**O que faz:** Nomeia explicitamente o arquivo no cabeçalho.

**Como e por que:** Mantém o objetivo declarado do smoke visível para revisão. Uma descrição vaga seria pior porque esconderia quais contratos o arquivo pretende representar; neste caso, porém, a declaração precisa ser confrontada com o fato de que várias provas são apenas simulações locais.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — comentário/documentação do próprio teste.
### Linha/posição 3

**Fonte:** <code> * Cobre: Limite de concorrência, ACK sem atraso fixo, índice durável,</code>

**O que faz:** Declara que o smoke pretende cobrir concorrência, ACK e índice durável.

**Como e por que:** Mantém o objetivo declarado do smoke visível para revisão. Uma descrição vaga seria pior porque esconderia quais contratos o arquivo pretende representar; neste caso, porém, a declaração precisa ser confrontada com o fato de que várias provas são apenas simulações locais.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — comentário/documentação do próprio teste.
### Linha/posição 4

**Fonte:** <code> * rejeição de remetente estranho, STOP_BATCH isolado.</code>

**O que faz:** Completa a declaração incluindo rejeição de remetente estranho e STOP_BATCH isolado.

**Como e por que:** Mantém o objetivo declarado do smoke visível para revisão. Uma descrição vaga seria pior porque esconderia quais contratos o arquivo pretende representar; neste caso, porém, a declaração precisa ser confrontada com o fato de que várias provas são apenas simulações locais.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — comentário/documentação do próprio teste.
### Linha/posição 5

**Fonte:** <code> */</code>

**O que faz:** Fecha o comentário inicial.

**Como e por que:** Mantém o objetivo declarado do smoke visível para revisão. Uma descrição vaga seria pior porque esconderia quais contratos o arquivo pretende representar; neste caso, porém, a declaração precisa ser confrontada com o fato de que várias provas são apenas simulações locais.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — comentário/documentação do próprio teste.
### Linha/posição 6

**Fonte:** <code>'use strict';</code>

**O que faz:** Ativa strict mode no script CommonJS.

**Como e por que:** Prepara um script Node autônomo, sem Jest. A forma simples reduz dependências do smoke runner; uma bootstrap mais complexa aumentaria pontos de falha sem fortalecer a ligação com produção.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o smoke runner descobre e spawna este arquivo; o run #2290 do SHA de início foi cancelado antes dos jobs, então não há sucesso atual desse run para promover.
### Linha/posição 7

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa bootstrap do import.

**Como e por que:** Prepara um script Node autônomo, sem Jest. A forma simples reduz dependências do smoke runner; uma bootstrap mais complexa aumentaria pontos de falha sem fortalecer a ligação com produção.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o smoke runner descobre e spawna este arquivo; o run #2290 do SHA de início foi cancelado antes dos jobs, então não há sucesso atual desse run para promover.
### Linha/posição 8

**Fonte:** <code>const assert = require('assert');</code>

**O que faz:** Importa o módulo built-in assert, única dependência de assertion.

**Como e por que:** Prepara um script Node autônomo, sem Jest. A forma simples reduz dependências do smoke runner; uma bootstrap mais complexa aumentaria pontos de falha sem fortalecer a ligação com produção.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o smoke runner descobre e spawna este arquivo; o run #2290 do SHA de início foi cancelado antes dos jobs, então não há sucesso atual desse run para promover.
### Linha/posição 9

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa import do primeiro cenário.

**Como e por que:** Prepara um script Node autônomo, sem Jest. A forma simples reduz dependências do smoke runner; uma bootstrap mais complexa aumentaria pontos de falha sem fortalecer a ligação com produção.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o smoke runner descobre e spawna este arquivo; o run #2290 do SHA de início foi cancelado antes dos jobs, então não há sucesso atual desse run para promover.
### Linha/posição 10

**Fonte:** <code>console.log('[smoke-01] 1. Testando assertJobOwnership (rejeição de remetente estranho)...');</code>

**O que faz:** Registra no console o início do cenário de ownership.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 11

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa log da fixture.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 12

**Fonte:** <code>const mockStorage = {};</code>

**O que faz:** Cria o objeto em memória que finge ser storage.local.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 13

**Fonte:** <code>const mockChrome = {</code>

**O que faz:** Inicia a construção do mockChrome local.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 14

**Fonte:** <code>    storage: {</code>

**O que faz:** Abre a superfície storage do mock.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 15

**Fonte:** <code>        local: {</code>

**O que faz:** Abre a superfície local do mock.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 16

**Fonte:** <code>            get: (keys, cb) =&gt; {</code>

**O que faz:** Declara get(keys, cb), aceitando lista/chave e callback.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 17

**Fonte:** <code>                const res = {};</code>

**O que faz:** Cria o objeto de resposta da leitura simulada.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 18

**Fonte:** <code>                const arr = Array.isArray(keys) ? keys : [keys];</code>

**O que faz:** Normaliza uma chave única para array.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 19

**Fonte:** <code>                arr.forEach(k =&gt; { if (k in mockStorage) res[k] = mockStorage[k]; });</code>

**O que faz:** Copia para a resposta somente chaves existentes em mockStorage.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 20

**Fonte:** <code>                if (cb) cb(res);</code>

**O que faz:** Invoca o callback, quando fornecido.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 21

**Fonte:** <code>                return Promise.resolve(res);</code>

**O que faz:** Também retorna Promise resolvida com a mesma resposta.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 22

**Fonte:** <code>            }</code>

**O que faz:** Fecha a função get.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 23

**Fonte:** <code>        }</code>

**O que faz:** Fecha storage.local.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 24

**Fonte:** <code>    }</code>

**O que faz:** Fecha storage.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 25

**Fonte:** <code>};</code>

**O que faz:** Fecha mockChrome.

**Como e por que:** Cria um storage mínimo em memória só para a função local de ownership. A simplicidade torna o smoke rápido, mas uma cópia de API demasiado simplificada é pior quando é usada como substituto de comportamento real do Chrome/storage.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas dentro da simulação local pelos asserts de ownership; ⚠️ não prova chrome.storage real.
### Linha/posição 26

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa fixture da cópia de ownership.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 27

**Fonte:** <code>function assertJobOwnership(sender, jobId, callback) {</code>

**O que faz:** Declara a função local assertJobOwnership(sender, jobId, callback).

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 28

**Fonte:** <code>    const tabId = sender &amp;&amp; sender.tab ? sender.tab.id : null;</code>

**O que faz:** Extrai sender.tab.id ou usa null.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 29

**Fonte:** <code>    if (!jobId) { callback(true, tabId); return; }</code>

**O que faz:** Na cópia local, aceita imediatamente qualquer chamada sem jobId — regra que diverge do código real atual.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 30

**Fonte:** <code>    if (tabId === null) { callback(false, tabId); return; }</code>

**O que faz:** Rejeita sender sem tab id.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 31

**Fonte:** <code>    mockChrome.storage.local.get([`gemini_job_${tabId}`], (data) =&gt; {</code>

**O que faz:** Lê a chave gemini_job_<tabId> do storage simulado.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 32

**Fonte:** <code>        const job = data &amp;&amp; data[`gemini_job_${tabId}`];</code>

**O que faz:** Extrai o job correspondente da resposta.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 33

**Fonte:** <code>        if (!job) { callback(false, tabId); return; }</code>

**O que faz:** Rejeita quando não há job para a aba.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 34

**Fonte:** <code>        callback(job.jobId === jobId, tabId);</code>

**O que faz:** Compara job.jobId com o jobId recebido e devolve o booleano.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 35

**Fonte:** <code>    });</code>

**O que faz:** Fecha callback de storage.get.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 36

**Fonte:** <code>}</code>

**O que faz:** Fecha a função local de ownership.

**Como e por que:** Implementa uma cópia local, callback-based, da ideia de ownership. Duplicar regra de segurança é frágil: a implementação real evoluiu para rejeitar jobId ausente e resolver identidade canônica, enquanto esta cópia ficou divergente.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a função local pelos três asserts; ⚠️ NÃO PROVA a implementação real e contém divergência contratual confirmada.
### Linha/posição 37

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa helper da preparação da fixture.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 38

**Fonte:** <code>// Configura o job da aba 10</code>

**O que faz:** Comenta que será configurado job para aba 10.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 39

**Fonte:** <code>mockStorage['gemini_job_10'] = { jobId: 'uuid-valido-10', batchId: 'batch-A' };</code>

**O que faz:** Insere no mockStorage um job do batch-A para gemini tab 10.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 40

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa fixture do primeiro caso.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 41

**Fonte:** <code>// Teste 1.1: Aba legítima deve ser aceita</code>

**O que faz:** Documenta o caso de aba legítima.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 42

**Fonte:** <code>assertJobOwnership({ tab: { id: 10 } }, 'uuid-valido-10', (owns) =&gt; {</code>

**O que faz:** Chama a função local com tab 10 e jobId correspondente.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 43

**Fonte:** <code>    assert.strictEqual(owns, true, 'Dono legítimo deve ser aceito');</code>

**O que faz:** Exige owns=true para o caso local legítimo.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 44

**Fonte:** <code>});</code>

**O que faz:** Fecha callback do caso legítimo.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 45

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa os casos.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 46

**Fonte:** <code>// Teste 1.2: Aba estranha tentando reivindicar o jobId deve ser rejeitada</code>

**O que faz:** Documenta tentativa de aba estranha.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 47

**Fonte:** <code>assertJobOwnership({ tab: { id: 99 } }, 'uuid-valido-10', (owns) =&gt; {</code>

**O que faz:** Chama a função local com tab 99 e jobId pertencente à aba 10.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 48

**Fonte:** <code>    assert.strictEqual(owns, false, 'Remetente estranho deve ser rejeitado');</code>

**O que faz:** Exige owns=false para a aba sem registro correspondente.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 49

**Fonte:** <code>});</code>

**O que faz:** Fecha callback do caso estranho.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 50

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa os casos.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 51

**Fonte:** <code>// Teste 1.3: Mensagem legada (sem jobId) deve ser aceita para retrocompatibilidade</code>

**O que faz:** Declara, de forma hoje obsoleta, que mensagem sem jobId deve ser aceita.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 52

**Fonte:** <code>assertJobOwnership({ tab: { id: 10 } }, null, (owns) =&gt; {</code>

**O que faz:** Chama a cópia local com jobId null.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 53

**Fonte:** <code>    assert.strictEqual(owns, true, 'Mensagem legada sem jobId deve ser aceita');</code>

**O que faz:** Exige owns=true; esta assertion contradiz jobs-lifecycle.js atual, que retorna false quando !jobId.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 54

**Fonte:** <code>});</code>

**O que faz:** Fecha callback do caso sem jobId.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 55

**Fonte:** <code>console.log('  -&gt; assertJobOwnership OK');</code>

**O que faz:** Registra conclusão do bloco local de ownership.

**Como e por que:** Exercita a função local com três cenários. Assertions locais são úteis como sanity check, mas são insuficientes como prova da extensão porque não chamam jobs-lifecycle.js.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o resultado da cópia local; ⚠️ sem valor probatório direto para jobs-lifecycle.js.
### Linha/posição 56

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa o próximo bloco.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 57

**Fonte:** <code>console.log('[smoke-01] 2. Testando índice durável e STOP_BATCH isolado por batchId...');</code>

**O que faz:** Registra início do cenário de índice/STOP_BATCH.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 58

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa log da estrutura local.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 59

**Fonte:** <code>let jobIndex = [];</code>

**O que faz:** Inicializa jobIndex apenas em memória.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 60

**Fonte:** <code>function indexAddJob(entry) {</code>

**O que faz:** Declara indexAddJob local.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 61

**Fonte:** <code>    jobIndex = jobIndex.filter(j =&gt; j &amp;&amp; j.geminiTabId !== entry.geminiTabId);</code>

**O que faz:** Remove entrada anterior da mesma geminiTabId antes de adicionar.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 62

**Fonte:** <code>    jobIndex.push(entry);</code>

**O que faz:** Adiciona a nova entrada ao fim do array.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 63

**Fonte:** <code>}</code>

**O que faz:** Fecha indexAddJob.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 64

**Fonte:** <code>function indexRemoveJob(geminiTabId) {</code>

**O que faz:** Declara indexRemoveJob local.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 65

**Fonte:** <code>    jobIndex = jobIndex.filter(j =&gt; j &amp;&amp; j.geminiTabId !== geminiTabId);</code>

**O que faz:** Filtra a entrada com geminiTabId alvo; ao contrário da produção, não retorna se removeu algo.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 66

**Fonte:** <code>}</code>

**O que faz:** Fecha indexRemoveJob.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 67

**Fonte:** <code>function indexJobsOfBatch(batchId) {</code>

**O que faz:** Declara indexJobsOfBatch local.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 68

**Fonte:** <code>    if (!batchId) return jobIndex.slice();</code>

**O que faz:** Quando batchId é falsy, devolve cópia rasa de todo o índice.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 69

**Fonte:** <code>    return jobIndex.filter(j =&gt; j &amp;&amp; j.batchId === batchId);</code>

**O que faz:** Quando batchId existe, filtra entradas exatamente por batchId.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 70

**Fonte:** <code>}</code>

**O que faz:** Fecha indexJobsOfBatch.

**Como e por que:** Replica em memória operações semelhantes ao jobIndex real. Isso facilita uma prova algorítmica curta, porém chamar o índice de “durável” sem usar state/persistência real cria falso senso de cobertura.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a coleção local nas linhas de assertion; ⚠️ não prova durabilidade/persistência real.
### Linha/posição 71

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa helpers da fixture.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 72

**Fonte:** <code>// Adiciona jobs de dois lotes distintos (batch-A e batch-B)</code>

**O que faz:** Comenta a preparação de dois batches.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 73

**Fonte:** <code>indexAddJob({ geminiTabId: 10, jobId: 'job-1', batchId: 'batch-A' });</code>

**O que faz:** Adiciona job-1 de batch-A/tab 10.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 74

**Fonte:** <code>indexAddJob({ geminiTabId: 11, jobId: 'job-2', batchId: 'batch-A' });</code>

**O que faz:** Adiciona job-2 de batch-A/tab 11.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 75

**Fonte:** <code>indexAddJob({ geminiTabId: 20, jobId: 'job-3', batchId: 'batch-B' });</code>

**O que faz:** Adiciona job-3 de batch-B/tab 20.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 76

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa preparação das assertions.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 77

**Fonte:** <code>assert.strictEqual(jobIndex.length, 3);</code>

**O que faz:** Exige três entradas no índice local.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 78

**Fonte:** <code>assert.strictEqual(indexJobsOfBatch('batch-A').length, 2);</code>

**O que faz:** Exige duas entradas para batch-A.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 79

**Fonte:** <code>assert.strictEqual(indexJobsOfBatch('batch-B').length, 1);</code>

**O que faz:** Exige uma entrada para batch-B.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 80

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa assertions da simulação de cancelamento.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 81

**Fonte:** <code>// Simula STOP_BATCH apenas para batch-A</code>

**O que faz:** Comenta que STOP_BATCH será apenas simulado.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 82

**Fonte:** <code>const targetBatchId = 'batch-A';</code>

**O que faz:** Define batch-A como alvo local.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 83

**Fonte:** <code>const stoppedJobs = indexJobsOfBatch(targetBatchId);</code>

**O que faz:** Obtém snapshot das entradas locais de batch-A.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 84

**Fonte:** <code>stoppedJobs.forEach(j =&gt; indexRemoveJob(j.geminiTabId));</code>

**O que faz:** Remove cada geminiTabId de A diretamente, sem chamar roteador/handler real.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 85

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa remoção das assertions finais.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 86

**Fonte:** <code>// Garante que o batch-B NÃO foi afetado</code>

**O que faz:** Comenta que batch-B deve permanecer.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 87

**Fonte:** <code>assert.strictEqual(jobIndex.length, 1, 'Apenas jobs do lote cancelado devem ser removidos');</code>

**O que faz:** Exige uma única entrada após remover A.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 88

**Fonte:** <code>assert.strictEqual(jobIndex[0].geminiTabId, 20);</code>

**O que faz:** Exige que a entrada restante pertença à tab 20.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 89

**Fonte:** <code>assert.strictEqual(jobIndex[0].batchId, 'batch-B');</code>

**O que faz:** Exige que a entrada restante pertença ao batch-B.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 90

**Fonte:** <code>console.log('  -&gt; Índice durável e STOP_BATCH isolado OK');</code>

**O que faz:** Registra sucesso do cenário local de índice/STOP_BATCH.

**Como e por que:** Monta dois batches e remove diretamente entradas de A. Isso prova filtragem da matriz local, não o handler STOP_BATCH, storage, watchdogs, abas ou estado real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a remoção local por batch; ⚠️ não prova STOP_BATCH real.
### Linha/posição 91

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa cenário de ACK.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 92

**Fonte:** <code>console.log('[smoke-01] 3. Testando handshake ACK sem delay fixo de 1.5s...');</code>

**O que faz:** Registra intenção de testar ACK sem atraso fixo de 1,5 s.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 93

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa log da medição.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 94

**Fonte:** <code>let ackReceivedImmediately = false;</code>

**O que faz:** Declara flag ackReceivedImmediately, posteriormente escrita mas nunca lida/assertada.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 95

**Fonte:** <code>const startTime = Date.now();</code>

**O que faz:** Captura Date.now como início da medição.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 96

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa estado da função simulada.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 97

**Fonte:** <code>function deliverResultSimulated(onAck) {</code>

**O que faz:** Declara deliverResultSimulated(onAck).

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 98

**Fonte:** <code>    // Simula envio de UPDATE_IMAGE com expectAck: true</code>

**O que faz:** Comenta que a função representa UPDATE_IMAGE com expectAck.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 99

**Fonte:** <code>    // O content script responde imediatamente com { ok: true, domApplied: true }</code>

**O que faz:** Comenta o payload de resposta fabricado.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 100

**Fonte:** <code>    setTimeout(() =&gt; {</code>

**O que faz:** Agenda callback por setTimeout, em vez de chamar implementação real.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 101

**Fonte:** <code>        onAck({ ok: true, domApplied: true });</code>

**O que faz:** Entrega payload {ok:true, domApplied:true} fabricado.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 102

**Fonte:** <code>    }, 20);</code>

**O que faz:** Define atraso artificial de 20 ms.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 103

**Fonte:** <code>}</code>

**O que faz:** Fecha a função simulada.

**Como e por que:** Modela um ACK por setTimeout de 20 ms. É simples, mas substituir o módulo real de ACK por um timer artificial não prova UPDATE_IMAGE, chrome.runtime.lastError, persistência, timeout de 30 s ou finalizeJob.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE apenas quanto ao callback simulado; ⚠️ não prova jobs-dom-ack.js/content_manga.js.
### Linha/posição 104

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa helper da execução.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 105

**Fonte:** <code>deliverResultSimulated((resp) =&gt; {</code>

**O que faz:** Invoca a simulação e registra callback de ACK.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 106

**Fonte:** <code>    const elapsed = Date.now() - startTime;</code>

**O que faz:** Calcula elapsed pelo relógio de parede.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 107

**Fonte:** <code>    assert.strictEqual(resp.ok, true);</code>

**O que faz:** Exige resp.ok=true no payload fabricado.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 108

**Fonte:** <code>    assert.strictEqual(resp.domApplied, true);</code>

**O que faz:** Exige resp.domApplied=true no payload fabricado.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 109

**Fonte:** <code>    assert(elapsed &lt; 500, `ACK deve resolver imediatamente em vez de esperar 1.5s (levou ${elapsed}ms)`);</code>

**O que faz:** Exige elapsed<500 ms; limiar pode sofrer com scheduler e não mede o ACK real.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 110

**Fonte:** <code>    ackReceivedImmediately = true;</code>

**O que faz:** Marca a flag ackReceivedImmediately como true, sem posterior assertion.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 111

**Fonte:** <code>    console.log(`  -&gt; Handshake ACK resolvido em ${elapsed}ms (sem atraso fixo de 1,5 s)`);</code>

**O que faz:** Loga o tempo observado do timer local.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 112

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa ACK do cenário de concorrência dentro do mesmo callback assíncrono.

**Como e por que:** Mede o timer simulado e confere um payload fabricado. Um teste determinístico do módulo real/fake timers seria melhor que um limiar de relógio de parede sujeito a carga do CI.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para payload/tempo da simulação; ⚠️ sem prova direta do handshake real.
### Linha/posição 113

**Fonte:** <code>    console.log('[smoke-01] 4. Testando respeito ao limite de concorrência...');</code>

**O que faz:** Registra início da concorrência simulada.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 114

**Fonte:** <code>    const maxConcurrentJobs = 3;</code>

**O que faz:** Define limite local fixo de três jobs.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 115

**Fonte:** <code>    let activeCount = 0;</code>

**O que faz:** Inicializa contador local de ativos.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 116

**Fonte:** <code>    const dispatched = [];</code>

**O que faz:** Inicializa lista local de itens despachados.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 117

**Fonte:** <code>    const queue = [1, 2, 3, 4, 5, 6, 7];</code>

**O que faz:** Cria fila local com sete itens.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 118

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa fixture da função de dispatch.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 119

**Fonte:** <code>    function dispatchNext() {</code>

**O que faz:** Declara dispatchNext local.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 120

**Fonte:** <code>        while (activeCount &lt; maxConcurrentJobs &amp;&amp; queue.length &gt; 0) {</code>

**O que faz:** Despacha enquanto contador estiver abaixo do limite e houver fila.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 121

**Fonte:** <code>            const item = queue.shift();</code>

**O que faz:** Remove o primeiro item da fila.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 122

**Fonte:** <code>            activeCount++;</code>

**O que faz:** Incrementa activeCount local.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 123

**Fonte:** <code>            dispatched.push(item);</code>

**O que faz:** Registra item em dispatched.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 124

**Fonte:** <code>        }</code>

**O que faz:** Fecha o while.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 125

**Fonte:** <code>    }</code>

**O que faz:** Fecha dispatchNext.

**Como e por que:** Monta contador, fila e dispatch local. É uma demonstração do predicado activeCount < maxConcurrentJobs, não da leitura de storage nem do lifecycle real.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o algoritmo local pela primeira chamada de dispatchNext; ⚠️ não prova jobs-lifecycle.
### Linha/posição 126

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa helper da execução.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 127

**Fonte:** <code>    dispatchNext();</code>

**O que faz:** Executa uma única onda de dispatch.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 128

**Fonte:** <code>    assert.strictEqual(activeCount, 3, 'Deve despachar no máximo maxConcurrentJobs');</code>

**O que faz:** Exige activeCount=3.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 129

**Fonte:** <code>    assert.strictEqual(dispatched.length, 3);</code>

**O que faz:** Exige três itens despachados.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 130

**Fonte:** <code>    assert.strictEqual(queue.length, 4);</code>

**O que faz:** Exige quatro itens ainda na fila.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 131

**Fonte:** <code>    console.log('  -&gt; Limite de concorrência respeitado OK');</code>

**O que faz:** Registra sucesso do cenário local de concorrência.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 132

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa resultado parcial do resultado global.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 133

**Fonte:** <code>    console.log('✅ smoke-01-batch-lifecycle passou com sucesso.');</code>

**O que faz:** Imprime mensagem global de sucesso do smoke.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 134

**Fonte:** <code>});</code>

**O que faz:** Fecha o callback assíncrono de deliverResultSimulated.

**Como e por que:** Executa uma única onda e verifica 3 despachos/4 restantes. Isso prova o algoritmo local inicial, mas não liberação de slots, novas ondas, erros ou integração com jobs-lifecycle.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a primeira onda local; ⚠️ não prova concorrência real.
### Linha/posição 135

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Representa o newline final após a última instrução.

**Como e por que:** Preserva newline final do blob. Removê-lo não mudaria a lógica, mas mudaria SHA e contagem posicional auditada.

**Por que uma alternativa ingênua seria pior:** uma alternativa que ocultasse a distinção entre **sanity check local** e **implementação real** poderia produzir falso verde ou documentação enganosa; quando a linha é apenas estrutural, a alternativa pior seria reduzir legibilidade/auditabilidade sem benefício.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — propriedade textual.

## 10. Análise crítica

O smoke tem valor como **sanity check rápido de ideias**: é pequeno, não precisa de Jest e falha imediatamente por `assert`. O problema é semântico: seus logs e comentários usam nomes de contratos reais (“índice durável”, “STOP_BATCH”, “ACK”, “maxConcurrentJobs”) sem chamar as implementações correspondentes. Isso torna fácil confundir equivalência algorítmica local com regressão real.

A divergência de `jobId` demonstra que o risco não é hipotético. O código de produção evoluiu para ownership mais estrito e migração de identidade, mas a cópia local preservou uma regra de retrocompatibilidade antiga. Um smoke que importa ou carrega a implementação real reduziria esse drift; alternativamente, ele pode permanecer puramente algorítmico, mas deve deixar explícito que não é evidência de integração.

Os melhores sinais atuais para os comportamentos reais estão nas suítes que carregam background/módulos reais: STOP_BATCH seletivo, ACK/staging e limites de concorrência já possuem testes mais fortes. Isso significa que corrigir o escopo deste smoke não precisa eliminar cobertura; precisa evitar duplicação enganosa e alinhar o gate rápido ao contrato atual.

## 11. Autoauditoria — AGENTE 4

- Reserva #123 relida e confirmada como **AGENTE 4** antes da escrita.
- State #123 relido e confirmado como **IN_PROGRESS / AGENTE 4**.
- SHA do fonte reconfirmado: `c412ccaac3c01de93b0a6362747525c48d79a765`.
- Fonte integral incorporada diretamente dos bytes lidos do branch.
- Contagem: **134 linhas textuais + newline final = 135 posições**.
- Headings gerados sequencialmente de **Linha/posição 1** a **135**.
- Comparação com produção feita contra `jobs-lifecycle.js`, `state.js` e `jobs-dom-ack.js`.
- Testes reais correlatos lidos sem modificá-los.
- Run #2290 identificado como cancelado; nenhuma conclusão verde foi inventada.
- Nenhum código, teste, fixture, workflow, config, STATUS, CHECKLIST ou AUDITORIA foi alterado.
- Lacunas e divergências foram encaminhadas por `audit_requests`.

**Conclusão documental:** o arquivo foi documentado integralmente, com separação explícita entre o que suas assertions provam localmente e o que permanece sem prova sobre a implementação real.

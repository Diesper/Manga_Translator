# Bíblia técnica — tests/smoke/smoke-02-uuid-and-reconcile.js

> **Estado documental:** 🟡 CORRIGIDO após REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `d977f43a4b29653d01b0fd9c395cb04edb9c1a50`  
> **Agente responsável:** AGENTE 10  
> **Tipo:** smoke test Node standalone, baseado em simulações locais de geração de ID e reconciliação  
> **Linhas textuais:** **176**  
> **Posições documentais:** **177**, contando o newline final  
> **Tamanho textual observado:** **5925 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel real do arquivo

Este arquivo é descoberto por `tests/smoke/run-smoke.js`, que enumera `smoke-\d+.*.js`, executa cada arquivo em um processo Node separado com `spawnSync` e considera falha qualquer `r.error` ou status diferente de zero.

O smoke-02 possui dois blocos:

1. uma função **local** `generateId` e duas verificações básicas;
2. uma função **local** `reconcileJobs`, suportada por um `mockChrome` também local, que verifica descarte de uma aba morta.

A distinção “local” é central para interpretar a força da evidência: o arquivo **não requer nem executa diretamente** `extension/background/state.js`, `extension/background.js` ou `extension/background/jobs-reconciliation.js`.

Portanto, as assertions provam que **a simulação dentro deste smoke** satisfaz o cenário escrito. Elas não são prova direta de que o runtime atual continua implementando a mesma semântica.

## 2. Integração com o runner de smoke

`tests/smoke/run-smoke.js`:

- lê o diretório de smoke;
- exige quantidade mínima definida no baseline;
- ordena os nomes;
- executa cada arquivo via `process.execPath`;
- herda stdout/stderr;
- soma falhas;
- termina 0 somente se todos os arquivos terminarem 0.

Assim, smoke-02 é bloqueante dentro de `npm run test:smoke`.

**Classificação:** 🟨 EXECUTADO INDIRETAMENTE como processo pelo runner. O runner prova que este script precisa terminar corretamente, mas não muda a autenticidade das funções copiadas.

## 3. Bloco generateId

### 3.1 Implementação local

A função das linhas 13–20:

- aceita prefixo opcional;
- tenta `crypto.randomUUID()`;
- captura qualquer exception;
- cai para `Date.now().toString(36)` + duas fatias de `Math.random().toString(36)`.

No SHA atual, esse texto é semanticamente equivalente ao `generateId` exposto por `extension/background/state.js` e à função ainda existente em `extension/background.js`.

Porém o smoke não importa qualquer uma dessas funções. Se produção mudar e a cópia do smoke não mudar, o teste pode continuar verde.

### 3.2 Caso “crypto ativo”

O smoke chama `generateId('job_')` e exige:

- prefixo `job_`;
- comprimento >10.

Isso não valida:

- formato UUID;
- unicidade;
- qual branch foi usado;
- implementação de produção.

### 3.3 Tentativa de testar fallback

O smoke salva `crypto.randomUUID`, tenta:

1. atribuir `undefined`;
2. se falhar, usar `Object.defineProperty`.

Ambas as tentativas internas podem falhar e ser engolidas.

Depois disso, o código **não verifica** que `crypto.randomUUID` realmente deixou de ser função. Ele apenas gera um ID e exige:

- prefixo `fallback_`;
- comprimento >15.

Essas condições também são satisfeitas pelo caminho normal de UUID. Logo, em ambiente onde a propriedade não puder ser alterada, a mensagem “Fallback sem crypto.randomUUID OK” pode ser impressa sem o fallback ter sido executado.

Além disso, a mensagem da assertion diz que o fallback deve ser “não-vazio e único”, mas um único valor e um teste de comprimento **não provam unicidade**.

Essa lacuna é **124-003**.

### 3.4 Ausência total de global crypto

A função local trata `typeof crypto === 'undefined'`, mas o setup do teste de fallback acessa diretamente `crypto.randomUUID` na linha 30.

Se o runtime não tiver global `crypto`, o próprio teste pode lançar ReferenceError antes de exercer o fallback — justamente um cenário citado como motivação na implementação de produção.

## 4. Bloco mockChrome

O mock local cobre somente o necessário para o cenário:

### storage.local

- `get`: consulta uma ou várias chaves no objeto `storage`;
- `set`: Object.assign;
- `remove`: delete das chaves;
- callbacks opcionais;
- get/set/remove retornam Promise resolvida.

### tabs.get

- tab 101 existe;
- qualquer outra tab é considerada inexistente;
- usa `mockChrome.runtime.lastError` para simular o padrão Chrome callback.

### alarms.clear

- registra o nome em `clearedAlarms`;
- chama callback com true.

É uma fixture coerente para o algoritmo local. Não é o `tests/mocks/chrome-api.mock.js` canônico e não inclui comportamento de tabs.remove, canonicalização, migration ou journaling.

## 5. Reconciliação local simulada

A função local `reconcileJobs`:

1. zera count se o índice é vazio;
2. percorre entradas;
3. chama `tabExists(entry.geminiTabId)`;
4. separa `alive` e `dropped`;
5. para dropped:
   - agenda remoção de `gemini_job_<tab>`;
   - agenda remoção de `wd_data_<tab>`;
   - limpa `watchdog_<jobId>` ou fallback por tab;
6. remove as chaves;
7. substitui `jobIndex` por alive;
8. define `activeJobsCount = alive.length`;
9. retorna contagens.

O cenário inicial possui tab 101 viva e 102 morta, ambas do mesmo batch.

As assertions finais provam corretamente, **para essa cópia**:

- uma viva;
- uma descartada;
- apenas 101 no índice;
- count 1;
- storage 101 preservado;
- storage 102 apagado;
- watchdog 102 limpo.

## 6. Diferença para o runtime atual

O runtime atual de `extension/background.js` não usa esta função local. Ele inicializa `MangaTranslatorJobsReconciliation.createReconciler(...)` e `reconcileJobs()` delega para `jobsReconciler.reconcile()`.

`extension/background/jobs-reconciliation.js` acrescenta comportamentos ausentes do smoke:

- `resolveCanonicalTabId`;
- `migrateTabIdentity`;
- recovery por `recoverPendingFinalization`;
- recovery por `recoverPersistedResult`;
- detecção de job de lote estrangeiro;
- fechamento da aba estrangeira por `chrome.tabs.remove`;
- telemetria `JOB_RECONCILE_DROP`;
- telemetria `JOB_RECONCILE_FOREIGN_BATCH_DROP`;
- campos de retorno `recovered` e `foreign`;
- atualização de `activeMangaTabId`;
- tolerância a erro de `storage.local.remove`.

Há testes unitários que carregam o módulo real, por exemplo `tests/unit/background/jobs-reconciliation-batch-queue.test.js`, mas **eles são evidência separada do smoke-02**.

O smoke, portanto, não pode ser descrito como prova do reconciliador atual. Ele é um **modelo legado/simplificado de uma parte do comportamento**.

Essa é a lacuna **124-001 — HIGH**.

## 7. Relação com extension/background/state.js

`extension/background/state.js` ainda contém e exporta uma função `reconcileJobs` mais parecida com a cópia do smoke. Ela possui, além do núcleo copiado:

- logging de `JOB_RECONCILE_DROP`;
- atualização de `activeMangaTabId`;
- try/catch em remove.

Entretanto, o entrypoint `extension/background.js` atual documenta e executa a reconciliação canônica por `jobs-reconciliation.js`.

Isso significa que “a cópia ainda se parece com state.js” não é suficiente para elevar o smoke a prova de runtime end-to-end.

## 8. Evidência automatizada

| Claim | Evidência | Classificação |
|---|---|---|
| o smoke é descoberto/executado por run-smoke.js | regex do runner + spawnSync por arquivo | 🟦 GATE/EXECUÇÃO ESTRUTURAL |
| id local com crypto possui prefixo job_ | assertions 24–25 | ✅ PROVADO DIRETAMENTE para a cópia local |
| fallback real foi necessariamente executado | não há assertion de que randomUUID ficou indisponível | ⚠️ SEM PROVA — 124-003 |
| fallback gera valor “único” | apenas um valor é criado; só comprimento é medido | ⚠️ SEM PROVA |
| reconciliação local preserva tab 101 e descarta 102 | assertions 158–167 | ✅ PROVADO DIRETAMENTE para a cópia local |
| storage morto é apagado no modelo | assertion da chave 102 undefined | ✅ PROVADO DIRETAMENTE para a cópia local |
| watchdog morto é limpo no modelo | clearedAlarms contém watchdog_uuid-102 | ✅ PROVADO DIRETAMENTE para a cópia local |
| production jobs-reconciliation executa esse cenário | módulo real não é importado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste smoke — 124-001 |
| production generateId conserva fallback | função real não é importada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste smoke — 124-002 |
| reconciliação canônica/foreign/recovery | ausentes do smoke | ⚠️ NÃO COBERTOS pelo smoke |
| erro assíncrono do cenário torna processo não-zero | catch chama process.exit(1) | 🟦 CONTRATO ESTRUTURAL DIRETO |

## 9. Trust boundaries

Este arquivo não processa dados de usuário nem acessa Chrome real.

Fronteiras:

- **global crypto do Node**: é temporariamente mutado;
- **Math.random/Date.now**: fontes não determinísticas do fallback local;
- **mockChrome**: modelo local e incompleto;
- **process.exit(1)**: sinal para o runner;
- **stdout/stderr**: relatório humano.

O maior risco deste smoke não é segurança; é **falsa confiança de cobertura** por testar cópias em vez da implementação real.

## 10. Casos-limite

1. `crypto` ausente por completo: setup de mutação pode falhar antes do teste.
2. `crypto.randomUUID` read-only/non-configurable: tentativa de desativar pode falhar; teste ainda pode ficar verde pelo caminho UUID.
3. `crypto.randomUUID` lança: generateId local cai no fallback.
4. duas chamadas fallback no mesmo timestamp e colisão de randoms: não testado.
5. `jobIndex=[]`: branch implementado localmente, não exercitado.
6. entrada null no jobIndex: branch `continue` não exercitado.
7. tabId 0: tabExists aceita como id, não exercitado.
8. tabs.get lança: catch de tabExists não exercitado.
9. job sem jobId: watchdog_<tabId> não exercitado.
10. storage.remove rejeita: reconciliador local propagaria erro; produção canônica captura.
11. alarm.clear lança: não testado.
12. mais de uma aba viva/morta: não testado.
13. lote estrangeiro: não existe no algoritmo local.
14. tab canonicalizada/rekey: não existe no algoritmo local.
15. resultado persistido/finalização pendente: não existe no algoritmo local.
16. atualização de activeMangaTabId: não existe no algoritmo local.
17. falha no primeiro bloco generateId: é síncrona e ocorre antes de runReconcileTest.catch; Node ainda termina não-zero, mas mensagem de falha customizada do bloco 2 não é usada.
18. falha assíncrona em runReconcileTest: catch final imprime e chama exit(1).

## 11. Invariantes documentais

1. Não tratar funções locais como implementação de produção.
2. Assertions do smoke só recebem ✅ PROVADO DIRETAMENTE para o código local realmente executado.
3. O runner de smoke torna o arquivo bloqueante, mas não aumenta autenticidade do alvo.
4. Se o objetivo é provar production generateId, o teste deve importar/executar a função real.
5. Se o objetivo é provar production reconciliation, o teste deve usar `jobs-reconciliation.js` ou o background real.
6. Um teste de fallback deve provar que o caminho primário foi realmente desativado.
7. “Único” exige pelo menos propriedade/formato ou múltiplas amostras sem colisão; comprimento de uma amostra não prova unicidade.
8. Alterações em jobs-reconciliation não são automaticamente cobertas por este smoke.
9. Falha deve continuar resultar em status de processo não-zero para run-smoke.
10. A Bíblia vale apenas para o SHA declarado.

## 12. Solicitações ao auditor

### 124-001 — TEST_AUTHENTICITY — ACCEPTED — HIGH

**Encontrado:** o bloco de reconciliação redefine `tabExists` e `reconcileJobs` dentro do próprio smoke em vez de carregar `extension/background/jobs-reconciliation.js` ou o entrypoint real.

**Contexto:** produção atual delega `background.js#reconcileJobs` a `jobsReconciler.reconcile()`.

**Evidência atual:** assertions 158–167 provam somente a implementação local. O módulo real possui canonicalização, migration, recoveries, foreign-batch handling, tabs.remove, logs e campos extras que o smoke não possui.

**Evidência ausente:** smoke executando a implementação real para cenário viva+morta e validando efeitos reais/contratados.

**Ação solicitada:** substituir ou complementar a simulação em alteração separada com execução do reconciliador real, usando dependências controladas sem copiar algoritmo.

**Evidência esperada:** import do módulo real + assertions de alive/dropped/storage/watchdog para o cenário, mantendo testes unitários focais dos branches modernos.

**Possível regressão:** production reconciliation pode quebrar ou evoluir enquanto smoke continua verde.

**Impacto:** confiança indevida em um gate smoke de recuperação MV3.

**Severidade:** HIGH.

### 124-002 — TEST_AUTHENTICITY — ACCEPTED

**Encontrado:** `generateId` é copiado para dentro do smoke.

**Evidência atual:** a cópia coincide com produção no SHA atual e as assertions validam prefixo/comprimento nela.

**Evidência ausente:** import/chamada do `generateId` real exportado por `extension/background/state.js` ou outro contrato canônico escolhido.

**Ação solicitada:** exercitar a implementação real em teste separado ou expor um helper canônico sem duplicação.

**Possível regressão:** produção muda e o smoke preserva uma cópia antiga que continua verde.

**Impacto:** gate não prova o fallback realmente usado pelo background.

**Severidade:** NORMAL.

### 124-003 — FALLBACK_TEST_VALIDITY — ACCEPTED — HIGH

**Encontrado:** o smoke tenta remover `crypto.randomUUID`, mas engole falhas de atribuição/defineProperty e nunca confirma que a função deixou de existir antes de gerar `fallbackId`.

**Evidência atual:** as únicas assertions posteriores verificam prefixo e comprimento, propriedades também satisfeitas pelo caminho randomUUID.

**Evidência ausente:** confirmação explícita do branch usado, idealmente por injeção de dependência ou implementação real testável sem mutar global não confiavelmente.

**Ação solicitada:** criar caso que force deterministicamente o fallback real e falhe caso randomUUID seja chamado; cobrir também `crypto` totalmente ausente.

**Evidência esperada:** spy/cryptoImpl controlado ou ambiente isolado em que o branch primário seja comprovadamente indisponível.

**Possível regressão:** fallback pode quebrar e o smoke ainda imprimir “Fallback ... OK”.

**Impacto:** falsa proteção de compatibilidade com Service Worker/Node sem randomUUID.

**Severidade:** HIGH.

## 13. Fonte integral auditada

~~~javascript
/**
 * smoke-02-uuid-and-reconcile.js
 * Cobre: Fallback de crypto.randomUUID;
 * reconciliação descartando jobs de abas mortas.
 */
'use strict';

const assert = require('assert');

// ── 1. Teste do Fallback de generateId ─────────────────────────────────────────
console.log('[smoke-02] 1. Testando fallback de geração de IDs...');

function generateId(prefix = '') {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return prefix + crypto.randomUUID();
        }
    } catch (_e) {}
    return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Teste com crypto ativo
const id1 = generateId('job_');
assert(id1.startsWith('job_'));
assert(id1.length > 10);

// Teste simulando ausência de crypto.randomUUID (ambiente restrito / SW antigo)
let originalRandomUUID = null;
try {
    originalRandomUUID = crypto.randomUUID;
    try {
        crypto.randomUUID = undefined;
    } catch (_e) {
        try {
            Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
        } catch (_e2) {}
    }
    const fallbackId = generateId('fallback_');
    assert(fallbackId.startsWith('fallback_'));
    assert(fallbackId.length > 15, 'ID gerado pelo fallback determinístico deve ser não-vazio e único');
    console.log('  -> Fallback sem crypto.randomUUID OK:', fallbackId);
} finally {
    if (originalRandomUUID) {
        try {
            crypto.randomUUID = originalRandomUUID;
        } catch (_e) {
            try {
                Object.defineProperty(crypto, 'randomUUID', { value: originalRandomUUID, configurable: true, writable: true });
            } catch (_e2) {}
        }
    }
}

// ── 2. Teste de reconciliação de jobs (reconcileJobs) ─────────────────────────
console.log('[smoke-02] 2. Testando reconciliação com abas vivas e mortas...');

const storage = {};
const clearedAlarms = [];

const mockChrome = {
    runtime: {},
    storage: {
        local: {
            get: (keys, cb) => {
                const res = {};
                if (typeof keys === 'string') res[keys] = storage[keys];
                else if (Array.isArray(keys)) keys.forEach(k => { res[k] = storage[k]; });
                if (cb) cb(res);
                return Promise.resolve(res);
            },
            set: (items, cb) => {
                Object.assign(storage, items);
                if (cb) cb();
                return Promise.resolve();
            },
            remove: (keys, cb) => {
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(k => delete storage[k]);
                if (cb) cb();
                return Promise.resolve();
            }
        }
    },
    tabs: {
        get: (tabId, cb) => {
            // Aba 101 está viva; Aba 102 foi fechada pelo usuário
            if (tabId === 101) {
                mockChrome.runtime.lastError = null;
                cb({ id: 101, status: 'complete' });
            } else {
                mockChrome.runtime.lastError = { message: `No tab with id: ${tabId}` };
                cb(null);
            }
        }
    },
    alarms: {
        clear: (name, cb) => {
            clearedAlarms.push(name);
            if (cb) cb(true);
        }
    }
};

let jobIndex = [
    { geminiTabId: 101, jobId: 'uuid-101', batchId: 'batch-1' },
    { geminiTabId: 102, jobId: 'uuid-102', batchId: 'batch-1' }
];
let activeJobsCount = 2;

storage['gemini_job_101'] = { state: 'running' };
storage['gemini_job_102'] = { state: 'running' };

function tabExists(tabId) {
    return new Promise(resolve => {
        if (!tabId && tabId !== 0) { resolve(false); return; }
        try {
            mockChrome.tabs.get(tabId, (tab) => {
                if (mockChrome.runtime.lastError || !tab) resolve(false);
                else resolve(true);
            });
        } catch (_e) { resolve(false); }
    });
}

async function reconcileJobs() {
    if (!Array.isArray(jobIndex) || jobIndex.length === 0) {
        activeJobsCount = 0;
        return { alive: 0, dropped: 0 };
    }

    const alive = [];
    const dropped = [];
    for (const entry of jobIndex) {
        if (!entry) continue;
        const exists = await tabExists(entry.geminiTabId);
        if (exists) alive.push(entry);
        else dropped.push(entry);
    }

    if (dropped.length > 0) {
        const keys = [];
        dropped.forEach(entry => {
            keys.push(`gemini_job_${entry.geminiTabId}`);
            keys.push(`wd_data_${entry.geminiTabId}`);
            const alarmName = entry.jobId ? `watchdog_${entry.jobId}` : `watchdog_${entry.geminiTabId}`;
            mockChrome.alarms.clear(alarmName, () => {});
        });
        await mockChrome.storage.local.remove(keys);
    }

    jobIndex = alive;
    activeJobsCount = alive.length;
    return { alive: alive.length, dropped: dropped.length };
}

async function runReconcileTest() {
    const res = await reconcileJobs();
    assert.strictEqual(res.alive, 1, '1 aba viva');
    assert.strictEqual(res.dropped, 1, '1 aba morta descartada');
    assert.strictEqual(jobIndex.length, 1);
    assert.strictEqual(jobIndex[0].geminiTabId, 101);
    assert.strictEqual(activeJobsCount, 1);

    // Verifica que o storage da aba morta foi limpo
    assert.strictEqual(storage['gemini_job_101'] !== undefined, true, 'Aba viva preservada');
    assert.strictEqual(storage['gemini_job_102'], undefined, 'Aba morta purgada do storage');
    assert(clearedAlarms.includes('watchdog_uuid-102'), 'Alarme da aba morta cancelado');

    console.log('  -> Reconciliação descartando abas mortas OK');
    console.log('✅ smoke-02-uuid-and-reconcile passou com sucesso.');
}

runReconcileTest().catch(err => {
    console.error('❌ Falha em smoke-02-uuid-and-reconcile:', err);
    process.exit(1);
});
~~~

## 14. Cobertura integral por posições

A fonte contém **176 linhas textuais + LF terminal = 177 posições**. As faixas abaixo cobrem 1–177 sem lacunas.

### Linhas 1–6 — Cabeçalho e strict mode

Declara a intenção do smoke: fallback de randomUUID e reconciliação de jobs; strict mode afeta especialmente tentativas de atribuir em propriedades não graváveis.

**Evidência:** 🟨 EXECUTADO: o arquivo inteiro roda como processo Node pelo smoke runner; comentários não são prova de que o alvo de produção é exercitado.

### Linhas 7–8 — Import de assert

Carrega o assert clássico do Node usado nas verificações síncronas e assíncronas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linhas 9–12 — Início do bloco generateId

Mensagem de progresso e separação do primeiro cenário.

**Evidência:** ⚠️ Sem propriedade comportamental independente.

### Linhas 13–20 — Cópia local de generateId

Implementa localmente randomUUID quando disponível e fallback Date.now + dois Math.random. O código coincide hoje com a função de extension/background/state.js e com a cópia em background.js, mas o smoke não importa nenhuma delas.

**Evidência:** 🟨 PROVA DA CÓPIA LOCAL; ⚠️ NÃO PROVA a implementação de produção. Lacuna 124-002.

### Linhas 21–25 — Caso com crypto ativo

Gera id job_, exige prefixo e comprimento >10. Não fixa formato UUID nem chama implementação real.

**Evidência:** ✅ PROVADO DIRETAMENTE apenas para generateId local.

### Linhas 26–41 — Tentativa de forçar fallback

Salva crypto.randomUUID, tenta substituí-lo por undefined por atribuição ou defineProperty, gera fallback_ e verifica prefixo/comprimento. Não confirma que randomUUID ficou realmente indisponível antes de chamar generateId.

**Evidência:** ⚠️ PROVA INSUFICIENTE DO FALLBACK: pode permanecer no caminho randomUUID e ainda passar. Lacuna 124-003.

### Linhas 42–52 — Restauração de randomUUID

No finally, restaura a função original por atribuição ou defineProperty se ela era truthy. Evita contaminar o processo quando a mutação foi possível.

**Evidência:** 🟨 EXECUTADO; sem assertion pós-restauração.

### Linhas 53–56 — Início da reconciliação

Mensagem de progresso do segundo cenário.

**Evidência:** ⚠️ Estrutural.

### Linhas 57–58 — Stores locais do smoke

Objeto storage e lista clearedAlarms armazenam efeitos do reconciliador local.

**Evidência:** ✅ Exercitados pelas assertions finais, mas são fixtures próprias.

### Linhas 59–102 — mockChrome local

Implementa subset runtime/storage/tabs/alarms. `tabs.get` considera 101 viva e qualquer outra morta; storage é objeto in-memory; `alarms.clear` só registra nomes.

**Evidência:** 🟨 PARCIALMENTE EXERCITADO + ESTRUTURAL. O cenário usa `tabs.get` via `tabExists`, `alarms.clear` para o job descartado e `storage.local.remove(keys)` sem callback. `storage.local.get/set` e o branch de callback de `remove` são apenas definidos nesta faixa e não são exercitados; regressões nesses stubs podem manter o smoke verde. Continua sendo mock local, não browser real nem prova da implementação de produção.

### Linhas 103–111 — Estado inicial da reconciliação

Cria dois jobs do mesmo batch, activeJobsCount=2 e duas chaves gemini_job no storage local.

**Evidência:** ✅ Fixture determinística do smoke.

### Linhas 112–123 — tabExists local

Wrapper Promise sobre mockChrome.tabs.get; aceita tabId=0, considera lastError/tab nula como false e captura exceptions.

**Evidência:** 🟨 PROVA DA CÓPIA LOCAL; não importa tabExists de produção.

### Linhas 124–154 — reconcileJobs local simplificado

Particiona jobIndex por tabExists, apaga gemini_job/wd_data dos mortos, limpa watchdog, substitui índice pelos vivos e atualiza count. É uma implementação embutida no teste, não o reconciliador atual do runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO da implementação de produção; divergência substancial registrada em 124-001.

### Linhas 155–167 — Assertions de reconciliação

Exige alive=1, dropped=1, job 101 preservado, count=1, storage 102 removido e watchdog_uuid-102 limpo.

**Evidência:** ✅ PROVADO DIRETAMENTE para o reconciliador local do smoke; não pode ser promovido para o módulo real.

### Linhas 168–171 — Logs de sucesso e fechamento

Imprime sucesso somente após as assertions de reconciliação.

**Evidência:** 🟨 EXECUTADO quando cenário passa.

### Linhas 172–176 — Entry point e tratamento de falha

Executa runReconcileTest; rejeição imprime erro e chama process.exit(1), permitindo ao runner detectar falha.

**Evidência:** ✅ PROVADO ESTRUTURALMENTE pelo código e pelo contrato spawn/status do runner.

### Linha 177 — Newline final

LF terminal cria a 177ª posição documental.

**Evidência:** ⚠️ Sem comportamento runtime.

## 15. Autoauditoria documental

- reserva relida: **AGENTE 10**;
- state relido: **IN_PROGRESS / AGENTE 10**;
- SHA reconfirmado: `d977f43a4b29653d01b0fd9c395cb04edb9c1a50`;
- fonte integral inserida diretamente do blob;
- **177/177 posições** cobertas;
- `tests/smoke/run-smoke.js` lido;
- `extension/background/state.js` lido;
- `extension/background.js` lido;
- `extension/background/jobs-reconciliation.js` lido;
- teste real `jobs-reconciliation-batch-queue.test.js` lido como evidência externa separada;
- simulação local não foi promovida a prova da implementação real;
- três solicitações ao auditor registradas;
- nenhum arquivo externo foi alterado.

**Conclusão documental:** Bíblia completa para o comportamento real deste smoke no SHA auditado. O arquivo pode ser marcado `COMPLETED`, mas sua função atual é parcialmente de **simulação/mirror**, e isso permanece explícito nas solicitações 124-001..003.

> **Lifecycle pós-REAUDIT:** 124-001/002/003 estão ACCEPTED. A faixa 59–102 recebe prova apenas dos métodos/branches realmente usados pelo smoke; o restante é evidência estrutural.

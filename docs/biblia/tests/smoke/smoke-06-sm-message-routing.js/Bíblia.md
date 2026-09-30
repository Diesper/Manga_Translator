# Bíblia técnica — tests/smoke/smoke-06-sm-message-routing.js

> **Estado documental:** ✅ CONCLUÍDO pelo AGENTE 9
> **SHA auditado:** `dd32621bee49bfe64bb4a667ecbf68fb516e03dd`
> **Agente responsável:** AGENTE 9
> **Tipo real observado:** smoke Node do `storage-manager.js` real atrás de um **roteador SM copiado**
> **Linhas textuais:** **138**
> **Posições documentais:** **139**, contando o newline final
> **PR:** #66
> **Branch:** docs/project-bible

## 1. Papel arquitetural real

O arquivo executa a implementação real de `extension/shared/storage-manager.js` sobre `fake-indexeddb`, mas não executa o listener SM real do background. Em vez disso, define sua própria `handleStorageManagerMessage` e chama essa cópia por `sendMsg`. O cabeçalho, portanto, superestima a evidência quando afirma “listener real”.

Essa distinção já é material: o espelho está desatualizado em relação ao `background.js` atual. Assim, o smoke pode permanecer verde mesmo quando o contrato real de roteamento tem shape ou comportamento diferente.

## 2. Drift funcional comprovado

- Em rejeições, a produção registra `SM_ERROR` via logger antes de responder; a cópia não registra.
- Em `SM_STATS`, a produção usa `sm.stats().then(stats => ({ stats }))`, logo o payload final é `{ok:true, stats:{pages,assets,bytes}}`. A cópia espalha `{pages,assets,bytes}` no topo.
- A assertion do smoke usa `statsRes.resp.assets >= 1`; ela comprova o shape da cópia, não o shape da produção.
- Para ação `SM_*` desconhecida, a produção usa `default: return false`; a cópia envia erro e retorna `true`.
- A cópia aceita fallback quando `sm.stats` não existe; a produção chama `sm.stats()` diretamente.

## 3. Relação com o listener real

No `background.js` atual, o listener principal chama primeiro o roteador GTC e depois `handleStorageManagerMessage(request, sender, sendResponse)`. Se este retornar true, o listener mantém o canal assíncrono. Este smoke não atravessa essa cadeia: chama sua função local diretamente.

## 4. Matriz de evidência

| Contrato | Evidência deste arquivo | Classificação |
|---|---|---|
| SAVE_PAGE persiste asset/página | storage-manager real + fake IndexedDB | ✅ PROVADO DIRETAMENTE |
| PAGE_INDEX devolve uma página | storage-manager real | ✅ PROVADO DIRETAMENTE |
| GET_PAGE devolve o Data URL salvo | storage-manager real | ✅ PROVADO DIRETAMENTE |
| STATS conta asset | `storage-manager.stats()` real, porém shape é alterado pela cópia | ✅ operação / ⚠️ roteamento real |
| DELETE_CHAPTER resolve | storage-manager real | ✅ PROVADO DIRETAMENTE |
| cinco mensagens não-SM retornam false | cópia local | ✅ para a cópia / 🟨 para produção |
| listener real roteia SM_* | background não é carregado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| shape real de SM_STATS | a cópia diverge | ⚠️ EVIDÊNCIA INVÁLIDA PARA O HANDLER REAL |
| SM desconhecida retorna false na produção | não testado; cópia faz o oposto | ⚠️ SEM PROVA + DRIFT |
| GET_ASSET, RESTORE_INDEX, LIST_RESTORE, CHAPTERS_STATS, DELETE_CLEAN_URL, MIGRATE | branches não executados por `run()` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Dependências

- `assert`: assertions nativas.
- `fake-indexeddb/auto`: banco IndexedDB em memória.
- `global.chrome.storage.local`: stub mínimo não persistente.
- `extension/shared/storage-manager.js`: implementação real.
- `tests/smoke/run-smoke.js`: executa cada `smoke-*.js` em subprocesso e falha se o exit code não for zero.
- `package.json#test:smoke`: `node tests/smoke/run-smoke.js`.

## 6. Solicitações ao auditor

- **128-001 — TEST_VALIDITY — OPEN — HIGH:** a suíte declara listener real, mas usa cópia local já divergente. Reclassificar ou executar handler real.
- **128-002 — REGRESSION — OPEN — HIGH:** corrigir/provar o contrato de `SM_STATS`; produção retorna `resp.stats.assets`, enquanto o smoke exige `resp.assets`.
- **128-003 — REGRESSION — OPEN — HIGH:** provar o default real de ação `SM_*` desconhecida (`return false`), oposto à cópia.
- **128-004 — TEST_REQUIRED — OPEN:** cobrir branches atualmente não executados e o caminho de rejeição/erro do handler real.
- **128-005 — TEST_ARCHITECTURE_REVIEW — OPEN:** eliminar ou controlar drift da duplicação manual do handler.

## 7. Fonte integral exata

```js
/**
 * smoke-06-sm-message-routing.js
 * Cobre: Roteamento de mensagens SM_* pelo listener real
 * + regressão de mensagens não-SM.
 */
'use strict';

const assert = require('assert');
require('fake-indexeddb/auto');

global.chrome = {
    storage: {
        local: {
            get: () => Promise.resolve({}),
            set: () => Promise.resolve(),
            remove: () => Promise.resolve(),
        }
    }
};

const storageManagerApi = require('../../extension/shared/storage-manager.js');

// Simulação fiel do handler de roteamento do background.js
function handleStorageManagerMessage(request, sender, sendResponse) {
    if (!request || typeof request.action !== 'string' || request.action.indexOf('SM_') !== 0) return false;

    const sm = storageManagerApi;
    if (!sm) {
        sendResponse({ ok: false, error: 'storage-manager indisponível' });
        return true;
    }

    const run = (promise) => {
        promise
            .then(result => sendResponse({ ok: true, ...(result || {}) }))
            .catch(error => {
                const message = error && error.message ? error.message : String(error);
                sendResponse({ ok: false, error: message });
            });
        return true;
    };

    switch (request.action) {
        case 'SM_SAVE_PAGE':
            return run(sm.savePageResult(
                request.chapterId, request.pageIndex, request.dataUrl,
                request.originalUrl || '', request.cleanUrl || '', request.meta || {}
            ));
        case 'SM_GET_ASSET':
            return run(sm.getAssetDataUrl(request.assetId).then(dataUrl => ({ dataUrl })));
        case 'SM_GET_PAGE':
            return run(sm.getPageDataUrl(request.chapterId, request.pageIndex).then(dataUrl => ({ dataUrl })));
        case 'SM_PAGE_INDEX':
            return run(sm.getChapterPageIndex(request.chapterId).then(pages => ({ pages })));
        case 'SM_RESTORE_INDEX':
            return run(sm.getRestoreIndex(request.chapterId).then(entries => ({ entries })));
        case 'SM_LIST_RESTORE':
            return run(sm.listRestoreEntries(request.chapterIds || null).then(entries => ({ entries })));
        case 'SM_CHAPTERS_STATS':
            return run(sm.getChaptersStats(request.chapterIds || []).then(stats => ({ stats })));
        case 'SM_DELETE_CLEAN_URL':
            return run(sm.deleteByCleanUrl(request.cleanUrl));
        case 'SM_DELETE_CHAPTER':
            return run(sm.deleteChapter(request.chapterId));
        case 'SM_MIGRATE_CHAPTER':
            return run(sm.migrateChapterFromLegacy(request.chapterId));
        case 'SM_STATS':
            return run(sm.stats ? sm.stats() : Promise.resolve({ pages: 0, assets: 0, bytes: 0 }));
        default:
            sendResponse({ ok: false, error: `Ação SM desconhecida: ${request.action}` });
            return true;
    }
}

function sendMsg(req) {
    return new Promise((resolve) => {
        const handled = handleStorageManagerMessage(req, {}, (resp) => {
            resolve({ handled, resp });
        });
        if (!handled) resolve({ handled: false, resp: null });
    });
}

async function run() {
    console.log('[smoke-06] 1. Testando regressão de mensagens não-SM...');
    // Mensagens normais do sistema NÃO devem ser interceptadas pelo handler SM
    const nonSmActions = ['GET_STATUS', 'START_BATCH', 'STOP_BATCH', 'GTC_QUERY', 'TRANSLATE_IMAGE'];
    for (const act of nonSmActions) {
        const res = await sendMsg({ action: act });
        assert.strictEqual(res.handled, false, `Ação não-SM '${act}' não deve ser capturada pelo handler SM`);
    }
    console.log('  -> Mensagens não-SM passam livremente OK');

    console.log('[smoke-06] 2. Testando roteamento de SM_SAVE_PAGE...');
    const dummyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const saveRes = await sendMsg({
        action: 'SM_SAVE_PAGE',
        chapterId: 'chap_route_test',
        pageIndex: 0,
        dataUrl: dummyPng,
        cleanUrl: 'https://site.com/c1.png',
        originalUrl: 'https://site.com/o1.png',
    });
    assert.strictEqual(saveRes.handled, true);
    assert.strictEqual(saveRes.resp.ok, true);
    assert(saveRes.resp.assetId, 'Resposta deve conter assetId');
    console.log('  -> SM_SAVE_PAGE roteado e respondido com sucesso');

    console.log('[smoke-06] 3. Testando roteamento de SM_PAGE_INDEX e SM_GET_PAGE...');
    const indexRes = await sendMsg({ action: 'SM_PAGE_INDEX', chapterId: 'chap_route_test' });
    assert.strictEqual(indexRes.handled, true);
    assert.strictEqual(indexRes.resp.ok, true);
    assert.strictEqual(indexRes.resp.pages.length, 1);

    const pageRes = await sendMsg({ action: 'SM_GET_PAGE', chapterId: 'chap_route_test', pageIndex: 0 });
    assert.strictEqual(pageRes.handled, true);
    assert.strictEqual(pageRes.resp.ok, true);
    assert.strictEqual(pageRes.resp.dataUrl, dummyPng);
    console.log('  -> SM_PAGE_INDEX e SM_GET_PAGE OK');

    console.log('[smoke-06] 4. Testando roteamento de SM_STATS e SM_DELETE_CHAPTER...');
    const statsRes = await sendMsg({ action: 'SM_STATS' });
    assert.strictEqual(statsRes.handled, true);
    assert.strictEqual(statsRes.resp.ok, true);
    assert(statsRes.resp.assets >= 1);

    const delRes = await sendMsg({ action: 'SM_DELETE_CHAPTER', chapterId: 'chap_route_test' });
    assert.strictEqual(delRes.handled, true);
    assert.strictEqual(delRes.resp.ok, true);
    console.log('  -> SM_STATS e SM_DELETE_CHAPTER OK');

    console.log('✅ smoke-06-sm-message-routing passou com sucesso.');
}

run().catch(err => {
    console.error('❌ Falha em smoke-06-sm-message-routing:', err);
    process.exit(1);
});
```

## 8. Auditoria linha a linha

### Linha 001 — cabeçalho

- **Código:** `/**`
- **O que faz:** Comentário documental do smoke; não executa código.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 002 — cabeçalho

- **Código:** ` * smoke-06-sm-message-routing.js`
- **O que faz:** Comentário documental do smoke; não executa código.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 003 — cabeçalho

- **Código:** ` * Cobre: Roteamento de mensagens SM_* pelo listener real`
- **O que faz:** Declara cobertura pelo “listener real”; isso é inexato porque o corpo define e chama uma cópia local do handler.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ⚠️ A classificação “listener real” não é sustentada pelo corpo; existe uma cópia local.

### Linha 004 — cabeçalho

- **Código:** ` * + regressão de mensagens não-SM.`
- **O que faz:** Comentário documental do smoke; não executa código.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 005 — cabeçalho

- **Código:** ` */`
- **O que faz:** Comentário documental do smoke; não executa código.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 006 — cabeçalho

- **Código:** `'use strict';`
- **O que faz:** Participa do bloco `cabeçalho` com a operação literal desta linha.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 007 — ambiente Node/Chrome

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 008 — ambiente Node/Chrome

- **Código:** `const assert = require('assert');`
- **O que faz:** Importa o módulo nativo `assert` para as verificações do smoke.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 009 — ambiente Node/Chrome

- **Código:** `require('fake-indexeddb/auto');`
- **O que faz:** Instala `fake-indexeddb` no ambiente global para que o storage-manager real possa abrir IndexedDB em Node.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 010 — ambiente Node/Chrome

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 011 — ambiente Node/Chrome

- **Código:** `global.chrome = {`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 012 — ambiente Node/Chrome

- **Código:** `    storage: {`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 013 — ambiente Node/Chrome

- **Código:** `        local: {`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 014 — ambiente Node/Chrome

- **Código:** `            get: () => Promise.resolve({}),`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 015 — ambiente Node/Chrome

- **Código:** `            set: () => Promise.resolve(),`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 016 — ambiente Node/Chrome

- **Código:** `            remove: () => Promise.resolve(),`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 017 — ambiente Node/Chrome

- **Código:** `        }`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 018 — ambiente Node/Chrome

- **Código:** `    }`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 019 — ambiente Node/Chrome

- **Código:** `};`
- **O que faz:** Constrói um `global.chrome.storage.local` mínimo; get retorna sempre vazio e set/remove apenas resolvem, sem persistência.
- **Como:** Muta o global do processo Node antes de importar storage-manager.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 020 — ambiente Node/Chrome

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 021 — ambiente Node/Chrome

- **Código:** `const storageManagerApi = require('../../extension/shared/storage-manager.js');`
- **O que faz:** Importa a implementação real `extension/shared/storage-manager.js`.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 022 — espelho local do roteador SM

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 023 — espelho local do roteador SM

- **Código:** `// Simulação fiel do handler de roteamento do background.js`
- **O que faz:** O próprio comentário reconhece que o handler abaixo é uma simulação/cópia do background.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** ⚠️ A classificação “listener real” não é sustentada pelo corpo; existe uma cópia local.

### Linha 024 — espelho local do roteador SM

- **Código:** `function handleStorageManagerMessage(request, sender, sendResponse) {`
- **O que faz:** Declara `handleStorageManagerMessage` local; esta função não é importada de `background.js`.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** ⚠️ A classificação “listener real” não é sustentada pelo corpo; existe uma cópia local.

### Linha 025 — espelho local do roteador SM

- **Código:** `    if (!request || typeof request.action !== 'string' || request.action.indexOf('SM_') !== 0) return false;`
- **O que faz:** Replica a guarda: somente actions string iniciadas por `SM_` são aceitas.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 026 — espelho local do roteador SM

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 027 — espelho local do roteador SM

- **Código:** `    const sm = storageManagerApi;`
- **O que faz:** Associa `sm` à API real do storage-manager.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 028 — espelho local do roteador SM

- **Código:** `    if (!sm) {`
- **O que faz:** Define fallback local para ausência da API de storage-manager, respondendo erro e marcando a mensagem como tratada.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 029 — espelho local do roteador SM

- **Código:** `        sendResponse({ ok: false, error: 'storage-manager indisponível' });`
- **O que faz:** Define fallback local para ausência da API de storage-manager, respondendo erro e marcando a mensagem como tratada.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 030 — espelho local do roteador SM

- **Código:** `        return true;`
- **O que faz:** Define fallback local para ausência da API de storage-manager, respondendo erro e marcando a mensagem como tratada.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 031 — espelho local do roteador SM

- **Código:** `    }`
- **O que faz:** Define fallback local para ausência da API de storage-manager, respondendo erro e marcando a mensagem como tratada.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 032 — espelho local do roteador SM

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 033 — espelho local do roteador SM

- **Código:** `    const run = (promise) => {`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 034 — espelho local do roteador SM

- **Código:** `        promise`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 035 — espelho local do roteador SM

- **Código:** `            .then(result => sendResponse({ ok: true, ...(result || {}) }))`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 036 — espelho local do roteador SM

- **Código:** `            .catch(error => {`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 037 — espelho local do roteador SM

- **Código:** `                const message = error && error.message ? error.message : String(error);`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 038 — espelho local do roteador SM

- **Código:** `                sendResponse({ ok: false, error: message });`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 039 — espelho local do roteador SM

- **Código:** `            });`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 040 — espelho local do roteador SM

- **Código:** `        return true;`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 041 — espelho local do roteador SM

- **Código:** `    };`
- **O que faz:** Implementa helper `run` que converte Promise da API SM em `sendResponse` assíncrono e retorna true.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 042 — espelho local do roteador SM

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 043 — espelho local do roteador SM

- **Código:** `    switch (request.action) {`
- **O que faz:** Abre o switch da action SM na cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 044 — espelho local do roteador SM

- **Código:** `        case 'SM_SAVE_PAGE':`
- **O que faz:** Seleciona o branch `SM_SAVE_PAGE` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 045 — espelho local do roteador SM

- **Código:** `            return run(sm.savePageResult(`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 046 — espelho local do roteador SM

- **Código:** `                request.chapterId, request.pageIndex, request.dataUrl,`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 047 — espelho local do roteador SM

- **Código:** `                request.originalUrl || '', request.cleanUrl || '', request.meta || {}`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 048 — espelho local do roteador SM

- **Código:** `            ));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 049 — espelho local do roteador SM

- **Código:** `        case 'SM_GET_ASSET':`
- **O que faz:** Seleciona o branch `SM_GET_ASSET` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 050 — espelho local do roteador SM

- **Código:** `            return run(sm.getAssetDataUrl(request.assetId).then(dataUrl => ({ dataUrl })));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 051 — espelho local do roteador SM

- **Código:** `        case 'SM_GET_PAGE':`
- **O que faz:** Seleciona o branch `SM_GET_PAGE` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 052 — espelho local do roteador SM

- **Código:** `            return run(sm.getPageDataUrl(request.chapterId, request.pageIndex).then(dataUrl => ({ dataUrl })));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 053 — espelho local do roteador SM

- **Código:** `        case 'SM_PAGE_INDEX':`
- **O que faz:** Seleciona o branch `SM_PAGE_INDEX` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 054 — espelho local do roteador SM

- **Código:** `            return run(sm.getChapterPageIndex(request.chapterId).then(pages => ({ pages })));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 055 — espelho local do roteador SM

- **Código:** `        case 'SM_RESTORE_INDEX':`
- **O que faz:** Seleciona o branch `SM_RESTORE_INDEX` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 056 — espelho local do roteador SM

- **Código:** `            return run(sm.getRestoreIndex(request.chapterId).then(entries => ({ entries })));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 057 — espelho local do roteador SM

- **Código:** `        case 'SM_LIST_RESTORE':`
- **O que faz:** Seleciona o branch `SM_LIST_RESTORE` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 058 — espelho local do roteador SM

- **Código:** `            return run(sm.listRestoreEntries(request.chapterIds || null).then(entries => ({ entries })));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 059 — espelho local do roteador SM

- **Código:** `        case 'SM_CHAPTERS_STATS':`
- **O que faz:** Seleciona o branch `SM_CHAPTERS_STATS` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 060 — espelho local do roteador SM

- **Código:** `            return run(sm.getChaptersStats(request.chapterIds || []).then(stats => ({ stats })));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 061 — espelho local do roteador SM

- **Código:** `        case 'SM_DELETE_CLEAN_URL':`
- **O que faz:** Seleciona o branch `SM_DELETE_CLEAN_URL` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 062 — espelho local do roteador SM

- **Código:** `            return run(sm.deleteByCleanUrl(request.cleanUrl));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 063 — espelho local do roteador SM

- **Código:** `        case 'SM_DELETE_CHAPTER':`
- **O que faz:** Seleciona o branch `SM_DELETE_CHAPTER` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 064 — espelho local do roteador SM

- **Código:** `            return run(sm.deleteChapter(request.chapterId));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 065 — espelho local do roteador SM

- **Código:** `        case 'SM_MIGRATE_CHAPTER':`
- **O que faz:** Seleciona o branch `SM_MIGRATE_CHAPTER` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 066 — espelho local do roteador SM

- **Código:** `            return run(sm.migrateChapterFromLegacy(request.chapterId));`
- **O que faz:** Encaminha parâmetros da request para uma operação real do storage-manager, mas através do roteador copiado.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 067 — espelho local do roteador SM

- **Código:** `        case 'SM_STATS':`
- **O que faz:** Seleciona o branch `SM_STATS` da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 068 — espelho local do roteador SM

- **Código:** `            return run(sm.stats ? sm.stats() : Promise.resolve({ pages: 0, assets: 0, bytes: 0 }));`
- **O que faz:** Na cópia, `SM_STATS` retorna o resultado de `sm.stats()` diretamente ao helper; a produção atual embrulha o resultado em `{stats}`.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 069 — espelho local do roteador SM

- **Código:** `        default:`
- **O que faz:** Abre o caso default da cópia local.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 070 — espelho local do roteador SM

- **Código:** `            sendResponse({ ok: false, error: \`Ação SM desconhecida: ${request.action}\` });`
- **O que faz:** Responde erro explícito a SM desconhecida; a produção atual não faz isso.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 071 — espelho local do roteador SM

- **Código:** `            return true;`
- **O que faz:** Retorna true para SM desconhecida; a produção atual usa `default: return false`.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 072 — espelho local do roteador SM

- **Código:** `    }`
- **O que faz:** Fecha uma construção sintática do bloco corrente.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 073 — espelho local do roteador SM

- **Código:** `}`
- **O que faz:** Fecha uma construção sintática do bloco corrente.
- **Como:** Executa código copiado dentro deste arquivo; não atravessa o `chrome.runtime.onMessage` nem a função carregada de `background.js`.
- **Por que / risco:** A cópia torna o smoke simples, mas separa a prova do código de produção e permite drift — já comprovado nesta auditoria.
- **Evidência:** 🟨 EXECUTADO como espelho local; comparação com produção revelou drift funcional.

### Linha 074 — adaptador assíncrono sendMsg

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 075 — adaptador assíncrono sendMsg

- **Código:** `function sendMsg(req) {`
- **O que faz:** Declara helper `sendMsg` que transforma callback do handler local em Promise.
- **Como:** Usa uma Promise para adaptar `sendResponse` ao fluxo `await` do smoke.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 076 — adaptador assíncrono sendMsg

- **Código:** `    return new Promise((resolve) => {`
- **O que faz:** Executa a cópia local e resolve `{handled, resp}` para uso sequencial por `run()`.
- **Como:** Usa uma Promise para adaptar `sendResponse` ao fluxo `await` do smoke.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 077 — adaptador assíncrono sendMsg

- **Código:** `        const handled = handleStorageManagerMessage(req, {}, (resp) => {`
- **O que faz:** Executa a cópia local e resolve `{handled, resp}` para uso sequencial por `run()`.
- **Como:** Usa uma Promise para adaptar `sendResponse` ao fluxo `await` do smoke.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 078 — adaptador assíncrono sendMsg

- **Código:** `            resolve({ handled, resp });`
- **O que faz:** Executa a cópia local e resolve `{handled, resp}` para uso sequencial por `run()`.
- **Como:** Usa uma Promise para adaptar `sendResponse` ao fluxo `await` do smoke.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 079 — adaptador assíncrono sendMsg

- **Código:** `        });`
- **O que faz:** Executa a cópia local e resolve `{handled, resp}` para uso sequencial por `run()`.
- **Como:** Usa uma Promise para adaptar `sendResponse` ao fluxo `await` do smoke.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 080 — adaptador assíncrono sendMsg

- **Código:** `        if (!handled) resolve({ handled: false, resp: null });`
- **O que faz:** Executa a cópia local e resolve `{handled, resp}` para uso sequencial por `run()`.
- **Como:** Usa uma Promise para adaptar `sendResponse` ao fluxo `await` do smoke.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 081 — adaptador assíncrono sendMsg

- **Código:** `    });`
- **O que faz:** Executa a cópia local e resolve `{handled, resp}` para uso sequencial por `run()`.
- **Como:** Usa uma Promise para adaptar `sendResponse` ao fluxo `await` do smoke.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 082 — adaptador assíncrono sendMsg

- **Código:** `}`
- **O que faz:** Executa a cópia local e resolve `{handled, resp}` para uso sequencial por `run()`.
- **Como:** Usa uma Promise para adaptar `sendResponse` ao fluxo `await` do smoke.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 083 — regressão não-SM

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** É avaliado diretamente pelo Node quando o arquivo smoke é executado.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 084 — regressão não-SM

- **Código:** `async function run() {`
- **O que faz:** Declara a rotina principal do smoke.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 085 — regressão não-SM

- **Código:** `    console.log('[smoke-06] 1. Testando regressão de mensagens não-SM...');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 086 — regressão não-SM

- **Código:** `    // Mensagens normais do sistema NÃO devem ser interceptadas pelo handler SM`
- **O que faz:** Comentário documental do smoke; não executa código.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 087 — regressão não-SM

- **Código:** `    const nonSmActions = ['GET_STATUS', 'START_BATCH', 'STOP_BATCH', 'GTC_QUERY', 'TRANSLATE_IMAGE'];`
- **O que faz:** Lista cinco actions não-SM usadas para provar a guarda da cópia.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 088 — regressão não-SM

- **Código:** `    for (const act of nonSmActions) {`
- **O que faz:** Itera actions não-SM e exige que a cópia retorne `handled=false`.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 089 — regressão não-SM

- **Código:** `        const res = await sendMsg({ action: act });`
- **O que faz:** Itera actions não-SM e exige que a cópia retorne `handled=false`.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 090 — regressão não-SM

- **Código:** `        assert.strictEqual(res.handled, false, \`Ação não-SM '${act}' não deve ser capturada pelo handler SM\`);`
- **O que faz:** Itera actions não-SM e exige que a cópia retorne `handled=false`.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 091 — regressão não-SM

- **Código:** `    }`
- **O que faz:** Itera actions não-SM e exige que a cópia retorne `handled=false`.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 092 — regressão não-SM

- **Código:** `    console.log('  -> Mensagens não-SM passam livremente OK');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Assertion direta para a guarda da cópia; não prova o listener real.

### Linha 093 — SM_SAVE_PAGE

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 094 — SM_SAVE_PAGE

- **Código:** `    console.log('[smoke-06] 2. Testando roteamento de SM_SAVE_PAGE...');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 095 — SM_SAVE_PAGE

- **Código:** `    const dummyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';`
- **O que faz:** Define um PNG 1×1 sintético em Data URL para persistência no storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 096 — SM_SAVE_PAGE

- **Código:** `    const saveRes = await sendMsg({`
- **O que faz:** Monta e envia SM_SAVE_PAGE pela cópia local para o storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 097 — SM_SAVE_PAGE

- **Código:** `        action: 'SM_SAVE_PAGE',`
- **O que faz:** Monta e envia SM_SAVE_PAGE pela cópia local para o storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 098 — SM_SAVE_PAGE

- **Código:** `        chapterId: 'chap_route_test',`
- **O que faz:** Monta e envia SM_SAVE_PAGE pela cópia local para o storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 099 — SM_SAVE_PAGE

- **Código:** `        pageIndex: 0,`
- **O que faz:** Monta e envia SM_SAVE_PAGE pela cópia local para o storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 100 — SM_SAVE_PAGE

- **Código:** `        dataUrl: dummyPng,`
- **O que faz:** Monta e envia SM_SAVE_PAGE pela cópia local para o storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 101 — SM_SAVE_PAGE

- **Código:** `        cleanUrl: 'https://site.com/c1.png',`
- **O que faz:** Monta e envia SM_SAVE_PAGE pela cópia local para o storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 102 — SM_SAVE_PAGE

- **Código:** `        originalUrl: 'https://site.com/o1.png',`
- **O que faz:** Monta e envia SM_SAVE_PAGE pela cópia local para o storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 103 — SM_SAVE_PAGE

- **Código:** `    });`
- **O que faz:** Monta e envia SM_SAVE_PAGE pela cópia local para o storage-manager real.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 104 — SM_SAVE_PAGE

- **Código:** `    assert.strictEqual(saveRes.handled, true);`
- **O que faz:** Asserts que SAVE_PAGE foi tratado, respondeu ok e gerou assetId.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 105 — SM_SAVE_PAGE

- **Código:** `    assert.strictEqual(saveRes.resp.ok, true);`
- **O que faz:** Asserts que SAVE_PAGE foi tratado, respondeu ok e gerou assetId.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 106 — SM_SAVE_PAGE

- **Código:** `    assert(saveRes.resp.assetId, 'Resposta deve conter assetId');`
- **O que faz:** Asserts que SAVE_PAGE foi tratado, respondeu ok e gerou assetId.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 107 — SM_SAVE_PAGE

- **Código:** `    console.log('  -> SM_SAVE_PAGE roteado e respondido com sucesso');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 108 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 109 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    console.log('[smoke-06] 3. Testando roteamento de SM_PAGE_INDEX e SM_GET_PAGE...');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 110 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    const indexRes = await sendMsg({ action: 'SM_PAGE_INDEX', chapterId: 'chap_route_test' });`
- **O que faz:** Envia SM_PAGE_INDEX pela cópia local.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 111 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    assert.strictEqual(indexRes.handled, true);`
- **O que faz:** Asserts handled/ok e uma página no índice retornado.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 112 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    assert.strictEqual(indexRes.resp.ok, true);`
- **O que faz:** Asserts handled/ok e uma página no índice retornado.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 113 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    assert.strictEqual(indexRes.resp.pages.length, 1);`
- **O que faz:** Asserts handled/ok e uma página no índice retornado.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 114 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 115 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    const pageRes = await sendMsg({ action: 'SM_GET_PAGE', chapterId: 'chap_route_test', pageIndex: 0 });`
- **O que faz:** Envia SM_GET_PAGE para a página zero.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 116 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    assert.strictEqual(pageRes.handled, true);`
- **O que faz:** Asserts handled/ok e igualdade do Data URL recuperado.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 117 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    assert.strictEqual(pageRes.resp.ok, true);`
- **O que faz:** Asserts handled/ok e igualdade do Data URL recuperado.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 118 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    assert.strictEqual(pageRes.resp.dataUrl, dummyPng);`
- **O que faz:** Asserts handled/ok e igualdade do Data URL recuperado.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 119 — SM_PAGE_INDEX e SM_GET_PAGE

- **Código:** `    console.log('  -> SM_PAGE_INDEX e SM_GET_PAGE OK');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 120 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 121 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    console.log('[smoke-06] 4. Testando roteamento de SM_STATS e SM_DELETE_CHAPTER...');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 122 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    const statsRes = await sendMsg({ action: 'SM_STATS' });`
- **O que faz:** Envia SM_STATS pela cópia local.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 123 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    assert.strictEqual(statsRes.handled, true);`
- **O que faz:** Asserts handled e ok para SM_STATS.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 124 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    assert.strictEqual(statsRes.resp.ok, true);`
- **O que faz:** Asserts handled e ok para SM_STATS.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 125 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    assert(statsRes.resp.assets >= 1);`
- **O que faz:** Asserts `resp.assets >= 1`; esse shape corresponde à cópia, não ao handler real atual, que responderia `resp.stats.assets`.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 126 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 127 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    const delRes = await sendMsg({ action: 'SM_DELETE_CHAPTER', chapterId: 'chap_route_test' });`
- **O que faz:** Envia SM_DELETE_CHAPTER pela cópia local.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 128 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    assert.strictEqual(delRes.handled, true);`
- **O que faz:** Asserts handled e ok para exclusão do capítulo.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 129 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    assert.strictEqual(delRes.resp.ok, true);`
- **O que faz:** Asserts handled e ok para exclusão do capítulo.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 130 — SM_STATS e SM_DELETE_CHAPTER

- **Código:** `    console.log('  -> SM_STATS e SM_DELETE_CHAPTER OK');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** A operação de armazenamento/consulta é da implementação real `storage-manager.js` sobre `fake-indexeddb`; o roteamento anterior continua sendo local.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** ✅ Operação real de storage-manager quando efetivamente chamada; ⚠️ roteamento de background não é real.

### Linha 131 — execução terminal

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 132 — execução terminal

- **Código:** `    console.log('✅ smoke-06-sm-message-routing passou com sucesso.');`
- **O que faz:** Emite progresso legível por humanos; não adiciona cobertura funcional.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 133 — execução terminal

- **Código:** `}`
- **O que faz:** Fecha uma construção sintática do bloco corrente.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 134 — execução terminal

- **Código:** linha vazia
- **O que faz:** Linha em branco usada para separar responsabilidades; não altera runtime.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟨 Executado no smoke, sem assertion isolada específica para esta linha.

### Linha 135 — execução terminal

- **Código:** `run().catch(err => {`
- **O que faz:** Executa a rotina smoke e instala tratamento terminal de erro.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟦 Gate de execução: `run-smoke.js` considera exit code diferente de zero como falha.

### Linha 136 — execução terminal

- **Código:** `    console.error('❌ Falha em smoke-06-sm-message-routing:', err);`
- **O que faz:** Imprime erro em stderr quando qualquer assertion/operação rejeita.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟦 Gate de execução: `run-smoke.js` considera exit code diferente de zero como falha.

### Linha 137 — execução terminal

- **Código:** `    process.exit(1);`
- **O que faz:** Encerra o subprocesso com código 1, tornando a falha bloqueante para `run-smoke.js`.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟦 Gate de execução: `run-smoke.js` considera exit code diferente de zero como falha.

### Linha 138 — execução terminal

- **Código:** `});`
- **O que faz:** Fecha uma construção sintática do bloco corrente.
- **Como:** Roda sequencialmente em processo Node; uma assertion lança e é capturada pelo `.catch` terminal.
- **Por que / risco:** Mantém o cenário executável e observável; a evidência deve ser atribuída somente ao componente realmente chamado.
- **Evidência:** 🟦 Gate de execução: `run-smoke.js` considera exit code diferente de zero como falha.

### Posição 139 — newline final

- **Código:** newline terminal.
- **O que faz:** encerra o arquivo textual; não executa lógica.
- **Evidência:** 🟦 INTEGRIDADE DOCUMENTAL confirmada no blob auditado.

## 9. Conclusão documental

O SHA `dd32621bee49bfe64bb4a667ecbf68fb516e03dd` foi documentado integralmente: 138 linhas textuais mais newline final. A suíte dá prova útil do storage-manager real, mas não do listener real anunciado. O drift concreto foi registrado para auditoria sem alterar smoke, background, storage-manager ou outros testes.

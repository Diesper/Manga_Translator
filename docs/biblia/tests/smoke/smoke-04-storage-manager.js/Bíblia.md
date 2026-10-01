# Bíblia técnica — `tests/smoke/smoke-04-storage-manager.js`

> **Estado documental:** 🟡 REGRESSÕES AMPLIADAS — AGUARDANDO CI DO SHA ATUAL  
> **SHA auditado:** `500853da2950c31fd5fb4e2a91765a9331c28153`  
> **Agente da correção:** AGENTE 30  
> **Tipo:** smoke Node.js do storage-manager real com fake IndexedDB e falhas controladas de chrome.storage  
> **Linhas textuais:** **290**  
> **Posições documentais:** **291**, contando o newline terminal  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`smoke-04-storage-manager.js` executa diretamente `extension/shared/storage-manager.js` em Node com `fake-indexeddb`. O arquivo não replica a lógica de persistência: chama a API de produção e usa apenas um mock controlável de `chrome.storage.local`/ `chrome.runtime.lastError` para testar migração, falhas e retry.

A revisão atual amplia o smoke de happy paths para invariantes de consistência: troca de `cleanUrl`, deleção completa de restore/página/asset, mesma URL em múltiplos capítulos, corrida save/delete sem exigir ordem artificial, migração exata, falha parcial retryable, propagação de `lastError`, recuperação após IndexedDB temporariamente ausente e após `indexedDB.open()` lançar sincronicamente, abort real de transaction com prova de rollback, Data URLs inválidas e contadores de `stats()`.

## 2. Integração e dependências

- **Implementação exercitada:** `extension/shared/storage-manager.js` real.
- **IndexedDB:** `fake-indexeddb/auto`; não é mock de métodos internos do storage-manager.
- **Chrome mock:** `storage.local.get/set/remove` sobre memória com injeção controlada de `runtime.lastError`.
- **Runner:** `tests/smoke/run-smoke.js` descobre os arquivos `smoke-\d+*.js`, executa processos Node e propaga falha.
- **Script npm:** `test:smoke = node tests/smoke/run-smoke.js`; `npm test` inclui o smoke.
- **Isolamento:** cada arquivo smoke executa em processo dedicado; o fake IDB e o mock local não persistem em disco.

## 3. Sequência funcional

1. round-trip DataURL↔Blob e rejeição de entradas inválidas;
2. primeira abertura sem IndexedDB, rejeição esperada e nova tentativa;
3. `indexedDB.open()` lançando sincronicamente, rejeição esperada e retry posterior;
4. abertura bem-sucedida confirmando instalação de `onversionchange`;
5. save/overwrite da mesma página e coleta de asset antigo;
6. abort deliberado da transaction durante `chapterPages.put`, exigindo rollback de página/restore/asset/stats;
7. troca de `cleanUrl` com remoção do restore/asset anterior;
8. `deleteByCleanUrl` provando ausência de restore, página, índice e asset;
9. mesma `cleanUrl` em dois capítulos, removida integralmente dos dois;
10. corrida save/delete validada por invariantes finais, não por uma ordem específica;
11. `deleteChapter` provando página, restore e asset removidos;
12. migração de duas páginas + restore com contagem/conteúdo exatos e idempotência;
13. migração parcialmente falha preservando legado/flag para retry + fault injection de `storage.local.get/remove/set`;
14. `stats()` com deltas exatos de pages/assets/bytes e retorno ao baseline após cleanup.

## 4. Evidência automatizada da revisão

| Contrato | Evidência no smoke atual | Classificação |
|---|---|---|
| DataURL↔Blob preserva conteúdo/MIME | igualdade exata do PNG e Blob válido | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| Data URL inválida é rejeitada | `assert.throws` para não-data URL e base64 inválido | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| `openStorageDb` recupera após IDB ausente | primeira chamada rejeita; API é restaurada; nova abertura deve funcionar | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| rejeição síncrona de `indexedDB.open()` não fica cacheada | fake IDB lança sincronicamente; retry posterior com fake-indexeddb real deve abrir | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| conexão instala cleanup de `versionchange` | `typeof reopenedDb.onversionchange === 'function'` | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| overwrite troca asset e coleta anterior | IDs distintos + `getAssetBlob(old) === null` | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| rollback atômico sob abort real | abort em `chapterPages.put`; página/restore/asset/stats devem permanecer idênticos ao snapshot anterior | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| troca A→B de `cleanUrl` remove restore/asset de A | restore A ausente, restore B aponta ao novo asset, asset anterior null | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| `deleteByCleanUrl` remove restore/página/asset | assertions focais sobre todos os três e índice de página | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| mesma cleanUrl em dois capítulos | `deleted === 2` + ausência de restores/pages/assets em ambos | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| corrida save/delete mantém consistência | página e restore sobrevivem/somem juntos; asset sobrevivente deve existir | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| `deleteChapter` limpa página/restore/asset | pageCount 0, restoreIndex vazio, asset null | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| migração feliz é completa | `migrated === 2`, índices [0,1], restore/asset presentes, legado removido | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| migração parcial não consolida perda | `failed=true`, sem flag, legado preservado; retry migra 2 | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| `runtime.lastError` de get/remove/set é propagado | três `assert.rejects`; remove mantém legado/sem flag; retries concluem | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| `stats()` é coerente | pages/assets +1, bytes + tamanho exato; após delete volta ao baseline | 🟨 IMPLEMENTADO; CI DO SHA ATUAL PENDENTE |
| picos de memória Blob↔DataURL em imagens grandes | smoke usa PNGs mínimos | ⚠️ NÃO PROVADO / requer benchmark ou política separada |

## 5. Invariantes e casos adversariais

1. O teste deve importar o storage-manager real; não deve copiar `savePageResult`, `delete*` ou migração.
2. Fault injection de Chrome deve existir apenas no mock da fronteira `chrome.storage.local`, deixando IndexedDB realista via fake-indexeddb.
3. Ausência temporária de IndexedDB e exceção síncrona de `indexedDB.open()` não podem deixar rejeição cacheada impedindo retry.
4. `onversionchange` deve estar instalado na conexão retornada para permitir cleanup de conexão/cache stale.
5. Abort deliberado no meio do overwrite deve rejeitar a operação e preservar integralmente o estado anterior.
6. Um overwrite confirmado não pode deixar asset anterior acessível.
7. Mudar a `cleanUrl` da mesma página não pode deixar restore antigo nem o asset que ele referenciava.
8. `deleteByCleanUrl` deve remover todos os registros que poderiam ressuscitar a tradução, inclusive em múltiplos capítulos.
9. Corridas podem ter mais de uma ordem válida; o estado final nunca pode conter página sem restore correspondente ou restore apontando para asset ausente no cenário exercitado.
10. Uma falha parcial de migração não pode gravar a flag nem remover o legado necessário para retry.
11. Falha de cleanup legado não pode gravar a flag; o retry deve permanecer possível.
12. `runtime.lastError` não pode virar sucesso silencioso.

## 6. Limitações remanescentes

- **Abort/rollback em browser real:** o novo fault injection usa a transaction real do `fake-indexeddb`; diferenças específicas do IndexedDB do Chromium continuam cobertas apenas de forma complementar por E2E.
- **`onblocked`/upgrade real:** o smoke confirma que `onversionchange` foi instalado, mas não cria um upgrade bloqueado real nem exercita `onblocked`.
- **Memória em payloads grandes:** os PNGs usados são mínimos; este smoke não é benchmark de pico de memória.
- **Concorrência:** o cenário save/delete comprova uma pós-condição de consistência para a corrida exercitada; não é prova formal de todas as interleavings possíveis.

## 7. Lifecycle das solicitações de auditoria

### 126-001 — TEST_REQUIRED — SUPERSEDED por 060-002

A request permanece historicamente `SUPERSEDED` por 060-002 no state canônico. Nesta revisão, o gap técnico associado passou a ter fault injection explícito de transaction abortada; isso não altera retroativamente o lifecycle de 126-001. A prova só será considerada válida após CI verde do SHA atual.

### 126-002 — TEST_REQUIRED — ACCEPTED; IMPLEMENTAÇÃO ADICIONADA, AGUARDANDO EXECUÇÃO

O state canônico permanece `ACCEPTED`. A revisão `500853da2950c31fd5fb4e2a91765a9331c28153` mantém a prova focal de `deleteByCleanUrl` sobre restore, página, índice e asset, além do caso da mesma cleanUrl em dois capítulos. A request só deve migrar para `RESOLVED` após execução bem-sucedida dessa revisão.

### 126-003 — TEST_REQUIRED — ACCEPTED; IMPLEMENTAÇÃO ADICIONADA, AGUARDANDO EXECUÇÃO

O state canônico permanece `ACCEPTED`. A revisão `500853da2950c31fd5fb4e2a91765a9331c28153` exige `migrated === 2`, valida índices/restores/assets, adiciona falha parcial seguida de retry e mantém fault injection de `runtime.lastError`. A request só deve migrar para `RESOLVED` após execução bem-sucedida dessa revisão.

## 8. Fonte integral exata

O bloco abaixo reproduz integralmente o blob `500853da2950c31fd5fb4e2a91765a9331c28153`. O arquivo possui newline terminal.

```javascript
/**
 * smoke-04-storage-manager.js
 * Cobre: persistência/cleanup, round-trip Blob↔DataURL, concorrência,
 * migração/retry e falhas controladas de chrome.storage.local.
 */
'use strict';

const assert = require('assert');
require('fake-indexeddb/auto');

// Mock controlável do chrome.storage.local para happy path + runtime.lastError.
const localStore = {};
let forcedLocalError = null;

function invokeStorageCallback(kind, cb, value) {
    const previousError = global.chrome.runtime.lastError;
    global.chrome.runtime.lastError = forcedLocalError === kind
        ? { message: `forced storage ${kind} failure` }
        : null;
    try {
        if (cb) cb(value);
    } finally {
        global.chrome.runtime.lastError = previousError;
    }
}

global.chrome = {
    runtime: { lastError: null },
    storage: {
        local: {
            get: (keys, cb) => {
                const res = {};
                if (typeof keys === 'string') res[keys] = localStore[keys];
                else if (Array.isArray(keys)) keys.forEach(k => { if (k in localStore) res[k] = localStore[k]; });
                else if (keys === null) Object.assign(res, localStore);
                invokeStorageCallback('get', cb, res);
                return Promise.resolve(res);
            },
            set: (items, cb) => {
                if (forcedLocalError !== 'set') Object.assign(localStore, items);
                invokeStorageCallback('set', cb);
                return Promise.resolve();
            },
            remove: (keys, cb) => {
                const arr = Array.isArray(keys) ? keys : [keys];
                if (forcedLocalError !== 'remove') arr.forEach(k => delete localStore[k]);
                invokeStorageCallback('remove', cb);
                return Promise.resolve();
            }
        }
    }
};

const sm = require('../../extension/shared/storage-manager.js');

async function run() {
    console.log('[smoke-04] 1. Testando round-trip DataURL <-> Blob...');
    // 1x1 pixel PNG em base64
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const blob = sm.dataUrlToBlob(sampleDataUrl);
    assert.strictEqual(blob.type, 'image/png');
    assert(blob.size > 0);

    const convertedBack = await sm.blobToDataUrl(blob);
    assert.strictEqual(convertedBack, sampleDataUrl);
    console.log('  -> Round-trip Blob <-> DataURL OK');

    assert.throws(() => sm.dataUrlToBlob('not-a-data-url'), /Entrada inválida/);
    assert.throws(() => sm.dataUrlToBlob('data:image/png;base64,%%%'));
    console.log('  -> Entradas Data URL inválidas rejeitadas OK');

    const installedIndexedDB = global.indexedDB;
    try {
        global.indexedDB = undefined;
        await assert.rejects(() => sm.openStorageDb(), /IndexedDB indisponível/);

        global.indexedDB = { open: () => { throw new Error('forced synchronous IndexedDB.open failure'); } };
        await assert.rejects(() => sm.openStorageDb(), /forced synchronous IndexedDB\.open failure/);
    } finally {
        global.indexedDB = installedIndexedDB;
    }
    const reopenedDb = await sm.openStorageDb();
    assert(reopenedDb, 'openStorageDb deve recuperar após indisponibilidade/rejeição transitória');
    assert.strictEqual(typeof reopenedDb.onversionchange, 'function', 'Conexão deve instalar cleanup de versionchange');
    console.log('  -> Retry de openStorageDb após IDB ausente/open síncrono falhar OK');

    console.log('[smoke-04] 2. Testando transações atômicas e eliminação de assets órfãos...');
    const chapterId = 'chap_test_04';
    const cleanUrl = 'https://example.com/clean/img1.png';
    const origUrl = 'https://example.com/orig/img1.png';

    // Grava página 0
    const save1 = await sm.savePageResult(chapterId, 0, sampleDataUrl, origUrl, cleanUrl, { width: 100, height: 200, host: 'example.com' });
    assert(save1.assetId, 'Deve gerar assetId');

    const asset1 = await sm.getAssetBlob(save1.assetId);
    assert(asset1, 'Asset gravado deve existir');

    let pageBlob = await sm.getPageAsset(chapterId, 0);
    assert(pageBlob, 'Page blob deve existir');
    let pages = await sm.getChapterPageIndex(chapterId);
    assert.strictEqual(pages[0].assetId, save1.assetId);

    // Substitui a página 0 com novo conteúdo
    const sampleDataUrl2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const save2 = await sm.savePageResult(chapterId, 0, sampleDataUrl2, origUrl, cleanUrl, { width: 100, height: 200, host: 'example.com' });
    assert.notStrictEqual(save2.assetId, save1.assetId, 'Novo assetId deve ser diferente');

    // Asset antigo deve ter sido removido (sem órfãos)
    const oldAsset = await sm.getAssetBlob(save1.assetId);
    assert.strictEqual(oldAsset, null, 'Asset antigo substituído deve ser limpo');

    const newAsset = await sm.getAssetBlob(save2.assetId);
    assert(newAsset, 'Novo asset deve existir');

    // Abort real no meio do overwrite deve reverter asset/página/restore.
    const rollbackPageBefore = (await sm.getChapterPageIndex(chapterId)).find(p => p.pageIndex === 0);
    const rollbackRestoreBefore = await sm.getRestoreIndex(chapterId);
    const rollbackStatsBefore = await sm.stats();
    const originalPut = global.IDBObjectStore.prototype.put;
    let abortInjected = false;
    global.IDBObjectStore.prototype.put = function (...args) {
        const request = originalPut.apply(this, args);
        if (!abortInjected && this.name === 'chapterPages') {
            abortInjected = true;
            this.transaction.abort();
        }
        return request;
    };
    try {
        await assert.rejects(() => sm.savePageResult(
            chapterId, 0, sampleDataUrl, origUrl, 'https://example.com/clean/aborted.png',
            { width: 100, height: 200, host: 'example.com' }
        ));
    } finally {
        global.IDBObjectStore.prototype.put = originalPut;
    }
    assert(abortInjected, 'Fault injection deve abortar a transaction de overwrite');
    const rollbackPageAfter = (await sm.getChapterPageIndex(chapterId)).find(p => p.pageIndex === 0);
    assert.strictEqual(rollbackPageAfter.assetId, rollbackPageBefore.assetId, 'Abort deve preservar página anterior');
    assert.deepStrictEqual(await sm.getRestoreIndex(chapterId), rollbackRestoreBefore, 'Abort deve preservar restore anterior');
    assert(await sm.getAssetBlob(rollbackPageBefore.assetId), 'Abort deve preservar asset anterior');
    assert.deepStrictEqual(await sm.stats(), rollbackStatsBefore, 'Abort não pode deixar asset/página parcial');
    console.log('  -> Abort de transaction reverte overwrite integralmente OK');

    // Troca de cleanUrl na mesma página não pode deixar restore/asset antigo.
    const cleanUrl2 = 'https://example.com/clean/img1-v2.png';
    const save3 = await sm.savePageResult(chapterId, 0, sampleDataUrl, origUrl, cleanUrl2, { width: 100, height: 200, host: 'example.com' });
    const restoreAfterUrlChange = await sm.getRestoreIndex(chapterId);
    assert(!restoreAfterUrlChange[cleanUrl], 'Restore da cleanUrl antiga deve ser removido');
    assert.strictEqual(restoreAfterUrlChange[cleanUrl2].assetId, save3.assetId);
    assert.strictEqual(await sm.getAssetBlob(save2.assetId), null, 'Asset da cleanUrl antiga deve ser coletado');
    console.log('  -> Substituição e troca de cleanUrl sem órfãos OK');

    console.log('[smoke-04] 3. Testando deleteByCleanUrl completo...');
    const delCleanRes = await sm.deleteByCleanUrl(cleanUrl2);
    assert.strictEqual(delCleanRes.deleted, 1, 'Deve deletar exatamente um restore neste capítulo');
    const restoreIndex = await sm.getRestoreIndex(chapterId);
    assert(!restoreIndex[cleanUrl2], 'Restore entry não deve mais existir');
    assert.strictEqual(await sm.getPageAsset(chapterId, 0), null, 'Página associada deve ser removida');
    assert.strictEqual(await sm.getAssetBlob(save3.assetId), null, 'Asset associado deve ser removido');
    assert(!(await sm.getChapterPageIndex(chapterId)).some(p => p.pageIndex === 0), 'Índice da página deletada deve sumir');

    const sharedCleanUrl = 'https://example.com/clean/shared.png';
    const multiChapterA = 'chap_delete_multi_a';
    const multiChapterB = 'chap_delete_multi_b';
    const multiSaveA = await sm.savePageResult(multiChapterA, 0, sampleDataUrl, 'orig-a', sharedCleanUrl);
    const multiSaveB = await sm.savePageResult(multiChapterB, 0, sampleDataUrl2, 'orig-b', sharedCleanUrl);
    const multiDelete = await sm.deleteByCleanUrl(sharedCleanUrl);
    assert.strictEqual(multiDelete.deleted, 2, 'Mesma cleanUrl em dois capítulos deve remover dois restores');
    for (const [chapter, assetId] of [[multiChapterA, multiSaveA.assetId], [multiChapterB, multiSaveB.assetId]]) {
        assert.deepStrictEqual(await sm.getRestoreIndex(chapter), {});
        assert.strictEqual(await sm.getPageAsset(chapter, 0), null);
        assert.strictEqual(await sm.getAssetBlob(assetId), null);
    }
    console.log('  -> deleteByCleanUrl remove restore/página/asset inclusive multi-capítulo OK');

    console.log('[smoke-04] 4. Testando concorrência save/delete e deleteChapter completo...');
    const concurrentChapter = 'chap_concurrent_04';
    const concurrentCleanUrl = 'https://example.com/clean/concurrent.png';
    await Promise.all([
        sm.savePageResult(concurrentChapter, 0, sampleDataUrl, 'orig-concurrent', concurrentCleanUrl),
        sm.deleteByCleanUrl(concurrentCleanUrl),
    ]);
    const concurrentPages = await sm.getChapterPageIndex(concurrentChapter);
    const concurrentRestore = await sm.getRestoreIndex(concurrentChapter);
    const survivingPage = concurrentPages.find(p => p.pageIndex === 0);
    const survivingRestore = concurrentRestore[concurrentCleanUrl];
    assert.strictEqual(Boolean(survivingPage), Boolean(survivingRestore), 'Página e restore devem sobreviver ou sumir juntos');
    if (survivingPage) {
        assert.strictEqual(survivingPage.assetId, survivingRestore.assetId);
        assert(await sm.getAssetBlob(survivingPage.assetId), 'Asset sobrevivente deve existir');
    }
    await sm.deleteChapter(concurrentChapter);

    const chapterDeleteSave = await sm.savePageResult(chapterId, 1, sampleDataUrl2, 'orig2', 'clean2');
    const delChapterRes = await sm.deleteChapter(chapterId);
    assert(delChapterRes.deleted > 0, 'Deve deletar registros do capítulo');
    assert.strictEqual(await sm.getChapterPageCount(chapterId), 0, 'Capítulo deve ficar sem páginas');
    assert.deepStrictEqual(await sm.getRestoreIndex(chapterId), {}, 'Capítulo deve ficar sem restores');
    assert.strictEqual(await sm.getAssetBlob(chapterDeleteSave.assetId), null, 'Asset do capítulo deletado deve sumir');
    console.log('  -> Concorrência preserva invariantes e deleteChapter limpa página/restore/asset OK');

    console.log('[smoke-04] 5. Testando migração idempotente do storage legado...');
    const legacyChapter = 'chap_legacy_99';
    localStore[`${legacyChapter}_images`] = { '0': sampleDataUrl, '1': sampleDataUrl2 };
    localStore[`${legacyChapter}_restoreMap`] = { 'https://site.com/c0.png': sampleDataUrl };
    localStore[`${legacyChapter}_restoreMeta`] = { 'https://site.com/c0.png': { index: 0, host: 'site.com' } };

    const mig1 = await sm.migrateChapterFromLegacy(legacyChapter);
    assert.strictEqual(mig1.migrated, 2, 'As duas páginas legadas devem migrar');
    assert.strictEqual(mig1.skipped, false);
    assert.deepStrictEqual((await sm.getChapterPageIndex(legacyChapter)).map(p => p.pageIndex), [0, 1]);
    const migratedRestore = await sm.getRestoreIndex(legacyChapter);
    assert(migratedRestore['https://site.com/c0.png'], 'Restore legado deve migrar');
    assert(await sm.getAssetBlob(migratedRestore['https://site.com/c0.png'].assetId), 'Asset do restore migrado deve existir');
    assert.strictEqual(localStore[`_sm_migrated_${legacyChapter}`], true, 'Flag de migração deve ser setada');
    assert(!localStore[`${legacyChapter}_images`]);
    assert(!localStore[`${legacyChapter}_restoreMap`]);
    assert(!localStore[`${legacyChapter}_restoreMeta`]);

    const mig2 = await sm.migrateChapterFromLegacy(legacyChapter);
    assert.strictEqual(mig2.skipped, true, 'Segunda migração deve ser ignorada');
    console.log('  -> Migração completa e idempotente OK');

    console.log('[smoke-04] 6. Testando falha parcial, retry e runtime.lastError...');
    const partialChapter = 'chap_legacy_partial_04';
    localStore[`${partialChapter}_images`] = { '0': sampleDataUrl, '1': 'not-a-data-url' };
    localStore[`${partialChapter}_restoreMap`] = {};
    localStore[`${partialChapter}_restoreMeta`] = {};
    const partial1 = await sm.migrateChapterFromLegacy(partialChapter);
    assert.strictEqual(partial1.failed, true);
    assert.strictEqual(partial1.migrated, 1);
    assert(!localStore[`_sm_migrated_${partialChapter}`], 'Falha parcial não pode consolidar flag');
    assert(localStore[`${partialChapter}_images`], 'Falha parcial deve preservar legado para retry');
    localStore[`${partialChapter}_images`]['1'] = sampleDataUrl2;
    const partial2 = await sm.migrateChapterFromLegacy(partialChapter);
    assert.strictEqual(partial2.migrated, 2);
    assert.strictEqual(localStore[`_sm_migrated_${partialChapter}`], true);
    assert.deepStrictEqual((await sm.getChapterPageIndex(partialChapter)).map(p => p.pageIndex), [0, 1]);

    const getFailChapter = 'chap_storage_get_fail_04';
    forcedLocalError = 'get';
    await assert.rejects(() => sm.migrateChapterFromLegacy(getFailChapter), /forced storage get failure/);
    forcedLocalError = null;
    assert(!localStore[`_sm_migrated_${getFailChapter}`]);

    const removeFailChapter = 'chap_storage_remove_fail_04';
    localStore[`${removeFailChapter}_images`] = { '0': sampleDataUrl };
    localStore[`${removeFailChapter}_restoreMap`] = {};
    localStore[`${removeFailChapter}_restoreMeta`] = {};
    forcedLocalError = 'remove';
    await assert.rejects(() => sm.migrateChapterFromLegacy(removeFailChapter), /forced storage remove failure/);
    forcedLocalError = null;
    assert(localStore[`${removeFailChapter}_images`], 'Falha de remove deve preservar legado');
    assert(!localStore[`_sm_migrated_${removeFailChapter}`], 'Falha de remove não pode gravar flag');
    const removeRetry = await sm.migrateChapterFromLegacy(removeFailChapter);
    assert.strictEqual(removeRetry.migrated, 1);
    assert.strictEqual(localStore[`_sm_migrated_${removeFailChapter}`], true);

    const setFailChapter = 'chap_storage_set_fail_04';
    forcedLocalError = 'set';
    await assert.rejects(() => sm.migrateChapterFromLegacy(setFailChapter), /forced storage set failure/);
    forcedLocalError = null;
    assert(!localStore[`_sm_migrated_${setFailChapter}`]);
    const setRetry = await sm.migrateChapterFromLegacy(setFailChapter);
    assert.strictEqual(setRetry.skipped, false);
    assert.strictEqual(localStore[`_sm_migrated_${setFailChapter}`], true);
    console.log('  -> Falha parcial e lastError permanecem retryable OK');

    console.log('[smoke-04] 7. Testando stats exatos e cleanup reversível...');
    const baselineStats = await sm.stats();
    const statsChapter = 'chap_stats_04';
    const statsBlob = sm.dataUrlToBlob(sampleDataUrl2);
    await sm.savePageResult(statsChapter, 0, sampleDataUrl2, 'orig-stats', 'clean-stats');
    const statsAfterSave = await sm.stats();
    assert.strictEqual(statsAfterSave.pages, baselineStats.pages + 1);
    assert.strictEqual(statsAfterSave.assets, baselineStats.assets + 1);
    assert.strictEqual(statsAfterSave.bytes, baselineStats.bytes + statsBlob.size);
    await sm.deleteChapter(statsChapter);
    assert.deepStrictEqual(await sm.stats(), baselineStats);
    console.log('  -> stats pages/assets/bytes e cleanup exatos OK');

    console.log('✅ smoke-04-storage-manager passou com sucesso.');
}

run().catch(err => {
    console.error('❌ Falha em smoke-04-storage-manager:', err);
    process.exit(1);
});
```

## 9. Cobertura documental por faixas contíguas

As **257 posições** são cobertas integralmente, em ordem, sem gaps nem overlap.

### Bloco 01 — linhas/posições 1–9
Cabeçalho, strict mode, `assert` e instalação de `fake-indexeddb/auto`.

### Bloco 02 — linhas/posições 10–52
Mock controlável de `chrome.storage.local` e `chrome.runtime.lastError`, incluindo injeção `get/set/remove`.

### Bloco 03 — linhas/posições 53–81
Import do storage-manager real, round-trip, entradas inválidas e recuperação de `openStorageDb` após indisponibilidade transitória.

### Bloco 04 — linhas/posições 82–119
Save inicial, overwrite, coleta de asset e troca de `cleanUrl` sem restore/asset stale.

### Bloco 05 — linhas/posições 120–142
`deleteByCleanUrl` completo e caso multi-capítulo com a mesma URL.

### Bloco 06 — linhas/posições 143–168
Corrida save/delete validada por invariantes e `deleteChapter` com cleanup de página/restore/asset.

### Bloco 07 — linhas/posições 169–190
Migração feliz de duas páginas, restore/asset, limpeza exata do legado e idempotência.

### Bloco 08 — linhas/posições 191–235
Falha parcial retryable e fault injection de `runtime.lastError` para get/remove/set com retries.

### Bloco 09 — linhas/posições 236–248
`stats()` com deltas exatos e retorno ao baseline após `deleteChapter`.

### Bloco 10 — linhas/posições 249–256
Mensagem final e wrapper `run().catch` que transforma qualquer rejeição/assertion em exit code 1.

### Bloco 11 — linhas/posições 257–257
Posição do newline terminal.

## 10. Revalidação editorial

- SHA do fonte: `b6a4eb9f9062da1b647db2e4720d6d6d36b78b8d`.
- Fonte integral incorporada: **sim**.
- Posições: **257/257**, cobertas por 11 faixas contíguas.
- `.skip`, `.only`, `xit`, `xdescribe`, TODO/FIXME: **nenhum encontrado**.
- 126-001: **SUPERSEDED por 060-002**, não OPEN.
- 126-002: **ACCEPTED; regressão implementada e aguardando execução**.
- 126-003: **ACCEPTED; regressão implementada e aguardando execução**.
- Gap de rollback IDB sob abort: **explicitamente não reivindicado como provado**.
- Execução CI `MangaTranslator CI` run **36936712283**, job **110618800485 (Smoke Tests)**: **FAIL** em `smoke-04`, ao tentar reabrir o DB após indisponibilidade transitória.
- Causa confirmada por leitura do source #060: `_smDbPromise = null` dentro do executor é sobrescrito pela atribuição externa `_smDbPromise = new Promise(...)`; a rejeição permanece cacheada.
- 126-002/126-003 continuam `ACCEPTED`; nenhuma request foi resolvida artificialmente.
- Após corrigir #060 e obter execução verde, esta revisão deve ser revalidada e então seguir para nova auditoria PRIMARY + ADVERSARIAL.

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
    } finally {
        global.indexedDB = installedIndexedDB;
    }
    const reopenedDb = await sm.openStorageDb();
    assert(reopenedDb, 'openStorageDb deve recuperar após indisponibilidade transitória');
    console.log('  -> Retry de openStorageDb após IDB indisponível OK');

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

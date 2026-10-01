# Bíblia técnica — tests/smoke/smoke-04-storage-manager.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE 7 — consolidação global fora do escopo deste agente  
> **SHA auditado:** `0ba92d74356cb092a7706dca7d280168cd5c512e`  
> **Agente responsável:** AGENTE 7  
> **Tipo:** smoke Node.js do storage-manager com fake IndexedDB  
> **Linhas textuais:** **122**  
> **Posições documentais:** **123**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`smoke-04-storage-manager.js` é um smoke funcional que executa o `extension/shared/storage-manager.js` real em Node usando `fake-indexeddb`. Ele fornece apenas um mock mínimo de `chrome.storage.local` para a parte de migração, enquanto operações de asset/página/restore passam pelo IndexedDB implementado pelo módulo de produção.

A suíte é sequencial e stateful dentro do próprio processo: o resultado de save/overwrite alimenta deleteByCleanUrl, depois o capítulo recebe outra página para deleteChapter, e por fim um capítulo separado exercita migração legada. Uma falha em qualquer `assert` rejeita `run()` e sai com código 1.

## 2. Integração com a CI e dependências

- **Implementação sob teste:** `extension/shared/storage-manager.js` real.
- **Ambiente IDB:** `fake-indexeddb/auto`.
- **Chrome mock local:** somente `storage.local.get/set/remove`, com storage em objeto.
- **Runner:** `tests/smoke/run-smoke.js` descobre automaticamente arquivos `smoke-\d+*.js`, exige o piso do baseline e executa cada arquivo em processo Node separado.
- **Script npm:** `test:smoke = node tests/smoke/run-smoke.js`; `npm test` inclui `test:smoke`.
- **Efeito persistente do processo:** apenas memória/fake IndexedDB; o smoke não grava arquivos do repositório.

## 3. Sequência funcional

1. round-trip de PNG Data URL para Blob e retorno;
2. save de página 0 e leitura de asset/page/index;
3. overwrite da página 0 e coleta do asset antigo;
4. delete por cleanUrl;
5. save de página 1 e delete do capítulo;
6. migração de duas imagens legadas + restore e segunda execução idempotente;
7. saída 0 no sucesso ou 1 em qualquer rejeição.

## 4. Evidência automatizada

| Contrato | Evidência deste arquivo | Classificação |
|---|---|---|
| Round-trip DataURL→Blob→DataURL | MIME/tamanho do Blob e igualdade exata da Data URL de retorno | ✅ PROVADO DIRETAMENTE |
| Save inicial cria asset/página/index coerentes | `savePageResult`, `getAssetBlob`, `getPageAsset`, `getChapterPageIndex` com assertions | ✅ PROVADO DIRETAMENTE |
| Overwrite cria novo asset e remove antigo | assetId muda; asset antigo `null`; novo asset existe | ✅ PROVADO DIRETAMENTE |
| Rollback atômico em falha de transaction | nenhuma fault-injection é executada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| deleteByCleanUrl remove restore | deleted >=1 e restoreIndex sem cleanUrl | ✅ PROVADO DIRETAMENTE |
| deleteByCleanUrl remove também página/asset | não há assertion pós-delete sobre page/asset | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| deleteChapter esvazia capítulo | retorno deleted >0 e pageCount 0 | ✅ PROVADO DIRETAMENTE |
| Migração marca sucesso, limpa legado e é idempotente | mig1 >=1, flag true, chave images removida, mig2 skipped=true | ✅ PROVADO DIRETAMENTE para essas propriedades |
| Migração preserva exatamente todos os itens semeados | não compara page index/restore resultante nem quantidade exata | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Este smoke participa do gate `test:smoke` | `run-smoke.js` descobre `smoke-\d+*.js`, executa cada um e reprova status não-zero; package aponta `test:smoke` ao runner | 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE |

O termo “transações atômicas” do cabeçalho foi interpretado de forma conservadora: o smoke prova consistência após overwrite bem-sucedido, mas atomicidade sob abort/falha exige fault-injection que não existe neste arquivo.

## 5. Invariantes

1. O smoke deve continuar importando o storage-manager real, não uma cópia.
2. O mock de chrome.storage deve permanecer suficiente para a migração sem substituir IndexedDB.
3. O round-trip PNG precisa preservar MIME e conteúdo exato.
4. Overwrite da mesma página deve trocar assetId e eliminar o asset anterior no caminho feliz.
5. Delete por cleanUrl deve invalidar o restore associado; o contrato funcional mais amplo precisa de cobertura de página/asset.
6. Delete de capítulo deve deixar contagem de páginas zero.
7. Migração concluída deve marcar flag e segunda execução deve pular.
8. Qualquer assertion/rejeição precisa resultar em exit code 1 para o runner agregado.

## 6. Casos-limite e análise crítica

- **Atomicidade sem falha:** não há abort/error artificial, então rollback não é provado.
- **Delete parcial observado:** `deleteByCleanUrl` verifica restore, não page/asset.
- **Migração permissiva:** `migrated >= 1` aceita migração parcial embora duas páginas e um restore sejam semeados.
- **Mock Chrome simplificado:** não modela `runtime.lastError`, quotas ou falhas assíncronas de storage.
- **Stateful por design:** cenários 2–4 compartilham o mesmo capítulo; isso é útil para fluxo, mas reduz isolamento diagnóstico se uma etapa anterior deixar estado inesperado.
- **Sem cleanup explícito do fake IDB:** o processo dedicado do runner encerra após o smoke, evitando contaminação entre arquivos de smoke.

## 7. Solicitações ao auditor

### 126-001 — TEST_REQUIRED — OPEN
- **Encontrado:** O cenário rotulado como `transações atômicas` prova overwrite bem-sucedido e remoção do asset substituído, mas não injeta falha/abort em uma transaction IndexedDB para comprovar rollback atômico.
- **Arquivo relacionado:** `tests/smoke/smoke-04-storage-manager.js`
- **Evidência atual:** Duas chamadas reais de savePageResult para a mesma página produzem assetIds distintos; após a segunda, o asset antigo é null e o novo existe.
- **Evidência ausente:** Falha proposital durante put/delete/commit e assertion de que estado anterior permanece íntegro sem registros/asset parcialmente escritos.
- **Por que é necessário:** Atomicidade forte é propriedade de falha, não apenas do caminho feliz; uma regressão no tratamento de abort pode continuar passando neste smoke.
- **Ação solicitada:** Adicionar fault-injection em alteração separada contra fake-indexeddb/transaction real ou camada controlável equivalente, fazendo uma operação intermediária falhar e verificando rollback completo.
- **Evidência esperada:** Após falha induzida, page index, restore e assets devem permanecer no estado consistente anterior e a Promise deve rejeitar.
- **Ação esperada do auditor:** Confirmar se o contrato exige rollback explícito e implementar cobertura sem modificar storage-manager apenas para fabricar a prova.
- **Regressão possível:** Falha de IndexedDB pode deixar página, restore e asset divergentes apesar de o overwrite normal continuar verde.
- **Impacto:** Integridade persistente em falhas; caminho feliz atual continua diretamente provado.
- **Severidade:** NORMAL

### 126-002 — TEST_REQUIRED — OPEN
- **Encontrado:** O cenário `deleteByCleanUrl` verifica contagem deletada e ausência do restore, mas não verifica diretamente que a página correspondente e seu asset também foram removidos.
- **Arquivo relacionado:** `tests/smoke/smoke-04-storage-manager.js`
- **Evidência atual:** Após deleteByCleanUrl(cleanUrl), o teste exige `deleted >= 1` e `restoreIndex[cleanUrl]` ausente.
- **Evidência ausente:** Assertions sobre `getPageAsset(chapterId, 0)`/page index e `getAssetBlob(save2.assetId)` após a deleção, além de caso da mesma cleanUrl em mais de um capítulo.
- **Por que é necessário:** O contrato funcional de refazer exige remover tudo que poderia restaurar a tradução antiga; remover apenas restore não seria suficiente.
- **Ação solicitada:** Ampliar o smoke ou criar teste focal que capture o assetId antes da deleção e prove ausência de restore, página e asset após deleteByCleanUrl, incluindo multi-capítulo se esse contrato permanecer.
- **Evidência esperada:** Restore ausente, page/asset inacessíveis e deleted coerente após execução real.
- **Ação esperada do auditor:** Validar a semântica esperada e adicionar assertions sobre todos os registros afetados.
- **Regressão possível:** Asset/página órfãos podem acumular ou reaparecer por caminhos que não dependem apenas do restoreIndex.
- **Impacto:** Cleanup de refazer e uso de quota do IndexedDB.
- **Severidade:** NORMAL

### 126-003 — TEST_REQUIRED — OPEN
- **Encontrado:** A migração semeia duas páginas legadas e um restore, mas aceita `mig1.migrated >= 1` e não verifica o conteúdo migrado. Assim, uma migração parcial de apenas parte dos dados ainda satisfaria as assertions atuais.
- **Arquivo relacionado:** `tests/smoke/smoke-04-storage-manager.js`
- **Evidência atual:** A suíte prova `skipped=false`, migrated >=1, flag `_sm_migrated_*` true, remoção de `<chapter>_images` e segunda execução `skipped=true`.
- **Evidência ausente:** Contagem/conteúdo exatos das duas páginas e restore após migração e comportamento quando uma das gravações internas falha.
- **Por que é necessário:** A implementação pode marcar a migração como concluída e limpar legado mesmo se apenas parte dos itens for migrada; a assertion `>=1` não detecta perda parcial.
- **Ação solicitada:** Adicionar assertions exatas do page index/restore e cenário de falha parcial antes de aceitar flag/cleanup como seguros.
- **Evidência esperada:** Todos os itens semeados aparecem no storage novo antes da limpeza; em falha parcial, dados legados necessários não são perdidos conforme o contrato decidido.
- **Ação esperada do auditor:** Revisar a política de falha parcial e criar cobertura separada.
- **Regressão possível:** Perda silenciosa de páginas/restores legados durante migração enquanto o smoke permanece verde.
- **Impacto:** Confiabilidade da migração de instalações antigas.
- **Severidade:** NORMAL

## 8. Fonte integral exata

O bloco abaixo reproduz integralmente o blob `0ba92d74356cb092a7706dca7d280168cd5c512e`. O arquivo possui newline terminal.

```javascript
/**
 * smoke-04-storage-manager.js
 * Cobre: Transações atômicas, round-trip Blob↔DataURL, assets órfãos,
 * deleteByCleanUrl, deleteChapter, migração idempotente.
 */
'use strict';

const assert = require('assert');
require('fake-indexeddb/auto');

// Mock mínimo do chrome.storage.local para testes do storage-manager
const localStore = {};
global.chrome = {
    storage: {
        local: {
            get: (keys, cb) => {
                const res = {};
                if (typeof keys === 'string') res[keys] = localStore[keys];
                else if (Array.isArray(keys)) keys.forEach(k => { if (k in localStore) res[k] = localStore[k]; });
                else if (keys === null) Object.assign(res, localStore);
                if (cb) cb(res);
                return Promise.resolve(res);
            },
            set: (items, cb) => {
                Object.assign(localStore, items);
                if (cb) cb();
                return Promise.resolve();
            },
            remove: (keys, cb) => {
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(k => delete localStore[k]);
                if (cb) cb();
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
    console.log('  -> Substituição atômica e eliminação de órfãos OK');

    console.log('[smoke-04] 3. Testando deleteByCleanUrl...');
    const delCleanRes = await sm.deleteByCleanUrl(cleanUrl);
    assert(delCleanRes.deleted >= 1, 'Deve deletar entrada pelo cleanUrl');
    const restoreIndex = await sm.getRestoreIndex(chapterId);
    assert(!restoreIndex[cleanUrl], 'Restore entry não deve mais existir');
    console.log('  -> deleteByCleanUrl OK');

    console.log('[smoke-04] 4. Testando deleteChapter...');
    // Grava mais uma página
    await sm.savePageResult(chapterId, 1, sampleDataUrl2, 'orig2', 'clean2');
    const delChapterRes = await sm.deleteChapter(chapterId);
    assert(delChapterRes.deleted > 0, 'Deve deletar registros do capítulo');
    const countAfter = await sm.getChapterPageCount(chapterId);
    assert.strictEqual(countAfter, 0, 'Capítulo deve estar vazio');
    console.log('  -> deleteChapter OK');

    console.log('[smoke-04] 5. Testando migração idempotente do storage legado...');
    const legacyChapter = 'chap_legacy_99';
    localStore[`${legacyChapter}_images`] = { '0': sampleDataUrl, '1': sampleDataUrl2 };
    localStore[`${legacyChapter}_restoreMap`] = { 'https://site.com/c0.png': sampleDataUrl };
    localStore[`${legacyChapter}_restoreMeta`] = { 'https://site.com/c0.png': { index: 0, host: 'site.com' } };

    const mig1 = await sm.migrateChapterFromLegacy(legacyChapter);
    assert(mig1.migrated >= 1, 'Deve migrar páginas');
    assert.strictEqual(mig1.skipped, false);
    assert.strictEqual(localStore[`_sm_migrated_${legacyChapter}`], true, 'Flag de migração deve ser setada');
    assert(!localStore[`${legacyChapter}_images`], 'Storage legado deve ser limpo');

    // Segunda execução da migração deve pular (idempotente)
    const mig2 = await sm.migrateChapterFromLegacy(legacyChapter);
    assert.strictEqual(mig2.skipped, true, 'Segunda migração deve ser ignorada');
    console.log('  -> Migração idempotente OK');

    console.log('✅ smoke-04-storage-manager passou com sucesso.');
}

run().catch(err => {
    console.error('❌ Falha em smoke-04-storage-manager:', err);
    process.exit(1);
});
```

## 9. Cobertura documental por faixas contíguas

As 123 posições são cobertas pelas 16 faixas abaixo sem lacunas ou sobreposição.

### Bloco 01 — linhas/posições 1–6
Cabeçalho documenta o escopo pretendido do smoke e ativa strict mode.

### Bloco 02 — linhas/posições 7–10
Importa `assert` nativo e instala `fake-indexeddb/auto`, fornecendo IndexedDB realista em Node para o storage-manager de produção.

### Bloco 03 — linhas/posições 11–37
Implementa mock mínimo de `chrome.storage.local` sobre um objeto em memória, com `get`, `set` e `remove` compatíveis com callback e Promise; isso atende especificamente às APIs usadas pela migração.

### Bloco 04 — linhas/posições 38–39
Carrega diretamente `extension/shared/storage-manager.js`; todas as chamadas seguintes exercitam a implementação real.

### Bloco 05 — linhas/posições 40–51
Inicia `run`, cria PNG Data URL real, converte para Blob, verifica MIME/tamanho e converte de volta exigindo igualdade exata da Data URL.

### Bloco 06 — linhas/posições 52–60
Prepara capítulo/URLs e realiza o primeiro `savePageResult`, exigindo geração de `assetId`.

### Bloco 07 — linhas/posições 61–68
Busca asset, page asset e índice do capítulo e confirma que o registro da página aponta ao asset recém-criado.

### Bloco 08 — linhas/posições 69–81
Sobrescreve a mesma página com novo PNG, exige novo assetId, prova que o asset antigo foi removido e que o novo existe. Isso prova cleanup no caminho feliz do overwrite.

### Bloco 09 — linhas/posições 82–88
Executa `deleteByCleanUrl`, exige contagem positiva e ausência da entrada correspondente no restore index; não verifica diretamente página/asset.

### Bloco 10 — linhas/posições 89–97
Salva uma segunda página, executa `deleteChapter` e exige retorno positivo e contagem de páginas zero.

### Bloco 11 — linhas/posições 98–104
Monta storage legado com duas imagens, um restoreMap e metadado de restore para um capítulo de migração.

### Bloco 12 — linhas/posições 105–110
Executa a primeira migração e exige algum item migrado, `skipped=false`, flag de migração e remoção da chave legado de imagens.

### Bloco 13 — linhas/posições 111–114
Executa a migração novamente e exige `skipped=true`, provando idempotência pela flag.

### Bloco 14 — linhas/posições 115–117
Imprime sucesso global e fecha a função `run`.

### Bloco 15 — linhas/posições 118–122
Executa o smoke; qualquer rejeição imprime erro e encerra o processo com código 1, permitindo ao runner agregado marcar o arquivo como falho.

### Bloco 16 — linhas/posições 123–123
Posição do newline terminal do arquivo.

## 10. Verificação final desta Bíblia

- SHA do fonte reconfirmado: `0ba92d74356cb092a7706dca7d280168cd5c512e`.
- Fonte integral incorporada: **sim**.
- Linhas textuais: **122**; newline terminal: **sim**; posições documentadas: **123/123**.
- Faixas documentais: **16**, contíguas e sem overlap.
- Evidência direta separada de claims não provados por fault-injection/completude de cleanup.
- `audit_requests` abertas: **126-001**, **126-002**, **126-003**.
- Nenhum fonte, teste, fixture, workflow ou configuração externa foi alterado.

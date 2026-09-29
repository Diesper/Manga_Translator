# Bíblia técnica — `extension/content/cm-auto-restore.js`

> **Estado:** ✅ CRIADO E AUDITADO  
> **SHA auditado:** `d20e7092652e484d2299345cfd7eeb3afdd34750`  
> **Linhas textuais:** **123**  
> **Posições documentais:** **124** contando newline final  
> **Suíte comportamental principal:** `tests/unit/content-manga/auto-restorer-real.test.js` — `cf792733e62f4b787073f1f7257e2701d29547a6`

## Identidade e papel arquitetural

`cm-auto-restore.js` coordena a restauração silenciosa de traduções já persistidas quando imagens originais reaparecem no DOM. Ele não conhece o schema completo do capítulo, não armazena blobs e não implementa substituição visual do zero: recebe `getChapterId`, `resolveAsset`, `getCleanUrl`, `applyImageReplacement` e outras operações como dependências.

O `manifest.json` carrega `cm-chapter.js` → `cm-auto-restore.js` → `content_manga.js`. O helper de testes `load-content-script.js` reproduz exatamente essa ordem, portanto a suíte de auto-restore executa este módulo real.

## Wiring atual versus implementação inline residual

`content_manga.js` ainda contém funções inline antigas (`loadAutoRestoreConfig`, `applyAutoRestore`, `initializeAutoRestorer`, etc.). Depois que chapter manager é criado, porém, o runtime normal exige `window.MangaTranslatorAutoRestore`, cria `autoRestorer` e reaponta essas referências para a API deste arquivo.

Assim, no bootstrap normal atual, **este módulo é a implementação efetiva**. O bloco inline é duplicação residual/fallback histórico e representa risco de drift, mas não deve ser confundido com um segundo auto-restorer ativo simultâneo.

## Configuração e bloqueios

`loadConfig` lê `autoRestoreEnabled`, `autoRestoreDisabledSites` e `autoRestoreBlockedImages`. Enabled só é falso quando storage contém literalmente `false`; lista de sites inválida vira `[]`; blocklist Array legado é convertida para mapa `{cleanUrl:{cleanUrl}}`.

`isAllowed` exige enabled global, hostname fora da denylist e cleanUrl fora da blocklist. A blocklist afeta apenas **auto** restore: o teste específico prova que UPDATE_IMAGE manual continua funcionando.

## Apply: seleção antes de carregar assets

`apply()` sai cedo se a instância não está ativa, se há tradução em curso, opção/site desabilitado, mapa vazio ou outro apply já está rodando.

Ele primeiro coleta apenas imagens não traduzidas que possuem cleanUrl presente no restoreMap. Só depois resolve cada asset sequencialmente. Isso evita carregar todos os Base64 de capítulos grandes quando poucas imagens do DOM precisam de restauração.

Durante o loop revalida `isActive()` e `isTranslating()` para poder interromper quando uma tradução real começa. Também pula imagem que ficou `data-translated=true` enquanto aguardava asset.

Backdrops/blurred são tratados diretamente: src é trocado, translated=true, z-index=0 e pointer-events=none. Demais imagens usam `applyImageReplacement(img,dataUrl,true)`.

## Initialize e migração de storage

`initialize()` carrega config, resolve chapterId e solicita `SM_MIGRATE_CHAPTER`. Depois pede `SM_RESTORE_INDEX`, que é o caminho preferencial sem blobs. Se o índice vier vazio, lê `${chapterId}_restoreMap` do storage legado.

O merge `restoreMap = {...restoreMap,...entries}` é intencional: uma tradução pode chegar via UPDATE_IMAGE enquanto initialize aguarda migration/index. `REG-10` prova que a entry adicionada nesse intervalo não é perdida e restaura imagem futura.

Se o mapa continua vazio, não cria observer. Se auto-restore está desabilitado globalmente/no site, desconecta e loga. Caso contrário dispara apply imediato e instala observer.

## MutationObserver e debounce

O observer reage a nós adicionados ou mudanças em `src`, `data-src` e `data-lazy`; cada mutação relevante substitui o timer anterior e agenda `apply` em 150 ms. Isso coalesce lazy-loads rápidos.

Os testes provam dois cenários reais: alteração de `src` após init e imagem nova adicionada depois do observer.

## Atualização dinâmica de opções

`onStorageChanged` ignora instância inativa, área não-local e chaves não relacionadas. Recarrega config; se desabilitado, desconecta; se habilitado, chama `initialize` novamente.

O listener é instalado por `content_manga.js`, que encaminha imediatamente para `autoRestorer.onStorageChanged` quando a instância modular existe.

## Evidência de testes

| Fonte | Classificação | O que realmente prova |
|---|---|---|
| `auto-restorer-real.test.js` | ✅ PROVADO NO MÓDULO REAL INTEGRADO | Restore inicial, observer por src, novos nós, REG-10, enabled=false, site bloqueado, imagem bloqueada e integração de canonical URL. |
| `load-content-script.js` | 🟦 GATE/AMBIENTE DE TESTE | Carrega `cm-auto-restore.js` real antes de `content_manga.js`, na ordem do manifest; elimina dúvida de simulação. |
| `manifest.json` | 🟦 GATE ESTÁTICO ESPECÍFICO | Ordem real cm-chapter → cm-auto-restore → content_manga. |
| `content_manga.js` | 🟨 CONSUMIDOR REAL | Injeta dependências, reaponta funções principais, chama setEntry após persistência e encaminha storage.onChanged. |
| `cm-chapter.js` | 🟨 DEPENDÊNCIA REAL | Fornece getChapterId/resolveAsset e chama onRestoreEntry que alimenta setEntry. |

## Lacunas de teste, casos-limite e riscos

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `normalizeBlockedImagesStore` recebendo Array legado; a suíte principal usa mapa objeto.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** focal para `SM_RESTORE_INDEX` retornar `entries` não vazias e evitar o fallback legado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `SM_MIGRATE_CHAPTER` retornar `migrated>0` e o log `SM_MIGRATED`.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para branch `isBackdropOrBlurredImage=true` dentro deste restorer.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `resolveAsset` retornar null/rejeitar.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para `applyImageReplacement` falhar/retornar falsy; `restoredCount` é incrementado sem verificar o retorno.
- ⚠️ O loop conta `restoredCount` apenas no ramo normal; backdrops restaurados não entram no log `AUTO_RESTORE`.
- ⚠️ O raw URL aceita `data-original`, mas o MutationObserver/attributeFilter **não observa `data-original`**. Lazy-loader que altere somente esse atributo depois do init não dispara nova varredura.
- ⚠️ `initialize()` chama `apply()` sem `await`. Uma rejeição assíncrona de `apply` ocorre fora do `try/catch` de initialize e pode virar unhandled rejection.
- ⚠️ `MutationObserver` também agenda a função async `apply` via `setTimeout` sem catch explícito.
- ⚠️ `loadConfig` usa API callback sem conferir `chrome.runtime.lastError`; callback com dados inesperados pode deixar erro pouco diagnosticável.
- ⚠️ `initialize` engole qualquer erro no catch geral por design best-effort; isso evita quebrar a página, mas esconde falha operacional se logging externo não capturá-la.
- ⚠️ `restoreMap` só faz merge; não é limpo quando chapterId muda. Em SPA que muda de capítulo sem reinjetar content script, entries antigas podem permanecer e casar com URL igual em outro capítulo.
- ⚠️ `onStorageChanged` assume `changes` objeto; null/undefined causaria exceção.
- ⚠️ Mudança de blocklist enquanto `apply` já construiu `pending` não revalida `isAllowed` dentro do loop; uma imagem recém-bloqueada pode ser restaurada pela execução já em andamento.
- ⚠️ `getMap()` clona apenas o objeto externo; valores entry continuam compartilhados por referência.
- ⚠️ A implementação inline residual em `content_manga.js` duplica boa parte deste arquivo e pode divergir em futuras alterações.

## Segurança e privacidade

- Auto-restore só opera em imagens do DOM e assets já persistidos pelo próprio fluxo.
- O módulo não envia imagem para rede; `sendRuntimeMessageAsync` fala com o background da extensão.
- Configurações de opt-out global/site/imagem precisam prevalecer antes de carregar/aplicar asset.
- `blockedImages` protege automação, não tradução manual — comportamento intencional provado.
- O restoreMap pode conter referências a assets/traduções; fica apenas em memória do content script e storage/IndexedDB da extensão.

## Invariantes

1. Nunca auto-restaurar enquanto a instância não está ativa ou uma tradução está em curso.
2. Política enabled/site/blocklist deve ser aplicada antes de resolver/aplicar asset.
3. Resolver assets somente para cleanUrls que realmente casam com DOM.
4. Guard `running` deve impedir reentrância do mesmo restorer.
5. Entries adicionadas via `setEntry` durante initialize não podem ser perdidas pelo merge posterior.
6. IndexedDB restore index é preferido; fallback legado permanece para capítulos ainda não migrados.
7. Observer antigo/timer antigo deve ser desconectado antes de nova instância/disable/tradução.
8. Mutation observer deve continuar debounced.
9. Storage change de chaves não relacionadas não deve reinicializar restorer.
10. O módulo não deve absorver responsabilidades de chapter manager ou DOM replacement.

## Fonte integral

~~~javascript
'use strict';

// Stateful auto-restore coordinator. It intentionally receives the chapter,
// asset and DOM operations as dependencies: those responsibilities move in
// their own cuts and this module must not duplicate their caches or state.
(function attachAutoRestoreApi(rootScope) {
    function normalizeBlockedImagesStore(value) {
        if (Array.isArray(value)) return value.reduce((store, cleanUrl) => {
            if (cleanUrl) store[cleanUrl] = { cleanUrl };
            return store;
        }, {});
        return value && typeof value === 'object' ? value : {};
    }

    function createAutoRestorer(deps) {
        const { hostname, isActive, isTranslating, getChapterId, resolveAsset, getCleanUrl,
            isBackdropOrBlurredImage, applyImageReplacement, sendRuntimeMessageAsync, sendLog } = deps;
        let restoreMap = {};
        let observer = null;
        let debounceTimer = null;
        let running = false;
        let config = { enabled: true, disabledSites: [], blockedImages: {} };

        function loadConfig() {
            return new Promise(resolve => chrome.storage.local.get([
                'autoRestoreEnabled', 'autoRestoreDisabledSites', 'autoRestoreBlockedImages',
            ], data => {
                config = {
                    enabled: data.autoRestoreEnabled !== false,
                    disabledSites: Array.isArray(data.autoRestoreDisabledSites) ? data.autoRestoreDisabledSites : [],
                    blockedImages: normalizeBlockedImagesStore(data.autoRestoreBlockedImages),
                };
                resolve(config);
            }));
        }
        function isAllowed(cleanUrl) {
            return config.enabled && !config.disabledSites.includes(hostname) && !(cleanUrl && config.blockedImages[cleanUrl]);
        }
        function disconnect() {
            if (observer) { observer.disconnect(); observer = null; }
            clearTimeout(debounceTimer); debounceTimer = null;
        }
        async function apply() {
            if (!isActive()) { disconnect(); return; }
            if (isTranslating() || !config.enabled || config.disabledSites.includes(hostname) || !Object.keys(restoreMap).length || running) return;
            running = true;
            try {
                const pending = [];
                let blockedCount = 0;
                rootScope.document.querySelectorAll('img:not([data-translated="true"])').forEach(img => {
                    const rawUrl = img.getAttribute('src') || img.dataset.src || img.dataset.lazySrc || img.getAttribute('data-original') || '';
                    const cleanUrl = getCleanUrl(rawUrl);
                    if (!cleanUrl || !restoreMap[cleanUrl]) return;
                    if (!isAllowed(cleanUrl)) { blockedCount += 1; return; }
                    pending.push({ img, cleanUrl });
                });
                let restoredCount = 0;
                for (const { img, cleanUrl } of pending) {
                    if (!isActive() || isTranslating()) break;
                    if (img.dataset.translated === 'true') continue;
                    const dataUrl = await resolveAsset(restoreMap[cleanUrl]);
                    if (!dataUrl) continue;
                    if (isBackdropOrBlurredImage(img)) {
                        img.src = dataUrl; img.dataset.translated = 'true';
                        img.style.setProperty('z-index', '0', 'important');
                        img.style.setProperty('pointer-events', 'none', 'important');
                    } else {
                        applyImageReplacement(img, dataUrl, true); restoredCount += 1;
                    }
                }
                if (restoredCount) sendLog('info', 'AUTO_RESTORE', `Auto-restauração: ${restoredCount} página(s) restauradas silenciosamente`, { restoredCount });
                if (blockedCount) sendLog('info', 'AUTO_RESTORE_BLOCKED', `Auto-restauração: ${blockedCount} imagem(ns) bloqueadas pelas opções`, { blockedCount });
            } finally { running = false; }
        }
        async function initialize() {
            if (!isActive() || isTranslating()) return;
            try {
                await loadConfig();
                const chapterId = await getChapterId();
                if (!isActive() || isTranslating()) return;
                const migration = await sendRuntimeMessageAsync({ action: 'SM_MIGRATE_CHAPTER', chapterId });
                if (migration && migration.ok && migration.migrated > 0) sendLog('success', 'SM_MIGRATED', `Capítulo migrado para o novo armazenamento: ${migration.migrated} página(s)`, { chapterId, migrated: migration.migrated });
                const response = await sendRuntimeMessageAsync({ action: 'SM_RESTORE_INDEX', chapterId });
                if (!isActive() || isTranslating()) return;
                let entries = (response && response.ok && response.entries) || {};
                // The IndexedDB bridge is deliberately preferred, but old
                // chapters can still exist while migration is unavailable or
                // has not produced an index. Preserve their restore contract.
                if (!Object.keys(entries).length) {
                    const legacy = await new Promise(resolve => chrome.storage.local.get([`${chapterId}_restoreMap`], resolve));
                    entries = legacy[`${chapterId}_restoreMap`] || {};
                }
                restoreMap = { ...restoreMap, ...entries };
                if (!Object.keys(restoreMap).length) return;
                if (!config.enabled || config.disabledSites.includes(hostname)) {
                    disconnect();
                    sendLog('info', 'AUTO_RESTORE_DISABLED', 'Auto-restauração desativada pelas opções', { hostname, global: !config.enabled, site: config.disabledSites.includes(hostname) });
                    return;
                }
                apply(); disconnect();
                observer = new MutationObserver(mutations => {
                    const changed = mutations.some(m => m.addedNodes.length > 0 || (m.type === 'attributes' && ['src', 'data-src', 'data-lazy'].includes(m.attributeName)));
                    if (!changed) return;
                    clearTimeout(debounceTimer); debounceTimer = setTimeout(apply, 150);
                });
                observer.observe(rootScope.document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src', 'data-lazy'] });
                sendLog('info', 'AUTO_RESTORE_INIT', `Restaurador ativo: ${Object.keys(restoreMap).length} página(s) no mapa`);
            } catch (_) { /* existing flow intentionally treats restore as best-effort */ }
        }
        function setEntry(cleanUrl, entry) { if (cleanUrl && entry) restoreMap[cleanUrl] = entry; }
        function onStorageChanged(changes, areaName) {
            if (!isActive() || (areaName && areaName !== 'local')) return;
            if (!['autoRestoreEnabled', 'autoRestoreDisabledSites', 'autoRestoreBlockedImages'].some(key => changes[key])) return;
            loadConfig().then(() => {
                if (!isActive() || isTranslating()) return;
                if (!config.enabled || config.disabledSites.includes(hostname)) { disconnect(); return; }
                initialize();
            }).catch(() => {});
        }
        return Object.freeze({ loadConfig, isAllowed, disconnect, apply, initialize, setEntry, onStorageChanged, getMap: () => ({ ...restoreMap }) });
    }
    rootScope.MangaTranslatorAutoRestore = Object.freeze({ normalizeBlockedImagesStore, createAutoRestorer });
})(typeof window !== 'undefined' ? window : self);

~~~

## Rastreabilidade 124/124

| Posição | Unidade | Fonte | Papel local |
|---:|---|---|---|
| 001 | U01 | 'use strict'; | Ativa strict mode. |
| 002 | U01 | ␠ [linha vazia] | Separador visual da unidade U01. |
| 003 | U01 | // Stateful auto-restore coordinator. It intentionally receives the chapter, | Comentário arquitetural/compatibilidade: Stateful auto-restore coordinator. It intentionally receives the chapter,. |
| 004 | U01 | // asset and DOM operations as dependencies: those responsibilities move in | Comentário arquitetural/compatibilidade: asset and DOM operations as dependencies: those responsibilities move in. |
| 005 | U01 | // their own cuts and this module must not duplicate their caches or state. | Comentário arquitetural/compatibilidade: their own cuts and this module must not duplicate their caches or state.. |
| 006 | U01 | (function attachAutoRestoreApi(rootScope) { | Abre função/escopo de U01: (function attachAutoRestoreApi(rootScope) { |
| 007 | U02 |     function normalizeBlockedImagesStore(value) { | Abre função/escopo de U02: function normalizeBlockedImagesStore(value) { |
| 008 | U02 |         if (Array.isArray(value)) return value.reduce((store, cleanUrl) => { | Guard/branch que impede restore indevido: if (Array.isArray(value)) return value.reduce((store, cleanUrl) => { |
| 009 | U02 |             if (cleanUrl) store[cleanUrl] = { cleanUrl }; | Guard/branch que impede restore indevido: if (cleanUrl) store[cleanUrl] = { cleanUrl }; |
| 010 | U02 |             return store; | Retorna/encerra caminho: return store; |
| 011 | U02 |         }, {}); | Parte concreta de U02: }, {}); |
| 012 | U02 |         return value && typeof value === 'object' ? value : {}; | Retorna/encerra caminho: return value && typeof value === 'object' ? value : {}; |
| 013 | U02 |     } | Fecha/continua estrutura sintática de U02. |
| 014 | U02 | ␠ [linha vazia] | Separador visual da unidade U02. |
| 015 | U03 |     function createAutoRestorer(deps) { | Abre função/escopo de U03: function createAutoRestorer(deps) { |
| 016 | U03 |         const { hostname, isActive, isTranslating, getChapterId, resolveAsset, getCleanUrl, | Declara binding/dependência de U03: const { hostname, isActive, isTranslating, getChapterId, resolveAsset, getCleanUrl, |
| 017 | U03 |             isBackdropOrBlurredImage, applyImageReplacement, sendRuntimeMessageAsync, sendLog } = deps; | Chama bridge de Storage Manager no background. |
| 018 | U03 |         let restoreMap = {}; | Declara estado interno do coordenador. |
| 019 | U03 |         let observer = null; | Declara estado interno do coordenador. |
| 020 | U03 |         let debounceTimer = null; | Declara estado interno do coordenador. |
| 021 | U03 |         let running = false; | Declara estado interno do coordenador. |
| 022 | U03 |         let config = { enabled: true, disabledSites: [], blockedImages: {} }; | Declara estado interno do coordenador. |
| 023 | U03 | ␠ [linha vazia] | Separador visual da unidade U03. |
| 024 | U04 |         function loadConfig() { | Abre função/escopo de U04: function loadConfig() { |
| 025 | U04 |             return new Promise(resolve => chrome.storage.local.get([ | Retorna/encerra caminho: return new Promise(resolve => chrome.storage.local.get([ |
| 026 | U04 |                 'autoRestoreEnabled', 'autoRestoreDisabledSites', 'autoRestoreBlockedImages', | Parte concreta de U04: 'autoRestoreEnabled', 'autoRestoreDisabledSites', 'autoRestoreBlockedImages', |
| 027 | U04 |             ], data => { | Parte concreta de U04: ], data => { |
| 028 | U04 |                 config = { | Manipula política global/site/imagem. |
| 029 | U04 |                     enabled: data.autoRestoreEnabled !== false, | Parte concreta de U04: enabled: data.autoRestoreEnabled !== false, |
| 030 | U04 |                     disabledSites: Array.isArray(data.autoRestoreDisabledSites) ? data.autoRestoreDisabledSites : [], | Parte concreta de U04: disabledSites: Array.isArray(data.autoRestoreDisabledSites) ? data.autoRestoreDisabledSites : [], |
| 031 | U04 |                     blockedImages: normalizeBlockedImagesStore(data.autoRestoreBlockedImages), | Parte concreta de U04: blockedImages: normalizeBlockedImagesStore(data.autoRestoreBlockedImages), |
| 032 | U04 |                 }; | Fecha/continua estrutura sintática de U04. |
| 033 | U04 |                 resolve(config); | Manipula política global/site/imagem. |
| 034 | U04 |             })); | Fecha/continua estrutura sintática de U04. |
| 035 | U04 |         } | Fecha/continua estrutura sintática de U04. |
| 036 | U05 |         function isAllowed(cleanUrl) { | Abre função/escopo de U05: function isAllowed(cleanUrl) { |
| 037 | U05 |             return config.enabled && !config.disabledSites.includes(hostname) && !(cleanUrl && config.blockedImages[cleanUrl]); | Retorna/encerra caminho: return config.enabled && !config.disabledSites.includes(hostname) && !(cleanUrl && config.blockedImages[cleanUrl]); |
| 038 | U05 |         } | Fecha/continua estrutura sintática de U05. |
| 039 | U06 |         function disconnect() { | Abre função/escopo de U06: function disconnect() { |
| 040 | U06 |             if (observer) { observer.disconnect(); observer = null; } | Guard/branch que impede restore indevido: if (observer) { observer.disconnect(); observer = null; } |
| 041 | U06 |             clearTimeout(debounceTimer); debounceTimer = null; | Remove debounce anterior para coalescer mutações. |
| 042 | U06 |         } | Fecha/continua estrutura sintática de U06. |
| 043 | U07 |         async function apply() { | Abre função/escopo de U07: async function apply() { |
| 044 | U07 |             if (!isActive()) { disconnect(); return; } | Guard/branch que impede restore indevido: if (!isActive()) { disconnect(); return; } |
| 045 | U07 |             if (isTranslating() \|\| !config.enabled \|\| config.disabledSites.includes(hostname) \|\| !Object.keys(restoreMap).length \|\| running) return; | Guard/branch que impede restore indevido: if (isTranslating() // !config.enabled // config.disabledSites.includes(hostname) // !Object.keys(restoreMap).length // running) return; |
| 046 | U07 |             running = true; | Manipula guard de reentrância do apply. |
| 047 | U07 |             try { | Abre região best-effort protegida. |
| 048 | U07 |                 const pending = []; | Declara binding/dependência de U07: const pending = []; |
| 049 | U07 |                 let blockedCount = 0; | Declara estado interno do coordenador. |
| 050 | U07 |                 rootScope.document.querySelectorAll('img:not([data-translated="true"])').forEach(img => { | Seleciona imagens ainda não marcadas como traduzidas. |
| 051 | U07 |                     const rawUrl = img.getAttribute('src') \|\| img.dataset.src \|\| img.dataset.lazySrc \|\| img.getAttribute('data-original') \|\| ''; | Declara binding/dependência de U07: const rawUrl = img.getAttribute('src') // img.dataset.src // img.dataset.lazySrc // img.getAttribute('data-original') // ''; |
| 052 | U07 |                     const cleanUrl = getCleanUrl(rawUrl); | Declara binding/dependência de U07: const cleanUrl = getCleanUrl(rawUrl); |
| 053 | U07 |                     if (!cleanUrl \|\| !restoreMap[cleanUrl]) return; | Guard/branch que impede restore indevido: if (!cleanUrl // !restoreMap[cleanUrl]) return; |
| 054 | U07 |                     if (!isAllowed(cleanUrl)) { blockedCount += 1; return; } | Guard/branch que impede restore indevido: if (!isAllowed(cleanUrl)) { blockedCount += 1; return; } |
| 055 | U07 |                     pending.push({ img, cleanUrl }); | Parte concreta de U07: pending.push({ img, cleanUrl }); |
| 056 | U07 |                 }); | Fecha/continua estrutura sintática de U07. |
| 057 | U07 |                 let restoredCount = 0; | Declara estado interno do coordenador. |
| 058 | U07 |                 for (const { img, cleanUrl } of pending) { | Itera coleção de imagens/entradas de restore. |
| 059 | U07 |                     if (!isActive() \|\| isTranslating()) break; | Guard/branch que impede restore indevido: if (!isActive() // isTranslating()) break; |
| 060 | U07 |                     if (img.dataset.translated === 'true') continue; | Guard/branch que impede restore indevido: if (img.dataset.translated === 'true') continue; |
| 061 | U07 |                     const dataUrl = await resolveAsset(restoreMap[cleanUrl]); | Declara binding/dependência de U07: const dataUrl = await resolveAsset(restoreMap[cleanUrl]); |
| 062 | U07 |                     if (!dataUrl) continue; | Guard/branch que impede restore indevido: if (!dataUrl) continue; |
| 063 | U07 |                     if (isBackdropOrBlurredImage(img)) { | Guard/branch que impede restore indevido: if (isBackdropOrBlurredImage(img)) { |
| 064 | U07 |                         img.src = dataUrl; img.dataset.translated = 'true'; | Marca/filtra imagem já restaurada. |
| 065 | U07 |                         img.style.setProperty('z-index', '0', 'important'); | Parte concreta de U07: img.style.setProperty('z-index', '0', 'important'); |
| 066 | U07 |                         img.style.setProperty('pointer-events', 'none', 'important'); | Parte concreta de U07: img.style.setProperty('pointer-events', 'none', 'important'); |
| 067 | U07 |                     } else { | Parte concreta de U07: } else { |
| 068 | U07 |                         applyImageReplacement(img, dataUrl, true); restoredCount += 1; | Aplica substituição DOM usando módulo especializado. |
| 069 | U07 |                     } | Fecha/continua estrutura sintática de U07. |
| 070 | U07 |                 } | Fecha/continua estrutura sintática de U07. |
| 071 | U07 |                 if (restoredCount) sendLog('info', 'AUTO_RESTORE', `Auto-restauração: ${restoredCount} página(s) restauradas silenciosamente`, { restoredCount }); | Guard/branch que impede restore indevido: if (restoredCount) sendLog('info', 'AUTO_RESTORE', `Auto-restauração: ${restoredCount} página(s) restauradas silenciosamente`, { restoredCount }); |
| 072 | U07 |                 if (blockedCount) sendLog('info', 'AUTO_RESTORE_BLOCKED', `Auto-restauração: ${blockedCount} imagem(ns) bloqueadas pelas opções`, { blockedCount }); | Guard/branch que impede restore indevido: if (blockedCount) sendLog('info', 'AUTO_RESTORE_BLOCKED', `Auto-restauração: ${blockedCount} imagem(ns) bloqueadas pelas opções`, { blockedCount }); |
| 073 | U07 |             } finally { running = false; } | Manipula guard de reentrância do apply. |
| 074 | U07 |         } | Fecha/continua estrutura sintática de U07. |
| 075 | U08 |         async function initialize() { | Abre função/escopo de U08: async function initialize() { |
| 076 | U08 |             if (!isActive() \|\| isTranslating()) return; | Guard/branch que impede restore indevido: if (!isActive() // isTranslating()) return; |
| 077 | U08 |             try { | Abre região best-effort protegida. |
| 078 | U08 |                 await loadConfig(); | Parte concreta de U08: await loadConfig(); |
| 079 | U08 |                 const chapterId = await getChapterId(); | Declara binding/dependência de U08: const chapterId = await getChapterId(); |
| 080 | U08 |                 if (!isActive() \|\| isTranslating()) return; | Guard/branch que impede restore indevido: if (!isActive() // isTranslating()) return; |
| 081 | U08 |                 const migration = await sendRuntimeMessageAsync({ action: 'SM_MIGRATE_CHAPTER', chapterId }); | Declara binding/dependência de U08: const migration = await sendRuntimeMessageAsync({ action: 'SM_MIGRATE_CHAPTER', chapterId }); |
| 082 | U08 |                 if (migration && migration.ok && migration.migrated > 0) sendLog('success', 'SM_MIGRATED', `Capítulo migrado para o novo armazenamento: ${migration.migrated} página(s)`, { chapterId, migrated: migration.migrated }); | Guard/branch que impede restore indevido: if (migration && migration.ok && migration.migrated > 0) sendLog('success', 'SM_MIGRATED', `Capítulo migrado para o novo armazenamento: ${migration.migrated} página(s)`, { chapterId, migrated: migration.migrated }); |
| 083 | U08 |                 const response = await sendRuntimeMessageAsync({ action: 'SM_RESTORE_INDEX', chapterId }); | Declara binding/dependência de U08: const response = await sendRuntimeMessageAsync({ action: 'SM_RESTORE_INDEX', chapterId }); |
| 084 | U08 |                 if (!isActive() \|\| isTranslating()) return; | Guard/branch que impede restore indevido: if (!isActive() // isTranslating()) return; |
| 085 | U08 |                 let entries = (response && response.ok && response.entries) \|\| {}; | Declara estado interno do coordenador. |
| 086 | U08 |                 // The IndexedDB bridge is deliberately preferred, but old | Comentário arquitetural/compatibilidade: The IndexedDB bridge is deliberately preferred, but old. |
| 087 | U08 |                 // chapters can still exist while migration is unavailable or | Comentário arquitetural/compatibilidade: chapters can still exist while migration is unavailable or. |
| 088 | U08 |                 // has not produced an index. Preserve their restore contract. | Comentário arquitetural/compatibilidade: has not produced an index. Preserve their restore contract.. |
| 089 | U08 |                 if (!Object.keys(entries).length) { | Guard/branch que impede restore indevido: if (!Object.keys(entries).length) { |
| 090 | U08 |                     const legacy = await new Promise(resolve => chrome.storage.local.get([`${chapterId}_restoreMap`], resolve)); | Declara binding/dependência de U08: const legacy = await new Promise(resolve => chrome.storage.local.get([`${chapterId}_restoreMap`], resolve)); |
| 091 | U08 |                     entries = legacy[`${chapterId}_restoreMap`] \|\| {}; | Manipula mapa em memória de cleanUrl→entry. |
| 092 | U08 |                 } | Fecha/continua estrutura sintática de U08. |
| 093 | U08 |                 restoreMap = { ...restoreMap, ...entries }; | Manipula mapa em memória de cleanUrl→entry. |
| 094 | U08 |                 if (!Object.keys(restoreMap).length) return; | Guard/branch que impede restore indevido: if (!Object.keys(restoreMap).length) return; |
| 095 | U08 |                 if (!config.enabled \|\| config.disabledSites.includes(hostname)) { | Guard/branch que impede restore indevido: if (!config.enabled // config.disabledSites.includes(hostname)) { |
| 096 | U08 |                     disconnect(); | Parte concreta de U08: disconnect(); |
| 097 | U08 |                     sendLog('info', 'AUTO_RESTORE_DISABLED', 'Auto-restauração desativada pelas opções', { hostname, global: !config.enabled, site: config.disabledSites.includes(hostname) }); | Emite telemetria do estado/resultado do auto-restore. |
| 098 | U08 |                     return; | Parte concreta de U08: return; |
| 099 | U08 |                 } | Fecha/continua estrutura sintática de U08. |
| 100 | U08 |                 apply(); disconnect(); | Parte concreta de U08: apply(); disconnect(); |
| 101 | U08 |                 observer = new MutationObserver(mutations => { | Cria observer para lazy-load/DOM dinâmico. |
| 102 | U08 |                     const changed = mutations.some(m => m.addedNodes.length > 0 \|\| (m.type === 'attributes' && ['src', 'data-src', 'data-lazy'].includes(m.attributeName))); | Declara binding/dependência de U08: const changed = mutations.some(m => m.addedNodes.length > 0 // (m.type === 'attributes' && ['src', 'data-src', 'data-lazy'].includes(m.attributeName))); |
| 103 | U08 |                     if (!changed) return; | Guard/branch que impede restore indevido: if (!changed) return; |
| 104 | U08 |                     clearTimeout(debounceTimer); debounceTimer = setTimeout(apply, 150); | Agenda aplicação debounced 150 ms após mutação. |
| 105 | U08 |                 }); | Fecha/continua estrutura sintática de U08. |
| 106 | U08 |                 observer.observe(rootScope.document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src', 'data-lazy'] }); | Observa body/subtree e atributos previstos. |
| 107 | U08 |                 sendLog('info', 'AUTO_RESTORE_INIT', `Restaurador ativo: ${Object.keys(restoreMap).length} página(s) no mapa`); | Emite telemetria do estado/resultado do auto-restore. |
| 108 | U08 |             } catch (_) { /* existing flow intentionally treats restore as best-effort */ } | Captura falha do fluxo de auto-restore para não quebrar a página. |
| 109 | U08 |         } | Fecha/continua estrutura sintática de U08. |
| 110 | U09 |         function setEntry(cleanUrl, entry) { if (cleanUrl && entry) restoreMap[cleanUrl] = entry; } | Abre função/escopo de U09: function setEntry(cleanUrl, entry) { if (cleanUrl && entry) restoreMap[cleanUrl] = entry; } |
| 111 | U10 |         function onStorageChanged(changes, areaName) { | Abre função/escopo de U10: function onStorageChanged(changes, areaName) { |
| 112 | U10 |             if (!isActive() \|\| (areaName && areaName !== 'local')) return; | Guard/branch que impede restore indevido: if (!isActive() // (areaName && areaName !== 'local')) return; |
| 113 | U10 |             if (!['autoRestoreEnabled', 'autoRestoreDisabledSites', 'autoRestoreBlockedImages'].some(key => changes[key])) return; | Guard/branch que impede restore indevido: if (!['autoRestoreEnabled', 'autoRestoreDisabledSites', 'autoRestoreBlockedImages'].some(key => changes[key])) return; |
| 114 | U10 |             loadConfig().then(() => { | Parte concreta de U10: loadConfig().then(() => { |
| 115 | U10 |                 if (!isActive() \|\| isTranslating()) return; | Guard/branch que impede restore indevido: if (!isActive() // isTranslating()) return; |
| 116 | U10 |                 if (!config.enabled \|\| config.disabledSites.includes(hostname)) { disconnect(); return; } | Guard/branch que impede restore indevido: if (!config.enabled // config.disabledSites.includes(hostname)) { disconnect(); return; } |
| 117 | U10 |                 initialize(); | Parte concreta de U10: initialize(); |
| 118 | U10 |             }).catch(() => {}); | Parte concreta de U10: }).catch(() => {}); |
| 119 | U10 |         } | Fecha/continua estrutura sintática de U10. |
| 120 | U10 |         return Object.freeze({ loadConfig, isAllowed, disconnect, apply, initialize, setEntry, onStorageChanged, getMap: () => ({ ...restoreMap }) }); | Retorna/encerra caminho: return Object.freeze({ loadConfig, isAllowed, disconnect, apply, initialize, setEntry, onStorageChanged, getMap: () => ({ ...restoreMap }) }); |
| 121 | U10 |     } | Fecha/continua estrutura sintática de U10. |
| 122 | U11 |     rootScope.MangaTranslatorAutoRestore = Object.freeze({ normalizeBlockedImagesStore, createAutoRestorer }); | Parte concreta de U11: rootScope.MangaTranslatorAutoRestore = Object.freeze({ normalizeBlockedImagesStore, createAutoRestorer }); |
| 123 | U11 | })(typeof window !== 'undefined' ? window : self); | Parte concreta de U11: })(typeof window !== 'undefined' ? window : self); |
| 124 | U12 | ⏎ [newline final] | Newline terminal editorial. |

## Análise por unidade

### U01 — linhas 1–6 — Cabeçalho e IIFE

**O que faz:** Define strict mode, explica a separação de responsabilidades e abre a API no rootScope.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Mantém chapter/assets/DOM como dependências em vez de duplicar caches.

**Por que uma alternativa ingênua seria pior:** Duplicar essas responsabilidades geraria dois estados divergentes no content script.

### U02 — linhas 7–14 — normalizeBlockedImagesStore

**O que faz:** Converte formato legado Array de URLs em mapa e aceita mapa objeto atual.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Preserva compatibilidade de configurações antigas.

**Por que uma alternativa ingênua seria pior:** Assumir só um formato quebraria usuários com storage legado.

### U03 — linhas 15–23 — Factory, dependências e estado interno

**O que faz:** Recebe operações externas e mantém restoreMap, observer, debounce, running e config.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Isola coordenação de auto-restore sem possuir chapter/storage asset internamente.

**Por que uma alternativa ingênua seria pior:** Globals implícitos tornariam o módulo difícil de testar e aumentariam acoplamento.

### U04 — linhas 24–35 — loadConfig

**O que faz:** Lê três opções do storage e normaliza enabled/sites/blockedImages.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Centraliza política de opt-out global/site/imagem.

**Por que uma alternativa ingênua seria pior:** Ler opções dispersamente poderia aplicar regras inconsistentes entre init/apply/storage change.

### U05 — linhas 36–38 — isAllowed

**O que faz:** Decide se cleanUrl pode ser auto-restaurada.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Combina flag global, site e blocklist por imagem.

**Por que uma alternativa ingênua seria pior:** Aplicar só uma dessas políticas violaria preferência do usuário.

### U06 — linhas 39–42 — disconnect

**O que faz:** Desconecta observer e limpa debounce.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Evita observers/timers duplicados ao iniciar tradução, desativar opção ou reinicializar.

**Por que uma alternativa ingênua seria pior:** Observers acumulados repetiriam restores/logs e manteriam referências DOM.

### U07 — linhas 43–74 — apply

**O que faz:** Varre imagens não traduzidas, casa cleanUrl com restoreMap, filtra bloqueios, resolve assets sequencialmente e aplica substituição/backdrop com guard de reentrância.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Carrega Base64 apenas para imagens que realmente casam e revalida active/translation durante awaits.

**Por que uma alternativa ingênua seria pior:** Resolver todos os assets da página antecipadamente aumentaria memória e trabalho; reentrância criaria corrida no DOM.

### U08 — linhas 75–109 — initialize

**O que faz:** Carrega config/chapter, tenta migração, prefere SM_RESTORE_INDEX, cai para restoreMap legado, faz merge, aplica imediatamente e instala MutationObserver debounced.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Preserva entradas criadas durante a janela assíncrona e suporta migração gradual IndexedDB/legado.

**Por que uma alternativa ingênua seria pior:** Substituir restoreMap inteiro perderia UPDATE_IMAGE concorrente; observer sem debounce causaria varreduras excessivas.

### U09 — linhas 110–110 — setEntry

**O que faz:** Adiciona/atualiza entry em memória para uma cleanUrl válida.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Permite que persistTranslatedPage alimente restaurações futuras sem reinicialização.

**Por que uma alternativa ingênua seria pior:** Esperar novo restore index criaria janela em que imagem recém-traduzida não pode ser restaurada.

### U10 — linhas 111–121 — onStorageChanged e API congelada

**O que faz:** Reage apenas às três opções locais, recarrega config, desconecta/reinicializa e expõe API Object.freeze + getMap.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Atualiza política em tempo real sem reinstalar content script.

**Por que uma alternativa ingênua seria pior:** Ouvir toda mudança de storage causaria reinicializações desnecessárias.

### U11 — linhas 122–123 — Export e fechamento

**O que faz:** Publica MangaTranslatorAutoRestore congelado e fecha IIFE em window/self.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Garante ordem de bootstrap clara com content_manga.

**Por que uma alternativa ingênua seria pior:** Misturar export CommonJS/runtime não é necessário no content script e aumentaria superfície.

### U12 — linhas 124–124 — Newline final

**O que faz:** Representa newline terminal auditado.

**Como faz:** coordena dependências injetadas, estado local e DOM/storage sem duplicar ownership de chapter/assets.

**Por que foi feito assim:** Mantém equivalência física.

**Por que uma alternativa ingênua seria pior:** Ignorá-lo quebraria a convenção das Bíblias.

## Auditoria final

- [x] SHA/fonte integral;
- [x] 123 linhas + newline = 124/124;
- [x] config/bloqueios/apply/init/observer/storage-change mapeados;
- [x] wiring real com manifest/content_manga confirmado;
- [x] suíte real diferenciada de dependências adjacentes;
- [x] fallback legado e duplicação inline documentados;
- [x] gaps de data-original/async apply/SPA/map/config explicitados;
- [x] nenhum código funcional alterado.

**Veredito:** ✅ APROVADO para `d20e7092652e484d2299345cfd7eeb3afdd34750`.

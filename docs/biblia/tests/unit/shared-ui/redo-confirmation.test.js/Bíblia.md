# Bíblia técnica — tests/unit/shared-ui/redo-confirmation.test.js

> **Estado documental:** 🟠 REAUDITORIA TÉCNICA APROVADA — GATE GLOBAL PENDENTE  
> **SHA auditado:** `2b46e876c3f87e3c0155f4a38ccb0f1bbc950b98`  
> **Autor original:** AGENTE 25  
> **Proprietário/reauditor atual:** AGENTE 28  
> **Tipo:** suíte Jest/JSDOM da confirmação e limpeza de “Refazer” usando `shared-ui.js` real  
> **Linhas textuais:** **242**  
> **Posições documentais:** **243**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Esta suíte é a proteção focal do fluxo de **Refazer tradução** compartilhado por popup e options. Ela carrega `extension/shared/shared-ui.js` real, exposto em `globalThis`, e exercita `deleteSavedTranslationForEntry()`/`requestRedoConfirmation()` sob JSDOM com Chrome APIs mockadas.

O objetivo funcional é impedir dependência de `window.confirm`, oferecer modal próprio, permitir persistir “Não perguntar novamente”, limpar referências locais da imagem e solicitar invalidação dos dois backends de persistência (`SM_DELETE_CLEAN_URL` e `GTC_DELETE_BY_CLEAN_URL`).

Consumidores reais encontrados no repositório:

- `extension/popup/popup.js` chama `deleteSavedTranslationForEntry(entry, { refresh: renderSettingsSites, showStatus: showSettingsStatus })` no botão **Refazer**;
- `extension/options/options.js` chama a mesma função no botão de Refazer da tela de opções;
- `extension/shared/shared-ui.js` é a fonte única desta implementação compartilhada.

## 2. Descoberta e execução pelo Jest/CI

`jest.config.js` possui projeto `shared-ui`, ambiente `jsdom`, `testMatch: <rootDir>/tests/unit/shared-ui/**/*.test.js` e carrega `chrome-api.mock.js` + `dom-environment.js` como setup.

`package.json#test:unit` seleciona explicitamente o projeto `shared-ui`. `scripts/ci/run-jest-ci.js` também inclui `shared-ui` na lista de projetos unitários, enumera todos os `.test.js` em `tests/unit`/`tests/integration`, compara a partição descoberta pelo Jest com esse inventário e falha se algum arquivo estiver ausente ou se houver testes falhos/skipped/TODO acima do baseline.

`.github/workflows/ci.yml` executa `npm run test:ci` em Node 20.x e 22.x. No momento desta auditoria, o workflow do HEAD do PR estava **pending**; portanto a inclusão da suíte está comprovada por gate/configuração, mas esta Bíblia não reivindica um resultado runtime novo do workflow ainda não concluído.

**Classificação da inclusão:** 🟦 GATE ESTÁTICO ESPECÍFICO.

## 3. Harness da suíte

- `findRepoRoot(__dirname)` localiza a raiz por `extension/manifest.json`.
- `getStorageMock()` fornece storage stateful assíncrono em memória.
- `getRuntimeMock()` fornece o runtime compartilhado criado pelo setup Jest.
- O `beforeEach` zera listeners/lastError do runtime, limpa storage e recria `<head><body>`.
- A suíte substitui `chrome.runtime.sendMessage` por `sendSpy`, que responde `{ ok:true, deleted:1 }` às ações de deleção. Essa decisão isola `shared-ui.js`, mas **não executa os handlers reais** de Storage Manager/GTC.
- `jest.isolateModules(() => require(SHARED_UI))` carrega a implementação de produção real a cada cenário.
- `waitFor()` faz polling do DOM até o modal/overlay esperado existir.
- O `afterEach` restaura spies, limpa storage/DOM e remove somente os dois exports focais (`requestRedoConfirmation` e `deleteSavedTranslationForEntry`). Os demais símbolos expostos por `shared-ui.js` permanecem no `globalThis` até serem sobrescritos por uma nova carga/ambiente.

Observação de manutenção: `fs` é importado na linha 2, mas não é usado pela suíte.

## 4. Implementação real correlata

`extension/shared/shared-ui.js` — SHA lido `b284fb8eb0e8d30f34dc83642f07916d20012bf0`.

Contratos relevantes do código real:

1. `requestRedoConfirmation()` retorna imediatamente em `ui.skipConfirmation === true` ou `redoConfirmEnabled === false`.
2. Sem `document`/`document.body`, a confirmação é tratada como aceita.
3. O modal próprio substitui qualquer overlay anterior, cria ARIA/dialog, Cancelar, “Não perguntar novamente” e “Apagar e refazer”.
4. Cancelar, Escape ou clique no backdrop resolvem `false`; aceitar resolve `true`; checkbox marcado persiste `redoConfirmEnabled:false` antes de resolver.
5. `deleteSavedTranslationForEntry()` rejeita entrada sem `cleanUrl` e usa `redoRequestInFlight` por URL para bloquear concorrência duplicada.
6. Após confirmação, envia `SM_DELETE_CLEAN_URL`, remove a URL dos mapas/meta/blocked e remove `index` de imagens/paths locais.
7. Quando `chapterId` não é fornecido, percorre os IDs de `chapterList`.
8. Depois envia `GTC_DELETE_BY_CLEAN_URL`, atualiza a UI e retorna `true` mesmo quando SM/GTC não respondem, usando status de aviso.
9. Exceções caem no `catch`, mostram mensagem de falha e retornam `false`; o `finally` sempre libera a chave em voo.

## 5. Cenário: modal próprio + Cancelar

Linhas 61–81 chamam a implementação real com `chapterId`, `cleanUrl` e `index`, enquanto `window.confirm` é transformado em spy que lança erro caso seja chamado.

A suíte prova diretamente:

- o modal `mt-redo-confirm-dialog` aparece;
- `window.confirm` não é invocado;
- clicar Cancelar faz a Promise resolver `false`;
- `SM_DELETE_CLEAN_URL` não é despachado;
- o overlay é removido.

O título “Cancelar não apaga nada” é mais amplo que as assertions: não há dado persistido antes da ação, não há re-leitura do storage e não se verifica explicitamente ausência de `GTC_DELETE_BY_CLEAN_URL`.

## 6. Cenário: Escape e clique no backdrop

Linhas 83–99 executam duas confirmações reais: Escape e clique no próprio overlay. Em ambos os casos a Promise resolve `false`.

Isso prova os dois mecanismos de cancelamento do modal. A suíte não inspeciona storage nem chamadas de deleção após esses dois cancelamentos.

## 7. Cenário: confirmação e limpeza local

Linhas 101–165 persistem um dataset com:

- `chapterList` contendo `chap_redo`;
- `chap_redo_images` e `chap_redo_paths` com índices 0/1;
- `chap_redo_restoreMap` e `chap_redo_restoreMeta` para URL errada e URL preservada;
- `autoRestoreBlockedImages` contendo a URL errada.

Após aceitar o modal, há assertions diretas de que:

- índice `0` desaparece de images/paths;
- índice `1` permanece;
- `cleanUrl` é removida do restoreMap/restoreMeta;
- outra URL permanece no restoreMap;
- o bloqueio da URL é removido;
- `SM_DELETE_CLEAN_URL` é enviado com a URL;
- `GTC_DELETE_BY_CLEAN_URL` é enviado com a URL;
- `refresh()` é chamado uma vez;
- `showStatus()` recebe mensagem de sucesso e `#4CAF50`.

**Limite probatório:** os dois callbacks de backend são fabricados pelo `sendSpy` da própria suíte. Assim, este arquivo prova o **despacho** correto das ações, não a deleção real dos backends.

Há prova independente em outras suítes de partes desse contrato: `tests/smoke/smoke-04-storage-manager.js` executa `storage-manager.deleteByCleanUrl()` real e verifica desaparecimento do restore; `tests/unit/gtc/indexeddb.test.js` executa deleção GTC real e também testa o runtime `GTC_DELETE_BY_CLEAN_URL`. Essas provas independentes não compõem, neste arquivo, um único caminho UI → background/GTC de ponta a ponta.

## 8. Cenário: “Não perguntar novamente”

Linhas 167–195 marcam o checkbox, aceitam o primeiro modal e verificam `redoConfirmEnabled === false`. Depois executam novo Refazer e provam que:

- a operação resolve `true`;
- nenhum overlay é criado;
- `window.confirm` continua sem uso;
- houve duas solicitações `SM_DELETE_CLEAN_URL` no total.

Esse é um teste direto do contrato que evita o bloqueio de diálogos nativos do navegador.

## 9. Cenário: preferência já desabilitada

Linhas 197–214 preparam `redoConfirmEnabled:false` antes da operação. A implementação real segue sem modal/native confirm, retorna `true` e despacha `SM_DELETE_CLEAN_URL` para a URL esperada.

## 10. Cenário: duplo clique

Linhas 216–234 iniciam duas chamadas simultâneas para a mesma `cleanUrl`. A primeira abre o modal; a segunda retorna `false` devido a `redoRequestInFlight`.

As assertions provam uma única chamada `SM_DELETE_CLEAN_URL`. Isso testa o lock por URL em voo, mas não testa retry **da mesma URL** depois de Cancelar, sucesso ou exceção para demonstrar explicitamente a liberação do `finally`.

## 11. Cenário: entrada inválida

Linhas 236–241 exercitam `null` e `{}`. Ambas resolvem `false`, nenhum overlay aparece e nenhuma mensagem `SM_DELETE_CLEAN_URL` é enviada.

O título afirma “sem tocar no storage”, porém não existe spy/assertion sobre `chrome.storage.local.get/set/remove`; essa parte do título não recebe prova direta.

## 12. Matriz de evidência

| Contrato | Evidência nesta suíte | Classificação |
|---|---|---|
| Arquivo é descoberto pelo projeto Jest `shared-ui` e pelo inventário CI | `jest.config.js`, `package.json`, `run-jest-ci.js`, workflow | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `shared-ui.js` real é carregado | linhas 29–51 | 🟨 EXECUTADO INDIRETAMENTE pelo harness |
| Modal próprio aparece sem `window.confirm` | 61–80 | ✅ PROVADO DIRETAMENTE |
| Cancelar retorna false e remove overlay | 76–80 | ✅ PROVADO DIRETAMENTE |
| Cancelar “não apaga nada” em todas as camadas | só ausência de SM é verificada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a afirmação completa |
| Escape cancela | 83–90 | ✅ PROVADO DIRETAMENTE |
| Clique no backdrop cancela | 92–98 | ✅ PROVADO DIRETAMENTE |
| Objetos locais images/paths removem índice alvo e preservam outro | 101–153 | ✅ PROVADO DIRETAMENTE |
| restoreMap/restoreMeta removem somente `cleanUrl` alvo | 114–153 | ✅ PROVADO DIRETAMENTE |
| `autoRestoreBlockedImages` objeto remove alvo | 122–153 | ✅ PROVADO DIRETAMENTE |
| SM recebe `SM_DELETE_CLEAN_URL` | 155–158 | ✅ PROVADO DIRETAMENTE para despacho |
| Storage Manager realmente apaga backend via essa chamada UI | callback é simulado; prova independente existe em smoke | ⚠️ SEM PROVA COMPOSTA NESTA SUÍTE |
| GTC recebe `GTC_DELETE_BY_CLEAN_URL` | 159–162 | ✅ PROVADO DIRETAMENTE para despacho |
| GTC realmente apaga cache via essa chamada UI | callback é simulado; prova independente existe em indexeddb.test.js | ⚠️ SEM PROVA COMPOSTA NESTA SUÍTE |
| refresh/status verde no sucesso simulado | 163–164 | ✅ PROVADO DIRETAMENTE |
| “Não perguntar novamente” persiste false | 167–184 | ✅ PROVADO DIRETAMENTE |
| preferência false evita modal/confirm nativo | 186–194 e 197–213 | ✅ PROVADO DIRETAMENTE |
| duas chamadas simultâneas da mesma URL não purgam duas vezes | 216–233 | ✅ PROVADO DIRETAMENTE para SM |
| entrada null/sem cleanUrl retorna false, sem modal e sem SM | 236–240 | ✅ PROVADO DIRETAMENTE |
| entrada inválida não toca storage | não há spy de storage | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `ui.skipConfirmation` | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ambiente sem `document.body` | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| overlay anterior é removido | não exercitado diretamente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `chapterId` ausente percorre `chapterList` não vazio | cenários sem chapterId usam storage vazio | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| coleções array são anuladas em vez de deletadas | só objetos são usados neste arquivo | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| blockedImages legado em array é normalizado/removido | só objeto é usado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| SM ausente/falhando gera status laranja e ainda conclui localmente | sendSpy sempre responde sucesso | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| GTC `runtime.lastError` gera aviso | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| exceção no fluxo retorna false e mostra falha | não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| chave in-flight é reutilizável após settlement | não repetido com a mesma URL após finalizar | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 13. Invariantes relevantes

1. O fluxo de Refazer não pode depender de `window.confirm`.
2. Cancelar por qualquer mecanismo não deve iniciar purga.
3. A URL selecionada deve ser removida sem destruir traduções vizinhas.
4. A preferência “Não perguntar novamente” deve persistir e impedir futuros modais.
5. A mesma URL não pode ter duas purgas simultâneas.
6. Falha de um backend não deve apagar silenciosamente o fato de que houve degradação; a UI precisa distinguir sucesso pleno de sucesso local/parcial.
7. O lock por URL precisa ser sempre liberado após cancelamento, sucesso ou exceção.
8. Testes do UI/helper não devem ser confundidos com prova de que backends reais receberam e persistiram a mutação.

## 14. Solicitações ao auditor

### 224-001 — TEST_INTEGRATION_REQUIRED — OPEN

**Encontrado:** o cenário “confirmar apaga storage novo, legado, bloqueio e cache global” usa `sendSpy` que devolve sucesso artificial para `SM_DELETE_CLEAN_URL` e `GTC_DELETE_BY_CLEAN_URL`.

**Evidência atual:** remoção do storage local legado é direta; dispatch das duas actions é direto; Storage Manager e GTC têm provas independentes em outras suítes.

**Evidência ausente:** caminho composto UI real → handler real → backend real/in-memory real para a mesma `cleanUrl`.

**Necessário:** adicionar em trabalho externo autorizado uma integração que conecte `shared-ui.js` aos handlers reais ou estreitar o título/claims desta suíte para “solicita limpeza”.

**Risco:** UI pode despachar formato incompatível ou roteamento pode quebrar enquanto cada lado isolado continua verde.

**Severidade:** HIGH.

### 224-002 — TEST_REQUIRED — OPEN

**Encontrado:** todos os callbacks de deleção são sucesso; não existem cenários de `SM_DELETE_CLEAN_URL` sem resposta/erro, `GTC_DELETE_BY_CLEAN_URL` com `runtime.lastError`, exceção de storage ou falha que atravesse o `catch`.

**Evidência atual:** somente caminho verde e status `#4CAF50`.

**Evidência ausente:** mensagens laranja de degradação, retorno esperado em falhas, manutenção da limpeza local e cleanup do lock após exceção.

**Necessário:** criar matriz de falha contra a implementação real, inclusive retry da mesma URL depois do settlement para provar o `finally`.

**Risco:** operação parcial pode ser apresentada como sucesso pleno, ou uma falha pode deixar URL permanentemente bloqueada para novo Refazer.

**Severidade:** HIGH.

### 224-003 — TEST_ASSERTION_QUALITY — OPEN

**Encontrado:** títulos de cancelamento/entrada inválida afirmam ausência total de deleção/storage touch, mas as assertions só verificam `false`, DOM e ausência de `SM_DELETE_CLEAN_URL`.

**Evidência atual:** SM não é enviado no primeiro cancelamento e na entrada inválida.

**Evidência ausente:** ausência de GTC, storage local inalterado nos cancelamentos e zero `get/set/remove` para entrada inválida.

**Necessário:** semear dados sentinela, revalidá-los após Cancelar/Escape/backdrop e espionar as APIs de storage/mensagem relevantes.

**Risco:** efeito colateral antecipado pode surgir antes da confirmação sem falhar os testes atuais.

**Severidade:** NORMAL.

### 224-004 — TEST_REQUIRED — OPEN

**Encontrado:** branches reais de `requestRedoConfirmation`/deleção seguem sem cenário focal: `ui.skipConfirmation`, ausência de `document.body`, remoção de overlay anterior, fan-out por `chapterList` quando não há `chapterId`, arrays em images/paths e blockedImages legado em array.

**Evidência atual:** preferência false, objetos de storage e um chapterId explícito são cobertos.

**Evidência ausente:** assertions específicas para os branches acima.

**Necessário:** acrescentar casos focais ou localizar prova direta equivalente e referenciá-la; manter distinção entre helper isolado e integração real.

**Risco:** migrações de formato legado, execução sem DOM ou limpeza multi-capítulo podem regredir silenciosamente.

**Severidade:** NORMAL.

## 15. Fonte integral exata

Bloco abaixo reproduz exatamente o blob auditado; o newline terminal do arquivo ocorre imediatamente antes do fechamento da fence.

```js
const path = require('path');
const fs = require('fs');

const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getStorageMock, getRuntimeMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));
const SHARED_UI = path.join(ROOT, 'extension/shared/shared-ui.js');

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeout = 1500, interval = 10 } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const value = await assertion();
        if (value) return value;
        await delay(interval);
    }
    throw new Error('Timeout aguardando condição');
}

describe('shared-ui — Refazer sem dependência de window.confirm', () => {
    let storageMock;
    let runtimeMock;
    let sendSpy;

    beforeEach(async () => {
        jest.resetModules();
        storageMock = getStorageMock();
        runtimeMock = getRuntimeMock();
        runtimeMock._messageListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();
        document.documentElement.innerHTML = '<head></head><body></body>';

        sendSpy = jest.spyOn(global.chrome.runtime, 'sendMessage').mockImplementation((message, callback) => {
            if (message.action === 'SM_DELETE_CLEAN_URL') {
                if (callback) setTimeout(() => callback({ ok: true, deleted: 1 }), 0);
                return;
            }
            if (message.action === 'GTC_DELETE_BY_CLEAN_URL') {
                if (callback) setTimeout(() => callback({ ok: true, deleted: 1 }), 0);
                return;
            }
            if (callback) setTimeout(() => callback({ ok: true }), 0);
        });

        jest.isolateModules(() => require(SHARED_UI));
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await storageMock.clear();
        document.documentElement.innerHTML = '<head></head><body></body>';
        delete global.requestRedoConfirmation;
        delete global.deleteSavedTranslationForEntry;
    });

    test('abre modal próprio e Cancelar não apaga nada', async () => {
        const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => {
            throw new Error('window.confirm não deveria ser usado');
        });

        const promise = global.deleteSavedTranslationForEntry({
            chapterId: 'chap_1',
            cleanUrl: 'https://reader.test/p1.png',
            index: 0,
        });

        const dialog = await waitFor(() => document.getElementById('mt-redo-confirm-dialog'));
        expect(dialog).not.toBeNull();
        expect(nativeConfirm).not.toHaveBeenCalled();

        document.getElementById('mt-redo-confirm-cancel').click();
        await expect(promise).resolves.toBe(false);

        expect(sendSpy.mock.calls.some(([message]) => message.action === 'SM_DELETE_CLEAN_URL')).toBe(false);
        expect(document.getElementById('mt-redo-confirm-overlay')).toBeNull();
    });

    test('Escape cancela o modal e clique fora também é tratado como cancelamento', async () => {
        const first = global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/escape.png',
            index: 0,
        });
        await waitFor(() => document.getElementById('mt-redo-confirm-overlay'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await expect(first).resolves.toBe(false);

        const second = global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/outside.png',
            index: 1,
        });
        const overlay = await waitFor(() => document.getElementById('mt-redo-confirm-overlay'));
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await expect(second).resolves.toBe(false);
    });

    test('confirmar apaga storage novo, legado, bloqueio e cache global', async () => {
        const cleanUrl = 'https://reader.test/wrong.png';
        const keepUrl = 'https://reader.test/keep.png';
        await storageMock.set({
            chapterList: [{ id: 'chap_redo', title: 'Cap', url: 'https://reader.test/cap' }],
            chap_redo_images: {
                0: 'data:image/png;base64,WRONG',
                1: 'data:image/png;base64,KEEP',
            },
            chap_redo_paths: {
                0: 'C:/wrong.png',
                1: 'C:/keep.png',
            },
            chap_redo_restoreMap: {
                [cleanUrl]: 'data:image/png;base64,WRONG',
                [keepUrl]: 'data:image/png;base64,KEEP',
            },
            chap_redo_restoreMeta: {
                [cleanUrl]: { index: 0 },
                [keepUrl]: { index: 1 },
            },
            autoRestoreBlockedImages: {
                [cleanUrl]: { cleanUrl },
            },
        });

        const refresh = jest.fn();
        const showStatus = jest.fn();
        const promise = global.deleteSavedTranslationForEntry({
            chapterId: 'chap_redo',
            cleanUrl,
            index: 0,
        }, { refresh, showStatus });

        await waitFor(() => document.getElementById('mt-redo-confirm-accept'));
        document.getElementById('mt-redo-confirm-accept').click();
        await expect(promise).resolves.toBe(true);

        const data = await storageMock.get([
            'chap_redo_images',
            'chap_redo_paths',
            'chap_redo_restoreMap',
            'chap_redo_restoreMeta',
            'autoRestoreBlockedImages',
        ]);

        expect(data.chap_redo_images[0]).toBeUndefined();
        expect(data.chap_redo_images[1]).toContain('KEEP');
        expect(data.chap_redo_paths[0]).toBeUndefined();
        expect(data.chap_redo_restoreMap[cleanUrl]).toBeUndefined();
        expect(data.chap_redo_restoreMap[keepUrl]).toContain('KEEP');
        expect(data.chap_redo_restoreMeta[cleanUrl]).toBeUndefined();
        expect(data.autoRestoreBlockedImages[cleanUrl]).toBeUndefined();

        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'SM_DELETE_CLEAN_URL', cleanUrl }),
            expect.any(Function)
        );
        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'GTC_DELETE_BY_CLEAN_URL', cleanUrl }),
            expect.any(Function)
        );
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('Tradução apagada'), '#4CAF50');
    });

    test('"Não perguntar novamente" persiste preferência e próximo Refazer ignora qualquer bloqueio de diálogo', async () => {
        const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => {
            throw new Error('diálogo nativo bloqueado');
        });

        const first = global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/first.png',
            index: 0,
        });
        await waitFor(() => document.getElementById('mt-redo-confirm-accept'));

        document.getElementById('mt-redo-confirm-never-ask').checked = true;
        document.getElementById('mt-redo-confirm-accept').click();
        await expect(first).resolves.toBe(true);

        const pref = await storageMock.get(['redoConfirmEnabled']);
        expect(pref.redoConfirmEnabled).toBe(false);
        expect(nativeConfirm).not.toHaveBeenCalled();

        const second = global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/second.png',
            index: 1,
        });
        await expect(second).resolves.toBe(true);

        expect(document.getElementById('mt-redo-confirm-overlay')).toBeNull();
        expect(nativeConfirm).not.toHaveBeenCalled();
        expect(sendSpy.mock.calls.filter(([message]) => message.action === 'SM_DELETE_CLEAN_URL')).toHaveLength(2);
    });

    test('preferência redoConfirmEnabled=false executa Refazer mesmo se confirm nativo estiver indisponível', async () => {
        await storageMock.set({ redoConfirmEnabled: false });
        const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => {
            throw new Error('confirm bloqueado');
        });

        const result = await global.deleteSavedTranslationForEntry({
            cleanUrl: 'https://reader.test/no-dialog.png',
            index: 3,
        });

        expect(result).toBe(true);
        expect(nativeConfirm).not.toHaveBeenCalled();
        expect(document.getElementById('mt-redo-confirm-overlay')).toBeNull();
        expect(sendSpy.mock.calls.some(([message]) =>
            message.action === 'SM_DELETE_CLEAN_URL' && message.cleanUrl.includes('no-dialog')
        )).toBe(true);
    });

    test('duplo clique no mesmo Refazer não dispara duas purgas simultâneas', async () => {
        const entry = {
            cleanUrl: 'https://reader.test/double.png',
            index: 0,
        };

        const first = global.deleteSavedTranslationForEntry(entry);
        const second = global.deleteSavedTranslationForEntry(entry);

        await waitFor(() => document.getElementById('mt-redo-confirm-accept'));
        document.getElementById('mt-redo-confirm-accept').click();

        await expect(first).resolves.toBe(true);
        await expect(second).resolves.toBe(false);

        expect(sendSpy.mock.calls.filter(([message]) =>
            message.action === 'SM_DELETE_CLEAN_URL' && message.cleanUrl === entry.cleanUrl
        )).toHaveLength(1);
    });

    test('entrada inválida retorna false sem abrir modal nem tocar no storage', async () => {
        await expect(global.deleteSavedTranslationForEntry(null)).resolves.toBe(false);
        await expect(global.deleteSavedTranslationForEntry({})).resolves.toBe(false);
        expect(document.getElementById('mt-redo-confirm-overlay')).toBeNull();
        expect(sendSpy.mock.calls.some(([message]) => message.action === 'SM_DELETE_CLEAN_URL')).toBe(false);
    });
});
```

## 16. Cobertura documental por linha/posição

Faixas contíguas cobrem **1–243**; a posição 243 representa o newline terminal.

### Posições 1–8 — imports e resolução de caminhos
`path`, `fs`, `findRepoRoot`, mocks e caminho de `shared-ui.js`. `fs` está importado sem uso funcional. **Evidência:** 🟨 harness.

### Posição 9 — separador
Linha vazia.

### Posições 10–22 — `delay` e `waitFor`
Polling assíncrono do DOM com timeout de 1500 ms/intervalo 10 ms. **Evidência:** 🟨 helper de teste.

### Posição 23 — separador
Linha vazia.

### Posições 24–59 — suite lifecycle/harness
Declara spies/mocks; limpa runtime/storage/DOM; substitui `sendMessage`; carrega `shared-ui.js` real; restaura estado depois de cada caso. **Evidência:** 🟨 harness; respostas de backend são simulações.

### Posição 60 — separador
Linha vazia.

### Posições 61–81 — modal próprio e Cancelar
Prova modal, ausência de `window.confirm`, retorno false, ausência de SM e remoção do overlay. **Evidência:** ✅ para assertions existentes; ⚠️ para “não apaga nada” em todas as camadas.

### Posição 82 — separador
Linha vazia.

### Posições 83–99 — Escape/backdrop
Dois mecanismos de cancelamento resolvem false. **Evidência:** ✅ resultado; ⚠️ efeitos colaterais não inspecionados.

### Posição 100 — separador
Linha vazia.

### Posições 101–165 — confirmação e limpeza
Monta dataset local, aceita modal, re-lê storage, verifica remoções/preservações, dispatch SM/GTC, refresh e status verde. **Evidência:** ✅ local/dispatch/UI; ⚠️ deleção real dos backends.

### Posição 166 — separador
Linha vazia.

### Posições 167–195 — “Não perguntar novamente”
Persiste `redoConfirmEnabled:false` e segunda operação ignora modal/native confirm. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 196 — separador
Linha vazia.

### Posições 197–214 — preferência false pré-existente
Executa Refazer sem diálogo e confirma envio SM para a URL. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Posição 215 — separador
Linha vazia.

### Posições 216–234 — concorrência duplicada
Duas chamadas da mesma URL; a segunda resolve false e existe um único SM dispatch. **Evidência:** ✅ PROVADO DIRETAMENTE para a exclusão mútua em voo.

### Posição 235 — separador
Linha vazia.

### Posições 236–241 — entrada inválida
`null` e `{}` retornam false; sem modal e sem SM. **Evidência:** ✅ para assertions; ⚠️ “sem tocar no storage” não é observado.

### Posição 242 — fechamento
Fecha o `describe`. **Evidência:** 🟨 estrutural.

### Posição 243 — newline terminal
Terminador final do blob auditado.

## 17. Autoauditoria documental

- SHA do fonte reconfirmado antes da escrita: `2b46e876c3f87e3c0155f4a38ccb0f1bbc950b98`.
- Fonte integral incluída sem alteração.
- 243/243 posições documentais cobertas por faixas contíguas.
- Implementação real, harness, consumidores e gates CI cruzados.
- Claims de backend foram rebaixados quando sustentados apenas por mocks.
- Quatro solicitações externas foram registradas sem alterar teste, código, fixture, workflow ou configuração.
- `STATUS.md`, `CHECKLIST.md` e `AUDITORIA.md` não foram modificados por AGENTE 25.

**Resultado da autoauditoria:** ✅ APROVADA.

## 18. Reauditoria independente — AGENTE 28 (retomada explícita)

Em 2026-09-30, após a liberação da reserva anterior, o **AGENTE 28** assumiu #224 por reserva `CREATE ONLY` e revalidou o estado corrente do branch.

### Integridade reconfirmada

- fonte atual: `tests/unit/shared-ui/redo-confirmation.test.js`;
- SHA atual e auditado: `2b46e876c3f87e3c0155f4a38ccb0f1bbc950b98`;
- 242 linhas textuais + newline terminal = **243/243 posições**;
- bloco de fonte integral desta Bíblia continua **textualmente idêntico** ao blob atual;
- `extension/shared/shared-ui.js` continua no SHA `b284fb8eb0e8d30f34dc83642f07916d20012bf0` e mantém os branches descritos nesta Bíblia;
- consumidores reais continuam presentes em `extension/popup/popup.js` e `extension/options/options.js`;
- `tests/smoke/smoke-04-storage-manager.js` continua provando `deleteByCleanUrl()` isoladamente;
- `tests/unit/gtc/indexeddb.test.js` continua provando `GTC_DELETE_BY_CLEAN_URL` isoladamente;
- `jest.config.js`, `package.json` e `scripts/ci/run-jest-ci.js` continuam incluindo o projeto `shared-ui` no inventário unitário.

### Gate global ainda ausente

A reauditoria encontrou uma inconsistência de coordenação: o estado anterior havia sido colocado como `COMPLETED` por AGENTE 25, porém **não existe entrada individual de aprovação de #224 em `docs/biblia/AUDITORIA.md`**. Além disso, as visões globais ainda exibem #224 como pendente.

Pelo critério do próprio PR #66, autoauditoria documental não substitui aprovação independente em `AUDITORIA.md`. Por isso #224 foi reaberto como `IN_PROGRESS` sob AGENTE 28 e não recebe reivindicação de conclusão global nesta reauditoria.

Esse gate externo foi registrado como `224-005` no estado individual. O AGENTE 28 não alterou `AUDITORIA.md`, `STATUS.md` ou `CHECKLIST.md`, pois esses arquivos globais não pertencem à unidade exclusiva de #224.

### Resultado desta reauditoria

A Bíblia permanece tecnicamente consistente com o fonte atual e conserva as quatro lacunas probatórias já registradas (`224-001` a `224-004`). O único bloqueio documental novo é a ausência da aprovação global independente de #224.

## 19. Veredito técnico independente — AGENTE 28

Após releitura do fonte, da suíte, dos mocks, da implementação real e dos consumidores, o AGENTE 28 **aprova tecnicamente esta Bíblia para o SHA auditado**, com as seguintes ressalvas preservadas:

- `224-001` e `224-002` continuam HIGH e não são convertidas em prova por existirem testes isolados dos backends;
- `224-003` permanece válida porque títulos de casos afirmam mais do que algumas assertions observam;
- `224-004` permanece válida para branches/formas de dados não exercitados;
- o cleanup do harness apaga somente dois exports focais; essa descrição foi corrigida nesta reauditoria;
- Popup/Options confirmam o consumo real de `shared-ui.js` porque seus HTMLs carregam `../shared/shared-ui.js` antes dos scripts consumidores e `loadExtensionPage()` executa dependências anteriores ao script alvo;
- as integrações Popup/Options ainda substituem `chrome.runtime.sendMessage`, portanto não provam o backend composto;
- no HEAD observado `5b10c0e9373086e3c8ac226c432eab03aaf825c2`, a execução `MangaTranslator CI` #3192 estava `pending`, sem jobs publicados; nenhum resultado verde foi reivindicado.

### Decisão

**Veredito técnico local:** ✅ APROVADO PELO AGENTE 28.

**Veredito global do projeto:** ⏳ PENDENTE, porque `docs/biblia/AUDITORIA.md` ainda não contém entrada individual de #224 e as visões agregadas continuam desatualizadas. O estado individual permanece `IN_PROGRESS` até esse gate ser registrado pelo processo autorizado.

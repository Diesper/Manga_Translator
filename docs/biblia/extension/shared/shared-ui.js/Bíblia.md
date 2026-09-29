# Bíblia técnica — extension/shared/shared-ui.js

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE ATIVA  
> **SHA auditado:** `b284fb8eb0e8d30f34dc83642f07916d20012bf0`  
> **Agente responsável pela auditoria:** Agente L  
> **Tipo:** JavaScript — utilitários globais de UI para páginas internas MV3  
> **Linhas textuais:** **350**  
> **Posições documentais:** **351**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Identidade e papel arquitetural

`extension/shared/shared-ui.js` é a camada compartilhada carregada pelas páginas internas **Popup**, **Options** e **Reader**. Ela não é um módulo ES e não roda no service worker. O arquivo é executado no contexto de cada página e publica deliberadamente uma API em `globalThis` para os scripts carregados depois dele.

Os três consumidores diretos confirmados pelo repositório são:

- `extension/popup/popup.html` → `../shared/shared-ui.js` → `popup.js`;
- `extension/options/options.html` → `../shared/shared-ui.js` → `options.js`;
- `extension/reader/reader.html` → `../shared/shared-ui.js` → `reader.js`.

O gate `scripts/validation/verify-repository-structure.js` verifica estaticamente esses três contratos de carregamento. O helper de teste `tests/helpers/load-extension-page.js` lê os `<script src>` anteriores ao script alvo e executa essas dependências antes de carregar Popup/Options/Reader; portanto as integrações dessas páginas realmente executam este arquivo, e não uma reimplementação textual dele.

## 2. API pública e consumidores

| Símbolo global | Papel | Consumidores/evidência encontrados |
|---|---|---|
| `DEFAULT_HD_PROMPT` | prompt padrão para restauração de configuração | Popup e Options |
| `escapeHTML` | neutraliza caracteres de HTML em dados interpolados | Popup e Options |
| `normalizeBlockedImages` | migra/normaliza bloqueios por `cleanUrl` | Popup e Options |
| `getHostFromUrl` | deriva hostname com fallback | Popup e `loadRestoreEntries` |
| `smRequest` | bridge Promise para mensagens de storage manager | Reader, Popup, Options e este arquivo |
| `loadRestoreEntries` | une restore moderno e fallback legado | Popup e Options |
| `removeIndexFromStoredCollection` | remove página sem renumerar índices | usado internamente pela purga |
| `sendRuntimeMessageSafe` | bridge callback com erro explícito | usado internamente para GTC |
| `requestRedoConfirmation` | modal próprio de confirmação | usado internamente e testado diretamente |
| `deleteSavedTranslationForEntry` | orquestra purga da tradução salva | Popup e Options |

## 3. Dados, storage, mensagens e efeitos colaterais

O arquivo lê/escreve `chrome.storage.local`, conversa com o runtime e altera DOM. Os contratos relevantes são:

- `SM_LIST_RESTORE` → background → `storage-manager.listRestoreEntries`;
- `SM_DELETE_CLEAN_URL` → background → `storage-manager.deleteByCleanUrl`;
- `GTC_DELETE_BY_CLEAN_URL` → handler do GTC/IndexedDB;
- chaves legadas `${chapterId}_restoreMap`, `${chapterId}_restoreMeta`, `${chapterId}_images`, `${chapterId}_paths`;
- `autoRestoreBlockedImages`;
- `redoConfirmEnabled`.

A operação **Refazer** é best-effort e não transacional: primeiro tenta remover no storage manager novo; em seguida altera storage legado/bloqueios; depois invalida GTC. Uma falha tardia não reverte passos anteriores.

## 4. Lifecycle MV3

Este script pertence a páginas de extensão. Seu `redoRequestInFlight` é memória **por instância da página** e desaparece ao fechar/recarregar Popup/Options. Ele não substitui estado durável nem um lock global. Mensagens via `chrome.runtime.sendMessage` podem acordar o service worker, mas uma página fechada no meio da sequência pode interromper o restante da orquestração.

Isso produz um limite importante: a deduplicação atual protege contra duplo clique da mesma URL dentro da mesma instância, mas não contra operações iniciadas por duas páginas distintas da extensão.

## 5. Segurança, privacidade e trust boundaries

- `cleanUrl`, `sourceUrl`, host e títulos vêm de storage/mensagens e devem ser tratados como dados, não markup.
- `escapeHTML` protege os pontos em que Popup/Options ainda usam `innerHTML`; o teste de XSS inspecionado prova um vetor concreto com tag `img`.
- O modal de Refazer usa `textContent` para título/mensagem constantes e não injeta `entry`.
- `cleanUrl` é encaminhada para ações privilegiadas do background; a validação final de autorização/shape não deve depender só desta UI.
- `requestRedoConfirmation` adota **fail-open** sem `document.body`: a exclusão é autorizada sem confirmação. Isso precisa permanecer uma decisão consciente.
- O helper não registra nem envia conteúdo de imagem por si só, mas pode remover referências a Data URLs persistidas e invalidar caches.

## 6. Análise crítica — riscos e dívida técnica

1. **Race de dois modais para URLs diferentes:** a trava usa `cleanUrl`. Uma segunda operação para outra URL passa pela trava, encontra o overlay anterior e executa apenas `previous.remove()`. A Promise da primeira operação não recebe `finish(false)` nem `finish(true)`; ela pode permanecer pendente e sua URL continuar em `redoRequestInFlight`. Não há teste para esse cenário.
2. **Risco de sobre-exclusão sem `chapterId`:** quando `entry.chapterId` falta, `chapterIds` vira todos os capítulos. Dentro do loop, a remoção de `${chapterId}_images` e `${chapterId}_paths` pelo mesmo `entry.index` ocorre independentemente de o capítulo conter a `cleanUrl` alvo. Uma chamada externa à API global pode, portanto, zerar o mesmo índice em capítulos não relacionados.
3. **Migração parcial por capítulo:** `chaptersWithEntries` considera um capítulo coberto se existir **qualquer** entrada moderna. Se a migração estiver parcial, entradas restantes apenas no legado daquele mesmo capítulo não são lidas e podem desaparecer da UI.
4. **Resposta moderna malformada:** `resp.entries` truthy mas não-array chega a `.map` e lança. `chapterList` truthy mas não-array também rompe `.map`.
5. **Falhas de storage local não são checadas:** as Promises de `chrome.storage.local.get/set` não consultam `runtime.lastError`. Uma falha de persistência pode ser tratada como caminho normal.
6. **Resposta GTC `ok:false` é ignorada:** o código usa somente erro de transporte de `sendRuntimeMessageSafe`; o conteúdo de `gtcResult.response` não participa de `color/msg`. Assim, uma resposta negativa sem `lastError` pode resultar em feedback verde.
7. **Resultado booleano não significa atomicidade:** `true` significa que a rotina chegou ao final; pode coexistir com warning do storage novo. `false` por exceção pode ocorrer depois de parte dos dados já ter sido apagada.
8. **`ui.refresh` e `ui.showStatus` são callbacks não confiáveis:** `refresh` não é aguardado; se lançar, a rotina cai no catch após persistência. Se `showStatus` lançar dentro do próprio catch, essa nova exceção escapa.
9. **Índice ausente:** sem `entry.index`, restoreMap/meta e caches podem ser removidos enquanto `images/paths` legados permanecem, deixando bytes obsoletos.
10. **`String(str || '')`:** `escapeHTML(0)` e `escapeHTML(false)` viram string vazia. Os consumidores atuais passam texto, mas a API genérica tem essa semântica surpreendente.
11. **Namespace global:** `Object.assign(globalThis,...)` pode sobrescrever símbolo homônimo criado por outro script. O gate reduz o risco de ordem, mas não detecta colisão de nome.
12. **Drift do prompt:** Popup/Options ainda possuem fallback literal do prompt. Alterar somente `DEFAULT_HD_PROMPT` pode deixar cópias divergentes.

## 7. Evidência automatizada conferida

| Comportamento | Evidência realmente aberta | Classificação |
|---|---|---|
| Arquivo real carregado nos testes de UI | `load-extension-page.js` resolve scripts anteriores do HTML e dá `require` neles | ✅ PROVADO DIRETAMENTE |
| Modal próprio; `window.confirm` não usado | `tests/unit/shared-ui/redo-confirmation.test.js` carrega o arquivo real e exige diálogo próprio | ✅ PROVADO DIRETAMENTE |
| Cancelar não apaga | mesma suíte exige `false`, ausência de `SM_DELETE_CLEAN_URL` e remoção do overlay | ✅ PROVADO DIRETAMENTE |
| Escape e clique fora cancelam | mesma suíte dispara ambos os eventos e exige `false` | ✅ PROVADO DIRETAMENTE |
| “Não perguntar novamente” | checkbox persiste `redoConfirmEnabled:false`; segunda operação não abre modal | ✅ PROVADO DIRETAMENTE |
| Preferência já `false` | operação executa sem modal/native confirm | ✅ PROVADO DIRETAMENTE |
| Duplo clique na mesma `cleanUrl` | primeira Promise resolve `true`, segunda `false`, um único SM delete | ✅ PROVADO DIRETAMENTE |
| Entrada inválida | `null` e `{}` retornam `false` sem modal/mensagem destrutiva | ✅ PROVADO DIRETAMENTE |
| Purga de restoreMap/meta, images/paths, bloqueio e GTC | suíte unitária shared-ui + integrações reais Popup/Options | ✅ PROVADO DIRETAMENTE |
| Preservação de URL/índice vizinho em coleção objeto | testes mantêm `keepUrl` e índice 1 enquanto removem índice 0 | ✅ PROVADO DIRETAMENTE |
| `escapeHTML` impede criação de tag no caso testado | `resize-and-tabs.test.js` persiste título `<img ...>` e exige texto literal sem elemento `img` | ✅ PROVADO DIRETAMENTE |
| Ordem `shared-ui.js` → script da página | `verify-repository-structure.js` possui `pageContracts` para Popup/Options/Reader | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `smRequest` nominal em consumidores | Reader/Popup/Options passam pelo helper no carregamento real | 🟨 EXECUTADO INDIRETAMENTE |
| Handler real de `GTC_DELETE_BY_CLEAN_URL` | `tests/unit/gtc/indexeddb.test.js` testa o handler GTC real | 🟨 PROVA DA DEPENDÊNCIA; não prova ramos internos deste wrapper |
| Routing SM em smoke | `tests/smoke/smoke-06-sm-message-routing.js` reproduz/verifica contrato de roteamento | 🟨 EVIDÊNCIA COMPLEMENTAR/SIMULAÇÃO |

## 8. Lacunas de teste

| Lacuna | Por que os testes atuais não provam | Teste necessário | Regressão que pode escapar |
|---|---|---|---|
| `SM_LIST_RESTORE` com entradas modernas | cenários de Refazer inspecionados recebem resposta genérica sem `entries` | semear duas entradas modernas e assertar enriquecimento, ordem e ausência de leitura legada daquele capítulo | UI esconder/duplicar restores modernos |
| migração parcial no mesmo capítulo | não há mistura de uma entrada moderna + outra apenas legada no mesmo capítulo | cenário híbrido com duas URLs e migração parcial | entrada legada desaparecer da UI |
| normalização array→mapa | fixtures usam objeto | chamar caminho real com array legado e assertar mapa | bloqueios antigos deixarem de funcionar |
| URL inválida | casos usam URLs válidas | entrada inválida + fallback customizado | renderização inteira lançar ou host incorreto |
| `smRequest` com `lastError`/throw | mocks retornam callback normal | mockar ambos os modos de erro | Promise errada/hang/crash |
| `sendRuntimeMessageSafe` com erro | GTC mock responde normalmente | `runtime.lastError` e throw síncrono | feedback incorreto e erro não entregue |
| `skipConfirmation:true` | nenhum caso focal | chamar helper/Refazer com bypass explícito | modal aparecer quando não deveria |
| ausência de `document.body` | JSDOM sempre fornece body | executar helper sem body | exclusão fail-open mudar sem detecção |
| duas URLs confirmadas simultaneamente | só se testa duplo clique da mesma URL | iniciar A, iniciar B antes de resolver A e exigir ambas Promises settle | Promise A pendurada / mutex preso |
| forma array de images/paths | fixtures de purga usam objetos | semear arrays esparsos, remover e verificar `null` sem shift | renumeração ou hole tratado errado |
| `chapterId` ausente com vários capítulos | testes sem chapterId não semeiam múltiplos capítulos | dois capítulos com mesmo índice, cleanUrl somente em um | apagar página não relacionada |
| `entry.index` ausente | não há persistência legada relevante nesse caso | restore com URL sem índice | resíduos legados sobreviverem |
| `storage.local.set` falhando | mock normal | injetar `runtime.lastError` na persistência | rotina comunicar sucesso sem gravar |
| GTC retorna `{ok:false}` sem lastError | mocks retornam `ok:true` | responder negativamente e assertar warning | falso feedback verde |
| callbacks UI lançando/assíncronos | callbacks dos testes são `jest.fn` | refresh/showStatus que lançam/retornam Promise rejeitada | retorno falso pós-purga ou rejeição escapar |
| colisão global de exports | nenhum teste preenche símbolo homônimo | instalar sentinel em `globalThis` antes do require | sobrescrita silenciosa |
| igualdade do prompt/fallbacks | nenhum teste compara todos os literals | assertar única fonte ou igualdade dos fallbacks | prompt diferente entre telas |

## 9. Invariantes

1. `shared-ui.js` deve continuar carregado **antes** dos scripts de Popup, Options e Reader enquanto esses consumidores usarem globals.
2. `escapeHTML` não pode deixar `& < > ' "` sem neutralização nos contextos de `innerHTML` em que é usado.
3. Uma exclusão cancelada não pode emitir `SM_DELETE_CLEAN_URL`, `GTC_DELETE_BY_CLEAN_URL` nem alterar storage.
4. O mutex local da mesma `cleanUrl` precisa ser adquirido antes do primeiro `await` e liberado em todos os términos.
5. Remover uma página não pode deslocar índices das páginas seguintes.
6. `cleanUrl` é a identidade de remoção; qualquer ampliação para todos os capítulos deve provar que não remove `images/paths` de entradas não relacionadas.
7. A UI de Refazer deve limpar storage novo, compatibilidade legada, bloqueio e GTC de forma coerente ou comunicar claramente estado parcial.
8. Erro de transporte não deve ser confundido com confirmação positiva do backend.
9. A migração legado→novo não pode esconder entradas durante estado parcialmente migrado.
10. Dados persistidos usados em `innerHTML` precisam continuar escapados; preferir `textContent` quando não houver necessidade real de markup.
11. O modal deve resolver exatamente uma vez e remover seu listener de Escape.
12. Um overlay antigo não pode ser removido deixando a Promise que o controla sem resolução.
13. `redoConfirmEnabled === false` continua sendo opt-out explícito; chave ausente significa confirmação habilitada.
14. O fechamento/reabertura de Popup/Options não pode ser tratado como garantia de atomicidade, pois o Set em memória é efêmero.
15. Novos exports globais precisam ser adicionados conscientemente ao contrato e avaliados para colisões.
16. O blob documentado só pode ser considerado concluído se o SHA continuar igual a `b284fb8eb0e8d30f34dc83642f07916d20012bf0`.

## 10. Fonte integral

```javascript
'use strict';
// shared-ui.js — Funções utilitárias compartilhadas entre popup, options e reader
// Extraídas para eliminar duplicação de código

(function exposeSharedUi(scope) {
const DEFAULT_HD_PROMPT = "Objetivo primário: voce vai criar uma imagem , exata da imagem fornecida e traduzir ela pro português brasileiro . \nNão altere nenhum pixel fora das áreas de texto e Remova o texto original dos balões de fala, preenchendo o fundo com a cor correspondente. \nConverta os diálogos para PT-BR, mantendo a informalidade do contexto. Tipografia: Renderize o novo texto em caixa alta, fonte padrão de HQ (sans-serif), alinhamento centralizado.\nEfeitos Sonoros: Traduza e recrie as onomatopeias  mantendo as fontes estilizadas, cores, contornos e inclinação originais. lembre-se que todas as palavras devem sem traduzidas sem exceção";

function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
    }[tag]));
}

function normalizeBlockedImages(value) {
    if (Array.isArray(value)) {
        return value.reduce((acc, cleanUrl) => {
            if (cleanUrl) acc[cleanUrl] = { cleanUrl };
            return acc;
        }, {});
    }
    return value && typeof value === 'object' ? value : {};
}

function getHostFromUrl(urlStr, fallback = 'desconhecido') {
    try { return new URL(urlStr).hostname; } catch (_e) { return fallback; }
}

function smRequest(message) {
    return new Promise(resolve => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(response || null);
            });
        } catch (_e) { resolve(null); }
    });
}

async function loadRestoreEntries(chapterList) {
    const chapters = chapterList || [];
    const chaptersById = new Map(chapters.map(c => [c.id, c]));

    const resp = await smRequest({ action: 'SM_LIST_RESTORE' });
    const rows = (resp && resp.ok && resp.entries) || [];

    const entries = rows.map(r => {
        const chapter = chaptersById.get(r.chapterId) || {};
        return {
            chapterId:    r.chapterId,
            cleanUrl:     r.cleanUrl,
            assetId:      r.assetId,
            sourceUrl:    r.sourceUrl || r.cleanUrl,
            host:         r.host || getHostFromUrl(chapter.url || r.cleanUrl),
            chapterTitle: chapter.title || 'Capítulo sem título',
            index:        r.index,
            width:        r.width  || 0,
            height:       r.height || 0,
            updatedAt:    r.updatedAt || chapter.timestamp || 0,
        };
    });

    const chaptersWithEntries = new Set(entries.map(e => e.chapterId));
    const pending = chapters.filter(c => !chaptersWithEntries.has(c.id));
    if (pending.length > 0) {
        const keys = [];
        pending.forEach(c => keys.push(`${c.id}_restoreMap`, `${c.id}_restoreMeta`));
        const legacy = await new Promise(r => chrome.storage.local.get(keys, r));
        pending.forEach(chapter => {
            const restoreMap  = legacy[`${chapter.id}_restoreMap`]  || {};
            const restoreMeta = legacy[`${chapter.id}_restoreMeta`] || {};
            Object.keys(restoreMap).forEach(cleanUrl => {
                const meta = restoreMeta[cleanUrl] || {};
                entries.push({
                    chapterId:     chapter.id,
                    cleanUrl,
                    legacyDataUrl: restoreMap[cleanUrl],
                    sourceUrl:     meta.sourceUrl || cleanUrl,
                    host:          meta.host || getHostFromUrl(chapter.url || cleanUrl),
                    chapterTitle:  chapter.title || 'Capítulo sem título',
                    index:         meta.index,
                    width:         meta.width  || 0,
                    height:        meta.height || 0,
                    updatedAt:     meta.updatedAt || chapter.timestamp || 0,
                });
            });
        });
    }

    return entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function removeIndexFromStoredCollection(value, index) {
    if (index === undefined || index === null) return { changed: false, value };
    const key = String(index);

    if (Array.isArray(value)) {
        if (!Object.prototype.hasOwnProperty.call(value, index) || value[index] === null) {
            return { changed: false, value };
        }
        const next = value.slice();
        next[index] = null;
        return { changed: true, value: next };
    }

    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) {
        const next = { ...value };
        delete next[key];
        return { changed: true, value: next };
    }

    return { changed: false, value };
}

function sendRuntimeMessageSafe(message, callback) {
    try {
        chrome.runtime.sendMessage(message, (response) => {
            const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
            if (callback) callback(response, error);
        });
    } catch (error) {
        if (callback) callback(null, error.message);
    }
}

const redoRequestInFlight = new Set();

function requestRedoConfirmation(entry, ui = {}) {
    return new Promise((resolve) => {
        if (ui.skipConfirmation === true) {
            resolve(true);
            return;
        }

        chrome.storage.local.get(['redoConfirmEnabled'], (data) => {
            if (data.redoConfirmEnabled === false) {
                resolve(true);
                return;
            }

            // Não usamos window.confirm(): o Chromium pode bloqueá-lo quando o
            // usuário marca "Impedir que esta página crie caixas de diálogo
            // adicionais", tornando Cancelar e diálogo bloqueado indistinguíveis.
            if (typeof document === 'undefined' || !document.body) {
                resolve(true);
                return;
            }

            const previous = document.getElementById('mt-redo-confirm-overlay');
            if (previous) previous.remove();

            const overlay = document.createElement('div');
            overlay.id = 'mt-redo-confirm-overlay';
            overlay.setAttribute('role', 'presentation');
            overlay.style.cssText = [
                'position:fixed',
                'inset:0',
                'z-index:2147483647',
                'background:rgba(0,0,0,.72)',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'padding:20px',
                'box-sizing:border-box',
            ].join(';');

            const dialog = document.createElement('div');
            dialog.id = 'mt-redo-confirm-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', 'mt-redo-confirm-title');
            dialog.style.cssText = [
                'width:min(420px,100%)',
                'background:#191919',
                'border:1px solid #3a3a3a',
                'border-radius:10px',
                'box-shadow:0 18px 60px rgba(0,0,0,.65)',
                'padding:18px',
                'box-sizing:border-box',
                'font-family:sans-serif',
                'color:#eee',
            ].join(';');

            const title = document.createElement('div');
            title.id = 'mt-redo-confirm-title';
            title.textContent = 'Refazer tradução';
            title.style.cssText = 'font-size:16px;font-weight:800;margin-bottom:9px;color:#fff';

            const message = document.createElement('div');
            message.textContent = 'Apagar a tradução salva desta imagem? Depois disso, selecione/traduza a imagem novamente para gerar a versão correta.';
            message.style.cssText = 'font-size:13px;line-height:1.5;color:#bbb;margin-bottom:14px';

            const neverAskLabel = document.createElement('label');
            neverAskLabel.style.cssText = 'display:flex;align-items:center;gap:8px;color:#aaa;font-size:12px;cursor:pointer;margin-bottom:16px';
            const neverAsk = document.createElement('input');
            neverAsk.id = 'mt-redo-confirm-never-ask';
            neverAsk.type = 'checkbox';
            neverAsk.style.accentColor = '#FF4444';
            neverAskLabel.append(neverAsk, document.createTextNode('Não perguntar novamente'));

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';
            const cancel = document.createElement('button');
            cancel.id = 'mt-redo-confirm-cancel';
            cancel.type = 'button';
            cancel.textContent = 'Cancelar';
            cancel.style.cssText = 'border:1px solid #444;background:#252525;color:#ddd;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer';
            const confirmButton = document.createElement('button');
            confirmButton.id = 'mt-redo-confirm-accept';
            confirmButton.type = 'button';
            confirmButton.textContent = 'Apagar e refazer';
            confirmButton.style.cssText = 'border:0;background:#1a5fa8;color:#fff;border-radius:6px;padding:8px 12px;font-weight:800;cursor:pointer';

            actions.append(cancel, confirmButton);
            dialog.append(title, message, neverAskLabel, actions);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKeydown, true);
                overlay.remove();
                resolve(result);
            };
            const onKeydown = (event) => {
                if (event.key === 'Escape') finish(false);
            };

            cancel.addEventListener('click', () => finish(false));
            confirmButton.addEventListener('click', () => {
                if (!neverAsk.checked) {
                    finish(true);
                    return;
                }
                chrome.storage.local.set({ redoConfirmEnabled: false }, () => finish(true));
            });
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) finish(false);
            });
            document.addEventListener('keydown', onKeydown, true);
            setTimeout(() => {
                try { confirmButton.focus(); } catch (_error) {}
            }, 0);
        });
    });
}

async function deleteSavedTranslationForEntry(entry, ui = {}) {
    if (!entry || !entry.cleanUrl) return false;
    const requestKey = String(entry.cleanUrl);
    if (redoRequestInFlight.has(requestKey)) return false;
    redoRequestInFlight.add(requestKey);

    try {
        const confirmed = await requestRedoConfirmation(entry, ui);
        if (!confirmed) return false;

        const smResult = await smRequest({ action: 'SM_DELETE_CLEAN_URL', cleanUrl: entry.cleanUrl });

        const initData = await new Promise(r => chrome.storage.local.get(['chapterList', 'autoRestoreBlockedImages'], r));
        const chapterList = initData.chapterList || [];
        const chapterIds = entry.chapterId ? [entry.chapterId] : chapterList.map(c => c.id);

        const keysToFetch = [];
        chapterIds.forEach(id => keysToFetch.push(`${id}_restoreMap`, `${id}_restoreMeta`, `${id}_images`, `${id}_paths`));
        const data = keysToFetch.length
            ? await new Promise(r => chrome.storage.local.get(keysToFetch, r))
            : {};

        const updates = {};
        const blockedImages = normalizeBlockedImages(initData.autoRestoreBlockedImages);
        if (blockedImages[entry.cleanUrl]) {
            delete blockedImages[entry.cleanUrl];
            updates.autoRestoreBlockedImages = blockedImages;
        }

        chapterIds.forEach(chapterId => {
            const restoreMapKey = `${chapterId}_restoreMap`;
            const restoreMap = data[restoreMapKey] || {};
            if (Object.prototype.hasOwnProperty.call(restoreMap, entry.cleanUrl)) {
                const next = { ...restoreMap };
                delete next[entry.cleanUrl];
                updates[restoreMapKey] = next;
            }

            const restoreMetaKey = `${chapterId}_restoreMeta`;
            const restoreMeta = data[restoreMetaKey] || {};
            if (Object.prototype.hasOwnProperty.call(restoreMeta, entry.cleanUrl)) {
                const next = { ...restoreMeta };
                delete next[entry.cleanUrl];
                updates[restoreMetaKey] = next;
            }

            const imageResult = removeIndexFromStoredCollection(data[`${chapterId}_images`], entry.index);
            if (imageResult.changed) updates[`${chapterId}_images`] = imageResult.value;

            const pathResult = removeIndexFromStoredCollection(data[`${chapterId}_paths`], entry.index);
            if (pathResult.changed) updates[`${chapterId}_paths`] = pathResult.value;
        });

        if (Object.keys(updates).length > 0) {
            await new Promise(r => chrome.storage.local.set(updates, r));
        }

        const gtcResult = await new Promise(resolve => {
            sendRuntimeMessageSafe({
                action: 'GTC_DELETE_BY_CLEAN_URL',
                cleanUrl: entry.cleanUrl,
            }, (response, error) => resolve({ response, error }));
        });

        if (typeof ui.refresh === 'function') ui.refresh();

        const smOk = smResult && smResult.ok;
        const msg = gtcResult.error
            ? 'Tradução local apagada. Cache global não respondeu.'
            : (smOk
                ? 'Tradução apagada. Agora você pode refazer essa imagem.'
                : 'Tradução apagada do storage local. Armazenamento novo não respondeu.');
        const color = gtcResult.error || !smOk ? '#FF9800' : '#4CAF50';
        if (typeof ui.showStatus === 'function') ui.showStatus(msg, color);
        return true;
    } catch (_error) {
        if (typeof ui.showStatus === 'function') {
            ui.showStatus('Falha ao apagar a tradução salva.', '#FF9800');
        }
        return false;
    } finally {
        redoRequestInFlight.delete(requestKey);
    }
}

Object.assign(scope, {
    DEFAULT_HD_PROMPT,
    escapeHTML,
    normalizeBlockedImages,
    getHostFromUrl,
    smRequest,
    loadRestoreEntries,
    removeIndexFromStoredCollection,
    sendRuntimeMessageSafe,
    requestRedoConfirmation,
    deleteSavedTranslationForEntry,
});
})(globalThis);
```

## 11. Cobertura linha a linha

### Linha 1 — U00: bootstrap global e encapsulamento

**Fonte:** ``'use strict';``

**O que faz:** Ativa o modo estrito para este script, tornando erros como atribuições acidentais a identificadores não declarados observáveis em vez de criar globais implícitos.

**Como faz:** O script entra em strict mode, registra a intenção arquitetural nos comentários e abre uma IIFE que recebe `globalThis` como escopo de exportação.

**Por que foi implementado dessa forma:** Popup, Options e Reader são páginas clássicas da extensão, não módulos ES; a IIFE evita variáveis intermediárias globais enquanto permite publicar apenas a API compartilhada no final.

**Por que uma implementação ingênua seria pior:** Declarar todos os helpers soltos no escopo global aumentaria colisões entre scripts carregados pela mesma página e dificultaria distinguir API pública de detalhes internos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: o gate estrutural exige `shared-ui.js` antes de `popup.js`, `options.js` e `reader.js`; os testes de integração usam o HTML real e carregam dependências anteriores ao script-alvo.

### Linha 2 — U00: bootstrap global e encapsulamento

**Fonte:** ``// shared-ui.js — Funções utilitárias compartilhadas entre popup, options e reader``

**O que faz:** Documenta que o arquivo é a camada de utilitários compartilhada por Popup, Options e Reader.

**Como faz:** O script entra em strict mode, registra a intenção arquitetural nos comentários e abre uma IIFE que recebe `globalThis` como escopo de exportação.

**Por que foi implementado dessa forma:** Popup, Options e Reader são páginas clássicas da extensão, não módulos ES; a IIFE evita variáveis intermediárias globais enquanto permite publicar apenas a API compartilhada no final.

**Por que uma implementação ingênua seria pior:** Declarar todos os helpers soltos no escopo global aumentaria colisões entre scripts carregados pela mesma página e dificultaria distinguir API pública de detalhes internos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: o gate estrutural exige `shared-ui.js` antes de `popup.js`, `options.js` e `reader.js`; os testes de integração usam o HTML real e carregam dependências anteriores ao script-alvo.

### Linha 3 — U00: bootstrap global e encapsulamento

**Fonte:** ``// Extraídas para eliminar duplicação de código``

**O que faz:** Registra a motivação histórica da extração: eliminar implementações duplicadas entre as páginas internas.

**Como faz:** O script entra em strict mode, registra a intenção arquitetural nos comentários e abre uma IIFE que recebe `globalThis` como escopo de exportação.

**Por que foi implementado dessa forma:** Popup, Options e Reader são páginas clássicas da extensão, não módulos ES; a IIFE evita variáveis intermediárias globais enquanto permite publicar apenas a API compartilhada no final.

**Por que uma implementação ingênua seria pior:** Declarar todos os helpers soltos no escopo global aumentaria colisões entre scripts carregados pela mesma página e dificultaria distinguir API pública de detalhes internos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: o gate estrutural exige `shared-ui.js` antes de `popup.js`, `options.js` e `reader.js`; os testes de integração usam o HTML real e carregam dependências anteriores ao script-alvo.

### Linha 4 — U00: bootstrap global e encapsulamento

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de bootstrap global e encapsulamento; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** O script entra em strict mode, registra a intenção arquitetural nos comentários e abre uma IIFE que recebe `globalThis` como escopo de exportação.

**Por que foi implementado dessa forma:** Popup, Options e Reader são páginas clássicas da extensão, não módulos ES; a IIFE evita variáveis intermediárias globais enquanto permite publicar apenas a API compartilhada no final.

**Por que uma implementação ingênua seria pior:** Declarar todos os helpers soltos no escopo global aumentaria colisões entre scripts carregados pela mesma página e dificultaria distinguir API pública de detalhes internos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: o gate estrutural exige `shared-ui.js` antes de `popup.js`, `options.js` e `reader.js`; os testes de integração usam o HTML real e carregam dependências anteriores ao script-alvo.

### Linha 5 — U00: bootstrap global e encapsulamento

**Fonte:** ``(function exposeSharedUi(scope) {``

**O que faz:** Abre a IIFE `exposeSharedUi` e recebe o objeto-alvo onde a API pública será instalada.

**Como faz:** O script entra em strict mode, registra a intenção arquitetural nos comentários e abre uma IIFE que recebe `globalThis` como escopo de exportação.

**Por que foi implementado dessa forma:** Popup, Options e Reader são páginas clássicas da extensão, não módulos ES; a IIFE evita variáveis intermediárias globais enquanto permite publicar apenas a API compartilhada no final.

**Por que uma implementação ingênua seria pior:** Declarar todos os helpers soltos no escopo global aumentaria colisões entre scripts carregados pela mesma página e dificultaria distinguir API pública de detalhes internos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: o gate estrutural exige `shared-ui.js` antes de `popup.js`, `options.js` e `reader.js`; os testes de integração usam o HTML real e carregam dependências anteriores ao script-alvo.

### Linha 6 — U01: prompt padrão compartilhado

**Fonte:** ``const DEFAULT_HD_PROMPT = "Objetivo primário: voce vai criar uma imagem , exata da imagem fornecida e traduzir ela pro português brasileiro . \nNão altere nenhum pixel fora das áreas de texto e Remova o texto original dos balões de fala, preenchendo o fundo com a cor correspondente. \nConverta os diálogos para PT-BR, mantendo a informalidade do contexto. Tipografia: Renderize o novo texto em caixa alta, fonte padrão de HQ (sans-serif), alinhamento centralizado.\nEfeitos Sonoros: Traduza e recrie as onomatopeias  mantendo as fontes estilizadas, cores, contornos e inclinação originais. lembre-se que todas as palavras devem sem traduzidas sem exceção";``

**O que faz:** Declara o prompt padrão de tradução de imagem, incluindo preservação de pixels, tradução PT-BR, tipografia e recriação de onomatopeias.

**Como faz:** A constante mantém em um único ponto o texto padrão usado pelas interfaces para restaurar a instrução de tradução de imagem.

**Por que foi implementado dessa forma:** Popup e Options precisam partir do mesmo prompt para não criar defaults funcionais diferentes conforme a tela usada.

**Por que uma implementação ingênua seria pior:** Duplicar o texto em cada UI facilita drift; de fato os consumidores ainda possuem fallback literal, portanto esta constante reduz, mas não elimina, esse risco.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: há consumidores de `DEFAULT_HD_PROMPT`, mas não foi localizada assertion focal que compare integralmente este literal nem detecte drift com os fallbacks duplicados.

### Linha 7 — U01: prompt padrão compartilhado

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de prompt padrão compartilhado; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** A constante mantém em um único ponto o texto padrão usado pelas interfaces para restaurar a instrução de tradução de imagem.

**Por que foi implementado dessa forma:** Popup e Options precisam partir do mesmo prompt para não criar defaults funcionais diferentes conforme a tela usada.

**Por que uma implementação ingênua seria pior:** Duplicar o texto em cada UI facilita drift; de fato os consumidores ainda possuem fallback literal, portanto esta constante reduz, mas não elimina, esse risco.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: há consumidores de `DEFAULT_HD_PROMPT`, mas não foi localizada assertion focal que compare integralmente este literal nem detecte drift com os fallbacks duplicados.

### Linha 8 — U02: escapeHTML

**Fonte:** ``function escapeHTML(str) {``

**O que faz:** Declara o helper que neutraliza caracteres de HTML antes de interpolação em markup.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 9 — U02: escapeHTML

**Fonte:** ``    return String(str || '').replace(/[&<>'"]/g, tag => ({``

**O que faz:** Normaliza a entrada para string e inicia substituição global de `&`, `<`, `>`, apóstrofo e aspas.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 10 — U02: escapeHTML

**Fonte:** ``        '&': '&amp;',``

**O que faz:** Mapeia ampersand para `&amp;`, evitando que ele inicie outra entidade HTML.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 11 — U02: escapeHTML

**Fonte:** ``        '<': '&lt;',``

**O que faz:** Mapeia `<` para `&lt;`, impedindo abertura de tag.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 12 — U02: escapeHTML

**Fonte:** ``        '>': '&gt;',``

**O que faz:** Mapeia `>` para `&gt;`, impedindo fechamento sintático de tag.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 13 — U02: escapeHTML

**Fonte:** ``        "'": '&#39;',``

**O que faz:** Mapeia apóstrofo para `&#39;`, protegendo contextos de atributo delimitados por aspas simples.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 14 — U02: escapeHTML

**Fonte:** ``        '"': '&quot;',``

**O que faz:** Mapeia aspas duplas para `&quot;`, protegendo contextos de atributo delimitados por aspas duplas.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 15 — U02: escapeHTML

**Fonte:** ``    }[tag]));``

**O que faz:** Seleciona a entidade correspondente ao caractere encontrado e conclui o callback de `replace`.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 16 — U02: escapeHTML

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de escapeHTML, delimitando seu escopo antes da próxima etapa.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 17 — U02: escapeHTML

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de escapeHTML; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Converte a entrada para string e substitui cinco caracteres com significado em HTML por entidades antes de a UI interpolar dados persistidos em `innerHTML`.

**Por que foi implementado dessa forma:** Popup e Options exibem host, título e URL provenientes de storage; escapar antes da interpolação reduz a superfície de injeção de markup nesses pontos.

**Por que uma implementação ingênua seria pior:** Interpolar diretamente títulos/URLs persistidos em `innerHTML` permitiria transformar dados em elementos/atributos ativos em uma página privilegiada da extensão.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o vetor testado: `resize-and-tabs.test.js` injeta `<img src=x onerror=alert(1)>` como título e exige texto literal, sem elemento `img`. ⚠️ Não há assertions focais para cada uma das cinco entidades nem para `0`/`false`.

### Linha 18 — U03: normalização de imagens bloqueadas

**Fonte:** ``function normalizeBlockedImages(value) {``

**O que faz:** Declara o normalizador da persistência `autoRestoreBlockedImages`.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 19 — U03: normalização de imagens bloqueadas

**Fonte:** ``    if (Array.isArray(value)) {``

**O que faz:** Detecta o formato legado quando a coleção persistida ainda é um array.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 20 — U03: normalização de imagens bloqueadas

**Fonte:** ``        return value.reduce((acc, cleanUrl) => {``

**O que faz:** Inicia redução do array legado para um objeto indexado por URL limpa.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 21 — U03: normalização de imagens bloqueadas

**Fonte:** ``            if (cleanUrl) acc[cleanUrl] = { cleanUrl };``

**O que faz:** Ignora entradas vazias e, para cada URL válida, cria `acc[cleanUrl] = { cleanUrl }`.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 22 — U03: normalização de imagens bloqueadas

**Fonte:** ``            return acc;``

**O que faz:** Executa a etapa mostrada por `return acc;` dentro de normalização de imagens bloqueadas, mantendo o fluxo e o estado desse bloco.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 23 — U03: normalização de imagens bloqueadas

**Fonte:** ``        }, {});``

**O que faz:** Inicializa o acumulador da redução como objeto vazio.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 24 — U03: normalização de imagens bloqueadas

**Fonte:** ``    }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de normalização de imagens bloqueadas, delimitando seu escopo antes da próxima etapa.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 25 — U03: normalização de imagens bloqueadas

**Fonte:** ``    return value && typeof value === 'object' ? value : {};``

**O que faz:** Mantém objetos existentes ou usa `{}` para `null`, primitivos e ausência de valor.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 26 — U03: normalização de imagens bloqueadas

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de normalização de imagens bloqueadas, delimitando seu escopo antes da próxima etapa.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 27 — U03: normalização de imagens bloqueadas

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de normalização de imagens bloqueadas; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Aceita o formato legado em array e o converte em mapa indexado por `cleanUrl`; preserva objetos já normalizados e usa objeto vazio para valores ausentes/não-objeto.

**Por que foi implementado dessa forma:** Os consumidores consultam bloqueio por chave, operação O(1), mas instalações antigas podem ainda armazenar a coleção como lista.

**Por que uma implementação ingênua seria pior:** Assumir apenas o formato novo quebraria migração silenciosamente; manter arrays obrigaria buscas lineares e contratos diferentes em popup/options.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: os fluxos reais de Refazer usam a forma objeto. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a migração array→mapa e para objetos não-planos.

### Linha 28 — U04: extração defensiva de hostname

**Fonte:** ``function getHostFromUrl(urlStr, fallback = 'desconhecido') {``

**O que faz:** Declara extração de hostname com fallback padrão `desconhecido`.

**Como faz:** Usa o parser nativo `URL` e captura exceções para devolver um fallback estável quando a string não representa URL válida.

**Por que foi implementado dessa forma:** Agrupamento visual por host não deve derrubar toda a renderização por causa de metadata antiga ou corrompida.

**Por que uma implementação ingênua seria pior:** Regex manual para hostname trataria esquemas, portas, IPv6 e encoding de maneira incompleta; propagar a exceção interromperia a tela.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em popup/options com URLs válidas. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para URL inválida e fallback customizado.

### Linha 29 — U04: extração defensiva de hostname

**Fonte:** ``    try { return new URL(urlStr).hostname; } catch (_e) { return fallback; }``

**O que faz:** Tenta usar `new URL(...).hostname`; qualquer erro de parsing é convertido no fallback.

**Como faz:** Usa o parser nativo `URL` e captura exceções para devolver um fallback estável quando a string não representa URL válida.

**Por que foi implementado dessa forma:** Agrupamento visual por host não deve derrubar toda a renderização por causa de metadata antiga ou corrompida.

**Por que uma implementação ingênua seria pior:** Regex manual para hostname trataria esquemas, portas, IPv6 e encoding de maneira incompleta; propagar a exceção interromperia a tela.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em popup/options com URLs válidas. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para URL inválida e fallback customizado.

### Linha 30 — U04: extração defensiva de hostname

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de extração defensiva de hostname, delimitando seu escopo antes da próxima etapa.

**Como faz:** Usa o parser nativo `URL` e captura exceções para devolver um fallback estável quando a string não representa URL válida.

**Por que foi implementado dessa forma:** Agrupamento visual por host não deve derrubar toda a renderização por causa de metadata antiga ou corrompida.

**Por que uma implementação ingênua seria pior:** Regex manual para hostname trataria esquemas, portas, IPv6 e encoding de maneira incompleta; propagar a exceção interromperia a tela.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em popup/options com URLs válidas. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para URL inválida e fallback customizado.

### Linha 31 — U04: extração defensiva de hostname

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de extração defensiva de hostname; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Usa o parser nativo `URL` e captura exceções para devolver um fallback estável quando a string não representa URL válida.

**Por que foi implementado dessa forma:** Agrupamento visual por host não deve derrubar toda a renderização por causa de metadata antiga ou corrompida.

**Por que uma implementação ingênua seria pior:** Regex manual para hostname trataria esquemas, portas, IPv6 e encoding de maneira incompleta; propagar a exceção interromperia a tela.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em popup/options com URLs válidas. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para URL inválida e fallback customizado.

### Linha 32 — U05: bridge Promise para chrome.runtime

**Fonte:** ``function smRequest(message) {``

**O que faz:** Declara a adaptação Promise das mensagens destinadas ao service worker/background.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 33 — U05: bridge Promise para chrome.runtime

**Fonte:** ``    return new Promise(resolve => {``

**O que faz:** Cria Promise resolvida manualmente para encapsular a API baseada em callback.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 34 — U05: bridge Promise para chrome.runtime

**Fonte:** ``        try {``

**O que faz:** Executa a etapa mostrada por `try {` dentro de bridge Promise para chrome.runtime, mantendo o fluxo e o estado desse bloco.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 35 — U05: bridge Promise para chrome.runtime

**Fonte:** ``            chrome.runtime.sendMessage(message, (response) => {``

**O que faz:** Envia a mensagem ao runtime e recebe a resposta assíncrona no callback.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 36 — U05: bridge Promise para chrome.runtime

**Fonte:** ``                if (chrome.runtime.lastError) resolve(null);``

**O que faz:** Se Chrome sinaliza `runtime.lastError`, resolve `null` para o chamador tratar como ausência de resposta.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 37 — U05: bridge Promise para chrome.runtime

**Fonte:** ``                else resolve(response || null);``

**O que faz:** Sem erro de runtime, resolve a resposta; valores falsy são normalizados para `null`.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 38 — U05: bridge Promise para chrome.runtime

**Fonte:** ``            });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de bridge Promise para chrome.runtime, delimitando seu escopo antes da próxima etapa.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 39 — U05: bridge Promise para chrome.runtime

**Fonte:** ``        } catch (_e) { resolve(null); }``

**O que faz:** Captura erro síncrono ao invocar a API e também resolve `null`, preservando contrato não-rejeitável.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 40 — U05: bridge Promise para chrome.runtime

**Fonte:** ``    });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de bridge Promise para chrome.runtime, delimitando seu escopo antes da próxima etapa.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 41 — U05: bridge Promise para chrome.runtime

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de bridge Promise para chrome.runtime, delimitando seu escopo antes da próxima etapa.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 42 — U05: bridge Promise para chrome.runtime

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de bridge Promise para chrome.runtime; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Adapta `chrome.runtime.sendMessage` baseado em callback para uma Promise que resolve com resposta ou `null`; `runtime.lastError` e exceção síncrona são convertidos em falha recuperável.

**Por que foi implementado dessa forma:** As UIs podem usar `await` e aplicar fallback sem espalhar callbacks e `try/catch` por cada consumidor.

**Por que uma implementação ingênua seria pior:** Rejeitar sem tratamento em cada chamada faria falhas transitórias do service worker derrubarem renderização; ignorar `lastError` confundiria ausência de resposta com resposta válida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por Reader/Popup/Options no caminho nominal. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e exceção síncrona do `sendMessage`.

### Linha 43 — U06: fusão do restore novo com fallback legado

**Fonte:** ``async function loadRestoreEntries(chapterList) {``

**O que faz:** Declara a montagem assíncrona da lista de traduções restauráveis mostrada pelas UIs.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 44 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    const chapters = chapterList || [];``

**O que faz:** Normaliza `chapterList` ausente para array vazio.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 45 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    const chaptersById = new Map(chapters.map(c => [c.id, c]));``

**O que faz:** Cria índice `chapterId → chapter` para enriquecer entradas sem busca linear repetida.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 46 — U06: fusão do restore novo com fallback legado

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de fusão do restore novo com fallback legado; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 47 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    const resp = await smRequest({ action: 'SM_LIST_RESTORE' });``

**O que faz:** Solicita ao storage manager a lista de restores modernos por `SM_LIST_RESTORE`.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 48 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    const rows = (resp && resp.ok && resp.entries) || [];``

**O que faz:** Aceita `resp.entries` somente quando existe resposta truthy marcada `ok`; caso contrário usa lista vazia.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 49 — U06: fusão do restore novo com fallback legado

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de fusão do restore novo com fallback legado; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 50 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    const entries = rows.map(r => {``

**O que faz:** Transforma cada restore moderno em um registro de UI enriquecido.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 51 — U06: fusão do restore novo com fallback legado

**Fonte:** ``        const chapter = chaptersById.get(r.chapterId) || {};``

**O que faz:** Localiza metadata do capítulo pelo `chapterId`, com objeto vazio se não houver correspondência.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 52 — U06: fusão do restore novo com fallback legado

**Fonte:** ``        return {``

**O que faz:** Inicia o objeto retornado pelo bloco de fusão do restore novo com fallback legado.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 53 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            chapterId:    r.chapterId,``

**O que faz:** Preserva o `chapterId` que liga a imagem ao capítulo persistido.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 54 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            cleanUrl:     r.cleanUrl,``

**O que faz:** Preserva `cleanUrl`, identidade usada por bloqueio, remoção e cache.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 55 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            assetId:      r.assetId,``

**O que faz:** Preserva `assetId`, necessário para buscar o asset moderno quando a URL original falhar.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 56 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            sourceUrl:    r.sourceUrl || r.cleanUrl,``

**O que faz:** Prefere `sourceUrl` registrada; usa `cleanUrl` como fallback de preview/origem.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 57 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            host:         r.host || getHostFromUrl(chapter.url || r.cleanUrl),``

**O que faz:** Prefere host persistido; caso falte, deriva do URL do capítulo ou da própria imagem.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 58 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            chapterTitle: chapter.title || 'Capítulo sem título',``

**O que faz:** Usa o título atual do capítulo ou um rótulo neutro quando metadata não está disponível.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 59 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            index:        r.index,``

**O que faz:** Preserva o índice lógico da página dentro do capítulo.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 60 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            width:        r.width  || 0,``

**O que faz:** Normaliza largura ausente/falsy para zero para simplificar renderização.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 61 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            height:       r.height || 0,``

**O que faz:** Normaliza altura ausente/falsy para zero.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 62 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            updatedAt:    r.updatedAt || chapter.timestamp || 0,``

**O que faz:** Prefere timestamp da entrada; cai para timestamp do capítulo e finalmente zero.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 63 — U06: fusão do restore novo com fallback legado

**Fonte:** ``        };``

**O que faz:** Fecha a estrutura sintática aberta no bloco de fusão do restore novo com fallback legado, delimitando seu escopo antes da próxima etapa.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 64 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de fusão do restore novo com fallback legado, delimitando seu escopo antes da próxima etapa.

**Como faz:** O campo é calculado durante o `rows.map`, combinando dados da entrada moderna e metadata do capítulo sem mutar nenhum dos dois.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para resposta moderna preenchida de `SM_LIST_RESTORE`; os testes reais de Refazer exercitam predominantemente o fallback legado.

### Linha 65 — U06: fusão do restore novo com fallback legado

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de fusão do restore novo com fallback legado; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 66 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    const chaptersWithEntries = new Set(entries.map(e => e.chapterId));``

**O que faz:** Monta o conjunto de capítulos que já possuem pelo menos uma entrada no backend novo.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 67 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    const pending = chapters.filter(c => !chaptersWithEntries.has(c.id));``

**O que faz:** Seleciona capítulos sem nenhuma entrada moderna para consultar exclusivamente o fallback legado.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 68 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    if (pending.length > 0) {``

**O que faz:** Evita acesso a storage legado quando não há capítulos pendentes.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 69 — U06: fusão do restore novo com fallback legado

**Fonte:** ``        const keys = [];``

**O que faz:** Inicializa a lista de chaves que será lida em uma única chamada de storage.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 70 — U06: fusão do restore novo com fallback legado

**Fonte:** ``        pending.forEach(c => keys.push(\`${c.id}_restoreMap\`, \`${c.id}_restoreMeta\`));``

**O que faz:** Para cada capítulo pendente, inclui as chaves de mapa de restore e metadata no batch de leitura.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 71 — U06: fusão do restore novo com fallback legado

**Fonte:** ``        const legacy = await new Promise(r => chrome.storage.local.get(keys, r));``

**O que faz:** Lê todas as chaves legadas de uma vez via `chrome.storage.local.get` e aguarda o callback.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 72 — U06: fusão do restore novo com fallback legado

**Fonte:** ``        pending.forEach(chapter => {``

**O que faz:** Executa a etapa mostrada por `pending.forEach(chapter => {` dentro de fusão do restore novo com fallback legado, mantendo o fluxo e o estado desse bloco.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 73 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            const restoreMap  = legacy[\`${chapter.id}_restoreMap\`]  || {};``

**O que faz:** Recupera o mapa legado de Data URLs ou usa objeto vazio.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 74 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            const restoreMeta = legacy[\`${chapter.id}_restoreMeta\`] || {};``

**O que faz:** Recupera metadata legada paralela ou usa objeto vazio.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 75 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            Object.keys(restoreMap).forEach(cleanUrl => {``

**O que faz:** Itera somente URLs que realmente possuem tradução no mapa legado.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 76 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                const meta = restoreMeta[cleanUrl] || {};``

**O que faz:** Obtém metadata da URL; ausência de registro não impede a entrada de ser exibida.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 77 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                entries.push({``

**O que faz:** Executa a etapa mostrada por `entries.push({` dentro de fusão do restore novo com fallback legado, mantendo o fluxo e o estado desse bloco.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 78 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    chapterId:     chapter.id,``

**O que faz:** Define o campo `chapterId` no objeto construído em fusão do restore novo com fallback legado.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 79 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    cleanUrl,``

**O que faz:** Executa a etapa mostrada por `cleanUrl,` dentro de fusão do restore novo com fallback legado, mantendo o fluxo e o estado desse bloco.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 80 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    legacyDataUrl: restoreMap[cleanUrl],``

**O que faz:** Carrega a Data URL legada diretamente no registro para permitir preview sem backend novo.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 81 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    sourceUrl:     meta.sourceUrl || cleanUrl,``

**O que faz:** Define o campo `sourceUrl` no objeto construído em fusão do restore novo com fallback legado.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 82 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    host:          meta.host || getHostFromUrl(chapter.url || cleanUrl),``

**O que faz:** Prefere host legado e deriva um hostname apenas quando ele falta.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 83 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    chapterTitle:  chapter.title || 'Capítulo sem título',``

**O que faz:** Define o campo `chapterTitle` no objeto construído em fusão do restore novo com fallback legado.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 84 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    index:         meta.index,``

**O que faz:** Define o campo `index` no objeto construído em fusão do restore novo com fallback legado.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 85 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    width:         meta.width  || 0,``

**O que faz:** Define o campo `width` no objeto construído em fusão do restore novo com fallback legado.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 86 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    height:        meta.height || 0,``

**O que faz:** Define o campo `height` no objeto construído em fusão do restore novo com fallback legado.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 87 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                    updatedAt:     meta.updatedAt || chapter.timestamp || 0,``

**O que faz:** Ordena temporalmente usando metadata legada, depois timestamp do capítulo, depois zero.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 88 — U06: fusão do restore novo com fallback legado

**Fonte:** ``                });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de fusão do restore novo com fallback legado, delimitando seu escopo antes da próxima etapa.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 89 — U06: fusão do restore novo com fallback legado

**Fonte:** ``            });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de fusão do restore novo com fallback legado, delimitando seu escopo antes da próxima etapa.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 90 — U06: fusão do restore novo com fallback legado

**Fonte:** ``        });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de fusão do restore novo com fallback legado, delimitando seu escopo antes da próxima etapa.

**Como faz:** O campo é montado durante a expansão do formato legado e anexado a `entries`, que será ordenado junto das entradas modernas.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 91 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de fusão do restore novo com fallback legado, delimitando seu escopo antes da próxima etapa.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 92 — U06: fusão do restore novo com fallback legado

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de fusão do restore novo com fallback legado; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 93 — U06: fusão do restore novo com fallback legado

**Fonte:** ``    return entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));``

**O que faz:** Ordena a lista combinada do mais recentemente atualizado para o mais antigo.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no cenário legado pelos testes reais de Popup/Options; eles semeiam restoreMap/restoreMeta e observam a entrada/limpeza resultante.

### Linha 94 — U06: fusão do restore novo com fallback legado

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de fusão do restore novo com fallback legado, delimitando seu escopo antes da próxima etapa.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 95 — U06: fusão do restore novo com fallback legado

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de fusão do restore novo com fallback legado; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Consulta `SM_LIST_RESTORE`, enriquece linhas novas com metadata de `chapterList`, busca `restoreMap/restoreMeta` apenas para capítulos sem qualquer entrada nova e ordena tudo por atualização decrescente.

**Por que foi implementado dessa forma:** A tela precisa apresentar uma visão única durante a migração entre IndexedDB/storage-manager e o formato legado de `chrome.storage.local`, evitando ler blobs legados quando o capítulo já aparece no storage novo.

**Por que uma implementação ingênua seria pior:** Ler somente o backend novo esconderia traduções pré-migração; ler sempre ambos poderia duplicar imagens, aumentar custo de storage e produzir escolhas inconsistentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o fallback legado nos testes reais de Popup/Options que carregam `shared-ui.js`. ⚠️ O ramo com `SM_LIST_RESTORE.entries` preenchido e a mistura de migração parcial do mesmo capítulo não possuem assertion focal.

### Linha 96 — U07: remoção preservando identidade de índice

**Fonte:** ``function removeIndexFromStoredCollection(value, index) {``

**O que faz:** Declara remoção de uma posição de coleção sem renumerar as demais páginas.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para coleções objeto pelos testes de Refazer de shared-ui/popup/options. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para array, hole, `null` e índice ausente.

### Linha 97 — U07: remoção preservando identidade de índice

**Fonte:** ``    if (index === undefined || index === null) return { changed: false, value };``

**O que faz:** Sem índice identificável, informa que nada mudou e devolve a referência original.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para coleções objeto pelos testes de Refazer de shared-ui/popup/options. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para array, hole, `null` e índice ausente.

### Linha 98 — U07: remoção preservando identidade de índice

**Fonte:** ``    const key = String(index);``

**O que faz:** Converte o índice para string para consultar de modo uniforme chaves de objetos.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para coleções objeto pelos testes de Refazer de shared-ui/popup/options. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para array, hole, `null` e índice ausente.

### Linha 99 — U07: remoção preservando identidade de índice

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de remoção preservando identidade de índice; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para coleções objeto pelos testes de Refazer de shared-ui/popup/options. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para array, hole, `null` e índice ausente.

### Linha 100 — U07: remoção preservando identidade de índice

**Fonte:** ``    if (Array.isArray(value)) {``

**O que faz:** Seleciona tratamento específico quando a coleção persistida é array.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a forma array; as assertions de Refazer inspecionadas semeiam coleções objeto.

### Linha 101 — U07: remoção preservando identidade de índice

**Fonte:** ``        if (!Object.prototype.hasOwnProperty.call(value, index) || value[index] === null) {``

**O que faz:** Se a posição não existe como propriedade própria ou já é `null`, evita escrever storage inutilmente.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a forma array; as assertions de Refazer inspecionadas semeiam coleções objeto.

### Linha 102 — U07: remoção preservando identidade de índice

**Fonte:** ``            return { changed: false, value };``

**O que faz:** Executa a etapa mostrada por `return { changed: false, value };` dentro de remoção preservando identidade de índice, mantendo o fluxo e o estado desse bloco.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a forma array; as assertions de Refazer inspecionadas semeiam coleções objeto.

### Linha 103 — U07: remoção preservando identidade de índice

**Fonte:** ``        }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de remoção preservando identidade de índice, delimitando seu escopo antes da próxima etapa.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a forma array; as assertions de Refazer inspecionadas semeiam coleções objeto.

### Linha 104 — U07: remoção preservando identidade de índice

**Fonte:** ``        const next = value.slice();``

**O que faz:** Clona o array para não mutar o valor lido do storage.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a forma array; as assertions de Refazer inspecionadas semeiam coleções objeto.

### Linha 105 — U07: remoção preservando identidade de índice

**Fonte:** ``        next[index] = null;``

**O que faz:** Marca a posição removida com `null`, preservando os números dos índices seguintes.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a forma array; as assertions de Refazer inspecionadas semeiam coleções objeto.

### Linha 106 — U07: remoção preservando identidade de índice

**Fonte:** ``        return { changed: true, value: next };``

**O que faz:** Retorna sinal `changed:true` e a cópia pronta para persistência.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a forma array; as assertions de Refazer inspecionadas semeiam coleções objeto.

### Linha 107 — U07: remoção preservando identidade de índice

**Fonte:** ``    }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de remoção preservando identidade de índice, delimitando seu escopo antes da próxima etapa.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a forma array; as assertions de Refazer inspecionadas semeiam coleções objeto.

### Linha 108 — U07: remoção preservando identidade de índice

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de remoção preservando identidade de índice; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para coleções objeto pelos testes de Refazer de shared-ui/popup/options. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para array, hole, `null` e índice ausente.

### Linha 109 — U07: remoção preservando identidade de índice

**Fonte:** ``    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) {``

**O que faz:** Seleciona o caminho de objetos apenas quando a chave existe como propriedade própria.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a forma objeto pelos testes de Refazer, que exigem remoção do índice alvo e preservação do índice vizinho.

### Linha 110 — U07: remoção preservando identidade de índice

**Fonte:** ``        const next = { ...value };``

**O que faz:** Clona o objeto raso antes da remoção.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a forma objeto pelos testes de Refazer, que exigem remoção do índice alvo e preservação do índice vizinho.

### Linha 111 — U07: remoção preservando identidade de índice

**Fonte:** ``        delete next[key];``

**O que faz:** Remove somente a chave do índice alvo na cópia.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a forma objeto pelos testes de Refazer, que exigem remoção do índice alvo e preservação do índice vizinho.

### Linha 112 — U07: remoção preservando identidade de índice

**Fonte:** ``        return { changed: true, value: next };``

**O que faz:** Retorna a coleção objeto modificada com `changed:true`.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a forma objeto pelos testes de Refazer, que exigem remoção do índice alvo e preservação do índice vizinho.

### Linha 113 — U07: remoção preservando identidade de índice

**Fonte:** ``    }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de remoção preservando identidade de índice, delimitando seu escopo antes da próxima etapa.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a forma objeto pelos testes de Refazer, que exigem remoção do índice alvo e preservação do índice vizinho.

### Linha 114 — U07: remoção preservando identidade de índice

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de remoção preservando identidade de índice; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a forma objeto pelos testes de Refazer, que exigem remoção do índice alvo e preservação do índice vizinho.

### Linha 115 — U07: remoção preservando identidade de índice

**Fonte:** ``    return { changed: false, value };``

**O que faz:** Cai no resultado inalterado para tipos/índices sem correspondência.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para a forma objeto pelos testes de Refazer, que exigem remoção do índice alvo e preservação do índice vizinho.

### Linha 116 — U07: remoção preservando identidade de índice

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de remoção preservando identidade de índice, delimitando seu escopo antes da próxima etapa.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para coleções objeto pelos testes de Refazer de shared-ui/popup/options. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para array, hole, `null` e índice ausente.

### Linha 117 — U07: remoção preservando identidade de índice

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de remoção preservando identidade de índice; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Para arrays clona com `slice` e escreve `null` no índice; para objetos clona e remove a chave; valores sem índice ou sem propriedade retornam inalterados.

**Por que foi implementado dessa forma:** Índices representam páginas persistidas e não devem ser renumerados ao remover uma tradução específica.

**Por que uma implementação ingênua seria pior:** Usar `splice` deslocaria páginas seguintes; mutar a coleção recebida poderia alterar estado compartilhado antes de `chrome.storage.local.set` confirmar persistência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para coleções objeto pelos testes de Refazer de shared-ui/popup/options. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para array, hole, `null` e índice ausente.

### Linha 118 — U08: mensagem runtime com erro explícito

**Fonte:** ``function sendRuntimeMessageSafe(message, callback) {``

**O que faz:** Declara envio ao runtime que expõe erro de transporte ao callback da UI.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 119 — U08: mensagem runtime com erro explícito

**Fonte:** ``    try {``

**O que faz:** Executa a etapa mostrada por `try {` dentro de mensagem runtime com erro explícito, mantendo o fluxo e o estado desse bloco.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 120 — U08: mensagem runtime com erro explícito

**Fonte:** ``        chrome.runtime.sendMessage(message, (response) => {``

**O que faz:** Envia a mensagem e captura resposta no callback do Chrome.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 121 — U08: mensagem runtime com erro explícito

**Fonte:** ``            const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;``

**O que faz:** Lê `runtime.lastError` dentro do callback, única janela confiável dessa API, e extrai a mensagem.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 122 — U08: mensagem runtime com erro explícito

**Fonte:** ``            if (callback) callback(response, error);``

**O que faz:** Entrega resposta e erro normalizado ao callback apenas quando o chamador forneceu um.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 123 — U08: mensagem runtime com erro explícito

**Fonte:** ``        });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mensagem runtime com erro explícito, delimitando seu escopo antes da próxima etapa.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 124 — U08: mensagem runtime com erro explícito

**Fonte:** ``    } catch (error) {``

**O que faz:** Executa a etapa mostrada por `} catch (error) {` dentro de mensagem runtime com erro explícito, mantendo o fluxo e o estado desse bloco.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 125 — U08: mensagem runtime com erro explícito

**Fonte:** ``        if (callback) callback(null, error.message);``

**O que faz:** Converte exceção síncrona em `(null, error.message)` para manter o mesmo canal de erro.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 126 — U08: mensagem runtime com erro explícito

**Fonte:** ``    }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mensagem runtime com erro explícito, delimitando seu escopo antes da próxima etapa.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 127 — U08: mensagem runtime com erro explícito

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mensagem runtime com erro explícito, delimitando seu escopo antes da próxima etapa.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 128 — U08: mensagem runtime com erro explícito

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mensagem runtime com erro explícito; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Chama `chrome.runtime.sendMessage` e entrega ao callback do chamador a resposta mais uma string de erro derivada de `runtime.lastError`; exceção síncrona também vira erro de callback.

**Por que foi implementado dessa forma:** O fluxo de exclusão GTC precisa distinguir falha de transporte para escolher feedback amarelo sem lançar na UI.

**Por que uma implementação ingênua seria pior:** Ler `runtime.lastError` fora do callback perde a janela válida da API; não encapsular exceção pode deixar a operação sem feedback e sem liberar estado posterior.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no caminho nominal: os testes de Refazer exigem envio de `GTC_DELETE_BY_CLEAN_URL`. ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `runtime.lastError` e throw síncrono.

### Linha 129 — U09: mutex local e modal de confirmação

**Fonte:** ``const redoRequestInFlight = new Set();``

**O que faz:** Cria Set privado de URLs cuja operação de Refazer já está em andamento nesta instância de página.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 130 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 131 — U09: mutex local e modal de confirmação

**Fonte:** ``function requestRedoConfirmation(entry, ui = {}) {``

**O que faz:** Declara a confirmação assíncrona da operação destrutiva; `entry` é recebido mas atualmente não é usado no conteúdo do modal.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 132 — U09: mutex local e modal de confirmação

**Fonte:** ``    return new Promise((resolve) => {``

**O que faz:** Executa a etapa mostrada por `return new Promise((resolve) => {` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 133 — U09: mutex local e modal de confirmação

**Fonte:** ``        if (ui.skipConfirmation === true) {``

**O que faz:** Permite ao chamador interno ignorar confirmação explicitamente por `ui.skipConfirmation === true`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: este ramo não recebeu assertion focal nas suítes inspecionadas.

### Linha 134 — U09: mutex local e modal de confirmação

**Fonte:** ``            resolve(true);``

**O que faz:** Resolve imediatamente como confirmado quando o bypass explícito está ativo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: este ramo não recebeu assertion focal nas suítes inspecionadas.

### Linha 135 — U09: mutex local e modal de confirmação

**Fonte:** ``            return;``

**O que faz:** Executa a etapa mostrada por `return;` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 136 — U09: mutex local e modal de confirmação

**Fonte:** ``        }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 137 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 138 — U09: mutex local e modal de confirmação

**Fonte:** ``        chrome.storage.local.get(['redoConfirmEnabled'], (data) => {``

**O que faz:** Consulta a preferência persistida que controla a exibição do modal de Refazer.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 139 — U09: mutex local e modal de confirmação

**Fonte:** ``            if (data.redoConfirmEnabled === false) {``

**O que faz:** Detecta opt-out explícito (`false`); ausência de chave continua significando confirmação habilitada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 140 — U09: mutex local e modal de confirmação

**Fonte:** ``                resolve(true);``

**O que faz:** Resolve como confirmado quando o usuário desabilitou perguntas futuras.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 141 — U09: mutex local e modal de confirmação

**Fonte:** ``                return;``

**O que faz:** Executa a etapa mostrada por `return;` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 142 — U09: mutex local e modal de confirmação

**Fonte:** ``            }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 143 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 144 — U09: mutex local e modal de confirmação

**Fonte:** ``            // Não usamos window.confirm(): o Chromium pode bloqueá-lo quando o``

**O que faz:** Explica a decisão de não usar `window.confirm`, documentando comportamento específico do Chromium.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 145 — U09: mutex local e modal de confirmação

**Fonte:** ``            // usuário marca "Impedir que esta página crie caixas de diálogo``

**O que faz:** Continua o comentário com a opção do navegador que impede diálogos adicionais.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 146 — U09: mutex local e modal de confirmação

**Fonte:** ``            // adicionais", tornando Cancelar e diálogo bloqueado indistinguíveis.``

**O que faz:** Fecha a justificativa: diálogo bloqueado e Cancelar seriam indistinguíveis para o fluxo antigo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE: a suíte `redo-confirmation.test.js` verifica preferência `false`, ausência de `window.confirm` e persistência de “Não perguntar novamente”.

### Linha 147 — U09: mutex local e modal de confirmação

**Fonte:** ``            if (typeof document === 'undefined' || !document.body) {``

**O que faz:** Detecta execução sem DOM utilizável e adota política fail-open para a confirmação.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: este ramo não recebeu assertion focal nas suítes inspecionadas.

### Linha 148 — U09: mutex local e modal de confirmação

**Fonte:** ``                resolve(true);``

**O que faz:** Sem `document.body`, autoriza a exclusão em vez de bloquear a operação.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: este ramo não recebeu assertion focal nas suítes inspecionadas.

### Linha 149 — U09: mutex local e modal de confirmação

**Fonte:** ``                return;``

**O que faz:** Executa a etapa mostrada por `return;` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 150 — U09: mutex local e modal de confirmação

**Fonte:** ``            }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 151 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 152 — U09: mutex local e modal de confirmação

**Fonte:** ``            const previous = document.getElementById('mt-redo-confirm-overlay');``

**O que faz:** Procura modal anterior pelo ID global fixo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: este ramo não recebeu assertion focal nas suítes inspecionadas.

### Linha 153 — U09: mutex local e modal de confirmação

**Fonte:** ``            if (previous) previous.remove();``

**O que faz:** Remove visualmente qualquer overlay anterior antes de construir o novo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: este ramo não recebeu assertion focal nas suítes inspecionadas.

### Linha 154 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 155 — U09: mutex local e modal de confirmação

**Fonte:** ``            const overlay = document.createElement('div');``

**O que faz:** Cria o backdrop que cobre a página da extensão.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 156 — U09: mutex local e modal de confirmação

**Fonte:** ``            overlay.id = 'mt-redo-confirm-overlay';``

**O que faz:** Atribui ID estável usado por testes, deduplicação visual e cleanup.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 157 — U09: mutex local e modal de confirmação

**Fonte:** ``            overlay.setAttribute('role', 'presentation');``

**O que faz:** Marca o backdrop como apresentação; a semântica de diálogo fica no elemento interno.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 158 — U09: mutex local e modal de confirmação

**Fonte:** ``            overlay.style.cssText = [``

**O que faz:** Executa a etapa mostrada por `overlay.style.cssText = [` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 159 — U09: mutex local e modal de confirmação

**Fonte:** ``                'position:fixed',``

**O que faz:** Acrescenta a declaração visual `'position:fixed'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 160 — U09: mutex local e modal de confirmação

**Fonte:** ``                'inset:0',``

**O que faz:** Acrescenta a declaração visual `'inset:0'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 161 — U09: mutex local e modal de confirmação

**Fonte:** ``                'z-index:2147483647',``

**O que faz:** Acrescenta a declaração visual `'z-index:2147483647'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 162 — U09: mutex local e modal de confirmação

**Fonte:** ``                'background:rgba(0,0,0,.72)',``

**O que faz:** Acrescenta a declaração visual `'background:rgba(0,0,0,.72)'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 163 — U09: mutex local e modal de confirmação

**Fonte:** ``                'display:flex',``

**O que faz:** Acrescenta a declaração visual `'display:flex'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 164 — U09: mutex local e modal de confirmação

**Fonte:** ``                'align-items:center',``

**O que faz:** Acrescenta a declaração visual `'align-items:center'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 165 — U09: mutex local e modal de confirmação

**Fonte:** ``                'justify-content:center',``

**O que faz:** Acrescenta a declaração visual `'justify-content:center'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 166 — U09: mutex local e modal de confirmação

**Fonte:** ``                'padding:20px',``

**O que faz:** Acrescenta a declaração visual `'padding:20px'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 167 — U09: mutex local e modal de confirmação

**Fonte:** ``                'box-sizing:border-box',``

**O que faz:** Acrescenta a declaração visual `'box-sizing:border-box'` ao conjunto de estilos inline do overlay, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 168 — U09: mutex local e modal de confirmação

**Fonte:** ``            ].join(';');``

**O que faz:** Executa a etapa mostrada por `].join(';');` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** A propriedade é acumulada em um array de strings e depois combinada com `join(';')`, produzindo um único `cssText` para o backdrop.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 169 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 170 — U09: mutex local e modal de confirmação

**Fonte:** ``            const dialog = document.createElement('div');``

**O que faz:** Cria o contêiner semântico do diálogo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 171 — U09: mutex local e modal de confirmação

**Fonte:** ``            dialog.id = 'mt-redo-confirm-dialog';``

**O que faz:** Atribui ID estável ao diálogo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 172 — U09: mutex local e modal de confirmação

**Fonte:** ``            dialog.setAttribute('role', 'dialog');``

**O que faz:** Define role `dialog` para tecnologia assistiva.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 173 — U09: mutex local e modal de confirmação

**Fonte:** ``            dialog.setAttribute('aria-modal', 'true');``

**O que faz:** Sinaliza que o diálogo é modal via `aria-modal=true`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 174 — U09: mutex local e modal de confirmação

**Fonte:** ``            dialog.setAttribute('aria-labelledby', 'mt-redo-confirm-title');``

**O que faz:** Relaciona o diálogo ao título por `aria-labelledby`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 175 — U09: mutex local e modal de confirmação

**Fonte:** ``            dialog.style.cssText = [``

**O que faz:** Executa a etapa mostrada por `dialog.style.cssText = [` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 176 — U09: mutex local e modal de confirmação

**Fonte:** ``                'width:min(420px,100%)',``

**O que faz:** Acrescenta a declaração visual `'width:min(420px,100%)'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 177 — U09: mutex local e modal de confirmação

**Fonte:** ``                'background:#191919',``

**O que faz:** Acrescenta a declaração visual `'background:#191919'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 178 — U09: mutex local e modal de confirmação

**Fonte:** ``                'border:1px solid #3a3a3a',``

**O que faz:** Acrescenta a declaração visual `'border:1px solid #3a3a3a'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 179 — U09: mutex local e modal de confirmação

**Fonte:** ``                'border-radius:10px',``

**O que faz:** Acrescenta a declaração visual `'border-radius:10px'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 180 — U09: mutex local e modal de confirmação

**Fonte:** ``                'box-shadow:0 18px 60px rgba(0,0,0,.65)',``

**O que faz:** Acrescenta a declaração visual `'box-shadow:0 18px 60px rgba(0,0,0,.65)'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 181 — U09: mutex local e modal de confirmação

**Fonte:** ``                'padding:18px',``

**O que faz:** Acrescenta a declaração visual `'padding:18px'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 182 — U09: mutex local e modal de confirmação

**Fonte:** ``                'box-sizing:border-box',``

**O que faz:** Acrescenta a declaração visual `'box-sizing:border-box'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 183 — U09: mutex local e modal de confirmação

**Fonte:** ``                'font-family:sans-serif',``

**O que faz:** Acrescenta a declaração visual `'font-family:sans-serif'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 184 — U09: mutex local e modal de confirmação

**Fonte:** ``                'color:#eee',``

**O que faz:** Acrescenta a declaração visual `'color:#eee'` ao conjunto de estilos inline do diálogo, fixando esse detalhe de layout antes da montagem no DOM.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 185 — U09: mutex local e modal de confirmação

**Fonte:** ``            ].join(';');``

**O que faz:** Executa a etapa mostrada por `].join(';');` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** A propriedade é acumulada no array de estilos do diálogo e materializada de uma vez em `dialog.style.cssText`.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 186 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 187 — U09: mutex local e modal de confirmação

**Fonte:** ``            const title = document.createElement('div');``

**O que faz:** Cria o nó do título do diálogo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 188 — U09: mutex local e modal de confirmação

**Fonte:** ``            title.id = 'mt-redo-confirm-title';``

**O que faz:** Define o ID referenciado por `aria-labelledby`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 189 — U09: mutex local e modal de confirmação

**Fonte:** ``            title.textContent = 'Refazer tradução';``

**O que faz:** Define título textual constante `Refazer tradução` via `textContent`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 190 — U09: mutex local e modal de confirmação

**Fonte:** ``            title.style.cssText = 'font-size:16px;font-weight:800;margin-bottom:9px;color:#fff';``

**O que faz:** Executa a etapa mostrada por `title.style.cssText = 'font-size:16px;font-weight:800;margin-bottom:9px;color:#fff';` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 191 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 192 — U09: mutex local e modal de confirmação

**Fonte:** ``            const message = document.createElement('div');``

**O que faz:** Cria o nó da mensagem de confirmação.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 193 — U09: mutex local e modal de confirmação

**Fonte:** ``            message.textContent = 'Apagar a tradução salva desta imagem? Depois disso, selecione/traduza a imagem novamente para gerar a versão correta.';``

**O que faz:** Insere a pergunta destrutiva como texto constante, sem interpolar dados da entrada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 194 — U09: mutex local e modal de confirmação

**Fonte:** ``            message.style.cssText = 'font-size:13px;line-height:1.5;color:#bbb;margin-bottom:14px';``

**O que faz:** Executa a etapa mostrada por `message.style.cssText = 'font-size:13px;line-height:1.5;color:#bbb;margin-bottom:14px';` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 195 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 196 — U09: mutex local e modal de confirmação

**Fonte:** ``            const neverAskLabel = document.createElement('label');``

**O que faz:** Cria label clicável para a opção persistente de não perguntar novamente.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 197 — U09: mutex local e modal de confirmação

**Fonte:** ``            neverAskLabel.style.cssText = 'display:flex;align-items:center;gap:8px;color:#aaa;font-size:12px;cursor:pointer;margin-bottom:16px';``

**O que faz:** Executa a etapa mostrada por `neverAskLabel.style.cssText = 'display:flex;align-items:center;gap:8px;color:#aaa;font-size:12px;cursor:pointer;margin-bottom:16px';` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 198 — U09: mutex local e modal de confirmação

**Fonte:** ``            const neverAsk = document.createElement('input');``

**O que faz:** Cria o checkbox dessa preferência.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 199 — U09: mutex local e modal de confirmação

**Fonte:** ``            neverAsk.id = 'mt-redo-confirm-never-ask';``

**O que faz:** Define ID estável para teste/seleção.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 200 — U09: mutex local e modal de confirmação

**Fonte:** ``            neverAsk.type = 'checkbox';``

**O que faz:** Configura o input como checkbox.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 201 — U09: mutex local e modal de confirmação

**Fonte:** ``            neverAsk.style.accentColor = '#FF4444';``

**O que faz:** Executa a etapa mostrada por `neverAsk.style.accentColor = '#FF4444';` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 202 — U09: mutex local e modal de confirmação

**Fonte:** ``            neverAskLabel.append(neverAsk, document.createTextNode('Não perguntar novamente'));``

**O que faz:** Anexa checkbox e rótulo textual ao label.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 203 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 204 — U09: mutex local e modal de confirmação

**Fonte:** ``            const actions = document.createElement('div');``

**O que faz:** Cria o contêiner dos botões de ação.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 205 — U09: mutex local e modal de confirmação

**Fonte:** ``            actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';``

**O que faz:** Executa a etapa mostrada por `actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 206 — U09: mutex local e modal de confirmação

**Fonte:** ``            const cancel = document.createElement('button');``

**O que faz:** Cria o botão de cancelamento.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 207 — U09: mutex local e modal de confirmação

**Fonte:** ``            cancel.id = 'mt-redo-confirm-cancel';``

**O que faz:** Define ID estável do botão Cancelar.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 208 — U09: mutex local e modal de confirmação

**Fonte:** ``            cancel.type = 'button';``

**O que faz:** Define `type=button` para impedir comportamento de submit caso o componente seja inserido em contexto com formulário.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 209 — U09: mutex local e modal de confirmação

**Fonte:** ``            cancel.textContent = 'Cancelar';``

**O que faz:** Define texto visível `Cancelar`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 210 — U09: mutex local e modal de confirmação

**Fonte:** ``            cancel.style.cssText = 'border:1px solid #444;background:#252525;color:#ddd;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer';``

**O que faz:** Executa a etapa mostrada por `cancel.style.cssText = 'border:1px solid #444;background:#252525;color:#ddd;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer';` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 211 — U09: mutex local e modal de confirmação

**Fonte:** ``            const confirmButton = document.createElement('button');``

**O que faz:** Cria o botão da ação destrutiva.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 212 — U09: mutex local e modal de confirmação

**Fonte:** ``            confirmButton.id = 'mt-redo-confirm-accept';``

**O que faz:** Define ID estável do botão de confirmação.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 213 — U09: mutex local e modal de confirmação

**Fonte:** ``            confirmButton.type = 'button';``

**O que faz:** Define `type=button`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 214 — U09: mutex local e modal de confirmação

**Fonte:** ``            confirmButton.textContent = 'Apagar e refazer';``

**O que faz:** Define texto explícito `Apagar e refazer`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 215 — U09: mutex local e modal de confirmação

**Fonte:** ``            confirmButton.style.cssText = 'border:0;background:#1a5fa8;color:#fff;border-radius:6px;padding:8px 12px;font-weight:800;cursor:pointer';``

**O que faz:** Executa a etapa mostrada por `confirmButton.style.cssText = 'border:0;background:#1a5fa8;color:#fff;border-radius:6px;padding:8px 12px;font-weight:800;cursor:pointer';` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 216 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 217 — U09: mutex local e modal de confirmação

**Fonte:** ``            actions.append(cancel, confirmButton);``

**O que faz:** Anexa Cancelar e Confirmar ao agrupamento de ações.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 218 — U09: mutex local e modal de confirmação

**Fonte:** ``            dialog.append(title, message, neverAskLabel, actions);``

**O que faz:** Monta título, mensagem, preferência e ações dentro do diálogo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 219 — U09: mutex local e modal de confirmação

**Fonte:** ``            overlay.appendChild(dialog);``

**O que faz:** Insere o diálogo dentro do backdrop.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 220 — U09: mutex local e modal de confirmação

**Fonte:** ``            document.body.appendChild(overlay);``

**O que faz:** Materializa o overlay na página apenas depois que sua árvore está pronta.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 221 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 222 — U09: mutex local e modal de confirmação

**Fonte:** ``            let settled = false;``

**O que faz:** Cria flag local para garantir resolução única da Promise.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 223 — U09: mutex local e modal de confirmação

**Fonte:** ``            const finish = (result) => {``

**O que faz:** Declara `finish`, ponto único de encerramento do modal.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 224 — U09: mutex local e modal de confirmação

**Fonte:** ``                if (settled) return;``

**O que faz:** Ignora eventos tardios depois que a Promise já foi resolvida.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 225 — U09: mutex local e modal de confirmação

**Fonte:** ``                settled = true;``

**O que faz:** Marca a confirmação/cancelamento como encerrado antes de executar cleanup.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 226 — U09: mutex local e modal de confirmação

**Fonte:** ``                document.removeEventListener('keydown', onKeydown, true);``

**O que faz:** Remove o listener global de teclado instalado para Escape.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 227 — U09: mutex local e modal de confirmação

**Fonte:** ``                overlay.remove();``

**O que faz:** Remove o overlay do DOM.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 228 — U09: mutex local e modal de confirmação

**Fonte:** ``                resolve(result);``

**O que faz:** Resolve a Promise com a decisão booleana.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 229 — U09: mutex local e modal de confirmação

**Fonte:** ``            };``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 230 — U09: mutex local e modal de confirmação

**Fonte:** ``            const onKeydown = (event) => {``

**O que faz:** Declara listener de teclado do modal.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 231 — U09: mutex local e modal de confirmação

**Fonte:** ``                if (event.key === 'Escape') finish(false);``

**O que faz:** Interpreta somente Escape como cancelamento.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 232 — U09: mutex local e modal de confirmação

**Fonte:** ``            };``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 233 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 234 — U09: mutex local e modal de confirmação

**Fonte:** ``            cancel.addEventListener('click', () => finish(false));``

**O que faz:** Liga clique em Cancelar ao encerramento com `false`.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 235 — U09: mutex local e modal de confirmação

**Fonte:** ``            confirmButton.addEventListener('click', () => {``

**O que faz:** Liga o botão destrutivo à lógica de confirmação/persistência.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 236 — U09: mutex local e modal de confirmação

**Fonte:** ``                if (!neverAsk.checked) {``

**O que faz:** Se o checkbox não estiver marcado, não há preferência nova para persistir.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 237 — U09: mutex local e modal de confirmação

**Fonte:** ``                    finish(true);``

**O que faz:** Confirma imediatamente mantendo a configuração atual.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 238 — U09: mutex local e modal de confirmação

**Fonte:** ``                    return;``

**O que faz:** Executa a etapa mostrada por `return;` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 239 — U09: mutex local e modal de confirmação

**Fonte:** ``                }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 240 — U09: mutex local e modal de confirmação

**Fonte:** ``                chrome.storage.local.set({ redoConfirmEnabled: false }, () => finish(true));``

**O que faz:** Quando marcado, grava `redoConfirmEnabled:false` e só então resolve como confirmado.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 241 — U09: mutex local e modal de confirmação

**Fonte:** ``            });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 242 — U09: mutex local e modal de confirmação

**Fonte:** ``            overlay.addEventListener('click', (event) => {``

**O que faz:** Escuta cliques no backdrop.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 243 — U09: mutex local e modal de confirmação

**Fonte:** ``                if (event.target === overlay) finish(false);``

**O que faz:** Cancela apenas quando o alvo do evento é o próprio overlay, não cliques dentro do diálogo.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 244 — U09: mutex local e modal de confirmação

**Fonte:** ``            });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 245 — U09: mutex local e modal de confirmação

**Fonte:** ``            document.addEventListener('keydown', onKeydown, true);``

**O que faz:** Instala Escape em fase de captura para responder mesmo se outro componente parar propagação depois.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 246 — U09: mutex local e modal de confirmação

**Fonte:** ``            setTimeout(() => {``

**O que faz:** Agenda o foco do botão confirmar para o próximo macrotask.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 247 — U09: mutex local e modal de confirmação

**Fonte:** ``                try { confirmButton.focus(); } catch (_error) {}``

**O que faz:** Tenta focar a ação principal e ignora falha de foco sem bloquear o modal.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o modal é renderizado nos testes, mas a falha do `focus()` não é provocada.

### Linha 248 — U09: mutex local e modal de confirmação

**Fonte:** ``            }, 0);``

**O que faz:** Executa a etapa mostrada por `}, 0);` dentro de mutex local e modal de confirmação, mantendo o fluxo e o estado desse bloco.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: o modal é renderizado nos testes, mas a falha do `focus()` não é provocada.

### Linha 249 — U09: mutex local e modal de confirmação

**Fonte:** ``        });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 250 — U09: mutex local e modal de confirmação

**Fonte:** ``    });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para o comportamento correspondente do modal em `redo-confirmation.test.js`, salvo ramos explicitamente marcados nesta Bíblia como lacuna.

### Linha 251 — U09: mutex local e modal de confirmação

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de mutex local e modal de confirmação, delimitando seu escopo antes da próxima etapa.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 252 — U09: mutex local e modal de confirmação

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de mutex local e modal de confirmação; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Mantém um Set por `cleanUrl`, consulta a preferência, constrói modal acessível no DOM, centraliza resolução em `finish`, trata Cancelar/Escape/clique no backdrop, persiste “Não perguntar novamente” e foca a ação destrutiva.

**Por que foi implementado dessa forma:** Um modal próprio evita a limitação do `window.confirm` que o Chromium pode bloquear e dá à extensão controle sobre persistência e deduplicação.

**Por que uma implementação ingênua seria pior:** `window.confirm` bloqueado é indistinguível de cancelamento no requisito histórico; sem trava por URL, duplo clique poderia iniciar duas purgas concorrentes.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE por `redo-confirmation.test.js`: modal próprio, Cancelar, Escape, backdrop, persistência da preferência, bypass por preferência e deduplicação do mesmo `cleanUrl`. ⚠️ `skipConfirmation`, ausência de DOM e concorrência entre URLs diferentes não têm prova focal.

### Linha 253 — U10: purga coordenada de tradução salva

**Fonte:** ``async function deleteSavedTranslationForEntry(entry, ui = {}) {``

**O que faz:** Declara a operação coordenada que remove uma tradução salva para permitir refazê-la.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 254 — U10: purga coordenada de tradução salva

**Fonte:** ``    if (!entry || !entry.cleanUrl) return false;``

**O que faz:** Rejeita entrada ausente ou sem `cleanUrl` antes de tocar em confirmação, storage ou runtime.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 255 — U10: purga coordenada de tradução salva

**Fonte:** ``    const requestKey = String(entry.cleanUrl);``

**O que faz:** Normaliza `cleanUrl` para string e usa esse valor como chave do mutex local.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 256 — U10: purga coordenada de tradução salva

**Fonte:** ``    if (redoRequestInFlight.has(requestKey)) return false;``

**O que faz:** Impede uma segunda purga simultânea da mesma URL nesta instância de página.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 257 — U10: purga coordenada de tradução salva

**Fonte:** ``    redoRequestInFlight.add(requestKey);``

**O que faz:** Reserva a URL no Set antes do primeiro `await`, fechando a janela de duplo clique.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 258 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 259 — U10: purga coordenada de tradução salva

**Fonte:** ``    try {``

**O que faz:** Abre `try` cujo `finally` garante liberação da reserva local.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 260 — U10: purga coordenada de tradução salva

**Fonte:** ``        const confirmed = await requestRedoConfirmation(entry, ui);``

**O que faz:** Solicita confirmação conforme preferência/UI.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 261 — U10: purga coordenada de tradução salva

**Fonte:** ``        if (!confirmed) return false;``

**O que faz:** Cancelamento encerra com `false`; o `finally` ainda removerá a URL do Set.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 262 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 263 — U10: purga coordenada de tradução salva

**Fonte:** ``        const smResult = await smRequest({ action: 'SM_DELETE_CLEAN_URL', cleanUrl: entry.cleanUrl });``

**O que faz:** Solicita ao storage manager moderno exclusão por `cleanUrl` antes de limpar compatibilidade legada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 264 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 265 — U10: purga coordenada de tradução salva

**Fonte:** ``        const initData = await new Promise(r => chrome.storage.local.get(['chapterList', 'autoRestoreBlockedImages'], r));``

**O que faz:** Lê de uma vez a lista de capítulos e o mapa global de imagens bloqueadas.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 266 — U10: purga coordenada de tradução salva

**Fonte:** ``        const chapterList = initData.chapterList || [];``

**O que faz:** Normaliza lista de capítulos ausente para array vazio.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 267 — U10: purga coordenada de tradução salva

**Fonte:** ``        const chapterIds = entry.chapterId ? [entry.chapterId] : chapterList.map(c => c.id);``

**O que faz:** Se a entrada conhece `chapterId`, limita a limpeza a ele; caso contrário seleciona todos os IDs conhecidos.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 268 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 269 — U10: purga coordenada de tradução salva

**Fonte:** ``        const keysToFetch = [];``

**O que faz:** Inicializa o batch de chaves legadas necessárias à limpeza.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 270 — U10: purga coordenada de tradução salva

**Fonte:** ``        chapterIds.forEach(id => keysToFetch.push(\`${id}_restoreMap\`, \`${id}_restoreMeta\`, \`${id}_images\`, \`${id}_paths\`));``

**O que faz:** Inclui quatro coleções por capítulo: restoreMap, restoreMeta, images e paths.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 271 — U10: purga coordenada de tradução salva

**Fonte:** ``        const data = keysToFetch.length``

**O que faz:** Decide entre consultar storage e usar objeto vazio conforme existam chaves.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 272 — U10: purga coordenada de tradução salva

**Fonte:** ``            ? await new Promise(r => chrome.storage.local.get(keysToFetch, r))``

**O que faz:** Lê o batch legado em uma única chamada assíncrona.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 273 — U10: purga coordenada de tradução salva

**Fonte:** ``            : {};``

**O que faz:** Evita chamada vazia quando não há capítulos alvo.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 274 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 275 — U10: purga coordenada de tradução salva

**Fonte:** ``        const updates = {};``

**O que faz:** Acumula somente alterações realmente necessárias antes de um único `storage.local.set`.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 276 — U10: purga coordenada de tradução salva

**Fonte:** ``        const blockedImages = normalizeBlockedImages(initData.autoRestoreBlockedImages);``

**O que faz:** Normaliza o formato do mapa de bloqueios antes da remoção.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 277 — U10: purga coordenada de tradução salva

**Fonte:** ``        if (blockedImages[entry.cleanUrl]) {``

**O que faz:** Testa se a URL alvo está explicitamente bloqueada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 278 — U10: purga coordenada de tradução salva

**Fonte:** ``            delete blockedImages[entry.cleanUrl];``

**O que faz:** Remove a URL do mapa normalizado para que uma futura tradução não herde o bloqueio antigo.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 279 — U10: purga coordenada de tradução salva

**Fonte:** ``            updates.autoRestoreBlockedImages = blockedImages;``

**O que faz:** Agenda a coleção de bloqueios atualizada para persistência.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 280 — U10: purga coordenada de tradução salva

**Fonte:** ``        }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 281 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 282 — U10: purga coordenada de tradução salva

**Fonte:** ``        chapterIds.forEach(chapterId => {``

**O que faz:** Percorre cada capítulo selecionado para remover referências legadas.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 283 — U10: purga coordenada de tradução salva

**Fonte:** ``            const restoreMapKey = \`${chapterId}_restoreMap\`;``

**O que faz:** Calcula a chave do restoreMap daquele capítulo.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 284 — U10: purga coordenada de tradução salva

**Fonte:** ``            const restoreMap = data[restoreMapKey] || {};``

**O que faz:** Obtém o mapa ou objeto vazio.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 285 — U10: purga coordenada de tradução salva

**Fonte:** ``            if (Object.prototype.hasOwnProperty.call(restoreMap, entry.cleanUrl)) {``

**O que faz:** Só clona/persiste se a URL alvo realmente existe no mapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 286 — U10: purga coordenada de tradução salva

**Fonte:** ``                const next = { ...restoreMap };``

**O que faz:** Cria cópia rasa para não mutar o snapshot lido.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 287 — U10: purga coordenada de tradução salva

**Fonte:** ``                delete next[entry.cleanUrl];``

**O que faz:** Remove a tradução antiga da URL.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 288 — U10: purga coordenada de tradução salva

**Fonte:** ``                updates[restoreMapKey] = next;``

**O que faz:** Agenda o restoreMap alterado.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 289 — U10: purga coordenada de tradução salva

**Fonte:** ``            }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 290 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 291 — U10: purga coordenada de tradução salva

**Fonte:** ``            const restoreMetaKey = \`${chapterId}_restoreMeta\`;``

**O que faz:** Calcula a chave da metadata de restore.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 292 — U10: purga coordenada de tradução salva

**Fonte:** ``            const restoreMeta = data[restoreMetaKey] || {};``

**O que faz:** Obtém a metadata ou objeto vazio.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 293 — U10: purga coordenada de tradução salva

**Fonte:** ``            if (Object.prototype.hasOwnProperty.call(restoreMeta, entry.cleanUrl)) {``

**O que faz:** Só altera a metadata quando existe entrada da URL alvo.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 294 — U10: purga coordenada de tradução salva

**Fonte:** ``                const next = { ...restoreMeta };``

**O que faz:** Clona a metadata.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 295 — U10: purga coordenada de tradução salva

**Fonte:** ``                delete next[entry.cleanUrl];``

**O que faz:** Remove metadata correspondente à URL.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 296 — U10: purga coordenada de tradução salva

**Fonte:** ``                updates[restoreMetaKey] = next;``

**O que faz:** Agenda a metadata alterada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 297 — U10: purga coordenada de tradução salva

**Fonte:** ``            }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 298 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 299 — U10: purga coordenada de tradução salva

**Fonte:** ``            const imageResult = removeIndexFromStoredCollection(data[\`${chapterId}_images\`], entry.index);``

**O que faz:** Tenta limpar do registro de imagens a posição indicada por `entry.index`.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 300 — U10: purga coordenada de tradução salva

**Fonte:** ``            if (imageResult.changed) updates[\`${chapterId}_images\`] = imageResult.value;``

**O que faz:** Agenda a coleção de imagens apenas quando o helper sinaliza mudança.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 301 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 302 — U10: purga coordenada de tradução salva

**Fonte:** ``            const pathResult = removeIndexFromStoredCollection(data[\`${chapterId}_paths\`], entry.index);``

**O que faz:** Repete a remoção do mesmo índice para a coleção de paths.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 303 — U10: purga coordenada de tradução salva

**Fonte:** ``            if (pathResult.changed) updates[\`${chapterId}_paths\`] = pathResult.value;``

**O que faz:** Agenda paths somente se houve mudança.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 304 — U10: purga coordenada de tradução salva

**Fonte:** ``        });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 305 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 306 — U10: purga coordenada de tradução salva

**Fonte:** ``        if (Object.keys(updates).length > 0) {``

**O que faz:** Evita `storage.local.set` quando nenhum valor legado/bloqueio mudou.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 307 — U10: purga coordenada de tradução salva

**Fonte:** ``            await new Promise(r => chrome.storage.local.set(updates, r));``

**O que faz:** Persiste todas as alterações legadas em um único objeto de atualização.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 308 — U10: purga coordenada de tradução salva

**Fonte:** ``        }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 309 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 310 — U10: purga coordenada de tradução salva

**Fonte:** ``        const gtcResult = await new Promise(resolve => {``

**O que faz:** Cria Promise para aguardar a invalidação do cache GTC baseada em callback.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 311 — U10: purga coordenada de tradução salva

**Fonte:** ``            sendRuntimeMessageSafe({``

**O que faz:** Invoca o wrapper de mensagem que preserva erro de transporte.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 312 — U10: purga coordenada de tradução salva

**Fonte:** ``                action: 'GTC_DELETE_BY_CLEAN_URL',``

**O que faz:** Define a action `GTC_DELETE_BY_CLEAN_URL` entendida pelo runtime GTC.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 313 — U10: purga coordenada de tradução salva

**Fonte:** ``                cleanUrl: entry.cleanUrl,``

**O que faz:** Envia a mesma `cleanUrl` como chave de invalidação global.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 314 — U10: purga coordenada de tradução salva

**Fonte:** ``            }, (response, error) => resolve({ response, error }));``

**O que faz:** Converte callback `(response,error)` em objeto resolvido pela Promise.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 315 — U10: purga coordenada de tradução salva

**Fonte:** ``        });``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 316 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 317 — U10: purga coordenada de tradução salva

**Fonte:** ``        if (typeof ui.refresh === 'function') ui.refresh();``

**O que faz:** Pede rerenderização ao consumidor quando ele forneceu callback síncrono `refresh`.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 318 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 319 — U10: purga coordenada de tradução salva

**Fonte:** ``        const smOk = smResult && smResult.ok;``

**O que faz:** Considera sucesso do storage moderno apenas se existe resposta truthy com `ok`.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 320 — U10: purga coordenada de tradução salva

**Fonte:** ``        const msg = gtcResult.error``

**O que faz:** Escolhe a mensagem de status começando pela falha de transporte do GTC.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 321 — U10: purga coordenada de tradução salva

**Fonte:** ``            ? 'Tradução local apagada. Cache global não respondeu.'``

**O que faz:** Informa que a limpeza local ocorreu, mas o cache global não respondeu.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 322 — U10: purga coordenada de tradução salva

**Fonte:** ``            : (smOk``

**O que faz:** Sem erro GTC, ramifica conforme o resultado do storage manager moderno.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 323 — U10: purga coordenada de tradução salva

**Fonte:** ``                ? 'Tradução apagada. Agora você pode refazer essa imagem.'``

**O que faz:** Se storage moderno também respondeu `ok`, comunica sucesso completo segundo o contrato atual.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 324 — U10: purga coordenada de tradução salva

**Fonte:** ``                : 'Tradução apagada do storage local. Armazenamento novo não respondeu.');``

**O que faz:** Se storage moderno não respondeu `ok`, comunica que apenas a limpeza local pôde ser assegurada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 325 — U10: purga coordenada de tradução salva

**Fonte:** ``        const color = gtcResult.error || !smOk ? '#FF9800' : '#4CAF50';``

**O que faz:** Usa laranja quando GTC falhou por transporte ou storage moderno não confirmou; caso contrário verde.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 326 — U10: purga coordenada de tradução salva

**Fonte:** ``        if (typeof ui.showStatus === 'function') ui.showStatus(msg, color);``

**O que faz:** Entrega mensagem e cor ao consumidor quando `showStatus` foi fornecido.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 327 — U10: purga coordenada de tradução salva

**Fonte:** ``        return true;``

**O que faz:** Retorna `true` depois de executar a rotina, mesmo que algum backend tenha gerado warning não-excepcional.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 328 — U10: purga coordenada de tradução salva

**Fonte:** ``    } catch (_error) {``

**O que faz:** Captura exceções ocorridas após a reserva local da URL.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 329 — U10: purga coordenada de tradução salva

**Fonte:** ``        if (typeof ui.showStatus === 'function') {``

**O que faz:** Só tenta exibir erro se a UI forneceu `showStatus`.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 330 — U10: purga coordenada de tradução salva

**Fonte:** ``            ui.showStatus('Falha ao apagar a tradução salva.', '#FF9800');``

**O que faz:** Comunica falha genérica da purga com cor de alerta.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 331 — U10: purga coordenada de tradução salva

**Fonte:** ``        }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 332 — U10: purga coordenada de tradução salva

**Fonte:** ``        return false;``

**O que faz:** Retorna `false` para exceções capturadas.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** 🟨 PARCIALMENTE PROVADO: sucesso e feedback verde são assertados; respostas `{ok:false}`, `runtime.lastError`, throws de callbacks e falhas parciais não são cobertos focalmente.

### Linha 333 — U10: purga coordenada de tradução salva

**Fonte:** ``    } finally {``

**O que faz:** Abre `finally`, que roda tanto em sucesso quanto cancelamento/erro.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 334 — U10: purga coordenada de tradução salva

**Fonte:** ``        redoRequestInFlight.delete(requestKey);``

**O que faz:** Remove a URL do Set de operações em voo para permitir tentativa futura.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 335 — U10: purga coordenada de tradução salva

**Fonte:** ``    }``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 336 — U10: purga coordenada de tradução salva

**Fonte:** ``}``

**O que faz:** Fecha a estrutura sintática aberta no bloco de purga coordenada de tradução salva, delimitando seu escopo antes da próxima etapa.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 337 — U10: purga coordenada de tradução salva

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa visualmente partes de purga coordenada de tradução salva; não altera o runtime, mas faz parte da posição auditada.

**Como faz:** Valida a entrada, confirma, apaga o registro novo por `SM_DELETE_CLEAN_URL`, limpa caches legados/bloqueio em storage, invalida GTC por URL, atualiza UI e libera o mutex local no `finally`.

**Por que foi implementado dessa forma:** Refazer uma página exige remover todas as fontes que poderiam reaplicar a tradução antiga; limpar apenas um backend faria a versão errada reaparecer.

**Por que uma implementação ingênua seria pior:** Excluir só a miniatura visível ou só o IndexedDB deixaria restore legado/GTC divergentes; não usar `finally` poderia bloquear permanentemente novas tentativas após exceção.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos testes de shared-ui, Popup e Options para caminho de sucesso, preservação de outra URL, limpeza de caches, callbacks de UI, entrada inválida e duplo clique. ⚠️ Falhas parciais e vários ramos de erro seguem sem assertion específica.

### Linha 338 — U11: publicação explícita da API

**Fonte:** ``Object.assign(scope, {``

**O que faz:** Publica a API selecionada no escopo recebido pela IIFE.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 339 — U11: publicação explícita da API

**Fonte:** ``    DEFAULT_HD_PROMPT,``

**O que faz:** Exporta `DEFAULT_HD_PROMPT`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 340 — U11: publicação explícita da API

**Fonte:** ``    escapeHTML,``

**O que faz:** Exporta `escapeHTML`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 341 — U11: publicação explícita da API

**Fonte:** ``    normalizeBlockedImages,``

**O que faz:** Exporta `normalizeBlockedImages`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 342 — U11: publicação explícita da API

**Fonte:** ``    getHostFromUrl,``

**O que faz:** Exporta `getHostFromUrl`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 343 — U11: publicação explícita da API

**Fonte:** ``    smRequest,``

**O que faz:** Exporta `smRequest`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 344 — U11: publicação explícita da API

**Fonte:** ``    loadRestoreEntries,``

**O que faz:** Exporta `loadRestoreEntries`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 345 — U11: publicação explícita da API

**Fonte:** ``    removeIndexFromStoredCollection,``

**O que faz:** Exporta `removeIndexFromStoredCollection`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 346 — U11: publicação explícita da API

**Fonte:** ``    sendRuntimeMessageSafe,``

**O que faz:** Exporta `sendRuntimeMessageSafe`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 347 — U11: publicação explícita da API

**Fonte:** ``    requestRedoConfirmation,``

**O que faz:** Exporta `requestRedoConfirmation`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 348 — U11: publicação explícita da API

**Fonte:** ``    deleteSavedTranslationForEntry,``

**O que faz:** Exporta `deleteSavedTranslationForEntry`.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 349 — U11: publicação explícita da API

**Fonte:** ``});``

**O que faz:** Fecha o objeto passado a `Object.assign` e a chamada de publicação.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 350 — U11: publicação explícita da API

**Fonte:** ``})(globalThis);``

**O que faz:** Fecha e invoca a IIFE passando `globalThis`, tornando os exports acessíveis aos scripts seguintes da página.

**Como faz:** `Object.assign` publica somente constante/helpers escolhidos no `scope` da IIFE e em seguida fecha a invocação com `globalThis`.

**Por que foi implementado dessa forma:** Scripts clássicos das páginas consomem funções compartilhadas sem bundler/import ES, mantendo uma lista explícita do contrato global.

**Por que uma implementação ingênua seria pior:** Exportação implícita de todas as declarações aumentaria colisões e acoplamento; módulos ES exigiriam mudar o modo de carregamento das páginas e CSP/arquitetura.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para ordem de carregamento; ✅ execução real nos testes de integração que carregam o HTML e dependências. ⚠️ Não há teste dedicado que enumere exatamente todas as chaves exportadas.

### Linha 351 — U12: newline final

**Fonte:** ``⏎ [newline final]``

**O que faz:** Representa o LF terminal existente após a invocação da IIFE; não executa comportamento adicional.

**Como faz:** Representa explicitamente o LF terminal do blob auditado como posição documental adicional.

**Por que foi implementado dessa forma:** O gate documental conta `source.split('\n')`, portanto o terminador final precisa ter rastreabilidade própria.

**Por que uma implementação ingênua seria pior:** Ignorar a posição terminal produziria 350 headings para 351 posições e faria a auditoria estrutural rejeitar a Bíblia.

**Evidência automatizada:** 🟦 INTEGRIDADE DOCUMENTAL: `source.endsWith('\n')` e a contagem 351/351 são verificáveis contra o blob.

## 12. Autoauditoria desta Bíblia

- SHA lido diretamente do branch: `b284fb8eb0e8d30f34dc83642f07916d20012bf0`.
- Reserva relida antes da escrita: proprietário `Agente L`.
- Fonte integral inserida a partir do blob atual, sem elipses.
- Linhas textuais: 350.
- Newline final: sim.
- Posições documentais: 351.
- Headings `Linha N`: 351/351, sequenciais.
- Consumidores confirmados por código/HTML: Popup, Options e Reader.
- Testes reais do módulo abertos: `redo-confirmation.test.js`, integrações de Popup/Options, teste de XSS do Popup e helper real de carregamento.
- Gates/smokes foram classificados separadamente de prova comportamental direta.
- Lacunas não foram promovidas por mera ocorrência textual.
- Foram registrados sem alteração funcional os riscos de overlay concorrente, over-delete sem `chapterId`, migração parcial, resposta GTC negativa ignorada e falta de checagem de erro de storage.

**Estado documental desta materialização:** 🟠 EM ANDAMENTO — conteúdo integral e auditoria técnica preparados; a promoção a `✅ CONCLUÍDO` depende da seção crítica compartilhada com `AUDITORIA.md`, `STATUS.md`, `CHECKLIST.md` e PR #66.

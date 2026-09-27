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

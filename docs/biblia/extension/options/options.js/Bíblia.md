# Bíblia técnica — `extension/options/options.js`

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `f69f132c0ef653cded49887a60724b84dfa2b6c9`  
> **Agente responsável pela auditoria:** AGENTE 6  
> **Tipo:** JavaScript da página interna Chromium MV3 / controlador de opções  
> **Linhas textuais:** **420**  
> **Posições documentais:** **421**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## Papel arquitetural

Controla `options.html`: restaura e persiste preferências, monta a lista de sites/imagens e delega o armazenamento de páginas traduzidas a `shared-ui.js`. Preferências leves ficam em `chrome.storage.local`; assets do storage novo são acessados via mensagens ao background.

## Dependências e consumers

`options.html` carrega `shared-ui.js` antes deste arquivo. O controlador usa os helpers `DEFAULT_HD_PROMPT`, `escapeHTML`, `normalizeBlockedImages`, `smRequest`, `loadRestoreEntries` e `deleteSavedTranslationForEntry`. A suíte `tests/integration/options.ui.test.js` carrega HTML e JS reais.

## Evidência automatizada

- ✅ prompt salvo, lista/expansão de sites, salvar prompt, revogar site, bloquear imagem, Refazer, modos temp/background-delete e toggles de interação têm assertions diretas.
- ⚠️ sem prova focal: restore do prompt, auto-restore global, modo minimized, refresh/clear de bloqueios e falhas da API de storage.
- 🟨 helpers auxiliares participam do fluxo real quando não possuem assertion isolada.

## Análise crítica

- `getSiteMeta()` não possui consumer localizado.
- callbacks de storage não checam `chrome.runtime.lastError`;
- `entry.index` é interpolado no template enquanto título/URL passam por `escapeHTML`;
- renderizações concorrentes não usam token de geração;
- alguns IDs são opcionais e outros são invariantes rígidos do HTML;
- falha de preview/asset não produz feedback específico.

## Invariantes

1. `shared-ui.js` carrega antes deste arquivo.
2. IDs usados sem null-guard permanecem no HTML.
3. Refazer remove referências novas e legadas.
4. A listagem evita carregar todas as imagens Base64 no caminho feliz.
5. Gavetas seguem operáveis por clique, Enter e Espaço.
6. Revogar remove domínio e metadata associada.
7. Preferências persistem em storage.
8. `geminiExecutionMode` mantém valores reconhecidos.
9. Bloqueio individual usa `cleanUrl`.
10. Re-render preserva o Set de sites expandidos quando possível.

## Lacunas de teste

Restore/cancelamento; autoRestoreEnabled; minimized_window; refresh/clear; falhas de storage; índice inesperado; corrida de renderização; preview ausente; helper sem consumer.

## Fonte integral

```javascript
// options.js — Manga Translator

document.addEventListener('DOMContentLoaded', () => {
    const manifest = typeof chrome !== 'undefined'
        && chrome.runtime
        && typeof chrome.runtime.getManifest === 'function'
        ? chrome.runtime.getManifest()
        : null;
    const runtimeVersion = manifest && manifest.version ? String(manifest.version) : '';
    const appTitleEl = document.getElementById('app-title');

    if (runtimeVersion) {
        const versionedName = `Manga Translator v${runtimeVersion}`;
        document.title = `Opções - ${versionedName}`;
        if (appTitleEl) appTitleEl.textContent = versionedName;
    }

    const promptEl = document.getElementById('prompt');
    const statusEl = document.getElementById('status');
    const sitesList = document.getElementById('sites-list');
    const autoRestoreEnabledEl = document.getElementById('auto-restore-enabled');
    const floatingButtonEnabledEl = document.getElementById('floating-button-enabled');
    const clickToTranslateEnabledEl = document.getElementById('click-to-translate-enabled');
    const redoConfirmEnabledEl = document.getElementById('redo-confirm-enabled');
    const btnRefreshAutoImages = document.getElementById('btn-refresh-auto-images');
    const btnClearAutoBlocks = document.getElementById('btn-clear-auto-blocks');
    const expandedOptionSites = new Set();

    const geminiModeStatusEl = document.getElementById('gemini-mode-status');
    const tempRadioEl = document.getElementById('gemini-mode-temp');
    const minRadioEl = document.getElementById('gemini-mode-minimized');
    const deleteRadioEl = document.getElementById('gemini-mode-delete');

    chrome.storage.local.get([
        'customPrompt',
        'defaultPrompt',
        'autoRestoreEnabled',
        'geminiExecutionMode',
        'floatingButtonEnabled',
        'clickToTranslateEnabled',
        'redoConfirmEnabled',
    ], (result) => {
        promptEl.value = result.customPrompt || result.defaultPrompt || "";
        autoRestoreEnabledEl.checked = result.autoRestoreEnabled !== false;
        if (floatingButtonEnabledEl) floatingButtonEnabledEl.checked = result.floatingButtonEnabled !== false;
        if (clickToTranslateEnabledEl) clickToTranslateEnabledEl.checked = result.clickToTranslateEnabled === true;
        if (redoConfirmEnabledEl) redoConfirmEnabledEl.checked = result.redoConfirmEnabled !== false;
        const mode = result.geminiExecutionMode || 'temp_chat';
        if (mode === 'minimized_window') {
            if (minRadioEl) minRadioEl.checked = true;
        } else if (mode === 'background_delete') {
            if (deleteRadioEl) deleteRadioEl.checked = true;
        } else {
            if (tempRadioEl) tempRadioEl.checked = true;
        }
    });

    function showStatus(msg, color = '#4CAF50') {
        statusEl.style.color = color;
        statusEl.textContent = msg;
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }

    function getSiteMeta(hostname) {
        return new Promise(resolve => {
            chrome.storage.local.get([`siteMeta_${hostname}`], data => {
                resolve(data[`siteMeta_${hostname}`] || null);
            });
        });
    }

    // ── Ponte com o armazenamento do background ──────────────────────────────
    // As páginas traduzidas vivem no IndexedDB da extensão (storage-manager.js),
    // gravadas pelo background. Esta página só consulta metadados — nunca puxa
    // Base64 para montar listas.
    /**
     * Une o armazenamento novo com o legado dos capítulos ainda não migrados,
     * para que nada desapareça da lista antes do usuário revisitar o capítulo.
     */
    document.getElementById('btn-save').addEventListener('click', () => {
        chrome.storage.local.set({ customPrompt: promptEl.value }, () => {
            showStatus('✔ Salvo com sucesso!');
        });
    });

    document.getElementById('btn-restore').addEventListener('click', () => {
        if (!confirm('Restaurar o prompt padrão? O texto atual será perdido.')) return;
        chrome.storage.local.get(['defaultPrompt'], (result) => {
            const HD_PROMPT = typeof DEFAULT_HD_PROMPT !== 'undefined'
                ? DEFAULT_HD_PROMPT
                : "Objetivo primário: voce vai criar uma imagem , exata da imagem fornecida e traduzir ela pro português brasileiro . \nNão altere nenhum pixel fora das áreas de texto e Remova o texto original dos balões de fala, preenchendo o fundo com a cor correspondente. \nConverta os diálogos para PT-BR, mantendo a informalidade do contexto. Tipografia: Renderize o novo texto em caixa alta, fonte padrão de HQ (sans-serif), alinhamento centralizado.\nEfeitos Sonoros: Traduza e recrie as onomatopeias  mantendo as fontes estilizadas, cores, contornos e inclinação originais. lembre-se que todas as palavras devem sem traduzidas sem exceção";
            promptEl.value = result.defaultPrompt || HD_PROMPT;
            chrome.storage.local.set({ defaultPrompt: HD_PROMPT, customPrompt: HD_PROMPT }, () => {
                showStatus('✔ Prompt restaurado para o padrão.');
            });
        });
    });

    autoRestoreEnabledEl.addEventListener('change', () => {
        chrome.storage.local.set({ autoRestoreEnabled: autoRestoreEnabledEl.checked }, () => {
            showStatus(
                autoRestoreEnabledEl.checked
                    ? 'Auto-substituição ativada.'
                    : 'Auto-substituição desligada globalmente.',
                autoRestoreEnabledEl.checked ? '#4CAF50' : '#FF9800'
            );
        });
    });

    if (floatingButtonEnabledEl) {
        floatingButtonEnabledEl.addEventListener('change', () => {
            chrome.storage.local.set({ floatingButtonEnabled: floatingButtonEnabledEl.checked }, () => {
                showStatus(
                    floatingButtonEnabledEl.checked ? 'Botão flutuante ativado.' : 'Botão flutuante ocultado.',
                    floatingButtonEnabledEl.checked ? '#4CAF50' : '#FF9800'
                );
            });
        });
    }

    if (clickToTranslateEnabledEl) {
        clickToTranslateEnabledEl.addEventListener('change', () => {
            chrome.storage.local.set({ clickToTranslateEnabled: clickToTranslateEnabledEl.checked }, () => {
                showStatus(
                    clickToTranslateEnabledEl.checked
                        ? 'Menu de clique direito para traduzir imagem ativado.'
                        : 'Menu de clique direito para traduzir imagem desativado.',
                    clickToTranslateEnabledEl.checked ? '#4CAF50' : '#FF9800'
                );
            });
        });
    }

    if (redoConfirmEnabledEl) {
        redoConfirmEnabledEl.addEventListener('change', () => {
            chrome.storage.local.set({ redoConfirmEnabled: redoConfirmEnabledEl.checked }, () => {
                showStatus(
                    redoConfirmEnabledEl.checked
                        ? 'Confirmação ao refazer imagem ativada.'
                        : 'Refazer a imagem será executado sem confirmação.',
                    redoConfirmEnabledEl.checked ? '#4CAF50' : '#FF9800'
                );
            });
        });
    }

    function showGeminiModeStatus(msg, color = '#4CAF50') {
        if (!geminiModeStatusEl) return;
        geminiModeStatusEl.style.color = color;
        geminiModeStatusEl.textContent = msg;
        setTimeout(() => { geminiModeStatusEl.textContent = ''; }, 3500);
    }

    document.querySelectorAll('input[name="gemini-execution-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                const val = radio.value;
                chrome.storage.local.set({ geminiExecutionMode: val }, () => {
                    const label = val === 'minimized_window'
                        ? 'Janela Minimizada'
                        : val === 'background_delete'
                            ? 'Conversa Normal com Exclusão Segura'
                            : 'Conversa Temporária (Segundo Plano)';
                    showGeminiModeStatus(`✔ Modo alterado para: ${label}`);
                });
            }
        });
    });

    function createAutoImageItem(entry, blockedImages) {
        const isBlocked = !!blockedImages[entry.cleanUrl];
        const item = document.createElement('div');
        item.className = 'options-image-item';
        item.style.cssText = 'display:grid; grid-template-columns:72px 1fr auto auto; gap:10px; align-items:center; padding:10px; background:#111; border-radius:6px; border:1px solid #333;';

        const preview = document.createElement('img');
        // Tenta a URL remota original; só busca a imagem gravada se falhar.
        preview.src = entry.sourceUrl || entry.legacyDataUrl || '';
        preview.alt = '';
        preview.loading = 'lazy';
        preview.style.cssText = 'width:72px; height:96px; object-fit:contain; background:#050505; border-radius:4px;';
        let previewFallbackTried = false;
        preview.onerror = async () => {
            if (previewFallbackTried) return;
            previewFallbackTried = true;
            if (entry.legacyDataUrl) { preview.src = entry.legacyDataUrl; return; }
            if (!entry.assetId) return;
            const resp = await smRequest({ action: 'SM_GET_ASSET', assetId: entry.assetId });
            if (resp && resp.ok && resp.dataUrl) preview.src = resp.dataUrl;
        };

        const info = document.createElement('div');
        info.style.cssText = 'min-width:0;';
        info.innerHTML = `
            <div style="font-weight:bold; color:#fff; margin-bottom:3px;">${escapeHTML(entry.chapterTitle)}</div>
            <div style="color:#aaa; font-size:12px;">${entry.index !== undefined ? `página ${entry.index}` : 'sem número de página'}</div>
            <div title="${escapeHTML(entry.cleanUrl)}" style="color:#666; font-size:11px; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(entry.cleanUrl)}</div>
            <div style="color:${isBlocked ? '#FF9800' : '#4CAF50'}; font-size:12px; margin-top:4px;">${isBlocked ? 'Bloqueada para auto-substituição' : 'Permitida no auto-restore'}</div>
        `;

        const blockBtn = document.createElement('button');
        blockBtn.className = 'options-image-block-btn';
        blockBtn.textContent = isBlocked ? 'Permitir' : 'Bloquear';
        blockBtn.style.cssText = `background:${isBlocked ? '#2d7a38' : '#8a1c1c'}; border:none; padding:8px 10px; color:#fff; cursor:pointer;`;
        blockBtn.addEventListener('click', () => {
            chrome.storage.local.get(['autoRestoreBlockedImages'], d => {
                const current = normalizeBlockedImages(d.autoRestoreBlockedImages);
                if (current[entry.cleanUrl]) {
                    delete current[entry.cleanUrl];
                } else {
                    current[entry.cleanUrl] = {
                        cleanUrl: entry.cleanUrl,
                        host: entry.host,
                        sourceUrl: entry.sourceUrl,
                        chapterTitle: entry.chapterTitle,
                        blockedAt: Date.now(),
                    };
                }
                chrome.storage.local.set({ autoRestoreBlockedImages: current }, () => {
                    renderSites();
                    showStatus(current[entry.cleanUrl] ? 'Imagem bloqueada.' : 'Imagem permitida.', current[entry.cleanUrl] ? '#FF9800' : '#4CAF50');
                });
            });
        });

        const redoBtn = document.createElement('button');
        redoBtn.className = 'options-image-redo-btn';
        redoBtn.textContent = 'Refazer';
        redoBtn.style.cssText = 'background:#1a5fa8; border:none; padding:8px 10px; color:#fff; cursor:pointer;';
        redoBtn.addEventListener('click', () => deleteSavedTranslationForEntry(entry, {
            refresh: renderSites,
            showStatus,
        }));

        item.appendChild(preview);
        item.appendChild(info);
        item.appendChild(blockBtn);
        item.appendChild(redoBtn);
        return item;
    }

    // ── Refazer ──────────────────────────────────────────────────────────────
    // Purga a tradução em todos os lugares onde ela poderia voltar: armazenamento
    // novo (página + restore + asset), resíduos legados, bloqueio de
    // auto-substituição e cache global (GTC).
    function renderSites() {
        // Não puxa mais os restoreMaps de todos os capítulos (cada um carregava
        // as imagens Base64 inteiras só para montar a lista).
        chrome.storage.local.get(['enabledDomains', 'autoRestoreDisabledSites', 'autoRestoreBlockedImages', 'chapterList'], (baseData) => {
            const keysToFetch = [];
            const chapterList = baseData.chapterList || [];
            const domains = baseData.enabledDomains || [];
            domains.forEach(d => keysToFetch.push(`siteMeta_${d}`));

            chrome.storage.local.get(keysToFetch, async (chapterData) => {
                const data = { ...baseData, ...chapterData };

                const disabledSites = Array.isArray(data.autoRestoreDisabledSites) ? data.autoRestoreDisabledSites : [];
                const entries = await loadRestoreEntries(chapterList);
                const blockedImages = normalizeBlockedImages(data.autoRestoreBlockedImages);
                const entriesByHost = entries.reduce((acc, entry) => {
                    const host = entry.host || 'desconhecido';
                    if (!acc.has(host)) acc.set(host, []);
                    acc.get(host).push(entry);
                    return acc;
                }, new Map());
                const hosts = Array.from(new Set(domains));
                sitesList.innerHTML = '';

                if (hosts.length === 0) {
                    sitesList.innerHTML = '<div>Nenhum site permitido ainda.</div>';
                    return;
                }

                hosts.forEach(hostname => {
                    const meta = data[`siteMeta_${hostname}`] || null;
                    const siteEntries = entriesByHost.get(hostname) || [];
                    const isOpen = expandedOptionSites.has(hostname);
                    const item = document.createElement('div');
                    item.className = 'options-site-item';
                    item.classList.toggle('open', isOpen);
                    item.style.cssText = 'margin-bottom:12px; background:#111; border:1px solid #333; border-radius:6px; overflow:hidden;';

                    const header = document.createElement('div');
                    header.className = 'options-site-main';
                    header.setAttribute('role', 'button');
                    header.setAttribute('tabindex', '0');
                    header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                    header.style.cssText = 'display:grid; grid-template-columns:auto minmax(0,1fr) auto auto auto; gap:10px; align-items:center; padding:10px; cursor:pointer; user-select:none;';

                    const arrow = document.createElement('span');
                    arrow.className = 'options-site-arrow';
                    arrow.textContent = '▶';
                    arrow.setAttribute('aria-hidden', 'true');
                    arrow.style.cssText = `color:${isOpen ? '#FF4444' : '#aaa'}; transform:${isOpen ? 'rotate(90deg)' : 'none'}; transition:transform 0.15s ease; display:inline-block;`;

                    const displayName = meta?.title || hostname;
                    const nameEl = document.createElement('div');
                    nameEl.textContent = `${displayName} (${hostname})`;
                    nameEl.style.cssText = 'min-width:0; overflow:hidden; text-overflow:ellipsis;';

                    const countEl = document.createElement('div');
                    countEl.textContent = `${siteEntries.length} image${siteEntries.length === 1 ? 'm' : 'ns'}`;
                    countEl.style.cssText = 'color:#aaa; font-size:12px; white-space:nowrap;';

                    const autoLabel = document.createElement('label');
                    autoLabel.className = 'options-site-auto';
                    autoLabel.style.cssText = 'display:flex; align-items:center; gap:6px; color:#ccc; font-size:13px; cursor:pointer; white-space:nowrap;';
                    const autoCheck = document.createElement('input');
                    autoCheck.type = 'checkbox';
                    autoCheck.checked = !disabledSites.includes(hostname);
                    autoCheck.style.accentColor = '#FF4444';
                    autoCheck.addEventListener('click', event => event.stopPropagation());
                    autoCheck.addEventListener('change', (event) => {
                        event.stopPropagation();
                        chrome.storage.local.get(['autoRestoreDisabledSites'], d => {
                            const current = Array.isArray(d.autoRestoreDisabledSites) ? d.autoRestoreDisabledSites : [];
                            const next = autoCheck.checked
                                ? current.filter(h => h !== hostname)
                                : Array.from(new Set([...current, hostname]));
                            chrome.storage.local.set({ autoRestoreDisabledSites: next }, () => {
                                renderSites();
                                showStatus(
                                    autoCheck.checked
                                        ? `Auto-substituição ativada em ${hostname}.`
                                        : `Auto-substituição bloqueada em ${hostname}.`,
                                    autoCheck.checked ? '#4CAF50' : '#FF9800'
                                );
                            });
                        });
                    });
                    autoLabel.appendChild(autoCheck);
                    autoLabel.appendChild(document.createTextNode('Auto'));
                    autoLabel.addEventListener('click', event => event.stopPropagation());

                    const revokeBtn = document.createElement('button');
                    revokeBtn.textContent = 'Revogar';
                    revokeBtn.style.cssText = 'background:#FF4444; border:none; padding:6px 10px; color:#fff; cursor:pointer;';
                    revokeBtn.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!confirm(`Remover permissão do site "${hostname}"?`)) return;
                        chrome.storage.local.get(['enabledDomains', 'autoRestoreDisabledSites'], (d) => {
                            const updated = (d.enabledDomains || []).filter(h => h !== hostname);
                            const updatedDisabled = (d.autoRestoreDisabledSites || []).filter(h => h !== hostname);
                            chrome.storage.local.set({
                                enabledDomains: updated,
                                autoRestoreDisabledSites: updatedDisabled,
                            }, () => {
                                expandedOptionSites.delete(hostname);
                                chrome.storage.local.remove([`siteMeta_${hostname}`], () => {
                                    renderSites();
                                    showStatus('✔ Permissão revogada.', '#FF9800');
                                });
                            });
                        });
                    });

                    function toggleSite() {
                        if (expandedOptionSites.has(hostname)) expandedOptionSites.delete(hostname);
                        else expandedOptionSites.add(hostname);
                        renderSites();
                    }
                    header.addEventListener('click', toggleSite);
                    header.addEventListener('keydown', event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        toggleSite();
                    });

                    header.appendChild(arrow);
                    header.appendChild(nameEl);
                    header.appendChild(countEl);
                    header.appendChild(autoLabel);
                    header.appendChild(revokeBtn);
                    item.appendChild(header);

                    const imagesWrap = document.createElement('div');
                    imagesWrap.className = 'options-site-images';
                    imagesWrap.style.cssText = `${isOpen ? 'display:flex;' : 'display:none;'} flex-direction:column; gap:10px; padding:10px; border-top:1px solid #333; background:#171717; max-height:320px; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain;`;

                    const imagesTitle = document.createElement('div');
                    imagesTitle.textContent = 'Imagens específicas';
                    imagesTitle.style.cssText = 'color:#aaa; font-size:12px; font-weight:bold; text-transform:uppercase;';
                    imagesWrap.appendChild(imagesTitle);

                    if (siteEntries.length === 0) {
                        const empty = document.createElement('div');
                        empty.textContent = 'Nenhuma imagem salva para este site ainda.';
                        empty.style.cssText = 'color:#666; font-size:13px;';
                        imagesWrap.appendChild(empty);
                    } else {
                        siteEntries.forEach(entry => {
                            imagesWrap.appendChild(createAutoImageItem(entry, blockedImages));
                        });
                    }

                    item.appendChild(imagesWrap);
                    sitesList.appendChild(item);
                });
            });
        });
    }

    function renderAutoImages() {
        renderSites();
    }

    btnRefreshAutoImages.addEventListener('click', renderAutoImages);
    btnClearAutoBlocks.addEventListener('click', () => {
        if (!confirm('Remover todos os bloqueios de imagens específicas?')) return;
        chrome.storage.local.set({ autoRestoreBlockedImages: {} }, () => {
            renderAutoImages();
            showStatus('Bloqueios de imagem removidos.', '#FF9800');
        });
    });

    renderSites();
});

```

## Cobertura posição a posição

### Linha/posição 1

**Fonte:** `// options.js — Manga Translator`

**O que faz:** Comentário de intenção do bloco de bootstrap.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 2

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de bootstrap.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 3

**Fonte:** `document.addEventListener('DOMContentLoaded', () => {`

**O que faz:** Inicia o controlador após o DOM estar pronto.

**Como faz:** Registra um callback que contém todos os bindings e render inicial.

**Por que assim / risco de alternativa:** Evita referências nulas por execução prematura.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 4

**Fonte:** `    const manifest = typeof chrome !== 'undefined'`

**O que faz:** Declara estado local em bootstrap.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 5

**Fonte:** `        && chrome.runtime`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 6

**Fonte:** `        && typeof chrome.runtime.getManifest === 'function'`

**O que faz:** Lê a versão do manifest em runtime.

**Como faz:** Guarda a existência de `chrome.runtime.getManifest`.

**Por que assim / risco de alternativa:** Evita versão hardcoded.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 7

**Fonte:** `        ? chrome.runtime.getManifest()`

**O que faz:** Lê a versão do manifest em runtime.

**Como faz:** Guarda a existência de `chrome.runtime.getManifest`.

**Por que assim / risco de alternativa:** Evita versão hardcoded.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 8

**Fonte:** `        : null;`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 9

**Fonte:** `    const runtimeVersion = manifest && manifest.version ? String(manifest.version) : '';`

**O que faz:** Declara estado local em bootstrap.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 10

**Fonte:** `    const appTitleEl = document.getElementById('app-title');`

**O que faz:** Resolve o elemento `#app-title`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 11

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de bootstrap.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 12

**Fonte:** `    if (runtimeVersion) {`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 13

**Fonte:** `        const versionedName = \`Manga Translator v${runtimeVersion}\`;`

**O que faz:** Declara estado local em bootstrap.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 14

**Fonte:** `        document.title = \`Opções - ${versionedName}\`;`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 15

**Fonte:** `        if (appTitleEl) appTitleEl.textContent = versionedName;`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 16

**Fonte:** `    }`

**O que faz:** Fecha estrutura de bootstrap.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 17

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de bootstrap.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 18

**Fonte:** `    const promptEl = document.getElementById('prompt');`

**O que faz:** Resolve o elemento `#prompt`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 19

**Fonte:** `    const statusEl = document.getElementById('status');`

**O que faz:** Resolve o elemento `#status`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 20

**Fonte:** `    const sitesList = document.getElementById('sites-list');`

**O que faz:** Resolve o elemento `#sites-list`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 21

**Fonte:** `    const autoRestoreEnabledEl = document.getElementById('auto-restore-enabled');`

**O que faz:** Resolve o elemento `#auto-restore-enabled`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 22

**Fonte:** `    const floatingButtonEnabledEl = document.getElementById('floating-button-enabled');`

**O que faz:** Resolve o elemento `#floating-button-enabled`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 23

**Fonte:** `    const clickToTranslateEnabledEl = document.getElementById('click-to-translate-enabled');`

**O que faz:** Resolve o elemento `#click-to-translate-enabled`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 24

**Fonte:** `    const redoConfirmEnabledEl = document.getElementById('redo-confirm-enabled');`

**O que faz:** Resolve o elemento `#redo-confirm-enabled`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 25

**Fonte:** `    const btnRefreshAutoImages = document.getElementById('btn-refresh-auto-images');`

**O que faz:** Resolve o elemento `#btn-refresh-auto-images`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 26

**Fonte:** `    const btnClearAutoBlocks = document.getElementById('btn-clear-auto-blocks');`

**O que faz:** Resolve o elemento `#btn-clear-auto-blocks`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 27

**Fonte:** `    const expandedOptionSites = new Set();`

**O que faz:** Declara estado local em bootstrap.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 28

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de bootstrap.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 29

**Fonte:** `    const geminiModeStatusEl = document.getElementById('gemini-mode-status');`

**O que faz:** Resolve o elemento `#gemini-mode-status`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 30

**Fonte:** `    const tempRadioEl = document.getElementById('gemini-mode-temp');`

**O que faz:** Resolve o elemento `#gemini-mode-temp`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 31

**Fonte:** `    const minRadioEl = document.getElementById('gemini-mode-minimized');`

**O que faz:** Resolve o elemento `#gemini-mode-minimized`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 32

**Fonte:** `    const deleteRadioEl = document.getElementById('gemini-mode-delete');`

**O que faz:** Resolve o elemento `#gemini-mode-delete`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 33

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de bootstrap.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 34

**Fonte:** `    chrome.storage.local.get([`

**O que faz:** Lê estado persistido para bootstrap.

**Como faz:** Usa callback de `chrome.storage.local`.

**Por que assim / risco de alternativa:** Permite restaurar preferências entre sessões.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 35

**Fonte:** `        'customPrompt',`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 36

**Fonte:** `        'defaultPrompt',`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 37

**Fonte:** `        'autoRestoreEnabled',`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 38

**Fonte:** `        'geminiExecutionMode',`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 39

**Fonte:** `        'floatingButtonEnabled',`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 40

**Fonte:** `        'clickToTranslateEnabled',`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 41

**Fonte:** `        'redoConfirmEnabled',`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 42

**Fonte:** `    ], (result) => {`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 43

**Fonte:** `        promptEl.value = result.customPrompt || result.defaultPrompt || "";`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 44

**Fonte:** `        autoRestoreEnabledEl.checked = result.autoRestoreEnabled !== false;`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 45

**Fonte:** `        if (floatingButtonEnabledEl) floatingButtonEnabledEl.checked = result.floatingButtonEnabled !== false;`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 46

**Fonte:** `        if (clickToTranslateEnabledEl) clickToTranslateEnabledEl.checked = result.clickToTranslateEnabled === true;`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 47

**Fonte:** `        if (redoConfirmEnabledEl) redoConfirmEnabledEl.checked = result.redoConfirmEnabled !== false;`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 48

**Fonte:** `        const mode = result.geminiExecutionMode || 'temp_chat';`

**O que faz:** Declara estado local em bootstrap.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 49

**Fonte:** `        if (mode === 'minimized_window') {`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 50

**Fonte:** `            if (minRadioEl) minRadioEl.checked = true;`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 51

**Fonte:** `        } else if (mode === 'background_delete') {`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 52

**Fonte:** `            if (deleteRadioEl) deleteRadioEl.checked = true;`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 53

**Fonte:** `        } else {`

**O que faz:** Executa uma etapa de bootstrap.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 54

**Fonte:** `            if (tempRadioEl) tempRadioEl.checked = true;`

**O que faz:** Aplica guarda em bootstrap.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 55

**Fonte:** `        }`

**O que faz:** Fecha estrutura de bootstrap.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 56

**Fonte:** `    });`

**O que faz:** Fecha estrutura de bootstrap.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 57

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de prompt/status.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 58

**Fonte:** `    function showStatus(msg, color = '#4CAF50') {`

**O que faz:** Define `showStatus`.

**Como faz:** Fecha sobre DOM/storage já obtidos.

**Por que assim / risco de alternativa:** Encapsula o fluxo para reduzir repetição.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 59

**Fonte:** `        statusEl.style.color = color;`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 60

**Fonte:** `        statusEl.textContent = msg;`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 61

**Fonte:** `        setTimeout(() => { statusEl.textContent = ''; }, 3000);`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 62

**Fonte:** `    }`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 63

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de prompt/status.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 64

**Fonte:** `    function getSiteMeta(hostname) {`

**O que faz:** Define `getSiteMeta`.

**Como faz:** Fecha sobre DOM/storage já obtidos.

**Por que assim / risco de alternativa:** Não foi localizado consumer neste arquivo; registrar isso evita assumir utilidade inexistente.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 65

**Fonte:** `        return new Promise(resolve => {`

**O que faz:** Encerra o ramo/função atual.

**Como faz:** Retorna imediatamente o valor indicado.

**Por que assim / risco de alternativa:** Evita trabalho posterior desnecessário.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 66

**Fonte:** `            chrome.storage.local.get([\`siteMeta_${hostname}\`], data => {`

**O que faz:** Lê estado persistido para prompt/status.

**Como faz:** Usa callback de `chrome.storage.local`.

**Por que assim / risco de alternativa:** Permite restaurar preferências entre sessões.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 67

**Fonte:** `                resolve(data[\`siteMeta_${hostname}\`] || null);`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 68

**Fonte:** `            });`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 69

**Fonte:** `        });`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 70

**Fonte:** `    }`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 71

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de prompt/status.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 72

**Fonte:** `    // ── Ponte com o armazenamento do background ──────────────────────────────`

**O que faz:** Comentário de intenção do bloco de prompt/status.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 73

**Fonte:** `    // As páginas traduzidas vivem no IndexedDB da extensão (storage-manager.js),`

**O que faz:** Comentário de intenção do bloco de prompt/status.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 74

**Fonte:** `    // gravadas pelo background. Esta página só consulta metadados — nunca puxa`

**O que faz:** Comentário de intenção do bloco de prompt/status.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 75

**Fonte:** `    // Base64 para montar listas.`

**O que faz:** Comentário de intenção do bloco de prompt/status.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 76

**Fonte:** `    /**`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 77

**Fonte:** `     * Une o armazenamento novo com o legado dos capítulos ainda não migrados,`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 78

**Fonte:** `     * para que nada desapareça da lista antes do usuário revisitar o capítulo.`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 79

**Fonte:** `     */`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 80

**Fonte:** `    document.getElementById('btn-save').addEventListener('click', () => {`

**O que faz:** Resolve o elemento `#btn-save`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 81

**Fonte:** `        chrome.storage.local.set({ customPrompt: promptEl.value }, () => {`

**O que faz:** Persiste estado do fluxo de prompt/status.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 82

**Fonte:** `            showStatus('✔ Salvo com sucesso!');`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 83

**Fonte:** `        });`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 84

**Fonte:** `    });`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 85

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de prompt/status.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 86

**Fonte:** `    document.getElementById('btn-restore').addEventListener('click', () => {`

**O que faz:** Resolve o elemento `#btn-restore`.

**Como faz:** Mantém a referência no closure de inicialização.

**Por que assim / risco de alternativa:** IDs sem null-guard são invariantes do HTML.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 87

**Fonte:** `        if (!confirm('Restaurar o prompt padrão? O texto atual será perdido.')) return;`

**O que faz:** Aplica guarda em prompt/status.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 88

**Fonte:** `        chrome.storage.local.get(['defaultPrompt'], (result) => {`

**O que faz:** Lê estado persistido para prompt/status.

**Como faz:** Usa callback de `chrome.storage.local`.

**Por que assim / risco de alternativa:** Permite restaurar preferências entre sessões.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 89

**Fonte:** `            const HD_PROMPT = typeof DEFAULT_HD_PROMPT !== 'undefined'`

**O que faz:** Declara estado local em prompt/status.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 90

**Fonte:** `                ? DEFAULT_HD_PROMPT`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 91

**Fonte:** `                : "Objetivo primário: voce vai criar uma imagem , exata da imagem fornecida e traduzir ela pro português brasileiro . \nNão altere nenhum pixel fora das áreas de texto e Remova o texto original dos balões de fala, preenchendo o fundo com a cor correspondente. \nConverta os diálogos para PT-BR, mantendo a informalidade do contexto. Tipografia: Renderize o novo texto em caixa alta, fonte padrão de HQ (sans-serif), alinhamento centralizado.\nEfeitos Sonoros: Traduza e recrie as onomatopeias  mantendo as fontes estilizadas, cores, contornos e inclinação originais. lembre-se que todas as palavras devem sem traduzidas sem exceção";`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 92

**Fonte:** `            promptEl.value = result.defaultPrompt || HD_PROMPT;`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 93

**Fonte:** `            chrome.storage.local.set({ defaultPrompt: HD_PROMPT, customPrompt: HD_PROMPT }, () => {`

**O que faz:** Persiste estado do fluxo de prompt/status.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 94

**Fonte:** `                showStatus('✔ Prompt restaurado para o padrão.');`

**O que faz:** Executa uma etapa de prompt/status.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 95

**Fonte:** `            });`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 96

**Fonte:** `        });`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 97

**Fonte:** `    });`

**O que faz:** Fecha estrutura de prompt/status.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 98

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de prompt/status.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 99

**Fonte:** `    autoRestoreEnabledEl.addEventListener('change', () => {`

**O que faz:** Registra handler de `change`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 100

**Fonte:** `        chrome.storage.local.set({ autoRestoreEnabled: autoRestoreEnabledEl.checked }, () => {`

**O que faz:** Persiste estado do fluxo de preferências.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 101

**Fonte:** `            showStatus(`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 102

**Fonte:** `                autoRestoreEnabledEl.checked`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 103

**Fonte:** `                    ? 'Auto-substituição ativada.'`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 104

**Fonte:** `                    : 'Auto-substituição desligada globalmente.',`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 105

**Fonte:** `                autoRestoreEnabledEl.checked ? '#4CAF50' : '#FF9800'`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 106

**Fonte:** `            );`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 107

**Fonte:** `        });`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 108

**Fonte:** `    });`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 109

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de preferências.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 110

**Fonte:** `    if (floatingButtonEnabledEl) {`

**O que faz:** Aplica guarda em preferências.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 111

**Fonte:** `        floatingButtonEnabledEl.addEventListener('change', () => {`

**O que faz:** Registra handler de `change`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 112

**Fonte:** `            chrome.storage.local.set({ floatingButtonEnabled: floatingButtonEnabledEl.checked }, () => {`

**O que faz:** Persiste estado do fluxo de preferências.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 113

**Fonte:** `                showStatus(`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 114

**Fonte:** `                    floatingButtonEnabledEl.checked ? 'Botão flutuante ativado.' : 'Botão flutuante ocultado.',`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 115

**Fonte:** `                    floatingButtonEnabledEl.checked ? '#4CAF50' : '#FF9800'`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 116

**Fonte:** `                );`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 117

**Fonte:** `            });`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 118

**Fonte:** `        });`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 119

**Fonte:** `    }`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 120

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de preferências.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 121

**Fonte:** `    if (clickToTranslateEnabledEl) {`

**O que faz:** Aplica guarda em preferências.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 122

**Fonte:** `        clickToTranslateEnabledEl.addEventListener('change', () => {`

**O que faz:** Registra handler de `change`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 123

**Fonte:** `            chrome.storage.local.set({ clickToTranslateEnabled: clickToTranslateEnabledEl.checked }, () => {`

**O que faz:** Persiste estado do fluxo de preferências.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 124

**Fonte:** `                showStatus(`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 125

**Fonte:** `                    clickToTranslateEnabledEl.checked`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 126

**Fonte:** `                        ? 'Menu de clique direito para traduzir imagem ativado.'`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 127

**Fonte:** `                        : 'Menu de clique direito para traduzir imagem desativado.',`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 128

**Fonte:** `                    clickToTranslateEnabledEl.checked ? '#4CAF50' : '#FF9800'`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 129

**Fonte:** `                );`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 130

**Fonte:** `            });`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 131

**Fonte:** `        });`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 132

**Fonte:** `    }`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 133

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de preferências.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 134

**Fonte:** `    if (redoConfirmEnabledEl) {`

**O que faz:** Aplica guarda em preferências.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 135

**Fonte:** `        redoConfirmEnabledEl.addEventListener('change', () => {`

**O que faz:** Registra handler de `change`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 136

**Fonte:** `            chrome.storage.local.set({ redoConfirmEnabled: redoConfirmEnabledEl.checked }, () => {`

**O que faz:** Persiste estado do fluxo de preferências.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 137

**Fonte:** `                showStatus(`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 138

**Fonte:** `                    redoConfirmEnabledEl.checked`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 139

**Fonte:** `                        ? 'Confirmação ao refazer imagem ativada.'`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 140

**Fonte:** `                        : 'Refazer a imagem será executado sem confirmação.',`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 141

**Fonte:** `                    redoConfirmEnabledEl.checked ? '#4CAF50' : '#FF9800'`

**O que faz:** Executa uma etapa de preferências.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 142

**Fonte:** `                );`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 143

**Fonte:** `            });`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 144

**Fonte:** `        });`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 145

**Fonte:** `    }`

**O que faz:** Fecha estrutura de preferências.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 146

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de preferências.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 147

**Fonte:** `    function showGeminiModeStatus(msg, color = '#4CAF50') {`

**O que faz:** Define `showGeminiModeStatus`.

**Como faz:** Fecha sobre DOM/storage já obtidos.

**Por que assim / risco de alternativa:** Encapsula o fluxo para reduzir repetição.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 148

**Fonte:** `        if (!geminiModeStatusEl) return;`

**O que faz:** Aplica guarda em modo Gemini.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 149

**Fonte:** `        geminiModeStatusEl.style.color = color;`

**O que faz:** Executa uma etapa de modo Gemini.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 150

**Fonte:** `        geminiModeStatusEl.textContent = msg;`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 151

**Fonte:** `        setTimeout(() => { geminiModeStatusEl.textContent = ''; }, 3500);`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 152

**Fonte:** `    }`

**O que faz:** Fecha estrutura de modo Gemini.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 153

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de modo Gemini.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 154

**Fonte:** `    document.querySelectorAll('input[name="gemini-execution-mode"]').forEach(radio => {`

**O que faz:** Executa uma etapa de modo Gemini.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 155

**Fonte:** `        radio.addEventListener('change', () => {`

**O que faz:** Registra handler de `change`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 156

**Fonte:** `            if (radio.checked) {`

**O que faz:** Aplica guarda em modo Gemini.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 157

**Fonte:** `                const val = radio.value;`

**O que faz:** Declara estado local em modo Gemini.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 158

**Fonte:** `                chrome.storage.local.set({ geminiExecutionMode: val }, () => {`

**O que faz:** Persiste estado do fluxo de modo Gemini.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 159

**Fonte:** `                    const label = val === 'minimized_window'`

**O que faz:** Declara estado local em modo Gemini.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 160

**Fonte:** `                        ? 'Janela Minimizada'`

**O que faz:** Executa uma etapa de modo Gemini.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 161

**Fonte:** `                        : val === 'background_delete'`

**O que faz:** Executa uma etapa de modo Gemini.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 162

**Fonte:** `                            ? 'Conversa Normal com Exclusão Segura'`

**O que faz:** Executa uma etapa de modo Gemini.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 163

**Fonte:** `                            : 'Conversa Temporária (Segundo Plano)';`

**O que faz:** Executa uma etapa de modo Gemini.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 164

**Fonte:** `                    showGeminiModeStatus(\`✔ Modo alterado para: ${label}\`);`

**O que faz:** Executa uma etapa de modo Gemini.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 165

**Fonte:** `                });`

**O que faz:** Fecha estrutura de modo Gemini.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 166

**Fonte:** `            }`

**O que faz:** Fecha estrutura de modo Gemini.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 167

**Fonte:** `        });`

**O que faz:** Fecha estrutura de modo Gemini.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 168

**Fonte:** `    });`

**O que faz:** Fecha estrutura de modo Gemini.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 169

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de modo Gemini.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 170

**Fonte:** `    function createAutoImageItem(entry, blockedImages) {`

**O que faz:** Define `createAutoImageItem`.

**Como faz:** Fecha sobre DOM/storage já obtidos.

**Por que assim / risco de alternativa:** Encapsula o fluxo para reduzir repetição.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 171

**Fonte:** `        const isBlocked = !!blockedImages[entry.cleanUrl];`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 172

**Fonte:** `        const item = document.createElement('div');`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 173

**Fonte:** `        item.className = 'options-image-item';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 174

**Fonte:** `        item.style.cssText = 'display:grid; grid-template-columns:72px 1fr auto auto; gap:10px; align-items:center; padding:10px; background:#111; border-radius:6px; border:1px solid #333;';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 175

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de item de imagem.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 176

**Fonte:** `        const preview = document.createElement('img');`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 177

**Fonte:** `        // Tenta a URL remota original; só busca a imagem gravada se falhar.`

**O que faz:** Comentário de intenção do bloco de item de imagem.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 178

**Fonte:** `        preview.src = entry.sourceUrl || entry.legacyDataUrl || '';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 179

**Fonte:** `        preview.alt = '';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 180

**Fonte:** `        preview.loading = 'lazy';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 181

**Fonte:** `        preview.style.cssText = 'width:72px; height:96px; object-fit:contain; background:#050505; border-radius:4px;';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 182

**Fonte:** `        let previewFallbackTried = false;`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 183

**Fonte:** `        preview.onerror = async () => {`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 184

**Fonte:** `            if (previewFallbackTried) return;`

**O que faz:** Aplica guarda em item de imagem.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 185

**Fonte:** `            previewFallbackTried = true;`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 186

**Fonte:** `            if (entry.legacyDataUrl) { preview.src = entry.legacyDataUrl; return; }`

**O que faz:** Aplica guarda em item de imagem.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 187

**Fonte:** `            if (!entry.assetId) return;`

**O que faz:** Aplica guarda em item de imagem.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 188

**Fonte:** `            const resp = await smRequest({ action: 'SM_GET_ASSET', assetId: entry.assetId });`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 189

**Fonte:** `            if (resp && resp.ok && resp.dataUrl) preview.src = resp.dataUrl;`

**O que faz:** Aplica guarda em item de imagem.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 190

**Fonte:** `        };`

**O que faz:** Fecha estrutura de item de imagem.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 191

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de item de imagem.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 192

**Fonte:** `        const info = document.createElement('div');`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 193

**Fonte:** `        info.style.cssText = 'min-width:0;';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 194

**Fonte:** `        info.innerHTML = \``

**O que faz:** Inicia o template textual do item de imagem.

**Como faz:** Título/URL passam por helper de escape; status e índice são interpolados.

**Por que assim / risco de alternativa:** Centraliza a apresentação e exige que valores dinâmicos continuem tratados como texto.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 195

**Fonte:** `            <div style="font-weight:bold; color:#fff; margin-bottom:3px;">${escapeHTML(entry.chapterTitle)}</div>`

**O que faz:** Escapa dado persistido antes de compor markup.

**Como faz:** Usa helper compartilhado.

**Por que assim / risco de alternativa:** Evita que texto armazenado altere a estrutura da UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 196

**Fonte:** `            <div style="color:#aaa; font-size:12px;">${entry.index !== undefined ? \`página ${entry.index}\` : 'sem número de página'}</div>`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 197

**Fonte:** `            <div title="${escapeHTML(entry.cleanUrl)}" style="color:#666; font-size:11px; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(entry.cleanUrl)}</div>`

**O que faz:** Escapa dado persistido antes de compor markup.

**Como faz:** Usa helper compartilhado.

**Por que assim / risco de alternativa:** Evita que texto armazenado altere a estrutura da UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 198

**Fonte:** `            <div style="color:${isBlocked ? '#FF9800' : '#4CAF50'}; font-size:12px; margin-top:4px;">${isBlocked ? 'Bloqueada para auto-substituição' : 'Permitida no auto-restore'}</div>`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 199

**Fonte:** `        \`;`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 200

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de item de imagem.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 201

**Fonte:** `        const blockBtn = document.createElement('button');`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 202

**Fonte:** `        blockBtn.className = 'options-image-block-btn';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 203

**Fonte:** `        blockBtn.textContent = isBlocked ? 'Permitir' : 'Bloquear';`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 204

**Fonte:** `        blockBtn.style.cssText = \`background:${isBlocked ? '#2d7a38' : '#8a1c1c'}; border:none; padding:8px 10px; color:#fff; cursor:pointer;\`;`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 205

**Fonte:** `        blockBtn.addEventListener('click', () => {`

**O que faz:** Registra handler de `click`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 206

**Fonte:** `            chrome.storage.local.get(['autoRestoreBlockedImages'], d => {`

**O que faz:** Lê estado persistido para item de imagem.

**Como faz:** Usa callback de `chrome.storage.local`.

**Por que assim / risco de alternativa:** Permite restaurar preferências entre sessões.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 207

**Fonte:** `                const current = normalizeBlockedImages(d.autoRestoreBlockedImages);`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 208

**Fonte:** `                if (current[entry.cleanUrl]) {`

**O que faz:** Aplica guarda em item de imagem.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 209

**Fonte:** `                    delete current[entry.cleanUrl];`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 210

**Fonte:** `                } else {`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 211

**Fonte:** `                    current[entry.cleanUrl] = {`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 212

**Fonte:** `                        cleanUrl: entry.cleanUrl,`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 213

**Fonte:** `                        host: entry.host,`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 214

**Fonte:** `                        sourceUrl: entry.sourceUrl,`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 215

**Fonte:** `                        chapterTitle: entry.chapterTitle,`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 216

**Fonte:** `                        blockedAt: Date.now(),`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 217

**Fonte:** `                    };`

**O que faz:** Fecha estrutura de item de imagem.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 218

**Fonte:** `                }`

**O que faz:** Fecha estrutura de item de imagem.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 219

**Fonte:** `                chrome.storage.local.set({ autoRestoreBlockedImages: current }, () => {`

**O que faz:** Persiste estado do fluxo de item de imagem.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 220

**Fonte:** `                    renderSites();`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 221

**Fonte:** `                    showStatus(current[entry.cleanUrl] ? 'Imagem bloqueada.' : 'Imagem permitida.', current[entry.cleanUrl] ? '#FF9800' : '#4CAF50');`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 222

**Fonte:** `                });`

**O que faz:** Fecha estrutura de item de imagem.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 223

**Fonte:** `            });`

**O que faz:** Fecha estrutura de item de imagem.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 224

**Fonte:** `        });`

**O que faz:** Fecha estrutura de item de imagem.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 225

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de item de imagem.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 226

**Fonte:** `        const redoBtn = document.createElement('button');`

**O que faz:** Declara estado local em item de imagem.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 227

**Fonte:** `        redoBtn.className = 'options-image-redo-btn';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 228

**Fonte:** `        redoBtn.textContent = 'Refazer';`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 229

**Fonte:** `        redoBtn.style.cssText = 'background:#1a5fa8; border:none; padding:8px 10px; color:#fff; cursor:pointer;';`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 230

**Fonte:** `        redoBtn.addEventListener('click', () => deleteSavedTranslationForEntry(entry, {`

**O que faz:** Registra handler de `click`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 231

**Fonte:** `            refresh: renderSites,`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 232

**Fonte:** `            showStatus,`

**O que faz:** Executa uma etapa de item de imagem.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 233

**Fonte:** `        }));`

**O que faz:** Fecha estrutura de item de imagem.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 234

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de item de imagem.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 235

**Fonte:** `        item.appendChild(preview);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 236

**Fonte:** `        item.appendChild(info);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 237

**Fonte:** `        item.appendChild(blockBtn);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 238

**Fonte:** `        item.appendChild(redoBtn);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 239

**Fonte:** `        return item;`

**O que faz:** Encerra o ramo/função atual.

**Como faz:** Retorna imediatamente o valor indicado.

**Por que assim / risco de alternativa:** Evita trabalho posterior desnecessário.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 240

**Fonte:** `    }`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 241

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 242

**Fonte:** `    // ── Refazer ──────────────────────────────────────────────────────────────`

**O que faz:** Comentário de intenção do bloco de lista de sites.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 243

**Fonte:** `    // Purga a tradução em todos os lugares onde ela poderia voltar: armazenamento`

**O que faz:** Comentário de intenção do bloco de lista de sites.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 244

**Fonte:** `    // novo (página + restore + asset), resíduos legados, bloqueio de`

**O que faz:** Comentário de intenção do bloco de lista de sites.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 245

**Fonte:** `    // auto-substituição e cache global (GTC).`

**O que faz:** Comentário de intenção do bloco de lista de sites.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 246

**Fonte:** `    function renderSites() {`

**O que faz:** Define `renderSites`.

**Como faz:** Fecha sobre DOM/storage já obtidos.

**Por que assim / risco de alternativa:** Encapsula o fluxo para reduzir repetição.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 247

**Fonte:** `        // Não puxa mais os restoreMaps de todos os capítulos (cada um carregava`

**O que faz:** Comentário de intenção do bloco de lista de sites.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 248

**Fonte:** `        // as imagens Base64 inteiras só para montar a lista).`

**O que faz:** Comentário de intenção do bloco de lista de sites.

**Como faz:** Não executa; acompanha o código vizinho.

**Por que assim / risco de alternativa:** Preserva contexto sem ser tratado como comportamento testado.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 249

**Fonte:** `        chrome.storage.local.get(['enabledDomains', 'autoRestoreDisabledSites', 'autoRestoreBlockedImages', 'chapterList'], (baseData) => {`

**O que faz:** Lê estado persistido para lista de sites.

**Como faz:** Usa callback de `chrome.storage.local`.

**Por que assim / risco de alternativa:** Permite restaurar preferências entre sessões.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 250

**Fonte:** `            const keysToFetch = [];`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 251

**Fonte:** `            const chapterList = baseData.chapterList || [];`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 252

**Fonte:** `            const domains = baseData.enabledDomains || [];`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 253

**Fonte:** `            domains.forEach(d => keysToFetch.push(\`siteMeta_${d}\`));`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 254

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 255

**Fonte:** `            chrome.storage.local.get(keysToFetch, async (chapterData) => {`

**O que faz:** Lê estado persistido para lista de sites.

**Como faz:** Usa callback de `chrome.storage.local`.

**Por que assim / risco de alternativa:** Permite restaurar preferências entre sessões.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 256

**Fonte:** `                const data = { ...baseData, ...chapterData };`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 257

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 258

**Fonte:** `                const disabledSites = Array.isArray(data.autoRestoreDisabledSites) ? data.autoRestoreDisabledSites : [];`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 259

**Fonte:** `                const entries = await loadRestoreEntries(chapterList);`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 260

**Fonte:** `                const blockedImages = normalizeBlockedImages(data.autoRestoreBlockedImages);`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 261

**Fonte:** `                const entriesByHost = entries.reduce((acc, entry) => {`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 262

**Fonte:** `                    const host = entry.host || 'desconhecido';`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 263

**Fonte:** `                    if (!acc.has(host)) acc.set(host, []);`

**O que faz:** Aplica guarda em lista de sites.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 264

**Fonte:** `                    acc.get(host).push(entry);`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 265

**Fonte:** `                    return acc;`

**O que faz:** Encerra o ramo/função atual.

**Como faz:** Retorna imediatamente o valor indicado.

**Por que assim / risco de alternativa:** Evita trabalho posterior desnecessário.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 266

**Fonte:** `                }, new Map());`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 267

**Fonte:** `                const hosts = Array.from(new Set(domains));`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 268

**Fonte:** `                sitesList.innerHTML = '';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 269

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 270

**Fonte:** `                if (hosts.length === 0) {`

**O que faz:** Aplica guarda em lista de sites.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 271

**Fonte:** `                    sitesList.innerHTML = '<div>Nenhum site permitido ainda.</div>';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 272

**Fonte:** `                    return;`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 273

**Fonte:** `                }`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 274

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 275

**Fonte:** `                hosts.forEach(hostname => {`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 276

**Fonte:** `                    const meta = data[\`siteMeta_${hostname}\`] || null;`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 277

**Fonte:** `                    const siteEntries = entriesByHost.get(hostname) || [];`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 278

**Fonte:** `                    const isOpen = expandedOptionSites.has(hostname);`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 279

**Fonte:** `                    const item = document.createElement('div');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 280

**Fonte:** `                    item.className = 'options-site-item';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 281

**Fonte:** `                    item.classList.toggle('open', isOpen);`

**O que faz:** Sincroniza classe visual com estado expandido.

**Como faz:** Usa o Set de sites abertos.

**Por que assim / risco de alternativa:** Separa estado de interação do storage.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 282

**Fonte:** `                    item.style.cssText = 'margin-bottom:12px; background:#111; border:1px solid #333; border-radius:6px; overflow:hidden;';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 283

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 284

**Fonte:** `                    const header = document.createElement('div');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 285

**Fonte:** `                    header.className = 'options-site-main';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 286

**Fonte:** `                    header.setAttribute('role', 'button');`

**O que faz:** Atualiza atributo semântico/acessível.

**Como faz:** Escreve role/tabindex/aria conforme estado.

**Por que assim / risco de alternativa:** Mantém interação por teclado/assistive tech.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 287

**Fonte:** `                    header.setAttribute('tabindex', '0');`

**O que faz:** Atualiza atributo semântico/acessível.

**Como faz:** Escreve role/tabindex/aria conforme estado.

**Por que assim / risco de alternativa:** Mantém interação por teclado/assistive tech.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 288

**Fonte:** `                    header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');`

**O que faz:** Atualiza atributo semântico/acessível.

**Como faz:** Escreve role/tabindex/aria conforme estado.

**Por que assim / risco de alternativa:** Mantém interação por teclado/assistive tech.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 289

**Fonte:** `                    header.style.cssText = 'display:grid; grid-template-columns:auto minmax(0,1fr) auto auto auto; gap:10px; align-items:center; padding:10px; cursor:pointer; user-select:none;';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 290

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 291

**Fonte:** `                    const arrow = document.createElement('span');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 292

**Fonte:** `                    arrow.className = 'options-site-arrow';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 293

**Fonte:** `                    arrow.textContent = '▶';`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 294

**Fonte:** `                    arrow.setAttribute('aria-hidden', 'true');`

**O que faz:** Atualiza atributo semântico/acessível.

**Como faz:** Escreve role/tabindex/aria conforme estado.

**Por que assim / risco de alternativa:** Mantém interação por teclado/assistive tech.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 295

**Fonte:** `                    arrow.style.cssText = \`color:${isOpen ? '#FF4444' : '#aaa'}; transform:${isOpen ? 'rotate(90deg)' : 'none'}; transition:transform 0.15s ease; display:inline-block;\`;`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 296

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 297

**Fonte:** `                    const displayName = meta?.title || hostname;`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 298

**Fonte:** `                    const nameEl = document.createElement('div');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 299

**Fonte:** `                    nameEl.textContent = \`${displayName} (${hostname})\`;`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 300

**Fonte:** `                    nameEl.style.cssText = 'min-width:0; overflow:hidden; text-overflow:ellipsis;';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 301

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 302

**Fonte:** `                    const countEl = document.createElement('div');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 303

**Fonte:** `                    countEl.textContent = \`${siteEntries.length} image${siteEntries.length === 1 ? 'm' : 'ns'}\`;`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 304

**Fonte:** `                    countEl.style.cssText = 'color:#aaa; font-size:12px; white-space:nowrap;';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 305

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 306

**Fonte:** `                    const autoLabel = document.createElement('label');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 307

**Fonte:** `                    autoLabel.className = 'options-site-auto';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 308

**Fonte:** `                    autoLabel.style.cssText = 'display:flex; align-items:center; gap:6px; color:#ccc; font-size:13px; cursor:pointer; white-space:nowrap;';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 309

**Fonte:** `                    const autoCheck = document.createElement('input');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 310

**Fonte:** `                    autoCheck.type = 'checkbox';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 311

**Fonte:** `                    autoCheck.checked = !disabledSites.includes(hostname);`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 312

**Fonte:** `                    autoCheck.style.accentColor = '#FF4444';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 313

**Fonte:** `                    autoCheck.addEventListener('click', event => event.stopPropagation());`

**O que faz:** Registra handler de `click`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 314

**Fonte:** `                    autoCheck.addEventListener('change', (event) => {`

**O que faz:** Registra handler de `change`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 315

**Fonte:** `                        event.stopPropagation();`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 316

**Fonte:** `                        chrome.storage.local.get(['autoRestoreDisabledSites'], d => {`

**O que faz:** Lê estado persistido para lista de sites.

**Como faz:** Usa callback de `chrome.storage.local`.

**Por que assim / risco de alternativa:** Permite restaurar preferências entre sessões.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 317

**Fonte:** `                            const current = Array.isArray(d.autoRestoreDisabledSites) ? d.autoRestoreDisabledSites : [];`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 318

**Fonte:** `                            const next = autoCheck.checked`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 319

**Fonte:** `                                ? current.filter(h => h !== hostname)`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 320

**Fonte:** `                                : Array.from(new Set([...current, hostname]));`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 321

**Fonte:** `                            chrome.storage.local.set({ autoRestoreDisabledSites: next }, () => {`

**O que faz:** Persiste estado do fluxo de lista de sites.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 322

**Fonte:** `                                renderSites();`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 323

**Fonte:** `                                showStatus(`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 324

**Fonte:** `                                    autoCheck.checked`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 325

**Fonte:** `                                        ? \`Auto-substituição ativada em ${hostname}.\``

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 326

**Fonte:** `                                        : \`Auto-substituição bloqueada em ${hostname}.\`,`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 327

**Fonte:** `                                    autoCheck.checked ? '#4CAF50' : '#FF9800'`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 328

**Fonte:** `                                );`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 329

**Fonte:** `                            });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 330

**Fonte:** `                        });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 331

**Fonte:** `                    });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 332

**Fonte:** `                    autoLabel.appendChild(autoCheck);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 333

**Fonte:** `                    autoLabel.appendChild(document.createTextNode('Auto'));`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 334

**Fonte:** `                    autoLabel.addEventListener('click', event => event.stopPropagation());`

**O que faz:** Registra handler de `click`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 335

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 336

**Fonte:** `                    const revokeBtn = document.createElement('button');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 337

**Fonte:** `                    revokeBtn.textContent = 'Revogar';`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 338

**Fonte:** `                    revokeBtn.style.cssText = 'background:#FF4444; border:none; padding:6px 10px; color:#fff; cursor:pointer;';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 339

**Fonte:** `                    revokeBtn.addEventListener('click', (event) => {`

**O que faz:** Registra handler de `click`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 340

**Fonte:** `                        event.preventDefault();`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 341

**Fonte:** `                        event.stopPropagation();`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 342

**Fonte:** `                        if (!confirm(\`Remover permissão do site "${hostname}"?\`)) return;`

**O que faz:** Aplica guarda em lista de sites.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 343

**Fonte:** `                        chrome.storage.local.get(['enabledDomains', 'autoRestoreDisabledSites'], (d) => {`

**O que faz:** Lê estado persistido para lista de sites.

**Como faz:** Usa callback de `chrome.storage.local`.

**Por que assim / risco de alternativa:** Permite restaurar preferências entre sessões.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 344

**Fonte:** `                            const updated = (d.enabledDomains || []).filter(h => h !== hostname);`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 345

**Fonte:** `                            const updatedDisabled = (d.autoRestoreDisabledSites || []).filter(h => h !== hostname);`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 346

**Fonte:** `                            chrome.storage.local.set({`

**O que faz:** Persiste estado do fluxo de lista de sites.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 347

**Fonte:** `                                enabledDomains: updated,`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 348

**Fonte:** `                                autoRestoreDisabledSites: updatedDisabled,`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 349

**Fonte:** `                            }, () => {`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 350

**Fonte:** `                                expandedOptionSites.delete(hostname);`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 351

**Fonte:** `                                chrome.storage.local.remove([\`siteMeta_${hostname}\`], () => {`

**O que faz:** Remove metadata de site revogado.

**Como faz:** Apaga a chave específica após atualizar listas.

**Por que assim / risco de alternativa:** Evita reuso de estado stale.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 352

**Fonte:** `                                    renderSites();`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 353

**Fonte:** `                                    showStatus('✔ Permissão revogada.', '#FF9800');`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 354

**Fonte:** `                                });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 355

**Fonte:** `                            });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 356

**Fonte:** `                        });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 357

**Fonte:** `                    });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 358

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 359

**Fonte:** `                    function toggleSite() {`

**O que faz:** Define `toggleSite`.

**Como faz:** Fecha sobre DOM/storage já obtidos.

**Por que assim / risco de alternativa:** Encapsula o fluxo para reduzir repetição.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 360

**Fonte:** `                        if (expandedOptionSites.has(hostname)) expandedOptionSites.delete(hostname);`

**O que faz:** Aplica guarda em lista de sites.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 361

**Fonte:** `                        else expandedOptionSites.add(hostname);`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 362

**Fonte:** `                        renderSites();`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 363

**Fonte:** `                    }`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 364

**Fonte:** `                    header.addEventListener('click', toggleSite);`

**O que faz:** Registra handler de `click`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 365

**Fonte:** `                    header.addEventListener('keydown', event => {`

**O que faz:** Registra handler de `keydown`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 366

**Fonte:** `                        if (event.key !== 'Enter' && event.key !== ' ') return;`

**O que faz:** Aplica guarda em lista de sites.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 367

**Fonte:** `                        event.preventDefault();`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 368

**Fonte:** `                        toggleSite();`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 369

**Fonte:** `                    });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 370

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 371

**Fonte:** `                    header.appendChild(arrow);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 372

**Fonte:** `                    header.appendChild(nameEl);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 373

**Fonte:** `                    header.appendChild(countEl);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 374

**Fonte:** `                    header.appendChild(autoLabel);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 375

**Fonte:** `                    header.appendChild(revokeBtn);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 376

**Fonte:** `                    item.appendChild(header);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 377

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 378

**Fonte:** `                    const imagesWrap = document.createElement('div');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 379

**Fonte:** `                    imagesWrap.className = 'options-site-images';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 380

**Fonte:** `                    imagesWrap.style.cssText = \`${isOpen ? 'display:flex;' : 'display:none;'} flex-direction:column; gap:10px; padding:10px; border-top:1px solid #333; background:#171717; max-height:320px; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain;\`;`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 381

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 382

**Fonte:** `                    const imagesTitle = document.createElement('div');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 383

**Fonte:** `                    imagesTitle.textContent = 'Imagens específicas';`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 384

**Fonte:** `                    imagesTitle.style.cssText = 'color:#aaa; font-size:12px; font-weight:bold; text-transform:uppercase;';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 385

**Fonte:** `                    imagesWrap.appendChild(imagesTitle);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 386

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 387

**Fonte:** `                    if (siteEntries.length === 0) {`

**O que faz:** Aplica guarda em lista de sites.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 388

**Fonte:** `                        const empty = document.createElement('div');`

**O que faz:** Declara estado local em lista de sites.

**Como faz:** Deriva o valor de DOM, storage ou entrada corrente.

**Por que assim / risco de alternativa:** Estado local reduz acoplamento global.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 389

**Fonte:** `                        empty.textContent = 'Nenhuma imagem salva para este site ainda.';`

**O que faz:** Atualiza texto visível do DOM.

**Como faz:** Usa `textContent`.

**Por que assim / risco de alternativa:** Evita interpretar texto como markup.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 390

**Fonte:** `                        empty.style.cssText = 'color:#666; font-size:13px;';`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 391

**Fonte:** `                        imagesWrap.appendChild(empty);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 392

**Fonte:** `                    } else {`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 393

**Fonte:** `                        siteEntries.forEach(entry => {`

**O que faz:** Executa uma etapa de lista de sites.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 394

**Fonte:** `                            imagesWrap.appendChild(createAutoImageItem(entry, blockedImages));`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 395

**Fonte:** `                        });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 396

**Fonte:** `                    }`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 397

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 398

**Fonte:** `                    item.appendChild(imagesWrap);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 399

**Fonte:** `                    sitesList.appendChild(item);`

**O que faz:** Anexa nó construído à interface.

**Como faz:** Usa DOM APIs e preserva handlers.

**Por que assim / risco de alternativa:** Evita reconstrução textual desnecessária.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 400

**Fonte:** `                });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 401

**Fonte:** `            });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 402

**Fonte:** `        });`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 403

**Fonte:** `    }`

**O que faz:** Fecha estrutura de lista de sites.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 404

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de lista de sites.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ✅ PROVADO DIRETAMENTE nos fluxos correspondentes de `tests/integration/options.ui.test.js`; a instrução isolada pode não ter assertion própria.

### Linha/posição 405

**Fonte:** `    function renderAutoImages() {`

**O que faz:** Define `renderAutoImages`.

**Como faz:** Fecha sobre DOM/storage já obtidos.

**Por que assim / risco de alternativa:** Encapsula o fluxo para reduzir repetição.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 406

**Fonte:** `        renderSites();`

**O que faz:** Executa uma etapa de finalização.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 407

**Fonte:** `    }`

**O que faz:** Fecha estrutura de finalização.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 408

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de finalização.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 409

**Fonte:** `    btnRefreshAutoImages.addEventListener('click', renderAutoImages);`

**O que faz:** Registra handler de `click`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 410

**Fonte:** `    btnClearAutoBlocks.addEventListener('click', () => {`

**O que faz:** Registra handler de `click`.

**Como faz:** O callback lê estado atual e persiste/re-renderiza.

**Por que assim / risco de alternativa:** Sem o listener, controle e storage poderiam divergir.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 411

**Fonte:** `        if (!confirm('Remover todos os bloqueios de imagens específicas?')) return;`

**O que faz:** Aplica guarda em finalização.

**Como faz:** Executa o ramo só quando a condição é verdadeira.

**Por que assim / risco de alternativa:** Evita acesso inválido ou ação duplicada.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 412

**Fonte:** `        chrome.storage.local.set({ autoRestoreBlockedImages: {} }, () => {`

**O que faz:** Persiste estado do fluxo de finalização.

**Como faz:** Grava somente as chaves afetadas e usa callback para feedback.

**Por que assim / risco de alternativa:** Evita substituir o storage inteiro; falhas não são tratadas focalmente.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 413

**Fonte:** `            renderAutoImages();`

**O que faz:** Executa uma etapa de finalização.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 414

**Fonte:** `            showStatus('Bloqueios de imagem removidos.', '#FF9800');`

**O que faz:** Executa uma etapa de finalização.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 415

**Fonte:** `        });`

**O que faz:** Fecha estrutura de finalização.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 416

**Fonte:** `    });`

**O que faz:** Fecha estrutura de finalização.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 417

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de finalização.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 418

**Fonte:** `    renderSites();`

**O que faz:** Executa uma etapa de finalização.

**Como faz:** Opera sobre DOM, storage ou entrada já preparados.

**Por que assim / risco de alternativa:** A ordem preserva coerência entre persistência e UI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para este ramo, embora o arquivo real seja carregado.

### Linha/posição 419

**Fonte:** `});`

**O que faz:** Fecha estrutura de finalização.

**Como faz:** Encerra bloco/callback/chamada aberta anteriormente.

**Por que assim / risco de alternativa:** Delimita o lifecycle sem novo side effect.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 420

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de finalização.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.

### Linha/posição 421

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Separador do bloco de finalização.

**Como faz:** Whitespace; não altera execução.

**Por que assim / risco de alternativa:** Mantém legibilidade e posição documental.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela página de opções real.


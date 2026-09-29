# Bíblia técnica — `extension/options/options.html`

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#D`  
> **SHA auditado:** `3ca95e66641d2884fa653f25f7bedbb2a8ac3b2b`  
> **Tipo:** página HTML de opções da extensão Chromium MV3  
> **Linhas textuais:** **104**  
> **Posições documentais:** **105** após normalização CRLF→LF, contando newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`options.html` é o contrato DOM declarativo da página de configurações aberta pelo Chromium através de `manifest.json → options_ui.page`. Ele não contém lógica de persistência: fornece os anchors que `options.js` usa para carregar/salvar preferências, escolher o modo de execução Gemini e renderizar sites/imagens autorizados.

A página carrega `../shared/shared-ui.js` antes de `options.js`. Essa ordem é funcional: `options.js` usa helpers globais fornecidos por shared-ui para consultar assets, reunir restore entries, normalizar bloqueios, escapar HTML e refazer traduções.

## 2. Relações reais

- `extension/manifest.json`: declara `options/options.html` como `options_ui.page` com `open_in_tab: true`.
- `extension/options/options.js`: consumidor principal de todos os IDs interativos.
- `extension/shared/shared-ui.js`: dependência carregada antes de options.js.
- `tests/helpers/load-extension-page.js`: lê o HTML real, remove scripts externos do DOM, deriva dependências pela ordem das tags e executa shared-ui antes do script alvo.
- `tests/integration/options.ui.test.js`: executa HTML + JS reais com mocks Chrome/storage.
- `tests/unit/popup/version-ui.test.js`: lê o HTML como texto e prova ausência de versão hardcoded + presença de `#app-title`.

## 3. Dados/configurações representados pela UI

| Anchor | Chave/efeito em `options.js` |
|---|---|
| `#prompt`, `#btn-save` | `customPrompt` |
| `#btn-restore` | `defaultPrompt` + `customPrompt` |
| `#auto-restore-enabled` | `autoRestoreEnabled` |
| `#floating-button-enabled` | `floatingButtonEnabled` |
| `#click-to-translate-enabled` | `clickToTranslateEnabled` |
| radios `gemini-execution-mode` | `geminiExecutionMode` |
| `#redo-confirm-enabled` | `redoConfirmEnabled` |
| `#btn-refresh-auto-images` | re-render da lista |
| `#btn-clear-auto-blocks` | zera `autoRestoreBlockedImages` |
| `#sites-list` | render dinâmico de domínios/imagens |

## 4. Evidência automatizada

`options.ui.test.js` é evidência forte porque `loadExtensionPage` lê `extension/options/options.html` real e executa `extension/options/options.js` real. As assertions provam prompt/save/status, lista de sites, overflow, gaveta, revogação, bloqueio/refazer, modos Gemini e preferências de interação.

Nem toda linha HTML, porém, é diretamente assertada. Estilos inline, textos explicativos, botão Restaurar, auto-restore global, refresh/clear e modo minimized têm no máximo execução indireta ou nenhuma assertion focal; por isso não são promovidos a prova direta.

## 5. Segurança e privacidade

A página só referencia scripts locais; não incorpora scripts remotos nem dados sensíveis no HTML. Dados de sites/imagens entram depois pelo JS. A segurança relevante é manter scripts na ordem esperada e anchors corretos para que sanitização/escape em shared-ui/options.js seja usada em vez de interpolação ad-hoc.

`#sites-list` é apenas um container vazio no HTML. Os nomes/URLs reais são construídos em JavaScript; portanto esta Bíblia não atribui ao HTML garantias de escape que pertencem a `options.js/shared-ui.js`.

## 6. Análise crítica

- O arquivo usa muitos estilos inline; isso aumenta duplicação visual e dificulta manutenção comparado a uma folha CSS compartilhada.
- Não há atributo `lang` no elemento `html`.
- Os três modos Gemini formam corretamente um grupo radio pelo mesmo `name`, mas não usam `fieldset/legend`; o heading ajuda visualmente, porém a semântica de grupo poderia ser mais forte.
- `btn-restore`, `btn-refresh-auto-images` e `btn-clear-auto-blocks` não possuem provas focais de clique na suíte atual.
- `auto-restore-enabled` é obrigatório para `options.js` (não há null guard ao registrar listener), mas não possui assertion focal de persistência.
- A ordem shared-ui→options.js é dependência implícita por globals; remover/reordenar a tag pode quebrar runtime sem erro de import estático.
- A fonte contém uma linha vazia adicional antes do newline terminal; não afeta o browser, mas faz parte do blob auditado.

## 7. Invariantes

1. `#app-title` deve continuar sem versão hardcoded; a versão vem do Manifest.
2. Todos os IDs dereferenciados sem null guard em `options.js` precisam continuar presentes.
3. Os radios Gemini devem manter o mesmo `name` e valores compatíveis com `geminiExecutionMode`.
4. `#redo-confirm-enabled` deve permanecer dentro de `#enabled-sites-panel`.
5. `#enabled-sites-panel[aria-labelledby]` e `#enabled-sites-title` devem permanecer coerentes.
6. `#sites-list` deve continuar sendo o destino único de renderização de sites.
7. `shared-ui.js` precisa carregar antes de `options.js`.
8. Não introduzir script remoto/inline executável na options page.
9. Alterações de labels/IDs precisam atualizar `options.js` e os testes de integração no mesmo change.
10. O HTML deve continuar funcional quando nenhum site/imagem estiver persistido.

## 8. Lacunas de teste

### GAP-OPTHTML-01 — Restaurar prompt
Não existe clique focal em `#btn-restore`. Um teste deve cobrir cancelamento e confirmação, defaultPrompt existente e fallback HD.

### GAP-OPTHTML-02 — autoRestoreEnabled
A página real executa o binding, mas não há assertion de estado inicial/toggle/persistência de `#auto-restore-enabled`.

### GAP-OPTHTML-03 — modo minimized
O radio existe, porém o teste de modos alterna somente `temp_chat` e `background_delete`. Falta provar seleção/restauração/persistência de `minimized_window`.

### GAP-OPTHTML-04 — atualizar/limpar bloqueios
Faltam cliques focais em `#btn-refresh-auto-images` e `#btn-clear-auto-blocks`, incluindo cancelamento do confirm do clear.

### GAP-OPTHTML-05 — ordem de scripts
O harness depende da ordem para carregar shared-ui, mas falta assertion dedicada que falhe com diagnóstico claro se `options.js` vier antes.

### GAP-OPTHTML-06 — acessibilidade
Falta teste de semântica do grupo radio, labels e navegação por teclado do formulário estático.

## 9. Fonte integral

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Opções - Manga Translator</title>
</head>
<body style="background:#1a1a1a; color:#fff; font-family:sans-serif; max-width:740px; margin:auto; padding:24px;">
    <h2 id="app-title">Manga Translator</h2>
    <div style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">
        <h3>Prompt do Gemini</h3>
        <textarea id="prompt" style="width:100%; height:150px; background:#1a1a1a; color:#fff;"></textarea>
        <button id="btn-save" style="padding:10px; background:#FF4444; color:#fff; border:none; cursor:pointer;">Salvar</button>
        <button id="btn-restore" style="padding:10px; background:#3a3a3a; color:#fff; border:none; cursor:pointer;">Restaurar Padrão</button>
        <div id="status" style="margin-top:10px; color:#4CAF50;"></div>
    </div>
    <div style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">
        <h3>Substituição automática</h3>
        <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45;">
            <input type="checkbox" id="auto-restore-enabled" style="margin-top:3px; accent-color:#FF4444;">
            <span>
                Restaurar/substituir imagens automaticamente ao reabrir capítulos
                <small style="display:block; color:#aaa; margin-top:4px;">
                    Quando desligado, a extensão nunca troca imagens sozinha. Traduções iniciadas manualmente continuam funcionando.
                </small>
            </span>
        </label>
    </div>
    <div style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">
        <h3>Interação na página</h3>
        <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45; margin-bottom:12px;">
            <input type="checkbox" id="floating-button-enabled" style="margin-top:3px; accent-color:#FF4444;">
            <span>
                Mostrar botão flutuante
                <small style="display:block; color:#aaa; margin-top:4px;">Se o botão desaparecer sozinho em um site habilitado, a extensão registra o erro e tenta restaurá-lo.</small>
            </span>
        </label>
        <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45; margin-bottom:12px;">
            <input type="checkbox" id="click-to-translate-enabled" style="margin-top:3px; accent-color:#FF4444;">
            <span>
                Clique direito para traduzir uma única imagem
                <small style="display:block; color:#aaa; margin-top:4px;">Ao clicar com o botão direito em uma imagem elegível, escolha “Traduzir esta imagem” no menu do navegador. Fica desligado por padrão.</small>
            </span>
        </label>
    </div>
    <div style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">
        <h3>Modo de Execução do Gemini</h3>
        <p style="color:#aaa; font-size:13px; line-height:1.45; margin-top:0; margin-bottom:14px;">
            Escolha como o Gemini será aberto e gerenciado durante as traduções.
        </p>
        <div style="display:flex; flex-direction:column; gap:12px;">
            <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45;">
                <input type="radio" name="gemini-execution-mode" id="gemini-mode-temp" value="temp_chat" style="margin-top:3px; accent-color:#FF4444;">
                <span>
                    <strong>Conversa Temporária / Modo Segundo Plano (Padrão)</strong>
                    <small style="display:block; color:#aaa; margin-top:4px;">
                        Abre o Gemini em uma aba em segundo plano e ativa nativamente a Conversa Momentânea/Temporária do Gemini. Não polui o histórico da sua conta Google, fecha a aba rapidamente ao concluir e não abre janelas minimizadas.
                    </small>
                </span>
            </label>
            <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45;">
                <input type="radio" name="gemini-execution-mode" id="gemini-mode-minimized" value="minimized_window" style="margin-top:3px; accent-color:#FF4444;">
                <span>
                    <strong>Janela Minimizada</strong>
                    <small style="display:block; color:#aaa; margin-top:4px;">
                        Abre o Gemini em uma janela do Chrome separada e minimizada. Alternativa recomendada se seu navegador suspender abas em segundo plano de forma agressiva.
                    </small>
                </span>
            </label>
            <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45;">
                <input type="radio" name="gemini-execution-mode" id="gemini-mode-delete" value="background_delete" style="margin-top:3px; accent-color:#FF4444;">
                <span>
                    <strong>Conversa Normal com Exclusão Segura</strong>
                    <small style="display:block; color:#aaa; margin-top:4px;">
                        Usa uma conversa normal do Gemini em aba oculta. Após extrair a imagem, a extensão exclui essa conversa de forma segura antes de fechar a aba.
                    </small>
                </span>
            </label>
        </div>
        <div id="gemini-mode-status" style="margin-top:10px; font-size:13px; color:#4CAF50; min-height:18px;"></div>
    </div>
    <div id="enabled-sites-panel" aria-labelledby="enabled-sites-title" style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">
        <h3 id="enabled-sites-title">Sites Permitidos</h3>
        <p style="color:#aaa; font-size:13px; line-height:1.45; margin-top:0;">
            Cada site mostra somente as imagens salvas dele. Use “Auto” para permitir/bloquear restauração automática no site,
            “Bloquear” para uma imagem específica e “Refazer” para apagar uma tradução errada.
        </p>
        <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45; margin-bottom:12px; padding:10px 12px; background:#1b1b1b; border:1px solid #333; border-radius:8px;">
            <input type="checkbox" id="redo-confirm-enabled" style="margin-top:3px; accent-color:#FF4444;">
            <span>
                <strong>Confirmar ao apertar o botão de refazer a imagem</strong>
                <small style="display:block; color:#aaa; margin-top:4px;">Antes de apagar a tradução salva para refazê-la, pede uma confirmação própria da extensão.</small>
            </span>
        </label>
        <div style="display:flex; gap:8px; margin-bottom:10px;">
            <button id="btn-refresh-auto-images" style="padding:8px 10px; background:#3a3a3a; color:#fff; border:none; cursor:pointer;">Atualizar lista</button>
            <button id="btn-clear-auto-blocks" style="padding:8px 10px; background:#5a2020; color:#fff; border:none; cursor:pointer;">Limpar bloqueios</button>
        </div>
        <div id="sites-list" style="max-height:520px; overflow-y:auto; overflow-x:hidden; padding-right:4px;"></div>
    </div>
    <script src="../shared/shared-ui.js"></script>
    <script src="options.js"></script>
</body>
</html>

```

## 10. Cobertura linha a linha

### Linha 001

**Código:** `<!DOCTYPE html>`

**Unidade:** U01 — documento, metadata e título.

**O que faz:** Declara HTML5 para que o Chromium use standards mode na options page.

**Como faz:** DOCTYPE + html/head/body e `#app-title`; `options.js` lê Manifest e substitui título em runtime. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém versão fora do HTML e evita drift entre release/manifest/UI. Uma alteração ingênua pode produzir o risco da unidade: sem `lang` e sem metadata de viewport; isso reduz semântica/acessibilidade, embora a página seja uma options page desktop.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.ui.test.js` carrega o HTML real em jsdom; não há assertion focal para esta estrutura/estilo específico.

### Linha 002

**Código:** `<html>`

**Unidade:** U01 — documento, metadata e título.

**O que faz:** Abre o elemento raiz do documento de opções.

**Como faz:** DOCTYPE + html/head/body e `#app-title`; `options.js` lê Manifest e substitui título em runtime. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém versão fora do HTML e evita drift entre release/manifest/UI. Uma alteração ingênua pode produzir o risco da unidade: sem `lang` e sem metadata de viewport; isso reduz semântica/acessibilidade, embora a página seja uma options page desktop.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.ui.test.js` carrega o HTML real em jsdom; não há assertion focal para esta estrutura/estilo específico.

### Linha 003

**Código:** `<head>`

**Unidade:** U01 — documento, metadata e título.

**O que faz:** Abre metadata do documento.

**Como faz:** DOCTYPE + html/head/body e `#app-title`; `options.js` lê Manifest e substitui título em runtime. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém versão fora do HTML e evita drift entre release/manifest/UI. Uma alteração ingênua pode produzir o risco da unidade: sem `lang` e sem metadata de viewport; isso reduz semântica/acessibilidade, embora a página seja uma options page desktop.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.ui.test.js` carrega o HTML real em jsdom; não há assertion focal para esta estrutura/estilo específico.

### Linha 004

**Código:** `    <meta charset="utf-8">`

**Unidade:** U01 — documento, metadata e título.

**O que faz:** Fixa UTF-8, necessário para textos PT-BR, acentos e símbolos usados na interface.

**Como faz:** DOCTYPE + html/head/body e `#app-title`; `options.js` lê Manifest e substitui título em runtime. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém versão fora do HTML e evita drift entre release/manifest/UI. Uma alteração ingênua pode produzir o risco da unidade: sem `lang` e sem metadata de viewport; isso reduz semântica/acessibilidade, embora a página seja uma options page desktop.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.ui.test.js` carrega o HTML real em jsdom; não há assertion focal para esta estrutura/estilo específico.

### Linha 005

**Código:** `    <title>Opções - Manga Translator</title>`

**Unidade:** U01 — documento, metadata e título.

**O que faz:** Define o título inicial sem versão hardcoded; `options.js` acrescenta a versão do Manifest em runtime.

**Como faz:** DOCTYPE + html/head/body e `#app-title`; `options.js` lê Manifest e substitui título em runtime. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém versão fora do HTML e evita drift entre release/manifest/UI. Uma alteração ingênua pode produzir o risco da unidade: sem `lang` e sem metadata de viewport; isso reduz semântica/acessibilidade, embora a página seja uma options page desktop.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `version-ui.test.js` lê `options.html`, exige `id="app-title"` e proíbe versão hardcoded; `options.js` é verificado separadamente por ler o Manifest.

### Linha 006

**Código:** `</head>`

**Unidade:** U01 — documento, metadata e título.

**O que faz:** Fecha a seção de metadata antes do conteúdo visível.

**Como faz:** DOCTYPE + html/head/body e `#app-title`; `options.js` lê Manifest e substitui título em runtime. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém versão fora do HTML e evita drift entre release/manifest/UI. Uma alteração ingênua pode produzir o risco da unidade: sem `lang` e sem metadata de viewport; isso reduz semântica/acessibilidade, embora a página seja uma options page desktop.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.ui.test.js` carrega o HTML real em jsdom; não há assertion focal para esta estrutura/estilo específico.

### Linha 007

**Código:** `<body style="background:#1a1a1a; color:#fff; font-family:sans-serif; max-width:740px; margin:auto; padding:24px;">`

**Unidade:** U01 — documento, metadata e título.

**O que faz:** Abre o corpo e aplica o layout dark/centralizado da options page via estilos inline.

**Como faz:** DOCTYPE + html/head/body e `#app-title`; `options.js` lê Manifest e substitui título em runtime. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém versão fora do HTML e evita drift entre release/manifest/UI. Uma alteração ingênua pode produzir o risco da unidade: sem `lang` e sem metadata de viewport; isso reduz semântica/acessibilidade, embora a página seja uma options page desktop.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.ui.test.js` carrega o HTML real em jsdom; não há assertion focal para esta estrutura/estilo específico.

### Linha 008

**Código:** `    <h2 id="app-title">Manga Translator</h2>`

**Unidade:** U01 — documento, metadata e título.

**O que faz:** Cria o heading `#app-title`, anchor que `options.js` atualiza para `Manga Translator v<manifest.version>`.

**Como faz:** DOCTYPE + html/head/body e `#app-title`; `options.js` lê Manifest e substitui título em runtime. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém versão fora do HTML e evita drift entre release/manifest/UI. Uma alteração ingênua pode produzir o risco da unidade: sem `lang` e sem metadata de viewport; isso reduz semântica/acessibilidade, embora a página seja uma options page desktop.

**Evidência:** **✅ PROVADO DIRETAMENTE** — `version-ui.test.js` lê `options.html`, exige `id="app-title"` e proíbe versão hardcoded; `options.js` é verificado separadamente por ler o Manifest.

### Linha 009

**Código:** `    <div style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">`

**Unidade:** U02 — editor do prompt Gemini.

**O que faz:** Abre um container visual do bloco, com layout definido inline.

**Como faz:** IDs estáveis são ligados por `options.js` a chrome.storage.local e confirmação de restore. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** separa edição explícita do prompt de demais preferências e fornece feedback local. Uma alteração ingênua pode produzir o risco da unidade: o botão Restaurar altera prompt persistido e depende de `confirm`; não há assertion focal desse fluxo na suíte de integração.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco é carregado pelo HTML real; somente prompt/save/status recebem assertions focais.

### Linha 010

**Código:** `        <h3>Prompt do Gemini</h3>`

**Unidade:** U02 — editor do prompt Gemini.

**O que faz:** Cria heading visual/semântico com o texto `Prompt do Gemini`.

**Como faz:** IDs estáveis são ligados por `options.js` a chrome.storage.local e confirmação de restore. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** separa edição explícita do prompt de demais preferências e fornece feedback local. Uma alteração ingênua pode produzir o risco da unidade: o botão Restaurar altera prompt persistido e depende de `confirm`; não há assertion focal desse fluxo na suíte de integração.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco é carregado pelo HTML real; somente prompt/save/status recebem assertions focais.

### Linha 011

**Código:** `        <textarea id="prompt" style="width:100%; height:150px; background:#1a1a1a; color:#fff;"></textarea>`

**Unidade:** U02 — editor do prompt Gemini.

**O que faz:** Cria a textarea `#prompt` onde o prompt customizado é carregado/editado.

**Como faz:** IDs estáveis são ligados por `options.js` a chrome.storage.local e confirmação de restore. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** separa edição explícita do prompt de demais preferências e fornece feedback local. Uma alteração ingênua pode produzir o risco da unidade: o botão Restaurar altera prompt persistido e depende de `confirm`; não há assertion focal desse fluxo na suíte de integração.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de salvar usa `#prompt`, clica `#btn-save` e exige feedback em `#status`.

### Linha 012

**Código:** `        <button id="btn-save" style="padding:10px; background:#FF4444; color:#fff; border:none; cursor:pointer;">Salvar</button>`

**Unidade:** U02 — editor do prompt Gemini.

**O que faz:** Cria o botão `#btn-save`, anchor do listener instalado por `options.js`.

**Como faz:** IDs estáveis são ligados por `options.js` a chrome.storage.local e confirmação de restore. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** separa edição explícita do prompt de demais preferências e fornece feedback local. Uma alteração ingênua pode produzir o risco da unidade: o botão Restaurar altera prompt persistido e depende de `confirm`; não há assertion focal desse fluxo na suíte de integração.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de salvar usa `#prompt`, clica `#btn-save` e exige feedback em `#status`.

### Linha 013

**Código:** `        <button id="btn-restore" style="padding:10px; background:#3a3a3a; color:#fff; border:none; cursor:pointer;">Restaurar Padrão</button>`

**Unidade:** U02 — editor do prompt Gemini.

**O que faz:** Cria o botão `#btn-restore`, anchor do listener instalado por `options.js`.

**Como faz:** IDs estáveis são ligados por `options.js` a chrome.storage.local e confirmação de restore. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** separa edição explícita do prompt de demais preferências e fornece feedback local. Uma alteração ingênua pode produzir o risco da unidade: o botão Restaurar altera prompt persistido e depende de `confirm`; não há assertion focal desse fluxo na suíte de integração.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — `#btn-restore` existe e é consumido por `options.js`, mas a suíte não clica/restaura o prompt.

### Linha 014

**Código:** `        <div id="status" style="margin-top:10px; color:#4CAF50;"></div>`

**Unidade:** U02 — editor do prompt Gemini.

**O que faz:** Cria o container `#status` usado por `options.js`/testes para feedback ou conteúdo dinâmico.

**Como faz:** IDs estáveis são ligados por `options.js` a chrome.storage.local e confirmação de restore. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** separa edição explícita do prompt de demais preferências e fornece feedback local. Uma alteração ingênua pode produzir o risco da unidade: o botão Restaurar altera prompt persistido e depende de `confirm`; não há assertion focal desse fluxo na suíte de integração.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de salvar usa `#prompt`, clica `#btn-save` e exige feedback em `#status`.

### Linha 015

**Código:** `    </div>`

**Unidade:** U02 — editor do prompt Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de editor do prompt Gemini.

**Como faz:** IDs estáveis são ligados por `options.js` a chrome.storage.local e confirmação de restore. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** separa edição explícita do prompt de demais preferências e fornece feedback local. Uma alteração ingênua pode produzir o risco da unidade: o botão Restaurar altera prompt persistido e depende de `confirm`; não há assertion focal desse fluxo na suíte de integração.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco é carregado pelo HTML real; somente prompt/save/status recebem assertions focais.

### Linha 016

**Código:** `    <div style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Abre um container visual do bloco, com layout definido inline.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 017

**Código:** `        <h3>Substituição automática</h3>`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Cria heading visual/semântico com o texto `Substituição automática`.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 018

**Código:** `        <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45;">`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Abre um label que envolve o input e sua ajuda, ampliando a área clicável sem depender de atributo `for`.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 019

**Código:** `            <input type="checkbox" id="auto-restore-enabled" style="margin-top:3px; accent-color:#FF4444;">`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Cria o input `#auto-restore-enabled` (checkbox) que é lido por `options.js`.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 020

**Código:** `            <span>`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Abre wrapper textual do label para agrupar título e ajuda.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 021

**Código:** `                Restaurar/substituir imagens automaticamente ao reabrir capítulos`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Renderiza o conteúdo estático `Restaurar/substituir imagens automaticamente ao reabrir capítulos` dentro de controle global de auto-substituição.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 022

**Código:** `                <small style="display:block; color:#aaa; margin-top:4px;">`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Abre texto de ajuda visualmente secundário para explicar consequência da preferência.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 023

**Código:** `                    Quando desligado, a extensão nunca troca imagens sozinha. Traduções iniciadas manualmente continuam funcionando.`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Renderiza o conteúdo estático `Quando desligado, a extensão nunca troca imagens sozinha. Traduções iniciadas manualmente continuam funcionando.` dentro de controle global de auto-substituição.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 024

**Código:** `                </small>`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Fecha o elemento aberto correspondente dentro de controle global de auto-substituição.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 025

**Código:** `            </span>`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Fecha o elemento aberto correspondente dentro de controle global de auto-substituição.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 026

**Código:** `        </label>`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Fecha o elemento aberto correspondente dentro de controle global de auto-substituição.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 027

**Código:** `    </div>`

**Unidade:** U03 — controle global de auto-substituição.

**O que faz:** Fecha o elemento aberto correspondente dentro de controle global de auto-substituição.

**Como faz:** input aninhado em label com texto explicativo; `options.js` restaura/persiste `autoRestoreEnabled`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a extensão precisa de opt-out global independente de traduções manuais. Uma alteração ingênua pode produzir o risco da unidade: a existência é exercitada pela página real, mas o teste atual não faz assertion específica sobre mudança desse checkbox.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `options.js` dereferencia `#auto-restore-enabled` durante o carregamento real, mas a suíte não afirma seu estado/persistência.

### Linha 028

**Código:** `    <div style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">`

**Unidade:** U04 — interação na página.

**O que faz:** Abre um container visual do bloco, com layout definido inline.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 029

**Código:** `        <h3>Interação na página</h3>`

**Unidade:** U04 — interação na página.

**O que faz:** Cria heading visual/semântico com o texto `Interação na página`.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o último teste localiza controles reais, verifica texto de clique direito, estado inicial/persistência e heading `Interação na página`.

### Linha 030

**Código:** `        <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45; margin-bottom:12px;">`

**Unidade:** U04 — interação na página.

**O que faz:** Abre um label que envolve o input e sua ajuda, ampliando a área clicável sem depender de atributo `for`.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 031

**Código:** `            <input type="checkbox" id="floating-button-enabled" style="margin-top:3px; accent-color:#FF4444;">`

**Unidade:** U04 — interação na página.

**O que faz:** Cria o input `#floating-button-enabled` (checkbox) que é lido por `options.js`.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o último teste localiza controles reais, verifica texto de clique direito, estado inicial/persistência e heading `Interação na página`.

### Linha 032

**Código:** `            <span>`

**Unidade:** U04 — interação na página.

**O que faz:** Abre wrapper textual do label para agrupar título e ajuda.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 033

**Código:** `                Mostrar botão flutuante`

**Unidade:** U04 — interação na página.

**O que faz:** Renderiza o conteúdo estático `Mostrar botão flutuante` dentro de interação na página.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 034

**Código:** `                <small style="display:block; color:#aaa; margin-top:4px;">Se o botão desaparecer sozinho em um site habilitado, a extensão registra o erro e tenta restaurá-lo.</small>`

**Unidade:** U04 — interação na página.

**O que faz:** Abre texto de ajuda visualmente secundário para explicar consequência da preferência.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 035

**Código:** `            </span>`

**Unidade:** U04 — interação na página.

**O que faz:** Fecha o elemento aberto correspondente dentro de interação na página.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 036

**Código:** `        </label>`

**Unidade:** U04 — interação na página.

**O que faz:** Fecha o elemento aberto correspondente dentro de interação na página.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 037

**Código:** `        <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45; margin-bottom:12px;">`

**Unidade:** U04 — interação na página.

**O que faz:** Abre um label que envolve o input e sua ajuda, ampliando a área clicável sem depender de atributo `for`.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 038

**Código:** `            <input type="checkbox" id="click-to-translate-enabled" style="margin-top:3px; accent-color:#FF4444;">`

**Unidade:** U04 — interação na página.

**O que faz:** Cria o input `#click-to-translate-enabled` (checkbox) que é lido por `options.js`.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o último teste localiza controles reais, verifica texto de clique direito, estado inicial/persistência e heading `Interação na página`.

### Linha 039

**Código:** `            <span>`

**Unidade:** U04 — interação na página.

**O que faz:** Abre wrapper textual do label para agrupar título e ajuda.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 040

**Código:** `                Clique direito para traduzir uma única imagem`

**Unidade:** U04 — interação na página.

**O que faz:** Renderiza o conteúdo estático `Clique direito para traduzir uma única imagem` dentro de interação na página.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o último teste localiza controles reais, verifica texto de clique direito, estado inicial/persistência e heading `Interação na página`.

### Linha 041

**Código:** `                <small style="display:block; color:#aaa; margin-top:4px;">Ao clicar com o botão direito em uma imagem elegível, escolha “Traduzir esta imagem” no menu do navegador. Fica desligado por padrão.</small>`

**Unidade:** U04 — interação na página.

**O que faz:** Abre texto de ajuda visualmente secundário para explicar consequência da preferência.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o último teste localiza controles reais, verifica texto de clique direito, estado inicial/persistência e heading `Interação na página`.

### Linha 042

**Código:** `            </span>`

**Unidade:** U04 — interação na página.

**O que faz:** Fecha o elemento aberto correspondente dentro de interação na página.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 043

**Código:** `        </label>`

**Unidade:** U04 — interação na página.

**O que faz:** Fecha o elemento aberto correspondente dentro de interação na página.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 044

**Código:** `    </div>`

**Unidade:** U04 — interação na página.

**O que faz:** Fecha o elemento aberto correspondente dentro de interação na página.

**Como faz:** dois checkboxes com IDs consumidos por `options.js` e textos de ajuda sobre comportamento. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** permite separar affordance visual e ação contextual de tradução. Uma alteração ingênua pode produzir o risco da unidade: a UI não mostra dependências/capabilities do navegador; a persistência é testada, mas efeitos reais nas páginas pertencem a outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o bloco real é carregado; a assertion focal cobre anchors/estado principais, não cada wrapper/estilo.

### Linha 045

**Código:** `    <div style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre um container visual do bloco, com layout definido inline.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 046

**Código:** `        <h3>Modo de Execução do Gemini</h3>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Cria heading visual/semântico com o texto `Modo de Execução do Gemini`.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 047

**Código:** `        <p style="color:#aaa; font-size:13px; line-height:1.45; margin-top:0; margin-bottom:14px;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre texto explicativo do bloco; é conteúdo estático, não estado persistido.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 048

**Código:** `            Escolha como o Gemini será aberto e gerenciado durante as traduções.`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Renderiza o conteúdo estático `Escolha como o Gemini será aberto e gerenciado durante as traduções.` dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 049

**Código:** `        </p>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 050

**Código:** `        <div style="display:flex; flex-direction:column; gap:12px;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre um container visual do bloco, com layout definido inline.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 051

**Código:** `            <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre um label que envolve o input e sua ajuda, ampliando a área clicável sem depender de atributo `for`.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 052

**Código:** `                <input type="radio" name="gemini-execution-mode" id="gemini-mode-temp" value="temp_chat" style="margin-top:3px; accent-color:#FF4444;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Cria o input `#gemini-mode-temp` (radio) que participa do grupo `gemini-execution-mode`.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de modo seguro usa `#gemini-mode-temp`, `#gemini-mode-delete` e `#gemini-mode-status`, verificando seleção/persistência/feedback.

### Linha 053

**Código:** `                <span>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre wrapper textual do label para agrupar título e ajuda.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 054

**Código:** `                    <strong>Conversa Temporária / Modo Segundo Plano (Padrão)</strong>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Destaca o rótulo `Conversa Temporária / Modo Segundo Plano (Padrão)` dentro da opção.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 055

**Código:** `                    <small style="display:block; color:#aaa; margin-top:4px;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre texto de ajuda visualmente secundário para explicar consequência da preferência.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 056

**Código:** `                        Abre o Gemini em uma aba em segundo plano e ativa nativamente a Conversa Momentânea/Temporária do Gemini. Não polui o histórico da sua conta Google, fecha a aba rapidamente ao concluir e não abre janelas minimizadas.`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Renderiza o conteúdo estático `Abre o Gemini em uma aba em segundo plano e ativa nativamente a Conversa Momentânea/Temporária do Gemini. Não polui o histórico da sua conta Google, fecha a ab…` dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 057

**Código:** `                    </small>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 058

**Código:** `                </span>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 059

**Código:** `            </label>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 060

**Código:** `            <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre um label que envolve o input e sua ajuda, ampliando a área clicável sem depender de atributo `for`.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 061

**Código:** `                <input type="radio" name="gemini-execution-mode" id="gemini-mode-minimized" value="minimized_window" style="margin-top:3px; accent-color:#FF4444;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Cria o input `#gemini-mode-minimized` (radio) que participa do grupo `gemini-execution-mode`.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o radio minimized participa do mesmo grupo carregado, mas não é alternado por uma assertion focal.

### Linha 062

**Código:** `                <span>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre wrapper textual do label para agrupar título e ajuda.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 063

**Código:** `                    <strong>Janela Minimizada</strong>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Destaca o rótulo `Janela Minimizada` dentro da opção.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 064

**Código:** `                    <small style="display:block; color:#aaa; margin-top:4px;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre texto de ajuda visualmente secundário para explicar consequência da preferência.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 065

**Código:** `                        Abre o Gemini em uma janela do Chrome separada e minimizada. Alternativa recomendada se seu navegador suspender abas em segundo plano de forma agressiva.`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Renderiza o conteúdo estático `Abre o Gemini em uma janela do Chrome separada e minimizada. Alternativa recomendada se seu navegador suspender abas em segundo plano de forma agressiva.` dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 066

**Código:** `                    </small>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 067

**Código:** `                </span>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 068

**Código:** `            </label>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 069

**Código:** `            <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre um label que envolve o input e sua ajuda, ampliando a área clicável sem depender de atributo `for`.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 070

**Código:** `                <input type="radio" name="gemini-execution-mode" id="gemini-mode-delete" value="background_delete" style="margin-top:3px; accent-color:#FF4444;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Cria o input `#gemini-mode-delete` (radio) que participa do grupo `gemini-execution-mode`.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de modo seguro usa `#gemini-mode-temp`, `#gemini-mode-delete` e `#gemini-mode-status`, verificando seleção/persistência/feedback.

### Linha 071

**Código:** `                <span>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre wrapper textual do label para agrupar título e ajuda.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 072

**Código:** `                    <strong>Conversa Normal com Exclusão Segura</strong>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Destaca o rótulo `Conversa Normal com Exclusão Segura` dentro da opção.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 073

**Código:** `                    <small style="display:block; color:#aaa; margin-top:4px;">`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Abre texto de ajuda visualmente secundário para explicar consequência da preferência.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 074

**Código:** `                        Usa uma conversa normal do Gemini em aba oculta. Após extrair a imagem, a extensão exclui essa conversa de forma segura antes de fechar a aba.`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Renderiza o conteúdo estático `Usa uma conversa normal do Gemini em aba oculta. Após extrair a imagem, a extensão exclui essa conversa de forma segura antes de fechar a aba.` dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 075

**Código:** `                    </small>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 076

**Código:** `                </span>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 077

**Código:** `            </label>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 078

**Código:** `        </div>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 079

**Código:** `        <div id="gemini-mode-status" style="margin-top:10px; font-size:13px; color:#4CAF50; min-height:18px;"></div>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Cria o container `#gemini-mode-status` usado por `options.js`/testes para feedback ou conteúdo dinâmico.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de modo seguro usa `#gemini-mode-temp`, `#gemini-mode-delete` e `#gemini-mode-status`, verificando seleção/persistência/feedback.

### Linha 080

**Código:** `    </div>`

**Unidade:** U05 — modo de execução do Gemini.

**O que faz:** Fecha o elemento aberto correspondente dentro de modo de execução do Gemini.

**Como faz:** radios compartilham `name=gemini-execution-mode` e valores `temp_chat`, `minimized_window`, `background_delete`. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** um grupo radio impede seleção simultânea e oferece trade-offs de suspensão/histórico/cleanup. Uma alteração ingênua pode produzir o risco da unidade: o modo minimized está presente, mas o teste focal alterna temp/background_delete; texto descritivo e comportamento real de janela são responsabilidade de outros módulos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — a seção é carregada pelo teste real; descrições e wrappers não recebem assertions específicas.

### Linha 081

**Código:** `    <div id="enabled-sites-panel" aria-labelledby="enabled-sites-title" style="background:#242424; padding:18px; border-radius:10px; margin-bottom:16px;">`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Cria o container `#enabled-sites-panel` usado por `options.js`/testes para feedback ou conteúdo dinâmico.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de controles verifica `#enabled-sites-panel`, `aria-labelledby`, título, posição de `#redo-confirm-enabled` e `#sites-list`; outro teste verifica overflowY/lista real.

### Linha 082

**Código:** `        <h3 id="enabled-sites-title">Sites Permitidos</h3>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Cria heading visual/semântico com o texto `Sites Permitidos`.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de controles verifica `#enabled-sites-panel`, `aria-labelledby`, título, posição de `#redo-confirm-enabled` e `#sites-list`; outro teste verifica overflowY/lista real.

### Linha 083

**Código:** `        <p style="color:#aaa; font-size:13px; line-height:1.45; margin-top:0;">`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Abre texto explicativo do bloco; é conteúdo estático, não estado persistido.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 084

**Código:** `            Cada site mostra somente as imagens salvas dele. Use “Auto” para permitir/bloquear restauração automática no site,`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Renderiza o conteúdo estático `Cada site mostra somente as imagens salvas dele. Use “Auto” para permitir/bloquear restauração automática no site,` dentro de painel de sites permitidos e redo.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 085

**Código:** `            “Bloquear” para uma imagem específica e “Refazer” para apagar uma tradução errada.`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Renderiza o conteúdo estático `“Bloquear” para uma imagem específica e “Refazer” para apagar uma tradução errada.` dentro de painel de sites permitidos e redo.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 086

**Código:** `        </p>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Fecha o elemento aberto correspondente dentro de painel de sites permitidos e redo.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 087

**Código:** `        <label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer; line-height:1.45; margin-bottom:12px; padding:10px 12px; background:#1b1b1b; border:1px solid #333; border-radius:8px;">`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Abre um label que envolve o input e sua ajuda, ampliando a área clicável sem depender de atributo `for`.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 088

**Código:** `            <input type="checkbox" id="redo-confirm-enabled" style="margin-top:3px; accent-color:#FF4444;">`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Cria o input `#redo-confirm-enabled` (checkbox) que é lido por `options.js`.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de controles verifica `#enabled-sites-panel`, `aria-labelledby`, título, posição de `#redo-confirm-enabled` e `#sites-list`; outro teste verifica overflowY/lista real.

### Linha 089

**Código:** `            <span>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Abre wrapper textual do label para agrupar título e ajuda.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 090

**Código:** `                <strong>Confirmar ao apertar o botão de refazer a imagem</strong>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Destaca o rótulo `Confirmar ao apertar o botão de refazer a imagem` dentro da opção.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 091

**Código:** `                <small style="display:block; color:#aaa; margin-top:4px;">Antes de apagar a tradução salva para refazê-la, pede uma confirmação própria da extensão.</small>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Abre texto de ajuda visualmente secundário para explicar consequência da preferência.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 092

**Código:** `            </span>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Fecha o elemento aberto correspondente dentro de painel de sites permitidos e redo.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 093

**Código:** `        </label>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Fecha o elemento aberto correspondente dentro de painel de sites permitidos e redo.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 094

**Código:** `        <div style="display:flex; gap:8px; margin-bottom:10px;">`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Abre um container visual do bloco, com layout definido inline.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 095

**Código:** `            <button id="btn-refresh-auto-images" style="padding:8px 10px; background:#3a3a3a; color:#fff; border:none; cursor:pointer;">Atualizar lista</button>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Cria o botão `#btn-refresh-auto-images`, anchor do listener instalado por `options.js`.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o botão é consumido por `options.js`, mas não há clique/assertion focal para esta ação.

### Linha 096

**Código:** `            <button id="btn-clear-auto-blocks" style="padding:8px 10px; background:#5a2020; color:#fff; border:none; cursor:pointer;">Limpar bloqueios</button>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Cria o botão `#btn-clear-auto-blocks`, anchor do listener instalado por `options.js`.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** — o botão é consumido por `options.js`, mas não há clique/assertion focal para esta ação.

### Linha 097

**Código:** `        </div>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Fecha o elemento aberto correspondente dentro de painel de sites permitidos e redo.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 098

**Código:** `        <div id="sites-list" style="max-height:520px; overflow-y:auto; overflow-x:hidden; padding-right:4px;"></div>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Cria o container `#sites-list` usado por `options.js`/testes para feedback ou conteúdo dinâmico.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **✅ PROVADO DIRETAMENTE** — o teste de controles verifica `#enabled-sites-panel`, `aria-labelledby`, título, posição de `#redo-confirm-enabled` e `#sites-list`; outro teste verifica overflowY/lista real.

### Linha 099

**Código:** `    </div>`

**Unidade:** U06 — painel de sites permitidos e redo.

**O que faz:** Fecha o elemento aberto correspondente dentro de painel de sites permitidos e redo.

**Como faz:** `aria-labelledby` conecta painel/título; checkbox de confirmação, botões de atualização/limpeza e `#sites-list` servem como anchors. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém autorização por site e gerenciamento de traduções salvas em uma área única. Uma alteração ingênua pode produzir o risco da unidade: botões Atualizar lista/Limpar bloqueios não têm assertions focais nesta suíte; conteúdo dinâmico depende de shared-ui/options.js.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o painel real é carregado e utilizado; texto/estilos individuais não são isoladamente assertados.

### Linha 100

**Código:** `    <script src="../shared/shared-ui.js"></script>`

**Unidade:** U07 — ordem de scripts locais.

**O que faz:** Carrega o script local `../shared/shared-ui.js` na ordem declarada.

**Como faz:** dois scripts locais no final do body; o harness de integração extrai dependências anteriores ao target e as `require` nessa ordem. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** `options.js` usa globals de shared-ui como `smRequest`, `loadRestoreEntries`, `normalizeBlockedImages`, `deleteSavedTranslationForEntry` e `escapeHTML`. Uma alteração ingênua pode produzir o risco da unidade: inverter/remover shared-ui quebra renderização/ações; não existe import estático que faça o erro aparecer no build.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `load-extension-page.js` extrai scripts do HTML e carrega dependências anteriores ao target; a suíte depende de shared-ui antes de options.js, mas não possui assertion textual exclusiva da ordem.

### Linha 101

**Código:** `    <script src="options.js"></script>`

**Unidade:** U07 — ordem de scripts locais.

**O que faz:** Carrega o script local `options.js` na ordem declarada.

**Como faz:** dois scripts locais no final do body; o harness de integração extrai dependências anteriores ao target e as `require` nessa ordem. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** `options.js` usa globals de shared-ui como `smRequest`, `loadRestoreEntries`, `normalizeBlockedImages`, `deleteSavedTranslationForEntry` e `escapeHTML`. Uma alteração ingênua pode produzir o risco da unidade: inverter/remover shared-ui quebra renderização/ações; não existe import estático que faça o erro aparecer no build.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — `load-extension-page.js` extrai scripts do HTML e carrega dependências anteriores ao target; a suíte depende de shared-ui antes de options.js, mas não possui assertion textual exclusiva da ordem.

### Linha 102

**Código:** `</body>`

**Unidade:** U08 — fechamento estrutural.

**O que faz:** Fecha o corpo após os scripts, mantendo a execução depois de todos os anchors DOM declarados.

**Como faz:** termina a árvore HTML depois dos scripts. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém documento bem formado e garante scripts no final do corpo. Uma alteração ingênua pode produzir o risco da unidade: nenhum risco funcional específico além de markup inválido se removidos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o HTML real é parseado em jsdom; não há assertion focal para as tags de fechamento.

### Linha 103

**Código:** `</html>`

**Unidade:** U08 — fechamento estrutural.

**O que faz:** Fecha o documento HTML.

**Como faz:** termina a árvore HTML depois dos scripts. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** mantém documento bem formado e garante scripts no final do corpo. Uma alteração ingênua pode produzir o risco da unidade: nenhum risco funcional específico além de markup inválido se removidos.

**Evidência:** **🟨 EXECUTADO INDIRETAMENTE** — o HTML real é parseado em jsdom; não há assertion focal para as tags de fechamento.

### Linha 104

**Código:** ␠ [linha vazia]

**Unidade:** U09 — terminação editorial.

**O que faz:** Linha vazia editorial adicional existente entre `</html>` e o newline terminal.

**Como faz:** a fonte normalizada termina em dois `\n`, produzindo duas posições vazias finais. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a Bíblia precisa espelhar todas as posições usadas pelo gate documental. Uma alteração ingênua pode produzir o risco da unidade: não afeta runtime; é somente integridade byte/linha da documentação.

**Evidência:** **🟦 GATE ESTÁTICO ESPECÍFICO** — o gate de Bíblia compara fonte integral/posições, cobrindo a terminação editorial.

### Linha 105

**Código:** ⏎ [newline final]

**Unidade:** U09 — terminação editorial.

**O que faz:** Posição vazia criada pelo newline terminal final do blob normalizado.

**Como faz:** a fonte normalizada termina em dois `\n`, produzindo duas posições vazias finais. Esta posição fornece a estrutura/anchor/texto necessário sem executar persistência por conta própria.

**Por que assim:** a Bíblia precisa espelhar todas as posições usadas pelo gate documental. Uma alteração ingênua pode produzir o risco da unidade: não afeta runtime; é somente integridade byte/linha da documentação.

**Evidência:** **🟦 GATE ESTÁTICO ESPECÍFICO** — o gate de Bíblia compara fonte integral/posições, cobrindo a terminação editorial.

## 11. Revisão final do Agente D

- Fonte integral conferida contra `3ca95e66641d2884fa653f25f7bedbb2a8ac3b2b`.
- 105/105 posições documentadas em sequência.
- Manifest, `options.js`, shared-ui, harness e testes reais foram cruzados.
- Prova direta foi separada de execução indireta e ausência de teste focal.
- Nenhuma mudança funcional foi feita no HTML.
- O arquivo permanece **EM ANDAMENTO — REVISÃO DE QUALIDADE** até a atualização serializada dos rastreadores compartilhados.

# Bíblia técnica — `extension/popup/popup.html`

> **Estado:** 🟠 EM ANDAMENTO — Bíblia materializada; aguardando finalização coordenada dos rastreadores  
> **SHA auditado:** `05972d0fa1161a5182e0b11185a390582a720f90`  
> **Agente responsável pela auditoria:** `GPT-5.6-Sol#I`  
> **Tipo:** HTML/CSS — popup Chromium MV3 / superfície principal de UI  
> **Linhas textuais:** **489**  
> **Posições documentais:** **490** contando a posição terminal após newline  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

`popup.html` é a **estrutura visual e o contrato de seletores** do popup principal da extensão. O Manifest V3 aponta `action.default_popup` diretamente para este arquivo; abrir o ícone da extensão cria esta página, e `popup.js` resolve dezenas de IDs/classes daqui para carregar imagens, habilitar domínios, iniciar/parar tradução, navegar entre imagens banidas/traduzidas, administrar auto-restauração, configurar Gemini, paralelismo, filtros, debug e logs.

O arquivo deliberadamente contém **markup + CSS**, mas não lógica de negócio. Persistência, Chrome APIs, listeners, renderização dinâmica e IPC vivem em `popup.js` e `shared-ui.js`. Essa separação é importante: IDs, classes e `data-target` são interfaces tão reais quanto uma função exportada. Renomeá-los sem atualizar o JS quebra a UI mesmo que o HTML continue válido.

## 2. Loader, dependências e consumidores

- **Loader canônico:** `extension/manifest.json` → `action.default_popup: "popup/popup.html"`.
- **Dependência visual/runtime 1:** `../shared/shared-ui.js`, carregado antes do controlador específico.
- **Dependência visual/runtime 2:** `popup.js`, carregado por último e consumidor principal dos IDs/classes deste arquivo.
- **Consumidores de contrato:** testes de popup carregam **este HTML real** junto de `popup.js` em JSDOM/harness.
- **Superfícies dinâmicas:** `#image-grid`, `#banned-site-list`, `#chapter-list`, `#settings-sites-list` e `#log-container` começam vazios e são preenchidos pelo JS.
- **CSS dinâmico complementar:** `popup.js` injeta estilos/handles de resize em runtime; por isso nem todo visual final está neste arquivo.

## 3. Máquina visual de estados

O popup tem quatro superfícies principais que o JS alterna:

1. **`#enable-page`** — domínio ainda não habilitado ou estado de “recarregue a página”.
2. **`#loading-page`** — carregamento de imagens/dados.
3. **`#app-content`** — tabs Principal/Banidas/Traduzidas e painel de progresso.
4. **`#settings-page`** — configurações + logs.

O HTML inicia `#enable-page` como ativo/visível e deixa loading/app/settings ocultos por CSS. O JS decide o estado real depois de consultar aba/storage. Uma implementação ingênua que mostrasse tudo e escondesse depois causaria flash de dados/controles incorretos e aumentaria races visuais durante o bootstrap.

## 4. Contratos críticos de IDs

Os IDs são APIs internas entre markup e controlador. Os mais críticos incluem:

- tradução: `image-grid`, `selection-count`, `btn-translate`, `btn-progress-stop`;
- enable gate: `enable-page`, `enable-section`, `btn-enable`;
- tabs: `main-tab`, `banned-tab`, `translated-tab` + botões `data-target`;
- traduzidas: `chapter-list`, `btn-export-all`, `btn-open-folder`, `chk-auto-download`;
- settings: `settings-prompt`, auto-restore, sites, redo, interaction, Gemini modes, parallel, image minimum e debug;
- logs: `log-filter-level`, `btn-log-clear/copy/export`, `log-container`, `log-count`.

Os testes demonstram que esses contratos são usados de verdade. Portanto, alterações de nomenclatura precisam ser tratadas como mudança de API interna, não mero refactor visual.

## 5. CSS e layout

O baseline é **500×600**, escuro, com `overflow:hidden` no body e scroll localizado em grids/settings. `popup.js` pode restaurar dimensões salvas e injetar resizers; o CSS deste arquivo funciona como default antes dessa customização.

Pontos arquiteturais:
- `flex: 1 1 0` + `min-height:0` evita containers flex crescerem além do popup e transfere scroll para a área correta;
- thumbnails usam `aspect-ratio:2/3` + `object-fit:contain`, evitando crop de páginas;
- `.site-folder` e children fornecem a hierarquia visual para capítulos/banidas/settings;
- settings usam scroll vertical independente;
- painel de progresso substitui a estratégia antiga de fechar popup imediatamente.

## 6. Acessibilidade

Há boas bases pontuais: labels de checkbox, `title` em navegação/engrenagem, `aria-labelledby` no grupo de sites e `aria-label` nos ranges de largura/altura.

Lacunas reais:
- tabs não usam `role="tablist/tab"`, `aria-selected` ou `aria-controls`;
- botão de engrenagem depende de símbolo + `title`, sem `aria-label`;
- dot de tradução é puramente visual e não tem `aria-live`;
- painel de progresso não usa `role="progressbar"`/`aria-valuenow`;
- toggle debug é uma `div` clicável, não button/checkbox nativo, sem keyboard semantics visíveis no HTML;
- diversos buttons só têm ícone/texto visual e não há estratégia formal de focus ring além do browser/CSS atual.

## 7. Segurança e privacidade

O HTML não contém scripts inline executáveis, fetches, URLs externas ou formulários de submissão. Isso reduz superfície CSP e mantém IPC no JS controlado da extensão.

Os containers vazios recebem dados de sites/imagens/logs dinamicamente. **A segurança contra XSS depende de como `popup.js` popula esses containers**, não deste HTML. Há teste que confirma nome de domínio malicioso renderizado como texto na estrutura dinâmica, mas essa prova pertence ao controlador.

Configurações podem alterar comportamento sensível (debug preserva abas; execution mode muda lifecycle do Gemini; logs podem ser copiados/exportados). O HTML apenas oferece os controles; validação, sanitização e storage continuam boundaries do JS.

## 8. Evidência automatizada lida

| Superfície | Evidência lida | Classificação |
|---|---|---|
| Manifest / entrada do popup | `manifest.json` aponta `action.default_popup` para `popup/popup.html` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Grade principal / seleção / indicador ativo | `popup.ui.test.js` carrega HTML+JS reais e verifica cards, contagem, texto/disabled e dot/label | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Parar lote | `popup.ui.test.js` e `progress-panel.test.js` clicam `#btn-progress-stop` real e verificam mensagem para a aba/fechamento | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Abrir settings / sites habilitados | `popup.ui.test.js` clica `#btn-options`, verifica `#settings-page`, prompt, toggles, folders e scroll | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Habilitar novo domínio | `popup.ui.test.js` clica `#btn-enable`, verifica storage + inicialização da grade | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Filtro mínimo | `popup.ui.test.js` usa inputs/ranges/reset/preview reais e verifica sincronização + persistência | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Ordem das seções de settings | `popup.ui.test.js` usa `compareDocumentPosition` para provar paralelo → filtro → debug e agrupamento de sites | ✅ PROVADO DIRETAMENTE NO MARKUP REAL |
| Controles interação/redo | `popup.ui.test.js` verifica existência, textos, hierarquia `aria-labelledby` e persistência | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Banir/desbanir e tabs | `popup.advanced.ui.test.js` usa `data-target` real, cards reais e contadores/disabled | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Traduzidas / reader / folder | `popup.advanced.ui.test.js` abre `translated-tab` real e verifica capítulos, reader e mensagens | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Paralelismo / debug | `popup.advanced.ui.test.js` usa slider/valor/toggle reais e verifica storage + `SET_DEBUG_MODE` | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Modos Gemini | `popup.advanced.ui.test.js` verifica radio `background_delete` e alternância/persistência `temp_chat` | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Progresso | `progress-panel.test.js` verifica painel, texto, subtexto, largura da barra e botão stop | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Logs | `log-exporter.test.js` carrega HTML real e verifica container, contador, filtro, export e copy | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Texto dinâmico Traduzir | `dynamic-button.test.js` verifica `#btn-translate`, `#selection-count`, disabled e singular/plural | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Miniaturas traduzidas | `popup-translated-thumbnails.test.js` verifica estrutura chapter/site, cards, lazy loading e fallback | ✅ PROVADO DIRETAMENTE EM INTEGRAÇÃO REAL |
| Resize | `resize-and-tabs.test.js` verifica body dimensionado e resizers criados pelo JS | 🟨 EXECUTADO NO POPUP REAL; resizers não pertencem ao HTML estático |
| Seleção da tab Banidas em `resize-and-tabs.test.js` | teste procura `data-tab="banned-tab"`, mas o markup atual usa `data-target`; click pode ser no-op | ⚠️ NÃO É PROVA DO CONTRATO DE TAB ATUAL |
| Helper de logs abre settings | helper procura `#btn-settings`, inexistente; depois aciona a tab de logs diretamente | ⚠️ NÃO PROVA `#btn-options`; outros testes provam esse botão |

## 9. Lacunas de teste

- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** que valide todos os seletores CSS linha a linha ou detecte regressões puramente visuais de cor/espaçamento.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para foco por teclado e ordem de tabulação de todos os controles.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para semântica ARIA completa das tabs, progresso e toggle debug.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para contraste WCAG das combinações de cinza/vermelho.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para zoom/font scaling/extremos de localização que possam estourar o layout 500×600.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para cada botão de scroll topo/fim nas duas listas.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** específico da associação `label[for="chk-auto-download"]`, embora o fluxo de traduzidas seja exercitado.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para o botão `s-btn-restore` e mensagens de `settings-status` em todos os caminhos de erro.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** para todas as opções de `log-filter-level`; há prova de filtragem, não uma matriz exaustiva dos cinco values.
- ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** de CSP/ausência de inline handlers como gate dedicado.
- ⚠️ O helper de `log-exporter.test.js` procura `#btn-settings`, que não existe; não usar esse trecho como prova do botão de configurações.
- ⚠️ `resize-and-tabs.test.js` procura `data-tab="banned-tab"`, enquanto o contrato atual é `data-target`; a assertion subsequente não prova que esse seletor obsoleto abriu a tab.

## 10. Análise crítica

### 10.1 Acessibilidade da navegação
As tabs funcionam por classes/`data-target`, mas não expõem semântica de tab para leitores de tela. O toggle debug também é uma `div` interativa. Uma evolução futura deve preservar os IDs esperados pelo JS enquanto migra para elementos/ARIA apropriados.

### 10.2 CSS monolítico
Mais de duzentas linhas de CSS vivem no próprio HTML. Isso mantém o popup autocontido, porém aumenta coupling visual e dificulta testes/regressões de estilo. Extrair CSS para arquivo próprio seria possível, mas exigiria atualizar a política estrutural/documentação e testar ordem/carregamento; não deve ser feito silenciosamente.

### 10.3 Contrato por string
A UI depende fortemente de `getElementById` e `data-target`. Não há type system nem schema entre HTML e JS. Testes reais mitigam o risco, mas novos IDs sem teste podem quebrar silenciosamente.

### 10.4 Defaults duplicados
Valores como 300×400, paralelismo 1 e textos de estado aparecem no HTML como defaults e também são gerenciados pelo JS/storage. O HTML deve continuar sendo fallback coerente; drift entre defaults pode causar flash ou estado inicial incorreto.

### 10.5 Testes auxiliares com seletor antigo
Dois helpers de teste revelam dívida de nomenclatura (`btn-settings` e `data-tab`). Eles não invalidam a cobertura principal, porque suites de integração usam `btn-options`/`data-target` corretos, mas são sinais de manutenção necessária nos próprios testes.

## 11. Invariantes

1. `manifest.action.default_popup` deve continuar resolvendo este arquivo ou sua substituição explicitamente migrada.
2. `shared-ui.js` deve carregar antes de `popup.js`.
3. IDs consumidos por `popup.js` não podem ser renomeados sem atualização coordenada e testes.
4. `data-target` é o atributo canônico das tabs principais e internas.
5. `#image-grid`, `#banned-site-list`, `#chapter-list`, `#settings-sites-list` e `#log-container` devem permanecer mount points seguros para conteúdo dinâmico.
6. `#btn-translate` deve iniciar disabled antes de existir seleção válida.
7. `#btn-ban-selected`/`#btn-unban-selected` devem iniciar disabled.
8. `#enable-page` deve existir para o gate por domínio.
9. O painel de progresso deve manter IDs separados para texto, barra, subtexto e stop.
10. Settings de auto-restore/site/redo devem permanecer agrupados conforme a hierarquia testada.
11. Os três modos Gemini devem compartilhar `name="popup-gemini-execution-mode"` e values canônicos.
12. Inputs numéricos e ranges de tamanho devem manter limites coerentes e defaults 300×400 enquanto esses forem os defaults do produto.
13. O HTML não deve introduzir event handlers inline ou scripts remotos.
14. Conteúdo derivado de sites/logs deve continuar sendo inserido pelo JS de forma segura; nunca mover dados não confiáveis para markup estático/HTML bruto.
15. Alterações de layout devem preservar scroll interno e evitar crescimento fora do popup.
16. A posição das seções Paralelo → Tamanho mínimo → Debug é parte do contrato de UX atualmente testado.
17. O badge/indicadores do header não podem ser usados como única fonte de estado; são projeções visuais do estado do JS/storage.

## 12. Unidades documentais

| Unidade | Linhas | Responsabilidade |
|---|---:|---|
| U01 | 1–16 | Documento, metadados e viewport base |
| U02 | 17–43 | Header, status de tradução e botão de configurações |
| U03 | 44–65 | Estados de página, ativação, loading e app shell |
| U04 | 66–94 | Tabs, grids e botões compartilhados |
| U05 | 95–105 | Cards de imagem e seleção |
| U06 | 106–150 | Traduzidas, folders, capítulos e miniaturas |
| U07 | 151–158 | Painel de progresso |
| U08 | 159–209 | Settings, sites habilitados e itens por imagem |
| U09 | 210–235 | Filtro de tamanho e toggle de debug |
| U10 | 236–249 | Fechamento do head e header estrutural |
| U11 | 250–263 | Gate de domínio habilitado e loading |
| U12 | 264–302 | App principal, progresso e aba Principal |
| U13 | 303–321 | Aba Banidas |
| U14 | 322–334 | Aba Traduzidas |
| U15 | 335–355 | Settings shell e prompt customizado |
| U16 | 356–389 | Auto-substituição, sites e refazer |
| U17 | 390–421 | Interação na página e modo Gemini |
| U18 | 422–446 | Paralelismo e filtro mínimo de imagem |
| U19 | 447–461 | Modo Debug |
| U20 | 462–482 | Logs do sistema |
| U21 | 483–490 | Ordem de scripts, fechamento e posições finais |

## 13. Fonte integral auditada

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Manga Translator</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
            width: 500px;
            height: 600px;
            overflow: hidden;
            background: #111;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #root { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #111; position: relative; }
        #header { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px 10px; flex: 0 0 auto; border-bottom: 1px solid #222; }
        #header-left { display: flex; align-items: center; gap: 10px; }
        #header h2 { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }
        /* UI #7: Dot pulsante no header quando tradução está ativa */
        #translating-dot {
            display: none; width: 8px; height: 8px; border-radius: 50%;
            background: #FF4444; flex-shrink: 0;
            animation: pulse-dot 1.2s ease-in-out infinite;
        }
        #translating-dot.visible { display: inline-block; }
        #translating-label { display: none; font-size: 11px; color: #FF4444; font-weight: 700; }
        #translating-label.visible { display: inline-block; }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        #badge-settings {
            display: none; font-size: 11px; font-weight: 700;
            background: #FF4444; color: #fff; padding: 3px 9px;
            border-radius: 20px; letter-spacing: 0.2px;
        }
        #badge-settings.visible { display: inline-block; }
        #btn-options {
            background: none; border: none; color: #555; font-size: 18px;
            cursor: pointer; padding: 4px 6px; border-radius: 6px;
            line-height: 1; transition: color 0.15s, background 0.15s;
        }
        #btn-options:hover { color: #fff; background: #222; }
        #btn-options.active { color: #FF4444; }

        .page { display: none; flex-direction: column; flex: 1 1 0; min-height: 0; overflow: hidden; }
        .page.active { display: flex; }

        #enable-section { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; gap: 6px; }
        #enable-section .enable-icon { font-size: 36px; margin-bottom: 8px; }
        #enable-section p { font-size: 14px; line-height: 1.5; color: #aaa; }
        #enable-section p strong { color: #fff; font-weight: 600; }
        #enable-section .enable-sub { font-size: 12px; color: #555; margin-bottom: 18px; }
        #btn-enable {
            margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; max-width: 280px;
            padding: 12px 20px; background: #FF4444; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 14px;
            cursor: pointer; transition: background 0.15s;
        }
        #btn-enable:hover { background: #ff6060; }

        #loading-page { flex: 1; display: none; align-items: center; justify-content: center; color: #555; font-size: 14px; gap: 10px; }
        #loading-page.active { display: flex; }
        .spinner { width: 18px; height: 18px; border: 2px solid #333; border-top-color: #FF4444; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        #app-content { flex: 1 1 0; min-height: 0; display: none; flex-direction: column; overflow: hidden; padding: 0 14px 12px; }

        .tabs { display: flex; flex: 0 0 auto; border-bottom: 1px solid #222; margin-bottom: 12px; }
        .tab-btn { flex: 1; background: none; border: none; color: #555; padding: 10px 4px; cursor: pointer; font-weight: 600; font-size: 13px; transition: color 0.15s; border-bottom: 2px solid transparent; }
        .tab-btn:hover { color: #ccc; }
        .tab-btn.active { color: #FF4444; border-bottom-color: #FF4444; }

        .tab-content { display: none; flex: 1 1 0; min-height: 0; flex-direction: column; overflow: hidden; }
        .tab-content.active { display: flex; }

        .top-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex: 0 0 auto; }
        .sel-count { margin-bottom: 8px; font-size: 13px; color: #666; flex: 0 0 auto; }

        .image-scroll-box { flex: 1 1 0; min-height: 0; overflow-y: auto; overflow-x: hidden; border: 1px solid #222; border-radius: 8px; padding: 6px; background: #0a0a0a; }
        .image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; align-content: start; }
        .actions-bar { flex: 0 0 auto; margin-top: 8px; }

        .btn { display: block; width: 100%; padding: 10px; background: #FF4444; color: white; border: none; border-radius: 7px; font-weight: 700; cursor: pointer; text-align: center; font-size: 13px; transition: background 0.15s; }
        .btn:hover { background: #ff6060; }
        .btn:disabled { background: #2a2a2a; color: #444; cursor: not-allowed; }
        .btn-ghost { background: transparent; border: 1.5px solid #333; color: #888; }
        .btn-ghost:hover { border-color: #FF4444; color: #FF4444; background: transparent; }

        .grid-nav { display: flex; gap: 4px; }
        .grid-nav button { background: #1e1e1e; border: 1px solid #2e2e2e; color: #777; width: 26px; height: 26px; border-radius: 5px; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; padding: 0; transition: all 0.15s; }
        .grid-nav button:hover { background: #FF4444; border-color: #FF4444; color: #fff; }

        .text-btn { background: none; border: none; cursor: pointer; font-size: 12px; font-weight: 600; padding: 0; }
        .text-btn-green { color: #4CAF50; }
        .text-btn-red { color: #FF4444; }

        /* UI #1 CORRIGIDO: Thumbnails com aspect-ratio 2:3 (proporção mangá).
           Antes: height:160px fixo + object-fit:cover cortava o topo e rodapé das páginas.
           Depois: card respeita proporção natural, imagem inteira visível com letterbox. */
        .image-card { position: relative; border: 2px solid #252525; border-radius: 7px; overflow: hidden; cursor: pointer; background: #111; transition: border-color 0.12s; aspect-ratio: 2/3; }
        .image-card:hover { border-color: #3a3a3a; }
        .image-card.selected { border-color: #FF4444; }
        .image-card img { width: 100%; height: 100%; display: block; object-fit: contain; background: #0a0a0a; }
        .image-card .check { position: absolute; top: 6px; right: 6px; background: #FF4444; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; opacity: 0; transition: opacity 0.15s; }
        .image-card.selected .check { opacity: 1; }
        .image-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 3px 6px; font-size: 10px; text-align: center; color: #ddd; background: rgba(0,0,0,0.75); }

        .auto-dl-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #1a1a1a; border: 1px solid #222; border-radius: 7px; margin-bottom: 8px; flex: 0 0 auto; }
        .auto-dl-row input { width: 15px; height: 15px; cursor: pointer; accent-color: #FF4444; }
        .auto-dl-row label { cursor: pointer; font-size: 13px; color: #999; user-select: none; }

        .translated-toolbar { display: flex; gap: 6px; margin-bottom: 10px; flex: 0 0 auto; }
        .translated-toolbar .t-btn { flex: 1; padding: 8px; border: none; border-radius: 7px; color: white; font-weight: 700; font-size: 12px; cursor: pointer; transition: opacity 0.15s; }
        .translated-toolbar .t-btn:hover { opacity: 0.85; }
        #chapter-list { flex: 1 1 0; min-height: 0; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 8px; }

        .site-folder { background: #181818; border-radius: 8px; overflow: hidden; border: 1px solid #2a2a2a; }
        .site-folder-header { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; user-select: none; transition: background 0.15s; }
        .site-folder-header:hover { background: #202020; }
        .site-folder-favicon { width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: #3b3b3b; color: #ddd; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .site-folder-name { flex: 1; font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .site-folder-count { font-size: 10px; font-weight: 700; color: #FF9800; background: rgba(255,152,0,0.12); border: 1px solid rgba(255,152,0,0.3); padding: 1px 6px; border-radius: 10px; flex-shrink: 0; }
        
        .folder-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; margin-right: 8px; }
        .folder-actions button { background: none; border: none; cursor: pointer; padding: 0; transition: opacity 0.15s; }
        .folder-actions button:hover { opacity: 0.8; }
        .folder-nav-btn { background: #1e1e1e; border: 1px solid #2e2e2e; color: #777; width: 22px; height: 22px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; }
        .folder-nav-btn:hover { background: #FF4444 !important; border-color: #FF4444 !important; color: #fff !important; }

        .site-folder-arrow { color: #4fc3f7; font-size: 11px; flex-shrink: 0; transition: transform 0.2s; }
        .site-folder.open .site-folder-arrow { transform: rotate(90deg); color: #FF4444; }
        .site-folder-body { display: none; padding: 5px 8px 8px; flex-direction: column; gap: 6px; }
        .site-folder.open .site-folder-body { display: flex; }
        .chapter-item { background: #1e1e1e; border: 1px solid #2a2a2a; padding: 9px 10px; border-radius: 7px; display: flex; flex-direction: column; gap: 6px; }
        .chapter-thumb-strip { display:flex; gap:6px; overflow-x:auto; overflow-y:hidden; padding:4px 1px 5px; min-height:84px; scrollbar-width:thin; }
        .chapter-thumb-card { flex:0 0 58px; width:58px; height:78px; border:1px solid #303030; border-radius:5px; overflow:hidden; background:#0c0c0c; position:relative; display:flex; align-items:center; justify-content:center; }
        .chapter-thumb-card img { width:100%; height:100%; object-fit:contain; display:block; background:#080808; }
        .chapter-thumb-placeholder { color:#555; font-size:10px; text-align:center; padding:4px; line-height:1.25; }
        .chapter-thumb-card.loaded .chapter-thumb-placeholder { display:none; }
        .chapter-thumb-card.failed { border-color:#693333; }
        .chapter-thumb-card.failed .chapter-thumb-placeholder { color:#b36a6a; }
        .chapter-item-btns { display: flex; gap: 4px; }
        .chapter-item-btns button { border: none; color: white; padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 700; transition: opacity 0.15s; }
        .chapter-item-btns button:hover { opacity: 0.8; }
        .btn-read-chap { flex: 1; background: #2d7a38; }
        .btn-open-chap-folder { background: #b35c00; }
        .btn-export-chap { background: #1a5fa8; }
        .btn-delete-chap { background: #8a1c1c; }
        .chap-title-input { background: transparent; border: none; border-bottom: 1px solid transparent; color: #e0e0e0; font-weight: 600; width: 100%; padding: 2px 4px; outline: none; font-size: 12px; border-radius: 2px; transition: border-color 0.15s; }
        .chap-title-input:focus { border-bottom-color: #4CAF50; color: #fff; }
        .empty-msg { text-align: center; color: #444; padding: 20px 0; grid-column: 1/-1; font-size: 13px; }

        /* UI #3: Painel de progresso inline que substitui o popup fechar imediatamente */
        #progress-panel { display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; flex: 1; padding: 24px; text-align: center; }
        #progress-panel.active { display: flex; }
        #progress-bar-wrap { width: 100%; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
        #progress-bar-fill { height: 100%; background: linear-gradient(90deg, #FF4444, #ff9800); border-radius: 4px; transition: width 0.4s ease; width: 0%; }
        #progress-text { font-size: 14px; font-weight: 700; color: #eee; }
        #progress-sub { font-size: 12px; color: #666; }

        #settings-page { flex: 1 1 0; min-height: 0; display: none; flex-direction: column; padding: 0 16px 14px; overflow-y: auto; }
        .settings-divider { height: 1px; background: #1e1e1e; margin: 0 0 18px; flex: 0 0 auto; }
        .settings-section { margin-bottom: 22px; }
        .settings-section-title { font-size: 14px; font-weight: 700; color: #eee; margin-bottom: 4px; }
        .settings-section-desc { font-size: 12px; color: #555; margin-bottom: 12px; line-height: 1.5; }
        #settings-prompt { width: 100%; height: 170px; background: #161616; color: #ddd; border: 1.5px solid #2a2a2a; border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.55; resize: vertical; outline: none; transition: border-color 0.15s; font-family: inherit; }
        #settings-prompt:focus { border-color: #FF4444; }
        #settings-prompt::placeholder { color: #333; }
        #char-count { text-align: right; font-size: 11px; color: #444; margin-top: 5px; margin-bottom: 10px; }
        .settings-btn-row { display: flex; gap: 8px; }
        .s-btn { padding: 9px 16px; border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; border: none; }
        #s-btn-save { background: #FF4444; color: #fff; flex: 0 0 auto; }
        #s-btn-save:hover { background: #ff6060; }
        #s-btn-restore { background: transparent; color: #FF4444; border: 1.5px solid #FF4444; flex: 0 0 auto; }
        #s-btn-restore:hover { background: #FF444420; }
        #settings-status { font-size: 12px; margin-top: 8px; min-height: 18px; color: #4CAF50; }
        #settings-sites-list { display: flex; flex-direction: column; gap: 8px; max-height: min(330px, 52vh); overflow-y: auto; overflow-x: hidden; padding-right: 2px; overscroll-behavior: contain; }
        .settings-site-item { background: #161616; border: 1px solid #222; border-radius: 7px; overflow: hidden; }
        .settings-site-main { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; user-select: none; }
        .settings-site-arrow { color: #777; font-size: 12px; flex: 0 0 auto; transition: transform 0.15s ease, color 0.15s ease; }
        .settings-site-item.open .settings-site-arrow { transform: rotate(90deg); color: #FF4444; }
        .settings-site-favicon { width: 18px; height: 18px; border-radius: 3px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: #3b3b3b; color: #ddd; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .settings-site-host { flex: 1; font-size: 13px; color: #bbb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .settings-site-image-summary { color: #666; font-size: 11px; white-space: nowrap; flex-shrink: 0; }
        .settings-site-auto { display: flex; align-items: center; gap: 5px; color: #999; font-size: 12px; cursor: pointer; flex-shrink: 0; user-select: none; }
        .settings-site-auto input { accent-color: #FF4444; }
        .settings-site-remove { background: none; border: none; color: #FF4444; font-size: 16px; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; transition: background 0.15s; line-height: 1; }
        .settings-site-remove:hover { background: #FF444422; }
        .settings-site-images { border-top: 1px solid #222; padding: 8px 10px 10px; display: none; flex-direction: column; gap: 6px; background: #101010; max-height: 190px; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }
        .settings-site-item.open .settings-site-images { display: flex; }
        .settings-site-images-title { color: #777; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2px; }
        .settings-site-no-images { color: #4a4a4a; font-size: 12px; padding: 4px 0; }
        .settings-empty { font-size: 13px; color: #444; text-align: center; padding: 16px 0; }
        .settings-toggle-row { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; user-select: none; padding: 10px 12px; background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; transition: border-color 0.15s; }
        .settings-toggle-row:hover { border-color: #FF4444; }
        .settings-toggle-row input { margin-top: 2px; width: 16px; height: 16px; accent-color: #FF4444; flex-shrink: 0; }
        .settings-toggle-title { display: block; font-size: 13px; color: #ddd; font-weight: 700; }
        .settings-toggle-help { display: block; font-size: 11px; color: #666; line-height: 1.45; margin-top: 3px; }
        .settings-small-actions { display: flex; gap: 6px; margin-bottom: 8px; }
        .settings-small-actions button { background: #1e1e1e; border: 1px solid #333; color: #ccc; padding: 6px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .settings-small-actions button:hover { border-color: #FF4444; color: #fff; }
        .settings-auto-image-item { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto auto; gap: 8px; align-items: center; background: #161616; border: 1px solid #242424; border-radius: 7px; padding: 8px; }
        .settings-auto-image-preview { width: 48px; height: 64px; object-fit: contain; background: #080808; border-radius: 4px; }
        .settings-auto-image-info { min-width: 0; }
        .settings-auto-image-title { color: #ddd; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .settings-auto-image-url { color: #666; font-size: 10px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .settings-auto-image-state { font-size: 11px; margin-top: 3px; }
        .settings-auto-image-btn { border: none; border-radius: 5px; color: white; padding: 6px 8px; font-size: 11px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
        .settings-auto-image-redo-btn { background: #1a5fa8; }
        .settings-auto-image-btn:hover { opacity: 0.85; }

        .image-filter-control { display: grid; grid-template-columns: minmax(0, 1fr) 46px; gap: 8px; align-items: center; margin-top: 10px; }
        .image-filter-preview { min-height: 158px; display: flex; align-items: center; justify-content: center; padding: 12px; background: #101010; border: 1px solid #2a2a2a; border-radius: 8px; }
        .image-filter-shape { width: var(--filter-preview-width, 75px); height: var(--filter-preview-height, 100px); max-width: 100%; max-height: 130px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg, #ff4444, #9b2424); border: 2px solid #ff7474; border-radius: 4px; box-shadow: 0 0 18px rgba(255, 68, 68, .22); font-size: 12px; font-weight: 700; transition: width .12s ease, height .12s ease; }
        .image-filter-height { height: 150px; writing-mode: vertical-lr; direction: rtl; accent-color: #FF4444; cursor: pointer; }
        .image-filter-width { width: 100%; accent-color: #FF4444; cursor: pointer; }
        .image-filter-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .image-filter-field { display: flex; flex-direction: column; gap: 5px; color: #999; font-size: 11px; font-weight: 700; }
        .image-filter-field input { width: 100%; box-sizing: border-box; background: #161616; border: 1px solid #333; color: #eee; border-radius: 5px; padding: 7px 8px; outline: none; font-size: 13px; }
        .image-filter-field input:focus { border-color: #FF4444; }
        .image-filter-axis-label { display: flex; justify-content: space-between; color: #777; font-size: 10px; margin-top: 3px; }
        .image-filter-reset { margin-top: 8px; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 5px; padding: 6px 9px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .image-filter-reset:hover { border-color: #FF4444; color: #fff; }

        .debug-toggle-row { display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none; padding: 10px 12px; background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; transition: border-color 0.15s; }
        .debug-toggle-row:hover { border-color: #FF9800; }
        .debug-toggle-track { width: 42px; height: 24px; border-radius: 12px; background: #2a2a2a; position: relative; flex-shrink: 0; transition: background 0.2s; border: 1.5px solid #3a3a3a; }
        .debug-toggle-track.on { background: #FF9800; border-color: #FF9800; }
        .debug-toggle-thumb { width: 18px; height: 18px; border-radius: 50%; background: #666; position: absolute; top: 2px; left: 2px; transition: transform 0.2s, background 0.2s; }
        .debug-toggle-track.on .debug-toggle-thumb { transform: translateX(18px); background: #fff; }
        #debug-toggle-text { font-size: 13px; color: #999; transition: color 0.2s; }
        #debug-toggle-text.on { color: #FF9800; font-weight: 700; }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2e2e2e; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
    </style>
</head>
<body>
<div id="root">
    <div id="header">
        <div id="header-left">
            <h2>Manga Translator</h2>
            <span id="badge-settings">Configurações</span>
            <span id="translating-dot"></span>
            <span id="translating-label">Traduzindo...</span>
        </div>
        <button id="btn-options" title="Configurações">⚙</button>
    </div>

    <div id="enable-page" class="page active" style="display:flex;">
        <div id="enable-section">
            <div class="enable-icon">🔒</div>
            <p>A extensão está <strong>desativada</strong> neste site.</p>
            <p class="enable-sub">Ative para detectar e traduzir páginas de mangá.</p>
            <button id="btn-enable">✅&nbsp; Ativar neste site</button>
        </div>
    </div>

    <div id="loading-page">
        <div class="spinner"></div>
        <span>Carregando imagens...</span>
    </div>

    <div id="app-content">
        <!-- UI #3: Painel de progresso — visível após clicar Traduzir, antes de fechar -->
        <div id="progress-panel">
            <div style="font-size:32px;">🔄</div>
            <div id="progress-text">Iniciando tradução...</div>
            <div id="progress-bar-wrap"><div id="progress-bar-fill"></div></div>
            <div id="progress-sub">0 / 0 páginas</div>
            <button id="btn-progress-stop" class="btn btn-ghost" style="width:auto;padding:6px 20px;margin-top:4px;">⏹ Parar</button>
        </div>
        <div class="tabs">
            <button class="tab-btn active" data-target="main-tab">Principal</button>
            <button class="tab-btn" data-target="banned-tab">Banidas</button>
            <button class="tab-btn" data-target="translated-tab">Traduzidas</button>
        </div>

        <div id="main-tab" class="tab-content active">
            <div class="top-actions">
                <button id="btn-ban-selected" class="btn btn-ghost"
                    style="width:auto;padding:5px 10px;font-size:12px;" disabled>
                    🚫 Banir Selecionadas
                </button>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="grid-nav">
                        <button id="btn-scroll-top" title="Ir ao topo">▲</button>
                        <button id="btn-scroll-bottom" title="Ir ao final">▼</button>
                    </div>
                    <button id="btn-select-all" class="text-btn text-btn-green">Todas</button>
                    <button id="btn-select-none" class="text-btn text-btn-red">Nenhuma</button>
                </div>
            </div>
            <div class="sel-count"><span id="selection-count">0 imagens selecionadas</span></div>
            <div class="image-scroll-box">
                <div class="image-grid" id="image-grid"></div>
            </div>
            <div class="actions-bar">
                <button id="btn-translate" class="btn" disabled>Traduzir Selecionadas</button>
            </div>
        </div>

        <div id="banned-tab" class="tab-content">
            <div class="top-actions">
                <button id="btn-unban-selected" class="btn btn-ghost"
                    style="width:auto;padding:5px 10px;font-size:12px;" disabled>
                    ✅ Desbanir Selecionadas
                </button>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="grid-nav">
                        <button id="btn-banned-scroll-top" title="Ir ao topo">▲</button>
                        <button id="btn-banned-scroll-bottom" title="Ir ao final">▼</button>
                    </div>
                    <button id="btn-banned-select-all" class="text-btn text-btn-green">Todas</button>
                    <button id="btn-banned-select-none" class="text-btn text-btn-red">Nenhuma</button>
                </div>
            </div>
            <div class="sel-count"><span id="banned-selection-count">0 imagens selecionadas</span></div>
            <div id="banned-site-list" style="flex:1 1 0;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px;"></div>
        </div>

        <div id="translated-tab" class="tab-content">
            <div class="translated-toolbar">
                <button class="t-btn" id="btn-export-all" style="background:#1a5fa8;">💾 Exportar Tudo</button>
                <button class="t-btn" id="btn-open-folder" style="background:#2d7a38;">📂 MangaTranslator</button>
            </div>
            <div class="auto-dl-row">
                <input type="checkbox" id="chk-auto-download">
                <label for="chk-auto-download">💾 Baixar imagens automaticamente</label>
            </div>
            <div id="chapter-list"></div>
        </div>
    </div>

    <div id="settings-page">
        <div class="settings-tabs" style="display:flex; border-bottom: 1px solid #222; margin-bottom: 15px;">
            <button class="settings-tab-btn active" data-target="settings-generic" style="flex:1; background:none; border:none; color:#FF4444; padding:8px; cursor:pointer; font-weight:700; border-bottom:2px solid #FF4444;">Ajustes</button>
            <button class="settings-tab-btn" data-target="settings-logs" style="flex:1; background:none; border:none; color:#555; padding:8px; cursor:pointer; font-weight:700; border-bottom:2px solid transparent;">Logs do Sistema</button>
        </div>

        <div id="settings-generic" class="settings-tab-content active" style="display:flex; flex-direction:column;">
            <div class="settings-section">
                <div class="settings-section-title">Prompt personalizado para o Gemini</div>
                <div class="settings-section-desc">
                    Este texto é enviado junto com cada imagem. Use-o para ajustar o estilo de tradução,
                    idioma de destino ou outras instruções específicas.
                </div>
                <textarea id="settings-prompt" placeholder="Deixe em branco para usar o prompt padrão..."></textarea>
                <div id="char-count">0 caracteres</div>
                <div class="settings-btn-row">
                    <button class="s-btn" id="s-btn-save">💾 Salvar</button>
                    <button class="s-btn" id="s-btn-restore">↩ Restaurar padrão</button>
                </div>
                <div id="settings-status"></div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
                <div class="settings-section-title">Substituição automática</div>
                <div class="settings-section-desc">
                    Controle quando a extensão pode restaurar imagens sozinha depois de F5 ou ao reabrir um capítulo.
                    Traduções iniciadas manualmente continuam funcionando.
                </div>
                <label class="settings-toggle-row" id="settings-auto-restore-row">
                    <input type="checkbox" id="settings-auto-restore-enabled">
                    <span>
                        <span class="settings-toggle-title">Permitir auto-substituição global</span>
                        <span class="settings-toggle-help">Quando desligado, nenhuma imagem é trocada automaticamente em nenhum site.</span>
                    </span>
                </label>
                <div id="settings-enabled-sites-group" aria-labelledby="settings-enabled-sites-title">
                    <div class="settings-section-title" id="settings-enabled-sites-title" style="margin-top:18px;">Sites habilitados</div>
                    <div class="settings-section-desc">
                        Domínios onde a extensão está ativa. Abra cada site para ver as imagens salvas dele, bloquear auto-substituição ou refazer uma tradução específica.
                    </div>
                    <label class="settings-toggle-row" style="margin-bottom:8px;">
                        <input type="checkbox" id="settings-redo-confirm-enabled">
                        <span>
                            <span class="settings-toggle-title">Confirmar ao apertar o botão de refazer a imagem</span>
                            <span class="settings-toggle-help">Antes de apagar a tradução salva para refazê-la, pede uma confirmação própria da extensão.</span>
                        </span>
                    </label>
                    <div class="settings-small-actions">
                        <button id="settings-refresh-auto-images">Atualizar</button>
                        <button id="settings-clear-auto-blocks">Limpar bloqueios</button>
                    </div>
                    <div id="settings-sites-list"></div>
                </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
                <div class="settings-section-title">Interação na página</div>
                <div class="settings-section-desc">
                    Controle o botão flutuante e a tradução de uma única imagem por clique.
                </div>
                <label class="settings-toggle-row">
                    <input type="checkbox" id="settings-floating-button-enabled">
                    <span>
                        <span class="settings-toggle-title">Mostrar botão flutuante</span>
                        <span class="settings-toggle-help">Mantém o botão vermelho visível nos sites habilitados. Se ele desaparecer sozinho, a extensão registra erro e tenta recuperá-lo.</span>
                    </span>
                </label>
                <label class="settings-toggle-row" style="margin-top:8px;">
                    <input type="checkbox" id="settings-click-to-translate-enabled">
                    <span>
                        <span class="settings-toggle-title">Clique direito para traduzir uma única imagem</span>
                        <span class="settings-toggle-help">Ao clicar com o botão direito em uma imagem elegível, escolha “Traduzir esta imagem” no menu do navegador. Desligado por padrão.</span>
                    </span>
                </label>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
                <div class="settings-section-title">Modo de Execução do Gemini</div>
                <div class="settings-section-desc">
                    Escolha como o Gemini será aberto e gerenciado durante as traduções.
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
                    <label class="settings-toggle-row" style="cursor:pointer;"><input type="radio" name="popup-gemini-execution-mode" id="popup-gemini-mode-temp" value="temp_chat" style="accent-color:#FF4444; margin-top:2px;"><span><span class="settings-toggle-title">Conversa Temporária (Segundo Plano) — Padrão</span><span class="settings-toggle-help">Abre em aba oculta em segundo plano e ativa a conversa momentânea do Gemini. Não polui seu histórico e fecha rapidamente.</span></span></label>
                    <label class="settings-toggle-row" style="cursor:pointer;"><input type="radio" name="popup-gemini-execution-mode" id="popup-gemini-mode-minimized" value="minimized_window" style="accent-color:#FF4444; margin-top:2px;"><span><span class="settings-toggle-title">Janela Minimizada</span><span class="settings-toggle-help">Abre em janela separada minimizada. Recomendado caso o navegador congele abas em segundo plano.</span></span></label>
                    <label class="settings-toggle-row" style="cursor:pointer;"><input type="radio" name="popup-gemini-execution-mode" id="popup-gemini-mode-delete" value="background_delete" style="accent-color:#FF4444; margin-top:2px;"><span><span class="settings-toggle-title">Conversa Normal com Exclusão Segura</span><span class="settings-toggle-help">Abre em aba oculta em segundo plano usando uma conversa normal. Ao terminar, exclui a conversa automaticamente antes de fechar a aba.</span></span></label>
                </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
                <div class="settings-section-title">Traduções em Paralelo</div>
                <div class="settings-section-desc">Quantas imagens processar no Gemini ao mesmo tempo. Maior = mais rápido, mas requer abas abertas simultâneas.</div>
                <div style="display:flex; align-items:center; gap: 15px; margin-top: 10px;">
                    <input type="range" id="settings-parallel" min="1" max="10" value="1" style="flex:1;">
                    <span id="settings-parallel-val" style="font-weight:bold; font-size: 16px; min-width: 20px; text-align: center;">1</span>
                </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
                <div class="settings-section-title">Tamanho mínimo das imagens</div>
                <div class="settings-section-desc">Somente imagens que atendem à largura e à altura mínimas entram na lista para tradução. Ajuste para incluir páginas menores.</div>
                <div class="image-filter-inputs">
                    <label class="image-filter-field">Largura mínima (px)<input id="settings-image-min-width" type="number" min="0" max="3000" step="1" inputmode="numeric" value="300"></label>
                    <label class="image-filter-field">Altura mínima (px)<input id="settings-image-min-height" type="number" min="0" max="3000" step="1" inputmode="numeric" value="400"></label>
                </div>
                <button class="image-filter-reset" id="settings-image-min-reset" type="button">↩ Restaurar padrão (300 × 400)</button>
                <div class="image-filter-control" id="image-filter-control">
                    <div class="image-filter-preview"><div class="image-filter-shape" id="image-filter-shape">300 × 400</div></div>
                    <input class="image-filter-height" id="settings-image-min-height-range" type="range" min="0" max="3000" step="1" value="400" aria-label="Altura mínima">
                </div>
                <div style="padding-right:54px;"><input class="image-filter-width" id="settings-image-min-width-range" type="range" min="0" max="3000" step="1" value="300" aria-label="Largura mínima"><div class="image-filter-axis-label"><span>0 px</span><span>largura</span><span>3000 px</span></div></div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
                <div class="settings-section-title">🛠️ Modo Debug</div>
                <div class="settings-section-desc">
                    Quando ativado, as abas do Gemini e de extração <strong style="color:#FF9800">não serão fechadas</strong> após cada tradução.
                    Use para inspecionar o console e ver o que está quebrando.
                </div>
                <div class="debug-toggle-row" id="debug-toggle-label">
                    <div class="debug-toggle-track" id="debug-toggle-track">
                        <div class="debug-toggle-thumb" id="debug-toggle-thumb"></div>
                    </div>
                    <span id="debug-toggle-text">Debug desativado</span>
                </div>
            </div>
        </div>

        <div id="settings-logs" class="settings-tab-content" style="display:none; flex-direction:column; flex:1 1 0; min-height:0;">
            <div style="display:flex; gap:8px; margin-bottom:10px;">
                <select id="log-filter-level" style="background:#1a1a1a; color:#fff; border:1px solid #3a3a3a; padding:6px; border-radius:4px; font-size:12px;">
                    <option value="all">Todos</option>
                    <option value="error">Erros</option>
                    <option value="warn">Avisos</option>
                    <option value="success">Sucesso</option>
                    <option value="info">Info</option>
                </select>
                <button id="btn-log-clear" style="background:#3a3a3a; border:none; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; cursor:pointer;">Limpar</button>
                <button id="btn-log-copy" style="background:#9a5b00; border:none; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; cursor:pointer;">Copiar tudo</button>
                <button id="btn-log-export" style="background:#1a5fa8; border:none; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; cursor:pointer; margin-left:auto;">Exportar</button>
            </div>
            <div id="log-container" style="flex:1 1 0; overflow-y:auto; background:#0a0a0a; border:1px solid #2e2e2e; border-radius:6px; padding:8px; font-family:monospace; font-size:11px;"></div>
            <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:#888;">
                <label style="cursor:pointer;"><input type="checkbox" id="log-autoscroll" checked> Auto scroll</label>
                <span id="log-count">0 registros</span>
            </div>
        </div>
    </div>

    <script src="../shared/shared-ui.js"></script>
    <script src="popup.js"></script>
</div>
</body>
</html>


```

## 14. Cobertura documental linha a linha

| Linha | Unidade | Fonte | Explicação |
|---:|---|---|---|
| 1 | U01 | <code>&lt;!DOCTYPE html&gt;</code> | Declara HTML5; evita quirks mode e garante modelo moderno de layout/CSS para o popup. |
| 2 | U01 | <code>&lt;html&gt;</code> | Abre o documento raiz. O popup é carregado como página de extensão definida em `manifest.action.default_popup`. |
| 3 | U01 | <code>&lt;head&gt;</code> | Abre `&lt;head&gt;`, onde charset, título e todo o CSS local são definidos antes do DOM interativo. |
| 4 | U01 | <code>    &lt;meta charset="utf-8"&gt;</code> | Força UTF-8, necessário para emojis, acentos e textos PT-BR usados em toda a UI. |
| 5 | U01 | <code>    &lt;title&gt;Manga Translator&lt;/title&gt;</code> | Define o título do documento como `Manga Translator`; útil para inspeção/devtools e sem efeito no texto do header. |
| 6 | U01 | <code>    &lt;style&gt;</code> | Abre o stylesheet inline da página de extensão; não há stylesheet externo para o popup base. |
| 7 | U01 | <code>        * { box-sizing: border-box; margin: 0; padding: 0; }</code> | Comentário de manutenção da seção U01: registra a motivação visual/regressão local sem executar comportamento. |
| 8 | U01 | <code>        html, body {</code> | Inicia regra CSS de `html, body` dentro de Documento, metadados e viewport base; as linhas seguintes definem seu estado visual. |
| 9 | U01 | <code>            width: 500px;</code> | Continua a regra CSS de `html, body` com `width: 500px;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 10 | U01 | <code>            height: 600px;</code> | Continua a regra CSS de `html, body` com `height: 600px;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 11 | U01 | <code>            overflow: hidden;</code> | Continua a regra CSS de `html, body` com `overflow: hidden;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 12 | U01 | <code>            background: #111;</code> | Continua a regra CSS de `html, body` com `background: #111;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 13 | U01 | <code>            color: #fff;</code> | Continua a regra CSS de `html, body` com `color: #fff;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 14 | U01 | <code>            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;</code> | Continua a regra CSS de `html, body` com `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 15 | U01 | <code>        }</code> | Fecha a regra CSS corrente de `html, body`; nenhuma mudança de estado runtime ocorre aqui. |
| 16 | U01 | <code>        #root { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #111; position: relative; }</code> | Regra CSS para `#root`: define `width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #111; position: relative;`. No projeto, essa regra sustenta documento, metadados e viewport base sem depender de JavaScript para o layout base. |
| 17 | U02 | <code>        #header { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px 10px; flex: 0 0 auto; border-bottom: 1px solid #222; }</code> | Regra CSS para `#header`: define `display: flex; align-items: center; justify-content: space-between; padding: 13px 16px 10px; flex: 0 0 auto; border-bottom: 1px solid #222;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 18 | U02 | <code>        #header-left { display: flex; align-items: center; gap: 10px; }</code> | Regra CSS para `#header-left`: define `display: flex; align-items: center; gap: 10px;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 19 | U02 | <code>        #header h2 { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }</code> | Regra CSS para `#header h2`: define `font-size: 17px; font-weight: 700; letter-spacing: -0.3px;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 20 | U02 | <code>        /* UI #7: Dot pulsante no header quando tradução está ativa */</code> | Comentário de manutenção da seção U02: registra a motivação visual/regressão local sem executar comportamento. |
| 21 | U02 | <code>        #translating-dot {</code> | Inicia regra CSS de `#translating-dot` dentro de Header, status de tradução e botão de configurações; as linhas seguintes definem seu estado visual. |
| 22 | U02 | <code>            display: none; width: 8px; height: 8px; border-radius: 50%;</code> | Continua a regra CSS de `#translating-dot` com `display: none; width: 8px; height: 8px; border-radius: 50%;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 23 | U02 | <code>            background: #FF4444; flex-shrink: 0;</code> | Continua a regra CSS de `#translating-dot` com `background: #FF4444; flex-shrink: 0;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 24 | U02 | <code>            animation: pulse-dot 1.2s ease-in-out infinite;</code> | Continua a regra CSS de `#translating-dot` com `animation: pulse-dot 1.2s ease-in-out infinite;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 25 | U02 | <code>        }</code> | Fecha a regra CSS corrente de `#translating-dot`; nenhuma mudança de estado runtime ocorre aqui. |
| 26 | U02 | <code>        #translating-dot.visible { display: inline-block; }</code> | Regra CSS para `#translating-dot.visible`: define `display: inline-block;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 27 | U02 | <code>        #translating-label { display: none; font-size: 11px; color: #FF4444; font-weight: 700; }</code> | Regra CSS para `#translating-label`: define `display: none; font-size: 11px; color: #FF4444; font-weight: 700;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 28 | U02 | <code>        #translating-label.visible { display: inline-block; }</code> | Regra CSS para `#translating-label.visible`: define `display: inline-block;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 29 | U02 | <code>        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }</code> | Regra CSS para `@keyframes pulse-dot`: define `0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); }`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 30 | U02 | <code>        #badge-settings {</code> | Inicia regra CSS de `#badge-settings` dentro de Header, status de tradução e botão de configurações; as linhas seguintes definem seu estado visual. |
| 31 | U02 | <code>            display: none; font-size: 11px; font-weight: 700;</code> | Continua a regra CSS de `#badge-settings` com `display: none; font-size: 11px; font-weight: 700;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 32 | U02 | <code>            background: #FF4444; color: #fff; padding: 3px 9px;</code> | Continua a regra CSS de `#badge-settings` com `background: #FF4444; color: #fff; padding: 3px 9px;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 33 | U02 | <code>            border-radius: 20px; letter-spacing: 0.2px;</code> | Continua a regra CSS de `#badge-settings` com `border-radius: 20px; letter-spacing: 0.2px;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 34 | U02 | <code>        }</code> | Fecha a regra CSS corrente de `#badge-settings`; nenhuma mudança de estado runtime ocorre aqui. |
| 35 | U02 | <code>        #badge-settings.visible { display: inline-block; }</code> | Regra CSS para `#badge-settings.visible`: define `display: inline-block;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 36 | U02 | <code>        #btn-options {</code> | Inicia regra CSS de `#btn-options` dentro de Header, status de tradução e botão de configurações; as linhas seguintes definem seu estado visual. |
| 37 | U02 | <code>            background: none; border: none; color: #555; font-size: 18px;</code> | Continua a regra CSS de `#btn-options` com `background: none; border: none; color: #555; font-size: 18px;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 38 | U02 | <code>            cursor: pointer; padding: 4px 6px; border-radius: 6px;</code> | Continua a regra CSS de `#btn-options` com `cursor: pointer; padding: 4px 6px; border-radius: 6px;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 39 | U02 | <code>            line-height: 1; transition: color 0.15s, background 0.15s;</code> | Continua a regra CSS de `#btn-options` com `line-height: 1; transition: color 0.15s, background 0.15s;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 40 | U02 | <code>        }</code> | Fecha a regra CSS corrente de `#btn-options`; nenhuma mudança de estado runtime ocorre aqui. |
| 41 | U02 | <code>        #btn-options:hover { color: #fff; background: #222; }</code> | Regra CSS para `#btn-options:hover`: define `color: #fff; background: #222;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 42 | U02 | <code>        #btn-options.active { color: #FF4444; }</code> | Regra CSS para `#btn-options.active`: define `color: #FF4444;`. No projeto, essa regra sustenta header, status de tradução e botão de configurações sem depender de JavaScript para o layout base. |
| 43 | U02 | ␠ [linha vazia] | Separador visual de U02 — Header, status de tradução e botão de configurações; não cria nó nem regra CSS. |
| 44 | U03 | <code>        .page { display: none; flex-direction: column; flex: 1 1 0; min-height: 0; overflow: hidden; }</code> | Regra CSS para `.page`: define `display: none; flex-direction: column; flex: 1 1 0; min-height: 0; overflow: hidden;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 45 | U03 | <code>        .page.active { display: flex; }</code> | Regra CSS para `.page.active`: define `display: flex;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 46 | U03 | ␠ [linha vazia] | Separador visual de U03 — Estados de página, ativação, loading e app shell; não cria nó nem regra CSS. |
| 47 | U03 | <code>        #enable-section { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; gap: 6px; }</code> | Regra CSS para `#enable-section`: define `flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; gap: 6px;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 48 | U03 | <code>        #enable-section .enable-icon { font-size: 36px; margin-bottom: 8px; }</code> | Regra CSS para `#enable-section .enable-icon`: define `font-size: 36px; margin-bottom: 8px;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 49 | U03 | <code>        #enable-section p { font-size: 14px; line-height: 1.5; color: #aaa; }</code> | Regra CSS para `#enable-section p`: define `font-size: 14px; line-height: 1.5; color: #aaa;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 50 | U03 | <code>        #enable-section p strong { color: #fff; font-weight: 600; }</code> | Regra CSS para `#enable-section p strong`: define `color: #fff; font-weight: 600;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 51 | U03 | <code>        #enable-section .enable-sub { font-size: 12px; color: #555; margin-bottom: 18px; }</code> | Regra CSS para `#enable-section .enable-sub`: define `font-size: 12px; color: #555; margin-bottom: 18px;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 52 | U03 | <code>        #btn-enable {</code> | Inicia regra CSS de `#btn-enable` dentro de Estados de página, ativação, loading e app shell; as linhas seguintes definem seu estado visual. |
| 53 | U03 | <code>            margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; max-width: 280px;</code> | Continua a regra CSS de `#btn-enable` com `margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; max-width: 280px;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 54 | U03 | <code>            padding: 12px 20px; background: #FF4444; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 14px;</code> | Continua a regra CSS de `#btn-enable` com `padding: 12px 20px; background: #FF4444; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 14px;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 55 | U03 | <code>            cursor: pointer; transition: background 0.15s;</code> | Continua a regra CSS de `#btn-enable` com `cursor: pointer; transition: background 0.15s;`; esta declaração controla apresentação/overflow/dimensões, enquanto popup.js controla o estado funcional. |
| 56 | U03 | <code>        }</code> | Fecha a regra CSS corrente de `#btn-enable`; nenhuma mudança de estado runtime ocorre aqui. |
| 57 | U03 | <code>        #btn-enable:hover { background: #ff6060; }</code> | Regra CSS para `#btn-enable:hover`: define `background: #ff6060;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 58 | U03 | ␠ [linha vazia] | Separador visual de U03 — Estados de página, ativação, loading e app shell; não cria nó nem regra CSS. |
| 59 | U03 | <code>        #loading-page { flex: 1; display: none; align-items: center; justify-content: center; color: #555; font-size: 14px; gap: 10px; }</code> | Regra CSS para `#loading-page`: define `flex: 1; display: none; align-items: center; justify-content: center; color: #555; font-size: 14px; gap: 10px;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 60 | U03 | <code>        #loading-page.active { display: flex; }</code> | Regra CSS para `#loading-page.active`: define `display: flex;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 61 | U03 | <code>        .spinner { width: 18px; height: 18px; border: 2px solid #333; border-top-color: #FF4444; border-radius: 50%; animation: spin 0.7s linear infinite; }</code> | Regra CSS para `.spinner`: define `width: 18px; height: 18px; border: 2px solid #333; border-top-color: #FF4444; border-radius: 50%; animation: spin 0.7s linear infinite;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 62 | U03 | <code>        @keyframes spin { to { transform: rotate(360deg); } }</code> | Regra CSS para `@keyframes spin`: define `to { transform: rotate(360deg); }`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 63 | U03 | ␠ [linha vazia] | Separador visual de U03 — Estados de página, ativação, loading e app shell; não cria nó nem regra CSS. |
| 64 | U03 | <code>        #app-content { flex: 1 1 0; min-height: 0; display: none; flex-direction: column; overflow: hidden; padding: 0 14px 12px; }</code> | Regra CSS para `#app-content`: define `flex: 1 1 0; min-height: 0; display: none; flex-direction: column; overflow: hidden; padding: 0 14px 12px;`. No projeto, essa regra sustenta estados de página, ativação, loading e app shell sem depender de JavaScript para o layout base. |
| 65 | U03 | ␠ [linha vazia] | Separador visual de U03 — Estados de página, ativação, loading e app shell; não cria nó nem regra CSS. |
| 66 | U04 | <code>        .tabs { display: flex; flex: 0 0 auto; border-bottom: 1px solid #222; margin-bottom: 12px; }</code> | Regra CSS para `.tabs`: define `display: flex; flex: 0 0 auto; border-bottom: 1px solid #222; margin-bottom: 12px;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 67 | U04 | <code>        .tab-btn { flex: 1; background: none; border: none; color: #555; padding: 10px 4px; cursor: pointer; font-weight: 600; font-size: 13px; transition: color 0.15s; border-bottom: 2px solid transparent; }</code> | Regra CSS para `.tab-btn`: define `flex: 1; background: none; border: none; color: #555; padding: 10px 4px; cursor: pointer; font-weight: 600; font-size: 13px; transition: color 0.15s; border-bottom: 2px solid transparent;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 68 | U04 | <code>        .tab-btn:hover { color: #ccc; }</code> | Regra CSS para `.tab-btn:hover`: define `color: #ccc;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 69 | U04 | <code>        .tab-btn.active { color: #FF4444; border-bottom-color: #FF4444; }</code> | Regra CSS para `.tab-btn.active`: define `color: #FF4444; border-bottom-color: #FF4444;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 70 | U04 | ␠ [linha vazia] | Separador visual de U04 — Tabs, grids e botões compartilhados; não cria nó nem regra CSS. |
| 71 | U04 | <code>        .tab-content { display: none; flex: 1 1 0; min-height: 0; flex-direction: column; overflow: hidden; }</code> | Regra CSS para `.tab-content`: define `display: none; flex: 1 1 0; min-height: 0; flex-direction: column; overflow: hidden;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 72 | U04 | <code>        .tab-content.active { display: flex; }</code> | Regra CSS para `.tab-content.active`: define `display: flex;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 73 | U04 | ␠ [linha vazia] | Separador visual de U04 — Tabs, grids e botões compartilhados; não cria nó nem regra CSS. |
| 74 | U04 | <code>        .top-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex: 0 0 auto; }</code> | Regra CSS para `.top-actions`: define `display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex: 0 0 auto;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 75 | U04 | <code>        .sel-count { margin-bottom: 8px; font-size: 13px; color: #666; flex: 0 0 auto; }</code> | Regra CSS para `.sel-count`: define `margin-bottom: 8px; font-size: 13px; color: #666; flex: 0 0 auto;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 76 | U04 | ␠ [linha vazia] | Separador visual de U04 — Tabs, grids e botões compartilhados; não cria nó nem regra CSS. |
| 77 | U04 | <code>        .image-scroll-box { flex: 1 1 0; min-height: 0; overflow-y: auto; overflow-x: hidden; border: 1px solid #222; border-radius: 8px; padding: 6px; background: #0a0a0a; }</code> | Regra CSS para `.image-scroll-box`: define `flex: 1 1 0; min-height: 0; overflow-y: auto; overflow-x: hidden; border: 1px solid #222; border-radius: 8px; padding: 6px; background: #0a0a0a;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 78 | U04 | <code>        .image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; align-content: start; }</code> | Regra CSS para `.image-grid`: define `display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; align-content: start;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 79 | U04 | <code>        .actions-bar { flex: 0 0 auto; margin-top: 8px; }</code> | Regra CSS para `.actions-bar`: define `flex: 0 0 auto; margin-top: 8px;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 80 | U04 | ␠ [linha vazia] | Separador visual de U04 — Tabs, grids e botões compartilhados; não cria nó nem regra CSS. |
| 81 | U04 | <code>        .btn { display: block; width: 100%; padding: 10px; background: #FF4444; color: white; border: none; border-radius: 7px; font-weight: 700; cursor: pointer; text-align: center; font-size: 13px; transition: background 0.15s; }</code> | Regra CSS para `.btn`: define `display: block; width: 100%; padding: 10px; background: #FF4444; color: white; border: none; border-radius: 7px; font-weight: 700; cursor: pointer; text-align: center; font-size: 13px; transition: background 0.15s;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 82 | U04 | <code>        .btn:hover { background: #ff6060; }</code> | Regra CSS para `.btn:hover`: define `background: #ff6060;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 83 | U04 | <code>        .btn:disabled { background: #2a2a2a; color: #444; cursor: not-allowed; }</code> | Regra CSS para `.btn:disabled`: define `background: #2a2a2a; color: #444; cursor: not-allowed;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 84 | U04 | <code>        .btn-ghost { background: transparent; border: 1.5px solid #333; color: #888; }</code> | Regra CSS para `.btn-ghost`: define `background: transparent; border: 1.5px solid #333; color: #888;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 85 | U04 | <code>        .btn-ghost:hover { border-color: #FF4444; color: #FF4444; background: transparent; }</code> | Regra CSS para `.btn-ghost:hover`: define `border-color: #FF4444; color: #FF4444; background: transparent;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 86 | U04 | ␠ [linha vazia] | Separador visual de U04 — Tabs, grids e botões compartilhados; não cria nó nem regra CSS. |
| 87 | U04 | <code>        .grid-nav { display: flex; gap: 4px; }</code> | Regra CSS para `.grid-nav`: define `display: flex; gap: 4px;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 88 | U04 | <code>        .grid-nav button { background: #1e1e1e; border: 1px solid #2e2e2e; color: #777; width: 26px; height: 26px; border-radius: 5px; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; padding: 0; transition: all 0.15s; }</code> | Regra CSS para `.grid-nav button`: define `background: #1e1e1e; border: 1px solid #2e2e2e; color: #777; width: 26px; height: 26px; border-radius: 5px; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; padding: 0; transition: all 0.15s;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 89 | U04 | <code>        .grid-nav button:hover { background: #FF4444; border-color: #FF4444; color: #fff; }</code> | Regra CSS para `.grid-nav button:hover`: define `background: #FF4444; border-color: #FF4444; color: #fff;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 90 | U04 | ␠ [linha vazia] | Separador visual de U04 — Tabs, grids e botões compartilhados; não cria nó nem regra CSS. |
| 91 | U04 | <code>        .text-btn { background: none; border: none; cursor: pointer; font-size: 12px; font-weight: 600; padding: 0; }</code> | Regra CSS para `.text-btn`: define `background: none; border: none; cursor: pointer; font-size: 12px; font-weight: 600; padding: 0;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 92 | U04 | <code>        .text-btn-green { color: #4CAF50; }</code> | Regra CSS para `.text-btn-green`: define `color: #4CAF50;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 93 | U04 | <code>        .text-btn-red { color: #FF4444; }</code> | Regra CSS para `.text-btn-red`: define `color: #FF4444;`. No projeto, essa regra sustenta tabs, grids e botões compartilhados sem depender de JavaScript para o layout base. |
| 94 | U04 | ␠ [linha vazia] | Separador visual de U04 — Tabs, grids e botões compartilhados; não cria nó nem regra CSS. |
| 95 | U05 | <code>        /* UI #1 CORRIGIDO: Thumbnails com aspect-ratio 2:3 (proporção mangá).</code> | Comentário de manutenção da seção U05: registra a motivação visual/regressão local sem executar comportamento. |
| 96 | U05 | <code>           Antes: height:160px fixo + object-fit:cover cortava o topo e rodapé das páginas.</code> | Comentário de manutenção da seção U05: registra a motivação visual/regressão local sem executar comportamento. |
| 97 | U05 | <code>           Depois: card respeita proporção natural, imagem inteira visível com letterbox. */</code> | Comentário de manutenção da seção U05: registra a motivação visual/regressão local sem executar comportamento. |
| 98 | U05 | <code>        .image-card { position: relative; border: 2px solid #252525; border-radius: 7px; overflow: hidden; cursor: pointer; background: #111; transition: border-color 0.12s; aspect-ratio: 2/3; }</code> | Regra CSS para `.image-card`: define `position: relative; border: 2px solid #252525; border-radius: 7px; overflow: hidden; cursor: pointer; background: #111; transition: border-color 0.12s; aspect-ratio: 2/3;`. No projeto, essa regra sustenta cards de imagem e seleção sem depender de JavaScript para o layout base. |
| 99 | U05 | <code>        .image-card:hover { border-color: #3a3a3a; }</code> | Regra CSS para `.image-card:hover`: define `border-color: #3a3a3a;`. No projeto, essa regra sustenta cards de imagem e seleção sem depender de JavaScript para o layout base. |
| 100 | U05 | <code>        .image-card.selected { border-color: #FF4444; }</code> | Regra CSS para `.image-card.selected`: define `border-color: #FF4444;`. No projeto, essa regra sustenta cards de imagem e seleção sem depender de JavaScript para o layout base. |
| 101 | U05 | <code>        .image-card img { width: 100%; height: 100%; display: block; object-fit: contain; background: #0a0a0a; }</code> | Regra CSS para `.image-card img`: define `width: 100%; height: 100%; display: block; object-fit: contain; background: #0a0a0a;`. No projeto, essa regra sustenta cards de imagem e seleção sem depender de JavaScript para o layout base. |
| 102 | U05 | <code>        .image-card .check { position: absolute; top: 6px; right: 6px; background: #FF4444; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; opacity: 0; transition: opacity 0.15s; }</code> | Regra CSS para `.image-card .check`: define `position: absolute; top: 6px; right: 6px; background: #FF4444; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; opacity: 0; transition: opacity 0.15s;`. No projeto, essa regra sustenta cards de imagem e seleção sem depender de JavaScript para o layout base. |
| 103 | U05 | <code>        .image-card.selected .check { opacity: 1; }</code> | Regra CSS para `.image-card.selected .check`: define `opacity: 1;`. No projeto, essa regra sustenta cards de imagem e seleção sem depender de JavaScript para o layout base. |
| 104 | U05 | <code>        .image-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 3px 6px; font-size: 10px; text-align: center; color: #ddd; background: rgba(0,0,0,0.75); }</code> | Regra CSS para `.image-info`: define `position: absolute; bottom: 0; left: 0; right: 0; padding: 3px 6px; font-size: 10px; text-align: center; color: #ddd; background: rgba(0,0,0,0.75);`. No projeto, essa regra sustenta cards de imagem e seleção sem depender de JavaScript para o layout base. |
| 105 | U05 | ␠ [linha vazia] | Separador visual de U05 — Cards de imagem e seleção; não cria nó nem regra CSS. |
| 106 | U06 | <code>        .auto-dl-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #1a1a1a; border: 1px solid #222; border-radius: 7px; margin-bottom: 8px; flex: 0 0 auto; }</code> | Regra CSS para `.auto-dl-row`: define `display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #1a1a1a; border: 1px solid #222; border-radius: 7px; margin-bottom: 8px; flex: 0 0 auto;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 107 | U06 | <code>        .auto-dl-row input { width: 15px; height: 15px; cursor: pointer; accent-color: #FF4444; }</code> | Regra CSS para `.auto-dl-row input`: define `width: 15px; height: 15px; cursor: pointer; accent-color: #FF4444;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 108 | U06 | <code>        .auto-dl-row label { cursor: pointer; font-size: 13px; color: #999; user-select: none; }</code> | Regra CSS para `.auto-dl-row label`: define `cursor: pointer; font-size: 13px; color: #999; user-select: none;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 109 | U06 | ␠ [linha vazia] | Separador visual de U06 — Traduzidas, folders, capítulos e miniaturas; não cria nó nem regra CSS. |
| 110 | U06 | <code>        .translated-toolbar { display: flex; gap: 6px; margin-bottom: 10px; flex: 0 0 auto; }</code> | Regra CSS para `.translated-toolbar`: define `display: flex; gap: 6px; margin-bottom: 10px; flex: 0 0 auto;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 111 | U06 | <code>        .translated-toolbar .t-btn { flex: 1; padding: 8px; border: none; border-radius: 7px; color: white; font-weight: 700; font-size: 12px; cursor: pointer; transition: opacity 0.15s; }</code> | Regra CSS para `.translated-toolbar .t-btn`: define `flex: 1; padding: 8px; border: none; border-radius: 7px; color: white; font-weight: 700; font-size: 12px; cursor: pointer; transition: opacity 0.15s;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 112 | U06 | <code>        .translated-toolbar .t-btn:hover { opacity: 0.85; }</code> | Regra CSS para `.translated-toolbar .t-btn:hover`: define `opacity: 0.85;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 113 | U06 | <code>        #chapter-list { flex: 1 1 0; min-height: 0; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 8px; }</code> | Regra CSS para `#chapter-list`: define `flex: 1 1 0; min-height: 0; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 8px;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 114 | U06 | ␠ [linha vazia] | Separador visual de U06 — Traduzidas, folders, capítulos e miniaturas; não cria nó nem regra CSS. |
| 115 | U06 | <code>        .site-folder { background: #181818; border-radius: 8px; overflow: hidden; border: 1px solid #2a2a2a; }</code> | Regra CSS para `.site-folder`: define `background: #181818; border-radius: 8px; overflow: hidden; border: 1px solid #2a2a2a;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 116 | U06 | <code>        .site-folder-header { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; user-select: none; transition: background 0.15s; }</code> | Regra CSS para `.site-folder-header`: define `display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; user-select: none; transition: background 0.15s;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 117 | U06 | <code>        .site-folder-header:hover { background: #202020; }</code> | Regra CSS para `.site-folder-header:hover`: define `background: #202020;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 118 | U06 | <code>        .site-folder-favicon { width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: #3b3b3b; color: #ddd; font-size: 10px; font-weight: 700; text-transform: uppercase; }</code> | Regra CSS para `.site-folder-favicon`: define `width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: #3b3b3b; color: #ddd; font-size: 10px; font-weight: 700; text-transform: uppercase;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 119 | U06 | <code>        .site-folder-name { flex: 1; font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }</code> | Regra CSS para `.site-folder-name`: define `flex: 1; font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 120 | U06 | <code>        .site-folder-count { font-size: 10px; font-weight: 700; color: #FF9800; background: rgba(255,152,0,0.12); border: 1px solid rgba(255,152,0,0.3); padding: 1px 6px; border-radius: 10px; flex-shrink: 0; }</code> | Regra CSS para `.site-folder-count`: define `font-size: 10px; font-weight: 700; color: #FF9800; background: rgba(255,152,0,0.12); border: 1px solid rgba(255,152,0,0.3); padding: 1px 6px; border-radius: 10px; flex-shrink: 0;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 121 | U06 | <code>        </code> | Separador visual de U06 — Traduzidas, folders, capítulos e miniaturas; não cria nó nem regra CSS. |
| 122 | U06 | <code>        .folder-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; margin-right: 8px; }</code> | Regra CSS para `.folder-actions`: define `display: flex; align-items: center; gap: 6px; margin-left: auto; margin-right: 8px;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 123 | U06 | <code>        .folder-actions button { background: none; border: none; cursor: pointer; padding: 0; transition: opacity 0.15s; }</code> | Regra CSS para `.folder-actions button`: define `background: none; border: none; cursor: pointer; padding: 0; transition: opacity 0.15s;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 124 | U06 | <code>        .folder-actions button:hover { opacity: 0.8; }</code> | Regra CSS para `.folder-actions button:hover`: define `opacity: 0.8;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 125 | U06 | <code>        .folder-nav-btn { background: #1e1e1e; border: 1px solid #2e2e2e; color: #777; width: 22px; height: 22px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; }</code> | Regra CSS para `.folder-nav-btn`: define `background: #1e1e1e; border: 1px solid #2e2e2e; color: #777; width: 22px; height: 22px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 126 | U06 | <code>        .folder-nav-btn:hover { background: #FF4444 !important; border-color: #FF4444 !important; color: #fff !important; }</code> | Regra CSS para `.folder-nav-btn:hover`: define `background: #FF4444 !important; border-color: #FF4444 !important; color: #fff !important;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 127 | U06 | ␠ [linha vazia] | Separador visual de U06 — Traduzidas, folders, capítulos e miniaturas; não cria nó nem regra CSS. |
| 128 | U06 | <code>        .site-folder-arrow { color: #4fc3f7; font-size: 11px; flex-shrink: 0; transition: transform 0.2s; }</code> | Regra CSS para `.site-folder-arrow`: define `color: #4fc3f7; font-size: 11px; flex-shrink: 0; transition: transform 0.2s;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 129 | U06 | <code>        .site-folder.open .site-folder-arrow { transform: rotate(90deg); color: #FF4444; }</code> | Regra CSS para `.site-folder.open .site-folder-arrow`: define `transform: rotate(90deg); color: #FF4444;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 130 | U06 | <code>        .site-folder-body { display: none; padding: 5px 8px 8px; flex-direction: column; gap: 6px; }</code> | Regra CSS para `.site-folder-body`: define `display: none; padding: 5px 8px 8px; flex-direction: column; gap: 6px;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 131 | U06 | <code>        .site-folder.open .site-folder-body { display: flex; }</code> | Regra CSS para `.site-folder.open .site-folder-body`: define `display: flex;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 132 | U06 | <code>        .chapter-item { background: #1e1e1e; border: 1px solid #2a2a2a; padding: 9px 10px; border-radius: 7px; display: flex; flex-direction: column; gap: 6px; }</code> | Regra CSS para `.chapter-item`: define `background: #1e1e1e; border: 1px solid #2a2a2a; padding: 9px 10px; border-radius: 7px; display: flex; flex-direction: column; gap: 6px;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 133 | U06 | <code>        .chapter-thumb-strip { display:flex; gap:6px; overflow-x:auto; overflow-y:hidden; padding:4px 1px 5px; min-height:84px; scrollbar-width:thin; }</code> | Regra CSS para `.chapter-thumb-strip`: define `display:flex; gap:6px; overflow-x:auto; overflow-y:hidden; padding:4px 1px 5px; min-height:84px; scrollbar-width:thin;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 134 | U06 | <code>        .chapter-thumb-card { flex:0 0 58px; width:58px; height:78px; border:1px solid #303030; border-radius:5px; overflow:hidden; background:#0c0c0c; position:relative; display:flex; align-items:center; justify-content:center; }</code> | Regra CSS para `.chapter-thumb-card`: define `flex:0 0 58px; width:58px; height:78px; border:1px solid #303030; border-radius:5px; overflow:hidden; background:#0c0c0c; position:relative; display:flex; align-items:center; justify-content:center;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 135 | U06 | <code>        .chapter-thumb-card img { width:100%; height:100%; object-fit:contain; display:block; background:#080808; }</code> | Regra CSS para `.chapter-thumb-card img`: define `width:100%; height:100%; object-fit:contain; display:block; background:#080808;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 136 | U06 | <code>        .chapter-thumb-placeholder { color:#555; font-size:10px; text-align:center; padding:4px; line-height:1.25; }</code> | Regra CSS para `.chapter-thumb-placeholder`: define `color:#555; font-size:10px; text-align:center; padding:4px; line-height:1.25;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 137 | U06 | <code>        .chapter-thumb-card.loaded .chapter-thumb-placeholder { display:none; }</code> | Regra CSS para `.chapter-thumb-card.loaded .chapter-thumb-placeholder`: define `display:none;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 138 | U06 | <code>        .chapter-thumb-card.failed { border-color:#693333; }</code> | Regra CSS para `.chapter-thumb-card.failed`: define `border-color:#693333;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 139 | U06 | <code>        .chapter-thumb-card.failed .chapter-thumb-placeholder { color:#b36a6a; }</code> | Regra CSS para `.chapter-thumb-card.failed .chapter-thumb-placeholder`: define `color:#b36a6a;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 140 | U06 | <code>        .chapter-item-btns { display: flex; gap: 4px; }</code> | Regra CSS para `.chapter-item-btns`: define `display: flex; gap: 4px;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 141 | U06 | <code>        .chapter-item-btns button { border: none; color: white; padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 700; transition: opacity 0.15s; }</code> | Regra CSS para `.chapter-item-btns button`: define `border: none; color: white; padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 700; transition: opacity 0.15s;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 142 | U06 | <code>        .chapter-item-btns button:hover { opacity: 0.8; }</code> | Regra CSS para `.chapter-item-btns button:hover`: define `opacity: 0.8;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 143 | U06 | <code>        .btn-read-chap { flex: 1; background: #2d7a38; }</code> | Regra CSS para `.btn-read-chap`: define `flex: 1; background: #2d7a38;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 144 | U06 | <code>        .btn-open-chap-folder { background: #b35c00; }</code> | Regra CSS para `.btn-open-chap-folder`: define `background: #b35c00;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 145 | U06 | <code>        .btn-export-chap { background: #1a5fa8; }</code> | Regra CSS para `.btn-export-chap`: define `background: #1a5fa8;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 146 | U06 | <code>        .btn-delete-chap { background: #8a1c1c; }</code> | Regra CSS para `.btn-delete-chap`: define `background: #8a1c1c;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 147 | U06 | <code>        .chap-title-input { background: transparent; border: none; border-bottom: 1px solid transparent; color: #e0e0e0; font-weight: 600; width: 100%; padding: 2px 4px; outline: none; font-size: 12px; border-radius: 2px; transition: border-color 0.15s; }</code> | Regra CSS para `.chap-title-input`: define `background: transparent; border: none; border-bottom: 1px solid transparent; color: #e0e0e0; font-weight: 600; width: 100%; padding: 2px 4px; outline: none; font-size: 12px; border-radius: 2px; transition: border-color 0.15s;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 148 | U06 | <code>        .chap-title-input:focus { border-bottom-color: #4CAF50; color: #fff; }</code> | Regra CSS para `.chap-title-input:focus`: define `border-bottom-color: #4CAF50; color: #fff;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 149 | U06 | <code>        .empty-msg { text-align: center; color: #444; padding: 20px 0; grid-column: 1/-1; font-size: 13px; }</code> | Regra CSS para `.empty-msg`: define `text-align: center; color: #444; padding: 20px 0; grid-column: 1/-1; font-size: 13px;`. No projeto, essa regra sustenta traduzidas, folders, capítulos e miniaturas sem depender de JavaScript para o layout base. |
| 150 | U06 | ␠ [linha vazia] | Separador visual de U06 — Traduzidas, folders, capítulos e miniaturas; não cria nó nem regra CSS. |
| 151 | U07 | <code>        /* UI #3: Painel de progresso inline que substitui o popup fechar imediatamente */</code> | Comentário de manutenção da seção U07: registra a motivação visual/regressão local sem executar comportamento. |
| 152 | U07 | <code>        #progress-panel { display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; flex: 1; padding: 24px; text-align: center; }</code> | Regra CSS para `#progress-panel`: define `display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; flex: 1; padding: 24px; text-align: center;`. No projeto, essa regra sustenta painel de progresso sem depender de JavaScript para o layout base. |
| 153 | U07 | <code>        #progress-panel.active { display: flex; }</code> | Regra CSS para `#progress-panel.active`: define `display: flex;`. No projeto, essa regra sustenta painel de progresso sem depender de JavaScript para o layout base. |
| 154 | U07 | <code>        #progress-bar-wrap { width: 100%; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }</code> | Regra CSS para `#progress-bar-wrap`: define `width: 100%; height: 8px; background: #222; border-radius: 4px; overflow: hidden;`. No projeto, essa regra sustenta painel de progresso sem depender de JavaScript para o layout base. |
| 155 | U07 | <code>        #progress-bar-fill { height: 100%; background: linear-gradient(90deg, #FF4444, #ff9800); border-radius: 4px; transition: width 0.4s ease; width: 0%; }</code> | Regra CSS para `#progress-bar-fill`: define `height: 100%; background: linear-gradient(90deg, #FF4444, #ff9800); border-radius: 4px; transition: width 0.4s ease; width: 0%;`. No projeto, essa regra sustenta painel de progresso sem depender de JavaScript para o layout base. |
| 156 | U07 | <code>        #progress-text { font-size: 14px; font-weight: 700; color: #eee; }</code> | Regra CSS para `#progress-text`: define `font-size: 14px; font-weight: 700; color: #eee;`. No projeto, essa regra sustenta painel de progresso sem depender de JavaScript para o layout base. |
| 157 | U07 | <code>        #progress-sub { font-size: 12px; color: #666; }</code> | Regra CSS para `#progress-sub`: define `font-size: 12px; color: #666;`. No projeto, essa regra sustenta painel de progresso sem depender de JavaScript para o layout base. |
| 158 | U07 | ␠ [linha vazia] | Separador visual de U07 — Painel de progresso; não cria nó nem regra CSS. |
| 159 | U08 | <code>        #settings-page { flex: 1 1 0; min-height: 0; display: none; flex-direction: column; padding: 0 16px 14px; overflow-y: auto; }</code> | Regra CSS para `#settings-page`: define `flex: 1 1 0; min-height: 0; display: none; flex-direction: column; padding: 0 16px 14px; overflow-y: auto;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 160 | U08 | <code>        .settings-divider { height: 1px; background: #1e1e1e; margin: 0 0 18px; flex: 0 0 auto; }</code> | Regra CSS para `.settings-divider`: define `height: 1px; background: #1e1e1e; margin: 0 0 18px; flex: 0 0 auto;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 161 | U08 | <code>        .settings-section { margin-bottom: 22px; }</code> | Regra CSS para `.settings-section`: define `margin-bottom: 22px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 162 | U08 | <code>        .settings-section-title { font-size: 14px; font-weight: 700; color: #eee; margin-bottom: 4px; }</code> | Regra CSS para `.settings-section-title`: define `font-size: 14px; font-weight: 700; color: #eee; margin-bottom: 4px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 163 | U08 | <code>        .settings-section-desc { font-size: 12px; color: #555; margin-bottom: 12px; line-height: 1.5; }</code> | Regra CSS para `.settings-section-desc`: define `font-size: 12px; color: #555; margin-bottom: 12px; line-height: 1.5;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 164 | U08 | <code>        #settings-prompt { width: 100%; height: 170px; background: #161616; color: #ddd; border: 1.5px solid #2a2a2a; border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.55; resize: vertical; outline: none; transition: border-color 0.15s; font-family: inherit; }</code> | Regra CSS para `#settings-prompt`: define `width: 100%; height: 170px; background: #161616; color: #ddd; border: 1.5px solid #2a2a2a; border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.55; resize: vertical; outline: none; transition: border-color 0.15s; font-family: inherit;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 165 | U08 | <code>        #settings-prompt:focus { border-color: #FF4444; }</code> | Regra CSS para `#settings-prompt:focus`: define `border-color: #FF4444;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 166 | U08 | <code>        #settings-prompt::placeholder { color: #333; }</code> | Regra CSS para `#settings-prompt::placeholder`: define `color: #333;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 167 | U08 | <code>        #char-count { text-align: right; font-size: 11px; color: #444; margin-top: 5px; margin-bottom: 10px; }</code> | Regra CSS para `#char-count`: define `text-align: right; font-size: 11px; color: #444; margin-top: 5px; margin-bottom: 10px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 168 | U08 | <code>        .settings-btn-row { display: flex; gap: 8px; }</code> | Regra CSS para `.settings-btn-row`: define `display: flex; gap: 8px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 169 | U08 | <code>        .s-btn { padding: 9px 16px; border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; border: none; }</code> | Regra CSS para `.s-btn`: define `padding: 9px 16px; border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; border: none;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 170 | U08 | <code>        #s-btn-save { background: #FF4444; color: #fff; flex: 0 0 auto; }</code> | Regra CSS para `#s-btn-save`: define `background: #FF4444; color: #fff; flex: 0 0 auto;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 171 | U08 | <code>        #s-btn-save:hover { background: #ff6060; }</code> | Regra CSS para `#s-btn-save:hover`: define `background: #ff6060;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 172 | U08 | <code>        #s-btn-restore { background: transparent; color: #FF4444; border: 1.5px solid #FF4444; flex: 0 0 auto; }</code> | Regra CSS para `#s-btn-restore`: define `background: transparent; color: #FF4444; border: 1.5px solid #FF4444; flex: 0 0 auto;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 173 | U08 | <code>        #s-btn-restore:hover { background: #FF444420; }</code> | Regra CSS para `#s-btn-restore:hover`: define `background: #FF444420;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 174 | U08 | <code>        #settings-status { font-size: 12px; margin-top: 8px; min-height: 18px; color: #4CAF50; }</code> | Regra CSS para `#settings-status`: define `font-size: 12px; margin-top: 8px; min-height: 18px; color: #4CAF50;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 175 | U08 | <code>        #settings-sites-list { display: flex; flex-direction: column; gap: 8px; max-height: min(330px, 52vh); overflow-y: auto; overflow-x: hidden; padding-right: 2px; overscroll-behavior: contain; }</code> | Regra CSS para `#settings-sites-list`: define `display: flex; flex-direction: column; gap: 8px; max-height: min(330px, 52vh); overflow-y: auto; overflow-x: hidden; padding-right: 2px; overscroll-behavior: contain;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 176 | U08 | <code>        .settings-site-item { background: #161616; border: 1px solid #222; border-radius: 7px; overflow: hidden; }</code> | Regra CSS para `.settings-site-item`: define `background: #161616; border: 1px solid #222; border-radius: 7px; overflow: hidden;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 177 | U08 | <code>        .settings-site-main { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; user-select: none; }</code> | Regra CSS para `.settings-site-main`: define `display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; user-select: none;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 178 | U08 | <code>        .settings-site-arrow { color: #777; font-size: 12px; flex: 0 0 auto; transition: transform 0.15s ease, color 0.15s ease; }</code> | Regra CSS para `.settings-site-arrow`: define `color: #777; font-size: 12px; flex: 0 0 auto; transition: transform 0.15s ease, color 0.15s ease;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 179 | U08 | <code>        .settings-site-item.open .settings-site-arrow { transform: rotate(90deg); color: #FF4444; }</code> | Regra CSS para `.settings-site-item.open .settings-site-arrow`: define `transform: rotate(90deg); color: #FF4444;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 180 | U08 | <code>        .settings-site-favicon { width: 18px; height: 18px; border-radius: 3px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: #3b3b3b; color: #ddd; font-size: 11px; font-weight: 700; text-transform: uppercase; }</code> | Regra CSS para `.settings-site-favicon`: define `width: 18px; height: 18px; border-radius: 3px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: #3b3b3b; color: #ddd; font-size: 11px; font-weight: 700; text-transform: uppercase;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 181 | U08 | <code>        .settings-site-host { flex: 1; font-size: 13px; color: #bbb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }</code> | Regra CSS para `.settings-site-host`: define `flex: 1; font-size: 13px; color: #bbb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 182 | U08 | <code>        .settings-site-image-summary { color: #666; font-size: 11px; white-space: nowrap; flex-shrink: 0; }</code> | Regra CSS para `.settings-site-image-summary`: define `color: #666; font-size: 11px; white-space: nowrap; flex-shrink: 0;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 183 | U08 | <code>        .settings-site-auto { display: flex; align-items: center; gap: 5px; color: #999; font-size: 12px; cursor: pointer; flex-shrink: 0; user-select: none; }</code> | Regra CSS para `.settings-site-auto`: define `display: flex; align-items: center; gap: 5px; color: #999; font-size: 12px; cursor: pointer; flex-shrink: 0; user-select: none;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 184 | U08 | <code>        .settings-site-auto input { accent-color: #FF4444; }</code> | Regra CSS para `.settings-site-auto input`: define `accent-color: #FF4444;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 185 | U08 | <code>        .settings-site-remove { background: none; border: none; color: #FF4444; font-size: 16px; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; transition: background 0.15s; line-height: 1; }</code> | Regra CSS para `.settings-site-remove`: define `background: none; border: none; color: #FF4444; font-size: 16px; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; transition: background 0.15s; line-height: 1;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 186 | U08 | <code>        .settings-site-remove:hover { background: #FF444422; }</code> | Regra CSS para `.settings-site-remove:hover`: define `background: #FF444422;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 187 | U08 | <code>        .settings-site-images { border-top: 1px solid #222; padding: 8px 10px 10px; display: none; flex-direction: column; gap: 6px; background: #101010; max-height: 190px; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }</code> | Regra CSS para `.settings-site-images`: define `border-top: 1px solid #222; padding: 8px 10px 10px; display: none; flex-direction: column; gap: 6px; background: #101010; max-height: 190px; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 188 | U08 | <code>        .settings-site-item.open .settings-site-images { display: flex; }</code> | Regra CSS para `.settings-site-item.open .settings-site-images`: define `display: flex;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 189 | U08 | <code>        .settings-site-images-title { color: #777; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2px; }</code> | Regra CSS para `.settings-site-images-title`: define `color: #777; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 190 | U08 | <code>        .settings-site-no-images { color: #4a4a4a; font-size: 12px; padding: 4px 0; }</code> | Regra CSS para `.settings-site-no-images`: define `color: #4a4a4a; font-size: 12px; padding: 4px 0;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 191 | U08 | <code>        .settings-empty { font-size: 13px; color: #444; text-align: center; padding: 16px 0; }</code> | Regra CSS para `.settings-empty`: define `font-size: 13px; color: #444; text-align: center; padding: 16px 0;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 192 | U08 | <code>        .settings-toggle-row { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; user-select: none; padding: 10px 12px; background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; transition: border-color 0.15s; }</code> | Regra CSS para `.settings-toggle-row`: define `display: flex; align-items: flex-start; gap: 10px; cursor: pointer; user-select: none; padding: 10px 12px; background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; transition: border-color 0.15s;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 193 | U08 | <code>        .settings-toggle-row:hover { border-color: #FF4444; }</code> | Regra CSS para `.settings-toggle-row:hover`: define `border-color: #FF4444;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 194 | U08 | <code>        .settings-toggle-row input { margin-top: 2px; width: 16px; height: 16px; accent-color: #FF4444; flex-shrink: 0; }</code> | Regra CSS para `.settings-toggle-row input`: define `margin-top: 2px; width: 16px; height: 16px; accent-color: #FF4444; flex-shrink: 0;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 195 | U08 | <code>        .settings-toggle-title { display: block; font-size: 13px; color: #ddd; font-weight: 700; }</code> | Regra CSS para `.settings-toggle-title`: define `display: block; font-size: 13px; color: #ddd; font-weight: 700;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 196 | U08 | <code>        .settings-toggle-help { display: block; font-size: 11px; color: #666; line-height: 1.45; margin-top: 3px; }</code> | Regra CSS para `.settings-toggle-help`: define `display: block; font-size: 11px; color: #666; line-height: 1.45; margin-top: 3px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 197 | U08 | <code>        .settings-small-actions { display: flex; gap: 6px; margin-bottom: 8px; }</code> | Regra CSS para `.settings-small-actions`: define `display: flex; gap: 6px; margin-bottom: 8px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 198 | U08 | <code>        .settings-small-actions button { background: #1e1e1e; border: 1px solid #333; color: #ccc; padding: 6px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; cursor: pointer; }</code> | Regra CSS para `.settings-small-actions button`: define `background: #1e1e1e; border: 1px solid #333; color: #ccc; padding: 6px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; cursor: pointer;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 199 | U08 | <code>        .settings-small-actions button:hover { border-color: #FF4444; color: #fff; }</code> | Regra CSS para `.settings-small-actions button:hover`: define `border-color: #FF4444; color: #fff;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 200 | U08 | <code>        .settings-auto-image-item { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto auto; gap: 8px; align-items: center; background: #161616; border: 1px solid #242424; border-radius: 7px; padding: 8px; }</code> | Regra CSS para `.settings-auto-image-item`: define `display: grid; grid-template-columns: 48px minmax(0, 1fr) auto auto; gap: 8px; align-items: center; background: #161616; border: 1px solid #242424; border-radius: 7px; padding: 8px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 201 | U08 | <code>        .settings-auto-image-preview { width: 48px; height: 64px; object-fit: contain; background: #080808; border-radius: 4px; }</code> | Regra CSS para `.settings-auto-image-preview`: define `width: 48px; height: 64px; object-fit: contain; background: #080808; border-radius: 4px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 202 | U08 | <code>        .settings-auto-image-info { min-width: 0; }</code> | Regra CSS para `.settings-auto-image-info`: define `min-width: 0;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 203 | U08 | <code>        .settings-auto-image-title { color: #ddd; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }</code> | Regra CSS para `.settings-auto-image-title`: define `color: #ddd; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 204 | U08 | <code>        .settings-auto-image-url { color: #666; font-size: 10px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }</code> | Regra CSS para `.settings-auto-image-url`: define `color: #666; font-size: 10px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 205 | U08 | <code>        .settings-auto-image-state { font-size: 11px; margin-top: 3px; }</code> | Regra CSS para `.settings-auto-image-state`: define `font-size: 11px; margin-top: 3px;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 206 | U08 | <code>        .settings-auto-image-btn { border: none; border-radius: 5px; color: white; padding: 6px 8px; font-size: 11px; font-weight: 700; cursor: pointer; flex-shrink: 0; }</code> | Regra CSS para `.settings-auto-image-btn`: define `border: none; border-radius: 5px; color: white; padding: 6px 8px; font-size: 11px; font-weight: 700; cursor: pointer; flex-shrink: 0;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 207 | U08 | <code>        .settings-auto-image-redo-btn { background: #1a5fa8; }</code> | Regra CSS para `.settings-auto-image-redo-btn`: define `background: #1a5fa8;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 208 | U08 | <code>        .settings-auto-image-btn:hover { opacity: 0.85; }</code> | Regra CSS para `.settings-auto-image-btn:hover`: define `opacity: 0.85;`. No projeto, essa regra sustenta settings, sites habilitados e itens por imagem sem depender de JavaScript para o layout base. |
| 209 | U08 | ␠ [linha vazia] | Separador visual de U08 — Settings, sites habilitados e itens por imagem; não cria nó nem regra CSS. |
| 210 | U09 | <code>        .image-filter-control { display: grid; grid-template-columns: minmax(0, 1fr) 46px; gap: 8px; align-items: center; margin-top: 10px; }</code> | Regra CSS para `.image-filter-control`: define `display: grid; grid-template-columns: minmax(0, 1fr) 46px; gap: 8px; align-items: center; margin-top: 10px;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 211 | U09 | <code>        .image-filter-preview { min-height: 158px; display: flex; align-items: center; justify-content: center; padding: 12px; background: #101010; border: 1px solid #2a2a2a; border-radius: 8px; }</code> | Regra CSS para `.image-filter-preview`: define `min-height: 158px; display: flex; align-items: center; justify-content: center; padding: 12px; background: #101010; border: 1px solid #2a2a2a; border-radius: 8px;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 212 | U09 | <code>        .image-filter-shape { width: var(--filter-preview-width, 75px); height: var(--filter-preview-height, 100px); max-width: 100%; max-height: 130px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg, #ff4444, #9b2424); border: 2px solid #ff7474; border-radius: 4px; box-shadow: 0 0 18px rgba(255, 68, 68, .22); font-size: 12px; font-weight: 700; transition: width .12s ease, height .12s ease; }</code> | Regra CSS para `.image-filter-shape`: define `width: var(--filter-preview-width, 75px); height: var(--filter-preview-height, 100px); max-width: 100%; max-height: 130px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg, #ff4444, #9b2424); border: 2px solid #ff7474; border-radius: 4px; box-shadow: 0 0 18px rgba(255, 68, 68, .22); font-size: 12px; font-weight: 700; transition: width .12s ease, height .12s ease;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 213 | U09 | <code>        .image-filter-height { height: 150px; writing-mode: vertical-lr; direction: rtl; accent-color: #FF4444; cursor: pointer; }</code> | Regra CSS para `.image-filter-height`: define `height: 150px; writing-mode: vertical-lr; direction: rtl; accent-color: #FF4444; cursor: pointer;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 214 | U09 | <code>        .image-filter-width { width: 100%; accent-color: #FF4444; cursor: pointer; }</code> | Regra CSS para `.image-filter-width`: define `width: 100%; accent-color: #FF4444; cursor: pointer;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 215 | U09 | <code>        .image-filter-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }</code> | Regra CSS para `.image-filter-inputs`: define `display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 216 | U09 | <code>        .image-filter-field { display: flex; flex-direction: column; gap: 5px; color: #999; font-size: 11px; font-weight: 700; }</code> | Regra CSS para `.image-filter-field`: define `display: flex; flex-direction: column; gap: 5px; color: #999; font-size: 11px; font-weight: 700;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 217 | U09 | <code>        .image-filter-field input { width: 100%; box-sizing: border-box; background: #161616; border: 1px solid #333; color: #eee; border-radius: 5px; padding: 7px 8px; outline: none; font-size: 13px; }</code> | Regra CSS para `.image-filter-field input`: define `width: 100%; box-sizing: border-box; background: #161616; border: 1px solid #333; color: #eee; border-radius: 5px; padding: 7px 8px; outline: none; font-size: 13px;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 218 | U09 | <code>        .image-filter-field input:focus { border-color: #FF4444; }</code> | Regra CSS para `.image-filter-field input:focus`: define `border-color: #FF4444;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 219 | U09 | <code>        .image-filter-axis-label { display: flex; justify-content: space-between; color: #777; font-size: 10px; margin-top: 3px; }</code> | Regra CSS para `.image-filter-axis-label`: define `display: flex; justify-content: space-between; color: #777; font-size: 10px; margin-top: 3px;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 220 | U09 | <code>        .image-filter-reset { margin-top: 8px; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 5px; padding: 6px 9px; font-size: 11px; font-weight: 700; cursor: pointer; }</code> | Regra CSS para `.image-filter-reset`: define `margin-top: 8px; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 5px; padding: 6px 9px; font-size: 11px; font-weight: 700; cursor: pointer;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 221 | U09 | <code>        .image-filter-reset:hover { border-color: #FF4444; color: #fff; }</code> | Regra CSS para `.image-filter-reset:hover`: define `border-color: #FF4444; color: #fff;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 222 | U09 | ␠ [linha vazia] | Separador visual de U09 — Filtro de tamanho e toggle de debug; não cria nó nem regra CSS. |
| 223 | U09 | <code>        .debug-toggle-row { display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none; padding: 10px 12px; background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; transition: border-color 0.15s; }</code> | Regra CSS para `.debug-toggle-row`: define `display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none; padding: 10px 12px; background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; transition: border-color 0.15s;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 224 | U09 | <code>        .debug-toggle-row:hover { border-color: #FF9800; }</code> | Regra CSS para `.debug-toggle-row:hover`: define `border-color: #FF9800;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 225 | U09 | <code>        .debug-toggle-track { width: 42px; height: 24px; border-radius: 12px; background: #2a2a2a; position: relative; flex-shrink: 0; transition: background 0.2s; border: 1.5px solid #3a3a3a; }</code> | Regra CSS para `.debug-toggle-track`: define `width: 42px; height: 24px; border-radius: 12px; background: #2a2a2a; position: relative; flex-shrink: 0; transition: background 0.2s; border: 1.5px solid #3a3a3a;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 226 | U09 | <code>        .debug-toggle-track.on { background: #FF9800; border-color: #FF9800; }</code> | Regra CSS para `.debug-toggle-track.on`: define `background: #FF9800; border-color: #FF9800;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 227 | U09 | <code>        .debug-toggle-thumb { width: 18px; height: 18px; border-radius: 50%; background: #666; position: absolute; top: 2px; left: 2px; transition: transform 0.2s, background 0.2s; }</code> | Regra CSS para `.debug-toggle-thumb`: define `width: 18px; height: 18px; border-radius: 50%; background: #666; position: absolute; top: 2px; left: 2px; transition: transform 0.2s, background 0.2s;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 228 | U09 | <code>        .debug-toggle-track.on .debug-toggle-thumb { transform: translateX(18px); background: #fff; }</code> | Regra CSS para `.debug-toggle-track.on .debug-toggle-thumb`: define `transform: translateX(18px); background: #fff;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 229 | U09 | <code>        #debug-toggle-text { font-size: 13px; color: #999; transition: color 0.2s; }</code> | Regra CSS para `#debug-toggle-text`: define `font-size: 13px; color: #999; transition: color 0.2s;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 230 | U09 | <code>        #debug-toggle-text.on { color: #FF9800; font-weight: 700; }</code> | Regra CSS para `#debug-toggle-text.on`: define `color: #FF9800; font-weight: 700;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 231 | U09 | ␠ [linha vazia] | Separador visual de U09 — Filtro de tamanho e toggle de debug; não cria nó nem regra CSS. |
| 232 | U09 | <code>        ::-webkit-scrollbar { width: 6px; }</code> | Regra CSS para `::-webkit-scrollbar`: define `width: 6px;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 233 | U09 | <code>        ::-webkit-scrollbar-track { background: transparent; }</code> | Regra CSS para `::-webkit-scrollbar-track`: define `background: transparent;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 234 | U09 | <code>        ::-webkit-scrollbar-thumb { background: #2e2e2e; border-radius: 3px; }</code> | Regra CSS para `::-webkit-scrollbar-thumb`: define `background: #2e2e2e; border-radius: 3px;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 235 | U09 | <code>        ::-webkit-scrollbar-thumb:hover { background: #444; }</code> | Regra CSS para `::-webkit-scrollbar-thumb:hover`: define `background: #444;`. No projeto, essa regra sustenta filtro de tamanho e toggle de debug sem depender de JavaScript para o layout base. |
| 236 | U10 | <code>    &lt;/style&gt;</code> | Fecha o `&lt;style&gt;`; a partir daqui o arquivo passa do contrato visual para a árvore DOM consumida por popup.js. |
| 237 | U10 | <code>&lt;/head&gt;</code> | Fecha o `&lt;head&gt;` depois de metadados e CSS. |
| 238 | U10 | <code>&lt;body&gt;</code> | Abre o `&lt;body&gt;` do popup. popup.js pode sobrescrever width/height inline quando restaura `popupSize`. |
| 239 | U10 | <code>&lt;div id="root"&gt;</code> | Define `div#root`: raiz visual do popup; popup.js usa o document inteiro, e o root concentra header + páginas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 240 | U10 | <code>    &lt;div id="header"&gt;</code> | Define `div#header`: barra superior persistente que abriga título, estado de tradução e acesso a configurações. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 241 | U10 | <code>        &lt;div id="header-left"&gt;</code> | Define `div#header-left`: agrupa título e badges/indicadores sem misturar o botão de configurações. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 242 | U10 | <code>            &lt;h2&gt;Manga Translator&lt;/h2&gt;</code> | Renderiza o título visível `Manga Translator` no header. |
| 243 | U10 | <code>            &lt;span id="badge-settings"&gt;Configurações&lt;/span&gt;</code> | Define `span#badge-settings`: badge visual que identifica quando a página de configurações está ativa. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 244 | U10 | <code>            &lt;span id="translating-dot"&gt;&lt;/span&gt;</code> | Define `span#translating-dot`: indicador visual pulsante de jobs ativos; tests de progresso verificam a classe `visible`. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 245 | U10 | <code>            &lt;span id="translating-label"&gt;Traduzindo...&lt;/span&gt;</code> | Define `span#translating-label`: texto complementar `Traduzindo...`, alternado junto do dot. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 246 | U10 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div id="header-left">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 247 | U10 | <code>        &lt;button id="btn-options" title="Configurações"&gt;⚙&lt;/button&gt;</code> | Define `button#btn-options`: controle real que abre/fecha configurações; testes de integração clicam este ID. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 248 | U10 | <code>    &lt;/div&gt;</code> | Fecha especificamente <div id="header">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 249 | U10 | ␠ [linha vazia] | Separador visual de U10 — Fechamento do head e header estrutural; não cria nó nem regra CSS. |
| 250 | U11 | <code>    &lt;div id="enable-page" class="page active" style="display:flex;"&gt;</code> | Define `div#enable-page`: página inicial para domínio ainda não habilitado. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 251 | U11 | <code>        &lt;div id="enable-section"&gt;</code> | Define `div#enable-section`: conteúdo do gate de ativação; popup.js também o reutiliza para mensagem de recarga. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 252 | U11 | <code>            &lt;div class="enable-icon"&gt;🔒&lt;/div&gt;</code> | Abre container estrutural de Gate de domínio habilitado e loading; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 253 | U11 | <code>            &lt;p&gt;A extensão está &lt;strong&gt;desativada&lt;/strong&gt; neste site.&lt;/p&gt;</code> | Cria texto explicativo de Gate de domínio habilitado e loading; comunica ao usuário a consequência do controle adjacente. |
| 254 | U11 | <code>            &lt;p class="enable-sub"&gt;Ative para detectar e traduzir páginas de mangá.&lt;/p&gt;</code> | Cria texto explicativo de Gate de domínio habilitado e loading; comunica ao usuário a consequência do controle adjacente. |
| 255 | U11 | <code>            &lt;button id="btn-enable"&gt;✅&amp;nbsp; Ativar neste site&lt;/button&gt;</code> | Define `button#btn-enable`: ação que habilita o domínio corrente e inicializa a grade. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 256 | U11 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div id="enable-section">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 257 | U11 | <code>    &lt;/div&gt;</code> | Fecha especificamente <div id="enable-page">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 258 | U11 | ␠ [linha vazia] | Separador visual de U11 — Gate de domínio habilitado e loading; não cria nó nem regra CSS. |
| 259 | U11 | <code>    &lt;div id="loading-page"&gt;</code> | Define `div#loading-page`: estado intermediário enquanto imagens/dados são carregados. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 260 | U11 | <code>        &lt;div class="spinner"&gt;&lt;/div&gt;</code> | Abre container estrutural de Gate de domínio habilitado e loading; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 261 | U11 | <code>        &lt;span&gt;Carregando imagens...&lt;/span&gt;</code> | Cria span textual/indicador de Gate de domínio habilitado e loading; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 262 | U11 | <code>    &lt;/div&gt;</code> | Fecha especificamente <div id="loading-page">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 263 | U11 | ␠ [linha vazia] | Separador visual de U11 — Gate de domínio habilitado e loading; não cria nó nem regra CSS. |
| 264 | U12 | <code>    &lt;div id="app-content"&gt;</code> | Define `div#app-content`: container das tabs e do painel de progresso quando o site está habilitado. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 265 | U12 | <code>        &lt;!-- UI #3: Painel de progresso — visível após clicar Traduzir, antes de fechar --&gt;</code> | Comentário de manutenção da árvore DOM para App principal, progresso e aba Principal; não gera nó renderizado. |
| 266 | U12 | <code>        &lt;div id="progress-panel"&gt;</code> | Define `div#progress-panel`: painel inline ativado durante lote; evita fechar o popup imediatamente. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 267 | U12 | <code>            &lt;div style="font-size:32px;"&gt;🔄&lt;/div&gt;</code> | Abre container estrutural de App principal, progresso e aba Principal; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 268 | U12 | <code>            &lt;div id="progress-text"&gt;Iniciando tradução...&lt;/div&gt;</code> | Define `div#progress-text`: mensagem principal de estado do lote. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 269 | U12 | <code>            &lt;div id="progress-bar-wrap"&gt;&lt;div id="progress-bar-fill"&gt;&lt;/div&gt;&lt;/div&gt;</code> | Define `div#progress-bar-wrap`: trilho visual da barra de progresso. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 270 | U12 | <code>            &lt;div id="progress-sub"&gt;0 / 0 páginas&lt;/div&gt;</code> | Define `div#progress-sub`: contador/posição secundária do lote e da fila. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 271 | U12 | <code>            &lt;button id="btn-progress-stop" class="btn btn-ghost" style="width:auto;padding:6px 20px;margin-top:4px;"&gt;⏹ Parar&lt;/button&gt;</code> | Define `button#btn-progress-stop`: cancela somente o lote da aba ativa via content script. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 272 | U12 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div id="progress-panel">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 273 | U12 | <code>        &lt;div class="tabs"&gt;</code> | Abre container estrutural de App principal, progresso e aba Principal; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 274 | U12 | <code>            &lt;button class="tab-btn active" data-target="main-tab"&gt;Principal&lt;/button&gt;</code> | Cria botão de tab “Principal” com `data-target="main-tab"`; popup.js usa `data-target` para alternar o painel correspondente. |
| 275 | U12 | <code>            &lt;button class="tab-btn" data-target="banned-tab"&gt;Banidas&lt;/button&gt;</code> | Cria botão de tab “Banidas” com `data-target="banned-tab"`; popup.js usa `data-target` para alternar o painel correspondente. |
| 276 | U12 | <code>            &lt;button class="tab-btn" data-target="translated-tab"&gt;Traduzidas&lt;/button&gt;</code> | Cria botão de tab “Traduzidas” com `data-target="translated-tab"`; popup.js usa `data-target` para alternar o painel correspondente. |
| 277 | U12 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div class="tabs">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 278 | U12 | ␠ [linha vazia] | Separador visual de U12 — App principal, progresso e aba Principal; não cria nó nem regra CSS. |
| 279 | U12 | <code>        &lt;div id="main-tab" class="tab-content active"&gt;</code> | Define `div#main-tab`: conteúdo da aba Principal. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 280 | U12 | <code>            &lt;div class="top-actions"&gt;</code> | Abre container estrutural de App principal, progresso e aba Principal; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 281 | U12 | <code>                &lt;button id="btn-ban-selected" class="btn btn-ghost"</code> | Define `button#btn-ban-selected`: move seleção atual para a lista banida. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 282 | U12 | <code>                    style="width:auto;padding:5px 10px;font-size:12px;" disabled&gt;</code> | Completa a tag de `#btn-ban-selected`: aplica estilo compacto e mantém o botão `disabled` no markup inicial, evitando banimento antes de existir seleção. |
| 283 | U12 | <code>                    🚫 Banir Selecionadas</code> | Texto visível de `#btn-ban-selected`; comunica que a ação afeta somente as imagens selecionadas. |
| 284 | U12 | <code>                &lt;/button&gt;</code> | Fecha exatamente `#btn-ban-selected`, cujo estado inicial disabled é revertido por popup.js somente quando há seleção válida. |
| 285 | U12 | <code>                &lt;div style="display:flex;align-items:center;gap:8px;"&gt;</code> | Abre container estrutural de App principal, progresso e aba Principal; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 286 | U12 | <code>                    &lt;div class="grid-nav"&gt;</code> | Abre container estrutural de App principal, progresso e aba Principal; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 287 | U12 | <code>                        &lt;button id="btn-scroll-top" title="Ir ao topo"&gt;▲&lt;/button&gt;</code> | Define `button#btn-scroll-top`: leva o scroll da grade principal ao topo. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 288 | U12 | <code>                        &lt;button id="btn-scroll-bottom" title="Ir ao final"&gt;▼&lt;/button&gt;</code> | Define `button#btn-scroll-bottom`: leva o scroll da grade principal ao fim. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 289 | U12 | <code>                    &lt;/div&gt;</code> | Fecha especificamente <div class="grid-nav">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 290 | U12 | <code>                    &lt;button id="btn-select-all" class="text-btn text-btn-green"&gt;Todas&lt;/button&gt;</code> | Define `button#btn-select-all`: seleciona todos os cards elegíveis da grade. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 291 | U12 | <code>                    &lt;button id="btn-select-none" class="text-btn text-btn-red"&gt;Nenhuma&lt;/button&gt;</code> | Define `button#btn-select-none`: limpa a seleção da grade. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 292 | U12 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 293 | U12 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="top-actions">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 294 | U12 | <code>            &lt;div class="sel-count"&gt;&lt;span id="selection-count"&gt;0 imagens selecionadas&lt;/span&gt;&lt;/div&gt;</code> | Define `div#selection-count`: texto derivado da quantidade de cards selecionados. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 295 | U12 | <code>            &lt;div class="image-scroll-box"&gt;</code> | Abre container estrutural de App principal, progresso e aba Principal; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 296 | U12 | <code>                &lt;div class="image-grid" id="image-grid"&gt;&lt;/div&gt;</code> | Define `div#image-grid`: mount point onde popup.js cria `.image-card` dinamicamente. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 297 | U12 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="image-scroll-box">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 298 | U12 | <code>            &lt;div class="actions-bar"&gt;</code> | Abre container estrutural de App principal, progresso e aba Principal; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 299 | U12 | <code>                &lt;button id="btn-translate" class="btn" disabled&gt;Traduzir Selecionadas&lt;/button&gt;</code> | Define `button#btn-translate`: dispara tradução das páginas selecionadas; começa disabled. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 300 | U12 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="actions-bar">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 301 | U12 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div id="main-tab">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 302 | U12 | ␠ [linha vazia] | Separador visual de U12 — App principal, progresso e aba Principal; não cria nó nem regra CSS. |
| 303 | U13 | <code>        &lt;div id="banned-tab" class="tab-content"&gt;</code> | Define `div#banned-tab`: conteúdo da aba de imagens banidas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 304 | U13 | <code>            &lt;div class="top-actions"&gt;</code> | Abre container estrutural de Aba Banidas; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 305 | U13 | <code>                &lt;button id="btn-unban-selected" class="btn btn-ghost"</code> | Define `button#btn-unban-selected`: remove banimento das imagens selecionadas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 306 | U13 | <code>                    style="width:auto;padding:5px 10px;font-size:12px;" disabled&gt;</code> | Completa a tag de `#btn-unban-selected`: usa estilo compacto e inicia `disabled` até existir seleção na aba Banidas. |
| 307 | U13 | <code>                    ✅ Desbanir Selecionadas</code> | Texto visível de `#btn-unban-selected`; descreve a reversão do banimento para a seleção corrente. |
| 308 | U13 | <code>                &lt;/button&gt;</code> | Fecha exatamente `#btn-unban-selected`, mantendo o botão isolado antes do bloco de navegação/seleção das banidas. |
| 309 | U13 | <code>                &lt;div style="display:flex;align-items:center;gap:8px;"&gt;</code> | Abre container estrutural de Aba Banidas; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 310 | U13 | <code>                    &lt;div class="grid-nav"&gt;</code> | Abre container estrutural de Aba Banidas; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 311 | U13 | <code>                        &lt;button id="btn-banned-scroll-top" title="Ir ao topo"&gt;▲&lt;/button&gt;</code> | Define `button#btn-banned-scroll-top`: leva a lista de banidas ao topo. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 312 | U13 | <code>                        &lt;button id="btn-banned-scroll-bottom" title="Ir ao final"&gt;▼&lt;/button&gt;</code> | Define `button#btn-banned-scroll-bottom`: leva a lista de banidas ao fim. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 313 | U13 | <code>                    &lt;/div&gt;</code> | Fecha especificamente <div class="grid-nav">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 314 | U13 | <code>                    &lt;button id="btn-banned-select-all" class="text-btn text-btn-green"&gt;Todas&lt;/button&gt;</code> | Define `button#btn-banned-select-all`: seleciona todas as imagens banidas renderizadas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 315 | U13 | <code>                    &lt;button id="btn-banned-select-none" class="text-btn text-btn-red"&gt;Nenhuma&lt;/button&gt;</code> | Define `button#btn-banned-select-none`: limpa a seleção de banidas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 316 | U13 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 317 | U13 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="top-actions">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 318 | U13 | <code>            &lt;div class="sel-count"&gt;&lt;span id="banned-selection-count"&gt;0 imagens selecionadas&lt;/span&gt;&lt;/div&gt;</code> | Define `div#banned-selection-count`: contador visual de banidas selecionadas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 319 | U13 | <code>            &lt;div id="banned-site-list" style="flex:1 1 0;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px;"&gt;&lt;/div&gt;</code> | Define `div#banned-site-list`: mount point de folders por domínio e cards banidos. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 320 | U13 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div id="banned-tab">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 321 | U13 | ␠ [linha vazia] | Separador visual de U13 — Aba Banidas; não cria nó nem regra CSS. |
| 322 | U14 | <code>        &lt;div id="translated-tab" class="tab-content"&gt;</code> | Define `div#translated-tab`: conteúdo da aba Traduzidas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 323 | U14 | <code>            &lt;div class="translated-toolbar"&gt;</code> | Abre container estrutural de Aba Traduzidas; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 324 | U14 | <code>                &lt;button class="t-btn" id="btn-export-all" style="background:#1a5fa8;"&gt;💾 Exportar Tudo&lt;/button&gt;</code> | Define `button#btn-export-all`: solicita exportação de todos os capítulos traduzidos. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 325 | U14 | <code>                &lt;button class="t-btn" id="btn-open-folder" style="background:#2d7a38;"&gt;📂 MangaTranslator&lt;/button&gt;</code> | Define `button#btn-open-folder`: solicita abertura da raiz MangaTranslator. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 326 | U14 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="translated-toolbar">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 327 | U14 | <code>            &lt;div class="auto-dl-row"&gt;</code> | Abre container estrutural de Aba Traduzidas; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 328 | U14 | <code>                &lt;input type="checkbox" id="chk-auto-download"&gt;</code> | Define `input#chk-auto-download`: configuração de download automático de resultados. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 329 | U14 | <code>                &lt;label for="chk-auto-download"&gt;💾 Baixar imagens automaticamente&lt;/label&gt;</code> | Abre um label clicável da seção Aba Traduzidas; agrupa controle e texto para ampliar a área de interação. |
| 330 | U14 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="auto-dl-row">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 331 | U14 | <code>            &lt;div id="chapter-list"&gt;&lt;/div&gt;</code> | Define `div#chapter-list`: mount point de sites/capítulos e miniaturas traduzidas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 332 | U14 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div id="translated-tab">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 333 | U14 | <code>    &lt;/div&gt;</code> | Fecha especificamente <div id="app-content">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 334 | U14 | ␠ [linha vazia] | Separador visual de U14 — Aba Traduzidas; não cria nó nem regra CSS. |
| 335 | U15 | <code>    &lt;div id="settings-page"&gt;</code> | Define `div#settings-page`: página de configurações alternada pelo botão de engrenagem. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 336 | U15 | <code>        &lt;div class="settings-tabs" style="display:flex; border-bottom: 1px solid #222; margin-bottom: 15px;"&gt;</code> | Abre container estrutural de Settings shell e prompt customizado; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 337 | U15 | <code>            &lt;button class="settings-tab-btn active" data-target="settings-generic" style="flex:1; background:none; border:none; color:#FF4444; padding:8px; cursor:pointer; font-weight:700; border-bottom:2px solid #FF4444;"&gt;Ajustes&lt;/button&gt;</code> | Cria tab interna de settings apontando para `settings-generic`; a classe active/estilos são alternados por popup.js. |
| 338 | U15 | <code>            &lt;button class="settings-tab-btn" data-target="settings-logs" style="flex:1; background:none; border:none; color:#555; padding:8px; cursor:pointer; font-weight:700; border-bottom:2px solid transparent;"&gt;Logs do Sistema&lt;/button&gt;</code> | Cria tab interna de settings apontando para `settings-logs`; a classe active/estilos são alternados por popup.js. |
| 339 | U15 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div class="settings-tabs">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 340 | U15 | ␠ [linha vazia] | Separador visual de U15 — Settings shell e prompt customizado; não cria nó nem regra CSS. |
| 341 | U15 | <code>        &lt;div id="settings-generic" class="settings-tab-content active" style="display:flex; flex-direction:column;"&gt;</code> | Define `div#settings-generic`: painel principal das configurações. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 342 | U15 | <code>            &lt;div class="settings-section"&gt;</code> | Abre container estrutural de Settings shell e prompt customizado; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 343 | U15 | <code>                &lt;div class="settings-section-title"&gt;Prompt personalizado para o Gemini&lt;/div&gt;</code> | Abre container estrutural de Settings shell e prompt customizado; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 344 | U15 | <code>                &lt;div class="settings-section-desc"&gt;</code> | Abre container estrutural de Settings shell e prompt customizado; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 345 | U15 | <code>                    Este texto é enviado junto com cada imagem. Use-o para ajustar o estilo de tradução,</code> | Primeira linha da descrição do prompt: informa que o texto configurado acompanha cada imagem enviada ao Gemini. |
| 346 | U15 | <code>                    idioma de destino ou outras instruções específicas.</code> | Completa a descrição do prompt especificando idioma/estilo/instruções como objetivos do campo. |
| 347 | U15 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section-desc">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 348 | U15 | <code>                &lt;textarea id="settings-prompt" placeholder="Deixe em branco para usar o prompt padrão..."&gt;&lt;/textarea&gt;</code> | Define `textarea#settings-prompt`: textarea do prompt customizado enviado ao Gemini. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 349 | U15 | <code>                &lt;div id="char-count"&gt;0 caracteres&lt;/div&gt;</code> | Define `div#char-count`: contador de caracteres do prompt. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 350 | U15 | <code>                &lt;div class="settings-btn-row"&gt;</code> | Abre container estrutural de Settings shell e prompt customizado; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 351 | U15 | <code>                    &lt;button class="s-btn" id="s-btn-save"&gt;💾 Salvar&lt;/button&gt;</code> | Define `button#s-btn-save`: persiste prompt/configurações editáveis. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 352 | U15 | <code>                    &lt;button class="s-btn" id="s-btn-restore"&gt;↩ Restaurar padrão&lt;/button&gt;</code> | Define `button#s-btn-restore`: restaura o prompt padrão. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 353 | U15 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div class="settings-btn-row">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 354 | U15 | <code>                &lt;div id="settings-status"&gt;&lt;/div&gt;</code> | Define `div#settings-status`: área de feedback de salvamento/restauração. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 355 | U15 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 356 | U16 | <code>            &lt;div class="settings-divider"&gt;&lt;/div&gt;</code> | Abre container estrutural de Auto-substituição, sites e refazer; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 357 | U16 | <code>            &lt;div class="settings-section"&gt;</code> | Abre container estrutural de Auto-substituição, sites e refazer; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 358 | U16 | <code>                &lt;div class="settings-section-title"&gt;Substituição automática&lt;/div&gt;</code> | Abre container estrutural de Auto-substituição, sites e refazer; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 359 | U16 | <code>                &lt;div class="settings-section-desc"&gt;</code> | Abre container estrutural de Auto-substituição, sites e refazer; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 360 | U16 | <code>                    Controle quando a extensão pode restaurar imagens sozinha depois de F5 ou ao reabrir um capítulo.</code> | Explica que o toggle global de auto-substituição governa restauração após F5/reabertura de capítulo. |
| 361 | U16 | <code>                    Traduções iniciadas manualmente continuam funcionando.</code> | Esclarece que desabilitar auto-restauração não bloqueia traduções iniciadas manualmente. |
| 362 | U16 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section-desc">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 363 | U16 | <code>                &lt;label class="settings-toggle-row" id="settings-auto-restore-row"&gt;</code> | Define `label#settings-auto-restore-row`: linha que agrupa o toggle global de auto-substituição. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 364 | U16 | <code>                    &lt;input type="checkbox" id="settings-auto-restore-enabled"&gt;</code> | Define `input#settings-auto-restore-enabled`: toggle global que permite/bloqueia auto-restauração. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 365 | U16 | <code>                    &lt;span&gt;</code> | Cria span textual/indicador de Auto-substituição, sites e refazer; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 366 | U16 | <code>                        &lt;span class="settings-toggle-title"&gt;Permitir auto-substituição global&lt;/span&gt;</code> | Cria span textual/indicador de Auto-substituição, sites e refazer; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 367 | U16 | <code>                        &lt;span class="settings-toggle-help"&gt;Quando desligado, nenhuma imagem é trocada automaticamente em nenhum site.&lt;/span&gt;</code> | Cria span textual/indicador de Auto-substituição, sites e refazer; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 368 | U16 | <code>                    &lt;/span&gt;</code> | Fecha especificamente <span>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 369 | U16 | <code>                &lt;/label&gt;</code> | Fecha especificamente <label id="settings-auto-restore-row">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 370 | U16 | <code>                &lt;div id="settings-enabled-sites-group" aria-labelledby="settings-enabled-sites-title"&gt;</code> | Define `div#settings-enabled-sites-group`: grupo semântico que mantém sites e confirmação de redo juntos. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 371 | U16 | <code>                    &lt;div class="settings-section-title" id="settings-enabled-sites-title" style="margin-top:18px;"&gt;Sites habilitados&lt;/div&gt;</code> | Define `div#settings-enabled-sites-title`: rótulo usado por `aria-labelledby` do grupo de sites. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 372 | U16 | <code>                    &lt;div class="settings-section-desc"&gt;</code> | Abre container estrutural de Auto-substituição, sites e refazer; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 373 | U16 | <code>                        Domínios onde a extensão está ativa. Abra cada site para ver as imagens salvas dele, bloquear auto-substituição ou refazer uma tradução específica.</code> | Descrição operacional do grupo de sites: explica inspeção de imagens salvas, bloqueio de auto-substituição e redo específico. |
| 374 | U16 | <code>                    &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section-desc">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 375 | U16 | <code>                    &lt;label class="settings-toggle-row" style="margin-bottom:8px;"&gt;</code> | Abre um label clicável da seção Auto-substituição, sites e refazer; agrupa controle e texto para ampliar a área de interação. |
| 376 | U16 | <code>                        &lt;input type="checkbox" id="settings-redo-confirm-enabled"&gt;</code> | Define `input#settings-redo-confirm-enabled`: define se refazer imagem exige confirmação. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 377 | U16 | <code>                        &lt;span&gt;</code> | Cria span textual/indicador de Auto-substituição, sites e refazer; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 378 | U16 | <code>                            &lt;span class="settings-toggle-title"&gt;Confirmar ao apertar o botão de refazer a imagem&lt;/span&gt;</code> | Cria span textual/indicador de Auto-substituição, sites e refazer; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 379 | U16 | <code>                            &lt;span class="settings-toggle-help"&gt;Antes de apagar a tradução salva para refazê-la, pede uma confirmação própria da extensão.&lt;/span&gt;</code> | Cria span textual/indicador de Auto-substituição, sites e refazer; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 380 | U16 | <code>                        &lt;/span&gt;</code> | Fecha especificamente <span>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 381 | U16 | <code>                    &lt;/label&gt;</code> | Fecha especificamente <label class="settings-toggle-row">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 382 | U16 | <code>                    &lt;div class="settings-small-actions"&gt;</code> | Abre container estrutural de Auto-substituição, sites e refazer; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 383 | U16 | <code>                        &lt;button id="settings-refresh-auto-images"&gt;Atualizar&lt;/button&gt;</code> | Define `button#settings-refresh-auto-images`: manda reconstruir/recarregar a lista de imagens salvas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 384 | U16 | <code>                        &lt;button id="settings-clear-auto-blocks"&gt;Limpar bloqueios&lt;/button&gt;</code> | Define `button#settings-clear-auto-blocks`: limpa bloqueios específicos de auto-substituição. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 385 | U16 | <code>                    &lt;/div&gt;</code> | Fecha especificamente <div class="settings-small-actions">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 386 | U16 | <code>                    &lt;div id="settings-sites-list"&gt;&lt;/div&gt;</code> | Define `div#settings-sites-list`: mount point de domínios habilitados e imagens salvas. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 387 | U16 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div id="settings-enabled-sites-group">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 388 | U16 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 389 | U16 | <code>            &lt;div class="settings-divider"&gt;&lt;/div&gt;</code> | Abre container estrutural de Auto-substituição, sites e refazer; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 390 | U17 | <code>            &lt;div class="settings-section"&gt;</code> | Abre container estrutural de Interação na página e modo Gemini; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 391 | U17 | <code>                &lt;div class="settings-section-title"&gt;Interação na página&lt;/div&gt;</code> | Abre container estrutural de Interação na página e modo Gemini; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 392 | U17 | <code>                &lt;div class="settings-section-desc"&gt;</code> | Abre container estrutural de Interação na página e modo Gemini; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 393 | U17 | <code>                    Controle o botão flutuante e a tradução de uma única imagem por clique.</code> | Descrição da seção de interação: delimita botão flutuante e tradução de imagem única como comportamentos configuráveis. |
| 394 | U17 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section-desc">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 395 | U17 | <code>                &lt;label class="settings-toggle-row"&gt;</code> | Abre um label clicável da seção Interação na página e modo Gemini; agrupa controle e texto para ampliar a área de interação. |
| 396 | U17 | <code>                    &lt;input type="checkbox" id="settings-floating-button-enabled"&gt;</code> | Define `input#settings-floating-button-enabled`: controla visibilidade do botão flutuante na página. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 397 | U17 | <code>                    &lt;span&gt;</code> | Cria span textual/indicador de Interação na página e modo Gemini; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 398 | U17 | <code>                        &lt;span class="settings-toggle-title"&gt;Mostrar botão flutuante&lt;/span&gt;</code> | Cria span textual/indicador de Interação na página e modo Gemini; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 399 | U17 | <code>                        &lt;span class="settings-toggle-help"&gt;Mantém o botão vermelho visível nos sites habilitados. Se ele desaparecer sozinho, a extensão registra erro e tenta recuperá-lo.&lt;/span&gt;</code> | Cria span textual/indicador de Interação na página e modo Gemini; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 400 | U17 | <code>                    &lt;/span&gt;</code> | Fecha especificamente <span>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 401 | U17 | <code>                &lt;/label&gt;</code> | Fecha especificamente <label class="settings-toggle-row">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 402 | U17 | <code>                &lt;label class="settings-toggle-row" style="margin-top:8px;"&gt;</code> | Abre um label clicável da seção Interação na página e modo Gemini; agrupa controle e texto para ampliar a área de interação. |
| 403 | U17 | <code>                    &lt;input type="checkbox" id="settings-click-to-translate-enabled"&gt;</code> | Define `input#settings-click-to-translate-enabled`: habilita a tradução de imagem única via menu/contexto. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 404 | U17 | <code>                    &lt;span&gt;</code> | Cria span textual/indicador de Interação na página e modo Gemini; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 405 | U17 | <code>                        &lt;span class="settings-toggle-title"&gt;Clique direito para traduzir uma única imagem&lt;/span&gt;</code> | Cria span textual/indicador de Interação na página e modo Gemini; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 406 | U17 | <code>                        &lt;span class="settings-toggle-help"&gt;Ao clicar com o botão direito em uma imagem elegível, escolha “Traduzir esta imagem” no menu do navegador. Desligado por padrão.&lt;/span&gt;</code> | Cria span textual/indicador de Interação na página e modo Gemini; popup.js pode atualizar seu texto/classe sem recriar a estrutura. |
| 407 | U17 | <code>                    &lt;/span&gt;</code> | Fecha especificamente <span>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 408 | U17 | <code>                &lt;/label&gt;</code> | Fecha especificamente <label class="settings-toggle-row">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 409 | U17 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 410 | U17 | <code>            &lt;div class="settings-divider"&gt;&lt;/div&gt;</code> | Abre container estrutural de Interação na página e modo Gemini; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 411 | U17 | <code>            &lt;div class="settings-section"&gt;</code> | Abre container estrutural de Interação na página e modo Gemini; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 412 | U17 | <code>                &lt;div class="settings-section-title"&gt;Modo de Execução do Gemini&lt;/div&gt;</code> | Abre container estrutural de Interação na página e modo Gemini; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 413 | U17 | <code>                &lt;div class="settings-section-desc"&gt;</code> | Abre container estrutural de Interação na página e modo Gemini; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 414 | U17 | <code>                    Escolha como o Gemini será aberto e gerenciado durante as traduções.</code> | Descrição da seção de execução Gemini; prepara os três radios que selecionam o lifecycle do job. |
| 415 | U17 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section-desc">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 416 | U17 | <code>                &lt;div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;"&gt;</code> | Abre container estrutural de Interação na página e modo Gemini; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 417 | U17 | <code>                    &lt;label class="settings-toggle-row" style="cursor:pointer;"&gt;&lt;input type="radio" name="popup-gemini-execution-mode" id="popup-gemini-mode-temp" value="temp_chat" style="accent-color:#FF4444; margin-top:2px;"&gt;&lt;span&gt;&lt;span class="settings-toggle-title"&gt;Conversa Temporária (Segundo Plano) — Padrão&lt;/span&gt;&lt;span class="settings-toggle-help"&gt;Abre em aba oculta em segundo plano e ativa a conversa momentânea do Gemini. Não polui seu histórico e fecha rapidamente.&lt;/span&gt;&lt;/span&gt;&lt;/label&gt;</code> | Define `label#popup-gemini-mode-temp`: radio `temp_chat`, conversa temporária em segundo plano. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 418 | U17 | <code>                    &lt;label class="settings-toggle-row" style="cursor:pointer;"&gt;&lt;input type="radio" name="popup-gemini-execution-mode" id="popup-gemini-mode-minimized" value="minimized_window" style="accent-color:#FF4444; margin-top:2px;"&gt;&lt;span&gt;&lt;span class="settings-toggle-title"&gt;Janela Minimizada&lt;/span&gt;&lt;span class="settings-toggle-help"&gt;Abre em janela separada minimizada. Recomendado caso o navegador congele abas em segundo plano.&lt;/span&gt;&lt;/span&gt;&lt;/label&gt;</code> | Define `label#popup-gemini-mode-minimized`: radio `minimized_window`, janela separada minimizada. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 419 | U17 | <code>                    &lt;label class="settings-toggle-row" style="cursor:pointer;"&gt;&lt;input type="radio" name="popup-gemini-execution-mode" id="popup-gemini-mode-delete" value="background_delete" style="accent-color:#FF4444; margin-top:2px;"&gt;&lt;span&gt;&lt;span class="settings-toggle-title"&gt;Conversa Normal com Exclusão Segura&lt;/span&gt;&lt;span class="settings-toggle-help"&gt;Abre em aba oculta em segundo plano usando uma conversa normal. Ao terminar, exclui a conversa automaticamente antes de fechar a aba.&lt;/span&gt;&lt;/span&gt;&lt;/label&gt;</code> | Define `label#popup-gemini-mode-delete`: radio `background_delete`, conversa normal com exclusão segura. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 420 | U17 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 421 | U17 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 422 | U18 | <code>            &lt;div class="settings-divider"&gt;&lt;/div&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 423 | U18 | <code>            &lt;div class="settings-section"&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 424 | U18 | <code>                &lt;div class="settings-section-title"&gt;Traduções em Paralelo&lt;/div&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 425 | U18 | <code>                &lt;div class="settings-section-desc"&gt;Quantas imagens processar no Gemini ao mesmo tempo. Maior = mais rápido, mas requer abas abertas simultâneas.&lt;/div&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 426 | U18 | <code>                &lt;div style="display:flex; align-items:center; gap: 15px; margin-top: 10px;"&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 427 | U18 | <code>                    &lt;input type="range" id="settings-parallel" min="1" max="10" value="1" style="flex:1;"&gt;</code> | Define `input#settings-parallel`: slider 1–10 de concorrência de jobs Gemini. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 428 | U18 | <code>                    &lt;span id="settings-parallel-val" style="font-weight:bold; font-size: 16px; min-width: 20px; text-align: center;"&gt;1&lt;/span&gt;</code> | Define `span#settings-parallel-val`: espelho textual do valor de paralelismo. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 429 | U18 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 430 | U18 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 431 | U18 | <code>            &lt;div class="settings-divider"&gt;&lt;/div&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 432 | U18 | <code>            &lt;div class="settings-section"&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 433 | U18 | <code>                &lt;div class="settings-section-title"&gt;Tamanho mínimo das imagens&lt;/div&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 434 | U18 | <code>                &lt;div class="settings-section-desc"&gt;Somente imagens que atendem à largura e à altura mínimas entram na lista para tradução. Ajuste para incluir páginas menores.&lt;/div&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 435 | U18 | <code>                &lt;div class="image-filter-inputs"&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 436 | U18 | <code>                    &lt;label class="image-filter-field"&gt;Largura mínima (px)&lt;input id="settings-image-min-width" type="number" min="0" max="3000" step="1" inputmode="numeric" value="300"&gt;&lt;/label&gt;</code> | Define `label#settings-image-min-width`: entrada numérica de largura mínima elegível. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 437 | U18 | <code>                    &lt;label class="image-filter-field"&gt;Altura mínima (px)&lt;input id="settings-image-min-height" type="number" min="0" max="3000" step="1" inputmode="numeric" value="400"&gt;&lt;/label&gt;</code> | Define `label#settings-image-min-height`: entrada numérica de altura mínima elegível. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 438 | U18 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div class="image-filter-inputs">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 439 | U18 | <code>                &lt;button class="image-filter-reset" id="settings-image-min-reset" type="button"&gt;↩ Restaurar padrão (300 × 400)&lt;/button&gt;</code> | Define `button#settings-image-min-reset`: restaura 300×400 e sincroniza inputs/ranges/storage. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 440 | U18 | <code>                &lt;div class="image-filter-control" id="image-filter-control"&gt;</code> | Define `div#image-filter-control`: grupo visual que combina preview e range vertical. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 441 | U18 | <code>                    &lt;div class="image-filter-preview"&gt;&lt;div class="image-filter-shape" id="image-filter-shape"&gt;300 × 400&lt;/div&gt;&lt;/div&gt;</code> | Define `div#image-filter-shape`: preview dimensional cujo texto/CSS variables acompanham os filtros. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 442 | U18 | <code>                    &lt;input class="image-filter-height" id="settings-image-min-height-range" type="range" min="0" max="3000" step="1" value="400" aria-label="Altura mínima"&gt;</code> | Define `input#settings-image-min-height-range`: range vertical da altura mínima. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 443 | U18 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div id="image-filter-control">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 444 | U18 | <code>                &lt;div style="padding-right:54px;"&gt;&lt;input class="image-filter-width" id="settings-image-min-width-range" type="range" min="0" max="3000" step="1" value="300" aria-label="Largura mínima"&gt;&lt;div class="image-filter-axis-label"&gt;&lt;span&gt;0 px&lt;/span&gt;&lt;span&gt;largura&lt;/span&gt;&lt;span&gt;3000 px&lt;/span&gt;&lt;/div&gt;&lt;/div&gt;</code> | Define `div#settings-image-min-width-range`: range horizontal da largura mínima. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 445 | U18 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 446 | U18 | <code>            &lt;div class="settings-divider"&gt;&lt;/div&gt;</code> | Abre container estrutural de Paralelismo e filtro mínimo de imagem; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 447 | U19 | <code>            &lt;div class="settings-section"&gt;</code> | Abre container estrutural de Modo Debug; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 448 | U19 | <code>                &lt;div class="settings-section-title"&gt;🛠️ Modo Debug&lt;/div&gt;</code> | Abre container estrutural de Modo Debug; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 449 | U19 | <code>                &lt;div class="settings-section-desc"&gt;</code> | Abre container estrutural de Modo Debug; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 450 | U19 | <code>                    Quando ativado, as abas do Gemini e de extração &lt;strong style="color:#FF9800"&gt;não serão fechadas&lt;/strong&gt; após cada tradução.</code> | Aviso crítico do Debug: explicita que abas Gemini/extração permanecem abertas após a tradução, aumentando observabilidade e retenção temporária. |
| 451 | U19 | <code>                    Use para inspecionar o console e ver o que está quebrando.</code> | Completa a orientação do Debug, direcionando o usuário ao console para diagnóstico. |
| 452 | U19 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section-desc">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 453 | U19 | <code>                &lt;div class="debug-toggle-row" id="debug-toggle-label"&gt;</code> | Define `div#debug-toggle-label`: alvo clicável do modo debug. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 454 | U19 | <code>                    &lt;div class="debug-toggle-track" id="debug-toggle-track"&gt;</code> | Define `div#debug-toggle-track`: trilho visual do toggle debug. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 455 | U19 | <code>                        &lt;div class="debug-toggle-thumb" id="debug-toggle-thumb"&gt;&lt;/div&gt;</code> | Define `div#debug-toggle-thumb`: thumb animado do toggle debug. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 456 | U19 | <code>                    &lt;/div&gt;</code> | Fecha especificamente <div id="debug-toggle-track">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 457 | U19 | <code>                    &lt;span id="debug-toggle-text"&gt;Debug desativado&lt;/span&gt;</code> | Define `span#debug-toggle-text`: texto `Debug desativado/ATIVADO` atualizado pelo JS. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 458 | U19 | <code>                &lt;/div&gt;</code> | Fecha especificamente <div id="debug-toggle-label">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 459 | U19 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div class="settings-section">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 460 | U19 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div id="settings-generic">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 461 | U19 | ␠ [linha vazia] | Separador visual de U19 — Modo Debug; não cria nó nem regra CSS. |
| 462 | U20 | <code>        &lt;div id="settings-logs" class="settings-tab-content" style="display:none; flex-direction:column; flex:1 1 0; min-height:0;"&gt;</code> | Define `div#settings-logs`: painel de logs. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 463 | U20 | <code>            &lt;div style="display:flex; gap:8px; margin-bottom:10px;"&gt;</code> | Abre container estrutural de Logs do sistema; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 464 | U20 | <code>                &lt;select id="log-filter-level" style="background:#1a1a1a; color:#fff; border:1px solid #3a3a3a; padding:6px; border-radius:4px; font-size:12px;"&gt;</code> | Define `select#log-filter-level`: filtro por severidade dos registros. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 465 | U20 | <code>                    &lt;option value="all"&gt;Todos&lt;/option&gt;</code> | Declara opção estática do filtro de severidade de logs; o value é interpretado por popup.js ao filtrar registros. |
| 466 | U20 | <code>                    &lt;option value="error"&gt;Erros&lt;/option&gt;</code> | Declara opção estática do filtro de severidade de logs; o value é interpretado por popup.js ao filtrar registros. |
| 467 | U20 | <code>                    &lt;option value="warn"&gt;Avisos&lt;/option&gt;</code> | Declara opção estática do filtro de severidade de logs; o value é interpretado por popup.js ao filtrar registros. |
| 468 | U20 | <code>                    &lt;option value="success"&gt;Sucesso&lt;/option&gt;</code> | Declara opção estática do filtro de severidade de logs; o value é interpretado por popup.js ao filtrar registros. |
| 469 | U20 | <code>                    &lt;option value="info"&gt;Info&lt;/option&gt;</code> | Declara opção estática do filtro de severidade de logs; o value é interpretado por popup.js ao filtrar registros. |
| 470 | U20 | <code>                &lt;/select&gt;</code> | Fecha especificamente <select id="log-filter-level">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 471 | U20 | <code>                &lt;button id="btn-log-clear" style="background:#3a3a3a; border:none; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; cursor:pointer;"&gt;Limpar&lt;/button&gt;</code> | Define `button#btn-log-clear`: limpa logs persistidos. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 472 | U20 | <code>                &lt;button id="btn-log-copy" style="background:#9a5b00; border:none; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; cursor:pointer;"&gt;Copiar tudo&lt;/button&gt;</code> | Define `button#btn-log-copy`: copia todos os logs, inclusive ocultos pelo filtro. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 473 | U20 | <code>                &lt;button id="btn-log-export" style="background:#1a5fa8; border:none; color:#fff; padding:6px 10px; border-radius:4px; font-size:12px; cursor:pointer; margin-left:auto;"&gt;Exportar&lt;/button&gt;</code> | Define `button#btn-log-export`: exporta logs para arquivo via downloads API. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 474 | U20 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 475 | U20 | <code>            &lt;div id="log-container" style="flex:1 1 0; overflow-y:auto; background:#0a0a0a; border:1px solid #2e2e2e; border-radius:6px; padding:8px; font-family:monospace; font-size:11px;"&gt;&lt;/div&gt;</code> | Define `div#log-container`: mount point de linhas de log. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 476 | U20 | <code>            &lt;div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:#888;"&gt;</code> | Abre container estrutural de Logs do sistema; classes/estilo desta linha definem layout e o conteúdo interno fornece os controles do contrato. |
| 477 | U20 | <code>                &lt;label style="cursor:pointer;"&gt;&lt;input type="checkbox" id="log-autoscroll" checked&gt; Auto scroll&lt;/label&gt;</code> | Define `label#log-autoscroll`: toggle para acompanhar o fim da lista. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 478 | U20 | <code>                &lt;span id="log-count"&gt;0 registros&lt;/span&gt;</code> | Define `span#log-count`: contador `visíveis / total` de registros. O ID é parte do contrato entre este HTML e popup.js/testes. |
| 479 | U20 | <code>            &lt;/div&gt;</code> | Fecha especificamente <div>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 480 | U20 | <code>        &lt;/div&gt;</code> | Fecha especificamente <div id="settings-logs">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 481 | U20 | <code>    &lt;/div&gt;</code> | Fecha especificamente <div id="settings-page">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 482 | U20 | ␠ [linha vazia] | Separador visual de U20 — Logs do sistema; não cria nó nem regra CSS. |
| 483 | U21 | <code>    &lt;script src="../shared/shared-ui.js"&gt;&lt;/script&gt;</code> | Carrega `../shared/shared-ui.js` primeiro; esta ordem disponibiliza UI compartilhada antes do controlador específico do popup. |
| 484 | U21 | <code>    &lt;script src="popup.js"&gt;&lt;/script&gt;</code> | Carrega `popup.js` depois do helper compartilhado; este script resolve os IDs definidos acima e instala listeners no DOM. |
| 485 | U21 | <code>&lt;/div&gt;</code> | Fecha especificamente <div id="root">, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 486 | U21 | <code>&lt;/body&gt;</code> | Fecha especificamente <body>, encerrando esse agrupamento semântico/visual. Preservar este nesting é importante porque CSS e popup.js usam descendência, `closest` e query selectors sobre essa hierarquia. |
| 487 | U21 | <code>&lt;/html&gt;</code> | Fecha o documento HTML. |
| 488 | U21 | ␠ [linha vazia] | Separador visual de U21 — Ordem de scripts, fechamento e posições finais; não cria nó nem regra CSS. |
| 489 | U21 | ␠ [linha vazia] | Separador visual de U21 — Ordem de scripts, fechamento e posições finais; não cria nó nem regra CSS. |
| 490 | U21 | ␠ [linha vazia] | Separador visual de U21 — Ordem de scripts, fechamento e posições finais; não cria nó nem regra CSS. |

## 15. Checklist de conclusão desta Bíblia

- [x] SHA do fonte conferido contra a reserva.
- [x] Fonte integral copiada sem omissões.
- [x] 490/490 posições documentadas.
- [x] Manifest/default_popup confirmado.
- [x] Ordem de scripts confirmada.
- [x] Contratos de IDs/data-target mapeados.
- [x] popup.js identificado como consumidor principal.
- [x] Suites que carregam o HTML real abertas e assertions lidas.
- [x] Prova do markup diferenciada de comportamento pertencente ao JS.
- [x] Seletores obsoletos em testes auxiliares registrados sem promover falsa cobertura.
- [x] Segurança/XSS, acessibilidade e boundaries documentados.
- [x] Invariantes e lacunas explícitas.

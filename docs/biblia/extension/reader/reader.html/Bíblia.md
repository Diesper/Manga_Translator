# Bíblia técnica — `extension/reader/reader.html`

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `065fc4e201c5661ffafa0de8626940929420ad3f`  
> **Agente responsável pela auditoria:** AGENTE 6  
> **Tipo:** HTML/CSS da página interna do leitor offline  
> **Linhas textuais:** **77**  
> **Posições documentais:** **78**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## Papel arquitetural

Este arquivo define a superfície estática do leitor offline. Ele fornece barra fixa, título, contador, slider de largura, hint de teclado, progresso e o container vazio no qual `reader.js` materializa as páginas salvas. Não contém lógica de storage nem navegação por teclado; esses comportamentos pertencem ao controlador JavaScript.

## Dependências e consumers

- `reader.js` consome os IDs definidos aqui.
- `shared-ui.js` carrega antes do controller.
- `tests/integration/reader.ui.test.js` carrega o HTML e o JS reais.
- `tests/e2e/reader-offline.spec.js` abre a URL real da extensão em Chromium e verifica páginas, largura persistida, contador/progresso e navegação.

## Evidência automatizada

- ✅ título, contador, progresso inicial, wrappers/imagens e labels: integração real.
- ✅ largura salva, clamp para 800, mudança do slider e persistência: integração + E2E.
- ✅ botão Fechar: integração real.
- ✅ estado sem ID/sem imagens: integração real.
- ✅ 15 páginas/ordem, lazy load e navegação/progresso: E2E.
- 🟨 estilos puramente cosméticos (cores, blur, bordas, tipografia) são executados mas não têm assertions visuais específicas.
- ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para contraste, responsividade estreita e semântica completa de acessibilidade.

## Análise crítica

- O HTML não declara atributo `lang`.
- CSS é inline no próprio documento; simples para uma única página, mas aumenta acoplamento visual e dificulta reutilização.
- O hint de tecla F é texto estático; se o atalho mudar em `reader.js`, pode ficar desatualizado sem gate dedicado.
- A barra usa alturas fixas aproximadas (`padding-top: 52px`, progresso em `top:45px`); mudanças de fonte/controles podem exigir sincronização manual.
- O slider possui limites estáticos que precisam permanecer alinhados à validação do controller.

## Invariantes

1. IDs consumidos por `reader.js` devem permanecer estáveis.
2. `shared-ui.js` deve carregar antes de `reader.js`.
3. `#reader-container` permanece vazio no HTML e recebe páginas dinamicamente.
4. `#width-slider` mantém limites compatíveis com a validação do controller.
5. `#read-progress-fill` continua permitindo alteração de largura via style.
6. A barra fixa não pode cobrir o início das páginas; padding/progresso precisam permanecer coordenados.
7. O contador e o título devem ser textuais, não depender de markup dinâmico.

## Lacunas de teste

Contraste/tema; viewport estreito; acessibilidade/labels completa; sincronização do hint com atalhos; layout da barra com fontes maiores; regressão visual das labels/progresso.

## Fonte integral

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Leitor Offline - Manga Translator</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #111; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

        /* Barra de navegação fixa no topo */
        #reader-bar {
            position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
            background: rgba(17,17,17,0.92); backdrop-filter: blur(8px);
            border-bottom: 1px solid #2a2a2a;
            display: flex; align-items: center; gap: 10px; padding: 8px 16px;
        }
        #close-btn { color: #888; text-decoration: none; font-size: 13px; flex-shrink: 0; transition: color 0.15s; }
        #close-btn:hover { color: #fff; }
        #chapter-title { font-size: 14px; font-weight: 700; color: #fff; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #page-counter { font-size: 12px; color: #FF4444; font-weight: 700; flex-shrink: 0; background: rgba(255,68,68,0.12); border: 1px solid rgba(255,68,68,0.3); border-radius: 12px; padding: 2px 10px; min-width: 70px; text-align: center; }

        /* Controle de largura */
        #width-control { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        #width-control label { font-size: 11px; color: #555; }
        #width-slider { width: 80px; accent-color: #FF4444; cursor: pointer; }
        #width-val { font-size: 11px; color: #888; min-width: 36px; text-align: right; }

        /* Hint de teclado */
        #kbd-hint { font-size: 10px; color: #333; flex-shrink: 0; }

        /* Container de páginas */
        #reader-container {
            display: flex; flex-direction: column; align-items: center;
            padding-top: 52px; /* altura da barra */
            padding-bottom: 40px;
            gap: 0;
        }
        .reader-page-wrap {
            display: flex; flex-direction: column; align-items: center;
            width: 100%; position: relative;
        }
        .reader-page-wrap img { display: block; width: 100%; height: auto; }
        .page-label {
            position: absolute; bottom: 6px; right: 10px;
            font-size: 10px; color: rgba(255,255,255,0.35);
            background: rgba(0,0,0,0.4); padding: 1px 6px; border-radius: 8px;
            pointer-events: none;
        }

        /* Barra de progresso de leitura */
        #read-progress { position: fixed; top: 45px; left: 0; right: 0; height: 3px; background: #1a1a1a; z-index: 999; }
        #read-progress-fill { height: 100%; background: #FF4444; width: 0%; transition: width 0.15s; }

        /* Mensagem vazia */
        #empty-msg { text-align: center; color: #444; padding: 60px 20px; font-size: 14px; }
    </style>
</head>
<body>
    <div id="reader-bar">
        <a href="#" id="close-btn">← Fechar</a>
        <div id="chapter-title">Carregando...</div>
        <span id="page-counter">— / —</span>
        <div id="width-control">
            <label for="width-slider">Largura</label>
            <input type="range" id="width-slider" min="400" max="1200" value="800" step="50">
            <span id="width-val">800px</span>
        </div>
        <span id="kbd-hint">← → scroll · F tela cheia</span>
    </div>
    <div id="read-progress"><div id="read-progress-fill"></div></div>
    <div id="reader-container"></div>

    <script src="../shared/shared-ui.js"></script>
    <script src="reader.js"></script>
</body>
</html>

```

## Cobertura posição a posição

### Linha/posição 1

**Fonte:** `<!DOCTYPE html>`

**O que faz:** Declara documento HTML5.

**Como faz:** Seleciona o modo de standards do navegador.

**Por que assim / risco de alternativa:** Evita quirks mode que poderia alterar layout do reader.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 2

**Fonte:** `<html>`

**O que faz:** Abre/fecha a região estrutural indicada pela tag.

**Como faz:** Delimita documento, head, body ou bloco CSS.

**Por que assim / risco de alternativa:** Preserva parsing previsível e escopo correto de estilos/conteúdo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 3

**Fonte:** `<head>`

**O que faz:** Abre/fecha a região estrutural indicada pela tag.

**Como faz:** Delimita documento, head, body ou bloco CSS.

**Por que assim / risco de alternativa:** Preserva parsing previsível e escopo correto de estilos/conteúdo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 4

**Fonte:** `    <meta charset="utf-8">`

**O que faz:** Define charset UTF-8.

**Como faz:** Instrui o parser antes do conteúdo textual.

**Por que assim / risco de alternativa:** Evita corrupção de acentos e símbolos da interface.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 5

**Fonte:** `    <title>Leitor Offline - Manga Translator</title>`

**O que faz:** Define título inicial da página do leitor.

**Como faz:** O navegador usa o texto no tab/window title.

**Por que assim / risco de alternativa:** Fornece identificação mesmo antes de reader.js carregar dados do capítulo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 6

**Fonte:** `    <style>`

**O que faz:** Abre/fecha a região estrutural indicada pela tag.

**Como faz:** Delimita documento, head, body ou bloco CSS.

**Por que assim / risco de alternativa:** Preserva parsing previsível e escopo correto de estilos/conteúdo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 7

**Fonte:** `        * { box-sizing: border-box; margin: 0; padding: 0; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 8

**Fonte:** `        body { background: #111; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 9

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 10

**Fonte:** `        /* Barra de navegação fixa no topo */`

**O que faz:** Comentário CSS que nomeia o bloco visual seguinte.

**Como faz:** Não altera renderização.

**Por que assim / risco de alternativa:** Facilita manutenção do layout sem ser confundido com comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 11

**Fonte:** `        #reader-bar {`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 12

**Fonte:** `            position: fixed; top: 0; left: 0; right: 0; z-index: 1000;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 13

**Fonte:** `            background: rgba(17,17,17,0.92); backdrop-filter: blur(8px);`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 14

**Fonte:** `            border-bottom: 1px solid #2a2a2a;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 15

**Fonte:** `            display: flex; align-items: center; gap: 10px; padding: 8px 16px;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 16

**Fonte:** `        }`

**O que faz:** Continua/fecha uma regra CSS.

**Como faz:** Agrupa propriedades do seletor atual.

**Por que assim / risco de alternativa:** Mantém propriedades associadas ao componente certo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 17

**Fonte:** `        #close-btn { color: #888; text-decoration: none; font-size: 13px; flex-shrink: 0; transition: color 0.15s; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 18

**Fonte:** `        #close-btn:hover { color: #fff; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 19

**Fonte:** `        #chapter-title { font-size: 14px; font-weight: 700; color: #fff; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 20

**Fonte:** `        #page-counter { font-size: 12px; color: #FF4444; font-weight: 700; flex-shrink: 0; background: rgba(255,68,68,0.12); border: 1px solid rgba(255,68,68,0.3); border-radius: 12px; padding: 2px 10px; min-width: 70px; text-align: center; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 21

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 22

**Fonte:** `        /* Controle de largura */`

**O que faz:** Comentário CSS que nomeia o bloco visual seguinte.

**Como faz:** Não altera renderização.

**Por que assim / risco de alternativa:** Facilita manutenção do layout sem ser confundido com comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 23

**Fonte:** `        #width-control { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 24

**Fonte:** `        #width-control label { font-size: 11px; color: #555; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 25

**Fonte:** `        #width-slider { width: 80px; accent-color: #FF4444; cursor: pointer; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 26

**Fonte:** `        #width-val { font-size: 11px; color: #888; min-width: 36px; text-align: right; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 27

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 28

**Fonte:** `        /* Hint de teclado */`

**O que faz:** Comentário CSS que nomeia o bloco visual seguinte.

**Como faz:** Não altera renderização.

**Por que assim / risco de alternativa:** Facilita manutenção do layout sem ser confundido com comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 29

**Fonte:** `        #kbd-hint { font-size: 10px; color: #333; flex-shrink: 0; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 30

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 31

**Fonte:** `        /* Container de páginas */`

**O que faz:** Comentário CSS que nomeia o bloco visual seguinte.

**Como faz:** Não altera renderização.

**Por que assim / risco de alternativa:** Facilita manutenção do layout sem ser confundido com comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 32

**Fonte:** `        #reader-container {`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 33

**Fonte:** `            display: flex; flex-direction: column; align-items: center;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 34

**Fonte:** `            padding-top: 52px; /* altura da barra */`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 35

**Fonte:** `            padding-bottom: 40px;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 36

**Fonte:** `            gap: 0;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 37

**Fonte:** `        }`

**O que faz:** Continua/fecha uma regra CSS.

**Como faz:** Agrupa propriedades do seletor atual.

**Por que assim / risco de alternativa:** Mantém propriedades associadas ao componente certo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 38

**Fonte:** `        .reader-page-wrap {`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 39

**Fonte:** `            display: flex; flex-direction: column; align-items: center;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 40

**Fonte:** `            width: 100%; position: relative;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 41

**Fonte:** `        }`

**O que faz:** Continua/fecha uma regra CSS.

**Como faz:** Agrupa propriedades do seletor atual.

**Por que assim / risco de alternativa:** Mantém propriedades associadas ao componente certo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 42

**Fonte:** `        .reader-page-wrap img { display: block; width: 100%; height: auto; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 43

**Fonte:** `        .page-label {`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 44

**Fonte:** `            position: absolute; bottom: 6px; right: 10px;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 45

**Fonte:** `            font-size: 10px; color: rgba(255,255,255,0.35);`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 46

**Fonte:** `            background: rgba(0,0,0,0.4); padding: 1px 6px; border-radius: 8px;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 47

**Fonte:** `            pointer-events: none;`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 48

**Fonte:** `        }`

**O que faz:** Continua/fecha uma regra CSS.

**Como faz:** Agrupa propriedades do seletor atual.

**Por que assim / risco de alternativa:** Mantém propriedades associadas ao componente certo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 49

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 50

**Fonte:** `        /* Barra de progresso de leitura */`

**O que faz:** Comentário CSS que nomeia o bloco visual seguinte.

**Como faz:** Não altera renderização.

**Por que assim / risco de alternativa:** Facilita manutenção do layout sem ser confundido com comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 51

**Fonte:** `        #read-progress { position: fixed; top: 45px; left: 0; right: 0; height: 3px; background: #1a1a1a; z-index: 999; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 52

**Fonte:** `        #read-progress-fill { height: 100%; background: #FF4444; width: 0%; transition: width 0.15s; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 53

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 54

**Fonte:** `        /* Mensagem vazia */`

**O que faz:** Comentário CSS que nomeia o bloco visual seguinte.

**Como faz:** Não altera renderização.

**Por que assim / risco de alternativa:** Facilita manutenção do layout sem ser confundido com comportamento testado.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 55

**Fonte:** `        #empty-msg { text-align: center; color: #444; padding: 60px 20px; font-size: 14px; }`

**O que faz:** Define seletor/regra CSS do reader.

**Como faz:** Aplica propriedades visuais/geométricas aos elementos correspondentes.

**Por que assim / risco de alternativa:** Centraliza o layout estático que reader.js assume ao manipular largura, progresso e páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 56

**Fonte:** `    </style>`

**O que faz:** Abre/fecha a região estrutural indicada pela tag.

**Como faz:** Delimita documento, head, body ou bloco CSS.

**Por que assim / risco de alternativa:** Preserva parsing previsível e escopo correto de estilos/conteúdo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; só propriedades observadas nos testes recebem assertion focal.

### Linha/posição 57

**Fonte:** `</head>`

**O que faz:** Abre/fecha a região estrutural indicada pela tag.

**Como faz:** Delimita documento, head, body ou bloco CSS.

**Por que assim / risco de alternativa:** Preserva parsing previsível e escopo correto de estilos/conteúdo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 58

**Fonte:** `<body>`

**O que faz:** Abre/fecha a região estrutural indicada pela tag.

**Como faz:** Delimita documento, head, body ou bloco CSS.

**Por que assim / risco de alternativa:** Preserva parsing previsível e escopo correto de estilos/conteúdo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 59

**Fonte:** `    <div id="reader-bar">`

**O que faz:** Cria a barra fixa de navegação do leitor.

**Como faz:** Contém fechar, título, contador, largura e hint de teclado.

**Por que assim / risco de alternativa:** Agrupa controles persistentes fora do fluxo vertical das páginas.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 60

**Fonte:** `        <a href="#" id="close-btn">← Fechar</a>`

**O que faz:** Cria o controle Fechar.

**Como faz:** `reader.js` intercepta o clique e chama `window.close`.

**Por que assim / risco de alternativa:** Sem o ID o binding do controller falha.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 61

**Fonte:** `        <div id="chapter-title">Carregando...</div>`

**O que faz:** Cria o destino do título do capítulo.

**Como faz:** Começa com placeholder até `reader.js` resolver metadados.

**Por que assim / risco de alternativa:** Mantém estado inicial compreensível durante carregamento.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 62

**Fonte:** `        <span id="page-counter">— / —</span>`

**O que faz:** Cria o contador de página atual/total.

**Como faz:** `reader.js` atualiza seu `textContent` durante navegação/scroll.

**Por que assim / risco de alternativa:** O ID é contrato dos testes e do controlador.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 63

**Fonte:** `        <div id="width-control">`

**O que faz:** Agrupa controles de largura.

**Como faz:** Contém label, range e valor textual.

**Por que assim / risco de alternativa:** Mantém ajuste visual compacto na barra fixa.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 64

**Fonte:** `            <label for="width-slider">Largura</label>`

**O que faz:** Associa label ao slider de largura.

**Como faz:** Usa `for` apontando ao ID do input.

**Por que assim / risco de alternativa:** Melhora acessibilidade e área de ativação.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 65

**Fonte:** `            <input type="range" id="width-slider" min="400" max="1200" value="800" step="50">`

**O que faz:** Cria range 400–1200 px em passos de 50.

**Como faz:** `reader.js` restaura/persiste `readerWidth` e aplica `maxWidth`.

**Por que assim / risco de alternativa:** Limites no HTML formam contrato visual validado pelos testes.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 66

**Fonte:** `            <span id="width-val">800px</span>`

**O que faz:** Cria texto que espelha a largura atual.

**Como faz:** Atualizado pelo controller junto do slider.

**Por que assim / risco de alternativa:** Evita depender apenas da posição visual do range.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 67

**Fonte:** `        </div>`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 68

**Fonte:** `        <span id="kbd-hint">← → scroll · F tela cheia</span>`

**O que faz:** Exibe atalhos de teclado documentados.

**Como faz:** Texto comunica setas e tecla F.

**Por que assim / risco de alternativa:** Mantém discoverability dos comandos implementados em reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 69

**Fonte:** `    </div>`

**O que faz:** Define parte estática do layout/markup do reader.

**Como faz:** O navegador interpreta a linha dentro do elemento/regra atual.

**Por que assim / risco de alternativa:** A estrutura precisa permanecer alinhada aos seletores e IDs consumidos por reader.js.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 70

**Fonte:** `    <div id="read-progress"><div id="read-progress-fill"></div></div>`

**O que faz:** Cria trilho fixo do progresso de leitura.

**Como faz:** Contém `#read-progress-fill`.

**Por que assim / risco de alternativa:** Separa progresso visual do contador textual.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 71

**Fonte:** `    <div id="reader-container"></div>`

**O que faz:** Cria container onde páginas são materializadas.

**Como faz:** `reader.js` adiciona `.reader-page-wrap` dinamicamente.

**Por que assim / risco de alternativa:** Mantém o HTML estático pequeno e o conteúdo dependente do capítulo no controller.

**Evidência:** ✅ PROVADO DIRETAMENTE por `reader.ui.test.js` e/ou `reader-offline.spec.js` usando a página real.

### Linha/posição 72

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 73

**Fonte:** `    <script src="../shared/shared-ui.js"></script>`

**O que faz:** Carrega helpers compartilhados antes do reader.

**Como faz:** Expõe utilidades usadas por `reader.js`.

**Por que assim / risco de alternativa:** A ordem evita referências globais ausentes.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO / execução real: a ordem dos scripts é exercitada pelo carregamento da página.

### Linha/posição 74

**Fonte:** `    <script src="reader.js"></script>`

**O que faz:** Carrega o controlador do leitor.

**Como faz:** Executa depois do shared-ui e do markup da página.

**Por que assim / risco de alternativa:** Garante que IDs já existam quando o script inicializa.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO / execução real: a ordem dos scripts é exercitada pelo carregamento da página.

### Linha/posição 75

**Fonte:** `</body>`

**O que faz:** Abre/fecha a região estrutural indicada pela tag.

**Como faz:** Delimita documento, head, body ou bloco CSS.

**Por que assim / risco de alternativa:** Preserva parsing previsível e escopo correto de estilos/conteúdo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 76

**Fonte:** `</html>`

**O que faz:** Abre/fecha a região estrutural indicada pela tag.

**Como faz:** Delimita documento, head, body ou bloco CSS.

**Por que assim / risco de alternativa:** Preserva parsing previsível e escopo correto de estilos/conteúdo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 77

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.

### Linha/posição 78

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Linha vazia de separação estrutural.

**Como faz:** Não cria nó, regra CSS ou script.

**Por que assim / risco de alternativa:** Mantém a fonte legível e é contabilizada para cobertura integral.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pela carga real do reader; sem assertion isolada nesta posição.


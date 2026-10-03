# Bíblia técnica — tests/fixtures/manga-page.html

> **Estado documental:** 🟡 CORRIGIDA após REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** `71d78eea7eddb51bc93c74bbb3bf652119551ce4`  
> **Agente responsável:** AGENTE 7  
> **Tipo:** fixture HTML determinístico para testes E2E  
> **Linhas textuais:** **100**  
> **Posições documentais:** **101**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`manga-page.html` é a página sintética usada pelos E2E para apresentar ao content script um conjunto controlado de quatro imagens: duas páginas de mangá elegíveis de 800×1200 e duas imagens negativas com geometrias deliberadamente inadequadas (avatar 48×48 e banner 960×120). O fixture também mantém o layout compacto para que as duas páginas elegíveis possam ser observadas simultaneamente no viewport no cenário principal.

Ele não contém JavaScript próprio. O servidor de fixtures o entrega em `http://localhost:3999/manga-page.html`, os PNGs são servidos a partir do Map canônico de `manga-images.js` e todo comportamento de tradução observado decorre da extensão real carregada pelo Playwright.

## 2. Dependências, consumidores e efeitos colaterais

- **Dependência de assets:** `/manga-images/page_001.png`, `/manga-images/page_002.png`, `/manga-images/avatar.png` e `/manga-images/banner.png`, gerados por `tests/fixtures/manga-images.js`.
- **Servidor:** `tests/fixtures/gemini-mock-server.js` lê este arquivo e o serve em `/` e `/manga-page.html`.
- **Consumidores E2E principais:** `tests/e2e/translation-flow.spec.js` e `tests/e2e/cache-and-storage.spec.js`; `reader-offline.spec.js` reutiliza a URL como metadado de capítulo.
- **Efeitos colaterais próprios:** nenhum; é markup/css estático. A mutação DOM observada nos testes vem da extensão.

## 3. Contrato funcional do fixture

1. `manga-image-0` e `manga-image-1` são os dois únicos alvos principais elegíveis.
2. seus assets têm dimensões naturais de 800×1200 e atributos HTML equivalentes;
3. `small-image` é propositalmente pequeno em ambas as dimensões;
4. `banner-image` demonstra que largura alta com altura baixa não deve contar como página;
5. os quatro elementos permanecem identificáveis por `data-testid` para assertions E2E;
6. o fixture não injeta lógica que possa falsificar o comportamento da extensão.

## 4. Evidência automatizada

| Contrato | Evidência encontrada | Classificação |
|---|---|---|
| Duas páginas são carregadas como imagens naturais válidas | `translation-flow.spec.js` linhas 179–189 carrega `/manga-page.html` e exige pelo menos 2 `page_` com `naturalWidth >= 300` e `naturalHeight >= 400` | ✅ PROVADO DIRETAMENTE |
| As duas páginas viram exatamente duas traduções | mesmo E2E seleciona `manga-image-0/1`, espera 2 `img[data-translated=true]`, atributos `data-translated=true` e `src` data:image | ✅ PROVADO DIRETAMENTE |
| Avatar 48×48 não é traduzido | E2E usa `small-image`, confirma src contendo `/manga-images/avatar.png` e `data-translated` nulo após o lote | ✅ PROVADO DIRETAMENTE |
| Banner 960×120 não é traduzido | E2E usa `banner-image`, confirma src original e ausência de `data-translated` | ✅ PROVADO DIRETAMENTE |
| As duas páginas cabem simultaneamente no viewport do cenário principal | helper `areBothOriginalPagesVisible` mede rects e o teste exige `true` antes de iniciar o lote | ✅ PROVADO DIRETAMENTE |
| URLs das páginas alimentam persistência/restore | `cache-and-storage.spec.js` carrega o fixture e exige restoreIndex com URLs absolutas de page_001/page_002 nos índices 0/1 | ✅ PROVADO DIRETAMENTE |
| Servidor entrega este arquivo em `/` e `/manga-page.html` | `gemini-mock-server.js` lê `tests/fixtures/manga-page.html`; os E2E carregam a rota servida | 🟨 PROVA DE CONSUMIDOR / EXECUÇÃO INDIRETA — wiring verdadeiro, sem gate estático específico |
| Buffers PNG correspondentes vêm da fonte única | mock server e preparo importam `PNG_IMAGES` de `manga-images.js`; execução E2E consome os assets | 🟨 PROVA DE CONSUMIDOR / EXECUÇÃO INDIRETA — sem validator estático dedicado |
| Estética CSS específica (cores/sombra/blur/tipografia) | não há assertion focal sobre valores cosméticos individuais | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

Os checks centrais deste fixture são fortes porque o E2E carrega a página servida de verdade, espera dimensões naturais, executa o fluxo da extensão e compara o estado final de cada classe de imagem. Os estilos cosméticos são deliberadamente classificados à parte.

## 5. Invariantes

1. Os testids `manga-image-0`, `manga-image-1`, `small-image` e `banner-image` permanecem estáveis enquanto os E2E os usarem.
2. As páginas elegíveis continuam apontando para page_001/page_002 e mantendo dimensões 800×1200.
3. Avatar permanece 48×48 e banner 960×120, preservando dois negativos geometricamente distintos.
4. O servidor continua conseguindo carregar o arquivo diretamente do diretório de fixtures.
5. O HTML não ganha scripts que implementem ou simulem lógica de tradução.
6. O layout deve continuar compatível com a assertion de duas páginas originais simultaneamente visíveis no cenário principal.

## 6. Casos-limite, riscos e análise crítica

- **Acoplamento por testid:** renomear qualquer `data-testid` quebra consumers E2E mesmo que o conteúdo visual permaneça igual.
- **Acoplamento por URL:** cache/restore verifica URLs absolutos derivados exatamente de `page_001.png` e `page_002.png`.
- **CSS e viewport:** alterações grandes nas larguras, gaps, paddings ou overflow podem quebrar a condição de visibilidade simultânea sem alterar elegibilidade.
- **Atributos vs natural size:** a prova E2E espera `naturalWidth/naturalHeight`, portanto assets inválidos ou servidor incorreto não são mascarados apenas pelos atributos `width`/`height` do HTML.
- **Negativos bem escolhidos:** avatar testa imagem pequena; banner testa uma imagem larga mas baixa, reduzindo risco de um filtro simplista baseado apenas em largura.

## 7. Solicitações ao auditor

Nenhuma solicitação externa relevante foi aberta. O contrato funcional central do fixture possui assertions E2E diretas; a ausência de assertions sobre detalhes puramente cosméticos não justifica, por si só, alteração de testes.

## 8. Fonte integral exata

O bloco abaixo contém o blob `71d78eea7eddb51bc93c74bbb3bf652119551ce4` integralmente. Como o arquivo possui newline terminal, a quebra antes da fence de fechamento pertence ao próprio fonte.

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Teste de Manga Capitulo 1</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      background: linear-gradient(180deg, #101010, #171717);
      color: #f2f2f2;
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 18px 0 28px;
      box-sizing: border-box;
      overflow: hidden;
    }

    .manga-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .page-card {
      width: 180px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 10px;
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.32);
      backdrop-filter: blur(3px);
    }

    .page-label {
      margin: 0 0 8px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 700;
      color: #f0f0f0;
    }

    .page-img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 10px;
    }

    .extras {
      width: 180px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
      opacity: 0.9;
    }

    .extras img {
      display: block;
      height: auto;
      border-radius: 8px;
    }

    .extras .avatar-thumb {
      width: 48px;
    }

    .extras .banner-thumb {
      width: 100%;
    }
  </style>
</head>
<body>
  <section class="manga-stack">
    <article class="page-card">
      <p class="page-label">Original 1 - Vermelha</p>
      <img class="page-img" src="/manga-images/page_001.png" alt="Pagina 1"
           data-testid="manga-image-0" width="800" height="1200">
    </article>

    <article class="page-card">
      <p class="page-label">Original 2 - Azul</p>
      <img class="page-img" src="/manga-images/page_002.png" alt="Pagina 2"
           data-testid="manga-image-1" width="800" height="1200">
    </article>

    <div class="extras">
      <!-- Imagem pequena que NAO deve ser detectada (menor que 300x400) -->
      <img class="avatar-thumb" src="/manga-images/avatar.png" alt="Avatar" data-testid="small-image" width="48" height="48">
      <!-- Banner que NAO deve ser detectado -->
      <img class="banner-thumb" src="/manga-images/banner.png" alt="Publicidade" data-testid="banner-image" width="960" height="120">
    </div>
  </section>
</body>
</html>
```

## 9. Cobertura documental por faixas contíguas

As 101 posições são cobertas pelas faixas abaixo, em ordem, sem lacunas ou sobreposição.

### Bloco 01 — linhas/posições 1–6
Declara HTML5, idioma pt-BR, abre o head, fixa UTF-8, nomeia o fixture e inicia o CSS embutido; isso torna a página autocontida para o servidor E2E.

### Bloco 02 — linhas/posições 7–19
Configura o body como coluna flex centralizada, sem margem, com altura mínima de viewport, fundo/cores estáveis, padding e overflow hidden. O layout compacto contribui para manter as duas páginas originais simultaneamente visíveis, condição checada no E2E.

### Bloco 03 — linhas/posições 20–26
Define `.manga-stack` como coluna flex centralizada com espaçamento de 12px; organiza deterministicamente os cards de página e o bloco de extras.

### Bloco 04 — linhas/posições 27–36
Estiliza `.page-card` com largura visual de 180px, padding, borda, raio, sombra e backdrop blur. A largura reduzida escala as imagens de 800px via CSS sem alterar seus atributos/natural dimensions usados pelo detector.

### Bloco 05 — linhas/posições 37–45
Configura `.page-label` como rótulo pequeno, uppercase e legível; serve apenas à leitura humana do fixture, não ao mecanismo de detecção.

### Bloco 06 — linhas/posições 46–52
Faz `.page-img` ocupar 100% do card com altura automática; preserva aspect ratio e mantém os elementos `<img>` normais para a extensão inspecionar.

### Bloco 07 — linhas/posições 53–61
Configura `.extras` com a mesma largura visual dos cards e layout em coluna; agrupa imagens negativas que devem permanecer fora do conjunto traduzível.

### Bloco 08 — linhas/posições 62–67
Aplica estilo comum às imagens extras, sem alterar seus atributos intrínsecos `width`/`height`, que continuam distinguindo avatar e banner das páginas de mangá.

### Bloco 09 — linhas/posições 68–71
Fixa o avatar visual em 48px; combina com os atributos intrínsecos 48×48 definidos no HTML, abaixo do limiar funcional de página.

### Bloco 10 — linhas/posições 72–75
Faz o banner ocupar a largura do bloco; seus atributos intrínsecos 960×120 mantêm a altura baixa, permitindo provar que grande largura isolada não basta para elegibilidade.

### Bloco 11 — linhas/posições 76–78
Fecha o CSS/head e abre o body que será manipulado pelo content script real nos testes E2E.

### Bloco 12 — linhas/posições 79–84
Cria o primeiro card elegível: rótulo vermelho e imagem `/manga-images/page_001.png` com `data-testid=manga-image-0` e dimensões declaradas 800×1200.

### Bloco 13 — linhas/posições 85–90
Cria o segundo card elegível: rótulo azul e `/manga-images/page_002.png`, `data-testid=manga-image-1`, também 800×1200. O E2E usa os dois testids como alvos diretos.

### Bloco 14 — linhas/posições 91–97
Cria o bloco negativo: comentário explicita a intenção, avatar 48×48 usa `small-image` e banner 960×120 usa `banner-image`. O E2E verifica que ambos preservam o src e não recebem `data-translated`.

### Bloco 15 — linhas/posições 98–100
Fecha section, body e html sem scripts locais; todo comportamento observado vem da extensão/test harness, não do fixture.

### Bloco 16 — linhas/posições 101–101
Representa o newline terminal presente no arquivo; não contém markup adicional.

## 10. Verificação final desta Bíblia

- SHA do fonte reconfirmado: `71d78eea7eddb51bc93c74bbb3bf652119551ce4`.
- Fonte integral incorporada: **sim**.
- Linhas textuais: **100**; newline terminal: **sim**; posições documentadas: **101/101**.
- Faixas documentais: **16**, contíguas e sem overlap.
- Provas diretas centrais: elegibilidade das duas páginas, exatamente duas traduções, exclusão de avatar/banner, visibilidade simultânea e persistência/restore dos URLs.
- Nenhum código, teste, fixture externo, workflow ou config foi alterado.

> **Escopo pós-REAUDIT:** serving do fixture e origem `PNG_IMAGES` são relações de wiring confirmadas por consumers/execução; não existe `verify-*` específico que justifique classificá-las como gate estático dedicado.

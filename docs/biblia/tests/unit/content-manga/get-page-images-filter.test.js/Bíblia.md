# Bíblia técnica — tests/unit/content-manga/get-page-images-filter.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `d48888d1237e2429180c6c5814e8f5b5bcc83f12`  
> **Agente responsável:** AGENTE 25  
> **Takeover:** autorizado explicitamente pelo usuário; ownership anterior AGENTE 21  
> **Tipo:** teste unitário histórico com simulação local de `GET_PAGE_IMAGES`  
> **Linhas textuais:** **149**  
> **Posições documentais:** **150**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

A suíte pretende provar que `GET_PAGE_IMAGES` filtra imagens banidas já no content script, eliminando a antiga inconsistência entre popup e botão flutuante. O objetivo funcional é válido, mas a implementação sob teste é uma função local `simulateGetPageImages` e **não** o handler real.

O comportamento real atual está dividido entre `content_manga.js`, que lê `bannedImages_<hostname>` e despacha `GET_PAGE_IMAGES`, e `cm-dom-replace.js#getScanEligibleImages`, que executa filtragem dimensional, banimento, exclusão de traduzidas e tratamento de duplicatas/backdrops.

## 2. Implementação real correlata

### `extension/content/content_manga.js`

SHA lido: `a8b3698019f6f22027f09f544f15c0563a9f6515`. O handler real:
1. recebe `GET_PAGE_IMAGES`;
2. lê `bannedImages_<hostname>` do storage;
3. chama `getScanEligibleImages(banned, imageMinDimensions)`;
4. responde `{ images: validImages, total: validImages.length }`;
5. retorna `true` porque a leitura do storage é assíncrona.

### `extension/content/cm-dom-replace.js`

SHA lido: `d3fc72032dbddc81eae8fadc5e4da89b13a3bb79`. `getScanEligibleImages`:
- usa limites configuráveis com fallback 300×400;
- preserva o **índice original do DOM** capturado no `forEach((img,index) => ...)`;
- exclui `dataset.translated === 'true'`;
- exclui URLs presentes em `banned`;
- calcula URL limpa;
- agrupa candidatos equivalentes;
- elimina/resolve backdrops e duplicatas;
- ordena pelo índice original e devolve `{index,src,width,height}`.

## 3. Provas reais externas

`tests/unit/content-manga/extraction-and-handlers-real.test.js` carrega o content script real e prova diretamente que `GET_PAGE_IMAGES` exclui banidas, pequenas e já traduzidas; também prova limites configuráveis e atualização em runtime.

`tests/unit/content-manga/twin-backdrop-sync.test.js` e `auto-restorer-real.test.js` exercitam partes reais da canonicalização/backdrop.

Já `tests/integration/banned-images-flow.test.js`, apesar do nome e cabeçalho de integração, também usa uma `simulateGetPageImages` local muito semelhante e não compõe o handler real.

## 4. Drift e diferenças relevantes

| Tema | Simulação #206 | Produção atual | Consequência |
|---|---|---|---|
| Limite | fixo 300×400 | configurável, fallback 300×400 | mirror incompleto |
| Banidas | `!bannedUrls.includes(img.src)` | equivalente dentro de `getScanEligibleImages` | alinhado nesse ponto |
| Já traduzida | não modela `dataset.translated` | exclui explicitamente | divergente |
| Backdrop/duplicata | não modela | agrupa URL limpa e escolhe candidato | divergente |
| URL limpa | não existe | participa do agrupamento | divergente |
| Índice | `map((img,i) => index:i)` **após filtrar** | índice original do DOM | divergência crítica |
| Envelope | retorna array | handler retorna `{images,total}` | incompleto |
| Storage | lista é parâmetro direto | handler lê storage assíncrono | incompleto |

### Divergência crítica de índice

Se o DOM for `[banida, válida]`, a produção devolve a válida com `index:1`; a simulação deste teste a renumera para `index:0`. Como índices são usados para selecionar/atualizar imagens, esse mirror não protege a identidade posicional real.

## 5. Qualidade das assertions

### Assertions úteis

Os testes de banimento, tamanho e formato provam corretamente o comportamento da função local.

### Assertion tautológica de consistência

O cenário linhas 117–129 diz provar que popup e botão flutuante recebem o mesmo conjunto. Porém `popupResult` e `buttonResult` são obtidos chamando **a mesma `simulateGetPageImages` com os mesmos argumentos**. A igualdade é inevitável se a função for determinística e não testa nenhum dos dois caminhos reais.

### Caso ‘página traduzida’

Linhas 103–114 criam uma Data URL e a colocam também na lista de banidas. Isso prova apenas exclusão por ban no mirror; não prova a regra real `dataset.translated === 'true'`.

## 6. Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| Mirror filtra por 300×400 | linhas 43–59 | ✅ PROVADO DIRETAMENTE para o mirror |
| Mirror exclui URL banida | linhas 61–69 | ✅ PROVADO DIRETAMENTE para o mirror |
| Mirror mantém URL não banida | linhas 71–77 | ✅ PROVADO DIRETAMENTE para o mirror |
| Mirror mantém duas imagens com lista vazia | linhas 79–85 | ✅ PROVADO DIRETAMENTE para o mirror |
| Mirror combina tamanho+ban | linhas 88–101 | ✅ PROVADO DIRETAMENTE para o mirror |
| Produção exclui já traduzidas | teste real externo `extraction-and-handlers-real.test.js` | ✅ PROVADO DIRETAMENTE por teste externo |
| Produção lê ban do storage | handler real + teste real externo | ✅ PROVADO DIRETAMENTE por teste externo |
| Produção usa limites configuráveis | teste real externo | ✅ PROVADO DIRETAMENTE por teste externo |
| Produção preserva índice DOM original | estrutura de `getScanEligibleImages`; suíte #206 não prova | 🟦 GATE ESTÁTICO ESPECÍFICO / ⚠️ sem prova focal deste arquivo |
| Popup e botão usam exatamente o mesmo conjunto real | comparação deste arquivo chama a mesma simulação duas vezes | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Página já traduzida é excluída por `dataset.translated` | caso #206 não configura dataset | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| Backdrops/duplicatas são resolvidos | ausente do mirror | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| Envelope real inclui `total` | mirror retorna array puro | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |

## 7. Invariantes

1. Banidas não podem reaparecer em `GET_PAGE_IMAGES`.
2. A identidade posicional de uma imagem deve continuar referindo-se ao elemento DOM correto após filtragem.
3. Imagens já traduzidas não devem voltar à lista.
4. Limites configuráveis devem valer tanto para popup quanto para seleção via botão.
5. Backdrops/duplicatas equivalentes não devem gerar páginas duplicadas.
6. O retorno do handler deve manter contrato `{images,total}`.

## 8. Solicitações ao auditor

### 206-001 — TEST_CORRECTION — OPEN

**Encontrado:** a suíte testa `simulateGetPageImages` v3.1 em vez do handler/getScanEligibleImages reais; o mirror não representa limites configuráveis, traduzidas, URL canônica, backdrops/duplicatas nem envelope assíncrono.

**Evidência atual:** testes reais externos já cobrem parte do comportamento; esta suíte permanece desconectada da produção.

**Necessário:** substituir ou rebaixar o mirror e mover as garantias principais para testes que carreguem `content_manga.js`/`cm-dom-replace.js` reais.

**Risco:** falso verde após regressão funcional real.

**Severidade:** HIGH.

### 206-002 — INDEX_SEMANTICS — OPEN

**Encontrado:** `simulateGetPageImages` atribui `index` depois do `filter`, renumerando o resultado. A produção preserva o índice original do DOM antes da filtragem.

**Evidência atual:** linhas 25–34 do mirror contrastam com `getScanEligibleImages`, que captura `index` no `querySelectorAll(...).forEach` e o preserva até o retorno.

**Evidência ausente:** caso real em que uma imagem anterior é banida/pequena e a imagem posterior continua com seu índice DOM original.

**Necessário:** adicionar teste real com, por exemplo, índice 0 inválido e índice 1 válido, exigindo `response.images[0].index === 1`.

**Risco:** testes baseados no mirror podem validar índices errados e não detectar tradução/substituição da imagem incorreta.

**Severidade:** HIGH.

### 206-003 — TEST_ASSERTION_QUALITY — OPEN

**Encontrado:** o teste de consistência popup × botão é tautológico: chama a mesma função local duas vezes com os mesmos dados. O caso ‘página traduzida’ prova banimento por URL, não `dataset.translated`.

**Evidência atual:** linhas 117–129 e 103–114.

**Evidência ausente:** execução de dois caminhos reais/consumidores independentes e assertion da regra de translated dataset.

**Necessário:** testar o fluxo real do popup e o fluxo real do botão/handler contra uma fonte compartilhada, ou remover a alegação de consistência desta suíte; usar dataset para o cenário de traduzida.

**Risco:** o teste passa mesmo que popup e botão divergam novamente.

**Severidade:** HIGH.

### 206-004 — TEST_CORRECTION — OPEN

**Encontrado:** `tests/integration/banned-images-flow.test.js` se apresenta como integração completa de popup→storage→content→botão, mas também implementa simuladores locais para banimento e `GET_PAGE_IMAGES`.

**Evidência atual:** helper local `simulateGetPageImages` e handlers simulados no arquivo externo.

**Evidência ausente:** composição real dos módulos declarados no cabeçalho.

**Necessário:** auditor desse arquivo deve reclassificá-lo ou reescrevê-lo com implementações reais, evitando usar seu status de ‘integration’ como evidência mais forte do que realmente existe.

**Risco:** dupla camada de mirrors pode produzir confiança falsa sobre BUG #9/INCONS #2.

**Severidade:** NORMAL.

## 9. Fonte integral exata

```js
/**
 * get-page-images-filter.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa que GET_PAGE_IMAGES filtra imagens banidas no content script (INCONS #2).
 *
 * PROBLEMA ORIGINAL: A filtragem de banidas estava apenas no popup.js (linha 404).
 * O handler GET_PAGE_IMAGES retornava TODAS as imagens grandes, sem filtro.
 * O popup então filtrava no client-side.
 *
 * Isso causava dois problemas:
 * 1. Duplicação de lógica (popup filtra, content script não filtra)
 * 2. BUG #9: O botão flutuante (que não passa pelo popup) nunca filtrava
 *
 * CORREÇÃO: A filtragem foi movida para o handler GET_PAGE_IMAGES no content script.
 * Agora existe uma única fonte de verdade.
 *
 * ABORDAGEM: Testa a lógica de filtragem de forma isolada (sem carregar content_manga.js)
 * simulando a operação exata que o handler executa.
 */

describe('GET_PAGE_IMAGES — Filtragem de Banidas no Content Script (INCONS #2 + BUG #9)', () => {

    // Simulação da lógica do handler GET_PAGE_IMAGES (v3.1)
    function simulateGetPageImages(images, bannedUrls) {
        return images.filter(img =>
            img.naturalWidth >= 300 &&
            img.naturalHeight >= 400 &&
            !bannedUrls.includes(img.src)
        ).map((img, i) => ({
            index: i,
            src: img.src,
            width: img.naturalWidth,
            height: img.naturalHeight
        }));
    }

    const VALID_MANGA_PAGE = { src: 'http://site.com/page1.png', naturalWidth: 800, naturalHeight: 1200 };
    const VALID_PAGE_2     = { src: 'http://site.com/page2.png', naturalWidth: 800, naturalHeight: 1200 };
    const BANNED_IMAGE     = { src: 'http://site.com/banner.png', naturalWidth: 900, naturalHeight: 500 };
    const SMALL_IMAGE      = { src: 'http://site.com/avatar.png', naturalWidth: 48, naturalHeight: 48 };
    const TALL_BANNER      = { src: 'http://site.com/tall_banner.png', naturalWidth: 900, naturalHeight: 120 };

    describe('Filtragem por tamanho mínimo (≥ 300×400)', () => {
        test('retorna imagens que atendem ao critério de tamanho', () => {
            const result = simulateGetPageImages([VALID_MANGA_PAGE], []);
            expect(result).toHaveLength(1);
            expect(result[0].src).toBe(VALID_MANGA_PAGE.src);
        });

        test('exclui imagens menores que 300×400', () => {
            const result = simulateGetPageImages([SMALL_IMAGE], []);
            expect(result).toHaveLength(0);
        });

        test('exclui banner horizontal (largura OK, altura insuficiente)', () => {
            const result = simulateGetPageImages([TALL_BANNER], []);
            expect(result).toHaveLength(0);
        });
    });

    describe('Filtragem de imagens banidas', () => {
        test('exclui imagem com tamanho válido mas URL banida', () => {
            const result = simulateGetPageImages(
                [VALID_MANGA_PAGE, BANNED_IMAGE],
                [BANNED_IMAGE.src]
            );
            expect(result).toHaveLength(1);
            expect(result[0].src).toBe(VALID_MANGA_PAGE.src);
        });

        test('não exclui imagem com tamanho válido e URL não banida', () => {
            const result = simulateGetPageImages(
                [VALID_MANGA_PAGE],
                ['http://outro-site.com/banner.png']
            );
            expect(result).toHaveLength(1);
        });

        test('lista de banidas vazia não exclui nada', () => {
            const result = simulateGetPageImages(
                [VALID_MANGA_PAGE, VALID_PAGE_2],
                []
            );
            expect(result).toHaveLength(2);
        });
    });

    describe('Combinação de filtros (tamanho + banidas)', () => {
        test('aplica ambos os filtros simultaneamente', () => {
            const images = [VALID_MANGA_PAGE, VALID_PAGE_2, BANNED_IMAGE, SMALL_IMAGE];
            const bannedUrls = [BANNED_IMAGE.src];
            const result = simulateGetPageImages(images, bannedUrls);

            // Apenas as 2 páginas válidas e não-banidas devem passar
            expect(result).toHaveLength(2);
            const srcs = result.map(r => r.src);
            expect(srcs).toContain(VALID_MANGA_PAGE.src);
            expect(srcs).toContain(VALID_PAGE_2.src);
            expect(srcs).not.toContain(BANNED_IMAGE.src);
            expect(srcs).not.toContain(SMALL_IMAGE.src);
        });

        test('página traduzida (já traduzida) pode ser filtrada por ban', () => {
            const translatedBanned = {
                src: 'data:image/png;base64,iVBOR==',
                naturalWidth: 800, naturalHeight: 1200
            };
            const result = simulateGetPageImages(
                [VALID_MANGA_PAGE, translatedBanned],
                [translatedBanned.src]
            );
            expect(result).toHaveLength(1);
            expect(result[0].src).toBe(VALID_MANGA_PAGE.src);
        });
    });

    describe('Consistência entre popup e botão flutuante (INCONS #2)', () => {
        test('popup e botão flutuante recebem o mesmo conjunto de imagens', () => {
            const allImages = [VALID_MANGA_PAGE, VALID_PAGE_2, BANNED_IMAGE, SMALL_IMAGE];
            const bannedUrls = [BANNED_IMAGE.src];

            // Antes: popup filtrava, botão não
            const popupResult = simulateGetPageImages(allImages, bannedUrls);

            // Agora: ambos usam a mesma função
            const buttonResult = simulateGetPageImages(allImages, bannedUrls);

            expect(popupResult).toEqual(buttonResult);
        });
    });

    describe('Formato da resposta', () => {
        test('retorna objetos com as propriedades corretas', () => {
            const result = simulateGetPageImages([VALID_MANGA_PAGE], []);
            expect(result[0]).toMatchObject({
                index: expect.any(Number),
                src: expect.any(String),
                width: expect.any(Number),
                height: expect.any(Number),
            });
        });

        test('índices são baseados em zero', () => {
            const result = simulateGetPageImages([VALID_MANGA_PAGE, VALID_PAGE_2], []);
            expect(result[0].index).toBe(0);
            expect(result[1].index).toBe(1);
        });
    });
});
```

## 10. Cobertura documental por linha/posição

As faixas abaixo cobrem **1–150** sem lacunas nem sobreposição; 150 é o newline terminal.

### Posições 1–19 — cabeçalho
Explica BUG #9/INCONS #2 e declara explicitamente que a abordagem é uma simulação isolada, não `content_manga.js`. **Evidência:** 🟦 GATE ESTÁTICO para a natureza da suíte.

### Posição 20 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 21–35 — suíte e `simulateGetPageImages`
Define o mirror: tamanho fixo, ban por URL e `map` pós-filtro que renumera índices. **Evidência:** ✅ comportamento local exercitado; ⚠️ divergente da produção.

### Posição 36 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 37–41 — fixtures
Declaram duas páginas, uma imagem banível, avatar e banner horizontal. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE como dados.

### Posição 42 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 43–59 — tamanho mínimo
Provam inclusão da página grande e exclusão de 48×48 e 900×120 no mirror. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posição 60 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 61–86 — banidas
Provam exclusão da URL banida, preservação da não banida e lista vazia. **Evidência:** ✅ PROVADO DIRETAMENTE para o mirror.

### Posição 87 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 88–115 — combinação e Data URL banida
Combinam tamanho+ban; o cenário chamado ‘já traduzida’ só bane explicitamente a Data URL e não modela `dataset.translated`. **Evidência:** ✅ ban no mirror; ⚠️ translated real não provado.

### Posição 116 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 117–130 — consistência popup/botão
Executam a mesma simulação duas vezes e comparam igualdade. **Evidência:** ✅ determinismo da função local; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para dois consumidores reais.

### Posição 131 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 132–148 — formato e índices
Exigem tipos das quatro propriedades e índices 0/1 quando nenhuma imagem é filtrada. Não detectam a renumeração incorreta após filtro. **Evidência:** ✅ formato do mirror; ⚠️ sem prova da semântica de índice real.

### Posição 149 — fechamento
Fecha `describe`. **Evidência:** 🟨 estrutural.

### Posição 150 — newline final
Terminador textual. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- Fonte SHA reconfirmada antes da escrita.
- Fonte integral incorporada do blob auditado.
- **150/150 posições**: 1–19, 20, 21–35, 36, 37–41, 42, 43–59, 60, 61–86, 87, 88–115, 116, 117–130, 131, 132–148, 149, 150.
- Mirror e produção foram explicitamente separados.
- Takeover foi registrado no lock; nenhum trabalho documental anterior existia para sobrescrever.
- Nenhum código/teste externo foi alterado.
- Nenhuma execução de suíte foi alegada nesta sessão.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com quatro solicitações externas abertas.

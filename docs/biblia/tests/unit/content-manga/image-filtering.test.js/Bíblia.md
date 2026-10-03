# Bíblia técnica — tests/unit/content-manga/image-filtering.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `a187a4c6e681457067746964c7c714c64542e4a8`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** stub Jest histórico de filtro dimensional  
> **Linhas textuais:** **99**  
> **Posições documentais:** **100**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

Este arquivo é explicitamente um **stub histórico v3.0**. Ele não carrega o content script nem `cm-dom-replace.js`; define localmente `filterBySize(images)` com limiares fixos `300×400` e testa apenas o critério dimensional.

Seu valor probatório sobre a extensão atual é limitado: a produção usa `MangaTranslatorDomReplace.getScanEligibleImages`, combina dimensão com outros filtros e aceita limites configuráveis pelo usuário.

## 2. Produção atual correlata

`extension/content/cm-dom-replace.js` (SHA lido `d3fc72032dbddc81eae8fadc5e4da89b13a3bb79`) implementa `getScanEligibleImages(banned, minDimensions)`.

Na produção atual, `minWidth`/`minHeight` são parseados, valores válidos `>=0` são aceitos e configurações inválidas voltam aos defaults 300×400. A comparação dimensional continua inclusiva (`>=`), mas imagens traduzidas e banidas também são excluídas, e o resultado passa por agrupamento de URL limpa/backdrop.

`extension/content/content_manga.js` mantém defaults 300×400, lê `imageMinWidth`/`imageMinHeight` do storage e reage a `storage.onChanged`.

## 3. Prova real externa

`tests/unit/content-manga/extraction-and-handlers-real.test.js` (SHA `038961e8228c7b5f1a87023a739ad5f33288423b`) carrega o content script real e possui assertions diretas para:
- exclusão de banidas, pequenas e já traduzidas;
- limites configuráveis `150×100`;
- atualização de limites sem recarregar o content script.

Essas provas são mais fortes para o comportamento atual que este stub. Não foi encontrada, nesta auditoria, uma assertion focal contra a produção no exato boundary default `300×400` nem no fallback de configuração inválida.

## 4. Fluxo do stub

1. O cabeçalho explica a separação histórica entre este teste e `get-page-images-filter.test.js`.
2. `filterBySize` filtra por `naturalWidth >= 300 && naturalHeight >= 400`.
3. A suíte testa boundaries 300/299 e 400/399.
4. Testa banner horizontal, páginas 800×1200, avatar 48×48, lista vazia e 0×0.

## 5. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| Stub inclui exatamente 300×400 | linhas 31–36 e 47–52 | ✅ PROVADO DIRETAMENTE para o stub |
| Stub exclui largura 299 | linhas 38–43 | ✅ PROVADO DIRETAMENTE para o stub |
| Stub exclui altura 399 | linhas 54–59 | ✅ PROVADO DIRETAMENTE para o stub |
| Stub exclui banner 960×120 | linhas 61–66 | ✅ PROVADO DIRETAMENTE para o stub |
| Stub inclui duas páginas 800×1200 | linhas 69–76 | ✅ PROVADO DIRETAMENTE para o stub |
| Stub exclui avatar 48×48 | linhas 78–83 | ✅ PROVADO DIRETAMENTE para o stub |
| Stub preserva vazio e exclui 0×0 | linhas 86–98 | ✅ PROVADO DIRETAMENTE para o stub |
| Produção possui defaults 300×400 e comparação inclusiva | leitura de `cm-dom-replace.js`/`content_manga.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Produção respeita limites customizados | `extraction-and-handlers-real.test.js` | ✅ PROVADO DIRETAMENTE por teste externo |
| Produção reage a mudança de limites em runtime | `extraction-and-handlers-real.test.js` | ✅ PROVADO DIRETAMENTE por teste externo |
| Produção inclui exatamente 300×400 | não exercitado por este stub contra produção | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Produção cai em 300×400 para config inválida | branch existe, sem assertion focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Invariantes

1. Width e height precisam satisfazer simultaneamente o mínimo.
2. O boundary é inclusivo.
3. Defaults históricos são 300×400.
4. Produção atual permite substituir os defaults em runtime.
5. Elegibilidade real também depende de estado traduzido, banimento, canonicalização e tratamento de backdrops.

## 7. Riscos

**Stub não protege a implementação real.** Alterações em `getScanEligibleImages` não quebram este arquivo.

**Hardcode histórico.** A função local ignora a configurabilidade atual e pode induzir leitura equivocada de que 300×400 é regra fixa.

**Cobertura real já existe em outro arquivo**, mas não no boundary exato default nem no fallback de valores inválidos.

## 8. Solicitações ao auditor

### 207-001 — TEST_MAINTENANCE — OPEN

**Encontrado:** `image-filtering.test.js` protege apenas uma função local histórica hardcoded, enquanto a lógica real está em `cm-dom-replace.js` e é configurável.

**Evidência atual:** o stub prova boundaries do mirror; `extraction-and-handlers-real.test.js` prova limites customizados e runtime update na implementação real.

**Evidência ausente:** boundary default exato 300×400 e fallback de configuração inválida contra a implementação real.

**Necessário:** migrar ou complementar o stub com casos que carreguem a implementação real, preservando explicitamente 300/299 e 400/399 e adicionando config inválida/default.

**Risco:** regressão nos defaults/boundaries reais pode coexistir com este stub verde.

**Severidade:** NORMAL.

## 9. Fonte integral exata

```js
/**
 * image-filtering.test.js — STUB ORIGINAL (v3.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Versão mínima do teste de filtragem de imagens por dimensão.
 *
 * POR QUE ESTE ARQUIVO EXISTE JUNTO COM get-page-images-filter.test.js?
 * O v3.0 só testava o critério dimensional (≥ 300×400px). Não havia teste
 * para filtro de imagens banidas porque o v3.0 NÃO filtrava banidas no
 * content script — isso era feito apenas no popup.js (BUG #9 + INCONS #2).
 *
 * A correção no v3.1 moveu o filtro para o handler GET_PAGE_IMAGES, criando
 * uma única fonte de verdade. O arquivo get-page-images-filter.test.js
 * cobre esse comportamento corrigido.
 *
 * ESTE ARQUIVO documenta o comportamento original (apenas tamanho) e
 * serve como teste de regressão para os limiares dimensionais (300×400px).
 *
 * VEJA: get-page-images-filter.test.js para INCONS #2 + BUG #9 Fix.
 */

describe('Filtro de Imagens — Critério Dimensional (stub v3.0)', () => {

    // Lógica de filtro dimensional — apenas tamanho, sem banidas (v3.0)
    function filterBySize(images) {
        return images.filter(img =>
            img.naturalWidth  >= 300 &&
            img.naturalHeight >= 400
        );
    }

    describe('Limiar de largura (≥ 300px)', () => {
        test('inclui imagem com largura exatamente 300px', () => {
            const result = filterBySize([
                { src: 'a.png', naturalWidth: 300, naturalHeight: 400 }
            ]);
            expect(result).toHaveLength(1);
        });

        test('exclui imagem com largura 299px', () => {
            const result = filterBySize([
                { src: 'a.png', naturalWidth: 299, naturalHeight: 400 }
            ]);
            expect(result).toHaveLength(0);
        });
    });

    describe('Limiar de altura (≥ 400px)', () => {
        test('inclui imagem com altura exatamente 400px', () => {
            const result = filterBySize([
                { src: 'a.png', naturalWidth: 300, naturalHeight: 400 }
            ]);
            expect(result).toHaveLength(1);
        });

        test('exclui imagem com altura 399px', () => {
            const result = filterBySize([
                { src: 'a.png', naturalWidth: 300, naturalHeight: 399 }
            ]);
            expect(result).toHaveLength(0);
        });

        test('exclui banner horizontal (largura OK, altura insuficiente)', () => {
            const result = filterBySize([
                { src: 'banner.png', naturalWidth: 960, naturalHeight: 120 }
            ]);
            expect(result).toHaveLength(0);
        });
    });

    describe('Imagens típicas de mangá (800×1200px)', () => {
        test('página de mangá padrão passa no filtro', () => {
            const result = filterBySize([
                { src: 'page1.png', naturalWidth: 800, naturalHeight: 1200 },
                { src: 'page2.png', naturalWidth: 800, naturalHeight: 1200 },
            ]);
            expect(result).toHaveLength(2);
        });

        test('avatar (48×48) não passa no filtro', () => {
            const result = filterBySize([
                { src: 'avatar.png', naturalWidth: 48, naturalHeight: 48 }
            ]);
            expect(result).toHaveLength(0);
        });
    });

    describe('Lista vazia e casos extremos', () => {
        test('lista vazia retorna lista vazia', () => {
            expect(filterBySize([])).toHaveLength(0);
        });

        test('imagem 0×0 não passa', () => {
            const result = filterBySize([
                { src: 'broken.png', naturalWidth: 0, naturalHeight: 0 }
            ]);
            expect(result).toHaveLength(0);
        });
    });
});
```

## 10. Cobertura documental por linha/posição

As faixas cobrem **1–100** de forma contígua; 100 representa o newline terminal.

### Posições 1–19 — cabeçalho histórico
Explica origem v3.0, ausência de banidas no comportamento antigo e relação com o teste posterior. **Evidência:** 🟦 GATE ESTÁTICO para o texto; claims históricos não equivalem a prova atual.

### Posição 20 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 21–29 — suíte e mirror
Abrem o `describe` e definem `filterBySize` local com thresholds 300/400. **Evidência:** ✅ o restante da suíte prova este mirror.

### Posição 30 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 31–44 — boundary de largura
300 passa; 299 falha, ambos com altura 400. **Evidência:** ✅ PROVADO DIRETAMENTE para o stub.

### Posição 45 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 46–67 — boundary de altura e banner
400 passa; 399 falha; banner 960×120 falha. **Evidência:** ✅ PROVADO DIRETAMENTE para o stub.

### Posição 68 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 69–84 — páginas típicas e avatar
Duas imagens 800×1200 passam; avatar 48×48 falha. **Evidência:** ✅ PROVADO DIRETAMENTE para o stub.

### Posição 85 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 86–99 — lista vazia e 0×0
Lista vazia continua vazia e imagem 0×0 é rejeitada. **Evidência:** ✅ PROVADO DIRETAMENTE para o stub.

### Posição 100 — newline final
Terminador textual final. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- SHA reconfirmado: `a187a4c6e681457067746964c7c714c64542e4a8`.
- Fonte integral embutida do blob auditado.
- Cobertura **100/100 posições**: 1–19, 20, 21–29, 30, 31–44, 45, 46–67, 68, 69–84, 85, 86–99, 100.
- Stub histórico foi separado das provas externas da implementação real.
- Nenhuma execução de teste foi alegada nesta sessão.
- Nenhum código/teste externo foi modificado.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com uma solicitação externa aberta.

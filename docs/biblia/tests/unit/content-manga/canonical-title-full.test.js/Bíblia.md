# Bíblia técnica — tests/unit/content-manga/canonical-title-full.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `1b46903dbe4affda36a20b7fc140af2dc890a4dd`  
> **Agente responsável:** AGENTE 25  
> **Tipo:** suíte Jest de normalização de título baseada em helper espelho  
> **Linhas textuais:** **202**  
> **Posições documentais:** **203**, contando o newline final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

A suíte pretende proteger `canonicalTitle()`, normalizador usado na identidade/deduplicação de capítulos. Ela cobre entradas nulas, lower-case, trim, prefixos, separadores, espaços, truncamento, deduplicação nominal e edge cases.

Contudo, o arquivo **não executa a implementação de produção**. Ele importa `canonicalTitle` de `tests/helpers/extracted-functions.js`, cujo próprio cabeçalho declara ser uma reimplementação/espelho de funções do content script. A implementação atual de produção está em `extension/content/cm-chapter.js` e é exportada como `MangaTranslatorChapter.canonicalTitle`.

A comparação linha a linha revelou **drift funcional já existente** entre o helper e produção. Portanto, assertions desta suíte são prova direta do helper, mas não podem ser atribuídas automaticamente ao comportamento real da extensão.

## 2. Dependências e wiring

### Dependências diretas

- Node `path` para resolver o helper.
- `tests/helpers/repo-root.js` para achar a raiz.
- `tests/helpers/extracted-functions.js` — SHA `ccbf20485608a223c723adf638860cb7151c8886`; fornece a função efetivamente testada.
- Jest (`describe`, `test`, `expect`).
- `fs` é importado na linha 19, mas não é usado.

### Implementação de produção correlata

`extension/content/cm-chapter.js` — SHA `44b621d570b6492ef08982ec4e093ffcfe6d24f8` — define e exporta `canonicalTitle` no objeto `MangaTranslatorChapter`. `extension/content/content_manga.js` consome `createChapterManager` desse módulo.

### Descoberta Jest

`jest.config.js` inclui `tests/unit/content-manga/**/*.test.js` no projeto `content-scripts` com ambiente `jsdom`. O gate CI de inventário verifica a partição dos testes. O AGENTE 25 não executou a suíte nesta auditoria.

## 3. Drift helper × produção

### Helper testado (`tests/helpers/extracted-functions.js`)

O helper aplica, em ordem:
1. regex de prefixo que aceita **palavra textual opcional** antes do número, como `Cap 5:`;
2. regex que remove **sufixo de site** separado por `-`, `|`, `–` ou `—`;
3. substituição de separadores por espaço;
4. remoção de traço/dois-pontos final;
5. colapso de espaços, trim, lowercase e truncamento em 80.

### Produção (`extension/content/cm-chapter.js`)

A produção atual:
1. remove apenas prefixo iniciado diretamente por **dígitos**;
2. **não possui** a regex de remoção de sufixo de site;
3. mantém as etapas de separadores, trailing `-/:`, espaços, trim, lowercase e slice.

Consequências concretas:
- `canonicalTitle('Cap 5: Dragon Ball')` passa na expectativa desta suíte usando o helper, mas a produção preserva o prefixo textual;
- títulos com sufixos de sites diferentes podem produzir formas diferentes na produção, apesar do cabeçalho desta suíte afirmar que o bug de duplicação foi corrigido;
- o comentário do helper afirma que a suíte detectará divergências futuras, porém a suíte não compara helper e produção e a divergência atual já prova o contrário.

## 4. Qualidade das assertions

### Casos fortes

Asserções de entrada nula, lower-case, trim, colapso de espaços e diferenças entre capítulos/obras verificam propriedades objetivas do helper.

### Casos que superestimam o que provam

**‘Mesma chave’.** Linhas 138–150 criam duas chaves normalizadas, mas nunca fazem `expect(norm1).toBe(norm2)`. Elas só exigem que ambas comecem com `one_piece`. Duas chaves diferentes continuam verdes.

**‘NÃO remove número que faz parte do título’.** Linhas 70–75 afirmam que `7 Deadly Sins` deve manter o número, mas a assertion só procura `deadly sins`; ela não exige que `7` permaneça. A própria regex considera o espaço após `7` um separador e pode remover o número sem falhar o teste.

**‘trunca para 80’.** O caso longo verifica `<= 80`, não exatamente 80 nem preservação do prefixo; uma implementação que truncasse excessivamente ainda satisfaria essa assertion.

**Variação entre sessões.** Linhas 164–174 verificam tokens presentes, não equivalência entre as duas formas. Assim não provam a deduplicação prometida no título da seção.

## 5. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| Helper retorna vazio para undefined/null/'' | linhas 31–35 | ✅ PROVADO DIRETAMENTE para o helper |
| Helper lowercases e trim | linhas 37–44 | ✅ PROVADO DIRETAMENTE para o helper |
| Helper remove prefixos numéricos | linhas 49–68 | ✅ PROVADO DIRETAMENTE para o helper |
| Helper remove `Cap 5:` | linhas 60–63 | ✅ PROVADO DIRETAMENTE para o helper; ⚠️ divergente da produção |
| Número inicial sem separador é preservado | linha 74 só procura texto posterior | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Separadores `| — • [ ] ( )` deixam de aparecer | linhas 80–105 | ✅ PROVADO DIRETAMENTE para o helper |
| Espaços múltiplos colapsam | linhas 110–118 | ✅ PROVADO DIRETAMENTE para o helper |
| Saída longa tem no máximo 80 | linhas 123–127 | ✅ PROVADO DIRETAMENTE para limite superior; não para truncamento exato |
| Mesmas visitas produzem **a mesma chave** | nenhuma equality entre `norm1` e `norm2` | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Capítulos/obras distintos geram strings distintas | linhas 152–162 | ✅ PROVADO DIRETAMENTE para o helper |
| Variações de separador entre sessões deduplicam | apenas tokens são verificados | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Edge cases retornam string/retiram guillemets | linhas 179–200 | ✅ PROVADO DIRETAMENTE para o helper |
| Produção `cm-chapter.js` implementa o mesmo algoritmo do helper | comparação estática mostra diferença | ⚠️ CONTRADITO PELO ESTADO ATUAL; não é evidência válida |
| Produção canonicaliza diretamente casos BUG #12 desta suíte | não foi encontrado teste focal que chame `MangaTranslatorChapter.canonicalTitle` com esses casos | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Relação com outros testes

`canonical-title.test.js` também importa o mesmo helper espelho; portanto não fornece independência contra drift.

`chapter-id-cache.test.js` implementa localmente um sistema simplificado e não chama o `canonicalTitle` de produção.

`chapter-id-rejection.test.js` contém outra implementação espelho local e não substitui prova do `cm-chapter.js` real.

`tests/helpers/load-content-script.js` carrega `cm-chapter.js` real antes de `content_manga.js`, o que torna possível construir teste consumer-level, mas a busca atual não encontrou assertion focal dos casos BUG #12 contra o export real.

## 7. Invariantes pretendidos pela suíte

1. Entradas ausentes não devem quebrar e normalizam para string vazia.
2. Saída deve ser trimmed, lowercase e limitada a 80 caracteres.
3. Prefixos de numeração usados por sites devem ser removidos sem destruir números que pertencem ao título.
4. Separadores editoriais devem ser neutralizados.
5. Variações irrelevantes de título da mesma página devem convergir para identidade comparável.
6. Capítulos e obras realmente diferentes devem permanecer distinguíveis.
7. Unicode/acentuação não deve causar throw.

As invariantes 3 e 5 são justamente as mais frágeis no estado atual: o helper diverge da produção e algumas assertions não verificam a propriedade descrita.

## 8. Solicitações ao auditor

### 196-001 — IMPLEMENTATION_DRIFT — OPEN

**Encontrado:** `tests/helpers/extracted-functions.js#canonicalTitle` e `extension/content/cm-chapter.js#canonicalTitle` divergem. O helper aceita prefixo textual opcional (`Cap 5:` etc.) e remove sufixo de site; a produção atual não possui essas duas transformações.

**Contexto:** esta suíte importa exclusivamente o helper, embora o cabeçalho a apresente como suíte completa da função usada pela aplicação.

**Evidência atual:** comparação estática direta dos SHAs `ccbf2048…` (helper) e `44b621d5…` (produção). O caso `Cap 5: Dragon Ball` depende especificamente de uma regra ausente na produção.

**Evidência ausente:** teste focal executando `MangaTranslatorChapter.canonicalTitle` real com a matriz desta suíte, ou gate de paridade entre helper e produção.

**Necessário:** auditor deve decidir qual algoritmo é o contrato correto. Preferencialmente migrar os testes para o export real de `cm-chapter.js`; se a regra do helper for intencional, corrigir produção em alteração separada e adicionar regressões reais. Se a produção atual for intencional, alinhar helper/documentação.

**Risco:** falso verde permanente; deduplicação pode regredir na extensão enquanto a suíte continua protegendo apenas uma cópia mais forte.

**Severidade:** HIGH.

### 196-002 — TEST_ASSERTION_QUALITY — OPEN

**Encontrado:** os cenários mais importantes de deduplicação não provam o claim dos títulos. ‘mesma chave’ não compara `norm1 === norm2`; a variação entre sessões não compara resultados; ‘NÃO remove 7’ não verifica presença de `7`.

**Evidência atual:** linhas 138–150 só testam prefixo `one_piece`; linhas 164–174 só testam tokens; linhas 70–75 só procuram `deadly sins`.

**Evidência ausente:** equality explícita para a mesma identidade e assertion explícita de preservação do número que pertence ao título.

**Necessário:** fortalecer assertions contra a implementação real: mesma entrada semântica deve produzir a mesma chave completa, capítulos distintos devem divergir e títulos iniciados por numeral legítimo devem preservar o numeral conforme contrato.

**Risco:** comportamento oposto ao descrito pode passar sem falhar a suíte.

**Severidade:** HIGH.

### 196-003 — TEST_MAINTENANCE — OPEN

**Encontrado:** metadados/documentação do teste estão desatualizados: cabeçalho fala v3.1 e ‘stub ... (1 teste)’, enquanto o helper se declara v3.2 e `canonical-title.test.js` atual possui quatro testes; `fs` é importado e não usado.

**Evidência atual:** linhas 4, 13, 15 e 19 do arquivo auditado, combinadas com a versão atual dos arquivos lidos.

**Evidência ausente:** nenhuma; é dívida de manutenção, não prova funcional.

**Necessário:** alinhar comentários/versões ao contrato atual e remover import morto em alteração separada, após resolver qual implementação é autoritativa.

**Risco:** documentação induz auditoria a atribuir à suíte uma cobertura/versão que ela não possui.

**Severidade:** LOW.

## 9. Fonte integral exata

O bloco abaixo é o arquivo auditado no SHA registrado, sem correções locais.

```js
/**
 * canonical-title-full.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes completos da função canonicalTitle() — versão v3.1.
 *
 * CONTEXTO: A função original (v3.0) era:
 *   function canonicalTitle(t) { return (t||'').replace(/^\d+\s*\|\s/,'').trim(); }
 *
 * Ela falhava para separadores diferentes de "|" (ex: " - ", "–", ":"), causando
 * capítulos duplicados no banco de dados quando o mesmo capítulo era visitado
 * com pequenas variações no título da aba.
 *
 * A versão v3.1 aplica 4 regex em cascata para normalização robusta.
 *
 * STATUS: Substitui o stub de canonical-title.test.js (1 teste) por suite completa.
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { canonicalTitle } = require(path.join(ROOT, 'tests/helpers/extracted-functions.js'));

describe('CM-05/CM-06/CM-07/CM-08: canonicalTitle() — Normalização de Títulos de Capítulos', () => {

    // ── Casos básicos ─────────────────────────────────────────────────────────
    describe('Entrada básica', () => {
        test('retorna string vazia para undefined/null', () => {
            expect(canonicalTitle(undefined)).toBe('');
            expect(canonicalTitle(null)).toBe('');
            expect(canonicalTitle('')).toBe('');
        });

        test('lowercases o resultado', () => {
            const result = canonicalTitle('One Piece');
            expect(result).toBe('one piece');
        });

        test('remove espaços extras nas bordas', () => {
            expect(canonicalTitle('  One Piece  ')).toBe('one piece');
        });
    });

    // ── Remoção de prefixo numérico ────────────────────────────────────────────
    describe('Remoção de prefixo numérico (BUG #12 Fix)', () => {
        test('remove "1050 - " do início', () => {
            const result = canonicalTitle('1050 - One Piece | Mangás');
            expect(result).not.toMatch(/^1050/);
            expect(result).toContain('one piece');
        });

        test('remove "12. " (ponto como separador)', () => {
            const result = canonicalTitle('12. Naruto Shippuden');
            expect(result).not.toMatch(/^12/);
        });

        test('remove "Cap 5: " (dois-pontos como separador)', () => {
            const result = canonicalTitle('Cap 5: Dragon Ball');
            expect(result).not.toMatch(/^cap 5/);
        });

        test('remove "100–" (travessão)', () => {
            const result = canonicalTitle('100–Bleach Final Arc');
            expect(result).not.toMatch(/^100/);
        });

        test('NÃO remove número que faz parte do título (sem separador)', () => {
            // "7 Deadly Sins" não tem número+separador no início
            const result = canonicalTitle('7 Deadly Sins Capítulo 1');
            // Deve manter o conteúdo, mas após strip/lower
            expect(result).toContain('deadly sins');
        });
    });

    // ── Substituição de separadores ────────────────────────────────────────────
    describe('Substituição de separadores por espaço', () => {
        test('substitui "|" (pipe) por espaço', () => {
            const result = canonicalTitle('One Piece | Ler Online');
            expect(result).not.toContain('|');
        });

        test('substitui "—" (em dash) por espaço', () => {
            const result = canonicalTitle('Naruto — Capítulo 1');
            expect(result).not.toContain('—');
        });

        test('substitui "•" (bullet) por espaço', () => {
            const result = canonicalTitle('Manga Title • Site Name');
            expect(result).not.toContain('•');
        });

        test('substitui "[" e "]" por espaço', () => {
            const result = canonicalTitle('Dragon Ball [Scanlation]');
            expect(result).not.toContain('[');
            expect(result).not.toContain(']');
        });

        test('substitui "(" e ")" por espaço', () => {
            const result = canonicalTitle('One Piece (Fan Sub)');
            expect(result).not.toContain('(');
            expect(result).not.toContain(')');
        });
    });

    // ── Colapso de espaços múltiplos ──────────────────────────────────────────
    describe('Colapso de espaços múltiplos', () => {
        test('colapsa múltiplos espaços em um único', () => {
            const result = canonicalTitle('One   Piece   Online');
            expect(result).toBe('one piece online');
        });

        test('separadores substituídos não criam duplos espaços', () => {
            const result = canonicalTitle('One Piece | Online — Ler');
            expect(result).not.toMatch(/\s{2,}/);
        });
    });

    // ── Truncamento ───────────────────────────────────────────────────────────
    describe('Truncamento a 80 caracteres', () => {
        test('trunca títulos muito longos para 80 chars', () => {
            const long = 'A'.repeat(100);
            const result = canonicalTitle(long);
            expect(result.length).toBeLessThanOrEqual(80);
        });

        test('não trunca títulos curtos', () => {
            const result = canonicalTitle('One Piece Cap 1050');
            expect(result.length).toBeLessThanOrEqual(80);
            expect(result).toContain('one piece');
        });
    });

    // ── O caso crítico: deduplicação de capítulos ──────────────────────────────
    describe('Deduplicação (prevenção de capítulos duplicados)', () => {
        test('Visita 1 e Visita 2 do mesmo capítulo produzem a mesma chave', () => {
            const visit1 = canonicalTitle('One Piece Capítulo 1050 | Ler Online');
            const visit2 = canonicalTitle('One Piece Capítulo 1050 - LerManga');
            // Ambos devem ter a mesma parte principal
            expect(visit1).toContain('one piece');
            expect(visit2).toContain('one piece');
            // A função normalize + compare posterior usa replace(/[^a-z0-9]/gi, '_')
            const norm1 = visit1.replace(/[^a-z0-9]/gi, '_');
            const norm2 = visit2.replace(/[^a-z0-9]/gi, '_');
            // Prefixo comum: "one_piece_cap_tulo_1050"
            expect(norm1.startsWith('one_piece')).toBe(true);
            expect(norm2.startsWith('one_piece')).toBe(true);
        });

        test('capítulos DIFERENTES NÃO produzem a mesma chave', () => {
            const cap1050 = canonicalTitle('One Piece Capítulo 1050');
            const cap1051 = canonicalTitle('One Piece Capítulo 1051');
            expect(cap1050).not.toBe(cap1051);
        });

        test('obras DIFERENTES NÃO produzem a mesma chave', () => {
            const naruto = canonicalTitle('Naruto Capítulo 1 | Ler');
            const bleach = canonicalTitle('Bleach Capítulo 1 | Ler');
            expect(naruto).not.toBe(bleach);
        });

        test('título com variação de separador entre sessões', () => {
            // Cenário real: title muda ligeiramente entre visitas
            const sess1 = canonicalTitle('Berserk Chapter 364 - Manga Reader');
            const sess2 = canonicalTitle('Berserk Chapter 364 | Online');
            // Ambos devem conter o núcleo identificador
            expect(sess1).toContain('berserk');
            expect(sess1).toContain('chapter');
            expect(sess1).toContain('364');
            expect(sess2).toContain('berserk');
            expect(sess2).toContain('364');
        });
    });

    // ── Casos extremos ────────────────────────────────────────────────────────
    describe('Casos extremos (edge cases)', () => {
        test('título somente com número não quebra', () => {
            const result = canonicalTitle('1050');
            expect(typeof result).toBe('string');
        });

        test('título com apenas separadores não quebra', () => {
            const result = canonicalTitle('| — • |');
            expect(typeof result).toBe('string');
            expect(result.length).toBeLessThanOrEqual(80);
        });

        test('título com caracteres Unicode (acentuação PT-BR)', () => {
            const result = canonicalTitle('Capítulo 5 — Ação e Reação');
            expect(result).toContain('cap');
            expect(typeof result).toBe('string');
        });

        test('título com guillemets (« ») — separadores europeus', () => {
            const result = canonicalTitle('One Piece «Capítulo 1050»');
            expect(result).not.toContain('«');
            expect(result).not.toContain('»');
        });
    });
});
```

## 10. Cobertura documental por linha/posição

As faixas cobrem **1–203** de forma contígua; 203 é o newline terminal.

### Posições 1–16 — cabeçalho histórico
Declara suíte completa, contexto v3.0/v3.1, motivação de deduplicação e relação com stub. Há metadados stale: helper atual se chama v3.2 e stub não tem mais um único teste. **Evidência:** 🟦 GATE ESTÁTICO somente para presença do texto; claims históricos não são provas runtime.

### Posição 17 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 18–25 — imports e função efetivamente testada
Resolve raiz e importa `canonicalTitle` de `tests/helpers/extracted-functions.js`. Esse detalhe define todo o valor probatório da suíte: é um mirror, não o export de produção. `fs` é morto. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo setup.

### Posição 26 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 27–28 — abertura da suíte
Abrem o `describe` CM-05/06/07/08. **Evidência:** 🟨 estrutura Jest.

### Posições 29–45 — entrada básica
Testam vazio para undefined/null/'', lowercase e trim. Assertions são exatas para o helper. **Evidência:** ✅ PROVADO DIRETAMENTE para o helper.

### Posição 46 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 47–69 — prefixos removidos
Exercitam `1050 -`, `12.`, `Cap 5:` e `100–`. O caso textual `Cap 5:` é prova do helper e evidencia drift porque produção não possui o grupo textual opcional. **Evidência:** ✅ helper; ⚠️ produção.

### Posições 70–76 — número integrante do título
O título diz que `7` não deve ser removido, mas a assertion apenas exige `deadly sins`. Ela não falharia se o `7` desaparecesse. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para preservação do numeral.

### Posição 77 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 78–106 — substituição de separadores
Casos para pipe, em dash, bullet, colchetes e parênteses exigem ausência dos caracteres. Provam remoção/substituição no helper, mas não o valor final completo. **Evidência:** ✅ PROVADO DIRETAMENTE para ausência dos separadores no helper.

### Posição 107 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 108–119 — colapso de espaços
Exigem valor exato em múltiplos espaços e ausência de dois espaços após separadores. **Evidência:** ✅ PROVADO DIRETAMENTE para o helper.

### Posição 120 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 121–134 — truncamento
Título longo exige apenas `length <= 80`; título curto exige <=80 e contém `one piece`. Limite superior é provado, truncamento exato/preservação até 80 não. **Evidência:** ✅ limite superior; ⚠️ propriedade mais forte.

### Posição 135 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 136–150 — caso crítico de ‘mesma chave’
Normaliza duas visitas e calcula `norm1/norm2`, mas assertions verificam somente prefixo comum; igualdade completa nunca é comparada. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para deduplicação declarada.

### Posições 151–162 — diferenças legítimas
Comparam strings de capítulos 1050/1051 e Naruto/Bleach e exigem desigualdade. **Evidência:** ✅ PROVADO DIRETAMENTE para o helper.

### Posições 163–175 — variação entre sessões
Dois títulos de Berserk são reduzidos, mas apenas tokens esperados são procurados; não há igualdade de chave/resultado. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para convergência/deduplicação.

### Posição 176 — separador
Linha vazia. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Posições 177–201 — edge cases
Testam número puro sem throw, somente separadores, Unicode PT-BR e guillemets. As properties verificadas são tipo string, limite e ausência de «». **Evidência:** ✅ PROVADO DIRETAMENTE para o helper nos termos exatos das assertions.

### Posição 202 — fechamento
Fecha a suíte. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo parser/Jest.

### Posição 203 — newline final
Terminador textual final. **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

## 11. Autoauditoria documental

- SHA reconfirmado: `1b46903dbe4affda36a20b7fc140af2dc890a4dd`.
- Fonte integral embutida diretamente do blob.
- **203/203 posições** cobertas: 1–16, 17, 18–25, 26, 27–28, 29–45, 46, 47–69, 70–76, 77, 78–106, 107, 108–119, 120, 121–134, 135, 136–150, 151–162, 163–175, 176, 177–201, 202, 203.
- Evidência do helper foi explicitamente separada da implementação real.
- Drift helper/produção foi registrado como solicitação, sem alterar nenhum dos dois.
- Nenhuma execução de teste foi alegada nesta sessão.
- `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md`, helper e produção permaneceram read-only.

**Resultado da autoauditoria:** ✅ APROVADO documentalmente, com três `audit_requests` externos abertos.

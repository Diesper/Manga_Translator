# Bíblia técnica — tests/unit/content-manga/canonical-title.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `bfb01bdfb8de0921d85486e56003ac2e37f4b0e2`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** suíte Jest unitária/stub de normalização de título  
> **Linhas textuais:** 44  
> **Posições documentais:** 45, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/unit/content-manga/canonical-title.test.js` é um teste legado curto, rotulado no próprio cabeçalho como **“STUB ORIGINAL (v3.0)”**. Ele preserva quatro expectativas mínimas para uma função chamada `canonicalTitle`:

1. `null` e `undefined` → string vazia;
2. normalização para lowercase;
3. trim das bordas;
4. limite máximo de 80 caracteres.

O arquivo declara explicitamente que `canonical-title-full.test.js` contém a suíte ampliada do BUG #12. Portanto sua intenção histórica é documentar um piso mínimo, não cobrir toda a normalização moderna.

Há, porém, uma distinção crítica para interpretar as evidências: este teste **não importa a implementação de produção** de `extension/content/cm-chapter.js`. Ele importa `canonicalTitle` de `tests/helpers/extracted-functions.js`.

## 2. Cadeia real de execução

O import efetivo é:

```text
canonical-title.test.js
  -> tests/helpers/repo-root.js
  -> tests/helpers/extracted-functions.js#canonicalTitle
```

A função usada em produção está em:

```text
extension/content/cm-chapter.js#canonicalTitle
  -> exportada por globalThis/window.MangaTranslatorChapter
```

`cm-chapter.js` exporta explicitamente `canonicalTitle` no objeto `MangaTranslatorChapter`, portanto existe um caminho viável para testes chamarem a implementação real sem copiar a lógica.

## 3. Inclusão no Jest

`jest.config.js` coloca `tests/unit/content-manga/**/*.test.js` no projeto `content-scripts`, com ambiente `jsdom`.

A política de testes do repositório também busca `.skip`, `.only` e `test.todo`. Este arquivo não contém nenhum desses marcadores.

O import de `fs` na linha 18 não é utilizado em nenhuma linha posterior. Isso não muda o comportamento da suíte; é dependência morta local.

## 4. Contrato testado pelo stub

### T01 — null/undefined

As linhas 27–30 fazem duas assertions estritas:

- `canonicalTitle(null) === ''`;
- `canonicalTitle(undefined) === ''`.

Essas assertions provam diretamente o helper importado.

### T02 — lowercase

Linhas 32–34 exigem:

```text
"One Piece" -> "one piece"
```

### T03 — trim

Linhas 36–38 exigem:

```text
"  Naruto  " -> "naruto"
```

### T04 — limite de 80

Linhas 40–43 criam 100 caracteres `A` e exigem comprimento `<= 80`.

O teste não exige exatamente 80, apenas “no máximo 80”. Uma implementação que truncasse para 60 também passaria esse caso.

## 5. Divergência entre helper de teste e produção

### Implementação real — `extension/content/cm-chapter.js`

No blob atual, a função real usa, em essência:

```js
(value || '')
  .replace(/^\d+[\s.\-–—:|]+/, '')
  .replace(/[|–—•·\[\]()\u00AB\u00BB]/g, ' ')
  .replace(/\s*[-:]\s*$/, '')
  .replace(/\s{2,}/g, ' ')
  .trim()
  .toLowerCase()
  .slice(0, 80)
```

### Helper usado por este teste — `tests/helpers/extracted-functions.js`

O helper contém etapas adicionais:

- prefixo textual opcional antes do número, como `Cap 5:`;
- remoção ampla de sufixo de site com `.replace(/\s+[-|–—]\s+.+$/, '')`.

Logo, as duas funções **não são fonte única nem equivalentes no domínio geral**.

Para os quatro inputs básicos deste stub, a inspeção atual indica resultados compatíveis; porém isso não transforma as assertions em prova automatizada da implementação real. Se `cm-chapter.js` regredir e o helper permanecer estável, este arquivo pode continuar verde.

A divergência é ainda mais relevante porque `canonical-title-full.test.js` também importa o mesmo helper e contém casos que dependem da regex expandida.

## 6. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| arquivo é descoberto pelo projeto content-scripts | `jest.config.js` testMatch | 🟦 GATE ESTÁTICO ESPECÍFICO |
| não usa skip/only/todo | fonte + gate de política | 🟦 GATE ESTÁTICO ESPECÍFICO |
| helper retorna vazio para null | assertion linha 28 | ✅ PROVADO DIRETAMENTE — **helper** |
| helper retorna vazio para undefined | assertion linha 29 | ✅ PROVADO DIRETAMENTE — **helper** |
| helper converte `One Piece` para lowercase | linha 33 | ✅ PROVADO DIRETAMENTE — **helper** |
| helper faz trim de `Naruto` | linha 37 | ✅ PROVADO DIRETAMENTE — **helper** |
| helper limita string de 100 chars a <=80 | linha 42 | ✅ PROVADO DIRETAMENTE — **helper** |
| produção `cm-chapter.js#canonicalTitle` executa esses quatro casos | não é importada/executada pelo teste | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| helper e produção são equivalentes em todos os casos | código atual diverge | ⚠️ NÃO PROVADO; há divergência observável |
| remoção de prefixos/sufixos modernos | não pertence às quatro assertions do stub | ⚠️ SEM PROVA NESTE ARQUIVO |
| truncamento é exatamente em 80 | teste aceita qualquer valor <=80 | ⚠️ SEM ASSERTION EXATA |

## 7. Solicitações ao auditor

### 197-001 — TEST_AUTHENTICITY — OPEN

**Encontrado:** o teste importa `canonicalTitle` de `tests/helpers/extracted-functions.js`, não a função real exportada por `extension/content/cm-chapter.js`.

**Arquivo auditado:** `tests/unit/content-manga/canonical-title.test.js`.

**Arquivo relacionado:** `extension/content/cm-chapter.js`.

**Evidência atual:** as quatro assertions provam diretamente apenas o helper extraído.

**Evidência ausente:** execução da implementação real com os mesmos casos mínimos.

**Por que é insuficiente:** regressão em produção pode permanecer verde se o helper de teste não mudar.

**Ação solicitada:** em mudança de testes separada, carregar `cm-chapter.js` real e chamar `MangaTranslatorChapter.canonicalTitle`, ou estabelecer outra fonte canônica única realmente compartilhada por runtime e testes.

**Evidência esperada:** as assertions atuais executando a função real, sem reimplementar/copy-paste da lógica.

**Ação esperada do auditor:** confirmar autenticidade e decidir a migração sem alterar esta Bíblia.

**Possível regressão:** normalização real de títulos pode quebrar enquanto o stub permanece verde.

**Impacto:** deduplicação/identidade de capítulos.

**Severidade:** HIGH.

### 197-002 — SOURCE_DIVERGENCE — OPEN

**Encontrado:** `tests/helpers/extracted-functions.js#canonicalTitle` e `extension/content/cm-chapter.js#canonicalTitle` possuem regex diferentes. O helper aceita prefixo textual opcional e remove sufixo de site; a implementação real atual não contém essas duas etapas.

**Contexto:** o comentário do helper o chama de versão v3.2 e `canonical-title-full.test.js` testa casos como `Cap 5: ...` usando esse helper.

**Evidência atual:** comparação direta dos blobs atuais mostra a divergência.

**Evidência ausente:** decisão explícita sobre qual implementação representa o contrato atual e teste real que impeça drift.

**Ação solicitada:** auditar `canonical-title-full.test.js`, `extracted-functions.js` e `cm-chapter.js` juntos; determinar se o helper está adiantado/stale ou se produção perdeu correções. Qualquer correção deve ocorrer fora desta auditoria documental e vir acompanhada de teste contra a implementação real.

**Evidência esperada:** uma única semântica canônica, com testes reais para prefixos/sufixos e casos básicos.

**Possível regressão:** suíte completa pode reportar BUG #12 protegido enquanto o runtime executa regras diferentes.

**Impacto:** capítulos duplicados ou títulos canonicalizados de forma inconsistente.

**Severidade:** HIGH.

### 197-003 — TEST_STRENGTH_REVIEW — OPEN

**Encontrado:** o teste de comprimento verifica apenas `toBeLessThanOrEqual(80)`.

**Evidência atual:** para uma entrada de 100 `A`, qualquer saída com comprimento entre 0 e 80 satisfaz a assertion.

**Evidência ausente:** conteúdo esperado e comprimento exato 80, preservando os primeiros 80 caracteres normalizados.

**Ação solicitada:** se o contrato é realmente `.slice(0, 80)`, fortalecer em alteração separada para exigir exatamente 80 e o conteúdo truncado correto.

**Evidência esperada:** assertion de igualdade com `'a'.repeat(80)`.

**Possível regressão:** truncamento excessivo ou retorno vazio poderia passar por esse caso isolado.

**Impacto:** força do teste mínimo.

**Severidade:** NORMAL.

## 8. Fonte integral auditada

```js
/**
 * canonical-title.test.js — STUB ORIGINAL (v3.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Versão mínima do teste de canonicalTitle().
 *
 * POR QUE ESTE ARQUIVO EXISTE JUNTO COM canonical-title-full.test.js?
 * A função original em v3.0 era simples:
 *   function canonicalTitle(t) { return (t||'').replace(/^\d+\s*\|\s/,'').trim(); }
 *
 * Este stub testava apenas a regex original. O arquivo full (v3.1) testa
 * a versão com 4 regex em cascata que corrigiu BUG #12 (capítulos duplicados).
 * Manter este stub documenta o comportamento esperado MÍNIMO.
 *
 * VEJA: canonical-title-full.test.js para a suíte completa (BUG #12 Fix).
 */

const path = require('path');
const fs   = require('fs');
// Portable root finder — works regardless of where this file is placed in the tree.
// Walks up from __dirname until it finds the folder containing extension/manifest.json.
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { canonicalTitle } = require(path.join(ROOT, 'tests/helpers/extracted-functions.js'));

describe('canonicalTitle() — Teste Básico (stub v3.0)', () => {
    test('retorna string vazia para null/undefined', () => {
        expect(canonicalTitle(null)).toBe('');
        expect(canonicalTitle(undefined)).toBe('');
    });

    test('converte para lowercase', () => {
        expect(canonicalTitle('One Piece')).toBe('one piece');
    });

    test('remove espaços extras nas bordas', () => {
        expect(canonicalTitle('  Naruto  ')).toBe('naruto');
    });

    test('retorna string com no máximo 80 caracteres', () => {
        const long = 'A'.repeat(100);
        expect(canonicalTitle(long).length).toBeLessThanOrEqual(80);
    });
});
```

## 9. Mapa integral linha por linha

| Linha | Papel | Observação |
|---:|---|---|
| 1 | abre comentário de arquivo | documentação |
| 2 | identifica arquivo/stub v3.0 | histórico |
| 3 | separador visual | documentação |
| 4 | descreve versão mínima | documentação |
| 5 | linha vazia do comentário | documentação |
| 6 | pergunta sobre coexistência com full | documentação |
| 7 | introduz função original | documentação |
| 8 | mostra implementação v3.0 histórica | não executada |
| 9 | linha vazia do comentário | documentação |
| 10 | afirma escopo do stub | coerente com 4 casos básicos |
| 11 | atribui full ao BUG #12 | precisa ser lido com 197-002 |
| 12 | explica preservação do mínimo | intenção |
| 13 | linha vazia do comentário | documentação |
| 14 | referência ao full | documentação |
| 15 | fecha comentário | estrutural |
| 16 | separador | estrutural |
| 17 | importa `path` | usado na montagem do helper |
| 18 | importa `fs` | **não usado** |
| 19 | comentário root finder | documentação |
| 20 | comentário root finder | documentação |
| 21 | importa `findRepoRoot` | dependência helper |
| 22 | calcula `ROOT` | runtime do teste |
| 23 | separador | estrutural |
| 24 | importa `canonicalTitle` do helper extraído | ponto crítico de autenticidade |
| 25 | separador | estrutural |
| 26 | abre describe | agrupa stub |
| 27 | T01: null/undefined | teste |
| 28 | assertion null → vazio | ✅ helper |
| 29 | assertion undefined → vazio | ✅ helper |
| 30 | fecha T01 | estrutural |
| 31 | separador | estrutural |
| 32 | T02 lowercase | teste |
| 33 | assertion One Piece | ✅ helper |
| 34 | fecha T02 | estrutural |
| 35 | separador | estrutural |
| 36 | T03 trim | teste |
| 37 | assertion Naruto | ✅ helper |
| 38 | fecha T03 | estrutural |
| 39 | separador | estrutural |
| 40 | T04 limite | teste |
| 41 | cria 100 caracteres | input |
| 42 | exige comprimento <=80 | ✅ helper, assertion fraca quanto ao corte exato |
| 43 | fecha T04 | estrutural |
| 44 | fecha describe | estrutural |
| posição 45 | newline final | blob confirmado |

## 10. Unidades semânticas

### U01 — linhas 1–15 — histórico e intenção

Preserva a origem do stub e remete à suíte full. É documentação histórica útil, mas versões citadas não devem ser tratadas como fonte de verdade superior ao código atual.

### U02 — linhas 17–24 — resolução e import

Resolve o root de forma portátil e importa o helper de testes. O import de `fs` é morto. O ponto arquitetural crítico é a escolha do helper em vez do módulo real.

### U03 — linhas 26–30 — valores ausentes

Prova fallback vazio do helper.

### U04 — linhas 32–38 — normalização básica

Prova lowercase e trim do helper com inputs simples.

### U05 — linhas 40–43 — limite superior

Prova apenas a desigualdade `length <= 80`; não prova corte exato nem conteúdo.

### U06 — linha 44 + posição 45 — fechamento

Encerra o bloco Jest e preserva newline final.

## 11. Invariantes e limites

Invariantes realmente impostos pelo arquivo:
1. o helper deve aceitar null/undefined sem lançar;
2. o helper deve lowercase `One Piece`;
3. o helper deve remover espaços nas bordas de `Naruto`;
4. a saída para 100 `A` não pode ultrapassar 80 caracteres.

Não imposto:
- função de produção real;
- regex de prefixos;
- remoção de sufixos de site;
- separadores;
- colapso de whitespace interno;
- conteúdo exato do truncamento;
- tipos não-string truthy;
- Unicode/case folding especial.

## 12. Autoauditoria do AGENTE 17

- [x] reserva exclusiva #197 criada via CREATE ONLY;
- [x] reserva relida e proprietário confirmado;
- [x] state #197 criado como IN_PROGRESS pelo mesmo agente;
- [x] SHA do source reconfirmado antes da escrita;
- [x] fonte integral incorporada sem modificar teste/helper/produção;
- [x] 44 linhas textuais + newline = 45 posições documentadas;
- [x] implementation target real localizada em `cm-chapter.js`;
- [x] helper efetivamente importado foi lido;
- [x] divergência helper×produção documentada sem corrigi-la;
- [x] assertions diretas não foram promovidas indevidamente a prova de produção;
- [x] três solicitações de auditoria foram registradas;
- [x] nenhum arquivo fora de lock/state/Bíblia próprios foi alterado.

**Resultado:** Bíblia concluída para o blob `bfb01bdfb8de0921d85486e56003ac2e37f4b0e2`. O teste é válido como prova mínima do helper importado, mas não constitui prova direta da implementação `MangaTranslatorChapter.canonicalTitle`.

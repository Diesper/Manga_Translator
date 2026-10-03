# Bíblia técnica — `extension/background/actions/check-extraction-tab.js`

> **Estado documental:** correção validada; decisão distribuída final pendente  
> **SHA auditado:** `18640c20e3ba872c18e81ec4ec7d7357d16fd958`  
> **Tipo:** action do background que identifica abas temporárias de extração  
> **Linhas textuais:** **29**  
> **Posições documentais:** **30**, contando o LF final  
> **PR:** #66  
> **Branch:** `docs/project-bible`

## 1. Papel arquitetural

A action responde se a aba remetente está registrada em `context.state.extractionTabs`. O identificador consultado vem do `sender.tab.id`, nunca do payload. Antes do lookup ela aguarda `context.ensureInitialized()`, preservando a causalidade de reidratação do Service Worker MV3.

Um hit devolve os campos persistidos do mapping e força `isExtractionTab: true`. Um miss ou estado/mapping estruturalmente malformado devolve `{ isExtractionTab: false }`.

## 2. Contrato de bootstrap e escopo

O arquivo exige `MangaTranslatorRouter` e falha imediatamente com `MangaTranslatorRouter indisponível` se a dependência não existir.

A seleção de escopo da IIFE é literal:

- usa `self` **quando `self` está definido**;
- caso contrário usa `globalThis`.

Isso não equivale a dizer “Service Worker usa self e Jest usa globalThis”. Jest pode definir `global.self`; por isso a revisão atual não associa o ramo ao nome do ambiente. O self-test focal executa explicitamente os dois ramos.

## 3. Lookup defensivo

`context.sender`/`sender.tab` ausentes produzem `tabId = -1`. `context.state` ou `extractionTabs` ausentes não lançam.

`extractionTabs` só é considerado índice válido quando:

- é objeto;
- não é array;
- possui o `tabId` como **propriedade própria**.

Assim, arrays e propriedades herdadas por prototype não produzem falso hit.

O mapping encontrado também deve ser objeto não-array. Isso evita espalhar strings/arrays/valores primitivos como identidade de uma extraction tab.

## 4. Invariante do discriminador

A ordem de merge é `{ ...mapping, isExtractionTab: true }`. Portanto um mapping persistido/corrompido contendo `isExtractionTab: false` não consegue converter um hit real em resposta negativa.

Essa ordem resolve diretamente a request histórica 004-001.

## 5. Inicialização e comportamento negativo

`await context.ensureInitialized()` ocorre antes de qualquer leitura de `state.extractionTabs`. A revisão focal testa essa ordem com Promise deliberadamente pendente e getter observável do estado.

Se `ensureInitialized()` rejeita, a action propaga a rejeição; o router real converte falhas assíncronas de actions em resposta `INTERNAL_ERROR`. A action não engole a causa.

## 6. Evidência focal da revisão

Self-test: `docs/biblia/.coordination/check-extraction-tab-selftest.js` — SHA `26977004615d152923a9abd9a5451571ce3c46a7`.

O self-test executa o **arquivo real** em `vm` e cobre:

- bootstrap sem router;
- registro via ramo `self`;
- registro via fallback `globalThis`;
- hit nominal;
- mapping com `isExtractionTab:false`;
- mappings primitivos/array/null;
- `extractionTabs` array;
- propriedade herdada no índice;
- sender sem tab;
- state nulo/ausente;
- prova causal de `ensureInitialized` antes da leitura;
- rejeição de inicialização sem leitura do estado.

Workflow dedicado: `.github/workflows/check-extraction-tab-selftest.yml` — SHA `87803437d424048622a396c74975426114fdd680`.

O workflow roda o self-test Node e depois todo o projeto Jest `background` em `--runInBand --detectOpenHandles`. A run `36942704897`, job `110637664732`, executou exatamente `SOURCE_SHA=18640c20e3ba872c18e81ec4ec7d7357d16fd958`, self-test `26977004615d152923a9abd9a5451571ce3c46a7` e workflow `87803437d424048622a396c74975426114fdd680`: self-test focal **PASS**, suíte background **45/45 suites e 225/225 testes**, com detecção de open handles habilitada.

## 7. Audit requests históricas

### 004-001 — RESOLVED

O discriminador agora é aplicado depois do spread e mappings malformados recebem tratamento defensivo. O self-test inclui conflito explícito `isExtractionTab:false`, arrays, primitivos e propriedades herdadas. A run `36942704897` concluiu `success`.

### 004-002 — RESOLVED

A cobertura focal agora inclui sender sem tab, state/extractionTabs ausentes, rejeição de `ensureInitialized`, ordem do await, bootstrap sem router e os ramos `self`/`globalThis`. A evidência foi colocada em infraestrutura de coordenação para não alterar/inutilizar a Bíblia de outro arquivo de teste. A run `36942704897` concluiu `success`.

## 8. Findings PRIMARY + ADVERSARIAL da revisão anterior

Os dois auditores independentes da revisão anterior concordaram em dois defeitos documentais:

1. status stale de `CONCLUÍDO/APROVADO` para uma revisão que estava `READY_FOR_AUDIT`;
2. descrição incorreta `globalThis em Node/Jest`, apesar de testes definirem `self`.

Ambos são removidos nesta revisão. Esta Bíblia não declara `DONE`, `COMPLETED`, “aprovada” ou `100/100`; nova PRIMARY + ADVERSARIAL será necessária após a correção.

## 9. Limites honestos

- O formato semântico completo do mapping continua sendo responsabilidade do produtor; esta action valida apenas shape mínimo necessário para não aceitar primitivos/arrays/herança.
- `allowedSources: ['any']` permanece o contrato atual do router; esta unidade não altera autorização.
- A action não cria, remove nem persiste extraction tabs; apenas consulta o índice após a barreira de inicialização.

## 10. Fonte integral exata

```javascript
'use strict';
// background/actions/check-extraction-tab.js — Identifica abas temporárias de extração

(function(scope) {
  if (!scope.MangaTranslatorRouter) {
    throw new Error('MangaTranslatorRouter indisponível');
  }

  scope.MangaTranslatorRouter.registerAction({
    name: 'check-extraction-tab',
    meta: { allowedSources: ['any'] },
    async execute(_request, context) {
      await context.ensureInitialized();
      const tabId = context.sender && context.sender.tab ? context.sender.tab.id : -1;
      const extractionTabs = context.state && context.state.extractionTabs;
      const hasMapping = extractionTabs
        && typeof extractionTabs === 'object'
        && !Array.isArray(extractionTabs)
        && Object.prototype.hasOwnProperty.call(extractionTabs, tabId);
      const mapping = hasMapping ? extractionTabs[tabId] : null;

      if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
        return { ...mapping, isExtractionTab: true };
      }

      return { isExtractionTab: false };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
```

## 11. Cobertura integral por posições

- **1–2:** strict mode e identidade do módulo.
- **3:** separador vazio.
- **4–7:** IIFE e guarda obrigatória do router.
- **8:** separador vazio.
- **9–12:** registro, nome, metadata e início de `execute`.
- **13:** barreira `ensureInitialized`.
- **14:** tabId do sender ou `-1`.
- **15–20:** leitura defensiva do índice, shape não-array, propriedade própria e seleção do mapping.
- **21:** separador vazio.
- **22–24:** validação do mapping e hit com discriminador invariável.
- **25:** separador vazio.
- **26:** miss explícito.
- **27–29:** fechamento de execute/registro e seleção literal `self`→`globalThis`.
- **30:** posição vazia correspondente ao LF final.

**Cobertura: 30/30 posições, sem gap ou overlap.**

## 12. Autoauditoria documental

- Source SHA: `18640c20e3ba872c18e81ec4ec7d7357d16fd958`.
- Fonte integral acima inserida diretamente do blob atual.
- Nenhuma aprovação histórica é apresentada como status da revisão atual.
- O ramo de escopo é descrito pela condição real, não por suposição de ambiente.
- Requests 004-001/002 estão corrigidas e validadas pela run `36942704897` / job `110637664732`.
- A revisão continua sem aprovação distribuída própria; próximo passo canônico é nova auditoria independente PRIMARY + ADVERSARIAL para este `SOURCE_SHA`/`BIBLE_SHA`.

# Bíblia técnica — `extension/background/actions/check-extraction-tab.js`

> **Estado:** CONCLUÍDO nesta Bíblia individual.  
> **Arquivo-fonte:** `extension/background/actions/check-extraction-tab.js`  
> **SHA auditado:** `9ee40474d8c52da5e725ab04a2e325dd69830a51`  
> **Linhas auditadas:** 25 (incluindo newline final).  
> **Ação pública legada:** `CHECK_IF_EXTRACTION_TAB` → `check-extraction-tab`.  
> **Teste unitário direto da action:** `tests/unit/background/actions-low-risk.test.js`.  
> **Teste do caminho real pelo background:** `tests/unit/background/plan-missing-handlers-real.test.js` e `tests/unit/background/routed-actions-legacy.test.js`.

---

## 1. Papel arquitetural

Esta action responde à pergunta: **“a aba que acabou de falar com o Service Worker é uma aba temporária de extração criada para um job de tradução?”**

O dado canônico está em `context.state.extractionTabs`, indexado pelo **tabId real do remetente**. Quando existe um mapeamento, a resposta devolve a identidade necessária para reconectar a aba auxiliar ao job que a criou: `mangaTabId`, `index`, `geminiTabId`, `jobId` e quaisquer outros campos persistidos no mapping.

Essa verificação é importante porque uma URL de resultado pode ser aberta em uma nova aba. O content script dessa aba precisa descobrir se é uma aba “normal” ou uma aba de extração controlada. Fazer essa identidade por URL seria pior: URLs podem se repetir, redirecionar ou mudar; o tabId representa a instância concreta que o background registrou.

A action chama `ensureInitialized()` **antes** de ler o mapa. Isso é essencial no MV3: o Service Worker pode ter sido descartado e reaberto, então ler `extractionTabs` antes da reidratação poderia produzir um falso “não é aba de extração”.

---

## 2. Fonte integral

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
      const extractionTabs = context.state.extractionTabs || {};
      const mapping = extractionTabs[tabId];

      if (mapping) {
        return { isExtractionTab: true, ...mapping };
      }

      return { isExtractionTab: false };
    },
  });
})(typeof self !== 'undefined' ? self : globalThis);
```

---

## 3. Dependências e consumidores

**Depende de:**

- `MangaTranslatorRouter.registerAction`: registro da action;
- `context.ensureInitialized()`: barreira de reidratação do background;
- `context.sender.tab.id`: identidade concreta da aba remetente;
- `context.state.extractionTabs`: índice canônico de abas auxiliares.

**É consumida por:**

- o alias `CHECK_IF_EXTRACTION_TAB` em `background/router.js`;
- `content/content_manga.js`, que pergunta ao background se a página atual é uma extraction tab;
- fluxos de `GEMINI_RESULT_URL`/aba auxiliar, que registram `extractionTabs[tabId]`.

---

## 4. Evidência de teste real

### 4.1 Teste direto da action

`tests/unit/background/actions-low-risk.test.js` carrega **o arquivo real desta action** no router e fornece:

```text
extractionTabs[61] = {
  mangaTabId: 7,
  index: 4,
  geminiTabId: 32,
  jobId: 'job-1'
}
```

Depois envia `CHECK_IF_EXTRACTION_TAB` a partir da tab 61 e exige a resposta completa com `isExtractionTab: true` e todos os campos do mapping.

Isso prova diretamente o caminho **hit**.

### 4.2 Teste real de integração dentro do background

`tests/unit/background/plan-missing-handlers-real.test.js` cria o fluxo de `GEMINI_RESULT_URL`, espera a aba auxiliar ser registrada no estado real do background, e então testa:

- **hit**: a extraction tab retorna `isExtractionTab: true` com identidade do job;
- **miss**: tabId inexistente retorna exatamente `{ isExtractionTab: false }`.

Isto é evidência mais forte que uma simples ocorrência textual porque o teste cria o estado por meio do fluxo produtor real e consulta pelo listener real.

### 4.3 Compatibilidade legada

`tests/unit/background/routed-actions-legacy.test.js` prova que:

- `CHECK_IF_EXTRACTION_TAB` realmente passa pelo router;
- a compatibilidade de `background.js` remove o wrapper `ok: true` para o consumidor legado;
- os campos do mapping chegam inalterados.

---

# 5. Auditoria linha por linha

## Linha 1 — `'use strict';`

**O que faz:** ativa strict mode no módulo.

**Como faz:** usa a diretiva reconhecida pelo motor antes da IIFE.

**Por que assim:** esta action grava nada globalmente além do registro deliberado no router. Strict mode reduz risco de criar globais acidentais ao manipular `scope`, `context` e mappings.

**Evidência:** 🟨 executada em todos os testes que carregam a action; não há assertion específica sobre strict mode.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a diretiva isolada.**

## Linha 2 — comentário de identidade do módulo

**O que faz:** registra que o arquivo identifica abas temporárias de extração.

**Como faz:** comentário de código, sem efeito de runtime.

**Por que assim:** a finalidade do arquivo é estreita; manter o objetivo no topo reduz chance de alguém transformar a action em lógica de criação/cleanup de abas, que pertence a outros módulos.

**Evidência:** ℹ️ não executável.

## Linha 3 — linha vazia

Separa cabeçalho da IIFE. Sem efeito de runtime.

**Evidência:** ℹ️ não executável.

## Linha 4 — `(function(scope) {`

**O que faz:** inicia uma IIFE que recebe o escopo global apropriado.

**Como faz:** o argumento é fornecido na linha 24 como `self` no Service Worker ou `globalThis` em Node/Jest.

**Por que assim:** permite que o mesmo arquivo seja carregado no browser e em testes CommonJS sem introduzir variáveis auxiliares globais.

**Evidência:** ✅ o teste direto carrega o módulo em Jest e o registro funciona.

## Linha 5 — `if (!scope.MangaTranslatorRouter) {`

**O que faz:** verifica uma pré-condição obrigatória: o router precisa ter sido carregado antes da action.

**Como faz:** testa a presença da API no `scope`.

**Por que assim:** uma action sem router não pode ser registrada. Falhar cedo é melhor que deixar o arquivo “carregar” silenciosamente e descobrir só depois que mensagens nunca são tratadas.

**Evidência:** 🟨 os testes carregam router antes e provam o caminho válido.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do caminho negativo “router ausente”.**

## Linha 6 — `throw new Error('MangaTranslatorRouter indisponível');`

**O que faz:** transforma a ausência do router em falha explícita de bootstrap.

**Como faz:** lança `Error` imediatamente.

**Por que assim:** no Service Worker real, uma dependência obrigatória ausente deve tornar a falha observável; retornar silenciosamente deixaria uma instalação parcialmente funcional.

**Evidência:** ⚠️ **SEM TESTE PROBATÓRIO ESPECÍFICO** deste throw.

## Linha 7 — `}`

Fecha a guarda de dependência.

**Evidência:** ✅ estruturalmente exercitada pelo carregamento da action.

## Linha 8 — linha vazia

Separa validação de dependência do registro.

**Evidência:** ℹ️ não executável.

## Linha 9 — `scope.MangaTranslatorRouter.registerAction({`

**O que faz:** registra este handler no registry central.

**Como faz:** passa um descriptor contendo nome, metadata e `execute`.

**Por que assim:** centralizar dispatch/autorização no router é melhor que adicionar mais um `if (request.action...)` ao listener global de `background.js`.

**Evidência:** ✅ provada pelos testes diretos e de roteamento; sem registro a mensagem testada não seria respondida.

## Linha 10 — `name: 'check-extraction-tab',`

**O que faz:** define o identificador canônico da action.

**Como faz:** o `ACTION_MAP` converte `CHECK_IF_EXTRACTION_TAB` nesse nome.

**Por que assim:** separa protocolo legado em SCREAMING_CASE do nome modular estável em kebab-case.

**Evidência:** ✅ `routed-actions-legacy.test.js` espiona exatamente `check-extraction-tab`.

## Linha 11 — `meta: { allowedSources: ['any'] },`

**O que faz:** permite que qualquer categoria reconhecida pelo router consulte o mapping.

**Como faz:** metadata `allowedSources` contém `any`.

**Por que assim:** a pergunta de identidade não executa mutação privilegiada e precisa funcionar em uma página auxiliar cuja classificação de origem pode variar com a URL.

**Evidência:** 🟨 a action é chamada com sender de content/extraction tab.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO que valide a metadata `['any']` ou compare comportamento com outras origens.**

## Linha 12 — `async execute(_request, context) {`

**O que faz:** define o corpo assíncrono da action.

**Como faz:** recebe request (não usado) e context fornecido pelo router.

**Por que assim:** `ensureInitialized()` é assíncrono; tornar o handler async preserva causalidade clara.

**Evidência:** ✅ o teste direto aguarda o dispatch e recebe a resposta correta.

## Linha 13 — `await context.ensureInitialized();`

**O que faz:** garante que o estado foi restaurado/reconciliado antes da leitura.

**Como faz:** espera a Promise da barreira de inicialização.

**Por que assim:** sem esse await, um Service Worker recém-acordado poderia olhar um `extractionTabs` ainda vazio e retornar falso negativo, fazendo a aba auxiliar perder sua identidade de job.

**Evidência:** 🟨 o teste direto injeta `ensureInitialized: jest.fn().mockResolvedValue()`, provando que o contrato é chamado no caminho normal.

**⚠️ LACUNA:** o teste direto não afirma `toHaveBeenCalled()` nem cria uma inicialização atrasada para provar a **ordem** entre await e leitura do estado.

## Linha 14 — `const tabId = context.sender && context.sender.tab ? context.sender.tab.id : -1;`

**O que faz:** extrai o tabId do remetente; usa `-1` quando a mensagem não veio de uma aba.

**Como faz:** guarda explícita para `sender` e `sender.tab`.

**Por que assim:** lookup deve ser baseado na aba **que enviou** a mensagem, não em um tabId fornecido no payload, que poderia estar obsoleto ou ser forjado por outro contexto.

**Evidência:** ✅ testes enviam sender.tab.id e provam que é esse ID que seleciona o mapping.

**⚠️ LACUNA:** não há teste focal para sender sem `tab`, que deve cair em `-1` e retornar miss.

## Linha 15 — `const extractionTabs = context.state.extractionTabs || {};`

**O que faz:** obtém o mapa canônico ou usa objeto vazio como fallback seguro.

**Como faz:** usa `|| {}` para suportar estado antigo/incompleto.

**Por que assim:** durante migração ou testes mínimos, a propriedade pode estar ausente. Fazer `context.state.extractionTabs[tabId]` diretamente lançaria TypeError e transformaria “não registrado” em falha da action.

**Evidência:** 🟨 o caminho com mapa existente é testado.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para `extractionTabs` ausente/null.**

## Linha 16 — `const mapping = extractionTabs[tabId];`

**O que faz:** consulta exatamente o registro pertencente à aba remetente.

**Como faz:** indexação pelo tabId normalizado pelo JavaScript como chave de objeto.

**Por que assim:** evita varrer o mapa ou comparar URLs; lookup direto é O(1) e preserva identidade por instância de aba.

**Evidência:** ✅ hit e miss são testados com IDs distintos no fluxo real.

## Linha 17 — linha vazia

Separa lookup da decisão.

**Evidência:** ℹ️ não executável.

## Linha 18 — `if (mapping) {`

**O que faz:** distingue aba registrada de aba comum.

**Como faz:** considera truthy qualquer objeto de mapping persistido.

**Por que assim:** um mapping válido é objeto; não é necessário exigir campos novamente aqui porque o produtor do mapping é responsável pela estrutura. Duplicar validação poderia criar duas definições divergentes do formato.

**Evidência:** ✅ hit e miss são explicitamente testados.

## Linha 19 — `return { isExtractionTab: true, ...mapping };`

**O que faz:** confirma a identidade e devolve todos os metadados registrados.

**Como faz:** põe `isExtractionTab: true` antes do spread.

**Por que assim:** consumidores recebem tanto o discriminador quanto a identidade completa do job sem manter uma lista duplicada de campos nesta action.

**Observação importante:** como `...mapping` vem depois, um mapping contendo `isExtractionTab: false` poderia sobrescrever o `true`.

**Evidência:** ✅ testes provam o retorno correto para mappings atuais sem esse campo.

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para um mapping malformado contendo `isExtractionTab`.** Se quiser tornar o discriminador inviolável, a ordem poderia ser `{ ...mapping, isExtractionTab: true }`, acompanhada de teste.

## Linha 20 — `}`

Fecha o caminho hit.

**Evidência:** ✅ exercitado.

## Linha 21 — linha vazia

Separa caminho hit do miss.

**Evidência:** ℹ️ não executável.

## Linha 22 — `return { isExtractionTab: false };`

**O que faz:** informa que a aba remetente não existe no índice.

**Como faz:** retorna somente o discriminador negativo, sem IDs inventados.

**Por que assim:** ausência deve ser inequívoca. Devolver campos nulos poderia levar consumidores a tratar “mapping existente com valores vazios” e “sem mapping” como equivalentes.

**Evidência:** ✅ **PROVADO DIRETAMENTE** em `plan-missing-handlers-real.test.js`, que consulta tabId 987654 e exige exatamente esse objeto.

## Linha 23 — `},`

Fecha o `execute` e mantém o descriptor válido.

**Evidência:** ✅ necessário para o registro carregado pelos testes.

## Linha 24 — `});`

Finaliza `registerAction`.

**Evidência:** ✅ registro real provado.

## Linha 25 — `})(typeof self !== 'undefined' ? self : globalThis);`

**O que faz:** executa a IIFE escolhendo `self` no Service Worker e `globalThis` no ambiente de teste.

**Como faz:** operador ternário no argumento da IIFE.

**Por que assim:** mantém um único arquivo compatível com browser e Node/Jest sem wrapper duplicado.

**Evidência:** ✅ os testes Jest atribuem `global.self = global` e carregam o arquivo real com sucesso.

---

## 6. Cobertura funcional

| Comportamento | Evidência | Estado |
|---|---|---|
| registro como `check-extraction-tab` | routed-actions + action test | ✅ provado |
| alias `CHECK_IF_EXTRACTION_TAB` | router + routed-actions | ✅ provado |
| hit retorna mapping | action test + background real | ✅ provado |
| miss retorna false | background real | ✅ provado |
| mapping criado por fluxo `GEMINI_RESULT_URL` é reconhecido | plan-missing-handlers-real | ✅ provado |
| resposta legada sem `ok` no background | routed-actions-legacy | ✅ provado |
| await ocorre antes da leitura | implementação visível, sem teste de ordem | ⚠️ parcial |
| sender sem tab | sem teste focal | ⚠️ sem prova específica |
| estado sem `extractionTabs` | sem teste focal | ⚠️ sem prova específica |
| router ausente lança | sem teste focal | ⚠️ sem prova específica |
| mapping malformado com `isExtractionTab` próprio | sem teste | ⚠️ sem prova específica |

---

## 7. Invariantes

1. O tabId usado deve vir de `context.sender.tab.id`, nunca do request.
2. A action deve esperar `ensureInitialized()` antes do lookup.
3. A consulta não deve mutar `extractionTabs`.
4. Miss deve continuar sendo resposta limpa e não erro.
5. Hit deve preservar identidade completa registrada pelo produtor.
6. Qualquer endurecimento do formato do mapping precisa ser coordenado com `deliver-result-url`/criadores de extraction tabs.
7. A compatibilidade da resposta legada no `background.js` precisa continuar enquanto o consumidor ainda espera payload sem wrapper.

---

## 8. Resultado

- Fonte integral reproduzida: **SIM**.
- Todas as linhas comentadas especificamente: **SIM**.
- Teste direto real da action identificado: **SIM**.
- Hit e miss provados: **SIM**.
- Integração com produtor real do mapping provada: **SIM**.
- Lacunas mantidas explicitamente: **SIM**.
- Arquivo apto a `CONCLUÍDO`: **SIM**.

**Próximo arquivo somente após atualização do STATUS/CHECKLIST:** `extension/background/actions/claim-gemini-job.js`.

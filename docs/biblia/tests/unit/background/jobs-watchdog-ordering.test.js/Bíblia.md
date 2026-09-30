# Bíblia técnica — tests/unit/background/jobs-watchdog-ordering.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 22  
> **SHA auditado:** 2102182a1e313a02cdb511846a4561c3a0f607eb  
> **Agente:** AGENTE 22  
> **Índice:** 153  
> **Tipo:** teste unitário de ordenação assíncrona do watchdog real  
> **Linhas textuais:** **86**  
> **Posições documentais:** **87**, contando newline final  
> **PR/branch:** #66 / `docs/project-bible`

## 1. Objetivo

A suíte protege uma propriedade temporal específica de `extension/background/jobs-watchdog.js`: em timeout, o sistema deve **aguardar a finalização lógica do job antes de fechar extraction tabs auxiliares associadas à aba Gemini**.

Isso evita uma corrida em que a tab auxiliar desaparece enquanto `finalizeJob` ainda precisa reconciliar estado/resultado.

O teste carrega o módulo real com `jest.isolateModules`; não existe implementação espelho do watchdog.

## 2. Implementação real auditada

`jobs-watchdog.js` (c17b766d7fbc34ea925fb82b19149d3d977de413) expõe `createWatchdog` com três operações: `arm`, `clear` e `handleAlarm`.

No ramo de timeout, `handleAlarm`:

1. valida prefixo `watchdog_`;
2. encontra o job indexado;
3. busca `wd_data_*`;
4. resolve tabId canônico;
5. envia erro integrado ao manga tab, quando existe;
6. executa **`await finalizeJob(tabId, mangaTabId, true)`**;
7. somente depois lê `getExtractionTabs()`;
8. filtra tabs cujo `geminiTabId` corresponde ao tab canônico;
9. chama `chrome.tabs.remove`;
10. apaga essas chaves do mapa.

A ordem 6→7 é exatamente a invariável testada.

## 3. Técnica do gate controlado

O teste cria:

`finalizationGate = new Promise(resolve => releaseFinalization = resolve)`

e faz `finalizeJob = jest.fn(() => finalizationGate)`.

Assim, a execução real chega ao `await finalizeJob` e fica bloqueada em ponto determinístico. Antes de liberar o gate, as assertions exigem:

- `finalizeJob(321,77,true)` chamado;
- `tabs.remove` não chamado;
- extraction tab 900 ainda presente.

Depois de `releaseFinalization()`, novas microtasks permitem o cleanup e as assertions exigem:

- tab 900 removida;
- tab 901 não removida;
- chave 900 removida de `extractionTabs`;
- chave 901 preservada.

Essa técnica prova **ordem causal**, não apenas resultado final.

## 4. Isolamento por ownership

A fixture contém:

- extraction tab 900 → `geminiTabId:321`;
- extraction tab 901 → `geminiTabId:999`.

O watchdog do job usa Gemini 321. O filtro real compara os ids como string, portanto só 900 é selecionada.

**Classificação:** ✅ **PROVADO DIRETAMENTE** que o cleanup do timeout não fecha extraction tab pertencente a outro Gemini nessa fixture.

## 5. Relação com outras suítes

`tests/unit/background/lifecycle-alarms-real.test.js` (1d4c22ba9a78ef994906c4dd16617ddb6079942b) exerce timeouts/watchdog no background integrado, inclusive com e sem wd_data, encaminhamento de erro e ausência de cleanup para alarme sem job.

`tests/unit/background/refresh-job-watchdog-action.test.js` (d2acd697b78872400a16bfdac3a4866446d2239f) testa a action que rearma watchdog e ownership.

Essas suítes complementam comportamento funcional amplo. O #153 é mais estreito e mais forte na propriedade **“não remover antes de finalizeJob resolver”**.

## 6. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| módulo real é carregado | `require(WATCHDOG_PATH)` isolado | ✅ PROVADO DIRETAMENTE |
| alarme `watchdog_job-1` é reconhecido | linha 65 | ✅ PROVADO DIRETAMENTE |
| timeout chama `finalizeJob(321,77,true)` | linha 69 | ✅ PROVADO DIRETAMENTE |
| nenhuma tab fecha antes da resolução | linha 70 com gate pendente | ✅ PROVADO DIRETAMENTE |
| extraction tab alvo permanece durante finalização | linha 71 | ✅ PROVADO DIRETAMENTE |
| tab 900 fecha depois da finalização | linha 78 | ✅ PROVADO DIRETAMENTE |
| tab 901 de outro Gemini não fecha | linha 79 | ✅ PROVADO DIRETAMENTE |
| mapa remove apenas 900 | linhas 80–81 | ✅ PROVADO DIRETAMENTE |
| wiring no projeto Jest background | `jest.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI configurada para rodar inventário Jest | package/workflow | 🟨 EXECUTADO INDIRETAMENTE; nenhuma run nova é alegada |
| comportamento se `finalizeJob` rejeita | não há catch/finally no callback nem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 7. Limites e riscos

- `handleAlarm` retorna `true` imediatamente; o trabalho real ocorre no callback assíncrono de `chrome.storage.local.get`.
- O teste usa microtasks explícitas para observar etapas; não recebe uma Promise de conclusão de `handleAlarm`.
- A implementação aguarda `finalizeJob`, mas não envolve esse await em `try/catch/finally`.
- Se `finalizeJob` rejeitar, o cleanup posterior não é alcançado e a rejeição do callback async não é tratada dentro de `handleAlarm`.
- O comportamento desejado nessa falha não está declarado pela suíte: manter a tab pode ser desejável para recuperação, mas uma rejeição não observada também pode ser indesejada.
- A suíte não testa alias/re-resolução de tabId; outras suítes cobrem identidade e lifecycle.
- Nenhum código externo foi alterado para produzir evidência.

## 8. Solicitação ao auditor

### 153-001 — TEST_REQUIRED — OPEN — severidade NORMAL

**Encontrado:** o ramo de timeout faz `await finalizeJob(...)` antes do cleanup, porém não há tratamento local de rejeição e não foi localizado teste focal para `finalizeJob` rejeitando.

**Arquivo externo envolvido:** `extension/background/jobs-watchdog.js`.

**Evidência atual:** #153 prova com sucesso que uma Promise pendente bloqueia cleanup e que uma Promise resolvida libera cleanup.

**Evidência ausente:** comportamento esperado quando a Promise rejeita: log, retenção/remoção da extraction tab, limpeza de wd_data e ausência/presença de unhandled rejection.

**Necessário:** definir a política de falha e adicionar teste com `finalizeJob = jest.fn().mockRejectedValue(...)`. Se a política exigir cleanup ou captura/log, ajustar a implementação em processo autorizado separado.

**Risco:** timeout pode deixar tabs auxiliares/estado residual e produzir rejeição assíncrona não observada quando a finalização falha.

## 9. Wiring

`jest.config.js` (f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc) inclui `tests/unit/background/**/*.test.js` no projeto background; `package.json` expõe `test:unit:background` e `test:ci`; o workflow executa o inventário Jest.

Isso é wiring verificável, não uma afirmação de execução nova.

## 10. SHAs observados

- `tests/unit/background/jobs-watchdog-ordering.test.js` — `2102182a1e313a02cdb511846a4561c3a0f607eb`
- `extension/background/jobs-watchdog.js` — `c17b766d7fbc34ea925fb82b19149d3d977de413`
- `tests/unit/background/lifecycle-alarms-real.test.js` — `1d4c22ba9a78ef994906c4dd16617ddb6079942b`
- `tests/unit/background/refresh-job-watchdog-action.test.js` — `d2acd697b78872400a16bfdac3a4866446d2239f`
- `jest.config.js` — `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`
- `package.json` — `33e0b91d1a6f1790124b700d2ce331f80d2b7095`
- `.github/workflows/ci.yml` — `ebee75820db9bfab618bf3c3016065c5bc857ed7`

## 11. Mapeamento linha a linha

| Pos. | Unidade | Fonte | Função auditada |
|---:|:---:|---|---|
| 001 | U01 | `'use strict';` | Ativa strict mode. |
| 002 | U01 | ␠ [linha vazia] | Separador visual entre blocos. |
| 003 | U01 | `const path = require('path');` | Importa `path` para localizar o módulo real. |
| 004 | U01 | ␠ [linha vazia] | Separador visual entre blocos. |
| 005 | U01 | `const WATCHDOG_PATH = path.resolve(` | Resolve caminho absoluto de `extension/background/jobs-watchdog.js`. |
| 006 | U01 | `  __dirname,` | Resolve caminho absoluto de `extension/background/jobs-watchdog.js`. |
| 007 | U01 | `  '../../../extension/background/jobs-watchdog.js'` | Resolve caminho absoluto de `extension/background/jobs-watchdog.js`. |
| 008 | U01 | `);` | Resolve caminho absoluto de `extension/background/jobs-watchdog.js`. |
| 009 | U02 | ␠ [linha vazia] | Separador visual entre blocos. |
| 010 | U02 | `function loadWatchdog() {` | Abre loader isolado do watchdog real. |
| 011 | U02 | `  global.self = global;` | Faz `self` apontar para global para o IIFE publicar a API como no service worker. |
| 012 | U02 | `  delete global.MangaTranslatorJobsWatchdog;` | Remove API residual de caso anterior. |
| 013 | U02 | `  jest.isolateModules(() => require(WATCHDOG_PATH));` | Carrega o módulo real dentro de `jest.isolateModules`. |
| 014 | U02 | `  return global.MangaTranslatorJobsWatchdog;` | Retorna `MangaTranslatorJobsWatchdog` publicado pelo módulo. |
| 015 | U02 | `}` | Fecha loader. |
| 016 | U03 | ␠ [linha vazia] | Separador visual entre blocos. |
| 017 | U03 | `describe('background/jobs-watchdog ordering', () => {` | Abre suíte de ordenação do watchdog. |
| 018 | U03 | `  afterEach(() => {` | Abre cleanup por caso. |
| 019 | U03 | `    delete global.MangaTranslatorJobsWatchdog;` | Remove globals/mocks para impedir contaminação entre testes. |
| 020 | U03 | `    delete global.chrome;` | Remove globals/mocks para impedir contaminação entre testes. |
| 021 | U03 | `    jest.restoreAllMocks();` | Remove globals/mocks para impedir contaminação entre testes. |
| 022 | U03 | `  });` | Fecha cleanup. |
| 023 | U04 | ␠ [linha vazia] | Separador visual entre blocos. |
| 024 | U04 | `  test('WATCHDOG-ORDER-01: aguarda finalizeJob antes de fechar abas auxiliares', async () => {` | Abre WATCHDOG-ORDER-01, foco da suíte. |
| 025 | U04 | `    let releaseFinalization;` | Declara função que liberará manualmente a finalização. |
| 026 | U04 | `    const finalizationGate = new Promise(resolve => { releaseFinalization = resolve; });` | Cria Promise-gate pendente para controlar quando `finalizeJob` termina. |
| 027 | U04 | `    const finalizeJob = jest.fn(() => finalizationGate);` | Mocka `finalizeJob` para retornar exatamente o gate pendente. |
| 028 | U04 | `    const remove = jest.fn((_tabId, callback) => callback?.());` | Mocka `chrome.tabs.remove` com callback imediato. |
| 029 | U04 | `    const extractionTabs = {` | Abre mapa de extraction tabs. |
| 030 | U04 | `      900: { geminiTabId: 321 },` | Tab auxiliar 900 pertence ao Gemini 321 do watchdog. |
| 031 | U04 | `      901: { geminiTabId: 999 },` | Tab 901 pertence a outro Gemini (999) e deve sobreviver. |
| 032 | U04 | `    };` | Fecha fixture de extraction tabs. |
| 033 | U04 | ␠ [linha vazia] | Separador visual entre blocos. |
| 034 | U04 | `    global.chrome = {` | Instala global `chrome` mínimo exigido pelo módulo. |
| 035 | U04 | `      runtime: { lastError: null },` | Define runtime.lastError nulo. |
| 036 | U04 | `      storage: {` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 037 | U04 | `        local: {` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 038 | U04 | `          get: jest.fn((_keys, callback) => callback({` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 039 | U04 | `            wd_data_321: {` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 040 | U04 | `              mangaTabId: 77,` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 041 | U04 | `              index: 4,` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 042 | U04 | `              geminiTabId: 321,` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 043 | U04 | `              jobId: 'job-1',` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 044 | U04 | `            },` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 045 | U04 | `          })),` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 046 | U04 | `          remove: jest.fn(),` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 047 | U04 | `        },` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 048 | U04 | `      },` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 049 | U04 | `      tabs: {` | Mocka storage local: `get` devolve wd_data_321 com mangaTabId 77, index 4, Gemini 321 e job-1; `remove` é spy. |
| 050 | U05 | `        sendMessage: jest.fn((_tabId, _message, callback) => callback?.()),` | Mocka tabs.sendMessage e tabs.remove. |
| 051 | U05 | `        remove,` | Mocka tabs.sendMessage e tabs.remove. |
| 052 | U05 | `      },` | Mocka tabs.sendMessage e tabs.remove. |
| 053 | U05 | `    };` | Mocka tabs.sendMessage e tabs.remove. |
| 054 | U05 | ␠ [linha vazia] | Fecha chrome mock. |
| 055 | U05 | `    const watchdog = loadWatchdog().createWatchdog({` | Linha estrutural/fixture pertencente à unidade, explicada pelas operações e assertions adjacentes. |
| 056 | U05 | `      getJobIndex: () => [{` | Instancia `createWatchdog` real. |
| 057 | U05 | `        mangaTabId: 77,` | Injeta jobIndex realista, mapa de extraction tabs, finalizeJob controlado, logger e timeout de 5 min. |
| 058 | U05 | `        index: 4,` | Injeta jobIndex realista, mapa de extraction tabs, finalizeJob controlado, logger e timeout de 5 min. |
| 059 | U05 | `        geminiTabId: 321,` | Injeta jobIndex realista, mapa de extraction tabs, finalizeJob controlado, logger e timeout de 5 min. |
| 060 | U05 | `        jobId: 'job-1',` | Injeta jobIndex realista, mapa de extraction tabs, finalizeJob controlado, logger e timeout de 5 min. |
| 061 | U05 | `      }],` | Injeta jobIndex realista, mapa de extraction tabs, finalizeJob controlado, logger e timeout de 5 min. |
| 062 | U05 | `      getExtractionTabs: () => extractionTabs,` | Injeta jobIndex realista, mapa de extraction tabs, finalizeJob controlado, logger e timeout de 5 min. |
| 063 | U05 | `      finalizeJob,` | Fecha criação do watchdog. |
| 064 | U05 | `      log: jest.fn(),` | Linha estrutural/fixture pertencente à unidade, explicada pelas operações e assertions adjacentes. |
| 065 | U05 | `      timeoutMinutes: 5,` | Assertion direta: alarme com prefixo watchdog é aceito (`handleAlarm` retorna true). |
| 066 | U05 | `    });` | Libera microtasks suficientes para o callback de storage alcançar e aguardar `finalizeJob`. |
| 067 | U06 | ␠ [linha vazia] | Libera microtasks suficientes para o callback de storage alcançar e aguardar `finalizeJob`. |
| 068 | U06 | `    expect(watchdog.handleAlarm({ name: 'watchdog_job-1' })).toBe(true);` | Linha estrutural/fixture pertencente à unidade, explicada pelas operações e assertions adjacentes. |
| 069 | U06 | `    await Promise.resolve();` | Assertion direta: `finalizeJob(321,77,true)` foi chamado. |
| 070 | U06 | `    await Promise.resolve();` | Assertion crítica de ordenação: nenhuma tab foi removida enquanto a finalização está pendente. |
| 071 | U06 | ␠ [linha vazia] | Assertion: extraction tab 900 continua presente durante a finalização. |
| 072 | U06 | `    expect(finalizeJob).toHaveBeenCalledWith(321, 77, true);` | Linha estrutural/fixture pertencente à unidade, explicada pelas operações e assertions adjacentes. |
| 073 | U06 | `    expect(remove).not.toHaveBeenCalled();` | Resolve manualmente o gate de finalização. |
| 074 | U06 | `    expect(extractionTabs[900]).toBeDefined();` | Espera a própria Promise de finalização. |
| 075 | U06 | ␠ [linha vazia] | Libera microtasks para executar o cleanup posterior ao await. |
| 076 | U06 | `    releaseFinalization();` | Libera microtasks para executar o cleanup posterior ao await. |
| 077 | U06 | `    await finalizationGate;` | Linha estrutural/fixture pertencente à unidade, explicada pelas operações e assertions adjacentes. |
| 078 | U06 | `    await Promise.resolve();` | Assertion: somente depois da finalização, tab 900 é removida. |
| 079 | U06 | `    await Promise.resolve();` | Assertion negativa: tab 901 (outro Gemini) não é removida. |
| 080 | U06 | ␠ [linha vazia] | Assertion: chave 900 é apagada do mapa de extraction tabs. |
| 081 | U06 | `    expect(remove).toHaveBeenCalledWith(900, expect.any(Function));` | Assertion: chave 901 permanece no mapa. |
| 082 | U06 | `    expect(remove).not.toHaveBeenCalledWith(901, expect.any(Function));` | Fecha o teste. |
| 083 | U06 | `    expect(extractionTabs[900]).toBeUndefined();` | Fecha a suíte. |
| 084 | U06 | `    expect(extractionTabs[901]).toBeDefined();` | Linha estrutural final. |
| 085 | U06 | `  });` | Linha estrutural final. |
| 086 | U07 | `});` | Linha estrutural final. |
| 087 | U08 | ␠ [linha vazia] | Newline terminal do arquivo; posição final auditada. |

## 12. Auditoria final

- [x] reserva exclusiva confirmada para AGENTE 22;
- [x] state #153 confirmado para o SHA auditado;
- [x] 86 linhas textuais + newline = 87/87 posições;
- [x] módulo real e testes adjacentes auditados em leitura;
- [x] ordem causal provada com Promise-gate;
- [x] lacuna de rejeição registrada;
- [x] nenhuma fonte/teste externo alterado.

**Conclusão:** documentação completa do #153; a propriedade central de ordering está diretamente provada no código real.

---

## 13. Continuidade do plano — takeover pelo AGENTE 15

### 13.1 Reabertura

O usuário autorizou explicitamente o **AGENTE 15** a desfazer a reserva residual do AGENTE 22, assumir o #153 e continuar o plano associado à solicitação `153-001`.

A conclusão documental histórica acima é preservada como registro do trabalho original. Esta reabertura não converte automaticamente a lacuna em prova e não altera o objeto auditado.

### 13.2 Revalidação da solicitação 153-001

Estado observado após o takeover:

- `tests/unit/background/jobs-watchdog-ordering.test.js` permanece no SHA `2102182a1e313a02cdb511846a4561c3a0f607eb`;
- `extension/background/jobs-watchdog.js` permanece no SHA `c17b766d7fbc34ea925fb82b19149d3d977de413`;
- o teste #153 prova diretamente a ordenação no caminho de sucesso: enquanto `finalizeJob` está pendente, nenhuma extraction tab é removida; depois da resolução, somente a tab pertencente ao Gemini correspondente é removida;
- não foi localizada assertion focal para o caso em que `finalizeJob` rejeita;
- busca independente por `mockRejectedValue finalizeJob` não encontrou cenário equivalente em outra suíte.

### 13.3 Causalidade do caminho de rejeição

No `handleAlarm` real, o fluxo relevante é:

1. resolve dados persistidos/indexados do watchdog;
2. resolve o tab canônico e emite telemetria `JOB_TIMEOUT`;
3. opcionalmente envia `SHOW_ERROR_INTEGRATED` ao manga tab;
4. executa `await finalizeJob(tabId, watchdog.mangaTabId, true)`;
5. **somente depois do await** obtém `getExtractionTabs()` e remove as tabs auxiliares relacionadas.

Não existe `try/catch/finally` envolvendo o passo 4 e o cleanup do passo 5.

Consequência estrutural comprovável pela fonte: se a Promise de `finalizeJob` rejeitar, a continuação que remove as extraction tabs não é alcançada pelo fluxo normal daquele callback assíncrono.

Isso **não** é promovido a teste automatizado do caso de rejeição; a classificação permanece:

**⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO** para `finalizeJob` rejeitando.

### 13.4 Plano de correção solicitado ao auditor

A solicitação `153-001` permanece **ACCEPTED**. O próximo tratamento funcional/testável deve ocorrer em mudança separada da produção desta Bíblia.

Plano mínimo recomendado:

1. definir explicitamente a política quando `finalizeJob` rejeita;
2. decidir se o cleanup das extraction tabs deve ser garantido por `finally` (ou mecanismo equivalente);
3. decidir a telemetria de falha: nível, código e payload mínimos;
4. adicionar cenário focal usando a implementação real do watchdog com `finalizeJob = jest.fn().mockRejectedValue(...)`;
5. verificar deterministicamente:
   - `handleAlarm` reconhece o alarme;
   - `finalizeJob` recebe `(geminiTabId, mangaTabId, true)`;
   - comportamento decidido para `tabs.remove`;
   - comportamento decidido para o mapa `extractionTabs`;
   - logging/telemetria da rejeição, se exigido;
   - ausência de `unhandled rejection`, se esse for o contrato definido;
6. manter assertion negativa de que tabs pertencentes a outro Gemini não são removidas;
7. depois da implementação e do teste externos, reauditar esta Bíblia e somente então considerar `153-001` como `RESOLVED`.

### 13.5 Estado desta reabertura

- ownership atual: **AGENTE 15**;
- estado do arquivo: **IN_PROGRESS**;
- `153-001`: **ACCEPTED**, ainda não resolvida;
- nenhuma alteração foi feita em `jobs-watchdog.js`, no teste #153 ou em qualquer outro objeto externo para fabricar evidência;
- próxima etapa depende do processo separado de correção/auditoria funcional descrito em `153-001`.


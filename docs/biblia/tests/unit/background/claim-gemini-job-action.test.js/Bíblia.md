# Bíblia técnica — tests/unit/background/claim-gemini-job-action.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 22  
> **SHA auditado:** 0cb6cb2f100d7493abfdf4038546e8be747289f1  
> **Agente responsável:** AGENTE 22  
> **Índice do corpus:** 135  
> **Tipo:** teste unitário de background com implementação real / contrato de claim e identidade de abas Gemini  
> **Linhas textuais:** **201**  
> **Posições documentais:** **202**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible  
> **Escopo de escrita respeitado:** somente esta Bíblia, a reserva e o state #135; código, testes, mocks, workflows e configs permaneceram somente leitura.

## 1. Papel arquitetural

Esta suíte protege o ponto em que uma aba Gemini reivindica o job que deve executar. Diferentemente de testes baseados em cópias locais, o arquivo carrega **os módulos reais** de produção:

- `extension/background/router.js`;
- `extension/background/state.js`;
- `extension/background/actions/claim-gemini-job.js`;
- `extension/background/tab-identity.js`.

O teste reconstrói esse conjunto com `jest.isolateModules()`, deixa a action real se registrar no router real e dispara `CLAIM_GEMINI_JOB` pela mesma interface de listener usada por `chrome.runtime.onMessage`. O storage é simulado, mas a lógica de roteamento, source guard, sanitização, lookup, resolução de alias e migração é a implementação real.

A suíte cobre quatro fronteiras críticas:

1. **minimização do payload:** campos não aprovados não saem do background;
2. **binding por jobId:** um jobId divergente não pode reivindicar o job persistido da tab;
3. **source authorization:** uma origem não-Gemini é recusada antes da action;
4. **replacement tabs:** alias 100→200 permite migrar ownership e storage/state de forma verificável.

## 2. Dependências e trust boundaries

### 2.1 Dependências diretas

- Node `path` para localizar módulos;
- `tests/mocks/chrome-api.mock.js` para `chrome.storage.local` e runtime global;
- globals Jest (`jest`, `describe`, `test`, `expect`);
- módulos reais listados acima.

### 2.2 Fronteiras de confiança

A action real declara `allowedSources: ['gemini']`. O router identifica uma origem como Gemini quando a URL da tab contém `gemini.google.com` ou `127.0.0.1`. O teste comprova a negação de uma URL de conteúdo comum.

Dentro da action, a identidade confiável primária é o `sender.tab.id`, opcionalmente canonicalizado por `tabIdentity.resolveCanonicalTabId`. O `request.jobId` atua como filtro adicional; ele não substitui ownership físico/canônico.

O objeto persistido pode conter dados internos. `safeJob()` funciona como allowlist explícita: só `jobId`, `batchId`, `mangaTabId`, `index`, `prompt`, `executionMode`, `geminiTabId` e `windowId` são retornados.

## 3. Como o teste carrega a implementação real

`loadModules()` remove `global.MangaTranslatorRouter` e `global.MangaTranslatorState`, carrega router/state/action em um isolamento Jest e importa `tab-identity.js` em outro. Isso importa a action real, cuja avaliação executa `MangaTranslatorRouter.registerAction({ name:'claim-gemini-job', ... })`.

O helper `listener()` chama o `createMessageRouter` real. O `contextFactory` injeta state/log/tabIdentity, enquanto o próprio router adiciona `sender` e wrappers de `chrome.storage.local`.

`dispatch()` não reimplementa regras de claim: ele apenas adapta o contrato callback + booleano keepAlive para uma Promise de teste.

## 4. Fluxo real protegido

### 4.1 Roteamento

No router real:

`CLAIM_GEMINI_JOB`
→ `resolveActionName`
→ `claim-gemini-job`
→ `identifySource(sender)`
→ source guard
→ construção do context
→ execução async
→ `sendResponse({ok:true,...result})`.

### 4.2 Claim direto

A action:

1. lê `sender.tab.id`;
2. resolve a tab canônica;
3. lê `gemini_job_<canonicalTabId>`;
4. se existe job direto, rejeita jobId divergente;
5. caso contrário, retorna `safeJob`.

O primeiro teste verifica inclusive que `signedUrl` e `internalOnly` não aparecem.

### 4.3 Claim por alias

Se a chave direta não existe, mas há `expectedJobId` e `state.jobIndex`, a action busca a entrada indexada. Ela canonicaliza o tabId indexado e exige que seja o mesmo do sender. Quando a entrada ainda referencia o id antigo, chama `migrateTabIdentity(old,new,{jobId})`, relê a chave migrada e só retorna o job se o id persistido continuar coerente.

O TAB-06 testa o caminho real completo 100→200 e prova resposta, state, remoção da chave antiga e criação da chave nova.

## 5. Relação com tab-identity.js

O teste TAB-06 atravessa `migrateTabIdentity` real. Essa operação não é um simples rename:

- resolve aliases canônicos;
- cria/usa journal de migração;
- detecta conflito de jobs no destino;
- copia job/watchdog/recovery/finalized quando aplicável;
- migra referências do state;
- move alarmes relevantes;
- remove chaves antigas;
- conclui journal.

Esta suíte não afirma provar cada sub-branch desse módulo. Ela prova que, para a fixture válida 100→200, a integração usada pelo claim termina com ownership migrado observável.

## 6. Casos cobertos e força da evidência

| Comportamento | Assertion existente | Classificação |
|---|---|---|
| action real é registrada e alcançada pelo router real | require real + dispatch `CLAIM_GEMINI_JOB` | ✅ PROVADO DIRETAMENTE |
| claim async mantém canal aberto | linha 100 | ✅ PROVADO DIRETAMENTE |
| payload direto contém somente contrato permitido | linhas 101–115 | ✅ PROVADO DIRETAMENTE |
| `signedUrl` não vaza | linha 114 | ✅ PROVADO DIRETAMENTE |
| `internalOnly` não vaza | linha 115 | ✅ PROVADO DIRETAMENTE |
| jobId divergente na tab correta retorna `job:null` | linhas 118–130 | ✅ PROVADO DIRETAMENTE |
| tab Gemini sem job retorna `job:null` | linhas 132–140 | ✅ PROVADO DIRETAMENTE |
| origem não-Gemini é negada com `SOURCE_DENIED` | linhas 142–158 | ✅ PROVADO DIRETAMENTE |
| alias válido 100→200 permite claim | linhas 160–200 | ✅ PROVADO DIRETAMENTE |
| migração atualiza `state.jobIndex` | linha 196 | ✅ PROVADO DIRETAMENTE |
| migração remove chave antiga | linha 197 | ✅ PROVADO DIRETAMENTE |
| migração cria job sob chave nova | linhas 198–199 | ✅ PROVADO DIRETAMENTE |
| arquivo pertence ao projeto Jest background | `jest.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI está configurada para executar inventário Jest | `package.json#test:ci` + workflow | 🟨 EXECUTADO INDIRETAMENTE pelo pipeline configurado; nenhuma execução nova é reivindicada nesta auditoria |
| sender Gemini sem `tab.id` inteiro retorna claim nulo | ramo 30–33 da action sem assertion específica localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| job indexado com jobId correto mas ownership canônico de outra tab é rejeitado | ramo 76–82 da action sem assertion específica localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| falha/conflito durante migração vira `INTERNAL_ERROR` no router | combinação de branches existe, mas não é alvo desta suíte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO nesta suíte |

## 7. Wiring Jest/CI

`jest.config.js` (f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc) inclui `tests/unit/background/**/*.test.js` no projeto **background**, em ambiente Node, com `chrome-api.mock.js` como setup.

`package.json` (33e0b91d1a6f1790124b700d2ce331f80d2b7095) fornece `test:unit:background` e `test:ci`.

`.github/workflows/ci.yml` (ebee75820db9bfab618bf3c3016065c5bc857ed7) executa `npm run test:ci` no job Unit + Integration em Node 20.x/22.x e novamente em verificações amplas. Logo, a suíte está conectada ao inventário de testes do repositório.

Isso prova o **wiring estático**. Esta Bíblia não inventa uma execução local nem transforma configuração em um resultado de run.

## 8. Segurança e privacidade

A suíte possui um teste de minimização particularmente relevante: o job persistido contém `signedUrl: 'https://secret.invalid/token'` e `internalOnly: 'must-not-leak'`, mas a resposta esperada contém somente a allowlist de `safeJob`.

A proteção é melhor que uma blacklist: campos adicionais futuros no objeto persistido não passam automaticamente para a aba Gemini. Ainda assim, esta suíte verifica nominalmente dois campos proibidos; a propriedade estrutural decorre da implementação allowlist real.

O source guard é exercitado com `https://reader.example/chapter`, que o router classifica como `content`, produzindo `SOURCE_DENIED`.

## 9. Casos-limite e observações

1. `sender.tab.id` ausente/não inteiro cai em `{job:null}`, mas não há caso específico nesta suíte.
2. O ramo de **ownership mismatch** é importante: uma tab Gemini válida com um jobId existente, porém pertencente canonicamente a outra tab, deve receber `job:null`; não há assertion focal encontrada.
3. `request.jobId` vazio é tratado como ausência de expectedJobId.
4. Um job direto pode ser retornado sem jobId no request, desde que pertença à tab canônica do sender.
5. Alias expirado/cíclico/max hops pertence ao contrato de `tab-identity`; TAB-06 cobre somente alias válido simples.
6. Um conflito de rekey em `migrateTabIdentity` pode lançar; o router assíncrono converte exceção em `INTERNAL_ERROR`, mas este caso não é focalmente testado aqui.
7. O helper `dispatch` depende da action assíncrona eventualmente chamar `sendResponse`; se ela ficasse pendente, o próprio teste também ficaria pendente até timeout Jest.
8. O setup limpa storage explicitamente apesar de o mock compartilhado já ter reset por hook; é redundância defensiva, não erro funcional.
9. O teste verifica dois campos secretos concretos; por a implementação usar allowlist, campos desconhecidos também são excluídos por construção.
10. Nenhum objeto auditado foi alterado para criar evidência.

## 10. Solicitações ao auditor

### 135-001 — TEST_REQUIRED — OPEN — severidade HIGH

**Encontrado:** o branch de `claim-gemini-job.js` que rejeita ownership canônico divergente (linhas 76–82) não possui assertion específica localizada nas suítes que referenciam `CLAIM_GEMINI_JOB`.

**Contexto:** uma origem pode ser legitimamente Gemini e conhecer um `jobId`, mas ainda não deve reivindicar job pertencente a outra tab canônica.

**Evidência atual:** TAB-10 cobre jobId errado na tab correta; source guard cobre origem não-Gemini; TAB-06 cobre alias que converge corretamente. Nenhum deles prova a combinação “jobId correto + sender Gemini diferente + ownership canônico diferente”.

**Evidência ausente:** assertion de `{ok:true, job:null}` sem migração/mutação de ownership para esse cenário.

**Necessário:** adicionar caso usando a implementação real atual, com `jobIndex` apontando para tab A, sender Gemini tab B sem alias que os una, mesmo jobId, e verificar resposta nula e ausência de rekey.

**Risco:** regressão nessa guarda permitiria claim cruzado entre abas Gemini, associando trabalho/resultados à aba errada.

### 135-002 — TEST_REQUIRED — OPEN — severidade NORMAL

**Encontrado:** o guard de sender sem `tab.id` inteiro (linhas 30–33 da action) não possui assertion focal nesta suíte.

**Evidência atual:** todos os dispatches autorizados usam ids inteiros.

**Evidência ausente:** sender classificado como Gemini com URL válida, mas `tab.id` ausente/inválido, retornando claim nulo sem tocar no storage de jobs.

**Necessário:** adicionar teste direto pelo router/action reais para esse branch defensivo.

**Risco:** futuras alterações no parsing do sender podem transformar evento malformado em lookup incorreto ou exceção em vez de fail-closed.

## 11. SHAs observados

- `tests/unit/background/claim-gemini-job-action.test.js` — `0cb6cb2f100d7493abfdf4038546e8be747289f1`
- `extension/background/actions/claim-gemini-job.js` — `f5c4643d291931f133a791a2deaa6eb94ef4500d`
- `extension/background/router.js` — `d9278e9e58e4e9583a30c16227bfd833e7203d89`
- `extension/background/state.js` — `7570b545d5e92496201a7741dee8605cd66fb015`
- `extension/background/tab-identity.js` — `008c9a054ae417e0f31224617346e24fc9dbc1b4`
- `tests/mocks/chrome-api.mock.js` — `c1d9a056b7777183bfd3f540c49811335f410425`
- `jest.config.js` — `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`
- `package.json` — `33e0b91d1a6f1790124b700d2ce331f80d2b7095`
- `.github/workflows/ci.yml` — `ebee75820db9bfab618bf3c3016065c5bc857ed7`

## 12. Mapeamento linha a linha

| Pos. | Unidade | Fonte | Função auditada |
|---:|:---:|---|---|
| 001 | U01 | `'use strict';` | Ativa strict mode no próprio teste. |
| 002 | U01 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 003 | U01 | `const path = require('path');` | Importa `path` para resolver os módulos reais de background. |
| 004 | U01 | `const { getStorageMock } = require('../../mocks/chrome-api.mock.js');` | Importa `getStorageMock` do mock compartilhado configurado também pelo projeto Jest background. |
| 005 | U01 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 006 | U01 | `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');` | Resolve caminho absoluto de um módulo real usado pela suíte (`router`, action de claim, state ou tab-identity). |
| 007 | U01 | `const CLAIM_PATH = path.resolve(__dirname, '../../../extension/background/actions/claim-gemini-job.js');` | Resolve caminho absoluto de um módulo real usado pela suíte (`router`, action de claim, state ou tab-identity). |
| 008 | U01 | `const STATE_PATH = path.resolve(__dirname, '../../../extension/background/state.js');` | Resolve caminho absoluto de um módulo real usado pela suíte (`router`, action de claim, state ou tab-identity). |
| 009 | U01 | `const TAB_IDENTITY_PATH = path.resolve(__dirname, '../../../extension/background/tab-identity.js');` | Resolve caminho absoluto de um módulo real usado pela suíte (`router`, action de claim, state ou tab-identity). |
| 010 | U01 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 011 | U02 | `function loadModules() {` | Abre helper `loadModules`, responsável por recarregar o conjunto real de módulos em isolamento Jest. |
| 012 | U02 | `  delete global.MangaTranslatorRouter;` | Remove global previamente publicado para impedir reutilização acidental entre casos. |
| 013 | U02 | `  delete global.MangaTranslatorState;` | Remove global previamente publicado para impedir reutilização acidental entre casos. |
| 014 | U02 | `  jest.isolateModules(() => {` | Abre `jest.isolateModules` para registrar novamente router/state/action em cache isolado. |
| 015 | U02 | `    require(ROUTER_PATH);` | Carrega módulo de produção real; a action se registra no router real durante o require. |
| 016 | U02 | `    require(STATE_PATH);` | Carrega módulo de produção real; a action se registra no router real durante o require. |
| 017 | U02 | `    require(CLAIM_PATH);` | Carrega módulo de produção real; a action se registra no router real durante o require. |
| 018 | U02 | `  });` | Fecha primeiro isolamento de módulos. |
| 019 | U02 | `  let tabIdentityApi;` | Declara referência à API CommonJS de `tab-identity`. |
| 020 | U02 | `  jest.isolateModules(() => {` | Abre segundo isolamento para `tab-identity`. |
| 021 | U02 | `    tabIdentityApi = require(TAB_IDENTITY_PATH);` | Importa a implementação real de identidade de abas. |
| 022 | U02 | `  });` | Fecha o isolamento de tab-identity. |
| 023 | U02 | `  return {` | Retorna APIs reais carregadas: router global, state global e `createTabIdentity` real. |
| 024 | U02 | `    router: global.MangaTranslatorRouter,` | Retorna APIs reais carregadas: router global, state global e `createTabIdentity` real. |
| 025 | U02 | `    state: global.MangaTranslatorState,` | Retorna APIs reais carregadas: router global, state global e `createTabIdentity` real. |
| 026 | U02 | `    createTabIdentity: tabIdentityApi.createTabIdentity,` | Retorna APIs reais carregadas: router global, state global e `createTabIdentity` real. |
| 027 | U02 | `  };` | Retorna APIs reais carregadas: router global, state global e `createTabIdentity` real. |
| 028 | U02 | `}` | Fecha `loadModules`. |
| 029 | U03 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 030 | U03 | `function dispatch(listener, request, sender) {` | Abre helper `dispatch`, emulando o contrato callback/keepAlive de `chrome.runtime.onMessage`. |
| 031 | U03 | `  return new Promise(resolve => {` | Cria Promise para esperar a resposta entregue pelo listener assíncrono. |
| 032 | U03 | `    let keepAlive;` | Inicializa estado local de keepAlive e resposta entregue. |
| 033 | U03 | `    let delivered = false;` | Inicializa estado local de keepAlive e resposta entregue. |
| 034 | U03 | `    let deliveredResponse;` | Inicializa estado local de keepAlive e resposta entregue. |
| 035 | U03 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 036 | U03 | `    const sendResponse = response => {` | Define `sendResponse` de teste. |
| 037 | U03 | `      delivered = true;` | Marca resposta como entregue e preserva seu payload. |
| 038 | U03 | `      deliveredResponse = response;` | Marca resposta como entregue e preserva seu payload. |
| 039 | U03 | `      if (keepAlive !== undefined) resolve({ keepAlive, response });` | Resolve assim que keepAlive já é conhecido e a resposta chegou. |
| 040 | U03 | `    };` | Fecha callback de resposta. |
| 041 | U03 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 042 | U03 | `    keepAlive = listener(request, sender, sendResponse);` | Invoca o router real com request/sender e captura o booleano keepAlive. |
| 043 | U03 | `    if (delivered \|\| keepAlive === false) {` | Permite conclusão imediata se a resposta foi síncrona ou se o router não mantém canal aberto. |
| 044 | U03 | `      resolve({ keepAlive, response: delivered ? deliveredResponse : undefined });` | Resolve objeto `{keepAlive,response}` usado pelas assertions. |
| 045 | U03 | `    }` | Fecha branch, Promise e helper `dispatch`. |
| 046 | U03 | `  });` | Fecha branch, Promise e helper `dispatch`. |
| 047 | U03 | `}` | Fecha branch, Promise e helper `dispatch`. |
| 048 | U04 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 049 | U04 | `describe('CLAIM_GEMINI_JOB', () => {` | Abre suíte Jest da ação legada `CLAIM_GEMINI_JOB`. |
| 050 | U04 | `  let storage;` | Declara dependências mutáveis por caso: storage, router, state, identity e logger spy. |
| 051 | U04 | `  let router;` | Declara dependências mutáveis por caso: storage, router, state, identity e logger spy. |
| 052 | U04 | `  let state;` | Declara dependências mutáveis por caso: storage, router, state, identity e logger spy. |
| 053 | U04 | `  let identity;` | Declara dependências mutáveis por caso: storage, router, state, identity e logger spy. |
| 054 | U04 | `  let log;` | Declara dependências mutáveis por caso: storage, router, state, identity e logger spy. |
| 055 | U04 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 056 | U04 | `  beforeEach(async () => {` | Abre setup assíncrono por teste. |
| 057 | U04 | `    storage = getStorageMock();` | Obtém singleton de storage mockado. |
| 058 | U04 | `    await storage.clear();` | Limpa explicitamente o storage antes do caso. |
| 059 | U04 | `    ({ router, state, createTabIdentity: identity } = loadModules());` | Recarrega os módulos reais e extrai suas APIs. |
| 060 | U04 | `    state.patch({ jobIndex: [], extractionTabs: {}, activeJobsCount: 0 });` | Reseta campos relevantes do state real. |
| 061 | U04 | `    log = jest.fn();` | Cria spy de log para injeção. |
| 062 | U04 | `    identity = identity({ state, log });` | Instancia `createTabIdentity` real com state/log reais da suíte. |
| 063 | U04 | `  });` | Fecha setup do caso. |
| 064 | U04 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 065 | U04 | `  function listener() {` | Abre factory do listener real. |
| 066 | U04 | `    return router.createMessageRouter({` | Cria router real via `createMessageRouter`. |
| 067 | U04 | `      contextFactory: () => ({` | Substitui parte do contexto com factory controlada pelo teste. |
| 068 | U04 | `        state,` | Injeta state, log e tabIdentity reais; storage/sender continuam vindo de `createContext` do router. |
| 069 | U04 | `        log,` | Injeta state, log e tabIdentity reais; storage/sender continuam vindo de `createContext` do router. |
| 070 | U04 | `        tabIdentity: identity,` | Injeta state, log e tabIdentity reais; storage/sender continuam vindo de `createContext` do router. |
| 071 | U04 | `      }),` | Fecha contextFactory, router factory e helper. |
| 072 | U04 | `    });` | Fecha contextFactory, router factory e helper. |
| 073 | U04 | `  }` | Fecha contextFactory, router factory e helper. |
| 074 | U05 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 075 | U05 | `  test('claim direto retorna somente o contrato necessário', async () => {` | Abre caso de claim direto e minimização do payload retornado. |
| 076 | U05 | `    state.patch({` | Atualiza state real para indexar o job direto. |
| 077 | U05 | `      jobIndex: [{ geminiTabId: 200, jobId: 'job-ok', batchId: 'b', mangaTabId: 7, index: 3 }],` | Insere entrada correspondente em `jobIndex`. |
| 078 | U05 | `    });` | Fecha patch de state. |
| 079 | U05 | `    await storage.set({` | Persiste fixture `gemini_job_200` no storage mock. |
| 080 | U05 | `      gemini_job_200: {` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 081 | U05 | `        geminiTabId: 200,` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 082 | U05 | `        jobId: 'job-ok',` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 083 | U05 | `        batchId: 'b',` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 084 | U05 | `        mangaTabId: 7,` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 085 | U05 | `        index: 3,` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 086 | U05 | `        prompt: 'translate',` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 087 | U05 | `        executionMode: 'temp_chat',` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 088 | U05 | `        windowId: 8,` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 089 | U05 | `        signedUrl: 'https://secret.invalid/token',` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 090 | U05 | `        internalOnly: 'must-not-leak',` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 091 | U05 | `      },` | Define job persistido com campos públicos esperados e campos sensíveis/extras (`signedUrl`, `internalOnly`) que não podem vazar. |
| 092 | U05 | `    });` | Fecha persistência da fixture. |
| 093 | U05 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 094 | U05 | `    const result = await dispatch(` | Despacha pelo router real. |
| 095 | U05 | `      listener(),` | Cria listener com context real/controlado. |
| 096 | U05 | `      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-ok' },` | Envia action `CLAIM_GEMINI_JOB` com jobId esperado. |
| 097 | U05 | `      { tab: { id: 200, url: 'https://gemini.google.com/app?jobId=job-ok' } }` | Simula sender Gemini legítimo na tab física 200. |
| 098 | U05 | `    );` | Fecha dispatch. |
| 099 | U05 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 100 | U05 | `    expect(result.keepAlive).toBe(true);` | Assertion direta: ação assíncrona mantém canal aberto (`true`). |
| 101 | U05 | `    expect(result.response).toEqual({` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 102 | U05 | `      ok: true,` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 103 | U05 | `      job: {` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 104 | U05 | `        jobId: 'job-ok',` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 105 | U05 | `        batchId: 'b',` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 106 | U05 | `        mangaTabId: 7,` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 107 | U05 | `        index: 3,` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 108 | U05 | `        prompt: 'translate',` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 109 | U05 | `        executionMode: 'temp_chat',` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 110 | U05 | `        geminiTabId: 200,` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 111 | U05 | `        windowId: 8,` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 112 | U05 | `      },` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 113 | U05 | `    });` | Assertion direta do contrato sanitizado exato retornado por `safeJob` através do router/action reais. |
| 114 | U05 | `    expect(result.response.job).not.toHaveProperty('signedUrl');` | Assertion negativa direta: `signedUrl` não vaza. |
| 115 | U05 | `    expect(result.response.job).not.toHaveProperty('internalOnly');` | Assertion negativa direta: `internalOnly` não vaza. |
| 116 | U05 | `  });` | Fecha caso de claim direto. |
| 117 | U06 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 118 | U06 | `  test('TAB-10: jobId divergente rejeita claim mesmo na aba correta', async () => {` | Abre caso TAB-10 de jobId divergente na aba correta. |
| 119 | U06 | `    await storage.set({` | Cria job persistido cujo `jobId` real difere do request. |
| 120 | U06 | `      gemini_job_200: { geminiTabId: 200, jobId: 'job-real', mangaTabId: 7, index: 1 },` | Cria job persistido cujo `jobId` real difere do request. |
| 121 | U06 | `    });` | Cria job persistido cujo `jobId` real difere do request. |
| 122 | U06 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 123 | U06 | `    const result = await dispatch(` | Despacha pelo router/action reais. |
| 124 | U06 | `      listener(),` | Linha estrutural ou dado de fixture pertencente à unidade descrita; seu efeito está detalhado pelas linhas executáveis/assertions adjacentes. |
| 125 | U06 | `      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-wrong' },` | Solicita jobId incorreto. |
| 126 | U06 | `      { tab: { id: 200, url: 'https://gemini.google.com/app' } }` | Usa sender Gemini na tab que possui o job. |
| 127 | U06 | `    );` | Linha estrutural ou dado de fixture pertencente à unidade descrita; seu efeito está detalhado pelas linhas executáveis/assertions adjacentes. |
| 128 | U06 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 129 | U06 | `    expect(result.response).toEqual({ ok: true, job: null });` | Assertion direta: divergência resulta em `{ok:true, job:null}`. |
| 130 | U06 | `  });` | Fecha TAB-10. |
| 131 | U07 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 132 | U07 | `  test('TAB-11: aba Gemini manual sem job recebe claim nulo', async () => {` | Abre TAB-11: aba Gemini manual sem job. |
| 133 | U07 | `    const result = await dispatch(` | Despacha sem preparar job. |
| 134 | U07 | `      listener(),` | Linha estrutural ou dado de fixture pertencente à unidade descrita; seu efeito está detalhado pelas linhas executáveis/assertions adjacentes. |
| 135 | U07 | `      { action: 'CLAIM_GEMINI_JOB' },` | Request não informa jobId. |
| 136 | U07 | `      { tab: { id: 777, url: 'https://gemini.google.com/app' } }` | Sender continua sendo origem Gemini válida. |
| 137 | U07 | `    );` | Linha estrutural ou dado de fixture pertencente à unidade descrita; seu efeito está detalhado pelas linhas executáveis/assertions adjacentes. |
| 138 | U07 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 139 | U07 | `    expect(result.response).toEqual({ ok: true, job: null });` | Assertion direta: ausência de job retorna claim nulo. |
| 140 | U07 | `  });` | Fecha TAB-11. |
| 141 | U08 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 142 | U08 | `  test('origem não-Gemini não pode executar o claim', async () => {` | Abre teste do source guard do router. |
| 143 | U08 | `    await storage.set({` | Prepara job válido para garantir que a negação decorra da origem, não da ausência de dados. |
| 144 | U08 | `      gemini_job_200: { geminiTabId: 200, jobId: 'job-ok', mangaTabId: 7, index: 1 },` | Prepara job válido para garantir que a negação decorra da origem, não da ausência de dados. |
| 145 | U08 | `    });` | Prepara job válido para garantir que a negação decorra da origem, não da ausência de dados. |
| 146 | U08 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 147 | U08 | `    const result = await dispatch(` | Despacha request de claim real. |
| 148 | U08 | `      listener(),` | Linha estrutural ou dado de fixture pertencente à unidade descrita; seu efeito está detalhado pelas linhas executáveis/assertions adjacentes. |
| 149 | U08 | `      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-ok' },` | Request usa jobId válido. |
| 150 | U08 | `      { tab: { id: 200, url: 'https://reader.example/chapter' } }` | Sender usa URL não-Gemini, classificada como `content` pelo router. |
| 151 | U08 | `    );` | Linha estrutural ou dado de fixture pertencente à unidade descrita; seu efeito está detalhado pelas linhas executáveis/assertions adjacentes. |
| 152 | U08 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 153 | U08 | `    expect(result.keepAlive).toBe(false);` | Assertion direta: source guard encerra sincronamente com keepAlive false. |
| 154 | U08 | `    expect(result.response).toEqual({` | Assertion direta do erro estrutural `SOURCE_DENIED` retornado pelo router. |
| 155 | U08 | `      ok: false,` | Assertion direta do erro estrutural `SOURCE_DENIED` retornado pelo router. |
| 156 | U08 | `      error: { code: 'SOURCE_DENIED' },` | Assertion direta do erro estrutural `SOURCE_DENIED` retornado pelo router. |
| 157 | U08 | `    });` | Assertion direta do erro estrutural `SOURCE_DENIED` retornado pelo router. |
| 158 | U08 | `  });` | Fecha caso de origem proibida. |
| 159 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 160 | U09 | `  test('TAB-06: sender na aba substituta recupera job antigo pelo alias e migra ownership', async () => {` | Abre TAB-06: migração de ownership por alias old tab → replacement tab. |
| 161 | U09 | `    state.patch({` | Atualiza state real. |
| 162 | U09 | `      jobIndex: [{ geminiTabId: 100, jobId: 'job-alias', batchId: 'b', mangaTabId: 7, index: 4 }],` | Indexa job sob tab antiga 100. |
| 163 | U09 | `    });` | Fecha patch. |
| 164 | U09 | `    await storage.set({` | Prepara storage com job antigo e alias durável. |
| 165 | U09 | `      gemini_job_100: {` | Define `gemini_job_100` com ownership físico antigo. |
| 166 | U09 | `        geminiTabId: 100,` | Define `gemini_job_100` com ownership físico antigo. |
| 167 | U09 | `        jobId: 'job-alias',` | Define `gemini_job_100` com ownership físico antigo. |
| 168 | U09 | `        batchId: 'b',` | Define `gemini_job_100` com ownership físico antigo. |
| 169 | U09 | `        mangaTabId: 7,` | Define `gemini_job_100` com ownership físico antigo. |
| 170 | U09 | `        index: 4,` | Define `gemini_job_100` com ownership físico antigo. |
| 171 | U09 | `        prompt: 'translate',` | Define `gemini_job_100` com ownership físico antigo. |
| 172 | U09 | `        executionMode: 'temp_chat',` | Define `gemini_job_100` com ownership físico antigo. |
| 173 | U09 | `      },` | Define `gemini_job_100` com ownership físico antigo. |
| 174 | U09 | `      gemini_tab_alias_100: {` | Define alias `gemini_tab_alias_100` apontando 100→200, ainda não expirado. |
| 175 | U09 | `        oldTabId: 100,` | Define alias `gemini_tab_alias_100` apontando 100→200, ainda não expirado. |
| 176 | U09 | `        newTabId: 200,` | Define alias `gemini_tab_alias_100` apontando 100→200, ainda não expirado. |
| 177 | U09 | `        createdAt: Date.now(),` | Define alias `gemini_tab_alias_100` apontando 100→200, ainda não expirado. |
| 178 | U09 | `        expiresAt: Date.now() + 60_000,` | Define alias `gemini_tab_alias_100` apontando 100→200, ainda não expirado. |
| 179 | U09 | `      },` | Define alias `gemini_tab_alias_100` apontando 100→200, ainda não expirado. |
| 180 | U09 | `    });` | Fecha gravação da fixture. |
| 181 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 182 | U09 | `    const result = await dispatch(` | Despacha o claim pela aba substituta. |
| 183 | U09 | `      listener(),` | Linha estrutural ou dado de fixture pertencente à unidade descrita; seu efeito está detalhado pelas linhas executáveis/assertions adjacentes. |
| 184 | U09 | `      { action: 'CLAIM_GEMINI_JOB', jobId: 'job-alias' },` | Request pede o job indexado sob a tab antiga. |
| 185 | U09 | `      { tab: { id: 200, url: 'https://gemini.google.com/app?jobId=job-alias' } }` | Sender legítimo é a nova tab 200 e inclui jobId na URL. |
| 186 | U09 | `    );` | Linha estrutural ou dado de fixture pertencente à unidade descrita; seu efeito está detalhado pelas linhas executáveis/assertions adjacentes. |
| 187 | U09 | ␠ [linha vazia] | Separador visual entre blocos lógicos. |
| 188 | U09 | `    expect(result.response).toEqual({` | Abre assertion do payload após migração. |
| 189 | U09 | `      ok: true,` | Assertion direta: resposta é ok e job migrado anuncia `geminiTabId:200` mantendo identidade lógica/index. |
| 190 | U09 | `      job: expect.objectContaining({` | Assertion direta: resposta é ok e job migrado anuncia `geminiTabId:200` mantendo identidade lógica/index. |
| 191 | U09 | `        jobId: 'job-alias',` | Assertion direta: resposta é ok e job migrado anuncia `geminiTabId:200` mantendo identidade lógica/index. |
| 192 | U09 | `        geminiTabId: 200,` | Assertion direta: resposta é ok e job migrado anuncia `geminiTabId:200` mantendo identidade lógica/index. |
| 193 | U09 | `        index: 4,` | Assertion direta: resposta é ok e job migrado anuncia `geminiTabId:200` mantendo identidade lógica/index. |
| 194 | U09 | `      }),` | Assertion direta: resposta é ok e job migrado anuncia `geminiTabId:200` mantendo identidade lógica/index. |
| 195 | U09 | `    });` | Assertion direta: resposta é ok e job migrado anuncia `geminiTabId:200` mantendo identidade lógica/index. |
| 196 | U09 | `    expect(state.jobIndex).toEqual([expect.objectContaining({ geminiTabId: 200 })]);` | Assertion direta: `state.jobIndex` real foi migrado para tab 200. |
| 197 | U09 | `    expect((await storage.get('gemini_job_100')).gemini_job_100).toBeUndefined();` | Assertion direta: chave antiga `gemini_job_100` foi removida do storage. |
| 198 | U09 | `    expect((await storage.get('gemini_job_200')).gemini_job_200)` | Assertion direta: chave nova contém job migrado com tab 200 e jobId esperado. |
| 199 | U09 | `      .toEqual(expect.objectContaining({ geminiTabId: 200, jobId: 'job-alias' }));` | Assertion direta: chave nova contém job migrado com tab 200 e jobId esperado. |
| 200 | U09 | `  });` | Fecha TAB-06. |
| 201 | U10 | `});` | Fecha suíte Jest. |
| 202 | U11 | ␠ [linha vazia] | Newline terminal do arquivo; posição física final explicitamente auditada. |

## 13. Auditoria final

- [x] reserva relida e confirmada como propriedade de **AGENTE 22**;
- [x] state #135 confirmado `IN_PROGRESS` para o mesmo SHA;
- [x] fonte reconfirmada em `0cb6cb2f100d7493abfdf4038546e8be747289f1`;
- [x] **201 linhas textuais + newline = 202/202 posições** documentadas;
- [x] action, router, state e tab-identity reais auditados em leitura;
- [x] storage mock, Jest, package e workflow auditados em leitura;
- [x] provas diretas separadas de wiring estático e lacunas;
- [x] duas necessidades externas registradas para persistência no state;
- [x] nenhum código/teste/mock/workflow/config foi modificado.

**Conclusão documental:** a suíte #135 possui prova direta forte porque atravessa a implementação real. As lacunas restantes concentram-se em dois guards defensivos não focalmente cobertos.

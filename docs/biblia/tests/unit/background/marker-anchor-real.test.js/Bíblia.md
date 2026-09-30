# Bíblia técnica — tests/unit/background/marker-anchor-real.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** 6a6c977a1a2bad89a49813153039e17a93945017  
> **Agente responsável:** AGENTE 26  
> **Tipo:** suíte Jest do background real instrumentado — handleMarkerAndShow  
> **Linhas textuais:** 165  
> **Posições documentais:** 166, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`marker-anchor-real.test.js` valida a função real `handleMarkerAndShow` definida em `extension/background.js`. O teste não reimplementa o algoritmo: `loadBackgroundModule` lê o background real, injeta exports de teste e executa o código com os mocks Chrome compartilhados.

O contrato auditado é o fallback usado quando a extensão precisa abrir uma pasta mas não possui download válido anterior: criar `_anchor.png`, aguardar o download completar, abrir esse item para revelar a pasta e remover/erase o marcador quatro segundos depois.

A suíte também contém uma regressão explícita de worker leak: ela prova que o timer real de 4.000 ms pertence ao caso que o criou e que o teardown consegue cancelá-lo sem deixar timer rastreado.

## 2. Implementação real relacionada

No `background.js`, `handleMarkerAndShow(safeTitle, sendResponse)` faz `downloads.search` usando regex da pasta. Se encontra item `exists && state==='complete'`, chama `downloads.show(valid.id)`, responde `{ok:true}` e não cria marcador.

Sem item válido, constrói um PNG 1x1 em Data URL e escolhe `MangaTranslator/_anchor.png` ou `MangaTranslator/<safeTitle>/_anchor.png`. Se `downloads.download` falhar, responde `{ok:false,error:'Falha.'}`. Se o download completa, chama `show`, agenda `removeFile` + `erase` em 4 s e responde sucesso. Se o `waitForDownload` reporta interrupção, responde `{ok:false,error:'Interrompido'}`.

## 3. Infraestrutura de prova

`loadBackgroundModule.js` lê o `background.js` real, anexa getters/setters/exports instrumentados e executa com `chrome`, `fetch`, `FileReader` e `require` reais/mocados. Entre os exports injetados está `handleMarkerAndShow`.

`track-background-delay-timers.js` espiona `global.setTimeout` e rastreia exclusivamente atrasos de 600 ms, 4.000 ms e 18.000 ms. Para o caso de âncora, ele registra o timer de 4 s, permite consultar delays/contagem e cancela os timers reais ainda pendentes.

## 4. Isolamento e teardown

O `beforeEach` limpa listeners de runtime, storage, tabs/downloads e reconstrói `global.chrome` antes de carregar o background real. O `afterEach` chama o cancelador de timers, limpa alarms, abas, downloads e storage, restaura timers reais e spies.

Esse teardown é material para o bug de worker leak: um timeout real de 4 s pendente ao fim da suíte poderia manter o worker Jest vivo. O caso `REG-WORKER-4S` prova especificamente que o recurso é visível e cancelável.

## 5. Cenário BG-38/BG-40/BG-41 — paths do marcador

Com `downloads.search` retornando vazio, o teste chama a implementação real primeiro com `safeTitle=null` e depois `Capitulo_10`. As assertions provam os filenames `MangaTranslator/_anchor.png` e `MangaTranslator/Capitulo_10/_anchor.png`.

Classificação: ✅ PROVADO DIRETAMENTE.

## 6. Cenário BG-39 — remoção após 4 s

O teste permite o fluxo do mock de download completar, prova `downloads.show` e resposta `{ok:true}`, avança 4.001 ms e prova chamadas de `removeFile` e `erase`.

Classificação: ✅ PROVADO DIRETAMENTE para o cleanup temporal do arquivo-âncora.

## 7. REG-WORKER-4S — propriedade e cancelamento

Sem avançar quatro segundos, o cenário aguarda o fluxo criar o marcador e então consulta o rastreador. Ele prova que há um delay de 4.000 ms pendente, chama o cancelador, confirma que 4.000 ms foi cancelado e exige `getPendingCount() === 0`.

Isso é prova direta de que o teardown consegue remover o recurso atrasado responsável pela regressão de worker Jest nesta suíte.

## 8. BG-42 — falha de criação

`downloads.download` chama o callback com `undefined`. A implementação real entra no ramo `id === undefined` e o teste exige `{ok:false,error:'Falha.'}`.

Classificação: ✅ PROVADO DIRETAMENTE.

## 9. Evidência CI, matriz e solicitações

O run **36521561968**, commit `e720890cf34dc9437ee91f3b8172953497d69870`, contém exatamente o blob auditado `6a6c977a1a2bad89a49813153039e17a93945017`.

Node 20.x, job **109255348388**: `PASS background tests/unit/background/marker-anchor-real.test.js`; os quatro casos aparecem com ✓; 109/109 suítes e 851/851 testes passaram.

Node 22.x, job **109255348406**: mesmo resultado para o mesmo blob; 109/109 suítes e 851/851 testes passaram.

| Comportamento | Evidência | Classificação |
|---|---|---|
| path raiz do `_anchor.png` | assertion linhas 86–88 | ✅ PROVADO DIRETAMENTE |
| path de capítulo do `_anchor.png` | assertion linhas 94–96 | ✅ PROVADO DIRETAMENTE |
| sucesso abre item baixado | showSpy + resposta ok | ✅ PROVADO DIRETAMENTE |
| após 4 s remove arquivo e histórico | removeFileSpy/eraseSpy | ✅ PROVADO DIRETAMENTE |
| timer 4 s pertence ao caso e teardown cancela | linhas 142–146 | ✅ PROVADO DIRETAMENTE |
| falha ao criar marcador responde Falha. | linha 163 | ✅ PROVADO DIRETAMENTE |
| download anterior válido é reutilizado sem criar marcador | ramo real existe, sem caso focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| download interrompido depois de criado responde Interrompido | ramo real existe, sem caso focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| regex de `downloads.search` para safeTitle/raiz | chamada ocorre, mas query não é assertada | 🟨 EXECUTADO INDIRETAMENTE |

### 155-001 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: `handleMarkerAndShow` possui um ramo anterior ao marcador que reutiliza um download existente quando `exists` é true e `state` é `complete`, chama `downloads.show(valid.id)`, responde sucesso e retorna.

Evidência atual: os quatro casos desta suíte forçam `downloads.search` a retornar `[]`, portanto sempre entram no fallback do marcador.

Evidência ausente: caso com resultados mistos que prove seleção do item válido, `show(valid.id)`, resposta `{ok:true}` e ausência de chamada a `downloads.download`.

Ação esperada: adicionar teste focal da implementação real em mudança separada. Risco: regressão pode criar marcadores desnecessários ou abrir id incorreto quando já existe download válido.

### 155-002 — TEST_REQUIRED — OPEN — NORMAL

Encontrado: depois de criar a âncora, o callback de erro de `waitForDownload` responde `{ok:false,error:'Interrompido'}`. A suíte cobre criação bem-sucedida e falha imediata de `downloads.download`, mas não esse ramo intermediário.

Evidência atual: BG-39 cobre o onComplete; BG-42 cobre id undefined antes do wait.

Evidência ausente: simulação de evento `interrupted` para o id do marcador, assertion de `Interrompido` e prova de que não chama `show` nem agenda/remover o marcador como sucesso.

Ação esperada: adicionar caso focal usando o mock real de downloads/onChanged. Risco: interrupção pode responder incorretamente ou executar cleanup de sucesso sem ser detectada.


## 10. Auditoria linha a linha

### Linha 001

- **Código:** `const {`
- **Função:** Importa os mocks Chrome compartilhados usados para montar um background real controlado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 002

- **Código:** `    getRuntimeMock,`
- **Função:** Importa os mocks Chrome compartilhados usados para montar um background real controlado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 003

- **Código:** `    getStorageMock,`
- **Função:** Importa os mocks Chrome compartilhados usados para montar um background real controlado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 004

- **Código:** `    getTabsMock,`
- **Função:** Importa os mocks Chrome compartilhados usados para montar um background real controlado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 005

- **Código:** `    getAlarmsMock,`
- **Função:** Importa os mocks Chrome compartilhados usados para montar um background real controlado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 006

- **Código:** `    getDownloadsMock,`
- **Função:** Importa os mocks Chrome compartilhados usados para montar um background real controlado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 007

- **Código:** `} = require('../../mocks/chrome-api.mock.js');`
- **Função:** Importa os mocks Chrome compartilhados usados para montar um background real controlado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 008

- **Código:** `const { loadBackgroundModule } = require('../../helpers/load-background-module.js');`
- **Função:** Importa loadBackgroundModule, que instrumenta e executa extension/background.js real como módulo testável.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — caminho/helper está explicitamente ligado ao fluxo e a suíte passou.

### Linha 009

- **Código:** `const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');`
- **Função:** Importa o rastreador de timers atrasados de 600 ms, 4 s e 18 s.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — caminho/helper está explicitamente ligado ao fluxo e a suíte passou.

### Linha 010

- **Código:** `const {`
- **Função:** Importa BACKGROUND_PATH e flush, utilitários para carregar o background real e drenar tarefas assíncronas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 011

- **Código:** `    BACKGROUND_PATH,`
- **Função:** Importa BACKGROUND_PATH e flush, utilitários para carregar o background real e drenar tarefas assíncronas.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — caminho/helper está explicitamente ligado ao fluxo e a suíte passou.

### Linha 012

- **Código:** `    flush,`
- **Função:** Importa BACKGROUND_PATH e flush, utilitários para carregar o background real e drenar tarefas assíncronas.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — caminho/helper está explicitamente ligado ao fluxo e a suíte passou.

### Linha 013

- **Código:** `} = require('../../helpers/background-test-utils.js');`
- **Função:** Importa BACKGROUND_PATH e flush, utilitários para carregar o background real e drenar tarefas assíncronas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 014

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 015

- **Código:** `describe('background.js - handleMarkerAndShow real', () => {`
- **Função:** Abre o describe da função real handleMarkerAndShow exposta pelo background instrumentado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 016

- **Código:** `    let runtimeMock;`
- **Função:** Declara referências mutáveis para mocks, módulo de background e cancelador de timers atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 017

- **Código:** `    let storageMock;`
- **Função:** Declara referências mutáveis para mocks, módulo de background e cancelador de timers atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 018

- **Código:** `    let tabsMock;`
- **Função:** Declara referências mutáveis para mocks, módulo de background e cancelador de timers atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 019

- **Código:** `    let alarmsMock;`
- **Função:** Declara referências mutáveis para mocks, módulo de background e cancelador de timers atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 020

- **Código:** `    let downloadsMock;`
- **Função:** Declara referências mutáveis para mocks, módulo de background e cancelador de timers atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 021

- **Código:** `    let backgroundModule;`
- **Função:** Declara referências mutáveis para mocks, módulo de background e cancelador de timers atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 022

- **Código:** `    let cancelBackgroundDelayTimers;`
- **Função:** Declara referências mutáveis para mocks, módulo de background e cancelador de timers atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 023

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 024

- **Código:** `    async function flushFakeTimerRounds(rounds = 6, stepMs = 1) {`
- **Função:** Declara helper para avançar fake timers em várias rodadas curtas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 025

- **Código:** `        for (let index = 0; index < rounds; index++) {`
- **Função:** Itera pela quantidade solicitada de rodadas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 026

- **Código:** `            // eslint-disable-next-line no-await-in-loop`
- **Função:** Comentário ESLint permitindo await sequencial dentro do loop.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 027

- **Código:** `            await jest.advanceTimersByTimeAsync(stepMs);`
- **Função:** Avança os fake timers em stepMs para liberar callbacks encadeados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 028

- **Código:** `        }`
- **Função:** Fecha o loop do helper.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 029

- **Código:** `    }`
- **Função:** Fecha flushFakeTimerRounds.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 030

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 031

- **Código:** `    beforeEach(async () => {`
- **Função:** Abre beforeEach assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 032

- **Código:** `        jest.resetModules();`
- **Função:** Reseta registry de módulos Jest.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 033

- **Código:** `        jest.useRealTimers();`
- **Função:** Garante timers reais antes de instalar o rastreador de timers atrasados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 034

- **Código:** `        cancelBackgroundDelayTimers = trackBackgroundDelayTimers();`
- **Função:** Instala trackBackgroundDelayTimers e guarda a função de cancelamento/inspeção.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — caminho/helper está explicitamente ligado ao fluxo e a suíte passou.

### Linha 035

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 036

- **Código:** `        runtimeMock = getRuntimeMock();`
- **Função:** Recupera os singletons dos mocks de runtime, storage, tabs, alarms e downloads.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 037

- **Código:** `        storageMock = getStorageMock();`
- **Função:** Recupera os singletons dos mocks de runtime, storage, tabs, alarms e downloads.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 038

- **Código:** `        tabsMock = getTabsMock();`
- **Função:** Recupera os singletons dos mocks de runtime, storage, tabs, alarms e downloads.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 039

- **Código:** `        alarmsMock = getAlarmsMock();`
- **Função:** Recupera os singletons dos mocks de runtime, storage, tabs, alarms e downloads.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 040

- **Código:** `        downloadsMock = getDownloadsMock();`
- **Função:** Recupera os singletons dos mocks de runtime, storage, tabs, alarms e downloads.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 041

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 042

- **Código:** `        runtimeMock._messageListeners = [];`
- **Função:** Limpa listeners e lastError do runtime mock para isolamento do background carregado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 043

- **Código:** `        runtimeMock._connectListeners = [];`
- **Função:** Limpa listeners e lastError do runtime mock para isolamento do background carregado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 044

- **Código:** `        runtimeMock._installedListeners = [];`
- **Função:** Limpa listeners e lastError do runtime mock para isolamento do background carregado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 045

- **Código:** `        runtimeMock._startupListeners = [];`
- **Função:** Limpa listeners e lastError do runtime mock para isolamento do background carregado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 046

- **Código:** `        runtimeMock.lastError = null;`
- **Função:** Limpa listeners e lastError do runtime mock para isolamento do background carregado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 047

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 048

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa o storage antes do load do background.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 049

- **Código:** `        global.chrome = {`
- **Função:** Reconstrói global.chrome apenas com as APIs necessárias ao background real.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 050

- **Código:** `            storage: { local: storageMock },`
- **Função:** Injeta storage, tabs, alarms, runtime, downloads e scripting no chrome global.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 051

- **Código:** `            tabs: tabsMock,`
- **Função:** Injeta storage, tabs, alarms, runtime, downloads e scripting no chrome global.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 052

- **Código:** `            alarms: alarmsMock,`
- **Função:** Injeta storage, tabs, alarms, runtime, downloads e scripting no chrome global.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 053

- **Código:** `            runtime: runtimeMock,`
- **Função:** Injeta storage, tabs, alarms, runtime, downloads e scripting no chrome global.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 054

- **Código:** `            downloads: downloadsMock,`
- **Função:** Injeta storage, tabs, alarms, runtime, downloads e scripting no chrome global.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 055

- **Código:** `            scripting: global.chrome?.scripting,`
- **Função:** Injeta storage, tabs, alarms, runtime, downloads e scripting no chrome global.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 056

- **Código:** `        };`
- **Função:** Fecha o objeto global.chrome.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 057

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 058

- **Código:** `        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);`
- **Função:** Carrega extension/background.js real pelo helper de instrumentação.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — caminho/helper está explicitamente ligado ao fluxo e a suíte passou.

### Linha 059

- **Código:** `        await flush(8);`
- **Função:** Drena oito rodadas assíncronas do bootstrap.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 060

- **Código:** `    });`
- **Função:** Fecha beforeEach.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 061

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 062

- **Código:** `    afterEach(async () => {`
- **Função:** Abre afterEach assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 063

- **Código:** `        // handleMarkerAndShow agenda a remoção do arquivo-âncora em 4 s.`
- **Função:** Comentário explica ownership do timer real de 4 s e por que ele não pode sobreviver ao worker.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 064

- **Código:** `        // Esse timer pertence ao caso que criou a âncora e não pode sobreviver`
- **Função:** Comentário explica ownership do timer real de 4 s e por que ele não pode sobreviver ao worker.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 065

- **Código:** `        // quando esta suíte termina como a última de um worker Jest.`
- **Função:** Comentário explica ownership do timer real de 4 s e por que ele não pode sobreviver ao worker.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 066

- **Código:** `        cancelBackgroundDelayTimers();`
- **Função:** Cancela qualquer timer de background rastreado que ainda pertença ao caso atual.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + execução real — caminho/helper está explicitamente ligado ao fluxo e a suíte passou.

### Linha 067

- **Código:** `        alarmsMock.clearAll();`
- **Função:** Limpa todos os alarms.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 068

- **Código:** `        tabsMock._tabs.clear();`
- **Função:** Limpa abas do mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 069

- **Código:** `        downloadsMock._downloads.clear();`
- **Função:** Limpa downloads registrados no mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 070

- **Código:** `        await storageMock.clear();`
- **Função:** Limpa storage.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 071

- **Código:** `        jest.useRealTimers();`
- **Função:** Restaura timers reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 072

- **Código:** `        jest.restoreAllMocks();`
- **Função:** Restaura spies/mocks Jest.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 073

- **Código:** `    });`
- **Função:** Fecha afterEach.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 074

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 075

- **Código:** `    test('BG-38/BG-40/BG-41: cria âncora no path correto quando não há download anterior', async () => {`
- **Função:** Declara cenário que prova criação do arquivo-âncora nos paths raiz e de capítulo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 076

- **Código:** `        jest.spyOn(downloadsMock, 'search').mockImplementation((query, callback) => {`
- **Função:** Substitui downloads.search para simular ausência de download anterior.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 077

- **Código:** `            if (callback) callback([]);`
- **Função:** Responde lista vazia via callback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 078

- **Código:** `            return Promise.resolve([]);`
- **Função:** Também retorna Promise resolvida com lista vazia, compatível com o mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 079

- **Código:** `        });`
- **Função:** Fecha o mock de search.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 080

- **Código:** `        const downloadSpy = jest.spyOn(downloadsMock, 'download');`
- **Função:** Cria spy na implementação de download do mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 081

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 082

- **Código:** `        const rootResponse = jest.fn();`
- **Função:** Cria callback de resposta para o caso raiz.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 083

- **Código:** `        backgroundModule.handleMarkerAndShow(null, rootResponse);`
- **Função:** Chama handleMarkerAndShow real sem safeTitle.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 084

- **Código:** `        await flush(8);`
- **Função:** Drena callbacks do fluxo.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 085

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 086

- **Código:** `        expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({`
- **Função:** Assertion direta de que o download usa filename MangaTranslator/_anchor.png e callback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 087

- **Código:** `            filename: 'MangaTranslator/_anchor.png',`
- **Função:** Assertion direta de que o download usa filename MangaTranslator/_anchor.png e callback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 088

- **Código:** `        }), expect.any(Function));`
- **Função:** Assertion direta de que o download usa filename MangaTranslator/_anchor.png e callback.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 089

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 090

- **Código:** `        const titledResponse = jest.fn();`
- **Função:** Cria callback para o caso com título.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 091

- **Código:** `        backgroundModule.handleMarkerAndShow('Capitulo_10', titledResponse);`
- **Função:** Chama handleMarkerAndShow com Capitulo_10.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 092

- **Código:** `        await flush(8);`
- **Função:** Drena callbacks.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 093

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 094

- **Código:** `        expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({`
- **Função:** Assertion direta do path MangaTranslator/Capitulo_10/_anchor.png.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 095

- **Código:** `            filename: 'MangaTranslator/Capitulo_10/_anchor.png',`
- **Função:** Assertion direta do path MangaTranslator/Capitulo_10/_anchor.png.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 096

- **Código:** `        }), expect.any(Function));`
- **Função:** Assertion direta do path MangaTranslator/Capitulo_10/_anchor.png.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 097

- **Código:** `    });`
- **Função:** Fecha o primeiro teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 098

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 099

- **Código:** `    test('BG-39: âncora é removida do disco após 4s quando o download completa', async () => {`
- **Função:** Declara cenário que prova remoção do arquivo-âncora após 4 s.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 100

- **Código:** `        jest.spyOn(downloadsMock, 'search').mockImplementation((query, callback) => {`
- **Função:** Moca downloads.search para nenhum resultado existente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 101

- **Código:** `            if (callback) callback([]);`
- **Função:** Responde lista vazia via callback.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 102

- **Código:** `            return Promise.resolve([]);`
- **Função:** Retorna Promise resolvida com lista vazia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 103

- **Código:** `        });`
- **Função:** Fecha search mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 104

- **Código:** `        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();`
- **Função:** Cria spy de downloads.show.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 105

- **Código:** `        const removeFileSpy = jest.spyOn(downloadsMock, 'removeFile').mockImplementation((id, callback) => {`
- **Função:** Cria spy de removeFile.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 106

- **Código:** `            if (callback) callback();`
- **Função:** Executa callback de removeFile para manter o fluxo assíncrono.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 107

- **Código:** `            return Promise.resolve();`
- **Função:** Retorna Promise resolvida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 108

- **Código:** `        });`
- **Função:** Fecha mock de removeFile.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 109

- **Código:** `        const eraseSpy = jest.spyOn(downloadsMock, 'erase').mockImplementation((query, callback) => {`
- **Função:** Cria spy de downloads.erase.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 110

- **Código:** `            if (callback) callback();`
- **Função:** Executa callback de erase.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 111

- **Código:** `            return Promise.resolve();`
- **Função:** Retorna Promise resolvida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 112

- **Código:** `        });`
- **Função:** Fecha mock de erase.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 113

- **Código:** `        const sendResponse = jest.fn();`
- **Função:** Cria sendResponse spy.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 114

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 115

- **Código:** `        jest.useFakeTimers();`
- **Função:** Ativa fake timers somente após o background/rastreador terem sido instalados com timers reais.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 116

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 117

- **Código:** `        backgroundModule.handleMarkerAndShow('Capitulo_11', sendResponse);`
- **Função:** Chama handleMarkerAndShow real para Capitulo_11.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 118

- **Código:** `        await jest.advanceTimersByTimeAsync(20);`
- **Função:** Avança 20 ms para permitir a simulação do download completar.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 119

- **Código:** `        await flushFakeTimerRounds(6);`
- **Função:** Drena rodadas curtas adicionais do fake timer.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 120

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 121

- **Código:** `        expect(showSpy).toHaveBeenCalled();`
- **Função:** Assertion direta de que chrome.downloads.show foi chamado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 122

- **Código:** `        expect(sendResponse).toHaveBeenCalledWith({ ok: true });`
- **Função:** Assertion direta de resposta {ok:true}.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 123

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 124

- **Código:** `        await jest.advanceTimersByTimeAsync(4001);`
- **Função:** Avança 4001 ms, ultrapassando o timer real de remoção de 4 s.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 125

- **Código:** `        await flushFakeTimerRounds(4);`
- **Função:** Drena callbacks posteriores à expiração.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 126

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 127

- **Código:** `        expect(removeFileSpy).toHaveBeenCalled();`
- **Função:** Assertion direta de removeFile.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 128

- **Código:** `        expect(eraseSpy).toHaveBeenCalled();`
- **Função:** Assertion direta de erase.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 129

- **Código:** `    });`
- **Função:** Fecha o segundo teste.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 130

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 131

- **Código:** `    test('REG-WORKER-4S: teardown possui e cancela o timer de 4s do arquivo-âncora', async () => {`
- **Função:** Declara regressão de worker leak para ownership/cancelamento do timer de 4 s.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 132

- **Código:** `        jest.spyOn(downloadsMock, 'search').mockImplementation((query, callback) => {`
- **Função:** Moca search para ausência de download anterior.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 133

- **Código:** `            if (callback) callback([]);`
- **Função:** Responde lista vazia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 134

- **Código:** `            return Promise.resolve([]);`
- **Função:** Retorna Promise vazia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 135

- **Código:** `        });`
- **Função:** Fecha search mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 136

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 137

- **Código:** `        const sendResponse = jest.fn();`
- **Função:** Cria sendResponse spy.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 138

- **Código:** `        backgroundModule.handleMarkerAndShow('Worker_Leak_Regression', sendResponse);`
- **Função:** Chama handleMarkerAndShow real e deixa o timer de 4 s pendente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 139

- **Código:** `        await flush(12);`
- **Função:** Drena o fluxo até a resposta de sucesso ser produzida.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 140

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 141

- **Código:** `        expect(sendResponse).toHaveBeenCalledWith({ ok: true });`
- **Função:** Assertion direta de resposta ok.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 142

- **Código:** `        expect(cancelBackgroundDelayTimers.getPendingDelays()).toContain(4_000);`
- **Função:** Assertion direta: o rastreador vê um timer pendente de 4.000 ms.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 143

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 144

- **Código:** `        const cancelledDelays = cancelBackgroundDelayTimers();`
- **Função:** Executa manualmente o cancelador e captura os delays cancelados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 145

- **Código:** `        expect(cancelledDelays).toContain(4_000);`
- **Função:** Assertion direta: 4.000 ms estava entre os timers cancelados.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 146

- **Código:** `        expect(cancelBackgroundDelayTimers.getPendingCount()).toBe(0);`
- **Função:** Assertion direta: após cancelamento não sobra timer rastreado.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 147

- **Código:** `    });`
- **Função:** Fecha o teste de regressão do worker.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 148

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 149

- **Código:** `    test('BG-42: falha ao criar âncora responde erro sem crash', async () => {`
- **Função:** Declara cenário de falha ao criar a âncora.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 150

- **Código:** `        jest.spyOn(downloadsMock, 'search').mockImplementation((query, callback) => {`
- **Função:** Moca search para nenhum download anterior.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 151

- **Código:** `            if (callback) callback([]);`
- **Função:** Responde lista vazia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 152

- **Código:** `            return Promise.resolve([]);`
- **Função:** Retorna Promise vazia.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 153

- **Código:** `        });`
- **Função:** Fecha search mock.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 154

- **Código:** `        jest.spyOn(downloadsMock, 'download').mockImplementation((options, callback) => {`
- **Função:** Substitui downloads.download para simular id undefined.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 155

- **Código:** `            if (callback) callback(undefined);`
- **Função:** Executa callback com undefined, ativando o erro real de criação.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 156

- **Código:** `            return Promise.resolve(undefined);`
- **Função:** Retorna Promise resolvida undefined.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 157

- **Código:** `        });`
- **Função:** Fecha mock de download.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 158

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 159

- **Código:** `        const sendResponse = jest.fn();`
- **Função:** Cria sendResponse spy.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 160

- **Código:** `        backgroundModule.handleMarkerAndShow('Capitulo_12', sendResponse);`
- **Função:** Chama handleMarkerAndShow real para Capitulo_12.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 161

- **Código:** `        await flush(6);`
- **Função:** Drena callbacks.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 162

- **Código:** linha vazia
- **Função:** Linha vazia usada apenas para separar blocos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 163

- **Código:** `        expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'Falha.' });`
- **Função:** Assertion direta: responde {ok:false,error:'Falha.'}.
- **Evidência:** ✅ PROVADO DIRETAMENTE — assertion específica do mesmo blob passou em Node 20.x e 22.x.

### Linha 164

- **Código:** `    });`
- **Função:** Fecha o teste de falha.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Linha 165

- **Código:** `});`
- **Função:** Fecha o describe principal.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — participa de um dos quatro cenários verdes, sem assertion isolada nesta linha.

### Posição 166 — newline final

- **Código:** newline terminal após a linha textual 165.
- **Função:** encerra o arquivo no blob auditado.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — confirmado no SHA reservado.

## 11. Fonte integral auditada

```js
const {
    getRuntimeMock,
    getStorageMock,
    getTabsMock,
    getAlarmsMock,
    getDownloadsMock,
} = require('../../mocks/chrome-api.mock.js');
const { loadBackgroundModule } = require('../../helpers/load-background-module.js');
const { trackBackgroundDelayTimers } = require('../../helpers/track-background-delay-timers.js');
const {
    BACKGROUND_PATH,
    flush,
} = require('../../helpers/background-test-utils.js');

describe('background.js - handleMarkerAndShow real', () => {
    let runtimeMock;
    let storageMock;
    let tabsMock;
    let alarmsMock;
    let downloadsMock;
    let backgroundModule;
    let cancelBackgroundDelayTimers;

    async function flushFakeTimerRounds(rounds = 6, stepMs = 1) {
        for (let index = 0; index < rounds; index++) {
            // eslint-disable-next-line no-await-in-loop
            await jest.advanceTimersByTimeAsync(stepMs);
        }
    }

    beforeEach(async () => {
        jest.resetModules();
        jest.useRealTimers();
        cancelBackgroundDelayTimers = trackBackgroundDelayTimers();

        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        tabsMock = getTabsMock();
        alarmsMock = getAlarmsMock();
        downloadsMock = getDownloadsMock();

        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock._installedListeners = [];
        runtimeMock._startupListeners = [];
        runtimeMock.lastError = null;

        await storageMock.clear();
        global.chrome = {
            storage: { local: storageMock },
            tabs: tabsMock,
            alarms: alarmsMock,
            runtime: runtimeMock,
            downloads: downloadsMock,
            scripting: global.chrome?.scripting,
        };

        backgroundModule = loadBackgroundModule(BACKGROUND_PATH);
        await flush(8);
    });

    afterEach(async () => {
        // handleMarkerAndShow agenda a remoção do arquivo-âncora em 4 s.
        // Esse timer pertence ao caso que criou a âncora e não pode sobreviver
        // quando esta suíte termina como a última de um worker Jest.
        cancelBackgroundDelayTimers();
        alarmsMock.clearAll();
        tabsMock._tabs.clear();
        downloadsMock._downloads.clear();
        await storageMock.clear();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('BG-38/BG-40/BG-41: cria âncora no path correto quando não há download anterior', async () => {
        jest.spyOn(downloadsMock, 'search').mockImplementation((query, callback) => {
            if (callback) callback([]);
            return Promise.resolve([]);
        });
        const downloadSpy = jest.spyOn(downloadsMock, 'download');

        const rootResponse = jest.fn();
        backgroundModule.handleMarkerAndShow(null, rootResponse);
        await flush(8);

        expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({
            filename: 'MangaTranslator/_anchor.png',
        }), expect.any(Function));

        const titledResponse = jest.fn();
        backgroundModule.handleMarkerAndShow('Capitulo_10', titledResponse);
        await flush(8);

        expect(downloadSpy).toHaveBeenCalledWith(expect.objectContaining({
            filename: 'MangaTranslator/Capitulo_10/_anchor.png',
        }), expect.any(Function));
    });

    test('BG-39: âncora é removida do disco após 4s quando o download completa', async () => {
        jest.spyOn(downloadsMock, 'search').mockImplementation((query, callback) => {
            if (callback) callback([]);
            return Promise.resolve([]);
        });
        const showSpy = jest.spyOn(downloadsMock, 'show').mockResolvedValue();
        const removeFileSpy = jest.spyOn(downloadsMock, 'removeFile').mockImplementation((id, callback) => {
            if (callback) callback();
            return Promise.resolve();
        });
        const eraseSpy = jest.spyOn(downloadsMock, 'erase').mockImplementation((query, callback) => {
            if (callback) callback();
            return Promise.resolve();
        });
        const sendResponse = jest.fn();

        jest.useFakeTimers();

        backgroundModule.handleMarkerAndShow('Capitulo_11', sendResponse);
        await jest.advanceTimersByTimeAsync(20);
        await flushFakeTimerRounds(6);

        expect(showSpy).toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({ ok: true });

        await jest.advanceTimersByTimeAsync(4001);
        await flushFakeTimerRounds(4);

        expect(removeFileSpy).toHaveBeenCalled();
        expect(eraseSpy).toHaveBeenCalled();
    });

    test('REG-WORKER-4S: teardown possui e cancela o timer de 4s do arquivo-âncora', async () => {
        jest.spyOn(downloadsMock, 'search').mockImplementation((query, callback) => {
            if (callback) callback([]);
            return Promise.resolve([]);
        });

        const sendResponse = jest.fn();
        backgroundModule.handleMarkerAndShow('Worker_Leak_Regression', sendResponse);
        await flush(12);

        expect(sendResponse).toHaveBeenCalledWith({ ok: true });
        expect(cancelBackgroundDelayTimers.getPendingDelays()).toContain(4_000);

        const cancelledDelays = cancelBackgroundDelayTimers();
        expect(cancelledDelays).toContain(4_000);
        expect(cancelBackgroundDelayTimers.getPendingCount()).toBe(0);
    });

    test('BG-42: falha ao criar âncora responde erro sem crash', async () => {
        jest.spyOn(downloadsMock, 'search').mockImplementation((query, callback) => {
            if (callback) callback([]);
            return Promise.resolve([]);
        });
        jest.spyOn(downloadsMock, 'download').mockImplementation((options, callback) => {
            if (callback) callback(undefined);
            return Promise.resolve(undefined);
        });

        const sendResponse = jest.fn();
        backgroundModule.handleMarkerAndShow('Capitulo_12', sendResponse);
        await flush(6);

        expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'Falha.' });
    });
});
```

## 12. Conclusão documental

O blob `6a6c977a1a2bad89a49813153039e17a93945017` foi coberto integralmente: **165 linhas textuais + posição 166 do newline final**. O mesmo blob passou em Node 20.x e 22.x. A regressão de timer de 4 s está diretamente provada; os dois ramos externos sem prova focal foram preservados como solicitações ao auditor sem alterar teste ou produção.

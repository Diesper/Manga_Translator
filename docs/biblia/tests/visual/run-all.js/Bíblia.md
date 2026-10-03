# Bíblia técnica — tests/visual/run-all.js

> **Estado documental:** ✅ CONCLUÍDO pelo AGENTE 14  
> **SHA auditado:** 2a55421675439c2631778841345c258beaac24a9  
> **Agente:** AGENTE 14  
> **Tipo:** entry point/orquestrador da suíte visual Node.js  
> **Linhas textuais:** 30  
> **Posições documentais:** 31, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

tests/visual/run-all.js é o entry point oficial da suíte visual. Ele não contém assertions próprias: sua função é montar o processo de teste completo, carregar todas as suítes visuais atuais, aguardar a fila assíncrona do runner compartilhado, imprimir o resumo e transformar o resultado em exit code para npm e CI.

Cadeia oficial observada:

package.json test:visual
→ node tests/visual/run-all.js
→ seis módulos *.visual.js
→ tests/visual/runner.js
→ getAsyncQueue()
→ printSummary()
→ process.exit(0|1).

## 2. Chamadores e consumidores

### Chamadores
- package.json define test:visual como node tests/visual/run-all.js;
- npm test inclui npm run test:visual;
- .github/workflows/ci.yml possui job visual que executa npm run test:visual;
- windows-portability também executa test:visual;
- fresh-developer-flow também executa test:visual;
- o ci-gate consome o resultado do job visual.

### Consumidor do resultado
O consumidor observável é o processo pai/npm/GitHub Actions: código 0 representa sucesso; código 1 representa falha do resumo.

## 3. Inventário visual atual

A lista hardcoded do arquivo contém exatamente as seis suítes *.visual.js atuais:

| Ordem | Arquivo | it | ita | Total |
|---|---|---:|---:|---:|
| 1 | gtc-fingerprint.visual.js | 70 | 6 | 76 |
| 2 | gtc-indexeddb.visual.js | 13 | 46 | 59 |
| 3 | background-fingerprint.visual.js | 0 | 19 | 19 |
| 4 | content-manga-pipeline.visual.js | 13 | 23 | 36 |
| 5 | integration.visual.js | 13 | 15 | 28 |
| 6 | crop.visual.js | 3 | 3 | 6 |
| **Total** |  | **112** | **112** | **224** |

O baseline canônico atual exige visual.minTests = 224 e visual.maxSkipped = 0.

A lista atual, portanto, está completa para o corpus visual existente. A lacuna é de manutenção futura: verify-repository-structure.js exige apenas o diretório tests/visual e não foi localizado gate que compare o conjunto de arquivos *.visual.js do disco com os requires deste entry point.

## 4. Ordem de execução real

Os requires das linhas 17–22 são síncronos.

Consequência do runner atual:
- os testes it executam imediatamente durante o carregamento dos módulos;
- os testes ita são apenas registrados na fila Promise;
- somente depois de todos os requires o arquivo chama await getAsyncQueue().

Assim, a ordem dos módulos determina a ordem de registro dos ita, mas não existe uma única ordem textual global entre it e ita. Essa semântica pertence principalmente ao runner, porém run-all.js é o ponto que a concretiza ao carregar tudo antes do primeiro await.

## 5. Versionamento exibido

A versão vem diretamente de package.json. Com package 6.5.0, PRODUCT_VERSION vira 6.5.

A lógica é apenas de banner. O versionamento funcional/release continua sendo governado por scripts/release/sync-version.js e demais contratos do projeto.

## 6. Banner técnico e consistência observada

Os rótulos atuais têm respaldo parcial no repositório:
- visual-v4 aparece no fingerprint/content pipeline;
- extension/shared/gtc-indexeddb.js define DB_VERSION = 4;
- extension/content/content_manga.js descreve pipeline de cache em 6 fases.

Foi encontrada, porém, nomenclatura antiga em tests/visual/content-manga-pipeline.visual.js: vários describes/comentários ainda dizem “Pipeline 5 fases”, embora o código de produção e o banner atual usem 6 fases. Isso é drift documental externo, não erro funcional deste entry point.

## 7. Falhas e propagação

### Falha durante require
Se um módulo de suíte lançar fora do mecanismo do runner, a IIFE async rejeita. Não há catch local que acrescente contexto do arquivo carregado.

### Falha em ita
O runner registra failures em results; getAsyncQueue resolve depois de contabilizá-las; printSummary retorna false; run-all sai com 1.

### Falha em printSummary
Uma exceção inesperada rejeita a IIFE e não passa pelo process.exit explícito.

### Handles remanescentes
process.exit encerra o processo mesmo que existam timers/sockets/handles ainda abertos. Isso torna a suíte resistente a hangs, mas também reduz a capacidade de detectar leaks de recursos.

## 8. Evidência automatizada

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| package aponta test:visual para run-all.js | configuração real de package.json | 🟨 EXECUTADO INDIRETAMENTE |
| CI executa test:visual | ci.yml possui job visual e fluxos adicionais | 🟦 GATE ESTÁTICO ESPECÍFICO para presença no workflow via verify-ci-contract.js |
| seis suítes atuais são carregadas | requires explícitos no entry point | 🟨 EXECUTADO INDIRETAMENTE |
| total visual atual é 224 | soma das seis suítes + gate minTests=224 do runner | 🟨 EXECUTADO INDIRETAMENTE |
| toda suíte *.visual.js futura será executada | nenhum inventário/gate localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| fila ita é aguardada | await getAsyncQueue() | 🟨 EXECUTADO INDIRETAMENTE |
| caminho de sucesso termina 0 | job visual depende do exit code | 🟨 EXECUTADO INDIRETAMENTE |
| caminho allPassed=false termina 1 | lógica presente, sem self-test focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| require de suíte quebrada produz diagnóstico controlado | sem catch contextual/local | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| process.exit não mascara leak relevante | sem prova; término é forçado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| banner usa versão curta correta | executado, sem assertion focal | 🟨 EXECUTADO INDIRETAMENTE |
| banner IDB v4 corresponde ao código atual | DB_VERSION = 4 observado | 🟨 EXECUTADO INDIRETAMENTE |
| banner pipeline 6 fases corresponde à produção | content_manga.js documenta 6 fases | 🟨 EXECUTADO INDIRETAMENTE |

## 9. Solicitações ao auditor

### 232-001 — VISUAL_INVENTORY_GATE — OPEN
O entry point lista seis suítes manualmente e hoje a lista está completa, mas não existe gate que descubra todos os arquivos *.visual.js e exija que cada um esteja carregado. Um novo arquivo de testes pode ficar invisível mantendo o baseline de 224 intacto.

### 232-002 — TEST_REQUIRED — OPEN
Não foi localizada suíte focal do entry point que prove ordem de requires, espera de getAsyncQueue, exit 0/1 e comportamento quando um require/getAsyncQueue/printSummary falha.

### 232-003 — PROCESS_EXIT_REVIEW — OPEN
process.exit força término imediato. O auditor deve decidir se esconder handles pendentes é contrato desejado ou se process.exitCode permitiria detectar leaks sem comprometer a CI.

### 232-004 — DOCUMENTATION_DRIFT — OPEN
tests/visual/content-manga-pipeline.visual.js ainda usa descrições “Pipeline 5 fases” enquanto o código de produção e este banner usam 6 fases. O auditor deve confirmar se o teste modela subconjunto deliberado ou se a nomenclatura precisa ser atualizada em mudança separada.

## 10. Invariantes

1. Todos os módulos visuais canônicos devem ser carregados exatamente uma vez.
2. Nenhum novo arquivo de suíte visual deve ficar fora da execução oficial sem detecção.
3. A fila assíncrona deve terminar antes de printSummary.
4. printSummary false deve produzir exit code não zero.
5. Um erro de carregamento não pode produzir exit 0.
6. O entry point não deve duplicar lógica de assertions do runner.
7. A versão do banner deve ser derivada do package atual.
8. Rótulos técnicos do banner devem permanecer diagnósticos, não fonte de verdade.
9. O uso de process.exit deve ser intencional e compatível com a política de detecção de leaks.
10. Esta Bíblia vale somente para o blob SHA 2a55421675439c2631778841345c258beaac24a9.

## 11. Casos-limite relevantes

- package.version terminando ou não em .0;
- require de uma suíte inexistente;
- suíte lançando exceção no top-level;
- getAsyncQueue rejeitando;
- printSummary retornando false;
- printSummary lançando;
- nova suíte *.visual.js criada sem require correspondente;
- handle/timer aberto depois dos testes;
- stdout ainda pendente no momento de process.exit;
- registro dinâmico de ita depois da captura da fila.

## 12. Fonte integral

~~~javascript
'use strict';
// run_all.js — Executa todos os suites e aguarda a serial queue de testes async

const ROOT_PACKAGE_VERSION = require('../../package.json').version;
const PRODUCT_VERSION = ROOT_PACKAGE_VERSION.endsWith('.0')
    ? ROOT_PACKAGE_VERSION.slice(0, -2)
    : ROOT_PACKAGE_VERSION;

(async () => {
    console.log('\n' + '═'.repeat(60));
    console.log(`  MangaTranslator v${PRODUCT_VERSION} — Cadeia Completa de Testes`);
    console.log('  visual-v4 · wHash · pHash · Crop · Regional · Cross-Language');
    console.log('  Pipeline 6 fases · CALCULATE_VISUAL_FINGERPRINT · IDB v4');
    console.log('═'.repeat(60));

    // Load all suites — sync tests run immediately, async (ita) enqueue serially
    require('./gtc-fingerprint.visual.js');
    require('./gtc-indexeddb.visual.js');
    require('./background-fingerprint.visual.js');
    require('./content-manga-pipeline.visual.js');
    require('./integration.visual.js');
    require('./crop.visual.js');

    // Await the serial queue (all ita tests)
    const { getAsyncQueue, printSummary } = require('./runner.js');
    await getAsyncQueue();

    const allPassed = printSummary();
    process.exit(allPassed ? 0 : 1);
})();
~~~

## 13. Cobertura documental por linhas

As faixas abaixo são contíguas e cobrem as posições 1–31. A posição 31 representa o newline final do blob auditado.

### 1. Linhas 1-2 — Strict mode e comentário de responsabilidade

Fonte auditada:
~~~text
1: 'use strict';
2: // run_all.js — Executa todos os suites e aguarda a serial queue de testes async
~~~

**O que faz:** Ativa strict mode e declara que o arquivo executa as suítes e aguarda a fila assíncrona.

**Como faz:** A diretiva vale para todo o módulo; o comentário resume a intenção operacional.

**Por que foi implementado dessa forma:** O entry point precisa ser simples e explícito porque o exit code dele governa o job visual.

**Risco/limite:** O comentário usa o nome histórico run_all.js, enquanto o arquivo real é run-all.js; é apenas drift textual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando npm run test:visual carrega o entry point.

### 2. Linhas 3-7 — Versão exibida no banner

Fonte auditada:
~~~text
3: ␠ [linha vazia]
4: const ROOT_PACKAGE_VERSION = require('../../package.json').version;
5: const PRODUCT_VERSION = ROOT_PACKAGE_VERSION.endsWith('.0')
6:     ? ROOT_PACKAGE_VERSION.slice(0, -2)
7:     : ROOT_PACKAGE_VERSION;
~~~

**O que faz:** Lê package.json#version e deriva PRODUCT_VERSION removendo apenas o sufixo .0 final.

**Como faz:** require carrega package.json; endsWith('.0') decide entre slice(0,-2) e versão integral.

**Por que foi implementado dessa forma:** Exibe 6.5 em vez de 6.5.0 no banner atual, acompanhando a forma curta do produto.

**Risco/limite:** A regra duplica lógica de apresentação em vez de consumir deriveVersionInfo; mudança futura de versionamento pode causar drift apenas diagnóstico.

**Evidência automatizada:** 🟨 Caminho é executado em toda suíte visual; ⚠️ não há assertion focal do texto/versionamento do banner.

### 3. Linhas 8-9 — IIFE assíncrona

Fonte auditada:
~~~text
8: ␠ [linha vazia]
9: (async () => {
~~~

**O que faz:** Inicia uma função assíncrona autoexecutada que contém toda a orquestração.

**Como faz:** O corpo pode usar await sem transformar o módulo em ESM.

**Por que foi implementado dessa forma:** Mantém CommonJS e permite aguardar a fila do runner.

**Risco/limite:** A Promise da IIFE não recebe catch explícito; exceções assíncronas dependem do comportamento de unhandled rejection do Node para encerrar com falha.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no fluxo Node 20 da CI; ⚠️ sem self-test do branch de rejeição.

### 4. Linhas 10-14 — Banner de diagnóstico

Fonte auditada:
~~~text
10:     console.log('\n' + '═'.repeat(60));
11:     console.log(`  MangaTranslator v${PRODUCT_VERSION} — Cadeia Completa de Testes`);
12:     console.log('  visual-v4 · wHash · pHash · Crop · Regional · Cross-Language');
13:     console.log('  Pipeline 6 fases · CALCULATE_VISUAL_FINGERPRINT · IDB v4');
14:     console.log('═'.repeat(60));
~~~

**O que faz:** Imprime separadores, versão e rótulos da cadeia visual: visual-v4, hashes, crop, regional, cross-language, pipeline 6 fases e IDB v4.

**Como faz:** Usa console.log e strings fixas, com versão interpolada.

**Por que foi implementado dessa forma:** Ajuda a identificar rapidamente no log qual geração do pipeline visual está rodando.

**Risco/limite:** Rótulos são hardcoded e podem divergir do código; hoje visual-v4, DB_VERSION=4 e pipeline de produção em 6 fases têm correspondência encontrada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; não há gate que valide semanticamente todos os rótulos.

### 5. Linhas 15-22 — Inventário hardcoded das seis suítes

Fonte auditada:
~~~text
15: ␠ [linha vazia]
16:     // Load all suites — sync tests run immediately, async (ita) enqueue serially
17:     require('./gtc-fingerprint.visual.js');
18:     require('./gtc-indexeddb.visual.js');
19:     require('./background-fingerprint.visual.js');
20:     require('./content-manga-pipeline.visual.js');
21:     require('./integration.visual.js');
22:     require('./crop.visual.js');
~~~

**O que faz:** Carrega sequencialmente os seis módulos visuais que registram todos os testes.

**Como faz:** Cada require executa imediatamente o módulo CommonJS; it roda no carregamento e ita encadeia trabalho no runner.

**Por que foi implementado dessa forma:** Uma lista explícita garante ordem determinística e deixa claro quais suítes compõem o pacote visual atual.

**Risco/limite:** Não existe descoberta automática nem gate de completude do inventário. Um novo *.visual.js pode ser adicionado e nunca executado sem reduzir os 224 testes existentes.

**Evidência automatizada:** 🟨 Os seis módulos atuais são realmente executados e somam 224 registros; ⚠️ não há prova automatizada de que todo futuro arquivo *.visual.js esteja listado.

### 6. Linhas 23-26 — Importação do runner e espera da fila

Fonte auditada:
~~~text
23: ␠ [linha vazia]
24:     // Await the serial queue (all ita tests)
25:     const { getAsyncQueue, printSummary } = require('./runner.js');
26:     await getAsyncQueue();
~~~

**O que faz:** Importa getAsyncQueue/printSummary e aguarda a Promise corrente depois que todas as suítes foram carregadas.

**Como faz:** getAsyncQueue retorna a cadeia de ita registrada durante os requires; await impede resumo antes do término dessa cadeia.

**Por que foi implementado dessa forma:** Sem esse await, os testes assíncronos poderiam ser omitidos do resumo e o processo sair cedo.

**Risco/limite:** A Promise é capturada uma vez; registro dinâmico de novos ita durante a própria execução da fila não é contrato suportado e pode escapar do await inicial.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por 112 testes ita atuais; ⚠️ sem self-test de registro dinâmico/ordenação.

### 7. Linhas 27-30 — Resumo e exit code

Fonte auditada:
~~~text
27: ␠ [linha vazia]
28:     const allPassed = printSummary();
29:     process.exit(allPassed ? 0 : 1);
30: })();
~~~

**O que faz:** Executa printSummary, converte o booleano final em código 0/1 e encerra o processo.

**Como faz:** process.exit força término imediato após o resumo.

**Por que foi implementado dessa forma:** O npm/CI recebe um status binário inequívoco e não fica preso por handles remanescentes.

**Risco/limite:** process.exit pode ocultar handles/tarefas fire-and-forget ainda pendentes e pode truncar I/O assíncrono; também impede que leaks mantenham o processo vivo e sejam observados naturalmente.

**Evidência automatizada:** 🟨 O caminho verde é exercitado pelo job visual; ⚠️ não há teste focal do caminho allPassed=false nem de handles pendentes.

### 8. Linhas 31 — Newline final

Fonte auditada:
~~~text
31: ␠ [linha vazia]
~~~

**O que faz:** Mantém a terminação textual do arquivo.

**Como faz:** A posição 31 é o slot vazio após o newline final.

**Por que foi implementado dessa forma:** Preserva convenção de arquivos texto e diffs estáveis.

**Risco/limite:** Sem impacto funcional.

**Evidência automatizada:** 🟦 Confirmado pela leitura exata do blob auditado.



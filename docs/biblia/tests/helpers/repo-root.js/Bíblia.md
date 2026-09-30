# Bíblia técnica — tests/helpers/repo-root.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE RESPONSÁVEL  
> **Arquivo auditado:** tests/helpers/repo-root.js  
> **SHA auditado:** b2520d65820e7b9072602018b0f46609ac967c58  
> **Agente responsável:** AGENTE 19  
> **Índice do corpus:** 104  
> **Tipo:** helper CommonJS de infraestrutura de testes  
> **Linhas textuais:** 23  
> **Posições documentais:** 24, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

tests/helpers/repo-root.js centraliza a descoberta portátil da raiz do repositório para a infraestrutura de testes. Seu único símbolo público, findRepoRoot, recebe um diretório inicial, normaliza esse caminho e sobe pela cadeia de ancestrais até localizar um diretório que contenha extension/manifest.json.

O helper evita que dezenas de testes calculem a raiz com quantidades fixas de ../.. ou dependam de process.cwd(). O comportamento é deliberadamente síncrono porque ocorre no bootstrap dos arquivos de teste, antes de suas assertions funcionais.

Este arquivo não participa do runtime da extensão Chromium. Ele é infraestrutura Node usada por testes e helpers.

## 2. API pública

### findRepoRoot(startDir = __dirname)

Entrada:

- startDir: caminho usado como ponto inicial;
- se omitido, o valor padrão é o __dirname do próprio helper.

Saída:

- retorna uma string absoluta correspondente ao primeiro diretório, começando pelo próprio startDir resolvido e depois subindo aos pais, para o qual existe o caminho extension/manifest.json.

Falha:

- se a subida alcançar a raiz do filesystem sem encontrar o sentinela, lança Error;
- a mensagem inclui o startDir original e explica que extension/manifest.json era esperado em um ancestral.

Exportação:

- module.exports = { findRepoRoot }.

Não há outra API pública, classe, estado global, callback ou Promise.

## 3. Algoritmo real

O algoritmo é:

1. path.resolve(startDir) produz current;
2. em cada iteração, monta current/extension/manifest.json;
3. fs.existsSync verifica somente a existência desse caminho;
4. se existir, current é retornado imediatamente;
5. caso contrário, calcula parent = path.dirname(current);
6. se parent === current, a raiz do filesystem foi alcançada e a função lança;
7. senão, current recebe parent e o loop continua.

A busca é de baixo para cima. Portanto, se mais de um ancestral possuir o sentinela, vence o mais próximo do ponto inicial.

A condição de sucesso é existência. O helper não abre o manifesto, não valida JSON, não confirma que o sentinela é arquivo regular e não compara versão ou conteúdo.

## 4. Dependências

### fs

O módulo built-in fs é usado somente por fs.existsSync.

Consequências:

- há leitura síncrona de metadados/existência do filesystem;
- não há escrita;
- erros normais de inexistência são convertidos pelo existsSync em false;
- o helper não mantém handles abertos.

### path

O módulo built-in path fornece:

- path.resolve para normalizar o início;
- path.join para montar extension/manifest.json;
- path.dirname para subir ao ancestral.

O uso das primitivas de path, em vez de separadores manuais, é compatível com convenções de caminho POSIX e Windows.

### Sentinela estrutural

A dependência implícita central é a presença de:

extension/manifest.json

na raiz canônica do repositório.

Se essa convenção mudar, todos os consumidores do helper podem deixar de inicializar.

## 5. Consumidores diretos localizados

A busca pelo símbolo findRepoRoot localizou 32 arquivos contando a própria implementação, ou seja, 31 consumidores diretos no snapshot auditado.

### Helpers

- tests/helpers/load-content-script.js — importa na linha 18 e invoca findRepoRoot(__dirname) na linha 19;
- tests/helpers/load-extension-page.js — importa na linha 4 e invoca na linha 5.

### E2E

- tests/e2e/cache-and-storage.spec.js — import linha 5; uso linha 19;
- tests/e2e/reader-offline.spec.js — import linha 5; uso linha 19;
- tests/e2e/translation-flow.spec.js — import linha 20; uso linha 34.

Nos três E2E, a função participa da construção do caminho da extensão.

### Integração

- tests/integration/banned-images-flow.test.js — linhas 23–24;
- tests/integration/chapter-dedup.test.js — linhas 19–20;
- tests/integration/gtc-end-to-end.test.js — linhas 24–25;
- tests/integration/ipc/gemini-cors-fallback.test.js — linhas 47–48;
- tests/integration/ipc/gtc-cache-flow.test.js — linhas 24–25;
- tests/integration/ipc/gtc-indexeddb-deep.test.js — linhas 29–30;
- tests/integration/ipc/image-translation-routing.test.js — linhas 6–7.

### Unitários de background

- tests/unit/background/export-guard.test.js — linhas 29–30;
- tests/unit/background/startup-recovery.test.js — linhas 26–27;
- tests/unit/background/state-api.test.js — linhas 4–5.

### Unitários de content-manga

- tests/unit/content-manga/audio-synthesis-full.test.js — linhas 21–22;
- tests/unit/content-manga/audio-synthesis.test.js — linhas 20–21;
- tests/unit/content-manga/auto-restore-system.test.js — linhas 18–19;
- tests/unit/content-manga/auto-restorer-real.test.js — linhas 6–7;
- tests/unit/content-manga/button-ui-real.test.js — linhas 6–7;
- tests/unit/content-manga/canonical-title-full.test.js — linhas 22–23;
- tests/unit/content-manga/canonical-title.test.js — linhas 21–22;
- tests/unit/content-manga/chapter-id-cache.test.js — linhas 23–24;
- tests/unit/content-manga/chapter-id-rejection.test.js — linhas 23–24;
- tests/unit/content-manga/drawer-real.test.js — linhas 6–7;
- tests/unit/content-manga/extract-flow-real.test.js — linhas 6–7;
- tests/unit/content-manga/extraction-and-handlers-real.test.js — linhas 6–7;
- tests/unit/content-manga/floating-button-guard-and-single-click.test.js — linhas 6–7;
- tests/unit/content-manga/replacement-and-completion-real.test.js — linhas 6–7;
- tests/unit/content-manga/twin-backdrop-sync.test.js — linhas 13–14.

### Unitário de shared-ui

- tests/unit/shared-ui/redo-confirmation.test.js — linhas 4–5.

A forma dominante é importar o helper e imediatamente executar findRepoRoot(__dirname) durante a avaliação do módulo de teste. Assim, uma falha do caminho normal impede a própria suíte consumidora de inicializar.

## 6. Integração com a infraestrutura de testes

jest.config.js declara projetos que abrangem os consumidores unitários e de integração:

- background;
- content-scripts;
- shared-ui;
- integration.

scripts/ci/run-jest-ci.js valida a partição unit/integration e executa os projetos canônicos. package.json expõe test:unit, test:integration e test:ci.

playwright.config.js define testDir como ./tests/e2e, cobrindo estruturalmente os três consumidores E2E listados.

Esses vínculos são evidência de que repo-root.js é infraestrutura transversal, mas não equivalem a assertions focais sobre seu contrato.

## 7. Estado, efeitos colaterais e lifecycle

O módulo possui apenas referências locais aos built-ins fs e path e a declaração da função.

Na carga do módulo:

- não acessa o filesystem;
- não chama findRepoRoot automaticamente;
- não registra listeners;
- não cria timer;
- não cria worker;
- não toca DOM, Chrome API, storage, IndexedDB ou rede.

Ao chamar findRepoRoot:

- executa consultas síncronas existsSync em uma sequência finita de diretórios;
- calcula strings de caminho;
- retorna a primeira raiz encontrada ou lança Error.

Não há cache. Duas chamadas independentes repetem a varredura e podem observar mudanças do filesystem ocorridas entre elas.

## 8. Terminação e complexidade

A função termina porque cada iteração sem sucesso substitui current por path.dirname(current). Em uma hierarquia de filesystem válida, a sequência alcança a raiz, onde path.dirname(root) === root.

Se d for a quantidade de níveis entre o ponto inicial e a raiz encontrada ou a raiz do filesystem:

- tempo: O(d) chamadas a existsSync e operações de path;
- memória auxiliar: O(1), desconsiderando as strings temporárias.

Não há recursão, portanto a profundidade do caminho não consome stack recursivo.

## 9. Casos de borda derivados do código

### startDir já é a raiz do repositório

O sentinela é verificado antes de subir. Portanto a função retorna o próprio diretório.

### startDir está profundamente aninhado

A função sobe um ancestral por iteração até encontrar o sentinela.

### múltiplos sentinelas em ancestrais

O primeiro encontrado, isto é, o ancestral mais próximo, vence.

### sentinela inexistente

Ao atingir o root do filesystem, parent === current e a função lança.

### startDir relativo

path.resolve interpreta caminho relativo em relação ao process.cwd() do processo Node. Os consumidores auditados evitam essa dependência porque passam __dirname.

### startDir apontando para algo que conceitualmente seria arquivo

A função não valida se startDir é diretório; trata a string resolvida como ponto da cadeia de caminhos. Esse caso não foi localizado nos consumidores normais.

### sentinela existente mas inválido

Qualquer objeto de filesystem que faça fs.existsSync retornar true satisfaz o contrato atual. Conteúdo e tipo não são validados.

## 10. Portabilidade

Não há concatenação manual com "/" ou "\\" para montar os caminhos operacionais. path.resolve, path.join e path.dirname delegam semântica de plataforma ao Node.

Há evidência operacional real do mesmo blob em Linux e Windows no CI descrito abaixo. Essa evidência confirma o caminho normal no layout real do repositório, mas não substitui testes controlados dos branches de erro.

## 11. Evidência automatizada existente

### Identidade do blob

No commit b6ad13fce47adcab3fcd10281f28848f7b4ce50f, usado por uma execução real da CI, tests/helpers/repo-root.js possui exatamente o mesmo blob SHA auditado:

b2520d65820e7b9072602018b0f46609ac967c58

### CI real

Run GitHub Actions:

- MangaTranslator CI #36577447500;
- conclusão: success.

Jobs relevantes:

- Unit + Integration (20.x), job 109437162616 — success;
- Unit + Integration (22.x), job 109437162754 — success;
- Windows Portability, job 109437162789 — success.

Nos jobs Linux de Node 20 e Node 22, o log registra, entre outros consumidores que chamam findRepoRoot(__dirname) no bootstrap:

- PASS tests/integration/chapter-dedup.test.js;
- PASS tests/integration/gtc-end-to-end.test.js;
- PASS tests/unit/shared-ui/redo-confirmation.test.js;
- PASS tests/unit/content-manga/canonical-title-full.test.js;
- PASS tests/unit/background/state-api.test.js;
- PASS tests/unit/content-manga/canonical-title.test.js;
- 109 suites aprovadas;
- 851 testes aprovados.

O job Windows Portability também executou consumidores desse helper e registrou 109 suites / 851 testes aprovados.

Isso prova que, no layout real daquele snapshot e em mais de uma plataforma/runtime, a implementação real encontrou uma raiz utilizável. Como nenhuma assertion desses testes compara explicitamente o valor retornado por findRepoRoot, a classificação correta é execução indireta.

### Busca por prova focal negativa

A busca pelas mensagens:

Repository root not found from

e

expected extension/manifest.json in an ancestor directory

encontrou somente a própria implementação. Não foi localizado teste repo-root.test.js nem outra assertion focal para o branch de erro.

## 12. Matriz de evidência

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| O módulo exporta findRepoRoot e consumidores conseguem importá-lo | 31 consumidores diretos; suítes reais inicializam | 🟨 EXECUTADO INDIRETAMENTE |
| findRepoRoot(__dirname) encontra a raiz no layout real Linux | CI #36577447500, jobs Node 20/22 | 🟨 EXECUTADO INDIRETAMENTE |
| O mesmo caminho normal funciona em Windows | job Windows Portability 109437162789 | 🟨 EXECUTADO INDIRETAMENTE |
| Projetos Jest incluem os consumidores unit/integration | jest.config.js + run-jest-ci.js | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Playwright aponta para tests/e2e | playwright.config.js | 🟦 GATE ESTÁTICO ESPECÍFICO |
| startDir já na raiz retorna imediatamente | derivado da ordem das linhas 9–11; sem assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| subida por vários ancestrais preserva a raiz correta | consumidores exercem algum nível real, sem controlar/afirmar número de níveis | 🟨 EXECUTADO INDIRETAMENTE |
| ancestral mais próximo vence quando há sentinelas concorrentes | sem fixture controlada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ausência total do sentinela lança Error | busca pela mensagem só encontrou a implementação | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| texto exato da exceção é preservado | sem assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| caminho relativo é resolvido via cwd | sem teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| somente existência do sentinela basta | sem teste focal de arquivo/diretório/conteúdo inválido | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

Não foi encontrada evidência que mereça ✅ PROVADO DIRETAMENTE para o contrato próprio de findRepoRoot.

## 13. Solicitação ao auditor

### 104-001 — TEST_REQUIRED — OPEN

**Encontrado:** o helper possui 31 consumidores diretos e seu caminho normal é exercitado por CI real em Linux e Windows, porém não existe teste focal que controle a árvore de diretórios e faça assertions sobre o contrato da própria função.

**Arquivo auditado:** tests/helpers/repo-root.js.

**Arquivo externo sugerido:** tests/unit/helpers/repo-root.test.js, caso o auditor aprove a criação.

**Comportamento afetado:** descoberta da raiz, prioridade do ancestral mais próximo, terminação na raiz do filesystem e erro quando o sentinela inexiste.

**Evidência atualmente existente:** o mesmo blob SHA foi usado pela CI #36577447500; consumidores reais passaram em Node 20, Node 22 e Windows.

**Evidência ausente:** assertions diretas para início já na raiz, subida multinível controlada, sentinelas concorrentes, ausência do sentinela, mensagem de erro, entrada relativa e semântica de existência-only.

**Por que a evidência atual é insuficiente:** todos os consumidores usam o layout normal do próprio checkout. Um layout saudável prova que o helper funciona nesse cenário, mas não fixa seus branches e prioridades para futuras alterações.

**Alteração/investigação necessária:** criar, em trabalho de auditoria separado, diretórios temporários controlados e executar a implementação real; não copiar/reimplementar a lógica dentro do teste.

**Ação esperada do auditor:** confirmar a lacuna e decidir se a cobertura focal deve ser criada.

**Teste esperado:** importar findRepoRoot real, montar árvores temporárias com e sem extension/manifest.json e afirmar retorno/erro para cada cenário.

**Evidência esperada:** expect específico do caminho retornado e do erro lançado em cada branch.

**Possível regressão:** uma alteração futura pode inverter prioridade de ancestrais, introduzir dependência de cwd, quebrar a terminação ou mudar o contrato do sentinela sem que o layout normal da CI detecte.

**Impacto conhecido:** falha nesse helper pode impedir dezenas de suites de inicializar ou fazê-las carregar arquivos do root errado.

**Severidade:** NORMAL.

A solicitação não bloqueia a conclusão documental. A Bíblia registra a força real da evidência sem fabricar um teste novo.

## 14. Fonte integral auditada

~~~js
'use strict';

const fs = require('fs');
const path = require('path');

function findRepoRoot(startDir = __dirname) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'extension', 'manifest.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        'Repository root not found from ' + startDir +
        ': expected extension/manifest.json in an ancestor directory.'
      );
    }
    current = parent;
  }
}

module.exports = { findRepoRoot };
~~~

O bloco acima corresponde integralmente ao blob auditado. O arquivo possui newline final.

## 15. Mapa linha por linha

| Linha/posição | Papel técnico | Força da evidência |
|---:|---|---|
| 1 | ativa strict mode do módulo CommonJS | 🟨 módulo carregado indiretamente em suítes reais |
| 2 | separador textual | estrutural |
| 3 | importa fs built-in | 🟨 caminho real usa existsSync |
| 4 | importa path built-in | 🟨 caminho real usa resolve/join/dirname |
| 5 | separador textual | estrutural |
| 6 | declara findRepoRoot e default __dirname | 🟨 consumidores importam e chamam explicitamente |
| 7 | normaliza startDir para current absoluto | 🟨 executado indiretamente; valores alternativos sem prova focal |
| 8 | inicia loop de subida | 🟨 executado indiretamente |
| 9 | testa existência de current/extension/manifest.json | 🟨 sucesso real; variantes do sentinela sem prova focal |
| 10 | retorna o primeiro current que satisfaz o sentinela | 🟨 retorno utilizável comprovado indiretamente |
| 11 | fecha branch de sucesso | estrutural |
| 12 | calcula diretório pai | 🟨 caminho real de consumidores aninhados |
| 13 | detecta ponto fixo da raiz do filesystem | ⚠️ branch sem teste focal |
| 14 | inicia construção da exceção | ⚠️ sem teste focal |
| 15 | compõe prefixo da mensagem com startDir | ⚠️ sem assertion da mensagem |
| 16 | compõe explicação do sentinela esperado | ⚠️ sem assertion da mensagem |
| 17 | fecha lançamento do Error | ⚠️ branch sem teste focal |
| 18 | fecha guard de raiz | estrutural |
| 19 | avança current para parent | 🟨 subida real exercitada indiretamente |
| 20 | fecha loop | estrutural |
| 21 | fecha função | estrutural |
| 22 | separador textual | estrutural |
| 23 | exporta findRepoRoot por module.exports | 🟨 importações reais bem-sucedidas |
| 24 | newline final do blob | 🟦 verificação estática integral do fonte |

## 16. Unidades semânticas

### U01 — linhas 1–4 — bootstrap CommonJS

Define strict mode e carrega somente módulos nativos. Não há dependência npm externa nem código da extensão.

### U02 — linhas 6–7 — entrada e normalização

Define a única função pública e converte o ponto inicial para forma absoluta. O default é relativo ao local do próprio helper, não ao chamador.

### U03 — linhas 8–11 — detecção do sentinela

Testa o diretório corrente antes de subir. Essa ordem estabelece a regra "ancestral mais próximo vence".

### U04 — linhas 12–18 — guard de terminação

Obtém o pai e detecta a raiz do filesystem por ponto fixo. Sem esse guard, ausência do sentinela poderia manter o while(true) indefinidamente.

### U05 — linha 19 — progressão

Move current estritamente para o pai quando ainda não chegou ao topo. É a transição que garante progresso da busca.

### U06 — linha 23 — superfície pública

Expõe somente findRepoRoot em um objeto CommonJS.

### U07 — posição 24 — terminador

Preserva o newline final do arquivo auditado.

## 17. Invariantes

Para o código atual:

1. a busca sempre testa o próprio ponto inicial resolvido antes dos ancestrais;
2. o primeiro ancestral com sentinela é retornado;
3. uma iteração malsucedida sobe exatamente um nível;
4. a função não escreve no filesystem;
5. a função não mantém estado entre chamadas;
6. a ausência completa do sentinela não pode resultar em retorno silencioso;
7. a terminação negativa ocorre quando dirname deixa de alterar current;
8. o contrato de sentinela é existência, não validade do manifesto;
9. a função retorna caminho absoluto porque current nasce de path.resolve;
10. consumidores que chamam no bootstrap dependem desse retorno antes de executar suas assertions funcionais.

## 18. O que esta Bíblia não afirma

Esta documentação não afirma que:

- extension/manifest.json é JSON válido apenas porque o helper o encontrou;
- o sentinela é necessariamente arquivo regular;
- o branch de erro possui teste automatizado específico;
- todos os 31 consumidores fazem assertion sobre findRepoRoot;
- passar as suites consumidoras prova prioridade entre múltiplos ancestrais;
- a função aceita semanticamente qualquer tipo possível de startDir;
- os testes E2E, por si sós, fornecem prova focal do helper.

A CI observada prova funcionamento indireto no layout real. As propriedades sem assertion específica permanecem classificadas como lacunas.

## 19. Segurança e trust boundary

O helper opera apenas sobre caminhos locais fornecidos por código de teste. Não processa diretamente input remoto, credenciais, cookies, tokens, conteúdo Gemini ou dados persistidos da extensão.

O limite de confiança é o filesystem local: um sentinela extension/manifest.json existente em ancestral inesperado pode fazer a busca parar naquele ponto. Como o contrato aceita existência sem validar conteúdo, callers devem tratar a função como descoberta estrutural, não como verificação de integridade do repositório.

Não há execução de arquivos encontrados. O helper apenas retorna o caminho.

## 20. Autoauditoria — AGENTE 19

- [x] PR #66 e branch docs/project-bible reconfirmados;
- [x] reserva #104 criada com semântica CREATE ONLY;
- [x] reserva relida e ownership confirmado como AGENTE 19;
- [x] state #104 criado separadamente e vinculado ao mesmo arquivo;
- [x] SHA do fonte reconfirmado antes da materialização;
- [x] 23 linhas textuais + newline final = 24 posições documentadas;
- [x] fonte integral incorporada;
- [x] 31 consumidores diretos identificados;
- [x] consumidores representativos inspecionados no branch;
- [x] configuração Jest/Playwright e runner CI inspecionados;
- [x] execução real do mesmo blob localizada;
- [x] Linux Node 20/22 e Windows diferenciados de prova focal;
- [x] nenhuma ocorrência da mensagem de erro foi encontrada fora da implementação;
- [x] evidência indireta não foi promovida a prova direta;
- [x] lacuna externa registrada como audit_request 104-001;
- [x] nenhum código, teste, fixture, workflow ou configuração foi alterado.

**Resultado documental:** a Bíblia descreve integralmente o comportamento observado do blob b2520d65820e7b9072602018b0f46609ac967c58. O caminho normal possui execução indireta real e multiplataforma; branches/contratos de borda sem assertions permanecem explicitamente marcados. A solicitação 104-001 pode permanecer OPEN sem impedir a conclusão documental.

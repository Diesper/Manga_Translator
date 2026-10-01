# Bíblia técnica — tests/smoke/smoke-03-chapter-persistence.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `63f904d8ad55e114d130fa2cba395310a997be42`  
> **Agente responsável:** AGENTE 13  
> **Tipo:** smoke test Node.js de persistência IndexedDB e restauração  
> **Linhas textuais:** **76**  
> **Posições documentais:** **77**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/smoke/smoke-03-chapter-persistence.js` é um teste de fumaça executável contra a implementação real de `extension/shared/storage-manager.js`. Ele instala `fake-indexeddb` como backend IndexedDB em Node, fornece somente o mínimo de `chrome.storage.local` necessário para os caminhos de compatibilidade e chama diretamente as APIs públicas de persistência.

O foco principal é uma regressão de perda de páginas: o chamador dispara dez `savePageResult()` sem `await` intermediário para o mesmo capítulo. No StorageManager atual, essas chamadas entram em `enqueueChapterOp(chapterId, ...)`, que as **serializa por capítulo** antes das transações IndexedDB. Portanto, a propriedade realmente provada é: **dez solicitações iniciadas concorrentemente pelo chamador sobrevivem integralmente ao mecanismo real de fila + transação**, não que dez transações IndexedDB executem em paralelo.

Depois, o smoke verifica o índice das páginas, o mapa `cleanUrl → {assetId,index}` e a listagem de `restoreEntries`.

## 2. Dependências, consumidores e efeitos colaterais

- **Dependências:** Node `assert`, pacote `fake-indexeddb/auto` e `extension/shared/storage-manager.js`.
- **Backend de persistência do teste:** IndexedDB em memória compatível com a API do navegador; não é a implementação física do Chromium.
- **Mock externo:** `global.chrome.storage.local` responde a `get/set/remove`, sem persistir estado legado.
- **Consumidor:** `tests/smoke/run-smoke.js` descobre este arquivo por `/^smoke-\d+.*\.js$/` e o executa em processo Node separado.
- **Entrada npm:** `package.json#test:smoke` chama `node tests/smoke/run-smoke.js`.
- **CI:** o job **Smoke Tests** executa `npm run test:smoke`.
- **Efeitos:** cria banco IndexedDB apenas no processo do smoke, grava assets/page records/restore entries em memória e escreve logs em stdout/stderr. Não altera o checkout.

O processo separado usado por `run-smoke.js` também evita que o `chapterId` fixo deste arquivo colida com bancos em memória de outros smokes.

## 3. Fluxo e contratos provados

1. prepara IndexedDB e `chrome.storage.local` antes de carregar o StorageManager;
2. inicia dez saves para o mesmo capítulo, índices 0–9;
3. `Promise.all` exige que todas as Promises resolvam;
4. `getChapterPageIndex` deve retornar exatamente dez páginas e conter cada índice 0–9;
5. `getRestoreIndex` deve conter as dez clean URLs, cada uma com `assetId` e `index` correto;
6. grava diretamente a página 15 e confirma que `listRestoreEntries([chapterId])` encontra a clean URL com `assetId`;
7. qualquer rejection/assertion alcança `run().catch` e termina o processo com código 1.

## 4. Evidência automatizada real

O workflow **MangaTranslator CI #36577447500**, commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`, concluiu com sucesso em 2026-09-29. O job **Smoke Tests** (`109437162201`) executou o step **Rodar testes de fumaça** com sucesso. O blob deste arquivo naquele commit era exatamente `63f904d8ad55e114d130fa2cba395310a997be42`, e o blob de `tests/smoke/run-smoke.js` era `ea6fa903f7a68272a769804a29a97ae967bc1088`, o mesmo runner que o descobre pelo nome.

| Comportamento | Evidência | Classificação |
|---|---|---|
| este arquivo entra no conjunto de smoke | regex de descoberta do runner + nome `smoke-03-...` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| o mesmo blob executou em CI | run #36577447500 / job Smoke Tests verde | ✅ PROVADO DIRETAMENTE |
| dez chamadas iniciadas sem await intermediário completam | `Promise.all` + assertion de 10 resultados | ✅ PROVADO DIRETAMENTE |
| nenhuma das páginas 0–9 desaparece | `pages.length === 10` + assertion por índice | ✅ PROVADO DIRETAMENTE |
| cada cleanUrl 0–9 possui restore com assetId e índice correto | assertions linhas 55–57 | ✅ PROVADO DIRETAMENTE |
| `listRestoreEntries([chapterId])` inclui restore da gravação 15 | find por cleanUrl + assetId | ✅ PROVADO DIRETAMENTE |
| gravações do mesmo capítulo são serializadas internamente | `enqueueChapterOp` no StorageManager real | 🟨 EXECUTADO INDIRETAMENTE pelo smoke; sem assertion temporal da fila |
| quarto cenário representa um cache hit real | não há lookup/hit de cache no estímulo local; é `savePageResult` direto | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| assetId do restore aponta para blob recuperável/correto | este smoke não chama `getAssetBlob/getPageDataUrl` para cruzar o restore | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |

Há E2E separado em `tests/e2e/cache-and-storage.spec.js` que exercita GTC hit e reaplicação de `restoreMap` no navegador; isso não transforma o quarto cenário deste arquivo em prova de cache hit.

## 5. Invariantes

1. `fake-indexeddb/auto` deve carregar antes do StorageManager.
2. As dez gravações iniciais devem compartilhar `chapterId` e possuir índices/clean URLs distintos.
3. O teste não deve serializar manualmente as chamadas antes de `savePageResult`; a fila pertence à implementação sob teste.
4. Sucesso de `Promise.all` sozinho não basta: o estado final precisa conter todas as páginas.
5. Quantidade 10 e presença individual 0–9 devem continuar verificadas em conjunto.
6. Cada restore esperado precisa existir e preservar o índice lógico da página.
7. O smoke deve continuar importando o StorageManager real, não um stub das APIs testadas.
8. Uma falha deve produzir exit code não-zero para `run-smoke.js`.
9. O quarto cenário só pode ser descrito como “cache hit” se passar por uma superfície real de cache/hit; com o código atual ele prova criação/listagem de restore após save direto.
10. O SHA desta Bíblia só permanece válido enquanto o fonte for `63f904d8ad55e114d130fa2cba395310a997be42`.

## 6. Casos-limite e análise crítica

- **Concorrência no chamador vs. transação:** as dez Promises são criadas de uma vez, porém o StorageManager enfileira operações por capítulo. Isso é justamente o contrato atual para evitar disputa; chamar o teste de “dez transações paralelas” seria incorreto.
- **Resultado de save pouco inspecionado:** a linha 40 só mede o comprimento do resultado. A prova forte vem do estado persistido consultado depois.
- **Restore sem dereference:** `assetId` é exigido como truthy, mas este arquivo não recupera o Blob apontado por ele.
- **Metadados:** width/height/host são fornecidos nas dez gravações, mas não são validados aqui.
- **Quarto cenário sem índice:** a entrada da página 15 é encontrada e tem `assetId`, mas `hitRestore.index === 15` não é verificado.
- **Sem cleanup explícito:** aceitável no fluxo atual porque cada smoke roda em processo Node separado e `fake-indexeddb` é memória do processo; se o runner passar a executar vários smokes no mesmo processo, essa premissa deve ser reavaliada.
- **Chrome local é stub:** migração/compatibilidade com `chrome.storage.local` real não é objetivo deste arquivo.
- **Backend fake:** prova o contrato de IndexedDB da implementação em ambiente compatível; integração com Chromium real é coberta por E2E separado.

## 7. Solicitações ao auditor

- **125-001 — TEST_SEMANTICS_REVIEW — OPEN:** o bloco linhas 61–68 afirma testar “cache hit gerando restore”, mas o estímulo é uma chamada direta a `savePageResult`. O teste comprova criação/listagem de restore após save direto, não um cache lookup/hit. O auditor deve decidir entre renomear o cenário/asserções para o comportamento real ou adicionar um teste separado que atravesse o caminho efetivo de cache e prove que um hit materializa/reaplica restore.
- **125-002 — TEST_REQUIRED — OPEN:** o smoke confirma `assetId` nos restores, mas não dereferencia esses IDs para provar que apontam para assets existentes/corretos, nem verifica `index === 15` no quarto cenário. Há cobertura relacionada em outros testes, porém este contrato local permanece parcial. O auditor deve decidir se essa prova focal é necessária.

## 8. Fonte integral exata

```js
/**
 * smoke-03-chapter-persistence.js
 * Cobre: 10 gravações concorrentes pelo caminho real;
 * mapa de restauração por assetId; cache hit gerando restore.
 */
'use strict';

const assert = require('assert');
require('fake-indexeddb/auto');

global.chrome = {
    storage: {
        local: {
            get: () => Promise.resolve({}),
            set: () => Promise.resolve(),
            remove: () => Promise.resolve(),
        }
    }
};

const sm = require('../../extension/shared/storage-manager.js');

async function run() {
    const chapterId = 'smoke03_concurrency_chapter';
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    console.log('[smoke-03] 1. Disparando 10 gravações concorrentes no mesmo capítulo...');
    const saves = Array.from({ length: 10 }, (_, i) => {
        return sm.savePageResult(
            chapterId,
            i,
            sampleDataUrl,
            `https://site.com/orig/page_${i}.jpg`,
            `https://site.com/clean/page_${i}.jpg`,
            { host: 'site.com', width: 800, height: 1200, index: i }
        );
    });

    const results = await Promise.all(saves);
    assert.strictEqual(results.length, 10, 'Deve concluir as 10 operações');

    console.log('[smoke-03] 2. Verificando sobrevivência das 10 páginas (fim do bug read-modify-write)...');
    const pages = await sm.getChapterPageIndex(chapterId);
    assert.strictEqual(pages.length, 10, `Esperado 10 páginas salvas, obtido ${pages.length}`);
    for (let i = 0; i < 10; i++) {
        assert(pages.some(p => p.pageIndex === i), `Página ${i} deve existir`);
    }
    console.log('  -> 10 de 10 páginas sobreviveram à concorrência');

    console.log('[smoke-03] 3. Verificando mapa de restauração com assetId...');
    const restoreIndex = await sm.getRestoreIndex(chapterId);
    for (let i = 0; i < 10; i++) {
        const cleanUrl = `https://site.com/clean/page_${i}.jpg`;
        const entry = restoreIndex[cleanUrl];
        assert(entry, `Entrada de restauração para ${cleanUrl} deve existir`);
        assert(entry.assetId, 'Entrada de restauração deve conter assetId');
        assert.strictEqual(entry.index, i);
    }
    console.log('  -> Mapa de restauração consistente');

    console.log('[smoke-03] 4. Testando cache hit gerando entrada de restauração...');
    const hitCleanUrl = 'https://site.com/clean/cache_hit_page.jpg';
    await sm.savePageResult(chapterId, 15, sampleDataUrl, 'orig_hit', hitCleanUrl, { host: 'site.com', index: 15 });
    const restoreEntries = await sm.listRestoreEntries([chapterId]);
    const hitRestore = restoreEntries.find(e => e.cleanUrl === hitCleanUrl);
    assert(hitRestore, 'Cache hit deve gerar entrada de restauração correspondente');
    assert(hitRestore.assetId, 'Cache hit deve referenciar assetId');
    console.log('  -> Cache hit gerando restore OK');

    console.log('✅ smoke-03-chapter-persistence passou com sucesso.');
}

run().catch(err => {
    console.error('❌ Falha em smoke-03-chapter-persistence:', err);
    process.exit(1);
});
```

## 9. Cobertura linha a linha


### Linha 1

**Fonte:** `/**`

**O que faz:** Abre o comentário de cabeçalho do smoke.

**Como se encaixa:** Esta posição pertence ao bloco de **cabeçalho e modo de execução** e define intenção e disciplina do arquivo antes das dependências.

**Por que assim:** O desenho busca deixar explícito o escopo de regressão e evitar semântica permissiva do JavaScript.

**Risco se alterada:** um comentário impreciso pode induzir interpretação errada; strict mode removido reduz proteção do harness.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 2

**Fonte:** ` * smoke-03-chapter-persistence.js`

**O que faz:** Identifica o próprio arquivo no comentário de cabeçalho.

**Como se encaixa:** Esta posição pertence ao bloco de **cabeçalho e modo de execução** e define intenção e disciplina do arquivo antes das dependências.

**Por que assim:** O desenho busca deixar explícito o escopo de regressão e evitar semântica permissiva do JavaScript.

**Risco se alterada:** um comentário impreciso pode induzir interpretação errada; strict mode removido reduz proteção do harness.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — package.json e run-smoke.js conectam este nome de arquivo ao comando oficial de smoke.

### Linha 3

**Fonte:** ` * Cobre: 10 gravações concorrentes pelo caminho real;`

**O que faz:** Declara a intenção de cobrir dez gravações iniciadas concorrentemente pelo chamador.

**Como se encaixa:** Esta posição pertence ao bloco de **cabeçalho e modo de execução** e define intenção e disciplina do arquivo antes das dependências.

**Por que assim:** O desenho busca deixar explícito o escopo de regressão e evitar semântica permissiva do JavaScript.

**Risco se alterada:** um comentário impreciso pode induzir interpretação errada; strict mode removido reduz proteção do harness.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 4

**Fonte:** ` * mapa de restauração por assetId; cache hit gerando restore.`

**O que faz:** Declara cobertura de restore por assetId e chama o último cenário de “cache hit”.

**Como se encaixa:** Esta posição pertence ao bloco de **cabeçalho e modo de execução** e define intenção e disciplina do arquivo antes das dependências.

**Por que assim:** O desenho busca deixar explícito o escopo de regressão e evitar semântica permissiva do JavaScript.

**Risco se alterada:** um comentário impreciso pode induzir interpretação errada; strict mode removido reduz proteção do harness.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 5

**Fonte:** ` */`

**O que faz:** Fecha o comentário de cabeçalho.

**Como se encaixa:** Esta posição pertence ao bloco de **cabeçalho e modo de execução** e define intenção e disciplina do arquivo antes das dependências.

**Por que assim:** O desenho busca deixar explícito o escopo de regressão e evitar semântica permissiva do JavaScript.

**Risco se alterada:** um comentário impreciso pode induzir interpretação errada; strict mode removido reduz proteção do harness.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 6

**Fonte:** `'use strict';`

**O que faz:** Ativa strict mode para o processo Node do smoke.

**Como se encaixa:** Esta posição pertence ao bloco de **cabeçalho e modo de execução** e define intenção e disciplina do arquivo antes das dependências.

**Por que assim:** O desenho busca deixar explícito o escopo de regressão e evitar semântica permissiva do JavaScript.

**Risco se alterada:** um comentário impreciso pode induzir interpretação errada; strict mode removido reduz proteção do harness.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 7

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 8

**Fonte:** `const assert = require('assert');`

**O que faz:** Importa assert, usado para todas as verificações executáveis do arquivo.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 9

**Fonte:** `require('fake-indexeddb/auto');`

**O que faz:** Carrega fake-indexeddb/auto antes do StorageManager, instalando IndexedDB/IDBKeyRange compatíveis no ambiente Node.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 10

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 11

**Fonte:** `global.chrome = {`

**O que faz:** Começa o mock mínimo de global.chrome exigido pelos caminhos de compatibilidade do StorageManager.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 12

**Fonte:** `    storage: {`

**O que faz:** Cria o namespace chrome.storage.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 13

**Fonte:** `        local: {`

**O que faz:** Cria chrome.storage.local.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 14

**Fonte:** `            get: () => Promise.resolve({}),`

**O que faz:** Implementa get() como Promise resolvida com objeto vazio, evitando estado legado durante o smoke.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 15

**Fonte:** `            set: () => Promise.resolve(),`

**O que faz:** Implementa set() como Promise resolvida sem persistir dados no mock.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 16

**Fonte:** `            remove: () => Promise.resolve(),`

**O que faz:** Implementa remove() como Promise resolvida sem estado persistente.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 17

**Fonte:** `        }`

**O que faz:** Fecha chrome.storage.local.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 18

**Fonte:** `    }`

**O que faz:** Fecha chrome.storage.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 19

**Fonte:** `};`

**O que faz:** Finaliza o objeto global.chrome.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 20

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 21

**Fonte:** `const sm = require('../../extension/shared/storage-manager.js');`

**O que faz:** Importa a implementação real extension/shared/storage-manager.js depois de preparar IndexedDB e chrome.

**Como se encaixa:** Esta posição pertence ao bloco de **ambiente Node simulado** e instala assert, IndexedDB em memória, chrome mínimo e a implementação real.

**Por que assim:** O desenho busca reproduzir APIs necessárias sem substituir o módulo sob teste.

**Risco se alterada:** carregar o StorageManager antes de fake-indexeddb ou omitir chrome pode testar falha de ambiente, não persistência.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO — package.json e run-smoke.js conectam este nome de arquivo ao comando oficial de smoke.

### Linha 22

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 23

**Fonte:** `async function run() {`

**O que faz:** Declara run(), corpo assíncrono que executa todos os cenários do smoke.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 24

**Fonte:** `    const chapterId = 'smoke03_concurrency_chapter';`

**O que faz:** Usa um chapterId fixo e exclusivo do smoke para agrupar as operações de persistência.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 25

**Fonte:** `    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';`

**O que faz:** Define uma Data URL PNG 1x1 válida reutilizada em todas as gravações.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 26

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 27

**Fonte:** `    console.log('[smoke-03] 1. Disparando 10 gravações concorrentes no mesmo capítulo...');`

**O que faz:** Emite o diagnóstico de início do cenário de dez gravações.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 28

**Fonte:** `    const saves = Array.from({ length: 10 }, (_, i) => {`

**O que faz:** Cria dez Promises chamando savePageResult para índices 0 a 9 sem await intermediário.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 29

**Fonte:** `        return sm.savePageResult(`

**O que faz:** Invoca diretamente savePageResult da implementação real.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 30

**Fonte:** `            chapterId,`

**O que faz:** Passa o mesmo chapterId a todas as dez operações, fazendo o StorageManager usar a fila serializada desse capítulo.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 31

**Fonte:** `            i,`

**O que faz:** Passa o índice i como pageIndex, gerando dez chaves de página distintas.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 32

**Fonte:** `            sampleDataUrl,`

**O que faz:** Passa a mesma imagem PNG válida para todas as gravações.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 33

**Fonte:** `            \`https://site.com/orig/page_${i}.jpg\`,`

**O que faz:** Gera originalUrl distinto por índice.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 34

**Fonte:** `            \`https://site.com/clean/page_${i}.jpg\`,`

**O que faz:** Gera cleanUrl distinto por índice, base do mapa de restauração.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 35

**Fonte:** `            { host: 'site.com', width: 800, height: 1200, index: i }`

**O que faz:** Fornece host, dimensões 800x1200 e index no metadata.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 36

**Fonte:** `        );`

**O que faz:** Fecha a chamada savePageResult do item atual.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 37

**Fonte:** `    });`

**O que faz:** Fecha Array.from e preserva as dez Promises em saves.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 38

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 39

**Fonte:** `    const results = await Promise.all(saves);`

**O que faz:** Espera todas as dez operações; qualquer rejeição faz run() rejeitar imediatamente.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 40

**Fonte:** `    assert.strictEqual(results.length, 10, 'Deve concluir as 10 operações');`

**O que faz:** Confirma que o array resolvido contém dez resultados.

**Como se encaixa:** Esta posição pertence ao bloco de **gravações concorrentes do chamador** e inicia dez saves para o mesmo capítulo e espera o conjunto.

**Por que assim:** O desenho busca reproduzir o padrão que historicamente poderia perder páginas em read-modify-write.

**Risco se alterada:** serializar manualmente no teste esconderia regressão na fila interna do StorageManager.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 41

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de páginas** e mede quantidade e presença de cada pageIndex após as dez gravações.

**Por que assim:** O desenho busca provar que nenhum índice se perdeu ou foi substituído pelo fluxo concorrente do chamador.

**Risco se alterada:** checar apenas Promise.all não provaria persistência final.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 42

**Fonte:** `    console.log('[smoke-03] 2. Verificando sobrevivência das 10 páginas (fim do bug read-modify-write)...');`

**O que faz:** Emite o diagnóstico do cenário que verifica sobrevivência das páginas.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de páginas** e mede quantidade e presença de cada pageIndex após as dez gravações.

**Por que assim:** O desenho busca provar que nenhum índice se perdeu ou foi substituído pelo fluxo concorrente do chamador.

**Risco se alterada:** checar apenas Promise.all não provaria persistência final.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 43

**Fonte:** `    const pages = await sm.getChapterPageIndex(chapterId);`

**O que faz:** Lê o índice de páginas do mesmo capítulo pela implementação real.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de páginas** e mede quantidade e presença de cada pageIndex após as dez gravações.

**Por que assim:** O desenho busca provar que nenhum índice se perdeu ou foi substituído pelo fluxo concorrente do chamador.

**Risco se alterada:** checar apenas Promise.all não provaria persistência final.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 44

**Fonte:** `    assert.strictEqual(pages.length, 10, \`Esperado 10 páginas salvas, obtido ${pages.length}\`);`

**O que faz:** Exige exatamente dez registros de página persistidos.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de páginas** e mede quantidade e presença de cada pageIndex após as dez gravações.

**Por que assim:** O desenho busca provar que nenhum índice se perdeu ou foi substituído pelo fluxo concorrente do chamador.

**Risco se alterada:** checar apenas Promise.all não provaria persistência final.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 45

**Fonte:** `    for (let i = 0; i < 10; i++) {`

**O que faz:** Itera por todos os índices esperados de 0 a 9.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de páginas** e mede quantidade e presença de cada pageIndex após as dez gravações.

**Por que assim:** O desenho busca provar que nenhum índice se perdeu ou foi substituído pelo fluxo concorrente do chamador.

**Risco se alterada:** checar apenas Promise.all não provaria persistência final.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 46

**Fonte:** `        assert(pages.some(p => p.pageIndex === i), \`Página ${i} deve existir\`);`

**O que faz:** Exige que cada pageIndex esperado exista no índice retornado.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de páginas** e mede quantidade e presença de cada pageIndex após as dez gravações.

**Por que assim:** O desenho busca provar que nenhum índice se perdeu ou foi substituído pelo fluxo concorrente do chamador.

**Risco se alterada:** checar apenas Promise.all não provaria persistência final.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 47

**Fonte:** `    }`

**O que faz:** Fecha o loop de verificação dos dez índices.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de páginas** e mede quantidade e presença de cada pageIndex após as dez gravações.

**Por que assim:** O desenho busca provar que nenhum índice se perdeu ou foi substituído pelo fluxo concorrente do chamador.

**Risco se alterada:** checar apenas Promise.all não provaria persistência final.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 48

**Fonte:** `    console.log('  -> 10 de 10 páginas sobreviveram à concorrência');`

**O que faz:** Registra sucesso da sobrevivência das dez páginas.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de páginas** e mede quantidade e presença de cada pageIndex após as dez gravações.

**Por que assim:** O desenho busca provar que nenhum índice se perdeu ou foi substituído pelo fluxo concorrente do chamador.

**Risco se alterada:** checar apenas Promise.all não provaria persistência final.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 49

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 50

**Fonte:** `    console.log('[smoke-03] 3. Verificando mapa de restauração com assetId...');`

**O que faz:** Emite o diagnóstico do cenário de mapa de restauração.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 51

**Fonte:** `    const restoreIndex = await sm.getRestoreIndex(chapterId);`

**O que faz:** Lê getRestoreIndex() da implementação real para o capítulo.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 52

**Fonte:** `    for (let i = 0; i < 10; i++) {`

**O que faz:** Itera novamente pelos índices 0 a 9.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 53

**Fonte:** `        const cleanUrl = \`https://site.com/clean/page_${i}.jpg\`;`

**O que faz:** Reconstrói a cleanUrl usada na gravação daquele índice.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 54

**Fonte:** `        const entry = restoreIndex[cleanUrl];`

**O que faz:** Consulta a entrada correspondente no objeto restoreIndex.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 55

**Fonte:** `        assert(entry, \`Entrada de restauração para ${cleanUrl} deve existir\`);`

**O que faz:** Exige que exista uma entrada de restauração para cada cleanUrl.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 56

**Fonte:** `        assert(entry.assetId, 'Entrada de restauração deve conter assetId');`

**O que faz:** Exige que cada entrada contenha assetId truthy.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 57

**Fonte:** `        assert.strictEqual(entry.index, i);`

**O que faz:** Exige que o campo index do restore corresponda exatamente ao índice salvo.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 58

**Fonte:** `    }`

**O que faz:** Fecha o loop de validação do mapa.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 59

**Fonte:** `    console.log('  -> Mapa de restauração consistente');`

**O que faz:** Registra sucesso do mapa de restauração.

**Como se encaixa:** Esta posição pertence ao bloco de **índice de restauração** e cruza cada cleanUrl com assetId e index.

**Por que assim:** O desenho busca provar que a persistência também cria metadados de restauração coerentes.

**Risco se alterada:** validar apenas páginas deixaria restoreEntries sem cobertura.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 60

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 61

**Fonte:** `    console.log('[smoke-03] 4. Testando cache hit gerando entrada de restauração...');`

**O que faz:** Rotula o quarto cenário como teste de “cache hit gerando restore”.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 62

**Fonte:** `    const hitCleanUrl = 'https://site.com/clean/cache_hit_page.jpg';`

**O que faz:** Define uma cleanUrl exclusiva para o quarto cenário.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 63

**Fonte:** `    await sm.savePageResult(chapterId, 15, sampleDataUrl, 'orig_hit', hitCleanUrl, { host: 'site.com', index: 15 });`

**O que faz:** Chama savePageResult diretamente para pageIndex 15; não executa lookup/hit de cache antes dessa gravação.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 64

**Fonte:** `    const restoreEntries = await sm.listRestoreEntries([chapterId]);`

**O que faz:** Lista entradas de restore filtradas pelo chapterId.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 65

**Fonte:** `    const hitRestore = restoreEntries.find(e => e.cleanUrl === hitCleanUrl);`

**O que faz:** Procura a entrada cuja cleanUrl é a usada na gravação direta da linha 63.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 66

**Fonte:** `    assert(hitRestore, 'Cache hit deve gerar entrada de restauração correspondente');`

**O que faz:** Exige que a entrada correspondente exista.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 67

**Fonte:** `    assert(hitRestore.assetId, 'Cache hit deve referenciar assetId');`

**O que faz:** Exige que a entrada encontrada contenha assetId truthy.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 68

**Fonte:** `    console.log('  -> Cache hit gerando restore OK');`

**O que faz:** Registra o cenário como cache hit bem-sucedido, embora o estímulo local seja um save direto.

**Como se encaixa:** Esta posição pertence ao bloco de **listagem de restore adicional** e faz um save direto no índice 15 e o encontra por listRestoreEntries.

**Por que assim:** O desenho busca exercitar a API de listagem filtrada por capítulo.

**Risco se alterada:** rotular esse estímulo como cache hit pode prometer cobertura que o código local não executa.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 69

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 70

**Fonte:** `    console.log('✅ smoke-03-chapter-persistence passou com sucesso.');`

**O que faz:** Emite a mensagem global de sucesso do smoke.

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 71

**Fonte:** `}`

**O que faz:** Fecha run().

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 72

**Fonte:** `␤ [linha vazia]`

**O que faz:** Separa visualmente dois blocos lógicos sem executar código.

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

### Linha 73

**Fonte:** `run().catch(err => {`

**O que faz:** Invoca run() e instala tratamento de rejeição no topo do processo.

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 74

**Fonte:** `    console.error('❌ Falha em smoke-03-chapter-persistence:', err);`

**O que faz:** Escreve o erro do smoke em stderr quando qualquer await/assertion falha.

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 75

**Fonte:** `    process.exit(1);`

**O que faz:** Encerra o processo com código 1 em caso de falha.

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** ✅ PROVADO DIRETAMENTE — esta assertion/caminho usa a implementação real de storage-manager.js e o mesmo blob deste smoke foi executado com sucesso no job Smoke Tests da CI #36577447500.

### Linha 76

**Fonte:** `});`

**O que faz:** Fecha o catch da execução.

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — a posição participa do smoke real descoberto por run-smoke.js; não há assertion isolada sobre esta linha estrutural.

### Linha 77

**Fonte:** `␤ [newline final]`

**O que faz:** Representa o newline final do arquivo.

**Como se encaixa:** Esta posição pertence ao bloco de **finalização e propagação de falha** e só imprime sucesso ao fim e converte rejeições em exit 1.

**Por que assim:** O desenho busca permitir que run-smoke.js detecte a falha pelo status do processo.

**Risco se alterada:** engolir a rejeição faria o runner considerar um smoke quebrado como verde.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição documental/estrutural sem propriedade de runtime isolada.

## 10. Conclusão documental

As **77 posições** do blob auditado estão documentadas em ordem, incluindo linhas vazias e newline final. A fonte integral foi incorporada diretamente do blob `63f904d8ad55e114d130fa2cba395310a997be42`. O arquivo tem prova real de execução em CI sobre o mesmo SHA e assertions fortes para sobrevivência das dez páginas e restauração; as duas lacunas de semântica/prova foram preservadas como solicitações ao auditor sem alterar o teste.

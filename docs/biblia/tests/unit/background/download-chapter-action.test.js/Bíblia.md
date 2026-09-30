# Bíblia técnica — tests/unit/background/download-chapter-action.test.js

> **Estado documental:** ✅ AUTOAUDITORIA APROVADA PELO AGENTE 4  
> **SHA auditado:** `ff0ecb6249b24b8453bc886df4724be27f492e10`  
> **Agente:** AGENTE 4  
> **Tipo:** teste Jest unitário/integrado do router + action real de download de capítulo  
> **Linhas textuais:** **56**  
> **Posições documentais:** **57**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este teste valida `extension/background/actions/download-chapter.js` através de `extension/background/router.js` real. Diferentemente de testes que duplicam a lógica em funções locais, ele carrega os dois módulos de produção por `jest.isolateModules`, deixa a action se registrar no registry real e chama `createMessageRouter`.

As bordas externas são substituídas por mocks:

- `chrome.downloads.search`;
- `chrome.downloads.show`;
- `context.handleMarkerAndShow`;
- `context.downloadImagesAndShow`.

Isso dá boa força para decisões internas da action/roteador sem iniciar downloads reais.

## 2. Contrato da action real

`download-chapter.js` registra `name: 'download-chapter'` com `allowedSources: ['any']`.

O router mapeia **duas ações legadas/canônicas de mensagem** para essa action:

- `DOWNLOAD_CHAPTER_AND_SHOW` → `download-chapter`;
- `OPEN_CHAPTER_FOLDER` → `download-chapter`.

A action possui três caminhos principais:

1. **anchorId existente e download ainda existe**  
   `chrome.downloads.search({id: anchorId})` → `chrome.downloads.show(anchorId)` → resolve ok.

2. **sem anchor válido e images não vazio**  
   fallback → `downloadImagesAndShow(images, safeTitle, chapId)` → resolve ok.

3. **sem anchor válido e images vazio**  
   fallback → `handleMarkerAndShow(safeTitle, resolve)`.

Erros lançados/rejeições da action são capturados pelo bloco assíncrono do router e transformados em `{ok:false,error:{code:'INTERNAL_ERROR',...}}`.

## 3. O que os dois testes provam

### Caso 1 — marcador existente

O teste usa a mensagem `OPEN_CHAPTER_FOLDER`, configura search para retornar `[{id:31, exists:true}]` e prova diretamente:

- o alias do router chega à action registrada;
- `chrome.downloads.show(31)` é chamado;
- `downloadImagesAndShow` não é chamado;
- o listener retorna `true` para manter o canal assíncrono;
- a resposta final é `{ok:true}`.

**Lacuna precisa:** o mock de `search` ignora `_query`; portanto uma regressão que pesquisasse o id errado poderia continuar verde. Falta `expect(chrome.downloads.search).toHaveBeenCalledWith({id:31}, expect.any(Function))` ou equivalente.

### Caso 2 — download de páginas

O teste usa `DOWNLOAD_CHAPTER_AND_SHOW` sem `anchorId` e prova diretamente:

- o segundo alias do router chega à mesma action;
- o fallback chama `downloadImagesAndShow`;
- recebe exatamente `images`, `'Capítulo 2'` e `'chap-2'`;
- o router mantém canal assíncrono e retorna ok.

## 4. Evidência e força

| Propriedade | Evidência | Classificação |
|---|---|---|
| router carrega action real | require de router + action dentro de isolateModules | ✅ PROVADO DIRETAMENTE |
| OPEN_CHAPTER_FOLDER mapeia para download-chapter | dispatch real + assertions finais | ✅ PROVADO DIRETAMENTE |
| anchor existente chama show(anchorId) | `expect(show).toHaveBeenCalledWith(31)` | ✅ PROVADO DIRETAMENTE |
| anchor existente não chama downloadImagesAndShow | assertion negativa explícita | ✅ PROVADO DIRETAMENTE |
| DOWNLOAD_CHAPTER_AND_SHOW baixa pages sem anchor | spy com argumentos exatos | ✅ PROVADO DIRETAMENTE |
| listener async retorna keepAlive=true e response ok | igualdade exata nos dois casos | ✅ PROVADO DIRETAMENTE |
| search recebe query `{id:31}` | mock ignora argumento e não há assertion | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| anchorId presente mas search vazio/exists=false cai em fallback | nenhum caso correspondente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| images vazio chama handleMarkerAndShow | nenhum caso correspondente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| downloadImagesAndShow rejeita e router responde INTERNAL_ERROR | nenhum caso correspondente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| handleMarkerAndShow erro/callback | nenhum caso correspondente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

A suíte pertence ao projeto Jest **background** porque `jest.config.js` inclui `tests/unit/background/**/*.test.js`; `package.json#test:unit:background` e o runner CI incluem esse projeto.

## 5. Casos-limite não cobertos

1. `anchorId` truthy, mas `downloads.search` retorna `[]`.
2. resultado `[{exists:false}]`.
3. fallback com `images = {}`.
4. `downloadImagesAndShow` rejeita.
5. `request.images` ausente faz `Object.keys(undefined)` lançar e deveria ser convertido pelo router em INTERNAL_ERROR.
6. verificação da query exata passada a `downloads.search`.
7. efeito/retorno do `handleMarkerAndShow`.
8. exceção síncrona de `chrome.downloads.search/show`.

## 6. Solicitações ao auditor

### 140-001 — TEST_REQUIRED — fallback e marker

Adicionar casos usando a implementação real para anchor inexistente/exists=false, cobrindo tanto images não vazio quanto images vazio/handleMarkerAndShow.

### 140-002 — ASSERTION_GAP — query de downloads.search

O caso existente deve provar que search recebe exatamente `{id: request.anchorId}`; hoje o mock ignora o argumento.

### 140-003 — ERROR_PATH_TEST — erro assíncrono

Adicionar caso de `downloadImagesAndShow` rejeitado e confirmar que o router responde `INTERNAL_ERROR` sem falso ok.

## 7. Invariantes

1. O teste deve continuar carregando router/action reais, não cópias locais.
2. Ambos os aliases de mensagem devem continuar resolvendo para `download-chapter`.
3. Anchor existente deve priorizar reuso/show e evitar redownload.
4. Anchor inexistente deve cair no fallback correto.
5. Fallback com images deve delegar os três argumentos sem reescrita.
6. Fallback sem images deve delegar ao marker helper.
7. Falha da action não deve produzir resposta ok.
8. O canal assíncrono deve permanecer aberto quando a action é async.
9. Mocks devem verificar argumentos relevantes, não apenas devolver valores independentemente da chamada.
10. Esta Bíblia vale para o blob `ff0ecb6249b24b8453bc886df4724be27f492e10`.

## 8. Fonte integral exata

~~~javascript
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/download-chapter.js');

function loadRouter() {
    global.self = global;
    global.chrome = {
        runtime: { id: 'test-extension-id' },
        downloads: { search: jest.fn(), show: jest.fn() },
    };
    delete global.MangaTranslatorRouter;
    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(ACTION_PATH);
    });
    return global.MangaTranslatorRouter;
}

function dispatch(listener, request) {
    return new Promise(resolve => {
        let keepAlive;
        keepAlive = listener(request, { tab: { id: 2, url: 'https://reader.example/chapter' } }, response => {
            resolve({ keepAlive, response });
        });
    });
}

describe('background/actions/download-chapter.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('reusa o marcador de capítulo existente', async () => {
        const router = loadRouter();
        chrome.downloads.search.mockImplementation((_query, callback) => callback([{ id: 31, exists: true }]));
        const downloadImagesAndShow = jest.fn();
        const result = await dispatch(router.createMessageRouter({
            contextFactory: () => ({ handleMarkerAndShow: jest.fn(), downloadImagesAndShow }),
        }), { action: 'OPEN_CHAPTER_FOLDER', anchorId: 31, images: {}, safeTitle: 'Capítulo 1' });

        expect(chrome.downloads.show).toHaveBeenCalledWith(31);
        expect(downloadImagesAndShow).not.toHaveBeenCalled();
        expect(result).toEqual({ keepAlive: true, response: { ok: true } });
    });

    test('baixa páginas quando o marcador não existe', async () => {
        const router = loadRouter();
        const images = { 0: 'data:image/png;base64,AA' };
        const downloadImagesAndShow = jest.fn().mockResolvedValue();
        const result = await dispatch(router.createMessageRouter({
            contextFactory: () => ({ handleMarkerAndShow: jest.fn(), downloadImagesAndShow }),
        }), { action: 'DOWNLOAD_CHAPTER_AND_SHOW', images, safeTitle: 'Capítulo 2', chapId: 'chap-2' });

        expect(downloadImagesAndShow).toHaveBeenCalledWith(images, 'Capítulo 2', 'chap-2');
        expect(result).toEqual({ keepAlive: true, response: { ok: true } });
    });
});
~~~

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** <code>const path = require('path');</code>

**O que faz:** Importa path, usado para resolver módulos reais a partir da localização do teste.

**Como e por que:** Usar caminhos absolutos derivados de __dirname garante que o teste carregue os arquivos reais independentemente do cwd. Hardcode de cwd seria mais frágil.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte ao carregar; paths incorretos impediriam os testes de chegar às assertions.
### Linha/posição 2

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa import das constantes de caminho.

**Como e por que:** Usar caminhos absolutos derivados de __dirname garante que o teste carregue os arquivos reais independentemente do cwd. Hardcode de cwd seria mais frágil.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte ao carregar; paths incorretos impediriam os testes de chegar às assertions.
### Linha/posição 3

**Fonte:** <code>const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');</code>

**O que faz:** Resolve o caminho absoluto do router real da extensão.

**Como e por que:** Usar caminhos absolutos derivados de __dirname garante que o teste carregue os arquivos reais independentemente do cwd. Hardcode de cwd seria mais frágil.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte ao carregar; paths incorretos impediriam os testes de chegar às assertions.
### Linha/posição 4

**Fonte:** <code>const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/download-chapter.js');</code>

**O que faz:** Resolve o caminho absoluto da action real download-chapter.

**Como e por que:** Usar caminhos absolutos derivados de __dirname garante que o teste carregue os arquivos reais independentemente do cwd. Hardcode de cwd seria mais frágil.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte ao carregar; paths incorretos impediriam os testes de chegar às assertions.
### Linha/posição 5

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa paths do helper de carregamento.

**Como e por que:** Usar caminhos absolutos derivados de __dirname garante que o teste carregue os arquivos reais independentemente do cwd. Hardcode de cwd seria mais frágil.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela própria suíte ao carregar; paths incorretos impediriam os testes de chegar às assertions.
### Linha/posição 6

**Fonte:** <code>function loadRouter() {</code>

**O que faz:** Declara loadRouter(), fixture que reinstala router/action reais em isolamento Jest.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 7

**Fonte:** <code>    global.self = global;</code>

**O que faz:** Aponta self para global, compatibilizando o IIFE dos módulos de background com Node/Jest.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 8

**Fonte:** <code>    global.chrome = {</code>

**O que faz:** Inicia um chrome mock mínimo no global.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 9

**Fonte:** <code>        runtime: { id: 'test-extension-id' },</code>

**O que faz:** Fornece chrome.runtime.id usado pelo roteador para identificar origem popup quando necessário.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 10

**Fonte:** <code>        downloads: { search: jest.fn(), show: jest.fn() },</code>

**O que faz:** Fornece spies de chrome.downloads.search/show usados pela action.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 11

**Fonte:** <code>    };</code>

**O que faz:** Fecha o chrome mock.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 12

**Fonte:** <code>    delete global.MangaTranslatorRouter;</code>

**O que faz:** Remove eventual MangaTranslatorRouter anterior para evitar registry antigo.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 13

**Fonte:** <code>    jest.isolateModules(() =&gt; {</code>

**O que faz:** Abre jest.isolateModules para cache de módulos isolado nesta carga.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 14

**Fonte:** <code>        require(ROUTER_PATH);</code>

**O que faz:** Carrega router.js real, que cria registry e createMessageRouter.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 15

**Fonte:** <code>        require(ACTION_PATH);</code>

**O que faz:** Carrega download-chapter.js real, que registra a action no router acabado de carregar.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 16

**Fonte:** <code>    });</code>

**O que faz:** Fecha isolateModules.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 17

**Fonte:** <code>    return global.MangaTranslatorRouter;</code>

**O que faz:** Retorna o router real registrado em global.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 18

**Fonte:** <code>}</code>

**O que faz:** Fecha loadRouter.

**Como e por que:** O isolamento de módulos evita que o registry global/cache de require de uma execução contamine a seguinte. Um mock da action seria pior porque deixaria de provar o código auditado de produção.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no sentido de que os dois testes executam os módulos reais carregados por este helper.
### Linha/posição 19

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa helpers.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 20

**Fonte:** <code>function dispatch(listener, request) {</code>

**O que faz:** Declara dispatch(listener, request), adaptando callback chrome.runtime para Promise testável.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 21

**Fonte:** <code>    return new Promise(resolve =&gt; {</code>

**O que faz:** Cria Promise que resolve quando sendResponse for chamado.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 22

**Fonte:** <code>        let keepAlive;</code>

**O que faz:** Declara keepAlive para capturar o retorno síncrono do listener.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 23

**Fonte:** <code>        keepAlive = listener(request, { tab: { id: 2, url: 'https://reader.example/chapter' } }, response =&gt; {</code>

**O que faz:** Invoca o listener com request e sender de content tab fixa.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 24

**Fonte:** <code>            resolve({ keepAlive, response });</code>

**O que faz:** Resolve a Promise com keepAlive e payload de response.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 25

**Fonte:** <code>        });</code>

**O que faz:** Fecha callback sendResponse.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 26

**Fonte:** <code>    });</code>

**O que faz:** Fecha Promise.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 27

**Fonte:** <code>}</code>

**O que faz:** Fecha dispatch.

**Como e por que:** A adaptação preserva o contrato de listener Chrome: retorno síncrono keepAlive e resposta assíncrona por callback. Testar apenas execute() perderia a integração com o router.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE pelos resultados keepAlive/response assertados em ambos os casos.
### Linha/posição 28

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa helpers da suíte.

**Como e por que:** Agrupa cleanup e casos no projeto Jest background. Cleanup mais amplo poderia esconder dependências; cleanup insuficiente pode deixar globals, embora cada load reatribua chrome/self.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; não há assertion específica sobre cleanup global.
### Linha/posição 29

**Fonte:** <code>describe('background/actions/download-chapter.js', () =&gt; {</code>

**O que faz:** Abre describe específico de background/actions/download-chapter.js.

**Como e por que:** Agrupa cleanup e casos no projeto Jest background. Cleanup mais amplo poderia esconder dependências; cleanup insuficiente pode deixar globals, embora cada load reatribua chrome/self.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; não há assertion específica sobre cleanup global.
### Linha/posição 30

**Fonte:** <code>    afterEach(() =&gt; delete global.MangaTranslatorRouter);</code>

**O que faz:** Após cada teste, remove apenas o router global registrado.

**Como e por que:** Agrupa cleanup e casos no projeto Jest background. Cleanup mais amplo poderia esconder dependências; cleanup insuficiente pode deixar globals, embora cada load reatribua chrome/self.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; não há assertion específica sobre cleanup global.
### Linha/posição 31

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa setup do primeiro teste.

**Como e por que:** Agrupa cleanup e casos no projeto Jest background. Cleanup mais amplo poderia esconder dependências; cleanup insuficiente pode deixar globals, embora cada load reatribua chrome/self.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelo lifecycle Jest; não há assertion específica sobre cleanup global.
### Linha/posição 32

**Fonte:** <code>    test('reusa o marcador de capítulo existente', async () =&gt; {</code>

**O que faz:** Declara caso em que OPEN_CHAPTER_FOLDER reutiliza marcador/download existente.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 33

**Fonte:** <code>        const router = loadRouter();</code>

**O que faz:** Carrega router/action reais para o caso.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 34

**Fonte:** <code>        chrome.downloads.search.mockImplementation((_query, callback) =&gt; callback([{ id: 31, exists: true }]));</code>

**O que faz:** Configura downloads.search para devolver download id 31 existente; o mock ignora a query recebida.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 35

**Fonte:** <code>        const downloadImagesAndShow = jest.fn();</code>

**O que faz:** Cria spy downloadImagesAndShow para provar que fallback não deve rodar.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 36

**Fonte:** <code>        const result = await dispatch(router.createMessageRouter({</code>

**O que faz:** Despacha ação real pelo createMessageRouter.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 37

**Fonte:** <code>            contextFactory: () =&gt; ({ handleMarkerAndShow: jest.fn(), downloadImagesAndShow }),</code>

**O que faz:** Injeta contextFactory com handleMarkerAndShow mock e spy downloadImagesAndShow.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 38

**Fonte:** <code>        }), { action: 'OPEN_CHAPTER_FOLDER', anchorId: 31, images: {}, safeTitle: 'Capítulo 1' });</code>

**O que faz:** Envia OPEN_CHAPTER_FOLDER com anchorId 31, images vazio e título seguro.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 39

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa execução das assertions.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 40

**Fonte:** <code>        expect(chrome.downloads.show).toHaveBeenCalledWith(31);</code>

**O que faz:** Exige chrome.downloads.show chamado com anchorId 31.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 41

**Fonte:** <code>        expect(downloadImagesAndShow).not.toHaveBeenCalled();</code>

**O que faz:** Exige que downloadImagesAndShow não seja chamado no caminho de anchor existente.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 42

**Fonte:** <code>        expect(result).toEqual({ keepAlive: true, response: { ok: true } });</code>

**O que faz:** Exige keepAlive=true e resposta ok do roteador assíncrono.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 43

**Fonte:** <code>    });</code>

**O que faz:** Fecha primeiro teste.

**Como e por que:** Exercita router e action reais com borda chrome.downloads mockada. Isso permite provar a decisão de reuso sem iniciar downloads reais.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para reuso de anchor existente, show(31), ausência de downloadImagesAndShow e resposta do router. ⚠️ A query de search não é assertada.
### Linha/posição 44

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa testes.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 45

**Fonte:** <code>    test('baixa páginas quando o marcador não existe', async () =&gt; {</code>

**O que faz:** Declara caso sem anchor que baixa páginas.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 46

**Fonte:** <code>        const router = loadRouter();</code>

**O que faz:** Carrega novamente router/action reais.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 47

**Fonte:** <code>        const images = { 0: 'data:image/png;base64,AA' };</code>

**O que faz:** Cria mapa de uma imagem data URL.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 48

**Fonte:** <code>        const downloadImagesAndShow = jest.fn().mockResolvedValue();</code>

**O que faz:** Cria downloadImagesAndShow async resolvido.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 49

**Fonte:** <code>        const result = await dispatch(router.createMessageRouter({</code>

**O que faz:** Despacha a ação DOWNLOAD_CHAPTER_AND_SHOW pelo router real.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 50

**Fonte:** <code>            contextFactory: () =&gt; ({ handleMarkerAndShow: jest.fn(), downloadImagesAndShow }),</code>

**O que faz:** Injeta mocks de contexto necessários à action.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 51

**Fonte:** <code>        }), { action: 'DOWNLOAD_CHAPTER_AND_SHOW', images, safeTitle: 'Capítulo 2', chapId: 'chap-2' });</code>

**O que faz:** Envia images, safeTitle e chapId sem anchorId.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 52

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Separa execução das assertions.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 53

**Fonte:** <code>        expect(downloadImagesAndShow).toHaveBeenCalledWith(images, 'Capítulo 2', 'chap-2');</code>

**O que faz:** Exige downloadImagesAndShow chamado com exatamente images, título e chapId.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 54

**Fonte:** <code>        expect(result).toEqual({ keepAlive: true, response: { ok: true } });</code>

**O que faz:** Exige keepAlive=true e response ok.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 55

**Fonte:** <code>    });</code>

**O que faz:** Fecha segundo teste.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 56

**Fonte:** <code>});</code>

**O que faz:** Fecha describe.

**Como e por que:** Exercita o branch sem anchor usando action real e um context helper mock. O spy permite afirmar os argumentos exatos sem side effect de filesystem/download.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE para downloadImagesAndShow(images, título, chapId) e resposta ok. ⚠️ Caminho images vazio/fallback marker e erros não são cobertos.
### Linha/posição 57

**Fonte:** <code>␤ [posição vazia/newline final ou separação]</code>

**O que faz:** Representa newline final do blob.

**Como e por que:** Mantém convenção textual e contagem posicional auditada.

**Por que uma alternativa ingênua seria pior:** substituir o módulo real por lógica copiada reduziria força probatória; para linhas estruturais, remover separação/cleanup sem necessidade diminuiria legibilidade ou isolamento.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — propriedade textual.

## 10. Análise crítica

A estrutura do teste é tecnicamente sólida: ele passa pela resolução de alias, registry, contextFactory e wrapper async do router, o que dá mais valor que chamar apenas `execute` ou duplicar a action. As duas assertions de resposta também garantem que a composição `sendResponse({ok:true,...result})` mantém o contrato esperado.

A principal fraqueza é **cobertura de branches**, não autenticidade da implementação. A action possui fallback interno bifurcado por quantidade de imagens e um branch específico de anchor ausente/inválido; os dois testes atuais atingem apenas anchor existente e download direto sem anchor.

A segunda fraqueza é uma assertion pouco estrita no mock de search. Como `_query` é ignorada, o teste prova a reação ao callback, mas não prova que a action procurou o anchor correto. Essa é exatamente a classe de regressão que um teste unitário com spy deveria detectar.

## 11. Autoauditoria — AGENTE 4

- Reserva #140 confirmada como **AGENTE 4**.
- State #140 confirmado como **IN_PROGRESS / AGENTE 4** antes da escrita.
- SHA do fonte reconfirmado: `ff0ecb6249b24b8453bc886df4724be27f492e10`.
- Action real `download-chapter.js` e router real foram lidos.
- Jest config e wiring npm foram conferidos.
- Fonte integral embutida sem transformação.
- **57/57 posições** documentadas sequencialmente.
- Nenhum teste/código externo foi modificado para produzir evidência.
- Lacunas serão persistidas no state como audit_requests.

**Conclusão documental:** os dois caminhos testados possuem evidência direta forte porque usam implementação real; os branches não visitados e a query não assertada permanecem explicitamente sem prova.

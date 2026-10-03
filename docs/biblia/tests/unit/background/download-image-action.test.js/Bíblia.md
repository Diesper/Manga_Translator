# Bíblia técnica — tests/unit/background/download-image-action.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 8  
> **SHA auditado:** 9305ba72e1d62406128ce7a5cd77b945a0b44c83  
> **Índice:** 141  
> **Linhas textuais:** 52 — **posições:** 53 com newline final  
> **PR:** #66 — **branch:** docs/project-bible

## 1. Papel do teste

Este arquivo é um teste unitário de integração leve entre o router real e a action real `extension/background/actions/download-image.js`. Ele registra ambos via `jest.isolateModules`, injeta apenas `waitForDownload` no contexto e mantém `chrome.downloads` como mock controlado.

A propriedade diretamente provada é o happy path legado: request `DOWNLOAD_IMAGE` com filename sem prefixo gera download em `MangaTranslator/...`, espera conclusão pelo helper injetado, consulta o download final e responde com `filePath` e `downloadId`.

## 2. Implementação real auditada

A action estava no SHA `408102f057ab6a584314e9108b9f4329440204bb`. Ela registra `download-image` com `allowedSources: ['any']`, prefixa `filename` se necessário, chama `chrome.downloads.download`, trata `runtime.lastError`/id indefinido, chama `context.waitForDownload`, usa `chrome.downloads.search` no sucesso e converte o callback de erro de wait em `{ error: err.message }`.

O router estava no SHA `d9278e9e58e4e9583a30c16227bfd833e7203d89`. `DOWNLOAD_IMAGE` resolve para `download-image`; actions async retornam keepAlive `true`, e o router envolve o resultado com `{ok:true,...}` ou converte exceções em `INTERNAL_ERROR`.

## 3. Evidência automatizada

| Contrato | Evidência | Classificação |
|---|---|---|
| action real é registrada no router real | requires de `router.js` + `download-image.js` em isolateModules | 🟨 EXECUTADO INDIRETAMENTE |
| filename sem prefixo recebe `MangaTranslator/` | assertion exata sobre `chrome.downloads.download` | ✅ PROVADO DIRETAMENTE |
| URL é preservada e `saveAs:false` | mesma assertion da chamada | ✅ PROVADO DIRETAMENTE |
| id 41 é passado ao `waitForDownload` com callbacks | assertion `toHaveBeenCalledWith` | ✅ PROVADO DIRETAMENTE |
| conclusão consulta e devolve filename legado + downloadId | mock search + assertion final do response | ✅ PROVADO DIRETAMENTE |
| router mantém canal async aberto | assertion final exige `keepAlive:true` | ✅ PROVADO DIRETAMENTE |
| filename já prefixado não duplica prefixo | nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `downloads.download` com lastError/id undefined | nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `waitForDownload` chama callback de erro | nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `downloads.search` sem resultados | nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| payload inválido/filename ausente | action não possui validate; nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 4. Trust boundaries

O teste não faz download real: Data URL, id e busca são mocks. A action, entretanto, aceita `allowedSources:any`; no runtime real o request cruza o boundary do router e chega a `chrome.downloads`. Como não existe `validate` na action, `url`/`filename` são confiados ao execute.

O helper `dispatch` usa sender content fixo; isso não restringe a action porque `allowedSources` inclui `any`.

## 5. Análise crítica

1. Existe somente um teste e ele é exclusivamente happy path.
2. O ramo que evita prefixo duplicado não é provado.
3. Falha de `downloads.download` e falha de `waitForDownload` não são provadas.
4. `downloads.search` vazio não é provado.
5. `downloads.search` não verifica `chrome.runtime.lastError`; uma falha da API pode ser reduzida ao diagnóstico genérico `Arquivo não encontrado`.
6. A action usa `request.filename.startsWith` sem validate; filename ausente/não-string lança e vira `INTERNAL_ERROR` do router, não erro de payload específico.
7. URL também não possui validação própria antes de ser enviada à API downloads.
8. O helper `dispatch` resolve somente via `sendResponse`; se fosse usado com action sync que retornasse false sem resposta, a Promise permaneceria pendente. Neste teste a action é async, portanto o risco não afeta o cenário atual.

## 6. Solicitações ao auditor

### 141-001 — TEST_REQUIRED — OPEN

Adicionar casos da implementação real para filename já prefixado, falha `downloads.download`, id indefinido, callback de erro do `waitForDownload` e search sem resultados. **Severidade: HIGH.**

### 141-002 — INPUT_VALIDATION_REVIEW — OPEN

Revisar `extension/background/actions/download-image.js`: não há `validate`, e `request.filename.startsWith` lança para payload ausente/não-string. Decidir contrato de `INVALID_PAYLOAD` e validação de URL/filename. **Severidade: NORMAL.**

### 141-003 — ERROR_SEMANTICS_REVIEW — OPEN

Revisar o callback de `chrome.downloads.search`: `chrome.runtime.lastError` não é consultado, então erro da API pode ser reportado como `Arquivo não encontrado`. **Severidade: NORMAL.**

### 141-004 — TEST_HELPER_REVIEW — OPEN

O `dispatch` local não resolve quando listener retorna false sem `sendResponse`; decidir se vale torná-lo robusto para futuros casos sync ou mantê-lo especializado. **Severidade: LOW.**

## 7. Invariantes

1. DOWNLOAD_IMAGE deve continuar resolvendo para a action real.
2. Filename sem prefixo deve receber exatamente `MangaTranslator/` uma vez.
3. `saveAs` deve permanecer false enquanto esse for o contrato legado.
4. O id devolvido por downloads.download deve ser o id aguardado e retornado.
5. A resposta de sucesso deve continuar incluindo caminho final encontrado por downloads.search.
6. Lacunas de erro não podem ser classificadas como provadas pelo happy path.
7. O SHA desta Bíblia vale somente para `9305ba72e1d62406128ce7a5cd77b945a0b44c83`.

## 8. Fonte integral auditada

~~~javascript
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/download-image.js');

function dispatch(listener, request) {
    return new Promise(resolve => {
        let keepAlive;
        const sendResponse = response => resolve({ keepAlive, response });
        keepAlive = listener(request, { tab: { id: 7, url: 'https://reader.example/chapter' } }, sendResponse);
    });
}

describe('background/actions/download-image.js', () => {
    beforeEach(() => {
        jest.resetModules();
        global.self = global;
        global.chrome = {
            runtime: { id: 'test-extension-id', lastError: null },
            downloads: {
                download: jest.fn((_options, callback) => callback(41)),
                search: jest.fn((_query, callback) => callback([{ filename: '/downloads/MangaTranslator/page.png' }])),
            },
        };
        delete global.MangaTranslatorRouter;
        jest.isolateModules(() => {
            require(ROUTER_PATH);
            require(ACTION_PATH);
        });
    });

    afterEach(() => {
        delete global.MangaTranslatorRouter;
    });

    test('prefixa o arquivo, aguarda a conclusão e devolve o caminho legado', async () => {
        const waitForDownload = jest.fn((id, done) => done(id));
        const router = global.MangaTranslatorRouter;
        const result = await dispatch(router.createMessageRouter({
            contextFactory: () => ({ waitForDownload }),
        }), { action: 'DOWNLOAD_IMAGE', url: 'data:image/png;base64,AA', filename: 'chapter/page.png' });

        expect(global.chrome.downloads.download).toHaveBeenCalledWith({
            url: 'data:image/png;base64,AA', filename: 'MangaTranslator/chapter/page.png', saveAs: false,
        }, expect.any(Function));
        expect(waitForDownload).toHaveBeenCalledWith(41, expect.any(Function), expect.any(Function));
        expect(result).toEqual({
            keepAlive: true,
            response: { ok: true, filePath: '/downloads/MangaTranslator/page.png', downloadId: 41 },
        });
    });
});
~~~

## 9. Cobertura posição por posição

### Linha 001

- **Conteúdo:** `const path = require('path');`
- **Papel:** Importa path para resolver router e action reais.

### Linha 002

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 003

- **Conteúdo:** `const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');`
- **Papel:** Obtém mocks reais de storage/tabs; neste teste somente o ambiente compartilhado de chrome é relevante, embora storage/tabs não sejam usados diretamente no corpo.

### Linha 004

- **Conteúdo:** `const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/download-image.js');`
- **Papel:** Separador visual.

### Linha 005

- **Conteúdo:** _linha em branco_
- **Papel:** Resolve o router real do background.

### Linha 006

- **Conteúdo:** `function dispatch(listener, request) {`
- **Papel:** Resolve a action real download-image.js.

### Linha 007

- **Conteúdo:** `    return new Promise(resolve => {`
- **Papel:** Separador visual.

### Linha 008

- **Conteúdo:** `        let keepAlive;`
- **Papel:** Declara helper dispatch para adaptar callback sendResponse a Promise.

### Linha 009

- **Conteúdo:** `        const sendResponse = response => resolve({ keepAlive, response });`
- **Papel:** Abre Promise resolvida quando sendResponse for chamado.

### Linha 010

- **Conteúdo:** `        keepAlive = listener(request, { tab: { id: 7, url: 'https://reader.example/chapter' } }, sendResponse);`
- **Papel:** Declara keepAlive para capturar o retorno síncrono do listener.

### Linha 011

- **Conteúdo:** `    });`
- **Papel:** Cria sendResponse que resolve a Promise com keepAlive e payload.

### Linha 012

- **Conteúdo:** `}`
- **Papel:** Invoca listener com request e sender content fixo id 7/URL reader; atribui o retorno a keepAlive.

### Linha 013

- **Conteúdo:** _linha em branco_
- **Papel:** Fecha Promise.

### Linha 014

- **Conteúdo:** `describe('background/actions/download-image.js', () => {`
- **Papel:** Fecha dispatch.

### Linha 015

- **Conteúdo:** `    beforeEach(() => {`
- **Papel:** Separador visual.

### Linha 016

- **Conteúdo:** `        jest.resetModules();`
- **Papel:** Agrupa os testes da action real download-image.js.

### Linha 017

- **Conteúdo:** `        global.self = global;`
- **Papel:** Inicia beforeEach.

### Linha 018

- **Conteúdo:** `        global.chrome = {`
- **Papel:** Limpa cache Jest para obter registro novo dos módulos.

### Linha 019

- **Conteúdo:** `            runtime: { id: 'test-extension-id', lastError: null },`
- **Papel:** Faz self apontar para global, compatível com o IIFE dos módulos.

### Linha 020

- **Conteúdo:** `            downloads: {`
- **Papel:** Instala mock mínimo de chrome.

### Linha 021

- **Conteúdo:** `                download: jest.fn((_options, callback) => callback(41)),`
- **Papel:** Define runtime.id/lastError inicial.

### Linha 022

- **Conteúdo:** `                search: jest.fn((_query, callback) => callback([{ filename: '/downloads/MangaTranslator/page.png' }])),`
- **Papel:** Abre chrome.downloads.

### Linha 023

- **Conteúdo:** `            },`
- **Papel:** Mocka downloads.download: chama callback com id 41.

### Linha 024

- **Conteúdo:** `        };`
- **Papel:** Mocka downloads.search: devolve um resultado com filename legado final.

### Linha 025

- **Conteúdo:** `        delete global.MangaTranslatorRouter;`
- **Papel:** Fecha downloads.

### Linha 026

- **Conteúdo:** `        jest.isolateModules(() => {`
- **Papel:** Fecha chrome.

### Linha 027

- **Conteúdo:** `            require(ROUTER_PATH);`
- **Papel:** Remove router global anterior.

### Linha 028

- **Conteúdo:** `            require(ACTION_PATH);`
- **Papel:** Executa requires em isolateModules.

### Linha 029

- **Conteúdo:** `        });`
- **Papel:** Carrega router real.

### Linha 030

- **Conteúdo:** `    });`
- **Papel:** Carrega action real e registra download-image no router.

### Linha 031

- **Conteúdo:** _linha em branco_
- **Papel:** Fecha isolateModules.

### Linha 032

- **Conteúdo:** `    afterEach(() => {`
- **Papel:** Fecha beforeEach.

### Linha 033

- **Conteúdo:** `        delete global.MangaTranslatorRouter;`
- **Papel:** Separador visual.

### Linha 034

- **Conteúdo:** `    });`
- **Papel:** Inicia afterEach.

### Linha 035

- **Conteúdo:** _linha em branco_
- **Papel:** Remove MangaTranslatorRouter global criado pelo teste.

### Linha 036

- **Conteúdo:** `    test('prefixa o arquivo, aguarda a conclusão e devolve o caminho legado', async () => {`
- **Papel:** Fecha afterEach.

### Linha 037

- **Conteúdo:** `        const waitForDownload = jest.fn((id, done) => done(id));`
- **Papel:** Separador visual.

### Linha 038

- **Conteúdo:** `        const router = global.MangaTranslatorRouter;`
- **Papel:** Declara o único caso: prefixo, espera de conclusão e caminho legado.

### Linha 039

- **Conteúdo:** `        const result = await dispatch(router.createMessageRouter({`
- **Papel:** Cria waitForDownload mock que chama o callback de sucesso imediatamente com o id recebido.

### Linha 040

- **Conteúdo:** `            contextFactory: () => ({ waitForDownload }),`
- **Papel:** Obtém a instância do router registrada no global.

### Linha 041

- **Conteúdo:** `        }), { action: 'DOWNLOAD_IMAGE', url: 'data:image/png;base64,AA', filename: 'chapter/page.png' });`
- **Papel:** Despacha DOWNLOAD_IMAGE via createMessageRouter com contextFactory customizado.

### Linha 042

- **Conteúdo:** _linha em branco_
- **Papel:** Injeta waitForDownload no contexto da action.

### Linha 043

- **Conteúdo:** `        expect(global.chrome.downloads.download).toHaveBeenCalledWith({`
- **Papel:** Fecha opções do router e envia request com Data URL + filename sem prefixo.

### Linha 044

- **Conteúdo:** `            url: 'data:image/png;base64,AA', filename: 'MangaTranslator/chapter/page.png', saveAs: false,`
- **Papel:** Separador antes das assertions.

### Linha 045

- **Conteúdo:** `        }, expect.any(Function));`
- **Papel:** Verifica chamada exata de chrome.downloads.download.

### Linha 046

- **Conteúdo:** `        expect(waitForDownload).toHaveBeenCalledWith(41, expect.any(Function), expect.any(Function));`
- **Papel:** Confirma URL original, filename prefixado e saveAs false.

### Linha 047

- **Conteúdo:** `        expect(result).toEqual({`
- **Papel:** Fecha a assertion da chamada download.

### Linha 048

- **Conteúdo:** `            keepAlive: true,`
- **Papel:** Verifica que waitForDownload recebeu id 41 e callbacks de sucesso/erro.

### Linha 049

- **Conteúdo:** `            response: { ok: true, filePath: '/downloads/MangaTranslator/page.png', downloadId: 41 },`
- **Papel:** Inicia assertion da resposta final.

### Linha 050

- **Conteúdo:** `        });`
- **Papel:** Exige keepAlive true e payload ok + filePath retornado pelo search + downloadId 41.

### Linha 051

- **Conteúdo:** `    });`
- **Papel:** Fecha assertion da resposta.

### Linha 052

- **Conteúdo:** `});`
- **Papel:** Fecha o test.

### Linha 053

- **Conteúdo:** _newline final após a linha 52_
- **Papel:** Posição terminal: newline final.

## 10. Autoauditoria documental

- Fonte integral e SHA reconfirmados.
- 52 linhas + newline = **53/53 posições**.
- Headings `Linha 001` → `Linha 053` sequenciais.
- Router e action reais foram lidos sem alteração.
- Happy path não foi promovido a prova dos ramos de erro.
- Solicitações 141-001..004 permanecem OPEN.

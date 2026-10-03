# Bíblia técnica — export-guard.test.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `4a34bd498d62aecdefca112b02d7601346891820`  
> **Agente responsável pela auditoria:** AGENTE 12  
> **Tipo:** teste Jest de regressão histórica baseado em implementação espelho  
> **Linhas textuais:** **119**  
> **Posições documentais:** **120**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`tests/unit/background/export-guard.test.js` protege historicamente o BUG #13: uma exportação com `allDownloads: []` não pode deixar o canal IPC sem resposta. Entretanto, o arquivo **não importa nem executa** `extension/background/actions/export-all.js`; ele define `createExportAllHandler`, uma cópia simplificada da lógica antiga, e testa essa cópia.

Isso altera a classificação da evidência: as assertions são diretas para o espelho, mas não podem ser usadas isoladamente para afirmar que o comportamento de produção está protegido.

## 2. Comparação com a implementação real atual

O `extension/background/actions/export-all.js` atual:
- normaliza `request.allDownloads || []`;
- retorna `{ ok: true }` imediatamente quando a lista é vazia;
- prefixa filename com `MangaTranslator/` quando necessário;
- chama `context.waitForDownload`;
- tolera `chrome.runtime.lastError`/id indefinido;
- abre o último download concluído.

O espelho deste teste não contém esses quatro últimos contratos: ele apenas chama `chrome.downloads.download(dl, callback)`, incrementa um contador e responde ao final.

## 3. Evidência externa relevante

`tests/unit/background/export-all-action.test.js` **já carrega o roteador e `export-all.js` reais**. Seu primeiro teste envia `EXPORT_ALL_AND_SHOW` com lista vazia, exige zero downloads e resposta `{ keepAlive: true, response: { ok: true } }`. O segundo prova prefixo de filenames, espera de downloads e abertura do último id.

Portanto, o BUG #13 atualmente possui prova direta em outra suíte real; este arquivo espelho é redundante e apresenta risco de drift, não uma ausência total de cobertura.

## 4. Evidência automatizada examinada

| Comportamento | Evidência | Classificação |
|---|---|---|
| espelho responde imediatamente a [] | assertion local | ✅ PROVADO DIRETAMENTE — apenas espelho |
| espelho não chama download com [] | spy local | ✅ PROVADO DIRETAMENTE — apenas espelho |
| espelho trata undefined como vazio | assertion local | ✅ PROVADO DIRETAMENTE — apenas espelho |
| espelho processa dois itens | contagem + resposta | ✅ PROVADO DIRETAMENTE — apenas espelho |
| implementação real trata lista vazia | `export-all-action.test.js` carrega action real | ✅ PROVADO DIRETAMENTE FORA DESTE ARQUIVO |
| implementação real normaliza filenames/abre último | `export-all-action.test.js` | ✅ PROVADO DIRETAMENTE FORA DESTE ARQUIVO |
| este arquivo detectaria drift na produção | não importa a produção | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Problemas de qualidade do próprio teste

1. O comentário afirma que o `background.js` nunca é carregado em unitários, mas a arquitetura atual já possui helpers e actions extraídas que permitem testar produção real.
2. `fs` e `getRuntimeMock` são importados e não utilizados.
3. O espelho divergiu da action real: não normaliza nome, não usa `waitForDownload`, não trata falha/id indefinido e não chama `downloads.show`.
4. Como o teste pode continuar verde após uma quebra de `export-all.js`, ele não deve ser considerado gate probatório independente.
5. A existência de `export-all-action.test.js` reduz o risco funcional atual, mas mantém duplicação/confusão documental.

## 6. Invariantes

1. A lista vazia real deve continuar respondendo sucesso sem iniciar download.
2. Provas sobre produção devem carregar a implementação de produção, não uma cópia local.
3. Teste espelho só pode ser tratado como prova do espelho explicitamente.
4. Duplicações de lógica em teste precisam ser eliminadas ou justificadas para evitar drift.
5. A suíte não deve sugerir cobertura de branches que não executa.
6. O SHA desta Bíblia só permanece válido enquanto o fonte for `4a34bd498d62aecdefca112b02d7601346891820`.

## 7. Lacunas e solicitação ao auditor

- **144-001 — TEST_QUALITY_REVIEW — OPEN:** substituir/remover a implementação espelho deste arquivo e consolidar o guard de BUG #13 sobre `export-all.js` real. Como `export-all-action.test.js` já prova o caso vazio e o caminho não vazio real, o auditor deve decidir entre eliminar esta suíte redundante ou reescrevê-la para reutilizar a action real e cobrir branches ainda ausentes.

## 8. Fonte integral auditada

```javascript
/**
 * export-guard.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa o guard de lista vazia no handler EXPORT_ALL_AND_SHOW (BUG #13 Fix).
 *
 * PROBLEMA ORIGINAL: Se request.allDownloads fosse um array vazio [], o forEach
 * nao executava nenhuma iteracao, checkFinalize() nunca era chamado, e
 * sendResponse nunca disparava. O canal IPC ficava aberto indefinidamente
 * (return true ja havia sido retornado), travando o popup.
 *
 * CORRECAO: Guard antes do forEach chama sendResponse({ok: true}) imediatamente.
 *
 * CORRECAO DO TESTE (v3.2):
 * O teste original usava runtimeMock._messageListeners.forEach(...) esperando
 * que o handler do background.js estivesse registrado. Mas background.js NUNCA
 * e carregado nos testes unitarios — o arquivo usa chrome.downloads, alarms,
 * storage, etc., e carrega como IIFE que falha fora do Service Worker context.
 * Resultado: _messageListeners vazio → sendResponse nunca chamado → todos
 * os testes falhavam.
 *
 * Solucao: mirror implementation do handler EXPORT_ALL_AND_SHOW diretamente
 * no arquivo de teste. Isso e consistente com o padrao usado em todo o projeto
 * (extractAndSendImages espelho, canonicalTitle espelho, etc.).
 * O handler espelho implementa exatamente o contrato do BUG #13 Fix.
 */

const path = require('path');
const fs   = require('fs');
const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

const { getRuntimeMock, getDownloadsMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

// ── Mirror do handler EXPORT_ALL_AND_SHOW do background.js ──────────────────
// Implementa o contrato do BUG #13 Fix:
// - Lista vazia/undefined → sendResponse({ok: true}) imediato
// - Lista com itens → chrome.downloads.download() para cada um, sendResponse ao finalizar
function createExportAllHandler(chrome) {
    return function handleExportAllAndShow(request, sender, sendResponse) {
        if (request.action !== 'EXPORT_ALL_AND_SHOW') return false;

        // BUG #13 Fix: guard para lista vazia ou undefined
        if (!request.allDownloads || request.allDownloads.length === 0) {
            sendResponse({ ok: true });
            return true;
        }

        let completed = 0;
        const total = request.allDownloads.length;

        function checkFinalize() {
            completed++;
            if (completed >= total) {
                sendResponse({ ok: true });
            }
        }

        request.allDownloads.forEach(dl => {
            chrome.downloads.download(dl, () => checkFinalize());
        });

        return true; // Resposta assíncrona
    };
}

describe('EXPORT_ALL_AND_SHOW — Guard de Lista Vazia (BUG #13)', () => {

    let handler;

    beforeEach(() => {
        jest.useFakeTimers();
        handler = createExportAllHandler(global.chrome);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('deve chamar sendResponse({ok: true}) imediatamente com lista vazia', async () => {
        const sendResponse = jest.fn();
        handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: [] }, {}, sendResponse);
        expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    test('NAO deve criar nenhum download com lista vazia', async () => {
        const downloadsMock = getDownloadsMock();
        const downloadSpy = jest.spyOn(downloadsMock, 'download');
        const sendResponse = jest.fn();

        handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: [] }, {}, sendResponse);

        expect(downloadSpy).not.toHaveBeenCalled();
    });

    test('deve chamar sendResponse com lista undefined (guard defensivo)', async () => {
        const sendResponse = jest.fn();
        handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: undefined }, {}, sendResponse);
        expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    test('com lista NAO vazia, deve processar downloads normalmente', async () => {
        const downloadsMock = getDownloadsMock();
        const downloadSpy = jest.spyOn(downloadsMock, 'download');
        const sendResponse = jest.fn();

        const mockDownloads = [
            { url: 'data:image/png;base64,abc', filename: 'MangaTranslator/test/pagina_001.png' },
            { url: 'data:image/png;base64,def', filename: 'MangaTranslator/test/pagina_002.png' },
        ];

        handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: mockDownloads }, {}, sendResponse);
        await jest.runAllTimersAsync();

        // Com 2 itens, deve ter chamado download 2 vezes
        expect(downloadSpy).toHaveBeenCalledTimes(2);
        // E sendResponse deve ter sido chamado apos o ultimo download completar
        expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
});
```

## 9. Cobertura linha a linha

### Linha 1

**Fonte:** `/**`

**Função:** Documenta a intenção histórica/metodológica do teste: ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 2

**Fonte:** ` * export-guard.test.js`

**Função:** Documenta a intenção histórica/metodológica do teste: `export-guard.test.js`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 3

**Fonte:** ` * ─────────────────────────────────────────────────────────────────────────────`

**Função:** Documenta a intenção histórica/metodológica do teste: `─────────────────────────────────────────────────────────────────────────────`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 4

**Fonte:** ` * Testa o guard de lista vazia no handler EXPORT_ALL_AND_SHOW (BUG #13 Fix).`

**Função:** Documenta a intenção histórica/metodológica do teste: `Testa o guard de lista vazia no handler EXPORT_ALL_AND_SHOW (BUG #13 Fix).`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 5

**Fonte:** ` *`

**Função:** Documenta a intenção histórica/metodológica do teste: ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 6

**Fonte:** ` * PROBLEMA ORIGINAL: Se request.allDownloads fosse um array vazio [], o forEach`

**Função:** Documenta a intenção histórica/metodológica do teste: `PROBLEMA ORIGINAL: Se request.allDownloads fosse um array vazio [], o forEach`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 7

**Fonte:** ` * nao executava nenhuma iteracao, checkFinalize() nunca era chamado, e`

**Função:** Documenta a intenção histórica/metodológica do teste: `nao executava nenhuma iteracao, checkFinalize() nunca era chamado, e`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 8

**Fonte:** ` * sendResponse nunca disparava. O canal IPC ficava aberto indefinidamente`

**Função:** Documenta a intenção histórica/metodológica do teste: `sendResponse nunca disparava. O canal IPC ficava aberto indefinidamente`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 9

**Fonte:** ` * (return true ja havia sido retornado), travando o popup.`

**Função:** Documenta a intenção histórica/metodológica do teste: `(return true ja havia sido retornado), travando o popup.`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 10

**Fonte:** ` *`

**Função:** Documenta a intenção histórica/metodológica do teste: ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 11

**Fonte:** ` * CORRECAO: Guard antes do forEach chama sendResponse({ok: true}) imediatamente.`

**Função:** Documenta a intenção histórica/metodológica do teste: `CORRECAO: Guard antes do forEach chama sendResponse({ok: true}) imediatamente.`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 12

**Fonte:** ` *`

**Função:** Documenta a intenção histórica/metodológica do teste: ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 13

**Fonte:** ` * CORRECAO DO TESTE (v3.2):`

**Função:** Documenta a intenção histórica/metodológica do teste: `CORRECAO DO TESTE (v3.2):`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 14

**Fonte:** ` * O teste original usava runtimeMock._messageListeners.forEach(...) esperando`

**Função:** Documenta a intenção histórica/metodológica do teste: `O teste original usava runtimeMock._messageListeners.forEach(...) esperando`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 15

**Fonte:** ` * que o handler do background.js estivesse registrado. Mas background.js NUNCA`

**Função:** Documenta a intenção histórica/metodológica do teste: `que o handler do background.js estivesse registrado. Mas background.js NUNCA`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 16

**Fonte:** ` * e carregado nos testes unitarios — o arquivo usa chrome.downloads, alarms,`

**Função:** Documenta a intenção histórica/metodológica do teste: `e carregado nos testes unitarios — o arquivo usa chrome.downloads, alarms,`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 17

**Fonte:** ` * storage, etc., e carrega como IIFE que falha fora do Service Worker context.`

**Função:** Documenta a intenção histórica/metodológica do teste: `storage, etc., e carrega como IIFE que falha fora do Service Worker context.`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 18

**Fonte:** ` * Resultado: _messageListeners vazio → sendResponse nunca chamado → todos`

**Função:** Documenta a intenção histórica/metodológica do teste: `Resultado: _messageListeners vazio → sendResponse nunca chamado → todos`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 19

**Fonte:** ` * os testes falhavam.`

**Função:** Documenta a intenção histórica/metodológica do teste: `os testes falhavam.`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 20

**Fonte:** ` *`

**Função:** Documenta a intenção histórica/metodológica do teste: ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 21

**Fonte:** ` * Solucao: mirror implementation do handler EXPORT_ALL_AND_SHOW diretamente`

**Função:** Documenta a intenção histórica/metodológica do teste: `Solucao: mirror implementation do handler EXPORT_ALL_AND_SHOW diretamente`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 22

**Fonte:** ` * no arquivo de teste. Isso e consistente com o padrao usado em todo o projeto`

**Função:** Documenta a intenção histórica/metodológica do teste: `no arquivo de teste. Isso e consistente com o padrao usado em todo o projeto`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 23

**Fonte:** ` * (extractAndSendImages espelho, canonicalTitle espelho, etc.).`

**Função:** Documenta a intenção histórica/metodológica do teste: `(extractAndSendImages espelho, canonicalTitle espelho, etc.).`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 24

**Fonte:** ` * O handler espelho implementa exatamente o contrato do BUG #13 Fix.`

**Função:** Documenta a intenção histórica/metodológica do teste: `O handler espelho implementa exatamente o contrato do BUG #13 Fix.`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 25

**Fonte:** ` */`

**Função:** Documenta a intenção histórica/metodológica do teste: `/`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 26

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `*/` do próximo bloco `const path = require('path');`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 27

**Fonte:** `const path = require('path');`

**Função:** Importa dependência Node via `const path = require('path');`; `fs` permanece sem uso efetivo nesta suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 28

**Fonte:** `const fs   = require('fs');`

**Função:** Importa dependência Node via `const fs   = require('fs');`; `fs` permanece sem uso efetivo nesta suíte.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 29

**Fonte:** `const { findRepoRoot } = require('../../helpers/repo-root');`

**Função:** Importa o helper de localização da raiz do repositório.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 30

**Fonte:** `const ROOT = findRepoRoot(__dirname);`

**Função:** Resolve a raiz do checkout para montar paths absolutos dos mocks.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 31

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `const ROOT = findRepoRoot(__dirname);` do próximo bloco `const { getRuntimeMock, getDownloadsMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 32

**Fonte:** `const { getRuntimeMock, getDownloadsMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));`

**Função:** Importa mocks Chrome; `getRuntimeMock` não é usado pelo corpo atual, enquanto downloads é observado nos cenários.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 33

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `const { getRuntimeMock, getDownloadsMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js` do próximo bloco `// ── Mirror do handler EXPORT_ALL_AND_SHOW do background.js ──────────────────`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 34

**Fonte:** `// ── Mirror do handler EXPORT_ALL_AND_SHOW do background.js ──────────────────`

**Função:** Compõe a implementação espelho ou seu cenário de teste por meio de `// ── Mirror do handler EXPORT_ALL_AND_SHOW do background.js ──────────────────`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 35

**Fonte:** `// Implementa o contrato do BUG #13 Fix:`

**Função:** Compõe a implementação espelho ou seu cenário de teste por meio de `// Implementa o contrato do BUG #13 Fix:`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 36

**Fonte:** `// - Lista vazia/undefined → sendResponse({ok: true}) imediato`

**Função:** Compõe a implementação espelho ou seu cenário de teste por meio de `// - Lista vazia/undefined → sendResponse({ok: true}) imediato`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 37

**Fonte:** `// - Lista com itens → chrome.downloads.download() para cada um, sendResponse ao finalizar`

**Função:** Chama a API mock de downloads com o objeto recebido, sem aplicar as normalizações presentes no handler real atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 38

**Fonte:** `function createExportAllHandler(chrome) {`

**Função:** Inicia uma implementação **espelho local** do handler de exportação; este é o principal boundary probatório do arquivo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE EM RELAÇÃO À PRODUÇÃO — executa uma implementação espelho, não o módulo real.

### Linha 39

**Fonte:** `    return function handleExportAllAndShow(request, sender, sendResponse) {`

**Função:** Retorna `function handleExportAllAndShow(request, sender, sendResponse) {` do handler/helper local.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 40

**Fonte:** `        if (request.action !== 'EXPORT_ALL_AND_SHOW') return false;`

**Função:** No espelho, ignora ações diferentes de `EXPORT_ALL_AND_SHOW` retornando false.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 41

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `if (request.action !== 'EXPORT_ALL_AND_SHOW') return false;` do próximo bloco `// BUG #13 Fix: guard para lista vazia ou undefined`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 42

**Fonte:** `        // BUG #13 Fix: guard para lista vazia ou undefined`

**Função:** Compõe a implementação espelho ou seu cenário de teste por meio de `// BUG #13 Fix: guard para lista vazia ou undefined`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 43

**Fonte:** `        if (!request.allDownloads || request.allDownloads.length === 0) {`

**Função:** Implementa no espelho o guard de lista ausente/vazia que o teste pretende proteger.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 44

**Fonte:** `            sendResponse({ ok: true });`

**Função:** Faz o espelho responder sucesso imediatamente ou ao concluir todos os downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 45

**Fonte:** `            return true;`

**Função:** Mantém o canal assíncrono segundo o contrato reproduzido pelo espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 46

**Fonte:** `        }`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `let completed = 0;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 47

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `}` do próximo bloco `let completed = 0;`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 48

**Fonte:** `        let completed = 0;`

**Função:** Inicializa contador usado apenas pela cópia local do handler: `let completed = 0;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 49

**Fonte:** `        const total = request.allDownloads.length;`

**Função:** Inicializa contador usado apenas pela cópia local do handler: `const total = request.allDownloads.length;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 50

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `const total = request.allDownloads.length;` do próximo bloco `function checkFinalize() {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 51

**Fonte:** `        function checkFinalize() {`

**Função:** Define no espelho o agregador que responde quando o número de callbacks atinge o total.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 52

**Fonte:** `            completed++;`

**Função:** Incrementa o contador local de downloads finalizados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 53

**Fonte:** `            if (completed >= total) {`

**Função:** No espelho, dispara resposta quando todos os downloads simulados chamaram callback.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 54

**Fonte:** `                sendResponse({ ok: true });`

**Função:** Faz o espelho responder sucesso imediatamente ou ao concluir todos os downloads.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 55

**Fonte:** `            }`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 56

**Fonte:** `        }`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `request.allDownloads.forEach(dl => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 57

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `}` do próximo bloco `request.allDownloads.forEach(dl => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 58

**Fonte:** `        request.allDownloads.forEach(dl => {`

**Função:** Percorre cada item da lista fornecida ao espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 59

**Fonte:** `            chrome.downloads.download(dl, () => checkFinalize());`

**Função:** Chama a API mock de downloads com o objeto recebido, sem aplicar as normalizações presentes no handler real atual.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 60

**Fonte:** `        });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `return true; // Resposta assíncrona`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 61

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `});` do próximo bloco `return true; // Resposta assíncrona`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 62

**Fonte:** `        return true; // Resposta assíncrona`

**Função:** Mantém o canal assíncrono segundo o contrato reproduzido pelo espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 63

**Fonte:** `    };`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 64

**Fonte:** `}`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `describe('EXPORT_ALL_AND_SHOW — Guard de Lista Vazia (BUG #13)', () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 65

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `}` do próximo bloco `describe('EXPORT_ALL_AND_SHOW — Guard de Lista Vazia (BUG #13)', () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 66

**Fonte:** `describe('EXPORT_ALL_AND_SHOW — Guard de Lista Vazia (BUG #13)', () => {`

**Função:** Abre a suíte Jest dedicada ao guard histórico de exportação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 67

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `describe('EXPORT_ALL_AND_SHOW — Guard de Lista Vazia (BUG #13)', () => {` do próximo bloco `let handler;`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 68

**Fonte:** `    let handler;`

**Função:** Compõe a implementação espelho ou seu cenário de teste por meio de `let handler;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 69

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `let handler;` do próximo bloco `beforeEach(() => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 70

**Fonte:** `    beforeEach(() => {`

**Função:** Ativa fake timers e cria nova instância do handler espelho antes de cada caso.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 71

**Fonte:** `        jest.useFakeTimers();`

**Função:** Substitui timers reais por fake timers para controlar callbacks do mock.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 72

**Fonte:** `        handler = createExportAllHandler(global.chrome);`

**Função:** Instancia a cópia local usando `global.chrome`, não a action de produção.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE EM RELAÇÃO À PRODUÇÃO — executa uma implementação espelho, não o módulo real.

### Linha 73

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `afterEach(() => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 74

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `});` do próximo bloco `afterEach(() => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 75

**Fonte:** `    afterEach(() => {`

**Função:** Restaura timers reais após cada cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 76

**Fonte:** `        jest.useRealTimers();`

**Função:** Remove o modo de fake timers ao final do teste.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 77

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('deve chamar sendResponse({ok: true}) imediatamente com lista vazia', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 78

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `});` do próximo bloco `test('deve chamar sendResponse({ok: true}) imediatamente com lista vazia', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 79

**Fonte:** `    test('deve chamar sendResponse({ok: true}) imediatamente com lista vazia', async () => {`

**Função:** Registra o cenário `deve chamar sendResponse({ok: true}) imediatamente com lista vazia` contra a implementação espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 80

**Fonte:** `        const sendResponse = jest.fn();`

**Função:** Cria spy para observar se o espelho encerra o contrato IPC.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 81

**Fonte:** `        handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: [] }, {}, sendResponse);`

**Função:** Invoca diretamente o handler espelho com a fixture do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE EM RELAÇÃO À PRODUÇÃO — executa uma implementação espelho, não o módulo real.

### Linha 82

**Fonte:** `        expect(sendResponse).toHaveBeenCalledWith({ ok: true });`

**Função:** Assertion direta sobre o **espelho local**: `expect(sendResponse).toHaveBeenCalledWith({ ok: true });`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — porém somente para `createExportAllHandler`, a cópia local declarada neste arquivo; não é prova direta do `export-all.js` de produção.

### Linha 83

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('NAO deve criar nenhum download com lista vazia', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 84

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `});` do próximo bloco `test('NAO deve criar nenhum download com lista vazia', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 85

**Fonte:** `    test('NAO deve criar nenhum download com lista vazia', async () => {`

**Função:** Registra o cenário `NAO deve criar nenhum download com lista vazia` contra a implementação espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 86

**Fonte:** `        const downloadsMock = getDownloadsMock();`

**Função:** Obtém o mock de downloads compartilhado para espionar chamadas efetuadas pelo espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 87

**Fonte:** `        const downloadSpy = jest.spyOn(downloadsMock, 'download');`

**Função:** Cria spy sobre `download` para contar chamadas da implementação espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 88

**Fonte:** `        const sendResponse = jest.fn();`

**Função:** Cria spy para observar se o espelho encerra o contrato IPC.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 89

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `const sendResponse = jest.fn();` do próximo bloco `handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: [] }, {}, sendResponse);`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 90

**Fonte:** `        handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: [] }, {}, sendResponse);`

**Função:** Invoca diretamente o handler espelho com a fixture do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE EM RELAÇÃO À PRODUÇÃO — executa uma implementação espelho, não o módulo real.

### Linha 91

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: [] }, {}, sendResponse);` do próximo bloco `expect(downloadSpy).not.toHaveBeenCalled();`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 92

**Fonte:** `        expect(downloadSpy).not.toHaveBeenCalled();`

**Função:** Assertion direta sobre o **espelho local**: `expect(downloadSpy).not.toHaveBeenCalled();`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — porém somente para `createExportAllHandler`, a cópia local declarada neste arquivo; não é prova direta do `export-all.js` de produção.

### Linha 93

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('deve chamar sendResponse com lista undefined (guard defensivo)', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 94

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `});` do próximo bloco `test('deve chamar sendResponse com lista undefined (guard defensivo)', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 95

**Fonte:** `    test('deve chamar sendResponse com lista undefined (guard defensivo)', async () => {`

**Função:** Registra o cenário `deve chamar sendResponse com lista undefined (guard defensivo)` contra a implementação espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 96

**Fonte:** `        const sendResponse = jest.fn();`

**Função:** Cria spy para observar se o espelho encerra o contrato IPC.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 97

**Fonte:** `        handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: undefined }, {}, sendResponse);`

**Função:** Invoca diretamente o handler espelho com a fixture do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE EM RELAÇÃO À PRODUÇÃO — executa uma implementação espelho, não o módulo real.

### Linha 98

**Fonte:** `        expect(sendResponse).toHaveBeenCalledWith({ ok: true });`

**Função:** Assertion direta sobre o **espelho local**: `expect(sendResponse).toHaveBeenCalledWith({ ok: true });`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — porém somente para `createExportAllHandler`, a cópia local declarada neste arquivo; não é prova direta do `export-all.js` de produção.

### Linha 99

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `test('com lista NAO vazia, deve processar downloads normalmente', async () => {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 100

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `});` do próximo bloco `test('com lista NAO vazia, deve processar downloads normalmente', async () => {`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 101

**Fonte:** `    test('com lista NAO vazia, deve processar downloads normalmente', async () => {`

**Função:** Registra o cenário `com lista NAO vazia, deve processar downloads normalmente` contra a implementação espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 102

**Fonte:** `        const downloadsMock = getDownloadsMock();`

**Função:** Obtém o mock de downloads compartilhado para espionar chamadas efetuadas pelo espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 103

**Fonte:** `        const downloadSpy = jest.spyOn(downloadsMock, 'download');`

**Função:** Cria spy sobre `download` para contar chamadas da implementação espelho.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 104

**Fonte:** `        const sendResponse = jest.fn();`

**Função:** Cria spy para observar se o espelho encerra o contrato IPC.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 105

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `const sendResponse = jest.fn();` do próximo bloco `const mockDownloads = [`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 106

**Fonte:** `        const mockDownloads = [`

**Função:** Inicia a fixture com dois downloads usada no caminho não vazio.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 107

**Fonte:** `            { url: 'data:image/png;base64,abc', filename: 'MangaTranslator/test/pagina_001.png' },`

**Função:** Declara um item da fixture de download: `{ url: 'data:image/png;base64,abc', filename: 'MangaTranslator/test/pagina_001.png' },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 108

**Fonte:** `            { url: 'data:image/png;base64,def', filename: 'MangaTranslator/test/pagina_002.png' },`

**Função:** Declara um item da fixture de download: `{ url: 'data:image/png;base64,def', filename: 'MangaTranslator/test/pagina_002.png' },`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 109

**Fonte:** `        ];`

**Função:** Compõe a implementação espelho ou seu cenário de teste por meio de `];`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 110

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `];` do próximo bloco `handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: mockDownloads }, {}, sendResponse);`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 111

**Fonte:** `        handler({ action: 'EXPORT_ALL_AND_SHOW', allDownloads: mockDownloads }, {}, sendResponse);`

**Função:** Invoca diretamente o handler espelho com a fixture do cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE EM RELAÇÃO À PRODUÇÃO — executa uma implementação espelho, não o módulo real.

### Linha 112

**Fonte:** `        await jest.runAllTimersAsync();`

**Função:** Drena callbacks agendados pelo mock para permitir que o contador local finalize.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 113

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `await jest.runAllTimersAsync();` do próximo bloco `// Com 2 itens, deve ter chamado download 2 vezes`; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 114

**Fonte:** `        // Com 2 itens, deve ter chamado download 2 vezes`

**Função:** Compõe a implementação espelho ou seu cenário de teste por meio de `// Com 2 itens, deve ter chamado download 2 vezes`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 115

**Fonte:** `        expect(downloadSpy).toHaveBeenCalledTimes(2);`

**Função:** Assertion direta sobre o **espelho local**: `expect(downloadSpy).toHaveBeenCalledTimes(2);`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — porém somente para `createExportAllHandler`, a cópia local declarada neste arquivo; não é prova direta do `export-all.js` de produção.

### Linha 116

**Fonte:** `        // E sendResponse deve ter sido chamado apos o ultimo download completar`

**Função:** Compõe a implementação espelho ou seu cenário de teste por meio de `// E sendResponse deve ter sido chamado apos o ultimo download completar`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 117

**Fonte:** `        expect(sendResponse).toHaveBeenCalledWith({ ok: true });`

**Função:** Assertion direta sobre o **espelho local**: `expect(sendResponse).toHaveBeenCalledWith({ ok: true });`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — porém somente para `createExportAllHandler`, a cópia local declarada neste arquivo; não é prova direta do `export-all.js` de produção.

### Linha 118

**Fonte:** `    });`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 119

**Fonte:** `});`

**Função:** Fecha a estrutura sintática atual; o próximo trecho relevante começa por ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

### Linha 120

**Fonte:** `␠ [linha vazia]`

**Função:** Separa `});` do próximo bloco ``; não altera a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — setup/fixture da suíte espelho; o handler real não é carregado por este arquivo.

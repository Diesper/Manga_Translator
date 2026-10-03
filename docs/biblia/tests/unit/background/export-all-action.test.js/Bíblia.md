# Bíblia técnica — tests/unit/background/export-all-action.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `9ab092d95ac1cef8b2111e76a23422f7159a4fcf`  
> **Agente responsável:** AGENTE 15  
> **Tipo:** suíte Jest focal da ação real `background/actions/export-all.js`  
> **Linhas textuais:** 53  
> **Posições documentais:** 54, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo testa a ação real de exportação em lote registrada no router do background.

Ele não carrega `background.js` completo. O harness carrega, em módulos isolados:

1. `extension/background/router.js`;
2. `extension/background/actions/export-all.js`.

Em seguida envia a ação legada `EXPORT_ALL_AND_SHOW` através de `router.createMessageRouter`.

O router real contém o gate estático:

`EXPORT_ALL_AND_SHOW → export-all`.

A ação real:

- aceita `request.allDownloads`;
- para lista vazia retorna sucesso imediatamente;
- prefixa `MangaTranslator/` quando necessário;
- chama `chrome.downloads.download` com `saveAs: false`;
- espera conclusão por `context.waitForDownload`;
- guarda o ID que concluiu por último;
- após todas as tentativas, chama `chrome.downloads.show(lastCompletedId)` quando o ID é truthy;
- sempre resolve `{ ok: true }` após contabilizar todos os itens.

## 2. Harness local

### loadRouter — linhas 5–14

Prepara um ambiente global mínimo:

- `self = global`;
- `chrome.runtime.id`;
- `chrome.runtime.lastError = null`;
- `chrome.downloads.download = jest.fn()`;
- `chrome.downloads.show = jest.fn()`.

Depois remove qualquer router global prévio e usa `jest.isolateModules` para carregar router + action reais.

O retorno é `global.MangaTranslatorRouter`.

### dispatch — linhas 16–23

Invoca o listener com sender fixo:

- tab.id = 2;
- URL = `https://reader.example/chapter`.

A Promise resolve quando `sendResponse` é chamado, retornando simultaneamente:

- o valor síncrono `keepAlive`;
- a resposta assíncrona.

O parâmetro `contextFactory` declarado na assinatura não é usado dentro do helper; o contextFactory efetivo é passado na criação do router no segundo teste.

## 3. Cenário 1 — lista vazia

Linhas 28–33.

Entrada:

`{ action: 'EXPORT_ALL_AND_SHOW', allDownloads: [] }`

Assertions:

- `chrome.downloads.download` nunca é chamado;
- resposta final é `{ keepAlive: true, response: { ok: true } }`.

Isso prova o fast path sem download e também que o router mantém o canal assíncrono no contrato observado pelo harness.

## 4. Cenário 2 — normalização de nomes e show final

Linhas 35–52.

O mock de download devolve IDs 11 e 12 em sequência.

`waitForDownload` é um fake que chama imediatamente `done(id)`.

Entradas:

1. `one.png`;
2. `MangaTranslator/two.png`.

Assertions diretas:

- primeira chamada usa `MangaTranslator/one.png`;
- segunda mantém `MangaTranslator/two.png`, sem prefixo duplicado;
- `chrome.downloads.show(12)` é chamado;
- resposta final é sucesso.

A implementação real também fixa `saveAs: false`; o teste usa `objectContaining({ filename })`, portanto **não existe assertion específica de `saveAs: false` neste arquivo**.

## 5. Distinção importante: ordem solicitada vs ordem concluída

O nome do segundo teste afirma “abre o último download concluído”.

Entretanto o fake:

`const waitForDownload = jest.fn((id, done) => done(id));`

conclui cada download imediatamente dentro da própria iteração de `forEach`.

Consequentemente:

- download 11 conclui durante a primeira iteração;
- download 12 conclui durante a segunda;
- a ordem de conclusão é idêntica à ordem de solicitação.

A assertion `show(12)` prova o caso ordenado, mas não prova que uma conclusão fora de ordem, por exemplo 12 antes de 11, resulte em `show(11)`.

Essa lacuna é persistida em `143-001`.

## 6. Branches da implementação real não exercitados por este arquivo

`export-all.js` possui caminhos adicionais:

- `chrome.runtime.lastError` após `downloads.download`;
- callback de download com `id === undefined`;
- callback de erro/timeout passado como terceiro argumento a `context.waitForDownload`;
- caso em que último ID concluído seja falsy;
- callbacks de conclusão em ordem diferente da ordem de criação.

Nenhum desses ramos recebe assertion específica neste arquivo.

Isso não invalida os dois contratos positivos testados; limita o alcance da prova.

## 7. Evidência automatizada observada

No GitHub Actions run **36577447500**:

- o blob de `tests/unit/background/export-all-action.test.js` é exatamente `9ab092d95ac1cef8b2111e76a23422f7159a4fcf`;
- job **Unit + Integration (20.x)** `109437162616` registra explicitamente:
  `PASS background tests/unit/background/export-all-action.test.js`;
- o job termina com **109/109 suites e 851/851 testes**;
- a matriz Node 22.x do mesmo run também termina com 851/851 testes.

## 8. Matriz de evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| router mapeia `EXPORT_ALL_AND_SHOW` para `export-all` | `router.js` linha correspondente | 🟦 GATE ESTÁTICO ESPECÍFICO |
| action real é registrada/carregada pelo harness | router + action em isolateModules e testes passantes | ✅ PROVADO DIRETAMENTE |
| lista vazia não chama downloads.download | assertion linha 31 | ✅ PROVADO DIRETAMENTE |
| lista vazia responde ok | assertion linha 32 | ✅ PROVADO DIRETAMENTE |
| filename sem prefixo ganha `MangaTranslator/` | assertion linha 48 | ✅ PROVADO DIRETAMENTE |
| filename já prefixado não recebe prefixo duplicado | assertion linha 49 | ✅ PROVADO DIRETAMENTE |
| no caso ordenado observado o ID 12 é mostrado | assertion linha 50 | ✅ PROVADO DIRETAMENTE |
| “último concluído” sob conclusão fora de ordem | fake conclui em ordem de solicitação | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `saveAs:false` | implementação real possui, teste não assert | 🟨 EXECUTADO INDIRETAMENTE |
| lastError/id undefined são contabilizados sem falhar o lote | branches não exercitados | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| callback de erro de `waitForDownload` chama finishOne | branch não exercitado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 9. Solicitação ao auditor

### 143-001 — TEST_REQUIRED — OPEN — NORMAL

**Encontrado:** o teste “prefixa arquivos e abre o último download concluído” não simula conclusão fora de ordem. `waitForDownload` chama `done(id)` imediatamente, portanto ordem de conclusão = ordem de criação.

**Arquivo auditado:** `tests/unit/background/export-all-action.test.js`.

**Arquivo relacionado:** `extension/background/actions/export-all.js`.

**Evidência atual:** show(12) é provado para downloads criados 11→12 e concluídos 11→12.

**Evidência ausente:** cenário 11→12 em criação, mas 12→11 em conclusão, verificando que `chrome.downloads.show` recebe 11; também faltam casos de erro/undefined/timeout.

**Por que necessário:** o contrato da implementação é baseado no último callback de conclusão, não no último item solicitado. O teste atual não distingue os dois comportamentos.

**Ação esperada do auditor:** adicionar em processo separado um teste com callbacks de `waitForDownload` controlados manualmente e, se pertinente, cobrir lastError/id undefined/error callback.

**Evidência esperada:** conclusão fora de ordem gera `show` do ID que efetivamente concluiu por último e o lote resolve somente depois de todos os itens serem contabilizados.

**Possível regressão:** implementação passar a abrir o último solicitado em vez do último concluído sem quebrar o teste atual.

**Impacto:** seleção do arquivo exibido ao final da exportação.

**Severidade:** NORMAL.

## 10. Fonte integral auditada

```js
const path = require('path');
const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/export-all.js');

function loadRouter() {
    global.self = global;
    global.chrome = {
        runtime: { id: 'test-extension-id', lastError: null },
        downloads: { download: jest.fn(), show: jest.fn() },
    };
    delete global.MangaTranslatorRouter;
    jest.isolateModules(() => { require(ROUTER_PATH); require(ACTION_PATH); });
    return global.MangaTranslatorRouter;
}

function dispatch(listener, request, contextFactory) {
    return new Promise(resolve => {
        let keepAlive;
        keepAlive = listener(request, { tab: { id: 2, url: 'https://reader.example/chapter' } }, response => {
            resolve({ keepAlive, response });
        });
    });
}

describe('background/actions/export-all.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('confirma sem download quando não há páginas', async () => {
        const router = loadRouter();
        const result = await dispatch(router.createMessageRouter({}), { action: 'EXPORT_ALL_AND_SHOW', allDownloads: [] });
        expect(chrome.downloads.download).not.toHaveBeenCalled();
        expect(result).toEqual({ keepAlive: true, response: { ok: true } });
    });

    test('prefixa arquivos e abre o último download concluído', async () => {
        const router = loadRouter();
        chrome.downloads.download
            .mockImplementationOnce((_options, callback) => callback(11))
            .mockImplementationOnce((_options, callback) => callback(12));
        const waitForDownload = jest.fn((id, done) => done(id));
        const result = await dispatch(router.createMessageRouter({ contextFactory: () => ({ waitForDownload }) }), {
            action: 'EXPORT_ALL_AND_SHOW',
            allDownloads: [
                { url: 'data:image/png;base64,AA', filename: 'one.png' },
                { url: 'data:image/png;base64,BB', filename: 'MangaTranslator/two.png' },
            ],
        });
        expect(chrome.downloads.download).toHaveBeenNthCalledWith(1, expect.objectContaining({ filename: 'MangaTranslator/one.png' }), expect.any(Function));
        expect(chrome.downloads.download).toHaveBeenNthCalledWith(2, expect.objectContaining({ filename: 'MangaTranslator/two.png' }), expect.any(Function));
        expect(chrome.downloads.show).toHaveBeenCalledWith(12);
        expect(result).toEqual({ keepAlive: true, response: { ok: true } });
    });
});
```

## 11. Cobertura linha a linha por faixas contíguas

Todas as 54 posições estão cobertas.

| Linhas | Papel específico | Evidência |
|---:|---|---|
| 1–3 | resolve router e action reais | ✅ usados por ambos os testes |
| 4 | separador | estrutural |
| 5–14 | monta chrome mínimo, limpa router e carrega módulos reais | ✅ PROVADO DIRETAMENTE pelo harness passante |
| 15 | separador | estrutural |
| 16–23 | dispatch e captura keepAlive/response | ✅ usado em dois cenários; parâmetro contextFactory local não usado |
| 24 | separador | estrutural |
| 25–26 | describe + cleanup do router global | ✅ executado |
| 27 | separador | estrutural |
| 28–30 | monta caso sem downloads | ✅ executado |
| 31–32 | prova zero downloads e sucesso | ✅ PROVADO DIRETAMENTE |
| 33 | fecha teste 1 | estrutural |
| 34 | separador | estrutural |
| 35–40 | monta downloads IDs 11/12 e wait imediato | ✅ executado |
| 41–47 | cria router com contextFactory e envia dois arquivos | ✅ executado |
| 48 | prova prefixo adicionado ao primeiro | ✅ PROVADO DIRETAMENTE |
| 49 | prova prefixo existente preservado | ✅ PROVADO DIRETAMENTE |
| 50 | prova show(12) no caso ordenado | ✅ PROVADO DIRETAMENTE; fora de ordem ⚠️ |
| 51 | prova resposta ok | ✅ PROVADO DIRETAMENTE |
| 52–53 | fecha teste/describe | estrutural |
| 54 | newline final | 🟦 integridade do blob |

## 12. Unidades semânticas

### U01 — 1–14 — carregamento de produção

Constrói ambiente mínimo e registra router/action reais.

### U02 — 16–23 — transporte

Adapta listener callback-based para Promise observável.

### U03 — 25–33 — fast path vazio

Prova sucesso sem download.

### U04 — 35–52 — exportação de duas páginas

Prova prefixos e show final no caso de conclusão ordenada.

### U05 — 53–54 — fechamento

Encerra suite e preserva newline.

## 13. Limites

A suíte não prova:

- downloads reais no Chrome;
- permissões e filesystem;
- falha de download;
- timeout;
- callbacks fora de ordem;
- `saveAs:false` por assertion dedicada;
- semântica de ID falsy;
- múltiplas dezenas/centenas de downloads.

## 14. Autoauditoria do AGENTE 15

- [x] reserva exclusiva confirmada;
- [x] state criado após ownership;
- [x] SHA fonte reconfirmado;
- [x] fonte integral embutida;
- [x] 53 linhas + newline = 54 posições;
- [x] router e action reais cruzados;
- [x] mesmo blob localizado em CI;
- [x] PASS explícito do arquivo localizado;
- [x] branches não cobertos não foram promovidos a prova;
- [x] diferença entre “último solicitado” e “último concluído” identificada;
- [x] audit_request registrado;
- [x] nenhum arquivo externo alterado.

**Resultado:** Bíblia concluída para `9ab092d95ac1cef8b2111e76a23422f7159a4fcf`; `143-001` permanece OPEN.

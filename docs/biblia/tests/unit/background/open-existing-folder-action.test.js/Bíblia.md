# Bíblia técnica — tests/unit/background/open-existing-folder-action.test.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE RESPONSÁVEL  
> **SHA auditado:** 49b6cd110ebae43d7a4ed5a29b5a8e8430e5efb3  
> **Agente responsável:** AGENTE 19  
> **Índice do corpus:** 157  
> **Tipo:** suíte Jest focal da action open-existing-folder  
> **Linhas textuais:** 59  
> **Posições documentais:** 60, contando newline final  
> **Action exercitada:** extension/background/actions/open-existing-folder.js — SHA 59ef82cbf960e360eb404fbd969067f017021607  
> **Router exercitado:** extension/background/router.js — SHA d9278e9e58e4e9583a30c16227bfd833e7203d89

## 1. Papel arquitetural

Esta suíte carrega router e action reais por require dentro de jest.isolateModules e substitui somente chrome.downloads + handleMarkerAndShow. O objetivo é provar duas rotas do protocolo SHOW_EXISTING_FOLDER:

1. reutilização de anchorId persistido que ainda existe;
2. ausência de anchor + busca por folderPath vazia → criação/reuso de marker.

Ela também prova, nesse segundo ramo, que o ponto em Chap.1 é escapado antes de virar filenameRegex.

## 2. Harness

loadRouter instala self/global e chrome mínimo, limpa MangaTranslatorRouter e recarrega router/action. O registry usado no teste, portanto, é o registry real construído a partir dos dois blobs auditados.

dispatch chama o listener real do router com sender de content tab. Como a action retorna Promise, sendResponse ocorre pelo caminho async do router depois que o listener já retornou true; por isso os dois testes podem afirmar keepAlive=true de modo estável.

## 3. Caso 1 — anchorId existente

downloads.search é programado para devolver [{id:45, exists:true}].

A chamada SHOW_EXISTING_FOLDER inclui anchorId=45. Assertions provam diretamente:

- chrome.downloads.show foi chamado com 45;
- router manteve canal assíncrono (keepAlive=true);
- resposta foi {ok:true}.

O teste não afirma que handleMarkerAndShow ficou sem chamada nem inspeciona os argumentos enviados ao search por id. A implementação real os executa, mas essas propriedades permanecem execução indireta nesta suíte.

## 4. Caso 2 — sem anchor, busca vazia

downloads.search retorna [] e handleMarkerAndShow resolve {ok:true}.

Assertions provam:

- search recebeu {filenameRegex:'MangaTranslator/Chap\\.1'};
- o ponto literal foi escapado;
- marker helper recebeu safeTitle Chap.1 e callback;
- keepAlive=true;
- resposta ok=true.

Este caso prova o wiring action → marker quando não há resultado, mas não prova o comportamento interno do marker helper; isso pertence às suítes focais desse helper.

## 5. Cobertura complementar localizada

A documentação e buscas no repositório mostram cobertura externa complementar:

- tests/unit/background/regex-escape.test.js cobre metacaracteres de regex mais amplos no background real;
- tests/unit/background/message-handlers-real.test.js cobre SHOW_EXISTING_FOLDER encontrando item existente por folderPath;
- handlers-extra-real.test.js e plan-missing-handlers-real.test.js cobrem reuso de anchor válido em background real;
- marker-anchor-real.test.js cobre ciclo do marker helper.

Essas provas complementam a suíte, mas não transformam branches não executados neste arquivo em assertions locais.

## 6. Evidência de execução real

O mesmo blob 49b6cd110ebae43d7a4ed5a29b5a8e8430e5efb3 estava no commit b6ad13fce47adcab3fcd10281f28848f7b4ce50f.

CI #36577447500:

- job 109437162616 — Node 20.x — PASS background tests/unit/background/open-existing-folder-action.test.js;
- job 109437162754 — Node 22.x — PASS;
- job 109437162789 — Windows Portability — PASS.

Assim, as assertions acima passaram contra router/action reais no snapshot correspondente.

## 7. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| router/action reais são carregados | paths + require isolado + suite PASS | 🟨 EXECUTADO INDIRETAMENTE |
| anchor 45 existente é mostrado | toHaveBeenCalledWith(45) | ✅ PROVADO DIRETAMENTE |
| anchor branch responde ok com keepAlive true | toEqual | ✅ PROVADO DIRETAMENTE |
| ponto de Chap.1 é escapado no filenameRegex | toHaveBeenCalledWith | ✅ PROVADO DIRETAMENTE |
| busca vazia delega para marker com safeTitle | toHaveBeenCalledWith | ✅ PROVADO DIRETAMENTE |
| fallback marker responde ok com keepAlive true | toEqual | ✅ PROVADO DIRETAMENTE |
| anchor stale/exists=false cai para fallbackSearch | nenhum caso localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| folderPath ausente/não-string | action não possui validate; nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| safeTitle ausente quando marker é necessário | nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| path search existente | prova complementar em message-handlers-real | ✅ PROVADO DIRETAMENTE EM OUTRA SUÍTE |
| escape de vários metacaracteres | regex-escape.test.js | ✅ PROVADO DIRETAMENTE EM OUTRA SUÍTE |

## 8. Solicitações ao auditor

### 157-001 — TEST_REQUIRED — OPEN

**Encontrado:** não foi localizado caso em que anchorId é fornecido, search por id retorna vazio ou exists:false, e a action precisa continuar para fallbackSearch.

**Arquivo auditado/relacionado:** tests/unit/background/open-existing-folder-action.test.js.

**Evidência atual:** anchor válido é provado; caminho sem anchor + busca vazia é provado.

**Evidência ausente:** transição anchor stale → busca por folderPath → show de resultado válido ou marker.

**Por que é necessária:** é o ramo de recuperação de metadado persistido stale, diferente de simplesmente não fornecer anchor.

**Ação esperada:** adicionar caso focal com router/action reais e sequência controlada de respostas de downloads.search.

**Evidência esperada:** primeira busca por {id}, segunda por filenameRegex e efeito final correto.

**Possível regressão:** anchor antigo pode bloquear abertura de pasta mesmo quando o caminho ainda é recuperável.

**Severidade:** NORMAL.

### 157-002 — VALIDATION_REVIEW — OPEN

**Encontrado:** open-existing-folder.js não possui validate e chama folderPath.replace no fallback. folderPath ausente/não-string rejeitaria a Promise via TypeError; safeTitle ausente chega ao marker helper.

**Arquivo externo relacionado:** extension/background/actions/open-existing-folder.js.

**Evidência atual:** todos os testes fornecem payload válido.

**Evidência ausente:** contrato explícito para folderPath/safeTitle inválidos e resposta esperada do router.

**Ação esperada:** decidir se a action deve validar esses campos. Se sim, alterar código/testes em processo auditor separado; se não, formalizar o erro interno como contrato.

**Evidência esperada:** assertions de payload inválido sem depender de TypeError incidental.

**Possível regressão:** caller malformado pode produzir INTERNAL_ERROR ou comportamento de marker com título indefinido.

**Severidade:** NORMAL.

## 9. Fonte integral auditada

~~~js
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/open-existing-folder.js');

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

function dispatch(listener, request, contextFactory) {
    return new Promise(resolve => {
        let keepAlive;
        keepAlive = listener(request, { tab: { id: 2, url: 'https://reader.example/chapter' } }, response => {
            resolve({ keepAlive, response });
        });
    });
}

describe('background/actions/open-existing-folder.js', () => {
    afterEach(() => delete global.MangaTranslatorRouter);

    test('abre o marcador existente quando ele ainda existe', async () => {
        const router = loadRouter();
        chrome.downloads.search.mockImplementation((_query, callback) => callback([{ id: 45, exists: true }]));

        const result = await dispatch(router.createMessageRouter({
            contextFactory: () => ({ handleMarkerAndShow: jest.fn() }),
        }), { action: 'SHOW_EXISTING_FOLDER', anchorId: 45, folderPath: 'MangaTranslator/Chap', safeTitle: 'Chap' });

        expect(chrome.downloads.show).toHaveBeenCalledWith(45);
        expect(result).toEqual({ keepAlive: true, response: { ok: true } });
    });

    test('usa o marcador quando não encontra nenhum download na pasta', async () => {
        const router = loadRouter();
        chrome.downloads.search.mockImplementation((_query, callback) => callback([]));
        const handleMarkerAndShow = jest.fn((_title, callback) => callback({ ok: true }));

        const result = await dispatch(router.createMessageRouter({
            contextFactory: () => ({ handleMarkerAndShow }),
        }), { action: 'SHOW_EXISTING_FOLDER', folderPath: 'MangaTranslator/Chap.1', safeTitle: 'Chap.1' });

        expect(chrome.downloads.search).toHaveBeenCalledWith(
            { filenameRegex: 'MangaTranslator/Chap\\.1' }, expect.any(Function)
        );
        expect(handleMarkerAndShow).toHaveBeenCalledWith('Chap.1', expect.any(Function));
        expect(result).toEqual({ keepAlive: true, response: { ok: true } });
    });
});
~~~

## 10. Mapa linha por linha

| Linha | Unidade | Fonte | Papel | Evidência |\n|---:|---|---|---|---|\n| 001 | U01 | <code>const path = require('path');</code> | Importa path built-in para resolver implementações reais. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 002 | U01 | <code>␠ [linha vazia]</code> | Separador visual em Paths para router/action reais; sem efeito runtime. | estrutural |\n| 003 | U01 | <code>const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');</code> | Resolve extension/background/router.js real. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 004 | U01 | <code>const ACTION_PATH = path.resolve(__dirname, '../../../extension/background/actions/open-existing-folder.js');</code> | Resolve extension/background/actions/open-existing-folder.js real. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 005 | U02 | <code>␠ [linha vazia]</code> | Separador visual em loadRouter e Chrome downloads mock; sem efeito runtime. | estrutural |\n| 006 | U02 | <code>function loadRouter() {</code> | Aponta self para global para as IIFEs registrarem APIs no harness Node. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 007 | U02 | <code>    global.self = global;</code> | Inicia chrome mínimo controlado pela suíte. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 008 | U02 | <code>    global.chrome = {</code> | Fornece runtime.id usado pelo router. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 009 | U02 | <code>        runtime: { id: 'test-extension-id' },</code> | Mocka downloads.search e downloads.show observáveis. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 010 | U02 | <code>        downloads: { search: jest.fn(), show: jest.fn() },</code> | Cria mock observável para loadRouter e Chrome downloads mock. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 011 | U02 | <code>    };</code> | Apaga router global antes de recarregar módulos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 012 | U02 | <code>    delete global.MangaTranslatorRouter;</code> | Abre jest.isolateModules para registry/cache novos. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 013 | U02 | <code>    jest.isolateModules(() =&gt; {</code> | Carrega o router real. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 014 | U02 | <code>        require(ROUTER_PATH);</code> | Carrega a action real e registra open-existing-folder. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 015 | U02 | <code>        require(ACTION_PATH);</code> | Compõe o harness ou cenário loadRouter e Chrome downloads mock; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 016 | U02 | <code>    });</code> | Retorna API real do router. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 017 | U02 | <code>    return global.MangaTranslatorRouter;</code> | Compõe o harness ou cenário loadRouter e Chrome downloads mock; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 018 | U02 | <code>}</code> | Fecha estrutura sintática de loadRouter e Chrome downloads mock. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 019 | U03 | <code>␠ [linha vazia]</code> | Separador visual em dispatch assíncrono; sem efeito runtime. | estrutural |\n| 020 | U03 | <code>function dispatch(listener, request, contextFactory) {</code> | Cria Promise resolvida por sendResponse. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 021 | U03 | <code>    return new Promise(resolve =&gt; {</code> | Declara keepAlive retornado pelo listener. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 022 | U03 | <code>        let keepAlive;</code> | Invoca listener com sender content tab e captura resposta. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 023 | U03 | <code>        keepAlive = listener(request, { tab: { id: 2, url: 'https://reader.example/chapter' } }, response =&gt; {</code> | Resolve objeto com keepAlive e response quando router responde. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 024 | U03 | <code>            resolve({ keepAlive, response });</code> | Compõe o harness ou cenário dispatch assíncrono; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 025 | U03 | <code>        });</code> | Compõe o harness ou cenário dispatch assíncrono; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 026 | U03 | <code>    });</code> | Compõe o harness ou cenário dispatch assíncrono; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 027 | U03 | <code>}</code> | Fecha estrutura sintática de dispatch assíncrono. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 028 | U04 | <code>␠ [linha vazia]</code> | Separador visual em suite e cleanup; sem efeito runtime. | estrutural |\n| 029 | U04 | <code>describe('background/actions/open-existing-folder.js', () =&gt; {</code> | Remove MangaTranslatorRouter global após cada teste. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 030 | U04 | <code>    afterEach(() =&gt; delete global.MangaTranslatorRouter);</code> | Compõe o harness ou cenário suite e cleanup; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 031 | U05 | <code>␠ [linha vazia]</code> | Separador visual em anchorId válido; sem efeito runtime. | estrutural |\n| 032 | U05 | <code>    test('abre o marcador existente quando ele ainda existe', async () =&gt; {</code> | Carrega router/action reais isolados. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 033 | U05 | <code>        const router = loadRouter();</code> | Configura downloads.search para retornar id 45 com exists=true. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 034 | U05 | <code>        chrome.downloads.search.mockImplementation((_query, callback) =&gt; callback([{ id: 45, exists: true }]));</code> | Compõe o harness ou cenário anchorId válido; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 035 | U05 | <code>␠ [linha vazia]</code> | Separador visual em anchorId válido; sem efeito runtime. | estrutural |\n| 036 | U05 | <code>        const result = await dispatch(router.createMessageRouter({</code> | Injeta handleMarkerAndShow mock; este branch não deve precisar dele. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 037 | U05 | <code>            contextFactory: () =&gt; ({ handleMarkerAndShow: jest.fn() }),</code> | Request inclui action, anchorId válido, folderPath e safeTitle. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 038 | U05 | <code>        }), { action: 'SHOW_EXISTING_FOLDER', anchorId: 45, folderPath: 'MangaTranslator/Chap', safeTitle: 'Chap' });</code> | Compõe o harness ou cenário anchorId válido; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 039 | U05 | <code>␠ [linha vazia]</code> | Separador visual em anchorId válido; sem efeito runtime. | estrutural |\n| 040 | U05 | <code>        expect(chrome.downloads.show).toHaveBeenCalledWith(45);</code> | Prova keepAlive=true e envelope response ok=true. | ✅ PROVADO DIRETAMENTE |\n| 041 | U05 | <code>        expect(result).toEqual({ keepAlive: true, response: { ok: true } });</code> | Assertion Jest específica em anchorId válido; a propriedade concreta está na própria linha. | ✅ PROVADO DIRETAMENTE |\n| 042 | U06 | <code>    });</code> | Declara cenário sem anchor e sem download encontrado, que deve usar marker. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 043 | U06 | <code>␠ [linha vazia]</code> | Separador visual em fallback para marker e escape de path; sem efeito runtime. | estrutural |\n| 044 | U06 | <code>    test('usa o marcador quando não encontra nenhum download na pasta', async () =&gt; {</code> | Configura downloads.search para retornar lista vazia. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 045 | U06 | <code>        const router = loadRouter();</code> | Cria handleMarkerAndShow que resolve sucesso via callback. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 046 | U06 | <code>        chrome.downloads.search.mockImplementation((_query, callback) =&gt; callback([]));</code> | Compõe o harness ou cenário fallback para marker e escape de path; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 047 | U06 | <code>        const handleMarkerAndShow = jest.fn((_title, callback) =&gt; callback({ ok: true }));</code> | Despacha SHOW_EXISTING_FOLDER sem anchorId. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 048 | U06 | <code>␠ [linha vazia]</code> | Separador visual em fallback para marker e escape de path; sem efeito runtime. | estrutural |\n| 049 | U06 | <code>        const result = await dispatch(router.createMessageRouter({</code> | Request contém folderPath com ponto metacaractere e safeTitle. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 050 | U06 | <code>            contextFactory: () =&gt; ({ handleMarkerAndShow }),</code> | Injeta colaborador controlado no contexto do router real para fallback para marker e escape de path. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 051 | U06 | <code>        }), { action: 'SHOW_EXISTING_FOLDER', folderPath: 'MangaTranslator/Chap.1', safeTitle: 'Chap.1' });</code> | Inicia assertion dos argumentos de downloads.search. | ✅ PROVADO DIRETAMENTE |\n| 052 | U06 | <code>␠ [linha vazia]</code> | Separador visual em fallback para marker e escape de path; sem efeito runtime. | estrutural |\n| 053 | U06 | <code>        expect(chrome.downloads.search).toHaveBeenCalledWith(</code> | Assertion Jest específica em fallback para marker e escape de path; a propriedade concreta está na própria linha. | ✅ PROVADO DIRETAMENTE |\n| 054 | U06 | <code>            { filenameRegex: 'MangaTranslator/Chap\\.1' }, expect.any(Function)</code> | Prova chamada handleMarkerAndShow com safeTitle Chap.1. | ✅ PROVADO DIRETAMENTE |\n| 055 | U06 | <code>        );</code> | Prova keepAlive=true e resposta ok=true. | ✅ PROVADO DIRETAMENTE |\n| 056 | U06 | <code>        expect(handleMarkerAndShow).toHaveBeenCalledWith('Chap.1', expect.any(Function));</code> | Assertion Jest específica em fallback para marker e escape de path; a propriedade concreta está na própria linha. | ✅ PROVADO DIRETAMENTE |\n| 057 | U06 | <code>        expect(result).toEqual({ keepAlive: true, response: { ok: true } });</code> | Assertion Jest específica em fallback para marker e escape de path; a propriedade concreta está na própria linha. | ✅ PROVADO DIRETAMENTE |\n| 058 | U06 | <code>    });</code> | Compõe o harness ou cenário fallback para marker e escape de path; a instrução exata está preservada nesta posição. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 059 | U07 | <code>});</code> | Fecha describe. | 🟨 EXECUTADO INDIRETAMENTE na suíte real |\n| 060 | U08 | <code>␠ [linha vazia]</code> | Separador visual em newline final; sem efeito runtime. | 🟦 verificação documental |\n

## 11. Unidades semânticas

### U01 — linhas 1–4
Resolve fisicamente o router e a action reais.

### U02 — linhas 5–18
Constrói ambiente global mínimo e registry isolado por teste.

### U03 — linhas 19–27
Adapta sendResponse a Promise e captura o keepAlive assíncrono.

### U04 — linhas 28–30
Declara a suíte e remove o router global após cada caso.

### U05 — linhas 31–41
Prova reuso do anchor existente.

### U06 — linhas 42–58
Prova escape do path e fallback para marker quando busca é vazia.

### U07 — linha 59
Fecha describe.

### U08 — posição 60
Newline terminal.

## 12. Invariantes e limites

1. action real deve ser registrada no router real;
2. anchor válido é prioridade sobre busca por path;
3. folderPath deve ser convertido a regex escapada antes da busca;
4. busca vazia deve chamar marker helper;
5. resultado da action atravessa envelope do router;
6. mocks provam chamadas, não efeitos do SO de downloads.show;
7. teste unitário não prova UI do Explorer/Finder;
8. branch sem assertion não deve ser promovido a prova apenas porque existe no código.

## 13. Autoauditoria — AGENTE 19

- [x] reserva #157 criada create-only e ownership confirmado;
- [x] state #157 criado;
- [x] SHA do fonte reconfirmado;
- [x] 59 linhas + newline = 60/60 posições;
- [x] fonte integral embutida;
- [x] action e router reais inspecionados;
- [x] CI do mesmo blob confirmada em Node 20/22 e Windows;
- [x] cobertura externa foi considerada para evitar solicitações duplicadas;
- [x] duas lacunas persistentes registradas;
- [x] nenhum código/teste externo foi modificado.

**Resultado documental:** os dois cenários existentes são diretamente provados; anchor stale e payload inválido permanecem lacunas explícitas.

# Bíblia técnica — tests/unit/background/open-manga-root-action.test.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE RESPONSÁVEL  
> **SHA auditado:** fd34ec27189d5c4f3bf2bffb51972a26f540a19b  
> **Agente responsável:** AGENTE 19  
> **Índice do corpus:** 158  
> **Tipo:** suíte Jest focal de open-manga-root  
> **Linhas textuais:** 86  
> **Posições documentais:** 87 com newline final  
> **Action real:** extension/background/actions/open-manga-root.js — SHA 71c83df253cdac601a118104fc1d7e467f35bfd6  
> **Router real:** extension/background/router.js — SHA d9278e9e58e4e9583a30c16227bfd833e7203d89

## 1. Papel arquitetural

A suíte prova a action OPEN_MANGA_ROOT carregando router e action reais. A action é deliberadamente fina: ignora o payload e delega toda a abertura da raiz a context.handleMarkerAndShow(null, resolve).

Os testes verificam os dois resultados funcionais que o helper pode devolver pelo callback: sucesso e erro. Isso fixa que a action não reinterpreta a resposta antes de o router montar o envelope final.

## 2. Harness

ROUTER_PATH e ACTION_PATH são resolvidos fisicamente a partir da suíte.

loadAction instala self/global e logger mockado, apaga MangaTranslatorRouter, isola o module registry e carrega os dois módulos reais.

dispatch é mais robusto que adapters simples: armazena response e keepAlive separadamente, resolvendo tanto quando a resposta chega depois do retorno do listener quanto quando chegaria sincronicamente. Para esta action o caminho é async, logo keepAlive esperado é true.

## 3. Caso de sucesso

handleMarkerAndShow recebe safeTitle nulo e chama sendResponse({ok:true}).

Assertions diretas:

- result.keepAlive === true;
- result.response === {ok:true};
- handleMarkerAndShow foi chamado com null e uma função callback.

Essa última assertion é essencial: prova que “raiz” é representada por safeTitle=null no contrato com o marker helper.

## 4. Caso de erro funcional

O helper responde {ok:false,error:'Falha.'}. A suíte usa sender de content tab, enquanto o primeiro cenário usa sender popup.

A assertion prova que a resposta negativa é preservada exatamente e que o canal permanece async.

Como meta.allowedSources=['any'], os dois contextos distintos atravessam o router com sucesso. Isso é execução direta dos dois source shapes, embora não exista assertion explícita sobre identifySource.

## 5. Evidência de execução real

O mesmo blob fd34ec27189d5c4f3bf2bffb51972a26f540a19b estava no commit b6ad13fce47adcab3fcd10281f28848f7b4ce50f.

CI #36577447500:

- job 109437162616 — Node 20.x — PASS open-manga-root-action.test.js;
- job 109437162754 — Node 22.x — PASS;
- job 109437162789 — Windows Portability — PASS.

Logo as assertions desta suíte passaram contra action/router reais no snapshot auditado.

## 6. Cobertura complementar

A busca por OPEN_MANGA_ROOT encontra somente esta suíte como exercício focal da action. routed-actions-legacy.test.js verifica apenas que a action está registrada.

marker-anchor-real.test.js chama backgroundModule.handleMarkerAndShow(null, callback) e prova comportamento real do helper de marker root, complementando esta suíte sem substituir a prova de wiring action → helper.

## 7. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| action e router reais são carregados | require isolado + CI PASS | 🟨 EXECUTADO INDIRETAMENTE |
| OPEN_MANGA_ROOT usa canal async | keepAlive=true nos dois casos | ✅ PROVADO DIRETAMENTE |
| helper root recebe safeTitle=null | toHaveBeenCalledWith(null, function) | ✅ PROVADO DIRETAMENTE |
| resposta ok do helper é preservada | toEqual | ✅ PROVADO DIRETAMENTE |
| resposta de erro do helper é preservada | toEqual | ✅ PROVADO DIRETAMENTE |
| popup-like sender é aceito | primeiro caso executa | 🟨 EXECUTADO INDIRETAMENTE |
| content-tab sender é aceito | segundo caso executa | 🟨 EXECUTADO INDIRETAMENTE |
| helper lança exceção síncrona | nenhum caso localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 8. Solicitação ao auditor

### 158-001 — TEST_REQUIRED — OPEN

**Encontrado:** não foi localizado caso em que handleMarkerAndShow lança exceção síncrona antes de chamar o callback.

**Arquivo auditado/relacionado:** tests/unit/background/open-manga-root-action.test.js.

**Evidência atual:** callback de sucesso e callback de erro funcional são diretamente provados.

**Evidência ausente:** Promise da action rejeita por throw do helper e router deve responder INTERNAL_ERROR no caminho async.

**Por que é relevante:** erro funcional por callback e exceção são mecanismos diferentes; cobrir um não prova o outro.

**Ação esperada:** adicionar teste focal com helper que lança Error e afirmar resposta do router/log conforme contrato atual.

**Evidência esperada:** keepAlive=true e envelope {ok:false,error:{code:'INTERNAL_ERROR',...}} ou contrato explicitamente decidido.

**Possível regressão:** exceção de infraestrutura pode escapar/gerar resposta diferente sem falhar a suíte atual.

**Severidade:** NORMAL.

## 9. Fonte integral auditada

~~~js
const path = require('path');

const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');
const ACTION_PATH = path.resolve(
    __dirname,
    '../../../extension/background/actions/open-manga-root.js'
);

function dispatch(listener, request, sender) {
    return new Promise(resolve => {
        let keepAlive;
        let response;

        const sendResponse = result => {
            response = result;
            if (keepAlive !== undefined) resolve({ keepAlive, response });
        };

        keepAlive = listener(request, sender, sendResponse);
        if (response !== undefined || keepAlive === false) {
            resolve({ keepAlive, response });
        }
    });
}

function loadAction() {
    global.self = global;
    global.MangaTranslatorLog = { log: jest.fn() };
    delete global.MangaTranslatorRouter;

    jest.isolateModules(() => {
        require(ROUTER_PATH);
        require(ACTION_PATH);
    });

    return global.MangaTranslatorRouter;
}

describe('background/actions/open-manga-root.js', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    afterEach(() => {
        delete global.MangaTranslatorLog;
        delete global.MangaTranslatorRouter;
    });

    test('delegates to the root marker helper and preserves its success response', async () => {
        const handleMarkerAndShow = jest.fn((_safeTitle, sendResponse) => {
            sendResponse({ ok: true });
        });
        const router = loadAction();

        const result = await dispatch(router.createMessageRouter({
            contextFactory: () => ({ handleMarkerAndShow }),
        }), {
            action: 'OPEN_MANGA_ROOT',
        }, { id: chrome.runtime.id, tab: null });

        expect(result).toEqual({
            keepAlive: true,
            response: { ok: true },
        });
        expect(handleMarkerAndShow).toHaveBeenCalledWith(null, expect.any(Function));
    });

    test('preserves an error returned by the root marker helper', async () => {
        const router = loadAction();

        const result = await dispatch(router.createMessageRouter({
            contextFactory: () => ({
                handleMarkerAndShow: (_safeTitle, sendResponse) => {
                    sendResponse({ ok: false, error: 'Falha.' });
                },
            }),
        }), {
            action: 'OPEN_MANGA_ROOT',
        }, { tab: { id: 22, url: 'https://reader.example/chapter' } });

        expect(result).toEqual({
            keepAlive: true,
            response: { ok: false, error: 'Falha.' },
        });
    });
});
~~~

## 10. Mapa linha por linha

| Linha | Unidade | Fonte | Papel | Evidência |\n|---:|---|---|---|---|\n| 001 | U01 | <code>const path = require('path');</code> | Importa path para resolver módulos reais. | 🟨 EXECUTADO INDIRETAMENTE |\n| 002 | U01 | <code>␠ [linha vazia]</code> | Separador visual em paths reais; sem efeito runtime. | estrutural |\n| 003 | U01 | <code>const ROUTER_PATH = path.resolve(__dirname, '../../../extension/background/router.js');</code> | Inicia resolução do router real. | 🟨 EXECUTADO INDIRETAMENTE |\n| 004 | U01 | <code>const ACTION_PATH = path.resolve(</code> | Completa ROUTER_PATH para extension/background/router.js. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 005 | U01 | <code>    __dirname,</code> | Inicia resolução da action real. | 🟨 EXECUTADO INDIRETAMENTE |\n| 006 | U01 | <code>    '../../../extension/background/actions/open-manga-root.js'</code> | Usa caminho extension/background/actions/open-manga-root.js. | 🟦 GATE ESTÁTICO ESPECÍFICO |\n| 007 | U01 | <code>);</code> | Fecha estrutura sintática de paths reais. | 🟨 EXECUTADO INDIRETAMENTE |\n| 008 | U02 | <code>␠ [linha vazia]</code> | Separador visual em dispatch robusto sync/async; sem efeito runtime. | estrutural |\n| 009 | U02 | <code>function dispatch(listener, request, sender) {</code> | Declara adapter de listener para Promise. | 🟨 EXECUTADO INDIRETAMENTE |\n| 010 | U02 | <code>    return new Promise(resolve =&gt; {</code> | Cria Promise do dispatch. | 🟨 EXECUTADO INDIRETAMENTE |\n| 011 | U02 | <code>        let keepAlive;</code> | Declara keepAlive retornado pelo router. | 🟨 EXECUTADO INDIRETAMENTE |\n| 012 | U02 | <code>        let response;</code> | Declara slot para resposta síncrona ou assíncrona. | 🟨 EXECUTADO INDIRETAMENTE |\n| 013 | U02 | <code>␠ [linha vazia]</code> | Separador visual em dispatch robusto sync/async; sem efeito runtime. | estrutural |\n| 014 | U02 | <code>        const sendResponse = result =&gt; {</code> | Define sendResponse que armazena resultado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 015 | U02 | <code>            response = result;</code> | Se keepAlive já foi conhecido, resolve imediatamente com ambos os valores. | 🟨 EXECUTADO INDIRETAMENTE |\n| 016 | U02 | <code>            if (keepAlive !== undefined) resolve({ keepAlive, response });</code> | Compõe o harness ou cenário dispatch robusto sync/async; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 017 | U02 | <code>        };</code> | Fecha estrutura sintática de dispatch robusto sync/async. | 🟨 EXECUTADO INDIRETAMENTE |\n| 018 | U02 | <code>␠ [linha vazia]</code> | Separador visual em dispatch robusto sync/async; sem efeito runtime. | estrutural |\n| 019 | U02 | <code>        keepAlive = listener(request, sender, sendResponse);</code> | Se resposta já chegou sincronamente ou listener retornou false, resolve sem aguardar outro callback. | 🟨 EXECUTADO INDIRETAMENTE |\n| 020 | U02 | <code>        if (response !== undefined &#124;&#124; keepAlive === false) {</code> | Compõe o harness ou cenário dispatch robusto sync/async; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 021 | U02 | <code>            resolve({ keepAlive, response });</code> | Compõe o harness ou cenário dispatch robusto sync/async; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 022 | U02 | <code>        }</code> | Fecha estrutura sintática de dispatch robusto sync/async. | 🟨 EXECUTADO INDIRETAMENTE |\n| 023 | U02 | <code>    });</code> | Compõe o harness ou cenário dispatch robusto sync/async; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 024 | U02 | <code>}</code> | Fecha estrutura sintática de dispatch robusto sync/async. | 🟨 EXECUTADO INDIRETAMENTE |\n| 025 | U03 | <code>␠ [linha vazia]</code> | Separador visual em loadAction e registry isolado; sem efeito runtime. | estrutural |\n| 026 | U03 | <code>function loadAction() {</code> | Aponta self para global para IIFEs. | 🟨 EXECUTADO INDIRETAMENTE |\n| 027 | U03 | <code>    global.self = global;</code> | Instala logger global mockado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 028 | U03 | <code>    global.MangaTranslatorLog = { log: jest.fn() };</code> | Apaga router global anterior. | 🟨 EXECUTADO INDIRETAMENTE |\n| 029 | U03 | <code>    delete global.MangaTranslatorRouter;</code> | Compõe o harness ou cenário loadAction e registry isolado; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 030 | U03 | <code>␠ [linha vazia]</code> | Separador visual em loadAction e registry isolado; sem efeito runtime. | estrutural |\n| 031 | U03 | <code>    jest.isolateModules(() =&gt; {</code> | Carrega router real. | 🟨 EXECUTADO INDIRETAMENTE |\n| 032 | U03 | <code>        require(ROUTER_PATH);</code> | Carrega action real. | 🟨 EXECUTADO INDIRETAMENTE |\n| 033 | U03 | <code>        require(ACTION_PATH);</code> | Compõe o harness ou cenário loadAction e registry isolado; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 034 | U03 | <code>    });</code> | Compõe o harness ou cenário loadAction e registry isolado; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 035 | U03 | <code>␠ [linha vazia]</code> | Separador visual em loadAction e registry isolado; sem efeito runtime. | estrutural |\n| 036 | U03 | <code>    return global.MangaTranslatorRouter;</code> | Compõe o harness ou cenário loadAction e registry isolado; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 037 | U03 | <code>}</code> | Fecha estrutura sintática de loadAction e registry isolado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 038 | U04 | <code>␠ [linha vazia]</code> | Separador visual em suite e lifecycle Jest; sem efeito runtime. | estrutural |\n| 039 | U04 | <code>describe('background/actions/open-manga-root.js', () =&gt; {</code> | beforeEach reseta module registry Jest. | 🟨 EXECUTADO INDIRETAMENTE |\n| 040 | U04 | <code>    beforeEach(() =&gt; {</code> | Compõe o harness ou cenário suite e lifecycle Jest; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 041 | U04 | <code>        jest.resetModules();</code> | Compõe o harness ou cenário suite e lifecycle Jest; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 042 | U04 | <code>    });</code> | Compõe o harness ou cenário suite e lifecycle Jest; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 043 | U04 | <code>␠ [linha vazia]</code> | Separador visual em suite e lifecycle Jest; sem efeito runtime. | estrutural |\n| 044 | U04 | <code>    afterEach(() =&gt; {</code> | afterEach remove router global. | 🟨 EXECUTADO INDIRETAMENTE |\n| 045 | U04 | <code>        delete global.MangaTranslatorLog;</code> | Compõe o harness ou cenário suite e lifecycle Jest; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 046 | U04 | <code>        delete global.MangaTranslatorRouter;</code> | Compõe o harness ou cenário suite e lifecycle Jest; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 047 | U04 | <code>    });</code> | Compõe o harness ou cenário suite e lifecycle Jest; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 048 | U04 | <code>␠ [linha vazia]</code> | Separador visual em suite e lifecycle Jest; sem efeito runtime. | estrutural |\n| 049 | U05 | <code>    test('delegates to the root marker helper and preserves its success response', async () =&gt; {</code> | Declara cenário de sucesso do marker root. | 🟨 EXECUTADO INDIRETAMENTE |\n| 050 | U05 | <code>        const handleMarkerAndShow = jest.fn((_safeTitle, sendResponse) =&gt; {</code> | Cria handleMarkerAndShow mock que responde ok=true. | 🟨 EXECUTADO INDIRETAMENTE |\n| 051 | U05 | <code>            sendResponse({ ok: true });</code> | Helper mock chama callback de resposta. | 🟨 EXECUTADO INDIRETAMENTE |\n| 052 | U05 | <code>        });</code> | Compõe o harness ou cenário delegação com sucesso; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 053 | U05 | <code>        const router = loadAction();</code> | Carrega action real. | 🟨 EXECUTADO INDIRETAMENTE |\n| 054 | U05 | <code>␠ [linha vazia]</code> | Separador visual em delegação com sucesso; sem efeito runtime. | estrutural |\n| 055 | U05 | <code>        const result = await dispatch(router.createMessageRouter({</code> | Despacha listener criado pelo router real. | 🟨 EXECUTADO INDIRETAMENTE |\n| 056 | U05 | <code>            contextFactory: () =&gt; ({ handleMarkerAndShow }),</code> | Injeta handleMarkerAndShow controlado no contexto. | 🟨 EXECUTADO INDIRETAMENTE |\n| 057 | U05 | <code>        }), {</code> | Compõe o harness ou cenário delegação com sucesso; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 058 | U05 | <code>            action: 'OPEN_MANGA_ROOT',</code> | Request usa alias OPEN_MANGA_ROOT. | 🟨 EXECUTADO INDIRETAMENTE |\n| 059 | U05 | <code>        }, { id: chrome.runtime.id, tab: null });</code> | Sender simula contexto popup pelo runtime.id. | 🟨 EXECUTADO INDIRETAMENTE |\n| 060 | U05 | <code>␠ [linha vazia]</code> | Separador visual em delegação com sucesso; sem efeito runtime. | estrutural |\n| 061 | U05 | <code>        expect(result).toEqual({</code> | Inicia assertion do resultado completo. | ✅ PROVADO DIRETAMENTE |\n| 062 | U05 | <code>            keepAlive: true,</code> | Prova keepAlive=true. | ✅ PROVADO DIRETAMENTE |\n| 063 | U05 | <code>            response: { ok: true },</code> | Prova resposta {ok:true}. | ✅ PROVADO DIRETAMENTE |\n| 064 | U05 | <code>        });</code> | Compõe o harness ou cenário delegação com sucesso; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 065 | U05 | <code>        expect(handleMarkerAndShow).toHaveBeenCalledWith(null, expect.any(Function));</code> | Prova chamada handleMarkerAndShow(null, callback). | ✅ PROVADO DIRETAMENTE |\n| 066 | U05 | <code>    });</code> | Compõe o harness ou cenário delegação com sucesso; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 067 | U06 | <code>␠ [linha vazia]</code> | Separador visual em preservação de erro do helper; sem efeito runtime. | estrutural |\n| 068 | U06 | <code>    test('preserves an error returned by the root marker helper', async () =&gt; {</code> | Declara cenário em que helper responde erro funcional. | 🟨 EXECUTADO INDIRETAMENTE |\n| 069 | U06 | <code>        const router = loadAction();</code> | Carrega action real. | 🟨 EXECUTADO INDIRETAMENTE |\n| 070 | U06 | <code>␠ [linha vazia]</code> | Separador visual em preservação de erro do helper; sem efeito runtime. | estrutural |\n| 071 | U06 | <code>        const result = await dispatch(router.createMessageRouter({</code> | Despacha OPEN_MANGA_ROOT novamente. | 🟨 EXECUTADO INDIRETAMENTE |\n| 072 | U06 | <code>            contextFactory: () =&gt; ({</code> | Injeta colaborador no contexto real do router em preservação de erro do helper. | 🟨 EXECUTADO INDIRETAMENTE |\n| 073 | U06 | <code>                handleMarkerAndShow: (_safeTitle, sendResponse) =&gt; {</code> | Injeta handleMarkerAndShow que responde {ok:false,error:'Falha.'}. | 🟨 EXECUTADO INDIRETAMENTE |\n| 074 | U06 | <code>                    sendResponse({ ok: false, error: 'Falha.' });</code> | Helper entrega erro pelo callback esperado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 075 | U06 | <code>                },</code> | Fecha estrutura sintática de preservação de erro do helper. | 🟨 EXECUTADO INDIRETAMENTE |\n| 076 | U06 | <code>            }),</code> | Compõe o harness ou cenário preservação de erro do helper; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 077 | U06 | <code>        }), {</code> | Compõe o harness ou cenário preservação de erro do helper; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 078 | U06 | <code>            action: 'OPEN_MANGA_ROOT',</code> | Request usa alias OPEN_MANGA_ROOT. | 🟨 EXECUTADO INDIRETAMENTE |\n| 079 | U06 | <code>        }, { tab: { id: 22, url: 'https://reader.example/chapter' } });</code> | Sender simula content tab. | 🟨 EXECUTADO INDIRETAMENTE |\n| 080 | U06 | <code>␠ [linha vazia]</code> | Separador visual em preservação de erro do helper; sem efeito runtime. | estrutural |\n| 081 | U06 | <code>        expect(result).toEqual({</code> | Inicia assertion de preservação do erro. | ✅ PROVADO DIRETAMENTE |\n| 082 | U06 | <code>            keepAlive: true,</code> | Prova keepAlive=true. | ✅ PROVADO DIRETAMENTE |\n| 083 | U06 | <code>            response: { ok: false, error: 'Falha.' },</code> | Prova que response do helper é preservada sem reescrita. | ✅ PROVADO DIRETAMENTE |\n| 084 | U06 | <code>        });</code> | Compõe o harness ou cenário preservação de erro do helper; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 085 | U06 | <code>    });</code> | Compõe o harness ou cenário preservação de erro do helper; o código exato está preservado. | 🟨 EXECUTADO INDIRETAMENTE |\n| 086 | U07 | <code>});</code> | Fecha describe. | 🟨 EXECUTADO INDIRETAMENTE |\n| 087 | U08 | <code>␠ [linha vazia]</code> | Separador visual em newline final; sem efeito runtime. | 🟦 verificação documental |\n

## 11. Unidades semânticas

### U01 — linhas 1–7
Paths estáticos para módulos reais.

### U02 — linhas 8–24
Adapter de dispatch que acomoda resposta síncrona e assíncrona.

### U03 — linhas 25–37
Loader isolado de router/action.

### U04 — linhas 38–48
Lifecycle Jest e limpeza de globals.

### U05 — linhas 49–66
Sucesso do helper root + assertion de safeTitle=null.

### U06 — linhas 67–85
Erro funcional devolvido pelo helper é preservado.

### U07/U08
Fechamento e newline terminal.

## 12. Invariantes

1. OPEN_MANGA_ROOT deve chegar à action real pelo alias do router;
2. action deve delegar raiz como null;
3. helper controla a resposta funcional;
4. router deve manter canal async para a Promise;
5. resposta do helper não deve ser transformada indevidamente;
6. mocks provam wiring, não efeito do SO ao abrir pasta;
7. ausência de assertion não deve ser promovida a prova direta.

## 13. Autoauditoria — AGENTE 19

- [x] reserva #158 create-only e ownership confirmado;
- [x] state #158 criado;
- [x] SHA do fonte reconfirmado;
- [x] 86 linhas + newline = 87/87;
- [x] fonte integral embutida;
- [x] action/router reais inspecionados;
- [x] mesmo blob confirmado em CI Linux Node 20/22 e Windows;
- [x] cobertura complementar do marker helper diferenciada da action;
- [x] uma lacuna externa registrada;
- [x] nenhum código/teste externo alterado.

**Resultado documental:** sucesso e erro por callback estão diretamente provados; exceção síncrona do helper permanece lacuna explícita.

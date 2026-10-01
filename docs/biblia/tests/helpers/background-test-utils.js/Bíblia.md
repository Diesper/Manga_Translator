# Bíblia técnica — tests/helpers/background-test-utils.js

> **Estado documental:** ✅ CONCLUÍDA pelo AGENTE 20 após autoauditoria documental  
> **SHA auditado:** `1c38cfc47917f2a42788c467b9dbf58648b73e2b`  
> **Agente:** AGENTE 20  
> **Tipo:** harness CommonJS compartilhado dos testes do background  
> **Linhas textuais:** 60  
> **Posições documentais:** 61, incluindo newline terminal  
> **PR/branch:** #66 / `docs/project-bible`

## 1. Papel arquitetural

Este arquivo é infraestrutura de teste, não runtime da extensão. Ele localiza o `extension/background.js` real, oferece primitivas de espera (`delay`, `flush`, `waitFor`) e adapta o listener do mock de `chrome.runtime.onMessage` para uma Promise (`getBackgroundListener`/ `dispatchToBackground`).

Não abre rede, não chama shell, não persiste dados e não altera código de produção. Seu risco é de **integridade da evidência**: uma semântica incorreta aqui pode mascarar regressão, causar falso negativo ou deixar Jest pendurado.

## 2. API exportada

| Símbolo | Semântica real |
|---|---|
| `BACKGROUND_PATH` | path absoluto de `extension/background.js` derivado de `__dirname` |
| `delay(ms=0)` | Promise resolvida após `setTimeout(ms)` |
| `flush(rounds=6)` | faz `rounds` esperas sequenciais de 0 ms |
| `waitFor(assertion,{timeout=3000,interval=10})` | polling até primeiro valor truthy ou timeout |
| `getBackgroundListener(runtimeMock)` | exige exatamente um item em `_messageListeners` |
| `dispatchToBackground(...)` | chama o listener e resolve `{keepAlive,response}` |

`delay` e `getBackgroundListener` não tiveram import externo direto localizado; são usados internamente.

## 3. Semântica temporal

### BACKGROUND_PATH
Usa `path.resolve(__dirname, '../../extension/background.js')`; portanto independe de `process.cwd()`. Os consumers carregam o background real por esse path. Isso é execução indireta, não assertion do texto absoluto do path.

### delay
É um wrapper mínimo de timer. Não valida `ms`, não cancela e não possui teste focal isolado. É exercido indiretamente por `flush` e `waitFor`.

### flush
Repete `await delay(0)` de forma sequencial. É uma cessão heurística ao event loop, **não** uma garantia de quiescência. `rounds<=0` produz zero iterações. Várias suítes fazem assertions depois de `flush(N)`, mas não provam a contagem de timers do helper: **🟨 EXECUTADO INDIRETAMENTE**.

### waitFor
A condição é executada antes da primeira espera. O primeiro valor truthy é retornado sem transformação. Valor falsy causa espera de `interval` e nova tentativa enquanto `Date.now()-startedAt < timeout`. Ao expirar, lança `Timeout aguardando condição assíncrona`.

Se a assertion lançar/rejeitar, o erro propaga imediatamente. Com `timeout<=0`, a assertion nem é chamada. Como o prazo é conferido no topo, uma assertion lenta pode terminar depois do prazo nominal e ainda retornar sucesso se produzir truthy.

Em `helpers-real.test.js`, valores retornados por `waitFor` são armazenados em `burstEntries` e `capped` e usados por assertions posteriores. O retorno truthy está **✅ PROVADO DIRETAMENTE**. Timeout, erro e opções de borda continuam **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO**.

## 4. Invariante do listener

`getBackgroundListener` usa `runtimeMock._messageListeners || []` e exige `length === 1`. Zero ou múltiplos listeners geram erro com a quantidade encontrada. O caminho positivo participa dos dispatches reais; os dois guards negativos não possuem assertion focal localizada.

Essa escolha é útil para detectar vazamento/acúmulo de listeners entre testes, mas acopla o helper ao campo privado do mock.

## 5. dispatchToBackground

O default de sender é `{tab:null}`. A Promise começa com `settled=false` e `keepAlive=false`. `sendResponse` marca settlement e resolve `{keepAlive,response}`. Em seguida o listener é chamado e seu retorno é atribuído a `keepAlive`.

Se o retorno for **estritamente false** e ainda não houver resposta, o fallback resolve `{keepAlive:false,response:undefined}`.

### Caminhos provados
- `test_bg59.test.js` verifica diretamente `keepAlive === true` e conteúdo da response no helper real.
- `plan-missing-handlers-real.test.js` BG-43 verifica diretamente `keepAlive === false` e `response === {ok:true}`.
- outros consumers verificam diversos payloads retornados pelo dispatcher.

### Borda temporal sem contrato focal
Se o listener chama `sendResponse` **sincronamente** e só depois retorna `true`, a Promise é resolvida enquanto `keepAlive` ainda contém o valor inicial false. A atribuição para true ocorre depois da resolução.

Também:
- return false sem response → resolve undefined;
- return true sem response → Promise permanece pendente;
- return undefined sem response → também permanece pendente, porque o fallback usa `=== false`;
- não há timeout interno no dispatcher.

Essas bordas geram a solicitação 098-002.

## 6. Consumers reais verificados

Importam este helper no branch auditado:

1. `tests/unit/background/test_bg59.test.js`
2. `tests/unit/background/marker-anchor-real.test.js`
3. `tests/unit/background/helpers-real.test.js`
4. `tests/unit/background/routed-actions-legacy.test.js`
5. `tests/unit/background/single-image-context-menu.test.js`
6. `tests/unit/background/lifecycle-alarms-real.test.js`
7. `tests/unit/background/message-handlers-real.test.js`
8. `tests/unit/background/process-finalize-real.test.js`
9. `tests/unit/background/plan-missing-handlers-real.test.js`

Uso observado: `BACKGROUND_PATH` e `flush` nos nove; `waitFor` em seis; `dispatchToBackground` em cinco.

## 7. Duplicações que não são prova deste arquivo

`handlers-extra-real.test.js` e `batch-lifecycle-real.test.js` mantêm cópias locais parecidas, inclusive com defaults de timeout diferentes. `regex-escape.test.js` também possui seleção/dispatch local com contrato diferente. Essas cópias indicam risco de drift, mas **não** contam como execução da implementação auditada.

## 8. Evidência automatizada do mesmo blob

O SHA auditado também existe no commit `b6ad13fce47adcab3fcd10281f28848f7b4ce50f`, executado no workflow **MangaTranslator CI #36577447500**.

- **Unit + Integration (20.x)** — job `109437162616`: success; logs mostram PASS para os nove consumers; resumo 109 suites, 851 testes, 0 skipped, 0 todo.
- **Unit + Integration (22.x)**: success.
- **Windows Portability** — job `109437162789`: success; Jest completo mostra novamente PASS para os nove consumers e 109/109 suites, 851/851 testes.

Isso prova execução real e portabilidade observada do caminho usado. Não prova automaticamente branches negativos do helper.

## 9. Matriz de força da evidência

| Comportamento | Evidência | Classificação |
|---|---|---|
| helper é carregado por consumers | nove imports + CI Linux/Windows | 🟨 EXECUTADO INDIRETAMENTE |
| BACKGROUND_PATH alcança background real | consumers passam carregando o módulo | 🟨 EXECUTADO INDIRETAMENTE |
| flush permite progresso nos fluxos atuais | asserts posteriores passam | 🟨 EXECUTADO INDIRETAMENTE |
| waitFor devolve valor truthy | retorno usado em assertions | ✅ PROVADO DIRETAMENTE |
| timeout/erro de waitFor | nenhuma assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| listener único funciona | dispatches reais | 🟨 EXECUTADO INDIRETAMENTE |
| zero/múltiplos listeners falham | nenhuma assertion focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| dispatch keepAlive=true + response | `test_bg59` e outros | ✅ PROVADO DIRETAMENTE |
| dispatch keepAlive=false + response | BG-43 | ✅ PROVADO DIRETAMENTE |
| false sem response | sem teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| true/undefined sem response | sem teste focal; pendência inferida do código | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| response síncrona + return true | sem contrato focal; captura temporal possível | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| delay isolado | sem teste focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 10. Solicitações ao auditor

### 098-001 — TEST_REQUIRED — OPEN
**Encontrado:** não existe suíte focal do helper para branches negativos/bordas.  
**Target sugerido:** `tests/unit/helpers/background-test-utils.test.js` (novo, se aprovado).  
**Evidência atual:** nove consumers verdes em Linux/Windows e prova direta de alguns resultados positivos.  
**Ausente:** delay isolado, rounds de flush, timeout/erro/opções de waitFor, zero/múltiplos listeners, false/true/undefined sem response e múltiplas respostas.  
**Ação:** criar teste separado da implementação real com timers/mocks controlados, sem copiar a lógica.  
**Evidência esperada:** assertions sobre resolução/rejeição, polls/rounds, mensagens e par keepAlive/response.  
**Risco:** harness pode mascarar erro ou pendurar suíte.  
**Severidade:** NORMAL.

### 098-002 — CONTRACT_REVIEW — OPEN
**Encontrado:** resposta síncrona pode capturar o keepAlive inicial antes do retorno final; undefined sem response não ativa fallback.  
**Target:** `tests/helpers/background-test-utils.js`.  
**Evidência atual:** ordem das linhas 39/41–46 e fallback estrito da linha 47; consumers não cobrem essas bordas.  
**Ausente:** contrato explícito para sync response + return true e para undefined sem response.  
**Ação:** auditor deve definir semântica desejada; se atual for intencional, fixar com teste; se não, corrigir em mudança funcional separada com regressão.  
**Risco:** keepAlive enganoso ou Promise pendente.  
**Severidade:** NORMAL.

## 11. Fonte integral auditada

```js
const path = require('path');

const BACKGROUND_PATH = path.resolve(__dirname, '../../extension/background.js');

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function flush(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        // eslint-disable-next-line no-await-in-loop
        await delay(0);
    }
}

async function waitFor(assertion, { timeout = 3000, interval = 10 } = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        // eslint-disable-next-line no-await-in-loop
        const result = await assertion();
        if (result) return result;
        // eslint-disable-next-line no-await-in-loop
        await delay(interval);
    }
    throw new Error('Timeout aguardando condição assíncrona');
}

function getBackgroundListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    if (listeners.length !== 1) {
        throw new Error(`Esperava 1 listener do background, recebi ${listeners.length}`);
    }
    return listeners[0];
}

function dispatchToBackground(runtimeMock, request, sender = { tab: null }) {
    return new Promise((resolve) => {
        let settled = false;
        let keepAlive = false;

        const sendResponse = (response) => {
            settled = true;
            resolve({ keepAlive, response });
        };

        keepAlive = getBackgroundListener(runtimeMock)(request, sender, sendResponse);
        if (keepAlive === false && !settled) {
            resolve({ keepAlive, response: undefined });
        }
    });
}

module.exports = {
    BACKGROUND_PATH,
    delay,
    flush,
    waitFor,
    getBackgroundListener,
    dispatchToBackground,
};
```

## 12. Mapa linha por linha

| Linha | Papel local | Evidência |
|---:|---|---|
| 1 | importa path built-in | 🟨 EXECUTADO INDIRETAMENTE |
| 2 | linha em branco | estrutural |
| 3 | resolve extension/background.js por __dirname | 🟨 EXECUTADO INDIRETAMENTE |
| 4 | linha em branco | estrutural |
| 5 | declara delay(ms=0) | 🟨 EXECUTADO INDIRETAMENTE |
| 6 | Promise resolvida por setTimeout(ms) | 🟨 EXECUTADO INDIRETAMENTE |
| 7 | fecha delay | estrutural |
| 8 | linha em branco | estrutural |
| 9 | declara flush(rounds=6) | 🟨 EXECUTADO INDIRETAMENTE |
| 10 | itera rounds vezes | 🟨 EXECUTADO INDIRETAMENTE |
| 11 | comentário ESLint para await deliberado | estrutural |
| 12 | aguarda delay(0) | 🟨 EXECUTADO INDIRETAMENTE |
| 13 | fecha loop | estrutural |
| 14 | fecha flush | estrutural |
| 15 | linha em branco | estrutural |
| 16 | declara waitFor; defaults timeout=3000/interval=10 | 🟨 EXECUTADO INDIRETAMENTE |
| 17 | registra início | 🟨 EXECUTADO INDIRETAMENTE |
| 18 | loop limitado por Date.now | 🟨 EXECUTADO INDIRETAMENTE |
| 19 | comentário ESLint | estrutural |
| 20 | aguarda assertion | 🟨 EXECUTADO INDIRETAMENTE |
| 21 | retorna primeiro valor truthy | ✅ PROVADO DIRETAMENTE em caminho concreto |
| 22 | comentário ESLint | estrutural |
| 23 | aguarda interval | 🟨 EXECUTADO INDIRETAMENTE |
| 24 | fecha loop | estrutural |
| 25 | lança timeout canônico | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| 26 | fecha waitFor | estrutural |
| 27 | linha em branco | estrutural |
| 28 | declara getBackgroundListener | 🟨 EXECUTADO INDIRETAMENTE |
| 29 | lê _messageListeners ou [] | 🟨 EXECUTADO INDIRETAMENTE |
| 30 | exige exatamente 1 listener | 🟨 EXECUTADO INDIRETAMENTE |
| 31 | erro inclui contagem real | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| 32 | fecha guard | estrutural |
| 33 | retorna listener único | 🟨 EXECUTADO INDIRETAMENTE |
| 34 | fecha helper | estrutural |
| 35 | linha em branco | estrutural |
| 36 | declara dispatch; sender default {tab:null} | 🟨 EXECUTADO INDIRETAMENTE |
| 37 | cria Promise adaptadora | 🟨 EXECUTADO INDIRETAMENTE |
| 38 | settled=false | 🟨 EXECUTADO INDIRETAMENTE |
| 39 | keepAlive=false | 🟨 EXECUTADO INDIRETAMENTE |
| 40 | linha em branco | estrutural |
| 41 | declara sendResponse | 🟨 EXECUTADO INDIRETAMENTE |
| 42 | settled=true | 🟨 EXECUTADO INDIRETAMENTE |
| 43 | resolve {keepAlive,response} | ✅ PROVADO DIRETAMENTE em caminho concreto |
| 44 | fecha callback | estrutural |
| 45 | linha em branco | estrutural |
| 46 | invoca listener e captura retorno keepAlive | ✅ PROVADO DIRETAMENTE em caminho concreto |
| 47 | fallback somente se === false e não settled | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| 48 | resolve fallback com response undefined | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| 49 | fecha guard | estrutural |
| 50 | fecha executor | estrutural |
| 51 | fecha dispatch | estrutural |
| 52 | linha em branco | estrutural |
| 53 | inicia module.exports | estrutural |
| 54 | exporta BACKGROUND_PATH | 🟨 EXECUTADO INDIRETAMENTE |
| 55 | exporta delay | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| 56 | exporta flush | 🟨 EXECUTADO INDIRETAMENTE |
| 57 | exporta waitFor | 🟨 EXECUTADO INDIRETAMENTE |
| 58 | exporta getBackgroundListener | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| 59 | exporta dispatchToBackground | ✅ PROVADO DIRETAMENTE em caminho concreto |
| 60 | fecha exports | estrutural |
| 61 | newline terminal | 🟦 integridade do blob reconfirmada |

## 13. Invariantes e riscos

1. O path deve continuar apontando ao background real.
2. waitFor deve preservar o valor truthy retornado.
3. request/sender são encaminhados sem transformação.
4. dispatcher pressupõe exatamente um listener.
5. helper não deve manter handles permanentes.
6. flush é heurístico, não barreira formal.
7. polling usa relógio real e pode variar sob carga.
8. Promise do dispatcher não tem timeout interno.
9. campo privado `_messageListeners` é acoplamento ao mock.
10. cópias locais semelhantes podem divergir silenciosamente.

## 14. Casos-limite

- `flush(0)`: zero timers;
- truthy na primeira tentativa de waitFor: retorno imediato;
- assertion rejeita: erro propaga;
- `timeout=0`: nenhuma assertion;
- ausência de `_messageListeners`: erro de zero listener;
- dois listeners: erro;
- sender omitido: `{tab:null}`;
- false sem response: resolve undefined;
- true sem response: pendente;
- undefined sem response: pendente;
- resposta assíncrona após return true: keepAlive true;
- resposta síncrona antes de return true: pode registrar keepAlive false;
- múltiplas respostas: a primeira resolução efetiva da Promise prevalece.

## 15. Autoauditoria do AGENTE 20

- [x] ownership #098 confirmado antes da escrita;
- [x] SHA do fonte reconfirmado;
- [x] fonte integral incorporada;
- [x] 60 linhas + newline = 61 posições documentadas;
- [x] consumers e CI do mesmo blob verificados;
- [x] prova direta separada de execução indireta;
- [x] duplicações locais não promovidas a prova;
- [x] lacunas registradas como audit_requests;
- [x] nenhum arquivo externo foi modificado para fabricar evidência.

**Resultado:** documentação completa do blob `1c38cfc47917f2a42788c467b9dbf58648b73e2b`. As solicitações 098-001 e 098-002 permanecem OPEN para auditoria separada.

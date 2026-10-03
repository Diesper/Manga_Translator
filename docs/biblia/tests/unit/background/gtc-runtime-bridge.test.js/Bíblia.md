# Bíblia técnica — tests/unit/background/gtc-runtime-bridge.test.js

> **Estado:** ✅ CONCLUÍDO — autoauditoria documental do AGENTE 22  
> **SHA auditado:** 21c01d044af7313cae9b571ab715c4e5846b9a30  
> **Agente:** AGENTE 22  
> **Índice:** 147  
> **Tipo:** teste unitário de background / integração real do runtime bridge GTC  
> **Linhas textuais:** **102**  
> **Posições documentais:** **103**, contando newline final  
> **PR/branch:** #66 / `docs/project-bible`

## 1. Função no sistema

Esta suíte prova que `extension/background.js` real registra corretamente sua ponte de mensagens e delega operações `GTC_*` para a implementação real de `extension/shared/gtc-indexeddb.js`, sem impedir handlers não-GTC registrados no background.

O teste não constrói um handler GTC espelho. Ele faz `require(BACKGROUND_PATH)` em isolamento, usa o `ChromeRuntimeMock` como barramento de mensagens e observa respostas do listener registrado por `background.js`.

## 2. Caminho executado

No background atual, a mensagem passa por:

`chrome.runtime.onMessage`
→ `routeRegisteredAction(...)`
→ se não for uma action registrada, `handleGtcRuntimeMessage(...)`
→ `createGtcRuntimeHandler(...)`
→ repositório GTC
→ `sendResponse`.

Para `GET_TAB_ID`, o caminho é diferente: `routeRegisteredAction` reconhece a action via router e devolve a resposta legada compatível. Isso é exatamente o que o segundo teste usa para provar que o guard/bridge de GTC não sequestra mensagens comuns.

## 3. Dependências reais

- `extension/background.js` — SHA `667c05eb2d7adfca16a79d3e706c39a1e9398b72`;
- `extension/shared/gtc-indexeddb.js` — SHA `0c872f23a665304b46dc2bb43c6468762feb2e31`;
- `extension/background/router.js` — SHA `d9278e9e58e4e9583a30c16227bfd833e7203d89`;
- `tests/mocks/chrome-api.mock.js` — runtime/storage stateful usados pela suíte;
- Jest projeto `background`.

No ambiente Node/Jest, `background.js` carrega `shared/gtc-indexeddb.js` via `require`. O GTC fornece repositório em memória quando IndexedDB não está disponível, mantendo a mesma API de runtime. A prova desta suíte é, portanto, da **ponte runtime real + contrato de repositório**, não da implementação física IndexedDB do navegador; esta última possui suítes GTC próprias.

## 4. GTC_SAVE + GTC_QUERY_MANY

O primeiro caso envia:

- hash `ABC123`;
- data URL traduzida;
- `cleanUrl`;
- width/height.

A implementação real normaliza hash e persiste. Em seguida `GTC_QUERY_MANY` consulta `abc123` e `missing`.

A assertion comprova diretamente:

- `ok:true`;
- `saved:true`;
- `durationMs` numérico;
- resposta contém apenas `abc123` com o data URL salvo;
- hash ausente não aparece.

**Classificação:** ✅ **PROVADO DIRETAMENTE**.

## 5. Coexistência com handlers não-GTC

O segundo caso envia `GET_TAB_ID` depois que o background real foi carregado. O sender criado pelo runtime mock tem `tab:null`, logo o contrato legado retorna `{tabId:null}`.

O valor não é o ponto principal: a regressão protege a ordem do listener. Uma alteração que interceptasse toda mensagem no guard GTC quebraria a resposta.

**Classificação:** ✅ **PROVADO DIRETAMENTE** para a coexistência do bridge com uma action registrada não-GTC.

## 6. GTC_SAVE_MANY + GTC_STATS

O terceiro caso fornece três itens:

1. `hash-1` válido;
2. `hash-2` válido;
3. item com `hash:null`.

A implementação real ignora a entrada inválida para armazenamento. O próprio teste revela isso porque:

- `GTC_SAVE_MANY` responde `count:3`;
- `GTC_STATS` logo depois responde `count:2`.

Essa diferença é importante. Tanto o repositório em memória (`putMany`) quanto o caminho IndexedDB atual retornam o **tamanho do payload**, não a quantidade de entradas que passaram pela validação e foram efetivamente persistidas.

Portanto, `count` hoje significa “quantidade recebida” apesar do contexto de `saved:true`; ele não representa “quantidade salva”.

## 7. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| background real registra listener consumido pelo runtime mock | setup + mensagens respondidas | ✅ PROVADO DIRETAMENTE |
| GTC_SAVE atravessa bridge e persiste valor | primeiro teste | ✅ PROVADO DIRETAMENTE |
| hash é recuperável em lowercase | query de `abc123` após save de `ABC123` | ✅ PROVADO DIRETAMENTE |
| hash ausente não ganha entrada | resposta `entriesByHash` | ✅ PROVADO DIRETAMENTE |
| respostas GTC de sucesso incluem duração | assertions de `durationMs` | ✅ PROVADO DIRETAMENTE |
| bridge GTC não impede GET_TAB_ID | segundo teste | ✅ PROVADO DIRETAMENTE |
| SAVE_MANY aceita payload e persiste só válidos | stats=2 após três entradas | ✅ PROVADO DIRETAMENTE |
| SAVE_MANY responde count=3 para três entradas mesmo com uma inválida | assertion explícita | ✅ PROVADO DIRETAMENTE do comportamento atual |
| persistência física IndexedDB do browser | esta suíte usa ambiente Node/background | 🟨 EXECUTADO INDIRETAMENTE no contrato; provas específicas vivem em suítes GTC/IPC |
| descoberta no projeto Jest background | `jest.config.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI chama inventário Jest | package/workflow | 🟨 EXECUTADO INDIRETAMENTE; nenhuma run nova é reivindicada aqui |

## 8. Discrepância do count em putMany

Em `gtc-indexeddb.js`:

- repositório em memória: `for (const entry ...) await this.put(entry)` e depois `count: entries.length`;
- IndexedDB: itens sem hash/dataUrl são ignorados no `forEach`, mas o retorno continua `count: payload.length`.

Como `put`/o loop descartam entrada inválida, o count pode superestimar persistência. O #147 torna isso observável sem precisar inferir: a própria sequência `count:3` → `stats.count:2` é a evidência.

## 9. Lacunas e limites

- A suíte não tenta todas as ações GTC (`dHash`, perceptual, delete, clear etc.); essas responsabilidades pertencem às suítes específicas de GTC. Para a Bíblia deste arquivo, isso é limite de escopo, não automaticamente defeito.
- Não testa resposta de erro de repository pelo bridge.
- O runtime mock usa sender `{id, tab:null}`; ações GTC não possuem source guard no bridge legado.
- `jest.resetModules` + limpeza manual de listeners impedem acúmulo de listeners entre casos.
- A suíte não altera IndexedDB real do navegador.
- Nenhum arquivo externo foi modificado para produzir prova.

## 10. Solicitação ao auditor

### 147-001 — FUNCTIONAL_REVIEW — OPEN — severidade NORMAL

**Encontrado:** `GTC_SAVE_MANY` retorna `count` igual ao número de entradas recebidas, não ao número de entradas efetivamente persistidas.

**Contexto observado:** o teste envia 3 entradas, uma com `hash:null`. A resposta afirma `count:3`; `GTC_STATS` imediatamente confirma somente 2 registros.

**Arquivo externo envolvido:** `extension/shared/gtc-indexeddb.js`.

**Evidência atual:** no repositório em memória, `putMany` conta `entries.length`; no IndexedDB, entradas inválidas são puladas mas o retorno usa `payload.length`.

**Evidência ausente:** contrato explícito dizendo se `count` é “recebido” ou “salvo”; se for “salvo”, falta teste/assertion para contagem filtrada.

**Necessário:** decidir semântica do campo. Se `count` significa persistidos, contabilizar somente writes válidos em ambos os repositórios e atualizar os testes. Se significa recebidos, renomear/documentar de modo não ambíguo e testar separadamente descartados.

**Risco:** callers/telemetria podem interpretar `saved:true,count:N` como N gravações confirmadas, mascarando itens descartados.

## 11. SHAs observados

- `tests/unit/background/gtc-runtime-bridge.test.js` — `21c01d044af7313cae9b571ab715c4e5846b9a30`
- `extension/background.js` — `667c05eb2d7adfca16a79d3e706c39a1e9398b72`
- `extension/shared/gtc-indexeddb.js` — `0c872f23a665304b46dc2bb43c6468762feb2e31`
- `extension/background/router.js` — `d9278e9e58e4e9583a30c16227bfd833e7203d89`
- `tests/mocks/chrome-api.mock.js` — `c1d9a056b7777183bfd3f540c49811335f410425`
- `jest.config.js` — `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`
- `package.json` — `33e0b91d1a6f1790124b700d2ce331f80d2b7095`
- `.github/workflows/ci.yml` — `ebee75820db9bfab618bf3c3016065c5bc857ed7`

## 12. Mapeamento linha a linha

| Pos. | Unidade | Fonte | Função auditada |
|---:|:---:|---|---|
| 001 | U01 | `const path = require('path');` | Importa `path` para resolver o background real. |
| 002 | U01 | ␠ [linha vazia] | Separador visual. |
| 003 | U01 | `const {` | Importa `getRuntimeMock` e `getStorageMock` do mock compartilhado de Chrome. |
| 004 | U01 | `    getRuntimeMock,` | Importa `getRuntimeMock` e `getStorageMock` do mock compartilhado de Chrome. |
| 005 | U01 | `    getStorageMock,` | Importa `getRuntimeMock` e `getStorageMock` do mock compartilhado de Chrome. |
| 006 | U01 | `} = require('../../mocks/chrome-api.mock.js');` | Importa `getRuntimeMock` e `getStorageMock` do mock compartilhado de Chrome. |
| 007 | U01 | ␠ [linha vazia] | Separador visual. |
| 008 | U01 | `const BACKGROUND_PATH = path.resolve(__dirname, '../../../extension/background.js');` | Resolve caminho absoluto de `extension/background.js`, objeto principal da prova. |
| 009 | U02 | ␠ [linha vazia] | Separador visual. |
| 010 | U02 | `function sendRuntimeMessage(runtimeMock, message) {` | Abre adaptador Promise para `runtimeMock.sendMessage`. |
| 011 | U02 | `    return new Promise((resolve) => {` | Retorna Promise resolvida quando callback do runtime mock recebe a resposta. |
| 012 | U02 | `        runtimeMock.sendMessage(message, resolve);` | Envia mensagem pelo runtime mock real da suíte, que percorre listeners registrados pelo background. |
| 013 | U02 | `    });` | Fecha Promise e helper de dispatch. |
| 014 | U02 | `}` | Fecha Promise e helper de dispatch. |
| 015 | U03 | ␠ [linha vazia] | Separador visual. |
| 016 | U03 | `describe('REG-01/REG-02/IPC-04/IPC-05/IPC-06: background.js - ponte de mensagens GTC', () => {` | Abre suíte de regressão/IPC da ponte GTC do background. |
| 017 | U03 | `    let runtimeMock;` | Declara referências ao runtime/storage mocks. |
| 018 | U03 | `    let storageMock;` | Declara referências ao runtime/storage mocks. |
| 019 | U03 | ␠ [linha vazia] | Separador visual. |
| 020 | U03 | `    beforeEach(async () => {` | Abre setup assíncrono. |
| 021 | U03 | `        jest.resetModules();` | Limpa cache de módulos CommonJS para permitir reload limpo. |
| 022 | U03 | ␠ [linha vazia] | Separador visual. |
| 023 | U03 | `        runtimeMock = getRuntimeMock();` | Obtém instâncias compartilhadas de runtime/storage mock. |
| 024 | U03 | `        storageMock = getStorageMock();` | Obtém instâncias compartilhadas de runtime/storage mock. |
| 025 | U03 | ␠ [linha vazia] | Separador visual. |
| 026 | U03 | `        runtimeMock._messageListeners = [];` | Limpa listeners e lastError do runtime para isolar o listener do background deste caso. |
| 027 | U03 | `        runtimeMock._connectListeners = [];` | Limpa listeners e lastError do runtime para isolar o listener do background deste caso. |
| 028 | U03 | `        runtimeMock.lastError = null;` | Limpa listeners e lastError do runtime para isolar o listener do background deste caso. |
| 029 | U03 | ␠ [linha vazia] | Separador visual. |
| 030 | U03 | `        await storageMock.clear();` | Limpa storage mock entre testes. |
| 031 | U03 | ␠ [linha vazia] | Separador visual. |
| 032 | U03 | `        jest.isolateModules(() => {` | Abre `jest.isolateModules`. |
| 033 | U03 | `            require(BACKGROUND_PATH);` | Carrega `extension/background.js` real; isso registra listener em `chrome.runtime.onMessage` e carrega o GTC real. |
| 034 | U03 | `        });` | Fecha isolamento e setup. |
| 035 | U03 | `    });` | Fecha isolamento e setup. |
| 036 | U04 | ␠ [linha vazia] | Separador visual. |
| 037 | U04 | `    test('encaminha GTC_SAVE e GTC_QUERY_MANY pelo listener real do background', async () => {` | Abre caso GTC_SAVE→GTC_QUERY_MANY pelo listener real. |
| 038 | U04 | `        const saveResponse = await sendRuntimeMessage(runtimeMock, {` | Envia GTC_SAVE pelo runtime mock. |
| 039 | U04 | `            action: 'GTC_SAVE',` | Fixture de save: hash em maiúsculas, data URL, cleanUrl e dimensões. |
| 040 | U04 | `            hash: 'ABC123',` | Fixture de save: hash em maiúsculas, data URL, cleanUrl e dimensões. |
| 041 | U04 | `            translatedDataUrl: 'data:image/png;base64,REAL_BG_CACHE',` | Fixture de save: hash em maiúsculas, data URL, cleanUrl e dimensões. |
| 042 | U04 | `            cleanUrl: 'https://reader.test/panel-001.png',` | Fixture de save: hash em maiúsculas, data URL, cleanUrl e dimensões. |
| 043 | U04 | `            width: 800,` | Fixture de save: hash em maiúsculas, data URL, cleanUrl e dimensões. |
| 044 | U04 | `            height: 1200,` | Fixture de save: hash em maiúsculas, data URL, cleanUrl e dimensões. |
| 045 | U04 | `        });` | Fixture de save: hash em maiúsculas, data URL, cleanUrl e dimensões. |
| 046 | U04 | ␠ [linha vazia] | Fecha request GTC_SAVE. |
| 047 | U04 | `        expect(saveResponse).toEqual(expect.objectContaining({` | Linha estrutural/fixture da unidade; seu efeito é descrito pelas operações e assertions adjacentes. |
| 048 | U04 | `            ok: true,` | Assertion direta: resposta de save é ok, saved=true e contém duração numérica. |
| 049 | U04 | `            saved: true,` | Assertion direta: resposta de save é ok, saved=true e contém duração numérica. |
| 050 | U04 | `            durationMs: expect.any(Number),` | Assertion direta: resposta de save é ok, saved=true e contém duração numérica. |
| 051 | U04 | `        }));` | Assertion direta: resposta de save é ok, saved=true e contém duração numérica. |
| 052 | U04 | ␠ [linha vazia] | Assertion direta: resposta de save é ok, saved=true e contém duração numérica. |
| 053 | U04 | `        const queryResponse = await sendRuntimeMessage(runtimeMock, {` | Linha estrutural/fixture da unidade; seu efeito é descrito pelas operações e assertions adjacentes. |
| 054 | U04 | `            action: 'GTC_QUERY_MANY',` | Envia GTC_QUERY_MANY pelo mesmo listener/background. |
| 055 | U04 | `            hashes: ['abc123', 'missing'],` | Consulta hash normalizado existente e outro ausente. |
| 056 | U04 | `        });` | Consulta hash normalizado existente e outro ausente. |
| 057 | U04 | ␠ [linha vazia] | Consulta hash normalizado existente e outro ausente. |
| 058 | U04 | `        expect(queryResponse).toEqual(expect.objectContaining({` | Linha estrutural/fixture da unidade; seu efeito é descrito pelas operações e assertions adjacentes. |
| 059 | U04 | `            ok: true,` | Assertion direta: somente `abc123` retorna a tradução salva e a resposta contém duração. |
| 060 | U04 | `            entriesByHash: {` | Assertion direta: somente `abc123` retorna a tradução salva e a resposta contém duração. |
| 061 | U04 | `                abc123: 'data:image/png;base64,REAL_BG_CACHE',` | Assertion direta: somente `abc123` retorna a tradução salva e a resposta contém duração. |
| 062 | U04 | `            },` | Assertion direta: somente `abc123` retorna a tradução salva e a resposta contém duração. |
| 063 | U04 | `            durationMs: expect.any(Number),` | Assertion direta: somente `abc123` retorna a tradução salva e a resposta contém duração. |
| 064 | U05 | `        }));` | Assertion direta: somente `abc123` retorna a tradução salva e a resposta contém duração. |
| 065 | U05 | `    });` | Assertion direta: somente `abc123` retorna a tradução salva e a resposta contém duração. |
| 066 | U05 | ␠ [linha vazia] | Fecha caso save/query. |
| 067 | U05 | `    test('mantem outros handlers funcionais depois do guard de GTC (regressao BUG NEW-1)', async () => {` | Linha estrutural/fixture da unidade; seu efeito é descrito pelas operações e assertions adjacentes. |
| 068 | U05 | `        const response = await sendRuntimeMessage(runtimeMock, {` | Abre regressão BUG NEW-1 para provar que o guard GTC não captura mensagens não-GTC. |
| 069 | U05 | `            action: 'GET_TAB_ID',` | Despacha action GET_TAB_ID pelo mesmo runtime listener. |
| 070 | U05 | `        });` | Action não possui payload adicional. |
| 071 | U05 | ␠ [linha vazia] | Separador visual. |
| 072 | U05 | `        expect(response).toEqual({ tabId: null });` | Assertion direta: handler registrado continua funcional e responde `{tabId:null}` no sender do mock. |
| 073 | U06 | `    });` | Fecha regressão de coexistência. |
| 074 | U06 | ␠ [linha vazia] | Separador visual. |
| 075 | U06 | `    test('tambem encaminha GTC_SAVE_MANY e GTC_STATS pelo caminho real', async () => {` | Abre caso GTC_SAVE_MANY + GTC_STATS. |
| 076 | U06 | `        const saveManyResponse = await sendRuntimeMessage(runtimeMock, {` | Envia GTC_SAVE_MANY. |
| 077 | U06 | `            action: 'GTC_SAVE_MANY',` | Abre array de três entradas de input. |
| 078 | U06 | `            entries: [` | Entrada válida que deve ser armazenada. |
| 079 | U06 | `                { hash: 'hash-1', translatedDataUrl: 'data:1' },` | Entrada válida que deve ser armazenada. |
| 080 | U06 | `                { hash: 'hash-2', translatedDataUrl: 'data:2' },` | Entrada inválida com hash null; o repositório ignora o put, mas o count atual ainda inclui a posição do payload. |
| 081 | U06 | `                { hash: null, translatedDataUrl: 'data:ignored' },` | Fecha entries e request. |
| 082 | U06 | `            ],` | Fecha entries e request. |
| 083 | U06 | `        });` | Fecha entries e request. |
| 084 | U06 | ␠ [linha vazia] | Separador visual. |
| 085 | U06 | `        expect(saveManyResponse).toEqual(expect.objectContaining({` | Assertion direta da resposta atual: ok/saved e `count:3`, além de duração. |
| 086 | U06 | `            ok: true,` | Assertion direta da resposta atual: ok/saved e `count:3`, além de duração. |
| 087 | U06 | `            saved: true,` | Assertion direta da resposta atual: ok/saved e `count:3`, além de duração. |
| 088 | U06 | `            count: 3,` | Assertion direta da resposta atual: ok/saved e `count:3`, além de duração. |
| 089 | U06 | `            durationMs: expect.any(Number),` | Assertion direta da resposta atual: ok/saved e `count:3`, além de duração. |
| 090 | U06 | `        }));` | Assertion direta da resposta atual: ok/saved e `count:3`, além de duração. |
| 091 | U06 | ␠ [linha vazia] | Separador visual. |
| 092 | U06 | `        const statsResponse = await sendRuntimeMessage(runtimeMock, {` | Solicita GTC_STATS pelo caminho real. |
| 093 | U06 | `            action: 'GTC_STATS',` | Fecha request de stats. |
| 094 | U06 | `        });` | Linha estrutural/fixture da unidade; seu efeito é descrito pelas operações e assertions adjacentes. |
| 095 | U06 | ␠ [linha vazia] | Assertion direta: banco contém efetivamente 2 registros, expondo a diferença entre count de input e count persistido. |
| 096 | U06 | `        expect(statsResponse).toEqual(expect.objectContaining({` | Assertion direta: banco contém efetivamente 2 registros, expondo a diferença entre count de input e count persistido. |
| 097 | U06 | `            ok: true,` | Assertion direta: banco contém efetivamente 2 registros, expondo a diferença entre count de input e count persistido. |
| 098 | U06 | `            stats: { count: 2 },` | Assertion direta: banco contém efetivamente 2 registros, expondo a diferença entre count de input e count persistido. |
| 099 | U06 | `            durationMs: expect.any(Number),` | Assertion direta: banco contém efetivamente 2 registros, expondo a diferença entre count de input e count persistido. |
| 100 | U06 | `        }));` | Assertion direta: banco contém efetivamente 2 registros, expondo a diferença entre count de input e count persistido. |
| 101 | U06 | `    });` | Fecha caso saveMany/stats. |
| 102 | U07 | `});` | Fecha suíte Jest. |
| 103 | U08 | ␠ [linha vazia] | Newline terminal; posição física final auditada. |

## 13. Auditoria final

- [x] ownership confirmado para AGENTE 22;
- [x] state #147 confirmado para o mesmo SHA;
- [x] 102 linhas textuais + newline = 103/103 posições;
- [x] background real, bridge GTC, runtime mock e wiring Jest/CI auditados;
- [x] comportamento direto separado de limites do ambiente Node;
- [x] discrepância concreta de `putMany.count` documentada e solicitada ao auditor;
- [x] nenhum código/teste/mock foi alterado.

**Conclusão:** Bíblia completa para `21c01d044af7313cae9b571ab715c4e5846b9a30`; a suíte fornece prova direta útil da ponte runtime real e também expõe uma ambiguidade funcional de contagem em lote.

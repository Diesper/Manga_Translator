# Bíblia técnica — tests/unit/inject/raf-replacement.test.js

> **Estado documental:** ✅ CONCLUÍDA  
> **SHA auditado:** `8b9e1c19b39563476057be01b3be2805a538572c`  
> **Agente responsável:** AGENTE 17  
> **Tipo:** stub Jest com implementação espelho histórica do RAF anti-throttling  
> **Linhas textuais:** 146  
> **Posições documentais:** 147, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é explicitamente um **stub v3.0**. Em vez de carregar `extension/content/inject.js`, ele define localmente `createRafReplacement()` e testa esse mirror.

O contrato declarado pelo próprio arquivo é:
- callbacks guardados em array;
- ID = tamanho do array;
- `cancelRAF` vazio;
- `flush()` drena a fila, passa `performance.now()` e silencia erros;
- o flush é descrito como equivalente a `setInterval(100ms)`.

Esse contrato já não representa o mecanismo de produção atual.

## 2. Produção atual versus mirror testado

### Mirror deste arquivo

`createRafReplacement()`:
- usa `callbacks = []`;
- `customRAF(cb)` faz `push` e retorna `callbacks.length`;
- `cancelRAF` não faz nada;
- `flush` usa `callbacks.splice(0)`;
- não existe rAF nativo;
- não existe visibilidade;
- não existe modo anti-throttle;
- nenhum timer é criado de fato.

### `extension/content/inject.js` atual

O runtime real:
- define `RAF_CADENCE_MS = { minimal: 250, balanced: 100, legacy: 50 }`;
- usa `nextRafId` monotônico;
- armazena callbacks em `Map`;
- preserva `origRaf` e `origCancelRaf`;
- quando visível, tenta também executar via rAF nativo;
- remove o callback antes de executá-lo;
- `cancelAnimationFrame(id)` **remove o callback** e delega ao cancel nativo;
- `flushRaf()` drena o Map e silencia erro por callback;
- `scheduleRafFlush()` usa `setTimeout` recursivo com cadência do modo, não `setInterval(100ms)`.

Portanto várias afirmações do cabeçalho e nomes dos testes são históricas, não descritivas do blob atual de produção.

## 3. Suíte “completa” relacionada

`tests/unit/inject/inject-anti-hibernation.test.js` afirma expressamente que testa sistemas “em isolamento, sem carregar o inject.js” e “usa implementações espelho verificáveis”. Na seção RAF, ela também simula array, flush e um `cancelRAF` vazio, incluindo comentário “setInterval de 100ms”.

Assim, a suíte full relacionada não fecha a lacuna de autenticidade; ela reforça a mesma família de mirrors históricos.

## 4. Inclusão no Jest

`jest.config.js` inclui `tests/unit/inject/**/*.test.js` no projeto `content-scripts` em JSDOM.

O arquivo usa fake timers em `beforeEach`, mas o `createRafReplacement` local não chama `setTimeout` nem `setInterval`. Os timers falsos não participam da prova dos nove testes deste stub.

Não há `.skip`, `.only` ou `test.todo`.

## 5. Cenários realmente provados

### Registro

1. um callback fica no array;
2. IDs retornados são 1 e 2 enquanto o array cresce;
3. três callbacks resultam em comprimento 3.

### Flush

4. todos os callbacks registrados são chamados uma vez;
5. cada callback recebe um número de `performance.now()`;
6. o array fica vazio depois do flush.

### Erros/cancelamento

7. callback que lança não interrompe o próximo;
8. `cancelRAF` vazio não lança para 1/undefined/99999.

### Ciclos

9. callback registrado depois do primeiro flush executa no flush seguinte;
10. flush vazio não lança.

Há dez blocos `test()`, apesar de o arquivo descrever genericamente uma cobertura mínima.

Todos esses resultados são **prova direta do mirror local**, não da função instalada em `window.requestAnimationFrame` por `inject.js`.

## 6. Matriz de evidência

| Propriedade | Evidência | Classificação |
|---|---|---|
| mirror armazena callbacks | assertions do grupo Registro | ✅ PROVADO DIRETAMENTE — mirror |
| mirror retorna 1/2 | assertion específica | ✅ PROVADO DIRETAMENTE — mirror |
| mirror drena callbacks | grupo Flush | ✅ PROVADO DIRETAMENTE — mirror |
| mirror silencia erro de callback | grupo Resiliência | ✅ PROVADO DIRETAMENTE — mirror |
| mirror cancel vazio não lança | teste dedicado | ✅ PROVADO DIRETAMENTE — mirror |
| produção usa Map + ID monotônico | código real observado, não executado aqui | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO NESTE ARQUIVO |
| produção cancela callback por ID | contradiz mirror vazio | ⚠️ MIRROR DESATUALIZADO |
| produção usa cadência 250/100/50 | contradiz “100ms fixo” | ⚠️ MIRROR/DOCUMENTAÇÃO DESATUALIZADOS |
| produção usa setTimeout recursivo | contradiz “setInterval” | ⚠️ MIRROR/DOCUMENTAÇÃO DESATUALIZADOS |
| caminho origRaf visível | não existe no mirror | ⚠️ SEM TESTE NESTE ARQUIVO |
| cancel nativo delegado | não existe no mirror | ⚠️ SEM TESTE NESTE ARQUIVO |

## 7. Solicitações ao auditor

### 214-001 — TEST_AUTHENTICITY — OPEN

**Encontrado:** o arquivo testa exclusivamente `createRafReplacement()` definido dentro do próprio teste. O runtime real de `inject.js` não é carregado.

**Evidência atual:** dez testes diretos do mirror.

**Evidência ausente:** execução de `inject.js` real e assertions sobre `window.requestAnimationFrame`, `cancelAnimationFrame`, fila e scheduler instalados por ele.

**Ação solicitada:** criar/ajustar, em alteração separada, harness capaz de executar `inject.js` real em ambiente controlado com marker de ativação, timers e rAF nativo mockados.

**Evidência esperada:** regressão no código real quebra o teste sem depender de cópia manual de sua lógica.

**Possível regressão:** runtime real pode quebrar enquanto este mirror histórico continua verde.

**Impacto:** anti-throttling e progresso da automação em abas de background.

**Severidade:** HIGH.

### 214-002 — STALE_TEST_CONTRACT — OPEN

**Encontrado:** o stub documenta “setInterval 100ms” e `cancelRAF` vazio, mas produção atual usa `setTimeout` recursivo, cadência minimal/balanced/legacy 250/100/50 ms e cancelamento real por Map/delegação nativa.

**Arquivo relacionado:** `extension/content/inject.js`.

**Evidência atual:** comparação direta dos blobs.

**Evidência ausente:** teste que reflita o contrato progressivo atual.

**Ação solicitada:** decidir se este stub histórico ainda deve existir; se mantido, renomear/rotular claramente como histórico sem alegar equivalência. Cobertura atual deve validar cadências e cancelamento reais.

**Evidência esperada:** testes contra scheduler real para cada modo e cancelamento antes do flush.

**Possível regressão:** manutenção futura pode confiar em especificação errada de 100ms/cancel no-op.

**Impacto:** documentação executável enganosa.

**Severidade:** HIGH.

### 214-003 — TEST_AUTHENTICITY — OPEN

**Encontrado:** `inject-anti-hibernation.test.js`, citado como suíte completa substituta, também declara que não carrega `inject.js` e mantém mirror RAF baseado em array/`cancelRAF` vazio/“100ms”.

**Evidência atual:** comentários e implementação local da suíte full.

**Evidência ausente:** gate real anti-drift entre a suíte full e `inject.js`.

**Ação solicitada:** revisar a suíte full conjuntamente com 214-001, priorizando testes da implementação real e removendo afirmações obsoletas.

**Evidência esperada:** sistema progressivo real exercitado em vez de mirror v3.0/v3.1.

**Possível regressão:** dois arquivos de teste podem concordar entre si e discordar simultaneamente de produção.

**Impacto:** falsa sensação de cobertura completa.

**Severidade:** HIGH.

## 8. Fonte integral auditada

```js
/**
 * raf-replacement.test.js — STUB ORIGINAL (v3.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa a substituição de window.requestAnimationFrame por setInterval de 100ms
 * no inject.js — cobertura mínima original (v3.0).
 *
 * POR QUE ESTE ARQUIVO EXISTE JUNTO COM inject-anti-hibernation.test.js?
 * O v3.0 criou apenas este stub cobrindo o sistema de RAF em isolamento.
 * O inject-anti-hibernation.test.js (v3.1) integra todos os 5 sistemas do
 * inject.js em uma suíte coesa, incluindo guard, visibilidade, supressão de
 * eventos, ghost interactions e lazy→eager.
 *
 * ESTE ARQUIVO foca exclusivamente no contrato do RAF customizado:
 * callbacks são executados via setInterval de 100ms, erros são silenciados.
 *
 * CONTEXTO TÉCNICO:
 * O Chrome reduz setInterval para 1 tick/segundo em abas em background.
 * A substituição do rAF nativo por um setInterval de 100ms garante que
 * animações e polling do content_gemini.js continuem funcionando mesmo
 * quando o Gemini está em aba oculta (active: false).
 *
 * Blob Workers foram descartados (causavam bloqueio de CSP no Gemini).
 * A solução com setInterval puro no contexto MAIN é mais simples e segura.
 *
 * VEJA: inject-anti-hibernation.test.js para a suíte completa.
 */

describe('requestAnimationFrame — Substituição por setInterval 100ms (stub v3.0)', () => {

    // Implementação espelho do sistema RAF do inject.js
    function createRafReplacement() {
        const callbacks = [];

        const customRAF = function(cb) {
            callbacks.push(cb);
            return callbacks.length; // ID fake (nunca usado com cancelRAF)
        };

        const cancelRAF = function() {}; // stub — intencionalmente vazio

        const flush = function() {
            const batch = callbacks.splice(0);
            const now = performance.now();
            batch.forEach(cb => { try { cb(now); } catch(e) {} });
        };

        return { customRAF, cancelRAF, flush, getCallbacks: () => callbacks };
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    describe('Registro de callbacks', () => {
        test('callback registrado via customRAF é armazenado', () => {
            const { customRAF, getCallbacks } = createRafReplacement();
            const cb = jest.fn();
            customRAF(cb);
            expect(getCallbacks()).toHaveLength(1);
        });

        test('retorna ID incremental (baseado no tamanho do array)', () => {
            const { customRAF } = createRafReplacement();
            const id1 = customRAF(jest.fn());
            const id2 = customRAF(jest.fn());
            expect(id1).toBe(1);
            expect(id2).toBe(2);
        });

        test('múltiplos callbacks são todos armazenados', () => {
            const { customRAF, getCallbacks } = createRafReplacement();
            customRAF(jest.fn());
            customRAF(jest.fn());
            customRAF(jest.fn());
            expect(getCallbacks()).toHaveLength(3);
        });
    });

    describe('Execução dos callbacks no flush (equivalente ao setInterval 100ms)', () => {
        test('flush executa todos os callbacks registrados', () => {
            const { customRAF, flush } = createRafReplacement();
            const cb1 = jest.fn();
            const cb2 = jest.fn();
            customRAF(cb1);
            customRAF(cb2);
            flush();
            expect(cb1).toHaveBeenCalledTimes(1);
            expect(cb2).toHaveBeenCalledTimes(1);
        });

        test('flush passa timestamp (performance.now) para o callback', () => {
            const { customRAF, flush } = createRafReplacement();
            const cb = jest.fn();
            customRAF(cb);
            flush();
            expect(cb).toHaveBeenCalledWith(expect.any(Number));
        });

        test('fila é esvaziada após o flush', () => {
            const { customRAF, flush, getCallbacks } = createRafReplacement();
            customRAF(jest.fn());
            customRAF(jest.fn());
            flush();
            expect(getCallbacks()).toHaveLength(0);
        });
    });

    describe('Resiliência a erros', () => {
        test('callback que lança não interrompe os demais', () => {
            const { customRAF, flush } = createRafReplacement();
            const goodCb = jest.fn();
            customRAF(() => { throw new Error('falha intencional'); });
            customRAF(goodCb);
            expect(() => flush()).not.toThrow();
            expect(goodCb).toHaveBeenCalledTimes(1);
        });

        test('cancelRAF não lança exceção (é stub vazio)', () => {
            const { cancelRAF } = createRafReplacement();
            expect(() => cancelRAF(1)).not.toThrow();
            expect(() => cancelRAF(undefined)).not.toThrow();
            expect(() => cancelRAF(99999)).not.toThrow();
        });
    });

    describe('Comportamento com múltiplos flush cycles', () => {
        test('novo callback registrado após flush é executado no próximo flush', () => {
            const { customRAF, flush } = createRafReplacement();
            const cb1 = jest.fn();
            const cb2 = jest.fn();

            customRAF(cb1);
            flush(); // Executa cb1

            customRAF(cb2); // Registra cb2 após o primeiro flush
            flush(); // Executa cb2

            expect(cb1).toHaveBeenCalledTimes(1);
            expect(cb2).toHaveBeenCalledTimes(1);
        });

        test('flush em fila vazia não lança exceção', () => {
            const { flush } = createRafReplacement();
            expect(() => flush()).not.toThrow();
        });
    });
});
```

## 9. Mapa integral de linhas/posições

| Linhas | Responsabilidade | Classificação |
|---:|---|---|
| 1–25 | cabeçalho, histórico, alegação 100ms/setInterval | documental; parcialmente obsoleto |
| 26 | separador | estrutural |
| 27 | abre describe | estrutural |
| 28 | separador | estrutural |
| 29 | comentário mirror | confirma não-produção |
| 30–47 | `createRafReplacement` local | objeto realmente testado |
| 48 | separador | estrutural |
| 49–50 | fake timers | não usados pelo mirror |
| 51 | separador | estrutural |
| 52–72 | registro de callbacks/IDs | ✅ mirror |
| 73 | separador | estrutural |
| 74–101 | flush/timestamp/esvaziamento | ✅ mirror |
| 102 | separador | estrutural |
| 103–117 | erro e cancel no-op | ✅ mirror; contrato diverge da produção |
| 118 | separador | estrutural |
| 119–144 | ciclos múltiplos/flush vazio | ✅ mirror |
| 145 | separador | estrutural |
| 146 | fecha describe | estrutural |
| posição 147 | newline final | blob confirmado |

## 10. Invariantes do mirror

1. callbacks ficam em array;
2. ID depende do comprimento atual;
3. cancel nunca remove callback;
4. flush drena tudo;
5. erro de um callback é absorvido;
6. callbacks novos depois do flush ficam para ciclo posterior.

Esses **não são automaticamente invariantes de produção**. Em particular, 2 e 3 divergem materialmente do runtime atual.

## 11. Autoauditoria do AGENTE 17

- [x] reserva #214 criada via CREATE ONLY e relida;
- [x] state próprio criado;
- [x] source SHA reconfirmado;
- [x] fonte integral incorporada;
- [x] 146 linhas textuais + newline = 147 posições;
- [x] `inject.js` real lido e comparado;
- [x] suíte full relacionada inspecionada;
- [x] mirror não foi promovido a prova de produção;
- [x] contrato stale 100ms/setInterval/cancel no-op registrado;
- [x] três solicitações persistentes preparadas;
- [x] nenhum arquivo externo modificado.

**Resultado:** o arquivo é uma prova consistente do mirror histórico que contém, mas não é uma prova autêntica do scheduler RAF progressivo atual de `inject.js`.

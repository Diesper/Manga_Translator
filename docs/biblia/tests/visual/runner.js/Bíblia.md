# Bíblia técnica — tests/visual/runner.js

> **Estado documental:** ✅ CONCLUÍDO pelo AGENTE 14  
> **SHA auditado:** fe34764874cac8961bf6c614f5f6d5f85a599763  
> **Agente:** AGENTE 14  
> **Tipo:** micro-runner de testes visuais Node.js, com DSL própria de suíte/assertions e gate de baseline  
> **Linhas textuais:** 160  
> **Posições documentais:** 161, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

tests/visual/runner.js é a infraestrutura de execução que sustenta toda a suíte visual fora do Jest. Ele fornece uma DSL mínima semelhante a describe/it/expect, uma variante assíncrona própria chamada ita, pilhas de hooks, um acumulador global de resultados, um resumo final e os gates de quantidade mínima/skips vindos de scripts/ci/data/test-baseline.json.

O fluxo oficial é:

1. package.json executa node tests/visual/run-all.js em test:visual;
2. run-all.js carrega seis módulos *.visual.js;
3. os testes it executam durante o carregamento síncrono;
4. os testes ita são encadeados em uma Promise serial;
5. run-all.js chama await getAsyncQueue();
6. printSummary() aplica os gates;
7. run-all.js encerra o processo com 0 quando printSummary retorna true e 1 quando retorna false.

Portanto, este arquivo não é apenas helper: um erro nele pode alterar a confiabilidade das 224 verificações visuais atuais.

## 2. Chamadores, consumidores e dependências

### Chamador final
- tests/visual/run-all.js importa getAsyncQueue e printSummary, aguarda a fila e converte o booleano do resumo em exit code do processo.

### Consumidores diretos da DSL
- tests/visual/gtc-fingerprint.visual.js — 70 it + 6 ita = 76 testes;
- tests/visual/gtc-indexeddb.visual.js — 13 it + 46 ita = 59 testes;
- tests/visual/background-fingerprint.visual.js — 0 it + 19 ita = 19 testes;
- tests/visual/content-manga-pipeline.visual.js — 13 it + 23 ita = 36 testes;
- tests/visual/integration.visual.js — 13 it + 15 ita = 28 testes;
- tests/visual/crop.visual.js — 3 it + 3 ita = 6 testes.

Total observado: **224 registros de teste**, exatamente 112 it e 112 ita.

### Orquestração externa
- package.json: test:visual = node tests/visual/run-all.js;
- package.json inclui test:visual em npm test;
- .github/workflows/ci.yml possui job visual que executa npm run test:visual;
- o workflow também repete test:visual nos fluxos windows-portability e fresh-developer-flow;
- o ci-gate exige o resultado do job visual.

### Dependência de política
scripts/ci/data/test-baseline.json define atualmente:
- visual.minTests = 224;
- visual.maxSkipped = 0.

scripts/validation/verify-ci-contract.js valida que visual.minTests é inteiro positivo. Não foi localizada validação equivalente de visual.maxSkipped.

## 3. Modelo de estado e lifecycle

O módulo é singleton por processo Node.

Estado mutável:
- results: contadores pass/fail/skip e lista errors;
- _currentSuite: nome da suíte síncrona atualmente sendo registrada/executada;
- _suiteDepth: profundidade para indentação;
- _beforeStack e _afterStack: hooks por nível de describe;
- _asyncQueue: Promise encadeada com todos os ita.

Não há reset público. O desenho pressupõe um processo novo para cada execução de test:visual, que é exatamente o fluxo de run-all.js.

## 4. Semântica real de execução

### describe
describe é estritamente síncrono. Ele empilha camadas de hook, chama fn(), captura exceção síncrona de registro como suite-level failure e então desmonta as camadas.

### it
it roda imediatamente. Hooks e corpo não são aguardados. O caminho atual do corpus usa it apenas com callbacks síncronos.

### ita
ita não executa imediatamente; captura suite/depth/hooks e acrescenta o trabalho à fila Promise. O corpo e os hooks são awaited dentro da fila.

### Ordem mista
Como run-all.js faz vários require síncronos antes do primeiro await, os 112 it atuais executam durante o carregamento dos módulos. Os 112 ita ficam agendados e só começam quando o call stack cede no await getAsyncQueue. Assim, a ordem real não é a ordem textual global entre it e ita.

Esse comportamento pode ser válido, mas deve ser considerado contrato do runner e não comportamento equivalente a Jest.

## 5. Hooks

Foram localizadas sete declarações beforeEach nas seis suítes atuais:
- seis em gtc-indexeddb.visual.js;
- uma em crop.visual.js.

Todas as declarações beforeEach observadas são síncronas. Não foi localizado uso de afterEach nas seis suítes.

O problema crítico é que o runner engole qualquer exceção/rejeição de hook:

- it: linhas 45 e 56;
- ita: linhas 67 e 78.

Logo, a infraestrutura não transforma falha de setup/teardown em falha de teste. Dependendo do corpo do teste, isso pode produzir resultado verde ou um erro posterior menos preciso.

## 6. Matchers e uso observado

Contagem aproximada de chamadas de matchers no corpus visual atual:
- toBe: 247;
- toBeTruthy: 29;
- toBeGreaterThan: 22;
- toHaveProperty: 19;
- toContain: 12;
- toHaveLength: 12;
- toBeDefined: 10;
- toBeNull: 8;
- toBeGreaterThanOrEqual: 8;
- toBeLessThanOrEqual: 7;
- toThrow: 6;
- toMatch: 4;
- toBeUndefined: 4;
- toBeLessThan: 3;
- toBeCloseTo: 1.

Não foram localizados usos atuais de:
- toEqual;
- toBeNaN;
- toBeFalsy;
- toBeTypeOf.

A forma negada .not é usada atualmente com toMatch, toBe, toBeNull e toContain.

## 7. Achados críticos e limites

### 7.1 Hook failures são mascaradas
beforeEach/afterEach usam catch vazio. Isso viola a expectativa usual de que setup/cleanup quebrado torne o teste vermelho.

### 7.2 it não é seguro para callback assíncrono
it chama fn() sem await e incrementa pass imediatamente. Hoje não existe it(..., async ...) nas seis suítes, mas não há guard que impeça uma introdução futura.

### 7.3 Ordem declarativa entre it e ita não é preservada
A fila serializa somente ita. Um it declarado depois de um ita no mesmo arquivo executa primeiro, porque it é imediato e ita é Promise encadeada.

### 7.4 .not aceita matcher inexistente
O Proxy chama self[method] dentro de try/catch. Se method não existir, o TypeError é capturado e interpretedado como “matcher positivo falhou”, então a negação retorna com sucesso. Um typo em matcher negado pode ficar verde.

### 7.5 Schema parcial do baseline
printSummary depende de visual.minTests e visual.maxSkipped. verify-ci-contract protege minTests, mas a auditoria não encontrou proteção de tipo/faixa para maxSkipped. Comparações com undefined/NaN podem não gerar gate error.

### 7.6 toEqual é uma igualdade por serialização
JSON.stringify não equivale a igualdade profunda geral. O matcher está exportado, mas não é usado atualmente.

### 7.7 afterEach existe sem consumidor atual
A API é pública, porém nenhum dos seis módulos visuais atuais usa afterEach. Seu comportamento de sucesso e falha não é provado pela suíte atual.

### 7.8 Hooks de raiz são efetivamente ignorados
beforeEach/afterEach fora de describe entram na posição zero das pilhas, mas _allBefores/_allAfters fazem slice(1). Não há consumidor atual desse padrão.

## 8. Evidência automatizada

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| test:visual chega a run-all.js e ao runner | package.json + CI executam o fluxo real | 🟨 EXECUTADO INDIRETAMENTE |
| 224 testes atuais registram via DSL | seis módulos consumidores somam 224; baseline exige mínimo 224 | 🟨 EXECUTADO INDIRETAMENTE |
| visual.minTests deve ser inteiro positivo | verify-ci-contract.js verifica o campo | 🟦 GATE ESTÁTICO ESPECÍFICO |
| visual.maxSkipped = 0 efetivamente bloqueia skip no runner atual | branch de printSummary usa o valor; baseline atual contém 0 | 🟨 EXECUTADO INDIRETAMENTE |
| schema/robustez de visual.maxSkipped | não há gate focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| it executa callbacks síncronos atuais | 112 usos atuais | 🟨 EXECUTADO INDIRETAMENTE |
| it rejeita callback Promise/async | nenhum guard/self-test | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| ita aguarda callback e serializa ita | 112 usos e run-all aguarda a fila | 🟨 EXECUTADO INDIRETAMENTE |
| ordem mista it/ita | nenhum teste de ordem explícito | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| beforeEach caminho feliz | sete declarações atuais | 🟨 EXECUTADO INDIRETAMENTE |
| beforeEach/afterEach falhando tornam teste vermelho | implementação engole erros; não há prova | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| afterEach caminho feliz | sem consumidor atual | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| describe suite-level error | branch existe, sem self-test localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| skip incrementa results.skip | branch existe, baseline atual não contém skip | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| matchers usados no corpus | chamadas reais executam happy path em test:visual | 🟨 EXECUTADO INDIRETAMENTE |
| matchers não usados | sem consumidor/self-test | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| .not com matcher válido | usos reais com quatro matchers | 🟨 EXECUTADO INDIRETAMENTE |
| .not rejeita matcher inexistente | implementação atual não rejeita corretamente | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| printSummary retorna false em fail/gate error | lógica presente, sem self-test isolado localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| getAsyncQueue é aguardado antes de exit | run-all.js chama await getAsyncQueue() | 🟨 EXECUTADO INDIRETAMENTE |

## 9. Solicitações ao auditor

### 233-001 — TEST_REQUIRED — OPEN
Não foi localizada suíte focal do próprio runner. As seis suítes são consumidoras, não testes da infraestrutura. É necessário um self-test que exercite implementação real: describe, it, ita, fila, skip, failure accounting, printSummary, matchers positivos/negados e hooks.

### 233-002 — FALSE_GREEN_RISK — OPEN
As exceções/rejeições de beforeEach/afterEach são descartadas. O auditor deve decidir a semântica correta; se hooks quebrados devam reprovar, corrigir em mudança separada e provar com testes de regressão.

### 233-003 — ASYNC_CONTRACT_REVIEW — OPEN
it não aguarda Promise e não detecta callback async. O corpus atual não usa async it, mas falta gate. O auditor deve escolher entre suportar await, falhar explicitamente ao receber thenable/async, ou adicionar validação estática que obrigue ita.

### 233-004 — NEGATED_MATCHER_REVIEW — OPEN
expect(...).not trata TypeError de matcher inexistente como sucesso da negação. Deve existir regressão que prove que typo de matcher falha de forma explícita.

### 233-005 — BASELINE_SCHEMA_REVIEW — OPEN
visual.maxSkipped alimenta um gate crítico, mas não foi localizada validação de schema/faixa em verify-ci-contract.js. Deve-se provar comportamento com campo ausente, string, NaN-equivalente via JSON possível, negativo e valor válido.

## 10. Invariantes

1. Toda falha do corpo de teste deve terminar refletida em results.fail.
2. Nenhuma falha de infraestrutura/hook pode ser silenciosamente convertida em pass sem contrato explícito.
3. O processo oficial deve aguardar toda a fila ita antes do resumo.
4. O valor de retorno de printSummary deve refletir failures e gateErrors.
5. Skips acima do baseline nunca podem produzir exit 0.
6. O total abaixo do baseline nunca pode produzir exit 0.
7. Matchers inexistentes devem falhar de forma diagnóstica; nunca passar por negação acidental.
8. Callbacks assíncronos não podem ser marcados pass antes da resolução.
9. Se a ordem mista it/ita permanecer diferente da ordem declarativa, isso deve ser contrato explícito e testado.
10. Hooks aninhados devem ter semântica determinística e testada.
11. Mudança em baseline.visual deve continuar protegida por schema/gates.
12. Esta Bíblia vale somente para o blob SHA fe34764874cac8961bf6c614f5f6d5f85a599763.

## 11. Casos-limite relevantes

- describe com callback que lança sincronicamente;
- describe com callback async;
- it sem função;
- ita sem função;
- beforeEach/afterEach que lançam;
- hooks que retornam Promise rejeitada;
- it que retorna Promise resolvida/rejeitada;
- mistura it → ita → it e observação da ordem;
- hook na raiz fora de describe;
- describe aninhado com hooks externos/internos;
- matcher desconhecido positivo e negado;
- objeto circular em toEqual;
- toHaveProperty com valor undefined;
- baseline.visual ausente;
- minTests abaixo/acima do total;
- maxSkipped ausente, negativo ou string;
- módulo carregado duas vezes no mesmo processo com cache limpo/parcial.

## 12. Fonte integral

~~~javascript
'use strict';
const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m';
const YELLOW = '\x1b[33m', CYAN = '\x1b[36m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
const baseline = require('../../scripts/ci/data/test-baseline.json');

const results = { pass: 0, fail: 0, skip: 0, errors: [] };
let _currentSuite = '(root)', _suiteDepth = 0;

// Scoped hooks — each describe level gets its own array
const _beforeStack = [[]];
const _afterStack  = [[]];

function _allBefores() { return _beforeStack.slice(1).flat(); }
function _allAfters()  { return _afterStack.slice(1).flat();  }

// Serial async queue — eliminates race conditions between ita tests
let _asyncQueue = Promise.resolve();

function describe(name, fn) {
    const prev = _currentSuite;
    _currentSuite = name;
    _suiteDepth++;
    const indent = '  '.repeat(_suiteDepth - 1);
    console.log(`\n${indent}${CYAN}${BOLD}▶ ${name}${RESET}`);
    _beforeStack.push([]);
    _afterStack.push([]);
    try { fn(); } catch (e) {
        console.log(`${indent}  ${RED}✖ SUITE ERROR: ${e.message}${RESET}`);
        results.fail++;
        results.errors.push({ suite: name, test: '(suite-level)', error: e });
    }
    _beforeStack.pop();
    _afterStack.pop();
    _suiteDepth--;
    _currentSuite = prev;
}

function beforeEach(fn) { _beforeStack[_beforeStack.length - 1].push(fn); }
function afterEach(fn)  { _afterStack[_afterStack.length - 1].push(fn);  }

function it(label, fn) {
    const indent = '  '.repeat(_suiteDepth);
    if (!fn) { console.log(`${indent}${YELLOW}○ ${label} (skipped)${RESET}`); results.skip++; return; }
    const befores = _allBefores(), afters = _allAfters();
    for (const bf of befores) { try { bf(); } catch (_e) {} }
    try {
        fn();
        console.log(`${indent}${GREEN}✔${RESET} ${label}`);
        results.pass++;
    } catch (e) {
        console.log(`${indent}${RED}✖ ${label}${RESET}`);
        console.log(`${indent}  ${DIM}${e && e.message ? e.message : e}${RESET}`);
        results.fail++;
        results.errors.push({ suite: _currentSuite, test: label, error: e });
    }
    for (const af of afters) { try { af(); } catch (_e) {} }
}

function ita(label, fn) {
    const indent = '  '.repeat(_suiteDepth), suiteName = _currentSuite, depth = _suiteDepth;
    if (!fn) { console.log(`${indent}${YELLOW}○ ${label} (skipped)${RESET}`); results.skip++; return Promise.resolve(); }
    // Snapshot hooks at registration time (CRITICAL: before describe pops its layer)
    const befores = _allBefores();
    const afters  = _allAfters();
    return _asyncQueue = _asyncQueue.then(async () => {
        const ind = '  '.repeat(depth);
        for (const bf of befores) { try { await bf(); } catch (_e) {} }
        try {
            await fn();
            console.log(`${ind}${GREEN}✔${RESET} ${label}`);
            results.pass++;
        } catch (e) {
            console.log(`${ind}${RED}✖ ${label}${RESET}`);
            console.log(`${ind}  ${DIM}${e && e.message ? e.message : e}${RESET}`);
            results.fail++;
            results.errors.push({ suite: suiteName, test: label, error: e });
        }
        for (const af of afters) { try { await af(); } catch (_e) {} }
    });
}

function expect(actual) {
    const self = {
        toBe(e) { if (!Object.is(actual, e)) throw new Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(actual)}`); },
        toEqual(e) { const a = JSON.stringify(actual), b = JSON.stringify(e); if (a !== b) throw new Error(`Expected\n  ${b}\ngot\n  ${a}`); },
        toBeGreaterThan(n)        { if (!(actual > n))  throw new Error(`Expected ${actual} > ${n}`); },
        toBeGreaterThanOrEqual(n) { if (!(actual >= n)) throw new Error(`Expected ${actual} >= ${n}`); },
        toBeLessThan(n)           { if (!(actual < n))  throw new Error(`Expected ${actual} < ${n}`); },
        toBeLessThanOrEqual(n)    { if (!(actual <= n)) throw new Error(`Expected ${actual} <= ${n}`); },
        toBeCloseTo(e, d=2) { if (Math.abs(actual-e) >= Math.pow(10,-d)/2) throw new Error(`Expected ${actual} ≈ ${e}`); },
        toBeNaN()       { if (!Number.isNaN(actual))   throw new Error(`Expected NaN, got ${actual}`); },
        toBeTruthy()    { if (!actual)  throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`); },
        toBeFalsy()     { if (actual)   throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`); },
        toBeNull()      { if (actual !== null)      throw new Error(`Expected null, got ${JSON.stringify(actual)}`); },
        toBeUndefined() { if (actual !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`); },
        toBeDefined()   { if (actual == null)       throw new Error(`Expected defined, got ${JSON.stringify(actual)}`); },
        toMatch(p) { const re = typeof p === 'string' ? new RegExp(p) : p; if (!re.test(String(actual))) throw new Error(`Expected "${actual}" to match ${re}`); },
        toHaveLength(n) { const len = actual == null ? -1 : actual.length; if (len !== n) throw new Error(`Expected length ${n}, got ${len}`); },
        toContain(item) {
            if (typeof actual === 'string') { if (!actual.includes(item)) throw new Error(`Expected string to contain "${item}"`); }
            else if (Array.isArray(actual)) { if (!actual.includes(item)) throw new Error(`Expected array to contain ${JSON.stringify(item)}`); }
            else throw new Error('toContain: not string or array');
        },
        toHaveProperty(key, value) {
            if (!(key in Object(actual))) throw new Error(`Expected object to have property "${key}"`);
            if (value !== undefined && !Object.is(actual[key], value)) throw new Error(`Expected "${key}" = ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`);
        },
        toBeTypeOf(type) { if (typeof actual !== type) throw new Error(`Expected typeof ${type}, got ${typeof actual}`); },
        toThrow(msgOrRe) {
            if (typeof actual !== 'function') throw new Error('toThrow requires a function');
            let threw = false, msg = '';
            try { actual(); } catch (e) { threw = true; msg = e && e.message ? e.message : String(e); }
            if (!threw) throw new Error('Expected function to throw');
            if (msgOrRe) { const re = typeof msgOrRe === 'string' ? new RegExp(msgOrRe) : msgOrRe; if (!re.test(msg)) throw new Error(`Expected error matching ${re}, got "${msg}"`); }
        },
        get not() {
            return new Proxy({}, { get(_, method) { return (...args) => {
                let threw = false;
                try { self[method](...args); } catch (_e) { threw = true; }
                if (!threw) throw new Error(`.not.${method}() should have thrown`);
            }; }});
        },
    };
    return self;
}

function printSummary() {
    const total = results.pass + results.fail + results.skip;
    console.log('\n' + '─'.repeat(60));
    console.log(`${BOLD}Test Summary${RESET}`);
    console.log(`  ${GREEN}Passed:${RESET}  ${results.pass}`);
    if (results.skip > 0) console.log(`  ${YELLOW}Skipped:${RESET} ${results.skip}`);
    if (results.fail > 0) {
        console.log(`  ${RED}Failed:${RESET}  ${results.fail}`);
        console.log(`\n${RED}${BOLD}Failures:${RESET}`);
        results.errors.forEach(({ suite, test, error }) => {
            console.log(`  ${RED}✖${RESET} [${suite}] ${test}`);
            const msg = error && error.message ? error.message : String(error);
            msg.split('\n').forEach(l => console.log(`      ${DIM}${l}${RESET}`));
        });
    }
    console.log(`  ${BOLD}Total:${RESET}   ${total}`);
    const gateErrors = [];
    if (total < baseline.visual.minTests) {
        gateErrors.push(`apenas ${total} testes visuais executados; mínimo protegido: ${baseline.visual.minTests}`);
    }
    if (results.skip > baseline.visual.maxSkipped) {
        gateErrors.push(`${results.skip} teste(s) visual(is) skipped; máximo permitido: ${baseline.visual.maxSkipped}`);
    }
    if (gateErrors.length) {
        console.log(`  ${RED}${BOLD}Gate errors:${RESET}`);
        gateErrors.forEach(error => console.log(`    ${RED}✖${RESET} ${error}`));
    }
    console.log('─'.repeat(60));
    return results.fail === 0 && gateErrors.length === 0;
}

function getAsyncQueue() { return _asyncQueue; }

module.exports = { describe, it, ita, beforeEach, afterEach, expect, printSummary, results, getAsyncQueue };
~~~

## 13. Cobertura documental por linhas

As faixas abaixo são contíguas e cobrem as posições 1–161. A posição 161 representa o newline final do blob auditado.

### 1. Linhas 1 — Strict mode

Fonte auditada:
~~~text
1: 'use strict';
~~~

**O que faz:** Ativa strict mode para todo o módulo CommonJS.

**Como faz:** A diretiva é avaliada antes de qualquer estado global do runner.

**Por que foi implementado dessa forma:** Um executor de testes deve falhar cedo em operações JavaScript inválidas em vez de tolerar comportamentos silenciosos.

**Risco/limite:** Remover a diretiva não muda a API pública, mas reduz a rigidez de execução do próprio harness.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE sempre que test:visual carrega o módulo; não existe assertion focal para a diretiva.

### 2. Linhas 2-4 — Códigos ANSI e baseline

Fonte auditada:
~~~text
2: const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m';
3: const YELLOW = '\x1b[33m', CYAN = '\x1b[36m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
4: const baseline = require('../../scripts/ci/data/test-baseline.json');
~~~

**O que faz:** Define constantes de formatação ANSI e importa o baseline canônico de testes.

**Como faz:** As cores são strings fixas e o JSON é carregado via require, ficando cacheado no processo.

**Por que foi implementado dessa forma:** O runner produz diagnóstico legível e usa o mesmo baseline versionado empregado pelos gates de CI.

**Risco/limite:** Se o JSON estiver malformado o require falha imediatamente. Se campos numéricos existirem com tipo inválido, algumas comparações podem falhar abertas; visual.minTests é validado externamente, visual.maxSkipped não.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para visual.minTests positivo em verify-ci-contract.js; ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para schema de visual.maxSkipped.

### 3. Linhas 5-7 — Estado global de resultados e suíte corrente

Fonte auditada:
~~~text
5: ␠ [linha vazia]
6: const results = { pass: 0, fail: 0, skip: 0, errors: [] };
7: let _currentSuite = '(root)', _suiteDepth = 0;
~~~

**O que faz:** Inicializa os acumuladores pass/fail/skip/errors e o contexto nominal/profundidade da suíte.

**Como faz:** O estado vive no singleton do módulo Node durante toda a execução de run-all.js.

**Por que foi implementado dessa forma:** As seis suítes compartilham um único resumo e um único exit status.

**Risco/limite:** Reusar o módulo no mesmo processo sem isolamento acumula resultados; o fluxo oficial executa um processo novo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas seis suítes e por printSummary; não há self-test que resete/recarregue o singleton.

### 4. Linhas 8-14 — Pilhas de hooks escopados

Fonte auditada:
~~~text
8: ␠ [linha vazia]
9: // Scoped hooks — each describe level gets its own array
10: const _beforeStack = [[]];
11: const _afterStack  = [[]];
12: ␠ [linha vazia]
13: function _allBefores() { return _beforeStack.slice(1).flat(); }
14: function _allAfters()  { return _afterStack.slice(1).flat();  }
~~~

**O que faz:** Mantém arrays de beforeEach/afterEach por nível de describe e funções que achatam os níveis ativos.

**Como faz:** O índice zero funciona como sentinela; _allBefores/_allAfters descartam esse nível com slice(1).

**Por que foi implementado dessa forma:** Cada describe pode adicionar hooks sem contaminar diretamente o array do nível pai.

**Risco/limite:** Hooks declarados na raiz são aceitos por beforeEach/afterEach, mas nunca retornam por slice(1); afterEach aninhado é achatado na mesma ordem externo→interno.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE no caminho feliz de sete declarações beforeEach atuais; afterEach não possui consumidor atual nas seis suítes.

### 5. Linhas 15-17 — Fila assíncrona serial

Fonte auditada:
~~~text
15: ␠ [linha vazia]
16: // Serial async queue — eliminates race conditions between ita tests
17: let _asyncQueue = Promise.resolve();
~~~

**O que faz:** Inicializa uma Promise resolvida que será encadeada por todos os testes ita.

**Como faz:** Cada ita substitui _asyncQueue por _asyncQueue.then(...), preservando serialização entre testes assíncronos.

**Por que foi implementado dessa forma:** Evita concorrência entre testes visuais que compartilham módulos/globais/repositórios simulados.

**Risco/limite:** A serialização cobre somente ita; testes it síncronos executam imediatamente durante o require e, portanto, podem ultrapassar ita declarados antes deles.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por 112 registros ita e pelo await de getAsyncQueue em run-all.js; não há assertion focal de ordem mista it/ita.

### 6. Linhas 18-36 — describe — registro de suíte e escopo

Fonte auditada:
~~~text
18: ␠ [linha vazia]
19: function describe(name, fn) {
20:     const prev = _currentSuite;
21:     _currentSuite = name;
22:     _suiteDepth++;
23:     const indent = '  '.repeat(_suiteDepth - 1);
24:     console.log(`\n${indent}${CYAN}${BOLD}▶ ${name}${RESET}`);
25:     _beforeStack.push([]);
26:     _afterStack.push([]);
27:     try { fn(); } catch (e) {
28:         console.log(`${indent}  ${RED}✖ SUITE ERROR: ${e.message}${RESET}`);
29:         results.fail++;
30:         results.errors.push({ suite: name, test: '(suite-level)', error: e });
31:     }
32:     _beforeStack.pop();
33:     _afterStack.pop();
34:     _suiteDepth--;
35:     _currentSuite = prev;
36: }
~~~

**O que faz:** Abre um escopo de suíte, imprime cabeçalho, adiciona camadas de hooks, executa a função de registro e restaura o contexto.

**Como faz:** Usa try/catch apenas em torno da chamada síncrona fn(); exceções de registro contam como falha suite-level.

**Por que foi implementado dessa forma:** Permite sintaxe leve inspirada em frameworks de teste sem dependência adicional.

**Risco/limite:** describe assíncrono não é aguardado; uma Promise rejeitada ou registros feitos após await escapariam do escopo já desmontado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por todas as suítes visuais no caminho de registro normal; ⚠️ sem teste focal do branch SUITE ERROR.

### 7. Linhas 37-39 — Registro de beforeEach/afterEach

Fonte auditada:
~~~text
37: ␠ [linha vazia]
38: function beforeEach(fn) { _beforeStack[_beforeStack.length - 1].push(fn); }
39: function afterEach(fn)  { _afterStack[_afterStack.length - 1].push(fn);  }
~~~

**O que faz:** Adiciona funções de hook ao array do nível de describe atualmente ativo.

**Como faz:** Usa o último elemento de cada pilha.

**Por que foi implementado dessa forma:** O custo de registro é mínimo e o snapshot de ita pode capturar o conjunto vigente antes de describe desmontar o escopo.

**Risco/limite:** Não valida tipo, não rejeita registro fora de describe e não define semântica explícita para hooks assíncronos usados por it.

**Evidência automatizada:** 🟨 beforeEach é usado atualmente; ⚠️ afterEach não é exercitado pelas suítes atuais.

### 8. Linhas 40-57 — it — execução síncrona

Fonte auditada:
~~~text
40: ␠ [linha vazia]
41: function it(label, fn) {
42:     const indent = '  '.repeat(_suiteDepth);
43:     if (!fn) { console.log(`${indent}${YELLOW}○ ${label} (skipped)${RESET}`); results.skip++; return; }
44:     const befores = _allBefores(), afters = _allAfters();
45:     for (const bf of befores) { try { bf(); } catch (_e) {} }
46:     try {
47:         fn();
48:         console.log(`${indent}${GREEN}✔${RESET} ${label}`);
49:         results.pass++;
50:     } catch (e) {
51:         console.log(`${indent}${RED}✖ ${label}${RESET}`);
52:         console.log(`${indent}  ${DIM}${e && e.message ? e.message : e}${RESET}`);
53:         results.fail++;
54:         results.errors.push({ suite: _currentSuite, test: label, error: e });
55:     }
56:     for (const af of afters) { try { af(); } catch (_e) {} }
57: }
~~~

**O que faz:** Executa teste síncrono imediatamente, contabiliza skip quando fn é ausente, roda hooks e converte exceção do corpo em fail.

**Como faz:** Hooks e corpo são chamados sem await; somente a exceção síncrona do corpo entra no results.errors.

**Por que foi implementado dessa forma:** Mantém testes puramente síncronos baratos e imediatos.

**Risco/limite:** Erros de hooks são descartados. Se fn retornar Promise, o runner marca pass antes da resolução; rejeição assíncrona não é atribuída corretamente ao teste. Isso cria risco de falso-verde.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por 112 testes it atuais, todos não-async na auditoria; ⚠️ sem teste probatório do tratamento de thenables/hook failures/skip.

### 9. Linhas 58-80 — ita — execução assíncrona serial

Fonte auditada:
~~~text
58: ␠ [linha vazia]
59: function ita(label, fn) {
60:     const indent = '  '.repeat(_suiteDepth), suiteName = _currentSuite, depth = _suiteDepth;
61:     if (!fn) { console.log(`${indent}${YELLOW}○ ${label} (skipped)${RESET}`); results.skip++; return Promise.resolve(); }
62:     // Snapshot hooks at registration time (CRITICAL: before describe pops its layer)
63:     const befores = _allBefores();
64:     const afters  = _allAfters();
65:     return _asyncQueue = _asyncQueue.then(async () => {
66:         const ind = '  '.repeat(depth);
67:         for (const bf of befores) { try { await bf(); } catch (_e) {} }
68:         try {
69:             await fn();
70:             console.log(`${ind}${GREEN}✔${RESET} ${label}`);
71:             results.pass++;
72:         } catch (e) {
73:             console.log(`${ind}${RED}✖ ${label}${RESET}`);
74:             console.log(`${ind}  ${DIM}${e && e.message ? e.message : e}${RESET}`);
75:             results.fail++;
76:             results.errors.push({ suite: suiteName, test: label, error: e });
77:         }
78:         for (const af of afters) { try { await af(); } catch (_e) {} }
79:     });
80: }
~~~

**O que faz:** Registra teste assíncrono na fila global, preserva suite/depth/hooks do momento do registro, aguarda corpo e conta sucesso/falha.

**Como faz:** Captura befores/afters antes de describe fazer pop; encadeia um callback async em _asyncQueue.

**Por que foi implementado dessa forma:** O snapshot é necessário porque a fila só executa depois que o registro síncrono das suítes termina.

**Risco/limite:** Exceções/rejeições de beforeEach e afterEach são engolidas. Além disso, a fila serializa ita entre si, não a ordem declarativa relativa a it.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por 112 testes ita atuais e pelo await em run-all.js; ⚠️ sem teste focal de falha de hook e ordenação mista.

### 10. Linhas 81-90 — expect — igualdade e comparações numéricas

Fonte auditada:
~~~text
81: ␠ [linha vazia]
82: function expect(actual) {
83:     const self = {
84:         toBe(e) { if (!Object.is(actual, e)) throw new Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(actual)}`); },
85:         toEqual(e) { const a = JSON.stringify(actual), b = JSON.stringify(e); if (a !== b) throw new Error(`Expected\n  ${b}\ngot\n  ${a}`); },
86:         toBeGreaterThan(n)        { if (!(actual > n))  throw new Error(`Expected ${actual} > ${n}`); },
87:         toBeGreaterThanOrEqual(n) { if (!(actual >= n)) throw new Error(`Expected ${actual} >= ${n}`); },
88:         toBeLessThan(n)           { if (!(actual < n))  throw new Error(`Expected ${actual} < ${n}`); },
89:         toBeLessThanOrEqual(n)    { if (!(actual <= n)) throw new Error(`Expected ${actual} <= ${n}`); },
90:         toBeCloseTo(e, d=2) { if (Math.abs(actual-e) >= Math.pow(10,-d)/2) throw new Error(`Expected ${actual} ≈ ${e}`); },
~~~

**O que faz:** Cria matchers toBe, toEqual, comparações e toBeCloseTo sobre o valor capturado.

**Como faz:** toBe usa Object.is; toEqual serializa ambos com JSON.stringify; comparadores usam operadores JS; toBeCloseTo aplica tolerância decimal.

**Por que foi implementado dessa forma:** Fornece um subconjunto pequeno da ergonomia de Jest suficiente para as suítes visuais sem iniciar Jest.

**Risco/limite:** toEqual não é igualdade profunda geral: ordem de propriedades, undefined, funções e ciclos podem produzir semântica diferente/erro. O matcher não é usado atualmente pelas seis suítes.

**Evidência automatizada:** 🟨 matchers usados são exercitados indiretamente; toEqual não tem consumidor atual e não possui self-test.

### 11. Linhas 91-98 — expect — NaN, truthiness, nullability, regex e length

Fonte auditada:
~~~text
91:         toBeNaN()       { if (!Number.isNaN(actual))   throw new Error(`Expected NaN, got ${actual}`); },
92:         toBeTruthy()    { if (!actual)  throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`); },
93:         toBeFalsy()     { if (actual)   throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`); },
94:         toBeNull()      { if (actual !== null)      throw new Error(`Expected null, got ${JSON.stringify(actual)}`); },
95:         toBeUndefined() { if (actual !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`); },
96:         toBeDefined()   { if (actual == null)       throw new Error(`Expected defined, got ${JSON.stringify(actual)}`); },
97:         toMatch(p) { const re = typeof p === 'string' ? new RegExp(p) : p; if (!re.test(String(actual))) throw new Error(`Expected "${actual}" to match ${re}`); },
98:         toHaveLength(n) { const len = actual == null ? -1 : actual.length; if (len !== n) throw new Error(`Expected length ${n}, got ${len}`); },
~~~

**O que faz:** Implementa matchers simples para NaN, booleanidade, null/undefined/defined, regex e comprimento.

**Como faz:** Usa predicados JS diretos e converte actual em string para toMatch.

**Por que foi implementado dessa forma:** Cobre as asserções mais frequentes do corpus visual.

**Risco/limite:** toMatch aceita qualquer objeto com método test implicitamente; toHaveLength usa -1 como sentinela para nullish. Alguns matchers exportados não são usados no corpus atual.

**Evidência automatizada:** 🟨 toTruthy, toNull, toUndefined, toDefined, toMatch e toHaveLength são consumidos; toBeNaN e toBeFalsy não foram localizados nas seis suítes.

### 12. Linhas 99-108 — expect — contain, property e typeof

Fonte auditada:
~~~text
99:         toContain(item) {
100:             if (typeof actual === 'string') { if (!actual.includes(item)) throw new Error(`Expected string to contain "${item}"`); }
101:             else if (Array.isArray(actual)) { if (!actual.includes(item)) throw new Error(`Expected array to contain ${JSON.stringify(item)}`); }
102:             else throw new Error('toContain: not string or array');
103:         },
104:         toHaveProperty(key, value) {
105:             if (!(key in Object(actual))) throw new Error(`Expected object to have property "${key}"`);
106:             if (value !== undefined && !Object.is(actual[key], value)) throw new Error(`Expected "${key}" = ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`);
107:         },
108:         toBeTypeOf(type) { if (typeof actual !== type) throw new Error(`Expected typeof ${type}, got ${typeof actual}`); },
~~~

**O que faz:** Implementa contenção em string/array, existência de propriedade e verificação de typeof.

**Como faz:** toContain usa includes; toHaveProperty usa operador in e Object.is para valor opcional; toBeTypeOf usa typeof.

**Por que foi implementado dessa forma:** São operações determinísticas e suficientes para os objetos/arrays simples usados nas suítes visuais.

**Risco/limite:** toHaveProperty não resolve caminhos aninhados como Jest e valor undefined não pode ser distinguido do argumento omitido; toBeTypeOf não possui consumidor atual.

**Evidência automatizada:** 🟨 toContain e toHaveProperty são usados indiretamente; ⚠️ toBeTypeOf não é exercitado atualmente.

### 13. Linhas 109-115 — expect — toThrow

Fonte auditada:
~~~text
109:         toThrow(msgOrRe) {
110:             if (typeof actual !== 'function') throw new Error('toThrow requires a function');
111:             let threw = false, msg = '';
112:             try { actual(); } catch (e) { threw = true; msg = e && e.message ? e.message : String(e); }
113:             if (!threw) throw new Error('Expected function to throw');
114:             if (msgOrRe) { const re = typeof msgOrRe === 'string' ? new RegExp(msgOrRe) : msgOrRe; if (!re.test(msg)) throw new Error(`Expected error matching ${re}, got "${msg}"`); }
115:         },
~~~

**O que faz:** Exige função, executa-a e opcionalmente compara a mensagem do erro com regex/string convertida para regex.

**Como faz:** Captura apenas exceção síncrona e rejeita quando nada é lançado.

**Por que foi implementado dessa forma:** Permite provar validações síncronas sem Jest.

**Risco/limite:** Não suporta função assíncrona/rejeição; string é interpretada como regex, não como substring literal escapada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por seis usos atuais; não há self-test isolado do matcher.

### 14. Linhas 116-125 — Negação e retorno do matcher

Fonte auditada:
~~~text
116:         get not() {
117:             return new Proxy({}, { get(_, method) { return (...args) => {
118:                 let threw = false;
119:                 try { self[method](...args); } catch (_e) { threw = true; }
120:                 if (!threw) throw new Error(`.not.${method}() should have thrown`);
121:             }; }});
122:         },
123:     };
124:     return self;
125: }
~~~

**O que faz:** Expõe expect(...).not por Proxy, invertendo o resultado do matcher positivo.

**Como faz:** Chama self[method]; qualquer exceção é interpretada como sucesso da negação, e ausência de exceção gera erro.

**Por que foi implementado dessa forma:** Evita duplicar cada matcher em forma negada.

**Risco/limite:** Matcher inexistente também causa TypeError dentro do try e é tratado como negação bem-sucedida. Um typo como not.toBee() pode passar silenciosamente.

**Evidência automatizada:** 🟨 .not é usado com toMatch, toBe, toBeNull e toContain; ⚠️ não há prova que matcher inexistente seja rejeitado.

### 15. Linhas 126-142 — printSummary — relatório de resultados

Fonte auditada:
~~~text
126: ␠ [linha vazia]
127: function printSummary() {
128:     const total = results.pass + results.fail + results.skip;
129:     console.log('\n' + '─'.repeat(60));
130:     console.log(`${BOLD}Test Summary${RESET}`);
131:     console.log(`  ${GREEN}Passed:${RESET}  ${results.pass}`);
132:     if (results.skip > 0) console.log(`  ${YELLOW}Skipped:${RESET} ${results.skip}`);
133:     if (results.fail > 0) {
134:         console.log(`  ${RED}Failed:${RESET}  ${results.fail}`);
135:         console.log(`\n${RED}${BOLD}Failures:${RESET}`);
136:         results.errors.forEach(({ suite, test, error }) => {
137:             console.log(`  ${RED}✖${RESET} [${suite}] ${test}`);
138:             const msg = error && error.message ? error.message : String(error);
139:             msg.split('\n').forEach(l => console.log(`      ${DIM}${l}${RESET}`));
140:         });
141:     }
142:     console.log(`  ${BOLD}Total:${RESET}   ${total}`);
~~~

**O que faz:** Calcula total, imprime contagens e detalha erros registrados.

**Como faz:** Lê o singleton results e percorre errors apenas quando fail > 0.

**Por que foi implementado dessa forma:** Centraliza diagnóstico final depois que run-all aguarda a fila.

**Risco/limite:** Falhas de hooks não entram em errors porque foram descartadas antes; o resumo não pode revelar o que nunca foi contabilizado.

**Evidência automatizada:** 🟨 caminho verde é executado pelo comando visual; ⚠️ formatação/caminho de failures não possuem self-test focal.

### 16. Linhas 143-155 — printSummary — gates e valor booleano

Fonte auditada:
~~~text
143:     const gateErrors = [];
144:     if (total < baseline.visual.minTests) {
145:         gateErrors.push(`apenas ${total} testes visuais executados; mínimo protegido: ${baseline.visual.minTests}`);
146:     }
147:     if (results.skip > baseline.visual.maxSkipped) {
148:         gateErrors.push(`${results.skip} teste(s) visual(is) skipped; máximo permitido: ${baseline.visual.maxSkipped}`);
149:     }
150:     if (gateErrors.length) {
151:         console.log(`  ${RED}${BOLD}Gate errors:${RESET}`);
152:         gateErrors.forEach(error => console.log(`    ${RED}✖${RESET} ${error}`));
153:     }
154:     console.log('─'.repeat(60));
155:     return results.fail === 0 && gateErrors.length === 0;
~~~

**O que faz:** Reprova total abaixo do mínimo, skips acima do máximo e qualquer fail; retorna booleano usado como exit status.

**Como faz:** Compara total e skip ao baseline, acumula gateErrors e retorna results.fail === 0 && gateErrors.length === 0.

**Por que foi implementado dessa forma:** Protege contra redução silenciosa da suíte e contra testes ignorados.

**Risco/limite:** É piso, não igualdade exata. Campos baseline ausentes/NaN podem desabilitar comparações; verify-ci-contract valida visual.minTests, mas não visual.maxSkipped.

**Evidência automatizada:** 🟦 visual.minTests é validado estaticamente; 🟨 o gate verde é executado em test:visual; ⚠️ branches de minTests/maxSkipped inválidos não possuem self-test.

### 17. Linhas 156-160 — Fila pública e exports

Fonte auditada:
~~~text
156: }
157: ␠ [linha vazia]
158: function getAsyncQueue() { return _asyncQueue; }
159: ␠ [linha vazia]
160: module.exports = { describe, it, ita, beforeEach, afterEach, expect, printSummary, results, getAsyncQueue };
~~~

**O que faz:** Expõe a Promise corrente e exporta toda a API usada pelas suítes e por run-all.

**Como faz:** getAsyncQueue retorna _asyncQueue; module.exports publica describe/it/ita/hooks/expect/summary/results/fila.

**Por que foi implementado dessa forma:** run-all consegue aguardar toda a fila sem conhecer internals; as suítes recebem API única.

**Risco/limite:** Exportar results permite mutação externa; nenhum consumidor atual localizado altera diretamente o objeto.

**Evidência automatizada:** 🟨 getAsyncQueue e os demais exports são consumidos diretamente; não há gate específico contra mutação externa.

### 18. Linhas 161 — Newline final

Fonte auditada:
~~~text
161: ␠ [linha vazia]
~~~

**O que faz:** Preserva a terminação final do arquivo.

**Como faz:** A posição 161 corresponde ao slot vazio após o último newline.

**Por que foi implementado dessa forma:** Mantém convenção de arquivo texto e estabilidade de diffs.

**Risco/limite:** Sem impacto funcional.

**Evidência automatizada:** 🟦 Verificação estrutural pela leitura exata do blob auditado.



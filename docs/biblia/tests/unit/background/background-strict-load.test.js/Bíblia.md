# Bíblia técnica — tests/unit/background/background-strict-load.test.js

> **Estado:** 🟡 CORRIGIDO após REAUDIT — READY_FOR_AUDIT da revisão documental atual  
> **SHA auditado:** 25a663f527f7d3303c51751b4bf3440ea3424b9f  
> **Índice:** 130  
> **Linhas textuais:** 55 — **posições:** 56 com newline final  
> **PR:** #66 — **branch:** docs/project-bible

## 1. Papel do teste

Este arquivo é uma regressão de bootstrap: abre um processo Node separado, instala um conjunto mínimo de globals semelhantes ao Service Worker, lê o `extension/background.js` real e executa o fonte por `new Function(source)()`. A assertion exige que esse processo termine sem exceção.

O uso de subprocesso é a parte central do contrato: módulos/globals criados por outros testes no processo Jest não são herdados como objetos JavaScript. Isso detecta dependências acidentais de estado de teste residente.

## 2. Wiring da suíte

`jest.config.js` (SHA `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`) inclui `tests/unit/background/**/*.test.js` no projeto `background`. `package.json` (blob atual `5b5c328f6139eeff920dc65a78014a6c5b6db3a6`) inclui esse projeto em `test:unit` e expõe `test:unit:background`; o runner `test:ci` também inventaria os testes Jest do repositório. O blob histórico `33e0b91d1a6f1790124b700d2ce331f80d2b7095` corresponde ao snapshot antigo de CI e não é mais tratado como identidade atual.

O arquivo não possui `.skip`, `.only` ou `todo`; a política anti-skip do repositório cobre esses marcadores estaticamente em `verify-test-policy.js`.

## 3. O que o bootstrap simula

O processo filho fornece `chrome.runtime`, `chrome.alarms`, `chrome.storage.local`, objetos vazios para tabs/windows, `downloads.onChanged` e `global.importScripts`. Isso é suficiente para que os registros top-level atuais de `background.js` sejam aceitos.

No SHA auditado do background (`667c05eb2d7adfca16a79d3e706c39a1e9398b72`), há registros top-level de `onInstalled` (linha 649), `onStartup` (658), `onConnect` (703), `alarms.onAlarm` (732) e `runtime.onMessage` (1230), coerentes com os stubs fornecidos.

## 4. Limite crítico: importScripts é no-op

A linha 42 define `global.importScripts = function() {}`. Como `background.js` verifica `typeof importScripts === 'function'`, o teste entra no branch Service Worker e chama dezenas de `importScripts(...)`, porém nenhum desses módulos é realmente lido ou executado.

Logo, BG-STRICT-01 prova que **o corpo principal do background** consegue carregar isoladamente com o conjunto mínimo de globals, mas não prova que `router.js`, `state.js`, módulos de jobs, actions, fingerprint, IndexedDB ou storage-manager existam, compilem ou exponham as APIs esperadas.

## 5. Evidência automatizada

| Propriedade | Evidência | Classificação |
|---|---|---|
| Processo separado é usado | `execFileSync(process.execPath, ['-e', ...])` | ✅ PROVADO DIRETAMENTE |
| `background.js` real é lido | bootstrap usa `fs.readFileSync(process.argv[1])` e recebe `backgroundPath` real | ✅ PROVADO DIRETAMENTE |
| Corpo principal compila/executa em strict mode sem throw | background começa com `'use strict'`; `new Function(source)()` é envolvido por `.not.toThrow()` | ✅ PROVADO DIRETAMENTE |
| Ausência de globals deixados pelo processo Jest | novo processo Node não compartilha heap/global do worker Jest | ✅ PROVADO DIRETAMENTE para vazamento entre processos |
| Módulos `importScripts` carregam | importScripts é no-op | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo |
| Ambiente real Chromium ServiceWorkerGlobalScope | usa Node + mocks manuais | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| callbacks de listeners funcionam | addListener descarta callbacks | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| chrome.tabs/windows/download APIs funcionais | tabs/windows são vazios e downloads só tem onChanged | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 6. Análise crítica

1. O título pode sugerir um carregamento completo de Service Worker, mas os módulos importados são deliberadamente ignorados.
2. A prova é forte para isolamento de processo, porém parcial para paridade com Chromium.
3. A assertion é apenas `not.toThrow`; não confirma listeners registrados, quantidade de imports nem estado final.
4. O mock `importScripts` não registra quais paths foram solicitados; remoção/alteração de uma importação obrigatória pode passar neste teste.
5. `execFileSync` não define timeout. Uma futura inicialização top-level que mantenha o processo vivo pode fazer a suíte permanecer bloqueada até limite externo.
6. O child herda `process.env`; variáveis ambientais podem alterar comportamento futuro do background caso passem a ser consultadas.
7. `new Function` não reproduz integralmente `ServiceWorkerGlobalScope`, resolução de URL de importScripts, CSP ou lifecycle do browser.

## 7. Solicitações ao auditor

### 130-001 — TEST_REQUIRED — ACCEPTED

Adicionar prova separada do bootstrap real dos módulos obrigatórios ou um importScripts controlado que realmente carregue/valide os paths e APIs essenciais. O teste atual só usa no-op. **Severidade: HIGH.**

### 130-002 — TEST_REQUIRED — ACCEPTED

Fortalecer BG-STRICT-01 com assertions observáveis de registros/imports esperados, em vez de somente `not.toThrow`, sem substituir a implementação real. **Severidade: NORMAL.**

### 130-003 — CI_POLICY_REVIEW — ACCEPTED

Definir timeout para o subprocesso ou aceitar explicitamente a ausência; `execFileSync` hoje não possui limite local. **Severidade: NORMAL.**

## 8. Invariantes

1. O teste deve continuar usando processo separado para detectar dependência de globals de outros testes.
2. Deve continuar lendo o `extension/background.js` real.
3. Falha de compilação/execução ou exit não-zero deve reprovar.
4. A classificação documental não pode tratar `importScripts` no-op como prova dos módulos importados.
5. O SHA desta Bíblia é válido apenas para `25a663f527f7d3303c51751b4bf3440ea3424b9f`.

## 9. Fonte integral auditada

~~~javascript
const { execFileSync } = require('child_process');
const path = require('path');

describe('background.js - carregamento isolado do Service Worker', () => {
    test('BG-STRICT-01: carrega em strict mode sem depender de globals vazados por outros testes', () => {
        const backgroundPath = path.resolve(__dirname, '../../../extension/background.js');

        const bootstrap = `
const fs = require('fs');

global.chrome = {
    runtime: {
        id: 'test-extension',
        lastError: null,
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        onConnect: { addListener() {} },
        onMessage: { addListener() {} },
    },
    alarms: {
        onAlarm: { addListener() {} },
        create() {},
        clear(_name, cb) { if (cb) cb(); },
    },
    storage: {
        local: {
            async get() { return {}; },
            async set() {},
            async remove() {},
        },
    },
    tabs: {},
    windows: {},
    downloads: {
        onChanged: {
            addListener() {},
            removeListener() {},
        },
    },
};

global.importScripts = function() {};

const source = fs.readFileSync(process.argv[1], 'utf8');
new Function(source)();
`;

        expect(() => {
            execFileSync(process.execPath, ['-e', bootstrap, backgroundPath], {
                stdio: 'pipe',
                env: { ...process.env },
            });
        }).not.toThrow();
    });
});
~~~

## 10. Cobertura posição por posição

### Linha 001

- **Conteúdo:** `const { execFileSync } = require('child_process');`
- **Papel:** Importa execFileSync; o isolamento é obtido criando um processo Node real em vez de executar no worker Jest.

### Linha 002

- **Conteúdo:** `const path = require('path');`
- **Papel:** Importa path para localizar extension/background.js de forma independente do cwd.

### Linha 003

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 004

- **Conteúdo:** `describe('background.js - carregamento isolado do Service Worker', () => {`
- **Papel:** Agrupa o contrato como carregamento isolado do Service Worker.

### Linha 005

- **Conteúdo:** `    test('BG-STRICT-01: carrega em strict mode sem depender de globals vazados por outros testes', () => {`
- **Papel:** Define o único caso BG-STRICT-01: background deve carregar sem depender de globals vazados por outros testes.

### Linha 006

- **Conteúdo:** `        const backgroundPath = path.resolve(__dirname, '../../../extension/background.js');`
- **Papel:** Resolve o caminho absoluto do background real.

### Linha 007

- **Conteúdo:** _linha em branco_
- **Papel:** Separador antes do bootstrap filho.

### Linha 008

- **Conteúdo:** `        const bootstrap = \``
- **Papel:** Abre o template literal enviado ao processo Node com -e.

### Linha 009

- **Conteúdo:** `const fs = require('fs');`
- **Papel:** No processo filho, importa fs para ler o background real.

### Linha 010

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual dentro do bootstrap.

### Linha 011

- **Conteúdo:** `global.chrome = {`
- **Papel:** Cria global.chrome mínimo no processo limpo.

### Linha 012

- **Conteúdo:** `    runtime: {`
- **Papel:** Abre o mock de chrome.runtime.

### Linha 013

- **Conteúdo:** `        id: 'test-extension',`
- **Papel:** Define id estável da extensão para código que consulta chrome.runtime.id.

### Linha 014

- **Conteúdo:** `        lastError: null,`
- **Papel:** Inicializa lastError como null.

### Linha 015

- **Conteúdo:** `        onInstalled: { addListener() {} },`
- **Papel:** Fornece onInstalled.addListener no-op para o registro top-level do background.

### Linha 016

- **Conteúdo:** `        onStartup: { addListener() {} },`
- **Papel:** Fornece onStartup.addListener no-op.

### Linha 017

- **Conteúdo:** `        onConnect: { addListener() {} },`
- **Papel:** Fornece onConnect.addListener no-op.

### Linha 018

- **Conteúdo:** `        onMessage: { addListener() {} },`
- **Papel:** Fornece onMessage.addListener no-op.

### Linha 019

- **Conteúdo:** `    },`
- **Papel:** Fecha chrome.runtime.

### Linha 020

- **Conteúdo:** `    alarms: {`
- **Papel:** Abre o mock de chrome.alarms.

### Linha 021

- **Conteúdo:** `        onAlarm: { addListener() {} },`
- **Papel:** Fornece onAlarm.addListener no-op para o listener top-level.

### Linha 022

- **Conteúdo:** `        create() {},`
- **Papel:** Fornece alarms.create no-op.

### Linha 023

- **Conteúdo:** `        clear(_name, cb) { if (cb) cb(); },`
- **Papel:** Fornece alarms.clear síncrono que chama callback quando fornecido.

### Linha 024

- **Conteúdo:** `    },`
- **Papel:** Fecha chrome.alarms.

### Linha 025

- **Conteúdo:** `    storage: {`
- **Papel:** Abre chrome.storage.

### Linha 026

- **Conteúdo:** `        local: {`
- **Papel:** Abre storage.local.

### Linha 027

- **Conteúdo:** `            async get() { return {}; },`
- **Papel:** Mocka get assíncrono retornando objeto vazio.

### Linha 028

- **Conteúdo:** `            async set() {},`
- **Papel:** Mocka set assíncrono.

### Linha 029

- **Conteúdo:** `            async remove() {},`
- **Papel:** Mocka remove assíncrono.

### Linha 030

- **Conteúdo:** `        },`
- **Papel:** Fecha storage.local.

### Linha 031

- **Conteúdo:** `    },`
- **Papel:** Fecha storage.

### Linha 032

- **Conteúdo:** `    tabs: {},`
- **Papel:** Fornece objeto chrome.tabs vazio; o teste só exige que o carregamento top-level não use métodos ausentes imediatamente.

### Linha 033

- **Conteúdo:** `    windows: {},`
- **Papel:** Fornece objeto chrome.windows vazio.

### Linha 034

- **Conteúdo:** `    downloads: {`
- **Papel:** Abre mock de chrome.downloads.

### Linha 035

- **Conteúdo:** `        onChanged: {`
- **Papel:** Abre downloads.onChanged.

### Linha 036

- **Conteúdo:** `            addListener() {},`
- **Papel:** Fornece addListener no-op.

### Linha 037

- **Conteúdo:** `            removeListener() {},`
- **Papel:** Fornece removeListener no-op.

### Linha 038

- **Conteúdo:** `        },`
- **Papel:** Fecha downloads.onChanged.

### Linha 039

- **Conteúdo:** `    },`
- **Papel:** Fecha downloads.

### Linha 040

- **Conteúdo:** `};`
- **Papel:** Fecha global.chrome.

### Linha 041

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 042

- **Conteúdo:** `global.importScripts = function() {};`
- **Papel:** Define importScripts como no-op; isso força o branch Service Worker do background sem executar os módulos importados.

### Linha 043

- **Conteúdo:** _linha em branco_
- **Papel:** Separador visual.

### Linha 044

- **Conteúdo:** `const source = fs.readFileSync(process.argv[1], 'utf8');`
- **Papel:** Lê o background indicado em process.argv[1] como UTF-8.

### Linha 045

- **Conteúdo:** `new Function(source)();`
- **Papel:** Compila e executa o fonte em new Function; a diretiva 'use strict' do próprio background torna esse Function body strict.

### Linha 046

- **Conteúdo:** `\`;`
- **Papel:** Fecha o template literal bootstrap.

### Linha 047

- **Conteúdo:** _linha em branco_
- **Papel:** Separador antes da assertion.

### Linha 048

- **Conteúdo:** `        expect(() => {`
- **Papel:** Abre expect envolvendo a execução síncrona do processo filho.

### Linha 049

- **Conteúdo:** `            execFileSync(process.execPath, ['-e', bootstrap, backgroundPath], {`
- **Papel:** Executa o mesmo binário Node atual com -e, o bootstrap e o caminho do background como argumento.

### Linha 050

- **Conteúdo:** `                stdio: 'pipe',`
- **Papel:** Configura stdio como pipe; stdout/stderr do filho não são exibidos normalmente.

### Linha 051

- **Conteúdo:** `                env: { ...process.env },`
- **Papel:** Herda o ambiente do processo pai por cópia de process.env.

### Linha 052

- **Conteúdo:** `            });`
- **Papel:** Fecha as opções de execFileSync.

### Linha 053

- **Conteúdo:** `        }).not.toThrow();`
- **Papel:** A assertion exige que todo o subprocesso termine sem lançar; exit não-zero/sinal/erro de spawn falha o teste.

### Linha 054

- **Conteúdo:** `    });`
- **Papel:** Fecha o caso de teste.

### Linha 055

- **Conteúdo:** `});`
- **Papel:** Fecha o describe.

### Linha 056

- **Conteúdo:** _newline final após a linha 55_
- **Papel:** Posição terminal: newline final.

## 11. Autoauditoria documental

- SHA reconfirmado e fonte integral embutida.
- 55 linhas textuais + newline = **56/56 posições**.
- Headings `Linha 001` → `Linha 056` sequenciais.
- Background, Jest config, package wiring e política anti-skip foram cruzados sem alterar nenhum deles.
- Evidência de subprocesso não foi promovida a prova de módulos importados.
- Solicitações 130-001..003 estão ACCEPTED no state canônico; permanecem limitações reconhecidas, não requests OPEN.

> **Lifecycle pós-REAUDIT:** 130-001/002/003 estão ACCEPTED. A referência de `package.json` usa o blob atual; o SHA antigo permanece apenas como snapshot histórico da execução.

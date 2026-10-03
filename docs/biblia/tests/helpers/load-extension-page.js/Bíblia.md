# Bíblia técnica — tests/helpers/load-extension-page.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA APROVADA  
> **SHA auditado:** `c2325598f10b3ef9dd656a4e87db8569748e66b0`  
> **Agente responsável:** AGENTE 11  
> **Tipo:** helper Jest/jsdom para carregar páginas reais da extensão  
> **Linhas textuais:** **85**  
> **Posições documentais:** **86**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`load-extension-page.js` é o harness que permite às suítes jsdom testar `popup.html`, `options.html` e `reader.html` com seus scripts reais sem depender da execução automática de `<script src>` do navegador. O helper escreve o HTML real no `document`, remove scripts externos do markup, descobre quais scripts aparecem antes do alvo e faz `require` manual desses módulos na ordem do HTML dentro de `jest.isolateModules`.

Ele também controla dois elementos que normalmente pertencem ao navegador: a URL da página e o momento de `DOMContentLoaded`. Por fim, drena algumas rodadas de timers zero para permitir que efeitos assíncronos do bootstrap avancem antes de devolver o controle ao teste.

## 2. Dependências, ambiente e consumidores

### Dependências

- Node `fs` e `path`;
- `tests/helpers/repo-root.js#findRepoRoot`;
- globals de ambiente Jest/jsdom: `window`, `document`, `Event`, `jest`, `URL`, `setTimeout`.

### Páginas confirmadas

- `extension/reader/reader.html`: `../shared/shared-ui.js` → `reader.js`;
- `extension/options/options.html`: `../shared/shared-ui.js` → `options.js`;
- `extension/popup/popup.html`: `../shared/shared-ui.js` → `popup.js`.

### Consumidores encontrados

- `tests/integration/reader.ui.test.js`;
- `tests/integration/options.ui.test.js`;
- `tests/integration/popup.ui.test.js`;
- `tests/integration/popup.advanced.ui.test.js`;
- `tests/integration/popup-translated-thumbnails.test.js`;
- `tests/integration/performance.test.js`;
- `tests/unit/popup/dynamic-button.test.js`;
- `tests/unit/popup/log-exporter.test.js`;
- `tests/unit/popup/progress-panel.test.js`;
- `tests/unit/popup/resize-and-tabs.test.js`;
- `tests/unit/reader/keyboard-nav.test.js`;
- `tests/unit/reader/page-counter.test.js`.

Os projects popup/reader/integration usam `testEnvironment: 'jsdom'` no Jest.

## 3. Fluxo

1. descobre `ROOT`;
2. lê o HTML real;
3. encontra scripts externos e identifica dependências anteriores ao script alvo;
4. atualiza pathname/query/hash da janela de teste;
5. reescreve o DOM removendo tags externas de script;
6. opcionalmente intercepta listeners de `DOMContentLoaded`;
7. dentro de `jest.isolateModules`, requer dependências na ordem HTML e depois o alvo;
8. substitui o interceptor por um wrapper bound de `document.addEventListener`, funcionalmente delegado ao EventTarget do documento, mas **não** pela mesma referência de função original;
9. se solicitado, invoca sequencialmente os callbacks capturados;
10. aguarda quatro rodadas de `setTimeout(0)`.

## 4. Evidência automatizada

| Contrato | Evidência atual | Classificação |
|---|---|---|
| helper carrega HTML real de popup/options/reader | múltiplas suítes fazem assertions no DOM real após `loadExtensionPage` | 🟨 EXECUTADO INDIRETAMENTE |
| query da URL chega ao reader | reader tests passam `?id=...` e validam capítulo correspondente | 🟨 EXECUTADO INDIRETAMENTE |
| caminho `fireDOMContentLoaded: true` permite bootstraps reais | opções/popup/reader usam a flag e validam efeitos dos handlers | 🟨 EXECUTADO INDIRETAMENTE |
| dependência `shared-ui.js` antes do alvo | HTML real contém a ordem e o helper a executa em consumidores reais | 🟨 EXECUTADO INDIRETAMENTE |
| `flushAsyncTasks` permite estabilizar efeitos assíncronos | amplamente chamado após ações e page load | 🟨 EXECUTADO INDIRETAMENTE |
| regex de remoção de scripts | nenhum teste focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| extração/ordem de dependências | nenhum teste focal que inspecione diretamente o array/resultados | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| alvo ausente no HTML retorna `[]` mas ainda é requerido | nenhum cenário focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| semântica do listener sintético equivale ao browser | nenhuma prova focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Invariantes

1. o helper deve operar sobre HTML/script reais do repositório;
2. scripts externos não podem executar automaticamente e novamente via markup;
3. dependências anteriores ao alvo devem ser requeridas antes dele;
4. módulos de cada carregamento precisam estar isolados pelo Jest;
5. o histórico deve refletir pathname/query/hash solicitado antes do script rodar;
6. listeners não-DOMContentLoaded continuam delegados ao EventTarget real;
7. após a carga, `document.addEventListener` deve deixar de apontar para o interceptor temporário mesmo quando um `require` lança; a implementação atual reassocia um wrapper criado por `document.addEventListener.bind(document)`, portanto preserva delegação funcional, não identidade de referência;
8. callbacks capturados devem manter a ordem de registro;
9. tarefas assíncronas recebem uma janela determinística curta para avançar;
10. o helper não deve modificar fontes/fixtures em disco.

## 6. Casos-limite e riscos

### Dispatch sintético não é idêntico ao browser

Os listeners capturados são chamados como funções com `await listener(event)`. O dispatch real de EventTarget:
- define contexto/`this` conforme o EventTarget;
- aceita objetos com `handleEvent`;
- processa opções como `once`, `signal` etc.;
- não aguarda promises retornadas por listener.

Os consumidores atuais usam callbacks compatíveis, mas o harness pode divergir caso novos scripts dependam dessas semânticas.

### Dependências dependem do formato textual das tags

A regex aceita tags externas com fechamento explícito e `src` entre aspas. Query strings em `src`, módulos, tags com construção diferente ou recursos fora desse padrão podem não mapear corretamente para um path de `require`.

### Scripts após o alvo não são carregados

`scripts.slice(0, targetIndex)` replica apenas as dependências anteriores ao alvo. Isso é adequado para testar o alvo, mas não simula o restante do lifecycle HTML quando há scripts posteriores.

### Origem customizada é descartada

`new URL(url,...)` calcula uma URL completa, mas `history.replaceState` recebe apenas `pathname + search + hash`. Portanto a origem de uma URL externa fornecida não passa para `window.location.origin`. Todos os consumidores localizados usam o host de teste padrão.

### Dreno assíncrono é heurístico

Quatro `setTimeout(0)` cobrem cadeias curtas, não constituem prova de quiescência. Consumidores às vezes chamam `flushAsyncTasks(6/8)` adicionalmente, o que confirma que a quantidade necessária depende do fluxo.

## 7. Solicitações ao auditor

### 103-001 — TEST_REQUIRED — ACCEPTED

Criar teste focal do helper em jsdom cobrindo `stripExternalScripts`, ordem de dependências, alvo ausente, URL/query/hash, restauração de `addEventListener`, caminhos com/sem `fireDOMContentLoaded` e comportamento de `flushAsyncTasks`. Hoje a prova é predominantemente indireta via consumidores.

### 103-002 — HARNESS_SEMANTICS_REVIEW — ACCEPTED

Definir explicitamente quanta fidelidade ao EventTarget real é necessária no caminho sintético de `DOMContentLoaded`. Se callbacks objeto, `this=document`, opções `once/signal` ou não-await de promises forem parte do contrato, ajustar helper/testes em alteração separada; se não forem, documentar a simplificação como intencional.

## 8. Fonte integral exata

```js
const fs = require('fs');
const path = require('path');

const { findRepoRoot } = require('./repo-root');
const ROOT = findRepoRoot(__dirname);

function stripExternalScripts(html) {
    return html.replace(/<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/gi, '');
}

function getScriptDependencies(html, htmlPath, scriptPath) {
    const targetPath = path.resolve(ROOT, scriptPath);
    const pageDirectory = path.dirname(path.resolve(ROOT, htmlPath));
    const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi)]
        .map(([, src]) => path.resolve(pageDirectory, src));
    const targetIndex = scripts.indexOf(targetPath);

    return targetIndex === -1 ? [] : scripts.slice(0, targetIndex);
}

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function flushAsyncTasks(rounds = 4) {
    for (let i = 0; i < rounds; i++) {
        await delay(0);
    }
}

async function loadExtensionPage({
    htmlPath,
    scriptPath,
    url = 'https://extension.test/',
    fireDOMContentLoaded = false,
} = {}) {
    const html = fs.readFileSync(path.join(ROOT, htmlPath), 'utf8');
    const dependencies = getScriptDependencies(html, htmlPath, scriptPath);
    const nextUrl = new URL(url, 'https://extension.test');

    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    document.open();
    document.write(stripExternalScripts(html));
    document.close();

    if (fireDOMContentLoaded) {
        const originalAddEventListener = document.addEventListener.bind(document);
        const domReadyCallbacks = [];

        document.addEventListener = (type, listener, options) => {
            if (type === 'DOMContentLoaded') {
                domReadyCallbacks.push(listener);
                return;
            }
            return originalAddEventListener(type, listener, options);
        };

        try {
            jest.isolateModules(() => {
                dependencies.forEach(dependency => require(dependency));
                require(path.join(ROOT, scriptPath));
            });
        } finally {
            document.addEventListener = originalAddEventListener;
        }

        for (const listener of domReadyCallbacks) {
            await listener(new Event('DOMContentLoaded', { bubbles: true }));
        }
    } else {
        jest.isolateModules(() => {
            dependencies.forEach(dependency => require(dependency));
            require(path.join(ROOT, scriptPath));
        });
    }

    await flushAsyncTasks();
}

module.exports = {
    ROOT,
    delay,
    flushAsyncTasks,
    loadExtensionPage,
};
```

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** `const fs = require('fs');`

**Função:** Importa `fs` para ler o HTML real da extensão.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 2

**Fonte:** `const path = require('path');`

**Função:** Importa `path` para resolver caminhos do repositório e scripts.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 3

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa imports nativos do helper de raiz.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 4

**Fonte:** `const { findRepoRoot } = require('./repo-root');`

**Função:** Importa `findRepoRoot` do helper canônico de testes.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 5

**Fonte:** `const ROOT = findRepoRoot(__dirname);`

**Função:** Descobre e fixa `ROOT` a partir do diretório deste helper.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 6

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa bootstrap das funções.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 7

**Fonte:** `function stripExternalScripts(html) {`

**Função:** Declara a função interna que remove tags externas de script do HTML.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 8

**Fonte:** `    return html.replace(/<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/gi, '');`

**Função:** Remove tags `<script src=...></script>` por regex global/case-insensitive, evitando execução automática/duplicada.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 9

**Fonte:** `}`

**Função:** Fecha `stripExternalScripts`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 10

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa a função de limpeza do resolvedor de dependências.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 11

**Fonte:** `function getScriptDependencies(html, htmlPath, scriptPath) {`

**Função:** Declara a função interna que descobre scripts anteriores ao alvo.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 12

**Fonte:** `    const targetPath = path.resolve(ROOT, scriptPath);`

**Função:** Resolve o caminho absoluto do script alvo a partir da raiz.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 13

**Fonte:** `    const pageDirectory = path.dirname(path.resolve(ROOT, htmlPath));`

**Função:** Resolve o diretório absoluto da página HTML.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 14

**Fonte:** `    const scripts = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi)]`

**Função:** Extrai todas as tags externas de script preservando a ordem do documento.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — páginas reais têm `shared-ui.js` antes do script alvo e as suítes que usam o helper exercitam esse carregamento.

### Linha/posição 15

**Fonte:** `        .map(([, src]) => path.resolve(pageDirectory, src));`

**Função:** Resolve cada `src` relativamente ao diretório da página.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — páginas reais têm `shared-ui.js` antes do script alvo e as suítes que usam o helper exercitam esse carregamento.

### Linha/posição 16

**Fonte:** `    const targetIndex = scripts.indexOf(targetPath);`

**Função:** Localiza o índice exato do script alvo na sequência resolvida.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — páginas reais têm `shared-ui.js` antes do script alvo e as suítes que usam o helper exercitam esse carregamento.

### Linha/posição 17

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa cálculo do retorno.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 18

**Fonte:** `    return targetIndex === -1 ? [] : scripts.slice(0, targetIndex);`

**Função:** Se o alvo não está no HTML retorna nenhuma dependência; caso contrário retorna apenas scripts anteriores ao alvo.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — páginas reais têm `shared-ui.js` antes do script alvo e as suítes que usam o helper exercitam esse carregamento.

### Linha/posição 19

**Fonte:** `}`

**Função:** Fecha `getScriptDependencies`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 20

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa dependências do helper assíncrono.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 21

**Fonte:** `function delay(ms = 0) {`

**Função:** Declara `delay` com atraso padrão zero.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 22

**Fonte:** `    return new Promise(resolve => setTimeout(resolve, ms));`

**Função:** Retorna Promise resolvida por `setTimeout`, criando um novo turno de macrotask.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 23

**Fonte:** `}`

**Função:** Fecha `delay`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 24

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa `delay` do dreno assíncrono.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 25

**Fonte:** `async function flushAsyncTasks(rounds = 4) {`

**Função:** Declara `flushAsyncTasks` com quatro rodadas por padrão.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 26

**Fonte:** `    for (let i = 0; i < rounds; i++) {`

**Função:** Itera número fixo de rodadas.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 27

**Fonte:** `        await delay(0);`

**Função:** Aguarda `delay(0)` em cada rodada para deixar callbacks/tarefas assíncronas avançarem.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 28

**Fonte:** `    }`

**Função:** Fecha o loop.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 29

**Fonte:** `}`

**Função:** Fecha `flushAsyncTasks`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 30

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa utilitários da rotina principal.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 31

**Fonte:** `async function loadExtensionPage({`

**Função:** Declara `loadExtensionPage` assíncrona com options object.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 32

**Fonte:** `    htmlPath,`

**Função:** Recebe caminho do HTML real.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 33

**Fonte:** `    scriptPath,`

**Função:** Recebe caminho do script principal a carregar.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 34

**Fonte:** `    url = 'https://extension.test/',`

**Função:** Define URL base padrão usada pelos testes jsdom.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 35

**Fonte:** `    fireDOMContentLoaded = false,`

**Função:** Define se o helper deve capturar e disparar manualmente `DOMContentLoaded`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 36

**Fonte:** `} = {}) {`

**Função:** Fecha os parâmetros e aplica objeto vazio como default.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 37

**Fonte:** `    const html = fs.readFileSync(path.join(ROOT, htmlPath), 'utf8');`

**Função:** Lê o HTML real da extensão em UTF-8.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 38

**Fonte:** `    const dependencies = getScriptDependencies(html, htmlPath, scriptPath);`

**Função:** Descobre dependências `<script src>` que aparecem antes do script alvo.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 39

**Fonte:** `    const nextUrl = new URL(url, 'https://extension.test');`

**Função:** Normaliza a URL de teste contra `https://extension.test`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 40

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa preparação dos dados da mutação do DOM.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 41

**Fonte:** `    window.history.replaceState({}, '', \`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}\`);`

**Função:** Atualiza o histórico para pathname/search/hash da URL normalizada, tornando query/hash visíveis ao script da página.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — testes de reader passam URLs com query e fazem assertions cujo resultado depende de `location.search` configurado pelo helper.

### Linha/posição 42

**Fonte:** `    document.open();`

**Função:** Abre o documento jsdom para reescrita.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 43

**Fonte:** `    document.write(stripExternalScripts(html));`

**Função:** Escreve o HTML após remover scripts externos, evitando que jsdom os carregue automaticamente.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — páginas reais têm `shared-ui.js` antes do script alvo e as suítes que usam o helper exercitam esse carregamento.

### Linha/posição 44

**Fonte:** `    document.close();`

**Função:** Fecha o documento, materializando o DOM real sem os scripts externos.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 45

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa montagem do DOM da carga manual de módulos.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 46

**Fonte:** `    if (fireDOMContentLoaded) {`

**Função:** Entra no modo que simula explicitamente o momento de `DOMContentLoaded`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 47

**Fonte:** `        const originalAddEventListener = document.addEventListener.bind(document);`

**Função:** Captura a implementação original já ligada a `document`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 48

**Fonte:** `        const domReadyCallbacks = [];`

**Função:** Cria fila local de listeners de DOM ready.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 49

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa setup da interceptação.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 50

**Fonte:** `        document.addEventListener = (type, listener, options) => {`

**Função:** Substitui temporariamente `document.addEventListener`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 51

**Fonte:** `            if (type === 'DOMContentLoaded') {`

**Função:** Intercepta apenas listeners cujo tipo é exatamente `DOMContentLoaded`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 52

**Fonte:** `                domReadyCallbacks.push(listener);`

**Função:** Armazena o listener na ordem de registro.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 53

**Fonte:** `                return;`

**Função:** Retorna sem registrar esse listener no EventTarget real.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 54

**Fonte:** `            }`

**Função:** Fecha o branch especial.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 55

**Fonte:** `            return originalAddEventListener(type, listener, options);`

**Função:** Delegates todos os demais eventos para o `addEventListener` original com opções preservadas.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 56

**Fonte:** `        };`

**Função:** Fecha a função substituta.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 57

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa interceptação da carga dos scripts.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 58

**Fonte:** `        try {`

**Função:** Inicia `try` para garantir restauração do método do documento.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 59

**Fonte:** `            jest.isolateModules(() => {`

**Função:** Executa os `require`s em registro isolado de módulos Jest.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 60

**Fonte:** `                dependencies.forEach(dependency => require(dependency));`

**Função:** Carrega cada dependência anterior ao script alvo em ordem HTML.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 61

**Fonte:** `                require(path.join(ROOT, scriptPath));`

**Função:** Carrega o script alvo real a partir da raiz.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 62

**Fonte:** `            });`

**Função:** Fecha o callback de `jest.isolateModules`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 63

**Fonte:** `        } finally {`

**Função:** Inicia `finally` para cleanup mesmo se `require` falhar.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 64

**Fonte:** `            document.addEventListener = originalAddEventListener;`

**Função:** Remove o interceptor temporário reassociando `document.addEventListener` ao wrapper bound capturado na posição 47. Esse wrapper delega ao método original com `document` já vinculado, mas não é a mesma referência de função existente antes do `bind`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — consumers com `fireDOMContentLoaded: true` continuam operando após a carga, o que é compatível com a delegação funcional; ⚠️ não há assertion focal de identidade da função, e a implementação atual não preserva essa identidade.

### Linha/posição 65

**Fonte:** `        }`

**Função:** Fecha o `try/finally`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 66

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa carga dos módulos do disparo sintético.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 67

**Fonte:** `        for (const listener of domReadyCallbacks) {`

**Função:** Percorre callbacks DOMContentLoaded capturados na ordem de registro.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 68

**Fonte:** `            await listener(new Event('DOMContentLoaded', { bubbles: true }));`

**Função:** Invoca e aguarda cada listener com um `Event` sintético bubbling.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 69

**Fonte:** `        }`

**Função:** Fecha a fila de callbacks.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — opções/popup/reader usam `fireDOMContentLoaded: true` e validam efeitos produzidos pelos handlers reais.

### Linha/posição 70

**Fonte:** `    } else {`

**Função:** Entra no caminho que não sintetiza DOMContentLoaded.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `tests/integration/reader.ui.test.js` chama `loadExtensionPage(...)` sem fornecer `fireDOMContentLoaded`, portanto usa o default `false` e executa este ramo antes de fazer assertions reais no DOM do reader.

### Linha/posição 71

**Fonte:** `        jest.isolateModules(() => {`

**Função:** Isola o cache de módulos Jest mesmo no caminho simples.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 72

**Fonte:** `            dependencies.forEach(dependency => require(dependency));`

**Função:** Carrega dependências anteriores ao alvo em ordem.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — páginas reais têm `shared-ui.js` antes do script alvo e as suítes que usam o helper exercitam esse carregamento.

### Linha/posição 73

**Fonte:** `            require(path.join(ROOT, scriptPath));`

**Função:** Carrega o script alvo.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 74

**Fonte:** `        });`

**Função:** Fecha o callback isolado.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 75

**Fonte:** `    }`

**Função:** Fecha a bifurcação `fireDOMContentLoaded`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 76

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa carga da drenagem final.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 77

**Fonte:** `    await flushAsyncTasks();`

**Função:** Aguarda quatro rodadas assíncronas padrão antes de retornar ao teste.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 78

**Fonte:** `}`

**Função:** Fecha `loadExtensionPage`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 79

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Separa implementação das exportações.

**Racional técnico:** Linha de separação sem efeito de runtime.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

### Linha/posição 80

**Fonte:** `module.exports = {`

**Função:** Inicia o objeto exportado CommonJS.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 81

**Fonte:** `    ROOT,`

**Função:** Exporta `ROOT` para consumidores que precisam da raiz descoberta.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 82

**Fonte:** `    delay,`

**Função:** Exporta `delay`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 83

**Fonte:** `    flushAsyncTasks,`

**Função:** Exporta `flushAsyncTasks`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — `delay`/`flushAsyncTasks` são exportados e usados por várias suítes, sem assertion focal sobre número exato de rodadas.

### Linha/posição 84

**Fonte:** `    loadExtensionPage,`

**Função:** Exporta `loadExtensionPage`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 85

**Fonte:** `};`

**Função:** Fecha `module.exports`.

**Racional técnico:** Mantém o harness determinístico: DOM real da extensão, execução manual dos scripts e controle explícito do momento assíncrono.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE — o helper real é reutilizado por suítes unitárias e de integração, mas não há teste focal desta linha/contrato interno.

### Linha/posição 86

**Fonte:** `␤ [linha vazia / newline final]`

**Função:** Representa o newline final POSIX.

**Racional técnico:** Preserva cobertura posicional integral e o terminador POSIX.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — posição estrutural/formatacional.

## 10. Autoauditoria

- SHA reconfirmado: `c2325598f10b3ef9dd656a4e87db8569748e66b0`.
- Fonte integral embutida.
- Cobertura: **86/86 posições**.
- Consumidores reais e páginas HTML foram cruzados no branch.
- Evidência direta não foi inventada: usos de consumidores foram classificados como execução indireta.
- Lacunas externas registradas no state; nenhum teste, fixture ou fonte foi alterado.
- Reparo pós-auditoria: identidade de `addEventListener`, evidência do ramo `fireDOMContentLoaded=false` e lifecycle das requests foram corrigidos; o item deve ser reavaliado por auditor independente antes de `COMPLETED`.

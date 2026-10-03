# Bíblia técnica — tests/unit/content-manga/drawer-real.test.js

> **Estado documental:** ✅ CONCLUÍDO — AUTOAUDITORIA DOCUMENTAL APROVADA  
> **SHA auditado:** eeebbd56fe1a1c788a81b43e222be06309b90f32  
> **Agente responsável:** AGENTE 21  
> **Índice do corpus:** 201  
> **Tipo:** suíte Jest/JSDOM que executa o content_manga.js real  
> **Linhas textuais:** **245**  
> **Posições documentais:** **246**, contando o newline final  
> **Tamanho textual observado:** **8645 caracteres**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é uma suíte unitária-comportamental de alta fidelidade para a gaveta de erro integrada ao botão flutuante do Manga Translator.

Ao contrário de testes que copiam a lógica da produção, esta suíte usa tests/helpers/load-content-script.js para carregar a implementação real de extension/content/content_manga.js em JSDOM e interage com o listener real registrado em chrome.runtime.onMessage.

Seu escopo funcional cobre seis propriedades:

1. SHOW_ERROR_INTEGRATED torna a gaveta visível e registra erro pendente;
2. conteúdo HTML malicioso recebido como errorMsg é tratado como texto, sem inserção de elemento nem execução;
3. recolher a gaveta inicia countdown de 30 segundos e, ao final, limpa o erro visual;
4. reabrir a gaveta antes do fim cancela o fechamento automático;
5. DEBUG_MODE_CHANGED abre e fecha a drawer quando não há erro pendente;
6. desligar debug preserva uma drawer que contém erro pendente.

A suíte é, portanto, evidência direta da implementação real para esses fluxos específicos.

## 2. Implementação de produção efetivamente exercitada

O content script auditado relacionado é extension/content/content_manga.js, SHA a8b3698019f6f22027f09f544f15c0563a9f6515.

### showIntegratedError

No blob examinado:

- linhas 1155–1162 persistem lastIntegratedErrorState para erros indexados;
- linhas 1163–1168 retornam cedo se o botão flutuante estiver desabilitado;
- linhas 1169–1176 localizam/criam a UI e validam nós essenciais;
- linhas 1177–1192 constroem o conteúdo usando textContent;
- linhas 1195–1208 mostram erro, marcam hasError e expandem a drawer.

O teste de segurança HTML do #201 atinge diretamente o uso de textContent das linhas 1182 e 1185.

### Countdown da drawer

O listener de clique real está nas linhas 1388–1440.

Ao recolher uma drawer com erro e debug desligado:

- _closeCountdown recebe 30;
- o rótulo recebe FECHANDO EM 30S;
- intervalo anterior é limpo;
- um setInterval de 1000 ms decrementa o contador;
- em zero, o intervalo é removido;
- se a drawer ainda estiver recolhida, a linha de erro é escondida, hasError vira false, lastIntegratedErrorState é descartado e o rótulo volta a 🚨 VER ÚLTIMO ERRO.

Ao reabrir antes do término, o branch das linhas 1393–1405 limpa _closeInterval e restaura o estado visual aberto.

### applyDebugDrawer

A função real está nas linhas 1483–1510.

Quando debug é ligado:

- limpa countdown ativo, se houver;
- exibe e expande a drawer;
- escreve conteúdo de debug;
- muda collapsed para false;
- muda o rótulo para 🟠 DEBUG MODE ATIVO.

Quando debug é desligado:

- sem erro pendente, esconde e recolhe a drawer;
- com erro pendente, preserva a drawer e apenas restaura o rótulo/borda do estado de erro.

### Roteamento de mensagens

No listener principal:

- linhas 2668–2670 tratam SHOW_ERROR_INTEGRATED, incluindo guard contra batchId antigo;
- linhas 2697–2699 tratam DEBUG_MODE_CHANGED chamando applyDebugDrawer.

Assim, o #201 não chama funções internas por atalho: ele entra pela superfície real de mensagens usada pelo background/popup.

## 3. Loader e fidelidade do ambiente

tests/helpers/load-content-script.js, SHA 40d7c59d81a533c2f7d2b12d6c8c30bc77fb43f0, prepara o JSDOM e carrega a cadeia de módulos em ordem compatível com a extensão.

O loader:

1. invalida instância anterior;
2. configura window.location;
3. semeia chrome.storage.local;
4. cria imagens DOM;
5. injeta dimensões naturais;
6. disponibiliza crypto/TextEncoder;
7. limpa a flag de injeção;
8. usa jest.isolateModules para carregar dependências e, por fim, require(CONTENT_MANGA_PATH);
9. aguarda a inicialização visual do botão.

Isso torna as assertions do #201 provas do código real, embora ainda em ambiente JSDOM/mocks de Chrome, não em navegador Chromium completo.

## 4. Dependências diretas

### Node path

Usado para construir caminhos absolutos dos helpers a partir do ROOT calculado.

### Node fs

Importado na linha 2, porém **não utilizado em nenhuma linha executável do arquivo**.

É dependência morta neste SHA. Não altera o comportamento da suíte, mas aumenta ruído e pode sugerir leitura de arquivos que não ocorre.

### Node crypto

crypto.webcrypto é instalado em global.crypto para satisfazer dependências do content script que esperam Web Crypto.

### util.TextEncoder

TextEncoder é espelhado em global.TextEncoder pelo mesmo motivo de compatibilidade com o código carregado.

### findRepoRoot

Resolve a raiz canônica do repositório sem assumir cwd fixo.

### loadContentScript

É a dependência crítica: prepara o ambiente e executa content_manga.js real.

### chrome-api.mock.js

Fornece getRuntimeMock e getStorageMock para inspecionar/resetar listeners e storage usados pelo código real.

## 5. Helpers locais da suíte

### delay — linhas 18–20

Retorna Promise resolvida por setTimeout.

Neste arquivo, **delay não é chamado**. É código auxiliar morto no SHA auditado.

### getContentListener — linhas 22–28

Obtém runtimeMock._messageListeners e exige cardinalidade exatamente igual a 1.

Essa exigência tem valor de integridade: evita que o teste dispare mensagem em listener ausente ou em ambiente contaminado por múltiplas instâncias.

### dispatchToContent — linhas 30–45

Cria uma Promise, obtém o listener real e o chama com request/sender/sendResponse.

Se o listener não retornar true e não responder sincronicamente, resolve imediatamente com response undefined.

Os testes do #201 não usam o valor retornado; usam o helper apenas para garantir que a mensagem passou pelo listener antes das assertions.

Observação: se um listener chamasse sendResponse sincronicamente antes de retornar true, a closure resolveria com o valor anterior de keepAlive. Essa sutileza não afeta os seis casos atuais porque as ações testadas não dependem da resposta retornada.

### flushFakeTimers — linhas 47–51

Avança o relógio fake do Jest e depois entrega duas voltas de microtasks via Promise.resolve.

Isso é necessário porque os fluxos de clique consultam chrome.storage.local de forma assíncrona antes de iniciar/cancelar parte do estado visual.

## 6. Setup e teardown

### beforeEach — linhas 57–68

Antes de cada teste:

- resetModules;
- obtém mocks;
- zera listeners runtime/connect;
- limpa lastError;
- limpa storage;
- remove flags globais de injeção/fingerprint;
- substitui o documento por head/body vazios.

O objetivo é impedir dependência de ordem entre casos.

### afterEach — linhas 70–79

Depois de cada teste:

- tenta restaurar timers reais;
- restaura mocks;
- limpa storage;
- remove flags;
- limpa o documento.

O cleanup não despacha pagehide explicitamente. O loader do caso seguinte invalida a instância anterior antes de semear storage, o que reduz interferência de listeners antigos no ambiente JSDOM reutilizado.

## 7. Matriz das seis provas

| Caso | Linhas | Implementação exercitada | Propriedade comprovada | Classificação |
|---|---:|---|---|---|
| SHOW_ERROR_INTEGRATED básico | 81–106 | listener real + showIntegratedError | display flex, hasError=true, collapsed=false e conteúdo correto | ✅ PROVADO DIRETAMENTE |
| HTML tratado como texto | 108–128 | showIntegratedError real | payload HTML não cria img nem executa onerror, mas permanece visível como texto | ✅ PROVADO DIRETAMENTE |
| countdown completo | 130–161 | click listener real + storage + interval | inicia em 30S; após 30s esconde erro, limpa hasError e restaura rótulo | ✅ PROVADO DIRETAMENTE |
| reabertura cancela countdown | 163–197 | click listener real | reabre, restaura rótulo e após +40s erro segue visível/pending | ✅ PROVADO DIRETAMENTE |
| debug on/off sem erro | 199–221 | DEBUG_MODE_CHANGED + applyDebugDrawer | debug abre/expande; desligar sem erro oculta/recolhe | ✅ PROVADO DIRETAMENTE |
| debug false com erro pendente | 223–244 | SHOW_ERROR + DEBUG_MODE_CHANGED false | hasError permanece true e linha continua visível | ✅ PROVADO DIRETAMENTE |

## 8. Segurança: tratamento de HTML não confiável

O teste das linhas 108–128 usa o payload:

~~~text
<img src=x onerror=window.__mt_xss=true>
~~~

A implementação real o recebe por SHOW_ERROR_INTEGRATED.

As assertions exigem simultaneamente:

- content.querySelector('img') === null;
- textContent contém o payload literal;
- window.__mt_xss permanece undefined.

Isso prova três propriedades complementares:

1. o conteúdo não é interpretado como markup;
2. o texto não é silenciosamente descartado;
3. o handler inline não executa.

A prova é diretamente ligada à implementação real porque showIntegratedError usa detail.textContent = message.

**Classificação:** ✅ PROVADO DIRETAMENTE.

Limite: o teste cobre esta forma representativa de HTML/event handler; não é uma prova matemática de toda possível carga XSS. A escolha de textContent na produção, entretanto, é uma barreira estrutural forte contra interpretação HTML nesse ponto.

## 9. Countdown: semântica comprovada

### Estado inicial ao recolher

Após errorLine.click e flush de microtasks, a suíte exige:

- btn.dataset.collapsed === true;
- rótulo exatamente FECHANDO EM 30S.

Isso prova a transição inicial e o valor nominal de 30 segundos.

### Estado terminal

Após avançar 30000 ms:

- errorLine.style.display === none;
- btn.dataset.hasError === false;
- rótulo === 🚨 VER ÚLTIMO ERRO.

Isso prova o efeito terminal mais importante do intervalo real.

### Cancelamento por reabertura

O quarto teste:

1. inicia countdown;
2. avança 5s;
3. clica novamente para reabrir;
4. exige collapsed=false e rótulo neutro;
5. avança mais 40s;
6. exige linha ainda flex e hasError=true.

Essa última etapa é essencial: não basta testar a aparência imediatamente após reabrir; ela demonstra que o interval anterior deixou de produzir o fechamento atrasado.

## 10. Debug: semântica comprovada

### Debug sem erro

DEBUG_MODE_CHANGED true prova:

- linha de erro visível;
- drawer expandida;
- texto contendo DEBUG MODE ATIVO.

DEBUG_MODE_CHANGED false prova:

- linha escondida;
- drawer recolhida.

### Debug false com erro existente

O sexto caso primeiro injeta um erro real e só então envia debugOn false.

As assertions mostram que desligar debug não apaga o erro pendente nem esconde sua linha.

A suíte não verifica nesse caso o texto exato do rótulo nem border-radius; portanto essas propriedades específicas permanecem fora da prova direta do #201.

## 11. Evidências externas e gates

### Jest config

jest.config.js inclui tests/unit/content-manga/**/*.test.js no projeto content-scripts, em JSDOM.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO para descoberta por projeto.

### Inventário de CI

scripts/ci/run-jest-ci.js inventaria todos os .test.js de unit/integration e compara o relatório JSON do Jest com esse inventário.

Se #201 deixar de ser descoberto, o gate registra arquivo ausente.

**Classificação:** 🟦 GATE ESTÁTICO ESPECÍFICO.

### Fluxos upstream

SHOW_ERROR_INTEGRATED é produzido por componentes como background/actions/report-error.js e jobs-watchdog.js.

DEBUG_MODE_CHANGED é produzido pelo fluxo de set-debug-mode.

Esses producers possuem testes próprios de roteamento, mas o #201 foca o consumer content_manga e não prova end-to-end o percurso background → tabs.sendMessage → content.

**Classificação:** 🟨 EXECUTADO/PROVADO EM CAMADAS SEPARADAS; não promover a E2E.

## 12. Lacunas de prova específicas

### 12.1 Debug ligado durante countdown ativo

applyDebugDrawer(true) possui um branch explícito que limpa _closeInterval.

O teste de debug atual liga debug sem countdown anterior, portanto a linha de clear não é focalmente provada.

**Classificação:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### 12.2 SHOW_ERROR_INTEGRATED de batch antigo

O listener real possui guard:

request.batchId && _currentBatchId && request.batchId !== _currentBatchId → return.

Os casos #201 enviam SHOW_ERROR sem batchId e não demonstram que erro atrasado de lote anterior é ignorado.

**Classificação:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO localizado.

### 12.3 Botão flutuante desabilitado

showIntegratedError retorna cedo quando floatingButtonEnabled é false e, para erro indexado, registra BATCH_ERROR com floatingButtonHiddenByUser.

As buscas localizaram testes do setting floatingButtonEnabled em outras superfícies, mas não assertion focal de SHOW_ERROR_INTEGRATED nesse estado.

**Classificação:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO localizado para este branch.

### 12.4 Ticks intermediários

O #201 prova 30S e estado após 30 segundos, mas não exige 29S, 28S etc.

O código real atualiza esses valores no branch positivo do interval.

**Classificação:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para cada atualização intermediária.

Esta lacuna já foi registrada no contexto do #200; não é necessário duplicá-la como pedido separado aqui.

### 12.5 Stale DOM/missing nodes

applyDebugDrawer retorna se os nós essenciais não existirem; showIntegratedError também possui guards de criação/nós ausentes.

O #201 opera sempre com DOM saudável criado pelo loader.

**Classificação:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO neste arquivo, risco menor para o escopo principal.

## 13. Solicitações ao auditor

### 201-001 — TEST_REQUIRED — OPEN

**Encontrado:** applyDebugDrawer(true) limpa countdown ativo, mas o caso DEBUG_MODE_CHANGED true do #201 começa sem countdown em andamento.

**Contexto:** auditoria de tests/unit/content-manga/drawer-real.test.js.

**Arquivo relacionado:** tests/unit/content-manga/drawer-real.test.js; implementação em extension/content/content_manga.js linha 1490.

**Evidência atual:** há prova direta de cancelamento ao reabrir a drawer e prova direta de debug on/off isolado, mas não da composição countdown → debug on.

**Evidência ausente:** assertion que ligue debug enquanto FECHANDO EM 30S está ativo e avance além do prazo original.

**Por que insuficiente:** regressão no clearInterval específico de applyDebugDrawer pode deixar os dois testes atuais verdes separadamente.

**Ação solicitada:** adicionar teste usando loadContentScript real: mostrar erro, recolher drawer, confirmar 30S, enviar DEBUG_MODE_CHANGED true, avançar >30s e confirmar drawer visível/expandida em estado debug sem fechamento tardio.

**Evidência esperada:** assertions diretas de texto debug, display/collapsed e ausência de efeito do interval antigo.

**Possível regressão:** ativar debug durante countdown poderia deixar um timer antigo apagar a drawer posteriormente.

**Impacto:** consistência do modo debug e prevenção de transição tardia inesperada.

**Severidade:** NORMAL.

### 201-002 — TEST_REQUIRED — OPEN

**Encontrado:** SHOW_ERROR_INTEGRATED possui guard contra batchId antigo antes de marcar batchHasErrors e abrir a drawer, porém nenhum caso localizado prova esse guard no consumer real.

**Contexto:** auditoria de tests/unit/content-manga/drawer-real.test.js.

**Arquivo relacionado:** tests/unit/content-manga/drawer-real.test.js; implementação em extension/content/content_manga.js linha 2669.

**Evidência atual:** #201 prova SHOW_ERROR sem batchId; testes upstream provam emissão da mensagem, mas não o descarte content-side de lote stale.

**Evidência ausente:** cenário com _currentBatchId ativo e SHOW_ERROR_INTEGRATED contendo batchId diferente, seguido de assertions de que UI/erro pendente não foram alterados.

**Por que insuficiente:** um erro atrasado de lote anterior pode competir com um lote novo; o guard é uma fronteira de isolamento entre lotes.

**Ação solicitada:** criar teste focal pela API real disponível para estabelecer lote corrente e enviar erro stale, sem copiar a lógica do guard.

**Evidência esperada:** erro stale não abre/altera drawer, não marca hasError e não contamina o estado do lote atual.

**Possível regressão:** mensagem atrasada de lote anterior pode exibir erro incorreto e marcar o lote atual como falho.

**Impacto:** isolamento entre lotes concorrentes/sequenciais.

**Severidade:** HIGH.

### 201-003 — TEST_REQUIRED — OPEN

**Encontrado:** showIntegratedError possui branch de retorno quando floatingButtonEnabled=false; ele deve registrar o erro sem recriar/exibir o botão.

**Contexto:** auditoria de tests/unit/content-manga/drawer-real.test.js.

**Arquivo relacionado:** tests/unit/content-manga/drawer-real.test.js; implementação em extension/content/content_manga.js linhas 1163–1168.

**Evidência atual:** existem testes de configuração do botão flutuante em outras superfícies, mas não foi localizada assertion focal de SHOW_ERROR_INTEGRATED com o botão desabilitado.

**Evidência ausente:** prova de que a mensagem de erro não recria a UI desabilitada e de que o log BATCH_ERROR inclui floatingButtonHiddenByUser=true.

**Por que insuficiente:** a preferência explícita do usuário de ocultar o botão deve prevalecer mesmo quando chega um erro.

**Ação solicitada:** adicionar teste real com loadContentScript({ floatingButtonEnabled:false }), despachar SHOW_ERROR_INTEGRATED e verificar ausência de botão/UI mais o efeito de logging observável no mock apropriado.

**Evidência esperada:** botão continua ausente e o erro é registrado sem violar a configuração de visibilidade.

**Possível regressão:** erros poderiam fazer o botão reaparecer apesar de o usuário tê-lo desabilitado, ou desaparecer sem observabilidade.

**Impacto:** respeito à configuração do usuário e diagnóstico de erros quando a UI está oculta.

**Severidade:** NORMAL.

Nenhum arquivo externo foi alterado pelo AGENTE 21.

## 14. Invariantes

1. Deve existir exatamente um listener de mensagem do content_manga por caso antes do dispatch local.
2. O loader deve carregar a implementação real, não uma cópia.
3. SHOW_ERROR com imgIndex deve tornar hasError verdadeiro e expandir a drawer quando a UI está habilitada.
4. errorMsg não deve ser interpretado como HTML.
5. Recolher erro pendente com debug desligado deve iniciar countdown nominal em 30S.
6. O término deve remover visualmente o erro e limpar hasError.
7. Reabrir antes do término deve cancelar o efeito tardio do countdown.
8. Debug true deve abrir/expandir a drawer.
9. Debug false sem erro deve ocultá-la.
10. Debug false com erro pendente não deve apagar o erro.
11. Fake timers não podem vazar para o teste seguinte.
12. Esta Bíblia vale somente para o SHA eeebbd56fe1a1c788a81b43e222be06309b90f32.

## 15. Side effects, isolamento e riscos

O teste modifica intencionalmente:

- global.crypto;
- global.TextEncoder;
- chrome runtime mock;
- chrome storage mock;
- document.documentElement;
- flags no window;
- relógio do Jest em dois casos.

global.crypto e global.TextEncoder são definidos no topo e não restaurados no afterEach. Isso é configuração do ambiente de suíte, não mutação transitória por teste.

Os listeners antigos não são removidos individualmente no teardown; a suíte limpa arrays do runtime mock e o loader usa marcador de instância ativa. Essa combinação é parte da estratégia de isolamento do harness.

O teste não acessa rede real, filesystem via fs nem navegador externo.

## 16. Código morto/local sem efeito

### fs importado e não usado

A linha 2 importa fs, mas nenhuma chamada fs.* existe no arquivo.

### delay não usado

As linhas 18–20 definem delay, mas nenhuma chamada ocorre.

Esses itens são ruído de manutenção. Não alteram a validade das provas e não justificam por si só uma mudança durante a auditoria documental.

## 17. Fonte integral auditada

~~~javascript
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { TextEncoder } = require('util');

const { findRepoRoot } = require('../../helpers/repo-root');
const ROOT = findRepoRoot(__dirname);

Object.defineProperty(global, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
});
global.TextEncoder = TextEncoder;

const { loadContentScript } = require(path.join(ROOT, 'tests/helpers/load-content-script.js'));
const { getRuntimeMock, getStorageMock } = require(path.join(ROOT, 'tests/mocks/chrome-api.mock.js'));

function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getContentListener(runtimeMock) {
    const listeners = runtimeMock._messageListeners || [];
    if (listeners.length !== 1) {
        throw new Error(`Esperava 1 listener do content_manga, recebi ${listeners.length}`);
    }
    return listeners[0];
}

function dispatchToContent(runtimeMock, request, sender = { tab: { id: 1 } }) {
    return new Promise((resolve) => {
        let settled = false;
        let keepAlive = false;

        const sendResponse = (response) => {
            settled = true;
            resolve({ keepAlive, response });
        };

        keepAlive = getContentListener(runtimeMock)(request, sender, sendResponse);
        if (keepAlive !== true && !settled) {
            resolve({ keepAlive, response: undefined });
        }
    });
}

async function flushFakeTimers(ms = 0) {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
}

describe('CM-55/CM-56/CM-57/CM-58/CM-59/CM-60/CM-61/CM-62/CM-63/CM-64: content_manga.js - drawer de erro real', () => {
    let runtimeMock;
    let storageMock;

    beforeEach(async () => {
        jest.resetModules();
        runtimeMock = getRuntimeMock();
        storageMock = getStorageMock();
        runtimeMock._messageListeners = [];
        runtimeMock._connectListeners = [];
        runtimeMock.lastError = null;
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    afterEach(async () => {
        try {
            jest.useRealTimers();
        } catch (e) {}
        jest.restoreAllMocks();
        await storageMock.clear();
        delete window.__manga_translator_content_injected;
        delete window.MangaTranslatorGtcFingerprint;
        document.documentElement.innerHTML = '<head></head><body></body>';
    });

    test('SHOW_ERROR_INTEGRATED exibe a linha de erro e marca erro pendente', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'Falha no OCR',
            imgIndex: 7,
            isDebug: false,
        });

        const btn = document.getElementById('manga-translator-trigger');
        const errorLine = document.getElementById('manga-error-line');
        const content = document.getElementById('manga-error-collapsible-content');

        expect(errorLine.style.display).toBe('flex');
        expect(btn.dataset.hasError).toBe('true');
        expect(btn.dataset.collapsed).toBe('false');
        expect(content.textContent).toContain('ERRO');
        expect(content.textContent).toContain('IMAGEM 7');
        expect(content.textContent).toContain('Falha no OCR');
    });

    test('SHOW_ERROR_INTEGRATED trata HTML recebido como texto', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        const errorMsg = '<img src=x onerror=window.__mt_xss=true>';
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg,
            imgIndex: 7,
            isDebug: false,
        });

        const content = document.getElementById('manga-error-collapsible-content');
        expect(content.querySelector('img')).toBeNull();
        expect(content.textContent).toContain(errorMsg);
        expect(window.__mt_xss).toBeUndefined();
    });

    test('colapsar erro inicia countdown e esconde a linha ao final de 30s', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'Erro de teste',
            imgIndex: 2,
            isDebug: false,
        });

        jest.useFakeTimers();

        const btn = document.getElementById('manga-translator-trigger');
        const errorLine = document.getElementById('manga-error-line');
        const label = errorLine.querySelector('span:first-child');

        errorLine.click();
        await flushFakeTimers(1);

        expect(btn.dataset.collapsed).toBe('true');
        expect(label.innerText).toBe('FECHANDO EM 30S');

        await flushFakeTimers(30000);

        expect(errorLine.style.display).toBe('none');
        expect(btn.dataset.hasError).toBe('false');
        expect(label.innerText).toBe('🚨 VER ÚLTIMO ERRO');
    });

    test('expandir novamente cancela o countdown de fechamento', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'Erro persistente',
            imgIndex: 3,
            isDebug: false,
        });

        jest.useFakeTimers();

        const btn = document.getElementById('manga-translator-trigger');
        const errorLine = document.getElementById('manga-error-line');
        const label = errorLine.querySelector('span:first-child');

        errorLine.click();
        await flushFakeTimers(1);
        expect(label.innerText).toBe('FECHANDO EM 30S');

        await flushFakeTimers(5000);
        errorLine.click();
        await flushFakeTimers(1);

        expect(btn.dataset.collapsed).toBe('false');
        expect(label.innerText).toBe('🚨 VER ÚLTIMO ERRO');

        await flushFakeTimers(40000);
        expect(errorLine.style.display).toBe('flex');
        expect(btn.dataset.hasError).toBe('true');
    });

    test('DEBUG_MODE_CHANGED abre e fecha a drawer quando nao ha erro pendente', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });

        await dispatchToContent(runtimeMock, { action: 'DEBUG_MODE_CHANGED', debugOn: true });

        const btn = document.getElementById('manga-translator-trigger');
        const errorLine = document.getElementById('manga-error-line');
        const content = document.getElementById('manga-error-collapsible-content');

        expect(errorLine.style.display).toBe('flex');
        expect(btn.dataset.collapsed).toBe('false');
        expect(content.textContent).toContain('DEBUG MODE ATIVO');

        await dispatchToContent(runtimeMock, { action: 'DEBUG_MODE_CHANGED', debugOn: false });

        expect(errorLine.style.display).toBe('none');
        expect(btn.dataset.collapsed).toBe('true');
    });

    test('DEBUG_MODE_CHANGED false preserva a linha de erro quando existe erro pendente', async () => {
        await loadContentScript({
            hostname: 'localhost',
            domImages: [
                { src: 'http://localhost/page-0.png', width: 800, height: 1200 },
            ],
        });
        await dispatchToContent(runtimeMock, {
            action: 'SHOW_ERROR_INTEGRATED',
            errorMsg: 'Erro retido',
            imgIndex: 4,
            isDebug: false,
        });

        const btn = document.getElementById('manga-translator-trigger');
        const errorLine = document.getElementById('manga-error-line');

        await dispatchToContent(runtimeMock, { action: 'DEBUG_MODE_CHANGED', debugOn: false });

        expect(btn.dataset.hasError).toBe('true');
        expect(errorLine.style.display).toBe('flex');
    });
});
~~~

O blob termina com newline LF.

## 18. Cobertura posição a posição

### Linhas 1–4 — módulos nativos
Carregam path, fs, crypto e TextEncoder. path/crypto/TextEncoder têm uso posterior; fs permanece sem uso. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE para imports usados; código morto documentado para fs.

### Linha 5
Separação estrutural sem efeito runtime.

### Linhas 6–7 — raiz do repositório
Importam findRepoRoot e resolvem ROOT a partir de __dirname, permitindo require canônico dos helpers. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; os requires das linhas 15–16 dependem do resultado.

### Linha 8
Separação estrutural.

### Linhas 9–13 — compatibilidade Web Crypto/TextEncoder
Instalam crypto.webcrypto e TextEncoder no global utilizado pelo conteúdo carregado. configurable=true permite redefinição posterior. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE durante bootstrap.

### Linha 14
Separação estrutural.

### Linhas 15–16 — harness
Importam o loader do content script e mocks de runtime/storage. Essas dependências são centrais para todas as provas. **Evidência:** ✅ uso direto em cada caso.

### Linha 17
Separação estrutural.

### Linhas 18–20 — delay
Helper Promise/setTimeout não chamado neste arquivo. **Evidência:** ⚠️ sem execução; código morto no SHA auditado.

### Linha 21
Separação estrutural.

### Linhas 22–28 — getContentListener
Lê _messageListeners, exige exatamente um listener e retorna-o. O throw impede execução ambígua. **Evidência:** ✅ chamado por todos os dispatches; se cardinalidade fosse diferente, os casos falhariam antes das assertions funcionais.

### Linha 29
Separação estrutural.

### Linhas 30–45 — dispatchToContent
Empacota chamada ao listener real em Promise, injeta sender padrão e captura sendResponse/keepAlive. Para ações sem resposta assíncrona, resolve após a chamada do listener. **Evidência:** ✅ caminho usado por todos os seis testes; retorno não é assertado.

### Linha 46
Separação estrutural.

### Linhas 47–51 — flushFakeTimers
Avança relógio fake e drena duas microtasks. É usado nos dois testes de countdown. **Evidência:** ✅ necessário para as assertions temporais subsequentes.

### Linha 52
Separação estrutural.

### Linhas 53–55 — suite e estado
Abrem describe CM-55..CM-64 e declaram runtimeMock/storageMock. **Evidência:** 🟨 estrutura do runner.

### Linha 56
Separação estrutural.

### Linhas 57–68 — beforeEach
Resetam módulos, mocks, listeners, storage, flags e DOM antes de cada caso. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE por todos os testes; assegura isolamento.

### Linha 69
Separação estrutural.

### Linhas 70–79 — afterEach
Restaura timers/mocks/storage/flags/DOM. O catch torna useRealTimers tolerante quando fake timers não foram ativados. **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 80
Separação estrutural.

### Linhas 81–87 — primeiro cenário / bootstrap
Abrem o teste básico e carregam content_manga real para localhost com uma imagem válida. **Evidência:** ✅ pré-condição real do caso.

### Linha 88
Separação estrutural.

### Linhas 89–94 — mensagem de erro
Despacham SHOW_ERROR_INTEGRATED com texto, índice 7 e debug false. **Evidência:** ✅ listener real é chamado.

### Linha 95
Separação estrutural.

### Linhas 96–98 — seleção do DOM resultante
Obtêm botão, linha e conteúdo produzidos pela implementação. **Evidência:** ✅ usados imediatamente nas assertions.

### Linha 99
Separação estrutural.

### Linhas 100–106 — assertions de erro visível
Exigem display flex, hasError true, collapsed false e conteúdo ERRO/IMAGEM 7/Falha no OCR. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 107
Separação estrutural.

### Linhas 108–114 — cenário de segurança / bootstrap
Carregam novamente a implementação real isolada. **Evidência:** ✅.

### Linha 115
Separação estrutural.

### Linhas 116–122 — payload HTML
Criam string com img/onerror e despacham como errorMsg real. **Evidência:** ✅ entrada hostil controlada.

### Linha 123
Separação estrutural.

### Linhas 124–128 — assertions anti-XSS
Exigem ausência de img, presença literal da string e ausência de window.__mt_xss. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 129
Separação estrutural.

### Linhas 130–142 — cenário de countdown / setup
Carregam conteúdo e injetam erro real antes de ativar fake timers. **Evidência:** ✅.

### Linha 143
Separação estrutural.

### Linha 144 — fake timers
Troca o relógio para controle determinístico. **Evidência:** ✅ exercitado pela sequência temporal.

### Linha 145
Separação estrutural.

### Linhas 146–148 — nós observados
Selecionam botão, errorLine e label. **Evidência:** ✅.

### Linha 149
Separação estrutural.

### Linhas 150–151 — recolher e drenar
Clique no elemento real e flush de 1 ms/microtasks para processar storage callback. **Evidência:** ✅.

### Linha 152
Separação estrutural.

### Linhas 153–154 — estado inicial do countdown
Exigem collapsed true e FECHANDO EM 30S. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 155
Separação estrutural.

### Linha 156 — passagem de 30s
Avança o relógio exatamente pelo prazo nominal. **Evidência:** ✅ execução real do interval em fake clock.

### Linha 157
Separação estrutural.

### Linhas 158–161 — estado terminal
Exigem linha escondida, hasError false, rótulo neutro e fecham o teste. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 162
Separação estrutural.

### Linhas 163–175 — cenário de cancelamento / setup
Cria erro real equivalente para testar reabertura antes do timeout. **Evidência:** ✅.

### Linha 176
Separação estrutural.

### Linha 177 — fake timers
Ativa relógio controlado para o caso. **Evidência:** ✅.

### Linha 178
Separação estrutural.

### Linhas 179–181 — nós monitorados
Obtêm botão/linha/rótulo. **Evidência:** ✅.

### Linha 182
Separação estrutural.

### Linhas 183–185 — início
Recolhem a drawer, drenam assíncrono e exigem 30S. **Evidência:** ✅.

### Linha 186
Separação estrutural.

### Linhas 187–189 — cancelamento por reabertura
Avançam 5s, clicam novamente e drenam microtasks. **Evidência:** ✅ execução do branch de clearInterval real.

### Linha 190
Separação estrutural.

### Linhas 191–192 — estado imediato reaberto
Exigem collapsed false e rótulo neutro. **Evidência:** ✅.

### Linha 193
Separação estrutural.

### Linhas 194–197 — ausência de efeito tardio
Avançam 40s, depois exigem linha flex e hasError true. Isso prova que o timer antigo não fechou a drawer. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 198
Separação estrutural.

### Linhas 199–205 — cenário debug sem erro / bootstrap
Carregam content_manga real sem erro pendente. **Evidência:** ✅.

### Linha 206
Separação estrutural.

### Linha 207 — debug on
Despacha DEBUG_MODE_CHANGED com debugOn true. **Evidência:** ✅.

### Linha 208
Separação estrutural.

### Linhas 209–211 — nós de debug
Selecionam botão/linha/conteúdo. **Evidência:** ✅.

### Linha 212
Separação estrutural.

### Linhas 213–215 — assertions debug on
Exigem visibilidade, expansão e texto de debug. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 216
Separação estrutural.

### Linha 217 — debug off
Despacha DEBUG_MODE_CHANGED false. **Evidência:** ✅.

### Linha 218
Separação estrutural.

### Linhas 219–221 — assertions debug off sem erro
Exigem linha none e collapsed true; fecham o caso. **Evidência:** ✅ PROVADO DIRETAMENTE.

### Linha 222
Separação estrutural.

### Linhas 223–235 — cenário debug off com erro
Carregam conteúdo e criam erro pendente por SHOW_ERROR_INTEGRATED. **Evidência:** ✅.

### Linha 236
Separação estrutural.

### Linhas 237–238 — referências DOM
Obtêm botão e linha de erro. **Evidência:** ✅.

### Linha 239
Separação estrutural.

### Linha 240 — debug off
Despacha DEBUG_MODE_CHANGED false enquanto hasError já está verdadeiro. **Evidência:** ✅.

### Linha 241
Separação estrutural.

### Linhas 242–244 — preservação
Exigem hasError true e display flex. Não verificam rótulo/borda/conteúdo. **Evidência:** ✅ PROVADO DIRETAMENTE para preservação básica; ⚠️ parcial para detalhes visuais.

### Linha 245 — fechamento da suite
Fecha o describe principal. **Evidência:** 🟨 estrutura do runner.

### Posição 246 — newline final
Posição vazia criada pelo LF terminal. Não tem comportamento, mas integra o blob exato auditado.

## 19. Análise crítica

1. O arquivo executa a implementação real e, por isso, suas assertions têm alta força probatória.
2. O caso anti-XSS é especialmente valioso porque combina estrutura DOM, texto e ausência de execução.
3. Os testes temporais não se limitam ao estado imediato: o cancelamento é validado após tempo superior ao timeout original.
4. A prova de countdown cobre início e término, mas não ticks intermediários.
5. O teste debug false com erro é deliberadamente mínimo: não prova conteúdo/rótulo detalhado.
6. O branch debug-on que cancela interval ativo permanece sem teste focal.
7. O guard de erro stale por batchId permanece sem prova content-side localizada.
8. O early-return com botão desabilitado permanece sem prova focal de SHOW_ERROR.
9. fs e delay são resíduos locais sem uso.
10. JSDOM/mocks não substituem E2E Chromium para aspectos de rendering/integração nativa, mas são adequados às propriedades DOM/estado aqui assertadas.

## 20. Autoauditoria documental

- reserva exclusiva reconfirmada para **AGENTE 21**;
- fonte reconfirmada no branch docs/project-bible;
- SHA: **eeebbd56fe1a1c788a81b43e222be06309b90f32**;
- fonte integral embutida sem alteração;
- **245 linhas textuais + newline final = 246/246 posições**;
- content_manga.js real confrontado em showIntegratedError, click countdown, applyDebugDrawer e message router;
- loader real confrontado integralmente;
- jest.config.js/package.json/run-jest-ci.js confrontados para descoberta e gate;
- suíte relacionada extraction-and-handlers-real.test.js inspecionada para evitar duplicação falsa de prova;
- buscas por debug+countdown, stale SHOW_ERROR e hidden-button error realizadas antes das solicitações;
- prova direta, gate estático, execução indireta e ausência de prova foram mantidos separados;
- nenhum código, teste, fixture, workflow, config ou arquivo global foi alterado;
- solicitações externas foram registradas sem tentar resolvê-las.

**Conclusão documental:** Bíblia completa para o estado real observado. O arquivo pode ser marcado **COMPLETED**, mantendo 201-001, 201-002 e 201-003 OPEN.
